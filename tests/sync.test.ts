/**
 * sync tests — runSync() against temp manifest + repos trees.
 *
 * Covers:
 *   - clean sync (no drift) exit 0
 *   - drift detected in --check exit 1 with a diff summary printed
 *   - actual write in non-check mode updates the file, leaves surrounding
 *     content untouched
 *   - missing README exit 2
 *   - missing marker block exit 2 with an actionable message
 *   - ambiguous gallery (multiple folders, no --gallery) exit 2
 *   - --json output shape
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSync, type SyncOptions } from '../src/commands/sync.js';
import { writeManifest, type Manifest, type AssetEntry } from '../src/manifest.js';

const BRAND_BASE = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos';

let tempDir: string;
let logosDir: string;
let reposDir: string;
let manifestPath: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-sync-test-'));
  logosDir = join(tempDir, 'logos');
  reposDir = join(tempDir, 'repos');
  manifestPath = join(tempDir, 'manifest.json');
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });
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
  readonly code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

async function runAndCaptureExit(opts: SyncOptions): Promise<number> {
  try {
    await runSync(opts);
    return 0;
  } catch (err) {
    if (err instanceof ProcessExitError) return err.code;
    throw err;
  }
}

/** Build a manifest with gallery entries for slug/gallery from a list of filenames. */
function buildManifest(slug: string, gallery: string, filenames: string[]): Manifest {
  const assets: Record<string, AssetEntry> = {};
  for (const f of filenames) {
    assets[`logos/${slug}/${gallery}/${f}`] = {
      hash: `sha256:fake-${f}`,
      size: 100,
      format: 'png',
      role: 'gallery',
      gallery,
    };
  }
  return {
    version: '1.0',
    generated: new Date(0).toISOString(),
    algorithm: 'sha256',
    assets,
  };
}

function seedGalleryFolder(slug: string, gallery: string, filenames: string[]): void {
  const dir = join(logosDir, slug, gallery);
  mkdirSync(dir, { recursive: true });
  for (const f of filenames) {
    writeFileSync(join(dir, f), `fake-${f}`);
  }
}

function seedReadme(slug: string, content: string): string {
  const dir = join(reposDir, slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'README.md');
  writeFileSync(path, content, 'utf-8');
  return path;
}

function baseOpts(overrides: Partial<SyncOptions> = {}): SyncOptions {
  return {
    repos: reposDir,
    slug: 'alpha',
    logos: logosDir,
    manifest: manifestPath,
    brandBase: BRAND_BASE,
    ...overrides,
  };
}

const markerReadme = (slug: string, gallery: string | undefined, inner: string) => {
  const galleryAttr = gallery ? ` gallery="${gallery}"` : '';
  return (
    `# ${slug}\n\nIntro text.\n\n` +
    `<!-- brand:gallery:start slug="${slug}"${galleryAttr} -->\n${inner}\n<!-- brand:gallery:end -->\n\n` +
    `Footer text.\n`
  );
};

describe('runSync — clean sync (no drift)', () => {
  it('exits 0 and reports already-in-sync when README already matches the manifest', async () => {
    const filenames = ['front.png', 'side.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);

    // Pre-render the expected block so the README already matches.
    const images = filenames
      .slice()
      .sort()
      .map((f) => ({ url: `${BRAND_BASE}/alpha/turnarounds/${f}`, alt: f.replace(/\.[^.]+$/, '') }));
    const inner = ['<p align="center">', ...images.map((img) => `  <img src="${img.url}" alt="${img.alt}" width="200">`), '</p>'].join('\n');
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', inner));
    const before = readFileSync(readmePath, 'utf-8');

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(0);

    const after = readFileSync(readmePath, 'utf-8');
    expect(after).toBe(before);
  });
});

describe('runSync — --check drift detection', () => {
  it('exits 1 and prints a diff summary when the README is stale', async () => {
    const filenames = ['front.png', 'side.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);

    seedReadme('alpha', markerReadme('alpha', 'turnarounds', '<p align="center">\n  <img src="old/front.png" alt="front" width="200">\n</p>'));

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds', check: true }));
    expect(code).toBe(1);

    const printed = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
    expect(printed.toLowerCase()).toContain('drift');
  });

  it('does NOT write the file in --check mode', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE CONTENT'));
    const before = readFileSync(readmePath, 'utf-8');

    await runAndCaptureExit(baseOpts({ gallery: 'turnarounds', check: true }));

    const after = readFileSync(readmePath, 'utf-8');
    expect(after).toBe(before);
  });
});

describe('runSync — write mode', () => {
  it('updates the README and leaves content outside the markers untouched', async () => {
    const filenames = ['front.png', 'side.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE CONTENT'));

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(0);

    const after = readFileSync(readmePath, 'utf-8');
    expect(after).toContain('front.png');
    expect(after).toContain('side.png');
    expect(after).not.toContain('STALE CONTENT');
    expect(after).toContain('Intro text.');
    expect(after).toContain('Footer text.');
  });

  it('reports "already in sync" and does not rewrite when nothing changed (idempotent)', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    const afterFirst = readFileSync(readmePath, 'utf-8');

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(0);
    const afterSecond = readFileSync(readmePath, 'utf-8');
    expect(afterSecond).toBe(afterFirst);
  });
});

