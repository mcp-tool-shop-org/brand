/**
 * manifest.ts — SHA-256 integrity manifest for brand assets.
 *
 * The manifest is the trust foundation. It maps every logo file to its
 * SHA-256 hash so you can verify nothing has been tampered with.
 */

import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  renameSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { join, relative, extname, isAbsolute, sep } from 'node:path';
import { globSync } from 'glob';

/**
 * Asset role — "primary" is the one canonical logo (readme.<ext> at the slug
 * root); "gallery" is any image inside a direct subfolder of the slug (e.g.
 * logos/<slug>/turnarounds/*.png). Optional on read so a manifest generated
 * before this field existed still parses; always populated on generate.
 */
export type AssetRole = 'primary' | 'gallery';

export interface AssetEntry {
  hash: string;
  size: number;
  format: string;
  role?: AssetRole;
  /** Present only when role === "gallery" — the direct subfolder name (e.g. "turnarounds"). */
  gallery?: string;
}

export interface Manifest {
  version: string;
  generated: string;
  algorithm: string;
  assets: Record<string, AssetEntry>;
}

export interface VerifyResult {
  verified: string[];
  changed: string[];
  added: string[];
  removed: string[];
  ok: boolean;
}

/**
 * SUPPORTED_FORMATS — single source of truth for image format support.
 *
 * Order matters: findLogoFile probes extensions in this order and returns
 * the first hit. Add new formats here ONLY; FORMAT_MAP, IMAGE_EXTENSIONS,
 * IMAGE_EXTENSION_ORDER, and the stats glob are all derived from this.
 */
export interface SupportedFormat {
  /** Extension WITHOUT the leading dot (e.g. "png") */
  ext: string;
  /** MIME-style format identifier stored in the manifest (e.g. "jpeg" for both .jpg and .jpeg) */
  format: string;
}

export const SUPPORTED_FORMATS: readonly SupportedFormat[] = [
  { ext: 'png', format: 'png' },
  { ext: 'jpg', format: 'jpeg' },
  { ext: 'jpeg', format: 'jpeg' },
  { ext: 'svg', format: 'svg' },
  { ext: 'webp', format: 'webp' },
] as const;

/** Map of ".ext" → format identifier, derived from SUPPORTED_FORMATS. */
const FORMAT_MAP: Record<string, string> = Object.fromEntries(
  SUPPORTED_FORMATS.map(f => [`.${f.ext}`, f.format])
);

/** Image extensions allowed in the manifest (everything else is ignored). Derived from SUPPORTED_FORMATS. */
export const IMAGE_EXTENSIONS = new Set(SUPPORTED_FORMATS.map(f => `.${f.ext}`));

/** Ordered list of extensions (without dot) for probing existence by priority. Derived from SUPPORTED_FORMATS. */
export const IMAGE_EXTENSION_ORDER = SUPPORTED_FORMATS.map(f => f.ext);

/**
 * Build a brace-expansion glob pattern from SUPPORTED_FORMATS for tools
 * (like stats) that need to match a per-slug pattern such as
 * `<slug>/readme.{png,jpg,jpeg,svg,webp}`.
 */
export function getFormatGlob(prefix = '*/readme'): string {
  return `${prefix}.{${SUPPORTED_FORMATS.map(f => f.ext).join(',')}}`;
}

/**
 * Error type thrown by manifest IO operations when reading a specific asset fails.
 * Carries the offending path + Node error code so callers can surface a helpful message
 * and pick the right exit code (operator vs unexpected).
 */
export class ManifestIOError extends Error {
  readonly path: string;
  readonly code: string | undefined;
  constructor(message: string, path: string, code: string | undefined) {
    super(message);
    this.name = 'ManifestIOError';
    this.path = path;
    this.code = code;
  }
}

