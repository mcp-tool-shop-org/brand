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
let errorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-audit-test-'));
  logosDir = join(tempDir, 'logos');
  reposDir = join(tempDir, 'repos');
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });

  stdout = [];
  exitCode = null;
  // F-f4900c6e reset: audit.ts now sets process.exitCode instead of calling
  // process.exit() for its error/failure paths. Start every test from a
  // clean slate so a leftover value from a PRIOR test never leaks in.
  process.exitCode = undefined;
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
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
  // Guard against a test leaking a non-zero exitCode into vitest's own
  // worker process (pool: 'forks' isolates by FILE, not by individual test).
  process.exitCode = undefined;
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

/**
 * Run runAudit and report its exit code, however it was signaled.
 *
 * F-f4900c6e changed audit.ts's error/failure paths from process.exit(N)
 * (which this file's exitSpy mocks by throwing __EXIT__:N) to
 * `process.exitCode = N; return;` (avoids truncating a JSON stdout write on
 * a pipe — see verify.ts's F-f0c1a1f8). This helper checks BOTH signals so
 * every existing call site keeps working unchanged: catch the legacy throw
 * if anything still uses it, otherwise read (and reset) process.exitCode
 * after a normal resolve. Resetting exitCode here is required, not optional
 * -- otherwise a later test in this same file (pool: 'forks' isolates by
 * FILE, not by individual test) could observe a stale value.
 */
