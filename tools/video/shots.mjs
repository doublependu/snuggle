// SPDX-License-Identifier: GPL-3.0-only
// Scenery for the trailer, the Short and the X video: the camera on a scripted path through a place, with the
// HUD hidden, recorded like a playthrough (tools/playtest/record.mjs) at 1920×1080 (or 1080×1920), 60 fps, with no
// sound (they go under the music).
// This is a camera operator, not a player: unlike tools/playtest it reaches into the game (window.__G, dev
// builds) to load a place in a given state of the story, stand Pip somewhere, and move the camera.
//
// A shot (tools/video/shots.json):
//   { id, zone, save (a starting point in tools/playtest/saves.mjs), spawn?, dur (s), portrait?,
//     pip?: { at: [x, y, z] | 'MARKER', facing (rad), anim? } | false (Pip out of sight),
//     cam: { orbit: 'MARKER' | [x, y, z], r, h, from, to (degrees), lookY? }
//        | { from: [x, y, z], to: [x, y, z], look: [x, y, z], lookTo? }   (positions may be 'MARKER+[dx,dy,dz]')
//     wait? (s to let the place settle), hideCast?: [npc ids] }
//
//   node tools/video/shots.mjs [--only a,b] [--stills] [--out tools/video/out/shots]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FROMS } from '../playtest/saves.mjs';
import { startRecording, finish } from '../playtest/record.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const OUT = opt('out', 'tools/video/out/shots');
const ONLY = opt('only') ? String(opt('only')).split(',') : null;
const STILLS = !!opt('stills');
const PORT = +opt('port', 5196);
const SHOTS = JSON.parse(readFileSync(new URL('shots.json', import.meta.url), 'utf8')).filter((s) => !ONLY || ONLY.includes(s.id));
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

try {
  for (const shot of SHOTS)
    await take(shot).catch((e) => {
      console.log(`✘ ${shot.id}: ${String(e.message || e).split('\n')[0]}`);
      return browser.contexts().at(-1)?.close();
    });
} finally {
  await browser.close();
  await server.close();
}

async function take(shot) {
  const view = shot.portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (s) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      if (s) localStorage.setItem('snuggle-sorcery-save', JSON.stringify(s));
      // no HUD, prompts, dialogue or version label: only the world
      addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: '#ui,#ver{display:none!important}' })));
    },
    { ...FROMS[shot.save], zone: shot.zone, spawn: shot.spawn || FROMS[shot.save].spawn },
  );
  // (no sound: the shots are scenery under the music in every edit)
  const dir = join(OUT, shot.id + '.tmp');
  mkdirSync(dir, { recursive: true });
  const q = `quality=high&capture&nosw&zone=${shot.zone}${shot.spawn ? '&spawn=' + shot.spawn : ''}`;
  await page.goto(`http://127.0.0.1:${PORT}/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('#begin')?.disabled, null, { timeout: 90000 });
  await page.click('#begin', { force: true });
  await page.waitForFunction(() => window.__G?.zone && window.__G.player && document.querySelector('#loading')?.classList.contains('gone'), null, { timeout: 90000 });
  await page.waitForTimeout((shot.wait ?? 4) * 1000);
  // stage it: Pip where the shot wants her (or out of sight), the cast it doesn't want hidden, the camera at
  // its first position
  await page.evaluate(
    ({ shot }) => {
      const G = window.__G;
      const V = G.camera.position.constructor;
      const at = (p) => {
        if (Array.isArray(p)) return new V(...p);
        const [name, off] = String(p).split('+');
        const m = G.zone.marker(name);
        if (!m) throw new Error('no marker ' + name);
        const o = off ? JSON.parse(off) : [0, 0, 0];
        return m.position.clone().add(new V(...o));
      };
      G.frozen = true;
      G.ui.closeDialogue?.();
      for (const id of shot.hideCast || []) G.npcs.get(id)?.hide?.();
      if (shot.pip === false) G.player.root.visible = false;
      else if (shot.pip) {
        G.player.teleport(at(shot.pip.at), shot.pip.facing || 0);
        if (shot.pip.anim) G.player.h.play(shot.pip.anim, 0);
      }
      const c = shot.cam;
      const ease = (k) => 0.5 - Math.cos(k * Math.PI) / 2;
      window.__camAt = (k) => {
        const e = ease(k);
        if (c.orbit) {
          const o = at(c.orbit);
          const a = ((c.from + (c.to - c.from) * e) * Math.PI) / 180;
          return [new V(o.x + Math.sin(a) * c.r, o.y + c.h, o.z + Math.cos(a) * c.r), new V(o.x, o.y + (c.lookY ?? 1.2), o.z)];
        }
        const look = c.lookTo ? at(c.look).lerp(at(c.lookTo), e) : at(c.look);
        return [at(c.from).lerp(at(c.to), e), look];
      };
      const [p0, l0] = window.__camAt(0);
      G.cam.setShot(p0, l0, 0.0001);
      // the path, frame by frame, once started
      window.__roll = (dur) =>
        new Promise((res) => {
          const t0 = performance.now();
          const tick = () => {
            const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
            const [p, l] = window.__camAt(k);
            G.cam.setShot(p, l, 0.0001);
            if (k < 1) requestAnimationFrame(tick);
            else res();
          };
          tick();
        });
    },
    { shot },
  );
  await page.waitForTimeout(1500);
  if (STILLS) {
    // three stills along the path, to compose the shot
    for (const k of [0, 0.5, 1]) {
      await page.evaluate((k) => {
        const [p, l] = window.__camAt(k);
        window.__G.cam.setShot(p, l, 0.0001);
      }, k);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${shot.id}-${k * 100}.jpg`), type: 'jpeg', quality: 85 });
    }
  } else {
    const rec = await startRecording(page, dir, { fps: 60, width: view.width, height: view.height });
    await page.waitForTimeout(300);
    await page.evaluate((d) => window.__roll(d), shot.dur);
    await page.waitForTimeout(300);
    const r = await rec.stop();
    const duration = (Date.now() - rec.t0) / 1000;
    await finish(dir, r, { duration, out: 'shot.mp4' });
    renameSync(join(dir, 'shot.mp4'), join(OUT, shot.id + '.mp4'));
  }
  rmSync(dir, { recursive: true, force: true });
  await ctx.close();
  console.log(`${errors.length ? '✘' : '✔'} ${shot.id}${errors.length ? ': ' + errors[0] : ''}`);
}
