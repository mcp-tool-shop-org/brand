/**
 * brand add-gallery — explicit, deliberate registration of a directory of
 * images as ONE named gallery collection for a slug.
 *
 * This is the alternative to ever hand-copying files into logos/<slug>/ and
 * hoping `brand manifest` notices. Confirmed against npm's own `files` field
 * docs: a directory's contents are never included implicitly — an operator
 * always has to declare them explicitly. Same principle here: nothing about
 * gallery membership is inferred. A human runs this exact command with this
 * exact slug + source-dir, and the target folder is reconciled to match.
 *
 * Contract:
 *   - Idempotent full-resync, matching `git add <dir>`'s proven contract:
 *     re-running against a changed source-dir copies new files, overwrites
 *     changed files (content-hash compared, not mtime), and REMOVES files
 *     that disappeared from source-dir. NOT append-only.
 *   - Never trusts readdir() order for display order (Storybook/Astro
 *     precedent — readdir order is platform-dependent). Default order is a
 *     natural/numeric-aware filename sort. `--order` lets the operator pin
 *     an explicit order via zero-padded numeric-prefix renaming, so the
 *     natural sort of the target folder durably matches the requested order
 *     without any sidecar/state file.
 *   - Flat-directory-in, flat-gallery-folder-out: source-dir's own
 *     subdirectories are never recursed (imagemin-cli flattening
 *     anti-pattern) — they're skipped with a warning.
 *   - Only IMAGE_EXTENSIONS files are considered; everything else in
 *     source-dir is silently skipped (informational note only).
 *   - Multi-file writes use a staging dir + backup-rename swap: the existing
 *     gallery folder is renamed to a backup name (never deleted outright),
 *     the newly staged folder takes its place, and only then is the backup
 *     removed — so a crash at any point still leaves either the original or
 *     the replacement resolvable as "the real gallery" under a predictable
 *     name, never neither. A run where nothing actually changed skips this
 *     dance entirely (no restaging, no fresh mtimes, no crash exposure).
 */

import chalk from 'chalk';
import {
  existsSync,
  statSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  renameSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, basename, dirname } from 'node:path';
import { generateManifest, writeManifest, IMAGE_EXTENSIONS } from '../manifest.js';

export interface AddGalleryOptions {
  slug: string;
  sourceDir: string;
  galleryName?: string;
  order?: string;
  dryRun?: boolean;
  json?: boolean;
  logos?: string;
  quiet?: boolean;
  verbose?: boolean;
}

interface ReconcileResult {
  added: string[];
  updated: string[];
  removed: string[];
  skippedNonImage: string[];
  skippedSubdirs: string[];
}

interface AddGalleryJsonResult {
  ok: boolean;
  slug: string;
  gallery: string;
  added: string[];
  updated: string[];
  removed: string[];
  dryRun: boolean;
}

/** Operator-error signal — caught by runAddGallery to map to exit code 2. */
class OperatorError extends Error {}

/**
 * Natural/numeric-aware comparator: "image9" sorts before "image10".
 * Splits each name into runs of digits vs. non-digits and compares
 * digit runs numerically, everything else lexically (case-insensitive).
 */
function naturalCompare(a: string, b: string): number {
  const chunk = (s: string) => s.match(/(\d+|\D+)/g) ?? [];
  const chunksA = chunk(a);
  const chunksB = chunk(b);
  const len = Math.max(chunksA.length, chunksB.length);
  for (let i = 0; i < len; i++) {
    const ca = chunksA[i];
    const cb = chunksB[i];
    if (ca === undefined) return -1;
    if (cb === undefined) return 1;
    const na = /^\d+$/.test(ca) ? Number(ca) : null;
    const nb = /^\d+$/.test(cb) ? Number(cb) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = ca.toLowerCase().localeCompare(cb.toLowerCase());
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

// Characters that are unsafe in a single path segment. Beyond the separators
// and "..", Windows also reserves : * ? " < > | in filenames — a colon in
// particular is a plausible fat-finger (e.g. pasting a Windows path fragment
// like "C:foo" as a slug), and left unvalidated it reaches an un-guarded
// mkdirSync() and crashes with a raw ENOENT/opaque OS error (exit 3) instead
// of a clean operator error (exit 2). See F-3aff2618.
const INVALID_SEGMENT_CHARS = /[/\\:*?"<>|]/;

/** Validate a slug is a safe, single path segment. */
export function validateSlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new OperatorError('slug must be a non-empty string.');
  }
  if (INVALID_SEGMENT_CHARS.test(slug) || slug.includes('..') || slug === '.') {
    throw new OperatorError(
      `slug "${slug}" is not a valid path segment (no /, \\, :, *, ?, ", <, >, |, or ..).`
    );
  }
}

/** Validate a gallery name is a safe, single path segment. */
function validateGalleryName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new OperatorError('--gallery-name must be a non-empty string.');
  }
  if (INVALID_SEGMENT_CHARS.test(name) || name.includes('..') || name === '.') {
    throw new OperatorError(
      `--gallery-name "${name}" is not a valid path segment (no /, \\, :, *, ?, ", <, >, |, or ..).`
    );
  }
}

