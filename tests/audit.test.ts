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
 *
 * runAudit calls process.exit(1) on failure, so each test stubs exit
 * to capture the exit code without aborting vitest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAudit } from '../src/commands/audit.js';

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
});
