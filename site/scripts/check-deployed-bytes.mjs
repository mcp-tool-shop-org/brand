/**
 * check-deployed-bytes — leg 2 of the conformance induction.
 *
 *   node site/scripts/check-deployed-bytes.mjs [--base <url>] [--json] [--all]
 *
 * WHAT THIS CLOSES
 * ----------------
 * CHECK-CAT proves at ingest that a categorical channel contains no colour
 * outside its declared palette. `brand verify` proves the bytes have not
 * changed since. The build-time passthrough assert proves the build did not
 * re-encode them. Together those give: the bytes in dist/ are the bytes that
 * were checked.
 *
 * That leaves one unverified link — the host. dist/ being correct only helps
 * if Pages serves it faithfully. That is true today, but it is an assumption
 * about infrastructure we do not control, and an unverified assumption is the
 * entire failure class this design exists to close. So it gets measured once,
 * against the live URL, and the result is recorded in the spec.
 *
 * ONE-SHOT BY DESIGN. This is not a standing check and must not become one.
 * After a single passing measurement both legs are verified and the induction
 * carries on its own — which was the point of composing the check as
 * ingest-decode plus hash-preservation rather than building a fetcher that
 * runs forever. Re-run it only if the hosting or build pipeline changes.
 *
 * Exit codes:
 *   0 — every checked asset matched
 *   1 — at least one mismatch or fetch failure (the induction does NOT hold)
 *   2 — operator error (no manifest, nothing to check, bad --base)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DEFAULT_BASE = 'https://mcp-tool-shop-org.github.io/brand';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = name => process.argv.includes(`--${name}`);

const base = arg('base', DEFAULT_BASE).replace(/\/+$/, '');
const asJson = hasFlag('json');
// Default scope is CATEGORICAL channels only — they are the ones where a byte
// change fabricates a measurement. --all covers every model asset.
const checkAll = hasFlag('all');

const manifestPath = join(REPO_ROOT, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`✗ no manifest at ${manifestPath}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

/** Collect the categorical channel filenames declared by each slug's view.json. */
function categoricalTextures(slug) {
  const viewPath = join(REPO_ROOT, 'logos', slug, 'model', 'view.json');
  if (!existsSync(viewPath)) return new Set();
  try {
    const view = JSON.parse(readFileSync(viewPath, 'utf-8'));
    return new Set((view.channels ?? []).filter(c => c.categorical).map(c => c.texture));
  } catch {
    return new Set();
  }
}

const targets = [];
for (const [key, entry] of Object.entries(manifest.assets ?? {})) {
  const m = /^logos\/([^/]+)\/model\/(.+)$/.exec(key);
  if (!m) continue;
  const [, slug, file] = m;
  if (!checkAll && !categoricalTextures(slug).has(file)) continue;
  targets.push({ key, slug, file, expected: entry.hash, url: `${base}/model/${slug}/${file}` });
}

if (targets.length === 0) {
  console.error(
    checkAll
      ? '✗ no model assets in the manifest — nothing to check.'
      : '✗ no categorical channels found. Pass --all to check every model asset.'
  );
  process.exit(2);
}

const results = [];
for (const t of targets) {
  try {
    const res = await fetch(t.url);
    if (!res.ok) {
      results.push({ ...t, ok: false, reason: `HTTP ${res.status}` });
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    const actual = `sha256:${createHash('sha256').update(body).digest('hex')}`;
    results.push({ ...t, ok: actual === t.expected, actual, bytes: body.length });
  } catch (err) {
    results.push({ ...t, ok: false, reason: err.message });
  }
}

const failed = results.filter(r => !r.ok);
const stamp = new Date().toISOString();

if (asJson) {
  console.log(JSON.stringify({ ok: failed.length === 0, base, checkedAt: stamp, results }, null, 2));
} else {
  console.log(`\n  Deployed-bytes check — ${base}`);
  console.log(`  ${stamp}\n`);
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`  ${mark} ${r.slug}/${r.file}`);
    console.log(`      manifest ${r.expected}`);
    console.log(`      served   ${r.actual ?? r.reason}`);
  }
  console.log('');
  if (failed.length === 0) {
    console.log(`  ${results.length} asset(s) served byte-identically. Leg 2 verified.`);
    console.log('  Record this result and date in docs/model-channels-spec.md, then stop');
    console.log('  running this — the induction carries once both legs are measured.\n');
  } else {
    console.log(`  ${failed.length} of ${results.length} FAILED. The induction does not hold:`);
    console.log('  a categorical channel whose served bytes differ from the checked bytes');
    console.log('  can contain classes no measurement produced.\n');
  }
}

process.exit(failed.length === 0 ? 0 : 1);
