/**
 * Step 1 of docs/model-channels-spec.md — the reserved model/ role, its own
 * discovery path, and the view.json schema.
 *
 * The walker change these tests cover is the riskiest code in the plan: the
 * two-level discovery is load-bearing for everything brand already serves,
 * and its failure mode is SILENT mis-roling — a `model/` folder registering
 * as `role: "gallery"` produces a manifest that is structurally valid,
 * verifies clean, and is wrong. Nothing about it looks broken. So the
 * regression set covers what the walker LEAVES ALONE as carefully as what it
 * now catches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateManifest,
  getGalleryFolders,
  findMisroledModelAssets,
  MODEL_DIR,
  type Manifest,
} from '../src/manifest.js';
import { parseModelView, ModelViewParseError, MODEL_VIEW_SCHEMA } from '../src/model-view.js';

let tempDir: string;
let logosDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-model-test-'));
  logosDir = join(tempDir, 'logos');
  mkdirSync(join(logosDir, 'subject-a'), { recursive: true });
  writeFileSync(join(logosDir, 'subject-a', 'readme.png'), 'fake-png-primary');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeModelDir(slug: string, files: Record<string, string>): void {
  const dir = join(logosDir, slug, MODEL_DIR);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
}

describe('existing corpus is untouched (anchor)', () => {
  it('produces only primary and gallery roles when no model/ dir exists', () => {
    mkdirSync(join(logosDir, 'subject-a', 'turnarounds'), { recursive: true });
    writeFileSync(join(logosDir, 'subject-a', 'turnarounds', 'side.png'), 'fake-side');

    const m = generateManifest(logosDir);
    const roles = new Set(Object.values(m.assets).map(a => a.role));

    expect(roles).toEqual(new Set(['primary', 'gallery']));
    expect(m.assets['logos/subject-a/readme.png']).toMatchObject({
      role: 'primary',
      format: 'png',
    });
    expect(m.assets['logos/subject-a/turnarounds/side.png']).toMatchObject({
      role: 'gallery',
      gallery: 'turnarounds',
      format: 'png',
    });
  });

  it('does not add a gallery key to primary entries', () => {
    const m = generateManifest(logosDir);
    expect(m.assets['logos/subject-a/readme.png']).not.toHaveProperty('gallery');
  });
});

describe('model/ discovery', () => {
  it('assigns role "model" to a .glb with format glb', () => {
    writeModelDir('subject-a', { 'asset.glb': 'fake-glb' });
    const m = generateManifest(logosDir);
    expect(m.assets['logos/subject-a/model/asset.glb']).toMatchObject({
      role: 'model',
      format: 'glb',
    });
  });

  it('assigns role "channel" to channel textures, keeping their own formats', () => {
    writeModelDir('subject-a', {
      'ch_flat.webp': 'fake-webp',
      'ch_layer_a.png': 'fake-png',
    });
    const m = generateManifest(logosDir);
    expect(m.assets['logos/subject-a/model/ch_flat.webp']).toMatchObject({
      role: 'channel',
      format: 'webp',
    });
    expect(m.assets['logos/subject-a/model/ch_layer_a.png']).toMatchObject({
      role: 'channel',
      format: 'png',
    });
  });

  it('hashes view.json as role "model-manifest"', () => {
    writeModelDir('subject-a', { 'view.json': '{"schema":"x"}' });
    const entry = generateManifest(logosDir).assets['logos/subject-a/model/view.json'];
    // Integrity matters here specifically because view.json carries the
    // subject's fidelity receipt. An unhashed receipt could be edited without
    // `brand verify` noticing, which is the fabrication class the spec guards.
    expect(entry).toMatchObject({ role: 'model-manifest', format: 'json' });
    expect(entry.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('NEVER assigns role "gallery" to anything under model/ — the silent failure', () => {
    writeModelDir('subject-a', {
      'asset.glb': 'fake-glb',
      'ch_flat.webp': 'fake-webp',
      'view.json': '{}',
    });
    const m = generateManifest(logosDir);
    const modelKeys = Object.keys(m.assets).filter(k => k.includes(`/${MODEL_DIR}/`));

    expect(modelKeys.length).toBe(3);
    for (const key of modelKeys) {
      expect(m.assets[key].role).not.toBe('gallery');
      expect(m.assets[key]).not.toHaveProperty('gallery');
    }
  });

  it('excludes model/ from getGalleryFolders so add-gallery cannot target it', () => {
    writeModelDir('subject-a', { 'asset.glb': 'fake-glb' });
    mkdirSync(join(logosDir, 'subject-a', 'turnarounds'), { recursive: true });

    expect(getGalleryFolders('subject-a', logosDir)).toEqual(['turnarounds']);
  });

  it('leaves unknown extensions inside model/ untracked rather than guessing', () => {
    writeModelDir('subject-a', { 'asset.glb': 'fake-glb', 'notes.txt': 'scratch' });
    const m = generateManifest(logosDir);
    expect(m.assets).toHaveProperty('logos/subject-a/model/asset.glb');
    expect(m.assets).not.toHaveProperty('logos/subject-a/model/notes.txt');
  });

  it('does not track nested files under model/ — the bound is explicit, not invisible', () => {
    // The spec's layout is flat (ch_<id>.<ext>) precisely because this scan is
    // two-level bounded. Asserting the nested case is NOT tracked documents
    // the bound in code, so a future nested layout fails a test rather than
    // silently shipping a channel nobody hashed.
    const nested = join(logosDir, 'subject-a', MODEL_DIR, 'channels');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'flat.webp'), 'fake-nested');

    const m = generateManifest(logosDir);
    expect(m.assets).not.toHaveProperty('logos/subject-a/model/channels/flat.webp');
    expect(Object.keys(m.assets).filter(k => k.includes('/channels/'))).toEqual([]);
  });
});

describe('GATE-SEQUENCE — findMisroledModelAssets', () => {
  const base = (assets: Manifest['assets']): Manifest => ({
    version: '1.0',
    generated: '2026-08-04T00:00:00.000Z',
    algorithm: 'sha256',
    assets,
  });

  it('detects model assets a pre-MODEL_DIR build recorded as gallery', () => {
    const m = base({
      'logos/subject-a/readme.png': { hash: 'sha256:x', size: 1, format: 'png', role: 'primary' },
      'logos/subject-a/model/asset.glb': {
        hash: 'sha256:y',
        size: 2,
        format: 'glb',
        role: 'gallery',
        gallery: 'model',
      },
      'logos/subject-a/model/ch_flat.webp': {
        hash: 'sha256:z',
        size: 3,
        format: 'webp',
        role: 'gallery',
        gallery: 'model',
      },
    });
    expect(findMisroledModelAssets(m)).toEqual([
      'logos/subject-a/model/asset.glb',
      'logos/subject-a/model/ch_flat.webp',
    ]);
  });

  it('returns nothing for a manifest this build produced', () => {
    writeModelDir('subject-a', { 'asset.glb': 'fake-glb', 'ch_flat.webp': 'fake-webp' });
    expect(findMisroledModelAssets(generateManifest(logosDir))).toEqual([]);
  });

  it('ignores galleries that merely contain the word model in a slug', () => {
    const m = base({
      'logos/model-shop/turnarounds/a.png': {
        hash: 'sha256:x',
        size: 1,
        format: 'png',
        role: 'gallery',
        gallery: 'turnarounds',
      },
    });
    expect(findMisroledModelAssets(m)).toEqual([]);
  });
});

describe('stats does not miscount model assets as canonical logos', () => {
  // Regression for a bug the model roles INTRODUCED into an existing consumer.
  // stats.ts's role tally was `if gallery {...} else { primaryCount++ }` — a
  // catch-all that was correct while only two roles existed and became a
  // silent miscount the moment a third arrived: three model files would have
  // reported as three extra primary logos. Adding a role means auditing every
  // consumer that switches on role, not just the producer.
  it('counts model/channel/model-manifest separately from primaryCount', async () => {
    const { runStats } = await import('../src/commands/stats.js');

    writeModelDir('subject-a', {
      'asset.glb': 'fake-glb',
      'ch_flat.webp': 'fake-webp',
      'view.json': '{}',
    });
    const manifestPath = join(tempDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(generateManifest(logosDir), null, 2));

    // runStats emits its --json success payload via console.log (the
    // process.stdout.write path is only used by its two error branches), so
    // capture the same primitive stats.test.ts does.
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    try {
      await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    } finally {
      logSpy.mockRestore();
    }

    const result = JSON.parse(lines[lines.length - 1]!);
    expect(result.modelCount).toBe(3);
    expect(result.primaryCount).toBe(1); // the readme.png only
    expect(result.galleryCount).toBe(0);
    expect(result.manifestEntries).toBe(4);
  });

  it('shows the primary count in human output when models exist but galleries do not', async () => {
    // Regression for a display gap this change introduced: the split block was
    // gated on galleryCount alone, so a model-only registry printed
    // "Manifest entries: 4 / Model assets: 3" and left the primary
    // unexplained — the exact mystery the block exists to prevent.
    const { runStats } = await import('../src/commands/stats.js');

    writeModelDir('subject-a', { 'asset.glb': 'g', 'ch_flat.webp': 'w', 'view.json': '{}' });
    const manifestPath = join(tempDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(generateManifest(logosDir), null, 2));

    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    try {
      await runStats({ logos: logosDir, manifest: manifestPath });
    } finally {
      logSpy.mockRestore();
    }

    const text = lines.join('\n');
    expect(text).toMatch(/Primary logos:\s+\S*1/);
    expect(text).toMatch(/Model assets:\s+\S*3/);
    expect(text).not.toMatch(/Gallery images/);
  });
});

describe('view.json schema', () => {
  const fixture = (name: string): string =>
    readFileSync(join(__dirname, 'fixtures', 'model-views', `${name}.view.json`), 'utf-8');

  it('parses the DEGENERATE case — two channels, every optional block absent', () => {
    // Fixture 2. Built before the rich case on purpose: a schema proven from
    // two subjects from birth never grows a bump shaped like the first one.
    const v = parseModelView(fixture('degenerate'), 'degenerate.view.json');

    expect(v.schema).toBe(MODEL_VIEW_SCHEMA);
    expect(v.channels).toHaveLength(2);
    expect(v.channels.every(c => c.categorical === false)).toBe(true);
    expect(v.subject).toBeUndefined();
    expect(v.provenance).toBeUndefined();
    expect(v.cameras).toBeUndefined();
    expect(v.budget).toBeUndefined();
  });

  it('parses the RICH case — provenance, cameras, budget, two categorical layers', () => {
    const v = parseModelView(fixture('rich'), 'rich.view.json');

    expect(v.channels).toHaveLength(3);
    expect(v.channels.filter(c => c.categorical)).toHaveLength(2);
    expect(v.cameras).toHaveLength(2);
    expect(v.provenance?.receipt?.value).toBeNull();
  });

  it('accepts a FOURTH channel added by editing data only — the seam test', () => {
    // Fixture 3. If this ever needs a change to src/, brand has learned a
    // subject's vocabulary and the mechanism/semantics seam has failed.
    const rich = JSON.parse(fixture('rich'));
    rich.channels.push({
      id: 'layer-c',
      label: 'A layer this build has never heard of',
      texture: 'ch_layer_c.png',
      filter: 'nearest',
      categorical: true,
      palette: ['#000000', '#ffffff'],
    });

    const v = parseModelView(JSON.stringify(rich), 'rich+1.view.json');
    expect(v.channels).toHaveLength(4);
    expect(v.channels[3].id).toBe('layer-c');
  });

  it('refuses a categorical channel that is linear-filtered', () => {
    const bad = JSON.stringify({
      schema: MODEL_VIEW_SCHEMA,
      asset: 'a.glb',
      channels: [
        { id: 'c', label: 'C', texture: 'c.png', filter: 'linear', categorical: true, palette: ['#000000'] },
      ],
    });
    expect(() => parseModelView(bad, 'bad.json')).toThrow(ModelViewParseError);
    expect(() => parseModelView(bad, 'bad.json')).toThrow(/must be "nearest"/);
  });

  it('refuses a categorical channel with no declared palette', () => {
    const bad = JSON.stringify({
      schema: MODEL_VIEW_SCHEMA,
      asset: 'a.glb',
      channels: [{ id: 'c', label: 'C', texture: 'c.png', filter: 'nearest', categorical: true }],
    });
    expect(() => parseModelView(bad, 'bad.json')).toThrow(/declares no palette/);
  });

  it('refuses duplicate channel ids', () => {
    const bad = JSON.stringify({
      schema: MODEL_VIEW_SCHEMA,
      asset: 'a.glb',
      channels: [
        { id: 'dup', label: 'A', texture: 'a.png', filter: 'linear', categorical: false },
        { id: 'dup', label: 'B', texture: 'b.png', filter: 'linear', categorical: false },
      ],
    });
    expect(() => parseModelView(bad, 'bad.json')).toThrow(/must be unique/);
  });

  it('refuses an empty channel list and an unknown schema', () => {
    expect(() =>
      parseModelView(JSON.stringify({ schema: MODEL_VIEW_SCHEMA, asset: 'a.glb', channels: [] }), 'p')
    ).toThrow(/non-empty array/);
    expect(() =>
      parseModelView(JSON.stringify({ schema: 'brand.model-view/99', asset: 'a.glb', channels: [] }), 'p')
    ).toThrow(/Unsupported schema/);
  });
});
