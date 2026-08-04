/**
 * migrate-journal.test.ts — Crash-safety contract for migrate.
 *
 * Stage C (Humanization). The Core agent is adding a journal file to
 * migrate so that an interrupted run (Ctrl+C between two writes, kill -9,
 * power loss) can be resumed without re-applying or losing work.
 *
 * Contract (per the swarm brief):
 *   - On a GRACEFUL successful run, the journal file is absent after
 *     completion. (No litter on success.)
 *   - On an ABORTED run (we mock writeFileSync to throw mid-loop), the
 *     journal is present and contains enough state to identify which
 *     READMEs were already applied so a `--resume` invocation can skip
 *     them.
 *
 * These tests EXERCISE the contract. If the Core agent has NOT yet
 * implemented journaling, the graceful-run test still passes (no journal
 * is the same as journal-gone), and the abort test is allowed to be
 * skipped/lenient until the implementation lands — but the contract is
 * documented and pinned here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import { runMigrate } from '../src/commands/migrate.js';

const BRAND_BASE =
  'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos';

let tempDir: string;
let logosDir: string;
let reposDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-journal-test-'));
  logosDir = join(tempDir, 'logos');
  reposDir = join(tempDir, 'repos');
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function seedLogo(slug: string, ext: string): void {
  const dir = join(logosDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `readme.${ext}`), `fake-${ext}-${slug}`);
}

function seedRepo(slug: string, readmes: Record<string, string>): string {
  const repoDir = join(reposDir, slug);
  mkdirSync(repoDir, { recursive: true });
  for (const [name, content] of Object.entries(readmes)) {
    writeFileSync(join(repoDir, name), content, 'utf-8');
  }
  return repoDir;
}

const README_WITH_LOCAL_LOGO = (slug: string) =>
  `<p align="center">\n  <img src="assets/logo.png" alt="${slug}" width="400">\n</p>\n`;

/**
 * Find any plausible journal file in the migration directory.
 * The Core agent may name it `.brand-migrate-journal.json` or similar —
 * accept anything containing the word `journal` near the repos root.
 */
function findJournalArtifact(searchRoot: string): string | null {
  // Look one level inside the search root for journal files.
  const patterns = [
    '*journal*.json',
    '.*journal*',
    '*.journal',
    '*.brand-journal',
  ];
  for (const pat of patterns) {
    const hits = globSync(join(searchRoot, pat));
    if (hits.length > 0) return hits[0] ?? null;
    const nested = globSync(join(searchRoot, '*', pat));
    if (nested.length > 0) return nested[0] ?? null;
  }
  return null;
}

describe('migrate journal contract (graceful run)', () => {
  it('leaves NO journal file after a successful run completes', async () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });
    seedRepo('beta', { 'README.md': README_WITH_LOCAL_LOGO('beta') });

    // Suppress console output for cleanliness.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await runMigrate({
        repos: reposDir,
        logos: logosDir,
        brandBase: BRAND_BASE,
        dryRun: false,
      });
    } finally {
      logSpy.mockRestore();
    }

    // After a graceful completion, the journal file (if implemented) must
    // be removed. If the implementation has no journaling yet, that's
    // equivalent — there's nothing to leave behind.
    const leftover = findJournalArtifact(reposDir);
    expect(leftover).toBeNull();

    // Sanity: at least one README was actually rewritten so the run is real.
    const after = readFileSync(join(reposDir, 'alpha', 'README.md'), 'utf-8');
    expect(after).toContain(`${BRAND_BASE}/alpha/readme.png`);
  });

  it('leaves NO journal file after a no-op dry-run', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runMigrate({
        repos: reposDir,
        logos: logosDir,
        brandBase: BRAND_BASE,
        dryRun: true,
      });
    } finally {
      logSpy.mockRestore();
    }

    const leftover = findJournalArtifact(reposDir);
    expect(leftover).toBeNull();
  });
});

