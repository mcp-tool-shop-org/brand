import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  hashFile,
  generateManifest,
  writeManifest,
  readManifest,
  verifyManifest,
} from '../src/manifest.js';

let tempDir: string;
let logosDir: string;
let manifestPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'brand-test-'));
  logosDir = join(tempDir, 'logos');
  manifestPath = join(tempDir, 'manifest.json');

  // Create test logo files
  mkdirSync(join(logosDir, 'project-a'), { recursive: true });
  mkdirSync(join(logosDir, 'project-b'), { recursive: true });
  writeFileSync(join(logosDir, 'project-a', 'readme.png'), 'fake-png-content-a');
  writeFileSync(join(logosDir, 'project-b', 'readme.jpg'), 'fake-jpg-content-b');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('hashFile', () => {
  it('returns sha256:<hex> format', () => {
    const hash = hashFile(join(logosDir, 'project-a', 'readme.png'));
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('returns different hashes for different files', () => {
    const hashA = hashFile(join(logosDir, 'project-a', 'readme.png'));
    const hashB = hashFile(join(logosDir, 'project-b', 'readme.jpg'));
    expect(hashA).not.toBe(hashB);
  });

  it('returns same hash for same content', () => {
    const hash1 = hashFile(join(logosDir, 'project-a', 'readme.png'));
    const hash2 = hashFile(join(logosDir, 'project-a', 'readme.png'));
    expect(hash1).toBe(hash2);
  });
});

describe('generateManifest', () => {
  it('includes all files under logos dir', () => {
    const manifest = generateManifest(logosDir);
    expect(Object.keys(manifest.assets)).toHaveLength(2);
    expect(manifest.assets['logos/project-a/readme.png']).toBeDefined();
    expect(manifest.assets['logos/project-b/readme.jpg']).toBeDefined();
  });

  it('detects format from extension', () => {
    const manifest = generateManifest(logosDir);
    expect(manifest.assets['logos/project-a/readme.png'].format).toBe('png');
    expect(manifest.assets['logos/project-b/readme.jpg'].format).toBe('jpeg');
  });

  it('records file size', () => {
    const manifest = generateManifest(logosDir);
    expect(manifest.assets['logos/project-a/readme.png'].size).toBeGreaterThan(0);
  });

  it('sets version and algorithm', () => {
    const manifest = generateManifest(logosDir);
    expect(manifest.version).toBe('1.0');
    expect(manifest.algorithm).toBe('sha256');
  });
});

describe('writeManifest / readManifest', () => {
  it('round-trips correctly', () => {
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);
    const loaded = readManifest(manifestPath);
    expect(loaded.assets).toEqual(manifest.assets);
    expect(loaded.version).toBe(manifest.version);
  });

  it('throws when manifest does not exist', () => {
    expect(() => readManifest('/nonexistent/path.json')).toThrow('Manifest not found');
  });
});

describe('verifyManifest', () => {
  it('reports ok when nothing changed', () => {
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);
    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(true);
    expect(result.verified).toHaveLength(2);
    expect(result.changed).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('detects tampered files', () => {
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);

    // Tamper with a file
    writeFileSync(join(logosDir, 'project-a', 'readme.png'), 'TAMPERED CONTENT');

    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(false);
    expect(result.changed).toContain('logos/project-a/readme.png');
  });

  it('detects added files', () => {
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);

    // Add a new file
    mkdirSync(join(logosDir, 'project-c'), { recursive: true });
    writeFileSync(join(logosDir, 'project-c', 'readme.png'), 'new content');

    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(false);
    expect(result.added).toContain('logos/project-c/readme.png');
  });

  it('detects removed files', () => {
    const manifest = generateManifest(logosDir);
    writeManifest(manifest, manifestPath);

    // Remove a file
    rmSync(join(logosDir, 'project-b'), { recursive: true });

    const result = verifyManifest(manifestPath, logosDir);
    expect(result.ok).toBe(false);
    expect(result.removed).toContain('logos/project-b/readme.jpg');
  });
});