/** SHA-256 content hash, used for update-detection (never mtime). */
function contentHash(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Enumerate direct image files in sourceDir (no recursion). Subdirectories
 * are reported separately so the caller can warn about them without
 * recursing into or flattening their contents.
 */
function enumerateSourceDir(sourceDir: string): {
  images: string[];
  nonImages: string[];
  subdirs: string[];
} {
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  const images: string[] = [];
  const nonImages: string[] = [];
  const subdirs: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      subdirs.push(entry.name);
      continue;
    }
    if (!entry.isFile()) continue; // skip symlinks/devices/etc.
    const ext = extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      images.push(entry.name);
    } else {
      nonImages.push(entry.name);
    }
  }

  return { images, nonImages, subdirs };
}

/**
 * Apply --order renaming: returns a map of original filename -> final
 * filename to use in the target gallery folder. Without --order, files
 * keep their original names (natural sort of those names is the display
 * order). With --order, every file gets a zero-padded numeric prefix
 * matching its position in the requested order, so natural sort of the
 * *target* folder durably reproduces the requested order without any
 * sidecar state file.
 */
function resolveFinalNames(images: string[], order: string[] | undefined): Map<string, string> {
  const result = new Map<string, string>();

  if (!order) {
    for (const name of images) {
      result.set(name, name);
    }
    return result;
  }

  const width = String(order.length).length;
  order.forEach((originalName, idx) => {
    const prefix = String(idx + 1).padStart(width, '0');
    result.set(originalName, `${prefix}-${originalName}`);
  });
  return result;
}

/**
 * Validate --order against the actual image files found in source-dir.
 * Every requested filename must exist in source-dir, AND every image file
 * in source-dir must be covered by --order (no partial lists — ambiguous
 * otherwise). Throws OperatorError with a precise, actionable message.
 */
function validateOrder(order: string[], images: string[]): void {
  const imageSet = new Set(images);
  const orderSet = new Set(order);

  const missingFromSource = order.filter(f => !imageSet.has(f));
  if (missingFromSource.length > 0) {
    throw new OperatorError(
      `--order lists file(s) not found in source-dir: ${missingFromSource.join(', ')}`
    );
  }

  const dupes = order.filter((f, i) => order.indexOf(f) !== i);
  if (dupes.length > 0) {
    throw new OperatorError(
      `--order lists duplicate filename(s): ${[...new Set(dupes)].join(', ')}`
    );
  }

  const missingFromOrder = images.filter(f => !orderSet.has(f));
  if (missingFromOrder.length > 0) {
    throw new OperatorError(
      `--order is a partial list — it's missing ${missingFromOrder.length} image file(s) found in source-dir: ` +
      `${missingFromOrder.join(', ')}. --order must cover ALL image files in source-dir (partial lists are ` +
      `ambiguous about where the uncovered files should sort).`
    );
  }
}

