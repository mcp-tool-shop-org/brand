/**
 * stats tests — isolated, value-asserting, runs runStats() directly.
 *
 * Each test builds a temp `logos/` tree and a temp `manifest.json` so
 * results never depend on the live repo state. Output is captured by
 * stubbing console.log + console.error.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runStats } from '../src/commands/stats.js';
import { generateManifest, writeManifest } from '../src/manifest.js';

let tempDir: string;
let logosDir: string;
let manifestPath: string;
let stdout: string[];
let stderr: string[];
let exitCode: number | null;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-stats-test-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });

  stdout = [];
  stderr = [];
  exitCode = null;
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`__EXIT__:${exitCode}`);
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
  rmSync(tempDir, { recursive: true, force: true });
});

/** Build a small logo tree with the given slugs+exts. */
function seedLogos(spec: Record<string, string>): void {
  for (const [slug, ext] of Object.entries(spec)) {
    const dir = join(logosDir, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `readme.${ext}`), `fake-${ext}-${slug}`);
  }
}

/** Parse the most-recent `console.log(JSON.stringify(...))` output. */
function parseJsonOutput(): {
  totalLogos: number;
  formats: Record<string, number>;
  manifestEntries: number;
  missing: string[];
  untracked: string[];
} {
  const last = stdout[stdout.length - 1];
  return JSON.parse(last);
}

describe('runStats (--json)', () => {
  it('manifestEntries equals the asset count in the manifest', async () => {
    seedLogos({ alpha: 'png', beta: 'jpg' });
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);

    // sanity: manifest has exactly 2 assets
    expect(Object.keys(manifest.assets)).toHaveLength(2);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    // pins F-CORE-001 — must read manifest.assets, not the whole manifest
    expect(out.manifestEntries).toBe(2);
    expect(out.totalLogos).toBe(2);
  });

  it('manifestEntries reflects a 5-asset manifest correctly', async () => {
    seedLogos({ a: 'png', b: 'jpg', c: 'jpeg', d: 'svg', e: 'webp' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.manifestEntries).toBe(5);
    expect(out.totalLogos).toBe(5);
  });

  it('reports formats keyed by .ext', async () => {
    seedLogos({ p: 'png', j: 'jpg' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.formats['.png']).toBe(1);
    expect(out.formats['.jpg']).toBe(1);
  });

  it('emits an empty missing[] when manifest and disk are in sync', async () => {
    seedLogos({ alpha: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.missing).toEqual([]);
    expect(out.untracked).toEqual([]);
  });

  it('detects untracked slugs (on disk, not in manifest)', async () => {
    seedLogos({ alpha: 'png' });
    // write manifest now (only alpha)
    writeManifest(generateManifest(logosDir), manifestPath);
    // then add a new slug to disk
    mkdirSync(join(logosDir, 'beta'), { recursive: true });
    writeFileSync(join(logosDir, 'beta', 'readme.png'), 'fake-png-beta');

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.untracked).toContain('beta');
    expect(out.missing).toEqual([]);
  });

  it('detects missing slugs (in manifest, not on disk)', async () => {
    seedLogos({ alpha: 'png', beta: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);
    // remove beta from disk after manifest was written
    rmSync(join(logosDir, 'beta'), { recursive: true, force: true });

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.missing).toContain('beta');
    expect(out.untracked).toEqual([]);
  });

  it('extracts slugs without backslashes (cross-platform safe)', async () => {
    // pins F-CORE-002 — slugs must be normalised from \ to /
    seedLogos({ 'cross-platform-slug': 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    // No backslashes should ever appear in keys/slugs
    const all = JSON.stringify(out);
    expect(all.includes('\\')).toBe(false);
    expect(out.untracked).toEqual([]);
    expect(out.missing).toEqual([]);
  });

  it('exits 1 with a friendly message on malformed JSON manifest', async () => {
    // pins F-CORE-009 — friendly error on malformed JSON
    seedLogos({ alpha: 'png' });
    writeFileSync(manifestPath, '{ not valid json', 'utf-8');

    await expect(
      runStats({ logos: logosDir, manifest: manifestPath, json: true })
    ).rejects.toThrow(/__EXIT__:1/);

    expect(exitCode).toBe(1);
    const joined = stderr.join('\n');
    expect(joined).toMatch(/not valid JSON|invalid JSON|JSON/i);
  });

  it('handles >10 missing slugs with truncation in human-readable output', async () => {
    // build a manifest with 15 slugs, then remove all from disk
    const spec: Record<string, string> = {};
    for (let i = 0; i < 15; i++) spec[`s${i.toString().padStart(2, '0')}`] = 'png';
    seedLogos(spec);
    writeManifest(generateManifest(logosDir), manifestPath);
    // wipe disk
    rmSync(logosDir, { recursive: true, force: true });
    mkdirSync(logosDir, { recursive: true });

    await runStats({ logos: logosDir, manifest: manifestPath, json: false });

    const joined = stdout.join('\n');
    expect(joined).toMatch(/Missing from disk \(15\)/);
    expect(joined).toMatch(/and 5 more/);
  });
});

describe('runStats (human output)', () => {
  it('prints logo count and manifest entries lines', async () => {
    seedLogos({ alpha: 'png', beta: 'jpg' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: false });
    const joined = stdout.join('\n');
    expect(joined).toContain('Logos on disk:');
    expect(joined).toContain('Manifest entries:');
    expect(joined).toContain('Formats:');
  });

  it("reports 'in sync' when manifest matches disk", async () => {
    seedLogos({ alpha: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: false });
    const joined = stdout.join('\n');
    expect(joined).toMatch(/in sync/);
  });
});
