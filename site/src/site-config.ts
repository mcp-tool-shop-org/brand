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
    description: 'One repo holds every logo. Every README points here. Update once, update everywhere. A SHA-256 manifest catches drift and accidental overwrites before they ship.',
    // Primary CTA goes to the CLI section (jump to the actual install). The
    // handbook secondary CTA is for users who want context first.
    primaryCta: { href: '#cli', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Verify', code: 'brand verify' },
      { label: 'Reconcile', code: 'brand audit --remote --org my-org' },
      { label: 'History', code: 'brand history my-tool' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'Why centralize brand assets.',
      features: [
        { title: 'Single source of truth', desc: 'Hundreds of logos across the org. Rebrand once, update everywhere — no more hunting through repos for stale logos.' },
        { title: 'Drift detection', desc: 'A SHA-256 manifest tracks every asset, and CI fails the build the moment disk and manifest disagree. It catches accidents, not adversaries — the handbook is explicit about where that line sits.' },
        { title: 'Org reconciliation', desc: 'Repos get renamed, archived, and deleted; registries quietly rot. One command checks every tracked slug against the live org and tells you which are renamed, archived, or genuinely orphaned.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'cli',
      title: 'CLI',
      cards: [
        { title: 'Verify integrity', code: '# Check all logos against manifest hashes\nbrand verify\n\n# CI mode — fail if manifest is stale\nbrand manifest --check' },
        { title: 'Reconcile with the org', code: '# Audit a whole org without cloning it\nbrand audit --remote --org my-org\n\n# Reports renamed, archived and orphaned slugs.\n# Nothing is ever deleted for you.' },
        { title: 'Inspect & remove', code: '# When did this logo change, and to what?\nbrand history my-tool\n\n# Removal is destructive, so it asks\nbrand remove old-tool --dry-run\nbrand remove old-tool --yes' },
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
      // Score is doubled in the subtitle so it reads at-a-glance without
      // requiring the user to scan the table. Mirrors SCORECARD.md / README —
      // keep these in sync on every release.
      subtitle: '50/50 on the Ship Gate audit.',
      columns: ['Category', 'Score', 'Notes'],
      rows: [
        ['A. Security', '10/10', 'SECURITY.md, SHA-256 integrity, no network, no telemetry'],
        ['B. Error Handling', '10/10', 'Structured errors, clear CLI output, uniform 0/1/2/3 exit codes'],
        ['C. Operator Docs', '10/10', 'README, CHANGELOG, handbook, full CLI docs'],
        ['D. Shipping Hygiene', '10/10', 'Node 20/22/24 matrix, SHA-pinned actions, npm audit, Dependabot, 237 tests, full tag/release/npm parity'],
        ['E. Identity', '10/10', 'Logo, translations, landing page, metadata'],
      ],
    },
  ],
};

// Validate at module load. A misshapen config fails the build loud instead
// of rendering an empty section.
SiteConfigSchema.parse(rawConfig);

export const config: SiteConfig = rawConfig;