/**
 * Reserved naming convention for this command's own internal
 * staging/backup directories, used during the swap in reconcile() below.
 *
 * Prefixed with "." so they are invisible BY DEFAULT to manifest.ts's
 * getGalleryFolders()/generateManifest() directory scan: both call
 * globSync('*\/', { cwd, follow: false }) with no `dot` option, and the
 * `glob` package (empirically confirmed against the ^13.0.6 range this
 * repo depends on) does not match dot-prefixed entries unless `dot: true`
 * is passed — neither call opts in. This closes the "phantom gallery"
 * half of F-ea059f0e without requiring any change to manifest.ts: a
 * leftover staging/backup dir can no longer be discovered as a second
 * gallery folder for the slug, regardless of why it was left behind (a
 * hard kill between the two renames, or an rmSync that throws — see
 * cleanupStaleSiblings below for the other half of the fix).
 *
 * This IS a real, verified mitigation today, but it is also an implicit
 * contract — it depends on manifest.ts's CURRENT glob call shape, which
 * this file cannot enforce since src/manifest.ts is outside this
 * command's domain. See this wave's swarm output for the explicit
 * denylist manifest.ts should also carry so the exclusion stops being
 * implicit and can't silently regress if that file's glob options ever
 * change.
 */
export function stagingDirFor(targetDir: string): string {
  return join(dirname(targetDir), `.brand-staging-${basename(targetDir)}-${process.pid}-${Date.now()}`);
}
export function backupDirFor(targetDir: string): string {
  return join(dirname(targetDir), `.brand-backup-${basename(targetDir)}-${process.pid}-${Date.now()}`);
}

/**
 * Prefix matchers for BOTH the current dot-prefixed convention (see
 * stagingDirFor/backupDirFor above) and the legacy convention used before
 * F-ea059f0e (a bare `<targetBaseName>.brand-staging-`/`.brand-backup-`
 * sibling, with no leading dot). A crash under the OLD code could still
 * have left a legacy-named leftover on disk before this fix ever shipped;
 * matching both conventions means that leftover self-heals on the very
 * next invocation too, not just leftovers created by the new code.
 */
function stalePrefixesFor(targetDir: string): string[] {
  const base = basename(targetDir);
  return [
    `.brand-staging-${base}-`,
    `.brand-backup-${base}-`,
    `${base}.brand-staging-`,
    `${base}.brand-backup-`,
  ];
}

/**
 * Best-effort liveness check for the pid embedded in a reserved sibling's
 * own name (see parseReservedSiblingPid below). Signal 0 sends nothing but
 * still reports ESRCH ("no such process") vs. success/EPERM — supported
 * cross-platform by Node, confirmed on this repo's target platforms. Any
 * error OTHER than EPERM (e.g. ESRCH, or an out-of-range pid rejected
 * before a signal is even attempted) is treated as "not alive", so an
 * unparseable or clearly-bogus pid defaults to being reclaimable rather
 * than permanently protected.
 *
 * Not shared with sync.ts's/migrate.ts's own copy of this same check —
 * kept independent per file-ownership boundaries, the same rule
 * atomicWrite's doc comment documents elsewhere in this command set.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return e.code === 'EPERM';
  }
}

/**
 * Extract the pid embedded in a reserved staging/backup sibling's own
 * name (both conventions encode it as `...-<pid>-<timestamp>`, see
 * stagingDirFor/backupDirFor/stalePrefixesFor above), or null if `name`
 * does not match any reserved prefix or the pid segment isn't parseable.
 */
function parseReservedSiblingPid(name: string, targetDir: string): number | null {
  for (const prefix of stalePrefixesFor(targetDir)) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length); // "<pid>-<timestamp>"
    const dashIdx = rest.indexOf('-');
    if (dashIdx === -1) continue;
    const pidStr = rest.slice(0, dashIdx);
    if (!/^\d+$/.test(pidStr)) continue;
    const pid = Number(pidStr);
    if (Number.isFinite(pid)) return pid;
  }
  return null;
}

