import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';
import { findLogoImgTags } from '../utils/readme-parser.js';
import { findLogoFile } from '../manifest.js';

interface AuditOptions {
  repos: string;
  logos: string;
  brandBase: string;
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
};

/** One-line operator-facing fix hint per issue type. */
function fixHintFor(issue: string, ctx: { slug: string; brandUrl: string }): string {
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
    default:
      return '';
  }
}

export async function runAudit(opts: AuditOptions): Promise<void> {
  const logosDir = opts.logos;
  const issues: AuditIssue[] = [];

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

      // Check: multiple logo matches (possible badge collision)
      if (logoMatches.length > 1) {
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
  }

  // JSON mode: single object on stdout, nothing else
  if (opts.json) {
    const out = {
      ok: issues.length === 0,
      reposChecked: slugDirs.length,
      issueCount: issues.length,
      issues,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (issues.length > 0) process.exit(1);
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
      const color = issue.severity === 'high' ? chalk.red : chalk.yellow;
      console.log(color(`    [${issue.issue}] ${issue.file}${lineRef} — ${issue.detail}`));
      if (issue.fix && opts.verbose !== false && !opts.quiet) {
        console.log(chalk.dim(`      ${issue.fix}`));
      }
    }
  }
  console.log('');
  process.exit(1);
}
