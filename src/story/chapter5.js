// SPDX-License-Identifier: GPL-3.0-only
// Chapter 5: The Great Sulk. At the heart of the Quiet District the friends find it: a Grumbling the size of a
// building, a huge grey blanket-lump with two enormous tearful eyes peeking out. It doesn't attack. It just
// sighs. The final encounter unfolds in the story's five phases, each one something learned in an earlier
// chapter, bigger:
//   1. Sunny bakes the biggest cake anyone has ever seen, and the smell cuts through the fog (Chapter 1's kitchen)
//   2. Bo lets the Great Sulk speak through Captain Honk, and answers each feeling (Chapters 2 and 3: listening)
//   3. every Charm Sprite Pip has befriended returns, each to the piece that matches its feeling (Stitch)
//   4. Master Fang opens her Domain of Comfort, Grandmother's Kitchen (render/materials.js uDomain)
//   5. Pip unfolds her own: the Everyone Blanket (procgen/quilt.js), and the Great Sulk falls asleep
// What the player did before changes it: the grey Grumblings kept company answer with Bo, every sprite in the
// save flies in, the people she was kind to are the guests at the table, and the quilt's patches are her own.
// Each phase ends in a saved checkpoint (ch5_p1 ... ch5_p4, then ch5Done). Loaded after Begin.
import { CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import '../world/zone.js'; // (keeps three.js in the main bundle: see story/chapter4.js)
import { G, flag, wait, until } from '../game.js';
import { talk, ask, objective, shot, near, tween } from './helpers.js';
import { writeSave } from '../core/save.js';
import { BEAT } from '../core/audio.js';
import { cookingGame } from '../systems/cooking.js';
import { sfx, usePockets } from '../systems/fog.js';
import { CreatureBatch, makeCreature } from '../actors/creatures.js';
import { Humanoid } from '../actors/humanoid.js';
import { SPECIES } from '../content/species.js';
import { Quilt } from '../procgen/quilt.js';
import { shared, materialFor } from '../render/materials.js';
import { Ribbon } from '../render/vfx.js';
import { fogDistrict } from './chapter4.js';

const npc = (id) => G.npcs.get(id);
const save = () => writeSave(G.save);
const SIX = ['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey'];
const ICON = { cloud: '☁️', sock: '🧦', homework: '📄', pompom: '🎀', sparrow: '🐦', grey: '🌫️' };
const stitchedPatches = () => SIX.filter((s) => flag('stitch_patch_' + s)).length;

// The six forgotten feelings (the grey Grumblings of Chapter 3 each carried one), and three things to say
// back: the first listens, the second tries to fix it, the third brushes it off. `at` is where the one that
// listens is shown among the three.
const FEELINGS = [
  { say: 'I WAS A BIRTHDAY NOBODY REMEMBERED.', at: 1, replies: ['I hear you. That sounds really hard.', 'We could throw you a party right now!', 'Everyone forgets a birthday now and then.'] },
  { say: 'I WAS A LETTER NOBODY ANSWERED.', at: 0, replies: ['You waited a long time for that answer.', 'Then write another one!', 'They were probably just busy.'] },
  { say: 'I WAS “I’M FINE, REALLY.” NOBODY ASKED TWICE.', at: 2, replies: ['I’m asking twice. How are you, really?', 'Cheer up! Have a tart!', 'Well, you did say you were fine.'] },
  { say: 'I WAS A FRIEND WHO MOVED AWAY AND NEVER WROTE.', at: 1, replies: ['You must miss them very much.', 'You’ll make new friends.', 'People move away. That’s life.'] },
  { say: 'I WAS A SHOP THAT CLOSED, AND NOBODY SAID GOODBYE.', at: 2, replies: ['Somebody should have said goodbye. I’m sorry.', 'Open it again, then!', 'Shops close all the time.'] },
  { say: 'I WAS A PHONE CALL NOBODY MADE.', at: 0, replies: ['Thank you for telling me. I’m not going anywhere.', 'Call them yourself!', 'It was only a phone call.'] },
];
// The people Pip was kind to: they are the guests at the table (flag, the model that stands in for them).
const GUESTS = [
  ['kind_oldman', 'folk_a'], ['kind_noodle', 'folk_b'], ['kind_barber', 'folk_c'], ['kid1Home', 'folk_kid'], ['kind_musician', 'folk_a'], ['kind_books', 'folk_b'],
  ['chestnutDone', 'folk_c'], ['kid2Home', 'folk_kid'], ['kind_share', 'folk_kid'], ['kid3Home', 'folk_kid'], ['kind_vendor', 'folk_b'], ['kind_fisher', 'folk_a'],
];

// ---------------------------------------------------------------- elsewhere, while it waits
const elsewhere = () => objective('The Great Sulk waits at the heart of the Quiet District, beyond the fog wall', G.zone?.id === 'quiet' ? 'TRIGGER_fogwall' : G.zone?.id === 'academy' ? 'weibao' : null);
export function quiet(z) {
  fogDistrict(z);
  elsewhere();
}
export function academy(z) {
  const wb = npc('weibao');
  if (wb)
    wb.onTalk = async () => {
      const a = await ask('honk', 'BACK ACROSS? IT IS STILL THERE. IT IS STILL SAD. HONK.', ['The Quiet District', 'The night market', 'Not yet']);
      G.ui.closeDialogue();
      if (a === 0) G.goto('quiet', 'SPAWN_ferry');
      else if (a === 1) G.goto('market', 'SPAWN_start');
    };
  elsewhere();
}

// ================================================================ the square
export async function heart(z) {
  const p = G.player,
    tt = npc('tangtang'),
    wb = npc('weibao'),
    fang = npc('fang');
  const bean = z.bean,
    sulk = z.sulk,
    sighs = z.sighs;
  const M = (name) => z.marker(name).position;
  const centre = M('POINT_domain');
  const pockets = usePockets(z);
  const C = (z.ch5 = { down: new Map(), sighing: false, step: 0, swarms: {}, guests: [] }); // (the tests read it too)
  if (!bean.out) bean.climbOut();
  G.save.spawn = flag('ch5_arrive') ? 'SPAWN_square' : G.save.spawn;
  const inSquare = () => p.position.z > 32;
  for (const n of [tt, wb]) {
    for (const m of n.h.meshes) m.material.color.set('#ffffff');
    n.opts.overlay = null;
    n.h.overlayPlay(null, 0);
    n.seated = false;
    n.base = 'idle';
    n.lookAtPlayer = true;
  }
  const follow = (n, slot) => {
    if (n.position.distanceTo(p.position) > 9) n.place(p.position.clone().add(new Vector3(slot.x, 0, -1.2)), p.facing, z.collision);
    n.follow(slot);
  };
  follow(tt, { x: 1.3, z: 0.6 });
  follow(wb, { x: -1.3, z: 0.9 });
  tt.onTalk = () => talk([['tangtang', flag('ch5_arrive') ? 'It’s so BIG. And so sad. I want to feed it.' : 'Whatever’s down there, we’re all going. Together. That’s the rule now.']]);
  wb.onTalk = () => talk([['honk', 'CAPTAIN HONK IS NOT AFRAID. CAPTAIN HONK IS STANDING VERY CLOSE TO YOU FOR OTHER REASONS. HONK.']]);

  // ---- its sighs: rings from where it sits, only in the square and only while a phase calls for them
  sighs.axis = null;
  sighs.source.copy(sulk.position).setY(0);
  sighs.period = 15;
  sighs.t = 9;
  sighs.enabled = () => C.sighing && inSquare();
  sighs.home = M('SPAWN_square');
  z.on('sigh', () => sulk.heave());
  z.on('sigh-near', () => {
    bean.alert(3.5);
    if (!sighs.sheltered(p.position)) bean.say('Sigh! Behind a lantern post!', 2);
  });
  // ---- checking on your friends: a sigh that catches one in the open sits them down ("I'm fine, really");
  // stand beside them for two seconds and they get up
  const down = (n) => {
    if (C.down.has(n) || flag('ch5_p3') || n.hidden) return;
    C.down.set(n, { t: 0, slot: n.follower?.slot || null, at: n.position.clone() });
    n.follow(null);
    n.walkTarget = null;
    n.lookAtPlayer = false;
    n.setAnim('overwhelmed', 0.5);
    for (const m of n.h.meshes) m.material.color.set('#8a909c');
    G.ui.bubble(n.root, n === tt ? 'I’m fine, really.' : '🪿 …bo is fine. honk.', 3.2, 1.5);
    refresh();
  };
  const up = (n) => {
    const d = C.down.get(n);
    C.down.delete(n);
    for (const m of n.h.meshes) m.material.color.set('#ffffff');
    n.setAnim('idle', 0.4);
    n.lookAtPlayer = true;
    if (d.slot) n.follow(d.slot);
    G.fx.sparkles.emit(n.position.clone().setY(n.position.y + 1), 14, '#ffe2a8', { speed: 0.9, up: 0.9, size: 0.12, life: 1.2 });
    G.ui.bubble(n.root, n === tt ? '…thank you. I’m up. I’m UP!' : '🪿 BO SAYS THANK YOU. HONK.', 2.6, 1.5);
    sighs.comfort(1);
    refresh();
  };
  for (const n of [tt, wb]) sighs.watchers.push({ position: n.position, fn: (safe) => !safe && !G.frozen && down(n) });
  z.updaters.push((dt) => {
    for (const [n, d] of C.down) {
      d.t = n.position.distanceTo(p.position) < 2.3 && !G.frozen ? d.t + dt : 0;
      if (d.t > 2) up(n);
    }
    if (G.audio.score) G.audio.score.level = C.step;
  });
  const sighComes = async (who) => {
    // one sigh, staged: it sets out now and takes about five seconds to reach her
    G.ui.toast('💡 A sigh! The stone lantern posts are shelter. And then: check on your friends.', 5.5);
    const f = sighs.send(7, Math.max(3, sighs.distance(p.position) - 7 * 5));
    await until(() => f.done);
    await wait(1.2);
    if (C.down.size) bean.say(`${who} sat down. Go and stand by ${who === 'Sunny' ? 'her' : 'him'}.`);
    await until(() => !C.down.size && !G.frozen);
  };

  // ---- the objective
  const refresh = () => {
    if (C.down.size) {
      const n = [...C.down.keys()][0];
      return objective(`Check on ${n === tt ? 'Sunny' : 'Bo'}: stand by ${n === tt ? 'her' : 'him'}`, () => n.position);
    }
    if (!flag('ch5_arrive')) return objective('Follow the street to the heart of the Quiet District', 'SPAWN_square');
    if (!flag('ch5_p1')) return objective('Help Sunny bake at the street oven', 'tangtang');
    if (!flag('ch5_p2')) return objective('Stand by Bo while Captain Honk listens', 'weibao');
    if (!flag('ch5_p3')) {
      const next = () => (z.stitch.holding ? z.marker('POINT_post_' + z.stitch.holding.id.slice(6))?.position : SIX.filter((s) => !flag('stitch_patch_' + s)).map((s) => 'POINT_patch_' + s));
      return objective(`Stitch each patch to the Charm Sprites born from that feeling (${stitchedPatches()}/6)`, next);
    }
    if (!flag('ch5_p4')) return objective(['Help Master Fang: light the stove', 'Help Master Fang: stir the great pot', 'Help Master Fang: ring the dinner bell'][Math.min(2, G.save.story.ch5_kitchen || 0)], (G.save.story.ch5_kitchen || 0) < 2 ? () => C.hearth : 'POINT_bell');
    if (!flag('ch5_sewn')) return objective('Unfold the Everyone Blanket: hum the whole lullaby', null);
    return objective('Tuck the Great Sulk in', 'POINT_tuck');
  };
  z.on('stitched', refresh);
  z.on('thread-taken', refresh);
  z.on('thread-dropped', refresh);

  // ---- what earlier phases left behind (a reload resumes at the last checkpoint)
  if (flag('ch5_p1')) cakeDone(z, C, true);
  if (flag('ch5_p3') || G.save.story.ch5_called) callSprites(z, C, true);
  patches(z, C, refresh);
  if (flag('ch5_p3')) fang.hide(false);
  if (flag('ch5_p4') || G.save.story.ch5_kitchen) openDomain(z, C, [6, 11, 14, 17][Math.min(3, G.save.story.ch5_kitchen || 0)], true);
  if (flag('ch5_p4')) await seatGuests(z, C);
  if (flag('ch5_arrive')) fang.place(M('POINT_fang'), Math.PI, z.collision);
  C.step = ['ch5_p1', 'ch5_p2', 'ch5_p3', 'ch5_p4'].filter((k) => flag(k)).length;
  refresh();

  // ================================================================ the story
  if (!flag('ch5_arrive')) {
    await until(() => p.position.z > 33.5 && !G.frozen && p.state === 'move');
    G.frozen = true;
    G.ui.card('Chapter 5', 'The Great Sulk', 2.8);
    await wait(3.2);
    G.cam.setShot(M('CAM_square').clone(), sulk.position.clone().setY(4.2), 2.2);
    // the fog thins for a moment, enough to see what is sitting there
    const fog = G.scene.fog;
    const far0 = fog.far;
    tween(3, (k) => (fog.far = far0 + 40 * k));
    await talk([
      [null, 'At the heart of the Quiet District the street opens into a square. The fog thins for a moment. Something fills the far side of it, as big as a house.'],
      ['tangtang', 'Is that a building? …Pip. Pip, it’s got EYES.'],
      [null, 'A huge grey blanket-lump, with two enormous tearful eyes peeking out. Every forgotten birthday, every unanswered letter, every “I’m fine, really” in Lantern Bay, piled into one.'],
      ['doudou', 'The Great Sulk. It doesn’t attack. It just sighs.'],
    ]);
    sulk.heave();
    sfx.moan(1);
    await wait(2.6);
    await talk([
      ['weibao', '…it’s so sad. I can feel it from here.'],
      ['xiaopei', 'Then we don’t fight it. We look after it. All of us.', { face: 'smile' }],
      ['tangtang', 'Right! Step one: CAKE. Nobody can sulk through cake. There’s an oven, look, over there!'],
    ]);
    tween(2, (k) => (fog.far = far0 + 40 * (1 - k)));
    G.cam.clearShot();
    G.cam.snapBehind(p);
    G.frozen = false;
    flag('ch5_arrive', true);
    G.save.spawn = 'SPAWN_square';
    save();
    G.audio.score?.play('sulk');
    refresh();
  }
  G.audio.score?.play('sulk');

  // ---------------- 1. Sunny's cake
  if (!flag('ch5_p1')) {
    const spot = z.marker('POINT_oven');
    tt.follow(null);
    tt.walkTo(spot.position, 3.2).then(() => {
      tt.homeFacing = tt.facing = spot.facing;
    });
    let tier = G.save.story.ch5_tier || 0,
      score = G.save.story.ch5_score || 0;
    const cake = cakeProp(z, tier, score);
    let go = false;
    tt.onTalk = async () => {
      if (C.down.has(tt)) return;
      const a = await ask('tangtang', tier ? `Tier ${tier + 1}! The oven’s hot. Ready?` : 'Three tiers. The biggest cake anyone has EVER seen, right here in the street. Ready?', ['Let’s bake!', 'Not yet']);
      G.ui.closeDialogue();
      go = a === 0;
    };
    while (tier < 3) {
      await until(() => go && !G.frozen && !C.down.size);
      go = false;
      G.frozen = true;
      tt.setAnim('stir', 0.3);
      p.setState('pose');
      p.h.play('stir', 0.3);
      shot('CAM_oven', tt.position, 1.0, 1);
      const s = await cookingGame({ title: `🎂 The biggest cake ever · tier ${tier + 1} of 3`, speed: 1 + tier * 0.2, gust: true });
      tt.setAnim('idle', 0.3);
      p.setState('move');
      G.cam.clearShot();
      score += s;
      tier++;
      Object.assign(G.save.story, { ch5_tier: tier, ch5_score: score });
      save();
      cake.grow(tier, score);
      G.audio.play('sparkle');
      await talk([['tangtang', s >= 5 ? 'PERFECT! Look at the rise on that!' : s >= 3 ? 'Golden! On it goes!' : 'A bit lopsided. That’s character. On it goes!']]);
      if (tier < 3) await sighComes('Sunny');
    }
    cake.remove();
    await cakeDone(z, C, false);
    flag('ch5_p1', true);
    save();
    C.step = 1;
    tt.onTalk = () => talk([['tangtang', 'It keeps looking at the cake. I’m going to cry. I’m going to cry INTO the cake.']]);
  }

  // ---------------- 2. Bo and Captain Honk listen
  if (!flag('ch5_p2')) {
    const spot = z.marker('POINT_bo');
    wb.follow(null);
    refresh();
    await wb.walkTo(spot.position, 2.4);
    wb.place(spot.position, spot.facing, z.collision);
    wb.onTalk = null;
    // the grey Grumblings she kept company in Chapter 3 each answer the feeling they once were, with him (the
    // first and the last are always Bo's own to answer)
    const kept = FEELINGS.map((_, i) => !!G.save.soothed['quiet:grey_' + (i + 1)]);
    for (let i = G.save.story.ch5_heard || 0; i < FEELINGS.length; i++) {
      const F = FEELINGS[i];
      await until(() => near(wb.position, 3.4) && !G.frozen && !C.down.size && p.state === 'move');
      G.frozen = true;
      shot('CAM_bo', sulk.position.clone().setY(3.4), 0, 1.2);
      wb.h.overlayPlay('puppet', 0.2);
      await talk([['honk', `(in a tiny, enormous voice) …${F.say}`]]);
      const withGrey = kept[i] && i !== 0 && i !== FEELINGS.length - 1;
      if (withGrey) {
        await talk([
          [null, 'A grey Charm Sprite drifts up beside Captain Honk. It was this feeling, once, until somebody stayed with it. It answers before Bo can.'],
          ['sprite', F.replies[0]],
        ]);
      } else {
        for (let wrong = 0; ; wrong++) {
          const order = [1, 2];
          order.splice(F.at, 0, 0);
          const a = await ask('xiaopei', '(What should Bo say back?)', order.map((k) => F.replies[k]));
          G.ui.closeDialogue();
          if (order[a] === 0) break;
          G.frozen = true;
          sulk.heave();
          sfx.moan(0.7);
          await talk([
            ['weibao', F.replies[order[a]]],
            [null, 'The Great Sulk’s lids sink, and it sighs.'],
            ['weibao', order[a] === 1 ? '…no. It doesn’t want fixing. It wants hearing.' : '…no. That’s what everybody said to it. That’s why it’s here.'],
          ]);
          if (!wrong) sighs.hit();
        }
        G.frozen = true;
        await talk([['weibao', F.replies[0]]]);
      }
      wb.h.overlayPlay(null, 0.3);
      sulk.comfort(0.15 + (i + 1) * 0.025);
      G.fx.sparkles.emit(wb.position.clone().setY(1.4), 10, '#d6dcea', { speed: 0.8, up: 1, size: 0.12, life: 1.3 });
      G.save.story.ch5_heard = i + 1;
      save();
      G.cam.clearShot();
      G.frozen = false;
      if (i === 1 || i === 3) await sighComes('Bo');
    }
    G.frozen = true;
    shot('CAM_bo', sulk.position.clone().setY(3.4), 0, 1.0);
    await talk([
      [null, 'For a moment the Great Sulk is quite still. A tear the size of a bucket rolls down and lands with a soft sound.'],
      ['honk', 'IT SAYS: NOBODY EVER ASKED BEFORE. HONK.'],
      ['weibao', '…I know. I know how that is.'],
    ]);
    G.cam.clearShot();
    G.frozen = false;
    G.collection.cozy(10, 'Listened', p.position.clone().setY(p.position.y + 1.6));
    flag('ch5_p2', true);
    save();
    C.step = 2;
    follow(wb, { x: -1.3, z: 0.9 });
    wb.onTalk = () => talk([['weibao', '…it wasn’t Captain Honk talking, that last bit. It was me.']]);
  }

  // ---------------- 3. every Charm Sprite returns
  if (!flag('ch5_p3')) {
    if (!G.save.story.ch5_called) {
      G.frozen = true;
      await talk([
        ['doudou', 'It’s been heard. Now it needs holding, and that takes more hands than we’ve got. Call them, Pip. All of them.'],
        ['xiaopei', 'Everyone? Even the sparrows?', { face: 'surprised' }],
        ['doudou', 'Especially the sparrows.'],
      ]);
      G.cam.setShot(M('CAM_square').clone().setY(6), centre.clone().setY(5), 1.4);
      callSprites(z, C, false);
      G.audio.play('combo');
      await wait(3.6);
      await talk([
        [null, 'Every Charm Sprite Pip has ever befriended comes streaming over the rooftops, and each kind settles round a lantern post of its own.'],
        ['tangtang', 'There’s the Soggy Cloud! And the Sock! And— how many SPARROWS did you soothe?'],
        ['doudou', 'Each patch on its blanket is a feeling one of them was born from. Take its loose end to the ones who know that feeling. Stitch them together.'],
      ]);
      G.cam.clearShot();
      G.cam.snapBehind(p);
      G.frozen = false;
      G.save.story.ch5_called = true;
      save();
    }
    C.sighing = true;
    refresh();
    await until(() => stitchedPatches() >= 6 && !G.frozen);
    C.sighing = false;
    sighs.fronts.length = 0;
    await until(() => !C.down.size && !G.frozen);
    G.frozen = true;
    G.cam.setShot(M('CAM_sulk').clone(), sulk.position.clone().setY(4.5), 1.6);
    await talk([
      ['tangtang', 'Look at it. LOOK at it! It’s got COLOURS!'],
      ['weibao', '…one patch is still grey. Right at the top.'],
      ['doudou', 'That one’s mine. Not yet.'],
    ]);
    G.cam.clearShot();
    G.frozen = false;
    G.collection.cozy(10, 'Everyone came back', p.position.clone().setY(p.position.y + 1.6));
    flag('ch5_p3', true);
    save();
    C.step = 3;
  }

  // ---------------- 4. Master Fang's Domain: Grandmother's Kitchen
  if (!flag('ch5_p4')) {
    if (!G.save.story.ch5_kitchen) {
      G.frozen = true;
      fang.hide(false);
      fang.place(z.marker('NPC_fang').position, 0, z.collision);
      G.cam.setShot(M('CAM_square').clone().add(new Vector3(3, -1.2, 6)), fang.position.clone().setY(1), 1.6);
      fang.walkTo(M('POINT_fang'), 1.25).then(() => (fang.homeFacing = fang.facing = 0));
      await talk([
        [null, 'Slow footsteps in the street behind them. A very small old woman in an enormous knitted cardigan walks into the square.'],
        ['tangtang', 'MASTER FANG! You said don’t go past the fog wall and we went RIGHT past the fog wall and—'],
        ['fang', 'I said it, dear, so that you would have something to be brave about.'],
      ]);
      await until(() => !fang.walkTarget);
      G.cam.setShot(M('CAM_sulk').clone().add(new Vector3(-3, 0.5, -3)), fang.position.clone().setY(1), 1.4);
      await talk([
        ['fang', 'Hello, old friend. Fifty years, and you are still not sleeping.'],
        ['fang', 'I could only hold you for a moment, then. I was seven, and by myself. I am not by myself now.'],
        ['doudou', '…hello, Autumn.'],
        ['fang', 'Hello, my five more minutes. I did wonder where you had got to.', { face: 'smile' }],
        [null, 'Master Fang opens her Domain of Comfort, for the second time in fifty years: Grandmother’s Kitchen.'],
      ]);
      G.frozen = true;
      G.cam.setShot(M('CAM_domain').clone(), centre.clone().setY(1), 1.6);
      G.audio.play('chime');
      await openDomain(z, C, 6, false);
      G.save.story.ch5_kitchen = 0.5; // (opened; nothing lit yet)
      save();
      await talk([['fang', 'A kitchen wants three things, children: a fire, a pot, and somebody to call the others in. Help me.']]);
      G.cam.clearShot();
      G.cam.snapBehind(p);
      G.frozen = false;
    }
    fang.place(M('POINT_fang'), 0, z.collision);
    fang.onTalk = () => talk([['fang', 'The fire, the pot, the bell. In that order, dear. My grandmother was very particular.']]);
    const tasks = [
      ['Light the stove', '🔥 Light the stove', 'Hum on the beat to blow on the embers.', 4, 11],
      ['Stir the great pot', '🥣 Stir the great pot', 'Hum on the beat: round, and round.', 8, 14],
      ['Ring the dinner bell', '🔔 Ring the dinner bell', 'Hum on the beat: call everyone in.', 3, 17],
    ];
    const bell = z.marker('POINT_bell');
    C.hearth = centre.clone().add(new Vector3(0, 0, -2.5));
    for (let i = Math.floor(G.save.story.ch5_kitchen || 0); i < 3; i++) {
      const [label, title, hint, n, radius] = tasks[i];
      G.save.story.ch5_kitchen = Math.max(i, G.save.story.ch5_kitchen || 0);
      refresh();
      const at = i < 2 ? C.hearth : bell.position;
      let go = false;
      const it = z.addInteractable({ position: at, radius: 2.6, priority: 2, label, action: () => (go = true) });
      await until(() => go && !G.frozen);
      G.interactables.delete(it);
      G.frozen = true;
      const face = i < 2 ? Math.atan2(centre.x - at.x, centre.z - at.z) : bell.facing;
      p.teleport(at, face);
      p.setState('pose');
      p.h.play(i === 1 ? 'stir' : 'idle', 0.3);
      G.cam.setShot(M('CAM_domain').clone().lerp(at, 0.45).setY(3.2), (i < 2 ? centre : at).clone().setY(1.4), 1.2);
      await beats(title, hint, n, (k, q) => {
        if (i === 0) kitchenFire(z, C, (k + 1) / n);
        if (i === 1) G.fx.sparkles.emit(centre.clone().setY(2.1), 6, '#f2f6fa', { speed: 0.3, up: 1.2, size: 0.5, life: 2.2, spread: 0.8 });
        if (i === 2) sfx.bell();
        if (q === 1) G.fx.sparkles.emit(at.clone().setY(at.y + 1.4), 6, '#ffe2a8', { speed: 0.8, up: 0.8, size: 0.12 });
      });
      p.setState('move');
      G.frozen = true;
      G.cam.setShot(M('CAM_domain').clone(), centre.clone().setY(1), 1.4);
      G.audio.play('relight');
      await openDomain(z, C, radius, false);
      G.save.story.ch5_kitchen = i + 1;
      save();
      sulk.comfort(0.5 + i * 0.07);
      if (i === 0) await talk([['fang', 'There. Now it is a kitchen and not only a memory of one.']]);
      if (i === 1) await talk([['honk', 'CAPTAIN HONK SMELLS SOUP. CAPTAIN HONK HAS NO NOSE. IT IS VERY GOOD SOUP. HONK.']]);
      G.cam.clearShot();
      G.cam.snapBehind(p);
      G.frozen = false;
    }
    // the guests come in: everyone she was kind to
    G.frozen = true;
    G.cam.setShot(M('CAM_domain').clone(), M('POINT_fang').clone().setY(1), 1.2);
    await seatGuests(z, C);
    const n = C.guests.length;
    await talk([
      [null, n ? `They come in out of the fog in ones and twos: ${n === 1 ? 'someone' : 'people'} Pip knocked for, sat with, walked home. Nobody asks what the enormous thing in the corner is. They sit down.` : 'The bell rings out over the roofs. The table is laid for more people than are here yet. That is how you lay a table.'],
      ['fang', 'A table with room for everyone. Sit, sit. Nobody stands in my grandmother’s kitchen.'],
      [null, 'Inside the kitchen, the Great Sulk’s next sigh comes out as nothing but steam.'],
      ['fang', 'But I can only hold the kitchen, Pip. I never could do the last part. That was always going to be someone else.'],
    ]);
    G.cam.clearShot();
    G.cam.snapBehind(p);
    G.frozen = false;
    flag('ch5_p4', true);
    save();
    C.step = 4;
    refresh();
  }

  // ---------------- 5. Pip's Domain: the Everyone Blanket
  const tier = G.quality.name;
  const flat = centre.clone().setY(6.4);
  const quilt = (C.quilt = new Quilt(z, { n: tier === 'low' ? 22 : tier === 'medium' ? 30 : 36, size: 23, flat }));
  z.updaters.push((dt) => quilt.update(dt));
  // where it settles: over the Great Sulk, laid on by arc length from the top of its head (so the patches keep
  // their shape down its sides), and flat on the ground beyond its hem
  const R = 7.6; // the dome's size along the cloth
  const cover = (x, zz, out) => {
    const rho = Math.hypot(x, zz) || 1e-6;
    const phi = Math.min(Math.PI / 2, rho / R);
    const flatOut = Math.max(0, rho - (Math.PI / 2) * R); // what lies on the ground past the hem
    const r = Math.sin(phi) + flatOut / R;
    return out.set(sulk.position.x + (x / rho) * r * 7.5, 0.3 + 8.7 * Math.cos(phi), sulk.position.z + (zz / rho) * r * 6.7);
  };
  if (flag('ch5_sewn')) {
    quilt.sew(1);
    quilt.settle(cover);
    quilt.drape = 1;
  } else {
    G.frozen = true;
    G.cam.setShot(p.position.clone().add(new Vector3(1.6, 1.5, -2.2)), p.position.clone().setY(p.position.y + 1.1), 1.4);
    await talk([
      ['doudou', 'Your turn.'],
      ['xiaopei', 'Mine? Bean, I haven’t got a kitchen. I’ve got a cardboard suitcase and a ball of thread.', { face: 'worried' }],
      ['fang', 'A Domain is only whatever makes you feel safe, dear. What is yours?'],
      ['xiaopei', '…being tucked in. Everybody in one place, under one blanket, and nobody left out.', { face: 'smile' }],
      ['doudou', 'Then don’t soothe it. Stitch it. Everyone, to everyone.'],
      [null, 'Pip unfolds her own Domain of Comfort for the first time: the Everyone Blanket.'],
    ]);
    G.frozen = true;
    G.audio.score?.play('blanket', 1.2);
    p.setState('pose');
    p.h.play('idle', 0.3);
    p.h.overlayPlay('hum', 0.3);
    G.cam.setShot(M('CAM_blanket').clone(), centre.clone().setY(4.2), 2.0);
    const hand = p.h.worldBone('hand_R', new Vector3());
    quilt.begin(hand);
    // who each stitch goes to: her friends, Master Fang, the guests, the sprites, the patches on the Sulk
    const targets = [tt.position, wb.position, fang.position, ...C.guests.map((g) => g.root.position), ...SIX.map((s) => sulk.at(s)), sulk.at('bean')];
    const thread = new Ribbon(40, 0.07, '#ffd98a');
    z.group.add(thread.mesh);
    const pts = Array.from({ length: 40 }, () => new Vector3());
    let flash = 0,
      to = targets[0];
    const drawThread = (dt) => {
      flash -= dt;
      if (flash <= 0) return thread.hide();
      p.h.worldBone('hand_R', hand);
      for (let i = 0; i < 40; i++) {
        const k = i / 39;
        pts[i].lerpVectors(hand, to, k);
        pts[i].y += Math.sin(k * Math.PI) * (1.5 + hand.distanceTo(to) * 0.12) + (to.y < 2 ? k * 1.0 : 0);
      }
      thread.mat.uniforms.opacity.value = Math.min(1, flash * 2.5);
      thread.set(pts, G.camera, 0.08);
    };
    z.updaters.push(drawThread);
    const cozy0 = G.save.cozy;
    G.audio.setHumming(true);
    const golden = await beats('🧵 The Everyone Blanket', 'Hum the whole lullaby: one stitch on every beat.', 16, (k, q) => {
      to = targets[k % targets.length];
      flash = 0.9;
      quilt.sew((k + 1) / 16, p.h.worldBone('hand_R', hand));
      sfx.stitch();
      // all her Cozy Energy pours into the thread
      G.save.cozy = Math.round(cozy0 * (1 - (k + 1) / 16));
      G.collection.refreshHud();
      G.fx.sparkles.emit(to.clone().setY(to.y + 1.2), q === 1 ? 14 : 6, q === 1 ? '#fff0b8' : '#ffd98a', { speed: 1, up: 0.9, size: 0.14, life: 1.2 });
      C.step = 4 + Math.floor((k + 1) / 4);
    });
    G.audio.setHumming(false);
    p.h.overlayPlay(null, 0.4);
    G.save.story.ch5_golden = golden;
    await wait(1.2);
    await talk([[null, 'It is stitched from everything: every Charm Sprite, every memory, every knock on a door. Big enough for the whole Great Sulk, and everyone in it.']]);
    G.frozen = true;
    quilt.settle(cover);
    G.cam.setShot(M('CAM_blanket').clone().add(new Vector3(0, 1.5, -4)), sulk.position.clone().setY(4), 3.0);
    await tween(5.2, (k) => (quilt.drape = k));
    sulk.warmPatch('bean');
    sulk.comfort(0.92);
    thread.mesh.removeFromParent();
    await talk([
      ['doudou', 'Five more minutes, old friend. Then home.'],
      ['fang', 'Go on, dear. It only wants tucking in.'],
    ]);
    p.setState('move');
    G.cam.clearShot();
    G.cam.snapBehind(p);
    G.frozen = false;
    flag('ch5_sewn', true);
    save();
  }
  refresh();
  if (!flag('ch5Done')) {
    const tuck = z.marker('POINT_tuck');
    let go = false;
    const it = z.addInteractable({ position: tuck.position, radius: 3.2, priority: 2, label: 'Tuck in the Great Sulk', action: () => (go = true) });
    await until(() => go && !G.frozen);
    G.interactables.delete(it);
    G.frozen = true;
    p.teleport(tuck.position, 0);
    p.setState('pose');
    p.h.play('pat', 0.3);
    G.cam.setShot(M('CAM_sulk').clone().add(new Vector3(-4, 1.2, -2)), sulk.position.clone().setY(4.6), 2.2);
    G.audio.score?.play(null, 2.5);
    sulk.sleep();
    await wait(3.2);
    const zzz = { position: sulk.position.clone().add(new Vector3(0, 9.6, -3)) };
    G.ui.bubble(zzz, 'z z z…', 6, 0).el.style.fontSize = '34px';
    G.audio.play('yawn');
    await talk([
      [null, 'And under the blanket, in the warm kitchen, the Great Sulk does something it has never done before.'],
      [null, 'It falls asleep.'],
    ]);
    p.setState('move');
    flag('ch5Done', true);
    save();
    G.frozen = true;
    await G.ui.card('Chapter 5 complete', 'The Great Sulk', 3.2);
    G.cam.clearShot();
    G.cam.snapBehind(p);
    G.frozen = false;
  }
  // the morning (story/epilogue.js, in the same place)
  const next = await G.later('epilogue');
  if (G.zone === z) next.heart?.(z);
}

// ---------------------------------------------------------------- beats: hum on the beat, n times
// A row of n lights and the lullaby's pulse; every press counts (it can't be failed), a press on the beat is
// golden. onPress(k, q): k = which press, q = 1 on the beat, 0.5 near it, 0.2 off it. Resolves to the number
// of golden ones.
function beats(title, hint, n, onPress) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cook panel show lanterns beats';
    el.setAttribute('role', 'dialog');
    G.ui.root.append(el);
    G.frozen = true;
    el.innerHTML = `<h3>${title}</h3><div class="small" style="margin:-4px 0 8px">${hint} (Hum, or tap)</div>
      <div class="lrow">${Array.from({ length: n }, () => '<i></i>').join('')}</div>
      <div class="beatring"><div class="pulse"></div></div><button class="btn release">Hum ♪</button>`;
    const dots = [...el.querySelectorAll('.lrow i')];
    const pulse = el.querySelector('.pulse');
    let clicked = false,
      last = -1,
      k = 0,
      golden = 0,
      done = false;
    el.querySelector('.release').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      clicked = true;
    });
    const tick = () => {
      const input = G.input;
      input.consume('confirm');
      const b = G.audio.beat();
      if (b.index !== last) {
        last = b.index;
        pulse.classList.remove('beat');
        void pulse.offsetWidth;
        pulse.classList.add('beat');
      }
      const press = clicked || input.consume('hum') || input.consume('interact') || input.consume('jump');
      clicked = false;
      if (!press || done) return;
      const off = Math.min(b.phase, 1 - b.phase) * BEAT;
      const q = off < 0.1 ? 1 : off < 0.2 ? 0.5 : 0.2;
      if (q === 1) golden++;
      G.audio.play(q === 1 ? 'perfect' : 'blip');
      dots[k].className = q === 1 ? 'perfect' : 'done';
      onPress(k, q);
      if (++k >= n) {
        done = true;
        setTimeout(() => {
          G.updaters.delete(tick);
          el.remove();
          resolve(golden);
        }, 900);
      }
    };
    G.updaters.add(tick);
  });
}

