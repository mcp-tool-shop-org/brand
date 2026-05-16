/**
 * readme-parser.ts — Multi-gate logo detection for README img tags.
 *
 * Hard-won rules from real migration failures:
 * 1. Never inject whitespace — replace ONLY the src value on the same line
 * 2. shields.io URLs with &logo= are NOT brand logos — always exclude
 * 3. Badge <img> tags inside <a> tags are NOT brand logos — always exclude
 * 4. Standalone badges (not in <a>) with shields.io/actions/badge paths — exclude
 * 5. <p><img> on the same line is a valid logo pattern — must match
 * 6. 4+ spaces of indentation = markdown code block — never add indentation
 *
 * SECURITY: This parser assumes its input is a trusted README from a repo in
 * the operator's own org (cloned via `git clone` against opts.repos). It uses
 * regex-based HTML parsing which is inherently fragile against adversarial
 * input. It does not defend against deliberately malformed HTML, prototype
 * pollution, or ReDoS. If the threat model ever expands to untrusted input,
 * switch to a real HTML tokenizer (parse5, htmlparser2).
 *
 * SIZE LIMIT: forEachLogoImg refuses inputs >MAX_README_BYTES (5 MB). This
 * guards against accidentally feeding a binary file or generated artifact
 * through the parser. The limit is intentionally well above any plausible
 * README (the largest real README in mcp-tool-shop-org is ~80 KB).
 */

/** Maximum input size accepted by the parser, in bytes (5 MB). */
export const MAX_README_BYTES = 5_000_000;

export interface LogoMatch {
  /** Line number (1-indexed) */
  line: number;
  /** The full line content */
  content: string;
  /** The extracted src value */
  src: string;
}

/**
 * Reason a candidate `<img>` was rejected by the gate set. Surfaced via
 * `findAllImgTags` so audit tooling can explain why a logo migration didn't
 * touch a tag the operator expected it to touch.
 */
export type RejectionReason =
  | 'in-anchor'
  | 'badge'
  | 'not-logo'
  | 'in-code-block';

export interface RejectedMatch {
  /** Line number (1-indexed). */
  line: number;
  /** The full line content (or the synthetic line for fenced/indented matches). */
  content: string;
  /** The extracted src value. */
  src: string;
  /** Which gate rejected this candidate. */
  reason: RejectionReason;
}

/**
 * Patterns that identify an <img> src (or surrounding `<a>` wrap) as a badge,
 * not a logo. Applied per-<img> against the tag and the relevant slice of the
 * line (NOT against the whole line — see forEachLogoImg).
 *
 * Hosts included: shields.io (img.shields.io), badge.svg, GitHub Actions
 * workflow badges, codecov, coveralls, circleci, travis-ci, and any
 * github.com/.../badge.* path.
 *
 * Tip: this array is exported so a future caller can extend it with
 * org-specific badge hosts (bestpractices.coreinfrastructure.org, deepsource.io,
 * snyk.io, vercel badges, bundlephobia, app.netlify.com/badge, kuma, etc.)
 * by pushing into the array before invoking the parser. A future revision may
 * add an `extraBadgePatterns?: RegExp[]` option to the public API to make this
 * non-mutating; until then, mutation is the supported extension point.
 */
export const BADGE_PATTERNS: RegExp[] = [
  /shields\.io/i,
  /img\.shields/i,
  /\/badges?[./?]/i, // matches /badge. /badge/ /badge? AND /badges. /badges/ /badges?
  /badge\.svg/i,
  /actions\/workflows?/i, // /actions/workflow/... or /actions/workflows/...
  /codecov\.io/i,
  /coveralls\.io/i,
  /circleci\.com/i,
  /travis-ci\.(org|com)/i,
  /github\.com\/[^/]+\/[^/]+\/badge/i,
];

/**
 * Tighter `logo` test: src must contain the literal segment "logo" or "logos" surrounded
 * by path separators, dots, underscores, or dashes. Rejects substring matches
 * like "dialogo.png", "monologo.svg", "logout-icon.png".
 */
function isLogoSrc(src: string): boolean {
  return /(^|[\/_\-.])logos?([\/_\-.]|$)/i.test(src);
}

/** Returns true if src matches any known badge pattern. */
function isBadgeSrc(src: string): boolean {
  for (const pattern of BADGE_PATTERNS) {
    if (pattern.test(src)) return true;
  }
  return false;
}

