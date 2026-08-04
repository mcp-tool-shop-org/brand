#!/usr/bin/env node

/**
 * brand CLI — Centralized brand asset management.
 *
 * Commands:
 *   verify    Verify logo integrity against manifest
 *   manifest  Regenerate manifest.json
 *   audit     Scan for broken refs, badge collisions, indentation traps
 *   migrate   Rewrite README logo references to brand repo
 *   stats     Summary of the brand asset registry
 *   remove    Remove a slug's (or one gallery's) assets from the registry
 *   history   Show git history for a slug's asset(s) — added/changed/removed
 *
 * Exit codes (uniform across commands):
 *   0 — success
 *   1 — integrity mismatch / drift / audit findings
 *   2 — operator error (missing file, bad flag, malformed manifest)
 *   3 — unexpected error (IO failure, network, internal bug)
 */

import { Command, CommanderError } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch (err) {
  process.stderr.write(
    `warning: could not read package.json for version (${(err as Error).message}); falling back to ${version}\n`
  );
}

/** Global flags propagated to every subcommand. */
export interface GlobalFlags {
  quiet: boolean;
  verbose: boolean;
}

/** Merge program-level global flags into a per-command options object. */
function withGlobals<T extends object>(opts: T, program: Command): T & GlobalFlags {
  const g = program.opts() as { quiet?: boolean; verbose?: boolean };
  return {
    ...opts,
    quiet: g.quiet === true,
    verbose: g.verbose === true,
  };
}

const program = new Command();

program
  .name('brand')
  .description('Centralized brand asset management — migration, audit, and integrity verification')
  .version(version)
  .option('-q, --quiet', 'Suppress per-item progress output (only summaries and errors)')
  .option('-v, --verbose', 'Verbose output — extra per-step diagnostics')
  // Without this, Commander's default behavior on any usage error (missing
  // required option, unknown option/command) is to print its own message and
  // call process.exit() itself — bypassing main()'s try/catch below entirely,
  // so it never gets mapped onto this tool's documented exit-code contract.
  // Verified empirically: `brand sync` with no --slug printed Commander's raw
  // (un-styled) error and exited 1, which per THIS file's own contract means
  // "integrity drift", not "bad flag". exitOverride() turns that into a
  // thrown CommanderError instead, caught below and remapped to exit 2.
  // MUST be set before any .command(...) call below — Commander copies the
  // exit-callback onto a subcommand at the moment .command() is invoked, so
  // a subcommand defined before this line would not inherit the override.
  .exitOverride();

program
  .command('verify')
  .description('Verify logo integrity against manifest')
  .option('--manifest <path>', 'Path to manifest.json', 'manifest.json')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--json', 'Emit a single JSON object describing the verification result')
  .action(async (opts) => {
    const { runVerify } = await import('./commands/verify.js');
    await runVerify(withGlobals(opts, program));
  });

program
  .command('manifest')
  .description('Regenerate manifest.json from current logos')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--output <path>', 'Output path for manifest', 'manifest.json')
  .option('--check', 'Check mode — fail if manifest would change (for CI)')
  .option('--json', 'Emit a single JSON object describing the result')
  .action(async (opts) => {
    const { runManifest } = await import('./commands/manifest-cmd.js');
    await runManifest(withGlobals(opts, program));
  });

program
  .command('audit')
  .description('Scan org repos for broken logo refs, badge collisions, indentation traps')
  .option('--repos <path>', 'Parent directory containing repo clones', '.')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--manifest <path>', 'Path to manifest.json (resolves asset roles for the multiple-logo-matches check)', 'manifest.json')
  .option('--brand-base <url>', 'Base URL for brand assets', 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main')
  .option('--remote', 'Audit against the live GitHub org over the network instead of local clones under --repos (strictly opt-in — omitting this flag makes zero network calls)')
  .option('--org <org>', 'GitHub org/user to check when --remote is set (comma-separated for multiple, e.g. mcp-tool-shop-org,dogfood-lab,mcp-tool-shop)', 'mcp-tool-shop-org')
  .option('--json', 'Emit findings as a single JSON object')
  .action(async (opts) => {
    const { runAudit } = await import('./commands/audit.js');
    await runAudit(withGlobals(opts, program));
  });

program
  .command('migrate')
  .description('Rewrite README logo references to point at brand repo')
  .option('--repos <path>', 'Parent directory containing repo clones', '.')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--brand-base <url>', 'Base URL for brand logos', 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos')
  .option('--dry-run', 'Preview changes without modifying files', false)
  .option('--json', 'Emit a single JSON object describing the migration result')
  .option('--resume', 'Restore any half-applied migration from a prior interrupted run before proceeding')
  .action(async (opts) => {
    const { runMigrate } = await import('./commands/migrate.js');
    await runMigrate(withGlobals(opts, program));
  });

