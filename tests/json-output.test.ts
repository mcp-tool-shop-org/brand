/**
 * json-output.test.ts — JSON-shape contract for every command's --json mode.
 *
 * Stage C (Humanization) — locks the machine-readable contract that
 * downstream automation (CI, the GitHub Action being shipped) will rely on.
 *
 * Each command's --json flag emits a single JSON object to stdout with a
 * documented shape. These tests assert that shape exists and is parseable,
 * and that exit codes follow the documented contract:
 *
 *   0 — success (clean / no findings)
 *   1 — integrity mismatch / drift / audit findings
 *   2 — operator error (missing manifest, bad flag, malformed manifest)
 *   3 — unexpected error (IO failure, internal bug)
 *
 * Most assertions are SHAPE-based rather than value-based — the Core agent
 * may iterate on field names; these tests verify that some sensible JSON
 * lands on stdout AND that the exit code matches the contract. Where a
 * specific field is required by README documentation (e.g. ok / verified /
 * changed for verify), the field is asserted by name.
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
  tempDir = mkdtempSync(join(tmpdir(), 'brand-jsonout-test-'));
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

/**
 * Parse the first valid JSON object on stdout. Tolerates extra newlines /
 * leading whitespace. Returns null if no parseable JSON found.
 */
function firstJsonObject(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Try parsing the first `{...}` block.
    const start = trimmed.indexOf('{');
    if (start < 0) return null;
    // naive brace-depth scan.
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1)) as Record<
              string,
              unknown
            >;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Strict purity assertion (F-c16826d1).
 *
 * firstJsonObject() above is DELIBERATELY lenient: on a parse failure it
 * falls back to a naive brace-depth scan that recovers the first `{...}`
 * block anywhere in stdout. That tolerance is the right default for tests
 * that only care about shape, but it means NONE of this file's 12 original
 * tests could ever catch a regression that adds a stray chalk line, a
 * progress message, or a second concatenated JSON object to stdout in
 * --json mode — the brace-scan would happily recover a plausible JSON blob
 * from the noise and the test would still pass.
 *
 * assertPureJson is the opposite: it asserts the RAW stdout (exactly as the
 * CLI emitted it) is parseable as JSON with NO fallback and NO leftovers.
 * Per the JSON grammar (RFC 8259 `JSON-text = ws value ws`), JSON.parse
 * already tolerates insignificant leading/trailing whitespace around the
 * top-level value — including the single trailing '\n' every --json branch
 * writes — so no trimming happens here. Trimming would mask exactly the
 * kind of contamination this assertion exists to catch (e.g. a second
 * object appended after a real trailing newline, or a stray non-whitespace
 * log line).
 *
 * Use this for at least one representative test per command (below). Keep
 * firstJsonObject for tests that intentionally want shape-tolerance, not as
 * the sole verification method for the purity contract itself.
 */