/**
 * Returns true if the <img> tag at `imgStart` on `line` is wrapped by an
 * `<a>...</a>` pair on the SAME line, OR if `anchorOpenFromPriorLine` is true
 * (meaning a prior line opened an `<a>` that has not yet closed). Per-<img>
 * context: a single line may contain both an <a>-wrapped badge AND a
 * standalone logo <img>; only the specific tag's position determines whether
 * it's inside an <a>.
 *
 * Partial multi-line support: if a prior line left an `<a>` open, every <img>
 * on this line is considered anchor-wrapped UNTIL the first `</a>` on this
 * line, after which subsequent <img> tags are checked normally. This catches
 * the common prettier-wrapped `<a>\n  <img ...>\n</a>` pattern. A fully
 * accurate multi-line span tracker would require a pre-pass; this is the
 * cheap partial fix.
 */
function isImgInsideAnchor(
  line: string,
  imgStart: number,
  anchorOpenFromPriorLine: boolean,
): boolean {
  // Find every <a ... > and </a> on the line, then check whether imgStart
  // falls inside any open/close pair (including any span carried in from a
  // prior line that has not yet closed).
  const openRe = /<a\b[^>]*>/gi;
  const closeRe = /<\/a\s*>/gi;
  const opens: Array<{ start: number; end: number }> = [];
  const closes: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(line)) !== null) {
    opens.push({ start: m.index, end: m.index + m[0].length });
  }
  while ((m = closeRe.exec(line)) !== null) {
    closes.push({ start: m.index, end: m.index + m[0].length });
  }
  // If a prior line opened an <a> that hasn't closed, treat imgStart as inside
  // an anchor until the first </a> on this line.
  if (anchorOpenFromPriorLine) {
    const firstClose = closes[0];
    if (!firstClose) return true; // anchor still open on this whole line
    if (imgStart < firstClose.start) return true;
  }
  // Pair opens with the next close after each open. If imgStart is between
  // an open's end and that close's start, the img is inside an anchor.
  for (const o of opens) {
    const nextClose = closes.find((c) => c.start >= o.end);
    if (!nextClose) {
      // Open with no close on this line; img after the open is inside the anchor.
      if (imgStart >= o.end) return true;
      continue;
    }
    if (imgStart >= o.end && imgStart < nextClose.start) return true;
  }
  return false;
}

/**
 * Match the src attribute of an <img> tag, regardless of quoting style.
 * Capture groups: 1 = double-quoted value, 2 = single-quoted value,
 * 3 = unquoted value. Whichever group fired is the src.
 */
