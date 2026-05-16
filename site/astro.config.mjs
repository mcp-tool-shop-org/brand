// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Tailwind is wired via @tailwindcss/postcss (see postcss.config.mjs).
// We moved off @tailwindcss/vite because that plugin doesn't yet support
// Vite 7's Rolldown-based resolve bindings (the `tsconfigPaths` field
// went missing in the Vite-7 binding shape) — withastro/astro#16542.
// The PostCSS variant uses the same `@import "tailwindcss"` source CSS,
// just routed through Astro's PostCSS pipeline instead.

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/brand',
  trailingSlash: 'always',
  integrations: [
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
});