program
  .command('stats')
  .description('Show brand asset registry summary — logo counts, format breakdown, sync status')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--manifest <path>', 'Path to manifest.json', 'manifest.json')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const { runStats } = await import('./commands/stats.js');
    await runStats(withGlobals(opts, program));
  });

program
  .command('add-gallery')
  .description('Register a directory of images as a named gallery collection for a slug')
  .argument('<slug>', 'Slug under logos/ to attach the gallery to')
  .argument('<source-dir>', 'Directory of image files to register')
  .option('--gallery-name <name>', 'Gallery subfolder name', 'gallery')
  .option('--order <files>', 'Comma-separated original filenames in desired display order (must cover every image in source-dir)')
  .option('--dry-run', 'Preview added/updated/removed files without modifying anything', false)
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--json', 'Emit a single JSON object describing the result')
  .action(async (slug, sourceDir, opts) => {
    const { runAddGallery } = await import('./commands/add-gallery.js');
    await runAddGallery(withGlobals({ ...opts, slug, sourceDir }, program));
  });

// Placed directly after add-gallery (and before sync) — remove and
// add-gallery are the two commands that mutate logos/ directly, per the
// commands-write agent's own placement note (wave-6 F-FEAT-remove).
program
  .command('remove')
  .description('Remove a slug\'s logo directory (or one gallery within it), safely')
  .argument('<slug>', 'Slug under logos/ to remove')
  .option('--gallery <name>', 'Remove only this gallery subfolder, leaving the primary logo')
  .option('--dry-run', 'Preview what would be deleted without modifying anything', false)
  .option('--yes', 'Confirm a real (non-dry-run) removal — required for any destructive run', false)
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--json', 'Emit a single JSON object describing the result')
  .action(async (slug, opts) => {
    // src/commands/remove.ts is owned by the commands-write agent (wave-6
    // cross-domain build: core owns cli.ts wiring, commands-write owns the
    // command implementation) and may not exist yet in this worktree. A
    // plain literal `import('./commands/remove.js')` would make `tsc` raise
    // TS2307 whenever that file is absent, which fails `npm run build` —
    // and since `pretest` runs the build, that takes down `npm test` for
    // EVERY command in this file, not just this one. `@ts-ignore` (not
    // `@ts-expect-error`) is deliberate: it suppresses the "cannot find
    // module" error while the file is missing AND stays completely inert
    // (no "unused directive" complaint, verified empirically) once
    // commands-write's branch lands the real file — so this line needs no
    // follow-up edit either way. Option surface + RemoveOptions contract
    // above confirmed directly against commands-write's own wave-6 output
    // (F-FEAT-remove skipped note): runRemove({ slug, gallery?, dryRun?,
    // yes?, logos?, json?, quiet?, verbose? }).
    // @ts-ignore -- cross-domain sibling module, see comment above
    const { runRemove } = await import('./commands/remove.js');
    await runRemove(withGlobals({ ...opts, slug }, program));
  });

