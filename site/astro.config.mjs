// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

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
        { label: 'Handbook', autogenerate: { directory: 'handbook' } },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
