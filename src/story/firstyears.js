// SPDX-License-Identifier: GPL-3.0-only
// Welcoming the first-years: free roam's one scripted outing, on the first new day after the story. It mirrors
// the Prologue: this time Pip is the one on the platform with a hand-painted sign, and the ones stepping off
// the train with cardboard suitcases are somebody else.
//   Sunny hands over the sign (the Academy's kitchen)                                   fy_sign
//   the train pulls in: three first-years, each with a First-Day Jitters looping round them  fy_met
//   stand with each one and hum (content/species2.js): they fall in behind her          fy_walk
//   up the hill, and a short tour: Master Fang, Sunny's kitchen, the courtyard          fy_fang, fy_sunny, fy_tag
//   the pavilion bench                                                                  fyDone
// Afterwards the three are students at the Academy, with things to say. Loaded with story/freeroam.js.
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { BoxGeometry, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { G, flag, wait, until } from '../game.js';
import { talk, near } from './helpers.js';
import { writeSave } from '../core/save.js';
import { NPC } from '../actors/npc.js';
import { Grumbling } from '../actors/grumbling.js';
import { materialFor } from '../render/materials.js';
import { SPEAKERS } from '../ui/ui.js';
import { addPatch } from '../procgen/quilt.js';

const npc = (id) => G.npcs.get(id);
const save = () => writeSave(G.save);
const KIDS = [
  { id: 'fy1', name: 'Mei', scale: 1.0, case: '#b98a5a' },
  { id: 'fy2', name: 'Tao', scale: 1.08, case: '#a9744a' },
  { id: 'fy3', name: 'Little Wen', scale: 0.9, case: '#c9a26a' },
];
const soothedJ = (k) => !!G.save.soothed['station:' + KIDS[k].id];
const TOUR = [
  ['fy_fang', 'Master Fang, at her pavilion', 'fang'],
  ['fy_sunny', 'Sunny’s kitchen', 'tangtang'],
  ['fy_tag', 'the courtyard', 'POINT_tag'],
];

// What free roam's objective should say while this is under way: [text, target], or null.
export function pending(z) {
  if (flag('fyDone') || (G.save.day || 1) < 2) return null;
  const at = z.id;
  if (!flag('fy_sign')) return at === 'academy' ? ['Sunny has a job for you: she’s at the kitchen', 'tangtang'] : ['Sunny has a job for you, at the Academy’s kitchen', null];
  if (!flag('fy_met')) return at === 'station' ? ['The first-years’ train is due: wait on the platform', 'SPAWN_start'] : ['Meet the first-years’ train at Lantern Bay station' + (at === 'academy' ? ': ask Bo at the gate' : ''), at === 'academy' ? 'weibao' : null];
  if (!flag('fy_walk')) {
    if (at !== 'station') return ['The first-years are waiting on the station platform', at === 'academy' ? 'weibao' : null];
    const k = KIDS.findIndex((_, i) => !soothedJ(i));
    return ['Each first-year has the Jitters: stand with them, then hum', k >= 0 ? KIDS[k].id : null];
  }
  if (at === 'station') return ['Walk the first-years up the hill to Mistbloom Academy', 'TRIGGER_academy'];
  if (at !== 'academy') return ['The first-years are waiting to see the Academy', null];
  const left = TOUR.filter(([f]) => !flag(f));
  if (left.length) return ['Show the first-years round: ' + left.map((t) => t[1]).join(', '), () => left.map((t) => t[2])];
  return ['Sit down with the first-years at the pavilion', 'POINT_lessonseat'];
}

// The three of them, at `spots` ([Vector3]); each with a cardboard suitcase in hand.
async function arrive(z, spots, facing = 0) {
  const list = await Promise.all(
    KIDS.map(async (k, i) => {
      SPEAKERS[k.id] = [k.name, '#5e8a5e'];
      const n = await NPC.create(k.id, 'folk_kid', spots[i], facing, {});
      if (z.disposed || G.zone !== z) return void n.dispose();
      n.root.scale.setScalar(k.scale);
      z.addNPC(n);
      n.place(spots[i], facing, z.collision);
      n.blobRadius = 0.26;
      // the suitcase: held in the right hand
      const hand = n.h.bones.hand_R;
      if (hand) {
        const c = new Mesh(new BoxGeometry(0.3, 0.2, 0.1), materialFor('paper', { color: k.case, vertexColors: false, key: 'case' + i }));
        n.root.updateMatrixWorld(true);
        hand.getWorldPosition(c.position).y -= 0.14;
        c.rotation.y = facing;
        z.group.add(c);
        hand.attach(c);
      }
      return n;
    }),
  );
  return list.filter(Boolean);
}
const fallIn = (list) => list.forEach((n, i) => n.follow({ x: i % 2 ? 0.5 : -0.5, z: 1.3 + i * 0.95 }));

// Pip's sign: Sunny's hand-painted board, with one word changed.
function sign(pos, facing) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf4e8';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#e0662c';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 248, 120);
  x.fillStyle = '#4a3428';
  x.textAlign = 'center';
  x.font = 'bold 30px system-ui, sans-serif';
  x.fillText('WELCOME', 128, 44);
  x.fillText('NEW STUDENTS', 128, 78);
  x.font = 'italic 20px system-ui, sans-serif';
  x.fillStyle = '#e0662c';
  x.fillText('(definitely)', 128, 108);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const m = new Mesh(new PlaneGeometry(0.9, 0.45), new MeshBasicMaterial({ map: t, side: 2 }));
  m.position.copy(pos).setY(pos.y + 1.25);
  m.rotation.y = facing;
  const pole = new Mesh(new PlaneGeometry(0.05, 1.2), new MeshBasicMaterial({ color: 0x6b4a30, side: 2 }));
  pole.position.set(0, -0.6, -0.01);
  m.add(pole);
  return m;
}