/**
 * Remove any staging/backup sibling directories left over from a previous
 * interrupted reconcile() for this exact targetDir — self-heals
 * regardless of WHY the previous run didn't finish (a hard kill between
 * the two renames, or an rmSync that threw and used to be silently
 * swallowed behind a comment calling the leftover "harmless clutter").
 *
 * That claim was empirically false (F-ea059f0e): generateManifest(),
 * called automatically after every real add-gallery run, has zero
 * name-filtering on direct subfolders of a slug and silently adopts a
 * leftover as a second, phantom gallery — corrupting manifest.json and
 * later making a plain `brand sync <slug>` fail with "ambiguous gallery"
 * until a human finds and deletes the stray directory by hand.
 *
 * A candidate is only reclaimed when the pid embedded in its OWN name
 * (see parseReservedSiblingPid) is confirmed dead, or isn't parseable at
 * all. A sibling whose embedded pid IS still alive is presumed to belong
 * to another in-progress invocation of this same command actively writing
 * into its own staging dir right now — never reclaimed, regardless of how
 * long it has been running. This is deliberately a liveness check, not an
 * age/timeout heuristic: unlike a lock file (an inert marker, safe to
 * reclaim once its holder is confirmed gone), a staging dir may be under
 * active, ongoing write — seizing it out from under a slow-but-live
 * process would be actively destructive, not merely impolite.
 *
 * Runs BEFORE reconcile does anything else in the real (non-dry-run)
 * path, INCLUDING when added/updated/removed all come back empty — a
 * "nothing to do" re-run is in fact the MOST likely shape of the very
 * next invocation after a crash (the swap itself already completed; only
 * the final backup removal was interrupted), so gating this on "there's
 * real work to do" would miss the single most common recovery case. This
 * is safe to run unconditionally because it only ever touches sibling
 * directories matching the reserved naming convention AND owned by a
 * confirmed-dead pid — never targetDir itself and never a live sibling —
 * so it cannot reintroduce the mtime-churn problem the nothing-to-do
 * short-circuit below exists to prevent (F-7215ff77).
 */
