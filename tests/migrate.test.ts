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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrate } from '../src/commands/migrate.js';

const BRAND_BASE = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos';
const JOURNAL_NAME = '.brand-migrate.journal.json';

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

describe('runMigrate — --dry-run --resume must be a true preview (F-e9cfd56a)', () => {
  it('does NOT restore journal entries or touch the journal when --dry-run and --resume are combined', async () => {
    // No logo seeded for 'alpha', so the main migrate loop is a no-op —
    // this isolates the resume/restore behavior, matching TEST-001's style.
    const repoDir = seedRepo('alpha', { 'README.md': 'CORRUPTED HALF-WRITTEN CONTENT\n' });
    const readmePath = join(repoDir, 'README.md');
    const original = README_WITH_LOCAL_LOGO('alpha');
    const journalPath = join(reposDir, JOURNAL_NAME);
    writeFileSync(
      journalPath,
      JSON.stringify([{ path: readmePath, original, ts: '2026-01-01T00:00:00.000Z' }], null, 2) + '\n',
      'utf-8',
    );

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: BRAND_BASE,
      dryRun: true,
      resume: true,
    });

    // Dry-run must be a true preview: the corrupted README is UNCHANGED...
    expect(readFileSync(readmePath, 'utf-8')).toBe('CORRUPTED HALF-WRITTEN CONTENT\n');
    // ...and the journal must still exist, untouched, so a REAL --resume
    // later can still restore it.
    expect(existsSync(journalPath)).toBe(true);
    const entries = JSON.parse(readFileSync(journalPath, 'utf-8')) as Array<{ path: string; original: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe(readmePath);
    expect(entries[0]?.original).toBe(original);
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

describe('runMigrate — non-default --brand-base idempotency (MIGRATE-BRANDBASE)', () => {
  it('recognizes its own already-migrated output under a custom --brand-base (no second write)', async () => {
    // A custom base whose URL still contains a "logos" path segment, so the
    // rewritten src is re-detected as a logo on the second pass. The
    // already-migrated test must be derived from --brand-base, not a hard-coded
    // 'brand/main/logos' literal — otherwise the second run re-writes forever.
    const customBase = 'https://cdn.example.com/brand-logos';
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    await runMigrate({ repos: reposDir, logos: logosDir, brandBase: customBase, dryRun: false });
    const afterFirst = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(afterFirst).toContain(`${customBase}/alpha/readme.png`);
    const firstMtime = statSync(join(repoDir, 'README.md')).mtimeMs;

    await new Promise(r => setTimeout(r, 20));

    // Second run — must be a clean no-op (already migrated under this base).
    await runMigrate({ repos: reposDir, logos: logosDir, brandBase: customBase, dryRun: false });
    const afterSecond = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    const secondMtime = statSync(join(repoDir, 'README.md')).mtimeMs;

    expect(afterSecond).toBe(afterFirst);
    expect(secondMtime).toBe(firstMtime);
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

// F-710290dd (HIGH, security) — the operator-supplied --brand-base was
// interpolated into an <img src="..."> attribute with NO escaping, so a
// value containing a quote could close the attribute early and inject
// arbitrary markup into every README the migration touches.
// renderGalleryBlock (marker-parser.ts, added in v1.0.7) already
// HTML-escapes gallery url/alt for exactly this hazard — the fix here
// applies that same escaping to newSrc before it reaches rewriteLogoSrc,
// which splices its input verbatim with no escaping of its own.
describe('runMigrate — --brand-base HTML-attribute injection (F-710290dd)', () => {
  it('escapes a quote-bearing --brand-base so it cannot break out of the <img src="..."> attribute', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    // A quote closes the src attribute early; onerror= would become a
    // live, separate HTML attribute instead of inert text inside src, if
    // this were spliced in unescaped.
    const maliciousBase = 'https://evil.example.com/x" onerror="alert(1)" data-x="';

    await runMigrate({
      repos: reposDir,
      logos: logosDir,
      brandBase: maliciousBase,
      dryRun: false,
    });

    const rewritten = readFileSync(join(repoDir, 'README.md'), 'utf-8');

    // The raw (unescaped) injection pattern must never appear.
    expect(rewritten).not.toContain('" onerror="alert(1)"');
    // The escaped form must appear instead — quotes turned into inert
    // &quot; entities within the single src attribute's text value.
    expect(rewritten).toContain('&quot; onerror=&quot;alert(1)&quot;');

    // Structural proof: strip out the ENTIRE src="..." attribute (value
    // included) and confirm no "onerror=" token survives in what's left.
    // This is the part a naive substring/regex check on the whole tag
    // can't distinguish: /\bonerror\s*=/ matches "onerror=" whether it's a
    // live, separate attribute OR (as here) inert text safely embedded
    // inside src's own escaped value — only removing the value first tells
    // them apart. Because the value is properly &quot;-escaped, it
    // contains no raw `"`, so `[^"]*` correctly consumes the WHOLE value in
    // one match rather than stopping at an injected quote.
    const imgTagMatch = rewritten.match(/<img\s[^>]*>/);
    expect(imgTagMatch).not.toBeNull();
    const imgTag = imgTagMatch![0];
    const withoutSrcAttr = imgTag.replace(/\bsrc\s*=\s*"[^"]*"/, '');
    // Confirms a src="..." attribute was actually found and removed
    // (otherwise withoutSrcAttr would just equal imgTag unchanged).
    expect(withoutSrcAttr.length).toBeLessThan(imgTag.length);
    expect(withoutSrcAttr).not.toMatch(/\bonerror\s*=/);
  });

  it('escapes <, >, and & the same way marker-parser.ts\'s escapeAttr does', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    const base = 'https://evil.example.com/<script>&x</script>';

    await runMigrate({ repos: reposDir, logos: logosDir, brandBase: base, dryRun: false });

    const rewritten = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(rewritten).not.toContain('<script>');
    expect(rewritten).toContain('&lt;script&gt;&amp;x&lt;/script&gt;');
  });
});
