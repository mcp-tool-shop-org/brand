/**
 * global-setup.ts — Suite-wide setup/teardown.
 *
 * Closes F-TESTS-B-009 + F-TESTS-B-012: scans os.tmpdir() for stale
 * `brand-*-test-*` directories left behind by prior aborted runs (Windows
 * file locks, kill -9, IDE-killed test runners) and removes them.
 *
 * Runs once at suite START (in case the previous run died mid-flight) and
 * once at suite END (catches anything the per-file afterEach missed).
 *
 * Failures are LOGGED, not thrown — a stale temp directory is observability
 * feedback, not a reason to fail the build. The signal is the warning line.
 */

import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PATTERN = /^brand-[a-zA-Z0-9-]+-test-/;

async function sweepStale(label: string): Promise<void> {
  const dir = tmpdir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  let cleaned = 0;
  let failures = 0;

  for (const entry of entries) {
    if (!PATTERN.test(entry)) continue;
    const fullPath = join(dir, entry);
    try {
      const s = await stat(fullPath);
      if (!s.isDirectory()) continue;
      await rm(fullPath, { recursive: true, force: true });
      cleaned++;
    } catch (err) {
      failures++;
      // Cleanup failure is signal, not abort.
      // eslint-disable-next-line no-console
      console.warn(
        `[global-${label}] failed to remove ${fullPath}: ${(err as Error).message}`
      );
    }
  }

  if (cleaned > 0 || failures > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[global-${label}] swept ${cleaned} stale brand-*-test-* dir(s), ${failures} failure(s)`
    );
  }
}

export async function setup(): Promise<void> {
  await sweepStale('setup');
}

export async function teardown(): Promise<void> {
  await sweepStale('teardown');
}
