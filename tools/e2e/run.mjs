// SPDX-License-Identifier: GPL-3.0-only
// End-to-end tests in headless Chrome (SwiftShader WebGL): boots the dev server, plays story paths with
// scripted input and checks the touch UI at phone sizes. Usage: npm run e2e [-- name-filter ...]
//   CHROME=/path/to/chrome  HEADED=1  npm run e2e -- train
// The game exposes window.__G in dev builds only (src/main.js). Screenshots go to tools/e2e/out/.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { TESTS } from './tests.mjs';

const PORT = 5199;
const OUT = 'tools/e2e/out';
mkdirSync(OUT, { recursive: true });
const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
if (!executablePath) {
  console.error('No Chrome found: set CHROME=/path/to/chrome');
  process.exit(1);
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({
  executablePath,
  headless: !process.env.HEADED,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const filter = process.argv.slice(2);
const tests = TESTS.filter((t) => !filter.length || filter.some((f) => t.name.includes(f)));
let failed = 0;
for (const t of tests) {
  const started = Date.now();
  const ctx = await browser.newContext({
    viewport: t.viewport || { width: 1280, height: 720 },
    hasTouch: !!t.touch,
    isMobile: !!t.touch,
    deviceScaleFactor: t.touch ? 2 : 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const h = helpers(page, t);
  try {
    await t.run(h);
    const real = errors.filter((e) => !/favicon|AudioContext|Failed to load resource/.test(e));
    if (real.length) throw new Error('console errors:\n  ' + real.join('\n  '));
    console.log(`✔ ${t.name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++;
    console.log(`✘ ${t.name}: ${e.message}`);
    if (errors.length) console.log('  page errors:\n    ' + errors.slice(-8).join('\n    '));
    await page.screenshot({ path: `${OUT}/FAIL-${t.name}.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
await server.close();
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);

function helpers(page, t) {
  const h = {
    page,
    OUT,
    url: (q = '') => `http://127.0.0.1:${PORT}/${q}`,
    // Load the game with an optional starting save (object, or null for a fresh game).
    async open(q = '', save = null) {
      await page.addInitScript((s) => {
        if (window.__seeded) return;
        window.__seeded = true;
        localStorage.clear();
        if (s) localStorage.setItem('snuggle-sorcery-save', JSON.stringify(s));
      }, save);
      await page.goto(h.url(q), { waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('begin').disabled, null, { timeout: 120000 });
    },
    async begin() {
      if (t.touch) await page.tap('#begin', { force: true });
      else await page.click('#begin', { force: true });
      await page.waitForFunction(() => window.__G && !window.__G.paused && getComputedStyle(document.getElementById('loading')).visibility === 'hidden', null, { timeout: 10000 });
    },
    eval: (fn, arg) => page.evaluate(fn, arg),
    // Poll a page predicate (a function string or function) until true; optional per-tick action.
    async until(pred, { timeout = 60000, tick = null, every = 150 } = {}) {
      const end = Date.now() + timeout;
      for (;;) {
        const v = await page.evaluate(pred);
        if (v) return v;
        if (Date.now() > end) throw new Error('timed out waiting for ' + String(pred).slice(0, 120));
        if (tick) await tick();
        await page.waitForTimeout(every);
      }
    },
    // Advance any open dialogue (keyboard Enter, or a tap on the dialogue box on touch).
    async skipDialogue() {
      const open = await page.evaluate(() => window.__G.ui.dialogueOpen);
      if (!open) return false;
      await page.evaluate(() => {
        const G = window.__G;
        const first = G.ui.dlgChoices.firstElementChild;
        if (first) first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        else G.ui.advance = true;
      });
      return true;
    },
    // What is on top at the centre of an element (the element itself, or whatever covers it).
    async hit(selector) {
      return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { missing: sel };
        el.scrollIntoView({ block: 'nearest' });
        const b = el.getBoundingClientRect();
        const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { ok: !!top && (top === el || el.contains(top)), top: top ? top.className || top.tagName : null };
      }, selector);
    },
    assert(cond, msg) {
      if (!cond) throw new Error(msg);
    },
    // Every visible character's head is on straight: the neck no more than 25° from its pose (no clip moves
    // it; the look-at turns it at most ~22°), and the head's up axis within 50° of vertical (clips tilt it
    // up to 24°, plus the look-at's nod). Characters playing 'overwhelmed' (59°) are skipped.
    heads: () => page.evaluate(HEADS),
    async headsUpright(where = '') {
      const bad = (await h.heads()).filter((r) => r.neck > 25 || r.tilt > 50);
      h.assert(!bad.length, `heads not upright${where && ' ' + where}: ` + bad.map((r) => `${r.id} neck ${r.neck}° tilt ${r.tilt}°`).join(', '));
    },
    // Record each character's worst neck turn and head tilt, every frame, until the zone changes.
    async watchHeads() {
      await page.evaluate(`window.__heads = ${HEADS}; window.__worst = {}; window.__G.updaters.add(() => {
        for (const r of window.__heads()) {
          const w = (window.__worst[r.id] ||= { neck: 0, tilt: 0 });
          w.neck = Math.max(w.neck, r.neck);
          w.tilt = Math.max(w.tilt, r.tilt);
        }
      });`);
    },
    // The worst seen since watchHeads() or the last call, then start again.
    worstHeads: () =>
      page.evaluate(() => {
        const w = window.__worst;
        window.__worst = {};
        return w;
      }),
  };
  return h;
}

// In the page: each visible character's neck turn away from its clip pose and head tilt from vertical, in
// degrees. Head bones point straight up in the bind pose; no clip animates the neck, so its pose is its rest.
function HEADS() {
  const G = window.__G;
  const list = [['xiaopei', G.player?.h], ...[...G.npcs].filter(([, n]) => !n.hidden).map(([id, n]) => [id, n.h])];
  return list
    .filter(([, h]) => h?.bones.neck && h.bones.head && h.base?.getClip().name !== 'overwhelmed')
    .map(([id, h]) => {
      const rest = h.clips.idle.tracks.find((t) => t.name === 'neck.quaternion').values;
      const q = h.bones.neck.quaternion;
      const dot = Math.min(1, Math.abs(q.x * rest[0] + q.y * rest[1] + q.z * rest[2] + q.w * rest[3]));
      h.bones.head.updateWorldMatrix(true, false);
      const e = h.bones.head.matrixWorld.elements;
      const deg = (r) => Math.round((r * 180) / Math.PI);
      return { id, neck: deg(2 * Math.acos(dot)), tilt: deg(Math.acos(e[5] / Math.hypot(e[4], e[5], e[6]))) };
    });
}