// ================================================================ the station
export async function station(z) {
  if (flag('fyDone') || !flag('fy_sign')) return;
  const p = G.player;
  const plat = z.marker('SPAWN_start').position;
  const spots = [new Vector3(-3.2, plat.y, -1.9), new Vector3(-1.6, plat.y, -1.3), new Vector3(-4.6, plat.y, -1.0)];
  if (!flag('fy_met')) {
    await until(() => near(plat, 9) && !G.frozen && p.state === 'move');
    if (G.zone !== z) return;
    await trainScene(z, spots);
  }
  if (G.zone !== z) return;
  const list = z.firstYears || (z.firstYears = await arrive(z, spots, Math.PI));
  if (flag('fy_walk')) return fallIn(list);
  // each has the Jitters: it settles while its person has company
  const after = ['…oh. They’ve stopped. Was that you? Was that ME?', 'Okay. Okay! I have NOT made a terrible mistake. Probably.', '…thank you. (very quietly) …hello.'];
  let followers = 0;
  list.forEach((n, i) => {
    if (soothedJ(i)) return void n.follow({ x: followers % 2 ? 0.5 : -0.5, z: 1.3 + followers++ * 0.95 });
    const g = z.addGrumbling(new Grumbling('jitters', n.position.clone(), { id: KIDS[i].id, key: 'station:' + KIDS[i].id, person: n }));
    n.onTalk = () => talk([[KIDS[i].id, ['Is it always this… big? The sky, I mean.', 'My mum packed four jumpers. FOUR.', '…(she holds her suitcase with both hands)'][i]]]);
    g.fy = i;
  });
  z.on('soothed', async (g) => {
    if (g.fy === undefined) return;
    const n = list[g.fy];
    n.follow({ x: followers % 2 ? 0.5 : -0.5, z: 1.3 + followers++ * 0.95 });
    n.onTalk = null;
    G.ui.bubble(n.root, after[g.fy], 3.4, 1.4);
    G.events.emit('flag', { name: 'fy_j' }); // (the objective moves on to the next one)
    if (!KIDS.every((_, k) => soothedJ(k))) return;
    await wait(3.8);
    await until(() => !G.frozen && !G.ui.dialogueOpen);
    await talk([
      ['xiaopei', 'Right. It’s up the hill. It’s a bit of a climb, and there’s a pond, and a goose who isn’t real.', { face: 'happy' }],
      ['xiaopei', 'You’ll love it.', { face: 'smile' }],
    ]);
    flag('fy_walk', true);
    save();
  });
}

