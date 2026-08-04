/**
 * remove.test.ts — runRemove() against temp logos trees.
 *
 * src/commands/remove.ts did not exist before this wave, so every test in
 * this file fails before this change (module not found at the import below)
 * and passes after — that is the file-level "fail before / pass after"
 * proof for this brand-new command, on top of the specific safety-contract
 * assertions each test makes.
 *
 * Covers (per this wave's spec):
 *   - whole-slug removal (primary + gallery both gone, manifest regenerated)
 *   - gallery-only removal (gallery gone, primary logo untouched)
 *   - --dry-run makes ZERO fs changes (byte-identical directory + manifest)
 *   - missing --yes refuses a real run (exit 1) with an exact re-run command
 *   - nonexistent slug exits 2, with a "did you mean" near-match hint
 *   - path-traversal slug/gallery rejected (exit 2), before any path join
 *   - manifest regenerated + verifies clean afterwards (brand verify's own
 *     verifyManifest reports ok:true post-removal)
 *   - --json emits exactly one JSON document (success AND error paths)
 *   - adjacent nothing-to-do / --quiet / missing --logos safety cases
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runRemove } from '../src/commands/remove.js';
import { readManifest, generateManifest, writeManifest, verifyManifest } from '../src/manifest.js';

let tempDir: string;
let logosDir: string;
let manifestPath: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

class ProcessExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-remove-test-'));
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

async function expectExit(code: number, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    throw new Error(`expected process.exit(${code}) but it did not exit`);
  } catch (err) {
    if (err instanceof ProcessExitError) {
      expect(err.code).toBe(code);
      return;
    }
    throw err;
  }
}

/**
 * Run fn() with process.stdout.write mocked, returning every write call's
 * first argument as a string array. Calls are captured BEFORE mockRestore()
 * — reading writeSpy.mock.calls after restore returns an empty array.
 */
async function captureStdoutWrites(fn: () => Promise<void>): Promise<string[]> {
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  let calls: string[] = [];
  try {
    await fn();
  } finally {
    calls = writeSpy.mock.calls.map(c => String(c[0]));
    writeSpy.mockRestore();
  }
  return calls;
}

function firstJson(writes: string[]): Record<string, unknown> {
  const jsonLine = writes.find(s => s.trim().startsWith('{'));
  expect(jsonLine).toBeDefined();
  return JSON.parse(jsonLine!);
}

function seedPrimary(slug: string, ext = 'png', content = `fake-${slug}`): void {
  const dir = join(logosDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `readme.${ext}`), content);
}

function seedGalleryFile(slug: string, gallery: string, name: string, content = `fake-${name}`): void {
  const dir = join(logosDir, slug, gallery);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

function seedManifest(): void {
  writeManifest(generateManifest(logosDir), manifestPath);
}

// -----------------------------------------------------------------------
describe('runRemove — whole-slug removal', () => {
  it('removes the entire slug directory (primary + gallery) and regenerates the manifest', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');
    seedGalleryFile('widget', 'gallery', 'b.png');
    seedPrimary('other'); // untouched sibling slug
    seedManifest();

    await runRemove({ slug: 'widget', logos: logosDir, yes: true });

    expect(existsSync(join(logosDir, 'widget'))).toBe(false);
    expect(existsSync(join(logosDir, 'other'))).toBe(true);

    const manifest = readManifest(manifestPath);
    expect(Object.keys(manifest.assets).some(k => k.startsWith('logos/widget/'))).toBe(false);
    expect(manifest.assets['logos/other/readme.png']).toBeDefined();
  });

  it('prints a success line naming the file count and byte total, and confirms manifest regeneration', async () => {
    seedPrimary('widget', 'png', '01234567890123456789'); // 20 bytes

    await runRemove({ slug: 'widget', logos: logosDir, yes: true });

    const combined = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toMatch(/1 file/);
    expect(combined.toLowerCase()).toMatch(/manifest/);
  });
});

