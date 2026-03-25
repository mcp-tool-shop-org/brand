#!/usr/bin/env node

/**
 * brand CLI — Centralized brand asset management.
 *
 * Commands:
 *   verify    Verify logo integrity against manifest
 *   manifest  Regenerate manifest.json
 *   audit     Scan for broken refs, badge collisions, indentation traps
 *   migrate   Rewrite README logo references to brand repo
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {
  // use default
}

const program = new Command();

program
  .name('brand')
  .description('Centralized brand asset management — migration, audit, and integrity verification')
  .version(version);

program
  .command('verify')
  .description('Verify logo integrity against manifest')
  .option('--manifest <path>', 'Path to manifest.json', 'manifest.json')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .action(async (opts) => {
    const { runVerify } = await import('./commands/verify.js');
    await runVerify(opts);
  });

program
  .command('manifest')
  .description('Regenerate manifest.json from current logos')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--output <path>', 'Output path for manifest', 'manifest.json')
  .option('--check', 'Check mode — fail if manifest would change (for CI)')
  .action(async (opts) => {
    const { runManifest } = await import('./commands/manifest-cmd.js');
    await runManifest(opts);
  });

program
  .command('audit')
  .description('Scan org repos for broken logo refs, badge collisions, indentation traps')
  .option('--repos <path>', 'Parent directory containing repo clones', '.')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--brand-base <url>', 'Base URL for brand assets', 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main')
  .action(async (opts) => {
    const { runAudit } = await import('./commands/audit.js');
    await runAudit(opts);
  });

program
  .command('migrate')
  .description('Rewrite README logo references to point at brand repo')
  .option('--repos <path>', 'Parent directory containing repo clones', '.')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--brand-base <url>', 'Base URL for brand logos', 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos')
  .option('--dry-run', 'Preview changes without modifying files', false)
  .action(async (opts) => {
    const { runMigrate } = await import('./commands/migrate.js');
    await runMigrate(opts);
  });

program
  .command('stats')
  .description('Show brand asset registry summary — logo counts, format breakdown, sync status')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--manifest <path>', 'Path to manifest.json', 'manifest.json')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const { runStats } = await import('./commands/stats.js');
    await runStats(opts);
  });

program.parse();
