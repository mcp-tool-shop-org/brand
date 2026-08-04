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
 */

/**
 * Returns a boolean array parallel to `lines`: `true` at index i means line
 * i is inside a fenced or 4-space-indented code block (including the fence
 * delimiter lines themselves).
 */
export function computeCodeContextLines(lines: readonly string[]): boolean[] {
  const result: boolean[] = new Array(lines.length).fill(false);

  let inFencedBlock = false;
  let fenceChar: '`' | '~' | null = null;
  let prevLineBlank = true; // line 0 is treated as "after blank" for indented-block detection

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Fence delimiter line (3+ backticks or tildes, up to 3 leading spaces).
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
      result[i] = true; // the fence delimiter line itself is code context
      prevLineBlank = line.trim().length === 0;
      continue;
    }

    // 4-space-indented code block: previous line blank AND this line starts
    // with 4+ spaces or a tab.
    const indentedCodeBlock = prevLineBlank && /^(?: {4,}|\t)/.test(line);
    result[i] = inFencedBlock || indentedCodeBlock;

    prevLineBlank = line.trim().length === 0;
  }

  return result;
}