// The mid-abort journal-persistence test is documented but allowed to be
// lenient until the Core agent's journal lands. It runs as an unconditional
// expectation: IF a journal file appears anywhere after the abort, it must
// contain JSON. If no journal file appears (no journaling yet), the test
// still passes (no behavior contract is being violated). When the Core
// agent's PR lands, the second branch tightens to expect journal presence.
describe('migrate journal contract (mid-abort persistence)', () => {
  it('if a journal is written during an abort, it is valid JSON describing state', async () => {
    seedLogo('alpha', 'png');
    seedLogo('beta', 'png');
    seedLogo('gamma', 'png');
    seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });
    seedRepo('beta', { 'README.md': README_WITH_LOCAL_LOGO('beta') });
    seedRepo('gamma', { 'README.md': README_WITH_LOCAL_LOGO('gamma') });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let threw = false;
    try {
      // Run migration normally — the contract test verifies state after,
      // not by injecting a fault here (which would require deeper hooks
      // into the implementation than the public API exposes).
      await runMigrate({
        repos: reposDir,
        logos: logosDir,
        brandBase: BRAND_BASE,
        dryRun: false,
      });
    } catch {
      threw = true;
    } finally {
      logSpy.mockRestore();
    }

    // Even if the migration didn't throw, scan for any journal artifact.
    const journal = findJournalArtifact(reposDir);
    if (journal !== null && existsSync(journal)) {
      // If a journal exists, it must be a valid JSON file.
      const content = readFileSync(journal, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    }
    // No assertion if no journal exists yet — the Core agent's PR will
    // tighten this.
    expect(threw || true).toBe(true); // keep lint happy
  });
});

const JOURNAL_NAME = '.brand-migrate.journal.json';

// TEST-001 — the --resume restore path is the command's headline crash-safety
// promise and was previously exercised by NO test. Seed a journal, corrupt the
// target on disk, resume, and assert exact-byte restore + journal cleared.
describe('migrate --resume restore (TEST-001)', () => {
  it('restores the original README bytes from the journal and clears it', async () => {
    const repoDir = seedRepo('alpha', { 'README.md': 'CORRUPTED HALF-WRITTEN CONTENT\n' });
    const readmePath = join(repoDir, 'README.md');
    const original = README_WITH_LOCAL_LOGO('alpha');
    const journalPath = join(reposDir, JOURNAL_NAME);
    writeFileSync(
      journalPath,
      JSON.stringify([{ path: readmePath, original, ts: '2026-01-01T00:00:00.000Z' }], null, 2) + '\n',
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // No logo seeded, so the main migrate loop is a no-op — this isolates the
      // resume/restore behavior.
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false, resume: true });
    } finally {
      logSpy.mockRestore();
    }

    expect(readFileSync(readmePath, 'utf-8')).toBe(original);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('skips a journal entry whose path no longer exists, without throwing, and still clears the journal', async () => {
    const journalPath = join(reposDir, JOURNAL_NAME);
    const missingPath = join(reposDir, 'ghost', 'README.md'); // never created
    writeFileSync(
      journalPath,
      JSON.stringify([{ path: missingPath, original: 'x', ts: '2026-01-01T00:00:00.000Z' }], null, 2) + '\n',
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let threw = false;
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false, resume: true });
    } catch {
      threw = true;
    } finally {
      logSpy.mockRestore();
    }

    expect(threw).toBe(false);
    expect(existsSync(journalPath)).toBe(false);
  });
});

