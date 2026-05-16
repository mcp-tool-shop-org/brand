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

  it('exits 1 with a clear error when the manifest file does not exist', () => {
    seedLogo('alpha', 'png');
    // Don't write a manifest. --check should fail clearly.
    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/No manifest|not found|generate one/i);
  });

  it('exits 1 with a friendly message when the manifest is malformed JSON (F-CORE-010)', () => {
    seedLogo('alpha', 'png');
    writeFileSync(manifestPath, '{ not valid json', 'utf-8');

    const r = runCli('manifest', '--logos', logosDir, '--output', manifestPath, '--check');
    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/not valid JSON|invalid JSON/i);
  });
});