describe('runSync — operator errors (exit 2)', () => {
  it('exits 2 when the README does not exist', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    // No README seeded.

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(2);
  });

  it('exits 2 with an actionable message when no marker block exists for the slug', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    seedReadme('alpha', '# alpha\n\nNo markers here at all.\n');

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(2);

    const printed = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
    expect(printed).toContain('brand:gallery:start');
    expect(printed).toContain('slug="alpha"');
  });

  it('exits 2 when the gallery is ambiguous (multiple folders, no --gallery flag)', async () => {
    seedGalleryFolder('alpha', 'turnarounds', ['front.png']);
    seedGalleryFolder('alpha', 'poses', ['stand.png']);
    writeManifest(buildManifest('alpha', 'turnarounds', ['front.png']), manifestPath);
    seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'x'));

    const code = await runAndCaptureExit(baseOpts()); // no gallery specified
    expect(code).toBe(2);

    const printed = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
    expect(printed.toLowerCase()).toContain('gallery');
  });

  it('exits 2 when the slug has no gallery folder at all', async () => {
    writeManifest(buildManifest('alpha', 'turnarounds', []), manifestPath);
    // No gallery folder seeded under logosDir/alpha at all.
    seedReadme('alpha', markerReadme('alpha', undefined, 'x'));

    const code = await runAndCaptureExit(baseOpts());
    expect(code).toBe(2);
  });
});

describe('runSync — path traversal / invalid slug (F-5cbd78ab, regression guard F-044cae9d)', () => {
  it('exits 2 for a slug containing ".."', async () => {
    // No manifest/gallery/README seeded at all — validation must reject the
    // slug before any of that is ever touched.
    const code = await runAndCaptureExit(baseOpts({ slug: '../../outside' }));
    expect(code).toBe(2);
  });

  it('refuses a traversal-shaped slug and never writes outside --repos', async () => {
    // Nest repos so the escape has real path segments to walk past.
    const nestedRepos = join(reposDir, 'nested-root', 'repos');
    mkdirSync(nestedRepos, { recursive: true });

    const slug = '../../outside-escape-target';
    // Compute exactly where a successful traversal would land using the
    // SAME join() the command uses internally — self-consistent regardless
    // of nesting depth, so this doesn't depend on hand-derived path math.
    const escapeDir = join(nestedRepos, slug);
    mkdirSync(escapeDir, { recursive: true });
    const escapeReadmePath = join(escapeDir, 'README.md');
    const canaryContent = markerReadme('outside-escape-target', undefined, 'CANARY — must not change');
    writeFileSync(escapeReadmePath, canaryContent, 'utf-8');

    // A fully realistic, otherwise-valid setup, so this test would still
    // catch a regression even if some future refactor reordered checks —
    // it isn't passing merely because manifest/gallery resolution failed
    // first for an unrelated reason.
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);

    const code = await runAndCaptureExit(baseOpts({ repos: nestedRepos, slug, gallery: 'turnarounds' }));

    expect(code).toBe(2);
    // The canary outside --repos must be byte-for-byte untouched.
    expect(readFileSync(escapeReadmePath, 'utf-8')).toBe(canaryContent);
  });
});