async function runAndCaptureExit(opts: Parameters<typeof runAudit>[0]): Promise<number | null> {
  try {
    await runAudit(opts);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('__EXIT__:')) return exitCode;
    throw err;
  }
  const code = process.exitCode;
  process.exitCode = undefined;
  return typeof code === 'number' ? code : null;
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

  // AUDIT-DUP-TRAP — a 4-space-indented bare <img> whose PREVIOUS line is
  // non-blank is returned by the parser as a logo match (Gate 0b only treats an
  // indented line as a code block when the previous line is blank), so both the
  // raw-line scan and the per-match scan fired and the same trap was reported
  // TWICE. The dedup must collapse them to a single finding.
  it('reports an indentation-trap only ONCE for a non-blank-preceded indented <img>', async () => {
    seedLogo('dup', 'png');
    // No blank line between the heading and the indented <img>.
    const readme =
      `# Dup\n    <img src="${BRAND_BASE}/logos/dup/readme.png" alt="dup">\n`;
    seedRepo('dup', { 'README.md': readme });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    const trapCount = (joined.match(/\[indentation-trap\]/g) ?? []).length;
    expect(trapCount).toBe(1);
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

  // brand-core-01 — missing input dir is an operator error (exit 2), not a
  // green "0 repos checked" pass.
  it('exits 2 when the logos dir does not exist', async () => {
    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: join(tempDir, 'no-such-logos'),
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(2);
    expect(stdout.join('\n')).toMatch(/logos directory not found/);
  });

  it('exits 2 when the repos dir does not exist', async () => {
    seedLogo('alpha', 'png');
    const code = await runAndCaptureExit({
      repos: join(tempDir, 'no-such-repos'),
      logos: logosDir,
      brandBase: BRAND_BASE,
    });
    expect(code).toBe(2);
    expect(stdout.join('\n')).toMatch(/repos directory not found/);
  });

  // brand-core-02 — the clean-run count reports repos actually inspected, not
  // the raw slug count, and discloses how many had no local clone.
  it('reports "N of M repos inspected" and skipped-no-clone honestly', async () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    // Only clone alpha (clean brand ref); beta has no clone under --repos.
    seedRepo('alpha', {
      'README.md': `<p align="center"><img src="${BRAND_BASE}/logos/alpha/readme.png" alt="alpha"></p>\n`,
    });

    const code = await runAndCaptureExit({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE });
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).toMatch(/1 of 2 repos inspected/);
    expect(joined).toMatch(/1 had no local clone/);
  });

  // F-09eddfab — when EVERY slug has no local clone under --repos (full
  // skip, not just partial), the old code still reported a clean ok:true /
  // exit-0 pass -- identical to a genuinely fully-inspected clean run, even
  // though NOTHING was actually inspected. A CI checkout step that silently
  // failed, or a --repos pointed at the wrong path entirely, got a
  // permanent, indistinguishable-from-clean green light on the release gate.
  // This is the human-mode companion; see json-output.test.ts /
  // exit-codes.test.ts for the --json and subprocess-level regression tests.
  it('exits 2 (not a clean pass) when every slug has no local clone under --repos', async () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    // Neither alpha nor beta gets a clone under reposDir at all.

    const code = await runAndCaptureExit({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE });
    expect(code).toBe(2);
    const joined = stdout.join('\n');
    expect(joined).not.toMatch(/Audit clean/i);
    expect(joined).toMatch(/0 of 2 repos inspected/);
  });

  // Companion: a --repos directory that EXISTS but is completely empty (no
  // repo clones at all) must hit the exact same full-skip guard, not a
  // trivial "0 slugs, 0 repos, clean" pass -- the guard is keyed on
  // slugDirs.length > 0 (there WERE logo slugs to check), not on reposDir
  // being non-empty.
  it('exits 2 when --repos exists but contains no clones at all for any slug', async () => {
    seedLogo('alpha', 'png');
    // reposDir exists (created in beforeEach) but stays completely empty.

    const code = await runAndCaptureExit({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE });
    expect(code).toBe(2);
  });

  // F-f4900c6e mechanism pin — audit.ts sets process.exitCode instead of
  // calling process.exit() directly for its dir-not-found guard. Fails
  // before this fix (runAudit() rejects via the mocked process.exit()
  // throwing, so runAndCaptureExit's non-__EXIT__ rethrow path or a hanging
  // promise would surface), passes after (resolves normally; exitSpy never
  // fires; process.exitCode carries the signal instead).
  it('sets process.exitCode instead of calling process.exit on a dir-not-found error', async () => {
    await runAudit({ repos: reposDir, logos: join(tempDir, 'no-such-logos'), brandBase: BRAND_BASE });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    process.exitCode = undefined;
  });

  // Same mechanism pin, for the OTHER named F-f4900c6e call site in this
  // file: the final blockingIssues exit after the full findings-JSON write.
  it('sets process.exitCode instead of calling process.exit when blocking issues are found', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', {
      'README.md': `<p align="center"><img src="assets/logo.png" alt="alpha"></p>\n`,
    });

    await runAudit({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  // brand-core-03 — one unreadable README is recorded as a finding and the walk
  // continues, instead of a raw exit-3 that discards everything collected.
  it('records an unreadable README as a finding and keeps walking', async () => {
    seedLogo('alpha', 'png');
    seedLogo('broken', 'png');
    seedRepo('alpha', {
      'README.md': `<p align="center"><img src="${BRAND_BASE}/logos/alpha/readme.png" alt="alpha"></p>\n`,
    });
    // Make 'broken'/README.md a DIRECTORY so readFileSync throws EISDIR on both
    // Linux and Windows (no spy needed).
    mkdirSync(join(reposDir, 'broken', 'README.md'), { recursive: true });

    const code = await runAndCaptureExit({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[readme-unreadable]');
    expect(joined).toContain('broken');
  });

  // F-3860274a — pointsAtBrand must derive from the operator-configurable
  // --brand-base (like resolveMatchRole/galleryGroupKey already do), not a
  // hard-coded 'brand/main/logos' substring. A custom --brand-base (fork,
  // different branch, self-hosted mirror) that correctly points at itself
  // must not be misread as a stale local reference, and the
  // missing-brand-asset check (gated on the same pointsAtBrand flag) must
  // still run for custom bases too.
  it('does not fire local-logo-ref for a correctly-pointing NON-default --brand-base', async () => {
    const customBase = 'https://raw.githubusercontent.com/my-fork-org/brand/develop';
    seedLogo('custom-base-slug', 'png');
    seedRepo('custom-base-slug', {
      'README.md':
        `<p align="center"><img src="${customBase}/logos/custom-base-slug/readme.png" alt="custom-base-slug"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: customBase,
    });
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).toMatch(/Audit clean/i);
    expect(joined).not.toContain('[local-logo-ref]');
  });

  // Companion case: a custom-base URL whose slug has NO matching logo file on
  // disk must still fire missing-brand-asset — proving the gate isn't just
  // disabled outright for custom bases, it's correctly re-enabled.
  it('still fires missing-brand-asset for a NON-default --brand-base when the asset is absent', async () => {
    const customBase = 'https://raw.githubusercontent.com/my-fork-org/brand/develop';
    mkdirSync(join(logosDir, 'custom-base-ghost'), { recursive: true });
    seedRepo('custom-base-ghost', {
      'README.md':
        `<p align="center"><img src="${customBase}/logos/custom-base-ghost/readme.png" alt="ghost"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: customBase,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[missing-brand-asset]');
    expect(joined).not.toContain('[local-logo-ref]');
  });

  // F-d956cd15 — an empty --brand-base (plausible from an unset/empty CI
  // template variable interpolated into the flag) must fail closed (exit 2)
  // instead of silently letting pointsAtBrand's prefix check degrade to
  // "/logos/", which an unanchored `.includes()` matched against almost any
  // src containing that substring anywhere -- e.g. a genuinely LOCAL
  // "assets/logos/team/photo.png" read as pointing at the brand repo, so
  // local-logo-ref never fired for a real stale local reference.
  it('exits 2 when --brand-base is empty instead of silently misclassifying local refs as brand-pointed', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', {
      'README.md': `<p align="center"><img src="assets/logos/team/photo.png" alt="alpha"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: '',
    });
    expect(code).toBe(2);
    const joined = stdout.join('\n');
    expect(joined).toMatch(/brand-base must not be empty/i);
    expect(joined).not.toMatch(/Audit clean/i);
  });

  // F-d956cd15 — anchoring regression, independent of the empty-string guard
  // above. A short, non-empty --brand-base could still coincidentally appear
  // as a SUBSTRING inside an unrelated local path under the OLD unanchored
  // `.includes()` check. Anchoring via `.startsWith(prefix)` requires the
  // match to sit at the START of src, closing that gap for any brandBase
  // value, not just the empty-string case.
  it('still fires local-logo-ref for a local src that merely CONTAINS the brand-base substring without starting with it', async () => {
    const shortBase = 'b'; // non-empty, so it passes the empty-string guard above
    seedLogo('alpha', 'png');
    // This src does NOT start with "b/logos/" -- it starts with "assets/" --
    // but it DOES contain "b/logos/" as a substring further in.
    seedRepo('alpha', {
      'README.md': `<p align="center"><img src="assets/b/logos/team/photo.png" alt="alpha"></p>\n`,
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: shortBase,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[local-logo-ref]');
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

/**
 * runAudit --remote / org reconciliation tests — F-FEAT-audit-remote,
 * F-FEAT-org-reconcile.
 *
 * Per this wave's brief: NEVER hit the live network in tests. Every test
 * below injects opts.fetchImpl (a fake matching runAudit's structural
 * FetchLike contract — status/redirected/url/headers.get/json()) so no test
 * makes a real HTTP call. Fixtures model GitHub's REST API responses for:
 *   - GET /repos/{org}/{slug}         — existence / archived / rename-redirect
 *   - GET /repos/{org}/{slug}/readme  — base64-encoded README content
 */
type TestFetchImpl = NonNullable<Parameters<typeof runAudit>[0]['fetchImpl']>;

interface FakeResponseInit {
  status: number;
  redirected?: boolean;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Build a MinimalResponse-shaped fake — see audit.ts's FetchLike/MinimalResponse doc comment for why this is a plain object rather than a real Response (redirected/url aren't settable on a real one). */
function fakeResponse(init: FakeResponseInit) {
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    status: init.status,
    redirected: init.redirected ?? false,
    url: init.url ?? '',
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    json: async () => init.body ?? {},
  };
}

/** GitHub Contents API shape for GET /repos/{org}/{repo}/readme — base64-encode like the real API does, so fetchRemoteReadme's decode path is exercised for real. */
function readmeApiBody(content: string, name = 'README.md'): { name: string; content: string; encoding: string } {
  return { name, content: Buffer.from(content, 'utf-8').toString('base64'), encoding: 'base64' };
}

/** A live, non-archived repos-endpoint response. */
function liveRepoResponse(archived = false): ReturnType<typeof fakeResponse> {
  return fakeResponse({ status: 200, body: { archived } });
}

/** A rename-redirect repos-endpoint response — fetch followed the redirect (default behavior), landing on the NEW repo's data. */
function renamedRepoResponse(newFullName: string): ReturnType<typeof fakeResponse> {
  return fakeResponse({ status: 200, redirected: true, body: { full_name: newFullName } });
}

const notFoundResponse = (): ReturnType<typeof fakeResponse> => fakeResponse({ status: 404 });

/** A rate-limited response (primary limit exhausted). resetInSeconds defaults far enough in the future to produce a stable, parseable ISO string. */
function rateLimitedResponse(resetInSeconds = 3600): ReturnType<typeof fakeResponse> {
  const resetEpoch = Math.floor(Date.now() / 1000) + resetInSeconds;
  return fakeResponse({ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetEpoch) } });
}

describe('runAudit --remote (F-FEAT-audit-remote)', () => {
  const ORG = 'mcp-tool-shop-org';

  beforeEach(() => {
    // Isolate from whatever the host/CI shell may already have set — every
    // test in this block controls its own token presence explicitly.
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('exits 2 naming GH_TOKEN/GITHUB_TOKEN when --remote is set and neither is configured — and never calls fetch', async () => {
    seedLogo('alpha', 'png');
    const fetchImpl: TestFetchImpl = vi.fn();

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBe(2);
    const joined = stdout.join('\n');
    expect(joined).toMatch(/GH_TOKEN/);
    expect(joined).toMatch(/GITHUB_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exits 2 when --remote is set with a token but --org is missing/empty', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('alpha', 'png');
    const fetchImpl: TestFetchImpl = vi.fn();

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: '   ', // whitespace/empty — same bad-flag treatment as an omitted flag
      fetchImpl,
    });
    expect(code).toBe(2);
    expect(stdout.join('\n')).toMatch(/--org/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('omitting --remote makes zero network calls, even if a fetchImpl is (harmlessly) provided', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', {
      'README.md': `<p align="center"><img src="${BRAND_BASE}/logos/alpha/readme.png" alt="alpha"></p>\n`,
    });
    const fetchImpl: TestFetchImpl = vi.fn();

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      // remote intentionally omitted
      fetchImpl,
    });
    expect(code).toBeNull();
    expect(stdout.join('\n')).toMatch(/Audit clean/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('F-FEAT-org-reconcile: reports org-repo-not-found (orphan) for a slug matching no repo in the org, high severity, exit 1', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('ghost-slug', 'png');
    const fetchImpl: TestFetchImpl = vi.fn(async () => notFoundResponse());

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[org-repo-not-found]');
    expect(joined).toContain('ghost-slug');
    expect(joined).not.toContain('[org-repo-renamed]');
  });

  it('F-FEAT-org-reconcile: a rename-redirect is reported as a rename with the new name, NOT as an orphan', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('old-slug-name', 'png');
    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/readme')) throw new Error('should not fetch README for a renamed repo');
      return renamedRepoResponse(`${ORG}/new-slug-name`);
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBe(1); // medium severity still blocks the gate
    const joined = stdout.join('\n');
    expect(joined).toContain('[org-repo-renamed]');
    expect(joined).toContain('new-slug-name');
    expect(joined).not.toContain('[org-repo-not-found]');
  });

  it('F-FEAT-org-reconcile: reports org-repo-archived for an archived repo', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('archived-slug', 'png');
    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/readme')) throw new Error('should not fetch README for an archived repo');
      return liveRepoResponse(true);
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBe(1);
    expect(stdout.join('\n')).toContain('[org-repo-archived]');
  });

  it('a live, non-archived repo whose README has no logo reuses the existing no-logo-ref finding (new source, same audit)', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('live-no-logo', 'png');
    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/readme')) return fakeResponse({ status: 200, body: readmeApiBody('# No logo here\n') });
      return liveRepoResponse(false);
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[no-logo-ref]');
    expect(joined).not.toContain('org-repo-');
  });

  it('a live repo whose README correctly embeds the brand logo passes clean via the remote source', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('live-clean', 'png');
    const readme = `<p align="center"><img src="${BRAND_BASE}/logos/live-clean/readme.png" alt="live-clean"></p>\n`;
    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/readme')) return fakeResponse({ status: 200, body: readmeApiBody(readme) });
      return liveRepoResponse(false);
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBeNull();
    const joined = stdout.join('\n');
    expect(joined).toMatch(/Audit clean/i);
    expect(joined).toMatch(/Remote reconciliation/i);
  });

  it('F-FEAT-audit-remote: one repo\'s network failure degrades per-repo and does NOT abort the run', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('bad-repo', 'png');
    seedLogo('good-repo', 'png');
    const goodReadme = `<p align="center"><img src="${BRAND_BASE}/logos/good-repo/readme.png" alt="good-repo"></p>\n`;

    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.includes('bad-repo')) throw new Error('simulated DNS/timeout failure');
      if (url.endsWith('/readme')) return fakeResponse({ status: 200, body: readmeApiBody(goodReadme) });
      return liveRepoResponse(false);
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    // remote-fetch-failed is high severity -> blocks the gate, but the run
    // still completed (both slugs were attempted) rather than aborting.
    expect(code).toBe(1);
    const joined = stdout.join('\n');
    expect(joined).toContain('[remote-fetch-failed]');
    expect(joined).toContain('bad-repo');
    // good-repo must have been reached and found clean — proof the failure
    // on bad-repo did not stop the loop (mirrors brand-core-03's local-mode
    // "one unreadable README keeps walking" contract). A fully clean repo
    // never appears in the grouped issues report at all.
    expect(joined).not.toContain('good-repo');
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3); // bad-repo(1) + good-repo(repo+readme=2)
  });

  it('F-FEAT-audit-remote: rate limiting stops further requests ("don\'t hammer") and reports clearly with exit 3', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('first', 'png');
    seedLogo('second', 'png');
    seedLogo('third', 'png');

    const fetchImpl: TestFetchImpl = vi.fn(async () => rateLimitedResponse());

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: ORG,
      fetchImpl,
    });
    expect(code).toBe(3);
    const joined = stdout.join('\n');
    expect(joined).toMatch(/rate limit/i);
    // The critical assertion: exactly ONE request was made in total, no
    // matter how many slugs exist — every request after the first 403 must
    // be skipped, not attempted and re-failed.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('F-FEAT-org-reconcile: multi-org fallback — an org that 404s falls through to the next configured org', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('multi-org-slug', 'png');
    const readme = `<p align="center"><img src="${BRAND_BASE}/logos/multi-org-slug/readme.png" alt="multi-org-slug"></p>\n`;

    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/repos/org-a/multi-org-slug') && !url.endsWith('/readme')) return notFoundResponse();
      if (url.includes('/repos/org-b/multi-org-slug/readme')) return fakeResponse({ status: 200, body: readmeApiBody(readme) });
      if (url.includes('/repos/org-b/multi-org-slug')) return liveRepoResponse(false);
      throw new Error(`unexpected URL in test fetch mock: ${url}`);
    });

    const code = await runAndCaptureExit({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      remote: true,
      org: 'org-a,org-b',
      fetchImpl,
    });
    expect(code).toBeNull();
    expect(stdout.join('\n')).toMatch(/Audit clean/i);
  });

  it('--json purity on a clean remote run: raw stdout is exactly one JSON document with remote/org/reconciliation fields', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('json-clean', 'png');
    const readme = `<p align="center"><img src="${BRAND_BASE}/logos/json-clean/readme.png" alt="json-clean"></p>\n`;
    const fetchImpl: TestFetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/readme')) return fakeResponse({ status: 200, body: readmeApiBody(readme) });
      return liveRepoResponse(false);
    });

    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as never);
    try {
      await runAudit({
        repos: reposDir,
        logos: logosDir,
        brandBase: BRAND_BASE,
        remote: true,
        org: ORG,
        json: true,
        fetchImpl,
      });
    } finally {
      writeSpy.mockRestore();
    }
    expect(process.exitCode ?? 0).toBe(0);
    process.exitCode = undefined;

    // Strict purity (F-c16826d1 discipline): the raw stdout must be EXACTLY
    // one JSON document, no fallback brace-scan, no leftover chatter.
    expect(writes).toHaveLength(1);
    expect(() => JSON.parse(writes[0]!)).not.toThrow();
    const json = JSON.parse(writes[0]!) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.remote).toBe(true);
    expect(json.org).toBe(ORG);
    expect(json.reconciliation).toEqual({ renamed: 0, archived: 0, notFound: 0 });
  });

  it('--json on a remote run with an orphan: ok:false, exit 1, reconciliation.notFound:1, still pure JSON', async () => {
    process.env.GH_TOKEN = 'test-token';
    seedLogo('json-orphan', 'png');
    const fetchImpl: TestFetchImpl = vi.fn(async () => notFoundResponse());

    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as never);
    try {
      await runAudit({
        repos: reposDir,
        logos: logosDir,
        brandBase: BRAND_BASE,
        remote: true,
        org: ORG,
        json: true,
        fetchImpl,
      });
    } finally {
      writeSpy.mockRestore();
    }
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;

    expect(writes).toHaveLength(1);
    const json = JSON.parse(writes[0]!) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect(json.reconciliation).toEqual({ renamed: 0, archived: 0, notFound: 1 });
    expect(Array.isArray(json.issues)).toBe(true);
    expect((json.issues as Array<{ issue: string }>).some(i => i.issue === 'org-repo-not-found')).toBe(true);
  });
});
