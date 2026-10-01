// SPDX-License-Identifier: GPL-3.0-only
// Deploy check: fetches the site the way a browser would and checks what Cloudflare sends back: status,
// content types, caching (immutable /assets/, revalidated HTML), security headers, model revisions, and
// that build-only files aren't served. Reports the bytes on the wire and the compression per file.
// Usage: npm run build && npm run cf:check                 (starts `wrangler dev` on dist/ itself)
//        npm run cf:check -- https://snuggle-sorcery.<you>.workers.dev   (a deployed site)
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const DIST = 'dist';
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ missing: run `npm run build` first');
  process.exit(1);
}

let base = process.argv[2];
let wrangler = null;
if (!base) {
  const port = 8790;
  base = `http://127.0.0.1:${port}/`;
  // its own process group, so stopping it also stops the workerd children it starts
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const stop = () => {
    try {
      process.kill(-wrangler.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  process.on('exit', stop);
  let log = '';
  wrangler.stdout.on('data', (d) => (log += d));
  wrangler.stderr.on('data', (d) => (log += d));
  const end = Date.now() + 60000;
  while (!/Ready on/.test(log)) {
    if (Date.now() > end || wrangler.exitCode !== null) {
      console.error('wrangler dev did not start:\n' + log.slice(-2000));
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`Checking ${base} (wrangler dev on dist/)`);
} else {
  base = base.replace(/\/?$/, '/');
  console.log(`Checking ${base}`);
}

// Raw GET: bytes as they come over the wire (not decoded), plus the response headers.
function get(url) {
  const lib = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, { headers: { 'accept-encoding': 'zstd, br, gzip', 'user-agent': 'snuggle-deploy-check' } }, (res) => {
      let bytes = 0;
      const chunks = [];
      res.on('data', (d) => {
        bytes += d.length;
        chunks.push(d);
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout ' + url)));
  });
}

const problems = [];
const rows = [];
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
async function check(path, want) {
  const r = await get(base + path);
  const h = r.headers;
  const bad = [];
  if (r.status !== want.status) bad.push(`status ${r.status}, want ${want.status}`);
  if (r.status === 200) {
    if (want.type && !want.type.test(h['content-type'] || '')) bad.push(`content-type "${h['content-type']}"`);
    if (want.cache && !want.cache.test(h['cache-control'] || '')) bad.push(`cache-control "${h['cache-control']}"`);
    if (h['x-content-type-options'] !== 'nosniff') bad.push('no X-Content-Type-Options: nosniff');
  }
  if (bad.length) problems.push(`${path}: ${bad.join('; ')}`);
  rows.push({ path, status: r.status, enc: h['content-encoding'] || '-', bytes: r.bytes, ok: !bad.length });
  return r;
}

const IMMUTABLE = /max-age=31536000.*immutable|immutable.*max-age=31536000/;
const REVALIDATE = /max-age=0|no-cache/;

// the page, and the model revisions it carries
const page = await check('', { status: 200, type: /text\/html/, cache: REVALIDATE });
const decode = { br: zlib.brotliDecompressSync, gzip: zlib.gunzipSync, zstd: zlib.zstdDecompressSync };
const html = (decode[page.headers['content-encoding']]?.(page.body) ?? page.body).toString('utf8');
const revServed = JSON.parse(html.match(/var rev = (\{[^}]*\});/)?.[1] || '{}');
const revLocal = JSON.parse(readFileSync(join(DIST, 'index.html'), 'utf8').match(/var rev = (\{[^}]*\});/)?.[1] || '{}');
const models = readdirSync(join(DIST, 'assets', 'models')).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
for (const m of models) {
  if (!revServed[m]) problems.push(`index.html: no revision for ${m}.glb (it could be served stale)`);
  else if (revServed[m] !== revLocal[m]) problems.push(`${m}.glb: the site's revision differs from your local build (deployed a different build?)`);
}
// the version in the corner (vite.config.js): the commit the site was built from
const verServed = html.match(/<div id="ver">([^<]*)<\/div>/)?.[1];
const verLocal = readFileSync(join(DIST, 'index.html'), 'utf8').match(/<div id="ver">([^<]*)<\/div>/)?.[1];
if (!/^v\.[0-9a-f]{4}\+?$/.test(verServed || '')) problems.push(`index.html: version "${verServed}", want v.<4 hex>`);
else if (verServed !== verLocal) problems.push(`index.html: the site is ${verServed}, your local build is ${verLocal} (deployed a different build?)`);
else console.log(`✓ version ${verServed}${verServed.endsWith('+') ? ' (built with uncommitted changes)' : ''}`);

// every JS chunk and model, then the files that must not be served
for (const f of readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))) await check(`assets/${f}`, { status: 200, type: /javascript/, cache: IMMUTABLE });
for (const m of models) await check(`assets/models/${m}.glb${revServed[m] ? '?v=' + revServed[m] : ''}`, { status: 200, type: /model\/gltf-binary/, cache: IMMUTABLE });
await check('third-party-licenses.md', { status: 200, cache: REVALIDATE });
if (existsSync(join(DIST, 'sw.js'))) await check('sw.js', { status: 200, type: /javascript/, cache: REVALIDATE });
for (const p of ['.vite/manifest.json', '_headers', '.assetsignore', 'assets/models/does-not-exist.glb']) await check(p, { status: 404 });


// The service worker, in a real browser: after a first visit (and Begin), a second visit loads its models
// from the service worker's cache, and with the network gone a reload still reaches Begin.
if (existsSync(join(DIST, 'sw.js'))) {
  const { chromium } = await import('playwright-core');
  const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  if (!executablePath) problems.push('service worker: no Chrome to test with (set CHROME=)');
  else {
    const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const ready = () => page.waitForFunction(() => !document.getElementById('begin').disabled, null, { timeout: 90000 });
    try {
      await page.goto(base, { waitUntil: 'load' });
      await ready();
      await page.click('#begin', { force: true });
      // the service worker registers a few seconds into play, then caches everything in the background
      let n = 0;
      for (let i = 0; i < 180 && !n; i++) {
        await page.waitForTimeout(500);
        n = await page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg?.active?.state !== 'activated') return 0;
          const keys = await caches.keys();
          return keys.length ? (await (await caches.open(keys[0])).keys()).length : 0;
        });
      }
      if (!n) throw new Error('it never finished caching');
      let fromSW = 0,
        fromNet = 0;
      page.on('response', (r) => r.url().includes('/models/') && (r.fromServiceWorker() ? fromSW++ : fromNet++));
      await page.goto(base, { waitUntil: 'load' });
      await ready();
      const second = { controlled: await page.evaluate(() => !!navigator.serviceWorker.controller), fromSW, fromNet };
      await ctx.setOffline(true);
      await page.goto(base, { waitUntil: 'load' });
      await ready();
      await ctx.setOffline(false);
      console.log(`✓ service worker: ${n} files cached; second visit: ${second.fromSW} models from its cache, ${second.fromNet} from the network; an offline reload reaches Begin`);
      if (!second.controlled || second.fromNet > 0 || second.fromSW === 0) problems.push('service worker: the second visit was not served from its cache: ' + JSON.stringify(second));
    } catch (e) {
      problems.push('service worker: ' + e.message.split('\n')[0]);
    }
    await browser.close();
  }
}

let wire = 0;
for (const r of rows) {
  if (r.status === 200) wire += r.bytes;
  console.log(`${r.ok ? '✓' : '✗'} ${String(r.status).padEnd(4)} ${r.enc.padEnd(5)} ${kb(r.bytes).padStart(9)}  /${r.path}`);
}
console.log(`on the wire: ${kb(wire)} for every file (a first visit downloads only part of it; see npm run budget)`);
if (problems.length) {
  console.log('\nProblems:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('all good');
process.exit(0);
