// SPDX-License-Identifier: GPL-3.0-only
// Chapter 2 zone: the Lantern Bay night market on the harbour promenade. Lit by its lanterns (the lamp
// map, render/lamps.js), with three Wistful Sparrow flocks (systems/perch.js), chestnut roasting and
// floating lanterns (systems/chestnuts.js, systems/lanterns.js), lost children to guide home
// (systems/guide.js), a street musician, and across the water the Quiet District, whose lights go out.
import { Quaternion, Vector3 } from 'three';
import { loadGLB } from '../../core/assets.js';
import { stylize } from '../../render/materials.js';
import { G, flag } from '../../game.js';
import { Zone } from '../zone.js';
import { Perch } from '../../systems/perch.js';
import { CreatureBatch } from '../../actors/creatures.js';
import { setupChestnuts } from '../../systems/chestnuts.js';
import { setupLanterns } from '../../systems/lanterns.js';
import { setupGuide } from '../../systems/guide.js';
import { chapter2, refreshObjective2 } from '../../story/chapter2.js';
import { talk } from '../../story/helpers.js';
import { addSigns } from '../signs.js';
import { Routes, startGuide, signsFor } from '../../systems/wayfinder.js';

export const NIGHT_MARKET = {
  skyTop: '#0a1230', horizon: '#33295a', ground: '#141826', fog: '#1d1f40', fogNear: 35, fogFar: 190,
  hemiSky: '#6272b8', hemiGround: '#3a2a34', hemi: 0.85, sunColor: '#b8c4ff', sunI: 0.5, sun: new Vector3(-0.35, 0.42, 0.84),
  skySun: '#e6ecff', clouds: 0, peaks: true, peakColor: '#161b33',
  stars: 650, moon: true, shadows: false,
};

// glTF-space rectangle the lamp map covers (the promenade, the stalls and the pier)
const LAMP_RECT = { minX: -47, minZ: -21, maxX: 47, maxZ: 27 };

// The walkway between the stall rows, the pier and the stairs home, for the guide and the fingerposts
// (systems/wayfinder.js): [x, z, y?].
const NODES = {
  top: [-36, -17.6], st: [-36, -10], w0: [-36, -0.8], w1: [-28, -0.8], w2: [-16, -0.8], w3: [-4, -0.8], w4: [4, -0.8], w5: [15, -0.8], w6: [26, -0.8], east: [38, -0.8],
  pier0: [26, 6], pier1: [26, 19.5],
};
const EDGES = ['top st w0 w1 w2 w3 w4 w5 w6 east', 'w6 pier0 pier1'];
const PLACES = [
  ['Stairs to the Academy', '🏮', -33.4, -9.4, Math.PI / 2], ['Lantern Pier', '🎐', 29.4, 3.4, Math.PI], ['Dumplings', '🥟', -10.5, -4.9, 0, { range: 6 }],
];
const FINGERS = [[0.8, 3.7, ['Stairs to the Academy', 'Lantern Pier']], [-24.6, -4.6, ['Dumplings', 'Lantern Pier', 'Stairs to the Academy']]];
// What each stall's board says (the kit's stalls have a blank board over the back of their awning).
const STALLS = { mstall_lantern: ['Lanterns', '🏮'], mstall_toy: ['Toys', '🎏'], mstall_tea: ['Jasmine Tea', '🍵'], mstall_sweets: ['Sweets', '🍡'], mstall_fish: ['Fish Balls', '🍢'] };

