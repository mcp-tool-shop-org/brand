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

import { computeCodeContext, type CodeContextInfo } from './code-context.js';

const START_TAG = 'brand:gallery:start';
const END_TAG = 'brand:gallery:end';

/** Maximum input size accepted by the parser, in bytes (5 MB) — mirrors
 *  readme-parser.ts's MAX_README_BYTES. Guards against feeding a binary
 *  file or generated artifact through the scanner. Defense-in-depth: the
 *  primary ReDoS fix is START_ANCHOR_RE below, not this cap (see F-1513f9b6). */
export const MAX_MARKER_DOC_BYTES = 5_000_000;

/**
 * Matches ONLY the fixed-literal anchor of a start marker tag name — e.g.
 * the `<!-- brand:gallery:start` prefix of:
 *   <!-- brand:gallery:start slug="x" -->
 *   <!-- brand:gallery:start slug="x" gallery="y" -->
 * The variable-length attribute fragment and its closing `-->` are found
 * via a linear `indexOf` scan in scanRawMarkers, NOT by this regex.
 *
 * The trailing lookahead `(?=\s|-->)` requires whatever follows "start" to
 * be either whitespace (the normal case — attrs or trailing space follow)
 * or the literal closer with zero attrs (`...start-->`). This preserves the
 * old regex's behavior of NOT recognizing a lookalike tag name (e.g.
 * `brand:gallery:starting`) as a marker.
 *
 * ReDoS fix (F-1513f9b6): the previous single regex —
 *   /<!--\s*brand:gallery:start((?:\s+[^>]*?)?)\s*-->/g
 * — had THREE quantifiers (`\s+`, a lazy `[^>]*?`, and a trailing `\s*`) all
 * able to match characters from the SAME whitespace run, separated only by
 * optional-group boundaries. On a start marker with no closing `-->` before
 * EOF, the engine had to explore every way of partitioning that run across
 * the three quantifiers before it could give up — polynomial blowup in the
 * run length. Measured: 7.78s for a single failed match at 5,000 adversarial
 * characters; 10,000 characters did not complete in 60+ seconds and had to
 * be force-killed. Splitting the match into a fixed-width anchor (this
 * regex — a single `\s*` before a fixed literal, no ambiguity, O(n)) plus a
 * linear `indexOf` search for the literal `-->` (also O(n), no backtracking
 * at all) removes the ambiguity entirely, regardless of input shape.
 */
const START_ANCHOR_RE = /<!--\s*brand:gallery:start(?=\s|-->)/g;
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
  /**
   * Character offset in the document immediately AFTER the start marker's
   * closing `-->`. Used by syncMarkerBlock to splice by character offset
   * rather than by line-array index (F-b5e9bc8c) — see its comment for why
   * line-index splicing corrupts a start+end pair that shares one line.
   */
  innerStartIndex: number;
  /** Character offset in the document immediately BEFORE the end marker's opening `<!--`. */
  innerEndIndex: number;
}

/**
 * Why a marker-shaped candidate was excluded from the live scan (F-6d5e4ea9).
 * Mirrors readme-parser.ts's RejectedMatch/RejectionReason mechanism, which
 * marker-parser.ts had no equivalent of until now — a marker inside a code
 * block was silently dropped with no return value distinguishing "found
 * nothing" from "found something, here is why it doesn't count."
 */
export type SuppressedMarkerReason = 'in-fenced-code-block' | 'in-indented-code-block';

export interface SuppressedMarkerCandidate {
  /** Whether the candidate is a start or end marker occurrence. */
  markerKind: 'start' | 'end';
  /** 1-indexed line the candidate marker itself sits on. */
  line: number;
  /** Why this candidate was excluded from the live marker scan. */
  reason: SuppressedMarkerReason;
  /**
   * Best-effort `slug` attribute for a suppressed START marker — parsed
   * leniently and NEVER throws (unlike parseAttrs on a live marker):
   * a documentation example is not held to the same attribute-grammar
   * standard as a real one. Undefined if attrs are missing/malformed, or
   * this candidate is an 'end' marker (which carries no attributes).
   */
  slug?: string;
  /** 1-indexed line the enclosing fence's OPENING delimiter is on. Only set
   *  when reason === 'in-fenced-code-block'. This fence, by construction,
   *  always found a matching close before EOF — see code-context.ts's
   *  module doc for why an unclosed fence never produces a suppressed
   *  candidate at all (it is treated as not-code instead). */
  fenceOpenLine?: number;
  /** 1-indexed line the enclosing 4-space-indented run began. Only set when
   *  reason === 'in-indented-code-block'. */
  indentedBlockStartLine?: number;
}

