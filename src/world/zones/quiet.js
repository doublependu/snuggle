// SPDX-License-Identifier: GPL-3.0-only
// Chapter 3 zone: the Quiet District, an old neighbourhood of shuttered shops across the harbour. Everything
// is greyed out (render/materials.js uFade) except the pockets of colour around restored memories
// (systems/memories.js); a height fog thickens toward the fog wall at the south end. Grey Grumblings drift
// toward the heart of the district and want company, not hugs (systems/greys.js). A few neighbours never
// left. Across the water, the night market's lanterns are the only warm colour.
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { G, flag } from '../../game.js';
import { Zone } from '../zone.js';
import { materialFor, setGreyOut } from '../../render/materials.js';
import { bigTreeGeometry } from '../../procgen/props.js';
import { CreatureBatch } from '../../actors/creatures.js';
import { Greys } from '../../systems/greys.js';
import { Memories } from '../../systems/memories.js';
import { district, refreshObjective3, MEMORIES } from '../../story/chapter3.js';
import { talk, ask } from '../../story/helpers.js';
import { writeSave } from '../../core/save.js';
import { addSigns } from '../signs.js';
import { Routes, startGuide, signsFor } from '../../systems/wayfinder.js';

// Overcast late afternoon: a flat grey sky and light that is already fading.
export const QUIET = {
  skyTop: '#8a93a3', horizon: '#c3c6cb', ground: '#85888b', fog: '#afb4bc', fogNear: 16, fogFar: 110,
  hemiSky: '#d2d8e2', hemiGround: '#857f74', hemi: 1.45, sunColor: '#e9e2d6', sunI: 1.0, sun: new Vector3(-0.4, 0.35, -0.85),
  skySun: '#e6e2da', clouds: 16, cloudColor: '#d0d3d8', cloudShade: '#9da2aa', peaks: true, peakColor: '#8d949c', shadows: false,
};
const GREY_OUT = {
  fade: 0.86,
  tint: '#e4e7ec',
  fog: { top: 1.1, falloff: 1.7, strength: 0.45 },
  wall: { dir: new Vector3(0, 0, 1), start: 33, length: 8 }, // the fog wall at the south end (glTF +z)
};
// glTF-space rectangle the lamp map covers (the lane, the alley, the square and the fog street)
const LAMP_RECT = { minX: -26, minZ: -24, maxX: 26, maxZ: 50 };

// The lane from the ferry to the fog, with the alley off it, for the guide (systems/wayfinder.js): [x, z].
const NODES = { ferry: [0, -24], plaza: [0, -16], laneN: [0, -11], bridge: [0, 0], laneM: [0, 13], alley0: [4.6, 13], alley1: [12, 13], laneS: [0, 21], square: [0, 27], fogN: [0, 35], fog: [0, 39] };
const EDGES = ['ferry plaza laneN bridge laneM laneS square fogN fog', 'laneM alley0 alley1'];

