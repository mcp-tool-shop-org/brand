/**
 * manifest CLI tests — exercise `brand manifest` and `brand manifest --check`.
 *
 * These run the BUILT CLI in a child_process because the exit-code contract
 * is the load-bearing part: CI uses `--check` and an exit code of 1
 * is the failure signal. Mocking process.exit elsewhere can't validate that.
 * `pretest: npm run build` keeps dist/cli.js current.
 *
 * Covers F-TESTS-005:
 *   - happy path: `manifest` writes the file and exits 0
 *   - --check clean → exit 0
 *   - --check drift: added key → exit 1, stderr marker
 *   - --check drift: removed key → exit 1, stderr marker
 *   - --check drift: changed hash → exit 1, stderr marker
 *   - --check missing manifest → exit 1, stderr marker
 *   - --check malformed JSON → exit 1, friendly message (F-CORE-010)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = join(import.meta.dirname, '..', 'dist', 'cli.js');

let tempDir: string;
let logosDir: string;
let manifestPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-manifestcmd-test-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function seedLogo(slug: string, ext: string, body = `fake-${ext}`): void {
  const dir = join(logosDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `readme.${ext}`), body);
}

function runCli(...args: string[]) {
  return spawnSync('node', [BIN, ...args], {
    encoding: 'utf-8',
    timeout: 15_000,
    cwd: tempDir,
  });
}

describe('brand manifest (CLI happy path)', () => {
  it('writes the manifest file to the configured output and exits 0', () => {
    seedLogo('alpha', 'png');

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath);

    expect(r.status).toBe(0);
    expect(existsSync(manifestPath)).toBe(true);
    const stored = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(stored.assets['logos/alpha/readme.png']).toBeDefined();
    expect(stored.version).toBe('1.0');
    expect(stored.algorithm).toBe('sha256');
  });
});

// F-0b8e6404 (CRITICAL) — a missing/mistyped --logos silently produced an
// EMPTY manifest ({assets: {}}) with no error, which generate mode then
// wrote straight over whatever was already on disk. A one-character typo in
// a CI script (e.g. "logoss" instead of "logos") destroyed the entire
// integrity record while printing a green success line and exiting 0.
// runManifest() had no existsSync guard on opts.logos, unlike stats.ts and
// audit.ts, which both already treat a missing --logos as an operator error
// (exit 2). This is the permanent regression guard: it seeds a REAL
// manifest, runs `manifest` with a bad --logos, and asserts the manifest
// file is byte-for-byte UNCHANGED on disk and the exit code is 2.
describe('brand manifest (bad --logos does not destroy an existing manifest)', () => {
  it('exits 2 and leaves the manifest file BYTE-FOR-BYTE UNCHANGED when --logos does not exist (generate mode)', () => {
    seedLogo('alpha', 'png');
    // Legitimate run first — produces a real, non-empty manifest on disk.
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);
    const before = readFileSync(manifestPath, 'utf-8');
    expect(JSON.parse(before).assets['logos/alpha/readme.png']).toBeDefined();

    // Re-run with a typo'd/non-existent --logos, same --output. This is the
    // exact "in-place regenerate" workflow a CI script would run.
    const badLogos = join(tempDir, 'logoss'); // typo — does not exist
    const r = runCli('manifest', '--logos', badLogos, '--output', manifestPath);

    expect(r.status).toBe(2);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/logos directory not found/i);

    const after = readFileSync(manifestPath, 'utf-8');
    expect(after).toBe(before);
    expect(JSON.parse(after).assets['logos/alpha/readme.png']).toBeDefined();
  });

  // Same CRITICAL finding — the guard must also protect --check mode (its
  // OTHER caller), not just generate mode. Before the fix, a bad --logos
  // under --check made generateManifest() return {assets: {}}, so every
  // real stored asset was reported as spurious "removed" drift (exit 1) --
  // actively misleading, since the manifest is fine and --logos is wrong.
  it('exits 2 (not spurious "removed" drift) when --logos does not exist under --check', () => {
    seedLogo('alpha', 'png');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);
    const before = readFileSync(manifestPath, 'utf-8');

    const badLogos = join(tempDir, 'logoss');
    const r = runCli('manifest', '--logos', badLogos, '--output', manifestPath, '--check');

    expect(r.status).toBe(2);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/logos directory not found/i);
    expect(combined).not.toMatch(/removed|out of date/i);

    // --check never writes, but confirm the on-disk manifest is untouched too.
    expect(readFileSync(manifestPath, 'utf-8')).toBe(before);
  });
});

// Zero-asset overwrite guard — companion protection for the same CRITICAL
// finding. --logos can EXIST but still resolve to zero assets (an emptied
// directory, or a real-but-wrong path), which silently overwrote a
// previously non-empty manifest with {assets: {}} just as destructively as
// the missing-path case, without an existsSync failure to catch it.
describe('brand manifest (zero-asset overwrite guard)', () => {
  it('exits 2 and leaves the manifest UNCHANGED when --logos exists but is now empty (would zero out a non-empty manifest)', () => {
    seedLogo('alpha', 'png');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);
    const before = readFileSync(manifestPath, 'utf-8');

    // Empty the (still-existing) logos directory — simulates an accidentally
    // emptied directory rather than a mistyped path.
    rmSync(join(logosDir, 'alpha'), { recursive: true, force: true });

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath);

    expect(r.status).toBe(2);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/refusing to overwrite/i);

    const after = readFileSync(manifestPath, 'utf-8');
    expect(after).toBe(before);
    expect(JSON.parse(after).assets['logos/alpha/readme.png']).toBeDefined();
  });

  it('does NOT block a legitimate empty result when there is no prior manifest to lose (first-run bootstrap)', () => {
    // No prior manifest at all, and an empty (but existing) logos dir.
    expect(existsSync(manifestPath)).toBe(false);

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath);

    expect(r.status).toBe(0);
    expect(existsSync(manifestPath)).toBe(true);
    const stored = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(Object.keys(stored.assets)).toHaveLength(0);
  });

  it('does NOT block re-writing an empty result when the prior manifest was ALREADY empty (no known-good data at risk)', () => {
    // First write: logos dir is empty -> manifest.json already has 0 assets.
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);
    expect(JSON.parse(readFileSync(manifestPath, 'utf-8')).assets).toEqual({});

    // Second write: still empty -> must succeed again (nothing to lose).
    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath);
    expect(r.status).toBe(0);
  });

  it('--json reports the zero-asset-overwrite error with the previous asset count', () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);
    rmSync(logosDir, { recursive: true, force: true });
    mkdirSync(logosDir, { recursive: true });

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--json');
    expect(r.status).toBe(2);
    const json = JSON.parse(r.stdout);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('zero-asset-overwrite');
    expect(json.previousCount).toBe(2);
  });
});

describe('brand manifest --check', () => {
  it('exits 0 when manifest matches disk (clean)', () => {
    seedLogo('alpha', 'png');
    // first: write the manifest
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);

    // then: --check should pass
    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/up to date/i);
  });

  it('exits 1 when a key has been ADDED on disk since manifest was written', () => {
    seedLogo('alpha', 'png');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);

    // Add a new asset that's not in the manifest yet
    seedLogo('beta', 'png');

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/logos\/beta\/readme\.png/);
    expect(combined).toMatch(/new|added|not in manifest/i);
  });

  it('exits 1 when a key has been REMOVED from disk', () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);

    // Remove beta from disk (still in manifest)
    rmSync(join(logosDir, 'beta'), { recursive: true, force: true });

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/logos\/beta\/readme\.png/);
    expect(combined).toMatch(/removed|still in manifest/i);
  });

  it('exits 1 when a file HASH has changed (content tamper)', () => {
    seedLogo('alpha', 'png', 'original-bytes');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);

    // Tamper with the byte content but keep the path/name
    writeFileSync(join(logosDir, 'alpha', 'readme.png'), 'TAMPERED-different-bytes');

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/logos\/alpha\/readme\.png/);
    expect(combined).toMatch(/hash changed|changed/i);
  });

  // F-f4900c6e fallthrough guard (human --check mode) — converting
  // process.exit(1) to `process.exitCode = 1; return;` is only safe with the
  // explicit return. process.exit() used to hard-stop immediately; without
  // the return, control would fall through to the "up to date" success
  // message printed right after the drift error, even though drift was just
  // reported. Deterministic (no timing/race dependency), unlike the
  // stdout-truncation concern F-f4900c6e is ultimately about.
  it('never prints "up to date" in the same run that reports drift (human --check mode)', () => {
    seedLogo('alpha', 'png');
    expect(runCli('manifest', '--logos', logosDir, '--output', manifestPath).status).toBe(0);
    seedLogo('beta', 'png'); // added post-manifest -> drift

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toMatch(/up to date/i);
  });

  // F-8aee4160 — missing manifest is an operator-config error, not drift;
  // exit 2 (matching verify.ts's contract for the identical ENOENT case),
  // reserving exit 1 strictly for actual drift (added/removed/hashChanged).
  it('exits 2 with a clear error when the manifest file does not exist', () => {
    seedLogo('alpha', 'png');
    // Don't write a manifest. --check should fail clearly.
    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(2);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/No manifest|not found|generate one/i);
  });

  // F-8aee4160 — malformed JSON is an operator error, not drift; exit 2
  // (matching verify.ts's contract for the identical ManifestParseError).
  it('exits 2 with a friendly message when the manifest is malformed JSON (F-CORE-010)', () => {
    seedLogo('alpha', 'png');
    writeFileSync(manifestPath, '{ not valid json', 'utf-8');

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(2);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/not valid JSON|invalid JSON/i);
  });
});
