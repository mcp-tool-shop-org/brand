/**
 * model-passthrough — an Astro integration that stages model-channel assets
 * into the site and then PROVES the build did not touch their bytes.
 *
 * Leg 1 of the conformance induction (docs/model-channels-spec.md).
 *
 * WHY THE STAGING AND THE ASSERT MUST BE SEPARATE
 * -----------------------------------------------
 * The obvious implementation copies `logos/<slug>/model/*` straight into
 * `dist/` in `astro:build:done` and hashes the result. That assert is
 * WORTHLESS: it verifies a copy this integration just performed, against a
 * manifest the same bytes produced. It can only fail if copyFileSync is
 * broken. A check that cannot fail is not a check.
 *
 * So the files are staged into `publicDir` BEFORE the build, Astro handles
 * them like any other public asset, and the assert runs afterwards on what
 * actually landed in `dist/`. Now the check has a real failure mode: if
 * Astro's asset pipeline ever starts processing `public/` — an image
 * optimiser, a hashing/renaming step, a compressor — the bytes change and the
 * build halts. "public/ is copied verbatim" is documented behaviour, and
 * documented behaviour of a dependency is exactly the kind of assumption this
 * spec says to verify rather than trust.
 *
 * The failure this closes is the one this workspace calls "a working viewer
 * that looks right": a categorical channel silently re-encoded during the
 * build fabricates classes downstream of every passing check, and every check
 * keeps passing.
 *
 * LEG 2 is not this file's job and cannot be: `dist/` being correct only helps
 * if the host serves it faithfully. See scripts/check-deployed-bytes.mjs for
 * the one-shot check that closes it at first real deploy.
 */
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root — this file lives at <root>/site/integrations/. */
const REPO_ROOT = resolve(HERE, '..', '..');

/** Where staged model assets land inside the site, and therefore inside dist/. */
export const MODEL_URL_PREFIX = 'model';

