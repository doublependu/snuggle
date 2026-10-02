// SPDX-License-Identifier: GPL-3.0-only
// Test cases for Chapter 4 (Bean's Secret), Chapter 5 (The Great Sulk), the Epilogue, free-roam Lantern Bay
// and thread fishing (ai/plan_8.md). Same helpers as tests.mjs (see run.mjs).
import { base, PHONES, CH1_DONE, CH2_SPRITES, CH3_ARRIVED } from './tests.mjs';

const ALL_SPRITES = { ...CH2_SPRITES, grey: 2 };
const fogSave = (over = {}) => base({ zone: 'test', cozy: 50, sprites: ALL_SPRITES, story: { ...CH3_DONE }, ...over });
export const CH3_DONE = {
  ...CH3_ARRIVED, flock1Done: true, flock2Done: true, flock3Done: true, ch2_tutorial: true, ch2_dumplings: true,
  mem_notice: true, mem_post: true, mem_sweets: true, mem_teahouse: true, mem_thread: true, mem_kitchen: true, ch3_return: true, ch3_story: true, ch3Done: true,
};

// Put Pip somewhere (x, z, facing) with the camera behind her.
const put = (h, x, z, facing = 0) =>
  h.eval(([x, z, facing]) => {
    const G = window.__G;
    G.player.teleport(G.player.position.clone().set(x, 0.2, z), facing);
    G.cam.snapBehind(G.player);
  }, [x, z, facing]);
const calm = (h) => h.eval(() => window.__G.soothe.calm);
// Wait for game time to pass (the headless browser renders slowly, and a slow frame only counts as 1/20 s).
const gwait = async (h, seconds) => {
  const t0 = await h.eval(() => window.__G.time);
  await h.until(`window.__G.time > ${t0 + seconds}`, { timeout: 120000, every: 100 });
};

export const TESTS = [
  // The Great Sulk's sigh on the greybox: in the open it costs a Calm and slows her; behind the wall, or in
  // the warm spot, it does nothing; Calm comes back only in a warm spot; out of Calm she rests and gets up
  // at the last warm spot with full Calm (no game over).
  {
    name: 'fog-sigh',
    async run(h) {
      await h.open('?zone=test&fog', fogSave());
      await h.begin();
      await h.eval(() => (window.__G.zone.sighs.t = 1e9)); // only the sighs this test sends
      const sigh = async () => {
        await h.eval(() => {
          const G = window.__G;
          const s = G.zone.sighs;
          window.__pass = null;
          G.events.on('sigh-pass', (e) => (window.__pass = e.caught));
          s.send(14, Math.max(3, s.distance(G.player.position) - 20));
        });
        return h.until(() => window.__pass !== null && { caught: window.__pass }, { timeout: 20000 });
      };
      // in the open
      await put(h, 0, 4);
      h.assert((await calm(h)) === 4, 'Calm at the start');
      const warned = h.until(() => document.querySelector('.sighwarn').classList.contains('on'), { timeout: 15000 });
      let r = await sigh();
      await warned;
      h.assert(r.caught, 'a sigh in the open did not catch her');
      let s = await h.eval(() => ({ calm: window.__G.soothe.calm, slow: window.__G.player.moveScale }));
      h.assert(s.calm === 3 && s.slow < 0.5, 'caught, but: ' + JSON.stringify(s));
      await gwait(h, 5);
      s = await h.eval(() => ({ calm: window.__G.soothe.calm, slow: window.__G.player.moveScale, fps: Math.round(1000 / window.__G.quality.ema) }));
      console.log('    (fog greybox: ' + s.fps + ' fps headless)');
      h.assert(s.calm === 3 && s.slow === 1, 'Calm came back in the open, or she is still slow: ' + JSON.stringify(s));
      // behind the long wall (the sighs come from the south)
      await put(h, 0, -9.2);
      r = await sigh();
      h.assert(!r.caught && (await calm(h)) === 3, 'the wall was no shelter');
      // in the warm spot: no harm, and Calm comes back
      await put(h, -9, 4.8);
      r = await sigh();
      h.assert(!r.caught, 'the warm spot was no shelter');
      await h.until(() => window.__G.soothe.calm === 4, { timeout: 12000 });
      await h.until(() => document.querySelectorAll('.calmhud i:not(.gone)').length === 4, { timeout: 4000 });
      // out of Calm: she rests, and gets up at the warm spot
      await put(h, 6, 10);
      await h.eval(() => (window.__G.soothe.calm = 1));
      r = await sigh();
      h.assert(r.caught, 'the last sigh missed');
      await h.until(() => window.__G.player.state === 'overwhelmed', { timeout: 5000 });
      await h.until(() => window.__G.player.state === 'move' && window.__G.soothe.calm === 4, { timeout: 15000 });
      const at = await h.eval(() => window.__G.player.position.toArray());
      h.assert(Math.hypot(at[0] + 9, at[2] - 4.8) < 1.5, 'she did not get up at the last warm spot: ' + at.map((v) => v.toFixed(1)));
      await h.page.screenshot({ path: `${h.OUT}/fog-sigh.png` });
    },
  },

  // Bean awake: on top of her head (not in the hood), eyes open, his circle of colour follows her, and its
  // size is her Calm.
  {
    name: 'bean-awake',
    async run(h) {
      await h.open('?zone=test&fog', fogSave());
      const hood = await h.eval(() => window.__G.player.doudou.getWorldPosition(window.__G.player.position.clone()).toArray());
      await h.begin();
      await h.eval(() => (window.__G.zone.sighs.t = 1e9));
      await gwait(h, 3);
      const r = await h.eval(() => {
        const G = window.__G;
        const b = G.zone.bean;
        const w = G.player.doudou.getWorldPosition(G.player.position.clone());
        const ud = G.player.doudou.userData;
        return { out: b.out, at: w.toArray(), pip: G.player.position.toArray(), radius: b.radius, pockets: G.zone.pockets.includes(b.pocket), head: G.player.h.worldBone('head').y, open: ud.parts.open.visible && !ud.eyes.visible };
      });
      h.assert(r.out, 'Bean is still in the hood');
      h.assert(r.at[1] > r.head + 0.1 && r.at[1] < r.head + 0.5 && Math.hypot(r.at[0] - r.pip[0], r.at[2] - r.pip[2]) < 0.15, 'Bean is not on top of her head: ' + JSON.stringify(r));
      h.assert(r.open, 'his eyes are not open');
      h.assert(Math.hypot(r.at[0] - hood[0], r.at[2] - hood[2]) > 0.05, 'Bean did not move from the hood');
      h.assert(r.pockets && r.radius > 8, 'his circle at full Calm: ' + r.radius);
      await h.walk('KeyW', 1500);
      const moved = await h.eval(() => window.__G.zone.bean.pocket.position.distanceTo(window.__G.player.position));
      h.assert(moved < 0.01, 'the circle does not follow her');
      await h.eval(() => (window.__G.soothe.calm = 1));
      await gwait(h, 5);
      const small = await h.eval(() => window.__G.zone.bean.radius);
      h.assert(small < 3.6, 'the circle at one Calm: ' + small);
      await h.eval(() => window.__G.zone.bean.say('Don’t run. Running makes it worse.'));
      await h.until(() => [...document.querySelectorAll('.bubble')].some((b) => /Running makes it worse/.test(b.textContent)), { timeout: 5000 });
      await h.page.screenshot({ path: `${h.OUT}/bean-awake.png` });
    },
  },

  // Stitch: take a loose end, walk it to where it belongs, hold Hum; the golden thread stays (after a reload
  // too), lights its stretch and is shelter. A sigh that catches her makes her drop a carried thread. Without
  // Cozy Energy a stitch still works, in twice the beats.
  {
    name: 'fog-stitch',
    async run(h) {
      await h.open('?zone=test&fog', fogSave({ cozy: 30 }));
      await h.begin();
      await h.eval(() => (window.__G.zone.sighs.t = 1e9));
      const take = async (id) => {
        await h.eval((id) => {
          const G = window.__G;
          const d = G.zone.stitch.get(id);
          const f = typeof d.from === 'function' ? d.from() : d.from;
          G.player.teleport(f.clone().add({ x: 0, y: 0.2, z: -1.2 }), 0);
          G.cam.snapBehind(G.player);
        }, id);
        await h.until(() => /loose end/.test(window.__G.interact.current?.label || ''), { timeout: 8000 });
        await h.page.keyboard.press('KeyF');
        await h.until(() => !!window.__G.zone.stitch.holding, { timeout: 4000 });
      };
      const toAnchor = (id) =>
        h.eval((id) => {
          const G = window.__G;
          const d = G.zone.stitch.get(id);
          G.player.teleport(d.to.clone().add({ x: 0, y: 0.2, z: -1.4 }), 0);
          G.cam.snapBehind(G.player);
        }, id);
      // the first one is free
      await take('test_bell');
      await toAnchor('test_bell');
      await h.page.keyboard.down('KeyE');
      await h.until(() => window.__G.save.story.stitch_test_bell, { timeout: 15000 });
      await h.page.keyboard.up('KeyE');
      let s = await h.eval(() => ({ cozy: window.__G.save.cozy, warm: window.__G.zone.sighs.warm.length, pockets: window.__G.zone.pockets.length, moving: window.__G.player.state }));
      h.assert(s.cozy === 30 && s.warm === 2 && s.pockets === 3, 'after the free stitch: ' + JSON.stringify(s));
      // under the thread is shelter
      await h.eval(() => {
        const G = window.__G;
        window.__pass = null;
        G.events.on('sigh-pass', (e) => (window.__pass = e.caught));
        G.player.teleport(G.player.position.clone().set(0, 0.2, -1.5), 0);
        G.zone.sighs.send(14, 30);
      });
      await h.until(() => window.__pass !== null, { timeout: 15000 });
      h.assert(!(await h.eval(() => window.__pass)), 'a stitched thread was no shelter');
      // a sigh makes her drop a carried thread
      await take('test_letter');
      await h.eval(() => {
        const G = window.__G;
        window.__pass = null;
        G.player.teleport(G.player.position.clone().set(-6, 0.2, 10), 0);
        G.zone.sighs.send(14, 30);
      });
      await h.until(() => window.__pass !== null, { timeout: 15000 });
      h.assert(await h.eval(() => window.__pass && !window.__G.zone.stitch.holding), 'she kept hold of the thread through a sigh');
      // the second one spends Cozy Energy
      await gwait(h, 3);
      await take('test_letter');
      await toAnchor('test_letter');
      await h.page.keyboard.down('KeyE');
      await h.until(() => window.__G.save.story.stitch_test_letter, { timeout: 15000 });
      await h.page.keyboard.up('KeyE');
      h.assert((await h.eval(() => window.__G.save.cozy)) === 20, 'a stitch did not spend 10 Cozy Energy');
      await h.page.screenshot({ path: `${h.OUT}/fog-stitch.png` });
      // both are still there after a reload
      await h.reloaded(() => h.page.reload());
      await h.begin();
      s = await h.eval(() => ({ done: window.__G.zone.stitch.defs.filter((d) => d.done).length, warm: window.__G.zone.sighs.warm.length }));
      h.assert(s.done === 2 && s.warm === 3, 'the stitches after a reload: ' + JSON.stringify(s));
    },
  },
];

// ---------------------------------------------------------------- Chapter 4
const skipUntil = (h, pred, timeout = 90000) => h.until(pred, { timeout, tick: () => h.skipDialogue() });
// Put Pip at a spot in glTF coordinates (or beside a marker / an NPC), camera behind her.
const tp = (h, x, z, f = 0) => put(h, x, z, f);
const beside = (h, id, dz = -1.2) =>
  h.eval(([id, dz]) => {
    const G = window.__G;
    const at = G.npcs.get(id)?.position || G.zone.marker(id).position;
    G.player.teleport(at.clone().add({ x: 0, y: 0.2, z: dz }), dz < 0 ? 0 : Math.PI);
    G.cam.snapBehind(G.player);
  }, [id, dz]);
// Take a loose end and stitch it where it belongs (again, if a sigh makes her drop it).
async function stitch(h, id) {
  for (let tries = 0; tries < 6; tries++) {
    if (await h.eval((id) => window.__G.save.story['stitch_' + id], id)) return;
    await skipUntil(h, () => !window.__G.frozen && !window.__G.ui.dialogueOpen && window.__G.player.state === 'move', 60000);
    await h.eval((id) => {
      const G = window.__G;
      const d = G.zone.stitch.get(id);
      const f = typeof d.from === 'function' ? d.from() : d.from;
      G.player.teleport(f.clone().add({ x: 0, y: 0.2, z: -1.0 }), 0);
      G.cam.snapBehind(G.player);
    }, id);
    const got = await h.until(() => /^Take the/.test(window.__G.interact.current?.label || ''), { timeout: 15000, tick: () => h.skipDialogue() }).catch(() => false);
    if (!got) continue;
    await h.page.keyboard.press('KeyF');
    await h.until(() => !!window.__G.zone.stitch.holding, { timeout: 4000 }).catch(() => {});
    await h.eval((id) => {
      const G = window.__G;
      const d = G.zone.stitch.get(id);
      const t = typeof d.to === 'function' ? d.to() : d.to;
      // beside it, on whichever side is clear (not inside a cart or a wall)
      const up = { x: 0, y: 1, z: 0 };
      const side = [[0, -1.4], [0, 1.4], [1.4, 0], [-1.4, 0]].map(([x, z]) => t.clone().add({ x, y: 0.2, z })).find((c) => G.collision.hasLineOfSight(t.clone().add(up), c.clone().add(up)) && G.collision.floorY(c) !== null);
      G.player.teleport(side || t.clone().add({ x: 0, y: 0.2, z: -1.4 }), 0);
      G.cam.snapBehind(G.player);
    }, id);
    await h.page.keyboard.down('KeyE');
    await h.until(`window.__G.save.story.stitch_${id} || !window.__G.zone.stitch.holding`, { timeout: 40000 });
    await h.page.keyboard.up('KeyE');
  }
  h.assert(await h.eval((id) => window.__G.save.story['stitch_' + id], id), 'could not stitch ' + id);
}

