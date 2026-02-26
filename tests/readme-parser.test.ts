import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLogoImgTags, rewriteLogoSrc } from '../src/utils/readme-parser.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8');

const BRAND_URL = 'https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/test/readme.png';

describe('findLogoImgTags', () => {
  it('finds standalone logo in <p> block', () => {
    const matches = findLogoImgTags(fixture('standalone-logo.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
    expect(matches[0].line).toBe(2);
  });

  it('finds logo when <p> and <img> are on the same line', () => {
    const matches = findLogoImgTags(fixture('p-img-sameline.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toContain('logo-myproject.png');
  });

  it('finds logo with full raw.githubusercontent.com URL', () => {
    const matches = findLogoImgTags(fixture('raw-github-url.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toContain('logo-claimledger.png');
  });

  it('finds JPEG logos', () => {
    const matches = findLogoImgTags(fixture('jpg-logo.md'));
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.jpg');
  });

  it('returns empty for README with no logo', () => {
    const matches = findLogoImgTags(fixture('no-logo.md'));
    expect(matches).toHaveLength(0);
  });

  it('does NOT match badges inside <a> tags', () => {
    const content = fixture('badge-in-a-tag.md');
    const matches = findLogoImgTags(content);
    // Should only match the logo on line 2, not the badges in <a> tags
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  it('does NOT match shields.io badges with &logo= parameter', () => {
    const content = fixture('shields-logo-param.md');
    const matches = findLogoImgTags(content);
    // Should only match the actual logo, not the 4 shields.io badges
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });

  it('matches only the logo in a complex README with badges', () => {
    const content = fixture('multiple-logos.md');
    const matches = findLogoImgTags(content);
    // Only the logo on line 5 (<p><img src="assets/logo.png">) should match
    // NOT: shields.io badges (even standalone ones with &logo=dotnet)
    // NOT: badges inside <a> tags
    expect(matches).toHaveLength(1);
    expect(matches[0].src).toBe('assets/logo.png');
  });
});

describe('rewriteLogoSrc', () => {
  it('replaces only the logo src, preserving all attributes', () => {
    const input = '  <img src="assets/logo.png" alt="MyProject" width="400">';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(`  <img src="${BRAND_URL}" alt="MyProject" width="400">`);
  });

  it('preserves indentation exactly', () => {
    const input = '  <img src="assets/logo.png" alt="Test" width="400">';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result.startsWith('  <img')).toBe(true);
  });

  it('does not add newlines or extra whitespace', () => {
    const input = fixture('standalone-logo.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    const inputLines = input.split('\n').length;
    const resultLines = result.split('\n').length;
    expect(resultLines).toBe(inputLines);
  });

  it('handles <p> and <img> on the same line', () => {
    const input = '<p align="center"><img src="logo.png" alt="Test" width="400"></p>';
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(`<p align="center"><img src="${BRAND_URL}" alt="Test" width="400"></p>`);
  });

  it('does not touch badge lines', () => {
    const input = fixture('shields-logo-param.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    // Badges should be unchanged
    expect(result).toContain('shields.io/badge/.NET-9-purple');
    expect(result).toContain('shields.io/badge/node-');
    expect(result).toContain('shields.io/badge/python-');
    expect(result).toContain('shields.io/badge/docker-');
    // Logo should be rewritten
    expect(result).toContain(BRAND_URL);
  });

  it('does not touch badges inside <a> tags', () => {
    const input = fixture('badge-in-a-tag.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toContain('shields.io/badge/CI-passing');
    expect(result).toContain('shields.io/badge/License-MIT');
    expect(result).toContain(BRAND_URL);
  });

  it('handles the full complex case correctly', () => {
    const input = fixture('multiple-logos.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    // Logo rewritten
    expect(result).toContain(BRAND_URL);
    // All badges preserved
    expect(result).toContain('actions/workflow/status');
    expect(result).toContain('logo=windows');
    expect(result).toContain('logo=dotnet');
    expect(result).toContain('WinUI-3-blue');
    expect(result).toContain('github/license');
  });

  it('returns content unchanged when there are no logos', () => {
    const input = fixture('no-logo.md');
    const result = rewriteLogoSrc(input, BRAND_URL);
    expect(result).toBe(input);
  });
});
