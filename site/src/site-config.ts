import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Brand',
  description: 'Centralized brand asset management — migration, audit, and integrity verification for GitHub orgs',
  logoBadge: 'B',
  brandName: 'Brand',
  repoUrl: 'https://github.com/mcp-tool-shop-org/brand',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'Open source',
    headline: 'Brand',
    headlineAccent: 'asset registry.',
    description: 'One repo holds every logo. Every README points here. Update once, update everywhere. SHA-256 integrity verification keeps your brand safe.',
    primaryCta: { href: '#cli', label: 'Get started' },
    secondaryCta: { href: '#features', label: 'Learn more' },
    previews: [
      { label: 'Verify', code: 'brand verify' },
      { label: 'Audit', code: 'brand audit --repos /path/to/clones' },
      { label: 'Migrate', code: 'brand migrate --repos /path/to/clones --dry-run' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'Why centralize brand assets.',
      features: [
        { title: 'Single source of truth', desc: '117 logos across the org. Rebrand once, update everywhere — no more hunting through repos for stale logos.' },
        { title: 'Tamper detection', desc: 'SHA-256 manifest tracks every asset. CI catches accidental overwrites, drift, and compromised logos before they ship.' },
        { title: 'Safe migration', desc: 'Multi-gate regex distinguishes brand logos from shields.io badges. Dry-run first, spot-check, push incrementally.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'cli',
      title: 'CLI',
      cards: [
        { title: 'Verify integrity', code: '# Check all logos against manifest hashes\nbrand verify\n\n# CI mode — fail if manifest is stale\nbrand manifest --check' },
        { title: 'Audit & migrate', code: '# Find broken refs, badge collisions, traps\nbrand audit --repos ./clones\n\n# Rewrite READMEs to point at brand repo\nbrand migrate --repos ./clones --dry-run' },
      ],
    },
    {
      kind: 'features',
      id: 'safety',
      title: 'Battle-tested',
      subtitle: 'Lessons learned from migrating 100+ repos.',
      features: [
        { title: 'Badge collision guard', desc: 'shields.io URLs with &logo= parameters look like brand logos. Multi-gate filtering catches badges before they get rewritten.' },
        { title: 'Markdown rendering traps', desc: '4+ spaces makes code blocks. Blank lines break HTML context. The audit command catches these before they break your README.' },
        { title: 'Format preservation', desc: 'PNGs stay PNGs. JPEGs stay JPEGs. Format is a brand decision, not a build target. Never converts or compresses.' },
      ],
    },
    {
      kind: 'data-table',
      id: 'scorecard',
      title: 'Quality scorecard',
      subtitle: 'Ship Gate audit — 47/50.',
      columns: ['Category', 'Score', 'Notes'],
      rows: [
        ['A. Security', '10/10', 'SECURITY.md, SHA-256 integrity, no network, no telemetry'],
        ['B. Error Handling', '8/10', 'Structured errors, clear CLI output, exit codes'],
        ['C. Operator Docs', '10/10', 'README, CHANGELOG, handbook, full CLI docs'],
        ['D. Shipping Hygiene', '9/10', 'CI integrity check, 29 tests, version aligned'],
        ['E. Identity', '10/10', 'Logo, translations, landing page, metadata'],
      ],
    },
  ],
};