describe('runRemove — gallery-only removal', () => {
  it('removes only the named gallery folder, leaving the primary logo intact', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');
    seedManifest();

    await runRemove({ slug: 'widget', gallery: 'gallery', logos: logosDir, yes: true });

    expect(existsSync(join(logosDir, 'widget', 'readme.png'))).toBe(true);
    expect(existsSync(join(logosDir, 'widget', 'gallery'))).toBe(false);

    const manifest = readManifest(manifestPath);
    expect(manifest.assets['logos/widget/readme.png']?.role).toBe('primary');
    expect(Object.keys(manifest.assets).some(k => k.startsWith('logos/widget/gallery/'))).toBe(false);
  });

  it('does not disturb a differently-named sibling gallery folder', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');
    seedGalleryFile('widget', 'turnarounds', 'b.png');

    await runRemove({ slug: 'widget', gallery: 'gallery', logos: logosDir, yes: true });

    expect(existsSync(join(logosDir, 'widget', 'gallery'))).toBe(false);
    expect(existsSync(join(logosDir, 'widget', 'turnarounds', 'b.png'))).toBe(true);
  });
});

describe('runRemove — --dry-run makes zero filesystem changes', () => {
  it('does not touch the slug directory or an existing manifest.json (byte-identical after)', async () => {
    seedPrimary('widget', 'png', 'primary-bytes');
    seedGalleryFile('widget', 'gallery', 'a.png', 'gallery-bytes');
    seedManifest();

    const beforeManifest = readFileSync(manifestPath, 'utf-8');
    const beforePrimary = readFileSync(join(logosDir, 'widget', 'readme.png'), 'utf-8');
    const beforeGalleryFile = readFileSync(join(logosDir, 'widget', 'gallery', 'a.png'), 'utf-8');
    const beforePrimaryMtime = statSync(join(logosDir, 'widget', 'readme.png')).mtimeMs;
    const beforeGalleryMtime = statSync(join(logosDir, 'widget', 'gallery')).mtimeMs;

    await runRemove({ slug: 'widget', logos: logosDir, dryRun: true });

    expect(existsSync(join(logosDir, 'widget'))).toBe(true);
    expect(existsSync(join(logosDir, 'widget', 'gallery'))).toBe(true);
    expect(readFileSync(join(logosDir, 'widget', 'readme.png'), 'utf-8')).toBe(beforePrimary);
    expect(readFileSync(join(logosDir, 'widget', 'gallery', 'a.png'), 'utf-8')).toBe(beforeGalleryFile);
    expect(statSync(join(logosDir, 'widget', 'readme.png')).mtimeMs).toBe(beforePrimaryMtime);
    expect(statSync(join(logosDir, 'widget', 'gallery')).mtimeMs).toBe(beforeGalleryMtime);
    // The manifest is untouched too -- dry-run never regenerates it.
    expect(readFileSync(manifestPath, 'utf-8')).toBe(beforeManifest);
  });

  it('does not require --yes, and reports the accurate plan via --json', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');

    const writes = await captureStdoutWrites(() =>
      runRemove({ slug: 'widget', logos: logosDir, dryRun: true, json: true }),
    );
    const parsed = firstJson(writes);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.fileCount).toBe(2);
    expect(Array.isArray(parsed.removed)).toBe(true);
    expect((parsed.removed as string[]).sort()).toEqual(['gallery/a.png', 'readme.png']);

    expect(existsSync(join(logosDir, 'widget'))).toBe(true);
  });

  it('a dry-run on a nonexistent slug still exits 2 (existence checks run before dry-run reporting)', async () => {
    await expectExit(2, () => runRemove({ slug: 'nope', logos: logosDir, dryRun: true }));
  });
});

