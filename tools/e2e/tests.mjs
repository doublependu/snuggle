// SPDX-License-Identifier: GPL-3.0-only
// Test cases for tools/e2e/run.mjs. Each gets helpers (see run.mjs): open, begin, eval, until,
// skipDialogue, hit, assert. Saves are plain objects in the save.js v2 format.

const base = (over = {}) => ({
  v: 2, zone: 'train', spawn: 'SPAWN_start', story: {}, sprites: {}, soothed: {}, seen: {}, helper: null,
  cozy: 0, tarts: 0, chestnuts: 0, candies: {}, settings: { volume: 0, music: 0, sensitivity: 1, invertY: false, reducedMotion: true, humToggle: false, quality: 'low' },
  ...over,
});

// Keep skipping dialogue and run `act` each tick until the game reaches `zone`.
async function playUntilZone(h, zone, act = async () => {}, timeout = 240000) {
  await h.until(`window.__G.zone?.id === '${zone}' && !window.__G.frozen`, {
    timeout,
    every: 120,
    tick: async () => {
      if (!(await h.skipDialogue())) await act();
    },
  });
}

const PHONES = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
];

export const TESTS = [
  // The prologue played with real input: walk down the aisle, hum at the cloud, notice it, arrive.
  {
    name: 'train-normal',
    async run(h) {
      await h.open('?zone=train', base());
      await h.begin();
      const { page } = h;
      let humming = false;
      await playUntilZone(h, 'station', async () => {
        const s = await h.eval(() => {
          const G = window.__G;
          const c = G.zone?.cloud;
          return { enabled: c?.enabled, soothed: c?.soothed, dist: c ? c.position.distanceTo(G.player.position) : 99, frozen: G.frozen, prompt: G.interact.current?.label };
        });
        if (s.frozen) return;
        if (s.prompt === 'Notice') await page.keyboard.press('KeyF');
        if (s.dist > 3.2 && !s.soothed) await page.keyboard.down('KeyW');
        else await page.keyboard.up('KeyW');
        if (s.enabled && !s.soothed && !humming) {
          await page.keyboard.down('KeyE');
          humming = true;
        }
      });
      await page.keyboard.up('KeyE');
      const save = await h.eval(() => window.__G.save);
      h.assert(save.sprites.cloud === 1 && save.sprites.doudou === 1, 'sprites ' + JSON.stringify(save.sprites));
      h.assert(save.story.prologueTrain, 'prologueTrain flag missing');
    },
  },

  // The playtest bug: the cloud gets soothed before the script asks for it. The story must still move on.
  {
    name: 'train-rush',
    async run(h) {
      await h.open('?zone=train', base());
      await h.begin();
      let rushed = false;
      await playUntilZone(h, 'station', async () => {
        if (rushed) return;
        rushed = await h.eval(() => {
          const c = window.__G.zone?.cloud;
          if (!c?.enabled) return false;
          c.wrap(1); // soothed at once: noticed and wrapped before the script's notice step
          return true;
        });
      });
      const save = await h.eval(() => window.__G.save);
      h.assert(save.sprites.cloud === 1, 'cloud count ' + save.sprites.cloud);
    },
  },

  // Reload between the soothe and the arrival: resume at the lap scene, no second cloud.
  {
    name: 'train-reload',
    async run(h) {
      await h.open('?zone=train', base({ story: { train_intro: true }, sprites: { cloud: 1 }, soothed: { 'train:cloud': true }, seen: { cloud: true }, helper: 'cloud' }));
      h.assert(await h.eval(() => window.__G.zone.cloud === null), 'the soothed cloud respawned');
      await h.begin();
      await h.until(() => window.__G.ui.dialogueOpen && window.__G.player.state === 'sit', { timeout: 20000 });
      // Pip looks round at the auntie while she talks
      await h.until(() => window.__G.player.speaker?.id === 'auntie', { timeout: 10000, tick: () => h.skipDialogue() });
      await h.page.waitForTimeout(3000);
      await h.headsUpright('while the auntie talks');
      await playUntilZone(h, 'station');
      const r = await h.eval(() => ({ sprites: window.__G.save.sprites, followers: window.__G.sprites.list.map((s) => s.id) }));
      h.assert(r.sprites.cloud === 1 && r.sprites.doudou === 1, 'sprites ' + JSON.stringify(r.sprites));
      h.assert(r.followers.length === 1, 'followers ' + r.followers);
    },
  },

  // A v1 save from the playtest (two clouds from the reload bug) is migrated, not wiped.
  {
    name: 'save-migrate-v1',
    async run(h) {
      await h.open('', { v: 1, zone: 'train', spawn: 'SPAWN_start', story: {}, sprites: { cloud: 2 }, seen: { cloud: true }, helper: 'cloud', cozy: 12, tarts: 0, candies: {}, settings: {} });
      const s = await h.eval(() => ({ save: window.__G.save, cloud: window.__G.zone.cloud, followers: window.__G.sprites.list.length }));
      h.assert(s.save.v === 2 && s.save.cozy === 12, 'save was not migrated: ' + JSON.stringify(s.save));
      h.assert(s.save.sprites.cloud === 1 && s.save.soothed['train:cloud'], 'cloud not fixed: ' + JSON.stringify(s.save));
      h.assert(s.cloud === null && s.followers === 1, 'cloud respawned or duplicate followers');
    },
  },

  // Seated characters: knees just past the seat's front edge, shins and feet in front of it.
  ...[
    ['train', 'NPC_'],
    ['academy', 'NPC_'],
  ].map(([zone]) => ({
    name: 'seats-' + zone,
    async run(h) {
      const story = zone === 'academy' ? { prologueTrain: true, prologueDone: true, ch1_welcome: true, ch1_lesson: true } : { train_intro: true };
      await h.open(`?zone=${zone}`, base({ zone, story }));
      await h.eval(() => window.__G.zone.streamed);
      const rows = await h.eval(() => {
        const G = window.__G;
        const out = [];
        for (const m of G.zone.markersBy('NPC_')) {
          if (m.data.anim !== 'sit') continue;
          const n = G.npcs.get(m.name.slice(4));
          n.h.update(0.016);
          n.root.updateMatrixWorld(true);
          const fx = Math.sin(m.facing),
            fz = Math.cos(m.facing);
          const ahead = (b) => {
            const p = n.h.bones[b].getWorldPosition(m.position.clone());
            return (p.x - m.position.x) * fx + (p.z - m.position.z) * fz;
          };
          out.push({ id: n.id, knee: Math.min(ahead('shin_L'), ahead('shin_R')), foot: Math.min(ahead('foot_L'), ahead('foot_R')), hips: ahead('hips') });
        }
        return out;
      });
      h.assert(rows.length > 0, 'no seated NPCs');
      for (const r of rows) {
        h.assert(r.knee >= 0 && r.knee < 0.12, `${r.id}: knee ${r.knee.toFixed(3)} m from the seat edge`);
        h.assert(r.foot >= -0.03, `${r.id}: feet inside the seat (${r.foot.toFixed(3)})`);
        h.assert(r.hips < 0, `${r.id}: hips in front of the seat`);
      }
      await h.begin();
      // side view of each seated character for review (from whichever side has room for the camera)
      const n = rows.length;
      for (let i = 0; i < n; i++) {
        await h.eval((i) => {
          const G = window.__G;
          const m = G.zone.markersBy('NPC_').filter((x) => x.data.anim === 'sit')[i];
          const V = G.player.position.constructor;
          const at = m.position.clone().setY(m.position.y + 0.5);
          let eye = null;
          for (const k of [1, -1]) {
            const side = m.facing + (k * Math.PI) / 2;
            const dir = new V(Math.sin(side), 0.25, Math.cos(side)).normalize();
            if (G.collision.raycast(at, dir, 1.7) === Infinity) {
              eye = at.clone().addScaledVector(dir, 1.6);
              break;
            }
          }
          G.cam.setShot(eye || at.clone().add(new V(0, 1.2, 1.2)), at.clone().setY(at.y - 0.05), 0.01);
          document.getElementById('ui').style.visibility = 'hidden';
        }, i);
        await h.page.waitForTimeout(400);
        await h.page.screenshot({ path: `${h.OUT}/seats-${zone}-${i}.png` });
      }
    },
  })),

  // Phones: every HUD, menu and dialogue-choice button must be the element that gets the tap.
  ...PHONES.map((ph) => ({
    name: 'touch-hit-' + ph.name,
    touch: true,
    viewport: ph.viewport,
    async run(h) {
      // at the largest text size, so every button must still fit and be tappable
      await h.open('?zone=train', base({ story: { train_intro: true }, settings: { ...base().settings, textSize: 1.5 } }));
      await h.begin();
      h.assert(await h.eval(() => document.body.classList.contains('touch')), 'not in touch mode');
      h.assert(await h.eval(() => getComputedStyle(document.documentElement).getPropertyValue('--ts').trim() === '1.5'), 'text size not applied');
      for (const sel of ['.hud-tr .round:nth-child(1)', '.hud-tr .round:nth-child(2)']) {
        const r = await h.hit(sel);
        h.assert(r.ok, `${sel} is covered by ${r.top}`);
      }
      // tap Pause for real, then every pause-menu button
      const pause = await h.page.$('.hud-tr .round:nth-child(2)');
      const b = await pause.boundingBox();
      await h.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await h.until(() => window.__G.menus.open, { timeout: 3000 });
      for (const a of ['resume', 'book', 'settings', 'controls', 'checkpoint', 'report', 'restart']) {
        const r = await h.hit(`#menu-pause [data-a="${a}"]`);
        h.assert(r.ok, `pause menu "${a}" is covered by ${r.top}`);
      }
      // "Start again" asks in the game's own panel (not the browser's confirm box); Cancel goes back
      const tapSel = async (sel) => {
        const bb = await (await h.page.$(sel)).boundingBox();
        await h.page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      };
      await tapSel('#menu-pause [data-a="restart"]');
      await h.until(() => document.getElementById('menu-restart').classList.contains('show'), { timeout: 3000 });
      for (const a of ['back', 'restart-yes']) {
        const r = await h.hit(`#menu-restart [data-a="${a}"]`);
        h.assert(r.ok, `start-again "${a}" is covered by ${r.top}`);
      }
      await tapSel('#menu-restart [data-a="back"]');
      await h.until(() => document.getElementById('menu-pause').classList.contains('show'), { timeout: 3000 });
      const res = await (await h.page.$('#menu-pause [data-a="resume"]')).boundingBox();
      await h.page.touchscreen.tap(res.x + res.width / 2, res.y + res.height / 2);
      await h.until(() => !window.__G.menus.open && !window.__G.paused, { timeout: 3000 });
      // dialogue choices
      await h.eval(() => {
        window.__choice = window.__G.ui.say('tangtang', 'Pick one?', { choices: ['First', 'Second'] });
        window.__choice.then((i) => (window.__picked = i));
        window.__G.ui.advance = true;
      });
      await h.until(() => window.__G.ui.dlgChoices.childElementCount === 2, { timeout: 5000 });
      const second = await (await h.page.$('.choices button:nth-child(2)')).boundingBox();
      const r = await h.hit('.choices button:nth-child(2)');
      h.assert(r.ok, 'dialogue choice covered by ' + r.top);
      await h.page.touchscreen.tap(second.x + second.width / 2, second.y + second.height / 2);
      await h.until(() => window.__picked === 1, { timeout: 3000 });
      await h.page.screenshot({ path: `${h.OUT}/touch-${ph.name}.png` });
    },
  })),

  // The game pauses itself when the tab is hidden (switching apps); Resume must work by touch.
  {
    name: 'touch-auto-pause-resume',
    touch: true,
    viewport: { width: 844, height: 390 },
    async run(h) {
      await h.open('?zone=train', base({ story: { train_intro: true } }));
      await h.begin();
      await h.eval(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await h.until(() => window.__G.menus.open, { timeout: 3000 });
      const res = await (await h.page.$('#menu-pause [data-a="resume"]')).boundingBox();
      await h.page.touchscreen.tap(res.x + res.width / 2, res.y + res.height / 2);
      await h.until(() => !window.__G.paused, { timeout: 3000 });
      h.assert(await h.eval(() => !!localStorage.getItem('snuggle-sorcery-save')), 'no autosave on hide');
    },
  },

  // Pause menu > Start again: back to the very start of the story on the train, settings kept. (The unload
  // autosave used to write the old progress straight back during the reload.) Also with ?zone= in the URL.
  ...[
    ['restart-to-train', '?zone=market'],
    ['restart-url', '?zone=academy&spawn=SPAWN_gate'],
  ].map(([name, q]) => ({
    name,
    async run(h) {
      const zone = new URLSearchParams(q).get('zone');
      const settings = { ...base().settings, volume: 0.3, sensitivity: 1.7 };
      await h.open(q, base({ zone, spawn: 'SPAWN_start', tarts: 2, cozy: 55, sprites: { doudou: 1, cloud: 1, sparrow: 3 }, soothed: { 'train:cloud': true }, story: { ...CH1_DONE, ch2_start: true, ch2Done: true }, settings }));
      await h.begin();
      await h.eval(() => window.__G.menus.togglePause());
      await h.page.click('#menu-pause [data-a="restart"]');
      await h.reloaded(() => h.page.click('#menu-restart [data-a="restart-yes"]'));
      const s = await h.eval(() => ({ zone: window.__G.zone.id, url: location.search, save: window.__G.save, stored: JSON.parse(localStorage.getItem('snuggle-sorcery-save')) }));
      h.assert(s.zone === 'train', 'started again in ' + s.zone);
      h.assert(!/zone=|spawn=/.test(s.url), 'zone parameters kept: ' + s.url);
      for (const save of [s.save, s.stored]) {
        h.assert(save.zone === 'train' && !Object.keys(save.story).length && !Object.keys(save.sprites).length && !Object.keys(save.soothed).length, 'progress kept: ' + JSON.stringify(save));
        h.assert(save.cozy === 0 && save.tarts === 0, 'cozy / tarts kept');
        h.assert(save.settings.volume === 0.3 && save.settings.sensitivity === 1.7 && save.settings.quality === 'low', 'settings lost: ' + JSON.stringify(save.settings));
      }
      // Begin: the train intro plays from the very start
      await h.begin();
      await h.until(() => window.__G.ui.dialogueOpen, { timeout: 15000 });
      h.assert(!(await h.eval(() => window.__G.save.story.train_intro)), 'intro already seen');
    },
  })),

  // Controls > Change controls: rebind Hum to F (Notice / talk had F, so it takes E: a swap), it works at
  // once, the Controls table and the hints follow, it survives a reload, and Reset puts the defaults back.
  {
    name: 'controls-remap',
    async run(h) {
      await h.open('?zone=train', base({ story: { train_intro: true } }));
      await h.begin();
      await h.eval(() => window.__G.menus.togglePause());
      await h.page.click('#menu-pause [data-a="controls"]');
      await h.page.click('#menu-controls [data-a="remap"]');
      await h.until(() => document.getElementById('menu-remap')?.classList.contains('show'), { timeout: 5000 });
      await h.page.click('#menu-remap [data-r="key:hum"]');
      await h.page.keyboard.press('KeyF');
      const b = await h.eval(() => ({ hum: window.__G.input.keyBind.hum[0], interact: window.__G.input.keyBind.interact[0], saved: window.__G.save.settings.keys }));
      h.assert(b.hum === 'KeyF' && b.interact === 'KeyE', 'rebinding / swap: ' + JSON.stringify(b));
      await h.page.click('#menu-remap [data-a="back"]'); // back to Controls
      await h.page.waitForTimeout(300);
      const table = await h.eval(() => document.querySelector('#menu-controls tbody').textContent);
      h.assert(/Hold F/.test(table) && /E or Enter/.test(table), 'controls table: ' + table);
      await h.eval(() => window.__G.menus.resume());
      await h.page.keyboard.down('KeyF');
      await h.page.waitForTimeout(200);
      const held = await h.eval(() => window.__G.input.humHeld);
      await h.page.keyboard.up('KeyF');
      h.assert(held, 'F does not hum');
      h.assert((await h.eval(() => window.__G.input.label('hum'))) === 'F', 'hint label');
      await h.reloaded(() => h.page.reload());
      h.assert((await h.eval(() => window.__G.input.keyBind.hum[0])) === 'KeyF', 'binding lost after a reload');
      await h.begin();
      await h.eval(() => window.__G.menus.togglePause());
      await h.page.click('#menu-pause [data-a="controls"]');
      await h.page.click('#menu-controls [data-a="remap"]');
      await h.until(() => document.getElementById('menu-remap')?.classList.contains('show'), { timeout: 5000 });
      await h.page.click('#menu-remap [data-r="reset"]');
      const r = await h.eval(() => ({ hum: window.__G.input.keyBind.hum[0], saved: window.__G.save.settings.keys }));
      h.assert(r.hum === 'KeyE' && !Object.keys(r.saved).length, 'reset: ' + JSON.stringify(r));
    },
  },

  // Pause menu > Copy bug report: device, state, errors and the save in one block of text.
  {
    name: 'bug-report',
    async run(h) {
      await h.open('?zone=train', base({ story: { train_intro: true } }));
      await h.begin();
      await h.eval(() => window.__G.menus.togglePause());
      await h.page.click('#menu-pause [data-a="report"]');
      const text = await h.eval(() => document.querySelector('#menu-report textarea').value);
      for (const k of ['version: v.dev', 'ua:', 'gpu:', 'quality:', 'zone: train', 'errors:', 'save: {']) h.assert(text.includes(k), 'report is missing ' + k);
    },
  },

  // The version label (index.html #ver): above the loading screen, then under the UI in a corner nothing
  // else uses (bottom-right; bottom-left on touch screens, where Hum is), clear of every HUD and touch control.
  ...[{ name: 'desktop' }, ...PHONES.map((ph) => ({ ...ph, touch: true }))].map((d) => ({
    name: 'version-corner-' + d.name,
    touch: d.touch,
    viewport: d.viewport,
    async run(h) {
      const where = () =>
        h.eval(() => {
          const el = document.getElementById('ver');
          const s = getComputedStyle(el);
          const v = el.getBoundingClientRect();
          // every HUD and touch control on screen, with the optional ones filled in
          const covered = [];
          for (const c of document.querySelectorAll('.hud-tl, .objective, .hud-tr, .helper, .tbtn, .dialogue')) {
            const cs = getComputedStyle(c);
            const b = c.getBoundingClientRect();
            if (cs.visibility === 'hidden' || +cs.opacity === 0 || !b.width || !b.height) continue;
            if (b.left < v.right && v.left < b.right && b.top < v.bottom && v.top < b.bottom) covered.push(c.className);
          }
          return {
            text: el.textContent,
            z: +s.zIndex,
            taps: s.pointerEvents !== 'none',
            shown: s.display !== 'none' && +s.opacity > 0 && v.width > 0,
            left: v.left,
            right: innerWidth - v.right,
            bottom: innerHeight - v.bottom,
            covered,
          };
        });
      await h.open('?zone=train', base({ story: { train_intro: true } }));
      let r = await where();
      h.assert(r.text === 'v.dev', 'version label says ' + JSON.stringify(r.text));
      h.assert(r.shown && !r.taps, 'version label hidden or takes taps: ' + JSON.stringify(r));
      h.assert(r.z > 50, 'version label is under the loading screen: z ' + r.z);
      await h.begin();
      await h.eval(() => {
        const G = window.__G;
        G.ui.setHelper('Charm Sprite', '', 'A helper');
        G.ui.setObjective('Find the version label');
        G.ui.say('tangtang', 'Is the corner still free?');
        for (const b of document.querySelectorAll('.tbtn')) b.textContent ||= 'Act';
      });
      await h.until(() => window.__G.ui.dialogueOpen, { timeout: 3000 });
      r = await where();
      h.assert(r.shown && !r.taps, 'version label hidden or takes taps: ' + JSON.stringify(r));
      h.assert(r.z > 0 && r.z < 20, 'version label is not under the UI (#ui is 20): z ' + r.z);
      h.assert(r.bottom >= 0 && r.bottom <= 10 && (d.touch ? r.left >= 0 && r.left <= 10 : r.right >= 0 && r.right <= 10), `version label not in its corner: ${JSON.stringify(r)}`);
      h.assert(!r.covered.length, 'version label overlaps ' + r.covered.join(', '));
      await h.page.screenshot({ path: `${h.OUT}/version-${d.name}.png` });
    },
  })),

  // Friends following Pip through the academy: they keep up, turn corners and never get lost.
  {
    name: 'followers-academy',
    async run(h) {
      await h.open('?zone=academy&spawn=SPAWN_gate', base({ zone: 'academy', story: { prologueTrain: true, prologueDone: true, ch1_welcome: true, ch1_lesson: true } }));
      await h.begin();
      await h.eval(() => {
        const G = window.__G;
        for (const [id, slot] of [['tangtang', { x: 1.3, z: 0.5 }], ['weibao', { x: -1.3, z: 0.8 }]]) {
          const n = G.npcs.get(id);
          const p = G.player.position;
          n.root.position.set(p.x + slot.x, p.y, p.z + 1.5);
          n.follow(slot);
        }
        window.__far = 0;
        G.updaters.add(() => {
          for (const id of ['tangtang', 'weibao']) window.__far = Math.max(window.__far, G.npcs.get(id).position.distanceTo(G.player.position));
        });
      });
      const walk = async (yaw, ms) => {
        await h.eval((y) => (window.__G.cam.yaw = y), yaw);
        await h.page.keyboard.down('KeyW');
        await h.page.waitForTimeout(ms);
        await h.page.keyboard.up('KeyW');
      };
      // up the main path, then left toward the kitchen, then back
      await walk(Math.PI, 7000);
      await walk(Math.PI / 2, 5000);
      await walk(0, 4000);
      await h.page.waitForTimeout(2500);
      const r = await h.eval(() => {
        const G = window.__G;
        return { far: window.__far, now: ['tangtang', 'weibao'].map((id) => G.npcs.get(id).position.distanceTo(G.player.position)) };
      });
      h.assert(Math.max(...r.now) < 3.5, 'friends did not catch up: ' + r.now.map((d) => d.toFixed(1)));
      h.assert(r.far < 13, 'a friend fell far behind: ' + r.far.toFixed(1));
      await h.page.screenshot({ path: `${h.OUT}/followers.png` });
      await h.headsUpright('after following');
    },
  },

  // The playtest bug (plan 3): the look-at piled its turn onto the neck every frame, since no clip moves the
  // neck and the mixer never reset it. Pip's head spun while Sunny talked; Sunny's folded into
  // her chest and stayed there. Talk from her side, walk away (heads come back), then walk with friends.
  {
    name: 'look-no-drift',
    async run(h) {
      await h.open('?zone=academy&spawn=SPAWN_gate', base({ zone: 'academy', story: { prologueTrain: true, prologueDone: true, ch1_welcome: true, ch1_lesson: true } }));
      await h.begin();
      await h.watchHeads();
      // Pip 1.4 m to Sunny's side, turned 70° away from her, while Sunny talks
      await h.eval(() => {
        const G = window.__G;
        const t = G.npcs.get('tangtang');
        const p = t.position.clone();
        p.x += Math.cos(t.facing) * 1.4;
        p.z -= Math.sin(t.facing) * 1.4;
        G.player.teleport(p, Math.atan2(t.position.x - p.x, t.position.z - p.z) + 1.22);
        G.cam.snapBehind(G.player);
        G.ui.say('tangtang', 'Hold still, I want to see if the tarts are done.');
      });
      await h.worstHeads(); // the teleport frame
      await h.page.waitForTimeout(15000);
      const talk = await h.worstHeads();
      const bad = Object.entries(talk).filter(([, w]) => w.neck > 25 || w.tilt > 50);
      h.assert(!bad.length, 'heads drifted while Sunny talked: ' + JSON.stringify(Object.fromEntries(bad)));
      h.assert(talk.xiaopei?.neck >= 5, 'Pip never looked at Sunny: ' + JSON.stringify(talk.xiaopei));
      await h.page.screenshot({ path: `${h.OUT}/look-tangtang.png` });
      // end the line and walk off: both necks come back to their pose
      await h.skipDialogue();
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('SPAWN_gate').position, 0);
        G.cam.snapBehind(G.player);
      });
      await h.page.waitForTimeout(1500);
      const back = Object.fromEntries((await h.heads()).map((r) => [r.id, r.neck]));
      h.assert(back.xiaopei <= 1 && back.tangtang <= 1, 'necks did not come back: ' + JSON.stringify(back));
      // friends at her elbows look at her the whole walk
      await h.eval(() => {
        const G = window.__G;
        for (const [id, slot] of [['tangtang', { x: 1.3, z: 0.5 }], ['weibao', { x: -1.3, z: 0.8 }]]) {
          const p = G.player.position;
          G.npcs.get(id).root.position.set(p.x + slot.x, p.y, p.z + 1.5);
          G.npcs.get(id).follow(slot);
        }
      });
      await h.worstHeads();
      for (const [yaw, ms] of [[Math.PI, 5000], [Math.PI / 2, 4000]]) {
        await h.eval((y) => (window.__G.cam.yaw = y), yaw);
        await h.page.keyboard.down('KeyW');
        await h.page.waitForTimeout(ms);
        await h.page.keyboard.up('KeyW');
      }
      await h.page.waitForTimeout(3000);
      const walk = await h.worstHeads();
      const badWalk = Object.entries(walk).filter(([, w]) => w.neck > 25 || w.tilt > 50);
      h.assert(!badWalk.length, 'heads drifted while following: ' + JSON.stringify(Object.fromEntries(badWalk)));
    },
  },

  // Chapter 2: sit with the lantern-stall flock, point out a free good thing, hum: all three sparrows sleep.
  {
    name: 'market-flock',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', tarts: 3, story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true } }));
      await h.begin();
      await sitAt(h, 1);
      await h.until(() => window.__G.zone.flocks[0].sparrows.every((g) => g.perched), { timeout: 15000 });
      await h.page.keyboard.press('Digit1');
      await h.page.keyboard.down('KeyE');
      await h.page.waitForTimeout(1500);
      await h.page.screenshot({ path: `${h.OUT}/market-flock.png` });
      await h.headsUpright('with the flock');
      await h.until(() => window.__G.save.story.flock1Done, { timeout: 60000 });
      await h.page.keyboard.up('KeyE');
      const s = await h.eval(() => ({ sprites: window.__G.save.sprites.sparrow, state: window.__G.player.state }));
      h.assert(s.sprites === 3, 'sparrow sprites ' + s.sprites);
      await h.until(() => window.__G.player.state === 'move', { timeout: 20000, tick: () => h.skipDialogue() });
    },
  },

  // Team-up: a snack, then Echo Friend, then Hum: "Everyone Together!" soothes the whole flock at once.
  {
    name: 'market-combo',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', tarts: 3, cozy: 60, story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true } }));
      await h.begin();
      await sitAt(h, 1);
      await h.until(() => window.__G.zone.flocks[0].sparrows.every((g) => g.perched), { timeout: 15000 });
      await h.page.keyboard.press('Digit2');
      await h.page.keyboard.press('KeyQ');
      await h.page.waitForTimeout(700);
      await h.page.keyboard.press('KeyQ');
      await h.page.waitForTimeout(300);
      await h.eval(() => (window.__combo = null, window.__G.events.on('combo', (n) => (window.__combo = n))));
      await h.page.keyboard.down('KeyE');
      await h.until(() => window.__combo, { timeout: 5000 });
      const name = await h.eval(() => window.__combo);
      h.assert(name === 'Everyone Together!', 'combo was ' + name);
      await h.until(() => window.__G.save.story.flock1Done, { timeout: 15000 });
      await h.page.keyboard.up('KeyE');
    },
  },
  // Chestnut roasting: stir on the beat, take every chestnut out; bags of chestnuts become a snack.
  {
    name: 'market-chestnuts',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true } }));
      await h.begin();
      await h.eval(() => window.__G.zone.streamed);
      await h.eval(() => {
        const G = window.__G;
        const n = G.npcs.get('chestnut');
        G.player.teleport(n.position.clone().add({ x: 0, y: 0, z: 1.6 }), Math.PI);
        G.cam.snapBehind(G.player);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      // accept, then play: take each chestnut out when it glows golden
      await h.until(() => document.querySelector('.nuts'), { timeout: 15000, tick: () => h.skipDialogue() });
      await h.page.screenshot({ path: `${h.OUT}/market-chestnuts.png` });
      await h.until(() => !document.querySelector('.nuts'), {
        timeout: 40000,
        every: 60,
        tick: () => h.eval(() => document.querySelectorAll('.nut.gold:not(.out)').forEach((b) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))),
      });
      await h.until(() => !window.__G.frozen, { timeout: 10000, tick: () => h.skipDialogue() });
      const s = await h.eval(() => window.__G.save);
      h.assert(s.chestnuts >= 3 && s.story.chestnutDone, 'chestnuts ' + s.chestnuts);
    },
  },

  // Floating lanterns from the pier: eight releases on the beat; they stay on the water.
  {
    name: 'market-lanterns',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true, lanternTalk: true } }));
      await h.begin();
      await h.eval(() => {
        const G = window.__G;
        const m = G.zone.marker('POINT_launch');
        G.player.teleport(m.position.clone().add({ x: 0, y: 0, z: -1 }), 0);
        G.cam.snapBehind(G.player);
      });
      await h.until(() => window.__G.interact.current?.label === 'Float lanterns', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await h.until(() => document.querySelector('.lanterns'), { timeout: 5000 });
      await h.until(() => !document.querySelector('.lanterns'), { timeout: 40000, every: 400, tick: () => h.page.keyboard.press('KeyE') });
      await h.page.waitForTimeout(2500);
      await h.page.screenshot({ path: `${h.OUT}/market-lanterns.png` });
      const n = await h.eval(() => window.__G.save.story.lanternsFloated);
      h.assert(n === 8, 'floated ' + n);
    },
  },

  // A lost child: with a sparrow sprite as helper (Guide), lead them to their parent.
  {
    name: 'market-guide',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', helper: 'sparrow', sprites: { sparrow: 3 }, seen: { sparrow: true }, story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true, flock1Done: true } }));
      await h.begin();
      await h.eval(() => window.__G.zone.streamed);
      await h.eval(() => {
        const G = window.__G;
        const k = G.npcs.get('kid3');
        G.player.teleport(k.position.clone().add({ x: 0, y: 0, z: -1.2 }), 0);
        G.cam.snapBehind(G.player);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await h.until(() => window.__G.npcs.get('kid3').follower, { timeout: 15000, tick: () => h.skipDialogue() });
      // walk her (and the child) to the parent in a few hops
      await h.until(
        () => window.__G.save.story.kid3Home,
        {
          timeout: 60000,
          every: 500,
          tick: async () => {
            await h.skipDialogue();
            await h.eval(() => {
              const G = window.__G;
              if (G.frozen) return;
              const to = G.npcs.get('parent3').position;
              const p = G.player.position;
              const d = p.distanceTo(to);
              const step = Math.min(3, d - 1.2);
              if (step > 0) {
                const dir = to.clone().sub(p).setY(0).normalize();
                G.player.teleport(p.clone().addScaledVector(dir, step), Math.atan2(dir.x, dir.z));
              }
            });
          },
        },
      );
      await h.until(() => !window.__G.frozen, { timeout: 10000, tick: () => h.skipDialogue() });
    },
  },


  // All of Chapter 2: Bo at the Academy gate -> the market -> the tutorial flock -> the other two
  // flocks (one with a combo) -> dumplings -> the walk home, when the lights go out across the bay.
  {
    name: 'chapter2-full',
    async run(h) {
      await h.open('?zone=academy&spawn=SPAWN_gate', base({ zone: 'academy', tarts: 2, cozy: 40, story: { ...CH1_DONE } }));
      await h.begin();
      const obj = await h.eval(() => window.__G.ui.objective.textContent);
      h.assert(/\bBo\b/.test(obj), 'academy objective: ' + obj);
      await h.eval(() => {
        const G = window.__G;
        const wb = G.npcs.get('weibao');
        G.player.teleport(wb.position.clone().add({ x: 0, y: 0, z: -1.2 }), 0);
        G.cam.snapBehind(G.player);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await h.until(() => window.__G.zone?.id === 'market', { timeout: 60000, tick: () => h.skipDialogue() });
      // arrival cutscene, then walk toward the lantern stall
      await h.until(() => window.__G.save.story.ch2_start && !window.__G.frozen, { timeout: 60000, tick: () => h.skipDialogue() });
      await h.eval(() => {
        const G = window.__G;
        const m = G.zone.marker('POINT_tutorial');
        G.player.teleport(m.position.clone().add({ x: -3, y: 0, z: 0 }), Math.PI / 2);
      });
      // the crash; then she tries humming (the flock won't settle), and Echo Friend explains
      await h.until(() => window.__G.frozen, { timeout: 10000 });
      await h.until(() => !window.__G.frozen, { timeout: 30000, tick: () => h.skipDialogue() });
      await h.page.keyboard.down('KeyE');
      await h.until(() => window.__G.save.story.ch2_tutorial, { timeout: 60000, tick: () => h.skipDialogue() });
      await h.page.keyboard.up('KeyE');
      await h.until(() => !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
      for (const id of [1, 2, 3]) {
        await h.until(() => !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
        await sitAt(h, id);
        await h.until(`window.__G.zone.flocks[${id - 1}].sparrows.every((g) => g.perched || g.soothed)`, { timeout: 15000 });
        await h.page.keyboard.press('Digit' + id);
        if (id === 2) {
          await h.page.keyboard.press('KeyQ');
          await h.page.waitForTimeout(300);
        }
        await h.page.keyboard.down('KeyE');
        await h.until(`window.__G.save.story.flock${id}Done`, { timeout: 60000, tick: () => h.skipDialogue() });
        await h.page.keyboard.up('KeyE');
        await h.until(() => window.__G.player.state === 'move' && !window.__G.frozen, { timeout: 30000, tick: () => h.skipDialogue() });
      }
      // dumplings with everyone, then the walk home
      for (const [point, flagName] of [['POINT_dumpling', 'ch2_dumplings'], ['POINT_hook', 'ch2Done']]) {
        await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 20000, tick: () => h.skipDialogue() });
        await h.eval((point) => {
          const G = window.__G;
          G.player.teleport(G.zone.marker(point).position.clone().add({ x: 0.5, y: 0, z: 0 }), 0);
        }, point);
        if (flagName === 'ch2Done') {
          await h.until(() => window.__G.frozen, { timeout: 10000 });
          await h.page.waitForTimeout(4500);
          await h.page.screenshot({ path: `${h.OUT}/chapter2-hook.png` });
          await h.headsUpright('on the walk home');
        }
        await h.until(`window.__G.save.story.${flagName}`, { timeout: 60000, tick: () => h.skipDialogue() });
      }
      await h.until(() => !window.__G.frozen, { timeout: 30000, tick: () => h.skipDialogue() });
      const s = await h.eval(() => ({ sparrows: window.__G.save.sprites.sparrow, far: window.__G.zone.far.every((l) => window.__G.fx.glows.size[l.i] === 0), obj: window.__G.ui.objective.textContent }));
      h.assert(s.sparrows === 12, 'sparrow sprites ' + s.sparrows);
      h.assert(s.far, 'the far lanterns are still lit');
      h.assert(/Walk home/.test(s.obj), 'objective after the chapter: ' + s.obj);
      await h.headsUpright('after Chapter 2');
    },
  },

  // The station and all of Chapter 1, as a flow test (Grumblings are soothed directly; the soothing
  // itself is covered by the train and market tests): meet Sunny, climb to the Academy, the welcome,
  // the lesson, the missions, baking, the pom-pom, and the overlook.
  {
    name: 'chapter1-full',
    async run(h) {
      await h.open('?zone=station', base({ zone: 'station', helper: 'cloud', sprites: { cloud: 1, doudou: 1 }, soothed: { 'train:cloud': true, 'train:doudou': true }, story: { train_intro: true, prologueTrain: true } }));
      await h.begin();
      const to = (js, arg) => h.eval(js, arg);
      const skipUntil = (pred, timeout = 60000) => h.until(pred, { timeout, tick: () => h.skipDialogue() });
      // the platform: say hello to Sunny (both questions answered), then up the hill
      await skipUntil(() => !window.__G.frozen && /Say hello/.test(window.__G.ui.objective.textContent));
      await to(() => {
        const G = window.__G;
        const tt = G.npcs.get('tangtang');
        G.player.teleport(tt.position.clone().add({ x: 1.2, y: 0, z: 0 }), -Math.PI / 2);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await skipUntil(() => window.__G.save.story.prologueDone && !window.__G.frozen);
      await h.headsUpright('after meeting Sunny');
      await to(() => {
        const G = window.__G;
        const b = G.zone.box('TRIGGER_academy');
        G.player.teleport(b.getCenter(G.player.position.clone()).setY(b.min.y + 0.1), 0);
      });
      await skipUntil(() => window.__G.zone?.id === 'academy');
      // the welcome
      await skipUntil(() => !window.__G.frozen && /Master Fang/.test(window.__G.ui.objective.textContent));
      await to(() => {
        const G = window.__G;
        G.player.teleport(G.npcs.get('fang').position.clone().add({ x: 0, y: 0, z: 2.5 }), Math.PI);
      });
      await skipUntil(() => window.__G.save.story.ch1_welcome && !window.__G.frozen);
      const w1 = await h.walk('KeyW', 1000);
      h.assert(w1.moved > 0.5 && w1.under < 0.05, 'stuck after the welcome: ' + JSON.stringify(w1));
      // the lesson (and Captain Honk)
      await to(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_lessonseat').position.clone().add({ x: 0, y: 0, z: 2 }), Math.PI);
      });
      await skipUntil(() => window.__G.save.story.ch1_lesson && !window.__G.frozen);
      const w2 = await h.walk('KeyW', 1000);
      h.assert(w2.moved > 0.5 && w2.under < 0.05, 'stuck after the lesson: ' + JSON.stringify(w2));
      // the lost sock and the homework
      for (const sp of ['sock', 'homework']) {
        await to((sp) => [...window.__G.grumblings].find((g) => g.species === sp)?.wrap(3), sp);
        await skipUntil(`window.__G.save.story.${sp}Done && !window.__G.frozen`);
      }
      // baking with Sunny
      await to(() => {
        const G = window.__G;
        G.player.teleport(G.npcs.get('tangtang').position.clone().add({ x: 1.5, y: 0, z: 0 }), -Math.PI / 2);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await h.until(() => document.querySelector('.cook'), { timeout: 20000, tick: () => h.skipDialogue() });
      await h.until(() => !document.querySelector('.cook'), { timeout: 30000, every: 500, tick: () => h.page.keyboard.press('KeyE') });
      await skipUntil(() => window.__G.save.story.cookDone && !window.__G.frozen);
      await h.headsUpright('after baking with Sunny');
      // the lonely pom-pom
      await to(() => [...window.__G.grumblings].find((g) => g.species === 'pompom')?.wrap(3));
      await skipUntil(() => window.__G.save.story.pompomDone && !window.__G.frozen);
      // the overlook
      await to(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_overlook').position.clone().add({ x: 0, y: 0, z: -2 }), 0);
      });
      await skipUntil(() => window.__G.save.story.ch1Done && !window.__G.frozen, 90000);
      const obj = await h.eval(() => window.__G.ui.objective.textContent);
      h.assert(/\bBo\b/.test(obj), 'objective after Chapter 1: ' + obj);
      await h.headsUpright('after Chapter 1');
    },
  },

  // After the first lesson she stands up on the pavilion floor, and walks off down its steps. (She used to stand
  // up at the seat marker's height, ground level: inside the pavilion's stone platform, sunk to the waist and
  // walled in.) The same bench ends Chapter 3, with Master Fang's story.
  ...[
    ['lesson-stand', () => ({ train_intro: true, prologueTrain: true, prologueDone: true, ch1_welcome: true }), 'ch1_lesson'],
    ['story-stand', () => ({ ...CH3_ARRIVED, mem_notice: true, mem_post: true, mem_sweets: true, mem_teahouse: true, mem_thread: true, mem_kitchen: true, ch3_return: true }), 'ch3Done'],
  ].map(([name, story, done]) => ({
    name,
    async run(h) {
      await h.open('?zone=academy', base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 40, sprites: { ...CH2_SPRITES, grey: 1 }, story: story() }));
      await h.begin();
      await h.until(() => !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
      // up the pavilion steps with real keys
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_lessonseat').position.clone().add({ x: 0, y: 0, z: 6 }), Math.PI);
        G.cam.snapBehind(G.player);
      });
      await h.page.keyboard.down('KeyW');
      await h.until(() => window.__G.frozen, { timeout: 10000 });
      await h.page.keyboard.up('KeyW');
      await h.until(`window.__G.save.story.${done} && !window.__G.frozen`, { timeout: 150000, tick: () => h.skipDialogue() });
      const f = await h.feet();
      h.assert(Math.abs(f.y - 0.45) < 0.03 && f.under < 0.03, 'not on the pavilion floor: ' + JSON.stringify(f));
      const w = await h.walk('KeyW', 2500);
      h.assert(w.moved > 2 && w.y < 0.1, 'could not walk off the pavilion: ' + JSON.stringify(w));
    },
  })),

  // Shy Grumblings and the keyboard: holding W is her normal run (there's no walk key), so walking up to a flock
  // must not scatter it; only sprinting at it does. (Both used to scatter it: anything over 2.6 m/s.)
  {
    name: 'shy-walk',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true } }));
      await h.begin();
      await h.until(() => !window.__G.frozen && window.__G.zone.flocks?.[0]?.sparrows.length, { timeout: 20000, tick: () => h.skipDialogue() });
      // from 9 m away, facing the first flock
      const approach = () =>
        h.eval(() => {
          const G = window.__G;
          const g = G.zone.flocks[0].sparrows[0];
          G.player.teleport(g.position.clone().add({ x: 0, y: 0, z: -9 }), 0);
          G.cam.snapBehind(G.player);
        });
      const mode = () => h.eval(() => window.__G.zone.flocks[0].sparrows.map((g) => g.behaviour.mode));
      for (const sprint of [false, true]) {
        await approach();
        await h.page.waitForTimeout(300);
        if (sprint) await h.page.keyboard.down('ShiftLeft');
        await h.page.keyboard.down('KeyW');
        await h.until(() => {
          const G = window.__G;
          return G.zone.flocks[0].sparrows.some((g) => g.position.distanceTo(G.player.position) < 2.5 || g.behaviour.mode === 'scatter');
        }, { timeout: 8000, every: 50 });
        await h.page.keyboard.up('KeyW');
        await h.page.keyboard.up('ShiftLeft');
        const m = await mode();
        if (sprint) h.assert(m.includes('scatter'), 'sprinting at the flock did not scatter it: ' + m);
        else h.assert(!m.includes('scatter'), 'walking (W) up to the flock scattered it: ' + m);
        await h.page.waitForTimeout(6000); // let them settle back
      }
    },
  },

  // Menus opened and closed with the keyboard: Esc opens and closes the pause menu, Tab the Sprite Book. Closing
  // the last menu with a key used to throw in Menus.update (the menu stack was already empty).
  {
    name: 'menus-keyboard',
    async run(h) {
      await h.open('?zone=academy', base({ zone: 'academy', spawn: 'SPAWN_gate', sprites: { cloud: 1 }, story: { ...CH1_DONE } }));
      await h.begin();
      await h.until(() => !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
      const open = () => h.eval(() => window.__G.menus.stack.map((m) => m.id));
      for (const [key, id] of [['Escape', 'menu-pause'], ['Tab', 'menu-book']]) {
        await h.page.keyboard.press(key);
        await h.page.waitForTimeout(300);
        h.assert((await open()).join() === id, `${key} opened ${await open()}`);
        await h.page.keyboard.press(key);
        await h.page.waitForTimeout(300);
        h.assert((await open()).length === 0, `${key} left ${await open()} open`);
        h.assert(!(await h.eval(() => window.__G.paused)), `still paused after closing with ${key}`);
      }
    },
  },

  // Every building with front steps can be walked up (the steps' collision ramps used to tilt the wrong way: a
  // knee-high wall at the foot of the steps that you could only jump over).
  ...['academy'].map((zone) => ({
    name: 'steps-' + zone,
    async run(h) {
      await h.open('?zone=' + zone, base({ zone, spawn: 'SPAWN_gate', story: { ...CH1_DONE } }));
      await h.begin();
      await h.until(() => !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
      // the kit pieces with base platforms, and how high their floor is
      const pieces = await h.eval(() =>
        window.__G.zone.markersBy('PLACE_')
          .map((m) => ({ name: m.name, piece: m.name.slice(6).replace(/[._]?\d+$/, ''), x: m.position.x, z: m.position.z, facing: m.facing, y: m.position.y }))
          .filter((m) => ['hall', 'hall_open', 'hall_small', 'library', 'pagoda', 'pavilion'].includes(m.piece)),
      );
      h.assert(pieces.length, 'no buildings with steps in ' + zone);
      const bad = [];
      for (const pc of pieces) {
        // 4 m in front of the steps (fronts face the marker's facing), walking toward the building
        const r = await h.eval((pc) => {
          const G = window.__G;
          // the platform's floor just inside its front edge (half depth, from build_kit.py), and a start 1.1 m
          // before the foot of the steps
          const half = { hall: 3.35, hall_open: 3.35, hall_small: 2.7, library: 3, pagoda: 2.3, pavilion: 2.3 }[pc.piece];
          const top = G.collision.groundY(pc.x + Math.sin(pc.facing) * (half - 0.4), pc.z + Math.cos(pc.facing) * (half - 0.4), pc.y + 2);
          const d = { hall: 5.5, hall_open: 5.5, hall_small: 4.9, library: 5.2, pagoda: 4.4, pavilion: 4.3 }[pc.piece];
          const p = { x: pc.x + Math.sin(pc.facing) * d, y: pc.y, z: pc.z + Math.cos(pc.facing) * d };
          G.player.teleport(G.player.position.clone().set(p.x, p.y + 0.2, p.z), pc.facing + Math.PI);
          G.cam.snapBehind(G.player);
          return { top };
        }, pc);
        await h.page.keyboard.down('KeyW');
        await h.until(`window.__G.player.position.y > ${r.top - 0.1}`, { timeout: 6000, every: 100 }).catch(() => {});
        await h.page.keyboard.up('KeyW');
        const y = await h.eval(() => window.__G.player.position.y);
        if (y < r.top - 0.15) bad.push(`${pc.name}: at ${y.toFixed(2)}, floor ${r.top.toFixed(2)}`);
      }
      h.assert(!bad.length, "couldn't walk up the steps: " + bad.join('; '));
    },
  })),

  // Feet under a floor (put there directly, not by a teleport): one step later she is standing on it.
  {
    name: 'floor-pushout',
    async run(h) {
      await h.open('?zone=academy', base({ zone: 'academy', spawn: 'SPAWN_gate', story: { ...CH1_DONE } }));
      await h.begin();
      const f = await h.eval(() => {
        const G = window.__G;
        const p = G.player;
        p.position.copy(G.zone.marker('POINT_lessonseat').position).add({ x: 0, y: 0, z: 1.6 }); // 0.45 m under the pavilion floor
        p.velocity.set(0, 0, 0);
        p.update(1 / 60);
        return { y: p.position.y, onGround: p.onGround };
      });
      h.assert(Math.abs(f.y - 0.45) < 0.03 && f.onGround, 'still under the floor: ' + JSON.stringify(f));
    },
  },

  // Everyone stands on the floor in every zone and story state: Pip and the standing NPCs (the dev build's
  // floor check warns "[floor]" otherwise, which fails the test), and the sleepy sprites by the dorms (two of them
  // were inside a dorm's stone porch). Master Fang used to stand in the pavilion's steps.
  ...[
    ['train', 'train', () => ({})],
    ['station', 'station', () => ({ train_intro: true, prologueTrain: true })],
    ['academy-lesson', 'academy', () => ({ train_intro: true, prologueTrain: true, prologueDone: true, ch1_welcome: true })],
    ['academy-evening', 'academy', () => ({ ...CH1_DONE })],
    ['academy-morning', 'academy', () => ({ ...CH1_DONE, ch2_start: true, ch2Done: true, ch3_start: true })],
    ['market', 'market', () => ({ ...CH1_DONE, ch2_start: true, ch2_tutorial: true })],
    ['quiet', 'quiet', () => CH3_ARRIVED],
  ].map(([name, zone, story]) => ({
    name: 'floor-' + name,
    async run(h) {
      await h.open('?zone=' + zone, base({ zone, spawn: zone === 'quiet' ? 'SPAWN_ferry' : zone === 'academy' ? 'SPAWN_gate' : 'SPAWN_start', sprites: CH2_SPRITES, story: story() }));
      await h.begin();
      await h.eval(() => window.__G.zone.streamed);
      await h.page.waitForTimeout(2500); // the floor check runs twice a second
      const f = await h.feet();
      h.assert(f.under < 0.05, 'Pip is inside the floor: ' + JSON.stringify(f));
      const sleepy = await h.eval(() =>
        [...window.__G.interactables]
          .filter((i) => i.label === 'Tuck in the sleepy sprite')
          .map((i) => +(i.position.y - 0.05 - window.__G.collision.floorY(i.position, 0.8, 0.3)).toFixed(3)),
      );
      h.assert(sleepy.every((d) => Math.abs(d) < 0.03), 'sleepy sprites off the floor: ' + sleepy);
    },
  })),

  // Chapter 3: a grey Grumbling won't be hugged. Humming at it is refused (no thread, no progress, no Notice
  // prompt); staying close fills the company ring until it's ready; then the thread wraps it into a sprite.
  {
    name: 'quiet-grey',
    async run(h) {
      await h.open('?zone=quiet', base({ zone: 'quiet', spawn: 'SPAWN_ferry', cozy: 40, sprites: CH2_SPRITES, story: CH3_ARRIVED }));
      await h.begin();
      const toGrey = () =>
        h.eval(() => {
          const G = window.__G;
          const g = G.zone.greys.list[0];
          G.player.teleport(g.position.clone().add({ x: 0, y: 0, z: -1.6 }), 0);
          G.cam.snapBehind(G.player);
        });
      await toGrey();
      await h.page.waitForTimeout(400);
      h.assert((await h.eval(() => window.__G.interact.current?.label)) !== 'Notice', 'an unready grey offers Notice');
      await h.page.keyboard.down('KeyE');
      await h.page.waitForTimeout(2500);
      await h.page.keyboard.up('KeyE');
      const r = await h.eval(() => ({ p: window.__G.zone.greys.list[0].progress, c: window.__G.zone.greys.list[0].company, ring: document.querySelector('.soothe').classList.contains('company') }));
      h.assert(r.p === 0 && r.c < 0.1, 'humming wrapped an unready grey: ' + JSON.stringify(r));
      h.assert(r.ring, 'no company ring near the grey');
      await toGrey();
      await h.until(() => window.__G.zone.greys.list[0].ready, { timeout: 30000, tick: () => h.skipDialogue() });
      await h.until(() => !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
      await h.page.screenshot({ path: `${h.OUT}/quiet-grey.png` });
      await h.page.keyboard.down('KeyE');
      await h.until(() => window.__G.save.sprites.grey === 1, { timeout: 40000 });
      await h.page.keyboard.up('KeyE');
      h.assert(await h.eval(() => window.__G.sprites.list.some((s) => s.id === 'grey')), 'no grey sprite follower');
      await h.headsUpright('in the Quiet District');
    },
  },

  // Chapter 3: a Charm Sprite memory. The wrong sprite gets a friendly line; the right one plays the
  // memory, and after a reload its pocket of colour, its lanterns and its lifted shutter are still there.
  {
    name: 'quiet-memory',
    async run(h) {
      await h.open('?zone=quiet', base({ zone: 'quiet', spawn: 'SPAWN_ferry', sprites: CH2_SPRITES, story: CH3_ARRIVED }));
      await h.begin();
      await remember(h, 'post', 'Sock');
      await h.until(() => !window.__G.ui.dialogueOpen && !window.__G.frozen, { timeout: 20000, tick: () => h.skipDialogue() });
      h.assert(!(await h.eval(() => window.__G.save.story.mem_post)), 'the wrong sprite restored the memory');
      await remember(h, 'post', 'Cloud');
      await h.until(() => window.__G.ui.dlg.classList.contains('memory'), { timeout: 20000 });
      await h.page.waitForTimeout(1200);
      await h.page.screenshot({ path: `${h.OUT}/quiet-memory.png` });
      await h.until(() => window.__G.save.story.mem_post && !window.__G.frozen, { timeout: 60000, tick: () => h.skipDialogue() });
      const lit = () => h.eval(() => ({ pockets: window.__G.zone.memories.pockets.length, lamps: window.__G.zone.lampList.length, shutter: window.__G.zone.group.getObjectByName('SHUT_post')?.position.y }));
      const before = await lit();
      h.assert(before.pockets === 1 && before.lamps > 0, 'nothing restored: ' + JSON.stringify(before));
      await h.reloaded(() => h.page.reload());
      await h.begin();
      const after = await lit();
      h.assert(after.pockets === 1 && after.lamps === before.lamps && after.shutter > 1, 'not restored after a reload: ' + JSON.stringify(after));
    },
  },

  // Chapter 3, start to end: home up the market stairs, the grey morning at the Academy (Honk's "nobody
  // remembers us"), the ferry, five memories, keeping a grey Grumbling company, the kitchen door in the
  // fog, the ferry home, and Master Fang's story by the pavilion.
  {
    name: 'chapter3-full',
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', cozy: 60, sprites: CH2_SPRITES, story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true, flock1Done: true, flock2Done: true, flock3Done: true, ch2_dumplings: true, ch2Done: true } }));
      await h.begin();
      const skipUntil = (pred, timeout = 60000) => h.until(pred, { timeout, tick: () => h.skipDialogue() });
      h.assert(/Walk home/.test(await h.eval(() => window.__G.ui.objective.textContent)), 'market objective');
      await h.eval(() => {
        const G = window.__G;
        const b = G.zone.box('TRIGGER_academy');
        G.player.teleport(b.getCenter(G.player.position.clone()).setY(b.min.y + 1.0), 0); // lands on the top landing
      });
      await skipUntil(() => window.__G.zone?.id === 'academy');
      // the grey morning
      await skipUntil(() => window.__G.save.story.ch3_start && !window.__G.frozen);
      await h.eval(() => {
        const G = window.__G;
        const g = G.zone.morningGreys[0];
        G.player.teleport(g.position.clone().add({ x: 0, y: 0, z: -2.2 }), 0);
      });
      await skipUntil(() => /humming/.test(window.__G.ui.objective.textContent) && !window.__G.frozen);
      await h.page.keyboard.down('KeyE');
      await skipUntil(() => window.__G.frozen, 30000);
      await h.page.keyboard.up('KeyE');
      await skipUntil(() => window.__G.save.story.ch3_greys && !window.__G.frozen);
      await h.headsUpright('after the grey morning');
      // Bo at the gate: the ferry
      await h.until(() => !window.__G.npcs.get('weibao').walkTarget, { timeout: 30000 });
      await h.eval(() => {
        const G = window.__G;
        const wb = G.npcs.get('weibao');
        G.player.teleport(wb.position.clone().add({ x: 0, y: 0, z: -1.2 }), 0);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await skipUntil(() => window.__G.zone?.id === 'quiet');
      await skipUntil(() => window.__G.save.story.ch3_arrive && !window.__G.frozen);
      // five memories, each with the Charm Sprite who remembers it
      for (const [id, pick] of [['notice', 'Homework'], ['post', 'Cloud'], ['sweets', 'Sock'], ['teahouse', 'Pom-pom'], ['thread', 'Sparrow']]) {
        await skipUntil(() => !window.__G.frozen && !window.__G.ui.dialogueOpen);
        await remember(h, id, pick);
        await skipUntil(`window.__G.save.story.mem_${id} && !window.__G.frozen`);
      }
      await skipUntil(() => !window.__G.frozen && !window.__G.ui.dialogueOpen);
      await h.headsUpright('after the memories');
      // keep a grey Grumbling company, then soothe it
      await h.eval(() => {
        const G = window.__G;
        const g = G.zone.greys.list.find((x) => !x.soothed);
        G.zone.testGrey = g;
        G.player.teleport(g.position.clone().add({ x: 0, y: 0, z: -1.5 }), 0);
      });
      await skipUntil(() => window.__G.zone.testGrey.ready, 40000);
      await skipUntil(() => !window.__G.frozen && !window.__G.ui.dialogueOpen);
      await h.page.keyboard.down('KeyE');
      await h.until(() => window.__G.save.sprites.grey >= 1, { timeout: 40000 });
      await h.page.keyboard.up('KeyE');
      await skipUntil(() => /warm/.test(window.__G.ui.objective.textContent) && !window.__G.frozen && !window.__G.ui.dialogueOpen, 30000);
      // the kitchen door in the fog
      await remember(h, 'kitchen', 'Grey');
      await skipUntil(() => window.__G.save.story.ch3_return && !window.__G.frozen, 90000);
      await h.page.screenshot({ path: `${h.OUT}/chapter3-kitchen.png` });
      // the ferry home
      await h.until(() => window.__G.npcs.get('ferryman'), { timeout: 30000 });
      await h.eval(() => {
        const G = window.__G;
        const f = G.npcs.get('ferryman');
        G.player.teleport(f.position.clone().add({ x: 0, y: 0, z: -1.2 }), 0);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk' && window.__G.interact.current === window.__G.npcs.get('ferryman').interactable, { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await skipUntil(() => window.__G.zone?.id === 'academy' && !window.__G.frozen);
      // Master Fang's story by the pavilion
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_lessonseat').position.clone().add({ x: 0, y: 0, z: 2 }), Math.PI);
      });
      await h.until(() => window.__G.frozen, { timeout: 10000 });
      await h.page.waitForTimeout(1500);
      await h.page.screenshot({ path: `${h.OUT}/chapter3-story.png` });
      await h.headsUpright('during the story');
      await skipUntil(() => window.__G.save.story.ch3Done && !window.__G.frozen, 120000);
      const obj = await h.eval(() => window.__G.ui.objective.textContent);
      h.assert(/Free roam/.test(obj), 'objective after Chapter 3: ' + obj);
      const w = await h.walk('KeyW', 1000);
      h.assert(w.moved > 0.5 && w.under < 0.05, 'stuck after the story: ' + JSON.stringify(w));
    },
  },

  // Feel: the walk and run clips play at the speed that keeps a planted foot planted (Humanoid.gait), for Pip
  // walking, running and sprinting and for a friend walking somewhere. Stepped by hand at 1/480 s (the
  // headless browser renders ~15 fps, too few frames land in a footfall): how far a foot drifts while it is
  // down, as a share of how far the body moved. Plus turning on the spot, and turning to face a speaker.
  {
    name: 'feel-stride',
    async run(h) {
      await h.open('?zone=test', base({ zone: 'test' }));
      await h.begin();
      const r = await h.eval(() => {
        const G = window.__G;
        const p = G.player;
        G.paused = true;
        const dt = 1 / 480;
        // slip share for a character root moved by step(); feet within 4 mm of their lowest count as down
        const measure = (h, root, step, n = 1920) => {
          const st = { min: [9, 9], prev: [null, null], slip: 0, body: 0 };
          let prevRoot = root.clone();
          for (let i = 0; i < n; i++) {
            step();
            ['foot_L', 'foot_R'].forEach((b, k) => {
              const f = h.worldBone(b, root.clone());
              const y = f.y - root.y;
              if (i > n * 0.3) st.min[k] = Math.min(st.min[k], y);
              const down = y < st.min[k] + 0.004;
              if (down && st.prev[k] && i > n / 2) {
                const bx = root.x - prevRoot.x,
                  bz = root.z - prevRoot.z,
                  bl = Math.hypot(bx, bz) || 1;
                st.slip += ((f.x - st.prev[k].x) * bx + (f.z - st.prev[k].z) * bz) / bl;
                st.body += bl;
              }
              st.prev[k] = down ? f : null;
            });
            prevRoot = root.clone();
          }
          return Math.abs(st.slip / st.body);
        };
        const run = (stick, sprint) => {
          p.teleport(p.position.clone().set(-20, 0, -36), 0);
          G.cam.snapBehind(p);
          G.input.move.set(0, stick);
          if (sprint) G.input.keys.add('sprint');
          const out = measure(p.h, p.position, () => p.update(dt));
          G.input.keys.delete('sprint');
          G.input.move.set(0, 0);
          return out;
        };
        const out = { walk: run(0.35), run: run(1), sprint: run(1, true) };
        // a friend walking somewhere at a stroll
        const tt = G.npcs.get('tangtang');
        tt.root.position.set(20, 0, -36);
        tt.walkTo(tt.root.position.clone().set(20, 0, 30), 1.6);
        out.friend = measure(tt.h, tt.root.position, () => {
          G.camera.position.copy(tt.root.position).add({ x: 0, y: 2, z: -4 }); // close, so no distance LOD
          tt.update(dt);
        });
        // turning on the spot: from a standstill, pushing back pivots first, without moving away
        for (let i = 0; i < 240; i++) p.update(dt);
        const at = p.position.clone(),
          f0 = p.facing;
        G.input.move.set(0, -1);
        let turned = false;
        for (let i = 0; i < 120; i++) {
          p.update(dt);
          if (p.turnT > 0) turned = true;
        }
        out.turned = turned;
        out.turnMoved = p.position.distanceTo(at);
        for (let i = 0; i < 200; i++) p.update(dt);
        out.turnAngle = Math.abs(Math.atan2(Math.sin(p.facing - f0), Math.cos(p.facing - f0)));
        G.input.move.set(0, 0);
        G.paused = false;
        return out;
      });
      h.assert(r.walk < 0.05 && r.run < 0.18 && r.sprint < 0.3 && r.friend < 0.08, 'feet slide: ' + JSON.stringify(r));
      h.assert(r.turned && r.turnMoved < 0.05 && r.turnAngle > 2.8, 'no turn on the spot: ' + JSON.stringify(r));
      // facing whoever talks to her: Sunny behind her says something, and Pip turns round
      await h.eval(() => {
        const G = window.__G;
        const tt = G.npcs.get('tangtang');
        tt.walkTarget = null;
        G.player.teleport(tt.position.clone().add({ x: 0, y: 0, z: -2 }), Math.PI);
        window.__said = G.ui.say('tangtang', 'Over here!');
      });
      await h.page.waitForTimeout(1500);
      const face = await h.eval(() => {
        const G = window.__G;
        const tt = G.npcs.get('tangtang').position,
          p = G.player;
        const want = Math.atan2(tt.x - p.position.x, tt.z - p.position.z);
        G.ui.advance = true;
        return Math.abs(Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing)));
      });
      h.assert(face < 0.35, 'she did not turn to Sunny: ' + face.toFixed(2));
      console.log('    slip: ' + JSON.stringify(r, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
    },
  },

  // On a phone: sit with a flock using the context button, tap a free good thing, hold the big Hum button,
  // and stand up again with the context button.
  {
    name: 'touch-market-perch',
    touch: true,
    viewport: { width: 844, height: 390 },
    async run(h) {
      await h.open('?zone=market', base({ zone: 'market', story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true } }));
      await h.begin();
      const tapEl = async (sel) => {
        const b = await (await h.page.$(sel)).boundingBox();
        await h.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      };
      await h.eval(() => {
        const G = window.__G;
        const seat = G.zone.marker('SEAT_flock1');
        G.player.teleport(seat.position.clone().add({ x: 0, y: 0, z: 0.9 }), Math.PI);
      });
      await h.until(() => document.querySelector('.tbtn.act')?.textContent === 'Sit with them', { timeout: 5000 });
      await tapEl('.tbtn.act');
      await h.until(() => window.__G.player.state === 'sit' && window.__G.zone.flocks[0].sparrows.every((g) => g.perched), { timeout: 15000 });
      for (const sel of ['.goodchip:nth-child(1)', '.goodchip:nth-child(2)', '.tbtn.act', '.tbtn.hum']) {
        const r = await h.hit(sel);
        h.assert(r.ok, `${sel} is covered by ${r.top}`);
      }
      await tapEl('.goodchip:nth-child(2)');
      h.assert(await h.eval(() => window.__G.zone.perch.selected === 1), 'chip tap did not select');
      // hold Hum for a while with a real touch pointer on the button
      const hum = await (await h.page.$('.tbtn.hum')).boundingBox();
      const cdp = await h.page.context().newCDPSession(h.page);
      const pt = { x: hum.x + hum.width / 2, y: hum.y + hum.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await h.page.waitForTimeout(3000);
      const prog = await h.eval(() => Math.max(...window.__G.zone.flocks[0].sparrows.map((g) => g.progress)));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      h.assert(prog > 0.2, 'humming by touch did not calm them: ' + prog.toFixed(2));
      await h.page.screenshot({ path: `${h.OUT}/touch-market-perch.png` });
      await h.until(() => document.querySelector('.tbtn.act')?.textContent === 'Stand up', { timeout: 3000 });
      await tapEl('.tbtn.act');
      await h.until(() => window.__G.player.state === 'move', { timeout: 5000 });
    },
  },
];

const CH2_SPRITES = { doudou: 1, cloud: 1, sock: 1, homework: 1, pompom: 1, sparrow: 12 };
const CH3_ARRIVED = { prologueTrain: true, prologueDone: true, ch1Done: true, weibaoFriend: true, ch2_start: true, ch2Done: true, ch3_start: true, ch3_greys: true, ch3_arrive: true };

// Walk up to a Chapter 3 memory spot, Look closer, and choose a Charm Sprite (by its button label). A friend's
// comment on the last memory may open just as F is pressed; then the press only advances it, so try again.
async function remember(h, id, pick) {
  for (let tries = 0; tries < 5; tries++) {
    await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 30000, tick: () => h.skipDialogue() });
    await h.eval((id) => {
      const G = window.__G;
      const m = G.zone.marker('POINT_mem_' + id);
      G.player.teleport(m.position.clone().add({ x: -Math.sin(m.facing) * 1.2, y: 0, z: -Math.cos(m.facing) * 1.2 }), m.facing);
      G.cam.snapBehind(G.player);
    }, id);
    await h.until(() => window.__G.interact.current?.label === 'Look closer', { timeout: 8000, tick: () => h.skipDialogue() });
    await h.page.keyboard.press('KeyF');
    await h.page.waitForTimeout(400);
    // advance the clue, but never click a choice by accident
    const got = await h.until(() => window.__G.ui.dlgChoices.childElementCount > 0 ? 'choices' : !window.__G.ui.dialogueOpen && !window.__G.frozen ? 'closed' : false, {
      timeout: 20000,
      tick: () => h.eval(() => window.__G.ui.dialogueOpen && !window.__G.ui.dlgChoices.childElementCount && (window.__G.ui.advance = true)),
    });
    if (got !== 'choices') continue;
    await h.eval((pick) => [...window.__G.ui.dlgChoices.children].find((b) => b.textContent.includes(pick)).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), pick);
    return;
  }
  throw new Error('could not look closer at memory ' + id);
}

const CH1_DONE = { prologueTrain: true, prologueDone: true, ch1_welcome: true, ch1_lesson: true, sockDone: true, homeworkDone: true, cookDone: true, pompomDone: true, ch1Done: true, weibaoFriend: true };

// Walk Pip up to a flock's seat and choose "Sit with them".
async function sitAt(h, id) {
  await h.eval((id) => {
    const G = window.__G;
    const seat = G.zone.marker('SEAT_flock' + id);
    const p = seat.position.clone();
    p.x += Math.sin(seat.facing) * 0.9;
    p.z += Math.cos(seat.facing) * 0.9;
    G.player.teleport(p, seat.facing + Math.PI);
    G.cam.snapBehind(G.player);
  }, id);
  await h.until(() => window.__G.interact.current?.label === 'Sit with them', { timeout: 20000, tick: () => h.skipDialogue() });
  await h.page.keyboard.press('KeyF');
  await h.until(() => window.__G.player.state === 'sit', { timeout: 5000 });
}