// ---------------------------------------------------------------- 1. the cake
// The cake on the work table by the oven, tier by tier (bigger the better she baked).
function cakeProp(z, tiers, score) {
  const at = z.marker('POINT_oven').position.clone().add(new Vector3(-1.5, 0.84, -1.7));
  const g = new Group();
  g.position.copy(at);
  z.group.add(g);
  const cream = materialFor('paper', { color: 0xfbeedb, vertexColors: false, key: 'cake' });
  const icing = materialFor('paper', { color: 0xf6a8b8, vertexColors: false, key: 'icing' });
  const glow = G.fx.glows.add(at, '#ffd98a', 0);
  const grow = (n, sc) => {
    while (g.children.length) g.remove(g.children[0]);
    const k = 1.5 + (sc / 18) * 0.9;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const r = (0.62 - i * 0.14) * k,
        h = 0.36 * k;
      const t = new Mesh(new CylinderGeometry(r, r * 1.03, h, 14), cream);
      t.position.y = y + h / 2;
      const ic = new Mesh(new CylinderGeometry(r * 1.04, r * 1.04, h * 0.22, 14), icing);
      ic.position.y = y + h * 0.95;
      g.add(t, ic);
      y += h;
    }
    G.fx.glows.set(glow, at.clone().setY(at.y + y + 0.3), null, n ? 0.8 + n * 0.3 : 0);
    g.userData.top = y;
  };
  grow(tiers, score);
  return { group: g, grow, at, remove: () => g.removeFromParent() };
}

