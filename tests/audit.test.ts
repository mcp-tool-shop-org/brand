/**
 * audit tests — runAudit() against temp directory trees.
 *
 * Covers F-TESTS-007 — at least one fixture per issue type the audit
 * command detects:
 *   - local-logo-ref      (logo src still points at assets/)
 *   - indentation-trap    (4+ spaces before <img>, no <p>)
 *   - missing-brand-asset (brand URL with no matching slug on disk)
 *   - multiple-logo-matches (more than one logo <img> in one README)
 *   - no-logo-ref         (README.md without any logo)
 *   - unmanaged-gallery   (N gallery-role <img> tags for one slug — info only)
 *
 * runAudit calls process.exit(1) on failure, so each test stubs exit
 * to capture the exit code without aborting vitest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAudit } from '../src/commands/audit.js';
import { writeManifest, type Manifest, type AssetEntry } from '../src/manifest.js';

const BRAND_BASE = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main';

let tempDir: string;
let logosDir: string;
let reposDir: string;
let stdout: string[];
let exitCode: number | null;
let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-audit-test-'));
  logosDir = join(tempDir, 'logos');
  reposDir = join(tempDir, 'repos');
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });

  stdout = [];
  exitCode = null;
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`__EXIT__:${exitCode}`);
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  exitSpy.mockRestore();
  rmSync(tempDir, { recursive: true, force: true });
});

function seedLogo(slug: string, ext: string): void {
  const dir = join(logosDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `readme.${ext}`), `fake-${ext}-${slug}`);
}

function seedRepo(slug: string, readmes: Record<string, string>): string {
  const repoDir = join(reposDir, slug);
  mkdirSync(repoDir, { recursive: true });
  for (const [name, content] of Object.entries(readmes)) {
    writeFileSync(join(repoDir, name), content, 'utf-8');
  }
  return repoDir;
}

/**
 * Write a manifest.json into tempDir with the given asset entries (keys are
 * manifest keys like "logos/<slug>/readme.png" or
 * "logos/<slug>/turnarounds/side.png"). Returns the manifest path, suitable
 * for passing as `opts.manifest`.
 */
function seedManifest(assets: Record<string, AssetEntry>): string {
  const manifest: Manifest = {
    version: '1.0',
    generated: new Date().toISOString(),
    algorithm: 'sha256',
    assets,
  };
  const manifestPath = join(tempDir, 'manifest.json');
  writeManifest(manifest, manifestPath);
  return manifestPath;
}

/** Build a fake AssetEntry — hash/size/format are irrelevant to audit's role resolution. */
function fakeAsset(role: 'primary' | 'gallery', gallery?: string): AssetEntry {
  return {
    hash: 'sha256:deadbeef',
    size: 123,
    format: 'png',
    role,
    ...(gallery ? { gallery } : {}),
  };
}

/** Run runAudit and absorb the thrown __EXIT__ if process.exit was called. */
async function runAndCaptureExit(opts: Parameters<typeof runAudit>[0]): Promise<number | null> {
  try {
    await runAudit(opts);
    return null;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('__EXIT__:')) return exitCode;
    throw err;
  }
}

