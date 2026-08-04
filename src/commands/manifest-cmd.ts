import chalk from 'chalk';
import { existsSync } from 'node:fs';
import {
  generateManifest,
  writeManifest,
  readManifest,
  ManifestIOError,
  ManifestParseError,
  type Manifest,
} from '../manifest.js';

interface ManifestOptions {
  logos: string;
  output: string;
  check?: boolean;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface CheckJsonResult {
  ok: boolean;
  added: string[];
  removed: string[];
  hashChanged: string[];
  summary: { storedCount: number; currentCount: number };
}

export async function runManifest(opts: ManifestOptions): Promise<void> {
  const current = generateManifest(opts.logos);

  if (opts.check) {
    // CI mode: fail if manifest would change.
    // Exit-code contract (F-8aee4160 — aligned with verify.ts's contract):
    //   1 = drift (added / removed / hashChanged) — the ONLY case that means
    //       "the manifest and disk genuinely disagree."
    //   2 = operator error (missing manifest, malformed/invalid JSON) — the
    //       SAME two failure categories verify.ts already classifies as 2.
    //   3 = unexpected IO failure (EACCES etc.)
    // Previously missing-manifest and malformed-JSON both collapsed into 1,
    // indistinguishable from real drift; automation built to the documented
    // 1-vs-2 distinction (fix your config vs. real tamper) got the wrong
    // classification specifically for `manifest --check`.
    if (!existsSync(opts.output)) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({
          ok: false,
          error: 'missing-manifest',
          path: opts.output,
        }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`  ✗ No manifest found at ${opts.output}. Run \`brand manifest\` to generate one.`));
      }
      process.exit(2);
    }

    let stored: Manifest;
    try {
      stored = readManifest(opts.output);
    } catch (err) {
      if (err instanceof ManifestParseError) {
        if (opts.json) {
          process.stdout.write(JSON.stringify({
            ok: false,
            error: 'parse',
            path: err.path,
            message: err.message,
          }, null, 2) + '\n');
        } else {
          console.error(chalk.red(`  ✗ ${err.message}`));
          console.error(chalk.dim(`  Fix: re-run \`brand manifest\` (without --check) to regenerate, then \`brand verify\`.`));
        }
        process.exit(2);
      }
      if (err instanceof ManifestIOError) {
        // ENOENT on the manifest itself → operator error (2), matching the
        // existsSync guard above and verify.ts's isMissingManifest branch.
        // Any other IO failure → unexpected (3).
        const exitCode = err.code === 'ENOENT' ? 2 : 3;
        if (opts.json) {
          process.stdout.write(JSON.stringify({
            ok: false,
            error: 'io',
            code: err.code ?? null,
            path: err.path,
            message: err.message,
          }, null, 2) + '\n');
        } else {
          console.error(chalk.red(`  ✗ ${err.message}`));
          if (err.code) console.error(chalk.dim(`    (${err.code})`));
        }
        process.exit(exitCode);
      }
      const msg = (err as Error).message;
      if (opts.json) {
        process.stdout.write(JSON.stringify({
          ok: false,
          error: 'unexpected',
          message: msg,
        }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`  ✗ ${msg}`));
      }
      process.exit(3);
    }
    const storedKeys = Object.keys(stored.assets).sort();
    const currentKeys = Object.keys(current.assets).sort();

    const storedSet = new Set(storedKeys);
    const currentSet = new Set(currentKeys);

    const added: string[] = [];
    const removed: string[] = [];
    const hashChanged: string[] = [];

    for (const key of currentSet) {
      if (!storedSet.has(key)) added.push(key);
    }
    for (const key of storedSet) {
      if (!currentSet.has(key)) removed.push(key);
    }
    for (const key of currentKeys) {
      if (storedSet.has(key) && stored.assets[key]?.hash !== current.assets[key]?.hash) {
        hashChanged.push(key);
      }
    }

    const drift = added.length > 0 || removed.length > 0 || hashChanged.length > 0;

    if (opts.json) {
      const out: CheckJsonResult = {
        ok: !drift,
        added,
        removed,
        hashChanged,
        summary: { storedCount: storedKeys.length, currentCount: currentKeys.length },
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      if (drift) process.exit(1);
      return;
    }

    for (const key of added) {
      console.error(chalk.yellow(`  + ${key} (new, not in manifest)`));
    }
    for (const key of removed) {
      console.error(chalk.red(`  × ${key} (removed, still in manifest)`));
    }
    for (const key of hashChanged) {
      console.error(chalk.red(`  ~ ${key} (hash changed)`));
    }

    if (drift) {
      console.error(chalk.red('\n  ✗ Manifest is out of date.'));
      console.error(chalk.dim('  To fix: re-run `brand manifest` (no flag) to regenerate, then commit the updated manifest.json.\n'));
      process.exit(1);
    }

    console.log(chalk.green(`\n  ✓ Manifest is up to date (${currentKeys.length} assets).\n`));
    return;
  }

  // Generate mode: write manifest
  writeManifest(current, opts.output);
  const count = Object.keys(current.assets).length;

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      output: opts.output,
      assets: count,
    }, null, 2) + '\n');
    return;
  }

  if (!opts.quiet) {
    console.log(chalk.green(`\n  ✓ Manifest written: ${opts.output} (${count} assets).\n`));
  }
}
