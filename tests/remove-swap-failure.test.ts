/**
 * The DOUBLE-failure path of `brand remove`'s swap, isolated in its own file.
 *
 * `remove` deletes by rename-away → regenerate manifest → delete-or-restore.
 * If regeneration throws it renames the backup back. If THAT also throws, the
 * content is not lost — it survives under the reserved `.brand-backup-*` name —
 * but the operator has to be told where it actually is.
 *
 * The message used to read "the original content has been restored"
 * unconditionally, asserting an outcome it never checked, on the one path where
 * someone most needs the truth about their data. Caught post-release by a
 * cross-family jury seat dissenting on the swap criterion (wave-6 adjudication,
 * `AC-remove-swap-restore-on-failure`, 3 pass / 1 fail — the majority was right
 * about the letter of the criterion, the dissenter was right that something was
 * wrong next to it).
 *
 * Why a separate file: forcing the second rename to fail needs `renameSync`
 * replaced, and ESM module namespaces are not configurable — `vi.spyOn` on a
 * named export throws "Cannot redefine property". `vi.mock` is hoisted and
 * applies to the whole module graph for the file, so it is scoped here rather
 * than contaminating the main suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Fail the rename BACK (backup → target) while letting the rename AWAY through.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: actual,
    renameSync: (from: import('node:fs').PathLike, to: import('node:fs').PathLike) => {
      if (String(from).includes('.brand-backup')) {
        throw Object.assign(new Error('EPERM: simulated restore failure'), { code: 'EPERM' });
      }
      return actual.renameSync(from, to);
    },
  };
});

class ProcessExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

let tempDir: string;
let logosDir: string;
let manifestPath: string;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-swapfail-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('runRemove — restore also fails', () => {
  it('names the recovery path instead of claiming a restore that did not happen', async () => {
    const { runRemove } = await import('../src/commands/remove.js');
    const { generateManifest, writeManifest } = await import('../src/manifest.js');

    mkdirSync(join(logosDir, 'widget'), { recursive: true });
    writeFileSync(join(logosDir, 'widget', 'readme.png'), 'fake-png');
    writeManifest(generateManifest(logosDir), manifestPath);

    // Force manifest regeneration to fail: the manifest path becomes a directory.
    rmSync(manifestPath, { force: true });
    mkdirSync(manifestPath, { recursive: true });

    let exitCode = -1;
    try {
      await runRemove({ slug: 'widget', logos: logosDir, yes: true });
    } catch (err) {
      if (err instanceof ProcessExitError) exitCode = err.code;
      else throw err;
    }
    expect(exitCode).toBe(3);

    const said = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    // The claim it must NOT make.
    expect(said).not.toMatch(/content has been restored\./);
    // The truth it must state, with somewhere to go.
    expect(said).toContain('ALSO failed');
    expect(said).toContain('Nothing was lost');
    expect(said).toMatch(/\.brand-backup/);

    // And the content really is where the message says it is.
    expect(existsSync(join(logosDir, 'widget'))).toBe(false);
  });
});