function sha256(buf) {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

/** Manifest keys under logos/<slug>/model/ — the authoritative list of what must pass through. */
function modelEntries(manifest) {
  return Object.entries(manifest.assets ?? {}).filter(([key]) =>
    /^logos\/[^/]+\/model\//.test(key)
  );
}

function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

/**
 * The whole check, as a pure function of (outDir, manifest) — deliberately NOT
 * buried inside the build hook, so it can be tested against a temp directory
 * without running Astro. A gate that can only be exercised by a full site
 * build is a gate nobody re-verifies after the first time.
 *
 * @param {{ outDir: string, manifest: object }} args
 * @returns {{ ok: boolean, checked: number, pages: number, missing: string[],
 *             mismatches: Array<{key:string,expected:string,actual:string}>,
 *             pagelessSlugs: string[] }}
 */
export function verifyModelPassthrough({ outDir, manifest }) {
  const entries = modelEntries(manifest);
  const missing = [];
  const mismatches = [];

  for (const [key, entry] of entries) {
    // logos/<slug>/model/<file>  ->  dist/model/<slug>/<file>
    const [, slug, , ...rest] = key.split('/');
    const distPath = join(outDir, MODEL_URL_PREFIX, slug, ...rest);
    if (!existsSync(distPath)) {
      missing.push(key);
      continue;
    }
    const actual = sha256(readFileSync(distPath));
    if (actual !== entry.hash) mismatches.push({ key, expected: entry.hash, actual });
  }

  // Every slug with a view.json must have produced a viewer page. This exists
  // because the route's discovery function once returned an empty array on its
  // own internal failure: the build went green and published a site with no
  // viewer pages at all, and nothing reported it. Byte-perfect assets nobody
  // can reach is a passing build that shipped nothing.
  const slugsWithViews = [
    ...new Set(entries.filter(([k]) => k.endsWith('/view.json')).map(([k]) => k.split('/')[1])),
  ];
  const pagelessSlugs = slugsWithViews.filter(
    slug => !existsSync(join(outDir, slug, 'view', 'index.html'))
  );

  return {
    ok: missing.length === 0 && mismatches.length === 0 && pagelessSlugs.length === 0,
    checked: entries.length,
    pages: slugsWithViews.length - pagelessSlugs.length,
    missing,
    mismatches,
    pagelessSlugs,
  };
}

/** @param {ReturnType<typeof verifyModelPassthrough>} report */
export function formatPassthroughFailure(report) {
  const lines = [];
  if (report.missing.length > 0 || report.mismatches.length > 0) {
    lines.push(
      'MODEL PASSTHROUGH FAILED — the build changed or dropped model asset bytes.',
      '',
      'Model assets must reach dist/ byte-identical to what the manifest hashed.',
      'Categorical channels encode class membership as colour, so a re-encode',
      'produces classes no measurement produced — and every downstream check',
      'would still pass, because they all trust these bytes.',
      ''
    );
    for (const key of report.missing) lines.push(`  MISSING   ${key}`);
    for (const m of report.mismatches) {
      lines.push(`  CHANGED   ${m.key}`);
      lines.push(`            manifest ${m.expected}`);
      lines.push(`            dist/    ${m.actual}`);
    }
    lines.push('', 'Likely cause: something in the build now processes public/ assets.');
  }
  if (report.pagelessSlugs.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(
      'MODEL PAGES MISSING — assets were published with no viewer to reach them.',
      '',
      `${report.pagelessSlugs.length} slug(s) have a view.json in the manifest but produced no`,
      'page at dist/<slug>/view/index.html:',
      ...report.pagelessSlugs.map(s => `  ${s}`),
      '',
      "Likely cause: the route's getStaticPaths found nothing. Check that the root",
      'package is built (dist/model-view.js) and that repo-root discovery resolves.'
    );
  }
  return lines.join('\n');
}

/**
 * @param {{ logosDir?: string, manifestPath?: string }} [options]
 */
export default function modelPassthrough(options = {}) {
  const logosDir = options.logosDir ?? join(REPO_ROOT, 'logos');
  const manifestPath = options.manifestPath ?? join(REPO_ROOT, 'manifest.json');
  let publicDir;
  let outDir;

  return {
    name: 'brand:model-passthrough',
    hooks: {
      'astro:config:setup': ({ config, logger }) => {
        publicDir = fileURLToPath(config.publicDir);
        outDir = fileURLToPath(config.outDir);

        const staged = join(publicDir, MODEL_URL_PREFIX);
        // Rebuilt from scratch every run: a stale slug left here from a
        // previous build would be published as a live asset that no manifest
        // entry covers, which is the untracked-file problem one layer down.
        rmSync(staged, { recursive: true, force: true });

        if (!existsSync(logosDir)) {
          logger.warn(`logos dir not found at ${logosDir} — no model assets staged.`);
          return;
        }

        let count = 0;
        for (const slug of readdirSync(logosDir)) {
          const src = join(logosDir, slug, 'model');
          if (!existsSync(src) || !statSync(src).isDirectory()) continue;
          const dest = join(staged, slug);
          mkdirSync(dest, { recursive: true });
          // Depth 1 only, matching the manifest's own bounded scan. A nested
          // file has no manifest entry, so publishing it would put an unhashed
          // asset on the site — add-model refuses that layout at ingest, and
          // this refuses to publish it if one ever appears another way.
          for (const name of readdirSync(src)) {
            const full = join(src, name);
            if (!statSync(full).isFile()) continue;
            cpSync(full, join(dest, name));
            count++;
          }
        }
        if (count > 0) logger.info(`staged ${count} model asset(s) into public/${MODEL_URL_PREFIX}/`);
      },

      'astro:build:done': ({ logger }) => {
        const manifest = readManifest(manifestPath);
        if (!manifest) {
          logger.warn(`no manifest at ${manifestPath} — passthrough assert skipped.`);
          return;
        }
        const report = verifyModelPassthrough({ outDir, manifest });
        if (report.checked === 0) return;
        // Throwing here fails the build. This is the andon: the check lives
        // inside the tool that performs the step, not chained after it.
        if (!report.ok) throw new Error(formatPassthroughFailure(report));

        logger.info(
          `model passthrough verified — ${report.checked} asset(s) byte-identical in dist/, ` +
            `${report.pages} viewer page(s) present.`
        );
      },
    },
  };
}
