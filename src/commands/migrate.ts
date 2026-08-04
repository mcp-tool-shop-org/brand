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
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
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
      const newSrc = `${opts.brandBase}/${slug}/readme.${logoFile.ext}`;

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
}