// The cake is done: its smell cuts through the fog (a wide pocket of colour and clear air over the square),
// and the Great Sulk is seen whole for the first time. quiet: it was done on an earlier visit.
async function cakeDone(z, C, quiet) {
  const tt = npc('tangtang');
  const score = G.save.story.ch5_score || 0;
  const cake = cakeProp(z, 3, score);
  const centre = z.marker('POINT_domain').position;
  const radius = 10 + (score / 18) * 6;
  const pocket = { position: centre.clone(), radius: quiet ? radius : 0.01 };
  usePockets(z).push(pocket);
  // the cake itself is a warm spot: its smell keeps a sigh off
  z.sighs.warm.push({ position: cake.at.clone().setY(0), radius: 4 });
  const spot = z.marker('POINT_oven');
  // the smell, drifting toward the Great Sulk
  z.updaters.push(() => {
    if (Math.random() < 0.12) G.fx.sparkles.emit(cake.at.clone().setY(cake.at.y + 1.6), 1, '#ffe7c0', { speed: 0.5, up: 0.5, size: 0.3, life: 2.6, spread: 0.5 });
  });
  if (quiet) {
    tt.follow(null);
    tt.place(spot.position, spot.facing, z.collision);
    return;
  }
  G.frozen = true;
  G.audio.play('combo');
  shot('CAM_oven', cake.at, 0.6, 1.2);
  await talk([[null, 'Three tiers, still steaming. The smell of warm cake rolls out across the square, and the fog thins before it.']]);
  G.frozen = true;
  G.cam.setShot(z.marker('CAM_sulk').position, z.sulk.position.clone().setY(4.6), 2.0);
  await tween(3.4, (k) => (pocket.radius = radius * (1 - (1 - k) * (1 - k))));
  z.sulk.comfort(0.15);
  await talk([
    ['tangtang', 'It’s LOOKING at it. Pip, it’s looking at my cake!'],
    ['honk', 'IT HAS VERY LARGE EYES. HONK.'],
    ['weibao', '…it’s crying. It’s been crying this whole time, and nobody could see.'],
    ['weibao', '…I think I can ask it why.'],
  ]);
  G.collection.cozy(8 + score, 'The biggest cake ever', G.player.position.clone().setY(G.player.position.y + 1.6));
  G.cam.clearShot();
  G.cam.snapBehind(G.player);
  G.frozen = false;
}

