# Dependency policy — site/

This file documents the pinning rationale for each non-trivial dependency in
`site/package.json`. Reviewers should consult this before bumping deps.

## Tailwind plugin choice

### `@tailwindcss/postcss` (NOT `@tailwindcss/vite`)

**Why PostCSS:** Astro 6 ships Vite 7 whose Rolldown-based resolve binding
shape (`BindingViteResolvePluginConfig.resolveOptions`) changed in a way that
broke `@tailwindcss/vite` at runtime even though its peer-dep range advertises
`^7`. See [withastro/astro#16542](https://github.com/withastro/astro/issues/16542).
Switching to `@tailwindcss/postcss` consumes the same `@import "tailwindcss"`
source CSS but routes it through Astro's PostCSS pipeline, sidestepping the
binding-shape mismatch entirely.

**Bump policy:**
- Stay on `@tailwindcss/postcss` until `@tailwindcss/vite` ships a release
  that builds clean against Vite 7 with the current Astro version. Then
  reconsider — there's no functional benefit to the Vite plugin over PostCSS
  for this site's build; revert only if a Tailwind feature becomes
  vite-plugin-only.
- `postcss.config.mjs` is the single touchpoint; `astro.config.mjs` no longer
  imports any Tailwind plugin.

## Caret ranges (Dependabot can auto-bump minors)

### `astro: "^6.3.3"`, `@astrojs/starlight: "^0.39.2"`, `@mcptoolshop/site-theme: "^1.6.1"`

These three are coupled — Starlight 0.39 peer-requires Astro 6, and site-theme
1.6 peer-requires both. Bumping any one alone risks pulling the others
unexpectedly. The combined upgrade landed together via `deps/site-stack-vite7`.

**Bump policy:**
- Minor bumps on the three coupled packages can be merged together (Dependabot
  may group them via the `site-minor-patch` group in `dependabot.yml`).
- Major bumps must be tested as a bundle on a working branch. The Starlight 0.x
  era taught us that minor bumps could change content-collection contracts;
  the same caution applies to 0.39 → future minors.
- When Starlight 1.0 ships: coordinate the bump across ALL org sites that
  consume `@mcptoolshop/site-theme`.
- The exhaustive switch in `src/pages/index.astro` will fail loud at build
  time if site-theme adds a new `Section.kind` we don't handle here. That's
  the intended behavior.

### `tailwindcss: "^4.2.0"`, `@tailwindcss/postcss: "^4.3.0"`

Tailwind 4.x has strong semver discipline — minor bumps are safe within a
major. Caret is fine; Dependabot can auto-bump.

### `zod: "^4.4.3"`

zod 4.x stable. Caret is fine.

## Why this file exists

`package.json` doesn't accept comments, so pinning rationale lives here. If
you're about to change a dep version, read the matching section above first.
