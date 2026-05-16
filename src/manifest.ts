/**
 * manifest.ts — SHA-256 integrity manifest for brand assets.
 *
 * The manifest is the trust foundation. It maps every logo file to its
 * SHA-256 hash so you can verify nothing has been tampered with.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { globSync } from 'glob';

export interface AssetEntry {
  hash: string;
  size: number;
  format: string;
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

/** Compute SHA-256 hash of a file, returned as "sha256:<hex>" */
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
 * Find the first existing logo file for a slug under baseDir.
 * Probes extensions in IMAGE_EXTENSION_ORDER and returns the first hit,
 * or null if none exist.
 */
export function findLogoFile(slug: string, baseDir: string): { path: string; ext: string } | null {
  for (const ext of IMAGE_EXTENSION_ORDER) {
    const candidate = join(baseDir, slug, `readme.${ext}`);
    if (existsSync(candidate)) {
      return { path: candidate, ext };
    }
  }
  return null;
}

/** Generate a manifest from all image files under logosDir */
export function generateManifest(logosDir: string): Manifest {
  // follow:false — never follow symlinks. A malicious or careless symlink
  // under logos/ would otherwise be hashed and silently included.
  const files = globSync('**/*', { cwd: logosDir, nodir: true, follow: false })
    .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()));
  // Sort by the FINAL key shape (logos/<file> with / separators) so that the
  // manifest's key order matches a downstream `[...Object.keys(assets)].sort()`
  // regardless of host OS path separator.
  const entries = files
    .map(file => ({ file, key: `logos/${file}`.replace(/\\/g, '/') }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const assets: Record<string, AssetEntry> = {};

  for (const { file, key } of entries) {
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
    };
  }

  return {
    version: '1.0',
    generated: new Date().toISOString(),
    algorithm: 'sha256',
    assets,
  };
}

/** Write manifest to disk as pretty-printed JSON */
export function writeManifest(manifest: Manifest, outputPath: string): void {
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
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