/**
 * Compute SHA-256 hash of a file, returned as "sha256:<hex>".
 *
 * Hashes RAW, unnormalized bytes for every format — deliberately, not by
 * oversight. The manifest's documented contract (README.md, docs/handbook.md)
 * is "the manifest hash IS the SHA-256 of the file", so an operator's
 * independent `sha256sum <file>` must always agree with what generateManifest
 * stores. Normalizing (e.g. line-ending conversion for a text-based format
 * like svg) would silently break that contract — the stored hash would be of
 * a normalized COPY, not the file — and would weaken tamper detection by
 * making two byte-different files hash identically. A CRLF/LF checkout
 * hazard for text-based logo assets is real, but it belongs at the git
 * layer (`.gitattributes`: `logos/**\/*.svg binary`, so git never applies EOL
 * conversion to a tracked logo SVG), which keeps the checked-out bytes
 * identical on every platform — the hasher never needs to paper over a
 * difference that git no longer allows to exist on disk. (An earlier version
 * of this function normalized svg content before hashing; that was reverted
 * for exactly this reason — see F-b017896c.)
 */
export function hashFile(filePath: string): string {
  try {
    const content = readFileSync(filePath);
    const hex = createHash('sha256').update(content).digest('hex');
    return `sha256:${hex}`;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new ManifestIOError(
      `Failed to hash ${filePath}: ${e.message}`,
      filePath,
      e.code
    );
  }
}

/** Detect image format from extension */
function detectFormat(filePath: string): string {
  return FORMAT_MAP[extname(filePath).toLowerCase()] ?? 'unknown';
}

/**
 * Symlink / path-escape containment guard.
 *
 * A prior version of this file relied on glob's `follow: false` to "never
 * follow symlinks" (see the historical comment that used to sit on
 * generateManifest). That claim was FALSE: `follow` only controls whether
 * `**` (globstar) patterns descend into symlinked directories — per the
 * glob package's own docs, "Follow symlinked directories when expanding `**`
 * patterns." It has zero effect on the plain single-segment wildcard
 * patterns (a bare `*`, or `*` with a trailing slash) used throughout this
 * file. A directory junction or a file-level symlink placed
 * under logosDir was silently walked and hashed regardless of
 * `follow: false`, because nothing here ever called lstatSync to notice the
 * symlink in the first place (confirmed against glob v11.1.0, installed
 * alongside the ^13.0.6 dependency range: a junction at `logos/<slug>`
 * pointing outside the tree was enumerated as a slug and its content hashed;
 * a file-level symlink at `logos/<slug>/readme.png` pointing at an external
 * file was silently followed by plain readFileSync).
 *
 * The actual defense, applied to every candidate slug dir, gallery folder,
 * and file below: (1) lstat the candidate and reject it if it IS a symlink
 * — this also catches NTFS junctions, which Node's fs.lstatSync reports via
 * isSymbolicLink() === true on Windows — and (2) resolve its REAL path and
 * verify that real path is still contained inside the resolved scan root.
 * Rule (2) is what actually holds even where (1) alone would not: it also
 * rejects an entry reached through a symlink one level up that wasn't
 * re-checked at every step.
 */

/** realpathSync that returns null instead of throwing (root may legitimately not exist, e.g. a fresh repo with no logos/ yet). */
function safeRealpath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * True if `entryPath` is NOT a symlink/junction itself AND its fully-resolved
 * real path is contained inside `rootRealPath` (the already-resolved real
 * path of the scan root). False ("unsafe") on any lstat/realpath failure, or
 * when rootRealPath itself could not be resolved — fails closed.
 */
function isContained(entryPath: string, rootRealPath: string | null): boolean {
  if (rootRealPath === null) return false;

  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(entryPath);
  } catch {
    return false;
  }
  if (st.isSymbolicLink()) return false;

  let real: string;
  try {
    real = realpathSync(entryPath);
  } catch {
    return false;
  }
  if (real === rootRealPath) return true;
  const rel = relative(rootRealPath, real);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Warn (stderr) that a candidate was excluded because it is a symlink/junction or escapes the scan root. */