function assertPureJson(stdout: string): Record<string, unknown> {
  expect(() => JSON.parse(stdout)).not.toThrow();
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe('brand verify --json', () => {
  it('emits {ok, verified, changed, added, removed} on a clean tree — RAW stdout is pure JSON (F-c16826d1)', () => {
    seedLogo('alpha', 'png');
    expect(
      runCli('manifest', '--logos', logosDir, '--output', manifestPath).status
    ).toBe(0);

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath, '--json');
    expect(r.status).toBe(0);
    // Strict purity: the raw stdout must be EXACTLY one JSON document, not
    // merely contain one somewhere (see assertPureJson doc comment above).
    const json = assertPureJson(r.stdout);
    expect(json.ok).toBe(true);
    expect(typeof json.verified === 'number' || Array.isArray(json.verified)).toBe(true);
    expect(Array.isArray(json.changed)).toBe(true);
    expect(Array.isArray(json.added)).toBe(true);
    expect(Array.isArray(json.removed)).toBe(true);
  });

  // F-7f8c4e14 (--json companion) — the human-output added-file case is
  // covered in verify.test.ts; this pins the SAME scenario's machine-readable
  // contract: an untracked file must surface in the added[] array with
  // ok=false and exit 1, not silently pass. Strict purity per F-c16826d1.
  it('exits 1 with ok=false and the new file\'s key in added[] when a file is ADDED (untracked)', () => {
    seedLogo('alpha', 'png');
    expect(
      runCli('manifest', '--logos', logosDir, '--output', manifestPath).status
    ).toBe(0);

    // New, untracked logo added to disk after the manifest was generated.
    seedLogo('beta', 'png');

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath, '--json');
    expect(r.status).toBe(1);
    const json = assertPureJson(r.stdout);
    expect(json.ok).toBe(false);
    expect(Array.isArray(json.added)).toBe(true);
    expect((json.added as string[])).toContain('logos/beta/readme.png');
  });

  it('exits 1 with ok=false and the tampered path in changed[] on tamper', () => {
    seedLogo('alpha', 'png', 'original');
    expect(
      runCli('manifest', '--logos', logosDir, '--output', manifestPath).status
    ).toBe(0);

    writeFileSync(join(logosDir, 'alpha', 'readme.png'), 'TAMPERED');

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath, '--json');
    expect(r.status).toBe(1);
    const json = firstJsonObject(r.stdout);
    expect(json).not.toBeNull();
    expect(json!.ok).toBe(false);
    expect(Array.isArray(json!.changed)).toBe(true);
    expect((json!.changed as string[])).toContain('logos/alpha/readme.png');
  });

  it('exits 2 (operator error) when manifest does not exist', () => {
    seedLogo('alpha', 'png');
    // Don't generate a manifest. Verify with --json should exit 2.
    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath, '--json');
    expect(r.status).toBe(2);
    const json = firstJsonObject(r.stdout);
    // JSON channel — must still emit some object even on operator errors.
    expect(json).not.toBeNull();
    expect(json!.ok).toBe(false);
  });

  it('exits 2 (operator error) when manifest is malformed JSON', () => {
    seedLogo('alpha', 'png');
    writeFileSync(manifestPath, '{ not valid json', 'utf-8');

    const r = runCli('verify', '--logos', logosDir, '--manifest', manifestPath, '--json');
    expect(r.status).toBe(2);
    const json = firstJsonObject(r.stdout);
    expect(json).not.toBeNull();
    expect(json!.ok).toBe(false);
  });
});

// audit --json: Core agent's contract is `{issues: AuditIssue[]}` or similar.
// These tests verify the shape exists and exit codes match. If the Core
// agent's shape differs, the test loosens to `parseable JSON + exit code`.
describe('brand audit --json', () => {
  function seedRepo(slug: string, name: string, content: string): void {
    const repoDir = join(tempDir, slug);
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, name), content, 'utf-8');
  }
  const BRAND_BASE = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main';

  it('exits 0 with a parseable JSON object on a clean audit — RAW stdout is pure JSON (F-c16826d1)', () => {
    seedLogo('alpha', 'png');
    seedRepo(
      'alpha',
      'README.md',
      `<p align="center"><img src="${BRAND_BASE}/logos/alpha/readme.png" alt="alpha"></p>\n`
    );

    const r = runCli(
      'audit',
      '--repos', tempDir,
      '--logos', logosDir,
      '--brand-base', BRAND_BASE,
      '--json'
    );
    // Clean audit must exit 0.
    expect(r.status).toBe(0);
    // Strict purity — see assertPureJson doc comment above.
    const json = assertPureJson(r.stdout);
    // Contract: audit --json emits either {issues: []} or {ok: true, issues: []}.
    // Accept either shape.
    if ('issues' in json) {
      expect(Array.isArray(json.issues)).toBe(true);
      expect((json.issues as unknown[])).toHaveLength(0);
    }
  });

  it('exits 1 with issues[] populated when problems are found', () => {
    seedLogo('alpha', 'png');
    // README still points at local assets/ — should fire local-logo-ref.
    seedRepo(
      'alpha',
      'README.md',
      `<p align="center"><img src="assets/logo.png" alt="alpha"></p>\n`
    );

    const r = runCli(
      'audit',
      '--repos', tempDir,
      '--logos', logosDir,
      '--brand-base', BRAND_BASE,
      '--json'
    );
    expect(r.status).toBe(1);
    const json = firstJsonObject(r.stdout);
    expect(json).not.toBeNull();
    if ('issues' in json!) {
      expect(Array.isArray(json!.issues)).toBe(true);
      expect((json!.issues as unknown[]).length).toBeGreaterThan(0);
    }
  });

  // F-09eddfab — full-skip (every slug had no local clone under --repos)
  // must be a distinct, non-zero-exit operator/config error, not folded into
  // the same ok:true clean-pass JSON shape as a genuinely fully-inspected
  // run. Strict purity per F-c16826d1: the payload must still be exactly
  // one clean JSON document even on this error path.
  it('exits 2 with ok:false when every slug has no local clone under --repos (F-09eddfab)', () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    // Deliberately do NOT create any repo clones under tempDir.

    const r = runCli(
      'audit',
      '--repos', tempDir,
      '--logos', logosDir,
      '--brand-base', BRAND_BASE,
      '--json'
    );
    expect(r.status).toBe(2);
    const json = assertPureJson(r.stdout);
    expect(json.ok).toBe(false);
    expect(json.reposChecked).toBe(0);
    expect(json.reposTotal).toBe(2);
    expect(json.skippedNoClone).toBe(2);
  });
});

