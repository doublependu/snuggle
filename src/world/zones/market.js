// SPDX-License-Identifier: GPL-3.0-only
// Chapter 2 zone: the Lantern Bay night market on the harbour promenade. Lit by its lanterns (the lamp
// map, render/lamps.js), with three Wistful Sparrow flocks (systems/perch.js), chestnut roasting and
// floating lanterns (systems/chestnuts.js, systems/lanterns.js), lost children to guide home
// (systems/guide.js), a street musician, and across the water the Quiet District, whose lights go out.
import { Vector3 } from 'three';
import { G, flag } from '../../game.js';
import { Zone } from '../zone.js';
import { Perch } from '../../systems/perch.js';
import { CreatureBatch } from '../../actors/creatures.js';
import { setupChestnuts } from '../../systems/chestnuts.js';
import { setupLanterns } from '../../systems/lanterns.js';
import { setupGuide } from '../../systems/guide.js';
import { chapter2, refreshObjective2 } from '../../story/chapter2.js';
import { talk } from '../../story/helpers.js';

export const NIGHT_MARKET = {
  skyTop: '#0a1230', horizon: '#33295a', ground: '#141826', fog: '#1d1f40', fogNear: 35, fogFar: 190,
  hemiSky: '#6272b8', hemiGround: '#3a2a34', hemi: 0.85, sunColor: '#b8c4ff', sunI: 0.5, sun: new Vector3(-0.35, 0.42, 0.84),
  skySun: '#e6ecff', clouds: 0, peaks: true, peakColor: '#161b33',
  stars: 650, moon: true, shadows: false,
};

// glTF-space rectangle the lamp map covers (the promenade, the stalls and the pier)
const LAMP_RECT = { minX: -47, minZ: -21, maxX: 47, maxZ: 27 };

export async function create() {
  const z = new Zone('market');
  z.next = ['academy', 'kit', 'fang', 'folk_kid', 'folk_a', 'folk_b', 'folk_c'];
  await Promise.all([z.addGLB('market'), z.placeKit('market_kit')]);
  z.setupEnvironment(NIGHT_MARKET);
  z.addWater({ deep: '#0a1a2a', shallow: '#15303d' });
  z.collision.build();

  // ---- lanterns: every LIGHT_ marker lights the lamp map and gets a glow
  const lamps = z.lamps(LAMP_RECT, [], { texel: 0.4, floorY: 0, top: 3.4 });
  for (const m of z.markersBy('LIGHT_')) if (m.data.glow > 0) G.fx.glows.add(m.position, m.data.color || '#ffb45c', m.data.glow);
  z.lampCount = lamps.length;
  // the Quiet District's lanterns across the bay (they go out at the end of the chapter)
  z.far = z.markersBy('POINT_far_').map((m, i) => ({ pos: m.position, i: G.fx.glows.add(m.position, i % 3 ? '#ffa04a' : '#ffc870', flag('ch2Done') ? 0 : 3.2 + (i % 4) * 0.6) }));

  // ---- the cast: Tangtang and Wei Bao come along; vendors, the musician and the children stream in
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
  z.whenNPC('musician', (n) => {
    n.h.overlayPlay('stir', 0.3, 3); // bowing the erhu
    n.noLook = true;
    n.opts.overlay = 'stir'; // back to playing after a chat
    let notes = 0;
    z.updaters.push((dt) => {
      notes -= dt;
      if (notes < 0) {
        notes = 1.4 + Math.random();
        G.ui.floaty(n.position.clone().setY(n.position.y + 1.6), Math.random() < 0.5 ? '♪' : '♫');
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

  // ---- back up the hill
  z.onTrigger('TRIGGER_academy', () => {
    if (!flag('ch2_start')) return;
    G.goto('academy', 'SPAWN_gate');
  });
  G.audio.bed('water', 0.6);
  G.audio.bed('crowd', 1);
  G.audio.bed('insects', 1);
  G.audio.bed('pad', 0);
  z.onExit = () => ['water', 'crowd', 'insects', 'musician', 'sizzle', 'wind'].forEach((b) => G.audio.bed(b, 0));
  z.killY = -5;
  z.safeMinY = -0.3;
  // fell off the pier or the sea wall: a splash, and back to dry land
  z.updaters.push(() => {
    const p = G.player;
    if (p.position.y < -0.6 && p.state === 'move') {
      G.fx.sparkles.emit(p.position.clone().setY(-0.5), 24, '#bfe3ff', { speed: 1.8, up: 2, size: 0.12 });
      G.audio.play('drip');
      G.ui.floaty(p.position.clone().setY(0.4), 'Splash!');
      p.teleport(p.safe);
    }
  });
  z.start = () => chapter2(z);
  refreshObjective2();
  return z;
}