/**
 * Renders one SuppressedMarkerCandidate into a human-readable sentence, e.g.
 *   `a brand:gallery:start slug="my-tool" at line 42 is inside a code block opened at line 8`
 * Exported so callers outside this module (e.g. sync.ts's "no marker block
 * found" error) can surface the identical phrasing without reimplementing
 * it — see syncMarkerBlock below for the in-domain caller that already uses
 * this.
 */
export function describeSuppressedMarkerCandidate(candidate: SuppressedMarkerCandidate): string {
  const label =
    candidate.markerKind === 'start'
      ? `a brand:gallery:start${candidate.slug ? ` slug="${candidate.slug}"` : ''}`
      : 'a brand:gallery:end';
  if (candidate.reason === 'in-fenced-code-block') {
    return `${label} at line ${candidate.line} is inside a code block opened at line ${candidate.fenceOpenLine}`;
  }
  return `${label} at line ${candidate.line} is inside a 4-space-indented code block starting at line ${candidate.indentedBlockStartLine}`;
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
    // If the operator supplied OTHER keys, they most likely typo'd `slug`
    // (e.g. `slugg="x"`). Name the recognized keys and what was actually found
    // so the fix is one glance away, matching the rest of the CLI's actionable
    // error bar.
    const foundKeys = Object.keys(attrs);
    const hint =
      foundKeys.length > 0
        ? ` (recognized attributes: slug, gallery; found: ${foundKeys.join(', ')} — check for a typo)`
        : '';
    throw new MarkerParseError(
      `Marker at ${context} is missing a required slug="..." attribute.${hint}`,
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

/**
 * Scans `content` for start/end marker occurrences.
 *
 * Two hardening fixes live here:
 *  - F-1513f9b6 (ReDoS): start markers are found via a fixed-width anchor
 *    (START_ANCHOR_RE) plus a linear `indexOf` search for the closing
 *    `-->`, never a single backtracking regex over the whole comment span.
 *  - F-75c9e0fc (fenced-code-block awareness): a marker whose LINE falls
 *    inside a fenced (```/~~~) or 4-space-indented code block is a
 *    documentation example, not a live marker, and is excluded from the
 *    live scan — mirroring readme-parser.ts's Gate 0 exactly (shared via
 *    code-context.ts, not a second divergent implementation). This repo's
 *    own README.md shipped with exactly this bug: a ```html usage example
 *    showing the marker pair was treated as a live block.
 *
 * If `onSuppressed` is provided, a marker-shaped occurrence excluded by the
 * code-context gate is reported there (reason + line numbers) instead of
 * silently vanishing (F-6d5e4ea9) — mirroring readme-parser.ts's
 * onReject/RejectedMatch mechanism, which this module had no equivalent of
 * before. Only occurrences that are otherwise well-formed (a start marker
 * with SOME closing `-->` before EOF) are reported; something that isn't a
 * well-formed marker comment at all was never a "candidate" to begin with,
 * code context or not — same as the pre-existing behavior for a live
 * unterminated comment (see the closeIdx === -1 branch below).
 */
function scanRawMarkers(
  content: string,
  onSuppressed?: (candidate: SuppressedMarkerCandidate) => void,
): RawMarker[] {
  const markers: RawMarker[] = [];
  const lines = content.split('\n');
  const codeContext = computeCodeContext(lines);

  const reportSuppressed = (
    markerKind: 'start' | 'end',
    line: number,
    slug: string | undefined,
  ): void => {
    if (!onSuppressed) return;
    const info: CodeContextInfo | undefined = codeContext[line];
    if (!info || !info.inCode) return;
    if (info.kind === 'indented') {
      onSuppressed({
        markerKind,
        line: line + 1,
        reason: 'in-indented-code-block',
        indentedBlockStartLine: (info.indentedBlockStartLine ?? line) + 1,
        ...(slug !== undefined ? { slug } : {}),
      });
      return;
    }
    // kind === 'fenced' — the only other kind computeCodeContext produces
    // for an inCode:true line.
    onSuppressed({
      markerKind,
      line: line + 1,
      reason: 'in-fenced-code-block',
      fenceOpenLine: (info.fenceOpenLine ?? line) + 1,
      ...(slug !== undefined ? { slug } : {}),
    });
  };

  START_ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = START_ANCHOR_RE.exec(content)) !== null) {
    const anchorEnd = m.index + m[0].length;
    const line = lineAt(content, m.index);

    // Linear scan for the literal closing delimiter — O(n), no
    // backtracking, regardless of what (or how much) sits between the tag
    // name and its close (F-1513f9b6).
    const closeIdx = content.indexOf('-->', anchorEnd);
    if (closeIdx === -1) {
      // No closing delimiter anywhere before EOF: not a well-formed HTML
      // comment at all, so (matching the old regex's behavior when it
      // could never complete a match) this occurrence is not recognized as
      // a marker. This is distinct from findMarkerBlocks's 'unclosed'
      // error, which is about a well-formed start COMMENT with no matching
      // END MARKER later in the document.
      continue;
    }

    const attrsRaw = content.slice(anchorEnd, closeIdx);

    if (codeContext[line]?.inCode) {
      // F-75c9e0fc: a documentation example, not a live marker. F-6d5e4ea9:
      // tell the caller WHY, best-effort — parseAttrs must NEVER throw here,
      // since a documentation example is not held to the live-marker
      // attribute grammar (e.g. it may have no slug at all).
      let slug: string | undefined;
      try {
        slug = parseAttrs(attrsRaw, `line ${line + 1}`).slug;
      } catch {
        slug = undefined;
      }
      reportSuppressed('start', line, slug);
      continue;
    }

    markers.push({
      kind: 'start',
      index: m.index,
      endIndex: closeIdx + 3,
      line,
      attrsRaw,
    });
  }

  END_RE.lastIndex = 0;
  while ((m = END_RE.exec(content)) !== null) {
    const line = lineAt(content, m.index);
    if (codeContext[line]?.inCode) {
      reportSuppressed('end', line, undefined);
      continue;
    }

    markers.push({
      kind: 'end',
      index: m.index,
      endIndex: m.index + m[0].length,
      line,
    });
  }

  markers.sort((a, b) => a.index - b.index);
  return markers;
}

