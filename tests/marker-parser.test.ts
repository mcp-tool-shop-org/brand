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
