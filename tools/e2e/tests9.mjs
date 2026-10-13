// SPDX-License-Identifier: GPL-3.0-only
// Test cases for the fixes that came out of the autoplayer's playthrough (ai/plan_9.md §3, ai/playtest_9.md):
// places that confused a first-time player, made clearer. Same helpers as tests.mjs (see run.mjs).
import { base, CH2_SPRITES } from './tests.mjs';
import { CH3_DONE } from './tests8.mjs';

const CH4_DONE = { ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true, ch4_gap: true, ch4_secret: true, ch4_thread: true, ch4_threadTold: true, ch4_followed: true, stitch_bell: true, stitch_letter: true, stitch_lantern: true, stitch_sunny: true, stitch_bo: true, ch4Done: true };

const ALL_SPRITES = { ...CH2_SPRITES, grey: 2 };
const skipUntil = (h, pred, timeout = 90000) => h.until(pred, { timeout, tick: () => h.skipDialogue() });

export const TESTS = [
  // Chapter 4: after the gap, the way to Bean's secret is told by landmarks a player can see, not by "north"
  // (there's no compass on screen): the objective names the Persimmon Courtyard, and the fingerpost at the foot
  // of the Arcade has an arm saying so, pointing up the Arcade.
  {
    name: 'ch4-landmarks',
    async run(h) {
      const story = { ...CH3_DONE, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true, ch4_gap: true };
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_row', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && /Bean wants/.test(window.__G.ui.objective.textContent));
      const r = await h.eval(() => {
        const G = window.__G;
        const text = G.ui.objective.textContent;
        const finger = G.zone.signs.list.find((s) => s.kind === 'finger' && s.arms.some((a) => a.text === 'Persimmon Courtyard') && s.at.z > -8);
        const arm = finger?.arms.find((a) => a.text === 'Persimmon Courtyard');
        return { text, toward: arm && [arm.toward.x - finger.at.x, arm.toward.z - finger.at.z] };
      });
      h.assert(/Persimmon Courtyard/.test(r.text) && !/\b(north|south|east|west)\b/i.test(r.text), 'objective: ' + r.text);
      // the Arcade runs from the junction toward smaller z (the courtyard is at z -33)
      h.assert(r.toward && r.toward[1] < -1, 'no fingerpost arm pointing up the Arcade to the Persimmon Courtyard: ' + JSON.stringify(r.toward));
    },
  },
  // Chapter 5: a sigh sits a friend down, often somewhere out of sight in the fog. The guide points the way to
  // them at once, not after the usual 40 seconds.
  {
    name: 'ch5-checkon-guide',
    async run(h) {
      const story = { ...CH3_DONE, ...CH4_DONE, ch5_arrive: true };
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && /bake/.test(window.__G.ui.objective.textContent));
      await h.eval(() => {
        const G = window.__G;
        const tt = G.npcs.get('tangtang');
        G.player.teleport(tt.position.clone().add({ x: 0, y: 0, z: -15 }), 0);
        G.cam.snapBehind(G.player);
        // a sigh that catches her in the open
        G.zone.sighs.watchers.find((w) => w.position === tt.position).fn(false);
      });
      await h.until(() => /Check on Sunny/.test(window.__G.ui.objective.textContent), { timeout: 5000 });
      const t0 = await h.eval(() => window.__G.time);
      await h.until(() => window.__G.zone.guide?.on && !document.querySelector('.way').hidden, { timeout: 15000 });
      const waited = (await h.eval(() => window.__G.time)) - t0;
      h.assert(waited < 3, `the guide took ${waited.toFixed(1)} s of game time to show the way to Sunny`);
    },
  },
  // Chapter 5, phase 4: once Master Fang's kitchen is open, the first job shows as the objective (it was blank
  // until the stove was lit: the save says 0.5 for "open, nothing lit yet", and that was used as a list index).
  {
    name: 'ch5-kitchen-objective',
    async run(h) {
      const story = { ...CH3_DONE, ...CH4_DONE, ch5_arrive: true, ch5_tier: 3, ch5_score: 12, ch5_p1: true, ch5_heard: 6, ch5_p2: true, ch5_called: true, ch5_p3: true, ch5_kitchen: 0.5 };
      for (const sp of ['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey']) story['stitch_patch_' + sp] = true;
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && window.__G.ui.objective.textContent, 60000);
      const text = await h.eval(() => window.__G.ui.objective.textContent);
      h.assert(text === 'Help Master Fang: light the stove', 'objective: ' + JSON.stringify(text));
    },
  },
  // Chapter 5, phase 2: Bo walks off across the square to listen, out of sight in the fog: the guide shows the
  // way to him at once.
  {
    name: 'ch5-bo-guide',
    async run(h) {
      const story = { ...CH3_DONE, ...CH4_DONE, ch5_arrive: true, ch5_tier: 3, ch5_score: 12, ch5_p1: true };
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && /Stand by Bo/.test(window.__G.ui.objective.textContent));
      // she stays by the oven while he walks to where he listens
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_oven').position.clone().add({ x: 1.5, y: 0, z: -1.5 }), 0);
        G.cam.snapBehind(G.player);
      });
      const t0 = await h.eval(() => window.__G.time);
      await h.until(() => window.__G.zone.guide?.on && !document.querySelector('.way').hidden, { timeout: 15000 });
      const waited = (await h.eval(() => window.__G.time)) - t0;
      h.assert(waited < 3, `the guide took ${waited.toFixed(1)} s of game time to show the way to Bo`);
    },
  },
  // Chapter 5: "There's an oven, look, over there!", and Sunny walks off to it into the fog. She looks where Sunny
  // points when the scene hands back, and the guide shows the way at once (it waited 40 s).
  {
    name: 'ch5-oven-guide',
    async run(h) {
      const story = { ...CH3_DONE, ...CH4_DONE };
      for (const sp of ['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey']) story['stitch_patch_' + sp] = true;
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      // (Chapter 5 starts up the street: into the square, where the scene begins)
      await skipUntil(h, () => !window.__G.frozen && /heart of the Quiet District/.test(window.__G.ui.objective.textContent));
      const at = await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('SPAWN_square').position.clone().add({ x: 0, y: 0, z: 3.5 }), 0);
        return { sq: G.zone.marker('SPAWN_square').position.toArray(), p: G.player.position.toArray(), state: G.player.state };
      });
      await h.gwait(1);
      const after = await h.eval(() => ({ p: window.__G.player.position.toArray(), frozen: window.__G.frozen, state: window.__G.player.state }));
      h.assert(after.p[2] > 33.5 || after.frozen, 'not into the square: ' + JSON.stringify({ at, after }));
      await skipUntil(h, () => !window.__G.frozen && window.__G.save.story.ch5_arrive && /street oven/.test(window.__G.ui.objective.textContent), 120000);
      const r = await h.eval(() => {
        const G = window.__G;
        const o = G.zone.marker('POINT_oven').position,
          p = G.player.position;
        const want = Math.atan2(o.x - p.x, o.z - p.z),
          looks = G.cam.yaw + Math.PI;
        return { off: (Math.abs(Math.atan2(Math.sin(want - looks), Math.cos(want - looks))) * 180) / Math.PI, dist: Math.hypot(o.x - p.x, o.z - p.z) };
      });
      h.assert(r.off < 35, `the camera looks ${r.off.toFixed(0)}° away from the oven (${r.dist.toFixed(0)} m off)`);
      const t0 = await h.eval(() => window.__G.time);
      await h.until(() => window.__G.zone.guide?.on && !document.querySelector('.way').hidden, { timeout: 15000 });
      const waited = (await h.eval(() => window.__G.time)) - t0;
      h.assert(waited < 3, `the guide took ${waited.toFixed(1)} s of game time to show the way to the oven`);
    },
  },
  // Chapter 4: no sigh comes while Bean tells his secret (the memory you walk through in the Persimmon
  // Courtyard). They kept coming every ten seconds or so, and you had to keep leaving the scene to shelter.
  {
    name: 'ch4-memory-quiet',
    async run(h) {
      const story = { ...CH3_DONE, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true, ch4_gap: true };
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_row', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && /Bean wants/.test(window.__G.ui.objective.textContent));
      await h.eval(() => {
        const G = window.__G;
        G.player.teleport(G.zone.marker('POINT_secret').position.clone(), Math.PI);
        G.cam.snapBehind(G.player);
      });
      await skipUntil(h, () => !window.__G.frozen && /Walk with the memory/.test(window.__G.ui.objective.textContent));
      // half a minute of the memory, standing still: no sigh sets out
      const n0 = await h.eval(() => window.__G.zone.sighs.count + window.__G.zone.sighs.fronts.length);
      const t0 = await h.eval(() => window.__G.time);
      await h.until(`window.__G.time > ${t0 + 30}`, { timeout: 120000, every: 200 });
      const n1 = await h.eval(() => window.__G.zone.sighs.count + window.__G.zone.sighs.fronts.length);
      h.assert(n1 === n0, `${n1 - n0} sigh(s) during Bean's secret`);
    },
  },
  // Chapter 5, phase 4: when Master Fang's kitchen scene hands back, Pip faces the kitchen (in the fog the stove
  // can't be seen from the lantern posts where phase 3 ends).
  {
    name: 'ch5-kitchen-facing',
    async run(h) {
      const story = { ...CH3_DONE, ...CH4_DONE, ch5_arrive: true, ch5_tier: 3, ch5_score: 12, ch5_p1: true, ch5_heard: 6, ch5_p2: true, ch5_called: true, ch5_p3: true };
      for (const sp of ['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey']) story['stitch_patch_' + sp] = true;
      // at the Grumpy Grey's lantern post, where phase 3 can end, facing away from the kitchen (109°)
      await h.open('', base({ zone: 'heart', spawn: 'POINT_post_grey', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && window.__G.save.story.ch5_kitchen === 0.5 && /light the stove/.test(window.__G.ui.objective.textContent));
      const off = await h.eval(() => {
        const G = window.__G;
        const c = G.zone.marker('POINT_domain').position,
          p = G.player.position;
        const want = Math.atan2(c.x - p.x, c.z - p.z);
        const looks = G.cam.yaw + Math.PI; // the camera looks along yaw + π
        const off = (Math.abs(Math.atan2(Math.sin(want - looks), Math.cos(want - looks))) * 180) / Math.PI;
        return { off, facing: +G.player.facing.toFixed(2), yaw: +G.cam.yaw.toFixed(2), want: +want.toFixed(2), kitchen: G.save.story.ch5_kitchen, pos: G.player.position.toArray().map((v) => +v.toFixed(1)) };
      });
      h.assert(off.off < 35, `the camera looks ${off.off.toFixed(0)}° away from the kitchen`);
    },
  },
  // Chapter 4: lost in the Old Quarter, the way back to Sunny and Bo is named by the place it goes through
  // (signposted at the garden's exit), not left to wandering in the fog.
  {
    name: 'ch4-wayback-landmark',
    async run(h) {
      const story = { ...CH3_DONE, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true };
      await h.open('', base({ zone: 'heart', spawn: 'SPAWN_garden', cozy: 60, sprites: ALL_SPRITES, story }));
      await h.begin();
      await skipUntil(h, () => !window.__G.frozen && /Find a way back/.test(window.__G.ui.objective.textContent));
      const r = await h.eval(() => {
        const G = window.__G;
        const sign = G.zone.signs.list.find((s) => s.kind === 'post' && s.text === 'Laundry Alley');
        return { text: G.ui.objective.textContent, sign: sign && Math.hypot(sign.at.x - G.player.position.x, sign.at.z - G.player.position.z) };
      });
      h.assert(/Laundry Alley/.test(r.text), 'objective: ' + r.text);
      h.assert(r.sign != null && r.sign < 14, `the Laundry Alley sign is ${r.sign?.toFixed(1)} m from where she starts`);
      // in the Pump Yard, the way on is named by the next board: Lantern-makers' Row
      await h.eval(() => {
        const G = window.__G;
        G.zone.sighs.t = 1e9; // (no sigh while she stands there)
        G.player.teleport(G.player.position.clone().set(12, 0.1, -3), 0);
      });
      await h.until(() => /Lantern-makers’ Row/.test(window.__G.ui.objective.textContent), { timeout: 20000 });
    },
  },
  // Going back to a place a second time in one sitting (free roam does it all day): it has all its colliders
  // again. (It had none: the ferry jetty in the Quiet District wasn't there to stand on, and she splashed into
  // the harbour over and over.)
  {
    name: 'zone-revisit-colliders',
    async run(h) {
      await h.open('', base({ zone: 'quiet', spawn: 'SPAWN_ferry', cozy: 60, sprites: ALL_SPRITES, story: { ...CH3_DONE } }));
      await h.begin();
      const here = () =>
        h.eval(() => {
          const G = window.__G;
          const g = G.collision.bvh.geometry;
          return { zone: G.zone.id, tris: (g.index ? g.index.count : g.attributes.position.count) / 3, floor: G.collision.floorY(G.zone.marker('SPAWN_ferry').position, 0.8, 0.3) };
        });
      const go = async (zone, spawn) => {
        await h.eval(([zone, spawn]) => window.__G.goto(zone, spawn), [zone, spawn]);
        await skipUntil(h, `window.__G.zone?.id === '${zone}' && !window.__G.frozen && getComputedStyle(document.getElementById('loading')).visibility === 'hidden'`);
      };
      const first = await here();
      h.assert(first.zone === 'quiet' && first.floor !== null, 'no jetty on the first visit: ' + JSON.stringify(first));
      await go('market', 'SPAWN_start');
      await go('quiet', 'SPAWN_ferry');
      const again = await here();
      h.assert(again.tris === first.tris, `colliders on the second visit: ${again.tris} triangles, ${first.tris} on the first`);
      h.assert(again.floor !== null, 'no jetty under the ferry arrival on the second visit');
      await h.eval(() => {
        window.__splashes = 0;
        window.__G.events.on('splash', () => window.__splashes++);
      });
      await h.gwait(3);
      const s = await h.eval(() => ({ splashes: window.__splashes, y: window.__G.player.position.y }));
      h.assert(!s.splashes && s.y > -0.2, `standing at the ferry arrival she sank (y ${s.y.toFixed(2)}, ${s.splashes} splashes)`);
    },
  },
];
