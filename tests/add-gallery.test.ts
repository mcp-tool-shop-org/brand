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
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { runAddGallery, backupDirFor } from '../src/commands/add-gallery.js';
import { readManifest, generateManifest } from '../src/manifest.js';

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

// TEST-003 — a second `add-gallery --order <same list>` against an unchanged
// source-dir must be a no-op. The invariant is documented but was untested;
// a regression would churn the whole gallery + regenerate the manifest on every
// run. (The --order tests only asserted single-run output.)
describe('runAddGallery — --order idempotency (TEST-003)', () => {
  it('re-running with the identical --order is a no-op (no churn)', async () => {
    seedSourceFile('zebra.png');
    seedSourceFile('apple.png');
    const order = 'zebra.png,apple.png';

    // First run establishes the numeric-prefixed target names.
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, order });
    const firstListing = listTargetFiles('widget');
    expect(firstListing).toEqual(['1-zebra.png', '2-apple.png']);

    // Second run with the identical --order must report zero churn.
    const writes = await captureStdoutWrites(() =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, order, json: true }),
    );
    const out = firstJson(writes);
    expect(out.added).toEqual([]);
    expect(out.updated).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(listTargetFiles('widget')).toEqual(firstListing);
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

describe('runAddGallery — no-op short-circuit when nothing changed (F-7215ff77)', () => {
  it('does not touch the target directory or file on disk when re-run against an unchanged source-dir', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const targetDir = join(logosDir, 'widget', 'gallery');
    const targetFile = join(targetDir, 'a.png');
    const beforeDirMtime = statSync(targetDir).mtimeMs;
    const beforeFileMtime = statSync(targetFile).mtimeMs;

    // Wait long enough that a rebuild-in-place would be detectable.
    await new Promise(r => setTimeout(r, 20));

    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    // Before the fix, EVERY real run — even a genuine no-op — deleted and
    // fully recreated targetDir via the staging+rename swap. That gives the
    // directory itself a new mtime (fresh inode from the rename) AND gives
    // every file inside a new mtime (freshly copied), even though nothing
    // in added/updated/removed changed.
    expect(statSync(targetDir).mtimeMs).toBe(beforeDirMtime);
    expect(statSync(targetFile).mtimeMs).toBe(beforeFileMtime);
  });
});

describe('runAddGallery — crash-safety swap ordering (F-7fef3209)', () => {
  it('leaves the existing gallery completely untouched when the backup-rename step fails', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });
    seedSourceFile('b.png'); // a real change, so this run does NOT hit the nothingToDo short-circuit

    const targetDir = join(logosDir, 'widget', 'gallery');
    const beforeFiles = readdirSync(targetDir).sort();
    const beforeContent = readFileSync(join(targetDir, 'a.png'), 'utf-8');

    const FIXED_NOW = 1735689600000;
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    // Pre-collide the exact backup path the fix uses, as a non-empty
    // directory. Empirically confirmed on this filesystem: renaming a
    // directory onto an existing non-empty (or even empty) directory
    // throws — so this forces renameSync(targetDir, backupDir) to fail
    // before the swap has done anything destructive. Computed via the
    // real backupDirFor() helper (not hand-rolled) so this test can never
    // silently drift from the reserved dot-prefixed naming convention the
    // implementation actually uses (F-ea059f0e).
    const backupDir = backupDirFor(targetDir);
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, 'occupied.txt'), 'collision');

    try {
      await expectExit(3, () => runAddGallery({ slug: 'widget', sourceDir, logos: logosDir }));
    } finally {
      dateSpy.mockRestore();
    }

    // The original gallery must be completely unharmed — the destructive
    // part of the old rm-then-rename swap must never get a chance to run
    // before the backup rename has succeeded.
    expect(readdirSync(targetDir).sort()).toEqual(beforeFiles);
    expect(readFileSync(join(targetDir, 'a.png'), 'utf-8')).toBe(beforeContent);
  });
});