/**
 * Shared implementation behind findMarkerBlocks/findMarkerBlocksVerbose.
 * `onSuppressed`, when provided, receives every marker-shaped occurrence the
 * code-context gate excluded from the live scan (F-6d5e4ea9) — see
 * scanRawMarkers's doc comment. Structural validation (nested/unclosed/
 * duplicate/malformed-attrs) applies identically regardless of whether
 * `onSuppressed` is provided: suppressed candidates are never considered
 * "live" markers, so they can never trigger or resolve a structural error.
 */
function findMarkerBlocksInternal(
  content: string,
  onSuppressed?: (candidate: SuppressedMarkerCandidate) => void,
): MarkerBlock[] {
  if (content.length > MAX_MARKER_DOC_BYTES) {
    throw new Error(
      `marker-parser: refusing to parse document of ${content.length} bytes ` +
        `(MAX_MARKER_DOC_BYTES = ${MAX_MARKER_DOC_BYTES}). Pass a smaller input or ` +
        `raise the limit if this is a legitimate README.`,
    );
  }

  const raw = scanRawMarkers(content, onSuppressed);
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
    // Strip the leading/trailing newline that abuts the marker lines. Match
    // `\r?\n` (not bare `\n`) so a CRLF document doesn't leave a dangling `\r`
    // at either end of innerContent — otherwise extractFilenames and block
    // matching see stray carriage returns on Windows-authored READMEs.
    const innerContent = content.slice(openStart.endIndex, marker.index).replace(/^\r?\n/, '').replace(/\r?\n$/, '');

    blocks.push({
      slug,
      ...(gallery !== undefined ? { gallery } : {}),
      startLine: openStart.line,
      endLine: marker.line,
      innerContent,
      innerStartIndex: openStart.endIndex,
      innerEndIndex: marker.index,
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
  //
  // The composite key joins two USER-CONTROLLED strings (slug/gallery come
  // straight from the README's marker attributes, unvalidated on this path —
  // validateSlug in add-gallery.ts rejects `/ \ : * ? " < > |` and `..`, but
  // never spaces, and isn't called here at all). A printable delimiter like
  // a space is NOT collision-proof: slug="foo" gallery="bar baz" and
  // slug="foo bar" gallery="baz" would both join to "foo bar baz" and be
  // treated as the same block, throwing a spurious 'duplicate' error for two
  // legitimately different ones. `\u0000` (NUL) is the conventional fix for
  // exactly this — it cannot appear in either field, so distinct
  // (slug, gallery) pairs can never collide. Do NOT "clean up" this escape
  // back to a literal character; see the composite-key regression test
  // below for the exact collision this prevents.
  const seen = new Map<string, MarkerBlock>();
  for (const block of blocks) {
    const key = `${block.slug}\u0000${block.gallery ?? ''}`;
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
 *
 * Throws a plain Error if `content.length > MAX_MARKER_DOC_BYTES` (5 MB) —
 * defense-in-depth mirroring readme-parser.ts's MAX_README_BYTES guard.
 *
 * Use {@link findMarkerBlocksVerbose} to also introspect marker-shaped
 * candidates that were excluded by the fenced/indented code-context gate
 * (F-6d5e4ea9) — the mirror of readme-parser.ts's findLogoImgTags/
 * findAllImgTags pair.
 */
export function findMarkerBlocks(content: string): MarkerBlock[] {
  return findMarkerBlocksInternal(content);
}

/**
 * Finds all valid marker blocks in `content`, AND introspects marker-shaped
 * candidates that were excluded by the fenced/indented code-context gate —
 * a `<!-- brand:gallery:start -->` (or `:end`) that regex-matches but whose
 * line sits inside a code block. `blocks` is exactly what
 * {@link findMarkerBlocks} returns (same structural-error throws, same
 * shape). `suppressed` carries a `reason` + line numbers per candidate,
 * mirroring readme-parser.ts's `findAllImgTags` (F-6d5e4ea9) — useful for
 * turning "no marker block found" into "found one, here is why it doesn't
 * count" (see syncMarkerBlock below).
 */
export function findMarkerBlocksVerbose(content: string): {
  blocks: MarkerBlock[];
  suppressed: SuppressedMarkerCandidate[];
} {
  const suppressed: SuppressedMarkerCandidate[] = [];
  const blocks = findMarkerBlocksInternal(content, (candidate) => {
    suppressed.push(candidate);
  });
  return { blocks, suppressed };
}

export interface GalleryImageRef {
  url: string;
  alt: string;
}

/**
 * Escape a value for safe interpolation into a double-quoted HTML attribute.
 * A gallery filename may legally contain `&` (every filesystem) or `"` (macOS/
 * Linux dev boxes), which would otherwise emit invalid markup a strict
 * consuming-repo linter rejects, or close the attribute early and produce a
 * broken <img> tag — undercutting this module's clean-deterministic-output
 * contract. Escape `&` first so the entities we introduce aren't double-escaped.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    (img) => `  <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt)}" width="200">`,
  );
  return ['<p align="center">', ...lines, '</p>'].join('\n');
}

/**
 * Computes the TRUE dominant end-of-line style by counting CRLF pairs vs.
 * bare-LF occurrences and picking whichever is strictly more frequent (a
 * tie, including the zero-newline case, defaults to LF).
 *
 * Fixes F-7af8d8d9: the previous `content.includes('\r\n') ? '\r\n' : '\n'`
 * was a mere EXISTENCE check — a single stray CRLF line anywhere in an
 * otherwise all-LF document flipped the ENTIRE file to CRLF. This only
 * decides the style of the freshly-inserted content between the markers
 * now (see syncMarkerBlock) — content outside the spliced span is copied
 * verbatim from the original string and keeps whatever line-ending mix it
 * already had, byte-for-byte, regardless of what dominates.
 */
function dominantEol(content: string): '\r\n' | '\n' {
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      if (content[i - 1] === '\r') crlf++;
      else lf++;
    }
  }
  return crlf > lf ? '\r\n' : '\n';
}

/**
 * Replaces the content of the marker block matching slug+gallery with
 * newInnerContent. Preserves everything else in `content` byte-for-byte.
 *
 * Throws if no matching block is found (plain Error — this is a "not
 * found" condition the caller maps to its own exit-code contract), or
 * MarkerParseError if the document's markers are malformed per the rules
 * documented on findMarkerBlocks.
 *
 * F-6d5e4ea9: the "not found" error is no longer a bare dead end. It uses
 * findMarkerBlocksVerbose internally, and when a suppressed candidate for
 * the SAME slug exists (a start marker regex-matched but was excluded
 * because it sits inside a code block), the message names exactly where
 * and why — "found a brand:gallery:start ... but it is inside a code block
 * opened at line N" — instead of leaving the operator to guess whether they
 * ever added a marker at all.
 *
 * Splices at CHARACTER offsets, not line-array indices (F-b5e9bc8c). The
 * previous implementation split the WHOLE document into a line array and
 * sliced `lines.slice(0, startLine + 1)` / `lines.slice(endLine)`. When a
 * start and end marker shared ONE physical line, that line was included in
 * BOTH halves — duplicating the marker line and orphaning the new content
 * between two now-complete (empty) marker pairs, which then made the VERY
 * NEXT findMarkerBlocks call throw MarkerParseError('duplicate') — the file
 * was permanently bricked for automated sync. Splicing at
 * `match.innerStartIndex` (right after the start marker's `-->`) and
 * `match.innerEndIndex` (right before the end marker's `<!--`) has no such
 * overlap regardless of whether the markers share a line, and — as a side
 * effect — leaves everything outside that exact span byte-for-byte
 * untouched (no whole-document line-split/rejoin to normalize unrelated
 * EOLs; see dominantEol above for F-7af8d8d9).
 */
export function syncMarkerBlock(
  content: string,
  slug: string,
  gallery: string | undefined,
  newInnerContent: string,
): string {
  const suppressed: SuppressedMarkerCandidate[] = [];
  const blocks = findMarkerBlocksInternal(content, (candidate) => {
    suppressed.push(candidate);
  });
  const match = blocks.find((b) => b.slug === slug && (b.gallery ?? undefined) === (gallery ?? undefined));

  if (!match) {
    const base = `No brand:gallery marker block found for slug="${slug}"${gallery ? ` gallery="${gallery}"` : ''}.`;
    // Only candidates that at least LOOK like they're for the same slug (or
    // whose slug couldn't be determined at all, e.g. a malformed example)
    // are worth naming here — a suppressed marker for an unrelated slug
    // would be noise, not a hint.
    const relevant = suppressed.filter(
      (c) => c.markerKind === 'start' && (c.slug === undefined || c.slug === slug),
    );
    const hint = relevant.length > 0
      ? ' ' +
        relevant
          .map((c) => {
            const sentence = describeSuppressedMarkerCandidate(c);
            return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
          })
          .join(' ')
      : '';
    throw new Error(base + hint);
  }

  const eol = dominantEol(content);
  const before = content.slice(0, match.innerStartIndex);
  const after = content.slice(match.innerEndIndex);
  const middle =
    newInnerContent.length > 0
      ? eol + newInnerContent.split(/\r?\n/).join(eol) + eol
      : eol;

  return before + middle + after;
}