program
  .command('sync')
  .description('Regenerate a consuming repo README\'s gallery marker block from the manifest')
  .requiredOption('--slug <slug>', 'Slug whose gallery should be synced')
  .option('--gallery <name>', 'Gallery subfolder name (auto-detected if the slug has exactly one)')
  .option('--repos <path>', 'Parent directory containing repo clones', '.')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--manifest <path>', 'Path to manifest.json', 'manifest.json')
  .option('--brand-base <url>', 'Base URL for brand gallery images', 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos')
  .option('--check', 'Check mode — report drift without writing (for CI)', false)
  .option('--json', 'Emit a single JSON object describing the result')
  .action(async (opts) => {
    const { runSync } = await import('./commands/sync.js');
    await runSync(withGlobals(opts, program));
  });

program
  .command('history')
  .description('Show git history for a slug\'s (or one gallery\'s) assets — added/changed/removed, newest first')
  .argument('<slug>', 'Slug under logos/ to show history for')
  .option('--gallery <name>', 'Show only this gallery subfolder\'s history instead of the whole slug')
  .option('--limit <n>', 'Maximum number of history entries to show', '20')
  .option('--logos <path>', 'Path to logos directory', 'logos')
  .option('--json', 'Emit a single JSON object describing the result')
  .action(async (slug, opts) => {
    const { runHistory } = await import('./commands/history.js');
    await runHistory(withGlobals({ ...opts, slug }, program));
  });

/**
 * Map errors thrown out of subcommands to friendly messages + exit codes.
 * Subcommands should normally handle their own exit codes via process.exit;
 * this catch is a safety net for unhandled rejections (lib bugs, async paths
 * we missed) so the operator sees something better than a raw Node stack.
 *
 * Two things this block corrects (Stage-C exit-code audit):
 *
 *  - Commander's OWN usage-error path (missing required option, unknown
 *    option/command, etc.) used to bypass this try/catch entirely — it
 *    printed its own message and called process.exit() itself, always with
 *    Commander's internal default of exit 1. `.exitOverride()` on `program`
 *    (above) turns that into a thrown CommanderError instead, so it lands
 *    in the catch below and gets remapped onto exit 2 (operator error) —
 *    Commander's own "1" collides with this file's "1 = integrity drift".
 *
 *  - process.exit(N) is avoided here in favor of process.exitCode = N.
 *    Writes to stderr are asynchronous on a piped/non-TTY stream (CI
 *    runners, `2>file`, `| jq`), and process.exit() "will stop the Node.js
 *    process as quickly as possible even if there are still asynchronous
 *    operations pending... including I/O operations to process.stdout and
 *    process.stderr" (Node docs) — so an immediate process.exit() right
 *    after a stderr write can truncate that very write. Setting exitCode
 *    lets Node drain stdio naturally once the event loop empties, which
 *    this CLI does quickly: it holds no open handles (servers, sockets,
 *    timers) once a subcommand's own work is done, so nothing here is a
 *    "pending hung handle" that needs forceful termination.
 */
async function main(): Promise<void> {
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    process.stderr.write(chalk.red(`\n  ✗ Unhandled error: ${msg}\n`));
    if (reason instanceof Error && reason.stack && process.env.BRAND_DEBUG) {
      process.stderr.write(`${reason.stack}\n`);
    }
    process.exitCode = 3;
  });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.exitCode === 0) {
        // --help / --version (or any other clean Commander exit) — not an
        // error. Commander already wrote the help/version text itself.
        process.exitCode = 0;
        return;
      }
      // Every other CommanderError is Commander's own usage-error path; it
      // already printed its own message via outputError() before throwing,
      // so this does not print a second copy. Per this file's documented
      // contract, a bad flag / missing required option / unknown command is
      // operator error (exit 2) — regardless of the exitCode Commander
      // assigned internally (always 1, by Commander's own convention).
      process.exitCode = 2;
      return;
    }

    const e = err as NodeJS.ErrnoException;
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES' || e.code === 'EBUSY')) {
      process.stderr.write(chalk.red(`\n  ✗ ${e.message}\n`));
      // Operator error (missing file / bad path) per the documented
      // contract — this used to fall through to exit 3 ("unexpected"),
      // contradicting the header comment's own literal example.
      process.exitCode = 2;
      return;
    }
    process.stderr.write(chalk.red(`\n  ✗ ${(err as Error).message}\n`));
    if (process.env.BRAND_DEBUG) {
      process.stderr.write(`${(err as Error).stack}\n`);
    }
    process.exitCode = 3;
  }
}

void main();
