/**
 * brand remove — permanently remove a slug's logo directory, or one gallery
 * within it, with the safety primitives add-gallery.ts already has.
 *
 *   brand remove <slug> [--gallery <name>] [--dry-run] [--yes] [--logos <path>] [--json]
 *
 * Before this command existed, removing a slug or a gallery meant a
 * hand-run `rm -rf` plus a remembered `brand manifest` — no dry-run, no
 * confirmation, no automatic manifest regeneration, and no protection
 * against a fat-fingered slug. Removal is the highest-stakes operation this
 * tool offers (it destroys the only copy of an asset), so it gets the
 * heaviest guardrails here, not the lightest:
 *
 *   - `validateSlug` (imported from add-gallery.ts, shared with sync.ts too)
 *     runs before the slug is ever joined into a path — closes the same
 *     `--slug ../..` traversal class sync.ts used to be vulnerable to
 *     (F-5cbd78ab). A local, independent `validateGalleryName` (same char
 *     class, deliberately NOT imported — add-gallery.ts's own copy is
 *     private, and this codebase's convention is that each command file
 *     owns its own small path-safety helpers rather than sharing them
 *     across command boundaries; see atomicWrite's doc comment in
 *     sync.ts/migrate.ts for the same rule applied elsewhere) does the same
 *     for `--gallery`.
 *   - `--dry-run` is a REAL dry run: it computes and prints exactly what
 *     would be deleted (every file's relative path + size, plus totals) and
 *     returns before touching disk at all. The wave-2 audit of this repo
 *     found `migrate --dry-run --resume` performing real writes despite its
 *     name — this command's own tests assert byte-for-byte-unchanged disk
 *     state (content AND mtime) after a dry run, not just "no error was
 *     thrown".
 *   - A REAL (non-dry-run) removal additionally requires `--yes`. There is
 *     no TTY prompt infrastructure in this codebase, and building one is out
 *     of scope for a single command — `--yes` is the confirmation primitive
 *     instead. Refusing without it reports exactly how many files (and
 *     bytes) would be destroyed, plus the exact command to re-run.
 *   - The delete itself is swap-based, the same spirit as add-gallery.ts's
 *     staging+backup swap: the target is renamed to a reserved sibling
 *     first (never deleted outright), the manifest is regenerated from the
 *     now-clean tree, and ONLY on success is the renamed-away sibling
 *     actually removed. If manifest regeneration throws, the rename is
 *     reversed and the operator sees a clean exit-3 failure instead of a
 *     half-deleted tree paired with a stale manifest.
 *   - The reserved sibling reuses add-gallery.ts's own `backupDirFor` helper
 *     (`.brand-backup-<name>-<pid>-<timestamp>`) rather than inventing a new
 *     `.brand-removed-*` prefix. This wave's spec flagged that a brand-new
 *     prefix would NOT be covered by manifest.ts's GALLERY_SCRATCH_DIR_PATTERNS
 *     denylist (manifest.ts is outside this domain's owned globs) and
 *     offered a choice: follow the existing naming, or route a denylist
 *     addition to the coordinator. Reusing `.brand-backup-` gets BOTH of
 *     manifest.ts's defenses for free, today, with zero dependency on a
 *     manifest.ts change landing this wave:
 *       (1) dot-prefix — glob's default `dot:false` already hides it from
 *           every directory scan. This is the ONLY defense that matters for
 *           a whole-slug removal: generateManifest's top-level `slugDirs`
 *           scan never consults GALLERY_SCRATCH_DIR_PATTERNS at all, only
 *           the dot-prefix-driven glob default.
 *       (2) the explicit regex match — relevant for a gallery-scoped
 *           removal, where the reserved sibling sits inside a slug
 *           directory alongside real galleries and is filtered by
 *           getGalleryFolders's isGalleryScratchDir check (defense in depth
 *           for a hypothetical future `dot:true` glob config change).
 *
 * Exit codes (same contract as the rest of the CLI, extended with 1 for
 * this command's two "did not remove anything, but that's not a bug"
 * cases):
 *   0 — removed successfully (or a dry-run preview of a non-empty removal)
 *   1 — nothing to do (the named --gallery does not exist under an
 *       otherwise-valid slug, or the removal target has zero files) OR
 *       refused (missing --yes on a real run) — both are "look again", not
 *       "the tool is broken" or "you typed something invalid"
 *   2 — operator error (invalid slug/gallery segment, --logos not found,
 *       slug not found at all)
 *   3 — unexpected error (IO failure, manifest regeneration failure)
 */

