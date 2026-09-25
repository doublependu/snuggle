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
      await h.open('?zone=train', base({ story: { train_intro: true } }));
      await h.begin();
      h.assert(await h.eval(() => document.body.classList.contains('touch')), 'not in touch mode');
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

  // Pause menu > Copy bug report: device, state, errors and the save in one block of text.
  {
    name: 'bug-report',
    async run(h) {
      await h.open('?zone=train', base({ story: { train_intro: true } }));
      await h.begin();
      await h.eval(() => window.__G.menus.togglePause());
      await h.page.click('#menu-pause [data-a="report"]');
      const text = await h.eval(() => document.querySelector('#menu-report textarea').value);
      for (const k of ['ua:', 'gpu:', 'quality:', 'zone: train', 'errors:', 'save: {']) h.assert(text.includes(k), 'report is missing ' + k);
    },
  },

  // Friends following Xiao Pei through the academy: they keep up, turn corners and never get lost.
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


  // All of Chapter 2: Wei Bao at the Academy gate -> the market -> the tutorial flock -> the other two
  // flocks (one with a combo) -> dumplings -> the walk home, when the lights go out across the bay.
  {
    name: 'chapter2-full',
    async run(h) {
      await h.open('?zone=academy&spawn=SPAWN_gate', base({ zone: 'academy', tarts: 2, cozy: 40, story: { ...CH1_DONE } }));
      await h.begin();
      const obj = await h.eval(() => window.__G.ui.objective.textContent);
      h.assert(/Wei Bao/.test(obj), 'academy objective: ' + obj);
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
        }
        await h.until(`window.__G.save.story.${flagName}`, { timeout: 60000, tick: () => h.skipDialogue() });
      }
      await h.until(() => !window.__G.frozen, { timeout: 30000, tick: () => h.skipDialogue() });
      const s = await h.eval(() => ({ sparrows: window.__G.save.sprites.sparrow, far: window.__G.zone.far.every((l) => window.__G.fx.glows.size[l.i] === 0), obj: window.__G.ui.objective.textContent }));
      h.assert(s.sparrows === 12, 'sparrow sprites ' + s.sparrows);
      h.assert(s.far, 'the far lanterns are still lit');
      h.assert(/Free roam/.test(s.obj), 'objective after the chapter: ' + s.obj);
    },
  },

  // The station and all of Chapter 1, as a flow test (Grumblings are soothed directly; the soothing
  // itself is covered by the train and market tests): meet Tangtang, climb to the Academy, the welcome,
  // the lesson, the missions, baking, the pom-pom, and the overlook.
  {
    name: 'chapter1-full',
    async run(h) {
      await h.open('?zone=station', base({ zone: 'station', helper: 'cloud', sprites: { cloud: 1, doudou: 1 }, soothed: { 'train:cloud': true, 'train:doudou': true }, story: { train_intro: true, prologueTrain: true } }));
      await h.begin();
      const to = (js, arg) => h.eval(js, arg);
      const skipUntil = (pred, timeout = 60000) => h.until(pred, { timeout, tick: () => h.skipDialogue() });
      // the platform: say hello to Tangtang (both questions answered), then up the hill
      await skipUntil(() => !window.__G.frozen && /Say hello/.test(window.__G.ui.objective.textContent));
      await to(() => {
        const G = window.__G;
        const tt = G.npcs.get('tangtang');
        G.player.teleport(tt.position.clone().add({ x: 1.2, y: 0, z: 0 }), -Math.PI / 2);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await skipUntil(() => window.__G.save.story.prologueDone && !window.__G.frozen);
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
      // the lesson (and Captain Honk)
      await to(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_lessonseat').position.clone().add({ x: 0, y: 0, z: 2 }), Math.PI);
      });
      await skipUntil(() => window.__G.save.story.ch1_lesson && !window.__G.frozen);
      // the lost sock and the homework
      for (const sp of ['sock', 'homework']) {
        await to((sp) => [...window.__G.grumblings].find((g) => g.species === sp)?.wrap(3), sp);
        await skipUntil(`window.__G.save.story.${sp}Done && !window.__G.frozen`);
      }
      // baking with Tangtang
      await to(() => {
        const G = window.__G;
        G.player.teleport(G.npcs.get('tangtang').position.clone().add({ x: 1.5, y: 0, z: 0 }), -Math.PI / 2);
      });
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await h.until(() => document.querySelector('.cook'), { timeout: 20000, tick: () => h.skipDialogue() });
      await h.until(() => !document.querySelector('.cook'), { timeout: 30000, every: 500, tick: () => h.page.keyboard.press('KeyE') });
      await skipUntil(() => window.__G.save.story.cookDone && !window.__G.frozen);
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
      h.assert(/Wei Bao/.test(obj), 'objective after Chapter 1: ' + obj);
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

const CH1_DONE = { prologueTrain: true, prologueDone: true, ch1_welcome: true, ch1_lesson: true, sockDone: true, homeworkDone: true, cookDone: true, pompomDone: true, ch1Done: true, weibaoFriend: true };

// Walk Xiao Pei up to a flock's seat and choose "Sit with them".
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