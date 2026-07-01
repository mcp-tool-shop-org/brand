/**
 * add-gallery tests — runAddGallery() against temp logos/source-dir trees.
 *
 * Covers:
 *   - fresh gallery creation (files copied, manifest regenerated, role/gallery fields correct)
 *   - re-run with an added file (only the new file appears as "added")
 *   - re-run with a removed file (target folder loses it, reported as "removed")
 *   - re-run with a changed file (content-hash comparison catches it even if mtime is identical)
 *   - --order with a complete valid list (numeric-prefix renaming + natural-sort order)
 *   - --order with a missing/extra filename (exit 2, clear message)
 *   - non-image files in source-dir silently skipped
 *   - a subdirectory in source-dir skipped with a warning (not recursed)
 *   - --dry-run makes zero fs changes
 *   - --json output shape
 *   - invalid slug / nonexistent source-dir (exit 2)
 *   - the pre-existing pirate-raiders-3d-2/turnarounds folder is untouched unless targeted
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
  utimesSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAddGallery } from '../src/commands/add-gallery.js';
import { readManifest } from '../src/manifest.js';

let tempDir: string;
let logosDir: string;
let sourceDir: string;
let manifestPath: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-add-gallery-test-'));
  logosDir = join(tempDir, 'logos');
  sourceDir = join(tempDir, 'source');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
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

class ProcessExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

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
 * — reading writeSpy.mock.calls after restore returns an empty array, since
 * restore resets the mock's call history.
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

/** Find + parse the first JSON object among captured stdout writes. */
function firstJson(writes: string[]): Record<string, unknown> {
  const jsonLine = writes.find(s => s.trim().startsWith('{'));
  expect(jsonLine).toBeDefined();
  return JSON.parse(jsonLine!);
}

function seedSourceFile(name: string, content = `fake-${name}`): void {
  writeFileSync(join(sourceDir, name), content);
}

function listTargetFiles(slug: string, gallery = 'gallery'): string[] {
  const dir = join(logosDir, slug, gallery);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

describe('runAddGallery — fresh gallery creation', () => {
  it('copies image files into logos/<slug>/gallery/ and regenerates the manifest with correct role/gallery fields', async () => {
    seedSourceFile('a.png');
    seedSourceFile('b.png');

    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const files = listTargetFiles('widget');
    expect(files).toEqual(['a.png', 'b.png']);

    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readManifest(manifestPath);
    expect(manifest.assets['logos/widget/gallery/a.png']?.role).toBe('gallery');
    expect(manifest.assets['logos/widget/gallery/a.png']?.gallery).toBe('gallery');
    expect(manifest.assets['logos/widget/gallery/b.png']?.role).toBe('gallery');
  });

  it('defaults gallery name to "gallery"', async () => {
    seedSourceFile('x.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });
    expect(existsSync(join(logosDir, 'widget', 'gallery', 'x.png'))).toBe(true);
  });

  it('respects a custom --gallery-name', async () => {
    seedSourceFile('x.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, galleryName: 'turnarounds' });
    expect(existsSync(join(logosDir, 'widget', 'turnarounds', 'x.png'))).toBe(true);
    expect(existsSync(join(logosDir, 'widget', 'gallery'))).toBe(false);
  });

  it('prints the final gallery image count and confirms manifest regeneration on real run', async () => {
    seedSourceFile('a.png');
    seedSourceFile('b.png');

    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const combined = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toMatch(/2/); // count appears somewhere
    expect(combined.toLowerCase()).toMatch(/manifest/);
  });
});

describe('runAddGallery — idempotent reconciliation', () => {
  it('re-run with an added file (via --json) reports only the new file as added', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    seedSourceFile('b.png');
    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, json: true })
    );

    const parsed = firstJson(writes);
    expect(parsed.added).toEqual(['b.png']);
    expect(parsed.updated).toEqual([]);
    expect(parsed.removed).toEqual([]);
    expect(listTargetFiles('widget')).toEqual(['a.png', 'b.png']);
  });

  it('re-run with a removed file: target folder loses it and it is reported as removed', async () => {
    seedSourceFile('a.png');
    seedSourceFile('b.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });
    expect(listTargetFiles('widget')).toEqual(['a.png', 'b.png']);

    rmSync(join(sourceDir, 'b.png'));

    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, json: true })
    );

    const parsed = firstJson(writes);
    expect(parsed.removed).toEqual(['b.png']);
    expect(listTargetFiles('widget')).toEqual(['a.png']);
  });

  it('re-run with a changed file: content-hash comparison catches it as updated even if mtime is identical', async () => {
    seedSourceFile('a.png', 'original-content');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const targetPath = join(logosDir, 'widget', 'gallery', 'a.png');
    const beforeStat = readFileSync(targetPath, 'utf-8');
    expect(beforeStat).toBe('original-content');

    // Change content but force the same mtime as the (already-copied) target
    // file, proving comparison is by hash and not mtime.
    writeFileSync(join(sourceDir, 'a.png'), 'CHANGED-content');
    const targetTimes = statSync(targetPath);
    utimesSync(join(sourceDir, 'a.png'), targetTimes.atime, targetTimes.mtime);

    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, json: true })
    );

    const parsed = firstJson(writes);
    expect(parsed.updated).toEqual(['a.png']);

    const afterContent = readFileSync(targetPath, 'utf-8');
    expect(afterContent).toBe('CHANGED-content');
  });

  it('reports "nothing to do" when re-run against an unchanged source-dir', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, json: true })
    );

    const parsed = firstJson(writes);
    expect(parsed.added).toEqual([]);
    expect(parsed.updated).toEqual([]);
    expect(parsed.removed).toEqual([]);
    expect(parsed.ok).toBe(true);
  });
});

