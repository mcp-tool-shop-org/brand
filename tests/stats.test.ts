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
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-stats-test-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });

  stdout = [];
  stderr = [];
  exitCode = null;
  // F-f4900c6e reset: stats.ts now sets process.exitCode instead of calling
  // process.exit() for its two error paths. Start every test from a clean
  // slate so a leftover value from a PRIOR test (or from vitest's own
  // machinery) never leaks into this test's assertions.
  process.exitCode = undefined;
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
  // stats.ts's error paths write their --json payload via
  // process.stdout.write (not console.log), which the console.log spy above
  // cannot see -- without this, that JSON blob bypasses every mock and
  // prints straight to the real terminal during `npm test` (visible, unwanted
  // noise) and parseJsonOutput() below has nothing to read for those paths.
  // Capturing it into the SAME `stdout` array makes parseJsonOutput() work
  // uniformly regardless of which primitive a given code path uses.
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdout.push(String(chunk).replace(/\n$/, ''));
    return true;
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
  stdoutWriteSpy.mockRestore();
  // Guard against a test leaking a non-zero exitCode into vitest's own
  // worker process (pool: 'forks' isolates by FILE, not by individual test).
  process.exitCode = undefined;
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

/** Parse the most-recent JSON payload written to stdout (via console.log OR process.stdout.write — see stdoutWriteSpy above). */
function parseJsonOutput(): {
  ok?: boolean;
  totalLogos: number;
  formats: Record<string, number>;
  manifestEntries: number;
  primaryCount?: number;
  galleryCount?: number;
  galleries?: Record<string, number>;
  missing: string[];
  untracked: string[];
  error?: string;
  message?: string;
} {
  const last = stdout[stdout.length - 1];
  return JSON.parse(last);
}