TESTS.push(
  // Chapter 4, start to end: the white morning and Master Fang's note, the ferry, the district under the
  // fog and its first sigh, the square where the fog closes; then alone in the Old Quarter: the garden and
  // Bean, the grey Grumbling in the gap, the secret in the persimmon courtyard, three stitches down Thread
  // Street, and Sunny and Bo stitched back at the crossroads. Reloads on the way resume where she was.
  {
    name: 'chapter4-full',
    async run(h) {
      // (no ?zone= in the URL: it would override the save's zone when the test reloads further on)
      await h.open('', base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 60, sprites: ALL_SPRITES, story: { ...CH3_DONE, kind_barber: true, kind_oldman: true } }));
      await h.begin();
      const obj = () => h.eval(() => window.__G.ui.objective.textContent);
      await skipUntil(h, () => window.__G.save.story.ch4_start && !window.__G.frozen);
      h.assert(/Sunny and Bo/.test(await obj()), 'objective at the start: ' + (await obj()));
      h.assert(await h.eval(() => window.__G.npcs.get('fang').hidden), 'Master Fang is at the Academy');
      await beside(h, 'POINT_fang_court', 3);
      await skipUntil(h, () => window.__G.save.story.ch4_friends && !window.__G.frozen);
      // the note at the pavilion
      await h.eval(() => {
        const G = window.__G;
        const it = [...G.interactables].find((i) => i.label === 'Read Master Fang’s note');
        G.player.teleport(it.position.clone().add({ x: 0, y: 0, z: 1.2 }), Math.PI);
        G.cam.snapBehind(G.player);
      });
      await h.until(() => window.__G.interact.current?.label === 'Read Master Fang’s note', { timeout: 8000 });
      await h.page.keyboard.press('KeyF');
      await skipUntil(h, () => window.__G.save.story.ch4_note && !window.__G.frozen);
      await h.headsUpright('at the pavilion');
      // Bo at the gate: the ferry
      await h.until(() => {
        const G = window.__G;
        const wb = G.npcs.get('weibao');
        return !wb.walkTarget && wb.position.distanceTo(G.zone.marker('SPAWN_gate').position) < 4;
      }, { timeout: 120000 });
      await beside(h, 'weibao');
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 5000 });
      await h.page.keyboard.press('KeyF');
      await skipUntil(h, () => window.__G.zone?.id === 'quiet');
      await skipUntil(h, () => window.__G.save.story.ch4_ferry && !window.__G.frozen);
      // under the fog: memories are pockets, a checked neighbour has a lit window, the others don't
      let r = await h.eval(() => {
        const G = window.__G;
        return { state: G.zone.state, pockets: G.zone.pockets.length, greys: [...G.grumblings].length, clear: G.scene.fog.far, neighbours: ['barber', 'noodle', 'oldman'].filter((id) => G.npcs.get(id)).length };
      });
      h.assert(r.state === 'fog' && r.pockets === 8 && r.greys === 0 && r.clear < 20 && r.neighbours === 0, 'the district under the fog: ' + JSON.stringify(r));
      await h.page.screenshot({ path: `${h.OUT}/chapter4-fog.png` });
      // the fog wall still turns her back
      await tp(h, 0, 37, 0);
      await h.walk('KeyW', 2500);
      h.assert((await h.eval(() => window.__G.zone.id)) === 'quiet', 'she got through the fog wall before the fog closed');
      await skipUntil(h, () => !window.__G.frozen && !window.__G.ui.dialogueOpen);
      // up the lane: the first sigh
      await tp(h, 0, -9, 0);
      await skipUntil(h, () => window.__G.save.story.ch4_sigh, 120000);
      // the square: the fog closes
      await skipUntil(h, () => !window.__G.frozen && !window.__G.ui.dialogueOpen);
      await tp(h, 0, 25, 0);
      await skipUntil(h, () => window.__G.zone?.id === 'heart', 120000);
      // alone: the garden, Bean, the first sigh
      await skipUntil(h, () => window.__G.save.story.ch4_garden, 180000);
      r = await h.eval(() => ({ out: window.__G.zone.bean.out, lost: window.__G.save.story.ch4_lost, grey: window.__G.npcs.get('tangtang').h.meshes[0].material.color.getHexString() }));
      h.assert(r.out && r.lost && r.grey !== 'ffffff', 'alone in the garden: ' + JSON.stringify(r));
      // the garden's gate, the way south and the way back are all shut
      await tp(h, 5.6, -38.5, -Math.PI / 2);
      await h.walk('KeyW', 2500);
      h.assert((await h.eval(() => window.__G.player.position.x)) > 4.6, 'she got through the stuck gate');
      // the gap: a grey Grumbling sits in it until she has kept it company
      await tp(h, -8.6, -2, -Math.PI / 2);
      await h.walk('KeyW', 1800);
      h.assert((await h.eval(() => window.__G.player.position.x)) > -11.2 && !(await h.eval(() => window.__G.save.story.ch4_gap)), 'she walked straight through the gap');
      await tp(h, -8.8, -2, -Math.PI / 2);
      await skipUntil(h, () => window.__G.save.story.ch4_gap, 240000);
      await gwait(h, 1);
      h.assert((await h.eval(() => window.__G.save.spawn)) === 'SPAWN_row', 'no checkpoint after the gap');
      // a reload resumes there, Bean awake
      await h.reloaded(() => h.page.reload());
      await h.begin();
      await gwait(h, 1.5);
      r = await h.eval(() => ({ x: window.__G.player.position.x, out: window.__G.zone.bean.out, obj: window.__G.ui.objective.textContent }));
      h.assert(Math.abs(r.x - 6) < 2 && r.out && /Bean wants to show you/.test(r.obj), 'after a reload: ' + JSON.stringify(r));
      // not south yet
      await tp(h, -14, -3.5, 0);
      await h.walk('KeyW', 2600);
      h.assert((await h.eval(() => window.__G.player.position.z)) < 0, 'she went south before the secret');
      // the persimmon courtyard: the secret, walked through
      await tp(h, -12.5, -30, Math.PI);
      console.log('    (the Old Quarter: ' + (await h.eval(() => Math.round(1000 / window.__G.quality.ema))) + ' fps headless)');
      await h.until(() => window.__G.save.story.ch4_secret && !window.__G.frozen, {
        timeout: 900000,
        every: 300,
        tick: async () => {
          await h.skipDialogue();
          await h.eval(() => {
            const G = window.__G;
            const b = G.zone.beat;
            if (b && !G.frozen && G.player.position.distanceTo(b) > 2.5) {
              G.player.teleport(b.clone().add({ x: 0.8, y: 0.2, z: -0.8 }), 0);
              G.cam.snapBehind(G.player);
            }
          });
        },
      });
      r = await h.eval(() => ({ thread: window.__G.save.story.ch4_thread, range: window.__G.soothe.range(), sighs: window.__G.zone.sighs.fronts.length }));
      h.assert(r.thread && r.range === 10, 'after the secret: ' + JSON.stringify(r));
      await h.headsUpright('after the secret');
      await h.page.screenshot({ path: `${h.OUT}/chapter4-courtyard.png` });
      // Thread Street: three stitches
      for (const id of ['bell', 'letter']) await stitch(h, id);
      await h.reloaded(() => h.page.reload());
      await h.begin();
      await gwait(h, 1);
      r = await h.eval(() => ({ done: window.__G.zone.stitch.defs.filter((d) => d.done).length, obj: window.__G.ui.objective.textContent, z: window.__G.player.position.z }));
      h.assert(r.done === 2 && /\(2\/3\)/.test(r.obj) && r.z < -25, 'after a reload on Thread Street: ' + JSON.stringify(r));
      await stitch(h, 'lantern');
      await skipUntil(h, () => /Follow the thread/.test(window.__G.ui.objective.textContent), 20000);
      // the square is not for her alone
      await tp(h, -14, 28.6, 0);
      await h.walk('KeyW', 2500);
      h.assert((await h.eval(() => window.__G.player.position.z)) < 30.5, 'she walked into the square without her friends');
      // the crossroads
      await skipUntil(h, () => !window.__G.frozen && !window.__G.ui.dialogueOpen);
      await tp(h, -14, 21, 0);
      await skipUntil(h, () => window.__G.save.story.ch4_followed && !window.__G.frozen, 120000);
      await stitch(h, 'sunny');
      h.assert((await h.eval(() => window.__G.npcs.get('tangtang').h.meshes[0].material.color.getHexString())) === 'ffffff', 'Sunny is still grey');
      await stitch(h, 'bo');
      await skipUntil(h, () => window.__G.save.story.ch4Done && !window.__G.frozen, 180000);
      await h.page.screenshot({ path: `${h.OUT}/chapter4-reunion.png` });
      await h.headsUpright('after the reunion');
      const w = await h.walk('KeyW', 1500);
      h.assert(w.moved > 0.5 && w.under < 0.05, 'stuck after the reunion: ' + JSON.stringify(w));
    },
  },
);

// ---------------------------------------------------------------- Chapter 5
export const CH4_DONE = {
  ...CH3_DONE, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true, ch4_gap: true, ch4_secret: true,
  ch4_thread: true, stitch_bell: true, stitch_letter: true, stitch_lantern: true, ch4_followed: true, stitch_sunny: true, stitch_bo: true, ch4Done: true,
};
// A friend the Great Sulk's sigh has sat down: stand by them until they are up.
const checkOnFriends = (h) =>
  h.eval(() => {
    const G = window.__G;
    const C = G.zone.ch5;
    if (!C?.down.size || G.frozen) return false;
    const n = [...C.down.keys()][0];
    if (n.position.distanceTo(G.player.position) > 1.6) G.player.teleport(n.position.clone().add({ x: 0.9, y: 0.1, z: -0.6 }), 0);
    return true;
  });
// Until `pred`: skip dialogue (never a choice), and check on any friend who has sat down.
const through = (h, pred, timeout = 180000) =>
  h.until(pred, {
    timeout,
    every: 200,
    tick: async () => {
      await h.eval(() => window.__G.ui.dialogueOpen && !window.__G.ui.dlgChoices.childElementCount && (window.__G.ui.advance = true));
      await checkOnFriends(h);
    },
  });
const choose = (h, text) => h.eval((text) => [...window.__G.ui.dlgChoices.children].find((b) => b.textContent.includes(text))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), text);
// A "hum on the beat" panel (story/chapter5.js beats()): press Hum until it has gone.
const humThrough = async (h) => {
  await h.until(() => !!document.querySelector('.beats'), { timeout: 30000, tick: () => h.eval(() => window.__G.ui.dialogueOpen && (window.__G.ui.advance = true)) });
  await h.until(() => !document.querySelector('.beats'), { timeout: 90000, every: 350, tick: () => h.page.keyboard.press('KeyE') });
};
const interactAt = async (h, label, pos) => {
  await through(h, () => !window.__G.frozen && !window.__G.ui.dialogueOpen && !window.__G.zone.ch5.down.size);
  await h.eval(([label, pos]) => {
    const G = window.__G;
    const it = [...G.interactables].find((i) => (typeof i.label === 'function' ? i.label() : i.label) === label);
    const at = pos ? G.player.position.clone().set(...pos) : it.position;
    G.player.teleport(at.clone().add({ x: 0, y: 0.1, z: -1.0 }), 0);
    G.cam.snapBehind(G.player);
  }, [label, pos]);
  await h.until(`window.__G.interact.current && (typeof window.__G.interact.current.label === 'function' ? window.__G.interact.current.label() : window.__G.interact.current.label) === ${JSON.stringify(label)}`, { timeout: 10000 });
  await h.page.keyboard.press('KeyF');
};

