/**
 * brand migrate — rewrite README logo references across repos to brand URLs.
 *
 * Stage-C hardening (post-Stage-A):
 *   - Atomic per-file writes via temp-file + rename (same-volume atomic).
 *   - Journal sidecar (.brand-migrate.journal.json under opts.repos) records
 *     the original content of every README touched so a SIGINT or crash
 *     leaves a recovery trail. After successful write the entry is removed.
 *     On startup, if entries remain from a prior run, --resume restores them.
 *   - --dry-run --resume is a true preview: it prints what WOULD be restored
 *     but never writes a README or touches the journal. A restore failure
 *     during a real --resume keeps that entry in the journal (instead of
 *     wiping the whole journal unconditionally) and is surfaced as a
 *     failure in the console summary, the --json result, and the exit code.
 *   - Per-repo try/catch: one repo's failure does NOT abort the others.
 *   - Categorical skip reasons (no-clone / no-logo-file / multi-logo / already-migrated)
 *     surfaced as counts in the summary AND in the JSON output.
 *   - Progress line per repo on TTY (suppressed in pipes / CI / JSON mode).
 *   - --json emits a single object describing the migration result.
 */

import chalk from 'chalk';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  unlinkSync,
  openSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';
import { findLogoImgTags, rewriteLogoSrc } from '../utils/readme-parser.js';
import { findLogoFile } from '../manifest.js';

interface MigrateOptions {
  repos: string;
  logos: string;
  brandBase: string;
  dryRun: boolean;
  json?: boolean;
  resume?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

type SkipReason = 'no-clone' | 'no-logo-file' | 'multi-logo' | 'already-migrated';

interface RepoFailure {
  slug: string;
  file?: string;
  code?: string;
  message: string;
}

interface MultiLogoCollision {
  slug: string;
  file: string;
  distinctSrcs: string[];
}

interface JournalEntry {
  path: string;
  original: string;
  ts: string;
}

interface MigrateResult {
  total: number;
  updated: number;
  skipped: number;
  skippedByReason: Record<SkipReason, number>;
  failures: RepoFailure[];
  multiLogoCollisions: MultiLogoCollision[];
  dryRun: boolean;
  resumed: number;
}

const JOURNAL_NAME = '.brand-migrate.journal.json';

function readJournal(reposDir: string): JournalEntry[] {
  const path = join(reposDir, JOURNAL_NAME);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (Array.isArray(parsed)) return parsed as JournalEntry[];
  } catch {
    // Corrupt journal — this is the ONLY backup of pre-migration README
    // content, so silently discarding it would hide a real loss of
    // crash-recovery data. Surface loudly (even outside --quiet — this
    // indicates lost recovery data, not routine chatter) and preserve the
    // unparseable file for manual inspection instead of letting it be
    // silently overwritten by the next writeJournal() call. (F-dbc18187)
    console.error(chalk.red(
      `\n  ! Corrupt journal at ${path} — could not parse as JSON. Treating as empty ` +
      `(any crash-recovery data it held may be lost). The file has been renamed to ` +
      `preserve it for manual inspection; it will not be silently overwritten.\n`
    ));
    preserveCorruptJournal(path);
  }
  return [];
}

/**
 * Rename an unparseable journal file out of the way so it survives the next
 * writeJournal() call instead of being silently discarded/overwritten.
 * Best-effort: if even the rename fails, the console warning above already
 * surfaced the loss.
 */
function preserveCorruptJournal(path: string): void {
  try {
    renameSync(path, `${path}.corrupt-${Date.now()}`);
  } catch {
    /* best-effort — the console warning above is the primary signal */
  }
}

function writeJournal(reposDir: string, entries: JournalEntry[]): void {
  const path = join(reposDir, JOURNAL_NAME);
  if (entries.length === 0) {
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* best-effort cleanup */ }
    }
    return;
  }
  // Atomic-ish: write tmp + rename. If interrupted, old journal stays valid.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  renameSync(tmp, path);
}

/**
 * Atomic write: stage the new content at <path>.brand-tmp then rename onto
 * the target. On the same volume this is atomic — there is no observable
 * half-written state. Caller is responsible for the journal entry.
 */
function atomicWrite(targetPath: string, content: string): void {
  const tmp = `${targetPath}.brand-tmp`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, targetPath);
}

function isTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

