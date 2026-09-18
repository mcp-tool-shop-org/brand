// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
// Stages logos/<slug>/model/* into public/ before the build, then asserts the
// bytes reached dist/ unchanged. Leg 1 of the conformance induction — see
// integrations/model-passthrough.mjs for why staging and asserting have to be
// separate steps for the assert to be capable of failing at all.
import modelPassthrough from './integrations/model-passthrough.mjs';
import tailwindcss from '@tailwindcss/vite';

// Tailwind is wired via @tailwindcss/vite, the same way as every other site
// in the org. This file used to route it through @tailwindcss/postcss
// instead, citing withastro/astro#16542 (the Vite-7 Rolldown resolve binding
// lacked `tsconfigPaths`). On astro 7.3.3 + vite 7.3.6 that no longer holds:
// 56 sibling repos build clean on @tailwindcss/vite with this exact stack,
// while the PostCSS route fails here -- `@import "tailwindcss"` is resolved
// as a relative FILE and the build dies on ENOENT for `site/tailwindcss`.
// Measured 2026-09-17 by switching exactly this and rebuilding.

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/brand',
  trailingSlash: 'always',
  integrations: [
    modelPassthrough(),
    starlight({
      title: 'Brand',
      disable404Route: true,
      // Logo renders in the Starlight handbook header. Single SVG (no
      // light/dark variants) — the chain motif is single-color emerald
      // and reads on both surfaces. Replace src with light/dark pair if
      // contrast tuning is ever needed.
      logo: {
        src: './src/assets/logo.svg',
        alt: 'Brand — SHA-256 integrity registry',
      },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/brand' },
      ],
      sidebar: [
        {
          label: 'Handbook',
          // Starlight 0.39 retired autogenerate-with-label; the directory
          // scan now lives inside an `items` array under a labelled group.
          items: [{ autogenerate: { directory: 'handbook' } }],
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