// Chapter 5 from the crossroads to the Great Sulk asleep. story: extra flags (a phase's checkpoint to start from).
// expect: what this save should make of the finale (asked: times Bo is asked, with one wrong answer; sparrows
// and greys in the square; guests at the table; mine: the quilt's own patches, at least). stop: the flag
// to stop at (a phase's checkpoint).
const KIND = { kind_oldman: true, kid1Home: true, kind_musician: true, kind_books: true, kind_share: true };
async function playChapter5(h, { soothed = { 'quiet:grey_2': true, 'quiet:grey_5': true }, story = KIND, sprites = ALL_SPRITES, candies = {}, shots = false, stop = null, expect = { asked: 5, sparrows: 12, greys: 2, guests: 4, mine: 60 } } = {}) {
  await h.open('', base({ zone: 'heart', spawn: story.ch5_arrive ? 'SPAWN_square' : 'SPAWN_cross', cozy: 80, candies, sprites, soothed, story: { ...CH4_DONE, ...story } }));
  await h.begin();
  const stopped = async () => stop && (await h.eval((k) => !!window.__G.save.story[k], stop));
  const shot = (name) => shots && h.page.screenshot({ path: `${h.OUT}/chapter5-${name}.png` });
  const f = (k) => h.eval((k) => window.__G.save.story[k], k);
  if (!(await f('ch5_arrive'))) {
    h.assert((await h.eval(() => window.__G.npcs.get('tangtang').follower && window.__G.zone.bean.out)), 'the friends are not following, or Bean is asleep');
    await tp(h, -14, 32.4, 0);
    await h.walk('KeyW', 1400);
    await gwait(h, 5);
    await shot('arrival');
    await through(h, () => window.__G.save.story.ch5_arrive && !window.__G.frozen, 600000); // (a long scene, in software rendering)
  }
  // ---- 1. the cake: three tiers, a sigh after the first two (Sunny sits down; check on her)
  if (!(await f('ch5_p1'))) {
    for (let tier = (await f('ch5_tier')) || 0; tier < 3; tier++) {
      await through(h, () => {
        const G = window.__G;
        return !G.npcs.get('tangtang').walkTarget && !G.frozen && !G.ui.dialogueOpen && !G.zone.ch5.down.size;
      });
      await beside(h, 'tangtang', -1.2);
      await h.until(() => window.__G.interact.current?.label === 'Talk', { timeout: 8000 });
      await h.page.keyboard.press('KeyF');
      await h.until(() => window.__G.ui.dlgChoices.childElementCount > 0, { timeout: 15000 });
      await choose(h, 'Let’s bake');
      await h.until(() => !!document.querySelector('.cook'), { timeout: 20000 });
      await h.until(() => !document.querySelector('.cook'), { timeout: 60000, every: 400, tick: () => h.page.keyboard.press('KeyE') });
      if (tier === 0) {
        // the sigh after the first tier catches Sunny in the open
        await h.until(() => window.__G.zone.ch5.down.size > 0, { timeout: 60000, tick: () => h.eval(() => window.__G.ui.dialogueOpen && (window.__G.ui.advance = true)) });
        h.assert(/Check on Sunny/.test(await h.eval(() => window.__G.ui.objective.textContent)), 'no word to check on Sunny');
        await shot('sunny-down');
      }
    }
    await through(h, () => window.__G.save.story.ch5_p1 && !window.__G.frozen);
    const r = await h.eval(() => ({ pocket: window.__G.zone.pockets.at(-1).radius, warmth: window.__G.zone.sulk.warmTo }));
    h.assert(r.pocket >= 10 && r.pocket <= 16.01 && r.warmth > 0.1, 'after the cake: ' + JSON.stringify(r));
    await shot('cake');
  }
  if (await stopped()) return;
  // ---- 2. Bo listens: six feelings; the two grey Grumblings she kept company answer two of them
  if (!(await f('ch5_p2'))) {
    const LISTEN = ['I hear you', 'You waited a long time', 'I’m asking twice', 'You must miss them', 'Somebody should have said goodbye', 'Thank you for telling me'];
    let asked = 0,
      wrong = false;
    await h.until(() => window.__G.save.story.ch5_p2 && !window.__G.frozen, {
      timeout: 400000,
      every: 250,
      tick: async () => {
        await checkOnFriends(h);
        const s = await h.eval(() => {
          const G = window.__G;
          const wb = G.npcs.get('weibao');
          if (!G.frozen && !G.zone.ch5.down.size && !wb.walkTarget && wb.position.distanceTo(G.player.position) > 2.6) G.player.teleport(wb.position.clone().add({ x: 1.2, y: 0.1, z: -1.2 }), 0);
          return { choices: [...G.ui.dlgChoices.children].map((b) => b.textContent), open: G.ui.dialogueOpen, heard: G.save.story.ch5_heard || 0 };
        });
        if (s.choices.length) {
          asked++;
          // the first time, try the reply that fixes: it is the wrong one
          if (!wrong) {
            wrong = true;
            const calm = await h.eval(() => window.__G.soothe.calm);
            await choose(h, 'party');
            // the Great Sulk sighs at that, and it costs a Calm
            await h.until(`window.__G.soothe.calm === ${calm - 1}`, { timeout: 30000, tick: () => h.eval(() => window.__G.ui.dialogueOpen && !window.__G.ui.dlgChoices.childElementCount && (window.__G.ui.advance = true)) });
          } else await choose(h, LISTEN[s.heard]);
        } else if (s.open) await h.eval(() => (window.__G.ui.advance = true));
      },
    });
    // six feelings, less the ones her grey sprites answered, and one of them asked twice (the wrong answer)
    h.assert(asked === expect.asked, `Bo was asked ${asked} times (expected ${expect.asked})`);
    await shot('listened');
  }
  if (await stopped()) return;
  // ---- 3. every Charm Sprite returns; six patches to stitch
  if (!(await f('ch5_p3'))) {
    await through(h, () => window.__G.save.story.ch5_called && !window.__G.frozen);
    const sw = await h.eval(() => Object.fromEntries(Object.entries(window.__G.zone.ch5.swarms).map(([k, v]) => [k, v.list.length])));
    h.assert(sw.sparrow === expect.sparrows && sw.grey === expect.greys && sw.cloud === 1, 'the sprites that came: ' + JSON.stringify(sw));
    await gwait(h, 3);
    await shot('sprites');
    const calls = await h.eval(() => window.__G.renderer.info.render);
    console.log(`    (every sprite in the square: ${calls.calls} draw calls, ${Math.round(calls.triangles / 1000)}k triangles)`);
    for (const sp of ['sparrow', 'cloud', 'sock', 'homework', 'pompom', 'grey']) {
      for (let tries = 0; tries < 8 && !(await f('stitch_patch_' + sp)); tries++) {
        await through(h, () => !window.__G.frozen && !window.__G.ui.dialogueOpen && !window.__G.zone.ch5.down.size && window.__G.player.state === 'move');
        await stitch(h, 'patch_' + sp).catch(() => {});
      }
      h.assert(await f('stitch_patch_' + sp), 'could not stitch the patch for ' + sp);
    }
    h.assert((await h.eval(() => window.__G.zone.sulk.patches.sparrow.to)) === 1, 'the sparrows’ patch did not warm');
    await shot('patches');
    await through(h, () => window.__G.save.story.ch5_p3 && !window.__G.frozen);
  }
  if (await stopped()) return;
  // ---- 4. Grandmother's Kitchen: the fire, the pot, the bell
  if (!(await f('ch5_p4'))) {
    await through(h, () => window.__G.save.story.ch5_kitchen >= 0.5 && !window.__G.frozen);
    h.assert(await h.eval(() => !window.__G.npcs.get('fang').hidden && window.__G.renderer.info.programs.length > 0), 'Master Fang has not come');
    let r = await h.eval(() => window.__G.zone.ch5.domainWarm.radius);
    h.assert(Math.abs(r - 6) < 0.1, 'the Domain opened to ' + r);
    await shot('domain-open');
    for (const [label, radius] of [['Light the stove', 11], ['Stir the great pot', 14], ['Ring the dinner bell', 17]]) {
      await interactAt(h, label);
      await humThrough(h);
      await through(h, `window.__G.zone.ch5.domainWarm.radius > ${radius - 0.1} && !window.__G.frozen || window.__G.save.story.ch5_p4`);
      if (radius !== 14) continue;
      await shot('kitchen');
      // inside the Domain a sigh is only steam
      await h.eval(() => {
        const G = window.__G;
        window.__pass = null;
        G.events.on('sigh-pass', (e) => (window.__pass = e.caught));
        G.player.teleport(G.player.position.clone().set(-14, 0.2, 44), 0);
        G.zone.sighs.send(14, 2);
      });
      await h.until(() => window.__pass !== null, { timeout: 15000 });
      h.assert(!(await h.eval(() => window.__pass)), 'a sigh caught her inside the kitchen');
      // the long table is solid now
      await tp(h, -14, 37.6, 0);
      await h.walk('KeyW', 2500);
      h.assert((await h.eval(() => window.__G.player.position.z)) < 39.6, 'she walked through the kitchen table');
      await shot('table');
    }
    await through(h, () => window.__G.save.story.ch5_p4);
    r = await h.eval(() => ({ guests: window.__G.zone.ch5.guests.length, radius: window.__G.zone.ch5.domainWarm.radius }));
    // the people she was kind to (the low tier seats four of them at most)
    h.assert(r.radius > 16.9 && r.guests === expect.guests, 'the kitchen at the end: ' + JSON.stringify(r));
  }
  if (await stopped()) return;
  // ---- 5. the Everyone Blanket: the whole lullaby, then tuck it in
  if (!(await f('ch5_sewn'))) {
    await humThrough(h);
    await through(h, () => window.__G.save.story.ch5_sewn && !window.__G.frozen);
    const r = await h.eval(() => ({ cozy: window.__G.save.cozy, drape: window.__G.zone.ch5.quilt.drape, mine: window.__G.zone.ch5.quilt.mine }));
    h.assert(r.cozy === 0 && r.drape === 1 && r.mine >= expect.mine, 'after the blanket: ' + JSON.stringify(r));
    console.log(`    (the quilt: ${r.mine} patches of her own)`);
    await shot('blanket');
  }
  await interactAt(h, 'Tuck in the Great Sulk');
  await through(h, () => window.__G.save.story.ch5Done && !window.__G.frozen);
  h.assert(await h.eval(() => window.__G.zone.sulk.asleep), 'the Great Sulk is not asleep');
  await shot('asleep');
}

const P1 = { ch5_arrive: true, ch5_tier: 3, ch5_score: 12, ch5_p1: true };
const P2 = { ...P1, ch5_heard: 6, ch5_p2: true };
const P3 = { ...P2, ch5_called: true, ...Object.fromEntries(['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey'].map((s) => ['stitch_patch_' + s, true])), ch5_p3: true };
const P4 = { ...P3, ch5_kitchen: 3, ch5_p4: true };
TESTS.push(
  // Each phase of the finale from its own checkpoint (a reload in the middle of Chapter 5 resumes there, with
  // what the earlier phases left behind: the cake and its pocket, the sprites on their patches, the kitchen).
  ...[
    ['sulk-phase1', {}, 'ch5_p1'],
    ['sulk-phase2', P1, 'ch5_p2'],
    ['sulk-phase3', P2, 'ch5_p3'],
    ['sulk-phase4', P3, 'ch5_p4'],
    ['sulk-phase5', P4, null],
  ].map(([name, story, stop]) => ({
    name,
    async run(h) {
      await playChapter5(h, { story: { ...KIND, ...story }, stop });
      if (name === 'sulk-phase5') {
        // the kitchen was already open, the guests seated and the patches warm when she came back
        const r = await h.eval(() => ({ warm: Object.values(window.__G.zone.sulk.patches).filter((p) => p.to === 1).length, pocket: window.__G.zone.pockets.length }));
        h.assert(r.warm === 7, 'patches warm at the end: ' + r.warm);
      }
    },
  })),
  // What the player did before changes the finale. A bare save (one of each sprite, nobody kept company, nobody
  // helped) still finishes: Bo answers all six feelings himself, one sparrow comes, the table is laid but empty.
  {
    name: 'finale-bare',
    async run(h) {
      await playChapter5(h, { soothed: {}, story: P1, sprites: { doudou: 1, cloud: 1, sock: 1, homework: 1, pompom: 1, sparrow: 1, grey: 1 }, expect: { asked: 7, sparrows: 1, greys: 1, guests: 0, mine: 20 } });
    },
  },
  // A complete one: six grey Grumblings kept company answer four of the six feelings with Bo, every sparrow and
  // grey sprite flies in, the table is full, and far more of the quilt is her own.
  {
    name: 'finale-full',
    async run(h) {
      const all = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => ['quiet:grey_' + n, true]));
      const kind = { kind_oldman: true, kind_noodle: true, kind_barber: true, kid1Home: true, kid2Home: true, kid3Home: true, kind_musician: true, kind_books: true, kind_share: true, chestnutDone: true };
      const candies = Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['POINT_candy_' + (i + 1), true]));
      await playChapter5(h, { soothed: all, candies, story: { ...kind, ...P1 }, sprites: { ...ALL_SPRITES, grey: 6 }, expect: { asked: 3, sparrows: 12, greys: 6, guests: 4, mine: 110 } });
    },
  },
  // Chapter 5, start to end, with a save like most players' (every kind of sprite, two grey Grumblings kept
  // company, a few people she was kind to).
  {
    name: 'chapter5-full',
    async run(h) {
      await playChapter5(h, { shots: true });
      await h.headsUpright('at the end of Chapter 5');
      const w = await h.walk('KeyS', 1200);
      h.assert(w.under < 0.05, 'inside the floor after the finale: ' + JSON.stringify(w));
    },
  },
);

// ---------------------------------------------------------------- free roam, and thread fishing
export const EP_DONE = { ...P4, ch5_golden: true, ch5_sewn: true, ch5Done: true, ep_dawn: true, ep_walk: true, ep_breakfast: true, ep_fishing: true, ep_cardigan: true, epilogueDone: true };
export const freeSave = (zone, over = {}) => base({ zone, cozy: 40, tarts: 2, sprites: ALL_SPRITES, ...over, story: { ...CH4_DONE, ...KIND, ...EP_DONE, ...(over.story || {}) } });

// A player for the fishing, in the page: it only presses and holds Hum, as a player does, on what a player
// can see (the marker and the glimmers, the beat, the dip, the tugging). careful: eases off through the tugs.
// It runs in the frame, ahead of the game's own tick (so a press on the beat is on the beat even when the
// headless browser renders slowly).
const fishBot = (h, mode = 'careful') =>
  h.eval((mode) => {
    const G = window.__G;
    window.__bot = mode;
    if (window.__botFn && G.updaters.has(window.__botFn)) return;
    let last = -9,
      since = 0;
    const hold = (on) => (on ? G.input.keys.add('hum') : G.input.keys.delete('hum'));
    window.__botFn = () => {
      const f = G.zone.fishing;
      const m = window.__bot;
      if (!f?.phase || m === 'off') return hold(false);
      if (f.phase === 'aim') {
        if (f.wait > 0) return hold(false);
        if (!f.holding) since = G.time;
        // let go by a glimmer (or after a few sweeps: things that lie still may be off to one side)
        hold(!(f.holding && (f.glimmers.some((g) => Math.hypot(g.d - f.d, g.l - f.l) < 0.9) || G.time - since > 3)));
      } else if (f.phase === 'lure') {
        hold(false);
        const b = G.audio.beat();
        const off = Math.min(b.phase, 1 - b.phase) * G.audio.beatLength;
        if (m === 'offbeat' ? off > 0.25 && G.time - last > 0.5 : m !== 'wait' && off < 0.05 && G.time - last > 0.4) {
          last = G.time;
          G.input.press('hum');
        }
      } else if (f.phase === 'bite') {
        if (m !== 'miss') G.input.press('hum');
      } else if (f.phase === 'reel') hold(m === 'greedy' ? true : !f.tug && f.T < 0.7);
      else if (f.phase === 'card') {
        hold(false);
        if (document.querySelector('.fcard') && G.time - last > 0.8 && m !== 'read') {
          last = G.time;
          G.input.press('interact');
        }
      }
    };
    // ahead of everything already there
    const rest = [...G.updaters];
    G.updaters.clear();
    G.updaters.add(window.__botFn);
    for (const u of rest) G.updaters.add(u);
  }, mode);
// Walk up to a fishing spot and cast (the prompt, then Interact).
const startFishing = async (h, i = 0, next = []) => {
  await h.until(() => !!window.__G.zone.fishing && !window.__G.frozen, { timeout: 30000 });
  await h.eval(([i, next]) => {
    const G = window.__G;
    const f = G.zone.fishing;
    const s = f.spots[i];
    f.next = next;
    G.player.teleport(s.at.clone().addScaledVector(s.dir, -0.4), s.face);
    G.cam.snapBehind(G.player);
  }, [i, next]);
  await h.until(() => window.__G.interact.current?.label === 'Cast the thread', { timeout: 10000 });
  await h.page.keyboard.press('KeyF');
  await h.until(() => window.__G.zone.fishing.phase === 'aim', { timeout: 10000 });
};
const fishEvents = (h) =>
  h.eval(() => {
    const G = window.__G;
    window.__fish = { catches: [], escapes: 0, bites: 0 };
    G.events.on('fish-catch', (c) => window.__fish.catches.push(c));
    G.events.on('fish-escape', () => window.__fish.escapes++);
    G.events.on('fish-bite', () => window.__fish.bites++);
  });