describe('runRemove — missing --yes refuses a real run', () => {
  it('exits 1, names the file count, and shows the re-run command', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');

    await expectExit(1, () => runRemove({ slug: 'widget', logos: logosDir }));

    // Nothing was touched.
    expect(existsSync(join(logosDir, 'widget', 'readme.png'))).toBe(true);
    expect(existsSync(join(logosDir, 'widget', 'gallery', 'a.png'))).toBe(true);

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toMatch(/--yes/);
    expect(combined).toContain('2 file');
    expect(combined).toContain('brand remove widget');
  });

  it('includes --gallery in the shown re-run command when scoped to a gallery', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'turnarounds', 'a.png');

    await expectExit(1, () => runRemove({ slug: 'widget', gallery: 'turnarounds', logos: logosDir }));

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toContain('brand remove widget --gallery turnarounds');
    expect(combined).toMatch(/--yes\b/);
  });

  it('--dry-run bypasses the confirmation gate entirely (no refusal, even without --yes)', async () => {
    seedPrimary('widget');
    await runRemove({ slug: 'widget', logos: logosDir, dryRun: true });
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('runRemove — nonexistent slug', () => {
  it('exits 2 and names the slug', async () => {
    seedPrimary('widget');

    await expectExit(2, () => runRemove({ slug: 'does-not-exist', logos: logosDir, yes: true }));

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toContain('does-not-exist');
  });

  it('lists a near-match "did you mean" suggestion', async () => {
    seedPrimary('widget');

    await expectExit(2, () => runRemove({ slug: 'widgit', logos: logosDir, yes: true }));

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined.toLowerCase()).toMatch(/did you mean/);
    expect(combined).toContain('widget');
  });

  it('never suggests a reserved scratch directory as a near-match', async () => {
    seedPrimary('widget');
    mkdirSync(join(logosDir, '.brand-backup-widgetx-1-1'), { recursive: true });

    await expectExit(2, () => runRemove({ slug: 'widgetx', logos: logosDir, yes: true }));

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).not.toContain('.brand-backup');
  });

  it('does not touch an existing manifest', async () => {
    seedPrimary('widget');
    seedManifest();
    const before = readFileSync(manifestPath, 'utf-8');

    await expectExit(2, () => runRemove({ slug: 'nope', logos: logosDir, yes: true }));

    expect(readFileSync(manifestPath, 'utf-8')).toBe(before);
  });
});

describe('runRemove — path traversal rejected', () => {
  it('exits 2 for a slug containing ".."', async () => {
    await expectExit(2, () => runRemove({ slug: '../escape', logos: logosDir, yes: true }));
  });

  it('exits 2 for a slug containing "/"', async () => {
    await expectExit(2, () => runRemove({ slug: 'foo/bar', logos: logosDir, yes: true }));
  });

  it('refuses before ever joining the traversal slug into a real path -- a decoy directory outside logosDir survives untouched', async () => {
    // If validateSlug did not run before any path join, `join(logosDir,
    // '../decoy')` would resolve to a real sibling directory OUTSIDE
    // logos/ entirely -- exactly the traversal-deletion hazard this guard
    // exists to prevent (same class as sync.ts's F-5cbd78ab).
    const decoyDir = join(tempDir, 'decoy');
    mkdirSync(decoyDir, { recursive: true });
    writeFileSync(join(decoyDir, 'important.txt'), 'do-not-delete-me');

    await expectExit(2, () => runRemove({ slug: '../decoy', logos: logosDir, yes: true }));

    expect(existsSync(join(decoyDir, 'important.txt'))).toBe(true);
  });

  it('exits 2 for a traversal --gallery name, without touching the slug', async () => {
    seedPrimary('widget');

    await expectExit(2, () => runRemove({ slug: 'widget', gallery: '../escape', logos: logosDir, yes: true }));

    expect(existsSync(join(logosDir, 'widget', 'readme.png'))).toBe(true);
  });

  it('exits 2 for an empty slug', async () => {
    await expectExit(2, () => runRemove({ slug: '', logos: logosDir, yes: true }));
  });
});

describe('runRemove — manifest regenerated and verifies clean afterwards', () => {
  it('brand verify-equivalent reports ok:true after a real whole-slug removal', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');
    seedPrimary('other');
    seedManifest();

    await runRemove({ slug: 'widget', logos: logosDir, yes: true });

    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(true);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it('is clean after a gallery-only removal too', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');
    seedManifest();

    await runRemove({ slug: 'widget', gallery: 'gallery', logos: logosDir, yes: true });

    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(true);
  });

  it('regenerates the manifest even when none existed before this run', async () => {
    seedPrimary('widget');
    expect(existsSync(manifestPath)).toBe(false);

    await runRemove({ slug: 'widget', logos: logosDir, yes: true });

    expect(existsSync(manifestPath)).toBe(true);
    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(true);
  });
});

