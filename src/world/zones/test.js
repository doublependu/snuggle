// SPDX-License-Identifier: GPL-3.0-only
// Greybox test zone (?zone=test): ramps, steps and boxes for tuning movement, plus one of each Grumbling.
// ?zone=test&night: the greybox under lantern light. ?zone=test&quiet: the Quiet District's grey-out, height
// fog and fog wall, grey Grumblings to keep company, and a Charm Sprite memory (Chapter 3). ?zone=test&fog:
// Chapter 4's pieces: the deep fog, the Great Sulk's sighs (from the south, +z), a warm spot, Bean awake
// with his circle of colour, two loose ends to stitch, and a sleeper.
import { BoxGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { G } from '../../game.js';
import { Zone } from '../zone.js';
import { materialFor, setGreyOut } from '../../render/materials.js';
import { Grumbling } from '../../actors/grumbling.js';
import { NPC } from '../../actors/npc.js';
import { CreatureBatch } from '../../actors/creatures.js';
import { Greys } from '../../systems/greys.js';
import { Memories } from '../../systems/memories.js';
import { FOG_ENV, FOG_LOOK, usePockets } from '../../systems/fog.js';
import { Sighs } from '../../systems/sigh.js';
import { Bean } from '../../systems/bean.js';
import { Stitch } from '../../systems/stitch.js';

export async function create() {
  const z = new Zone('test');
  const qs = new URLSearchParams(location.search);
  const night = qs.has('night');
  const quiet = qs.has('quiet');
  const fog = qs.has('fog');
  const fade = quiet || fog ? { fade: 1 } : {};
  z.setupEnvironment(night ? NIGHT : quiet ? QUIET_TEST : fog ? FOG_ENV : {});
  const ground = new Mesh(new PlaneGeometry(80, 80).rotateX(-Math.PI / 2), materialFor('cloth', { color: 0x9dbb7a, vertexColors: false, ...fade }));
  ground.receiveShadow = true;
  z.group.add(ground);
  const box = (x, y, z_, w, h, d, color = 0xd9c7a8, ry = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), materialFor('plain', { color, vertexColors: false, ...fade }));
    m.position.set(x, y + h / 2, z_);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    z.group.add(m);
    m.updateMatrixWorld();
    z.collision.addMesh(m);
    return m;
  };
  ground.updateMatrixWorld();
  z.collision.addMesh(ground);
  for (let i = 0; i < 6; i++) box(-6, 0, 2 + i * 0.5, 2, 0.15 * (i + 1), 0.5, 0xc9b28c);
  const ramp = box(6, 0, 4, 2, 0.2, 6, 0xb8c9d9);
  ramp.rotation.x = -0.25;
  ramp.position.y = 0.8;
  ramp.updateMatrixWorld();
  z.collision.parts.pop();
  z.collision.addMesh(ramp);
  box(0, 0, -8, 10, 2.5, 0.5, 0xe8dcc8);
  box(3, 0, 10, 1, 1, 1, 0xe0662c, 0.4);
  box(-3, 0, 12, 3, 0.6, 3, 0xe2a13a);
  z.collision.build();
  z.markers.set('SPAWN_start', { position: new Vector3(0, 0, 0), facing: 0 });
  z.addGrumbling(new Grumbling('cloud', new Vector3(0, 0, 6)));
  z.addGrumbling(new Grumbling('homework', new Vector3(-8, 0, 12)));
  z.addGrumbling(new Grumbling('sock', new Vector3(8, 0, 12), { spots: [new Vector3(8, 0, 12), new Vector3(11, 0, 15), new Vector3(6, 0, 17), new Vector3(10, 0, 9)] }));
  z.addGrumbling(new Grumbling('pompom', new Vector3(0, 0, 16), { company: new Vector3(0, 0, 0) }));
  const cast = ['tangtang', 'weibao', 'fang', 'folk_a', 'folk_b', 'folk_c'];
  const npcs = await Promise.all(cast.map((m, i) => NPC.create(m, m, new Vector3(-3.75 + i * 1.5, 0, -3), 0, { look: false })));
  npcs.forEach((n) => z.addNPC(n));
  if (night) {
    // a ring of lanterns to tune the night lighting (?zone=test&night)
    const lamps = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      lamps.push({ position: new Vector3(Math.cos(a) * 9, 2.4, Math.sin(a) * 9 + 4), color: i % 3 ? '#ffb45c' : '#ff7a4a', radius: 6, intensity: 1.2 });
    }
    lamps.push({ position: new Vector3(0, 2.4, -2), color: '#ffc46b', radius: 5, intensity: 1.4 });
    z.lamps({ minX: -40, minZ: -40, maxX: 40, maxZ: 40 }, lamps);
    for (const l of lamps) G.fx.glows.add(l.position, l.color, 1.2);
  }
  if (quiet) await quietTest(z);
  if (fog) fogTest(z);
  const start = z.start;
  z.start = () => {
    G.ui.setObjective(night ? 'Greybox test zone (night)' : quiet ? 'Greybox test zone (the Quiet District)' : fog ? 'Greybox test zone (the fog)' : 'Greybox test zone');
    start?.();
  };
  G.save.tarts = Math.max(G.save.tarts, 3); // dev zone: tarts to test assists
  return z;
}