// ---------------------------------------------------------------- 3. the sprites
// Every Charm Sprite in the save, each kind round its own lantern post (as many as she has, twelve at most).
function callSprites(z, C, quiet) {
  if (Object.keys(C.swarms).length) return;
  let i = 0;
  for (const sp of SIX) {
    const n = Math.min(12, G.save.sprites[sp] || 0);
    if (!n) continue;
    const post = z.marker('POINT_post_' + sp).position;
    const list = [];
    const batch = new CreatureBatch(sp, n);
    for (let k = 0; k < n; k++) {
      const o = makeCreature(sp, { glow: SPECIES[sp].glow });
      o.scale.setScalar(0.5);
      // they come in over the roofs from the north
      o.position.set(post.x + (Math.random() - 0.5) * 30, 14 + Math.random() * 6, quiet ? post.z : -10 - Math.random() * 20);
      o.userData.phase = Math.random() * 6.28;
      o.userData.delay = quiet ? 0 : i * 0.12;
      z.group.add(o);
      batch.add(o);
      list.push(o);
      i++;
    }
    z.group.add(...batch.parts);
    const sw = (C.swarms[sp] = { list, batch, at: post.clone(), high: 3.1, r: 1.2 + Math.min(1.2, n * 0.12), glow: G.fx.glows.add(post.clone().setY(2.6), SPECIES[sp].glow, 1.4) });
    if (quiet) for (const o of list) o.position.copy(sw.at).setY(sw.high);
  }
  const t0 = G.time;
  z.updaters.push((dt) => {
    const t = G.time;
    for (const sw of Object.values(C.swarms)) {
      sw.list.forEach((o, k) => {
        const ph = o.userData.phase;
        const a = t * (0.5 + (k % 3) * 0.12) + ph;
        const tx = sw.at.x + Math.cos(a) * sw.r * (0.6 + (k % 4) * 0.2),
          ty = sw.at.y + sw.high + Math.sin(t * 1.7 + ph) * 0.3 + (k % 3) * 0.35,
          tz = sw.at.z + Math.sin(a) * sw.r * (0.6 + (k % 4) * 0.2);
        const go = t - t0 > o.userData.delay ? Math.min(1, dt * 1.6) : 0;
        o.position.x += (tx - o.position.x) * go;
        o.position.y += (ty - o.position.y) * go;
        o.position.z += (tz - o.position.z) * go;
        o.rotation.y = -a;
        if (Math.random() < dt * 0.6) G.fx.sparkles.emit(o.position, 1, o.userData.species ? SPECIES[o.userData.species].glow : '#fff', { speed: 0.15, up: 0.1, size: 0.07, life: 0.9 });
      });
      sw.batch.update();
    }
  });
}