function warnEscaped(entryPath: string): void {
  process.stderr.write(
    `warning: skipping "${entryPath}" — it is a symlink/junction, or resolves outside the logos directory. Symlinked content is never included in the manifest.\n`
  );
}

/**
 * Find the first existing logo file for a slug under baseDir.
 * Probes extensions in IMAGE_EXTENSION_ORDER and returns the first hit,
 * or null if none exist.
 *
 * Matches case-INsensitively against the REAL directory listing — mirroring
 * generateManifest's own `/^readme\./i` matcher against actual entries —
 * instead of guessing a hardcoded-lowercase `readme.<ext>` path via
 * existsSync. The old existsSync-based probe only "worked" for an
 * uppercase/mixed-case file (e.g. README.PNG) by accident, on a
 * case-insensitive filesystem (Windows/macOS). On a case-sensitive
 * filesystem (Linux — this repo's own CI runs ubuntu-latest), that same
 * existsSync(...,'readme.png') call returns false for a real README.PNG
 * even though generateManifest correctly tracks it in the manifest — the
 * two functions must agree on whether a logo "exists".
 */
export function findLogoFile(slug: string, baseDir: string): { path: string; ext: string } | null {
  const slugPath = join(baseDir, slug);
  if (!existsSync(slugPath)) return null;

  let entries: string[];
  try {
    entries = globSync('*', { cwd: slugPath, nodir: true, follow: false });
  } catch {
    return null;
  }

  const rootRealPath = safeRealpath(baseDir);
  for (const ext of IMAGE_EXTENSION_ORDER) {
    const re = new RegExp(`^readme\\.${ext}$`, 'i');
    const hit = entries.find(f => re.test(f));
    if (!hit) continue;

    const fullPath = join(slugPath, hit);
    // Same containment guard as generateManifest (see isContained's doc) —
    // a symlinked/junctioned "readme" must not be reported as a real asset.
    if (!isContained(fullPath, rootRealPath)) {
      warnEscaped(fullPath);
      continue;
    }
    return { path: fullPath, ext };
  }
  return null;
}

/**
 * List the direct subfolder names under a slug (existence-based, not
 * filtered by content). Used by add-gallery/sync to discover or disambiguate
 * gallery collections without re-deriving the glob logic in generateManifest.
 *
 * Each candidate subfolder is verified via isContained (lstat + realpath
 * containment against baseDir) before being reported — a symlinked/
 * junctioned "gallery" folder must not be treated as real, whether this is
 * called internally by generateManifest or externally (add-gallery, tests).
 */
export function getGalleryFolders(slug: string, baseDir: string): string[] {
  const slugPath = join(baseDir, slug);
  if (!existsSync(slugPath)) return [];
  const rootRealPath = safeRealpath(baseDir);
  return globSync('*/', { cwd: slugPath, follow: false })
    .map(d => d.replace(/\/$/, ''))
    .filter(sub => {
      const full = join(slugPath, sub);
      const safe = isContained(full, rootRealPath);
      if (!safe) warnEscaped(full);
      return safe;
    })
    .sort();
}

/**
 * Generate a manifest from a BOUNDED two-level scan of logosDir:
 *   <slug>/readme.<ext>          -> role "primary" (the one canonical logo)
 *   <slug>/<anyDir>/<file>.<ext> -> role "gallery", gallery: <anyDir> (files
 *                                   directly inside the subfolder; no deeper
 *                                   nesting is tracked)
 *
 * This replaces an earlier unscoped recursive `**\/*` glob across all of
 * logosDir. An unbounded recursive glob is a documented anti-pattern (Bazel's
 * own BUILD-file docs warn a bare wildcard "accidentally match[es]" content
 * nobody meant to include) and gave the manifest no way to distinguish "the
 * logo" from "a gallery of N supplementary images" — both were just anonymous
 * hash entries. The two-level bound plus the explicit `role` field make that
 * distinction structural instead of accidental, while still requiring zero
 * migration: every existing slug is either a bare readme.<ext> (primary) or
 * has at most one flat subfolder of extra images (gallery), so the new scan
 * produces identical file coverage to the old recursive one on current data.
 */
