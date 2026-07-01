/**
 * brand sync — regenerate a consuming repo's README gallery marker block
 * from the manifest.
 *
 *   brand sync --repos <path> --slug <slug> [--gallery <name>] [--check]
 *              [--logos <path>] [--brand-base <url>] [--json]
 *
 * This command is a PURE function of the local manifest.json + the local
 * README.md for the target slug. No network calls — deliberately. The
 * generated block content is fully deterministic (see marker-parser.ts):
 * regenerating with unchanged inputs produces byte-identical output.
 *
 * Exit codes (same contract as the rest of the CLI):
 *   0 — success (synced, or --check found no drift)
 *   1 — drift detected (--check mode only)
 *   2 — operator error (missing README, missing marker, ambiguous gallery, bad flag)
 *   3 — unexpected IO error
 */

import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import {
  readManifest,
  getGalleryFolders,
  ManifestIOError,
  ManifestParseError,
} from '../manifest.js';
import {
  findMarkerBlocks,
  syncMarkerBlock,
  renderGalleryBlock,
  MarkerParseError,
  type GalleryImageRef,
} from '../utils/marker-parser.js';

export interface SyncOptions {
  repos: string;
  slug: string;
  gallery?: string;
  check?: boolean;
  logos: string;
  manifest: string;
  brandBase: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface SyncJsonResult {
  ok: boolean;
  slug: string;
  gallery: string | null;
  error?: string;
  message?: string;
  drift?: boolean;
  updated?: boolean;
  imageCount?: number;
  added?: string[];
  removed?: string[];
}

/**
 * Atomic write: stage the new content at <path>.brand-tmp then rename onto
 * the target. On the same volume this is atomic. Mirrors the technique in
 * src/commands/migrate.ts (not imported — kept independent per file-
 * ownership boundaries).
 */
function atomicWrite(targetPath: string, content: string): void {
  const tmp = `${targetPath}.brand-tmp`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, targetPath);
}

/** Extract the filenames currently rendered as <img src="..."> inside a block's inner content. */
function extractFilenames(inner: string): Set<string> {
  const names = new Set<string>();
  const re = /<img\s[^>]*?src\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const src = m[1];
    if (!src) continue;
    const parts = src.split('/');
    const filename = parts[parts.length - 1];
    if (filename) names.add(filename);
  }
  return names;
}

function emitJson(opts: SyncOptions, result: SyncJsonResult, exitCode: number): void {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (exitCode !== 0) process.exit(exitCode);
}

function fail(opts: SyncOptions, message: string, exitCode: number, error: string): never {
  if (opts.json) {
    emitJson(opts, { ok: false, slug: opts.slug, gallery: opts.gallery ?? null, error, message }, exitCode);
    // emitJson calls process.exit for non-zero codes, but TS doesn't know
    // that's unconditional here — throw is unreachable but keeps types happy.
    throw new Error('unreachable');
  }
  console.error(chalk.red(`  ✗ ${message}`));
  process.exit(exitCode);
}