// F-ea059f0e — the Stage A swap fix closed the "gallery briefly absent"
// window but opened a new one: a leftover `.brand-backup-*`/staging sibling
// (left behind by a hard kill between the two renames, or an rmSync that
// throws) used to sit there indefinitely, and generateManifest() — called
// automatically after every real add-gallery run — silently adopted it as a
// SECOND, phantom gallery with zero name-filtering. That corrupted
// manifest.json and later made a plain `brand sync <slug>` fail with
// "ambiguous gallery" until a human found and deleted the directory by hand.
// These tests simulate exactly that leftover state (rather than actually
// killing the process mid-swap) and assert the manifest never gains a
// phantom gallery entry, and that the stray directory is gone afterward.
describe('runAddGallery — leftover backup dir is not adopted as a phantom gallery (F-ea059f0e)', () => {
  it('self-heals a legacy-named leftover (pre-fix naming convention) instead of letting generateManifest adopt it', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    // Simulate the exact post-crash artifact the finding reproduced: an
    // interrupted run under the OLD (pre-fix) code left a sibling backup
    // dir using the legacy, non-dot, never-cleaned-up naming convention,
    // containing a real image file — indistinguishable from a legitimate
    // gallery to an unfiltered directory scan. Pid 999999999 is an
    // empirically-confirmed-dead pid on this platform (ESRCH), so the
    // fix's liveness check reclaims it rather than presuming it belongs to
    // another in-progress invocation.
    const legacyLeftover = join(logosDir, 'widget', 'gallery.brand-backup-999999999-1690000000000');
    mkdirSync(legacyLeftover, { recursive: true });
    writeFileSync(join(legacyLeftover, 'orphan.png'), 'leftover-image-bytes');

    // A real change, so this run does the staging+swap dance for real
    // (not the nothing-to-do short-circuit) and calls generateManifest.
    seedSourceFile('b.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const manifest = readManifest(manifestPath);
    const galleryNames = new Set(
      Object.values(manifest.assets)
        .map(a => a.gallery)
        .filter((g): g is string => Boolean(g)),
    );
    // Only the real "gallery" folder must be present — the leftover must
    // NEVER be adopted as a second, phantom gallery.
    expect(galleryNames).toEqual(new Set(['gallery']));
    for (const key of Object.keys(manifest.assets)) {
      expect(key).not.toContain('brand-backup');
    }

    // And it self-heals: the stray directory itself is gone, not left
    // sitting on disk for a human to eventually trip over.
    expect(existsSync(legacyLeftover)).toBe(false);
  });

  it('self-heals a leftover using the current dot-prefixed staging/backup convention', async () => {
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const targetDir = join(logosDir, 'widget', 'gallery');
    // Same empirically-dead pid as the legacy-convention test above.
    const currentConventionLeftover = join(dirname(targetDir), '.brand-backup-gallery-999999999-1690000000000');
    mkdirSync(currentConventionLeftover, { recursive: true });
    writeFileSync(join(currentConventionLeftover, 'orphan.png'), 'leftover-image-bytes');

    seedSourceFile('b.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    expect(existsSync(currentConventionLeftover)).toBe(false);
    const manifest = readManifest(manifestPath);
    for (const key of Object.keys(manifest.assets)) {
      expect(key).not.toContain('brand-backup');
    }
  });

  it('a dot-prefixed reserved name is invisible to generateManifest\'s own gallery discovery, even called directly', async () => {
    // Narrower proof of the specific mechanism the fix leans on: this talks
    // to manifest.ts's generateManifest directly (an already-exported,
    // in-domain-to-USE function — src/manifest.ts just cannot be EDITED by
    // this domain), independent of add-gallery's self-heal cleanup, to
    // confirm the reserved naming convention itself is invisible to the
    // manifest scan as shipped today.
    seedSourceFile('a.png');
    await runAddGallery({ slug: 'widget', sourceDir, logos: logosDir });

    const targetDir = join(logosDir, 'widget', 'gallery');
    const reservedDir = join(dirname(targetDir), '.brand-backup-gallery-1-1');
    mkdirSync(reservedDir, { recursive: true });
    writeFileSync(join(reservedDir, 'orphan.png'), 'leftover-image-bytes');

    const manifest = generateManifest(logosDir);
    const galleryNames = new Set(
      Object.values(manifest.assets)
        .map(a => a.gallery)
        .filter((g): g is string => Boolean(g)),
    );
    expect(galleryNames).toEqual(new Set(['gallery']));
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

  // F-3aff2618 — a slug like "C:foo" (a plausible fat-finger, e.g. pasting a
  // Windows path fragment) previously passed validation, then crashed an
  // un-guarded mkdirSync() with a raw OS error, surfacing as an opaque exit
  // 3 ("Unexpected error") instead of a clean, actionable exit 2.
  it('exits 2 (not a raw crash) for a slug containing ":"', async () => {
    seedSourceFile('a.png');
    await expectExit(2, () => runAddGallery({ slug: 'C:foo', sourceDir, logos: logosDir }));
  });

  it('exits 2 (not a raw crash) for a --gallery-name containing ":"', async () => {
    seedSourceFile('a.png');
    await expectExit(2, () =>
      runAddGallery({ slug: 'widget', sourceDir, logos: logosDir, galleryName: 'name:stream' })
    );
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