export function generateManifest(logosDir: string): Manifest {
  const logosRealPath = safeRealpath(logosDir);

  // Containment guard (see isContained's doc comment above): `follow: false`
  // does NOT stop this plain `*/` pattern from listing a symlinked/
  // junctioned slug directory, so every candidate is independently verified
  // via lstat + realpath containment before it is trusted as "inside
  // logos/". This is the actual symlink defense for this function — not the
  // glob option.
  const slugDirs = globSync('*/', { cwd: logosDir, follow: false })
    .map(d => d.replace(/\/$/, ''))
    .filter(slug => {
      const full = join(logosDir, slug);
      const safe = isContained(full, logosRealPath);
      if (!safe) warnEscaped(full);
      return safe;
    });

  const found: Array<{ file: string; key: string; role: AssetRole; gallery?: string }> = [];

  for (const slug of slugDirs) {
    const slugPath = join(logosDir, slug);

    // Primary: direct child files literally named readme.<ext>.
    const rootFiles = globSync('*', { cwd: slugPath, nodir: true, follow: false })
      .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()) && /^readme\./i.test(f))
      .filter(f => {
        const full = join(slugPath, f);
        const safe = isContained(full, logosRealPath);
        if (!safe) warnEscaped(full);
        return safe;
      });
    for (const f of rootFiles) {
      const rel = `${slug}/${f}`;
      found.push({ file: rel, key: `logos/${rel}`.replace(/\\/g, '/'), role: 'primary' });
    }

    // Gallery: one direct subfolder level; files directly inside it (no
    // further nesting is tracked — keeps the scan bounded, not recursive).
    // getGalleryFolders already applies its own containment check to `sub`.
    for (const sub of getGalleryFolders(slug, logosDir)) {
      const subPath = join(slugPath, sub);
      const galleryFiles = globSync('*', { cwd: subPath, nodir: true, follow: false })
        .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
        .filter(f => {
          const full = join(subPath, f);
          const safe = isContained(full, logosRealPath);
          if (!safe) warnEscaped(full);
          return safe;
        });
      for (const f of galleryFiles) {
        const rel = `${slug}/${sub}/${f}`;
        found.push({ file: rel, key: `logos/${rel}`.replace(/\\/g, '/'), role: 'gallery', gallery: sub });
      }
    }
  }

  // Sort by the FINAL key shape (logos/<file> with / separators) so that the
  // manifest's key order matches a downstream `[...Object.keys(assets)].sort()`
  // regardless of host OS path separator.
  found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const assets: Record<string, AssetEntry> = {};
  for (const { file, key, role, gallery } of found) {
    const fullPath = join(logosDir, file);
    let size: number;
    try {
      size = statSync(fullPath).size;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      throw new ManifestIOError(
        `Failed to stat ${fullPath}: ${e.message}`,
        fullPath,
        e.code
      );
    }
    assets[key] = {
      hash: hashFile(fullPath),
      size,
      format: detectFormat(fullPath),
      role,
      ...(gallery ? { gallery } : {}),
    };
  }

  return {
    version: '1.0',
    generated: new Date().toISOString(),
    algorithm: 'sha256',
    assets,
  };
}

/**
 * Write manifest to disk as pretty-printed JSON.
 *
 * Atomic write: stage the new content at <path>.brand-tmp then rename onto the
 * target. On the same volume rename is atomic, so a concurrent reader (`brand
 * verify` / `audit` / `stats`, all of which JSON.parse the manifest) never
 * observes a torn, half-written file — it sees either the complete OLD content
 * or the complete NEW content, never malformed JSON. The manifest is the
 * integrity trust-root, so it gets the same guarantee as the READMEs that
 * sync.ts / migrate.ts rewrite via their own atomicWrite helpers.
 */
