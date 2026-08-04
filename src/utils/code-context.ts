/**
 * code-context.ts — shared fenced/indented markdown code-block detection.
 *
 * Both readme-parser.ts (logo <img> gating) and marker-parser.ts (brand:gallery
 * marker gating) must treat a documentation example inside a fenced
 * (```/~~~) or 4-space-indented code block as inert — never a live tag or
 * marker. This is a SHARED implementation precisely so the two parsers can
 * never silently diverge on what counts as "code" (F-75c9e0fc): before this
 * module existed, marker-parser.ts had no fence awareness at all, and this
 * repo's own shipped README.md tripped the bug — a ```html usage example
 * showing the `<!-- brand:gallery:start -->`/`<!-- brand:gallery:end -->`
 * pair was treated as a live block, and `brand sync` spliced rendered HTML
 * directly into the fenced documentation.
 *
 * Fence rules (CommonMark-derived, ported verbatim from readme-parser.ts's
 * original Gate 0 — do not "improve" away from these without re-reading
 * both consumers first):
 *  - A fence is 3+ backticks or 3+ tildes, with up to 3 leading spaces. The
 *    fence character (` or ~) must match to close; a ``` fence is not
 *    closed by ~~~ and vice versa.
 *  - A line beginning with 4+ spaces (or a tab) immediately after a blank
 *    line is an indented code block. This is a proxy for CommonMark's real
 *    block-context rule (not list/blockquote-aware) — good enough for real
 *    READMEs.
 *
 * F-6d5e4ea9 (Stage A regression, fixed here) — two independent bugs:
 *
 * 1. UNCLOSED FENCE, SILENT SWALLOW. The original implementation toggled a
 *    single `inFencedBlock` boolean: once a fence opened, EVERY remaining
 *    line through EOF was "code" unless a same-character closing fence was
 *    found. An unclosed fence (a very common typo — forgetting the closing
 *    ```) therefore silently suppressed every real marker/logo later in the
 *    document, and the caller-facing symptom ("no marker block found") was
 *    indistinguishable from the user never having added one at all.
 *
 *    Per the CommonMark spec (spec.commonmark.org/0.31.2/#fenced-code-blocks):
 *    "If the end of the containing block (or document) is reached and no
 *    closing code fence has been found, the code block contains all of the
 *    lines after the opening code fence until the end of the containing
 *    block (or document)." Example 127 confirms this is not a corner case:
 *    a 5-backtick fence that never closes swallows a LATER, shorter ```
 *    sequence and everything after it as literal code, all the way to EOF.
 *    This is also exactly how GitHub itself renders a README with a
 *    forgotten closing fence — the rest of the file turns into one grey
 *    code block, headers included.
 *
 *    So the original "swallow to EOF" behavior is, in fact, spec-correct
 *    Markdown rendering — verified, not assumed. This module DELIBERATELY
 *    DIVERGES from that rendering rule anyway, because this module is not a
 *    renderer: it exists for exactly one narrow purpose, deciding whether a
 *    brand:gallery marker or logo <img> is "live" or "a documentation
 *    example." For that purpose, the cost asymmetry is not close: an
 *    unclosed fence is overwhelmingly a typo, not an intentional act, and
 *    letting it swallow arbitrarily much of the REST of the document —
 *    however many unrelated headings, markers, or images sit after it —
 *    means a single missing ``` anywhere in a README can make a real,
 *    well-formed marker vanish with zero explanation. The alternative risk
 *    (occasionally still recognizing a marker/img that happens to sit
 *    inside someone's forgotten-fence code sample) is far narrower: it
 *    requires the unclosed fence to ALSO happen to wrap a marker/logo
 *    example specifically, not just any code. So: once EOF is reached with
 *    a fence still open, that fence is treated, retroactively, as if it had
 *    never opened at all — none of its lines (including the dangling
 *    opening delimiter itself) are "code" for gating purposes. This does
 *    NOT fix the document's own GitHub rendering (GitHub will still render
 *    the rest of the file as one code block until the typo is fixed) — it
 *    only fixes this module's marker/logo classification, which is the one
 *    thing in this codebase's control.
 *
 * 2. UTF-8 BOM DEFEATS THE `^`-ANCHORED REGEXES. A BOM (U+FEFF) can only
 *    legally appear as the literal first character of a document, and
 *    `content.split('\n')` leaves it attached to `lines[0]` verbatim. Both
 *    anchored regexes below require the very first character of the line to
 *    be a space/backtick/tilde or space/tab as appropriate; the invisible
 *    BOM sits in front of all of them and defeats the match. A documentation
 *    example whose very first line opens a fence (or is itself an indented
 *    line) was therefore wrongly left OUT of code context on a BOM-prefixed
 *    file, so a marker/logo inside it was wrongly treated as live. Fixed by
 *    stripping a leading BOM before testing line 0 against either regex —
 *    scoped to line 0 only, since a BOM elsewhere in a line is not a BOM.
 */

