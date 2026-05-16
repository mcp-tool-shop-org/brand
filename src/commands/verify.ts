import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { verifyManifest, ManifestIOError, ManifestParseError } from '../manifest.js';

interface VerifyOptions {
  manifest: string;
  logos: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface VerifyJsonResult {
  ok: boolean;
  verified: number;
  changed: string[];
  added: string[];
  removed: string[];
}

/**
 * Peek the manifest to learn the asset count for the pre-walk TTY hint.
 * Best-effort — if the file is missing or malformed, the main verifyManifest
 * call below will raise the canonical error; we just stay silent here.
 */
function peekAssetCount(manifestPath: string): number | null {
  try {
    if (!existsSync(manifestPath)) return null;
    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as { assets?: Record<string, unknown> };
    if (!parsed || typeof parsed !== 'object' || !parsed.assets) return null;
    return Object.keys(parsed.assets).length;
  } catch {
    return null;
  }
}

export async function runVerify(opts: VerifyOptions): Promise<void> {
  try {
    // TTY-only pre-walk hint — operators see *something* during the hash walk
    // for large registries (the org's 187 assets, growing). Suppressed in JSON
    // mode, --quiet mode, and non-interactive shells / pipes / CI.
    const showProgress = !opts.json && !opts.quiet && Boolean(process.stderr.isTTY);
    if (showProgress) {
      const count = peekAssetCount(opts.manifest);
      const label = count !== null ? `${count} assets` : 'assets';
      process.stderr.write(chalk.dim(`  Verifying ${label}...\n`));
    }

    const result = verifyManifest(opts.manifest, opts.logos);

    if (opts.json) {
      const out: VerifyJsonResult = {
        ok: result.ok,
        verified: result.verified.length,
        changed: result.changed,
        added: result.added,
        removed: result.removed,
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      if (!result.ok) process.exit(1);
      return;
    }

    if (result.ok) {
      console.log(chalk.green(`\n  ✓ All ${result.verified.length} assets verified — integrity intact.\n`));
      return;
    }

    console.log(chalk.red('\n  ✗ Integrity check failed.\n'));

    if (result.changed.length > 0) {
      console.log(chalk.red('  Changed (hash mismatch):'));
      for (const f of result.changed) {
        console.log(chalk.red(`    - ${f}`));
      }
    }

    if (result.added.length > 0) {
      console.log(chalk.yellow('\n  Added (not in manifest):'));
      for (const f of result.added) {
        console.log(chalk.yellow(`    + ${f}`));
      }
    }

    if (result.removed.length > 0) {
      console.log(chalk.red('\n  Removed (in manifest but missing):'));
      for (const f of result.removed) {
        console.log(chalk.red(`    × ${f}`));
      }
    }

    if (result.verified.length > 0) {
      console.log(chalk.green(`\n  ${result.verified.length} assets verified OK.`));
    }

    console.log(chalk.dim('\n  Fix: run `brand manifest` to regenerate the manifest, then commit it.\n'));
    process.exit(1);
  } catch (err) {
    // Exit-code contract (Stage-C documented):
    //   1 = integrity mismatch (handled in the success path above)
    //   2 = operator error (missing manifest, malformed JSON)
    //   3 = unexpected runtime failure (EACCES, EBUSY mid-walk)
    if (err instanceof ManifestParseError) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'parse', path: err.path, message: err.message }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${err.message}`));
        console.error(chalk.dim(`  Fix: re-run \`brand manifest\` to regenerate, then \`brand verify\`.\n`));
      }
      process.exit(2);
    }

    if (err instanceof ManifestIOError) {
      // ENOENT on the manifest itself → operator error (exit 2).
      // ENOENT mid-walk on a logo file → unexpected (exit 3).
      // Any other IO failure → exit 3.
      const isMissingManifest = err.code === 'ENOENT' && err.path === opts.manifest;
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'io', code: err.code ?? null, path: err.path, message: err.message }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${err.message}`));
        if (err.code) console.error(chalk.dim(`    (${err.code})`));
        if (isMissingManifest) {
          console.error(chalk.dim(`  Fix: run \`brand manifest\` to generate one, or pass --manifest <path>.\n`));
        }
      }
      process.exit(isMissingManifest ? 2 : 3);
    }

    const e = err as Error;
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'unexpected', message: e.message }, null, 2) + '\n');
    } else {
      console.error(chalk.red(`\n  ✗ ${e.message}\n`));
    }
    process.exit(3);
  }
}
