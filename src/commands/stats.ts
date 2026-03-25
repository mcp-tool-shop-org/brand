/**
 * brand stats — Summary of the brand asset registry.
 *
 * Shows total logos, format breakdown, and manifest integrity status.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { globSync } from 'glob';
import chalk from 'chalk';

interface StatsOptions {
  logos: string;
  manifest: string;
  json?: boolean;
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

  // Find all image files
  const imageFiles = globSync('*/readme.{png,jpg,jpeg,svg,webp}', { cwd: logosDir });
  const slugs = imageFiles.map(f => f.split('/')[0]);

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
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const entries = manifest.logos || manifest;
    if (Array.isArray(entries)) {
      manifestEntries = entries.length;
      for (const e of entries) {
        manifestSlugs.add(e.slug || e.name);
      }
    } else if (typeof entries === 'object') {
      const keys = Object.keys(entries);
      manifestEntries = keys.length;
      for (const k of keys) {
        manifestSlugs.add(k);
      }
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

  console.log(chalk.bold('Brand Asset Registry'));
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
    console.log(chalk.green('  ✓ Manifest and disk are in sync'));
  }
}
