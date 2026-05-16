// PostCSS pipeline used by Astro for CSS files.
// @tailwindcss/postcss processes `@import "tailwindcss"` and the @theme/@layer
// directives in our handbook CSS. We moved here from @tailwindcss/vite because
// the Vite plugin doesn't yet support Vite 7's Rolldown resolve binding
// (withastro/astro#16542).
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
