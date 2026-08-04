import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLogoImgTags, findAllImgTags, rewriteLogoSrc } from '../src/utils/readme-parser.js';

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

  // PARSE-001 — the src anchor must target the TRUE `src=`, not a `data-src`
  // (or any `*-src`) lookalike. A bare `\b` word boundary fires between the
  // `-` and the `s` of `data-src`, so a lazy-loaded <img> whose data-src
  // precedes the real src made the parser read the wrong attribute.
  it('reads the true src, not a preceding data-src lookalike', () => {
    const content =
      `<p align="center">\n` +
      `  <img data-src="assets/decoy-logo.png" src="assets/logo.png" alt="Logo">\n` +
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

    // MULTI-LINE indented runs (sibling fix, reconciled from commit 1dc2c8d
    // on salvage/multiline-indent-fix — see code-context.ts's module doc,
    // "MULTI-LINE INDENTED RUNS"). `indented-4sp.md` above has exactly ONE
    // indented line, which is why it kept passing while every line after the
    // first in a longer run was misclassified as live: the old gate re-tested
    // "was the previous line blank?" on each line, and that is only ever true
    // for the line that OPENS the run.
    it('does NOT match any <img> in a MULTI-LINE 4-space-indented block', () => {
      const content = fixture('indented-4sp-multiline.md');
      // Sanity: three indented example tags plus one real un-indented logo.
      expect(content.match(/<img/g)?.length).toBe(4);
      const matches = findLogoImgTags(content);
      // Only the real logo — none of the three indented example lines.
      expect(matches).toHaveLength(1);
      expect(matches[0].src).toBe('assets/logo.png');
      expect(matches[0].content).toContain('RealLogo');
    });

    it('reports EVERY line of a multi-line indented run as in-code-block', () => {
      const { matches, rejected } = findAllImgTags(
        fixture('indented-4sp-multiline.md'),
      );
      expect(matches.map((m) => m.src)).toEqual(['assets/logo.png']);
      const inCode = rejected.filter((r) => r.reason === 'in-code-block');
      expect(inCode.map((r) => r.src)).toEqual([
        'assets/logo-a.png',
        'assets/logo-b.png',
        'assets/logo-c.png',
      ]);
    });

    it('reports the SAME indentedBlockStartLine for every line of a multi-line run (genuinely tracks the run start, not the current line)', () => {
      // Guards the dead-logic regression this fix replaces: before the port,
      // indentedBlockStartLine could never differ from the current line
      // index, because the gate never admitted a second line into a run.
      const { rejected } = findAllImgTags(fixture('indented-4sp-multiline.md'));
      const inCode = rejected.filter((r) => r.reason === 'in-code-block');
      expect(inCode).toHaveLength(3);
      for (const r of inCode) {
        // The run opens on 0-indexed line 4 -> 1-indexed line 5.
        expect(r.indentedBlockStartLine).toBe(5);
      }
    });

    it('never rewrites a src inside a multi-line indented run', () => {
      const content = fixture('indented-4sp-multiline.md');
      const result = rewriteLogoSrc(content, BRAND_URL);
      // The three indented example srcs survive byte-for-byte.
      expect(result).toContain('<p><img src="assets/logo-a.png"');
      expect(result).toContain('<p><img src="assets/logo-b.png"');
      expect(result).toContain('<p><img src="assets/logo-c.png"');
      // Only the real logo was rewritten.
      expect(result).toContain(BRAND_URL);
      expect(result.match(new RegExp(BRAND_URL, 'g'))?.length).toBe(1);
    });

    it('closes an indented run at the blank line (a later real logo still matches)', () => {
      // Guards the opposite failure: run-tracking state must not leak past
      // the end of the block and swallow the rest of the document.
      const content = [
        '# Title',
        '',
        '    <p><img src="assets/example-a.png" alt="A" width="400"></p>',
        '    <p><img src="assets/example-b.png" alt="B" width="400"></p>',
        '',
        '<p><img src="assets/logo.png" alt="RealLogo" width="400"></p>',
        '',
      ].join('\n');
      const matches = findLogoImgTags(content);
      expect(matches).toHaveLength(1);
      expect(matches[0].src).toBe('assets/logo.png');
    });

    it('treats an indented line after a paragraph as prose, not a code block', () => {
      // An indented line that does NOT follow a blank line is a lazy
      // paragraph continuation in CommonMark — a run may only OPEN after a
      // blank line, so run-tracking must not start one here.
      const content = [
        '# Title',
        '',
        'Intro paragraph.',
        '    <p><img src="assets/logo.png" alt="RealLogo" width="400"></p>',
        '',
      ].join('\n');
      const matches = findLogoImgTags(content);
      expect(matches).toHaveLength(1);
      expect(matches[0].src).toBe('assets/logo.png');
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

// F-6d5e4ea9 — Stage A regression, the readme-parser.ts side of the same
// bug fixed in marker-parser.test.ts (both share code-context.ts). An
// unclosed fence used to swallow every remaining line through EOF as code,
// so a real logo anywhere after a forgotten closing ``` silently vanished —
// rejected with the same generic "in-code-block" reason as a genuinely
// fenced documentation example, with no way to tell the two apart. Fixed by
// (1) treating a never-closed-by-EOF fence as not creating a code region at
// all (see code-context.ts's module doc for the CommonMark-divergence
// justification), and (2) RejectedMatch now carries fenceOpenLine /
// indentedBlockStartLine so a genuine (closed-fence) rejection names
// exactly which code block is responsible.
describe('unclosed fence no longer swallows the document (F-6d5e4ea9)', () => {
  it('finds a real logo that sits after a never-closed fence', () => {
    const content = fixture('logo-unclosed-fence.md');
    // Sanity: the fixture really has an opening fence with no closing pair.
    expect(content.match(/```/g)?.length).toBe(1);
    const matches = findLogoImgTags(content);
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  it('reports zero rejected candidates for the unclosed-fence document (the dangling fence is inert, not silently rejected)', () => {
    const content = fixture('logo-unclosed-fence.md');
    const { matches, rejected } = findAllImgTags(content);
    expect(matches).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it('still ignores a logo genuinely INSIDE a closed fence — does not regress Stage A', () => {
    // Reuses the existing fenced-code-block.md fixture rather than
    // re-deriving it: the <img> sits inside a fence that DOES close, so it
    // must stay rejected exactly as before this fix.
    const content = fixture('fenced-code-block.md');
    expect(findLogoImgTags(content)).toEqual([]);
  });

  it('findAllImgTags reports fenceOpenLine for an <img> rejected by a CLOSED fence', () => {
    const content = fixture('fenced-code-block.md');
    const { matches, rejected } = findAllImgTags(content);
    expect(matches).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      line: 6,
      reason: 'in-code-block',
      fenceOpenLine: 5,
    });
  });

  it('findAllImgTags reports indentedBlockStartLine for an <img> rejected by a 4-space-indented block', () => {
    // Strengthens the existing indented-4sp.md coverage (does not replace
    // or weaken the existing "matches has length 0" assertion elsewhere in
    // this file) with the new diagnostic field.
    const content = fixture('indented-4sp.md');
    const { rejected } = findAllImgTags(content);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      line: 5,
      reason: 'in-code-block',
      indentedBlockStartLine: 5,
    });
  });
});

// UTF-8 BOM — a BOM can only ever appear as the literal first character of
// a document, and only ever affects the two `^`-anchored regexes inside
// code-context.ts's computeCodeContext (fence-open / indented-line). When
// line 0 itself opens a fence, an unstripped BOM sits in front of those
// anchors and defeats the match, wrongly leaving a documentation example
// OUT of code context — so a logo EXAMPLE on line 0 of a BOM-prefixed
// README was wrongly treated as live (F-6d5e4ea9, part 2). This is
// DIFFERENT from the existing bom.md test above, whose BOM-prefixed first
// line is a plain `<p align="center">` — never a fence/indent line, so it
// never exercised the `^`-anchored regexes at all.
describe('UTF-8 BOM on a fence-opening first line (F-6d5e4ea9)', () => {
  it('still ignores a logo example inside a fence that opens on line 1 of a BOM-prefixed document', () => {
    const content = fixture('bom-fenced-logo-example.md');
    // Sanity: the fixture really starts with the BOM and really opens a
    // fence on its very first line.
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(findLogoImgTags(content)).toEqual([]);
  });

  it('findAllImgTags still explains the rejection on the BOM-prefixed fence (fenceOpenLine points at line 1)', () => {
    const content = fixture('bom-fenced-logo-example.md');
    const { rejected } = findAllImgTags(content);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: 'in-code-block',
      fenceOpenLine: 1,
    });
  });
});

// F-22a69b96 — HTML-comment awareness. forEachLogoImg's Gate 0 only checked
// fenced/indented CODE blocks; there was no HTML-comment tracking at all, so
// an <img> a human deliberately disabled by wrapping it in an HTML comment
// (a very common "old branding, kept for reference" README pattern) was
// treated as a live logo — findLogoImgTags returned it AND rewriteLogoSrc
// silently resurrected/mutated it.
describe('HTML-comment awareness (F-22a69b96)', () => {
  it('does NOT match an <img> commented out as "kept for reference"', () => {
    const content = fixture('img-in-html-comment.md');
    // Sanity: the fixture really has TWO <img> tags total (one real, one commented).
    expect(content.match(/<img/g)?.length).toBe(2);
    const matches = findLogoImgTags(content);
    // Only the real logo above the comment must be matched.
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  it('reports the commented-out <img> as rejected with reason "in-comment"', () => {
    const content = fixture('img-in-html-comment.md');
    const { matches, rejected } = findAllImgTags(content);
    expect(matches).toHaveLength(1);
    const commentRejection = rejected.find((r) => r.src === 'assets/old-logo.png');
    expect(commentRejection).toBeDefined();
    expect(commentRejection?.reason).toBe('in-comment');
  });

  it('does not resurrect or rewrite the commented-out <img> src', () => {
    const content = fixture('img-in-html-comment.md');
    const result = rewriteLogoSrc(content, BRAND_URL);
    // The real logo is rewritten...
    expect(result).toContain(BRAND_URL);
    // ...but the commented-out old logo's src is untouched, byte-for-byte.
    expect(result).toContain('<img src="assets/old-logo.png" alt="Old logo">');
    expect(result).toContain('<!-- Old branding, kept for reference:');
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

  // PARSE-001 — rewrite the TRUE src and leave a preceding data-src untouched.
  // With the old `\bsrc` anchor this rewrote data-src and left the real src
  // (the rendered image) stale — a silent, misreported-as-success migration.
  it('rewrites the true src and leaves a preceding data-src untouched', () => {
    const input = '  <img data-src="assets/decoy-logo.png" src="assets/logo.png" alt="Logo">';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(`  <img data-src="assets/decoy-logo.png" src="${BRAND_URL}" alt="Logo">`);
  });
});