import chalk from 'chalk';
import { existsSync, readdirSync, lstatSync, renameSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { generateManifest, writeManifest, getGalleryFolders } from '../manifest.js';
import { validateSlug, backupDirFor } from './add-gallery.js';

export interface RemoveOptions {
  slug: string;
  gallery?: string;
  dryRun?: boolean;
  yes?: boolean;
  logos?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface RemoveJsonResult {
  ok: boolean;
  slug: string;
  gallery: string | null;
  dryRun: boolean;
  error?: string;
  message?: string;
  removed?: string[];
  fileCount?: number;
  totalBytes?: number;
  nearMatches?: string[];
}

interface FileEntry {
  relPath: string;
  size: number;
}

/**
 * Carries the exit code + machine-readable error code up to the single
 * centralized catch in runRemove — mirrors add-gallery.ts's own
 * OperatorError-plus-single-catch shape, generalized to carry the exit code
 * too (add-gallery.ts only ever needs exit 2 for its own OperatorError;
 * this command also needs exit 1 for the nothing-to-do/refused cases).
 */
class RemoveError extends Error {
  readonly exitCode: number;
  readonly code: string;
  readonly extra: Partial<RemoveJsonResult>;
  constructor(message: string, exitCode: number, code: string, extra: Partial<RemoveJsonResult> = {}) {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
    this.extra = extra;
  }
}

function refuse(message: string, exitCode: number, code: string, extra?: Partial<RemoveJsonResult>): never {
  throw new RemoveError(message, exitCode, code, extra);
}

// Same char class as add-gallery.ts's own INVALID_SEGMENT_CHARS (see that
// file's comment for the full rationale — a bare ":" alone is a plausible
// fat-finger, e.g. pasting a Windows path fragment, that crashes an
// unguarded fs call with a raw OS error instead of a clean operator error).
// Kept as an independent copy rather than an import: add-gallery.ts's own
// validateGalleryName is private (unexported) by design, and this
// codebase's convention is that each command file owns its own small
// path-safety helpers independently (see e.g. atomicWrite's doc comment in
// sync.ts/migrate.ts for the same rule applied to a different helper).
const INVALID_SEGMENT_CHARS = /[/\\:*?"<>|]/;

function validateGalleryName(name: string): void {
  if (!name || name.trim().length === 0) {
    refuse('--gallery must be a non-empty string.', 2, 'invalid-gallery');
  }
  if (INVALID_SEGMENT_CHARS.test(name) || name.includes('..') || name === '.') {
    refuse(
      `--gallery "${name}" is not a valid path segment (no /, \\, :, *, ?, ", <, >, |, or ..).`,
      2,
      'invalid-gallery',
    );
  }
}

/**
 * Iterative single-row Levenshtein edit distance — no dependency needed for
 * one small "did you mean" helper.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row: number[] = [];
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0] ?? 0; // dp[i-1][0]
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j] ?? 0; // dp[i-1][j], captured before this cell is overwritten
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (row[j] ?? 0) + 1, // deletion: dp[i-1][j] + 1
        (row[j - 1] ?? 0) + 1, // insertion: dp[i][j-1] + 1
        prevDiag + cost, // substitution: dp[i-1][j-1] + cost
      );
      prevDiag = temp;
    }
  }
  return row[n] ?? 0;
}

/**
 * Existing slug directory names under logosDir that are plausibly a typo of
 * `slug` (small Levenshtein distance), for a "did you mean" hint on a
 * not-found error. Dot-prefixed entries are excluded so a stray
 * `.brand-backup-*`/`.brand-staging-*` scratch sibling (see add-gallery.ts,
 * and this file's own use of backupDirFor below) is never suggested as if
 * it were a real slug. Best-effort: any read failure here yields an empty
 * list rather than compounding the "not found" error already being
 * reported with a second one.
 */
function findNearMatches(slug: string, logosDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(logosDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch {
    return [];
  }
  const threshold = Math.max(1, Math.min(3, Math.ceil(slug.length / 2)));
  return entries
    .map(name => ({ name, dist: levenshtein(slug, name) }))
    .filter(e => e.dist > 0 && e.dist <= threshold)
    .sort((a, b) => a.dist - b.dist || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map(e => e.name);
}

/**
 * Recursively list every file under `dir` (relative to `baseDir`), with
 * size. Unlike manifest.ts's generateManifest — a BOUNDED, two-level,
 * image-extension-only scan — this must find EVERY byte a real removal
 * would destroy, so a stray non-image file or a third nesting level is
 * never silently left behind and --dry-run's reported total is always the
 * complete truth. A symlink is treated as a leaf (its OWN lstat size is
 * used, never a followed target's), matching rmSync's own recursive
 * removal semantics (it un-links a symlink rather than deleting through
 * it) — so neither counting nor deleting ever traverses outside `dir`
 * through a symlink.
 */
function walkFiles(dir: string, baseDir: string): FileEntry[] {
  const out: FileEntry[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue; // vanished between readdir and lstat — best-effort, not counted
    }
    if (st.isDirectory()) {
      out.push(...walkFiles(full, baseDir));
    } else {
      out.push({ relPath: relative(baseDir, full).split(sep).join('/'), size: st.size });
    }
  }
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Reconstruct the exact command to re-run past the confirmation gate, shown
 * verbatim in the refusal message so there is never a guessing game about
 * which flags survive. Carries forward the significant options this
 * invocation actually used (gallery scope, a non-default --logos) plus
 * --yes appended.
 */
function buildReRunCommand(opts: RemoveOptions): string {
  const parts = ['brand', 'remove', opts.slug];
  if (opts.gallery) parts.push('--gallery', opts.gallery);
  if (opts.logos && opts.logos !== 'logos') parts.push('--logos', opts.logos);
  parts.push('--yes');
  return parts.join(' ');
}

function printFileList(files: FileEntry[]): void {
  const maxShown = 20;
  for (const f of files.slice(0, maxShown)) {
    console.log(chalk.dim(`      - ${f.relPath} (${formatBytes(f.size)})`));
  }
  if (files.length > maxShown) {
    console.log(chalk.dim(`      ... and ${files.length - maxShown} more`));
  }
}

export async function runRemove(opts: RemoveOptions): Promise<void> {
  const logosDir = opts.logos ?? 'logos';
  const gallery = opts.gallery ?? null;

  try {
    // --- Step 0: validate BEFORE any path join (F-5cbd78ab class of bug). ---
    try {
      validateSlug(opts.slug);
    } catch (err) {
      refuse((err as Error).message, 2, 'invalid-slug');
    }
    if (gallery !== null) {
      validateGalleryName(gallery);
    }

    if (!existsSync(logosDir)) {
      refuse(
        `logos directory not found: ${logosDir} — pass --logos <path> or run from the brand repo root.`,
        2,
        'logos-dir-not-found',
      );
    }

    const slugDir = join(logosDir, opts.slug);
    if (!existsSync(slugDir)) {
      const nearMatches = findNearMatches(opts.slug, logosDir);
      const hint = nearMatches.length > 0 ? ` Did you mean: ${nearMatches.join(', ')}?` : '';
      refuse(`Slug "${opts.slug}" not found under ${logosDir}.${hint}`, 2, 'slug-not-found', { nearMatches });
    }

    // Refuse to operate through a symlink/junction at the slug level. This
    // command renames-away and (eventually) recursively deletes its target,
    // so a symlinked "slug" pointing outside logos/ must never be silently
    // walked — the same posture manifest.ts documents for its own scans
    // (isContained/warnEscaped), applied here to the delete path instead.
    let slugSt;
    try {
      slugSt = lstatSync(slugDir);
    } catch {
      /* already confirmed existsSync above; a race here falls through safely below */
    }
    if (slugSt?.isSymbolicLink()) {
      refuse(
        `Slug "${opts.slug}" resolves to a symlink/junction (${slugDir}) — refusing to remove through a symlink.`,
        2,
        'symlink-refused',
      );
    }

    const targetDir = gallery !== null ? join(slugDir, gallery) : slugDir;
    const scopeLabel = gallery !== null ? `${opts.slug}/${gallery}` : opts.slug;

    if (gallery !== null && !existsSync(targetDir)) {
      const available = getGalleryFolders(opts.slug, logosDir);
      const hint =
        available.length > 0
          ? ` Existing gallery folder(s) for this slug: ${available.join(', ')}.`
          : ` This slug has no gallery subfolders.`;
      refuse(
        `Gallery "${gallery}" not found for slug "${opts.slug}" under ${slugDir}.${hint} Nothing to remove.`,
        1,
        'nothing-to-do',
      );
    }

    if (gallery !== null) {
      let gallerySt;
      try {
        gallerySt = lstatSync(targetDir);
      } catch {
        /* already confirmed existsSync above */
      }
      if (gallerySt?.isSymbolicLink()) {
        refuse(
          `Gallery "${gallery}" resolves to a symlink/junction (${targetDir}) — refusing to remove through a symlink.`,
          2,
          'symlink-refused',
        );
      }
    }

    const files = walkFiles(targetDir, targetDir);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    if (files.length === 0) {
      refuse(
        `${gallery !== null ? `Gallery "${gallery}"` : `Slug "${opts.slug}"`} has no files under ${targetDir}. Nothing to remove.`,
        1,
        'nothing-to-do',
      );
    }

    // --- Dry run: report the plan, touch nothing. Returns BEFORE any fs
    // mutation — see this file's header comment re: the wave-2
    // `migrate --dry-run --resume` audit finding this suite is deliberately
    // paranoid about (byte-for-byte-unchanged assertions, not just "no
    // throw"). ---
    if (opts.dryRun) {
      if (!opts.json && !opts.quiet) {
        console.log(chalk.cyan(`\n  DRY RUN — no files will be modified.\n`));
        console.log(chalk.bold(`  Would remove ${scopeLabel} — ${files.length} file(s), ${formatBytes(totalBytes)}:`));
        printFileList(files);
        console.log('');
      }
      if (opts.json) {
        const out: RemoveJsonResult = {
          ok: true,
          slug: opts.slug,
          gallery,
          dryRun: true,
          removed: files.map(f => f.relPath),
          fileCount: files.length,
          totalBytes,
        };
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      }
      return;
    }

    // --- Confirmation gate: a real removal requires --yes. ---
    if (!opts.yes) {
      refuse(
        `Refusing to remove ${scopeLabel} without confirmation — this would permanently destroy ${files.length} ` +
          `file(s) (${formatBytes(totalBytes)}). Re-run with --yes to proceed:\n    ${buildReRunCommand(opts)}`,
        1,
        'confirmation-required',
        { fileCount: files.length, totalBytes },
      );
    }

    // --- Real removal: rename-away, regenerate manifest, delete-or-restore.
    // Reuses add-gallery.ts's own backupDirFor helper — see this file's
    // header comment for why that's deliberate (gets both of manifest.ts's
    // invisibility mechanisms for free, with no manifest.ts change needed
    // this wave). ---
    const manifestPath = join(logosDir, '..', 'manifest.json');
    const backupDir = backupDirFor(targetDir);

    renameSync(targetDir, backupDir);

    try {
      const manifest = generateManifest(logosDir);
      writeManifest(manifest, manifestPath);
    } catch (err) {
      // Report what actually happened, not what was attempted. The restore is
      // best-effort, and on the double-failure path (regeneration threw AND the
      // rename back threw) the content survives under backupDir's name rather
      // than vanishing — but an operator told "the original content has been
      // restored" would go look for it where it is not. On the one path where
      // someone most needs the truth about their data, do not assert an outcome
      // that was never checked.
      let restored = false;
      try {
        renameSync(backupDir, targetDir);
        restored = true;
      } catch {
        /* fall through — reported honestly below, with the path to recover from */
      }
      const e = err as Error;
      refuse(
        restored
          ? `Manifest regeneration failed after removing ${scopeLabel} — the original content has been restored. ${e.message}`
          : `Manifest regeneration failed after removing ${scopeLabel}, and restoring the original ALSO failed. ` +
            `Nothing was lost: the content is intact at ${backupDir} — rename it back to ${targetDir} to recover. ${e.message}`,
        3,
        'manifest-regenerate-failed',
      );
    }

    try {
      rmSync(backupDir, { recursive: true, force: true });
    } catch {
      // Best-effort final cleanup. A leftover here is named via
      // add-gallery.ts's own reserved convention — dot-prefixed AND
      // matching manifest.ts's GALLERY_SCRATCH_DIR_PATTERNS — so it is
      // invisible to every manifest scan either way; it cannot corrupt
      // state, only sit as inert clutter until reclaimed (e.g. by a later
      // add-gallery run against the same target, which self-heals it via
      // its own cleanupStaleSiblings).
    }

    if (!opts.json && !opts.quiet) {
      console.log(
        chalk.green(
          `\n  ✓ Removed ${scopeLabel}: ${files.length} file(s), ${formatBytes(totalBytes)}. Manifest regenerated.\n`,
        ),
      );
    }

    if (opts.json) {
      const out: RemoveJsonResult = {
        ok: true,
        slug: opts.slug,
        gallery,
        dryRun: false,
        removed: files.map(f => f.relPath),
        fileCount: files.length,
        totalBytes,
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    }
  } catch (err) {
    if (err instanceof RemoveError) {
      if (opts.json) {
        const out: RemoveJsonResult = {
          ok: false,
          slug: opts.slug,
          gallery,
          dryRun: Boolean(opts.dryRun),
          error: err.code,
          message: err.message,
          ...err.extra,
        };
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${err.message}\n`));
      }
      process.exit(err.exitCode);
    }

    const e = err as NodeJS.ErrnoException;
    const message = e?.message ?? String(err);
    if (opts.json) {
      const out: RemoveJsonResult = {
        ok: false,
        slug: opts.slug,
        gallery,
        dryRun: Boolean(opts.dryRun),
        error: 'unexpected',
        message,
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } else {
      console.error(chalk.red(`\n  ✗ Unexpected error: ${message}\n`));
    }
    process.exit(3);
  }
}
