// SPDX-License-Identifier: GPL-3.0-only
// The Sprite Book, to its end: the Great Sulk's entry, and free-roam Lantern Bay's three new Grumblings with
// how each acts up (ai/plan_8.md §8.4). Their models are creatures2.glb (tools/blender/build_creatures2.py).
// Loaded after Begin, only for a save that has reached the Epilogue (story/epilogue.js, story/freeroam.js):
// species2() adds them to the book and loads the models.
//   First-Day Jitters   a knot of paper butterflies that loops round its person. Hum at it from far off and it
//                       bolts; it only settles while its person has company (stand with them, then hum).
//   Bottled-Up          lives in the water: caught by fishing, and soothed on the line by never pulling hard
//                       (systems/fishing.js)
//   Unsent Letter       an envelope that swoops like a paper plane and seals itself when hummed at. Stitch it
//                       to the person it was written to (systems/worries.js gives it its thread).
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { Vector3 } from 'three';
import { G } from '../game.js';
import { SPECIES, BOOK_ORDER } from './species.js';
import { loadCreatures } from '../actors/creatures.js';
import { registerBehaviour } from '../actors/grumbling.js';

const _v = new Vector3();
const tip = (key, text) => {
  if (G.save.story[key]) return;
  G.save.story[key] = true;
  G.ui.toast('💡 ' + text, 6.5);
};

let ready = null;
export function species2() {
  return (ready ||= (async () => {
    Object.assign(SPECIES, {
      // (no sprite of its own: its entry opens once it has fallen asleep, with the grey Grumblings' face)
      sulk: {
        name: 'The Great Sulk', feeling: 'I’m fine, really.', about: 'Asleep under the Everyone Blanket. Its thousands of little reminders went home.',
        glow: '#d6dcea', look: 'grey', story: 'ch5Done', where: 'The heart of the Quiet District',
      },
      jitters: {
        name: 'First-Day Jitters', feeling: 'What if nobody likes me?', about: 'A knot of paper butterflies looping round somebody new. It settles when its person has company.',
        ability: 'brave', abilityName: 'Brave', abilityDesc: 'A Grumbling’s sigh doesn’t slow you down.', glow: '#fff3b0', wrap: 4.5, tantrum: 'jitter', where: 'Lantern Bay',
      },
      bottled: {
        name: 'Bottled-Up', feeling: 'I never said it out loud.', about: 'A corked bottle with a note inside. It lives in the water, and comes in on a gentle line.',
        ability: 'float', abilityName: 'Float', abilityDesc: 'Things bite sooner when you fish.', glow: '#9fe8cf', wrap: 5, where: 'Lantern Bay’s waters',
      },
      letter: {
        name: 'Unsent Letter', feeling: 'I wrote it, but I never sent it.', about: 'An envelope that swoops like a paper plane. It doesn’t want a hug: it wants delivering.',
        ability: 'deliver', abilityName: 'Deliver', abilityDesc: 'A lost thing you carry points the way to its owner.', glow: '#ffd9c4', wrap: 4, tantrum: 'swoop', where: 'Lantern Bay',
      },
    });
    for (const id of ['sulk', 'jitters', 'bottled', 'letter']) if (!BOOK_ORDER.includes(id)) BOOK_ORDER.push(id);
    await loadCreatures('creatures2');
  })());
}

