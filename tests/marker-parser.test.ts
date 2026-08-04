/**
 * marker-parser tests — golden fixtures for findMarkerBlocks / renderGalleryBlock
 * / syncMarkerBlock.
 *
 * Covers: valid single block, relocated block, duplicate markers (throw),
 * nested markers (throw), unclosed marker (throw), malformed attrs (throw),
 * no markers (empty, no throw), markers for a different slug (ignored),
 * natural-sort ordering, deterministic output, no timestamps.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findMarkerBlocks,
  renderGalleryBlock,
  syncMarkerBlock,
  MarkerParseError,
  type GalleryImageRef,
} from '../src/utils/marker-parser.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8');

describe('findMarkerBlocks', () => {
  it('finds a valid single block', () => {
    const blocks = findMarkerBlocks(fixture('marker-valid-single.md'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slug).toBe('pirate-raiders-3d-2');
    expect(blocks[0].gallery).toBeUndefined();
    expect(blocks[0].innerContent).toContain('old/side.png');
  });

  it('finds a block relocated mid-document (not at the top)', () => {
    const content = fixture('marker-relocated.md');
    const blocks = findMarkerBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slug).toBe('pirate-raiders-3d-2');
    expect(blocks[0].gallery).toBe('turnarounds');
    // The block should be found well past line 0.
    expect(blocks[0].startLine).toBeGreaterThan(5);
    expect(blocks[0].innerContent).toContain('old/front.png');
  });

  it('throws MarkerParseError with reason "duplicate" for duplicate blocks', () => {
    const content = fixture('marker-duplicate.md');
    expect(() => findMarkerBlocks(content)).toThrow(MarkerParseError);
    try {
      findMarkerBlocks(content);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerParseError);
      expect((err as MarkerParseError).reason).toBe('duplicate');
    }
  });

  it('throws MarkerParseError with reason "nested" for nested markers', () => {
    const content = fixture('marker-nested.md');
    expect(() => findMarkerBlocks(content)).toThrow(MarkerParseError);
    try {
      findMarkerBlocks(content);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerParseError);
      expect((err as MarkerParseError).reason).toBe('nested');
    }
  });

  it('throws MarkerParseError with reason "unclosed" for an unclosed marker', () => {
    const content = fixture('marker-unclosed.md');
    expect(() => findMarkerBlocks(content)).toThrow(MarkerParseError);
    try {
      findMarkerBlocks(content);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerParseError);
      expect((err as MarkerParseError).reason).toBe('unclosed');
    }
  });

  it('throws MarkerParseError with reason "malformed-attrs" for bad attribute syntax', () => {
    const content = fixture('marker-malformed-attrs.md');
    expect(() => findMarkerBlocks(content)).toThrow(MarkerParseError);
    try {
      findMarkerBlocks(content);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerParseError);
      expect((err as MarkerParseError).reason).toBe('malformed-attrs');
    }
  });

  it('returns an empty array (no throw) for a document with no markers', () => {
    const blocks = findMarkerBlocks(fixture('marker-none.md'));
    expect(blocks).toEqual([]);
  });

  it('correctly finds markers for a different slug (caller filters, not this fn)', () => {
    const blocks = findMarkerBlocks(fixture('marker-different-slug.md'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slug).toBe('some-other-repo');
    // A caller looking for a DIFFERENT slug would find no match here.
    const match = blocks.find((b) => b.slug === 'pirate-raiders-3d-2');
    expect(match).toBeUndefined();
  });
});

describe('renderGalleryBlock', () => {
  it('sorts images naturally by filename (image9 before image10)', () => {
    const images: GalleryImageRef[] = [
      { url: 'https://example.com/x/image10.png', alt: 'image10' },
      { url: 'https://example.com/x/image2.png', alt: 'image2' },
      { url: 'https://example.com/x/image9.png', alt: 'image9' },
      { url: 'https://example.com/x/image1.png', alt: 'image1' },
    ];
    const rendered = renderGalleryBlock(images);
    const idx1 = rendered.indexOf('image1.png');
    const idx2 = rendered.indexOf('image2.png');
    const idx9 = rendered.indexOf('image9.png');
    const idx10 = rendered.indexOf('image10.png');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx9);
    expect(idx9).toBeLessThan(idx10);
  });

  it('produces byte-identical output on repeated calls with the same input', () => {
    const images: GalleryImageRef[] = [
      { url: 'https://example.com/x/b.png', alt: 'b' },
      { url: 'https://example.com/x/a.png', alt: 'a' },
    ];
    const first = renderGalleryBlock(images);
    const second = renderGalleryBlock([...images]);
    expect(first).toBe(second);
  });

  it('does not embed timestamp-like content in the output', () => {
    const images: GalleryImageRef[] = [
      { url: 'https://example.com/x/a.png', alt: 'a' },
    ];
    const rendered = renderGalleryBlock(images);
    // No ISO-8601 date, no "generated" wording.
    expect(rendered).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(rendered.toLowerCase()).not.toContain('generated');
  });

  it('produces a readable, intentional markdown shape (not raw debug output)', () => {
    const images: GalleryImageRef[] = [
      { url: 'https://example.com/x/front.png', alt: 'front' },
      { url: 'https://example.com/x/side.png', alt: 'side' },
    ];
    const rendered = renderGalleryBlock(images);
    expect(rendered).toContain('<p align="center">');
    expect(rendered).toContain('<img src="https://example.com/x/front.png" alt="front"');
    expect(rendered).toContain('<img src="https://example.com/x/side.png" alt="side"');
    expect(rendered).toContain('</p>');
  });
});

describe('syncMarkerBlock', () => {
  it('replaces the matching block content, preserving everything else byte-for-byte', () => {
    const content = fixture('marker-valid-single.md');
    const newInner = '<p align="center">\n  <img src="new/side.png" alt="side" width="200">\n</p>';
    const result = syncMarkerBlock(content, 'pirate-raiders-3d-2', undefined, newInner);

    expect(result).toContain('new/side.png');
    expect(result).not.toContain('old/side.png');
    // Content before/after the block preserved.
    expect(result).toContain('Some intro text.');
    expect(result).toContain('More text after the block.');
  });

  it('disambiguates by gallery when multiple blocks share a slug', () => {
    const content =
      `<!-- brand:gallery:start slug="x" gallery="a" -->\nOLD A\n<!-- brand:gallery:end -->\n\n` +
      `<!-- brand:gallery:start slug="x" gallery="b" -->\nOLD B\n<!-- brand:gallery:end -->\n`;
    const result = syncMarkerBlock(content, 'x', 'a', 'NEW A');
    expect(result).toContain('NEW A');
    expect(result).toContain('OLD B');
    expect(result).not.toContain('OLD A');
  });

  it('throws a plain Error when no matching block is found', () => {
    const content = fixture('marker-different-slug.md');
    expect(() => syncMarkerBlock(content, 'nonexistent-slug', undefined, 'x')).toThrow();
  });

  it('throws MarkerParseError when the document has malformed markers', () => {
    const content = fixture('marker-duplicate.md');
    expect(() => syncMarkerBlock(content, 'x', undefined, 'new')).toThrow(MarkerParseError);
  });

  it('performs a destructive full replace, not a merge/patch', () => {
    const content = fixture('marker-valid-single.md');
    // New content is completely unrelated to old content in shape.
    const newInner = 'ENTIRELY DIFFERENT CONTENT — NO IMG TAGS AT ALL';
    const result = syncMarkerBlock(content, 'pirate-raiders-3d-2', undefined, newInner);
    expect(result).toContain('ENTIRELY DIFFERENT CONTENT — NO IMG TAGS AT ALL');
    expect(result).not.toContain('<img');
  });
});

// SYNC-CRLF / TESTS-002 — Windows-authored consuming READMEs can be CRLF. The
// marker/sync path previously spliced LF-only rendered markup into a CRLF file,
// producing mixed line endings, and left stray \r in innerContent. The
// readme-parser path is CRLF-tested (crlf.md fixture, .gitattributes pin); this
// closes the same asymmetry for the marker/sync path with inline CRLF strings.
describe('CRLF handling (SYNC-CRLF / TESTS-002)', () => {
  it('findMarkerBlocks strips stray \\r from innerContent on a CRLF document', () => {
    const content =
      `<!-- brand:gallery:start slug="x" -->\r\nOLD\r\n<!-- brand:gallery:end -->\r\n`;
    const blocks = findMarkerBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].innerContent).toBe('OLD');
    expect(blocks[0].innerContent).not.toContain('\r');
  });

  it('syncMarkerBlock preserves CRLF line endings (no lone LF among CRLFs)', () => {
    const content =
      `# Title\r\n\r\n<!-- brand:gallery:start slug="x" -->\r\n` +
      `  <img src="https://x/old.png" alt="old" width="200">\r\n` +
      `<!-- brand:gallery:end -->\r\n\r\nMore text.\r\n`;
    const newInner = renderGalleryBlock([{ url: 'https://x/new.png', alt: 'new' }]);
    const result = syncMarkerBlock(content, 'x', undefined, newInner);

    // The regenerated block adopts the document's CRLF style — a `[^\r]\n`
    // probe (a non-CR byte immediately before an LF, i.e. a lone LF) must NOT
    // match anywhere in the output.
    expect(/[^\r]\n/.test(result)).toBe(false);
    expect(result).toContain('new.png');
    expect(result).not.toContain('old.png');
    // Human-authored content outside the markers preserved byte-for-byte.
    expect(result).toContain('# Title\r\n');
    expect(result).toContain('More text.\r\n');
  });

  it('syncMarkerBlock leaves a pure-LF document LF-only (no CRLF introduced)', () => {
    const content =
      `# Title\n\n<!-- brand:gallery:start slug="x" -->\n` +
      `  <img src="https://x/old.png" alt="old" width="200">\n` +
      `<!-- brand:gallery:end -->\n\nMore text.\n`;
    const newInner = renderGalleryBlock([{ url: 'https://x/new.png', alt: 'new' }]);
    const result = syncMarkerBlock(content, 'x', undefined, newInner);
    expect(result).not.toContain('\r');
    expect(result).toContain('new.png');
  });
});

// PARSE-01 / PARSE-02 — attribute escaping + error enrichment.
describe('renderGalleryBlock HTML-attribute escaping (PARSE-01)', () => {
  it('escapes & and " in url/alt so a special-char filename stays well-formed', () => {
    const rendered = renderGalleryBlock([{ url: 'https://x/a & b.png', alt: 'a & "b"' }]);
    // & → &amp; and " → &quot; in BOTH attributes; no bare special char that
    // would emit invalid markup or close the attribute early.
    expect(rendered).toContain('src="https://x/a &amp; b.png"');
    expect(rendered).toContain('alt="a &amp; &quot;b&quot;"');
  });

  it('is still deterministic on special-char input (byte-identical on re-render)', () => {
    const images = [{ url: 'https://x/a & b.png', alt: 'a & b' }];
    expect(renderGalleryBlock(images)).toBe(renderGalleryBlock([...images]));
  });
});

describe('parseAttrs missing-slug error enrichment (PARSE-02)', () => {
  it('names the recognized keys and the offending key when slug is typo\'d', () => {
    const content = '<!-- brand:gallery:start slugg="x" -->\nOLD\n<!-- brand:gallery:end -->\n';
    try {
      findMarkerBlocks(content);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerParseError);
      const msg = (err as MarkerParseError).message;
      expect(msg).toContain('missing a required slug');
      expect(msg).toContain('slugg');
      expect(msg).toContain('recognized attributes: slug, gallery');
    }
  });
});

// F-75c9e0fc — fenced-code-block awareness. scanRawMarkers previously had NO
// fence/indented-code-block tracking at all (unlike readme-parser.ts's Gate
// 0), so a ```html usage example showing the marker pair was treated as a
// live block. This exact bug was live in this repo's own shipped README.md.
describe('fenced-code-block awareness (F-75c9e0fc)', () => {
  it('ignores a marker pair shown as a fenced ```html documentation example', () => {
    const content = fixture('marker-in-fenced-block.md');
    // Sanity: the fixture really contains the marker pair inside a fence.
    expect(content).toContain('```html');
    expect(content).toContain('brand:gallery:start');
    const blocks = findMarkerBlocks(content);
    expect(blocks).toEqual([]);
  });

  it('does not let syncMarkerBlock splice into the fenced documentation example', () => {
    const content = fixture('marker-in-fenced-block.md');
    // No REAL marker block exists in this document (the only occurrence is
    // fenced) — syncMarkerBlock must report "not found", not silently
    // rewrite the fence.
    expect(() =>
      syncMarkerBlock(content, 'pirate-raiders-3d-2', undefined, 'INJECTED'),
    ).toThrow(/No brand:gallery marker block found/);
  });

  it('still finds a real marker block that sits outside a fenced example in the same document', () => {
    const content = fixture('marker-fenced-and-real.md');
    const blocks = findMarkerBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slug).toBe('real-slug');
    expect(blocks[0].innerContent).toContain('real/front.png');
  });
});

// F-b5e9bc8c — splice by character offset, not line-array index. A start
// and end marker sharing ONE physical line previously duplicated that line
// (lines.slice(0, startLine+1) and lines.slice(endLine) both included it),
// orphaning the new content outside any marker pair and permanently
// bricking the file for future syncs (findMarkerBlocks would then throw
// MarkerParseError('duplicate') on the corrupted output).
describe('same-line start+end marker splice (F-b5e9bc8c)', () => {
  it('splices cleanly by character offset when start+end share one physical line (no duplication)', () => {
    const content = fixture('marker-same-line.md');
    const result = syncMarkerBlock(content, 'x', undefined, 'NEW CONTENT');

    // Exactly one start and one end marker in the output — no duplication.
    expect(result.match(/brand:gallery:start/g)?.length).toBe(1);
    expect(result.match(/brand:gallery:end/g)?.length).toBe(1);
    expect(result).toContain('NEW CONTENT');
    // Surrounding content preserved.
    expect(result).toContain('Before text.');
    expect(result).toContain('After text.');
  });

  it('does not orphan new content outside the marker pair (re-parses to exactly one clean block)', () => {
    const content = fixture('marker-same-line.md');
    const result = syncMarkerBlock(content, 'x', undefined, 'NEW CONTENT');

    // The previously-bricked failure mode: findMarkerBlocks on the synced
    // output threw MarkerParseError('duplicate') because the marker line
    // was duplicated. It must not throw now, and must find the new content
    // back inside a single clean block.
    const blocks = findMarkerBlocks(result);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slug).toBe('x');
    expect(blocks[0].innerContent).toBe('NEW CONTENT');
  });

  it('is idempotent: syncing the already-synced same-line output again is a no-op', () => {
    const content = fixture('marker-same-line.md');
    const first = syncMarkerBlock(content, 'x', undefined, 'NEW CONTENT');
    const second = syncMarkerBlock(first, 'x', undefined, 'NEW CONTENT');
    expect(second).toBe(first);
  });
});

// F-1513f9b6 — ReDoS. The old START_RE had three adjacent quantifiers
// (`\s+`, a lazy `[^>]*?`, and a trailing `\s*`) all able to match the same
// whitespace run. On an unclosed start marker followed by a long run of
// non-`>` text, the audit measured 7.78s to fail a single match at 5,000
// adversarial characters, and 10,000 did not complete within 60+ seconds
// (force-killed). Each test below sets an explicit low vitest timeout so a
// regression fails FAST instead of hanging the suite.
describe('ReDoS regression (F-1513f9b6)', () => {
  it(
    'does not catastrophically backtrack at the exact audit-measured size (5,000 adversarial chars)',
    () => {
      const adversarial = '<!-- brand:gallery:start' + ' '.repeat(5_000) + 'nomatch';
      const content = `# doc\n\n${adversarial}\n\nMore text after.\n`;

      const start = Date.now();
      const blocks = findMarkerBlocks(content);
      const elapsed = Date.now() - start;

      // Unclosed comment (no closing `-->` anywhere) — correctly not
      // recognized as a marker, no throw.
      expect(blocks).toEqual([]);
      expect(elapsed).toBeLessThan(500);
    },
    5_000,
  );

  it(
    'stays fast well past the size that used to hang 60+ seconds (20,000 adversarial chars)',
    () => {
      const adversarial = '<!-- brand:gallery:start' + ' '.repeat(20_000) + 'nomatch';

      const start = Date.now();
      const blocks = findMarkerBlocks(adversarial);
      const elapsed = Date.now() - start;

      expect(blocks).toEqual([]);
      expect(elapsed).toBeLessThan(500);
    },
    5_000,
  );
});

// F-7af8d8d9 — mixed-EOL preservation. `content.includes('\r\n') ? '\r\n' :
// '\n'` was a mere EXISTENCE check: a single stray CRLF line anywhere in an
// otherwise all-LF document flipped EVERY line in the output to CRLF,
// including lines completely unrelated to the gallery block. Existing CRLF
// tests only covered pure-LF and pure-CRLF documents.
describe('mixed-EOL preservation (F-7af8d8d9)', () => {
  it('computes the TRUE dominant EOL (58 LF lines + 1 stray CRLF) instead of flipping the whole file on ANY \\r\\n presence', () => {
    const strayLine = 'A stray Windows-pasted line.\r\n';
    const fillerBlock = (label: string, count: number) =>
      Array.from({ length: count }, (_, i) => `${label} ${i}.\n`).join('');

    const content =
      `# Title\n\n` +
      fillerBlock('Filler line', 20) +
      strayLine +
      fillerBlock('More filler', 19) +
      `\n<!-- brand:gallery:start slug="x" -->\nOLD\n<!-- brand:gallery:end -->\n\n` +
      fillerBlock('Trailing filler', 18);

    // Sanity: exactly one CRLF occurrence, comfortably outnumbered by LF-only lines.
    const crlfCount = (content.match(/\r\n/g) ?? []).length;
    expect(crlfCount).toBe(1);

    const newInner = renderGalleryBlock([{ url: 'https://x/new.png', alt: 'new' }]);
    const result = syncMarkerBlock(content, 'x', undefined, newInner);

    // Dominant style (LF) wins for the freshly-inserted content...
    expect(result).toContain('new.png');
    expect(result).not.toContain('OLD');
    // ...and the stray CRLF line elsewhere is preserved byte-for-byte, not
    // "fixed" and not used to flip the rest of the document to CRLF.
    expect(result).toContain(strayLine);
    expect((result.match(/\r\n/g) ?? []).length).toBe(1);
  });
});

// Idempotence — "sync claims byte-identical output across runs on unchanged
// input." Applying syncMarkerBlock a second time with the SAME rendered
// content must be a byte-identical no-op.
describe('idempotence — sync twice on unchanged input is a no-op', () => {
  it('produces byte-identical output when syncMarkerBlock is applied twice with the same content', () => {
    const content = fixture('marker-valid-single.md');
    const newInner = renderGalleryBlock([{ url: 'https://x/new.png', alt: 'new' }]);
    const first = syncMarkerBlock(content, 'pirate-raiders-3d-2', undefined, newInner);
    const second = syncMarkerBlock(first, 'pirate-raiders-3d-2', undefined, newInner);
    expect(second).toBe(first);
  });

  it('is idempotent across a CRLF document too', () => {
    const content =
      `# Title\r\n\r\n<!-- brand:gallery:start slug="x" -->\r\n` +
      `  <img src="https://x/old.png" alt="old" width="200">\r\n` +
      `<!-- brand:gallery:end -->\r\n\r\nMore text.\r\n`;
    const newInner = renderGalleryBlock([{ url: 'https://x/new.png', alt: 'new' }]);
    const first = syncMarkerBlock(content, 'x', undefined, newInner);
    const second = syncMarkerBlock(first, 'x', undefined, newInner);
    expect(second).toBe(first);
  });
});

// Composite duplicate-check key regression. findMarkerBlocks disambiguates
// blocks by joining slug+gallery into one Map key. slug/gallery come
// straight from the README's marker attributes and are NOT character-
// validated on this path (validateSlug in add-gallery.ts rejects
// `/ \ : * ? " < > |` and `..`, but never spaces, and isn't called here at
// all), so the join delimiter itself must be collision-proof — a printable
// delimiter like a plain space lets two DIFFERENT (slug, gallery) pairs
// produce the same joined string. This must not throw a spurious
// 'duplicate' MarkerParseError for two legitimately different blocks.
describe('composite duplicate-check key must not collide on user-controlled values', () => {
  it('treats slug="foo" gallery="bar baz" and slug="foo bar" gallery="baz" as two DIFFERENT blocks (a space-joined key would collide)', () => {
    // A space-joined key would produce the IDENTICAL string "foo bar baz"
    // for both blocks below ("foo" + " " + "bar baz" === "foo bar" + " " +
    // "baz"), so findMarkerBlocks would incorrectly throw
    // MarkerParseError('duplicate') for two blocks that are not duplicates
    // at all — they have different slugs.
    const content =
      `<!-- brand:gallery:start slug="foo" gallery="bar baz" -->\nFIRST\n<!-- brand:gallery:end -->\n\n` +
      `<!-- brand:gallery:start slug="foo bar" gallery="baz" -->\nSECOND\n<!-- brand:gallery:end -->\n`;

    const blocks = findMarkerBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ slug: 'foo', gallery: 'bar baz', innerContent: 'FIRST' });
    expect(blocks[1]).toMatchObject({ slug: 'foo bar', gallery: 'baz', innerContent: 'SECOND' });
  });
});