// A loose end dangles from each patch on the Great Sulk: stitch it to the sprites born from that feeling.
function patches(z, C, refresh) {
  const done = (sp, quiet) => {
    const sw = C.swarms[sp];
    // they swarm onto their patch, and it warms into colour
    const at = z.sulk.at(sp);
    if (sw) {
      sw.at.copy(at).add(new Vector3(0, 0, -0.9));
      sw.high = 0.2;
      sw.r = 1.5;
    }
    if (quiet) z.sulk.patches[sp].to = z.sulk.patches[sp].warm = 1;
    else {
      z.sulk.warmPatch(sp);
      z.sulk.comfort(0.3 + stitchedPatches() * 0.03);
      z.bean.say(`${SPECIES[sp].name}: “${SPECIES[sp].feeling}” It knows that one.`);
      G.audio.play('thanks');
    }
  };
  for (const sp of SIX) {
    const n = G.save.sprites[sp] || 0;
    z.stitch.add({
      id: 'patch_' + sp,
      icon: ICON[sp],
      what: `the ${SPECIES[sp].name}${n > 1 ? 's' : ''} at their lantern post`,
      take: 'Take the patch’s loose end',
      from: z.marker('POINT_patch_' + sp).position,
      to: z.marker('POINT_post_' + sp).position,
      beats: n >= 6 ? 2 : n >= 2 ? 3 : 4, // a kind she has more of takes fewer beats
      pocket: 0,
      enabled: () => !!G.save.story.ch5_called && !flag('ch5_p3'),
      onDone: () => done(sp, false),
    });
    if (flag('stitch_patch_' + sp)) done(sp, true);
  }
}

