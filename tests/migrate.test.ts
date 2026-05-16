/**
 * migrate tests — runMigrate() against temp fake-repo trees.
 *
 * Covers:
 *   - dry-run does NOT modify files (mtime check)
 *   - real-mode rewrites to brand URLs (content check)
 *   - all 5 supported extensions are probed (F-CORE-004)
 *   - multi-logo READMEs are NOT silently collapsed (F-CORE-003)
 *   - idempotency: rerunning is a no-op
 *   - 'already pointing at brand' skip path
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrate } from '../src/commands/migrate.js';

const BRAND_BASE = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos';

let tempDir: string;
let logosDir: string;
let reposDir: string;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-migrate-test-'));
  logosDir = join(tempDir, 'logos');
  reposDir = join(tempDir, 'repos');
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  rmSync(tempDir, { recursive: true, force: true });
});

/** Drop a logo file for a slug under logosDir. */
function seedLogo(slug: string, ext: string): void {
  const dir = join(logosDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `readme.${ext}`), `fake-${ext}-${slug}`);
}

/** Drop a fake repo at reposDir/slug with the given READMEs. */
function seedRepo(slug: string, readmes: Record<string, string>): string {
  const repoDir = join(reposDir, slug);
  mkdirSync(repoDir, { recursive: true });
  for (const [name, content] of Object.entries(readmes)) {
    writeFileSync(join(repoDir, name), content, 'utf-8');
  }
  return repoDir;
}

const README_WITH_LOCAL_LOGO = (slug: string) =>
  `<p align="center">\n  <img src="assets/logo.png" alt="${slug}" width="400">\n</p>\n`;

describe('runMigrate — dry-run safety', () => {
  it('does NOT modify files when dryRun is true (mtime preserved)', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });
    const readmePath = join(repoDir, 'README.md');

    const before = statSync(readmePath).mtimeMs;
    const beforeContent = readFileSync(readmePath, 'utf-8');

    // Wait long enough that any write would be detectable.
    await new Promise(r => setTimeout(r, 20));

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: true,
    });

    const after = statSync(readmePath).mtimeMs;
    const afterContent = readFileSync(readmePath, 'utf-8');

    expect(after).toBe(before);
    expect(afterContent).toBe(beforeContent);
  });
});

describe('runMigrate — real mode rewriting', () => {
  it('rewrites local logo src to brand URL for .png', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    const rewritten = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(rewritten).toContain(`${BRAND_BASE}/alpha/readme.png`);
    expect(rewritten).not.toContain('"assets/logo.png"');
  });

  it.each([
    ['png'],
    ['jpg'],
    ['jpeg'],
    ['svg'],
    ['webp'],
  ])('detects the correct extension when only .%s exists (F-CORE-004)', async (ext) => {
    const slug = `only-${ext}`;
    seedLogo(slug, ext);
    const repoDir = seedRepo(slug, { 'README.md': README_WITH_LOCAL_LOGO(slug) });

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    const rewritten = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(rewritten).toContain(`${BRAND_BASE}/${slug}/readme.${ext}`);
  });

  it('rewrites all README*.md files (locale variants)', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', {
      'README.md': README_WITH_LOCAL_LOGO('alpha'),
      'README.ja.md': README_WITH_LOCAL_LOGO('alpha'),
      'README.zh.md': README_WITH_LOCAL_LOGO('alpha'),
    });

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    for (const name of ['README.md', 'README.ja.md', 'README.zh.md']) {
      const rewritten = readFileSync(join(repoDir, name), 'utf-8');
      expect(rewritten).toContain(`${BRAND_BASE}/alpha/readme.png`);
    }
  });
});

describe('runMigrate — multi-logo handling (F-CORE-003)', () => {
  it('does NOT silently collapse multi-logo READMEs — skips with warning when distinct local logos are present', async () => {
    // Two DIFFERENT local logos in the same README. Auto-collapsing both to the
    // same brand URL would lose the layout intent. F-CORE-003 fix: skip with a
    // warning and leave the README unmodified for the operator to triage.
    seedLogo('alpha', 'png');
    const multi =
      `<p align="center"><img src="assets/logo-a.png" alt="A" width="400"></p>\n` +
      `<p align="center"><img src="assets/logo-b.png" alt="B" width="400"></p>\n`;
    const repoDir = seedRepo('alpha', { 'README.md': multi });

    const warnings: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });

    try {
      await runMigrate({
        repos: reposDir,
        logos: logosDir,
        brandBase: BRAND_BASE,
        dryRun: false,
      });
    } finally {
      logSpy.mockRestore();
    }

    const after = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    // README must be left untouched — both local srcs preserved verbatim.
    expect(after).toBe(multi);
    // And the operator must see a warning naming the distinct local srcs.
    const joined = warnings.join('\n');
    expect(joined).toMatch(/distinct non-brand logo srcs/i);
    expect(joined).toContain('assets/logo-a.png');
    expect(joined).toContain('assets/logo-b.png');
  });
});

describe('runMigrate — idempotency', () => {
  it('rerunning after a successful migration is a no-op (no further mtime change)', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    const afterFirstMtime = statSync(join(repoDir, 'README.md')).mtimeMs;
    const afterFirstContent = readFileSync(join(repoDir, 'README.md'), 'utf-8');

    await new Promise(r => setTimeout(r, 20));

    // Second run — already migrated.
    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    const afterSecondMtime = statSync(join(repoDir, 'README.md')).mtimeMs;
    const afterSecondContent = readFileSync(join(repoDir, 'README.md'), 'utf-8');

    expect(afterSecondContent).toBe(afterFirstContent);
    // mtime should be unchanged — the 'already at brand' branch must skip
    // the writeFileSync entirely.
    expect(afterSecondMtime).toBe(afterFirstMtime);
  });
});

describe('runMigrate — skip path', () => {
  it('skips slugs that have no local repo clone', async () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    // Only clone alpha; beta has no repo dir.
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    const rewritten = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(rewritten).toContain(`${BRAND_BASE}/alpha/readme.png`);
  });

  it('does not modify a README with no logo refs', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', {
      'README.md': '# Alpha\n\nNo logo here — just text.\n',
    });
    const before = readFileSync(join(repoDir, 'README.md'), 'utf-8');

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: false,
    });

    const after = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(after).toBe(before);
  });
});
