/**
 * marker-parser.ts — Dynamic README block markers.
 *
 * A consuming repo's README can contain a machine-owned, regenerable block
 * delimited by HTML comment markers:
 *
 *   <!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
 *   ...generated content...
 *   <!-- brand:gallery:end -->
 *
 * The `gallery` marker type is the first of a family (`brand:<type>:start`/
 * `brand:<type>:end`) — this module is scoped to the `gallery` type today,
 * but the attribute grammar (slug + optional disambiguator) is written so a
 * future `brand:badges:start` / `brand:stats:start` block type does not
 * collide with this one; each type owns its own start/end marker pair.
 *
 * An optional `gallery="<foldername>"` attribute disambiguates when a slug
 * has more than one gallery subfolder.
 *
 * Design precedents this module follows on purpose (do not "improve" away
 * from these without re-reading the spec that earned them):
 *
 * 1. Whole-document marker search, not fixed position (doctoc precedent) —
 *    findMarkerBlocks scans the ENTIRE document for marker pairs; a
 *    generated block may be relocated anywhere in the file by a human editor
 *    and the tool still finds it.
 * 2. Destructive replace between markers, not merge/diff-patch
 *    (terraform-docs `inject` mode precedent) — syncMarkerBlock fully
 *    replaces inner content on every regeneration. Content OUTSIDE the
 *    markers is untouched, byte-for-byte. Never attempt incremental patching
 *    of the inner content.
 * 3. Hard-fail on duplicate or nested markers for the same slug+gallery —
 *    never silently pick the first/last match. A second start marker before
 *    the first one's matching end is NESTED. Two complete, non-overlapping
 *    pairs for the identical slug+gallery combination in one file is a
 *    DUPLICATE. Both are hard errors (MarkerParseError).
 * 4. Deterministic output — no timestamps or non-stable ordering embedded in
 *    generated content (swagger-codegen/protobuf.js precedent). Regenerating
 *    with unchanged inputs must produce byte-identical output, so a future
 *    `--check`/drift-detection consumer sees zero diff for zero semantic
 *    change. renderGalleryBlock sorts images by filename using a natural
 *    (numeric-aware) sort — never relies on filesystem readdir order.
 */

const START_TAG = 'brand:gallery:start';
const END_TAG = 'brand:gallery:end';

/**
 * Matches a start marker line/fragment:
 *   <!-- brand:gallery:start slug="x" -->
 *   <!-- brand:gallery:start slug="x" gallery="y" -->
 * Attribute order is NOT fixed (slug/gallery may appear in either order).
 * Captures the raw attribute string for further validation.
 */
const START_RE = /<!--\s*brand:gallery:start((?:\s+[^>]*?)?)\s*-->/g;
const END_RE = /<!--\s*brand:gallery:end\s*-->/g;

/** Recognizes a well-formed `key="value"` attribute pair. */
const ATTR_RE = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"/g;

export type MarkerParseErrorReason = 'duplicate' | 'nested' | 'unclosed' | 'malformed-attrs';

export class MarkerParseError extends Error {
  readonly reason: MarkerParseErrorReason;
  constructor(message: string, reason: MarkerParseErrorReason) {
    super(message);
    this.name = 'MarkerParseError';
    this.reason = reason;
  }
}

export interface MarkerBlock {
  slug: string;
  /** The explicit `gallery="..."` attribute if present, else undefined. */
  gallery?: string;
  /** 0-indexed line of the START marker. */
  startLine: number;
  /** 0-indexed line of the END marker. */
  endLine: number;
  /** Current content between the markers (excluding the marker lines themselves). */
  innerContent: string;
}

/**
 * Parse the attribute fragment of a start marker (everything after
 * `brand:gallery:start` and before the closing `-->`). Returns the
 * recognized `slug`/`gallery` values.
 *
 * Malformed input (an attribute-looking fragment that isn't valid
 * `key="value"` pairs, or a missing/blank `slug`) throws MarkerParseError
 * with reason 'malformed-attrs'.
 */