const caught = (h, n, timeout = 180000) => h.until(`window.__fish.catches.length >= ${n} && window.__G.zone.fishing.phase === 'aim' && window.__fish`, { timeout });
const packUp = async (h) => {
  await fishBot(h, 'off');
  await h.until(() => window.__G.zone.fishing.phase === 'aim' && window.__G.zone.fishing.wait <= 0, { timeout: 20000 });
  await h.page.keyboard.press('KeyF');
  await h.until(() => !window.__G.zone.fishing.phase && !window.__G.frozen && window.__G.player.state === 'move' && !window.__G.cam.shot, { timeout: 10000 });
};

TESTS.push(
  // Every fishing spot: she stands on a floor, the whole of the cast's reach is open water at the height the
  // spot says, the camera can see her and the water, and everything that lives there is in the book's lists.
  {
    name: 'fishing-spots',
    async run(h) {
      let first = true;
      for (const zone of ['academy', 'station', 'market', 'quiet', 'heart']) {
        if (first) await h.open('?zone=' + zone, freeSave(zone));
        else {
          await h.page.goto(h.url('?zone=' + zone), { waitUntil: 'load' });
          await h.page.waitForFunction(() => !document.getElementById('begin').disabled, null, { timeout: 120000 });
        }
        first = false;
        await h.begin();
        await h.until(() => !!window.__G.zone.fishing, { timeout: 30000 });
        const r = await h.eval(() => {
          const G = window.__G;
          const f = G.zone.fishing;
          const bad = [];
          for (const s of f.spots) {
            const fy = G.collision.floorY(s.at);
            if (fy === null || Math.abs(fy - s.at.y) > 0.35) bad.push(`${s.id}: no floor where she stands (${fy})`);
            f.spot = s;
            const [near, far] = [s.range[0], s.range[1] + (s.fish.length ? 2 : 0)];
            for (const d of [near, (near + far) / 2, far])
              for (const l of [-s.wide, 0, s.wide]) {
                const p = f.place(G.player.position.clone(), s, d, l);
                const gy = G.collision.groundY(p.x, p.z, s.y + 3);
                // (the fountain's basin is a solid block to the collision, so she can't climb into it)
                if (s.id !== 'fountain' && gy !== null && gy > s.y + 0.02) bad.push(`${s.id}: not open water at ${d.toFixed(1)}, ${l.toFixed(1)} (ground ${gy.toFixed(2)}, water ${s.y})`);
              }
          }
          return { n: f.spots.length, bad };
        });
        h.assert(r.n > 0 && !r.bad.length, zone + ': ' + r.bad.join('; '));
        for (let i = 0; i < r.n; i++) {
          await startFishing(h, i);
          await gwait(h, 1.2);
          // the camera sees her head and the water
          const see = await h.eval(() => {
            const G = window.__G;
            const f = G.zone.fishing;
            const head = G.player.h.worldBone('head', G.player.position.clone());
            // (the far half of the reach: a bridge's rail may hide the water right under it)
            const mid = f.place(G.player.position.clone(), f.spot, f.spot.range[0] * 0.25 + f.spot.range[1] * 0.75, 0, 0.3);
            const P = (v) => G.ui.project(v);
            const a = P(head),
              b = P(mid);
            const panel = document.querySelector('.cook.fish').getBoundingClientRect();
            return { head: G.collision.hasLineOfSight(G.camera.position, head), water: G.collision.hasLineOfSight(G.camera.position, mid), a, b, panelTop: panel.top, w: innerWidth, id: f.spot.id };
          });
          // (the water itself may lie beyond the zone's invisible wall, which stops a ray but not the eye)
          h.assert(see.head, `${zone}/${see.id}: the camera cannot see her: ` + JSON.stringify(see));
          h.assert(see.a && see.b && see.a.y < see.panelTop && see.b.y < see.panelTop && see.a.x > 0 && see.a.x < see.w, `${zone}/${see.id}: her head or the water is off the screen or under the panel: ` + JSON.stringify(see));
          await h.page.screenshot({ path: `${h.OUT}/fishing-${zone}-${see.id}.png` });
          await packUp(h);
        }
      }
    },
  },
  // One catch, played with Hum alone: cast by a glimmer, hum it closer on the beat, press at the bite, wind in
  // and ease off through the tugs. The card says what it is and how long; a bigger one is a record; the fish
  // goes back; packing up gives her back to the player.
  {
    name: 'fishing-catch',
    async run(h) {
      await h.open('?zone=academy', freeSave('academy'));
      await h.begin();
      await fishEvents(h);
      await startFishing(h, 0, ['carp:44', 'carp:52', 'carp:30']);
      h.assert(await h.eval(() => window.__G.frozen && window.__G.player.state === 'pose' && !!window.__G.cam.shot), 'not set up to fish');
      await fishBot(h, 'read');
      await h.until(() => document.querySelector('.fcard')?.textContent.includes('Lotus Carp'), { timeout: 120000 });
      let card = await h.eval(() => document.querySelector('.fcard').textContent);
      h.assert(card.includes('New!') && card.includes('44 cm'), 'the first card: ' + card);
      await h.page.screenshot({ path: `${h.OUT}/fishing-card.png` });
      await fishBot(h, 'careful');
      let f = await caught(h, 1);
      h.assert(f.catches[0].first && f.catches[0].id === 'carp' && f.catches[0].spot === 'pond', JSON.stringify(f));
      await fishBot(h, 'read');
      await h.until(() => document.querySelector('.fcard')?.textContent.includes('52 cm'), { timeout: 120000 });
      card = await h.eval(() => document.querySelector('.fcard').textContent);
      h.assert(card.includes('A record!'), 'the second card: ' + card);
      await fishBot(h, 'careful');
      await caught(h, 2);
      await fishBot(h, 'read');
      await h.until(() => document.querySelector('.fcard')?.textContent.includes('30 cm'), { timeout: 120000 });
      card = await h.eval(() => document.querySelector('.fcard').textContent);
      h.assert(card.includes('your biggest: 52 cm') && !card.includes('record') && !card.includes('New'), 'the third card: ' + card);
      await fishBot(h, 'careful');
      f = await caught(h, 3);
      const s = await h.eval(() => ({ fish: window.__G.save.fish, patches: window.__G.save.patches }));
      h.assert(s.fish.carp[0] === 52 && s.fish.carp[1] === 3 && s.patches === 1, 'the log: ' + JSON.stringify(s));
      h.assert(f.escapes === 0, 'a careful hand lost one: ' + JSON.stringify(f));
      await packUp(h);
      const w = await h.walk('KeyS', 800);
      h.assert(w.moved > 0.4, 'she cannot walk after packing up: ' + JSON.stringify(w));
    },
  },
  // Winding straight through a strong fish's tugs loses it ("It got away!"), and nothing else: the log is
  // untouched and she casts again. Eased off, the same fish comes in.
  {
    name: 'fishing-escape',
    async run(h) {
      await h.open('?zone=station', freeSave('station'));
      await h.begin();
      await fishEvents(h);
      await startFishing(h, 0, ['whiskers:101']);
      await fishBot(h, 'greedy');
      await h.until(() => window.__fish.escapes === 1, { timeout: 120000 });
      const toast = await h.eval(() => document.querySelector('.toasts').textContent);
      h.assert(/got away/.test(toast) && /Old Whiskers/.test(toast), 'no "It got away": ' + toast);
      let s = await h.eval(() => ({ fish: window.__G.save.fish, n: window.__fish.catches.length, cozy: window.__G.save.cozy, tarts: window.__G.save.tarts }));
      h.assert(!s.fish.whiskers && s.n === 0 && s.cozy === 40 && s.tarts === 2, 'something was lost or gained: ' + JSON.stringify(s));
      await h.until(() => window.__G.zone.fishing.phase === 'aim', { timeout: 10000 });
      await fishBot(h, 'careful');
      const f = await caught(h, 1);
      s = await h.eval(() => window.__G.save.fish);
      h.assert(s.whiskers?.[0] === 101 && f.escapes === 1, 'the careful try: ' + JSON.stringify([s, f]));
      await packUp(h);
    },
  },
  // The lure: a note on the beat draws the glimmer in, a note off it makes it shy, a bite nobody answers is not
  // the end of it, and with no humming at all it still comes in the end.
  {
    name: 'fishing-lure',
    async run(h) {
      await h.open('?zone=quiet', freeSave('quiet'));
      await h.begin();
      await fishEvents(h);
      await startFishing(h, 1, ['minnow:8']);
      const interest = () => h.eval(() => window.__G.zone.fishing.interest);
      const lure = () => h.until(() => window.__G.zone.fishing.phase === 'lure', { timeout: 30000 });
      await fishBot(h, 'wait'); // cast, then nothing
      await lure();
      await h.eval(() => (window.__G.zone.fishing.interest = 0.3));
      await fishBot(h, 'offbeat');
      await gwait(h, 2.2);
      const off = await interest();
      h.assert(off < 0.3, 'notes off the beat did not make it shy: ' + off);
      await h.eval(() => (window.__G.zone.fishing.interest = 0.3));
      await fishBot(h, 'careful');
      await gwait(h, 1.6);
      const on = await interest();
      h.assert(on > 0.55, 'notes on the beat did not draw it in: ' + on);
      // a bite nobody answers
      await fishBot(h, 'miss');
      await h.until(() => window.__fish.bites === 1, { timeout: 60000 });
      await lure();
      h.assert((await interest()) < 0.6, 'a missed bite should set it back a little');
      // no humming at all: it still bites
      await fishBot(h, 'wait');
      const t0 = await h.eval(() => window.__G.time);
      await fishBot(h, 'miss');
      await h.eval(() => (window.__bot = 'wait2'));
      await h.until(() => window.__fish.bites === 2, { timeout: 120000 });
      const took = (await h.eval(() => window.__G.time)) - t0;
      h.assert(took < 25, 'with no humming the bite took ' + took.toFixed(1) + ' s');
      await fishBot(h, 'careful');
      await caught(h, 1);
      await packUp(h);
    },
  },
  // The Harbour Book: fish with the biggest, lost things and whose they are, reminders sent home, a wish from
  // the old fountain. It is a page of the Sprite Book, and it is still there after a reload.
  {
    name: 'fishing-log',
    async run(h) {
      await h.open('', freeSave('heart', { spawn: 'SPAWN_square' }));
      await h.begin();
      await fishEvents(h);
      await startFishing(h, 0, ['bell', 'wish', 'reminder']);
      await fishBot(h, 'careful');
      const f = await caught(h, 3, 240000);
      h.assert(f.catches.map((c) => c.kind).join() === 'lost,wish,reminder' && f.catches[2].text, JSON.stringify(f));
      await packUp(h);
      let s = await h.eval(() => window.__G.save);
      h.assert(s.lost.bell === 1 && s.reminders === 1, 'the save: ' + JSON.stringify([s.lost, s.reminders]));
      const book = async () => {
        await h.page.keyboard.press('Tab');
        await h.until(() => document.getElementById('menu-book').classList.contains('show'), { timeout: 10000 });
        const text = await h.eval(() => document.querySelector('#menu-book .pages').textContent);
        await h.page.screenshot({ path: `${h.OUT}/fishing-book.png` });
        await h.page.keyboard.press('Tab');
        await h.until(() => !window.__G.menus.open, { timeout: 5000 });
        return text;
      };
      let text = await book();
      h.assert(/The Harbour Book · 0\/14 fish/.test(text) && /A brass doorbell/.test(text) && /for the ferryman/.test(text) && /reminders sent home: 1/.test(text), 'the Harbour Book: ' + text);
      await h.reloaded(() => h.page.reload());
      await h.begin();
      await h.until(() => !!window.__G.zone.fishing, { timeout: 30000 });
      s = await h.eval(() => ({ zone: window.__G.zone.id, lost: window.__G.save.lost, reminders: window.__G.save.reminders }));
      h.assert(s.zone === 'heart' && s.lost.bell === 1 && s.reminders === 1, 'after a reload: ' + JSON.stringify(s));
      text = await book();
      h.assert(/A brass doorbell/.test(text), 'the Harbour Book after a reload: ' + text);
    },
  },
  // Phones: the panel and the catch card fit on the screen at the largest text, the panel's buttons take the
  // tap, and a catch can be played on the big Hum button alone.
  ...PHONES.map((ph) => ({
    name: 'fishing-touch-' + ph.name,
    touch: true,
    viewport: ph.viewport,
    async run(h) {
      await h.open('?zone=station', freeSave('station', { settings: { ...base().settings, textSize: 1.5 } }));
      await h.begin();
      await fishEvents(h);
      await h.until(() => !!window.__G.zone.fishing && !window.__G.frozen, { timeout: 30000 });
      await h.eval(() => {
        const G = window.__G;
        const s = G.zone.fishing.spots[0];
        G.zone.fishing.next = ['sprat:9'];
        G.player.teleport(s.at, s.face);
      });
      await h.until(() => document.querySelector('.tbtn.act').textContent === 'Cast the thread', { timeout: 10000 });
      const tap = async (sel) => {
        const b = await (await h.page.$(sel)).boundingBox();
        await h.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      };
      await tap('.tbtn.act');
      await h.until(() => window.__G.zone.fishing.phase === 'aim', { timeout: 10000 });
      const fits = (sel) =>
        h.eval((sel) => {
          const b = document.querySelector(sel).getBoundingClientRect();
          const hum = document.querySelector('.tbtn.hum').getBoundingClientRect();
          const over = !(b.right <= hum.left || b.left >= hum.right || b.bottom <= hum.top || b.top >= hum.bottom);
          return { ok: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight, over, b: [b.left, b.top, b.right, b.bottom].map(Math.round), w: innerWidth, h: innerHeight };
        }, sel);
      let r = await fits('.cook.fish');
      h.assert(r.ok && !r.over, 'the panel does not fit, or is over the Hum button: ' + JSON.stringify(r));
      for (const sel of ['.cook.fish .bait', '.cook.fish .leave', '.tbtn.hum']) {
        const hit = await h.hit(sel);
        h.assert(hit.ok, `${sel} is covered by ${hit.top}`);
      }
      // bait the thread with a tart (a tap)
      await gwait(h, 0.5);
      await tap('.cook.fish .bait');
      await h.until(() => window.__G.zone.fishing.baited && window.__G.save.tarts === 1, { timeout: 5000 });
      // the whole catch on the Hum button: real touches, timed by what is on the screen
      const hum = await (await h.page.$('.tbtn.hum')).boundingBox();
      const cdp = await h.page.context().newCDPSession(h.page);
      const touch = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: hum.x + hum.width / 2, y: hum.y + hum.height / 2 }] });
      let down = false,
        since = 0;
      const set = async (on) => {
        if (on === down) return;
        down = on;
        await touch(on ? 'touchStart' : 'touchEnd');
      };
      const deadline = Date.now() + 240000;
      for (;;) {
        const st = await h.eval(() => {
          const G = window.__G;
          const f = G.zone.fishing;
          const b = G.audio.beat();
          return { phase: f.phase, wait: f.wait, holding: f.holding, near: f.glimmers.some((g) => Math.hypot(g.d - f.d, g.l - f.l) < 1.2), tug: f.tug, T: f.T, n: window.__fish.catches.length, card: !!document.querySelector('.fcard'), off: Math.min(b.phase, 1 - b.phase) };
        });
        if (st.n >= 1 && st.phase === 'aim') break;
        if (Date.now() > deadline) throw new Error('no catch on the Hum button: ' + JSON.stringify(st));
        if (st.phase === 'aim') {
          if (!st.holding) since = Date.now();
          await set(st.wait > 0 ? false : !(st.holding && (st.near || Date.now() - since > 4000)));
        }
        else if (st.phase === 'lure') {
          await set(false);
          if (st.off < 0.12) await set(true);
        } else if (st.phase === 'bite') {
          await set(false);
          await set(true);
        } else if (st.phase === 'reel') await set(!st.tug && st.T < 0.6);
        else if (st.phase === 'card') {
          await set(false);
          if (st.card) {
            r = await fits('.fcard');
            h.assert(r.ok, 'the catch card does not fit: ' + JSON.stringify(r));
            await h.page.screenshot({ path: `${h.OUT}/fishing-touch-${ph.name}.png` });
            await gwait(h, 0.7);
            await tap('.fcard');
          }
        }
        await h.page.waitForTimeout(30);
      }
      await set(false);
      const s = await h.eval(() => window.__G.save.fish);
      h.assert(s.sprat?.[0] === 9, 'the catch: ' + JSON.stringify(s));
      await tap('.cook.fish .leave');
      await h.until(() => !window.__G.zone.fishing.phase && !window.__G.frozen, { timeout: 10000 });
    },
  })),
);

