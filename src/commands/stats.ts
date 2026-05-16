/**
 * brand stats — Summary of the brand asset registry.
 *
 * Shows total logos, format breakdown, and manifest integrity status.
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { globSync } from 'glob';
import chalk from 'chalk';
import { getFormatGlob, type Manifest } from '../manifest.js';

interface StatsOptions {
  logos: string;
  manifest: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface StatsResult {
  totalLogos: number;
  formats: Record<string, number>;
  manifestEntries: number;
  missing: string[];
  untracked: string[];
}

export async function runStats(opts: StatsOptions): Promise<void> {
  const logosDir = opts.logos;
  const manifestPath = opts.manifest;

  // Find all image files using the shared format glob (derived from SUPPORTED_FORMATS).
  // Normalize Windows paths so slug split works cross-platform.
  const imageFiles = globSync(getFormatGlob('*/readme'), { cwd: logosDir })
    .map(f => f.replace(/\\/g, '/'));
  const slugs = imageFiles
    .map(f => f.split('/')[0])
    .filter((s): s is string => s !== undefined);

  // Format breakdown
  const formats: Record<string, number> = {};
  for (const f of imageFiles) {
    const ext = extname(f).toLowerCase();
    formats[ext] = (formats[ext] || 0) + 1;
  }

  // Check manifest
  let manifestEntries = 0;
  const manifestSlugs = new Set<string>();
  if (existsSync(manifestPath)) {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
    } catch (err) {
      const msg = `Manifest is not valid JSON (${manifestPath}): ${(err as Error).message}`;
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'parse', path: manifestPath, message: msg }, null, 2) + '\n');
      }
      console.error(chalk.red(`  ✗ ${msg}`));
      console.error(chalk.dim(`  Fix: re-run \`brand manifest\` to regenerate, then \`brand verify\`.`));
      process.exit(1);
    }
    const assets = manifest.assets ?? {};
    const assetKeys = Object.keys(assets);
    manifestEntries = assetKeys.length;
    // Derive slugs from keys like `logos/<slug>/readme.<ext>` — strip the
    // `logos/` prefix and take the directory segment.
    for (const key of assetKeys) {
      const normalized = key.replace(/\\/g, '/');
      const withoutPrefix = normalized.startsWith('logos/')
        ? normalized.slice('logos/'.length)
        : normalized;
      const slug = withoutPrefix.split('/')[0];
      if (slug) manifestSlugs.add(slug);
    }
  }

  // Compare
  const slugSet = new Set(slugs);
  const missing = [...manifestSlugs].filter(s => !slugSet.has(s));
  const untracked = slugs.filter(s => !manifestSlugs.has(s));

  const result: StatsResult = {
    totalLogos: imageFiles.length,
    formats,
    manifestEntries,
    missing,
    untracked,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.bold('\n  Brand Asset Registry'));
  console.log('');
  console.log(`  Logos on disk:     ${chalk.cyan(String(result.totalLogos))}`);
  console.log(`  Manifest entries:  ${chalk.cyan(String(result.manifestEntries))}`);
  console.log('');

  console.log('  Formats:');
  for (const [ext, count] of Object.entries(result.formats).sort()) {
    console.log(`    ${ext.padEnd(8)} ${count}`);
  }

  if (missing.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  Missing from disk (${missing.length}):`));
    for (const s of missing.slice(0, 10)) {
      console.log(`    - ${s}`);
    }
    if (missing.length > 10) {
      console.log(`    ... and ${missing.length - 10} more`);
    }
  }

  if (untracked.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  Not in manifest (${untracked.length}):`));
    for (const s of untracked.slice(0, 10)) {
      console.log(`    - ${s}`);
    }
    if (untracked.length > 10) {
      console.log(`    ... and ${untracked.length - 10} more`);
    }
  }

  if (missing.length === 0 && untracked.length === 0) {
    console.log('');
    console.log(chalk.green('  ✓ Manifest and disk are in sync.'));
  }
  console.log('');
}