function cleanupStaleSiblings(targetDir: string): void {
  const parent = dirname(targetDir);
  if (!existsSync(parent)) return;

  const prefixes = stalePrefixesFor(targetDir);
  let entryNames: string[];
  try {
    entryNames = readdirSync(parent, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return; // best-effort — a transient listing failure just means the next run retries
  }

  for (const name of entryNames) {
    if (!prefixes.some(p => name.startsWith(p))) continue;

    const pid = parseReservedSiblingPid(name, targetDir);
    if (pid !== null && isProcessAlive(pid)) continue; // belongs to a live, in-progress run — never touch it

    try {
      rmSync(join(parent, name), { recursive: true, force: true });
    } catch {
      // Best-effort: if this ALSO fails (e.g. an AV scanner or search
      // indexer holding a handle open), the NEXT invocation retries the
      // same cleanup instead of adopting the leftover — unlike the old
      // swallowed-and-forgotten catch{}, this one is retried, not permanent.
    }
  }
}

/**
 * Reconcile the target gallery folder to match the desired final state
 * (sourceDir's images, renamed per resolveFinalNames). Uses a staging temp
 * dir + backup-rename swap: every new/changed file is first fully written
 * into a staging directory; only once staging succeeds completely do we
 * swap it into place by renaming the existing target to a backup name
 * (never deleting it outright), moving staging into the target name, and
 * only then removing the backup — so a crash at any point still leaves
 * either the original or the replacement resolvable under a predictable
 * name, never neither. Returns early, before touching disk at all, when
 * added/updated/removed are all empty (nothing to do).
 */
function reconcile(
  sourceDir: string,
  targetDir: string,
  images: string[],
  finalNames: Map<string, string>,
  dryRun: boolean
): ReconcileResult {
  const targetExists = existsSync(targetDir);
  const existingFiles = targetExists
    ? readdirSync(targetDir, { withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => e.name)
    : [];

  const desiredFinalNames = new Set(images.map(name => finalNames.get(name)!));

  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];

  for (const original of images) {
    const finalName = finalNames.get(original)!;
    const targetPath = join(targetDir, finalName);
    if (!existingFiles.includes(finalName)) {
      added.push(finalName);
    } else {
      const sourceHash = contentHash(join(sourceDir, original));
      const targetHash = contentHash(targetPath);
      if (sourceHash !== targetHash) {
        updated.push(finalName);
      }
    }
  }

  for (const existing of existingFiles) {
    if (!desiredFinalNames.has(existing)) {
      removed.push(existing);
    }
  }

  if (dryRun) {
    return { added, updated, removed, skippedNonImage: [], skippedSubdirs: [] };
  }

  // Self-heal BEFORE anything else in the real-run path: clear out any
  // staging/backup siblings a previous interrupted run left behind for
  // THIS targetDir. See cleanupStaleSiblings's doc comment for why this
  // runs even when nothing else below is about to change. (F-ea059f0e)
  cleanupStaleSiblings(targetDir);

  // Nothing-to-do short-circuit: when the target is already byte-for-byte in
  // sync, skip the staging/swap dance entirely. Without this, EVERY real run
  // — including a no-op re-run — deleted and fully recreated targetDir,
  // which (a) hit the crash window below on every single invocation instead
  // of only on runs with real changes, and (b) gave every gallery file a
  // fresh mtime on every run even when content was unchanged, spuriously
  // invalidating any downstream cache/CDN keyed off Last-Modified.
  // (F-7215ff77)
  if (added.length === 0 && updated.length === 0 && removed.length === 0) {
    return { added, updated, removed, skippedNonImage: [], skippedSubdirs: [] };
  }

  // Staging-dir + swap discipline: build the full desired target state in a
  // sibling staging dir first. Only on full success do we swap it into place.
  const stagingDir = stagingDirFor(targetDir);
  const backupDir = backupDirFor(targetDir);
  mkdirSync(stagingDir, { recursive: true });

  let renamedTargetAway = false;
  try {
    // Copy every desired file (changed or not) into staging so staging is
    // a complete, correct snapshot of the target's final state.
    for (const original of images) {
      const finalName = finalNames.get(original)!;
      copyFileSync(join(sourceDir, original), join(stagingDir, finalName));
    }

    // Swap: never delete the existing gallery outright. Rename it out of
    // the way first (recoverable under a well-known backup name), rename
    // the fully-built staging dir into the now-vacant target name, and only
    // THEN remove the backup. At every instant either <targetDir> or
    // <backupDir> resolves to a complete, valid gallery folder — unlike the
    // previous rm-then-rename sequence, a crash here never leaves the
    // gallery folder simply absent with only an unlabeled staging dir as
    // the only evidence it ever existed. (F-7fef3209)
    if (targetExists) {
      renameSync(targetDir, backupDir);
      renamedTargetAway = true;
    }
    renameSync(stagingDir, targetDir);
    if (renamedTargetAway) {
      try {
        rmSync(backupDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup. If this throws (e.g. a Windows AV scanner or
        // search indexer briefly holding the directory open — not only a
        // hard-kill scenario), the backup dir is left on disk under its
        // RESERVED, dot-prefixed name (see backupDirFor above) — invisible
        // to manifest.ts's gallery discovery by construction, and
        // self-healed by cleanupStaleSiblings on the very next invocation
        // of this command for this same gallery. This is NOT harmless
        // clutter to leave indefinitely (an earlier version of this
        // comment claimed exactly that, and F-ea059f0e proved it false —
        // generateManifest used to silently adopt a leftover as a second,
        // phantom gallery) — but it is also no longer either adopted or a
        // permanent orphan.
      }
    }
  } catch (err) {
    // If the target was already renamed out of the way but the swap did not
    // finish, put it back so the gallery folder is never left missing under
    // its expected name.
    if (renamedTargetAway && existsSync(backupDir)) {
      try {
        renameSync(backupDir, targetDir);
      } catch {
        /* best-effort restore; the original is still recoverable under backupDir's name */
      }
    }
    // Best-effort cleanup of the staging dir on failure so we don't leak
    // `.brand-staging-*` siblings.
    try {
      rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }

  return { added, updated, removed, skippedNonImage: [], skippedSubdirs: [] };
}

function printSummaryList(label: string, items: string[]): void {
  if (items.length === 0) return;
  const maxShown = 20;
  console.log(chalk.dim(`    ${label} (${items.length}):`));
  for (const item of items.slice(0, maxShown)) {
    console.log(chalk.dim(`      - ${item}`));
  }
  if (items.length > maxShown) {
    console.log(chalk.dim(`      ... and ${items.length - maxShown} more`));
  }
}

export async function runAddGallery(opts: AddGalleryOptions): Promise<void> {
  const logosDir = opts.logos ?? 'logos';
  const galleryName = opts.galleryName ?? 'gallery';

  try {
    validateSlug(opts.slug);
    validateGalleryName(galleryName);

    if (!existsSync(opts.sourceDir)) {
      throw new OperatorError(`source-dir does not exist: ${opts.sourceDir}`);
    }
    if (!statSync(opts.sourceDir).isDirectory()) {
      throw new OperatorError(`source-dir is not a directory: ${opts.sourceDir}`);
    }

    const { images, nonImages, subdirs } = enumerateSourceDir(opts.sourceDir);

    let order: string[] | undefined;
    if (opts.order !== undefined) {
      order = opts.order
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      validateOrder(order, images);
    }

    const finalNames = resolveFinalNames(images, order);

    // Display/copy order: the order the operator requested (already
    // reflected via numeric prefixes), else natural sort of original names.
    const sortedImages = order
      ? [...order]
      : [...images].sort((a, b) => naturalCompare(a, b));

    const targetDir = join(logosDir, opts.slug, galleryName);

    const result = reconcile(opts.sourceDir, targetDir, sortedImages, finalNames, Boolean(opts.dryRun));
    result.skippedNonImage = nonImages;
    result.skippedSubdirs = subdirs;

    const nothingToDo =
      result.added.length === 0 && result.updated.length === 0 && result.removed.length === 0;

    // --- Human-readable informational notes (non-JSON mode only) ---
    if (!opts.json && !opts.quiet) {
      if (subdirs.length > 0) {
        console.log(
          chalk.yellow(
            `  ! ${subdirs.length} subdirectory(ies) in source-dir skipped (not recursed): ${subdirs.join(', ')}`
          )
        );
      }
      if (nonImages.length > 0) {
        console.log(
          chalk.dim(`  i ${nonImages.length} non-image file(s) in source-dir skipped: ${nonImages.join(', ')}`)
        );
      }
      if (opts.dryRun) {
        console.log(chalk.cyan(`\n  DRY RUN — no files will be modified.\n`));
      }
      console.log(chalk.bold(`  ${opts.slug}/${galleryName}`));
      if (nothingToDo) {
        console.log(chalk.green(`    already in sync — nothing to do (${sortedImages.length} image(s)).`));
      } else {
        printSummaryList('added', result.added);
        printSummaryList('updated', result.updated);
        printSummaryList('removed', result.removed);
      }
    }

    if (opts.dryRun) {
      if (opts.json) {
        const out: AddGalleryJsonResult = {
          ok: true,
          slug: opts.slug,
          gallery: galleryName,
          added: result.added,
          updated: result.updated,
          removed: result.removed,
          dryRun: true,
        };
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      }
      return;
    }

    // Real run: regenerate the manifest so the operator never has a
    // "forgot to run `brand manifest`" gap. manifest.json lives as a sibling
    // of the logos dir (matching every other command's default), NOT inside
    // it — generateManifest's own scan would otherwise have to special-case
    // ignoring its own output file.
    const manifestPath = join(logosDir, '..', 'manifest.json');
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);

    if (!opts.json && !opts.quiet) {
      console.log(
        chalk.green(
          `\n  ✓ Gallery "${galleryName}" for ${opts.slug}: ${sortedImages.length} image(s). Manifest regenerated.\n`
        )
      );
    }

    if (opts.json) {
      const out: AddGalleryJsonResult = {
        ok: true,
        slug: opts.slug,
        gallery: galleryName,
        added: result.added,
        updated: result.updated,
        removed: result.removed,
        dryRun: false,
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    }
  } catch (err) {
    if (err instanceof OperatorError) {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            {
              ok: false,
              slug: opts.slug,
              gallery: galleryName,
              error: err.message,
            },
            null,
            2
          ) + '\n'
        );
      } else {
        console.error(chalk.red(`\n  ✗ ${err.message}\n`));
      }
      process.exit(2);
    }

    const e = err as NodeJS.ErrnoException;
    const message = e?.message ?? String(err);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            ok: false,
            slug: opts.slug,
            gallery: galleryName,
            error: message,
          },
          null,
          2
        ) + '\n'
      );
    } else {
      console.error(chalk.red(`\n  ✗ Unexpected error: ${message}\n`));
    }
    process.exit(3);
  }
}
