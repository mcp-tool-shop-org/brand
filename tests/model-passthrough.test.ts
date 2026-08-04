/**
 * Step 3 of docs/model-channels-spec.md — the build-time half of the
 * conformance induction, tested without running Astro.
 *
 * These assert the check can FAIL. The passthrough gate protects against the
 * build re-encoding a categorical channel, and the page gate protects against
 * publishing byte-perfect assets that no page can reach — a real failure this
 * repo hit: the route's discovery function returned an empty array on its own
 * internal error, the build went green, and the site shipped with zero viewer
 * pages and nothing said so.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verifyModelPassthrough,
  formatPassthroughFailure,
} from '../site/integrations/model-passthrough.mjs';

let outDir: string;

const sha256 = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

const GLB = 'glb-bytes';
const CHAN = 'channel-bytes';
const VIEW = '{"schema":"brand.model-view/1"}';

function manifestFor(overrides: Record<string, string> = {}) {
  const body: Record<string, string> = {
    'logos/subj/model/asset.glb': GLB,
    'logos/subj/model/ch_a.png': CHAN,
    'logos/subj/model/view.json': VIEW,
    ...overrides,
  };
  return {
    version: '1.0',
    generated: '2026-08-04T00:00:00.000Z',
    algorithm: 'sha256',
    assets: Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, { hash: sha256(v), size: v.length, format: 'x' }])
    ),
  };
}

/** Lay out a dist/ tree the way a correct build would. */
function seedDist(opts: { withPage?: boolean; channelBytes?: string } = {}) {
  const modelDir = join(outDir, 'model', 'subj');
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(join(modelDir, 'asset.glb'), GLB);
  writeFileSync(join(modelDir, 'ch_a.png'), opts.channelBytes ?? CHAN);
  writeFileSync(join(modelDir, 'view.json'), VIEW);
  if (opts.withPage !== false) {
    const pageDir = join(outDir, 'subj', 'view');
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'index.html'), '<html></html>');
  }
}

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'brand-dist-'));
});
afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('verifyModelPassthrough', () => {
  it('passes when every asset is byte-identical and the page exists', () => {
    seedDist();
    const r = verifyModelPassthrough({ outDir, manifest: manifestFor() });

    expect(r.ok).toBe(true);
    expect(r.checked).toBe(3);
    expect(r.pages).toBe(1);
  });

  it('FAILS when the build re-encoded a channel', () => {
    // The single failure this whole leg exists to catch: bytes that reached
    // dist/ are not the bytes CHECK-CAT verified at ingest.
    seedDist({ channelBytes: 'RE-ENCODED-BY-SOME-IMAGE-PIPELINE' });
    const r = verifyModelPassthrough({ outDir, manifest: manifestFor() });

    expect(r.ok).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0]!.key).toBe('logos/subj/model/ch_a.png');
    expect(formatPassthroughFailure(r)).toMatch(/classes no measurement produced/);
  });

  it('FAILS when an asset never reached dist/', () => {
    seedDist();
    rmSync(join(outDir, 'model', 'subj', 'ch_a.png'));
    const r = verifyModelPassthrough({ outDir, manifest: manifestFor() });

    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['logos/subj/model/ch_a.png']);
  });

  it('FAILS when assets published but no viewer page was generated', () => {
    seedDist({ withPage: false });
    const r = verifyModelPassthrough({ outDir, manifest: manifestFor() });

    expect(r.ok).toBe(false);
    expect(r.pagelessSlugs).toEqual(['subj']);
    expect(r.pages).toBe(0);
    expect(formatPassthroughFailure(r)).toMatch(/MODEL PAGES MISSING/);
  });

  it('is a no-op for a manifest with no model assets', () => {
    const r = verifyModelPassthrough({
      outDir,
      manifest: {
        version: '1.0',
        generated: '',
        algorithm: 'sha256',
        assets: { 'logos/x/readme.png': { hash: sha256('p'), size: 1, format: 'png' } },
      },
    });
    expect(r.checked).toBe(0);
    expect(r.ok).toBe(true);
  });
});
