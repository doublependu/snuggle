// SPDX-License-Identifier: GPL-3.0-only
// Time-to-interaction test: serves dist/ (gzip for text, .glb uncompressed like GitHub Pages),
// opens it in Chrome with CDP network + CPU throttling and a cold cache, and reports how long until
// the Begin button is enabled (window.__snuggle.readyAt). A first visit starts on the train; returning
// players start wherever their save is, so every zone is measured with a save placed there.
// Usage: npm run build && npm run perf
//   CHROME=/path/to/chrome  RUNS=5  ZONES=train,academy  node tools/perf/load-test.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const DIST = 'dist';
const RUNS = Number(process.env.RUNS || 5);
const PROFILES = [
  // "must pass": ≤ 3 s. 10 Mbps down, 60 ms RTT, 4x CPU slowdown (entry-level phone class)
  { name: 'must-pass (10 Mbps, 60 ms RTT, 4x CPU)', down: 10e6, up: 3e6, rtt: 60, cpu: 4, goal: 3000 },
  // "goal": ~1 s on a good connection and a mid-range machine
  { name: 'goal (50 Mbps, 20 ms RTT, 1x CPU)', down: 50e6, up: 10e6, rtt: 20, cpu: 1, goal: 1000 },
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  const file = join(DIST, p);
  try {
    await stat(file);
    let body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-store' };
    if (/text|javascript|json|svg/.test(type)) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ missing: run `npm run build` first');
  process.exit(1);
}
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const ZONES = (process.env.ZONES || 'train,station,academy,market').split(',');
// a save in each zone, as a returning player would have (story flags only matter after Begin)
const SAVES = {
  station: { prologueTrain: true },
  academy: { prologueTrain: true, prologueDone: true },
  market: { prologueTrain: true, prologueDone: true, ch1Done: true, ch2_start: true },
};
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-unsafe-swiftshader'],
});
let failed = false;
for (const zone of ZONES) for (const prof of PROFILES) {
  const times = [];
  let gpu = '';
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    if (zone !== 'train') {
      const save = { v: 2, zone, spawn: null, story: SAVES[zone] || {}, sprites: {}, soothed: {}, seen: {}, candies: {}, settings: {} };
      await page.addInitScript((s) => localStorage.setItem('snuggle-sorcery-save', s), JSON.stringify(save));
    }
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: prof.rtt, downloadThroughput: prof.down / 8, uploadThroughput: prof.up / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
    await page.goto(base + (zone === 'train' ? '?zone=train' : ''), { waitUntil: 'commit' });
    const ready = await page.waitForFunction(() => window.__snuggle?.readyAt, null, { timeout: 60000, polling: 50 }).then((h) => h.jsonValue());
    if (!gpu) gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    times.push(ready);
    await ctx.close();
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  const ok = med <= prof.goal;
  if (!ok && prof.goal >= 3000) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${zone.padEnd(8)} ${prof.name}: median TTI ${(med / 1000).toFixed(2)} s (runs: ${times.map((t) => (t / 1000).toFixed(2)).join(', ')}) target ${(prof.goal / 1000).toFixed(1)} s`);
  console.log(`    GPU: ${gpu}`);
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