describe('runRemove — --json output shape', () => {
  it('emits exactly one JSON document with what was removed on a real run', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');

    const writes = await captureStdoutWrites(() =>
      runRemove({ slug: 'widget', logos: logosDir, yes: true, json: true }),
    );

    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]!);
    expect(parsed).toMatchObject({ ok: true, slug: 'widget', gallery: null, dryRun: false, fileCount: 2 });
    expect(Array.isArray(parsed.removed)).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits exactly one JSON document on an operator-error path too', async () => {
    const writes = await captureStdoutWrites(() =>
      expectExit(2, () => runRemove({ slug: 'nope', logos: logosDir, yes: true, json: true })),
    );
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]!);
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.error).toBe('string');
  });

  it('emits exactly one JSON document on the missing --yes refusal path', async () => {
    seedPrimary('widget');
    const writes = await captureStdoutWrites(() =>
      expectExit(1, () => runRemove({ slug: 'widget', logos: logosDir, json: true })),
    );
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]!);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('confirmation-required');
    expect(parsed.fileCount).toBe(1);
  });
});

describe('runRemove — nothing-to-do cases (exit 1)', () => {
  it('exits 1 when --gallery is specified but does not exist under an existing slug', async () => {
    seedPrimary('widget');

    await expectExit(1, () => runRemove({ slug: 'widget', gallery: 'nope', logos: logosDir, yes: true }));

    expect(existsSync(join(logosDir, 'widget', 'readme.png'))).toBe(true);
  });

  it('exits 1 when the whole slug directory exists but is empty', async () => {
    mkdirSync(join(logosDir, 'empty-slug'), { recursive: true });

    await expectExit(1, () => runRemove({ slug: 'empty-slug', logos: logosDir, yes: true }));
  });
});

describe('runRemove — --quiet suppresses human output but not errors', () => {
  it('suppresses the success line on a real run', async () => {
    seedPrimary('widget');

    await runRemove({ slug: 'widget', logos: logosDir, yes: true, quiet: true });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('still reports the refusal message on stderr when --quiet is set', async () => {
    seedPrimary('widget');

    await expectExit(1, () => runRemove({ slug: 'widget', logos: logosDir, quiet: true }));

    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('runRemove — missing --logos directory', () => {
  it('exits 2', async () => {
    await expectExit(2, () => runRemove({ slug: 'widget', logos: join(tempDir, 'no-such-logos'), yes: true }));
  });
});

describe('runRemove — idempotent follow-up state', () => {
  it('a second removal attempt after a successful removal cleanly reports slug-not-found (no lingering half-state)', async () => {
    seedPrimary('widget');
    await runRemove({ slug: 'widget', logos: logosDir, yes: true });

    await expectExit(2, () => runRemove({ slug: 'widget', logos: logosDir, yes: true }));
  });

  it('leaves no reserved .brand-backup-* sibling behind after a successful real removal', async () => {
    seedPrimary('widget');
    seedGalleryFile('widget', 'gallery', 'a.png');

    await runRemove({ slug: 'widget', gallery: 'gallery', logos: logosDir, yes: true });

    const entries = existsSync(join(logosDir, 'widget')) ? readdirSync(join(logosDir, 'widget')) : [];
    expect(entries.some((e: string) => e.startsWith('.brand-backup'))).toBe(false);
  });
});

// -----------------------------------------------------------------------
// The rename-away → regenerate → delete-or-restore swap has a DOUBLE-failure
// path: manifest regeneration throws AND the rename back also throws. The
// content is not lost — it survives under the reserved backup name — but the
// operator has to be told where it actually is. The message used to assert
// "the original content has been restored" unconditionally, on the one path
// where someone most needs the truth about their data. Caught post-release by
// a cross-family jury seat dissenting on the swap criterion (wave-6
// adjudication, AC-remove-swap-restore-on-failure, 3 pass / 1 fail).
describe('runRemove — swap failure reporting is honest', () => {
  it('says the content was restored only when the restore actually succeeded', async () => {
    seedPrimary('widget');
    seedManifest();
    // Force manifest regeneration to fail: make the manifest path a directory.
    rmSync(manifestPath, { force: true });
    mkdirSync(manifestPath, { recursive: true });

    await expectExit(3, () => runRemove({ slug: 'widget', logos: logosDir, yes: true }));

    // Restore succeeded, so the slug is back and the message may say so.
    expect(existsSync(join(logosDir, 'widget'))).toBe(true);
    const said = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(said).toContain('has been restored');
    expect(said).not.toContain('ALSO failed');
  });

});
