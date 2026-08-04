/**
 * brand history <slug> — walk git history for a slug's asset path(s) and
 * report, newest first, what changed and when.
 *
 *   brand history <slug> [--gallery <name>] [--limit <n>] [--json]
 *                        [--logos <path>]
 *
 * Answers "when did this logo change, and to what?" — every byte of that
 * answer already lives in git, this just walks it instead of making an
 * operator do manual `git log` archaeology.
 *
 * Scope: by default this reports every change under `<logos>/<slug>/**`
 * (the primary readme.<ext> AND any/all gallery subfolders combined, newest
 * first) — a strict superset of "just the primary logo," so the default
 * never hides a change. Pass --gallery <name> to narrow to one gallery
 * subfolder's own history when a slug has more than one and the primary
 * logo's own history is the noise you want to filter out.
 *
 * Architecture note — this is the ONE command in this CLI that shells out
 * to an external binary. The rest of the tool is a pure function of the
 * local manifest.json + logos/ tree (no network, no subprocess). git IS
 * still local (no network call), so the "fully offline" contract holds,
 * but a missing/broken git install is a NEW failure mode this command adds
 * that no sibling command has — handled explicitly below (see
 * assertGitAvailable) as a clean exit-2 operator error, never a raw
 * "fatal: ..." stack from git itself.
 *
 * Deliberately NOT using a git library (isomorphic-git, simple-git, etc.):
 * git is already guaranteed present in every environment this tool ships to
 * (CI runners, dev machines), and a wrapper library is one more supply-chain
 * dependency + one more layer that can drift from git's own actual output
 * format. `child_process.execFileSync` with an ARGUMENT ARRAY (never a
 * shell string, never `exec`/string-interpolated commands) is correct here:
 * git receives each argument as a discrete argv element with no shell
 * parsing in between, so a slug/gallery name can never be interpreted as
 * shell syntax — it is validated as a safe path segment below on top of
 * that (defense in depth, matching add-gallery.ts's validateSlug rationale)
 * but the argv-array invocation alone already closes the shell-injection
 * class of bug entirely.
 *
 * "hash" in this command's output means the SAME thing it means everywhere
 * else in this tool: `sha256:<hex>` of the asset's RAW bytes (see
 * manifest.ts's hashFile doc comment) — computed here from the git blob
 * content at a specific commit (`git show <rev>:<path>`) rather than from
 * the working tree, so a history hash is always directly comparable to a
 * manifest.json hash for the same content.
 *
 * Exit codes (same contract as the rest of the CLI):
 *   0 — success (includes "zero history entries" — not tracked yet is not an error)
 *   2 — operator error (unknown slug/gallery, invalid --limit, not a git
 *       repo, git not installed, missing --logos directory)
 *   3 — unexpected error
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { validateSlug } from './add-gallery.js';

export interface HistoryOptions {
  slug: string;
  gallery?: string;
  /** Raw string from commander (e.g. "20") — parsed/validated inside runHistory. */
  limit?: string;
  logos: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

type ChangeStatus = 'added' | 'changed' | 'removed';

interface HistoryChange {
  file: string;
  status: ChangeStatus;
  before: string | null;
  after: string | null;
}

interface HistoryEntry {
  sha: string;
  date: string;
  author: string;
  subject: string;
  changes: HistoryChange[];
}

interface HistoryJsonResult {
  ok: boolean;
  slug: string;
  gallery: string | null;
  limit: number;
  count: number;
  entries: HistoryEntry[];
  error?: string;
  message?: string;
}

/** Operator-error signal — caught by runHistory to map to exit code 2. Carries a machine-readable `code` for --json consumers (mirrors sync.ts's `fail(..., error)` convention). */
class HistoryOperatorError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'HistoryOperatorError';
    this.code = code;
  }
}

