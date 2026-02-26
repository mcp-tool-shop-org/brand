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
 */

export interface LogoMatch {
  /** Line number (1-indexed) */
  line: number;
  /** The full line content */
  content: string;
  /** The extracted src value */
  src: string;
}

/** Patterns that identify a line as a badge, not a logo */
const BADGE_PATTERNS = [
  /shields\.io/i,
  /\/badge[./?]/i,
  /actions\/workflows/i,
  /img\.shields/i,
  /badge\.svg/i,
];

/** Returns true if this line is a badge, not a brand logo */
function isBadgeLine(line: string): boolean {
  // Any <a> tag wrapping the <img> = badge
  if (/<a\s/i.test(line)) return true;

  // Known badge URL patterns in the src
  for (const pattern of BADGE_PATTERNS) {
    if (pattern.test(line)) return true;
  }

  return false;
}

/** Returns true if the <img> src looks like a logo reference */
function isLogoSrc(src: string): boolean {
  // Must contain "logo" somewhere in the path
  return /logo/i.test(src);
}

/**
 * Extract the src value from an <img> tag on a line.
 * Returns null if no <img> with src is found.
 */
function extractImgSrc(line: string): string | null {
  const match = line.match(/<img\s[^>]*src="([^"]*)"/i);
  return match ? match[1] : null;
}

/**
 * Find all logo <img> tags in a README.
 *
 * Gate 1: Line must contain <img with src="..."
 * Gate 2: Line must NOT be a badge (no <a>, no shields.io, no /badge, no actions/workflows)
 * Gate 3: The src must contain "logo" (brand asset indicator)
 */
export function findLogoImgTags(content: string): LogoMatch[] {
  const lines = content.split('\n');
  const matches: LogoMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Gate 1: must have an <img> with src
    const src = extractImgSrc(line);
    if (!src) continue;

    // Gate 2: must not be a badge
    if (isBadgeLine(line)) continue;

    // Gate 3: src must look like a logo
    if (!isLogoSrc(src)) continue;

    matches.push({
      line: i + 1,
      content: line,
      src,
    });
  }

  return matches;
}

/**
 * Rewrite logo src values in a README.
 *
 * Only replaces src in lines that pass all three gates.
 * Preserves indentation, attributes, and surrounding HTML exactly.
 * Returns the modified content.
 */
export function rewriteLogoSrc(content: string, newSrc: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const src = extractImgSrc(line);

    if (src && !isBadgeLine(line) && isLogoSrc(src)) {
      // Replace only the src value — nothing else on the line changes
      result.push(line.replace(`src="${src}"`, `src="${newSrc}"`));
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}
