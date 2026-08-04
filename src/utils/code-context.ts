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
 *    line OPENS an indented code block, and every following indented line
 *    stays in that same block until a non-indented line closes it. This is
 *    a proxy for CommonMark's real block-context rule (not list/blockquote-
 *    aware) — good enough for real READMEs.
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
 *
 * MULTI-LINE INDENTED RUNS (a sibling fix, reconciled here from a parallel
 * branch — found while fixing F-6d5e4ea9 above and deliberately split out
 * to keep that change scoped; landed independently as commit `1dc2c8d` on
 * `salvage/multiline-indent-fix` and merged into this rewrite rather than
 * superseded by it). The indented-block test used to be
 * `prevLineBlank && isIndented(line)`, evaluated fresh on every line, where
 * `prevLineBlank` reflects only the IMMEDIATELY PRECEDING line's blankness.
 * That gate can only ever admit the FIRST line of an indented run: line 2
 * of the same run sees `prevLineBlank === false`, because line 1 of the run
 * was not itself blank. So every line after the first in a 2+ line indented
 * documentation example was classified as live — a logo `<img>` or
 * `brand:gallery` marker sitting on the run's second (or later) line would
 * be rewritten or spliced into, inside what is plainly a code block. The
 * marker case is the worst instance: a marker pair is inherently
 * multi-line, so a start marker opening a run could be correctly
 * suppressed while its matching end marker one or two lines below stayed
 * live — a dangling end marker with no matching start.
 *
 * "After a blank line" is a property of where a run STARTS, not of every
 * line in it, so run membership needed to become its own piece of state —
 * mirroring how `inFencedBlock` already tracks fences — rather than being
 * re-derived from `prevLineBlank` alone on every line. Below, that state is
 * folded into `indentedStart` itself (`null` when not in a run, the run's
 * 0-indexed opening line otherwise) so the SAME variable that answers "are
 * we in a run" also answers "since which line" — no second boolean to keep
 * in sync. Two guards keep this from over-firing:
 *  - A fence delimiter line, and every line of fenced CONTENT, resets
 *    `indentedStart` to null — indentation inside a fence is just fenced
 *    content and must never leak an open indented run past the closing
 *    delimiter.
 *  - A run only OPENS after a blank line — an indented line following an
 *    ordinary paragraph is a lazy paragraph continuation (prose per
 *    CommonMark), not a fresh code block.
 * Note a blank line closes a run, but the next indented line simply opens a
 * fresh one (its own `prevLineBlank` is now true), so a documentation
 * example split by a blank line stays code throughout — as two separate
 * runs rather than one continuous one.
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
   *  began. Only present when kind === 'indented'. Stable across every
   *  line of a multi-line run — always the line that OPENED the run, never
   *  the current line (see the module doc's "MULTI-LINE INDENTED RUNS"
   *  section). */
  indentedBlockStartLine?: number;
}

/**
 * Computes per-line code-context info for `lines`. See module doc for the
 * fence/indent detection rules, the F-6d5e4ea9 unclosed-fence and BOM
 * fixes, and the sibling multi-line indented-run fix.
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
      // Indentation inside a fence is just fenced content — it must not
      // leak an open indented run past the closing delimiter (see module
      // doc, "MULTI-LINE INDENTED RUNS").
      indentedStart = null;
      continue;
    }

    // 4-space-indented code block. A run OPENS on an indented line that
    // follows a blank line, and CONTINUES through every subsequent indented
    // line regardless of THAT line's own predecessor; any non-indented line
    // closes it. `indentedStart` doubles as the run-membership flag
    // (non-null means "currently in a run") and the run's remembered start
    // line, so line 2+ of a run is never re-tested against `prevLineBlank`
    // alone — see module doc, "MULTI-LINE INDENTED RUNS".
    const isIndented = /^(?: {4,}|\t)/.test(line);
    if (isIndented && (prevLineBlank || indentedStart !== null)) {
      // Either opening a fresh run right here (stamp its start line) or
      // continuing one already open (keep the original start line).
      if (indentedStart === null) indentedStart = i;
      result.push({ inCode: true, kind: 'indented', indentedBlockStartLine: indentedStart });
    } else {
      // A non-indented line closes any open run. An indented line that does
      // NOT follow a blank line and isn't already part of an open run is a
      // lazy paragraph continuation — prose, not code.
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