function parseAttrs(raw: string, context: string): { slug: string; gallery?: string } {
  const trimmed = raw.trim();
  const attrs: Record<string, string> = {};

  if (trimmed.length > 0) {
    // Validate the WHOLE fragment is composed of key="value" pairs
    // separated by whitespace — anything left over is malformed syntax
    // (e.g. unquoted values, stray tokens, unterminated quotes).
    let cursor = 0;
    ATTR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const consumedRanges: Array<[number, number]> = [];
    while ((m = ATTR_RE.exec(trimmed)) !== null) {
      consumedRanges.push([m.index, m.index + m[0].length]);
      const key = m[1];
      const value = m[2];
      if (key === undefined || value === undefined) continue;
      attrs[key] = value;
    }
    // Reconstruct what's left after removing all matched attr spans; if
    // anything non-whitespace remains, the fragment is malformed.
    let remainder = '';
    let last = 0;
    for (const [start, end] of consumedRanges) {
      remainder += trimmed.slice(last, start);
      last = end;
    }
    remainder += trimmed.slice(last);
    if (remainder.trim().length > 0 || consumedRanges.length === 0) {
      throw new MarkerParseError(
        `Malformed marker attributes near ${context}: "${raw.trim()}"`,
        'malformed-attrs',
      );
    }
    cursor = last;
    void cursor;
  }

  const slug = attrs.slug;
  if (!slug || slug.trim().length === 0) {
    throw new MarkerParseError(
      `Marker at ${context} is missing a required slug="..." attribute.`,
      'malformed-attrs',
    );
  }

  const gallery = attrs.gallery;
  const result: { slug: string; gallery?: string } = { slug };
  if (gallery !== undefined && gallery.trim().length > 0) {
    result.gallery = gallery;
  }
  return result;
}

interface RawMarker {
  kind: 'start' | 'end';
  /** Character offset in the full document where the marker begins. */
  index: number;
  /** Character offset where the marker ends (exclusive). */
  endIndex: number;
  /** 0-indexed line number the marker starts on. */
  line: number;
  /** Raw attribute fragment (start markers only). */
  attrsRaw?: string;
}

/** Compute 0-indexed line number for a character offset in `content`. */
function lineAt(content: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function scanRawMarkers(content: string): RawMarker[] {
  const markers: RawMarker[] = [];

  START_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = START_RE.exec(content)) !== null) {
    markers.push({
      kind: 'start',
      index: m.index,
      endIndex: m.index + m[0].length,
      line: lineAt(content, m.index),
      attrsRaw: m[1] ?? '',
    });
  }

  END_RE.lastIndex = 0;
  while ((m = END_RE.exec(content)) !== null) {
    markers.push({
      kind: 'end',
      index: m.index,
      endIndex: m.index + m[0].length,
      line: lineAt(content, m.index),
    });
  }

  markers.sort((a, b) => a.index - b.index);
  return markers;
}

/**
 * Finds all valid marker blocks in `content`.
 *
 * Throws MarkerParseError on:
 *   - nested start markers (a second start before the open one's end)
 *   - an unclosed start marker (no matching end before EOF)
 *   - a stray end marker with no open start
 *   - malformed slug/gallery attribute syntax
 *   - duplicate blocks: two complete, non-overlapping pairs for the
 *     identical slug+gallery combination in the same document
 *
 * A document with no markers returns an empty array without throwing. A
 * document containing markers only for other slugs still returns those
 * blocks — callers are responsible for filtering by the slug/gallery they
 * care about (see syncMarkerBlock).
 */
export function findMarkerBlocks(content: string): MarkerBlock[] {
  const raw = scanRawMarkers(content);
  const blocks: MarkerBlock[] = [];

  let openStart: RawMarker | null = null;

  for (const marker of raw) {
    if (marker.kind === 'start') {
      if (openStart !== null) {
        throw new MarkerParseError(
          `Nested brand:gallery marker: a new start marker was found at line ${marker.line + 1} ` +
            `before the start marker opened at line ${openStart.line + 1} was closed.`,
          'nested',
        );
      }
      openStart = marker;
      continue;
    }

    // kind === 'end'
    if (openStart === null) {
      throw new MarkerParseError(
        `Stray brand:gallery:end marker at line ${marker.line + 1} with no matching start marker.`,
        'unclosed',
      );
    }

    const { slug, gallery } = parseAttrs(openStart.attrsRaw ?? '', `line ${openStart.line + 1}`);
    const innerContent = content.slice(openStart.endIndex, marker.index).replace(/^\n/, '').replace(/\n$/, '');

    blocks.push({
      slug,
      ...(gallery !== undefined ? { gallery } : {}),
      startLine: openStart.line,
      endLine: marker.line,
      innerContent,
    });

    openStart = null;
  }

  if (openStart !== null) {
    throw new MarkerParseError(
      `Unclosed brand:gallery:start marker at line ${openStart.line + 1} — no matching end marker found.`,
      'unclosed',
    );
  }

  // Duplicate check: two complete, non-overlapping pairs for the identical
  // slug+gallery combination.
  const seen = new Map<string, MarkerBlock>();
  for (const block of blocks) {
    const key = `${block.slug} ${block.gallery ?? ''}`;
    const existing = seen.get(key);
    if (existing) {
      throw new MarkerParseError(
        `Duplicate brand:gallery marker block for slug="${block.slug}"` +
          `${block.gallery ? ` gallery="${block.gallery}"` : ''}: ` +
          `found at lines ${existing.startLine + 1}-${existing.endLine + 1} and ${block.startLine + 1}-${block.endLine + 1}.`,
        'duplicate',
      );
    }
    seen.set(key, block);
  }

  return blocks;
}