/** Which kind of code context a line falls into. */
export type CodeContextKind = 'fenced' | 'indented';

/**
 * Per-line code-context detail. `inCode` is the boolean gate every caller
 * must respect (a marker/img inside a code block is never live). The rest
 * is diagnostic-only metadata so a caller can explain WHY a suppressed
 * candidate was suppressed instead of silently dropping it.
 */
export interface CodeContextInfo {
  /** True when this line is inside a fenced or 4-space-indented code block
   *  (including the fence delimiter lines themselves). */
  inCode: boolean;
  /** Which kind of code context applies. Only present when inCode is true. */
  kind?: CodeContextKind;
  /** 0-indexed line where the enclosing fence's OPENING delimiter appears.
   *  Only present when kind === 'fenced'. Note this fence is, by
   *  construction, always one that found a matching close before EOF — an
   *  unclosed fence never produces inCode:true lines at all (see module doc,
   *  point 1), so there is no "was it ever closed?" flag to expose here. */
  fenceOpenLine?: number;
  /** 0-indexed line where the current contiguous 4-space-indented run
   *  began. Only present when kind === 'indented'. */
  indentedBlockStartLine?: number;
}

/**
 * Computes per-line code-context info for `lines`. See module doc for the
 * fence/indent detection rules and the F-6d5e4ea9 unclosed-fence and BOM
 * fixes.
 */
export function computeCodeContext(lines: readonly string[]): CodeContextInfo[] {
  const result: CodeContextInfo[] = [];

  let inFencedBlock = false;
  let fenceChar: '`' | '~' | null = null;
  let fenceOpenLine: number | null = null;
  let prevLineBlank = true; // line 0 is treated as "after blank" for indented-block detection
  let indentedStart: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) {
      result.push({ inCode: false });
      continue;
    }
    // BOM fix (point 2 above) — only line 0 can ever carry a real BOM.
    const line =
      i === 0 && rawLine.charCodeAt(0) === 0xfeff ? rawLine.slice(1) : rawLine;

    // Fence delimiter line (3+ backticks or tildes, up to 3 leading spaces).
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch && fenceMatch[1]) {
      const ch = fenceMatch[1][0] as '`' | '~';
      if (!inFencedBlock) {
        inFencedBlock = true;
        fenceChar = ch;
        fenceOpenLine = i;
      } else if (ch === fenceChar) {
        inFencedBlock = false;
        fenceChar = null;
        fenceOpenLine = null;
      }
      // else: a fence-looking line with the WRONG character while already
      // inside a fence of the other character — CommonMark treats this as
      // ordinary content of the currently open fence, not a delimiter at
      // all; `fenceOpenLine` (still set to the original opener) is correct
      // as-is.
      result.push({ inCode: true, kind: 'fenced', fenceOpenLine: fenceOpenLine ?? i });
      prevLineBlank = line.trim().length === 0;
      indentedStart = null; // a fence line is never part of an indented run
      continue;
    }

    if (inFencedBlock) {
      // Non-null by invariant: inFencedBlock is only ever true while
      // fenceOpenLine holds the line that opened it.
      result.push({ inCode: true, kind: 'fenced', fenceOpenLine: fenceOpenLine as number });
      prevLineBlank = line.trim().length === 0;
      continue;
    }

    // 4-space-indented code block: previous line blank AND this line starts
    // with 4+ spaces or a tab.
    const isIndented = prevLineBlank && /^(?: {4,}|\t)/.test(line);
    if (isIndented) {
      if (indentedStart === null) indentedStart = i;
      result.push({ inCode: true, kind: 'indented', indentedBlockStartLine: indentedStart });
    } else {
      indentedStart = null;
      result.push({ inCode: false });
    }

    prevLineBlank = line.trim().length === 0;
  }

  // F-6d5e4ea9, point 1 — EOF reached with a fence still open: it was never
  // closed. Retroactively flip the ENTIRE dangling span (from its opening
  // delimiter through EOF) back to inCode:false — see the module doc for
  // why this deliberately diverges from CommonMark's actual "swallow to
  // EOF" rendering rule.
  if (fenceOpenLine !== null) {
    for (let i = fenceOpenLine; i < result.length; i++) {
      result[i] = { inCode: false };
    }
  }

  return result;
}

/**
 * Returns a boolean array parallel to `lines`: `true` at index i means line
 * i is inside a fenced or 4-space-indented code block (including the fence
 * delimiter lines themselves). Convenience wrapper over
 * {@link computeCodeContext} for callers that only need the boolean gate.
 */
export function computeCodeContextLines(lines: readonly string[]): boolean[] {
  return computeCodeContext(lines).map((info) => info.inCode);
}