// ---------------------------------------------------------------- the Epilogue
const CH5_DONE = { ...P4, ch5_golden: 9, ch5_sewn: true, ch5Done: true };
// Stand beside an NPC (or at a spot) until the prompt is the one wanted, then press Interact.
const interactWith = async (h, label, at, off = [0, 0, -1.1]) => {
  await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen && window.__G.player.state === 'move', { timeout: 60000, tick: () => h.skipDialogue() });
  await h.eval(([at, off]) => {
    const G = window.__G;
    const pos = typeof at === 'string' ? (G.npcs.get(at)?.position || G.zone.marker(at).position).clone() : G.player.position.clone().set(...at);
    G.player.teleport(pos.add({ x: off[0], y: off[1] + 0.1, z: off[2] }), off[2] < 0 ? 0 : Math.PI);
    G.cam.snapBehind(G.player);
  }, [at, off]);
  await h.until(`(() => { const c = window.__G.interact.current; return c && (typeof c.label === 'function' ? c.label() : c.label) === ${JSON.stringify(label)}; })()`, { timeout: 15000 });
  await h.page.keyboard.press('KeyF');
};

TESTS.push(
  // The Epilogue from the sleeping Great Sulk to THE END: dawn in the square (the Sulk goes home, the fog and
  // the grey lift, the kitchen fades and its table stays), the walk back (colour, lanterns and shutters
  // return as she walks; breakfast with the neighbours), Uncle Ming's fishing lesson (three reminders), the
  // cardigan at the Academy, the credits, and free roam. Reloads at two checkpoints on the way.
  {
    name: 'epilogue-full',
    async run(h) {
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 0, sprites: ALL_SPRITES, soothed: { 'quiet:grey_2': true }, story: { ...CH4_DONE, ...KIND, kind_noodle: true, ...CH5_DONE } }));
      await h.begin();
      const shot = (n) => h.page.screenshot({ path: `${h.OUT}/epilogue-${n}.png` });
      // 1. dawn
      await skipUntil(h, () => !!document.querySelector('.card.show')?.textContent.includes('Morning in Lantern Bay'), 120000);
      await skipUntil(h, () => window.__G.zone.sulk.size < 0.5, 120000);
      await shot('1-dawn');
      await skipUntil(h, () => window.__G.save.story.ep_dawn && !window.__G.frozen, 240000);
      let s = await h.eval(() => {
        const G = window.__G;
        const u = G.scene.getObjectByName('sky') ? 1 : 0;
        return { sky: u, fogFar: G.scene.fog.far, sulk: G.zone.sulk.obj.visible, wall: G.zone.collision.parts.includes(G.zone.sulkWall), table: !!G.zone.group.getObjectByName('DOMAIN_table'), calmhud: !!document.querySelector('.calmhud'), bean: G.zone.bean.out, obj: G.ui.objective.textContent, spawn: G.save.spawn };
      });
      h.assert(s.sky && s.fogFar > 60 && !s.sulk && !s.wall && s.table && !s.calmhud && s.bean && /Walk back/.test(s.obj) && s.spawn === 'SPAWN_square', 'after the dawn: ' + JSON.stringify(s));
      const dom = await h.eval(() => [window.__G.zone.ch5.domainWarm.radius, window.__shared?.uFade]);
      h.assert(dom[0] < 0.1, 'the kitchen has not faded: ' + dom);
      await shot('2-morning');
      // where the Great Sulk sat is open ground
      await tp(h, -14, 57, Math.PI);
      const w = await h.walk('KeyW', 900);
      h.assert(w.moved > 0.5 && w.under < 0.05, 'cannot walk where the Great Sulk sat: ' + JSON.stringify(w));
      // 2. the walk back
      await h.eval(() => window.__G.player.teleport(window.__G.zone.marker('TRIGGER_quiet').position, 0));
      await h.until(() => window.__G.zone?.id === 'quiet' && !window.__G.frozen && window.__G.zone.fishing, { timeout: 60000 });
      await h.until(() => !!window.__G.npcs.get('laufriend') && !!window.__G.npcs.get('ming'), { timeout: 60000 });
      s = await h.eval(() => ({ left: window.__G.zone.lightsLeft.length, state: window.__G.zone.state, bean: window.__G.zone.bean?.out, obj: window.__G.ui.objective.textContent }));
      h.assert(s.left > 3 && s.state === 'after' && s.bean && /Breakfast/.test(s.obj), 'arriving in the district: ' + JSON.stringify(s));
      await gwait(h, 1.5);
      await shot('3-return');
      // Uncle Ming won't teach on an empty stomach
      // (asked from where she stands: walking to the jetty would bring the colour back to the whole lane first)
      await h.eval(() => void window.__G.npcs.get('ming').onTalk());
      await h.until(() => window.__G.ui.dialogueOpen && /Eat first/.test(window.__G.ui.dlgText.textContent), { timeout: 10000 });
      await skipUntil(h, () => !window.__G.ui.dialogueOpen && !window.__G.frozen);
      h.assert(!(await h.eval(() => window.__G.zone.fishing.phase)), 'the lesson started before breakfast');
      // breakfast
      await interactWith(h, 'Sit down to breakfast', [-2.4, 0, 14.9], [0, 0, 0]);
      await h.until(() => window.__G.player.state === 'sit', { timeout: 10000 });
      await gwait(h, 1.6);
      await shot('4-breakfast');
      await skipUntil(h, () => window.__G.save.story.ep_breakfast && !window.__G.frozen, 120000);
      s = await h.eval(() => ({ state: window.__G.player.state, cozy: window.__G.save.cozy, spawn: window.__G.save.spawn }));
      h.assert(s.state === 'move' && s.cozy >= 8 && s.spawn === 'SPAWN_breakfast', 'after breakfast: ' + JSON.stringify(s));
      const feet = await h.walk('KeyS', 600);
      h.assert(feet.under < 0.05, 'in the floor after breakfast: ' + JSON.stringify(feet));
      // colour, lanterns and shutters come back as she walks north
      const left0 = await h.eval(() => window.__G.zone.lightsLeft.length);
      await tp(h, 0, 6, Math.PI);
      await gwait(h, 2.5);
      const left1 = await h.eval(() => window.__G.zone.lightsLeft.length);
      h.assert(left1 < left0 && !(await h.eval(() => window.__G.save.story.ep_walk)), `lanterns did not relight as she walked: ${left0} -> ${left1}`);
      await shot('5-colour');
      await tp(h, 0, -13, Math.PI);
      await h.until(() => window.__G.save.story.ep_walk && window.__G.zone.lightsLeft.length === 0, { timeout: 20000 });
      // a reload here: the district is simply in colour
      await h.reloaded(() => h.page.reload());
      await h.begin();
      await h.until(() => window.__G.zone?.id === 'quiet' && !!window.__G.npcs.get('ming') && window.__G.zone.fishing, { timeout: 60000 });
      s = await h.eval(() => ({ left: window.__G.zone.lightsLeft.length, z: window.__G.player.position.z, obj: window.__G.ui.objective.textContent, friend: !!window.__G.npcs.get('laufriend') }));
      h.assert(s.left === 0 && Math.abs(s.z - 13.2) < 2 && /fishing/.test(s.obj) && s.friend, 'after a reload on the walk back: ' + JSON.stringify(s));
      // 3. the lesson: three reminders, on Hum alone
      await fishEvents(h);
      await fishBot(h, 'careful');
      await interactWith(h, 'Talk', 'ming', [-1.2, 0, 0.4]);
      await skipUntil(h, () => window.__G.zone.fishing.phase === 'aim', 120000);
      h.assert(await h.eval(() => document.querySelector('.cook.fish .leave').hidden), 'the lesson can be walked out of');
      await h.until(() => window.__fish.catches.length >= 1, { timeout: 180000 });
      await shot('6-lesson');
      await skipUntil(h, () => window.__G.save.story.ep_fishing && !window.__G.frozen && !window.__G.zone.fishing.phase, 300000);
      s = await h.eval(() => ({ n: window.__fish.catches.map((c) => c.text), reminders: window.__G.save.reminders, spawn: window.__G.save.spawn }));
      h.assert(s.n.length === 3 && /Mum/.test(s.n[2]) && s.reminders === 3 && s.spawn === 'SPAWN_jetty', 'the lesson: ' + JSON.stringify(s));
      await fishBot(h, 'off');
      // 4. home on the ferry, and the cardigan
      await interactWith(h, 'Talk', 'ferryman', [-1.3, 0, 0.3]);
      await h.until(() => window.__G.zone?.id === 'academy' && !window.__G.frozen, { timeout: 60000, tick: () => h.skipDialogue() });
      await h.until(() => /pavilion/.test(window.__G.ui.objective.textContent), { timeout: 30000 });
      h.assert(await h.eval(() => !!window.__G.zone.group.getObjectByName('bunting') && window.__G.zone.bean.out), 'no bunting, or Bean is not awake, at the Academy');
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.npcs.get('fang').position.clone().add({ x: 0.5, y: 0, z: 3 }), Math.PI);
      });
      await skipUntil(h, () => window.__G.save.story.ep_cardigan, 120000);
      await gwait(h, 1.5);
      await shot('7-cardigan');
      await skipUntil(h, () => !!document.querySelector('.credits'), 180000);
      s = await h.eval(() => ({ text: document.querySelector('.credits').textContent, link: document.querySelector('.credits a')?.href, bean: window.__G.zone.bean.out }));
      h.assert(/Charm Sprites befriended\s*19/.test(s.text) && /Memories restored\s*6/.test(s.text) && /github\.com/.test(s.link) && !s.bean, 'the credits: ' + JSON.stringify(s));
      await shot('8-credits');
      await gwait(h, 0.5);
      await h.page.click('.credits button');
      await h.until(() => window.__G.save.story.epilogueDone && !window.__G.frozen, { timeout: 30000 });
      // 5. free roam, in the cardigan
      s = await h.eval(() => ({ map: window.__G.player.h.meshes.map((m) => m.material.map?.name).join(), fishing: !!window.__G.zone.fishing }));
      h.assert(/cardigan/.test(s.map) && s.fishing, 'after the end: ' + JSON.stringify(s));
      await h.reloaded(() => h.page.reload());
      await h.begin();
      s = await h.eval(() => ({ zone: window.__G.zone.id, model: window.__G.player.h.name, frozen: window.__G.frozen }));
      h.assert(s.zone === 'academy' && s.model === 'xiaopei_cardigan', 'after a reload at the end: ' + JSON.stringify(s));
      await h.headsUpright('after the Epilogue');
    },
  },
);