// Same character class as add-gallery.ts's INVALID_SEGMENT_CHARS. Not
// imported (that module only exports validateSlug, not the gallery-name
// variant) — duplicated here as a small, self-contained, single-purpose
// check rather than reaching into a sibling command file that owns its own
// private helpers. See validateSlug's own doc for the exact rationale
// (an unvalidated ../ segment can escape --logos both on disk AND as a git
// pathspec, since a pathspec beginning with ../ is resolved by git too).
const INVALID_SEGMENT_CHARS = /[/\\:*?"<>|]/;

/** Validate a value (slug or --gallery) is a safe, single path segment. */
function assertSafeSegment(value: string, label: string): void {
  if (!value || value.trim().length === 0) {
    throw new HistoryOperatorError(`${label} must be a non-empty string.`, `invalid-${label}`);
  }
  if (INVALID_SEGMENT_CHARS.test(value) || value.includes('..') || value === '.') {
    throw new HistoryOperatorError(
      `${label} "${value}" is not a valid path segment (no /, \\, :, *, ?, ", <, >, |, or ..).`,
      `invalid-${label}`
    );
  }
}

// Commit-header lines are marked with SOH (0x01) so they can never collide
// with a `--name-status` file line, which always starts with a status
// letter (A/M/D/R.../C...) followed by a tab. Fields within a header line
// are separated by US (0x1F). Neither control character can appear in a
// commit sha, ISO date, author name, or (in any realistic case) a subject
// line, so this is a safe, simple delimiter scheme without needing a real
// parser.
const HEADER_MARK = '\x01';
const FIELD_SEP = '\x1f';

// Explicit stdio for every git invocation below: 'ignore' stdin (we never
// prompt git for anything), 'pipe' stdout AND stderr. This is NOT optional —
// confirmed empirically (Windows + git-for-windows 2.54) that git's own
// "fatal: ..." messages leak straight to this process's real stderr fd
// under Node's *default* execFileSync stdio, bypassing our own error
// formatting entirely. Piping stderr explicitly captures it into
// err.stderr instead, so the operator only ever sees OUR clean, styled
// message — never git's raw text — matching this command's "never a raw
// stack" requirement.
// Typed as a mutable array (not `as const`) because Node's ExecFileSyncOptions
// stdio field is declared as a mutable array type — a readonly tuple doesn't
// satisfy that overload even though nothing here ever mutates it.
const GIT_STDIO: Array<'ignore' | 'pipe'> = ['ignore', 'pipe', 'pipe'];

// Generous ceiling for both the log walk (bounded anyway by --limit) and
// blob reads (a logo/gallery image). Default execFileSync maxBuffer is 1MB,
// which a handful of image blobs could plausibly exceed.
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Confirms `cwd` is inside a git working tree with git available at all,
 * before any real data-gathering call. Throws a clean HistoryOperatorError
 * (exit 2) distinguishing "git isn't installed" from "this isn't a git
 * repo" — never lets a raw git/Node stack through.
 */
function assertGitAvailable(cwd: string): void {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf-8',
      stdio: GIT_STDIO,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new HistoryOperatorError(
        'git is not installed (or not on PATH). `brand history` shells out to the local git binary to read commit history — install git and try again.',
        'git-not-installed'
      );
    }
    throw new HistoryOperatorError(
      `"${cwd}" is not inside a git repository. \`brand history\` reads commit history from git — run \`brand\` from inside the brand repo checkout (or point --logos at a directory that is version-controlled).`,
      'not-a-git-repo'
    );
  }
}

interface RawFileChange {
  /** Raw git status token, e.g. "A", "M", "D", "R100", "C87". */
  status: string;
  path: string;
  /** Present only for rename/copy statuses (R.../C...). */
  oldPath?: string;
}

interface RawCommit {
  sha: string;
  date: string;
  author: string;
  subject: string;
  files: RawFileChange[];
}

/** Parse `git log -M --name-status --format=<HEADER_MARK-prefixed>` output into structured commits. */
function parseNameStatusLog(output: string): RawCommit[] {
  const commits: RawCommit[] = [];
  let current: RawCommit | null = null;

  for (const line of output.split('\n')) {
    if (line.startsWith(HEADER_MARK)) {
      const [sha = '', date = '', author = '', ...rest] = line.slice(1).split(FIELD_SEP);
      current = { sha, date, author, subject: rest.join(FIELD_SEP), files: [] };
      commits.push(current);
      continue;
    }
    if (!current || line.trim() === '') continue;
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    if (status.startsWith('R') || status.startsWith('C')) {
      // Rename/copy: "<statusScore>\t<oldpath>\t<newpath>"
      current.files.push({ status, oldPath: parts[1] ?? '', path: parts[2] ?? parts[1] ?? '' });
    } else {
      // Add/Modify/Delete: "<status>\t<path>"
      current.files.push({ status, path: parts[1] ?? '' });
    }
  }
  return commits;
}

/**
 * True if HEAD resolves to a real commit — i.e. this repo has at least one
 * commit. `git log` itself FAILS (exit 128, "fatal: your current branch
 * ... does not have any commits yet") in a freshly `git init`'d repo with
 * zero commits ever made — a distinct failure mode from "pathspec matches
 * nothing in a repo that already has history" (which exits 0 with empty
 * output, confirmed empirically). walkHistory checks this FIRST so a brand
 * new/history-less repo is treated as "zero commits" (same bucket as a
 * non-matching pathspec), never as an "unexpected" error. `-q` suppresses
 * git's own stderr on failure, so this needs no separate stderr-leak guard.
 */
