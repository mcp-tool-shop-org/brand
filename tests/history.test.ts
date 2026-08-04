/**
 * history tests — runHistory() against a REAL temporary git repository.
 *
 * "Use a real temp git repo in the test rather than mocking git" (per the
 * wave-6 build brief) — every test in this file that expects git history
 * actually runs `git init`/`git commit` in a throwaway temp directory and
 * lets runHistory shell out to the real git binary, matching how
 * verify.test.ts/exit-codes.test.ts already avoid mocking for
 * security/contract-critical behavior.
 *
 * This whole file (and src/commands/history.ts) is NEW — `history` did not
 * exist as a command before this change, so every test below fails before
 * the change in the most direct possible way (the import itself fails:
 * `Cannot find module '../src/commands/history.js'`) and passes after.
 *
 * history.ts uses process.exitCode (not process.exit()), matching the
 * modern convention in this file's siblings (verify.ts/stats.ts, F-f0c1a1f8/
 * F-f4900c6e) — so no process.exit mock is needed here, unlike
 * add-gallery.test.ts's exitSpy (add-gallery.ts still calls process.exit()
 * directly).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { runHistory } from '../src/commands/history.js';

let tempDir: string;
let logosDir: string;
let stdout: string[];
let stderr: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-history-test-'));
  logosDir = join(tempDir, 'logos');
  mkdirSync(logosDir, { recursive: true });

  stdout = [];
  stderr = [];
  process.exitCode = undefined;

  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });
  // history.ts's --json path writes via process.stdout.write (not
  // console.log) — capture it into the SAME array so parseJsonOutput()
  // works regardless of which primitive a given code path uses (mirrors
  // stats.test.ts's identical rationale).
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdout.push(String(chunk).replace(/\n$/, ''));
    return true;
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  stdoutWriteSpy.mockRestore();
  process.exitCode = undefined;
  rmSync(tempDir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function initGitRepo(dir: string): void {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test User']);
  // Avoid CRLF-conversion warnings cluttering test output on Windows; doesn't
  // affect correctness of the before/after-hash assertions below (those
  // check presence/absence/inequality, never a pinned hash literal).
  git(dir, ['config', 'core.autocrlf', 'false']);
}

/** Write relPath (under repoRoot) and commit it with the given message/author. */
function commitFile(repoRoot: string, relPath: string, content: string, message: string, author: string): void {
  const fullPath = join(repoRoot, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-q', '-m', message, `--author=${author}`]);
}

function removeAndCommit(repoRoot: string, relPath: string, message: string, author: string): void {
  rmSync(join(repoRoot, relPath), { recursive: true, force: true });
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-q', '-m', message, `--author=${author}`]);
}

/** Parse the most-recent JSON payload written to stdout (console.log OR process.stdout.write). */
function parseJsonOutput(): {
  ok: boolean;
  slug: string;
  gallery: string | null;
  limit?: number;
  count?: number;
  entries?: Array<{
    sha: string;
    date: string;
    author: string;
    subject: string;
    changes: Array<{ file: string; status: string; before: string | null; after: string | null }>;
  }>;
  error?: string;
  message?: string;
} {
  const last = stdout[stdout.length - 1];
  return JSON.parse(last as string);
}

describe('runHistory', () => {
  it('reports multiple changes newest-first, distinguishing added vs changed', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/widget/readme.png', 'v1', 'Add widget logo', 'Alice <alice@example.com>');
    commitFile(tempDir, 'logos/widget/readme.png', 'v2', 'Recolor widget logo', 'Bob <bob@example.com>');
    commitFile(tempDir, 'logos/widget/gallery/shot1.png', 'shot-v1', 'Add widget gallery shot', 'Alice <alice@example.com>');

    await runHistory({ slug: 'widget', logos: logosDir, json: true });

    expect(process.exitCode).toBeUndefined(); // success leaves exitCode unset (0)
    const out = parseJsonOutput();
    expect(out.ok).toBe(true);
    expect(out.count).toBe(3);
    expect(out.entries).toHaveLength(3);

    // Newest first: the gallery-shot commit is the most recent.
    expect(out.entries![0].subject).toBe('Add widget gallery shot');
    expect(out.entries![0].author).toBe('Alice');
    expect(out.entries![0].changes[0].status).toBe('added');
    expect(out.entries![0].changes[0].before).toBeNull();
    expect(out.entries![0].changes[0].after).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(out.entries![0].changes[0].file).toBe('logos/widget/gallery/shot1.png');

    expect(out.entries![1].subject).toBe('Recolor widget logo');
    expect(out.entries![1].author).toBe('Bob');
    expect(out.entries![1].changes[0].status).toBe('changed');
    expect(out.entries![1].changes[0].before).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(out.entries![1].changes[0].after).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(out.entries![1].changes[0].before).not.toBe(out.entries![1].changes[0].after);

    expect(out.entries![2].subject).toBe('Add widget logo');
    expect(out.entries![2].changes[0].status).toBe('added');
    expect(out.entries![2].changes[0].before).toBeNull();
  });

  it('reports a slug with exactly one commit as a single "added" entry', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/solo/readme.png', 'only-version', 'Add solo logo', 'Carol <carol@example.com>');

    await runHistory({ slug: 'solo', logos: logosDir, json: true });

    expect(process.exitCode).toBeUndefined();
    const out = parseJsonOutput();
    expect(out.ok).toBe(true);
    expect(out.count).toBe(1);
    expect(out.entries).toHaveLength(1);
    expect(out.entries![0].changes).toHaveLength(1);
    expect(out.entries![0].changes[0].status).toBe('added');
    expect(out.entries![0].changes[0].before).toBeNull();
    expect(out.entries![0].changes[0].after).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('reports a removed asset with a non-null before and a null after', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/gone/readme.png', 'v1', 'Add gone logo', 'Alice <alice@example.com>');
    // Remove the WHOLE slug directory (not just the file inside it) so the
    // "no longer exists on disk" assertion below reflects a slug that's
    // truly gone, not an empty leftover directory (rmSync on just the file
    // path would leave the now-empty logos/gone/ dir behind).
    removeAndCommit(tempDir, 'logos/gone', 'Remove gone logo', 'Alice <alice@example.com>');

    await runHistory({ slug: 'gone', logos: logosDir, json: true });

    const out = parseJsonOutput();
    expect(out.ok).toBe(true);
    expect(out.entries![0].subject).toBe('Remove gone logo');
    expect(out.entries![0].changes[0].status).toBe('removed');
    expect(out.entries![0].changes[0].after).toBeNull();
    expect(out.entries![0].changes[0].before).toMatch(/^sha256:[0-9a-f]{64}$/);

    // The slug no longer exists on disk, but its full history (including the
    // removal) is still reported — exit 0, NOT "unknown slug".
    expect(existsSync(join(logosDir, 'gone'))).toBe(false);
    expect(out.error).toBeUndefined();
  });

  it('exits 2 for an unknown slug (no history, not on disk)', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/real-slug/readme.png', 'v1', 'Add real-slug logo', 'Alice <alice@example.com>');

    await runHistory({ slug: 'totally-made-up', logos: logosDir, json: true });

    expect(process.exitCode).toBe(2);
    const out = parseJsonOutput();
    expect(out.ok).toBe(false);
    expect(out.error).toBe('unknown-slug');
  });

  it('exits 2 for an unknown slug in human-readable mode too, without a raw stack', async () => {
    initGitRepo(tempDir);

    await runHistory({ slug: 'nope', logos: logosDir });

    expect(process.exitCode).toBe(2);
    const combined = stderr.join('\n');
    expect(combined).toMatch(/nope/);
    expect(combined).not.toMatch(/at runHistory/); // no raw stack trace
  });

  it('--json emits exactly one JSON document (nothing else on stdout)', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/onedoc/readme.png', 'v1', 'Add onedoc logo', 'Alice <alice@example.com>');

    await runHistory({ slug: 'onedoc', logos: logosDir, json: true });

    // Exactly one process.stdout.write call happened, and console.log was
    // never used in --json mode (no mixed human+JSON output).
    expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(() => JSON.parse(stdout[0] as string)).not.toThrow();
  });

  it('--limit caps the number of entries to the N most recent', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/many/readme.png', 'v1', 'commit 1', 'Alice <alice@example.com>');
    commitFile(tempDir, 'logos/many/readme.png', 'v2', 'commit 2', 'Alice <alice@example.com>');
    commitFile(tempDir, 'logos/many/readme.png', 'v3', 'commit 3', 'Alice <alice@example.com>');
    commitFile(tempDir, 'logos/many/readme.png', 'v4', 'commit 4', 'Alice <alice@example.com>');

    await runHistory({ slug: 'many', logos: logosDir, limit: '2', json: true });

    const out = parseJsonOutput();
    expect(out.count).toBe(2);
    expect(out.entries).toHaveLength(2);
    // Newest first: commit 4, then commit 3.
    expect(out.entries![0].subject).toBe('commit 4');
    expect(out.entries![1].subject).toBe('commit 3');
  });

  it('defaults --limit to 20 when not supplied', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/def/readme.png', 'v1', 'Add def logo', 'Alice <alice@example.com>');

    await runHistory({ slug: 'def', logos: logosDir, json: true });

    const out = parseJsonOutput();
    expect(out.limit).toBe(20);
  });

  it('exits 2 for a non-numeric --limit', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/badlimit/readme.png', 'v1', 'Add badlimit logo', 'Alice <alice@example.com>');

    await runHistory({ slug: 'badlimit', logos: logosDir, limit: 'not-a-number', json: true });

    expect(process.exitCode).toBe(2);
    const out = parseJsonOutput();
    expect(out.error).toBe('invalid-limit');
  });

  it('narrows to one gallery\'s history with --gallery, excluding the primary logo', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/multi/readme.png', 'v1', 'Add multi primary logo', 'Alice <alice@example.com>');
    commitFile(tempDir, 'logos/multi/shots/one.png', 'shot1', 'Add multi gallery shot', 'Alice <alice@example.com>');

    await runHistory({ slug: 'multi', gallery: 'shots', logos: logosDir, json: true });

    const out = parseJsonOutput();
    expect(out.gallery).toBe('shots');
    expect(out.count).toBe(1);
    expect(out.entries![0].subject).toBe('Add multi gallery shot');
  });

  it('--quiet suppresses the per-commit listing but keeps the summary line', async () => {
    initGitRepo(tempDir);
    commitFile(tempDir, 'logos/hush/readme.png', 'v1', 'Add hush logo', 'Alice <alice@example.com>');

    await runHistory({ slug: 'hush', logos: logosDir, quiet: true });

    expect(process.exitCode).toBeUndefined();
    const combined = stdout.join('\n');
    expect(combined).not.toMatch(/Add hush logo/); // per-commit subject suppressed
    expect(combined).toMatch(/1 entry shown/); // summary survives --quiet
  });

  it('exits 2 when --logos points at a directory that is not a git repository', async () => {
    // Deliberately NOT calling initGitRepo() — tempDir/logosDir stay plain,
    // non-version-controlled directories (os.tmpdir() is never inside a git
    // work tree on this test environment).
    mkdirSync(join(logosDir, 'plain'), { recursive: true });
    writeFileSync(join(logosDir, 'plain', 'readme.png'), 'v1');

    await runHistory({ slug: 'plain', logos: logosDir, json: true });

    expect(process.exitCode).toBe(2);
    const out = parseJsonOutput();
    expect(out.ok).toBe(false);
    expect(out.error).toBe('not-a-git-repo');
    // The raw git "fatal: ..." text must never leak — only our own message.
    expect(out.message).not.toMatch(/fatal:/i);
  });

  it('exits 2 when the --logos directory itself does not exist', async () => {
    await runHistory({ slug: 'whatever', logos: join(tempDir, 'does-not-exist'), json: true });

    expect(process.exitCode).toBe(2);
    const out = parseJsonOutput();
    expect(out.error).toBe('logos-dir-not-found');
  });

  it('rejects a slug containing path-traversal segments as an operator error', async () => {
    initGitRepo(tempDir);

    await runHistory({ slug: '../../etc', logos: logosDir, json: true });

    expect(process.exitCode).toBe(2);
    const out = parseJsonOutput();
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/invalid-slug/);
  });
});