export async function runSync(opts: SyncOptions): Promise<void> {
  const { slug } = opts;

  // --- Step 1: read manifest, resolve gallery folder ---
  let manifest;
  try {
    manifest = readManifest(opts.manifest);
  } catch (err) {
    if (err instanceof ManifestIOError) {
      const exitCode = err.code === 'ENOENT' ? 2 : 3;
      return fail(opts, err.message, exitCode, 'manifest-io');
    }
    if (err instanceof ManifestParseError) {
      return fail(opts, err.message, 2, 'manifest-parse');
    }
    return fail(opts, (err as Error).message, 3, 'unexpected');
  }

  let gallery = opts.gallery;
  if (!gallery) {
    const folders = getGalleryFolders(slug, opts.logos);
    if (folders.length === 0) {
      return fail(
        opts,
        `Slug "${slug}" has no gallery subfolder under ${opts.logos}. Nothing to sync.`,
        2,
        'no-gallery-folder',
      );
    }
    if (folders.length > 1) {
      return fail(
        opts,
        `Slug "${slug}" has ${folders.length} gallery subfolders (${folders.join(', ')}) — ` +
          `pass --gallery <name> to disambiguate.`,
        2,
        'ambiguous-gallery',
      );
    }
    gallery = folders[0];
  }

  // --- Step 2: build ordered image list from manifest entries ---
  const prefix = `logos/${slug}/${gallery}/`;
  const images: GalleryImageRef[] = [];
  for (const [key, entry] of Object.entries(manifest.assets)) {
    if (entry.role !== 'gallery' || entry.gallery !== gallery) continue;
    if (!key.startsWith(prefix)) continue;
    const filename = key.slice(prefix.length);
    if (filename.includes('/')) continue; // defensive: only direct children
    const url = `${opts.brandBase}/${slug}/${gallery}/${filename}`;
    const alt = filename.replace(/\.[^.]+$/, '');
    images.push({ url, alt });
  }

  if (images.length === 0) {
    return fail(
      opts,
      `No gallery images found in manifest for slug="${slug}" gallery="${gallery}".`,
      2,
      'no-gallery-images',
    );
  }

  const renderedBlock = renderGalleryBlock(images);

  // --- Step 3: read the target README ---
  const readmePath = join(opts.repos, slug, 'README.md');
  if (!existsSync(readmePath)) {
    return fail(opts, `README not found: ${readmePath}`, 2, 'no-readme');
  }

  let content: string;
  try {
    content = readFileSync(readmePath, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return fail(opts, `Failed to read ${readmePath}: ${e.message}`, 3, 'read-failed');
  }

  // --- Step 4: locate the matching marker block ---
  let blocks;
  try {
    blocks = findMarkerBlocks(content);
  } catch (err) {
    if (err instanceof MarkerParseError) {
      return fail(opts, `${readmePath}: ${err.message}`, 2, `marker-${err.reason}`);
    }
    return fail(opts, (err as Error).message, 3, 'unexpected');
  }

  const match = blocks.find((b) => b.slug === slug && (b.gallery ?? undefined) === (gallery ?? undefined));
  if (!match) {
    const galleryAttr = gallery ? ` gallery="${gallery}"` : '';
    return fail(
      opts,
      `No brand:gallery marker block found for slug="${slug}"${gallery ? ` gallery="${gallery}"` : ''} in ${readmePath}.\n` +
        `    Add this to the README where the gallery should render:\n` +
        `      <!-- brand:gallery:start slug="${slug}"${galleryAttr} -->\n` +
        `      <!-- brand:gallery:end -->`,
      2,
      'no-marker-block',
    );
  }

  // --- Step 5: compute synced content ---
  let syncedContent: string;
  try {
    syncedContent = syncMarkerBlock(content, slug, gallery, renderedBlock);
  } catch (err) {
    if (err instanceof MarkerParseError) {
      return fail(opts, `${readmePath}: ${err.message}`, 2, `marker-${err.reason}`);
    }
    return fail(opts, (err as Error).message, 3, 'unexpected');
  }

  const drift = syncedContent !== content;

  // Filename-level diff for a readable summary, derived cheaply from the
  // existing vs. new inner-content <img> src filenames.
  const beforeFilenames = extractFilenames(match.innerContent);
  const afterFilenames = new Set(images.map((img) => img.url.split('/').pop() ?? img.url));
  const added = [...afterFilenames].filter((f) => !beforeFilenames.has(f)).sort();
  const removed = [...beforeFilenames].filter((f) => !afterFilenames.has(f)).sort();

  // --- Step 6/7: --check vs write ---
  if (opts.check) {
    if (opts.json) {
      emitJson(
        opts,
        {
          ok: !drift,
          slug,
          gallery: gallery ?? null,
          drift,
          imageCount: images.length,
          added,
          removed,
        },
        drift ? 1 : 0,
      );
      return;
    }

    if (!drift) {
      console.log(chalk.green(`\n  ✓ ${slug}${gallery ? `/${gallery}` : ''} — README gallery is in sync (${images.length} images).\n`));
      return;
    }

    console.log(chalk.yellow(`\n  Drift detected in ${readmePath}:`));
    console.log(`    ${images.length} image(s) in manifest, ${beforeFilenames.size} currently in README.`);
    if (added.length > 0) {
      console.log(chalk.green(`    + added:   ${added.join(', ')}`));
    }
    if (removed.length > 0) {
      console.log(chalk.red(`    - removed: ${removed.join(', ')}`));
    }
    if (added.length === 0 && removed.length === 0) {
      console.log(chalk.dim('    (same filenames, but rendered markup differs — run without --check to resync)'));
    }
    console.log('');
    process.exit(1);
    return;
  }

  // Default: write mode.
  if (!drift) {
    if (opts.json) {
      emitJson(opts, { ok: true, slug, gallery: gallery ?? null, updated: false, imageCount: images.length, added: [], removed: [] }, 0);
      return;
    }
    console.log(chalk.green(`\n  ✓ ${slug}${gallery ? `/${gallery}` : ''} — already in sync (${images.length} images).\n`));
    return;
  }

  try {
    atomicWrite(readmePath, syncedContent);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return fail(opts, `Failed to write ${readmePath}: ${e.message}`, 3, 'write-failed');
  }

  if (opts.json) {
    emitJson(opts, { ok: true, slug, gallery: gallery ?? null, updated: true, imageCount: images.length, added, removed }, 0);
    return;
  }

  console.log(chalk.green(`\n  ✓ ${slug}${gallery ? `/${gallery}` : ''} — README gallery synced (${images.length} images).`));
  if (added.length > 0) console.log(chalk.green(`    + added:   ${added.join(', ')}`));
  if (removed.length > 0) console.log(chalk.red(`    - removed: ${removed.join(', ')}`));
  console.log('');
}
