import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { globSync } from 'glob';
import { findLogoImgTags } from '../utils/readme-parser.js';

interface AuditOptions {
  repos: string;
  brandBase: string;
}

interface AuditIssue {
  repo: string;
  file: string;
  issue: string;
  line?: number;
  detail?: string;
}

export async function runAudit(opts: AuditOptions): Promise<void> {
  const logosDir = join(opts.repos, 'logos');
  const issues: AuditIssue[] = [];

  // Get all logo slugs
  const slugDirs = globSync('*/', { cwd: logosDir }).map(d => d.replace(/\/$/, ''));

  for (const slug of slugDirs) {
    const repoDir = join(opts.repos, '..', slug);
    if (!existsSync(repoDir)) continue;

    // Find README files
    const readmes = globSync('README*.md', { cwd: repoDir });

    if (readmes.length === 0) {
      issues.push({ repo: slug, file: '-', issue: 'no-readme', detail: 'No README.md found' });
      continue;
    }

    for (const readmeFile of readmes) {
      const readmePath = join(repoDir, readmeFile);
      const content = readFileSync(readmePath, 'utf-8');
      const lines = content.split('\n');

      // Check: does the README reference the brand repo?
      const logoMatches = findLogoImgTags(content);

      if (logoMatches.length === 0 && readmeFile === 'README.md') {
        issues.push({ repo: slug, file: readmeFile, issue: 'no-logo-ref', detail: 'No logo <img> tag found' });
        continue;
      }

      for (const match of logoMatches) {
        // Check: is the src pointing at the brand repo?
        if (!match.src.includes('brand/main/logos')) {
          issues.push({
            repo: slug,
            file: readmeFile,
            issue: 'local-logo-ref',
            line: match.line,
            detail: `Still points to: ${match.src}`,
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
        });
      }

      // Check: brand URL that 404s (format mismatch)
      for (const match of logoMatches) {
        if (match.src.includes('brand/main/logos')) {
          const expectedPng = join(logosDir, slug, 'readme.png');
          const expectedJpg = join(logosDir, slug, 'readme.jpg');
          if (!existsSync(expectedPng) && !existsSync(expectedJpg)) {
            issues.push({
              repo: slug,
              file: readmeFile,
              issue: 'missing-brand-asset',
              line: match.line,
              detail: `Brand asset not found for slug: ${slug}`,
            });
          }
        }
      }
    }
  }

  // Report
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
    console.log(chalk.white(`  ${repo}`));
    for (const issue of repoIssues) {
      const lineRef = issue.line ? `:${issue.line}` : '';
      const color = issue.issue.includes('trap') || issue.issue.includes('collision') ? chalk.red : chalk.yellow;
      console.log(color(`    [${issue.issue}] ${issue.file}${lineRef} — ${issue.detail}`));
    }
  }
  console.log('');
}
