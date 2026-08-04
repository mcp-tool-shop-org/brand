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
  // F-0b8e6404 (CRITICAL) — guard the logos dir up front, mirroring the
  // existsSync guard already present in stats.ts/audit.ts (v1.0.7 fixed this
  // defect class for audit/stats/migrate but missed manifest — the only one
  // of the four commands that WRITES). Without this, generateManifest below
  // silently returns an EMPTY manifest ({assets: {}}) for a missing/mistyped
  // --logos, and generate mode then overwrites whatever was on disk with it
  // -- a one-character typo destroys the entire integrity record while
  // printing a green success line and exiting 0. Applied before BOTH
  // generate and --check modes, since both call generateManifest(opts.logos)
  // and both were exposed (a bad --logos under --check reports every real
  // asset as spurious "removed" drift instead of the actual "bad path" error).
  if (!existsSync(opts.logos)) {
    const message = `logos directory not found: ${opts.logos} — pass --logos <path> or run from the brand repo root.`;
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'dir-not-found', flag: '--logos', path: opts.logos, message }, null, 2) + '\n');
    } else {
      console.error(chalk.red(`\n  ✗ ${message}\n`));
    }
    process.exitCode = 2;
    return;
  }

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
      // F-f4900c6e — exitCode instead of exit() right after a stdout write
      // (see verify.ts's F-f0c1a1f8 for the full rationale: process.exit()
      // does not wait for a piped stdout write to flush). The explicit
      // return is NOT optional -- without it, execution falls through to the
      // readManifest() call below, which throws ManifestIOError for the same
      // missing file and double-reports the error while clobbering exitCode.
      process.exitCode = 2;
      return;
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
        // F-f4900c6e — exitCode + explicit return (see missing-manifest guard
        // above). Without the return, control falls into the ManifestIOError
        // check next, which is false, then the generic catch-all below,
        // re-reporting this same error a second time and clobbering exitCode.
        process.exitCode = 2;
        return;
      }
      if (err instanceof ManifestIOError) {
        // ENOENT on the manifest itself → operator error (2), matching the
        // existsSync guard above and verify.ts's isMissingManifest branch.
        // Any other IO failure → unexpected (3).
        const ioExitCode = err.code === 'ENOENT' ? 2 : 3;
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
        // F-f4900c6e — exitCode + explicit return (see missing-manifest guard
        // above); without it, control falls into the generic catch-all below
        // and double-reports this same error while clobbering exitCode.
        process.exitCode = ioExitCode;
        return;
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
      // F-f4900c6e — exitCode instead of exit(); this is the last statement
      // in the catch block so there's no fallthrough risk, but the explicit
      // return keeps every exit path in this function visibly symmetric
      // (matches verify.ts's own documented reasoning, F-f0c1a1f8).
      process.exitCode = 3;
      return;
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
      // F-f4900c6e — exitCode instead of exit() right after this stdout
      // write. This is the CI-facing payload for the org's other drift gate
      // (alongside verify --json); an immediate exit() risks truncating it
      // on a piped/redirected stdout, exactly as F-f0c1a1f8 documented for
      // verify.ts.
      if (drift) process.exitCode = 1;
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
      // F-f4900c6e — exitCode instead of exit(). The explicit return here is
      // NOT optional: process.exit() used to hard-stop immediately, so
      // removing it without a return would fall through to the "up to date"
      // success message below even though drift was just reported -- the
      // exact fallthrough hazard Stage A's F-f0c1a1f8 comment warns about.
      process.exitCode = 1;
      return;
    }

    console.log(chalk.green(`\n  ✓ Manifest is up to date (${currentKeys.length} assets).\n`));
    return;
  }

  // Generate mode: write manifest.
  //
  // Zero-asset overwrite guard (companion to the existsSync guard above,
  // same CRITICAL finding F-0b8e6404) -- --logos can EXIST but still resolve
  // to zero assets (an emptied directory, or a real-but-wrong path), which
  // silently overwrites a previously non-empty manifest with {assets: {}}
  // just as destructively as the missing-path case, without an existsSync
  // failure to catch it. Only fires on the dangerous N>0 -> 0 transition --
  // a genuinely empty FIRST run (no prior manifest, or a prior manifest that
  // was ALREADY empty) is never blocked. No new --force flag: wiring one
  // would require editing src/cli.ts's commander option list, which is
  // outside this domain's owned globs (see this agent's output.skipped) --
  // the escape hatch is the same one --check already relies on for a corrupt
  // manifest: remove/rename the stale manifest.json (or pass a different
  // --output) to confirm the emptying was intentional.
  const newCount = Object.keys(current.assets).length;
  if (newCount === 0 && existsSync(opts.output)) {
    let previousCount = 0;
    try {
      previousCount = Object.keys(readManifest(opts.output).assets).length;
    } catch {
      // Unreadable/malformed existing manifest -- nothing safe to compare
      // against. Fail OPEN here (allow the write) rather than blocking a
      // legitimate regenerate-to-fix-corruption workflow; this guard exists
      // to stop a SILENT loss of KNOWN-GOOD data, not to gate every write.
      previousCount = 0;
    }
    if (previousCount > 0) {
      const message = `refusing to overwrite ${opts.output} (${previousCount} tracked asset${previousCount === 1 ? '' : 's'}) with an empty manifest — --logos (${opts.logos}) resolved to 0 assets. If ${opts.logos} was intentionally emptied, remove or rename ${opts.output} first (or pass a different --output) to confirm this isn't a misconfigured path.`;
      if (opts.json) {
        process.stdout.write(JSON.stringify({
          ok: false,
          error: 'zero-asset-overwrite',
          path: opts.output,
          previousCount,
          message,
        }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${message}\n`));
      }
      process.exitCode = 2;
      return;
    }
  }

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
