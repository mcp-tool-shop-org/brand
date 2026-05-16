# Dependency policy — site/

This file documents the pinning rationale for each non-trivial dependency in
`site/package.json`. Reviewers should consult this before bumping deps.

## Exact pins (no caret)

### `@astrojs/starlight: "0.37.6"`

**Why exact:** Starlight is pre-1.0 (currently 0.37.x). Per semver convention, a
0.x package may break on any minor bump. Starlight's content collection
contracts (frontmatter schema, sidebar config, autogenerate directory layout)
have shifted between minor releases. An auto-bump from `^0.37.6` could silently
break the handbook's frontmatter or the sidebar autogenerate config.

**Bump policy:**
- Bump deliberately, with a manual smoke build (`npm run -w site build`) and a
  click-through of the deployed handbook.
- Do NOT let Dependabot auto-merge minor Starlight bumps until 1.0 ships.
- When Starlight 1.0 ships: coordinate the bump across ALL org sites that
  consume `@mcptoolshop/site-theme` (the theme depends on Starlight too).
- Security patches: review and bump within 7 days. Even though they're 0.x
  patches, the breaking-change risk is small.

### `@mcptoolshop/site-theme: "0.2.6"`

**Why exact:** site-theme is a 0.x package and is the visual + structural
backbone of this site (BaseLayout, Hero, Section, FeatureGrid, DataTable,
CodeCardGrid, ApiList). A caret range (`^0.2.4`) resolves to anything in
`>=0.2.4 <0.3.0`, so a fresh `npm install` in CI could silently jump to a 0.2.x
release with a breaking prop rename or component restructure.

**Bump policy:**
- Bump deliberately when site-theme cuts a new minor release. Review the
  CHANGELOG for breaking prop changes before bumping.
- The exhaustive switch in `src/pages/index.astro` will fail loud at build
  time if site-theme adds a new `Section.kind` we don't handle here. That's
  the intended behavior.
- When site-theme reaches 1.0, this can move to `^1.0.0` and Dependabot can
  manage minor bumps.

## Caret ranges (acceptable risk)

### `astro: "^5.17.0"`, `tailwindcss: "^4.2.0"`, `@tailwindcss/vite: "^4.2.0"`

Astro 5.x and Tailwind 4.x have strong semver discipline — minor bumps are
safe within a major. Caret is fine; Dependabot can auto-bump.

### `zod: "^3.25.76"`

zod 3.x has stable API. Caret is fine.

## Why this file exists

`package.json` doesn't accept comments, so pinning rationale lives here. If
you're about to change a dep version, read the matching section above first.