const IMG_SRC_RE =
  /<img\s[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * Detail about a single <img> src match used by the iterator.
 */
interface ImgMatch {
  /** Line number, 1-indexed. */
  lineNumber: number;
  /** Full line content (without trailing newline). */
  line: string;
  /** Extracted src value. */
  src: string;
  /** Start index (in `line`) of the entire <img ... src=...> match. */
  imgStart: number;
  /** Start index (in `line`) of the src VALUE (after the opening quote, if any). */
  srcValueStart: number;
  /** End index (in `line`, exclusive) of the src VALUE (before the closing quote, if any). */
  srcValueEnd: number;
}

/**
 * Walk every <img> tag in `content` that passes all logo gates. The callback
 * receives ImgMatch records in document order. Gates are applied per-<img>,
 * not per-line — a single line may contain a logo <img> AND a badge <img>,
 * and each is evaluated independently.
 *
 * Gates (in order — matters when both a badge AND a logo gate would fire):
 *  0. Line is NOT inside a fenced code block (```...``` or ~~~...~~~) AND
 *     is NOT a 4-space-indented code block line. README documentation examples
 *     must not be mutated by the rewriter.
 *  1. <img> tag with a src attribute (any quoting style).
 *  2. The specific <img> is NOT wrapped by an <a>...</a> (same line OR an
 *     <a> opened on a prior line that has not yet closed).
 *  3. The src does NOT match any BADGE_PATTERNS entry.
 *  4. The src matches the tightened logo pattern (see isLogoSrc).
 *
 * Gate ordering note: badge → logo means a src like `assets/badges/logo.png`
 * is treated as a BADGE (because the path contains /badges/), even though
 * isLogoSrc would also fire. This is intentional for noisy badge folders, but
 * surprises operators with deliberately named logo files in a badges/ dir. If
 * this surprises you, host-based badge detection is the cleaner long-term fix.
 *
 * If `onReject` is provided, candidates that pass Gate 1 (regex match) but
 * fail any of Gates 0/2/3/4 are reported there with a reason. Logo gates are
 * checked first, so the reason is the FIRST gate that rejected.
 */
function forEachLogoImg(
  content: string,
  callback: (match: ImgMatch) => void,
  onReject?: (rejected: RejectedMatch) => void,
): void {
  if (content.length > MAX_README_BYTES) {
    throw new Error(
      `readme-parser: refusing to parse README of ${content.length} bytes ` +
        `(MAX_README_BYTES = ${MAX_README_BYTES}). Pass a smaller input or ` +
        `raise the limit if this is a legitimate README.`,
    );
  }

  const lines = content.split('\n');

  // Code-block state, maintained across lines.
  let inFencedBlock = false;
  let fenceChar: '`' | '~' | null = null;
  let prevLineBlank = true; // line 0 is treated as "after blank" for indented-block detection

  // Cross-line anchor state. True at line i if an <a> opened on a prior line
  // has not been closed by the end of line i-1. Computed lazily inside the
  // loop.
  let anchorOpenFromPriorLine = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // --- Gate 0a: fenced code block tracking ---
    // A fence is 3+ backticks or 3+ tildes at the start of the line (with up
    // to 3 leading spaces, per CommonMark). The fence character must match
    // to close.
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch && fenceMatch[1]) {
      const ch = fenceMatch[1][0] as '`' | '~';
      if (!inFencedBlock) {
        inFencedBlock = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFencedBlock = false;
        fenceChar = null;
      }
      // The fence line itself is code; advance bookkeeping and skip parsing.
      prevLineBlank = line.trim().length === 0;
      // Update anchor carry-over: the fence line contains no anchor activity
      // (it's a code marker). Recompute defensively in case the line has
      // weird content.
      anchorOpenFromPriorLine = updateAnchorCarry(
        anchorOpenFromPriorLine,
        line,
      );
      continue;
    }

    // --- Gate 0b: 4-space indented code block ---
    // CommonMark: a line beginning with 4+ spaces (or a tab) AFTER a blank
    // line is an indented code block. We don't have full block-context here,
    // so the simplest proxy is: "previous line was blank AND this line starts
    // with 4+ leading spaces (or a tab) AND we're not in a list/blockquote".
    // The not-list-or-blockquote check is approximated by "previous line was
    // blank" — list items don't have blank lines between continuation and
    // children. This catches the common case in the fixture suite.
    const indentedCodeBlock =
      prevLineBlank && /^(?: {4,}|\t)/.test(line);

    const inCodeContext = inFencedBlock || indentedCodeBlock;

    // Scan for <img> regardless of code context, so we can emit rejections.
    const re = new RegExp(IMG_SRC_RE.source, IMG_SRC_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const src = m[1] ?? m[2] ?? m[3];
      if (src === undefined) continue;

      const imgStart = m.index;
      const matchText = m[0];
      const srcAttrRe = /\bsrc\s*=\s*(["']?)/i;
      const attrMatch = srcAttrRe.exec(matchText);
      if (!attrMatch) continue;
      const quoteChar = attrMatch[1] ?? '';
      const srcValueStart = imgStart + attrMatch.index + attrMatch[0].length;
      const srcValueEnd = srcValueStart + src.length;
      void quoteChar;

      // Gate 0: code block — reject before any other gate so operators see
      // "in-code-block" as the reason (which is the more actionable signal
      // than "not-logo" for an <img> in a doc example).
      if (inCodeContext) {
        onReject?.({
          line: i + 1,
          content: line,
          src,
          reason: 'in-code-block',
        });
        continue;
      }

      // Gate 2: per-<img> <a>-wrap check (incl. multi-line carry-over).
      if (isImgInsideAnchor(line, imgStart, anchorOpenFromPriorLine)) {
        onReject?.({ line: i + 1, content: line, src, reason: 'in-anchor' });
        continue;
      }
      // Gate 3: badge src patterns.
      if (isBadgeSrc(src)) {
        onReject?.({ line: i + 1, content: line, src, reason: 'badge' });
        continue;
      }
      // Gate 4: tightened logo src test.
      if (!isLogoSrc(src)) {
        onReject?.({ line: i + 1, content: line, src, reason: 'not-logo' });
        continue;
      }

      callback({
        lineNumber: i + 1,
        line,
        src,
        imgStart,
        srcValueStart,
        srcValueEnd,
      });
    }

    // Update bookkeeping for the next iteration.
    prevLineBlank = line.trim().length === 0;
    anchorOpenFromPriorLine = updateAnchorCarry(anchorOpenFromPriorLine, line);
  }
}

/**
 * Given the anchor-open-carry state coming INTO this line and the line text,
 * return the anchor-open-carry state going OUT of this line. Counts <a> opens
 * and </a> closes; the net delta is added to the carry-in flag, treated as a
 * boolean (any positive net = still open).
 */
function updateAnchorCarry(carryIn: boolean, line: string): boolean {
  let opens = 0;
  let closes = 0;
  const openRe = /<a\b[^>]*>/gi;
  const closeRe = /<\/a\s*>/gi;
  while (openRe.exec(line) !== null) opens++;
  while (closeRe.exec(line) !== null) closes++;
  const depth = (carryIn ? 1 : 0) + opens - closes;
  return depth > 0;
}

/**
 * Find all logo <img> tags in a README.
 *
 * Gates (applied per-<img>, not per-line):
 *   0. The <img> is NOT inside a fenced (```...```/~~~...~~~) or 4-space-
 *      indented markdown code block — documentation examples must not match.
 *   1. Tag is `<img>` with a `src` attribute (double, single, or unquoted).
 *   2. The specific <img> is NOT wrapped by an `<a>...</a>` (same line OR a
 *      multi-line anchor opened on a prior line).
 *   3. `src` does NOT match any badge pattern (see BADGE_PATTERNS — covers
 *      shields.io, img.shields, /badge(s)?/, badge.svg, actions/workflows,
 *      codecov, coveralls, circleci, travis-ci, github.com/.../badge).
 *   4. `src` matches the tightened logo segment pattern (path separator,
 *      dot, underscore, or dash boundary around the literal "logo").
 *
 * Throws if `content.length > MAX_README_BYTES` (5 MB). Use {@link findAllImgTags}
 * to introspect rejected candidates as well as matches.
 */
export function findLogoImgTags(content: string): LogoMatch[] {
  const matches: LogoMatch[] = [];
  forEachLogoImg(content, (m) => {
    matches.push({
      line: m.lineNumber,
      content: m.line,
      src: m.src,
    });
  });
  return matches;
}

/**
 * Find all `<img>` tags in a README, returning both matches AND rejected
 * candidates with reasons. Useful for audit tooling that needs to explain
 * why a logo migration didn't touch an `<img>` tag the operator expected it
 * to touch.
 *
 * The `matches` array is exactly what {@link findLogoImgTags} returns. The
 * `rejected` array contains every `<img>` whose regex matched but which was
 * dropped by Gate 0 (code block), Gate 2 (in `<a>`), Gate 3 (badge pattern),
 * or Gate 4 (src doesn't look like a logo). Gates are checked in order;
 * `reason` is the FIRST gate that rejected.
 *
 * Throws if `content.length > MAX_README_BYTES`.
 */
export function findAllImgTags(content: string): {
  matches: LogoMatch[];
  rejected: RejectedMatch[];
} {
  const matches: LogoMatch[] = [];
  const rejected: RejectedMatch[] = [];
  forEachLogoImg(
    content,
    (m) => {
      matches.push({
        line: m.lineNumber,
        content: m.line,
        src: m.src,
      });
    },
    (r) => {
      rejected.push(r);
    },
  );
  return { matches, rejected };
}

/**
 * Rewrite logo src values in a README.
 *
 * Only replaces src in <img> tags that pass all gates (see findLogoImgTags).
 * Preserves indentation, attributes, and surrounding HTML exactly. Multiple
 * <img> tags on a single line are handled independently — a logo and a badge
 * on the same line both get the correct treatment.
 *
 * Skips <img> tags inside fenced or 4-space-indented markdown code blocks
 * (Gate 0), so documentation examples in the README are never mutated.
 *
 * Implementation uses splice-by-index (not String.prototype.replace) so the
 * replacement value is inserted verbatim — `$&`, `$1`, `$$`, etc. in newSrc
 * are NOT interpreted as replacement tokens.
 *
 * Throws if `content.length > MAX_README_BYTES`.
 */
export function rewriteLogoSrc(content: string, newSrc: string): string {
  const lines = content.split('\n');
  // Collect per-line splice operations, then apply right-to-left so earlier
  // operations' indices remain valid.
  const opsByLine: Map<number, Array<{ start: number; end: number }>> =
    new Map();
  forEachLogoImg(content, (m) => {
    const idx = m.lineNumber - 1;
    const list = opsByLine.get(idx) ?? [];
    list.push({ start: m.srcValueStart, end: m.srcValueEnd });
    opsByLine.set(idx, list);
  });

  for (const [idx, ops] of opsByLine) {
    // Apply from rightmost to leftmost so earlier indices remain valid.
    ops.sort((a, b) => b.start - a.start);
    let line = lines[idx];
    if (line === undefined) continue;
    for (const op of ops) {
      line = line.slice(0, op.start) + newSrc + line.slice(op.end);
    }
    lines[idx] = line;
  }

  return lines.join('\n');
}