// ---------------------------------------------------------------- First-Day Jitters
// opts.person: who it belongs to (an NPC, or anything with a position); opts.company(): true while that
// person has company (by default: Pip standing within 2.6 m of them).
registerBehaviour('jitter', (g) => {
  const person = () => g.opts.person?.position || g.home;
  const company = () => (g.opts.company ? g.opts.company() : G.player.position.distanceTo(person()) < 2.6);
  let a = Math.random() * 6.28,
    bolt = 0,
    high = 0,
    said = 0;
  const parts = g.obj.userData.parts || {};
  return {
    always: true,
    ownsFacing: true,
    hover: 0.5,
    get bolting() {
      return bolt > 0;
    },
    refuses: () => bolt > 0,
    rate: () => (company() ? 1.3 : 0.1),
    idle(dt) {
      this.fly(dt, 1);
    },
    update(dt, dist) {
      const p = G.player;
      said -= dt;
      // hummed at from far off: it bolts, straight up, and some of the calm is lost
      if (bolt <= 0 && p.humming && G.soothe.target === g && dist > 4.2 && !company()) {
        bolt = 2.6;
        g.snap(0.25);
        G.audio.play('flutter');
        G.ui.bubble(g.obj, '!!', 1.2, 0.5);
        tip('jittersTip', 'It bolts when it’s hummed at from far away. It only settles while its person has company: <b>stand with them</b>, then hum.');
      }
      if (g.noticed && !company() && said <= 0 && dist < 6 && p.humming) {
        said = 6;
        tip('jittersTip', 'It only settles while its person has company: <b>stand with them</b>, then hum.');
      }
      bolt -= dt;
      this.fly(dt, g.calmedT > 0 ? 0.35 : 1);
    },
    fly(dt, speed) {
      const c = person();
      a += dt * 2.3 * speed * (bolt > 0 ? 2.5 : 1);
      high += ((bolt > 0 ? 2.6 : 0) - high) * Math.min(1, dt * 3);
      const r = 0.85 + Math.sin(a * 0.37) * 0.2;
      g.ground = c.y;
      _v.set(c.x + Math.cos(a) * r, c.y + 0.75 + Math.sin(a * 1.7) * 0.28 + high, c.z + Math.sin(a) * r);
      g.obj.position.lerp(_v, Math.min(1, dt * 6));
      g.obj.rotation.y = -a;
      // its two rings of butterflies turn against each other, faster the more worried it is
      const k = G.time * (1.2 + speed * 2.2);
      if (parts.ringA) parts.ringA.rotation.y = k;
      if (parts.ringB) parts.ringB.rotation.y = -k * 1.3;
      if (parts.ringA) parts.ringA.rotation.x = Math.sin(k * 1.9) * 0.18;
    },
    stop() {
      g.ground = person().y;
    },
  };
});

// ---------------------------------------------------------------- Unsent Letter
// It swoops round where it was written. Humming at it only makes it seal itself; once it is delivered
// (g.deliver(to), called when its thread is stitched to whoever it was for) it flies there and can rest.
registerBehaviour('swoop', (g) => {
  const flap = g.obj.userData.parts?.flap;
  let t = Math.random() * 6,
    shut = 0,
    to = null,
    said = 0;
  g.delivered = false;
  g.deliver = (where) => {
    to = where.clone();
    g.delivered = true;
  };
  const hover = 1.35;
  return {
    always: true,
    ownsFacing: true,
    hover: 0.3,
    refuses: () => !g.delivered,
    rate: () => 1,
    idle(dt) {
      this.update(dt, 99);
    },
    update(dt) {
      const p = G.player,
        o = g.obj.position;
      said -= dt;
      if (to) {
        // delivered: straight to them, and down
        _v.copy(to).setY(to.y + 1.2);
        o.lerp(_v, Math.min(1, dt * 2.4));
        g.obj.rotation.y = Math.atan2(_v.x - o.x, _v.z - o.z);
        g.ground = to.y;
        if (o.distanceTo(_v) < 0.4 && g.active) g.wrap(2); // it lets itself be tucked in at last
        return;
      }
      t += dt * (g.calmedT > 0 ? 0.5 : 1);
      // a figure of eight over its spot
      _v.set(g.home.x + Math.sin(t * 0.9) * 2.2, g.home.y + hover + Math.sin(t * 1.8) * 0.3, g.home.z + Math.sin(t * 1.8) * 1.1);
      g.obj.rotation.y = Math.atan2(_v.x - o.x, _v.z - o.z);
      g.obj.rotation.z = Math.cos(t * 0.9) * 0.35; // banking
      o.lerp(_v, Math.min(1, dt * 4));
      const humAt = p.humming && G.soothe.target === g;
      if (humAt) {
        shut = 1.2;
        if (said <= 0) {
          said = 4;
          G.ui.bubble(g.obj, '…sealed.', 1.6, 0.4);
          tip('letterTip', 'It seals itself when it’s hummed at. It was written <b>to</b> somebody: take its thread and <b>stitch it to them</b>.');
        }
      }
      shut -= dt;
      if (flap) flap.rotation.x = shut > 0 ? 0 : -0.5 - Math.sin(t * 5) * 0.35;
    },
    stop() {
      if (flap) flap.rotation.x = 0;
      g.obj.rotation.z = 0;
    },
  };
});
