import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { globSync } from 'glob';
import { findLogoImgTags, rewriteLogoSrc } from '../utils/readme-parser.js';

interface MigrateOptions {
  repos: string;
  logos: string;
  brandBase: string;
  dryRun: boolean;
}

export async function runMigrate(opts: MigrateOptions): Promise<void> {
  const logosDir = opts.logos;
  const slugDirs = globSync('*/', { cwd: logosDir }).map(d => d.replace(/\/$/, ''));

  let total = 0;
  let updated = 0;
  let skipped = 0;

  if (opts.dryRun) {
    console.log(chalk.cyan('\n  DRY RUN — no files will be modified.\n'));
  }

  for (const slug of slugDirs) {
    const repoDir = join(opts.repos, slug);
    if (!existsSync(repoDir)) {
      skipped++;
      continue;
    }

    total++;

    // Determine the correct file extension for this logo
    let ext = 'png';
    if (existsSync(join(logosDir, slug, 'readme.jpg'))) ext = 'jpg';
    const newSrc = `${opts.brandBase}/${slug}/readme.${ext}`;

    const readmes = globSync('README*.md', { cwd: repoDir });
    let repoChanged = false;

    for (const readmeFile of readmes) {
      const readmePath = join(repoDir, readmeFile);
      const content = readFileSync(readmePath, 'utf-8');
      const matches = findLogoImgTags(content);

      if (matches.length === 0) continue;

      // Check if already pointing at brand repo
      const needsUpdate = matches.some(m => !m.src.includes('brand/main/logos'));
      if (!needsUpdate) continue;

      if (opts.dryRun) {
        for (const match of matches) {
          if (!match.src.includes('brand/main/logos')) {
            console.log(`  ~ ${slug}/${readmeFile}`);
            console.log(chalk.red(`    old: ${match.src}`));
            console.log(chalk.green(`    new: ${newSrc}`));
          }
        }
      } else {
        const rewritten = rewriteLogoSrc(content, newSrc);
        writeFileSync(readmePath, rewritten, 'utf-8');
        console.log(chalk.green(`  ✓ ${slug}/${readmeFile}`));
      }

      repoChanged = true;
    }

    if (repoChanged) updated++;
  }

  console.log(`\n  Repos scanned: ${total}`);
  console.log(`  Repos updated: ${updated}`);
  console.log(`  Repos skipped: ${skipped} (no local clone)\n`);
}