/** Seed a gallery subfolder under a slug with the given image filenames. */
function seedGallery(slug: string, gallery: string, files: string[]): void {
  const dir = join(logosDir, slug, gallery);
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f), `fake-${slug}-${f}`);
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

  // gallery-only-slug false "missing from disk" bug: `slugs` (used to build
  // the old comparison set) only comes from the `*/readme.<ext>` glob, so a
  // slug with ONLY gallery images (no primary readme) was invisible to it --
  // even though generateManifest correctly tracks the gallery images and
  // manifestSlugs correctly includes the slug. The slug's gallery content is
  // very much present on disk; it was reported as "missing" purely because
  // it has no PRIMARY logo, which is a different fact entirely.
  it('does not report a gallery-only slug (no primary readme) as missing from disk', async () => {
    seedLogos({ alpha: 'png' });
    seedGallery('gallery-only', 'turnarounds', ['a.png']);
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.missing).toEqual([]);
  });

  // Symmetric case: a gallery-only slug that's on disk but NOT yet captured
  // into the manifest must show up as untracked, the same as a primary-only
  // untracked slug already did. The old `slugs` (primary-only) comparison
  // base silently missed this too.
  it('detects a gallery-only slug as untracked when it is on disk but not yet in the manifest', async () => {
    seedLogos({ alpha: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);
    // Add a gallery-only slug to disk AFTER the manifest was written.
    seedGallery('new-gallery-only', 'turnarounds', ['a.png']);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.untracked).toContain('new-gallery-only');
    expect(out.missing).toEqual([]);
  });

  // No `ok` field at all in the success JSON shape while every sibling
  // command (verify/audit/manifest --check) has one. `ok` mirrors this
  // file's own "in sync" success condition (missing/untracked both empty).
  it('includes ok:true in the JSON shape when disk and manifest are in sync', async () => {
    seedLogos({ alpha: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.ok).toBe(true);
  });

  it('includes ok:false in the JSON shape when there is missing/untracked drift', async () => {
    seedLogos({ alpha: 'png', beta: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);
    rmSync(join(logosDir, 'beta'), { recursive: true, force: true });

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.ok).toBe(false);
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

  // pins F-CORE-009 (friendly error on malformed JSON) AND the F-f4900c6e /
  // missing-`else` fixes together. This replaces the old version of this
  // test, which asserted on `stderr` even in --json mode -- that was pinning
  // the missing-`else` BUG itself: stats.ts used to run its two
  // console.error() calls unconditionally, so --json mode wrote the clean
  // JSON payload to stdout AND ALSO leaked the human-readable message + fix
  // hint to stderr every time, contradicting "JSON mode: single object on
  // stdout, nothing else" (see audit.ts's own doc comment for that contract).
  // It also relied on runStats() REJECTING via the old process.exit() mock
  // -- that mechanism is gone too (F-f4900c6e: exitCode instead of exit()),
  // so runStats() now resolves normally and the exit signal is
  // process.exitCode, not a thrown/rejected error.
  it('emits ONLY a JSON payload on stdout (nothing on stderr) with a friendly message on malformed JSON manifest, --json mode', async () => {
    seedLogos({ alpha: 'png' });
    writeFileSync(manifestPath, '{ not valid json', 'utf-8');

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr).toEqual([]);
    const out = parseJsonOutput();
    expect(out.ok).toBe(false);
    expect(out.error).toBe('parse');
    expect(out.message).toMatch(/not valid JSON|invalid JSON|JSON/i);
  });

  // Companion case: the SAME error, but human (non-JSON) mode — must still
  // print the friendly message + fix hint to stderr exactly as before. The
  // missing-`else` fix only changes what happens when --json is set; this
  // pins that the human-mode path is untouched.
  it('prints a friendly message + fix hint to stderr on malformed JSON manifest, human mode', async () => {
    seedLogos({ alpha: 'png' });
    writeFileSync(manifestPath, '{ not valid json', 'utf-8');

    await runStats({ logos: logosDir, manifest: manifestPath, json: false });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    const joined = stderr.join('\n');
    expect(joined).toMatch(/not valid JSON|invalid JSON|JSON/i);
    expect(joined).toMatch(/Fix:/);
  });

  // brand-core-04 — the primary/gallery role split (v1.0.6 headline data).
  it('reports primaryCount / galleryCount / galleries in JSON', async () => {
    seedLogos({ alpha: 'png' });
    seedGallery('alpha', 'turnarounds', ['a.png', 'b.png']);
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: true });
    const out = parseJsonOutput();

    expect(out.manifestEntries).toBe(3);
    expect(out.primaryCount).toBe(1);
    expect(out.galleryCount).toBe(2);
    expect(out.galleries?.['alpha/turnarounds']).toBe(2);
  });

  // brand-core-01 — a missing logos dir is an operator error (exit 2), not a
  // green "in sync" pass over an empty scan.
  //
  // Updated for F-f4900c6e: stats.ts now sets process.exitCode instead of
  // calling process.exit() right after its stdout/stderr write (avoids
  // truncating a piped write — see verify.ts's F-f0c1a1f8). runStats() used
  // to REJECT via the mocked process.exit() throwing; it now resolves
  // normally, so the exit signal is asserted via process.exitCode instead.
  it('sets process.exitCode 2 when the logos dir does not exist (does not call process.exit)', async () => {
    await runStats({ logos: join(tempDir, 'does-not-exist'), manifest: manifestPath, json: false });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
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

  it('prints the Primary/Gallery split when galleries exist (brand-core-04)', async () => {
    seedLogos({ alpha: 'png' });
    seedGallery('alpha', 'turnarounds', ['a.png', 'b.png']);
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: false });
    const joined = stdout.join('\n');
    expect(joined).toContain('Primary logos:');
    expect(joined).toContain('Gallery images:');
    expect(joined).toMatch(/across 1 gallery/);
  });

  it('omits the split for a gallery-free registry', async () => {
    seedLogos({ alpha: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: false });
    const joined = stdout.join('\n');
    expect(joined).not.toContain('Gallery images:');
  });

  // --quiet used to do nothing at all in stats.ts (the option was declared
  // and threaded through but never read anywhere in the function body).
  // Per the global flag's own contract ("Suppress per-item progress output
  // (only summaries and errors)"), quiet should drop the itemized per-slug
  // listings while keeping the count-bearing summary line.
  it('--quiet suppresses itemized missing/untracked slug lines but keeps the summary count line', async () => {
    seedLogos({ alpha: 'png', beta: 'png' });
    writeManifest(generateManifest(logosDir), manifestPath);
    rmSync(join(logosDir, 'beta'), { recursive: true, force: true });

    await runStats({ logos: logosDir, manifest: manifestPath, json: false, quiet: true });
    const joined = stdout.join('\n');

    expect(joined).toMatch(/Missing from disk \(1\)/);
    expect(joined).not.toContain('- beta');
  });

  // --quiet wins over --verbose for the per-gallery breakdown, matching
  // audit.ts's identical precedence for its own per-issue fix hint.
  it('--quiet suppresses the verbose per-gallery breakdown even when --verbose is also set', async () => {
    seedLogos({ alpha: 'png' });
    seedGallery('alpha', 'turnarounds', ['a.png', 'b.png']);
    writeManifest(generateManifest(logosDir), manifestPath);

    await runStats({ logos: logosDir, manifest: manifestPath, json: false, verbose: true, quiet: true });
    const joined = stdout.join('\n');

    expect(joined).toContain('Gallery images:');
    expect(joined).not.toContain('alpha/turnarounds:');
  });
});