// F-38e339d9 — two concurrent `brand sync` processes targeting DIFFERENT
// galleries of the SAME README each used to read the same pre-image,
// independently compute their own gallery's update from it, and whichever
// wrote SECOND silently reverted the FIRST process's already-successful
// write — both exited 0, neither printed a warning. The fix is a per-README
// lockfile (<readme>.brand-sync-lock) held across the whole read-compute-
// write cycle. These tests simulate contention by pre-seeding the lock file
// directly (the same technique the rest of this suite uses for crash/hazard
// simulation) rather than spawning real concurrent processes.
describe('runSync — concurrent-write lock (F-38e339d9)', () => {
  it('fails loudly instead of silently racing when a live lock is already held for the same README', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    // Simulate a concurrent sync already in flight: a fresh lock file
    // naming a live pid. This test process's OWN pid is trivially "alive"
    // (a process can always signal itself), so the fix's liveness check
    // must treat this as genuine, un-reclaimable contention.
    writeFileSync(`${readmePath}.brand-sync-lock`, `${process.pid}:${Date.now()}`, 'utf-8');
    const before = readFileSync(readmePath, 'utf-8');

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));

    // Before this fix, a pre-existing lock file was never even looked at —
    // sync would proceed normally, exit 0, and overwrite the README.
    expect(code).not.toBe(0);
    expect(readFileSync(readmePath, 'utf-8')).toBe(before);

    const printed = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
    expect(printed.toLowerCase()).toContain('sync');
  });

  it('self-heals a stale lock (dead pid) and completes the sync normally', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    // An empirically-confirmed-dead pid (ESRCH) with a FRESH timestamp —
    // proves liveness, not just age, is what's actually checked.
    writeFileSync(`${readmePath}.brand-sync-lock`, `999999999:${Date.now()}`, 'utf-8');

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(0);
    expect(readFileSync(readmePath, 'utf-8')).toContain('front.png');
    expect(existsSync(`${readmePath}.brand-sync-lock`)).toBe(false);
  });

  it('self-heals a lock old enough to be stale even when the pid happens to be alive', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    // This process's own pid (definitely alive) but a timestamp well past
    // SYNC_LOCK_STALE_MS.
    writeFileSync(`${readmePath}.brand-sync-lock`, `${process.pid}:${Date.now() - 999_999}`, 'utf-8');

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(code).toBe(0);
  });

  it('does not leave a lock file behind after a normal successful sync', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    await runAndCaptureExit(baseOpts({ gallery: 'turnarounds' }));
    expect(existsSync(`${readmePath}.brand-sync-lock`)).toBe(false);
  });

  it('does not leave a lock file behind after an operator-error exit (e.g. --check drift, exit 1)', async () => {
    const filenames = ['front.png', 'side.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    const readmePath = seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'old/front.png'));

    const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds', check: true }));
    expect(code).toBe(1);
    // process.exit(1) here is a REAL exit path (mocked to throw in tests) —
    // this pins that the lock is released via the try/finally even though
    // this specific exit never reaches fail()'s process.on('exit') backstop
    // path any differently than a normal return would.
    expect(existsSync(`${readmePath}.brand-sync-lock`)).toBe(false);
  });
});

describe('runSync — --json output', () => {
  it('emits a single JSON object with the expected shape on success', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds', json: true }));
      expect(code).toBe(0);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const written = writeSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(written);
      expect(parsed).toMatchObject({
        ok: true,
        slug: 'alpha',
        gallery: 'turnarounds',
        updated: true,
      });
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('emits ok:false with exit 1 in --json --check mode when drift is present', async () => {
    const filenames = ['front.png'];
    seedGalleryFolder('alpha', 'turnarounds', filenames);
    writeManifest(buildManifest('alpha', 'turnarounds', filenames), manifestPath);
    seedReadme('alpha', markerReadme('alpha', 'turnarounds', 'STALE'));

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runAndCaptureExit(baseOpts({ gallery: 'turnarounds', json: true, check: true }));
      expect(code).toBe(1);
      const written = writeSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(written);
      expect(parsed.ok).toBe(false);
      expect(parsed.drift).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('emits a JSON error object with exit 2 for operator errors', async () => {
    writeManifest(buildManifest('alpha', 'turnarounds', []), manifestPath);
    // No README, no gallery folder.

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runAndCaptureExit(baseOpts({ json: true }));
      expect(code).toBe(2);
      const written = writeSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(written);
      expect(parsed.ok).toBe(false);
      expect(typeof parsed.error).toBe('string');
    } finally {
      writeSpy.mockRestore();
    }
  });
});
