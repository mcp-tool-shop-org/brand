import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';
import { findLogoImgTags, type LogoMatch } from '../utils/readme-parser.js';
import { findLogoFile, readManifest, type Manifest } from '../manifest.js';

interface AuditOptions {
  repos: string;
  logos: string;
  brandBase: string;
  /** Path to manifest.json, used to resolve asset roles (primary/gallery) for the multiple-logo-matches check. Defaults to 'manifest.json'. */
  manifest?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface AuditIssue {
  repo: string;
  file: string;
  issue: string;
  line?: number;
  detail?: string;
  severity?: 'high' | 'medium' | 'info';
  fix?: string;
}

/** Inherent severity per issue type. Consumers shouldn't have to re-derive this. */
const ISSUE_SEVERITY: Record<string, 'high' | 'medium' | 'info'> = {
  'indentation-trap': 'high',
  'multiple-logo-matches': 'high',
  'missing-brand-asset': 'high',
  'local-logo-ref': 'medium',
  'no-logo-ref': 'medium',
  'no-readme': 'info',
  'unmanaged-gallery': 'info',
};

/** One-line operator-facing fix hint per issue type. */
function fixHintFor(issue: string, ctx: { slug: string; brandUrl: string; count?: number }): string {
  switch (issue) {
    case 'indentation-trap':
      return 'Fix: wrap in `<p>` to prevent markdown from rendering as code block.';
    case 'no-logo-ref':
      return `Fix: add \`<p align="center"><img src="${ctx.brandUrl}" alt="${ctx.slug}"></p>\` to README.md.`;
    case 'local-logo-ref':
      return 'Fix: run `brand migrate` to rewrite local logo references to the brand repo URL.';
    case 'missing-brand-asset':
      return 'Fix: add a `readme.<ext>` for this slug under the brand repo `logos/<slug>/` and regenerate the manifest.';
    case 'multiple-logo-matches':
      return 'Fix: keep one canonical logo `<img>` in the README; move badges to a separate row.';
    case 'no-readme':
      return 'Fix: add a `README.md` to this repo.';
    case 'unmanaged-gallery':
      return `Fix: run \`brand sync --slug ${ctx.slug}\` to keep this gallery in sync automatically instead of hand-maintaining ${ctx.count ?? 'N'} individual <img> tags.`;
    default:
      return '';
  }
}

/** Resolved role for a single logo match, used by the multiple-logo-matches / unmanaged-gallery checks. */
type ResolvedRole = 'primary' | 'gallery' | 'unknown';

/**
 * Resolve a logo match's manifest role by stripping the brand-base prefix
 * from its src to get a manifest key (`logos/<slug>/<rest>`), then looking
 * that key up in the loaded manifest. Returns 'unknown' when the src doesn't
 * point at the brand repo (the local-logo-ref check already flags that case
 * separately) or when no manifest is available, or when the key isn't found.
 */
function resolveMatchRole(
  match: LogoMatch,
  slug: string,
  brandBase: string,
  manifest: Manifest | null,
): ResolvedRole {
  if (!manifest) return 'unknown';
  const prefix = `${brandBase}/logos/`;
  if (!match.src.startsWith(prefix)) return 'unknown';
  const tail = match.src.slice(prefix.length);
  const key = `logos/${tail}`;
  const entry = manifest.assets[key];
  if (!entry) return 'unknown';
  if (entry.role === 'primary' || entry.role === 'gallery') return entry.role;
  return 'unknown';
}

/** slug this manifest key's tail resolves to, used to confirm all gallery matches share one slug. */
function galleryGroupKey(match: LogoMatch, brandBase: string): string | null {
  const prefix = `${brandBase}/logos/`;
  if (!match.src.startsWith(prefix)) return null;
  const tail = match.src.slice(prefix.length);
  const slug = tail.split('/')[0];
  return slug ?? null;
}

export async function runAudit(opts: AuditOptions): Promise<void> {
  const logosDir = opts.logos;
  const issues: AuditIssue[] = [];

  // Load the manifest once per run so the multiple-logo-matches check can
  // distinguish "N legitimate gallery images" from "a real badge collision."
  // Safe degrade: if the manifest is missing or unparseable, fall back to the
  // OLD flag-everything behavior for role resolution (manifest stays null,
  // resolveMatchRole returns 'unknown' for everything) rather than crashing
  // the whole audit.
  const manifestPath = opts.manifest ?? 'manifest.json';
  let manifest: Manifest | null = null;
  try {
    manifest = readManifest(manifestPath);
  } catch {
    manifest = null;
  }

  // Get all logo slugs (include dot-prefixed dirs so .legacy/ etc. are visible to audit)
  const slugDirs = globSync('*/', { cwd: logosDir, dot: true }).map(d => d.replace(/\/$/, ''));

  for (const slug of slugDirs) {
    const repoDir = join(opts.repos, slug);
    if (!existsSync(repoDir)) continue;

    // Find README files
    const readmes = globSync('README*.md', { cwd: repoDir });

    if (readmes.length === 0) {
      issues.push({
        repo: slug,
        file: '-',
        issue: 'no-readme',
        detail: 'No README.md found',
        severity: ISSUE_SEVERITY['no-readme'],
        fix: fixHintFor('no-readme', { slug, brandUrl: '' }),
      });
      continue;
    }

    for (const readmeFile of readmes) {
      const readmePath = join(repoDir, readmeFile);
      const content = readFileSync(readmePath, 'utf-8');

      // Independent indentation-trap scan — catches 4-space-indented <img> tags
      // that the parser correctly skips as "in a code block." Without this scan,
      // the very layout error the audit was designed to catch becomes invisible.
      const rawLines = content.split('\n');
      for (let i = 0; i < rawLines.length; i++) {
        const rawLine = rawLines[i];
        if (rawLine === undefined) continue;
        const trapMatch = rawLine.match(/^(\s{4,})<img\b/);
        if (trapMatch && !rawLine.trimStart().startsWith('<p')) {
          issues.push({
            repo: slug,
            file: readmeFile,
            issue: 'indentation-trap',
            line: i + 1,
            detail: `${trapMatch[1]?.length ?? 0} spaces of indentation — will render as code block`,
            severity: ISSUE_SEVERITY['indentation-trap'],
            fix: fixHintFor('indentation-trap', { slug, brandUrl: '' }),
          });
        }
      }

      // Check: does the README reference the brand repo?
      const logoMatches = findLogoImgTags(content);

      if (logoMatches.length === 0 && readmeFile === 'README.md') {
        const ext = findLogoFile(slug, logosDir)?.ext ?? 'png';
        const brandUrl = `${opts.brandBase}/logos/${slug}/readme.${ext}`;
        issues.push({
          repo: slug,
          file: readmeFile,
          issue: 'no-logo-ref',
          detail: 'No logo <img> tag found',
          severity: ISSUE_SEVERITY['no-logo-ref'],
          fix: fixHintFor('no-logo-ref', { slug, brandUrl }),
        });
        continue;
      }

      for (const match of logoMatches) {
        const pointsAtBrand = match.src.includes('brand/main/logos');

        // Check: is the src pointing at the brand repo?
        if (!pointsAtBrand) {
          issues.push({
            repo: slug,
            file: readmeFile,
            issue: 'local-logo-ref',
            line: match.line,
            detail: `Still points to: ${match.src}`,
            severity: ISSUE_SEVERITY['local-logo-ref'],
            fix: fixHintFor('local-logo-ref', { slug, brandUrl: '' }),
          });
        }

        // Check: indentation trap (4+ spaces before <img)
        const lineContent = match.content;
        const leadingSpaces = lineContent.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (leadingSpaces >= 4 && !lineContent.trimStart().startsWith('<p')) {
          issues.push({
            repo: slug,
            file: readmeFile,
            issue: 'indentation-trap',
            line: match.line,
            detail: `${leadingSpaces} spaces of indentation — will render as code block`,
            severity: ISSUE_SEVERITY['indentation-trap'],
            fix: fixHintFor('indentation-trap', { slug, brandUrl: '' }),
          });
        }

        // Check: brand URL that 404s (format mismatch) — probe all supported extensions
        if (pointsAtBrand && !findLogoFile(slug, logosDir)) {
          issues.push({
            repo: slug,
            file: readmeFile,
            issue: 'missing-brand-asset',
            line: match.line,
            detail: `Brand asset not found for slug: ${slug}`,
            severity: ISSUE_SEVERITY['missing-brand-asset'],
            fix: fixHintFor('missing-brand-asset', { slug, brandUrl: '' }),
          });
        }
      }

      // Check: multiple logo matches (possible badge collision) — but a
      // README with N legitimate gallery images for the SAME slug is not a
      // collision. Resolve each match's manifest role and only flag when:
      //   - more than one match resolves to role "primary", OR
      //   - there's a mix of a resolvable match alongside an unresolvable/
      //     unknown-role match (the genuinely ambiguous "can't tell" case).
      // When every match beyond the first resolves cleanly to "gallery" for
      // one slug, emit the informational unmanaged-gallery nudge instead.
      //
      // Safe degrade: when the manifest itself couldn't be loaded (missing or
      // unparseable — see the try/catch above), there is no role information
      // available for ANY match, so fall back to the pre-fix behavior of
      // flagging any >1 logo matches as a possible collision, rather than
      // running the mix-detection heuristic against an all-"unknown" roles
      // array (which would incorrectly look like "no ambiguous mix").
      if (logoMatches.length > 1 && !manifest) {
        issues.push({
          repo: slug,
          file: readmeFile,
          issue: 'multiple-logo-matches',
          detail: `${logoMatches.length} logo <img> tags found — possible badge collision`,
          severity: ISSUE_SEVERITY['multiple-logo-matches'],
          fix: fixHintFor('multiple-logo-matches', { slug, brandUrl: '' }),
        });
      } else if (logoMatches.length > 1) {
        const roles = logoMatches.map(m => resolveMatchRole(m, slug, opts.brandBase, manifest));
        const primaryCount = roles.filter(r => r === 'primary').length;
        const galleryCount = roles.filter(r => r === 'gallery').length;
        const unknownCount = roles.filter(r => r === 'unknown').length;

        // Ambiguous whenever at least one match's role can't be resolved —
        // whether that unknown sits alongside a resolved match (a genuine
        // mix) or every match is unresolved (manifest loaded fine but none
        // of these srcs correspond to a known asset). Either way we can't
        // prove "this is a managed gallery," so conservatively flag it.
        const hasAmbiguousMix = unknownCount > 0;
        const isCollision = primaryCount > 1 || hasAmbiguousMix;

        if (isCollision) {
          issues.push({
            repo: slug,
            file: readmeFile,
            issue: 'multiple-logo-matches',
            detail: `${logoMatches.length} logo <img> tags found — possible badge collision`,
            severity: ISSUE_SEVERITY['multiple-logo-matches'],
            fix: fixHintFor('multiple-logo-matches', { slug, brandUrl: '' }),
          });
        } else if (galleryCount === logoMatches.length && galleryCount > 1) {
          // All matches resolve to gallery role — confirm they share one slug
          // before treating this as a managed gallery (defensive; in practice
          // resolveMatchRole already scoped the lookup to this slug's prefix).
          const slugs = new Set(logoMatches.map(m => galleryGroupKey(m, opts.brandBase)));
          if (slugs.size === 1 && slugs.has(slug)) {
            issues.push({
              repo: slug,
              file: readmeFile,
              issue: 'unmanaged-gallery',
              detail: `${logoMatches.length} logo <img> tags all resolve to gallery images for "${slug}" — hand-maintained instead of synced`,
              severity: ISSUE_SEVERITY['unmanaged-gallery'],
              fix: fixHintFor('unmanaged-gallery', { slug, brandUrl: '', count: logoMatches.length }),
            });
          } else {
            // Gallery images span more than one slug — genuinely unexpected;
            // conservatively fall back to flagging it as a collision.
            issues.push({
              repo: slug,
              file: readmeFile,
              issue: 'multiple-logo-matches',
              detail: `${logoMatches.length} logo <img> tags found — possible badge collision`,
              severity: ISSUE_SEVERITY['multiple-logo-matches'],
              fix: fixHintFor('multiple-logo-matches', { slug, brandUrl: '' }),
            });
          }
        }
        // else: e.g. exactly one primary + rest gallery, or other clean
        // combinations that aren't a collision and aren't an unmanaged
        // gallery — no issue emitted.
      }
    }
  }

  // Severity-gated exit: only high/medium findings fail the audit. Pure
  // info-severity results (e.g. no-readme, unmanaged-gallery) are surfaced
  // but must not flip a clean run to exit 1 — that would defeat the point of
  // making unmanaged-gallery an informational nudge rather than a hard fail.
  const blockingIssues = issues.filter(i => i.severity !== 'info');

  // JSON mode: single object on stdout, nothing else
  if (opts.json) {
    const out = {
      ok: blockingIssues.length === 0,
      reposChecked: slugDirs.length,
      issueCount: issues.length,
      issues,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (blockingIssues.length > 0) process.exit(1);
    return;
  }

  // Human report
  if (issues.length === 0) {
    console.log(chalk.green(`\n  ✓ Audit clean — ${slugDirs.length} repos checked, no issues.\n`));
    return;
  }

  console.log(chalk.yellow(`\n  Found ${issues.length} issue(s) across ${new Set(issues.map(i => i.repo)).size} repos:\n`));

  const grouped = new Map<string, AuditIssue[]>();
  for (const issue of issues) {
    const key = issue.repo;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(issue);
  }

  for (const [repo, repoIssues] of grouped) {
    console.log(chalk.bold(`  ${repo}`));
    for (const issue of repoIssues) {
      const lineRef = issue.line ? `:${issue.line}` : '';
      const color = issue.severity === 'high' ? chalk.red : issue.severity === 'info' ? chalk.dim : chalk.yellow;
      console.log(color(`    [${issue.issue}] ${issue.file}${lineRef} — ${issue.detail}`));
      if (issue.fix && opts.verbose !== false && !opts.quiet) {
        console.log(chalk.dim(`      ${issue.fix}`));
      }
    }
  }
  console.log('');
  if (blockingIssues.length > 0) process.exit(1);
}