describe('brand migrate --json', () => {
  function seedRepo(slug: string, content: string): void {
    const repoDir = join(tempDir, slug);
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'README.md'), content, 'utf-8');
  }
  const BRAND_BASE = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos';

  it('emits a JSON summary on dry-run — RAW stdout is pure JSON (F-c16826d1)', () => {
    seedLogo('alpha', 'png');
    seedRepo(
      'alpha',
      `<p align="center"><img src="assets/logo.png" alt="alpha" width="400"></p>\n`
    );

    const r = runCli(
      'migrate',
      '--repos', tempDir,
      '--logos', logosDir,
      '--brand-base', BRAND_BASE,
      '--dry-run',
      '--json'
    );
    expect(r.status).toBe(0);
    // Strict purity — see assertPureJson doc comment above.
    const json = assertPureJson(r.stdout);
    // Contract: migrate --json emits at minimum {updated, skipped} or similar.
    // We accept any object with numeric fields representing counts.
    const numericFieldCount = Object.values(json).filter(
      (v) => typeof v === 'number'
    ).length;
    expect(numericFieldCount).toBeGreaterThan(0);
  });

  it('emits a JSON summary on real-mode rewrites', () => {
    seedLogo('alpha', 'png');
    seedRepo(
      'alpha',
      `<p align="center"><img src="assets/logo.png" alt="alpha" width="400"></p>\n`
    );

    const r = runCli(
      'migrate',
      '--repos', tempDir,
      '--logos', logosDir,
      '--brand-base', BRAND_BASE,
      '--json'
    );
    expect(r.status).toBe(0);
    const json = firstJsonObject(r.stdout);
    expect(json).not.toBeNull();
  });
});

describe('brand manifest --check --json', () => {
  it('exits 0 with a JSON object indicating no drift on a clean tree — RAW stdout is pure JSON (F-c16826d1)', () => {
    seedLogo('alpha', 'png');
    expect(
      runCli('manifest', '--logos', logosDir, '--output', manifestPath).status
    ).toBe(0);

    const r = runCli(
      'manifest',
      '--logos', logosDir,
      '--output', manifestPath,
      '--check',
      '--json'
    );
    expect(r.status).toBe(0);
    // Strict purity — see assertPureJson doc comment above.
    const json = assertPureJson(r.stdout);
    // Contract: drift = false on a clean tree.
    if ('drift' in json) {
      expect(json.drift).toBe(false);
    } else if ('ok' in json) {
      expect(json.ok).toBe(true);
    }
  });

  it('exits 1 with drift=true (or ok=false) when a key was added', () => {
    seedLogo('alpha', 'png');
    expect(
      runCli('manifest', '--logos', logosDir, '--output', manifestPath).status
    ).toBe(0);
    // New asset post-manifest.
    seedLogo('beta', 'png');

    const r = runCli(
      'manifest',
      '--logos', logosDir,
      '--output', manifestPath,
      '--check',
      '--json'
    );
    expect(r.status).toBe(1);
    const json = firstJsonObject(r.stdout);
    expect(json).not.toBeNull();
    if ('drift' in json!) {
      expect(json!.drift).toBe(true);
    } else if ('ok' in json!) {
      expect(json!.ok).toBe(false);
    }
  });
});

describe('brand stats --json (regression coverage)', () => {
  // The stats JSON shape was finalised in Stage A. Re-pin it here as a
  // contract test so other commands' JSON shapes are evaluated against
  // a known baseline.
  it('emits {totalLogos, formats, manifestEntries, missing, untracked} — RAW stdout is pure JSON (F-c16826d1)', () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'jpg');
    expect(
      runCli('manifest', '--logos', logosDir, '--output', manifestPath).status
    ).toBe(0);

    const r = runCli(
      'stats',
      '--logos', logosDir,
      '--manifest', manifestPath,
      '--json'
    );
    expect(r.status).toBe(0);
    // Strict purity — see assertPureJson doc comment above.
    const json = assertPureJson(r.stdout);
    expect(typeof json.totalLogos).toBe('number');
    expect(typeof json.formats).toBe('object');
    expect(typeof json.manifestEntries).toBe('number');
    expect(Array.isArray(json.missing)).toBe(true);
    expect(Array.isArray(json.untracked)).toBe(true);
  });
});