/**
 * Escape a value for safe interpolation into a double-quoted HTML
 * attribute — mirrors marker-parser.ts's escapeAttr (added in v1.0.7 for
 * renderGalleryBlock's gallery url/alt) so both call sites treat the same
 * hazard the same way. Not imported (that helper is unexported, and
 * marker-parser.ts is outside this command's domain) — reimplemented
 * locally, the same rule atomicWrite's own doc comment documents for this
 * file's relationship with sync.ts.
 *
 * Fixes F-710290dd: newSrc below is built from the operator-supplied
 * --brand-base and then spliced VERBATIM into an `<img src="...">`
 * attribute by rewriteLogoSrc (readme-parser.ts splices by character
 * index and does no escaping of its own — that parser's header comment
 * documents it trusts ITS input, not that every replacement VALUE handed
 * to it is pre-sanitized). An unescaped `"` in --brand-base closes the
 * attribute early and injects arbitrary markup into every README the
 * migration touches. Escape `&` first so the entities this introduces are
 * never themselves double-escaped.
 */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const MIGRATE_LOCK_NAME = '.brand-migrate.lock';
// Generous relative to sync.ts's 30s: a single migrate run can walk
// hundreds of repos, not touch one README. Documented, not guessed — this
// is the "documented timeout" half of the stale-lock contract.
const MIGRATE_LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Whole-run lock serializing concurrent `brand migrate` invocations
 * against the SAME --repos directory, closing the race where their
 * read-modify-write cycles on .brand-migrate.journal.json (readJournal/
 * writeJournal — called repeatedly throughout the per-repo loop AND the
 * --resume path) interleave and silently drop each other's entries
 * (F-4141e3e3, proved directly against these exact functions). The
 * journal is this command's ENTIRE crash-recovery mechanism (see this
 * file's header comment) — losing an entry here surfaces only much later
 * as "why didn't --resume restore repo X", with no error anywhere.
 *
 * Held for the ENTIRE remainder of runMigrate (acquired once near the
 * top, released in the finally block at the bottom) rather than around
 * each individual journal read-modify-write: the invariant that actually
 * needs protecting — "this run's own bookkeeping, push an entry now and
 * drop it later, stays internally consistent" — requires exclusivity for
 * the run's whole lifetime, not just around each individual file op.
 *
 * Same O_EXCL + pid/timestamp + stale-timeout mechanism as sync.ts's
 * acquireSyncLock, deliberately reimplemented rather than imported (kept
 * independent per file-ownership boundaries — see atomicWrite's doc
 * comment above).
 */
function migrateLockPath(reposDir: string): string {
  return join(reposDir, MIGRATE_LOCK_NAME);
}

function readMigrateLockInfo(lockPath: string): { pid: number; ts: number } | null {
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf-8');
  } catch {
    return null;
  }
  const [pidStr, tsStr] = raw.trim().split(':');
  const pid = Number(pidStr);
  const ts = Number(tsStr);
  if (!Number.isFinite(pid) || !Number.isFinite(ts)) return null;
  return { pid, ts };
}

/** Best-effort liveness check — see sync.ts's own copy of this same check for the full rationale (kept independent per file-ownership boundaries). */
function isMigrateLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return e.code === 'EPERM';
  }
}

/**
 * Report the lock-contention failure using the SAME inline JSON/console
 * pattern already used by the --logos/--repos existence guard in
 * runMigrate below (this file predates sync.ts's shared fail() helper;
 * keeping this local avoids inventing a second error-reporting convention
 * for one call site).
 */
function failMigrateLocked(opts: MigrateOptions, message: string): never {
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'migrate-locked', message }, null, 2) + '\n');
  } else {
    console.error(chalk.red(`\n  ✗ ${message}\n`));
  }
  process.exit(2);
  // Unreachable in real Node (process.exit terminates); kept so this
  // function's return type can be `never` without relying on @types/node
  // modeling process.exit as `never` at every call site.
  throw new Error('unreachable');
}

/**
 * Acquire the whole-run journal lock. Returns the lock path on success.
 * Self-heals a stale lock (dead pid, or older than MIGRATE_LOCK_STALE_MS)
 * by removing it and retrying once. On genuine contention, calls
 * failMigrateLocked() — never returns.
 */
function acquireMigrateLock(opts: MigrateOptions): string {
  const lockPath = migrateLockPath(opts.repos);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeSync(fd, `${process.pid}:${Date.now()}`);
      } finally {
        closeSync(fd);
      }
      return lockPath;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'EEXIST') throw err;

      const info = readMigrateLockInfo(lockPath);
      const stale =
        info === null || !isMigrateLockHolderAlive(info.pid) || Date.now() - info.ts > MIGRATE_LOCK_STALE_MS;

      if (stale && attempt === 0) {
        try {
          unlinkSync(lockPath);
        } catch {
          /* another process may have already cleared it — loop and retry the create */
        }
        continue;
      }

      failMigrateLocked(
        opts,
        `Another 'brand migrate' process (pid ${info?.pid ?? 'unknown'}) appears to be running against ${opts.repos} ` +
          `right now (lock: ${lockPath}). Refusing to proceed to avoid corrupting the shared migration journal — ` +
          `retry once it finishes. If it is confirmed dead, delete the lock file manually.`,
      );
    }
  }
  throw new Error('unreachable'); // loop above always returns or throws via failMigrateLocked
}

function releaseMigrateLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    /* best-effort — already gone, or never created */
  }
}

export async function runMigrate(opts: MigrateOptions): Promise<void> {
  const logosDir = opts.logos;

  // Guard the input directories up front — a missing/mistyped --logos or --repos
  // (defaults `logos` and `.`) is an operator error (exit 2), not a silent
  // "Repos scanned: 0" / exit-0 no-op that migrated nothing.
  for (const [flag, dir] of [['--logos', logosDir], ['--repos', opts.repos]] as const) {
    if (!existsSync(dir)) {
      const which = flag === '--logos' ? 'logos' : 'repos';
      const message = `${which} directory not found: ${dir} — pass ${flag} <path> or run from the brand repo root.`;
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'dir-not-found', flag, path: dir, message }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${message}\n`));
      }
      process.exit(2);
    }
  }

  // --- Lock acquisition (F-4141e3e3) — see acquireMigrateLock's doc
  // comment above for the race this closes. Held for the ENTIRE remainder
  // of this function, since the journal read-modify-write bookkeeping
  // (push an entry now, drop it later) must stay internally consistent
  // across this run's whole lifetime, not just around each individual
  // journal file operation.
  const migrateLock = acquireMigrateLock(opts);
  const releaseMigrateLockOnProcessExit = () => releaseMigrateLock(migrateLock);
  // Backstop for the process.exit(3) calls below: unlike a thrown error,
  // process.exit() does not run pending `finally` blocks on its way out,
  // so the try/finally alone would leak the lock in production whenever a
  // failure exit is hit after this point. The 'exit' event is Node's
  // documented hook that DOES fire even through explicit process.exit().
  process.on('exit', releaseMigrateLockOnProcessExit);

  try {
    const slugDirs = globSync('*/', { cwd: logosDir }).map(d => d.replace(/\/$/, ''));

    // "Is this src already pointing at the brand repo?" must be derived from the
    // operator-settable --brand-base, not a hard-coded 'brand/main/logos' literal.
    // The rewrite target (newSrc, below) is built from opts.brandBase, so the
    // recognizer has to match — otherwise a custom --brand-base can never see its
    // own already-migrated output and re-writes byte-identical content every run,
    // falsely reporting repos as "updated". Trailing slash tolerated.
    const brandPrefix = opts.brandBase.replace(/\/+$/, '');
    const isBrandSrc = (src: string): boolean => src.includes(brandPrefix);

    let total = 0;
    let updated = 0;
    let skipped = 0;
    const skippedByReason: Record<SkipReason, number> = {
      'no-clone': 0,
      'no-logo-file': 0,
      'multi-logo': 0,
      'already-migrated': 0,
    };
    const failures: RepoFailure[] = [];
    const multiLogoCollisions: MultiLogoCollision[] = [];

    if (opts.dryRun && !opts.json && !opts.quiet) {
      console.log(chalk.cyan('\n  DRY RUN — no files will be modified.\n'));
    }

    // --- Resume: restore any half-applied migration from a prior interrupted run ---
    // `--dry-run --resume` MUST be a true preview: nothing in the dry-run
    // branch below writes to disk or touches the journal. Previously the
    // restore-and-wipe sequence ran unconditionally regardless of
    // opts.dryRun, so a "preview" run silently performed real, permanent
    // writes (every journaled README overwritten with its pre-migration
    // original) and really deleted the journal. (F-e9cfd56a)
    let resumed = 0;
    const existingJournal = readJournal(opts.repos);
    if (opts.resume && existingJournal.length > 0) {
      if (opts.dryRun) {
        if (!opts.json && !opts.quiet) {
          console.log(chalk.cyan(
            `  Would resume from journal: ${existingJournal.length} README(s) would be restored:\n`
          ));
          for (const entry of existingJournal) {
            console.log(`    ~ ${entry.path}`);
          }
          console.log('');
        }
        // Preview only — count what WOULD be restored; touch nothing.
        resumed = existingJournal.length;
      } else {
        if (!opts.json && !opts.quiet) {
          console.log(chalk.cyan(`\n  Resuming from journal: ${existingJournal.length} README(s) to restore.\n`));
        }
        const handledPaths = new Set<string>();
        for (const entry of existingJournal) {
          try {
            if (existsSync(entry.path)) {
              atomicWrite(entry.path, entry.original);
              resumed++;
            }
            // Whether or not the file still existed, this entry is handled —
            // safe to drop from the journal below.
            handledPaths.add(entry.path);
          } catch (err) {
            // Restore failed — leave this entry IN the journal (a future
            // --resume can retry it) and surface the failure everywhere
            // failures are surfaced: console, the JSON result, and the exit
            // code. Previously this was a best-effort console.error gated
            // behind !json && !quiet with NOTHING tracked, and the very next
            // line unconditionally wiped the whole journal regardless —
            // silently and permanently destroying the only backup of the
            // pre-migration content for this entry. (F-ff1c46f0)
            const e = err as NodeJS.ErrnoException;
            failures.push({
              slug: entry.path,
              code: e.code,
              message: `resume restore failed: ${e.message}`,
            });
            if (!opts.json && !opts.quiet) {
              console.error(chalk.red(`  ! could not restore ${entry.path}: ${e.message}`));
            }
          }
        }
        // Drop only the entries that were actually handled — entries whose
        // restore failed stay in the journal so their recovery data isn't
        // lost, instead of the previous unconditional writeJournal([]).
        const remaining = existingJournal.filter(e => !handledPaths.has(e.path));
        writeJournal(opts.repos, remaining);
      }
    } else if (existingJournal.length > 0 && !opts.json && !opts.quiet) {
      console.error(chalk.yellow(
        `\n  ! ${JOURNAL_NAME} found at ${opts.repos} — a prior migrate appears to have been interrupted.\n` +
        `    Re-run with --resume to restore the original READMEs, or delete the journal manually.\n`
      ));
    }

    const showProgress = !opts.json && !opts.quiet && isTTY();

    for (let i = 0; i < slugDirs.length; i++) {
      const slug = slugDirs[i];
      if (!slug) continue;

      const repoDir = join(opts.repos, slug);
      if (!existsSync(repoDir)) {
        skipped++;
        skippedByReason['no-clone']++;
        continue;
      }

      total++;

      // Per-repo try/catch — one repo's failure must not abort the rest.
      try {
        // Determine the correct file extension for this logo (probe png, jpg, jpeg, svg, webp in order)
        const logoFile = findLogoFile(slug, logosDir);
        if (!logoFile) {
          if (!opts.json && !opts.quiet) {
            console.log(chalk.yellow(
              `  ! ${slug} — no readme.{png,jpg,jpeg,svg,webp} found in logos dir, skipping`
            ));
          }
          skipped++;
          skippedByReason['no-logo-file']++;
          total--;
          continue;
        }
        // Escaped (F-710290dd): opts.brandBase is operator-supplied
        // (--brand-base) and gets spliced VERBATIM into an <img src="...">
        // attribute by rewriteLogoSrc below — see escapeHtmlAttr's doc
        // comment for why an unescaped quote here is a markup-injection
        // vector into every README this command touches.
        const newSrc = escapeHtmlAttr(`${opts.brandBase}/${slug}/readme.${logoFile.ext}`);

        const readmes = globSync('README*.md', { cwd: repoDir });
        let repoChanged = false;
        let repoAlreadyMigrated = true; // assume yes until a needs-update README is seen
        let repoHadCollision = false;

        for (const readmeFile of readmes) {
          const readmePath = join(repoDir, readmeFile);
          let content: string;
          try {
            content = readFileSync(readmePath, 'utf-8');
          } catch (err) {
            const e = err as NodeJS.ErrnoException;
            failures.push({
              slug,
              file: readmeFile,
              code: e.code,
              message: `read failed: ${e.message}`,
            });
            continue;
          }
          const matches = findLogoImgTags(content);
          if (matches.length === 0) continue;

          // Check if already pointing at brand repo
          const needsUpdate = matches.some(m => !isBrandSrc(m.src));
          if (!needsUpdate) continue;
          repoAlreadyMigrated = false;

          // Multi-logo guard: distinct non-brand srcs would silently collapse.
          const nonBrandSrcs = matches
            .filter(m => !isBrandSrc(m.src))
            .map(m => m.src);
          const distinctNonBrand = new Set(nonBrandSrcs);
          if (distinctNonBrand.size > 1) {
            if (!opts.json && !opts.quiet) {
              console.log(chalk.yellow(
                `  ! ${slug}/${readmeFile} — ${distinctNonBrand.size} distinct non-brand logo srcs detected, skipping to avoid collapsing layout:`
              ));
              for (const s of distinctNonBrand) {
                console.log(chalk.yellow(`      ${s}`));
              }
              console.log(chalk.dim(
                `      To migrate manually: edit the README to leave only the canonical logo as a local <img>, then re-run migrate.`
              ));
            }
            multiLogoCollisions.push({
              slug,
              file: readmeFile,
              distinctSrcs: [...distinctNonBrand],
            });
            repoHadCollision = true;
            continue;
          }

          if (opts.dryRun) {
            if (!opts.json && !opts.quiet) {
              for (const match of matches) {
                if (!isBrandSrc(match.src)) {
                  console.log(`  ~ ${slug}/${readmeFile}`);
                  console.log(chalk.red(`    old: ${match.src}`));
                  console.log(chalk.green(`    new: ${newSrc}`));
                }
              }
            }
            repoChanged = true;
            // Dry-run is read-only: skip journal + write entirely.
            continue;
          }

          // --- Real write path: journal first, then atomic write, then drop entry. ---
          const rewritten = rewriteLogoSrc(content, newSrc);
          const journal = readJournal(opts.repos);
          journal.push({
            path: readmePath,
            original: content,
            ts: new Date().toISOString(),
          });
          writeJournal(opts.repos, journal);

          try {
            atomicWrite(readmePath, rewritten);
          } catch (err) {
            // Write failed — leave the journal entry in place so --resume can restore.
            const e = err as NodeJS.ErrnoException;
            failures.push({
              slug,
              file: readmeFile,
              code: e.code,
              message: `write failed: ${e.message}`,
            });
            continue;
          }

          // Success — drop our journal entry.
          const after = readJournal(opts.repos).filter(e => e.path !== readmePath);
          writeJournal(opts.repos, after);

          if (!opts.json && !opts.quiet) {
            console.log(chalk.green(`  ✓ ${slug}/${readmeFile}`));
          }
          repoChanged = true;
        }

        if (repoChanged) {
          updated++;
        } else if (repoHadCollision) {
          // All needs-update READMEs in this repo hit the multi-logo guard.
          skipped++;
          skippedByReason['multi-logo']++;
          total--;
        } else if (repoAlreadyMigrated && readmes.length > 0) {
          // README(s) exist but all already point at brand — already migrated.
          skipped++;
          skippedByReason['already-migrated']++;
          total--;
        }

        if (showProgress) {
          const status = repoChanged ? 'updated' : 'skipped';
          process.stderr.write(chalk.dim(`  [${i + 1}/${slugDirs.length}] ${slug} — ${status}\n`));
        }
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        failures.push({
          slug,
          code: e.code,
          message: e.message,
        });
      }
    }

    const result: MigrateResult = {
      total,
      updated,
      skipped,
      skippedByReason,
      failures,
      multiLogoCollisions,
      dryRun: opts.dryRun,
      resumed,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      // Non-zero exit only on hard failures; collisions surfaced in JSON but exit 0
      if (failures.length > 0) process.exit(3);
      return;
    }

    console.log(`\n  Repos scanned: ${total}`);
    console.log(`  Repos updated: ${updated}`);
    console.log(`  Repos skipped: ${skipped}`);
    if (skippedByReason['no-clone'] > 0)        console.log(chalk.dim(`    no local clone:      ${skippedByReason['no-clone']}`));
    if (skippedByReason['no-logo-file'] > 0)    console.log(chalk.dim(`    no logo file:        ${skippedByReason['no-logo-file']}`));
    if (skippedByReason['multi-logo'] > 0)      console.log(chalk.dim(`    multi-logo collision: ${skippedByReason['multi-logo']}`));
    if (skippedByReason['already-migrated'] > 0) console.log(chalk.dim(`    already migrated:    ${skippedByReason['already-migrated']}`));
    if (multiLogoCollisions.length > 0) {
      console.log(chalk.yellow(`  Multi-logo collisions: ${multiLogoCollisions.length}`));
    }
    if (failures.length > 0) {
      console.log(chalk.red(`  Failures: ${failures.length}`));
      for (const f of failures) {
        const fileRef = f.file ? `/${f.file}` : '';
        const codeRef = f.code ? ` (${f.code})` : '';
        console.log(chalk.red(`    ${f.slug}${fileRef}${codeRef}: ${f.message}`));
      }
      console.log('');
      process.exit(3);
    }
    console.log('');
  } finally {
    process.removeListener('exit', releaseMigrateLockOnProcessExit);
    releaseMigrateLock(migrateLock);
  }
}
