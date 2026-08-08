#!/usr/bin/env node
/**
 * install-hooks.mjs — point git at .githooks/ so the repo's hooks are live.
 *
 * Run from the `prepare` npm script, which fires on a plain `npm install` in
 * a clone. That is the only reliable "someone set this repo up" moment npm
 * gives us, and it means a contributor gets .githooks/pre-commit without
 * having to read a CONTRIBUTING file first — the hook only prevents a defect
 * if it is installed by default.
 *
 * Hooks live in .githooks/ rather than .git/hooks/ because .git/ is not
 * version-controlled: a hook that isn't committed protects exactly one clone
 * on exactly one machine, which is not a fix.
 *
 * This script NEVER fails the install. A missing git binary, a tarball
 * install with no .git, a read-only config — none of those are reasons to
 * break `npm install` over a convenience hook. The invariant the hook guards
 * is independently enforced by the CI `integrity` job, which is the real gate;
 * this is the fast local echo of it, not the authority.
 */
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// No .git means this isn't a clone: an `npm install <tarball>`, an extracted
// package, or a sandbox. Nothing to configure, and no failure either. (.git is
// a FILE, not a directory, inside a worktree or submodule — existsSync covers
// both, which is why this isn't a statSync-isDirectory check.)
if (!existsSync('.git')) {
  process.exit(0);
}

try {
  // core.hooksPath REPLACES .git/hooks wholesale rather than merging with it,
  // so anything a contributor put there by hand silently stops running. This
  // repo ships no .git/hooks entries, but a personal hook in someone's clone
  // would be collateral, and a hook that stops firing without saying so is a
  // nasty thing to do to somebody. Warn; don't refuse — the shipped hook is
  // the one guarding a real invariant.
  const shadowed = readdirSync('.git/hooks').filter((f) => !f.endsWith('.sample'));
  if (shadowed.length > 0) {
    console.warn(
      `install-hooks: .git/hooks contains ${shadowed.join(', ')} — setting ` +
        'core.hooksPath to .githooks means git will no longer run them. Move ' +
        'them into .githooks/ to keep them active.'
    );
  }
} catch {
  // No .git/hooks dir at all (or unreadable). Nothing to shadow, nothing to say.
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  // git missing from PATH, or a config write that couldn't land. The hook just
  // won't be installed; CI still enforces the same invariant.
  console.warn(
    'install-hooks: could not set core.hooksPath — git hooks are not installed. ' +
      'Run `git config core.hooksPath .githooks` by hand to enable them.'
  );
}