export async function create() {
  const z = new Zone('market');
  z.next = ['academy', 'kit', 'fang', 'folk_kid', 'folk_a', 'folk_b', 'folk_c'];
  // The promenade's floor used to just stop at both ends, with the sea beyond: three shopfronts from the kit
  // close each end (extra PLACE_ markers, so placeKit instances them and their collision with the rest).
  const endLamps = [];
  for (const [x, turn] of [[-46.1, Math.PI / 2], [46.1, -Math.PI / 2]])
    [2.5, -3.5, -9.5].forEach((zz, i) => {
      const name = `PLACE_facade_${(i + (x > 0 ? 1 : 0)) % 2 ? 'a' : 'b'}.9${endLamps.length}`;
      const position = new Vector3(x, 0, zz);
      z.markers.set(name, { name, position, quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn), scale: new Vector3(1, 1, 1), facing: turn, data: {}, object: null });
      endLamps.push({ position: new Vector3(x - Math.sign(x) * 0.7, 1.2, zz), color: '#ffc46b', radius: 3.5, intensity: 0.7 });
    });
  await Promise.all([z.addGLB('market'), z.placeKit('market_kit')]);
  z.setupEnvironment(NIGHT_MARKET);
  z.addWater({ deep: '#0a1a2a', shallow: '#15303d' });
  z.collision.build();

  // ---- lanterns: every LIGHT_ marker lights the lamp map and gets a glow
  const lamps = z.lamps(LAMP_RECT, endLamps, { texel: 0.4, floorY: 0, top: 3.4 });
  for (const m of z.markersBy('LIGHT_')) if (m.data.glow > 0) G.fx.glows.add(m.position, m.data.color || '#ffb45c', m.data.glow);
  z.lampCount = lamps.length;
  // the Quiet District's lanterns across the bay (they go out at the end of the chapter)
  z.far = z.markersBy('POINT_far_').map((m, i) => ({ pos: m.position, i: G.fx.glows.add(m.position, i % 3 ? '#ffa04a' : '#ffc870', flag('ch2Done') ? 0 : 3.2 + (i % 4) * 0.6) }));

  // ---- the cast: Sunny and Bo come along; vendors, the musician and the children stream in
  await z.populateNPCs(undefined, { essential: ['tangtang', 'weibao'] });
  for (const id of ['tangtang', 'weibao']) z.whenNPC(id, (n) => (n.blobRadius = 0.32));

  // ---- a little life: dumpling steam, wok smoke, the musician's tune (louder near the stage)
  const dump = z.marker('POINT_dumpling').position;
  const wok = z.marker('POINT_chestnut').position.clone().add(new Vector3(-0.25, 1.25, -2.0));
  const steam = [-0.9, 0, 0.9].map((dx) => new Vector3(dump.x + dx, dump.y + 1.45, dump.z - 1.8));
  const stage = z.marker('NPC_musician').position;
  let puff = 0;
  z.updaters.push((dt) => {
    puff -= dt;
    if (puff < 0) {
      puff = 0.16;
      G.fx.sparkles.emit(steam[(Math.random() * 3) | 0], 1, '#dfe8f2', { speed: 0.08, up: 0.35, size: 0.3, life: 1.8, spread: 0.2 });
      if (Math.random() < 0.5) G.fx.sparkles.emit(wok, 1, '#ffb070', { speed: 0.1, up: 0.5, size: 0.16, life: 1.2, spread: 0.3 });
    }
    const p = G.player.position;
    G.audio.bed('musician', Math.max(0.12, Math.min(1, 1 - (p.distanceTo(stage) - 4) / 26)));
    G.audio.bed('sizzle', Math.max(0, 1 - p.distanceTo(wok) / 7));
  });
  z.whenNPC('musician', async (n) => {
    // she plays the erhu: it rests on her lap, the bow follows her right hand, and the bowing is in time
    // with the beat (two strokes, out and back, every two beats), a ♪ at each change of stroke
    n.h.overlayPlay('erhu', 0.3, 3);
    n.noLook = true;
    n.opts.overlay = 'erhu'; // back to playing after a chat
    const kit = await loadGLB('market_kit');
    const erhu = kit.scene.getObjectByName('erhu')?.clone(true);
    const bow = kit.scene.getObjectByName('erhu_bow')?.clone(true);
    if (!erhu || !bow || z.disposed) return;
    stylize(erhu, { shadows: false });
    stylize(bow, { shadows: false });
    // on her lap, in front of her hips, leaning back a little (her own frame: +z is where she faces)
    n.h.root.updateMatrixWorld(true);
    const hips = n.h.root.worldToLocal(n.h.bones.hips.getWorldPosition(new Vector3()));
    erhu.position.set(0.07, hips.y + 0.2, hips.z + 0.17);
    erhu.rotation.set(-0.12, 0, 0);
    n.root.add(erhu);
    z.group.add(bow);
    const hand = new Vector3(),
      strings = new Vector3();
    const act = n.h.action('erhu_upper');
    let stroke = 0;
    z.updaters.push(() => {
      const b = G.audio.beat();
      if (act && n.h.overlay === act) act.time = (((b.index % 2) + b.phase) / 2) * act.getClip().duration;
      n.h.worldBone('hand_R', hand);
      erhu.updateMatrixWorld();
      strings.set(0, -0.035, -0.3);
      erhu.localToWorld(strings);
      bow.position.copy(hand);
      bow.lookAt(strings);
      const s = b.index % 2;
      if (s !== stroke) {
        stroke = s;
        if (n.h.overlay === act) G.ui.floaty(n.position.clone().setY(n.position.y + 1.5), Math.random() < 0.5 ? '♪' : '♫');
      }
    });
    n.onTalk = async () => {
      await talk([['musician', 'The best things at a night market are free, you know: the music, the smells, the lanterns on the water.']]);
      if (!flag('kind_musician')) {
        flag('kind_musician', true);
        G.collection.cozy(4, 'Listened to the music', n.position.clone().setY(n.position.y + 1.6));
      }
    };
  });
  const chat = {
    tea: ['Jasmine tea, fresh jasmine tea! Warms you right up.', 'The sparrows? They only want what they see. Poor little things.'],
    dumpling: ['Best dumplings in Lantern Bay, forty years running!', 'Your bun friend keeps sniffing my steamers. Is he… alive?'],
    sweets: ['Candied hawthorn! Crunchy on the outside, sour on the inside. Like my brother.', 'A sparrow stared at my sweets all evening. Such big eyes.'],
    fishball: ['Fish balls on a stick! Three for one lantern coin.', 'The lanterns across the bay look dim tonight, don’t they?'],
    shopper1: ['Have you tried the chestnuts? The old man lets kids stir the wok.', 'I come for the music. It’s free!'],
    shopper2: ['My daughter wants a toy from every stall. I tell her the lanterns are the best toy.'],
    shopper3: ['Tonight is the best night market of the year. Everybody’s out!'],
    shopper4: ['I love watching the floating lanterns from the pier.'],
  };
  for (const [id, lines] of Object.entries(chat)) z.whenNPC(id, (n) => {
    let i = 0;
    n.onTalk = () => talk([['passenger', lines[i++ % lines.length]]]);
  });

  // ---- the three Wistful Sparrow flocks and their seats (story/chapter2.js enables them in turn)
  const flocks = [1, 2, 3].map((id) => ({
    id,
    seat: z.marker('SEAT_flock' + id),
    goods: z.markersBy(`GOOD_${id}_`).map((m) => ({ kind: m.data.kind, position: m.position })),
    sparrows: [],
    enabled: false,
  }));
  for (const m of z.markersBy('GRUMB_sparrow_')) {
    const f = flocks[(m.data.flock || 1) - 1];
    const g = z.grumblingAt(m.name, { enabled: false, bounds: z.box('AREA_flock' + f.id) });
    if (g) f.sparrows.push(g);
    else f.soothedBefore = (f.soothedBefore || 0) + 1;
  }
  for (const f of flocks) f.done = f.sparrows.length === 0;
  z.flocks = flocks;
  // twelve sparrows x four parts would be 48 draw calls: batch them into four
  const batch = new CreatureBatch('sparrow', 12);
  for (const f of flocks) for (const g of f.sparrows) batch.add(g.obj);
  z.group.add(...batch.parts);
  G.updaters.add(() => batch.update());
  z.perch = new Perch(z, flocks);
  z.enableFlock = (id) => {
    const f = flocks[id - 1];
    f.enabled = true;
    for (const g of f.sparrows) g.enable(true);
  };

  // ---- side content
  setupChestnuts(z);
  setupLanterns(z);
  setupGuide(z);

  // ---- signs and the guide
  const routes = new Routes(z, NODES, EDGES);
  const boards = [];
  for (const m of z.markersBy('PLACE_mstall_')) {
    const stall = STALLS[m.name.slice(6).replace(/[._]?\d+$/, '')];
    if (stall) boards.push({ kind: 'board', text: stall[0], icon: stall[1], at: new Vector3(0, 2.75, -0.77).applyQuaternion(m.quaternion).add(m.position), facing: m.facing, w: 1.44 });
  }
  addSigns(z, [
    ...signsFor(z, routes, PLACES, FINGERS),
    ...boards,
    // lit over the stairs home (the arch's plaque used to be blank, and the stairs are out of sight from the harbour wall)
    { kind: 'board', text: 'Mistbloom Academy', icon: '⬆', at: new Vector3(-36, 3.0, -10.41), facing: 0, w: 1.36 },
  ]);
  startGuide(z, routes);

  // the pause menu's "Things to do here"
  z.todo = () => [
    ['👧 Lost little ones brought home', [1, 2, 3].filter((n) => flag(`kid${n}Home`)).length, 3],
    ['🏮 Lanterns floated', Math.min(1, G.save.story.lanternsFloated || 0), 1],
    ['🌰 Chestnuts roasted', flag('chestnutDone') ? 1 : 0, 1],
    ['🎻 Listened to the music', flag('kind_musician') ? 1 : 0, 1],
  ];

  // ---- back up the hill
  z.onTrigger('TRIGGER_academy', () => {
    if (!flag('ch2_start')) return;
    G.goto('academy', 'SPAWN_gate');
  });
  G.audio.mix('market');
  const perchExit = z.onExit; // the perch system's own cleanup (its chips and keys)
  z.onExit = () => {
    perchExit?.();
    ['musician', 'sizzle'].forEach((b) => G.audio.bed(b, 0));
  };
  z.killY = -5;
  z.stepFx = '#8e95ad'; // a cool puff on the night-time flagstones
  z.safeMinY = -0.3;
  // fell off the pier or the sea wall: a splash, and back to dry land
  z.updaters.push(() => {
    const p = G.player;
    if (p.position.y < -0.6 && p.state === 'move') {
      G.fx.sparkles.emit(p.position.clone().setY(-0.5), 24, '#bfe3ff', { speed: 1.8, up: 2, size: 0.12 });
      G.audio.play('drip');
      G.ui.floaty(p.position.clone().setY(0.4), 'Splash!');
      p.teleport(p.safe);
      G.events.emit('splash');
    }
  });
  z.start = () => chapter2(z);
  refreshObjective2();
  return z;
}