// ---------------------------------------------------------------- free-roam Lantern Bay
const hum = (h, on) => h.eval((on) => void (on ? window.__G.input.keys.add('hum') : window.__G.input.keys.delete('hum')), on);
// The day's worries, as a test wants them (the board hands out three; a test may pin up a zone's whole list).
const withWorries = (ids, day = 9) => ({ day, worries: { day, ids, done: ids.map(() => false) } });
// Stand by a worry's Grumbling (or by its person) and hum until it is soothed.
const sootheWorry = async (h, id, { off = [0, -2.2], timeout = 120000 } = {}) => {
  await h.until(`window.__G.zone.worries.live.get(${JSON.stringify(id)})?.g.length > 0`, { timeout: 30000 });
  await h.eval(([id, off]) => {
    const G = window.__G;
    const g = G.zone.worries.live.get(id).g.find((x) => !x.soothed);
    const at = (g.opts.person?.position || g.home).clone();
    G.player.teleport(at.add({ x: off[0], y: 0.1, z: off[1] }), off[1] < 0 ? 0 : Math.PI);
    G.cam.snapBehind(G.player);
  }, [id, off]);
  await hum(h, true);
  await h.until(`!window.__G.zone.worries.live.has(${JSON.stringify(id)})`, { timeout, tick: () => h.skipDialogue() });
  await hum(h, false);
};
const reopen = async (h, q) => {
  await h.page.goto(h.url(q), { waitUntil: 'load' });
  await h.page.waitForFunction(() => !document.getElementById('begin').disabled, null, { timeout: 120000 });
};
// Walk up to the worry board and read it: how many notes, how many crossed out.
const readBoard = async (h) => {
  await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 60000, tick: () => h.skipDialogue() });
  await h.eval(() => {
    const G = window.__G;
    const it = [...G.interactables].find((i) => i.label === 'Read the worry board');
    G.player.teleport(it.position.clone().add({ x: 0.3, y: 0.1, z: 0 }), -Math.PI / 2);
    G.cam.snapBehind(G.player);
  });
  await h.until(() => window.__G.interact.current?.label === 'Read the worry board', { timeout: 10000 });
  await h.page.keyboard.press('KeyF');
  await h.until(() => !!document.querySelector('.wboard'), { timeout: 5000 });
  return h.eval(() => ({ notes: document.querySelectorAll('.wnote').length, done: document.querySelectorAll('.wnote.done').length, frozen: window.__G.frozen, text: document.querySelector('.wboard').textContent }));
};
const ZONE_WORRIES = {
  academy: ['a_cloud', 'a_sock', 'a_homework', 'a_pompom', 'a_jitters', 'a_letter'],
  station: ['s_cloud', 's_jitters', 's_letter'],
  market: ['m_sparrow', 'm_cloud', 'm_sock', 'm_letter', 'm_bottled'],
  quiet: ['q_cloud', 'q_grey', 'q_homework', 'q_pompom', 'q_letter', 'q_bottled'],
  heart: ['h_grey', 'h_cloud', 'h_letter', 'h_sock'],
};
const SPAWN = { academy: 'SPAWN_gate', station: 'SPAWN_start', market: 'SPAWN_start', quiet: 'SPAWN_ferry', heart: 'SPAWN_start' };

