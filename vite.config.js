// SPDX-License-Identifier: GPL-3.0-only
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
    // licences of the bundled libraries (three.js, three-mesh-bvh), shipped next to index.html
    license: { fileName: 'third-party-licenses.md' },
    manifest: true, // .vite/manifest.json: tools/budget.mjs follows it to each zone's chunks
  },
  server: { host: true },
});