export function writeManifest(manifest: Manifest, outputPath: string): void {
  const tmp = `${outputPath}.brand-tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  renameSync(tmp, outputPath);
}

/** Error thrown when the manifest file exists but cannot be parsed as JSON. */
export class ManifestParseError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(message);
    this.name = 'ManifestParseError';
    this.path = path;
  }
}

/**
 * Manifest schema versions this CLI is compatible with.
 * Adding "2.0" later (with new optional fields) without breaking changes
 * extends this set; a TRULY breaking v2 would mint a new constant and
 * leave v1 readable for the migration window.
 */
export const SUPPORTED_MANIFEST_VERSIONS: ReadonlySet<string> = new Set(['1.0']);

/** Read manifest from disk */
export function readManifest(manifestPath: string): Manifest {
  if (!existsSync(manifestPath)) {
    throw new ManifestIOError(
      `Manifest not found: ${manifestPath}`,
      manifestPath,
      'ENOENT'
    );
  }
  const raw = readFileSync(manifestPath, 'utf-8');
  let parsed: Manifest;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ManifestParseError(
      `Manifest is not valid JSON (${manifestPath}): ${(err as Error).message}`,
      manifestPath
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ManifestParseError(
      `Manifest root must be a JSON object (${manifestPath}); got ${parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed}.`,
      manifestPath
    );
  }
  // The return type promises `assets: Record<string, AssetEntry>`. Enforce that
  // invariant HERE — the one place typed callers trust — instead of letting a
  // valid-JSON-but-missing/garbage-`assets` manifest through to crash them with
  // a raw TypeError (Object.keys(undefined)) routed to the generic exit-3 path.
  // A malformed manifest is an operator error (exit 2 via ManifestParseError),
  // not an unexpected internal bug (exit 3); this guard restores that contract
  // for verifyManifest, `manifest --check`, audit's resolveMatchRole, and sync.
  const assets = (parsed as { assets?: unknown }).assets;
  if (assets === null || assets === undefined || typeof assets !== 'object' || Array.isArray(assets)) {
    throw new ManifestParseError(
      `Manifest is missing a valid "assets" object (${manifestPath}); got ${
        assets === undefined ? 'undefined' : assets === null ? 'null' : Array.isArray(assets) ? 'array' : typeof assets
      }. Re-run \`brand manifest\` to regenerate it.`,
      manifestPath
    );
  }
  // Soft version-check — warn (don't throw) for now; v2 will throw.
  if (parsed.version && !SUPPORTED_MANIFEST_VERSIONS.has(parsed.version)) {
    process.stderr.write(
      `warning: manifest version "${parsed.version}" is newer than this CLI knows about (supports: ${[...SUPPORTED_MANIFEST_VERSIONS].join(', ')}). Results may be incomplete.\n`
    );
  }
  return parsed;
}

/** Verify current files against a stored manifest */
export function verifyManifest(manifestPath: string, logosDir: string): VerifyResult {
  const stored = readManifest(manifestPath);
  const current = generateManifest(logosDir);

  const storedKeys = new Set(Object.keys(stored.assets));
  const currentKeys = new Set(Object.keys(current.assets));

  const verified: string[] = [];
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Check files that exist now
  for (const key of currentKeys) {
    if (!storedKeys.has(key)) {
      added.push(key);
    } else if (stored.assets[key]?.hash !== current.assets[key]?.hash) {
      changed.push(key);
    } else {
      verified.push(key);
    }
  }

  // Check files that were in manifest but no longer exist
  for (const key of storedKeys) {
    if (!currentKeys.has(key)) {
      removed.push(key);
    }
  }

  return {
    verified,
    changed,
    added,
    removed,
    ok: changed.length === 0 && added.length === 0 && removed.length === 0,
  };
}