TESTS.push(
  // Everyone stands on the floor in the places as they are after the story (and the Old Quarter under the fog):
  // Pip, the people, the breakfast table's and the worry board's surroundings (the dev build warns "[floor]").
  ...[
    ['heart-fog', 'heart', () => base({ zone: 'heart', sprites: ALL_SPRITES, story: { ...CH3_DONE, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true } })],
    ...Object.keys(SPAWN).map((zone) => ['free-' + zone, zone, () => freeSave(zone, withWorries(ZONE_WORRIES[zone]))]),
  ].map(([name, zone, save]) => ({
    name: 'floor-' + name,
    async run(h) {
      await h.open('?zone=' + zone + '&spawn=' + SPAWN[zone], save());
      await h.begin();
      await h.eval(() => window.__G.zone.streamed);
      await h.until(() => !window.__G.frozen, { timeout: 60000, tick: () => h.skipDialogue() });
      await h.page.waitForTimeout(2600); // the floor check runs twice a second
      const f = await h.feet();
      h.assert(f.under < 0.05, 'Pip is inside the floor: ' + JSON.stringify(f));
      await h.headsUpright(name);
    },
  })),

  // Every worry on the list, in its own place: its Grumbling comes out (or the fishing spot knows about it), its
  // spot is on a floor with room round it, the guide's route reaches it, and what its species needs is there
  // (a sock's hiding places, a pom-pom's company, the person a letter was written to within the thread's reach).
  // The board lists them all.
  ...Object.keys(ZONE_WORRIES).map((zone) => ({
    name: 'worries-' + zone,
    async run(h) {
      const ids = ZONE_WORRIES[zone];
      await h.open('?zone=' + zone + '&spawn=' + SPAWN[zone], freeSave(zone, withWorries(ids)));
      await h.begin();
      await h.until(() => !!window.__G.zone.worries, { timeout: 30000 });
      await h.eval(() => window.__G.zone.streamed);
      await gwait(h, 1.5);
      const r = await h.eval((ids) => {
        const G = window.__G;
        const z = G.zone,
          col = G.collision,
          w = z.worries;
        const V = (x, y, zz) => G.player.position.clone().set(x, y, zz);
        const bad = [];
        const start = G.player.position.clone();
        // route: also check that the guide's way there ends in a clear last leg (not for a hiding place, or a
        // person who stands where the game has always had them)
        const onFloor = (p, what, route = true) => {
          const fy = col.floorY(p, 0.8, 0.4);
          if (fy === null || Math.abs(fy - p.y) > 0.3) return void bad.push(`${what}: not on a floor (${fy}) at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (col.raycast(V(p.x, fy + 0.45, p.z), V(dx, 0, dz), 0.4) < 0.4) return void bad.push(`${what}: inside something at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
          if (!route) return;
          const path = z.routes.path(start, p);
          const from = path.points.length > 1 ? path.points.at(-2) : start;
          const a = V(from.x, from.y + 0.7, from.z),
            b = V(p.x, fy + 0.7, p.z);
          if (from.distanceTo(p) > 0.5 && !col.hasLineOfSight(a, b)) bad.push(`${what}: the route's last leg is blocked (from ${from.x.toFixed(1)}, ${from.z.toFixed(1)} to ${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
        };
        for (const id of ids) {
          const live = w.live.get(id);
          if (!live) {
            bad.push(id + ': did not come out');
            continue;
          }
          if (id.endsWith('bottled')) {
            if (!z.fishing.spots.some((s) => s.id === z.fishing.want)) bad.push(id + ': no fishing spot knows about it');
            continue;
          }
          if (!live.g.length) bad.push(id + ': no Grumbling');
          const g = live.g[0];
          // (a flock's worry is at its seat, which the market's own tests cover)
          if (!id.endsWith('sparrow')) onFloor(live.at, id, !g?.opts.person);
          for (const s of g?.opts.spots || []) onFloor(s, id + ' hiding place', false);
          if (g?.opts.company) onFloor(g.opts.company, id + ' company', false);
          const d = z.stitch?.get('worry_' + id);
          if (id.endsWith('letter')) {
            if (!d) bad.push(id + ': no thread to take');
            else {
              const to = typeof d.to === 'function' ? d.to() : d.to;
              const len = to.distanceTo(live.at);
              if (len > 22 || len < 3) bad.push(`${id}: whoever it is for is ${len.toFixed(1)} m away (the thread reaches 25)`);
            }
          }
        }
        return { bad, live: w.live.size };
      }, ids);
      h.assert(!r.bad.length, r.bad.join('; '));
      // the board (where this place has one) lists them
      const board = await h.eval(() => [...window.__G.interactables].some((i) => i.label === 'Read the worry board'));
      h.assert(board === (zone === 'academy' || zone === 'quiet'), zone + ': worry board ' + board);
      if (board) {
        const n = await readBoard(h);
        h.assert(n.notes === ids.length && n.frozen, 'the board: ' + JSON.stringify(n));
        await h.page.keyboard.press('KeyF');
        await h.until(() => !document.querySelector('.wboard') && !window.__G.frozen, { timeout: 5000 });
      }
    },
  })),
);

TESTS.push(
  // A day on the worry board: the first day's three (two at home, one across the water). The board lists
  // them; a soothed one is crossed out, earns a patch and a word of thanks; a First-Day Jitters bolts when
  // hummed at from afar and settles once its person has company; sleeping on it brings the next day's three.
  {
    name: 'worries-day',
    async run(h) {
      await h.open('', freeSave('academy', { spawn: 'SPAWN_gate', helper: 'cloud' }));
      await h.begin();
      await h.until(() => !!window.__G.zone.worries, { timeout: 30000 });
      let s = await h.eval(() => ({ w: window.__G.save.worries, obj: window.__G.ui.objective.textContent }));
      h.assert(s.w.day === 1 && s.w.ids.join() === 'a_cloud,q_cloud,a_jitters' && /day 1 · worries soothed 0\/3/.test(s.obj), 'the first day: ' + JSON.stringify(s));
      let b = await readBoard(h);
      h.assert(b.notes === 3 && b.done === 0 && /tea towels/.test(b.text) && /Quiet District/.test(b.text) && /Sunny/.test(b.text), 'the board: ' + JSON.stringify(b));
      await h.page.screenshot({ path: `${h.OUT}/worry-board.png` });
      await h.page.keyboard.press('KeyF');
      await h.until(() => !document.querySelector('.wboard') && !window.__G.frozen, { timeout: 5000 });
      // the cloud on the kitchen step
      const patches = await h.eval(() => window.__G.save.patches || 0);
      await sootheWorry(h, 'a_cloud');
      s = await h.eval(() => ({ w: window.__G.save.worries, patches: window.__G.save.patches, worried: window.__G.save.worried, obj: window.__G.ui.objective.textContent }));
      h.assert(s.w.done[0] && !s.w.done[2] && s.patches === patches + 1 && s.worried === 1 && /soothed 1\/3/.test(s.obj), 'after the cloud: ' + JSON.stringify(s));
      await h.until(() => [...document.querySelectorAll('.bubble')].some((x) => /tea towels/.test(x.textContent)), { timeout: 20000 });
      // the Jitters: hummed at from far off it bolts, and nothing is gained
      await h.until(() => window.__G.zone.worries.live.get('a_jitters')?.g.length > 0, { timeout: 30000 });
      await h.eval(() => {
        const G = window.__G;
        const g = G.zone.worries.live.get('a_jitters').g[0];
        G.player.teleport(g.opts.person.position.clone().add({ x: 0, y: 0.1, z: -6.5 }), 0);
        G.cam.snapBehind(G.player);
      });
      await hum(h, true);
      await h.until(() => window.__G.zone.worries.live.get('a_jitters').g[0].behaviour.bolting, { timeout: 20000 });
      await gwait(h, 2);
      await hum(h, false);
      s = await h.eval(() => ({ p: window.__G.zone.worries.live.get('a_jitters').g[0].progress, tip: window.__G.save.story.jittersTip }));
      h.assert(s.p < 0.2 && s.tip, 'hummed at from far away: ' + JSON.stringify(s));
      await h.page.screenshot({ path: `${h.OUT}/worry-jitters.png` });
      // standing with its person, it settles
      await sootheWorry(h, 'a_jitters', { off: [0, -1.3] });
      s = await h.eval(() => ({ w: window.__G.save.worries, sprites: window.__G.save.sprites.jitters, day: window.__G.save.day }));
      h.assert(s.w.done[2] && s.sprites === 1 && s.day === 1, 'after the Jitters: ' + JSON.stringify(s));
      b = await readBoard(h);
      h.assert(b.done === 2, 'two crossed out on the board: ' + JSON.stringify(b));
      await h.page.keyboard.press('KeyF');
      await h.until(() => !document.querySelector('.wboard'), { timeout: 5000 });
      // sleep on it: a new day, three new worries
      await interactWith(h, 'Turn in for the night', 'POINT_sleepy_2', [2.2, 0, 0.6]);
      await h.until(() => window.__G.ui.dialogueOpen && window.__G.ui.dlgChoices.childElementCount === 2, { timeout: 10000 });
      await choose(h, 'Sleep');
      await h.until(() => window.__G.save.day === 2 && !window.__G.frozen, { timeout: 20000 });
      s = await h.eval(() => ({ w: window.__G.save.worries, obj: window.__G.ui.objective.textContent }));
      h.assert(s.w.day === 2 && s.w.ids.length === 3 && new Set(s.w.ids).size === 3 && !s.w.ids.some((id) => ['a_cloud', 'q_cloud', 'a_jitters'].includes(id)) && s.w.done.every((d) => !d), 'the second day: ' + JSON.stringify(s));
      // (and on the second day Sunny has a job for her: story/firstyears.js)
      h.assert(/Sunny has a job/.test(s.obj), 'the second day’s objective: ' + s.obj);
      await h.reloaded(() => h.page.reload());
      await h.begin();
      await h.until(() => !!window.__G.zone.worries, { timeout: 30000 });
      s = await h.eval(() => window.__G.save.worries);
      h.assert(s.day === 2 && s.ids.length === 3, 'after a reload: ' + JSON.stringify(s));
    },
  },
  // The day's third worry soothed: tomorrow's are pinned up at once, with no sleep needed.
  {
    name: 'worries-newday',
    async run(h) {
      const save = freeSave('academy', { helper: 'cloud', day: 7, fyDone: true, worries: { day: 7, ids: ['a_cloud', 'm_cloud', 'q_grey'], done: [false, true, true] } });
      save.story.fyDone = true;
      await h.open('', save);
      await h.begin();
      await sootheWorry(h, 'a_cloud');
      await h.until(() => window.__G.save.day === 8, { timeout: 30000 });
      const s = await h.eval(() => ({ w: window.__G.save.worries, obj: window.__G.ui.objective.textContent, toast: document.querySelector('.toasts').textContent }));
      h.assert(s.w.day === 8 && s.w.ids.length === 3 && !s.w.ids.includes('a_cloud') && /day 8 · worries soothed 0\/3/.test(s.obj) && /Tomorrow’s are on the board/.test(s.toast), 'the next day: ' + JSON.stringify(s));
    },
  },
  // An Unsent Letter: humming only makes it seal itself; its thread, stitched to whoever it was written to,
  // delivers it, and then it lets itself be tucked in.
  {
    name: 'species-letter',
    async run(h) {
      await h.open('?zone=quiet', freeSave('quiet', { spawn: 'SPAWN_ferry', ...withWorries(['q_letter']) }));
      await h.begin();
      await h.until(() => window.__G.zone.worries?.live.get('q_letter')?.g.length > 0, { timeout: 30000 });
      await h.eval(() => window.__G.zone.streamed);
      await interactWith(h, 'Notice', [-4.6, 0, -13.6], [0, 0, -1.6]);
      await h.until(() => window.__G.zone.worries.live.get('q_letter').g[0].noticed, { timeout: 5000 });
      await hum(h, true);
      await gwait(h, 2.5);
      await hum(h, false);
      let s = await h.eval(() => ({ p: window.__G.zone.worries.live.get('q_letter').g[0].progress, tip: window.__G.save.story.letterTip }));
      h.assert(s.p === 0 && s.tip, 'humming at the letter: ' + JSON.stringify(s));
      await h.page.screenshot({ path: `${h.OUT}/worry-letter.png` });
      await interactWith(h, 'Take the letter’s thread', [-4.6, 0, -13.6], [0, 0, -1.0]);
      await h.until(() => !!window.__G.zone.stitch.holding, { timeout: 5000 });
      // walk it to the ferryman, and stitch
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.npcs.get('ferryman').position.clone().add({ x: -1.2, y: 0.1, z: 0.6 }), 0);
      });
      await h.until(() => document.querySelector('.prompt').textContent.includes('Stitch it here'), { timeout: 10000 });
      await hum(h, true);
      await h.until(() => !window.__G.zone.stitch.holding, { timeout: 60000 });
      await hum(h, false);
      await h.until(() => window.__G.save.sprites.letter === 1 && !window.__G.zone.worries.live.has('q_letter'), { timeout: 60000 });
      s = await h.eval(() => ({ w: window.__G.save.worries.done, cozy: window.__G.save.cozy, holding: !!window.__G.zone.stitch.holding }));
      h.assert(s.w[0] && !s.holding, 'after the letter: ' + JSON.stringify(s));
    },
  },
  // A Bottled-Up: it is in the water where the board says, a hard pull sends it back under, and a gentle line
  // brings it in as a Charm Sprite (whose Float makes things bite sooner).
  {
    name: 'species-bottled',
    async run(h) {
      await h.open('?zone=market', freeSave('market', withWorries(['m_bottled'])));
      await h.begin();
      await h.until(() => window.__G.zone.worries?.live.has('m_bottled') && window.__G.zone.fishing?.want === 'seawall', { timeout: 30000 });
      await h.until(() => !window.__G.frozen, { timeout: 60000, tick: () => h.skipDialogue() });
      await fishEvents(h);
      // (which glimmer takes the float is up to the water: ask for the bottle, as the lesson asks for reminders)
      await startFishing(h, 0, ['bottled']);
      await fishBot(h, 'greedy');
      await h.until(() => window.__fish.escapes === 1, { timeout: 120000 });
      const toast = await h.eval(() => document.querySelector('.toasts').textContent);
      h.assert(/gentler hand/.test(toast) && !(await h.eval(() => window.__G.save.sprites.bottled)), 'a hard pull: ' + toast);
      await h.until(() => window.__G.zone.fishing.phase === 'aim', { timeout: 10000 });
      await fishBot(h, 'careful');
      await caught(h, 1);
      await packUp(h);
      const s = await h.eval(() => ({ sprites: window.__G.save.sprites.bottled, done: window.__G.save.worries.done[0], want: window.__G.zone.fishing.want, live: window.__G.zone.worries.live.size }));
      h.assert(s.sprites === 1 && s.done && !s.want && s.live === 0, 'after the bottle: ' + JSON.stringify(s));
    },
  },
  // Every lost thing has someone to take it back to, in the place it says: they are there after the story,
  // the prompt is "Give it back", and they say thank you.
  {
    name: 'lost-return',
    async run(h) {
      const where = { quiet: ['umbrella', 'tile', 'bottle', 'bell'], academy: ['sock', 'tin', 'thimble'], market: ['boat', 'brush'], station: ['specs'] };
      let first = true;
      for (const [zone, ids] of Object.entries(where)) {
        const save = freeSave(zone, { spawn: SPAWN[zone], lost: Object.fromEntries(ids.map((id) => [id, 1])), fish: {}, line: {}, reminders: 0, ming: 0 });
        if (first) await h.open('?zone=' + zone, save);
        else {
          // (the game saves on the way out of a page: hand it the next save first)
          await h.eval((s) => void (window.__G.save = s), save);
          await reopen(h, '?zone=' + zone);
        }
        first = false;
        await h.begin();
        await h.until(() => !!window.__G.zone.fishing, { timeout: 30000 });
        await h.eval(() => window.__G.zone.streamed);
        for (const id of ids) {
          const owner = await h.eval((id) => {
            const G = window.__G;
            const it = [...G.interactables].filter((i) => i.label === 'Give it back' && i.enabled());
            // the one whose turn it is: the owner who still has something coming
            return it.length;
          }, id);
          h.assert(owner >= 1, `${zone}: nobody to give ${id} back to`);
          await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 30000, tick: () => h.skipDialogue() });
          await h.eval(() => {
            const G = window.__G;
            const it = [...G.interactables].find((i) => i.label === 'Give it back' && i.enabled());
            G.player.teleport(it.position.clone().add({ x: 0, y: 0.1, z: -1.2 }), 0);
            G.cam.snapBehind(G.player);
          });
          await h.until(() => window.__G.interact.current?.label === 'Give it back', { timeout: 10000 });
          const before = await h.eval(() => Object.values(window.__G.save.lost).filter((v) => v === 2).length);
          await h.page.keyboard.press('KeyF');
          await h.until(`Object.values(window.__G.save.lost).filter((v) => v === 2).length === ${before + 1}`, { timeout: 30000, tick: () => h.skipDialogue() });
        }
        const s = await h.eval(() => ({ lost: window.__G.save.lost, patches: window.__G.save.patches }));
        h.assert(ids.every((id) => s.lost[id] === 2) && s.patches >= ids.length * 2, zone + ': ' + JSON.stringify(s));
      }
    },
  },
  // After the story every place can be reached from every other: Bo at the gate (the Quiet District, the night
  // market, the station), the ferryman, the market's stairs, the hill path, and the walk to the Old Quarter.
  {
    name: 'freeroam-travel',
    async run(h) {
      await h.open('', freeSave('academy', { spawn: 'SPAWN_gate' }));
      await h.begin();
      let leg = 0;
      const arrive = async (zone) => {
        leg++;
        await h.until(`window.__G.zone?.id === '${zone}' && !window.__G.frozen && !!window.__G.zone.worries`, { timeout: 60000 }).catch(async (e) => {
          throw new Error(`leg ${leg} to ${zone}: ` + JSON.stringify(await h.eval(() => ({ zone: window.__G.zone?.id, frozen: window.__G.frozen, dlg: window.__G.ui.dialogueOpen, text: window.__G.ui.dlgText.textContent, worries: !!window.__G.zone?.worries }))));
        });
        const s = await h.eval(() => ({ obj: window.__G.ui.objective.textContent, ...window.__G.player.position }));
        h.assert(/Lantern Bay, day 1/.test(s.obj), zone + ': ' + JSON.stringify(s));
        const f = await h.feet();
        h.assert(f.under < 0.05, zone + ': in the floor ' + JSON.stringify(f));
      };
      const ask = async (who, off, pick) => {
        await interactWith(h, 'Talk', who, off);
        // (the last conversation's choices stay in the page until the next one opens)
        await h.until(() => window.__G.ui.dialogueOpen && window.__G.ui.dlgChoices.childElementCount >= 3, { timeout: 10000 });
        await choose(h, pick);
      };
      const into = (marker) => h.eval((m) => window.__G.player.teleport(window.__G.zone.marker(m).position, 0), marker);
      await arrive('academy');
      await ask('weibao', [-1.2, 0, 0.4], 'Quiet District');
      await arrive('quiet');
      await ask('ferryman', [-1.3, 0, 0.3], 'night market');
      await arrive('market');
      await into('TRIGGER_academy');
      await arrive('academy');
      await ask('weibao', [-1.2, 0, 0.4], 'station');
      await arrive('station');
      h.assert((await h.eval(() => window.__G.player.position.y)) > 10, 'not at the top of the hill path');
      await into('TRIGGER_academy');
      await arrive('academy');
      await ask('weibao', [-1.2, 0, 0.4], 'night market');
      await arrive('market');
      await into('TRIGGER_academy');
      await arrive('academy');
      await ask('weibao', [-1.2, 0, 0.4], 'Quiet District');
      await arrive('quiet');
      await into('TRIGGER_fogwall');
      await arrive('heart');
      h.assert(await h.eval(() => !!window.__G.zone.quilt && !window.__G.zone.sulk), 'the old square: no canopy, or the Great Sulk is still there');
      await h.page.screenshot({ path: `${h.OUT}/freeroam-heart.png` });
      await into('TRIGGER_quiet');
      await arrive('quiet');
      await ask('ferryman', [-1.3, 0, 0.3], 'Academy');
      await arrive('academy');
    },
  },
);

TESTS.push(
  // Welcoming the first-years, start to end: Sunny's sign, the train, three First-Day Jitters soothed by
  // standing with each first-year, the walk up the hill with all three behind her, the tour, and the bench.
  // A reload at the station keeps the ones already soothed at her heels.
  {
    name: 'firstyears-full',
    async run(h) {
      await h.open('', freeSave('academy', { spawn: 'SPAWN_gate', helper: 'cloud', day: 2 }));
      await h.begin();
      await h.until(() => /Sunny has a job/.test(window.__G.ui.objective.textContent), { timeout: 30000 });
      await interactWith(h, 'Talk', 'tangtang', [1.4, 0, 0.2]);
      await skipUntil(h, () => window.__G.save.story.fy_sign && !window.__G.frozen);
      h.assert(/ask Bo at the gate/.test(await h.eval(() => window.__G.ui.objective.textContent)), 'no word about the station');
      await interactWith(h, 'Talk', 'weibao', [-1.2, 0, 0.4]);
      await h.until(() => window.__G.ui.dialogueOpen && window.__G.ui.dlgChoices.childElementCount >= 3, { timeout: 10000 });
      await choose(h, 'station');
      await h.until(() => window.__G.zone?.id === 'station' && !window.__G.frozen && !!window.__G.zone.worries, { timeout: 60000 });
      // down to the platform: the train pulls in
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('SPAWN_start').position.clone().add({ x: 3, y: 0, z: -1 }), 0);
      });
      await h.until(() => window.__G.zone.firstYears?.length === 3, { timeout: 60000, tick: () => h.skipDialogue() });
      await gwait(h, 2.6);
      await h.page.screenshot({ path: `${h.OUT}/firstyears-train.png` });
      await skipUntil(h, () => window.__G.save.story.fy_met && !window.__G.frozen, 120000);
      await h.until(() => [...window.__G.grumblings].filter((g) => g.species === 'jitters').length === 3, { timeout: 10000 });
      const soothe = async (k) => {
        await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 60000, tick: () => h.skipDialogue() });
        await h.eval((k) => {
          const G = window.__G;
          const n = G.zone.firstYears[k];
          G.player.teleport(n.position.clone().add({ x: 0.3, y: 0.1, z: -1.4 }), 0);
          G.cam.snapBehind(G.player);
        }, k);
        await hum(h, true);
        await h.until(`!!window.__G.save.soothed['station:fy${k + 1}']`, { timeout: 90000 });
        await hum(h, false);
      };
      await soothe(0);
      h.assert(await h.eval(() => !!window.__G.zone.firstYears[0].follower), 'the first one is not following');
      await soothe(1);
      // a reload: the two already soothed fall in behind her, the third still has her Jitters
      await h.reloaded(() => h.page.reload());
      await h.begin();
      await h.until(() => window.__G.zone?.id === 'station' && window.__G.zone.firstYears?.length === 3, { timeout: 60000 });
      let s = await h.eval(() => ({ follow: window.__G.zone.firstYears.map((n) => !!n.follower), jitters: [...window.__G.grumblings].filter((g) => g.species === 'jitters').length, obj: window.__G.ui.objective.textContent }));
      h.assert(s.follow.join() === 'true,true,false' && s.jitters === 1 && /stand with them/.test(s.obj), 'after a reload on the platform: ' + JSON.stringify(s));
      await soothe(2);
      await skipUntil(h, () => window.__G.save.story.fy_walk && !window.__G.frozen, 60000);
      h.assert(/up the hill/.test(await h.eval(() => window.__G.ui.objective.textContent)), 'no word about the hill');
      // up the hill
      await h.eval(() => window.__G.player.teleport(window.__G.zone.marker('TRIGGER_academy').position, 0));
      await h.until(() => window.__G.zone?.id === 'academy' && !window.__G.frozen && window.__G.npcs.get('fy3')?.follower, { timeout: 60000 });
      await gwait(h, 1.5);
      await h.page.screenshot({ path: `${h.OUT}/firstyears-gate.png` });
      // the tour, in any order
      for (const [who, flag] of [['POINT_tag', 'fy_tag'], ['fang', 'fy_fang'], ['tangtang', 'fy_sunny']]) {
        await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 60000, tick: () => h.skipDialogue() });
        await h.eval((who) => {
          const G = window.__G;
          const at = (G.npcs.get(who)?.position || G.zone.marker(who).position).clone();
          G.player.teleport(at.add({ x: 1.2, y: 0.1, z: 2.2 }), Math.PI);
        }, who);
        await skipUntil(h, `window.__G.save.story.${flag} && !window.__G.frozen`, 60000);
      }
      h.assert(/pavilion/.test(await h.eval(() => window.__G.ui.objective.textContent)), 'no word about the pavilion');
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_lessonseat').position.clone().add({ x: -1.5, y: 0.2, z: 2.6 }), Math.PI);
      });
      await skipUntil(h, () => window.__G.save.story.fyDone && !window.__G.frozen, 120000);
      s = await h.eval(() => ({ jitters: window.__G.save.sprites.jitters, patches: window.__G.save.patches, follow: ['fy1', 'fy2', 'fy3'].map((id) => !!window.__G.npcs.get(id)?.follower), obj: window.__G.ui.objective.textContent, talk: ['fy1', 'fy2', 'fy3'].map((id) => !!window.__G.npcs.get(id)?.onTalk) }));
      h.assert(s.jitters === 3 && s.patches >= 5 && !s.follow.some(Boolean) && s.talk.every(Boolean) && /Lantern Bay, day 2/.test(s.obj), 'afterwards: ' + JSON.stringify(s));
      await h.page.waitForTimeout(1200);
      await h.headsUpright('after the first-years');
    },
  },
  // The Sprite Book's last entry: a small scene with Bean, a gold border, and the Lantern Bay page.
  {
    name: 'book-complete',
    async run(h) {
      const save = freeSave('academy', { spawn: 'SPAWN_gate', sprites: { ...ALL_SPRITES, jitters: 1, bottled: 1 } });
      save.story.fyDone = true;
      await h.open('', save);
      await h.begin();
      await h.until(() => !!window.__G.zone.worries && !!window.__G.bookPages?.get('bay'), { timeout: 30000 });
      const book = async () => {
        await h.page.keyboard.press('Tab');
        await h.until(() => document.getElementById('menu-book').classList.contains('show'), { timeout: 10000 });
        const r = await h.eval(() => ({ entries: document.querySelectorAll('#menu-book .entry').length, unknown: document.querySelectorAll('#menu-book .entry.unknown').length, text: document.querySelector('#menu-book').textContent, gold: document.getElementById('menu-book').classList.contains('gold'), blank: [...document.querySelectorAll('#menu-book .entry img')].filter((i) => !i.getAttribute('src')).length }));
        await h.page.screenshot({ path: `${h.OUT}/book-${r.unknown}.png` });
        await h.page.keyboard.press('Tab');
        await h.until(() => !window.__G.menus.open, { timeout: 5000 });
        return r;
      };
      let b = await book();
      h.assert(b.entries === 11 && b.unknown === 1 && !b.gold && /The Great Sulk/.test(b.text) && /Asleep under the Everyone Blanket/.test(b.text) && /Kinds of Charm Sprite/.test(b.text) && /10\/11/.test(b.text) && b.blank === 0, 'ten of eleven: ' + JSON.stringify({ ...b, text: b.text.slice(-400) }));
      await h.eval(() => window.__G.collection.add('letter', window.__G.player.position.clone()));
      await skipUntil(h, () => window.__G.save.story.bookDone && !window.__G.frozen, 60000);
      b = await book();
      h.assert(b.unknown === 0 && b.gold && /11\/11/.test(b.text) && /Unsent Letter/.test(b.text), 'eleven of eleven: ' + JSON.stringify({ ...b, text: b.text.slice(-300) }));
    },
  },
  // The Everyone Blanket over the old square: more of it sewn the more patches she has earned.
  {
    name: 'freeroam-canopy',
    async run(h) {
      await h.open('?zone=heart&spawn=SPAWN_square', freeSave('heart', { spawn: 'SPAWN_square', patches: 20, ...withWorries(['h_cloud']) }));
      await h.begin();
      await h.until(() => !!window.__G.zone.quilt && !!window.__G.zone.worries, { timeout: 30000 });
      await gwait(h, 1);
      const sewn = () => h.eval(() => window.__G.zone.quilt.sewn);
      const a = await sewn();
      h.assert(a > 0.45 && a < 0.6, 'sewn with 20 patches: ' + a);
      await h.eval(() => {
        const G = window.__G;
        G.frozen = true;
        G.cam.setShot(G.player.position.clone().set(-2, 3.2, 62), G.player.position.clone().set(-14, 4.5, 44), 0.01);
      });
      await gwait(h, 0.6);
      await h.page.screenshot({ path: `${h.OUT}/freeroam-canopy.png` });
      await h.eval(() => {
        window.__G.save.patches = 180;
        window.__G.events.emit('patch', 180);
      });
      const b = await sewn();
      h.assert(b > 0.9, 'sewn with 180 patches: ' + b);
      await gwait(h, 0.6);
      await h.page.screenshot({ path: `${h.OUT}/freeroam-canopy-full.png` });
      const r = await h.eval(() => ({ calls: window.__G.renderer.info.render.calls, tris: window.__G.renderer.info.render.triangles }));
      console.log(`    (the old square after the story: ${r.calls} draw calls, ${Math.round(r.tris / 1000)}k triangles)`);
    },
  },
);

TESTS.push(
  // Saves from before this build load as they did: one in each place and chapter starts where it left off, with
  // nothing frozen and no errors, and one that had finished Chapter 3 wakes up in Chapter 4.
  {
    name: 'old-saves',
    async run(h) {
      const olds = [
        ['train', base({ zone: 'train', story: { train_intro: true } }), null],
        ['station', base({ zone: 'station', story: { train_intro: true, prologueTrain: true, prologueDone: true }, sprites: { doudou: 1, cloud: 1 } }), /Walk up the hill/],
        ['academy', base({ zone: 'academy', spawn: 'SPAWN_gate', story: { ...CH1_DONE }, sprites: CH2_SPRITES }), null],
        ['market', base({ zone: 'market', story: { ...CH1_DONE, ch2_start: true, ch2_tutorial: true, flock1Done: true }, sprites: CH2_SPRITES }), null],
        ['quiet', base({ zone: 'quiet', spawn: 'SPAWN_ferry', story: { ...CH3_ARRIVED, mem_notice: true }, sprites: CH2_SPRITES }), null],
        ['academy', base({ zone: 'academy', spawn: 'SPAWN_gate', story: { ...CH3_DONE }, sprites: ALL_SPRITES }), 'ch4'],
      ];
      let first = true;
      for (const [zone, save, expect] of olds) {
        // (a save from the old build has none of the new keys)
        for (const k of ['fish', 'lost', 'line', 'reminders', 'ming', 'patches', 'day', 'worries']) delete save[k];
        if (first) await h.open('', save);
        else {
          await h.eval((s) => void (window.__G.save = s), save);
          await reopen(h, '');
        }
        first = false;
        await h.begin();
        await h.until(() => !window.__G.frozen && !window.__G.ui.dialogueOpen, { timeout: 120000, tick: () => h.skipDialogue() });
        const s = await h.eval(() => ({ zone: window.__G.zone.id, v: window.__G.save.v, obj: window.__G.ui.objective.textContent, flags: window.__G.save.story, keys: Object.keys(window.__G.save) }));
        h.assert(s.zone === zone && s.v === 2, `an old save in ${zone}: ` + JSON.stringify({ zone: s.zone, v: s.v }));
        if (expect instanceof RegExp) h.assert(expect.test(s.obj), zone + ' objective: ' + s.obj);
        if (expect === 'ch4') h.assert(s.flags.ch4_start && s.obj.length > 8, 'a save that had finished Chapter 3 did not start Chapter 4: ' + s.obj);
        else h.assert(!s.flags.ch4_start, zone + ': Chapter 4 started early');
        const f = await h.feet();
        h.assert(f.under < 0.05, zone + ': in the floor ' + JSON.stringify(f));
      }
    },
  },
  // The Quiet District under the fog (Chapters 4 and 5): you see a few metres, the neighbours are behind their
  // doors, and the restored memories are still pockets of colour with their lanterns lit. In Chapter 3 the fog
  // wall at the south end turns her back.
  {
    name: 'quiet-fog',
    async run(h) {
      const mems = { mem_notice: true, mem_post: true, mem_sweets: true };
      await h.open('?zone=quiet&spawn=SPAWN_ferry', base({ zone: 'quiet', spawn: 'SPAWN_ferry', sprites: ALL_SPRITES, cozy: 30, story: { ...CH3_ARRIVED, ...mems, kind_barber: true } }));
      await h.begin();
      await h.until(() => !window.__G.frozen, { timeout: 60000, tick: () => h.skipDialogue() });
      await h.eval(() => window.__G.player.teleport(window.__G.zone.marker('TRIGGER_fogwall').position.clone().setY(0.1), Math.PI));
      await h.until(() => window.__G.ui.dialogueOpen && /Not yet/.test(window.__G.ui.dlgText.textContent), { timeout: 10000 });
      let s = await h.eval(() => ({ zone: window.__G.zone.id, state: window.__G.zone.state }));
      h.assert(s.zone === 'quiet' && s.state === 'grey', 'Chapter 3 at the fog wall: ' + JSON.stringify(s));
      await h.eval((m) => void (window.__G.save = { ...window.__G.save, zone: 'quiet', spawn: 'SPAWN_ferry', story: { ...window.__G.save.story, ...m, ch3_return: true, ch3_story: true, ch3Done: true, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true } }), mems);
      await reopen(h, '?zone=quiet&spawn=SPAWN_ferry');
      await h.begin();
      await h.until(() => !window.__G.frozen && !!window.__G.zone.sighs, { timeout: 60000, tick: () => h.skipDialogue() });
      await h.eval(() => window.__G.zone.streamed);
      s = await h.eval(() => {
        const G = window.__G;
        return { state: G.zone.state, far: G.scene.fog.far, fade: G.shared.uFade.value, clear: G.shared.uFogClear.value, pockets: G.zone.pockets.length, lamps: G.zone.lampList.length, neighbours: ['barber', 'noodle', 'oldman'].filter((id) => G.npcs.get(id) && !G.npcs.get(id).hidden).length, friends: !!G.npcs.get('tangtang')?.follower };
      });
      h.assert(s.state === 'fog' && s.far <= 16 && s.fade > 0.8 && s.clear > 0.5 && s.pockets >= 3 && s.lamps >= 3 && s.neighbours === 0 && s.friends, 'under the fog: ' + JSON.stringify(s));
      await h.page.screenshot({ path: `${h.OUT}/quiet-fog.png` });
    },
  },
  // The Quiet District after the story: full colour, every lantern lit, every shutter up, the name boards no
  // longer faded, the neighbours at their doors with something new to say, the breakfast table still out.
  {
    name: 'quiet-after',
    async run(h) {
      await h.open('?zone=quiet&spawn=SPAWN_ferry', freeSave('quiet', { spawn: 'SPAWN_ferry' }));
      await h.begin();
      await h.until(() => !!window.__G.zone.worries, { timeout: 30000 });
      await h.eval(() => window.__G.zone.streamed);
      const s = await h.eval(() => {
        const G = window.__G;
        return { state: G.zone.state, fade: G.shared.uFade.value, left: G.zone.lightsLeft.length, lamps: G.zone.lampList.length, shut: Object.values(G.zone.shutters).filter((o) => !o.matrixAutoUpdate).length, neighbours: ['barber', 'noodle', 'oldman', 'ferryman'].filter((id) => G.npcs.get(id) && !G.npcs.get(id).hidden).length, dim: G.zone.signs.list.filter((x) => x.dim?.()).length, greys: [...G.grumblings].filter((g) => g.species === 'grey' && !g.worry).length, far: G.scene.fog.far };
      });
      h.assert(s.state === 'after' && s.fade === 0 && s.left === 0 && s.lamps >= 6 && s.shut === 0 && s.neighbours === 4 && s.dim === 0 && s.greys === 0 && s.far > 60, 'the district afterwards: ' + JSON.stringify(s));
      await interactWith(h, 'Talk', 'barber', [1.3, 0, 0.3]);
      await h.until(() => window.__G.ui.dialogueOpen && /Three haircuts/.test(window.__G.ui.dlgText.textContent), { timeout: 10000 });
      await skipUntil(h, () => !window.__G.ui.dialogueOpen);
      await tp(h, 2.2, 13, Math.PI);
      await gwait(h, 0.8);
      await h.page.screenshot({ path: `${h.OUT}/quiet-after.png` });
    },
  },
  // Master Fang's Domain, in the frame's own pixels: inside its circle the square is Grandmother's Kitchen
  // (warm floorboards), outside it the street (grey paving under the fog), with a bright rim between.
  {
    name: 'domain-edge',
    async run(h) {
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 40, sprites: ALL_SPRITES, soothed: { 'quiet:grey_2': true }, story: { ...CH4_DONE, ...KIND, ...P4 } }));
      await h.begin();
      await h.until(() => window.__G.shared.uDomain.value.w > 16, { timeout: 120000, tick: () => h.skipDialogue() });
      await h.eval(() => {
        const G = window.__G;
        G.frozen = true;
        G.cam.setShot(G.player.position.clone().set(-14, 10, 20), G.player.position.clone().set(-14, 0, 33), 0.01);
      });
      await gwait(h, 0.8);
      const px = await h.eval(() => {
        const G = window.__G;
        G.renderer.render(G.scene, G.camera);
        const cv = G.renderer.domElement;
        const c = document.createElement('canvas');
        c.width = cv.width;
        c.height = cv.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(cv, 0, 0);
        const at = (x, z) => {
          const p = G.ui.project(G.player.position.clone().set(x, 0.07, z));
          const d = ctx.getImageData(Math.round((p.x / innerWidth) * cv.width), Math.round((p.y / innerHeight) * cv.height), 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        // (-14, 46.5) is the centre, 17 m its radius, and the street runs straight in from the north: 10 m from
        // the centre is kitchen floor, 19 m is the street's paving
        return { inside: at(-14, 36.5), outside: at(-14, 27.5), r: G.shared.uDomain.value.w };
      });
      const warm = (c) => c[0] - c[2];
      h.assert(px.r > 16 && warm(px.inside) > 25 && warm(px.outside) < 15 && warm(px.inside) - warm(px.outside) > 15, 'the Domain’s edge in pixels: ' + JSON.stringify(px));
      await h.page.screenshot({ path: `${h.OUT}/domain-edge.png` });
    },
  },
  // Phones, at the largest text: the Stitch prompts are on the context button and the Hum button, and the
  // three replies to the Great Sulk (the longest choices in the game) all fit and take the tap.
  ...PHONES.map((ph) => ({
    name: 'touch-hit8-' + ph.name,
    touch: true,
    viewport: ph.viewport,
    async run(h) {
      await h.open('?zone=test&fog', fogSave({ settings: { ...base().settings, textSize: 1.5 } }));
      await h.begin();
      await h.eval(() => (window.__G.zone.sighs.t = 1e9));
      await put(h, 4, 1.2, 0);
      await h.until(() => document.querySelector('.tbtn.act').textContent === 'Take the loose end', { timeout: 10000 });
      let r = await h.hit('.tbtn.act');
      h.assert(r.ok, 'the Stitch prompt is covered by ' + r.top);
      const b = await (await h.page.$('.tbtn.act')).boundingBox();
      await h.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await h.until(() => !!window.__G.zone.stitch.holding, { timeout: 5000 });
      await put(h, -4, -6.2, 0);
      await h.until(() => document.querySelector('.prompt').textContent.includes('Stitch it here'), { timeout: 10000 });
      const fit = (sel) =>
        h.eval((sel) => {
          const q = document.querySelector(sel).getBoundingClientRect();
          return q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight && q.width > 0;
        }, sel);
      h.assert(await fit('.prompt'), 'the Stitch prompt is off the screen');
      r = await h.hit('.tbtn.hum');
      h.assert(r.ok, 'the Hum button is covered by ' + r.top);
      // the replies
      await h.eval(() => {
        const G = window.__G;
        G.zone.stitch.drop();
        window.__choice = G.ui.say('honk', 'I WAS “I’M FINE, REALLY.” NOBODY ASKED TWICE.', { choices: ['Somebody should have said goodbye. I’m sorry.', 'Thank you for telling me. I’m not going anywhere.', 'I’m asking twice. How are you, really?'] });
      });
      await h.until(() => window.__G.ui.dlgChoices.childElementCount === 3, { timeout: 10000 });
      h.assert(await fit('.dialogue'), 'the dialogue is off the screen');
      for (let i = 1; i <= 3; i++) {
        const sel = `.choices button:nth-child(${i})`;
        r = await h.hit(sel);
        h.assert(r.ok && (await fit(sel)), `reply ${i} is covered by ${r.top}, or off the screen`);
      }
      await h.page.screenshot({ path: `${h.OUT}/touch-replies-${ph.name}.png` });
    },
  })),
);
