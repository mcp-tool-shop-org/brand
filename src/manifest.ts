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

const FORMAT_MAP: Record<string, string> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.svg': 'svg',
  '.webp': 'webp',
};

/** Compute SHA-256 hash of a file, returned as "sha256:<hex>" */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  const hex = createHash('sha256').update(content).digest('hex');
  return `sha256:${hex}`;
}

/** Detect image format from extension */
function detectFormat(filePath: string): string {
  return FORMAT_MAP[extname(filePath).toLowerCase()] ?? 'unknown';
}

/** Generate a manifest from all files under logosDir */
export function generateManifest(logosDir: string): Manifest {
  const files = globSync('**/*', { cwd: logosDir, nodir: true }).sort();
  const assets: Record<string, AssetEntry> = {};

  for (const file of files) {
    const fullPath = join(logosDir, file);
    const key = `logos/${file}`.replace(/\\/g, '/');
    assets[key] = {
      hash: hashFile(fullPath),
      size: statSync(fullPath).size,
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

/** Read manifest from disk */
export function readManifest(manifestPath: string): Manifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
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
    } else if (stored.assets[key].hash !== current.assets[key].hash) {
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
