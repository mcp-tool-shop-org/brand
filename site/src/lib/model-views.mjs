/**
 * Discover and validate every slug that has a model to show.
 *
 * The schema is parsed by the CLI's own `parseModelView` — imported from the
 * built output rather than reimplemented here. A second copy of the schema in
 * the site would drift from the one `add-model` enforces at ingest, and then
 * the viewer would render views the gate would have refused. One
 * implementation, one contract.
 *
 * That import is why the root package must be built before the site is:
 * `npm run build` at the repo root produces dist/model-view.js. If it is
 * missing the site build fails loudly here, which is the correct outcome —
 * silently falling back to a local parser is how the drift starts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseModelView } from '../../../dist/model-view.js';

/**
 * Locate the repo root by walking up from cwd looking for the two things that
 * define it.
 *
 * NOT derived from `import.meta.url`, which was the first implementation and
 * was WRONG: Vite rewrites module locations during the Astro build, so
 * `dirname(fileURLToPath(import.meta.url))` resolved somewhere that had no
 * logos/ — and this function returned an empty array. The build stayed green
 * and published a site with zero viewer pages. Nothing failed; the pages were
 * simply absent.
 *
 * That silent-empty outcome is the reason this throws rather than returning []
 * when the root cannot be found, and the reason the passthrough integration
 * cross-checks page count against the manifest (see
 * integrations/model-passthrough.mjs). A discovery function that returns
 * "nothing here" on its own failure is indistinguishable from a repo that
 * genuinely has nothing.
 */
function findRepoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'manifest.json')) && existsSync(join(dir, 'logos'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate the brand repo root (a directory containing both manifest.json and ` +
      `logos/) walking up from ${process.cwd()}. Refusing to report "no models" — that is ` +
      `indistinguishable from a lookup failure, and it would publish a site missing every viewer.`
  );
}

const REPO_ROOT = findRepoRoot();
const LOGOS_DIR = join(REPO_ROOT, 'logos');

/**
 * @returns {Array<{ slug: string, view: import('../../../dist/model-view.js').ModelView }>}
 */
export function loadModelViews() {
  if (!existsSync(LOGOS_DIR)) return [];
  const out = [];

  for (const slug of readdirSync(LOGOS_DIR).sort()) {
    const viewPath = join(LOGOS_DIR, slug, 'model', 'view.json');
    if (!existsSync(viewPath) || !statSync(viewPath).isFile()) continue;

    // Deliberately NOT wrapped in try/catch. A malformed view.json is a build
    // failure, not a slug to skip quietly: skipping would publish a site that
    // is silently missing a subject nobody was told about.
    out.push({ slug, view: parseModelView(readFileSync(viewPath, 'utf-8'), viewPath) });
  }
  return out;
}