// ---------------------------------------------------------------- 4. the Domain
// Grandmother's Kitchen opens (or grows) to `radius`. Its furniture becomes solid, and inside it a sigh is
// only steam: the whole circle is a warm spot.
async function openDomain(z, C, radius, quiet) {
  const c = z.marker('POINT_domain').position;
  const d = shared.uDomain.value;
  const from = d.w;
  if (!C.domainWarm) {
    C.domainWarm = { position: c.clone().setY(0), radius: 0 };
    z.sighs.warm.push(C.domainWarm);
    // the kitchen's own air: warm and clear, the fog kept well outside (and off the Great Sulk, leaning in)
    C.domainAir = { position: c.clone().setY(2), radius: 0.01 };
    usePockets(z).push(C.domainAir);
    // the table, its benches and the bell post (the stove, the cupboard and the pillars stand where the
    // fountain, the oven and the lantern posts already are)
    const tx = -14,
      tz = 40.2;
    z.collision.addBox(new Vector3(tx, 0.4, tz), new Vector3(11, 0.8, 1.5));
    for (const s of [-1, 1]) z.collision.addBox(new Vector3(tx, 0.22, tz + s * 1.25), new Vector3(10.4, 0.44, 0.4));
    z.collision.addBox(new Vector3(-22.6, 1.3, 41.6), new Vector3(0.3, 2.6, 0.3));
    z.collision.build();
    C.steamT = 0;
    z.updaters.push((dt) => {
      // lamplight and steam
      if (d.w > 3 && (C.steamT -= dt) < 0) {
        C.steamT = 0.25;
        if (G.save.story.ch5_kitchen >= 2) G.fx.sparkles.emit(c.clone().setY(2.2), 1, '#f2f6fa', { speed: 0.2, up: 0.9, size: 0.6, life: 2.6, spread: 0.7 });
      }
    });
    if ((G.save.story.ch5_kitchen || 0) >= 1) kitchenFire(z, C, 1);
  }
  const set = (r) => {
    d.set(c.x, 0, c.z, r);
    C.domainWarm.radius = r;
    C.domainAir.radius = r + 3 + r * 0.45;
  };
  if (quiet) return set(radius);
  await tween(2.6, (k) => set(from + (radius - from) * (1 - (1 - k) * (1 - k))));
}
function kitchenFire(z, C, k) {
  const c = z.marker('POINT_domain').position;
  C.fire ??= G.fx.glows.add(c.clone().setY(0.7), '#ff9a4a', 0);
  G.fx.glows.set(C.fire, c.clone().setY(0.7), null, 4.5 * k);
  G.fx.sparkles.emit(c.clone().setY(0.5), 8, '#ffb05a', { speed: 1.4, up: 1.2, size: 0.14, life: 1.1, spread: 2.6 });
}

// The guests at the table: the people Pip was kind to (as many as the tier can seat), sitting still.
async function seatGuests(z, C) {
  if (C.guests.length) return;
  const cap = { low: 4, medium: 6, high: 9 }[G.quality.name] || 6;
  const who = GUESTS.filter(([f]) => flag(f)).slice(0, cap);
  const seats = z.markersBy('SEAT_table_').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  // spread along both sides of the table
  const pick = [3, 14, 7, 10, 1, 16, 5, 12, 9];
  await Promise.all(
    who.map(async ([, model], i) => {
      const seat = seats[pick[i] % seats.length];
      const h = await Humanoid.load(model, { fresh: true }).catch(() => null);
      if (!h || z.disposed) return;
      h.play('sit', 0);
      h.seatRoot(seat.position, seat.facing, seat.data.seat ?? 0.46, h.root.position);
      h.root.rotation.y = seat.facing;
      h.update(0.1, 0); // one pose, then still: nobody here needs animating
      z.group.add(h.root);
      C.guests.push(h);
      G.fx.sparkles.emit(h.root.position.clone().setY(1), 10, '#ffe2a8', { speed: 0.7, up: 0.8, size: 0.12, life: 1.2 });
    }),
  );
}
