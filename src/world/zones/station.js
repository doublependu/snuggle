// Prologue, part 2: Lantern Bay station platform, the harbour plaza and the hill path to the Academy.
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { G } from '../../game.js';
import { Zone } from '../zone.js';
import { prologueStation } from '../../story/prologue.js';
import { talk } from '../../story/helpers.js';

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
  await z.populateNPCs();
  // lantern glows along the platform and the hill path
  for (const m of z.markersBy('PLACE_lamp_post')) {
    const off = new Vector3(0.45, 2.15, 0).applyQuaternion(m.quaternion);
    G.fx.glows.add(m.position.clone().add(off), '#ff9a5a', 1.3);
  }
  // Tangtang's hand-painted welcome sign
  const sign = z.marker('POINT_sign');
  if (sign) z.group.add(welcomeSign(sign.position, sign.facing));
  // townsfolk chatter
  const lines = {
    vendor: ['Hot soy milk! Warm your hands, dear.', 'The Academy? Straight up the hill, past the lanterns.'],
    fisher: ["Lanterns over the water are lovely tonight. Well… most of them.", "Grumblings? Harmless fluff. Mostly."],
    kid: ['Is that a real Charm Sprite? Can I pet it?', 'Mistbloom students are SO cool.'],
  };
  for (const [id, l] of Object.entries(lines)) {
    const n = G.npcs.get(id);
    if (!n) continue;
    let i = 0;
    n.onTalk = () => {
      talk([[id === 'kid' ? 'student' : 'passenger', l[i++ % l.length]]]);
      if (!G.save.story['kind_' + id] && i === 1) {
        G.save.story['kind_' + id] = true;
        G.collection.cozy(4, 'Friendly chat', n.position.clone().setY(n.position.y + 1.6));
      }
    };
  }
  z.onTrigger('TRIGGER_academy', () => {
    if (!G.save.story.prologueDone) return G.ui.toast('Talk to the girl with the sign on the platform first.', 3);
    G.goto('academy', 'SPAWN_gate');
  });
  G.audio.bed('water', 0.8);
  G.audio.bed('birds', 1);
  G.audio.bed('pad', 1);
  z.onExit = () => ['water', 'rain', 'birds'].forEach((b) => G.audio.bed(b, 0));
  z.killY = -6;
  z.start = () => prologueStation(z);
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
