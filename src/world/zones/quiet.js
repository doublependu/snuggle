// SPDX-License-Identifier: GPL-3.0-only
// Chapter 3 zone: the Quiet District, an old neighbourhood of shuttered shops across the harbour. Everything
// is greyed out (render/materials.js uFade) except the pockets of colour around restored memories
// (systems/memories.js); a height fog thickens toward the fog wall at the south end. Grey Grumblings drift
// toward the heart of the district and want company, not hugs (systems/greys.js). A few neighbours never
// left. Across the water, the night market's lanterns are the only warm colour.
// Three states of the one place: grey with pockets of colour (Chapter 3); under the fog (Chapters 4 and 5:
// you see about 8 m, the restored memories are still pockets of colour and clear air, the grey Grumblings
// have gone to the heart, the neighbours stay behind their doors); and in full colour, every lantern lit and
// every shop open (the Epilogue and after).
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { G, flag } from '../../game.js';
import { Zone } from '../zone.js';
import { materialFor, setGreyOut, shared } from '../../render/materials.js';
import { bigTreeGeometry } from '../../procgen/props.js';
import { CreatureBatch } from '../../actors/creatures.js';
import { Greys } from '../../systems/greys.js';
import { Memories } from '../../systems/memories.js';
import { district, refreshObjective3, MEMORIES } from '../../story/chapter3.js';
import { talk, ask, era, runStory } from '../../story/helpers.js';
import { FOG_ENV, FOG_LOOK, MORNING, usePockets } from '../../systems/fog.js';
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
  const story = era();
  // under the fog from the morning Master Fang is gone until the Great Sulk is asleep
  const fogged = (story === 'ch4' && flag('ch4_start')) || story === 'ch5';
  // in colour again: the Epilogue (it comes back as she walks, story/epilogue.js) and ever after
  const after = story === 'epilogue' || story === 'free';
  const returning = story === 'epilogue' && !flag('ep_walk'); // still grey as she arrives
  z.fade = true;
  z.state = fogged ? 'fog' : after ? 'after' : 'grey';
  z.next = fogged || after ? ['heart', 'academy', 'kit', 'fang'] : ['academy', 'kit', 'fang', 'folk_a', 'folk_b', 'folk_c', 'folk_kid'];
  // after the story every shop and house is open (the kit has an open piece for each shut front); on the
  // Epilogue's walk back both stand there, and each shop opens as she comes by (z.shops)
  const open = (p) => (/^q(shop|house)_/.test(p) ? p + '_open' : p);
  await Promise.all([z.addGLB('quiet'), z.placeKit('quiet_kit', after ? (p) => (returning && open(p) !== p ? [p, open(p)] : [open(p)]) : null)]);
  if (returning) {
    z.shops = [];
    const zero = new Matrix4().makeScale(0, 0, 0);
    const kit = {};
    for (const c of z.group.children) if (c.isInstancedMesh) (kit[c.name] ||= []).push(c);
    for (const [name, shut] of Object.entries(kit)) {
      const opened = kit[name + '_open'];
      if (!opened) continue;
      for (let i = 0; i < shut[0].count; i++) {
        const m = new Matrix4();
        shut[0].getMatrixAt(i, m);
        const homes = opened.map((im) => {
          const h = new Matrix4();
          im.getMatrixAt(i, h);
          im.setMatrixAt(i, zero);
          return h;
        });
        z.shops.push({
          at: new Vector3().setFromMatrixPosition(m),
          open() {
            for (const im of shut) {
              im.setMatrixAt(i, zero);
              im.instanceMatrix.needsUpdate = true;
            }
            opened.forEach((im, k) => {
              im.setMatrixAt(i, homes[k]);
              im.instanceMatrix.needsUpdate = true;
            });
          },
        });
      }
    }
  }
  z.setupEnvironment(fogged ? FOG_ENV : after ? MORNING : QUIET);
  if (fogged) setGreyOut(FOG_LOOK);
  else if (!after || returning) setGreyOut(after ? { fade: GREY_OUT.fade, tint: GREY_OUT.tint } : GREY_OUT);
  usePockets(z); // (the memories below share the zone's list)
  z.addWater(after ? { deep: '#2b5f66', shallow: '#4f8f8c' } : { deep: '#2a3a3e', shallow: '#3d5256' });
  // coming back from the Old Quarter, through the gateway where the fog wall was
  z.markers.set('SPAWN_south', { name: 'SPAWN_south', position: new Vector3(0, 0.05, 37.5), facing: Math.PI, data: {}, scale: new Vector3(1, 1, 1) });
  // where a reload starts on the Epilogue's walk back (story/epilogue.js): by the breakfast table, on the jetty
  for (const [name, x, zz] of [['SPAWN_breakfast', 1.6, 13.2], ['SPAWN_jetty', 0.6, -24.5]])
    z.markers.set(name, { name, position: new Vector3(x, 0.05, zz), facing: Math.PI, data: {}, scale: new Vector3(1, 1, 1) });
  // the old banyan in the square
  const bt = z.marker('POINT_banyan');
  if (bt) {
    const tree = new InstancedMesh(bigTreeGeometry(11), materialFor('leaf', { fade: 1 }), 1);
    tree.name = 'banyan';
    tree.setMatrixAt(0, new Matrix4().makeTranslation(bt.position.x, bt.position.y, bt.position.z));
    tree.computeBoundingSphere();
    z.group.add(tree);
    z.collision.addCylinder(bt.position.clone().setY(-0.5), 0.6, 5, 8);
  }
  z.collision.build();

  // ---- the market's lanterns across the water, still lit; this side's lanterns are dead until a memory
  // relights them (LIGHT_ markers carry the memory's id)
  if (!fogged && !after) for (const m of z.markersBy('POINT_farlight_')) G.fx.glows.add(m.position, Math.random() < 0.5 ? '#ffa04a' : '#ffc870', 2.6 + Math.random());
  const lights = z.markersBy('LIGHT_');
  const litFor = (id) => lights.filter((m) => m.data.mem === id);
  const lamp = (m) => ({ position: m.position, color: m.data.color, radius: m.data.radius, intensity: m.data.intensity });
  // (on the Epilogue's walk back every lantern is out in the morning light, and relights as she comes by)
  const lit = returning ? [] : lights.filter((m) => after || (m.data.mem && flag('mem_' + m.data.mem)));
  z.lamps(LAMP_RECT, [], { texel: 0.45, floorY: 0, top: 3.6 });
  z.lampList = lit.map(lamp);
  z.relight();
  if (after) shared.uLampOn.value = 0.55; // by day the lanterns only warm what is near them
  z.lightGlow = (m) => m.data.glow > 0 && G.fx.glows.add(m.position, m.data.color || '#ffb45c', m.data.glow);
  for (const m of lit) z.lightGlow(m);
  z.lightsLeft = lights.filter((m) => !lit.includes(m)); // (the Epilogue relights these as she walks by)
  z.lampOf = lamp;

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
  // (after the story every shop is open; on the Epilogue's walk back they open as she comes by)
  const lifted = new Set();
  for (const id of Object.keys(shutters))
    if (flag('mem_' + id) || (after && !returning)) {
      lift(id, true);
      lifted.add(id);
    }
  z.liftShutter = (id) => {
    if (lifted.has(id)) return;
    lifted.add(id);
    lift(id, false);
  };
  z.shutters = shutters;

  // ---- the cast: Sunny and Bo came on the ferry; the ferryman and the neighbours stream in. Under the fog
  // the neighbours stay behind their doors (story/chapter4.js); after the story Sunny and Bo are at home.
  const HIDDEN = fogged ? ['barber', 'noodle', 'oldman'] : story === 'free' ? ['tangtang', 'weibao'] : [];
  await z.populateNPCs((m) => !HIDDEN.includes(m.name.slice(4)), { essential: story === 'free' ? [] : ['tangtang', 'weibao'] });
  for (const id of ['tangtang', 'weibao']) z.whenNPC(id, (n) => (n.blobRadius = 0.32));
  z.whenNPC('ferryman', (n) => {
    n.onTalk = async () => {
      const line = fogged ? 'I’ll not take her past this jetty, not in this. Back across?' : after ? 'Lovely morning for it. Where to?' : flag('ch3_return') ? 'Back across before dark? Hop in.' : 'Where to, young ones? The water’s calm today.';
      const a = await ask('Ferryman', line, ['Home to the Academy', 'To the night market', 'Not yet']);
      G.ui.closeDialogue();
      if (a === 0) G.goto('academy', 'SPAWN_gate');
      else if (a === 1) G.goto('market', 'SPAWN_start');
    };
  });
  const NEIGHBOURS = {
    barber: ['Barber', ['Customers? Here? Not for years. I still sweep every morning, though. Habit.', 'Funny… I remembered my old customers’ names this morning. Every one of them.', 'Three haircuts before noon! I had to look up how.']],
    noodle: ['Noodle auntie', ['Noodles? I closed the shop ages ago. Nobody came.', 'Maybe I’ll open for lunch tomorrow. Just a small pot. In case.', 'Lunch is on. The big pot. Tell your friends, and their friends.']],
    oldman: ['Old man', ['Mm? Young ones, here? Nobody visits the Quiet District anymore.', 'Lau! That was my name at the mahjong table. Somebody remembered it?', 'Your turn, young one. No? Then pull up a chair and watch an old man win.']],
  };
  for (const [id, [who, lines]] of Object.entries(NEIGHBOURS)) {
    z.whenNPC(id, (n) => {
      if (id === 'oldman') n.interactable.radius = 2.8;
      n.onTalk = async () => {
        const remembered = z.memories.count >= 3;
        await talk([[who, lines[after ? 2 : remembered ? 1 : 0]]]);
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
  // (under the fog they have all gone on to the heart; after it, the day's worries are the only Grumblings here)
  for (const m of story ? [] : z.markersBy('GRUMB_grey_')) {
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
    z.liftShutter(id);
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
  const faded = (id) => () => !flag('mem_' + id) && !flag('ep_walk');
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
    ['🌫️ Grey Grumblings kept company', z.markersBy('GRUMB_grey_').filter((m) => G.save.soothed['quiet:' + m.name.slice(6)]).length, z.markersBy('GRUMB_grey_').length],
  ];

  // ---- the fog wall: too thick to go further (Chapter 4 begins here)
  z.onTrigger('TRIGGER_fogwall', () => {
    const p = G.player;
    // once Pip has been lost beyond it and found her friends again, it is simply the way to the Old Quarter
    if (flag('ch4_lost')) return void G.goto('heart', 'SPAWN_start');
    p.teleport(p.position.clone().add(new Vector3(0, 0, -1.2)), p.facing);
    talk([['xiaopei', flag('ch3_return') ? 'The fog is even thicker now… Not yet. Not tonight.' : 'The fog is so thick here I can’t see my own hands… Not yet.', { face: 'worried' }]]);
  });

  // ---- sounds: a low wind, dripping, a foghorn now and then; the canal and the harbour
  G.audio.mix(fogged ? 'fog' : after ? 'morning' : 'quiet');
  let horn = 6,
    drip = 1;
  z.updaters.push((dt) => {
    if (after) return;
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
  z.stepFx = after ? '#d6c6a4' : '#d9dde3'; // the fog, stirred up (dust, once it has lifted)
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
  z.start = () => (story ? runStory(z) : district(z));
  if (!story) refreshObjective3();
  return z;
}
