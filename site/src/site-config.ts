// Sections support kind: 'features' | 'data-table' | 'code-cards' | 'api'.
// Adding a new homepage section requires editing this file. Adding a new
// section *kind* requires updates here AND in src/pages/index.astro (the
// exhaustive switch will fail loud on unknown kinds at build time).
//
// Adding a handbook page: drop a new .md under src/content/docs/handbook/.
// The Starlight sidebar autogenerates from that directory.
import { z } from 'zod';
import type { SiteConfig } from '@mcptoolshop/site-theme';

// Runtime validation schema. site-theme's SiteConfig is TypeScript-only;
// this zod schema catches misconfigurations at module load (silent renders
// > loud failures). Kept loose where shape is opaque (site-theme owns those
// types); strict on the fields a content editor actually touches.
const HeroSchema = z.object({
  badge: z.string().optional(),
  headline: z.string(),
  headlineAccent: z.string().optional(),
  description: z.string(),
  primaryCta: z.object({ href: z.string(), label: z.string() }).optional(),
  secondaryCta: z.object({ href: z.string(), label: z.string() }).optional(),
  previews: z.array(z.object({ label: z.string(), code: z.string() })).optional(),
}).passthrough();

const SectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('features'),
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    features: z.array(z.object({ title: z.string(), desc: z.string() })),
  }).passthrough(),
  z.object({
    kind: z.literal('data-table'),
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }).passthrough(),
  z.object({
    kind: z.literal('code-cards'),
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    cards: z.array(z.object({ title: z.string(), code: z.string() })),
  }).passthrough(),
  z.object({
    kind: z.literal('api'),
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    apis: z.array(z.any()),
  }).passthrough(),
]);

const SiteConfigSchema = z.object({
  title: z.string(),
  description: z.string(),
  logoBadge: z.string(),
  brandName: z.string(),
  repoUrl: z.string().url(),
  npmUrl: z.string().url(),
  footerText: z.string().optional(),
  hero: HeroSchema,
  sections: z.array(SectionSchema),
}).passthrough();

const rawConfig: SiteConfig = {
  title: 'Brand',
  description: 'Centralized brand asset management — migration, audit, and integrity verification for GitHub orgs',
  logoBadge: 'B',
  brandName: 'Brand',
  repoUrl: 'https://github.com/mcp-tool-shop-org/brand',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/brand',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    // Badge: lead with the integrity story (the differentiator) rather than
    // a generic "Open source" label. The accent dot in the badge is the
    // emerald-400 brand color, so this reads as "active, verified".
    badge: 'SHA-256 integrity verified',
    headline: 'Brand',
    headlineAccent: 'asset registry.',
    description: 'One repo holds every logo. Every README points here. Update once, update everywhere. SHA-256 integrity verification keeps your brand safe.',
    // Primary CTA goes to the CLI section (jump to the actual install). The
    // handbook secondary CTA is for users who want context first.
    primaryCta: { href: '#cli', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
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
        { title: 'Single source of truth', desc: '148 logos across the org. Rebrand once, update everywhere — no more hunting through repos for stale logos.' },
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
      // TODO: bump to 50/50 and D=10/10 once v1.0.3 tag is confirmed on remote
      // (npm publish + git push --tags). Currently v1.0.1 is the latest tag on
      // remote, so shipping-hygiene parity is 9/10 — honest read.
      title: 'Quality scorecard',
      // Score is doubled in the subtitle so it reads at-a-glance without
      // requiring the user to scan the table.
      subtitle: '49/50 on the Ship Gate audit — pending v1.0.3 tag.',
      columns: ['Category', 'Score', 'Notes'],
      rows: [
        ['A. Security', '10/10', 'SECURITY.md, SHA-256 integrity, no network, no telemetry'],
        ['B. Error Handling', '10/10', 'Structured errors, clear CLI output, exit codes'],
        ['C. Operator Docs', '10/10', 'README, CHANGELOG, handbook, full CLI docs'],
        ['D. Shipping Hygiene', '9/10', 'CI integrity check, 29 tests; v1.0.3 tag pending'],
        ['E. Identity', '10/10', 'Logo, translations, landing page, metadata'],
      ],
    },
  ],
};

// Validate at module load. A misshapen config fails the build loud instead
// of rendering an empty section.
SiteConfigSchema.parse(rawConfig);

export const config: SiteConfig = rawConfig;
