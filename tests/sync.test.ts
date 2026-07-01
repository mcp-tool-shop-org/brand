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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
