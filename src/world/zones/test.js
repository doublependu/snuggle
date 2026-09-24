// Greybox test zone (?zone=test): ramps, steps and boxes for tuning movement, plus one of each Grumbling.
import { BoxGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { G } from '../../game.js';
import { Zone } from '../zone.js';
import { materialFor } from '../../render/materials.js';
import { Grumbling } from '../../actors/grumbling.js';
import { NPC } from '../../actors/npc.js';

export async function create() {
  const z = new Zone('test');
  z.setupEnvironment({});
  const ground = new Mesh(new PlaneGeometry(80, 80).rotateX(-Math.PI / 2), materialFor('cloth', { color: 0x9dbb7a, vertexColors: false }));
  ground.receiveShadow = true;
  z.group.add(ground);
  const box = (x, y, z_, w, h, d, color = 0xd9c7a8, ry = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), materialFor('plain', { color, vertexColors: false }));
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
  z.start = () => G.ui.setObjective('Greybox test zone');
  G.save.tarts = Math.max(G.save.tarts, 3); // dev zone: tarts to test assists
  return z;
}