describe('runAddGallery — --order', () => {
  it('applies zero-padded numeric-prefix renaming so natural sort matches the requested order', async () => {
    seedSourceFile('zebra.png');
    seedSourceFile('apple.png');
    seedSourceFile('mango.png');

    await runAddGallery({
      slug: 'widget',
      sourceDir,
      logos: logosDir,
      order: 'zebra.png,apple.png,mango.png',
    });

    const files = listTargetFiles('widget');
    expect(files).toEqual(['1-zebra.png', '2-apple.png', '3-mango.png']);
    // Natural sort of the target dir reproduces the requested order.
    const naturallySorted = [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    expect(naturallySorted).toEqual(files);
  });

  it('zero-pads the numeric prefix width for >=10 files', async () => {
    const names = Array.from({ length: 11 }, (_, i) => `img${i}.png`);
    for (const n of names) seedSourceFile(n);

    await runAddGallery({
      slug: 'widget',
      sourceDir,
      logos: logosDir,
      order: names.join(','),
    });

    const files = listTargetFiles('widget');
    expect(files[0]).toBe('01-img0.png');
    expect(files[10]).toBe('11-img10.png');
  });

  it('exits 2 with a clear message when --order references a filename not in source-dir', async () => {
    seedSourceFile('a.png');
    seedSourceFile('b.png');

    await expectExit(2, () =>
      runAddGallery({
        slug: 'widget',
        sourceDir,
        logos: logosDir,
        order: 'a.png,b.png,nonexistent.png',
      })
    );

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toMatch(/nonexistent\.png/);
  });

  it('exits 2 with a clear message when --order is a partial list missing image files from source-dir', async () => {
    seedSourceFile('a.png');
    seedSourceFile('b.png');
    seedSourceFile('c.png');

    await expectExit(2, () =>
      runAddGallery({
        slug: 'widget',
        sourceDir,
        logos: logosDir,
        order: 'a.png,b.png',
      })
    );

    const combined = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toMatch(/c\.png/);
    expect(combined.toLowerCase()).toMatch(/partial|missing/);
  });
});

describe('runAddGallery — natural sort default (no --order)', () => {
  it('uses natural/numeric-aware sort, not string-lexical, for default copy/display order', async () => {
    seedSourceFile('image9.png');
    seedSourceFile('image10.png');
    seedSourceFile('image1.png');

    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, json: true })
    );

    const parsed = firstJson(writes);
    // Natural sort: image1, image9, image10 (NOT lexical image1, image10, image9).
    expect(parsed.added).toEqual(['image1.png', 'image9.png', 'image10.png']);
  });
});

describe('runAddGallery — non-image and subdirectory handling', () => {
  it('silently skips non-image files in source-dir (informational note, not an error)', async () => {
    seedSourceFile('a.png');
    seedSourceFile('notes.txt');
    seedSourceFile('.DS_Store');

    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    expect(listTargetFiles('widget')).toEqual(['a.png']);
    // Not an error — exit code path never triggered (no throw), and the run succeeded.
  });

  it('skips a subdirectory in source-dir with a warning, without recursing into it', async () => {
    seedSourceFile('a.png');
    mkdirSync(join(sourceDir, 'nested'));
    writeFileSync(join(sourceDir, 'nested', 'deep.png'), 'deep-content');

    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    expect(listTargetFiles('widget')).toEqual(['a.png']);

    const combined = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined.toLowerCase()).toMatch(/subdirector/);
    expect(combined).toContain('nested');
  });
});

