import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { generateManifest, writeManifest, readManifest } from '../manifest.js';

interface ManifestOptions {
  logos: string;
  output: string;
  check?: boolean;
}

export async function runManifest(opts: ManifestOptions): Promise<void> {
  const current = generateManifest(opts.logos);

  if (opts.check) {
    // CI mode: fail if manifest would change
    if (!existsSync(opts.output)) {
      console.error(chalk.red('  ✗ No manifest found. Run `brand manifest` to generate one.'));
      process.exit(1);
    }

    const stored = readManifest(opts.output);
    const storedKeys = Object.keys(stored.assets).sort();
    const currentKeys = Object.keys(current.assets).sort();

    let drift = false;

    // Check for key differences
    const storedSet = new Set(storedKeys);
    const currentSet = new Set(currentKeys);

    for (const key of currentSet) {
      if (!storedSet.has(key)) {
        console.error(chalk.yellow(`  + ${key} (new, not in manifest)`));
        drift = true;
      }
    }

    for (const key of storedSet) {
      if (!currentSet.has(key)) {
        console.error(chalk.red(`  × ${key} (removed, still in manifest)`));
        drift = true;
      }
    }

    // Check hash differences
    for (const key of currentKeys) {
      if (storedSet.has(key) && stored.assets[key].hash !== current.assets[key].hash) {
        console.error(chalk.red(`  ~ ${key} (hash changed)`));
        drift = true;
      }
    }

    if (drift) {
      console.error(chalk.red('\n  ✗ Manifest is out of date. Run `brand manifest` to update.\n'));
      process.exit(1);
    }

    console.log(chalk.green(`  ✓ Manifest is up to date (${currentKeys.length} assets).\n`));
    return;
  }

  // Generate mode: write manifest
  writeManifest(current, opts.output);
  const count = Object.keys(current.assets).length;
  console.log(chalk.green(`  ✓ Manifest written: ${opts.output} (${count} assets)\n`));
}
