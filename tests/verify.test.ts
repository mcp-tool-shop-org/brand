/**
 * verify CLI tests — exercise `brand verify`.
 *
 * Like manifest-cmd.test.ts, this runs the BUILT CLI in a child_process
 * because the README's headline security claim is the exit-code contract:
 * tamper -> exit 1, clean -> exit 0, missing manifest -> exit 1.
 *
 * Covers F-TESTS-006.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = join(import.meta.dirname, '..', 'dist', 'cli.js');

let tempDir: string;
let logosDir: string;
let manifestPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-verify-test-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function seedLogo(slug: string, ext: string, body = `fake-${ext}-${slug}`): void {
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

function generateManifestViaCli() {
  const r = spawnSync('node', [BIN, 'manifest', '--logos', logosDir, '--output', manifestPath], {
    encoding: 'utf-8',
    timeout: 15_000,
    cwd: tempDir,
  });
  if (r.status !== 0) throw new Error(`manifest gen failed: ${r.stdout} ${r.stderr}`);
}

describe('brand verify', () => {
  it('exits 0 on a clean tree and prints "integrity intact"', () => {
    seedLogo('alpha', 'png');
    generateManifestViaCli();

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath);

    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/integrity intact/i);
  });

  it('exits 1 with "Integrity check failed" when a logo is tampered', () => {
    seedLogo('alpha', 'png', 'original-bytes');
    generateManifestViaCli();

    // Tamper one byte (replace content entirely so hash definitely differs).
    writeFileSync(join(logosDir, 'alpha', 'readme.png'), 'TAMPERED');

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath);

    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/Integrity check failed/i);
    expect(combined).toMatch(/logos\/alpha\/readme\.png/);
  });

  it('exits 2 with "Manifest not found" when no manifest file exists', () => {
    seedLogo('alpha', 'png');
    // intentionally do not generate the manifest

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath);

    // Exit 2 = operator error (missing/invalid input). Distinguishes a missing
    // manifest from an integrity mismatch (exit 1) so CI can tell them apart.
    expect(r.status).toBe(2);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/Manifest not found/i);
  });

  it('exits 1 when a tracked file has been removed', () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    generateManifestViaCli();

    // Remove beta from disk after manifest was written.
    rmSync(join(logosDir, 'beta'), { recursive: true, force: true });

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath);

    expect(r.status).toBe(1);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/logos\/beta\/readme\.png/);
  });
});
