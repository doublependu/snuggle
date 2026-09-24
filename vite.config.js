import { defineConfig } from 'vite';

export default defineConfig({
  // relative base: the build runs from any static host path (GitHub Pages, maize.live, a sub-folder)
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true },
});
