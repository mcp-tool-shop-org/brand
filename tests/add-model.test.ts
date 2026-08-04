/**
 * Step 2 of docs/model-channels-spec.md — `brand add-model` and CHECK-CAT.
 *
 * add-model is the only safe door into the model role, so these tests are
 * mostly about REFUSALS: every gate is asserted to actually stop the install,
 * because a gate that cannot fail is not a gate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAddModel } from '../src/commands/add-model.js';
import { generateManifest, writeManifest, readManifest, MODEL_DIR } from '../src/manifest.js';
import { readPngInfo, checkCategoricalPalette, PngParseError } from '../src/png-palette.js';
import { indexedPng, truecolourPng } from './_helpers/png-builder.mjs';

const PALETTE = ['#000000', '#3b7dd8', '#d8a13b'];

let tempDir: string;
let logosDir: string;
let manifestPath: string;
let sourceDir: string;
let logs: string[];
let errors: string[];

function view(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 'brand.model-view/1',
    asset: 'asset.glb',
    channels: [
      { id: 'flat', label: 'Texture', texture: 'ch_flat.webp', filter: 'linear', categorical: false },
      {
        id: 'layer-a',
        label: 'Layer A',
        texture: 'ch_layer_a.png',
        filter: 'nearest',
        categorical: true,
        palette: PALETTE,
      },
    ],
    ...overrides,
  });
}

function seedSource(files?: Record<string, Buffer | string>): void {
  mkdirSync(sourceDir, { recursive: true });
  const defaults: Record<string, Buffer | string> = {
    'asset.glb': Buffer.from('fake-glb-bytes'),
    'ch_flat.webp': Buffer.from('fake-webp-bytes'),
    'ch_layer_a.png': indexedPng(PALETTE),
    'view.json': view(),
  };
  for (const [name, content] of Object.entries(files ?? defaults)) {
    writeFileSync(join(sourceDir, name), content as never);
  }
}

async function run(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  logs = [];
  errors = [];
  process.exitCode = undefined;
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '));
  });
  try {
    await runAddModel({
      slug: 'subject-a',
      from: sourceDir,
      logos: logosDir,
      manifest: manifestPath,
      json: true,
      ...opts,
    } as never);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return JSON.parse(logs[logs.length - 1]!);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-addmodel-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');
  sourceDir = join(tempDir, 'src-model');
  mkdirSync(join(logosDir, 'subject-a'), { recursive: true });
  writeFileSync(join(logosDir, 'subject-a', 'readme.png'), 'fake-primary');
  writeManifest(generateManifest(logosDir), manifestPath);
});

afterEach(() => {
  process.exitCode = undefined;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('png-palette — the mechanism behind CHECK-CAT', () => {
  it('reads an indexed PNG palette in index order', () => {
    const info = readPngInfo(indexedPng(PALETTE), 'p.png');
    expect(info.colourType).toBe(3);
    expect(info.palette).toEqual(PALETTE);
  });

  it('reports truecolour as colour type 2 with no palette', () => {
    const info = readPngInfo(truecolourPng(['#ff0000', '#00ff00']), 'p.png');
    expect(info.colourType).toBe(2);
    expect(info.palette).toBeNull();
  });

  it('passes when the file palette is a SUBSET of the declared palette', () => {
    const r = checkCategoricalPalette(indexedPng(['#000000', '#3b7dd8']), PALETTE, 'p.png');
    expect(r.ok).toBe(true);
    expect(r.undeclared).toEqual([]);
    expect(r.unused).toEqual(['#d8a13b']); // reported, never a failure
  });

  it('fails on a colour the palette does not declare', () => {
    const r = checkCategoricalPalette(indexedPng([...PALETTE, '#ff00ff']), PALETTE, 'p.png');
    expect(r.ok).toBe(false);
    expect(r.undeclared).toEqual(['#ff00ff']);
  });

  it('REFUSES a non-indexed PNG rather than degrading to a sample', () => {
    // In truecolour the pixels are not bounded by a palette, so a subset proof
    // is unavailable. Returning "ok" here would be an unenforceable guarantee.
    expect(() => checkCategoricalPalette(truecolourPng(['#000000']), PALETTE, 'p.png')).toThrow(
      PngParseError
    );
    expect(() => checkCategoricalPalette(truecolourPng(['#000000']), PALETTE, 'p.png')).toThrow(
      /colour type 3/
    );
  });

  it('rejects a non-PNG and a chunk running past EOF', () => {
    expect(() => readPngInfo(Buffer.from('not a png at all'), 'p')).toThrow(/bad signature/);
    const truncated = indexedPng(PALETTE).subarray(0, 20);
    expect(() => readPngInfo(truncated, 'p')).toThrow(PngParseError);
  });
});

describe('add-model — happy path', () => {
  it('installs and records the correct roles in the manifest', async () => {
    seedSource();
    const r = await run({ yes: true });

    expect(r.ok).toBe(true);
    expect(process.exitCode).toBeUndefined();

    const m = readManifest(manifestPath);
    expect(m.assets['logos/subject-a/model/asset.glb']?.role).toBe('model');
    expect(m.assets['logos/subject-a/model/ch_flat.webp']?.role).toBe('channel');
    expect(m.assets['logos/subject-a/model/ch_layer_a.png']?.role).toBe('channel');
    expect(m.assets['logos/subject-a/model/view.json']?.role).toBe('model-manifest');
    expect(m.assets['logos/subject-a/readme.png']?.role).toBe('primary');
  });

  it('leaves no scratch siblings behind', async () => {
    seedSource();
    await run({ yes: true });
    const siblings = readdirSync(join(logosDir, 'subject-a'));
    expect(siblings.filter(n => n.includes('brand-staging') || n.includes('brand-backup'))).toEqual([]);
    expect(siblings.sort()).toEqual(['model', 'readme.png']);
  });

  it('reports untracked extensions instead of silently copying or skipping them', async () => {
    seedSource();
    writeFileSync(join(sourceDir, 'notes.txt'), 'scratch');
    const r = await run({ yes: true });

    expect(r.untracked).toEqual(['notes.txt']);
    expect(existsSync(join(logosDir, 'subject-a', MODEL_DIR, 'notes.txt'))).toBe(false);
  });

  it('reports a budget overage WITHOUT failing — budget is a diagnostic, not a gate', async () => {
    seedSource();
    writeFileSync(join(sourceDir, 'view.json'), view({ budget: { asset_bytes: 4 } }));
    const r = await run({ yes: true });

    expect(r.ok).toBe(true);
    expect((r.budgetNotes as string[]).length).toBe(1);
    expect((r.budgetNotes as string[])[0]).toMatch(/over its declared/);
  });
});

describe('add-model — refusals', () => {
  it('refuses a real run without --yes and writes nothing', async () => {
    seedSource();
    const r = await run();

    expect(r.ok).toBe(false);
    expect(r.error).toBe('needs-confirmation');
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(logosDir, 'subject-a', MODEL_DIR))).toBe(false);
  });

  it('--dry-run runs every gate and writes nothing', async () => {
    seedSource();
    const before = readFileSync(manifestPath, 'utf-8');
    const r = await run({ dryRun: true });

    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(existsSync(join(logosDir, 'subject-a', MODEL_DIR))).toBe(false);
    expect(readFileSync(manifestPath, 'utf-8')).toBe(before);
  });

  it('GATE-SEQUENCE: refuses when the manifest predates the model role', async () => {
    seedSource();
    // Simulate a manifest generated by a pre-MODEL_DIR build: model files
    // filed as gallery images. Structurally valid, verifies clean, wrong.
    const m = readManifest(manifestPath);
    m.assets['logos/subject-a/model/asset.glb'] = {
      hash: 'sha256:' + '0'.repeat(64),
      size: 1,
      format: 'glb',
      role: 'gallery',
      gallery: 'model',
    };
    writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    const r = await run({ yes: true });
    expect(r.error).toBe('gate-sequence');
    expect(process.exitCode).toBe(2);
    expect(r.message).toMatch(/brand manifest/);
    expect(existsSync(join(logosDir, 'subject-a', MODEL_DIR))).toBe(false);
  });

  it('refuses a nested layout LOUDLY instead of copying unhashable files', async () => {
    seedSource();
    mkdirSync(join(sourceDir, 'channels'), { recursive: true });
    writeFileSync(join(sourceDir, 'channels', 'flat.webp'), 'nested');

    const r = await run({ yes: true });
    expect(r.error).toBe('nested-layout');
    expect(process.exitCode).toBe(2);
    expect(r.message).toMatch(/never hashed/);
  });

  it('refuses when view.json is absent', async () => {
    seedSource({ 'asset.glb': Buffer.from('x') });
    const r = await run({ yes: true });
    expect(r.error).toBe('no-view-json');
    expect(process.exitCode).toBe(2);
  });

  it('refuses when view.json references a file that is not there', async () => {
    seedSource({
      'asset.glb': Buffer.from('x'),
      'ch_layer_a.png': indexedPng(PALETTE),
      'view.json': view(),
      // ch_flat.webp deliberately absent
    });
    const r = await run({ yes: true });
    expect(r.error).toBe('missing-referenced-file');
    expect(r.message).toMatch(/ch_flat\.webp/);
  });

  it('CHECK-CAT: refuses a categorical channel carrying an undeclared colour', async () => {
    seedSource({
      'asset.glb': Buffer.from('x'),
      'ch_flat.webp': Buffer.from('y'),
      'ch_layer_a.png': indexedPng([...PALETTE, '#ff00ff']),
      'view.json': view(),
    });
    const r = await run({ yes: true });

    expect(r.error).toBe('check-cat');
    expect(process.exitCode).toBe(2);
    expect(r.message).toMatch(/#ff00ff/);
    expect(r.message).toMatch(/no measurement produced/);
    expect(existsSync(join(logosDir, 'subject-a', MODEL_DIR))).toBe(false);
  });

  it('CHECK-CAT: refuses a categorical channel that is not an indexed PNG', async () => {
    seedSource({
      'asset.glb': Buffer.from('x'),
      'ch_flat.webp': Buffer.from('y'),
      'ch_layer_a.png': truecolourPng(['#000000', '#3b7dd8']),
      'view.json': view(),
    });
    const r = await run({ yes: true });

    expect(r.error).toBe('check-cat');
    expect(r.message).toMatch(/INDEXED PNG/);
  });

  it('refuses an invalid view.json before touching anything', async () => {
    seedSource();
    writeFileSync(join(sourceDir, 'view.json'), '{ not json');
    const r = await run({ yes: true });
    expect(r.error).toBe('invalid-view-json');
    expect(process.exitCode).toBe(2);
  });

  it('refuses an unknown slug and a missing --from', async () => {
    seedSource();
    const bad = await run({ yes: true, slug: 'does-not-exist' });
    expect(bad.error).toBe('slug-not-found');

    rmSync(sourceDir, { recursive: true, force: true });
    const noSrc = await run({ yes: true });
    expect(noSrc.error).toBe('source-not-found');
  });
});

describe('add-model — replacing an existing model', () => {
  it('replaces in place and reports it, leaving no backup behind', async () => {
    seedSource();
    await run({ yes: true });

    writeFileSync(join(sourceDir, 'asset.glb'), Buffer.from('second-version-bytes'));
    const r = await run({ yes: true });

    expect(r.ok).toBe(true);
    expect(r.replacing).toBe(true);
    expect(readFileSync(join(logosDir, 'subject-a', MODEL_DIR, 'asset.glb'), 'utf-8')).toBe(
      'second-version-bytes'
    );
    const siblings = readdirSync(join(logosDir, 'subject-a'));
    expect(siblings.filter(n => n.startsWith('.brand-'))).toEqual([]);
  });
});
