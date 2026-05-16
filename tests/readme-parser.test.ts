import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLogoImgTags, rewriteLogoSrc } from '../src/utils/readme-parser.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8');

const BRAND_URL = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/test/readme.png';

describe('findLogoImgTags', () => {
  it('finds standalone logo in <p> block', () => {
    const matches = findLogoImgTags(fixture('standalone-logo.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
    expect(matches[0].line).toBe(2);
    expect(matches[0].content).toContain('<img src="assets/logo.png"');
  });

  it('finds logo when <p> and <img> are on the same line', () => {
    const matches = findLogoImgTags(fixture('p-img-sameline.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toContain('logo-myproject.png');
    expect(matches[0].line).toBe(1);
    expect(matches[0].content).toContain('<img src=');
  });

  it('finds logo with full raw.githubusercontent.com URL', () => {
    const matches = findLogoImgTags(fixture('raw-github-url.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toContain('logo-claimledger.png');
    expect(matches[0].line).toBe(2);
  });

  it('finds JPEG logos', () => {
    const matches = findLogoImgTags(fixture('jpg-logo.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.jpg');
    expect(matches[0].line).toBe(2);
  });

  it('returns empty for README with no logo', () => {
    const matches = findLogoImgTags(fixture('no-logo.md'));
    expect(matches).toHaveLength(0);
  });

  it('does NOT match badges inside <a> tags', () => {
    const content = fixture('badge-in-a-tag.md');
    const matches = findLogoImgTags(content);
    // Should only match the logo on line 2, not the badges in <a> tags
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
    expect(matches[0].line).toBe(2);
  });

  it('does NOT match shields.io badges with &logo= parameter', () => {
    const content = fixture('shields-logo-param.md');
    const matches = findLogoImgTags(content);
    // Should only match the actual logo, not the 4 shields.io badges
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
    expect(matches[0].line).toBe(2);
  });

  it('matches only the logo in a complex README with badges', () => {
    const content = fixture('multiple-logos.md');
    const matches = findLogoImgTags(content);
    // Only the logo on line 5 (<p><img src="assets/logo.png">) should match
    // NOT: shields.io badges (even standalone ones with &logo=dotnet)
    // NOT: badges inside <a> tags
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
    expect(matches[0].line).toBe(5);
  });

  // -- F-TESTS-011 fixture expansion --

  it('finds the logo in a CRLF-line-ending README', () => {
    const content = fixture('crlf.md');
    // sanity: fixture really is CRLF
    expect(content).toContain('\r\n');
    const matches = findLogoImgTags(content);
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
    // The content field should not include the trailing \r (or, if it
    // does, the test asserts the current contract — but we don't want
    // \r leakage to break src extraction).
    expect(matches[0].src).not.toContain('\r');
  });

  it('finds the logo in a README that starts with a UTF-8 BOM', () => {
    const content = fixture('bom.md');
    // sanity: fixture really starts with the BOM
    expect(content.charCodeAt(0)).toBe(0xFEFF);
    const matches = findLogoImgTags(content);
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  // F-UTILS-002 — single-quote support.
  it('finds a logo whose <img> tag uses single quotes around src', () => {
    const matches = findLogoImgTags(fixture('single-quote.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  // F-UTILS-002 — self-closing tag.
  it('finds a logo on a self-closing <img ... /> tag', () => {
    const matches = findLogoImgTags(fixture('self-closing.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  // F-TESTS-012 — adversarial badge/logo discrimination.
  it('still detects a logo named "logo-badge.png" (logo+badge in filename)', () => {
    // Inline fixture — the slug literally contains 'badge' in the filename,
    // but the path is a normal local asset, not a shields/CI badge URL.
    const content =
      `<p align="center">\n` +
      `  <img src="assets/logo-badge.png" alt="LogoBadge" width="400">\n` +
      `</p>\n`;
    const matches = findLogoImgTags(content);
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo-badge.png');
  });

  it('does NOT misclassify a logo URL just because the WORD shields.io appears unrelated', () => {
    // Path contains 'logo' and is otherwise a normal local asset; the
    // line does NOT contain a shields.io URL, so it should be treated
    // as a logo.
    const content =
      `<p align="center">\n` +
      `  <img src="assets/logo.png" alt="Logo">\n` +
      `</p>\n`;
    const matches = findLogoImgTags(content);
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  // Code-block awareness (Stage C — utils agent's RejectedMatch channel +
  // fenced/indented code-block exclusion).
  //
  // A <img> inside a fenced code block (```html ... ```) or a 4-space-
  // indented code block is markdown DOCUMENTATION, not an actual logo
  // reference. The parser MUST NOT classify either as a logo, even when
  // the src would otherwise pass the logo-src test.
  describe('code-block awareness', () => {
    // Indented-4sp fixture used to be inline in audit.test.ts; F-TESTS-B-008
    // wires the actual fixture into a parser test.
    it('does NOT match <img> inside a 4-space-indented code block', () => {
      const content = fixture('indented-4sp.md');
      // sanity: the fixture really contains <img src="assets/logo.png">.
      expect(content).toContain('<img src="assets/logo.png"');
      const matches = findLogoImgTags(content);
      // The indented <img> renders as a code block — parser must skip it.
      expect(matches).toHaveLength(0);
    });

    it('does NOT match <img> inside a fenced ```html code block', () => {
      const content = fixture('fenced-code-block.md');
      expect(content).toContain('```html');
      expect(content).toContain('<img src="assets/logo.png"');
      const matches = findLogoImgTags(content);
      expect(matches).toHaveLength(0);
    });

    it('does NOT match <img> inside a tilde-fenced code block', () => {
      const content = fixture('fenced-tilde.md');
      expect(content).toContain('~~~html');
      expect(content).toContain('<img src="assets/logo.png"');
      const matches = findLogoImgTags(content);
      expect(matches).toHaveLength(0);
    });

    it('finds a real logo above a fenced block (only the real logo, not the example)', () => {
      const content = fixture('fenced-and-real-logo.md');
      // Sanity: fixture has TWO <img> tags total (one real, one in fence).
      expect(content.match(/<img/g)?.length).toBe(2);
      const matches = findLogoImgTags(content);
      // Only the real one above the fence must be matched.
      expect(matches).toHaveLength(1);
      expect(matches[0].src).toBe('assets/logo.png');
      // Real logo should NOT have the example marker in alt.
      expect(matches[0].content).toContain('RealLogo');
    });
  });
});

describe('rewriteLogoSrc', () => {
  it('replaces only the logo src, preserving all attributes', () => {
    const input = '  <img src="assets/logo.png" alt="MyProject" width="400">';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(`  <img src="${BRAND_URL}" alt="MyProject" width="400">`);
  });

  it('preserves indentation exactly', () => {
    const input = '  <img src="assets/logo.png" alt="Test" width="400">';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result.startsWith('  <img')).toBe(true);
  });

  it('does not add newlines or extra whitespace', () => {
    const input = fixture('standalone-logo.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    const inputLines = input.split('\n').length;
    const resultLines = result.split('\n').length;
    expect(resultLines).toBe(inputLines);
  });

  it('handles <p> and <img> on the same line', () => {
    const input = '<p align="center"><img src="logo.png" alt="Test" width="400"></p>';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(`<p align="center"><img src="${BRAND_URL}" alt="Test" width="400"></p>`);
  });

  it('does not touch badge lines', () => {
    const input = fixture('shields-logo-param.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    // Badges should be unchanged
    expect(result).toContain('shields.io/badge/.NET-9-purple');
    expect(result).toContain('shields.io/badge/node-');
    expect(result).toContain('shields.io/badge/python-');
    expect(result).toContain('shields.io/badge/docker-');
    // Logo should be rewritten
    expect(result).toContain(BRAND_URL);
  });

  it('does not touch badges inside <a> tags', () => {
    const input = fixture('badge-in-a-tag.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toContain('shields.io/badge/CI-passing');
    expect(result).toContain('shields.io/badge/License-MIT');
    expect(result).toContain(BRAND_URL);
  });

  it('handles the full complex case correctly', () => {
    const input = fixture('multiple-logos.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    // Logo rewritten
    expect(result).toContain(BRAND_URL);
    // All badges preserved
    expect(result).toContain('actions/workflow/status');
    expect(result).toContain('logo=windows');
    expect(result).toContain('logo=dotnet');
    expect(result).toContain('WinUI-3-blue');
    expect(result).toContain('github/license');
  });

  it('returns content unchanged when there are no logos', () => {
    const input = fixture('no-logo.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(input);
  });

  // F-UTILS-001 — `$`-token-safe replacement. The buggy form
  // `line.replace(literalA, literalB)` is safe (B is a string, not a
  // function, and `$` substitutions only apply to the *replacement* —
  // but JavaScript's String.prototype.replace DOES interpret `$&`/`$1` etc.
  // in a STRING replacement target). The fix must escape `$` tokens.
  it('preserves $-tokens verbatim in newSrc ($1, $&, $$, $`)', () => {
    const dollarUrl = 'https://example.com/logo$1-$&-$$-$`.png';
    const input = '  <img src="assets/logo.png" alt="Dollar">';
    const result = rewriteLogoSrc(input, dollarUrl);
    expect(result).toBe(`  <img src="${dollarUrl}" alt="Dollar">`);
    // Belt + suspenders: spell out the tokens so a regression that
    // expands $& -> 'src="assets/logo.png"' is unambiguous.
    expect(result).toContain('$1');
    expect(result).toContain('$&');
    expect(result).toContain('$$');
    expect(result).toContain('$`');
  });

  it('preserves ampersands and backslashes in newSrc', () => {
    const trickyUrl = 'https://example.com/logo?a=1&b=2&c=\\.png';
    const input = '  <img src="assets/logo.png" alt="Amp">';
    const result = rewriteLogoSrc(input, trickyUrl);
    expect(result).toBe(`  <img src="${trickyUrl}" alt="Amp">`);
  });

  // F-UTILS-002 — single-quoted src must rewrite cleanly.
  it('rewrites a single-quoted src to the new URL', () => {
    const input = fixture('single-quote.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toContain(BRAND_URL);
    expect(result).not.toContain("src='assets/logo.png'");
  });

  // F-UTILS-002 — self-closing tag must still be rewritten.
  it('rewrites a self-closing <img ... /> tag', () => {
    const input = fixture('self-closing.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toContain(BRAND_URL);
    expect(result).not.toMatch(/src="assets\/logo\.png"/);
  });
});