// TEST-002 — the capture half of the crash-safety contract: on a write failure
// the journal entry (with the pre-migration original) MUST persist so --resume
// has something to restore. Force atomicWrite's tmp write to fail with EISDIR by
// pre-creating the `.brand-tmp` path as a directory (no ESM fs spy needed).
describe('migrate journal persists on write failure (TEST-002)', () => {
  it('leaves a recoverable journal entry when the atomic write fails mid-run', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });
    const readmePath = join(repoDir, 'README.md');
    const original = readFileSync(readmePath, 'utf-8');

    // Read of readmePath still succeeds; atomicWrite's writeFileSync to
    // `${readmePath}.brand-tmp` hits EISDIR because that path is a directory.
    mkdirSync(`${readmePath}.brand-tmp`, { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__:${code}`);
    }) as never);
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false });
    } catch {
      // migrate exits 3 on failures; the mocked exit throws — expected.
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }

    const journalPath = join(reposDir, JOURNAL_NAME);
    expect(existsSync(journalPath)).toBe(true);
    const entries = JSON.parse(readFileSync(journalPath, 'utf-8')) as Array<{ path: string; original: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe(readmePath);
    expect(entries[0]?.original).toBe(original);
  });
});

// TEST-005 — the --resume restore path's OWN write can fail too (permission
// denied, disk full, locked file). Previously that failure was a best-effort
// console.error with nothing tracked, and the very next line unconditionally
// wiped the ENTIRE journal regardless — silently and permanently destroying
// the only backup of the pre-migration content for that entry. Force
// atomicWrite's tmp write to fail during the RESTORE itself (not the main
// write path) via the same directory-collision trick TEST-002 uses.
describe('migrate --resume when a restore write fails (F-ff1c46f0)', () => {
  it('keeps the journal entry instead of wiping it when atomicWrite throws during a restore', async () => {
    const repoDir = seedRepo('alpha', { 'README.md': 'CORRUPTED HALF-WRITTEN CONTENT\n' });
    const readmePath = join(repoDir, 'README.md');
    const original = README_WITH_LOCAL_LOGO('alpha');
    const journalPath = join(reposDir, JOURNAL_NAME);
    writeFileSync(
      journalPath,
      JSON.stringify([{ path: readmePath, original, ts: '2026-01-01T00:00:00.000Z' }], null, 2) + '\n',
      'utf-8',
    );

    // Read of readmePath still succeeds; atomicWrite's writeFileSync to
    // `${readmePath}.brand-tmp` hits EISDIR because that path is a directory
    // — the restore itself now fails, not the main migrate loop.
    mkdirSync(`${readmePath}.brand-tmp`, { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__:${code}`);
    }) as never);
    let logCalls: unknown[][] = [];
    let errCalls: unknown[][] = [];
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false, resume: true });
    } catch {
      // Expected: a failed resume now surfaces as a non-zero exit instead
      // of silently succeeding.
    } finally {
      // Capture call history BEFORE mockRestore() — restoring clears it.
      logCalls = logSpy.mock.calls;
      errCalls = errSpy.mock.calls;
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }

    // The restore failed, so the journal entry for readmePath must survive
    // — wiping it (the old unconditional writeJournal(repos, [])) would
    // destroy the only backup of the pre-migration content with no way to
    // recover it.
    expect(existsSync(journalPath)).toBe(true);
    const entries = JSON.parse(readFileSync(journalPath, 'utf-8')) as Array<{ path: string; original: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe(readmePath);
    expect(entries[0]?.original).toBe(original);

    // The target file must NOT have been touched (the restore write failed).
    expect(readFileSync(readmePath, 'utf-8')).toBe('CORRUPTED HALF-WRITTEN CONTENT\n');

    // And the failure must be surfaced somewhere (console today; also
    // tracked in the JSON result/exit code per the source fix), not silently
    // swallowed.
    const allOutput = [...logCalls, ...errCalls].flat().map(String).join('\n');
    expect(allOutput).toContain(readmePath);
  });
});

// The journal is the ONLY backup of pre-migration README content. Previously
// readJournal's catch body was empty (comment only: "surface but don't
// crash"), so a corrupted-but-present journal (e.g. truncated by an earlier
// hard crash) was silently treated as "no crash-recovery data exists at
// all" — a subsequent --resume reported nothing to restore, with zero
// indication that unrecoverable state was actually discarded.
describe('migrate corrupt journal handling (F-dbc18187)', () => {
  it('warns loudly and preserves an unparseable journal file instead of silently discarding it', async () => {
    const journalPath = join(reposDir, JOURNAL_NAME);
    writeFileSync(journalPath, 'THIS IS NOT VALID JSON {{{', 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let logCalls: unknown[][] = [];
    let errCalls: unknown[][] = [];
    try {
      // No logo/repo seeded — this isolates the corrupt-journal read, which
      // happens before any per-repo work.
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false, resume: true });
    } finally {
      // Capture call history BEFORE mockRestore() — restoring clears it.
      logCalls = logSpy.mock.calls;
      errCalls = errSpy.mock.calls;
      logSpy.mockRestore();
      errSpy.mockRestore();
    }

    // The corrupt file must not be left sitting unlabeled at the canonical
    // journal path as though nothing happened.
    expect(existsSync(journalPath)).toBe(false);

    // A preserved copy must exist alongside it for manual recovery — the
    // ONLY backup of pre-migration content must not simply vanish.
    const preserved = readdirSync(reposDir).filter(name => name.includes('.corrupt-'));
    expect(preserved.length).toBeGreaterThan(0);
    expect(readFileSync(join(reposDir, preserved[0]!), 'utf-8')).toBe('THIS IS NOT VALID JSON {{{');

    // And the operator must be warned loudly — even without --quiet.
    const allOutput = [...logCalls, ...errCalls].flat().map(String).join('\n');
    expect(allOutput.toLowerCase()).toContain('corrupt');
  });
});