async function trainScene(z, spots) {
  const p = G.player;
  const a = G.audio;
  G.frozen = true;
  const stand = z.marker('POINT_sign')?.position || spots[1];
  p.teleport(stand.clone().add(new Vector3(-0.2, 0, -2.6)), 0);
  const cam = z.marker('CAM_platform');
  if (cam) G.cam.setShot(cam.position, stand.clone().setY(stand.y + 0.9), 1.4);
  // a whistle down the line, and the train pulls in
  a.tone(880, 0.9, { type: 'triangle', gain: 0.07, attack: 0.05, release: 0.3, verb: 0.7 });
  a.tone(1175, 0.9, { type: 'triangle', gain: 0.05, attack: 0.05, release: 0.3, verb: 0.7 });
  a.bed('rumble', 0.7, 2);
  await talk([[null, 'A whistle, down the line. The morning train from the city pulls in exactly on time, which nobody expected.']]);
  G.frozen = true;
  a.bed('rumble', 0, 2.5);
  a.burst(1.4, { freq: 2600, q: 0.6, gain: 0.07, sweep: 0.4 }); // the brakes let go
  z.group.add(sign(stand.clone().add(new Vector3(0.9, 0, -2.4)), 0));
  const list = (z.firstYears = await arrive(z, spots.map((s) => s.clone().add(new Vector3(0, 0, 1.9))), Math.PI));
  list.forEach((n, i) => n.walkTo(spots[i], 1.1).then(() => n.place(spots[i], Math.PI, z.collision)));
  await wait(2.4);
  await talk([
    ['xiaopei', 'WELCOME, NEW STUDENTS! …Definitely new students. I checked. Sunny didn’t, last time.', { face: 'happy' }],
    ['fy1', 'Is… is this Mistbloom? Are you a real sorcerer?'],
    ['xiaopei', 'I’m Pip. I got off that train too, not very long ago. It was raining, and somebody was holding up a sign for me.', { face: 'smile' }],
    ['fy2', 'I’ve got a cardboard suitcase, and I think I’ve made a terrible mistake.'],
    ['fy3', '(very quietly) …there are butterflies. Can everybody see the butterflies?'],
    [null, 'Round each of them a wobbly knot of paper butterflies is looping. First-Day Jitters.'],
    ['doudou', '(from the hood) …they only settle when their person has company. Go and stand with them. Then hum.'],
  ]);
  flag('fy_met', true);
  save();
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
}

