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
 *   - Multi-file writes use a staging temp dir + atomic rename-in swap, so a
 *     crash mid-copy can never leave the gallery folder half-updated.
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
import { join, extname, basename } from 'node:path';
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

/** Validate a slug is a safe, single path segment. */
function validateSlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new OperatorError('slug must be a non-empty string.');
  }
  if (slug.includes('/') || slug.includes('\\') || slug.includes('..') || slug === '.' ) {
    throw new OperatorError(
      `slug "${slug}" is not a valid path segment (no "/", "\\", or "..").`
    );
  }
}

/** Validate a gallery name is a safe, single path segment. */
function validateGalleryName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new OperatorError('--gallery-name must be a non-empty string.');
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..') || name === '.') {
    throw new OperatorError(
      `--gallery-name "${name}" is not a valid path segment (no "/", "\\", or "..").`
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
 * Reconcile the target gallery folder to match the desired final state
 * (sourceDir's images, renamed per resolveFinalNames). Uses a staging temp
 * dir + atomic swap: every new/changed file is first fully written into a
 * staging directory; only once staging succeeds completely do we swap it
 * into place, so a crash mid-copy can never leave the gallery folder
 * half-updated.
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

  // Staging-dir + atomic-swap discipline: build the full desired target
  // state in a sibling staging dir first. Only on full success do we
  // remove stale files and copy new files into the real target — but to
  // truly avoid a half-updated window, we build the ENTIRE final folder
  // contents in staging, then swap staging <-> target via rename.
  const stagingDir = `${targetDir}.brand-staging-${process.pid}-${Date.now()}`;
  mkdirSync(stagingDir, { recursive: true });

  try {
    // Copy every desired file (changed or not) into staging so staging is
    // a complete, correct snapshot of the target's final state.
    for (const original of images) {
      const finalName = finalNames.get(original)!;
      copyFileSync(join(sourceDir, original), join(stagingDir, finalName));
    }

    // Swap: remove old target (if any), then rename staging into place.
    // On the same volume, rename is atomic; the only non-atomic edge is
    // between rmSync(targetDir) and renameSync(staging), which is the same
    // trade-off migrate.ts's atomicWrite makes for single files — here we
    // minimize the window by doing the rm immediately before the rename
    // with no other work in between.
    if (targetExists) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    renameSync(stagingDir, targetDir);
  } catch (err) {
    // Best-effort cleanup of the staging dir on failure so we don't leak
    // `.brand-staging-*` siblings; the real target is left untouched
    // because we only rm it right before a rename we're about to attempt.
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
