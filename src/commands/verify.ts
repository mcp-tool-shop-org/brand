import chalk from 'chalk';
import { verifyManifest } from '../manifest.js';

interface VerifyOptions {
  manifest: string;
  logos: string;
}

export async function runVerify(opts: VerifyOptions): Promise<void> {
  try {
    const result = verifyManifest(opts.manifest, opts.logos);

    if (result.ok) {
      console.log(chalk.green(`\n  ✓ All ${result.verified.length} assets verified — integrity intact.\n`));
      return;
    }

    console.log(chalk.red('\n  ✗ Integrity check failed.\n'));

    if (result.changed.length > 0) {
      console.log(chalk.red('  Changed (hash mismatch):'));
      for (const f of result.changed) {
        console.log(chalk.red(`    - ${f}`));
      }
    }

    if (result.added.length > 0) {
      console.log(chalk.yellow('\n  Added (not in manifest):'));
      for (const f of result.added) {
        console.log(chalk.yellow(`    + ${f}`));
      }
    }

    if (result.removed.length > 0) {
      console.log(chalk.red('\n  Removed (in manifest but missing):'));
      for (const f of result.removed) {
        console.log(chalk.red(`    × ${f}`));
      }
    }

    if (result.verified.length > 0) {
      console.log(chalk.green(`\n  ${result.verified.length} assets verified OK.`));
    }

    console.log('');
    process.exit(1);
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exit(1);
  }
}