// ================================================================ the Academy
export async function academy(z) {
  const tt = npc('tangtang');
  // Sunny hands over the sign (on the first new day)
  if (!flag('fy_sign') && !flag('fyDone') && tt) {
    const bake = tt.onTalk;
    tt.onTalk = async () => {
      if (flag('fy_sign') || (G.save.day || 1) < 2) return bake?.(tt);
      await talk([
        ['tangtang', 'PIP. The first-years’ train comes in today, and I’ve got forty tarts in the oven and only two hands!', { face: 'surprised' }],
        ['tangtang', 'Will you meet them? I painted the sign again. I fixed the bit that was wrong.'],
        [null, 'WELCOME NEW STUDENTS, says the sign. Underneath, in smaller letters: (definitely).'],
        ['xiaopei', '…I’d love to.', { face: 'happy' }],
        ['tangtang', 'Bo knows the way down to the station. Tell them the tarts are still warm!'],
      ]);
      flag('fy_sign', true);
      save();
    };
  }
  if (flag('fyDone')) return void students(z);
  if (!flag('fy_walk')) return;
  // they came up the hill behind her
  const p = G.player;
  const behind = (d) => p.position.clone().add(new Vector3(Math.sin(p.facing) * -d, 0, Math.cos(p.facing) * -d));
  const list = await arrive(z, [behind(1.3), behind(2.2), behind(3.1)], p.facing);
  if (G.zone !== z) return;
  fallIn(list);
  const beats = {
    fy_fang: [
      ['fang', 'Three of you! Stand up straight. No, don’t, it doesn’t matter. A lemon candy each.'],
      ['fang', 'There are rules about sweets before lessons. I made them, so.'],
      ['fy1', 'Thank you, Master Fang! …Is the cardigan part of the uniform?'],
      ['fang', 'It is earned, dear. Ask the tall one.'],
    ],
    fy_sunny: [
      ['tangtang', 'FIRST-YEARS! Have a tart. Have two. The second one is for your suitcase.', { face: 'happy' }],
      ['fy2', 'I don’t think I’ve made a terrible mistake any more.'],
    ],
    fy_tag: [
      [null, 'In the courtyard the Charm Sprites are playing tag. One of them tags Little Wen, very gently, on the nose.'],
      ['fy3', '…I’m it?'],
      ['xiaopei', 'You’re it. That’s how it starts.', { face: 'smile' }],
    ],
  };
  const where = (t) => (npc(t) ? npc(t).position : z.marker(t).position);
  for (;;) {
    const left = TOUR.filter(([f]) => !flag(f));
    if (!left.length) break;
    let now = null;
    await until(() => !G.frozen && p.state === 'move' && (now = left.find((t) => near(where(t[2]), 4.6))));
    if (G.zone !== z) return;
    await talk(beats[now[0]]);
    flag(now[0], true);
    G.collection.cozy(3, 'Showed them round', p.position.clone().setY(p.position.y + 1.6));
    save();
  }
  const seat = z.marker('POINT_lessonseat').position;
  await until(() => near(seat, 4.2) && !G.frozen && p.state === 'move');
  if (G.zone !== z) return;
  G.frozen = true;
  const cam = z.marker('CAM_lesson');
  const wen = list[2];
  wen.follow(null);
  wen.place(seat.clone().add(new Vector3(0.9, 0, 0.6)), Math.PI, z.collision);
  if (cam) G.cam.setShot(cam.position, wen.position.clone().setY(wen.position.y + 0.7), 1.6);
  G.fx.sparkles.emit(wen.position.clone().setY(wen.position.y + 0.6), 12, '#fff3b0', { speed: 0.4, up: 0.3, size: 0.1, life: 1.6 });
  await talk([
    [null, 'By the pavilion bench the smallest of them stands very still. Her Jitters, a Charm Sprite now, has gone to sleep in the crook of her arm.'],
    ['fy3', '…it likes me.'],
    ['xiaopei', 'You’re a sorcerer. Also, you have butterflies on you.', { face: 'happy' }],
    ['fy3', 'Is that… normal?'],
    ['xiaopei', 'It is here.', { face: 'smile' }],
  ]);
  flag('fyDone', true);
  G.audio.play('combo');
  G.collection.cozy(15, 'Welcomed the first-years', p.position.clone().setY(p.position.y + 1.6));
  addPatch(5);
  save();
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  for (const n of list) n.follow(null);
  settle(z, list);
}

// Afterwards they are students here, with things to say.
const HOMES = [[3.6, 9.2, 2.4], [-18.6, 15.2, 1.2], [-3.2, -8.4, 0.4]];
const LINES = [
  ['I’m on the tag team! Nobody picked me. I just turned up, and they said that counts.', 'Mei, by the way. In case you forgot. Everyone remembers Wen.'],
  ['Sunny is teaching me tarts. I am teaching Sunny what “a pinch” means. Neither of us is learning.', 'Four jumpers was the right number. Don’t tell my mum.'],
  ['…Master Fang says I notice things. I noticed she has six lemon candies in her left pocket.', '…hello, Pip.'],
];
function settle(z, list) {
  list.forEach((n, i) => {
    const [x, zz, f] = HOMES[i];
    n.place(new Vector3(x, 0, zz), f, z.collision);
    let k = 0;
    n.onTalk = () => talk([[KIDS[i].id, LINES[i][k++ % 2]]]);
  });
}
async function students(z) {
  const list = await arrive(z, HOMES.map(([x, zz]) => new Vector3(x, 0, zz)), 0);
  if (G.zone === z) settle(z, list);
}