describe('runAddGallery — --dry-run', () => {
  it('makes zero filesystem changes and exits 0', async () => {
    seedSourceFile('a.png');
    seedSourceFile('b.png');

    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, dryRun: true });

    expect(existsSync(join(logosDir, 'widget'))).toBe(false);
    expect(existsSync(manifestPath)).toBe(false);
  });

  it('reports what would be added without touching disk on a re-run scenario', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    seedSourceFile('b.png');
    rmSync(join(sourceDir, 'a.png'));
    seedSourceFile('c.png');

    const beforeFiles = listTargetFiles('widget');

    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, dryRun: true, json: true })
    );

    const parsed = firstJson(writes);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.added.sort()).toEqual(['b.png', 'c.png']);
    expect(parsed.removed).toEqual(['a.png']);

    // Disk unchanged.
    expect(listTargetFiles('widget')).toEqual(beforeFiles);
  });
});

describe('runAddGallery — --json output shape', () => {
  it('emits exactly one JSON object with the documented shape on stdout', async () => {
    seedSourceFile('a.png');

    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, json: true })
    );

    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]!);
    expect(parsed).toMatchObject({
      ok: true,
      slug: 'widget',
      gallery: 'gallery',
      dryRun: false,
    });
    expect(Array.isArray(parsed.added)).toBe(true);
    expect(Array.isArray(parsed.updated)).toBe(true);
    expect(Array.isArray(parsed.removed)).toBe(true);

    // Nothing else on stdout (console.log must be suppressed in --json mode).
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('runAddGallery — operator errors (exit 2)', () => {
  it('exits 2 for an invalid slug containing "/"', async () => {
    seedSourceFile('a.png');
    await expectExit(2, () => runAddGallery({ slug: 'foo/bar', sourceDir, logos: logosDir }));
  });

  it('exits 2 for an invalid slug containing ".."', async () => {
    seedSourceFile('a.png');
    await expectExit(2, () => runAddGallery({ slug: '../escape', sourceDir, logos: logosDir }));
  });

  it('exits 2 for an empty slug', async () => {
    seedSourceFile('a.png');
    await expectExit(2, () => runAddGallery({ slug: '', sourceDir, logos: logosDir }));
  });

  it('exits 2 when source-dir does not exist', async () => {
    await expectExit(2, () =>
      runAddGallery({ slug: 'widget', sourceDir: join(tempDir, 'does-not-exist'), logos: logosDir })
    );
  });

  it('exits 2 when source-dir is a file, not a directory', async () => {
    const filePath = join(tempDir, 'not-a-dir');
    writeFileSync(filePath, 'nope');
    await expectExit(2, () => runAddGallery({ slug: 'widget', sourceDir: filePath, logos: logosDir }));
  });

  it('emits a JSON error object with ok=false when --json is set and an operator error occurs', async () => {
    const writes = await captureStdoutWrites(() =>
      expectExit(2, () =>
        runAddGallery({ slug: 'widget', sourceDir: join(tempDir, 'nope'), logos: logosDir, json: true })
      )
    );

    const parsed = JSON.parse(writes[0]!);
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.error).toBe('string');
  });
});

describe('runAddGallery — pre-existing hand-created gallery folders are untouched unless targeted', () => {
  it('does not rename or touch an existing "turnarounds" folder when --gallery-name defaults to "gallery"', async () => {
    // Simulate the pre-existing pirate-raiders-3d-2 layout: a hand-created
    // turnarounds/ folder that predates this command.
    const turnaroundsDir = join(logosDir, 'pirate-raiders-3d-2', 'turnarounds');
    mkdirSync(turnaroundsDir, { recursive: true });
    writeFileSync(join(turnaroundsDir, 'captain.png'), 'existing-captain');

    seedSourceFile('new-art.png');
    await runAddGallery({ slug: 'pirate-raiders-3d-2', sourceDir, logos: logosDir });

    // turnarounds/ must be completely untouched.
    expect(readdirSync(turnaroundsDir)).toEqual(['captain.png']);
    expect(readFileSync(join(turnaroundsDir, 'captain.png'), 'utf-8')).toBe('existing-captain');

    // The new default-name gallery was created alongside it.
    expect(listTargetFiles('pirate-raiders-3d-2', 'gallery')).toEqual(['new-art.png']);
  });

  it('only reconciles turnarounds/ when explicitly targeted with --gallery-name turnarounds', async () => {
    const turnaroundsDir = join(logosDir, 'pirate-raiders-3d-2', 'turnarounds');
    mkdirSync(turnaroundsDir, { recursive: true });
    writeFileSync(join(turnaroundsDir, 'captain.png'), 'old-captain-content');

    seedSourceFile('captain.png', 'new-captain-content');
    await runAddGallery({
      slug: 'pirate-raiders-3d-2',
      sourceDir,
      logos: logosDir,
      galleryName: 'turnarounds',
    });

    expect(readFileSync(join(turnaroundsDir, 'captain.png'), 'utf-8')).toBe('new-captain-content');
  });
});