describe('runAudit', () => {
  it('emits a local-logo-ref issue for a README still pointing at assets/', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', {
      'README.md':
        `<p align="center"><img src="assets/logo.png" alt="alpha" width="400"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[local-logo-ref]');
    expect(joined).toContain('alpha');
  });

  it('emits an indentation-trap issue for 4-space-indented <img> (no <p> wrapper)', async () => {
    seedLogo('beta', 'png');
    // 4 spaces of indentation, NOT inside a <p>. Use a brand URL so the
    // indentation issue is the only one reported.
    const readme =
      `# Beta\n\n    <img src="${BRAND_BASE}/logos/beta/readme.png" alt="beta">\n`;
    seedRepo('beta', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[indentation-trap]');
  });

  it('emits a missing-brand-asset issue when the brand URL has no matching slug on disk', async () => {
    // Create a slug DIR but no actual readme.<ext> file (so findLogoFile returns null
    // but the slug is still seen by globSync('*/'))
    mkdirSync(join(logosDir, 'ghost'), { recursive: true });
    seedRepo('ghost', {
      'README.md':
        `<p align="center"><img src="${BRAND_BASE}/logos/ghost/readme.png" alt="ghost" width="400"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[missing-brand-asset]');
    expect(joined).toContain('ghost');
  });

  it('emits multiple-logo-matches when more than one logo <img> appears', async () => {
    seedLogo('gamma', 'png');
    const readme =
      `<p align="center"><img src="${BRAND_BASE}/logos/gamma/readme.png" alt="A"></p>\n` +
      `<p align="center"><img src="${BRAND_BASE}/logos/gamma/readme.png" alt="B"></p>\n`;
    seedRepo('gamma', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[multiple-logo-matches]');
  });

  it('emits no-logo-ref when README.md has no logo at all', async () => {
    seedLogo('delta', 'png');
    seedRepo('delta', { 'README.md': '# Delta\n\nNo logo here.\n' });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[no-logo-ref]');
  });

  it('passes (exit 0, clean) when every repo has a valid brand-pointed logo', async () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'svg');
    seedRepo('alpha', {
      'README.md':
        `<p align="center"><img src="${BRAND_BASE}/logos/alpha/readme.png" alt="alpha"></p>\n`,
    });
    seedRepo('beta', {
      'README.md':
        `<p align="center"><img src="${BRAND_BASE}/logos/beta/readme.svg" alt="beta"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    // Clean run prints success and returns normally — no exit(1).
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).toMatch(/Audit clean/i);
  });

  it('finds brand assets for non-png extensions (F-CORE-005 — probes all 5)', async () => {
    // Slug has a .webp logo, README points at the .webp brand URL. Audit
    // should NOT flag missing-brand-asset because findLogoFile probes
    // the full extension order including .webp.
    seedLogo('webp-slug', 'webp');
    seedRepo('webp-slug', {
      'README.md':
        `<p align="center"><img src="${BRAND_BASE}/logos/webp-slug/readme.webp" alt="webp"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).not.toContain('[missing-brand-asset]');
  });

  // --- gallery-role-aware multiple-logo-matches (false-positive fix) ---

  it('(a) single primary logo ref only — unchanged, no findings', async () => {
    seedLogo('solo', 'png');
    const manifestPath = seedManifest({
      'logos/solo/readme.png': fakeAsset('primary'),
    });
    seedRepo('solo', {
      'README.md':
        `<p align="center"><img src="${BRAND_BASE}/logos/solo/readme.png" alt="solo"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      manifest: manifestPath,
    });
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).toMatch(/Audit clean/i);
    expect(joined).not.toContain('[multiple-logo-matches]');
    expect(joined).not.toContain('[unmanaged-gallery]');
  });

  it('(b) N <img> tags all resolving to role:gallery for one slug — no multiple-logo-matches, fires unmanaged-gallery info, exits 0', async () => {
    seedLogo('pirate-raiders-3d-2', 'png');
    const manifestPath = seedManifest({
      'logos/pirate-raiders-3d-2/readme.png': fakeAsset('primary'),
      'logos/pirate-raiders-3d-2/turnarounds/a.png': fakeAsset('gallery', 'turnarounds'),
      'logos/pirate-raiders-3d-2/turnarounds/b.png': fakeAsset('gallery', 'turnarounds'),
      'logos/pirate-raiders-3d-2/turnarounds/c.png': fakeAsset('gallery', 'turnarounds'),
    });
    const readme =
      `<p align="center"><img src="${BRAND_BASE}/logos/pirate-raiders-3d-2/turnarounds/a.png" alt="A"></p>\n` +
      `<p align="center"><img src="${BRAND_BASE}/logos/pirate-raiders-3d-2/turnarounds/b.png" alt="B"></p>\n` +
      `<p align="center"><img src="${BRAND_BASE}/logos/pirate-raiders-3d-2/turnarounds/c.png" alt="C"></p>\n`;
    seedRepo('pirate-raiders-3d-2', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      manifest: manifestPath,
    });
    // Info-only finding must not fail the audit.
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).not.toContain('[multiple-logo-matches]');
    expect(joined).toContain('[unmanaged-gallery]');
    expect(joined).toContain('3 logo <img> tags');
    expect(joined).toContain('pirate-raiders-3d-2');
  });

  it('(c) 2 refs both resolving to role:primary for the same slug — still flags multiple-logo-matches high, exit 1', async () => {
    seedLogo('collide', 'png');
    const manifestPath = seedManifest({
      // A malformed/duplicated manifest scenario where two keys both carry
      // role "primary" for the same slug — the genuine collision case.
      'logos/collide/readme.png': fakeAsset('primary'),
      'logos/collide/readme-alt.png': fakeAsset('primary'),
    });
    const readme =
      `<p align="center"><img src="${BRAND_BASE}/logos/collide/readme.png" alt="A"></p>\n` +
      `<p align="center"><img src="${BRAND_BASE}/logos/collide/readme-alt.png" alt="B"></p>\n`;
    seedRepo('collide', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      manifest: manifestPath,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[multiple-logo-matches]');
  });

  it('(d) one resolvable gallery match + one unresolvable/unknown-role match — still conservatively flags multiple-logo-matches', async () => {
    seedLogo('mixed', 'png');
    const manifestPath = seedManifest({
      'logos/mixed/readme.png': fakeAsset('primary'),
      'logos/mixed/turnarounds/a.png': fakeAsset('gallery', 'turnarounds'),
      // Deliberately NOT registering readme-unknown.png in the manifest, so
      // its role resolves to "unknown" even though it points at the brand repo.
    });
    const readme =
      `<p align="center"><img src="${BRAND_BASE}/logos/mixed/turnarounds/a.png" alt="A"></p>\n` +
      `<p align="center"><img src="${BRAND_BASE}/logos/mixed/readme-unknown.png" alt="B"></p>\n`;
    seedRepo('mixed', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      manifest: manifestPath,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[multiple-logo-matches]');
    expect(joined).not.toContain('[unmanaged-gallery]');
  });

  it('(e) manifest missing/unparseable — audit degrades gracefully, falls back to old flag-everything behavior, does not crash', async () => {
    seedLogo('nodegrade', 'png');
    // Point --manifest at a path that does not exist.
    const missingManifestPath = join(tempDir, 'does-not-exist-manifest.json');
    const readme =
      `<p align="center"><img src="${BRAND_BASE}/logos/nodegrade/turnarounds/a.png" alt="A"></p>\n` +
      `<p align="center"><img src="${BRAND_BASE}/logos/nodegrade/turnarounds/b.png" alt="B"></p>\n`;
    seedRepo('nodegrade', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      manifest: missingManifestPath,
    });
    // Old behavior: any >1 logo matches flags multiple-logo-matches (high), exit 1.
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[multiple-logo-matches]');

    // Also verify an unparseable manifest (malformed JSON) degrades the same way.
    const badManifestPath = join(tempDir, 'bad-manifest.json');
    writeFileSync(badManifestPath, '{ not valid json', 'utf-8');

    stdout = [];
    exitCode = null;
    const code2 = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      manifest: badManifestPath,
    });
    expect(code2).toBe(1);
    const joined2 = stdout.join('\n');
    expect(joined2).toContain('[multiple-logo-matches]');
  });

  it('defaults opts.manifest to "manifest.json" when unset (no crash even when absent)', async () => {
    // No manifest option passed at all — runAudit must default internally
    // to 'manifest.json' and safely degrade since that file won't exist
    // relative to the test runner's cwd.
    seedLogo('default-manifest', 'png');
    seedRepo('default-manifest', {
      'README.md':
        `<p align="center"><img src="${BRAND_BASE}/logos/default-manifest/readme.png" alt="d"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).toMatch(/Audit clean/i);
  });
});
