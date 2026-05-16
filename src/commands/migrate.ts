/**
 * brand migrate — rewrite README logo references across repos to brand URLs.
 *
 * Stage-C hardening (post-Stage-A):
 *   - Atomic per-file writes via temp-file + rename (same-volume atomic).
 *   - Journal sidecar (.brand-migrate.journal.json under opts.repos) records
 *     the original content of every README touched so a SIGINT or crash
 *     leaves a recovery trail. After successful write the entry is removed.
 *     On startup, if entries remain from a prior run, --resume restores them.
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
    // Corrupt journal — surface but don't crash; treat as empty.
  }
  return [];
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
  const slugDirs = globSync('*/', { cwd: logosDir }).map(d => d.replace(/\/$/, ''));

  // --- Resume: restore any half-applied migration from a prior interrupted run ---
  let resumed = 0;
  const existingJournal = readJournal(opts.repos);
  if (opts.resume && existingJournal.length > 0) {
    if (!opts.json && !opts.quiet) {
      console.log(chalk.cyan(`\n  Resuming from journal: ${existingJournal.length} README(s) to restore.\n`));
    }
    for (const entry of existingJournal) {
      try {
        if (existsSync(entry.path)) {
          atomicWrite(entry.path, entry.original);
          resumed++;
        }
      } catch (err) {
        // Best-effort restore; we'll surface as a failure on the summary
        const e = err as NodeJS.ErrnoException;
        if (!opts.json && !opts.quiet) {
          console.error(chalk.red(`  ! could not restore ${entry.path}: ${e.message}`));
        }
      }
    }
    // Drop the journal after a resume — what's done is done.
    writeJournal(opts.repos, []);
  } else if (existingJournal.length > 0 && !opts.json && !opts.quiet) {
    console.error(chalk.yellow(
      `\n  ! ${JOURNAL_NAME} found at ${opts.repos} — a prior migrate appears to have been interrupted.\n` +
      `    Re-run with --resume to restore the original READMEs, or delete the journal manually.\n`
    ));
  }

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
        const needsUpdate = matches.some(m => !m.src.includes('brand/main/logos'));
        if (!needsUpdate) continue;
        repoAlreadyMigrated = false;

        // Multi-logo guard: distinct non-brand srcs would silently collapse.
        const nonBrandSrcs = matches
          .filter(m => !m.src.includes('brand/main/logos'))
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
              if (!match.src.includes('brand/main/logos')) {
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
