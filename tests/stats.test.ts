import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const bin = join(import.meta.dirname, '..', 'dist', 'cli.js');

function run(...args: string[]): string {
  return execFileSync('node', [bin, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
    cwd: join(import.meta.dirname, '..'),
  }).trim();
}

describe('brand stats', () => {
  it('prints logo count', () => {
    const out = run('stats');
    expect(out).toContain('Logos on disk:');
    expect(out).toContain('Manifest entries:');
    expect(out).toContain('Formats:');
  });

  it('--json outputs valid JSON', () => {
    const out = run('stats', '--json');
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('totalLogos');
    expect(parsed).toHaveProperty('formats');
    expect(parsed).toHaveProperty('manifestEntries');
    expect(typeof parsed.totalLogos).toBe('number');
  });
});
