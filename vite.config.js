// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Content revision of every model (public/assets/models/*.glb). Production builds add it to each model URL
// as ?v=<hash> (the preload map in index.html exposes it as window.__modelRev; core/assets.js reads it), so
// everything under /assets/ can be cached for a year (public/_headers) and a changed model is never stale.
// Dev builds keep plain URLs.
function modelRevisions() {
  let revs = {};
  return {
    name: 'snuggle-model-revisions',
    apply: 'build',
    get revs() {
      return revs;
    },
    buildStart() {
      const dir = 'public/assets/models';
      revs = {};
      for (const f of readdirSync(dir).sort()) {
        if (f.endsWith('.glb')) revs[f.slice(0, -4)] = createHash('sha256').update(readFileSync(`${dir}/${f}`)).digest('hex').slice(0, 10);
      }
    },
    transformIndexHtml(html) {
      const marker = 'var rev = {};';
      if (!html.includes(marker)) throw new Error(`index.html: "${marker}" not found for model revisions`);
      return html.replace(marker, `var rev = ${JSON.stringify(revs)};`);
    },
  };
}

// The game's version (production builds): "v." + the first 4 characters of the commit the build came from,
// written into index.html's #ver (the corner label; the bug report reads it). Cloudflare Workers Builds says
// which commit it checked out; a local build asks git and adds "+" when the working tree has uncommitted
// changes (the build isn't exactly that commit). A build that knows neither shows "v.????"; the dev server
// keeps index.html's "v.dev".
function gameVersion() {
  let version = '';
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return {
    name: 'snuggle-version',
    apply: 'build',
    buildStart() {
      const ci = process.env.WORKERS_CI_COMMIT_SHA;
      try {
        version = 'v.' + (ci ? ci.slice(0, 4) : git('rev-parse', 'HEAD').slice(0, 4) + (git('status', '--porcelain') ? '+' : ''));
      } catch {
        version = 'v.????';
      }
    },
    transformIndexHtml(html) {
      const marker = '<div id="ver">v.dev</div>';
      if (!html.includes(marker)) throw new Error(`index.html: "${marker}" not found for the version`);
      return html.replace(marker, `<div id="ver">${version}</div>`);
    },
  };
}

// The service worker (production builds): sw.js is written next to index.html with the list of every JS
// chunk and every model (with its revision). It is registered after Begin (src/main.js), so it never
// competes with the first load, then caches the whole game in the background: a returning player starts
// from the cache, even offline. The page is network-first (a new deploy shows up on the next load); a new
// service worker waits until every tab of the old version is closed, never switching mid-game, and the old
// version's cache keeps serving an open tab the chunks its build needs. To switch it off for everyone,
// deploy a sw.js that only calls self.registration.unregister().
function serviceWorker(revs) {
  return {
    name: 'snuggle-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/') && f.endsWith('.js')).sort();
      const models = Object.entries(revs()).map(([name, rev]) => `assets/models/${name}.glb?v=${rev}`);
      const list = ['./', ...files.map((f) => './' + f), ...models.map((f) => './' + f)];
      const version = createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync('tools/sw-template.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace("['__PRECACHE__']", JSON.stringify(list, null, 1));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

const revisions = modelRevisions();

export default defineConfig({
  // relative base: the build runs from any static host path (Cloudflare, GitHub Pages, maize.live, a sub-folder)
  base: './',
  plugins: [revisions, gameVersion(), serviceWorker(() => revisions.revs)],
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
