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
  /** true when disk and manifest are fully in sync (no missing/untracked slugs) -- matches every sibling command's `ok` contract. */
  ok: boolean;
  totalLogos: number;
  formats: Record<string, number>;
  manifestEntries: number;
  /** Manifest entries with role "primary" (or an untagged legacy entry). */
  primaryCount: number;
  /** Manifest entries with role "gallery". */
  galleryCount: number;
  /** Manifest entries with role "model", "channel" or "model-manifest". */
  modelCount: number;
  /** "slug/galleryName" -> image count, for every gallery in the manifest. */
  galleries: Record<string, number>;
  missing: string[];
  untracked: string[];
}

export async function runStats(opts: StatsOptions): Promise<void> {
  const logosDir = opts.logos;
  const manifestPath = opts.manifest;

  // Guard the logos dir up front. A missing/mistyped --logos (default is the
  // relative `logos`, so a wrong cwd triggers it) is an operator error (exit 2),
  // not a green "✓ Manifest and disk are in sync" pass over an empty scan.
  if (!existsSync(logosDir)) {
    const message = `logos directory not found: ${logosDir} — pass --logos <path> or run from the brand repo root.`;
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'dir-not-found', flag: '--logos', path: logosDir, message }, null, 2) + '\n');
    } else {
      console.error(chalk.red(`\n  ✗ ${message}\n`));
    }
    // F-f4900c6e — exitCode instead of exit() right after a stdout write
    // (see verify.ts's F-f0c1a1f8 for the full rationale: process.exit()
    // does not wait for a piped stdout write to flush). The explicit return
    // is NOT optional -- without it, execution falls through to the glob
    // scan below against a non-existent directory.
    process.exitCode = 2;
    return;
  }

  // Find all image files using the shared format glob (derived from SUPPORTED_FORMATS).
  // Normalize Windows paths so slug split works cross-platform.
  const imageFiles = globSync(getFormatGlob('*/readme'), { cwd: logosDir })
    .map(f => f.replace(/\\/g, '/'));
  const slugs = imageFiles
    .map(f => f.split('/')[0])
    .filter((s): s is string => s !== undefined);

  // Gallery images live one level deeper than the primary readme (see
  // manifest.ts's two-level scan): <slug>/<galleryFolder>/<file>.<ext>.
  // getFormatGlob('*/*/*') matches that shape. `slugs`/`imageFiles` above
  // stay PRIMARY-only (readme.<ext>) because they also drive the displayed
  // "Logos on disk" primary count -- this is a separate, comprehensive
  // on-disk slug set used ONLY for the missing/untracked comparison below.
  const galleryImageFiles = globSync(getFormatGlob('*/*/*'), { cwd: logosDir })
    .map(f => f.replace(/\\/g, '/'));
  const gallerySlugs = galleryImageFiles
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
  let primaryCount = 0;
  let galleryCount = 0;
  let modelCount = 0;
  const galleries: Record<string, number> = {};
  const manifestSlugs = new Set<string>();
  if (existsSync(manifestPath)) {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
    } catch (err) {
      const msg = `Manifest is not valid JSON (${manifestPath}): ${(err as Error).message}`;
      if (opts.json) {
        // Missing `else` fix: JSON mode must emit ONLY the JSON payload on
        // stdout, matching "JSON mode: single object on stdout, nothing
        // else" (see audit.ts). Previously the two console.error calls below
        // ran UNCONDITIONALLY even in --json mode, so a `--json` consumer
        // got the clean JSON on stdout AND a redundant human-readable
        // message + fix hint on stderr every time.
        process.stdout.write(JSON.stringify({ ok: false, error: 'parse', path: manifestPath, message: msg }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`  ✗ ${msg}`));
        console.error(chalk.dim(`  Fix: re-run \`brand manifest\` to regenerate, then \`brand verify\`.`));
      }
      // F-f4900c6e — exitCode instead of exit() right after a stdout write
      // (see verify.ts's F-f0c1a1f8 for the full rationale). The explicit
      // return is NOT optional -- without it, execution falls through to the
      // `const assets = manifest.assets ?? {};` line below against an
      // uninitialized `manifest`.
      process.exitCode = 1;
      return;
    }
    const assets = manifest.assets ?? {};
    const assetKeys = Object.keys(assets);
    manifestEntries = assetKeys.length;
    // Derive slugs from keys like `logos/<slug>/readme.<ext>` and tally the
    // primary/gallery role split (the headline v1.0.6 data) in the same pass,
    // so `stats` can answer "how many galleries / gallery images do I have?"
    // instead of leaving a mysterious gap between "Logos on disk" (primaries
    // only) and "Manifest entries" (all assets).
    for (const key of assetKeys) {
      const entry = assets[key];
      const normalized = key.replace(/\\/g, '/');
      const withoutPrefix = normalized.startsWith('logos/')
        ? normalized.slice('logos/'.length)
        : normalized;
      const parts = withoutPrefix.split('/');
      const slug = parts[0];
      if (slug) manifestSlugs.add(slug);
      if (entry?.role === 'gallery') {
        galleryCount++;
        const galleryName = entry.gallery ?? parts[1] ?? 'gallery';
        const gk = slug ? `${slug}/${galleryName}` : galleryName;
        galleries[gk] = (galleries[gk] ?? 0) + 1;
      } else if (
        entry?.role === 'model' ||
        entry?.role === 'channel' ||
        entry?.role === 'model-manifest'
      ) {
        // Model-channel assets (docs/model-channels-spec.md). Counted on their
        // own line and DELIBERATELY not folded into primaryCount.
        //
        // This branch exists because the old `else` was a catch-all: anything
        // that was not "gallery" became a primary logo. That was correct while
        // only two roles existed, and became a silent miscount the moment the
        // model roles were added -- three model files would have reported as
        // three extra canonical logos, a wrong number that looks right. Any
        // future role must be handled explicitly here for the same reason.
        modelCount++;
      } else {
        // role "primary" or an untagged legacy entry — count as a canonical logo.
        primaryCount++;
      }
    }
  }

  // Compare. Uses the COMPREHENSIVE on-disk slug set (primary OR gallery),
  // not just `slugs` (primary-only) -- fixes the gallery-only-slug false
  // "missing from disk" bug: a slug with ONLY gallery images (no primary
  // readme.<ext>) is still very much present on disk, but `slugs` alone
  // never saw it, so it was wrongly reported as missing even though
  // manifestSlugs (built from every manifest key, both roles) correctly
  // includes it. Symmetrically, `untracked` now also catches a gallery-only
  // slug that's on disk but hasn't been captured into the manifest yet,
  // which the old primary-only comparison silently missed.
  const diskSlugSet = new Set([...slugs, ...gallerySlugs]);
  const missing = [...manifestSlugs].filter(s => !diskSlugSet.has(s));
  const untracked = [...diskSlugSet].filter(s => !manifestSlugs.has(s));

  const result: StatsResult = {
    // ok mirrors this file's OWN "in sync" success condition (used by the
    // human-readable path below) so the sibling commands' contract --
    // `ok` means "nothing to fix" -- holds here too. Previously stats.ts was
    // the only one of the four commands with no `ok` field in its --json
    // success shape at all.
    ok: missing.length === 0 && untracked.length === 0,
    totalLogos: imageFiles.length,
    formats,
    manifestEntries,
    primaryCount,
    galleryCount,
    modelCount,
    galleries,
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
  // Surface the role split so the gap between the two counts above
  // (primaries-on-disk vs all-manifest-assets) is never a mystery. Shown when
  // ANY non-primary role is present -- originally galleries only, now models
  // too. The condition is deliberately "gallery OR model" rather than two
  // independent blocks: a registry with models but no galleries would
  // otherwise print "Manifest entries: 5 / Model assets: 4" and leave the
  // remaining primary unexplained, which is exactly the mystery this block was
  // written to prevent. A registry with neither stays terse, and one with
  // galleries only prints byte-identically to before the model role existed.
  const hasNonPrimary = result.galleryCount > 0 || result.modelCount > 0;
  if (hasNonPrimary) {
    console.log(`    Primary logos:   ${chalk.cyan(String(result.primaryCount))}`);
  }
  if (result.galleryCount > 0) {
    const galleryFolders = Object.keys(result.galleries).length;
    console.log(`    Gallery images:  ${chalk.cyan(String(result.galleryCount))} ${chalk.dim(`(across ${galleryFolders} gal${galleryFolders === 1 ? 'lery' : 'leries'})`)}`);
    // --quiet wins over --verbose (matches audit.ts's identical precedence
    // for its per-issue fix hint) -- the per-gallery breakdown is exactly
    // the kind of "per-item progress output" the global --quiet flag is
    // documented to suppress.
    if (opts.verbose && !opts.quiet) {
      for (const [gk, count] of Object.entries(result.galleries).sort()) {
        console.log(chalk.dim(`      - ${gk}: ${count}`));
      }
    }
  }
  if (result.modelCount > 0) {
    console.log(`    Model assets:    ${chalk.cyan(String(result.modelCount))}`);
  }
  console.log('');

  console.log('  Formats:');
  for (const [ext, count] of Object.entries(result.formats).sort()) {
    console.log(`    ${ext.padEnd(8)} ${count}`);
  }

  // --quiet suppresses the itemized per-slug listings below (the "per-item
  // progress output" the global flag is documented to suppress) but NEVER
  // the count-bearing header line itself -- that line is a summary ("only
  // summaries and errors" survive --quiet per the flag's own description),
  // and a --quiet CI log should still show "Missing from disk (15):" without
  // spamming all 15 slugs.
  if (missing.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  Missing from disk (${missing.length}):`));
    if (!opts.quiet) {
      for (const s of missing.slice(0, 10)) {
        console.log(`    - ${s}`);
      }
      if (missing.length > 10) {
        console.log(`    ... and ${missing.length - 10} more`);
      }
    }
  }

  if (untracked.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  Not in manifest (${untracked.length}):`));
    if (!opts.quiet) {
      for (const s of untracked.slice(0, 10)) {
        console.log(`    - ${s}`);
      }
      if (untracked.length > 10) {
        console.log(`    ... and ${untracked.length - 10} more`);
      }
    }
  }

  if (missing.length === 0 && untracked.length === 0) {
    console.log('');
    console.log(chalk.green('  ✓ Manifest and disk are in sync.'));
    // Say what this check does NOT cover. `stats` compares the manifest to the
    // local filesystem and nothing else, so a registry that has drifted badly
    // from the org still reports a clean green tick here — measured 2026-08-04,
    // 134 of 194 tracked slugs matched no repo in any org while this line read
    // "in sync". True, and misleading by omission. Point at the command that
    // does answer the question.
    console.log(chalk.dim('    (Compares the manifest to local files only — it does not check'));
    console.log(chalk.dim('     whether those repos still exist. Run `brand audit --remote --org <org>`'));
    console.log(chalk.dim('     to reconcile the registry against the live org.)'));
  }
  console.log('');
}
