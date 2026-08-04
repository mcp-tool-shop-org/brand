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
import {
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  openSync,
  writeSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
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
// Shared with add-gallery.ts rather than re-implemented here so the two
// commands' path-safety rules cannot drift apart again (F-5cbd78ab): sync.ts
// previously had NO slug validation at all, unlike add-gallery.ts.
import { validateSlug } from './add-gallery.js';

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

/**
 * Per-README advisory lock closing the lost-update race where two
 * concurrent `brand sync` invocations targeting DIFFERENT galleries of the
 * SAME README (multi-gallery-per-slug is an explicitly supported,
 * separately-tested configuration — see the ambiguous-gallery tests in
 * sync.test.ts) each read the same pre-image, independently compute their
 * own gallery's update from that stale snapshot, and whichever writes
 * SECOND silently reverts the FIRST process's already-successful write —
 * both processes exit 0, neither prints a warning (F-38e339d9, proved
 * directly against these exact functions: readFileSync, findMarkerBlocks/
 * syncMarkerBlock, atomicWrite).
 *
 * Mechanism: an O_EXCL ("wx") file create is atomic at the OS level —
 * exactly one of two racing processes wins the create, the other gets
 * EEXIST. The winner's lock file records its pid and acquisition time so a
 * later process can tell a genuinely abandoned lock (holder crashed, or
 * outlived any plausible sync duration) from one still legitimately held,
 * and self-heal instead of wedging forever on a stale lock.
 *
 * On genuine (live, fresh) contention this FAILS LOUDLY via fail() (exit
 * 2) rather than blocking/retrying or silently proceeding unlocked — a
 * one-shot CLI command has no good reason to sit in a busy-wait, and a
 * clear "try again" error is a better contract than either hazard.
 *
 * Deliberately NOT shared with migrate.ts's own journal lock, even though
 * the shape is similar — kept independent per file-ownership boundaries,
 * the same rule atomicWrite's own doc comment above already follows.
 */
const SYNC_LOCK_STALE_MS = 30_000; // generous vs. a single README's read+compute+write cost

function syncLockPath(readmePath: string): string {
  return `${readmePath}.brand-sync-lock`;
}

function readSyncLockInfo(lockPath: string): { pid: number; ts: number } | null {
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

/**
 * Best-effort liveness check. Signal 0 sends nothing but still reports
 * ESRCH ("no such process") vs. success/EPERM — supported cross-platform
 * by Node. Any error OTHER than EPERM (e.g. ESRCH, or an out-of-range pid
 * rejected before a signal is even attempted) is treated as "not alive",
 * so a corrupt/bogus pid in the lock file defaults to being reclaimable
 * rather than permanently protected.
 */
function isSyncLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return e.code === 'EPERM';
  }
}

/**
 * Acquire the per-README sync lock. Returns the lock path on success.
 * Self-heals a stale lock (dead pid, or older than SYNC_LOCK_STALE_MS) by
 * removing it and retrying once. On genuine contention, calls fail() —
 * which never returns, matching this module's exit-code contract.
 */
function acquireSyncLock(readmePath: string, opts: SyncOptions): string {
  const lockPath = syncLockPath(readmePath);

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

      const info = readSyncLockInfo(lockPath);
      const stale =
        info === null || !isSyncLockHolderAlive(info.pid) || Date.now() - info.ts > SYNC_LOCK_STALE_MS;

      if (stale && attempt === 0) {
        try {
          unlinkSync(lockPath);
        } catch {
          /* another process may have already cleared it — loop and retry the create */
        }
        continue;
      }

      return fail(
        opts,
        `Another 'brand sync' process (pid ${info?.pid ?? 'unknown'}) appears to be syncing ${readmePath} right now ` +
          `(lock: ${lockPath}). Refusing to proceed to avoid a lost-update race — retry once it finishes. ` +
          `If it is confirmed dead, delete the lock file manually.`,
        2,
        'sync-locked',
      );
    }
  }
  // Unreachable in practice — the loop above always either returns or
  // calls fail() (which never returns). Kept for type-safety: fail()'s
  // `never` return type isn't visible to control-flow analysis across
  // this for-loop's boundary.
  throw new Error('unreachable');
}

function releaseSyncLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    /* best-effort — already gone (e.g. reclaimed as stale elsewhere), or never created */
  }
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

  // --- Step 0: validate the slug BEFORE it is ever joined into a path. ---
  // Without this, `join(opts.repos, slug, 'README.md')` below would accept a
  // slug like "../../outside" and `join()` would normalize the ".." segments
  // right past the --repos root, writing a README entirely outside the
  // operator's intended tree (F-5cbd78ab / F-002).
  try {
    validateSlug(slug);
  } catch (err) {
    return fail(opts, (err as Error).message, 2, 'invalid-slug');
  }

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

  // --- Lock acquisition (F-38e339d9) — see acquireSyncLock's doc comment
  // above for the race this closes. Held for the ENTIRE remainder of this
  // function (Steps 3-7: read, locate marker, compute, write) since that
  // whole span is the read-modify-write cycle that must not interleave
  // across processes.
  const lockPath = acquireSyncLock(readmePath, opts);
  const releaseSyncLockOnProcessExit = () => releaseSyncLock(lockPath);
  // Backstop for the fail()/emitJson/process.exit(1) calls below that call
  // a REAL process.exit(): unlike a thrown error, process.exit() does not
  // run pending `finally` blocks on its way out, so the try/finally alone
  // would leak the lock in production whenever an operator-error or drift
  // exit is hit after this point. The 'exit' event is Node's documented
  // hook that DOES fire even through explicit process.exit() calls.
  process.on('exit', releaseSyncLockOnProcessExit);

  try {
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
  } finally {
    process.removeListener('exit', releaseSyncLockOnProcessExit);
    releaseSyncLock(lockPath);
  }
}