// Night palette shared with the market (world/zones/market.js keeps its own copy tuned to the harbour).
export const NIGHT = {
  skyTop: '#0c1430', horizon: '#2b2d58', ground: '#15192a', fog: '#1b2142', fogNear: 18, fogFar: 110,
  hemiSky: '#5a6aa8', hemiGround: '#2c2436', hemi: 1.0, sunColor: '#aebcff', sunI: 0.45, sun: new Vector3(-0.3, 0.55, -0.6),
  skySun: '#dfe6ff', clouds: 0, peaks: false, stars: 500, moon: true, shadows: false,
};

const QUIET_TEST = {
  skyTop: '#8f98a8', horizon: '#c6c9ce', ground: '#8a8d90', fog: '#b3b8c0', fogNear: 14, fogFar: 90,
  hemiSky: '#d6dbe4', hemiGround: '#8a8478', hemi: 1.5, sunColor: '#e8e4dc', sunI: 1.1, clouds: 16, cloudColor: '#d4d7dc', cloudShade: '#a3a8b0', peaks: false,
  shadows: false,
};

// The Quiet District's pieces on the greybox: four grey Grumblings, one memory spot (the teahouse's, with
// the Pom-pom's Cheer), a fog wall to the north (+z), and the grey-out with a pocket once it's remembered.
async function quietTest(z) {
  setGreyOut({ fade: 0.82, tint: '#e6e9ef', fog: { top: 1.0, falloff: 1.6, strength: 0.5 }, wall: { dir: new Vector3(0, 0, 1), start: 24, length: 10 } });
  const heart = new Vector3(0, 0, 30);
  const greys = [[-5, 7], [5, 6], [9, 16], [-9, 18]].map(([x, zz], i) =>
    z.addGrumbling(new Grumbling('grey', new Vector3(x, 0, zz), { id: 'grey_' + i, heart, echo: ['I WAS A BIRTHDAY NOBODY REMEMBERED. HONK.', 'I WAS A LETTER NOBODY ANSWERED. HONK.', 'I WAS “I’M FINE, REALLY.” HONK.', 'I WAS A FRIEND WHO MOVED AWAY. HONK.'][i] })));
  const batch = new CreatureBatch('grey', 8, { tint: true });
  for (const g of greys) batch.add(g.obj);
  z.group.add(...batch.parts);
  G.updaters.add(() => batch.update());
  z.greys = new Greys(z, greys);
  z.markers.set('POINT_mem_teahouse', { name: 'POINT_mem_teahouse', position: new Vector3(-4, 0, -4), facing: 0, data: { radius: 6 } });
  z.markers.set('CAM_mem_teahouse', { name: 'CAM_mem_teahouse', position: new Vector3(-0.5, 2.4, 1.5), facing: 0, data: {} });
  z.memories = new Memories(z, {
    teahouse: {
      sprite: 'pompom',
      clue: 'An empty mahjong table. One chair is pushed right in, as if nobody ever sat there.',
      lines: [
        ['Old friend', 'Your turn, Lau! You always take so long.'],
        ['Old friend', '…Lau? Has anyone seen Lau this week?'],
        [null, 'Every year, one more chair was pushed in. After a while, nobody came at all.'],
      ],
      figures: [{ model: 'folk_a', x: -0.9, z: 0.4, rot: 90, anim: 'sit' }, { model: 'folk_c', x: 0.9, z: 0.4, rot: -90, anim: 'talk' }],
    },
  });
  for (const g of greys) g.opts.helped = () => z.memories.near(g.position);
}

// Chapter 4's pieces on the greybox. The sighs come from the south (+z); the long wall at z = -8 is shelter
// (stand north of it), the lamp at (-9, 4) is a warm spot.
function fogTest(z) {
  setGreyOut(FOG_LOOK);
  const pockets = usePockets(z);
  z.sighs = new Sighs(z, { source: new Vector3(0, 0, 60), period: 14, first: 8, home: new Vector3(0, 0, 0) });
  const lamp = new Vector3(-9, 0, 4);
  z.sighs.warm.push({ position: lamp, radius: 3 });
  pockets.push({ position: lamp, radius: 4 });
  G.fx.glows.add(lamp.clone().setY(1.6), '#ffb45c', 1.6);
  const bean = new Bean(z);
  z.stitch = new Stitch(z, { sighs: z.sighs });
  z.stitch.add({ id: 'test_bell', icon: '🔔', what: 'the door', from: new Vector3(4, 0, 2), to: new Vector3(-4, 0, -5), free: true });
  z.stitch.add({ id: 'test_letter', icon: '✉️', what: 'the letterbox', from: new Vector3(-6, 0, 8), to: new Vector3(6, 0, 16) });
  const sleeper = z.addGrumbling(new Grumbling('grey', new Vector3(9, 0, -3), { id: 'sleeper', asleep: true, wander: 0 }));
  z.greys = new Greys(z, [sleeper]);
  z.on('grey-woke', () => z.sighs.send(12, Math.max(3, z.sighs.distance(G.player.position) - 14)));
  z.start = () => bean.climbOut();
}