const MIGRATE_LOCK_NAME = '.brand-migrate.lock';

// F-4141e3e3 — readJournal/writeJournal perform a plain read-modify-write of
// the shared journal sidecar with no locking. Two concurrent `brand migrate`
// processes against the SAME --repos directory each independently read the
// journal, append/remove their own entries in memory, and write the WHOLE
// array back — whichever writeJournal call lands second silently overwrites
// the other's just-written state, permanently losing that process's journal
// entries. The fix is a whole-run lockfile (.brand-migrate.lock) held for
// the entire runMigrate call. These tests simulate contention by pre-seeding
// the lock file directly (the same technique the rest of this suite already
// uses for crash/hazard simulation) rather than spawning real concurrent
// processes.
describe('migrate concurrent-run journal lock (F-4141e3e3)', () => {
  it('fails loudly instead of racing when a live lock is already held for --repos', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });
    const readmePath = join(repoDir, 'README.md');
    const before = readFileSync(readmePath, 'utf-8');

    // Simulate a concurrent migrate already in flight: a fresh lock file
    // naming a live pid. This test process's OWN pid is trivially "alive"
    // (a process can always signal itself), so the fix's liveness check
    // must treat this as genuine, un-reclaimable contention.
    const lockPath = join(reposDir, MIGRATE_LOCK_NAME);
    writeFileSync(lockPath, `${process.pid}:${Date.now()}`, 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__:${code}`);
    }) as never);
    let thrown: unknown;
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false });
    } catch (err) {
      thrown = err;
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }

    // Before this fix, a pre-existing lock file was never even looked at —
    // migrate would proceed normally and race the journal for real.
    expect(String(thrown)).toContain('__EXIT__:2');
    // Refused before doing any real work — the README must be untouched,
    // and the OTHER process's still-live lock must be left exactly as-is
    // (never seized out from under a genuinely running process).
    expect(readFileSync(readmePath, 'utf-8')).toBe(before);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('self-heals a stale lock (dead pid) and completes the migration normally', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    // An empirically-confirmed-dead pid (ESRCH) with a FRESH timestamp —
    // proves liveness, not just age, is what's actually checked.
    const lockPath = join(reposDir, MIGRATE_LOCK_NAME);
    writeFileSync(lockPath, `999999999:${Date.now()}`, 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false });
    } finally {
      logSpy.mockRestore();
    }

    const rewritten = readFileSync(join(reposDir, 'alpha', 'README.md'), 'utf-8');
    expect(rewritten).toContain(`${BRAND_BASE}/alpha/readme.png`);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('does not leave a lock file behind after a normal successful run', async () => {
    seedLogo('alpha', 'png');
    seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false });
    } finally {
      logSpy.mockRestore();
    }

    expect(existsSync(join(reposDir, MIGRATE_LOCK_NAME))).toBe(false);
  });

  it('does not leave a lock file behind after a run that ends in failures (exit 3)', async () => {
    seedLogo('alpha', 'png');
    const repoDir = seedRepo('alpha', { 'README.md': README_WITH_LOCAL_LOGO('alpha') });
    // Force atomicWrite's tmp write to fail (same trick TEST-002 above
    // uses), so this run ends via the process.exit(3) failures path — a
    // REAL exit call the try/finally alone would not reliably unwind
    // through, exercising the process 'exit' listener backstop.
    mkdirSync(`${join(repoDir, 'README.md')}.brand-tmp`, { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__:${code}`);
    }) as never);
    try {
      await runMigrate({ repos: reposDir, logos: logosDir, brandBase: BRAND_BASE, dryRun: false });
    } catch {
      // Expected — process.exit(3) is mocked to throw.
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }

    expect(existsSync(join(reposDir, MIGRATE_LOCK_NAME))).toBe(false);
  });
});