function hasAnyCommits(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd, stdio: GIT_STDIO });
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk git log for `targetPath` (a pathspec relative to `cwd`), newest
 * first, capped at `limit` commits via git's own `-n` (so we never pay to
 * parse/hash more history than requested). An empty result is NOT an error
 * — git itself exits 0 with empty output for a pathspec that matches
 * nothing (confirmed empirically); "unknown slug" is decided by the caller
 * by ALSO checking whether the path currently exists on disk.
 */
function walkHistory(cwd: string, targetPath: string, limit: number): RawCommit[] {
  // Guard for the history-less-repo failure mode described above — skip the
  // real `git log` call entirely rather than let it fail and get misread as
  // an unexpected error.
  if (!hasAnyCommits(cwd)) return [];

  const format = `${HEADER_MARK}%h${FIELD_SEP}%aI${FIELD_SEP}%an${FIELD_SEP}%s`;
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['log', '-M', '--name-status', `--format=${format}`, '-n', String(limit), '--', targetPath],
      { cwd, encoding: 'utf-8', stdio: GIT_STDIO, maxBuffer: MAX_BUFFER }
    );
  } catch (err) {
    const e = err as Error;
    throw new Error(`git log failed for "${targetPath}": ${e.message}`);
  }
  return parseNameStatusLog(output);
}

/**
 * SHA-256 of `path`'s raw content at git ref `rev`, formatted exactly like
 * manifest.ts's hashFile() ("sha256:<hex>") so a history hash is always
 * directly comparable to a manifest.json entry for the same bytes. Returns
 * null if the path doesn't exist at that ref (expected for the "before" of
 * an added file, the "after" of a removed file, or a root commit's parent).
 *
 * Deliberately requests NO `encoding` from execFileSync — the return value
 * is the raw Buffer, hashed as-is. Requesting 'utf-8' here would decode
 * binary PNG/JPEG bytes as text (lossy/corrupting) before hashing, which
 * would silently disagree with hashFile()'s own raw-byte contract for the
 * exact same content.
 */
function hashAtRef(cwd: string, rev: string, path: string): string | null {
  try {
    const content = execFileSync('git', ['show', `${rev}:${path}`], {
      cwd,
      stdio: GIT_STDIO,
      maxBuffer: MAX_BUFFER,
    });
    return `sha256:${createHash('sha256').update(content).digest('hex')}`;
  } catch {
    // Expected miss (path absent at that rev) OR a rare unexpected failure
    // (e.g. shallow clone missing the parent) — either way, "no content at
    // this ref" is the only thing a null before/after needs to communicate.
    return null;
  }
}

/** Map a raw git status token onto the 3-way added/changed/removed report the CLI documents. */
function classify(status: string): ChangeStatus {
  const code = status.charAt(0);
  if (code === 'A') return 'added';
  if (code === 'D') return 'removed';
  // M (modified), R### (renamed), C### (copied), T (type change) all
  // collapse to "changed" — a rename/copy is still the SAME logical asset
  // slot changing shape, and the CLI's own documented contract only asks
  // for a 3-way split.
  return 'changed';
}

/** Truncate a hash for human-readable display; --json always carries the full value. */
function shortHash(hash: string | null): string {
  if (hash === null) return '(none)';
  const shownLen = 'sha256:'.length + 12;
  return hash.length > shownLen ? `${hash.slice(0, shownLen)}…` : hash;
}