export async function create() {
  const z = new Zone('quiet');
  z.fade = true;
  z.next = ['academy', 'kit', 'fang', 'folk_a', 'folk_b', 'folk_c', 'folk_kid'];
  await Promise.all([z.addGLB('quiet'), z.placeKit('quiet_kit')]);
  z.setupEnvironment(QUIET);
  setGreyOut(GREY_OUT);
  z.addWater({ deep: '#2a3a3e', shallow: '#3d5256' });
  // the old banyan in the square
  const bt = z.marker('POINT_banyan');
  if (bt) {
    const tree = new InstancedMesh(bigTreeGeometry(11), materialFor('leaf', { fade: 1 }), 1);
    tree.setMatrixAt(0, new Matrix4().makeTranslation(bt.position.x, bt.position.y, bt.position.z));
    tree.computeBoundingSphere();
    z.group.add(tree);
    z.collision.addCylinder(bt.position.clone().setY(-0.5), 0.6, 5, 8);
  }
  z.collision.build();

  // ---- the market's lanterns across the water, still lit; this side's lanterns are dead until a memory
  // relights them (LIGHT_ markers carry the memory's id)
  for (const m of z.markersBy('POINT_farlight_')) G.fx.glows.add(m.position, Math.random() < 0.5 ? '#ffa04a' : '#ffc870', 2.6 + Math.random());
  const lights = z.markersBy('LIGHT_');
  const litFor = (id) => lights.filter((m) => m.data.mem === id);
  const lamp = (m) => ({ position: m.position, color: m.data.color, radius: m.data.radius, intensity: m.data.intensity });
  const lit = lights.filter((m) => m.data.mem && flag('mem_' + m.data.mem));
  z.lamps(LAMP_RECT, [], { texel: 0.45, floorY: 0, top: 3.6 });
  z.lampList = lit.map(lamp);
  z.relight();
  for (const m of lit) if (m.data.glow > 0) G.fx.glows.add(m.position, m.data.color || '#ffb45c', m.data.glow);

  // ---- shutters that lift a little when their memory comes back
  const shutters = {};
  z.group.traverse((o) => {
    if (o.name.startsWith('SHUT_')) shutters[o.name.slice(5).replace(/[._]\d+$/, '')] = o;
  });
  const lift = (id, instant) => {
    const s = shutters[id];
    if (!s) return;
    s.matrixAutoUpdate = true;
    const y0 = s.position.y;
    if (instant) return void (s.position.y = y0 + 1.7);
    let t = 0;
    const fn = (dt) => {
      t = Math.min(1, t + dt / 2.2);
      s.position.y = y0 + 1.7 * (1 - (1 - t) * (1 - t));
      if (t >= 1) G.updaters.delete(fn);
    };
    G.updaters.add(fn);
  };
  for (const id of Object.keys(shutters)) if (flag('mem_' + id)) lift(id, true);

  // ---- the cast: Sunny and Bo came on the ferry; the ferryman and the neighbours stream in
  await z.populateNPCs(undefined, { essential: ['tangtang', 'weibao'] });
  for (const id of ['tangtang', 'weibao']) z.whenNPC(id, (n) => (n.blobRadius = 0.32));
  z.whenNPC('ferryman', (n) => {
    n.onTalk = async () => {
      const a = await ask('Ferryman', flag('ch3_return') ? 'Back across before dark? Hop in.' : 'Where to, young ones? The water’s calm today.', ['Home to the Academy', 'To the night market', 'Not yet']);
      G.ui.closeDialogue();
      if (a === 0) G.goto('academy', 'SPAWN_gate');
      else if (a === 1) G.goto('market', 'SPAWN_start');
    };
  });
  const NEIGHBOURS = {
    barber: ['Barber', ['Customers? Here? Not for years. I still sweep every morning, though. Habit.', 'Funny… I remembered my old customers’ names this morning. Every one of them.']],
    noodle: ['Noodle auntie', ['Noodles? I closed the shop ages ago. Nobody came.', 'Maybe I’ll open for lunch tomorrow. Just a small pot. In case.']],
    oldman: ['Old man', ['Mm? Young ones, here? Nobody visits the Quiet District anymore.', 'Lau! That was my name at the mahjong table. Somebody remembered it?']],
  };
  for (const [id, [who, lines]] of Object.entries(NEIGHBOURS)) {
    z.whenNPC(id, (n) => {
      if (id === 'oldman') n.interactable.radius = 2.8;
      n.onTalk = async () => {
        const after = z.memories.count >= 3;
        await talk([[who, lines[after ? 1 : 0]]]);
        const key = 'kind_' + id;
        if (!flag(key)) {
          flag(key, true);
          G.collection.cozy(3, 'Checked on a neighbour', n.position.clone().setY(n.position.y + 1.6));
          if (Object.keys(NEIGHBOURS).every((k) => flag('kind_' + k))) {
            G.collection.cozy(6, 'Checked on every neighbour', null);
            G.ui.toast('💌 You checked on every neighbour. Master Fang would say that’s the most important thing.', 4);
          }
          writeSave(G.save);
        }
      };
    });
  }

  // ---- grey Grumblings (batched: six of them would be twelve draw calls)
  const heart = z.box('AREA_heart')?.getCenter(new Vector3()) || new Vector3(0, 0, 38);
  const greys = [];
  for (const m of z.markersBy('GRUMB_grey_')) {
    const g = z.grumblingAt(m.name, { heart, echo: m.data.echo, helped: () => z.memories?.near(g.position) });
    if (g) greys.push(g);
  }
  const batch = new CreatureBatch('grey', 6, { tint: true });
  for (const g of greys) batch.add(g.obj);
  z.group.add(...batch.parts);
  G.updaters.add(() => batch.update());
  z.greys = new Greys(z, greys);

  // ---- the memories
  z.memories = new Memories(z, MEMORIES);
  z.onMemory = (id) => {
    const ls = litFor(id);
    z.lampList.push(...ls.map(lamp));
    z.relight();
    for (const m of ls) if (m.data.glow > 0) G.fx.glows.add(m.position, m.data.color || '#ffb45c', m.data.glow);
    lift(id, false);
    G.audio.play('relight');
  };
  z.streamed?.then(() => z.memories.warm('folk_kid'));

  // ---- sitting down on a bench or a stool (a grey Grumbling nearby comes closer faster)
  const seats = z.markersBy('SEAT_');
  let seated = null,
    standT = 0;
  for (const m of seats)
    z.addInteractable({ position: m.position, radius: 1.6, priority: 1.2, label: 'Sit down', enabled: () => !seated, action: () => sit(m) });
  function sit(m) {
    seated = m;
    standT = 0;
    G.player.sitOn(m.position, m.facing, m.data.seat ?? 0.42);
    G.cam.snapBehind(G.player);
  }
  z.updaters.push((dt) => {
    const p = G.player;
    if (!seated) return;
    if (p.state !== 'sit') return void (seated = null);
    const input = G.input;
    standT = input.move.lengthSq() > 0.5 ? standT + dt : 0;
    G.ui.prompt('Stand up', input.device === 'touch' ? '' : input.label('interact'));
    G.touch?.setAct('Stand up');
    if (!G.frozen && (input.consume('interact') || input.consume('jump') || standT > 0.45)) {
      p.stand();
      seated = null;
    }
  });

  // ---- signs: the ferry, and the forgotten shops, whose names are faded until their memory comes back
  const routes = new Routes(z, NODES, EDGES);
  const faded = (id) => () => !flag('mem_' + id);
  const W = -Math.PI / 2;
  addSigns(z, [
    ...signsFor(z, routes, [['Ferry', '⛴️', 4.6, -20.8, 0]]),
    { kind: 'post', text: 'Noticeboard', icon: '📜', at: new Vector3(-7.7, 0, -15.2), facing: 0, dim: faded('notice'), place: false },
    { kind: 'board', text: 'Post Office', icon: '✉️', at: new Vector3(4.07, 3.4, -5), facing: W, w: 2.4, dim: faded('post') },
    { kind: 'board', text: 'Sweet Shop', icon: '🍋', at: new Vector3(-4.07, 3.4, 5), facing: -W, w: 2.4, dim: faded('sweets') },
    { kind: 'board', text: 'Teahouse', icon: '🍵', at: new Vector3(-11.91, 3.3, 26), facing: -W, w: 2.3, dim: faded('teahouse') },
    { kind: 'board', text: 'Thread Shop', icon: '🧵', at: new Vector3(14.84, 3.3, 13), facing: W, w: 1.9, dim: faded('thread') },
  ]);
  z.on('flag', ({ name }) => name.startsWith('mem_') && z.signs.redraw());
  startGuide(z, routes);

  // the pause menu's "Things to do here"
  z.todo = () => [
    ['🚪 Neighbours checked on', Object.keys(NEIGHBOURS).filter((k) => flag('kind_' + k)).length, 3],
    ['🌫️ Grey Grumblings kept company', G.save.sprites.grey || 0, z.markersBy('GRUMB_grey_').length],
  ];

  // ---- the fog wall: too thick to go further (Chapter 4 begins here)
  z.onTrigger('TRIGGER_fogwall', () => {
    const p = G.player;
    p.teleport(p.position.clone().add(new Vector3(0, 0, -1.2)), p.facing);
    talk([['xiaopei', flag('ch3_return') ? 'The fog is even thicker now… Not yet. Not tonight.' : 'The fog is so thick here I can’t see my own hands… Not yet.', { face: 'worried' }]]);
  });

  // ---- sounds: a low wind, dripping, a foghorn now and then; the canal and the harbour
  G.audio.mix('quiet');
  let horn = 6,
    drip = 1;
  z.updaters.push((dt) => {
    horn -= dt;
    drip -= dt;
    if (horn < 0) {
      horn = 24 + Math.random() * 18;
      G.audio.play('foghorn');
    }
    if (drip < 0) {
      drip = 0.6 + Math.random() * 2.2;
      G.audio.play('drip');
    }
    // each memory brings a voice back into the district's music
    if (G.audio.score) G.audio.score.level = z.memories.count;
  });
  z.killY = -6;
  z.stepFx = '#d9dde3'; // the fog, stirred up
  z.safeMinY = -0.3;
  // fell into the canal or off the jetty: a splash, and back to dry land
  z.updaters.push(() => {
    const p = G.player;
    if (p.position.y < -0.6 && p.state === 'move') {
      G.fx.sparkles.emit(p.position.clone().setY(-0.6), 24, '#bfe3ff', { speed: 1.8, up: 2, size: 0.12 });
      G.audio.play('drip');
      G.ui.floaty(p.position.clone().setY(0.4), 'Splash!');
      p.teleport(p.safe);
      G.events.emit('splash');
    }
  });
  z.start = () => district(z);
  refreshObjective3();
  return z;
}
