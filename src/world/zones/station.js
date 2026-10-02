// SPDX-License-Identifier: GPL-3.0-only
// Prologue, part 2: Lantern Bay station platform, the harbour plaza and the hill path to the Academy.
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { G, flag } from '../../game.js';
import { Zone } from '../zone.js';
import { Rain } from '../../render/vfx.js';
import { addForest } from '../../procgen/forest.js';
import { addFlowers } from '../../procgen/flowers.js';
import { addSigns } from '../signs.js';
import { Routes, startGuide, signsFor } from '../../systems/wayfinder.js';
import { prologueStation } from '../../story/prologue.js';
import { talk, runStory } from '../../story/helpers.js';

// The way from the platform up the hill, for the guide and the fingerposts (systems/wayfinder.js): [x, z, y?].
const NODES = { plat: [-6, -1.3, 0.9], p1: [8, -3.2, 0.9], p2: [16.6, -3.7], pz: [18.5, -13.5], plaza: [30, -17], h1: [24, -32], h2: [36, -46], h3: [28, -60], h4: [30, -70] };
const EDGES = ['plat p1 p2 pz plaza h1 h2 h3 h4'];
const PLACES = [['Mistbloom Academy', '🏮', 27.2, -68.6, 0]];
const FINGERS = [[17.6, -5.8, ['Mistbloom Academy']], [27.6, -15.6, ['Mistbloom Academy']], [22.2, -31.2, ['Mistbloom Academy']], [37.9, -46.4, ['Mistbloom Academy']], [26.1, -60.4, ['Mistbloom Academy']]];

export async function create() {
  const z = new Zone('station');
  z.next = ['academy', 'fang', 'weibao', 'folk_b'];
  await z.addGLB('station');
  await z.placeKit('kit');
  z.setupEnvironment({
    skyTop: '#7fa3c4', horizon: '#dfe8ea', ground: '#9fb59a', fog: '#d4dfe2', fogNear: 45, fogFar: 230,
    hemiSky: '#dbe9ff', hemiGround: '#a8906c', hemi: 2.0, sunColor: '#ffe9cf', sunI: 2.4, sun: new Vector3(-0.35, 0.55, 0.75),
    clouds: 11, cloudShade: '#b9c4d2', skyline: { from: -2.3, to: -0.9 },
  });
  z.addWater({ deep: '#2b5f66', shallow: '#4f8f8c' });
  z.collision.build();
  z.scatter(3, [{ x: 30, z: -60, r: 4 }]);
  // the play area (the inside faces of the invisible walls; the sea to the south), and the woods beyond it:
  // the railway runs on through them both ways, and so does the path behind the Academy's gate
  z.edge = { minX: -23.8, maxX: 42.8, minZ: -75.8, maxZ: 4.5 };
  addForest(z, {
    rect: z.edge, kinds: ['tree', 'maple'], far: ['tree', 'pine'], seed: 3, minY: -0.3, lines: { z: [0.2, 4.3, 4.7, 6.5] },
    clear: [{ x0: -400, z0: 2.2, x1: 400, z1: 2.2, r: 4.2 }, { x0: 30, z0: -70, x1: 30, z1: -220, r: 3 }],
  });
  addFlowers(z, { rect: z.edge, count: 420, seed: 3 });
  const routes = new Routes(z, NODES, EDGES);
  addSigns(z, [
    ...signsFor(z, routes, PLACES, FINGERS),
    // the station's own board, over the building's door (it used to be blank)
    { kind: 'board', text: 'Lantern Bay', icon: '🚉', at: new Vector3(-4, 4.2, -8.82), facing: 0, w: 3, place: true, range: 13, greet: true },
  ]);
  startGuide(z, routes);
  await z.populateNPCs(undefined, { essential: ['tangtang'] });
  // lantern glows along the platform and the hill path
  for (const m of z.markersBy('PLACE_lamp_post')) {
    const off = new Vector3(0.45, 2.15, 0).applyQuaternion(m.quaternion);
    G.fx.glows.add(m.position.clone().add(off), '#ff9a5a', 1.3);
  }
  // Sunny's hand-painted welcome sign
  const sign = z.marker('POINT_sign');
  if (sign) z.group.add(welcomeSign(sign.position, sign.facing));
  // townsfolk chatter
  const lines = {
    vendor: ['Hot soy milk! Warm your hands, dear.', 'The Academy? Straight up the hill, past the lanterns.'],
    fisher: ["Lanterns over the water are lovely tonight. Well… most of them.", "Grumblings? Harmless fluff. Mostly."],
    kid: ['Is that a real Charm Sprite? Can I pet it?', 'Mistbloom students are SO cool.'],
  };
  for (const [id, l] of Object.entries(lines)) z.whenNPC(id, (n) => {
    let i = 0;
    n.onTalk = () => {
      talk([[id === 'kid' ? 'student' : 'passenger', l[i++ % l.length]]]);
      if (!G.save.story['kind_' + id] && i === 1) {
        G.save.story['kind_' + id] = true;
        G.collection.cozy(4, 'Friendly chat', n.position.clone().setY(n.position.y + 1.6));
      }
    };
  });
  z.todo = () => [['💬 Friendly chats', ['vendor', 'fisher', 'kid'].filter((id) => G.save.story['kind_' + id]).length, 3]];
  z.onTrigger('TRIGGER_academy', () => {
    if (!G.save.story.prologueDone) return G.ui.toast('Talk to the girl with the sign on the platform first.', 3);
    G.goto('academy', 'SPAWN_gate');
  });
  z.stepFx = '#d2c3a6';
  G.audio.mix('station');
  // the first arrival: the train's rain has softened to a drizzle, which clears while Sunny says hello
  // (story/prologue.js starts its sound and calls z.clearUp)
  if (!flag('prologueDone')) {
    const rain = new Rain({ count: Math.round(260 * G.quality.tier.particles) + 60, size: new Vector3(26, 10, 26), speed: 9, length: 0.3, opacity: 0.22 });
    z.group.add(rain.mesh);
    let fade = 0; // seconds left of the clearing-up (0: still drizzling)
    const total = 14;
    z.updaters.push((dt) => {
      rain.center.copy(G.camera.position).setY(G.camera.position.y + 2);
      if (!fade) return;
      fade = Math.max(0.001, fade - dt);
      rain.mat.uniforms.opacity.value = 0.22 * (fade / total);
      if (fade <= 0.001) rain.mesh.visible = false;
    });
    z.clearUp = () => {
      if (fade) return;
      fade = total;
      G.audio.bed('rain', 0, total);
    };
  }
  z.killY = -6;
  z.start = () => {
    prologueStation(z);
    runStory(z);
  };
  return z;
}

function welcomeSign(pos, facing) {
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
  x.fillText('NEW STUDENT', 128, 78);
  x.font = 'italic 20px system-ui, sans-serif';
  x.fillStyle = '#e0662c';
  x.fillText('(probably)', 128, 108);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const m = new Mesh(new PlaneGeometry(0.9, 0.45), new MeshBasicMaterial({ map: t }));
  m.position.copy(pos).setY(pos.y + 1.2);
  m.rotation.y = facing;
  const pole = new Mesh(new PlaneGeometry(0.05, 1.2), new MeshBasicMaterial({ color: 0x6b4a30, side: 2 }));
  pole.position.set(0, -0.6, -0.01);
  m.add(pole);
  return m;
}