export async function runHistory(opts: HistoryOptions): Promise<void> {
  const gallery = opts.gallery;

  try {
    // --- Step 0: validate inputs BEFORE they are joined into any path or
    // git pathspec (mirrors sync.ts's "Step 0" ordering and rationale). ---
    assertSafeSegment(opts.slug, 'slug');
    if (gallery !== undefined) assertSafeSegment(gallery, 'gallery');

    const limitRaw = opts.limit ?? '20';
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new HistoryOperatorError(`--limit must be a positive integer (got "${limitRaw}").`, 'invalid-limit');
    }

    // --- Step 1: --logos must exist (mirrors stats.ts's identical guard). ---
    if (!existsSync(opts.logos)) {
      throw new HistoryOperatorError(
        `logos directory not found: ${opts.logos} — pass --logos <path> or run from the brand repo root.`,
        'logos-dir-not-found'
      );
    }

    // git's cwd is the resolved --logos directory itself; pathspecs below
    // are relative to it. git resolves pathspecs relative to invocation cwd
    // (not repo root) and walks upward to find .git on its own, so this
    // works regardless of how deep --logos sits inside the actual repo —
    // confirmed empirically against a real repo with logos/ one level under
    // the git root.
    const gitCwd = resolve(opts.logos);
    assertGitAvailable(gitCwd);

    // Pathspec uses forward slashes explicitly (not path.join, which is
    // backslash-joined on Windows) — git pathspecs and this tool's own
    // manifest keys are always forward-slash (see manifest.ts's key
    // construction), so this stays consistent with that convention.
    const targetPath = gallery ? `${opts.slug}/${gallery}` : opts.slug;
    const existsNow = existsSync(gallery ? join(opts.logos, opts.slug, gallery) : join(opts.logos, opts.slug));

    const rawCommits = walkHistory(gitCwd, targetPath, limit);

    if (rawCommits.length === 0 && !existsNow) {
      const label = gallery
        ? `gallery "${gallery}" under slug "${opts.slug}"`
        : `slug "${opts.slug}"`;
      throw new HistoryOperatorError(
        `No git history and no current files for ${label} under ${opts.logos}. Check the slug/gallery name for typos.`,
        'unknown-slug'
      );
    }

    const entries: HistoryEntry[] = rawCommits
      .map((c): HistoryEntry => ({
        sha: c.sha,
        date: c.date,
        author: c.author,
        subject: c.subject,
        changes: c.files.map((f): HistoryChange => {
          const status = classify(f.status);
          const after = status === 'removed' ? null : hashAtRef(gitCwd, c.sha, f.path);
          // Root commits are always status "added" (there is no prior tree
          // to diff against), so `before` is never computed via `<sha>^`
          // for one — this only ever fires for M/R/C/T/D, which all imply
          // a parent commit exists.
          const before = status === 'added' ? null : hashAtRef(gitCwd, `${c.sha}^`, f.oldPath ?? f.path);
          return { file: f.path, status, before, after };
        }),
      }))
      // Defensive: a merge commit can appear in the log with zero
      // name-status lines for this pathspec (git's default combined-diff
      // behavior skips per-file diffs for merges) — drop it rather than
      // report an empty, confusing entry.
      .filter((entry) => entry.changes.length > 0);

    if (opts.json) {
      const out: HistoryJsonResult = {
        ok: true,
        slug: opts.slug,
        gallery: gallery ?? null,
        limit,
        count: entries.length,
        entries,
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      return;
    }

    const scopeLabel = gallery ? `${opts.slug}/${gallery}` : opts.slug;

    if (entries.length === 0) {
      console.log(chalk.dim(`\n  No history yet for ${scopeLabel} (present on disk but not yet committed).\n`));
      return;
    }

    if (!opts.quiet) {
      console.log(chalk.bold(`\n  History: ${scopeLabel}\n`));
      for (const entry of entries) {
        console.log(`  ${chalk.cyan(entry.sha)}  ${entry.date.slice(0, 10)}  ${chalk.dim(entry.author)}`);
        console.log(`    ${entry.subject}`);
        for (const c of entry.changes) {
          const colorFn = c.status === 'added' ? chalk.green : c.status === 'removed' ? chalk.red : chalk.yellow;
          const symbol = c.status === 'added' ? '+' : c.status === 'removed' ? '-' : '~';
          console.log(`    ${colorFn(symbol)} ${colorFn(c.file)}  ${shortHash(c.before)} → ${shortHash(c.after)}`);
        }
        console.log('');
      }
    }

    // Summary line survives --quiet (matches the global flag's own
    // documented contract: "only summaries and errors" survive --quiet —
    // see cli.ts's `-q, --quiet` description).
    console.log(`  ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} shown (limit ${limit}).`);
  } catch (err) {
    if (err instanceof HistoryOperatorError) {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            { ok: false, slug: opts.slug, gallery: gallery ?? null, error: err.code, message: err.message },
            null,
            2
          ) + '\n'
        );
      } else {
        console.error(chalk.red(`\n  ✗ ${err.message}\n`));
      }
      // exitCode (not exit()) so a --json payload just written to stdout can
      // never be truncated by an immediate process exit — same reasoning as
      // verify.ts's F-f0c1a1f8 / stats.ts's F-f4900c6e.
      process.exitCode = 2;
      return;
    }

    const e = err as Error;
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: false, slug: opts.slug, gallery: gallery ?? null, error: 'unexpected', message: e.message }, null, 2) + '\n'
      );
    } else {
      console.error(chalk.red(`\n  ✗ Unexpected error: ${e.message}\n`));
    }
    if (process.env.BRAND_DEBUG && e.stack) {
      console.error(e.stack);
    }
    process.exitCode = 3;
    return;
  }
}