export interface GalleryImageRef {
  url: string;
  alt: string;
}

/**
 * Natural (numeric-aware) comparator: "image9" sorts before "image10".
 * Splits each string into runs of digits vs. non-digits and compares
 * digit runs numerically, non-digit runs lexicographically.
 */
function naturalCompare(a: string, b: string): number {
  const re = /(\d+|\D+)/g;
  const aParts = a.match(re) ?? [];
  const bParts = b.match(re) ?? [];
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i];
    const bp = bParts[i];
    if (ap === undefined) return -1;
    if (bp === undefined) return 1;
    const aIsNum = /^\d+$/.test(ap);
    const bIsNum = /^\d+$/.test(bp);
    if (aIsNum && bIsNum) {
      const diff = Number(ap) - Number(bp);
      if (diff !== 0) return diff;
      // Equal numeric value but different literal (e.g. "01" vs "1") —
      // fall back to string compare of the literal so output is still
      // deterministic and stable.
      if (ap !== bp) return ap < bp ? -1 : 1;
    } else {
      if (ap !== bp) return ap < bp ? -1 : 1;
    }
  }
  return 0;
}

/** Sort images by URL's filename, natural/numeric-aware ("image9" < "image10"). */
function sortImagesByFilename(images: GalleryImageRef[]): GalleryImageRef[] {
  const filenameOf = (url: string): string => {
    const parts = url.split('/');
    return parts[parts.length - 1] ?? url;
  };
  return [...images].sort((a, b) => naturalCompare(filenameOf(a.url), filenameOf(b.url)));
}

/**
 * Renders deterministic markdown for a gallery block: natural-sorted by
 * filename, no timestamps or other non-stable content. Calling this twice
 * with the same input produces byte-identical output.
 *
 * Shape: a simple centered row of images, one per line inside a <p>
 * wrapper, each with a readable alt derived from the filename (without
 * extension) — intentional, human-readable README content, not raw debug
 * dump.
 */
export function renderGalleryBlock(images: GalleryImageRef[]): string {
  const sorted = sortImagesByFilename(images);
  if (sorted.length === 0) {
    return '<!-- no gallery images -->';
  }
  const lines = sorted.map(
    (img) => `  <img src="${img.url}" alt="${img.alt}" width="200">`,
  );
  return ['<p align="center">', ...lines, '</p>'].join('\n');
}

/**
 * Replaces the content of the marker block matching slug+gallery with
 * newInnerContent. Preserves everything else in `content` byte-for-byte.
 *
 * Throws if no matching block is found (plain Error — this is a "not
 * found" condition the caller maps to its own exit-code contract), or
 * MarkerParseError if the document's markers are malformed per the rules
 * documented on findMarkerBlocks.
 */
export function syncMarkerBlock(
  content: string,
  slug: string,
  gallery: string | undefined,
  newInnerContent: string,
): string {
  const blocks = findMarkerBlocks(content);
  const match = blocks.find((b) => b.slug === slug && (b.gallery ?? undefined) === (gallery ?? undefined));

  if (!match) {
    throw new Error(
      `No brand:gallery marker block found for slug="${slug}"${gallery ? ` gallery="${gallery}"` : ''}.`,
    );
  }

  const lines = content.split('\n');
  const before = lines.slice(0, match.startLine + 1);
  const after = lines.slice(match.endLine);
  const middle = newInnerContent.length > 0 ? newInnerContent.split('\n') : [];

  return [...before, ...middle, ...after].join('\n');
}
