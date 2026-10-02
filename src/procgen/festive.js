// SPDX-License-Identifier: GPL-3.0-only
// What the morning after leaves standing (the Epilogue, and ever after), made in code:
//   bunting for Sunny's week-long party: strings of paper flags between the Academy's pavilion, its lamp
//   posts and the big courtyard tree (one mesh, one draw call)
//   the breakfast table the neighbours carried out into the Quiet District's lane
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { G } from '../game.js';
import { materialFor } from '../render/materials.js';

const FLAGS = ['#e0662c', '#f6c56a', '#2f8a8f', '#f3e6d3', '#e2a13a', '#b5483a'];
const STRING = '#5a3d2a';

// spans: [[from, to, sag], ...] (Vector3s; sag: metres the middle hangs below the ends)
export function buntingMesh(spans) {
  const pos = [],
    col = [],
    nor = [];
  const c = new Color(),
    p0 = new Vector3(),
    p1 = new Vector3(),
    n = new Vector3();
  const put = (pts, colour) => {
    c.set(colour);
    for (const p of pts) {
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
      nor.push(n.x, 0.25, n.z);
    }
  };
  let k = 0;
  for (const [a, b, sag = 0.5] of spans) {
    const count = Math.max(2, Math.round(a.distanceTo(b) / 0.42));
    n.subVectors(b, a).setY(0).normalize().set(-n.z, 0, n.x);
    const at = (t, out) => {
      out.lerpVectors(a, b, t);
      out.y -= Math.sin(t * Math.PI) * sag;
      return out;
    };
    for (let i = 0; i < count; i++) {
      at(i / count, p0);
      at((i + 1) / count, p1);
      const lo0 = p0.clone().setY(p0.y - 0.025),
        lo1 = p1.clone().setY(p1.y - 0.025);
      put([p0, p1, lo1, p0, lo1, lo0], STRING); // the string
      const f0 = p0.clone().lerp(p1, 0.08),
        f1 = p0.clone().lerp(p1, 0.92),
        tip = p0.clone().lerp(p1, 0.5);
      f0.y -= 0.02;
      f1.y -= 0.02;
      tip.y -= 0.44;
      put([f0, f1, tip], FLAGS[k++ % FLAGS.length]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  const m = new Mesh(g, materialFor('paper', { side: 'double' }));
  m.name = 'bunting';
  m.castShadow = false;
  return m;
}

// The Academy's: from the pavilion's eaves to the lamp posts, from those to the big courtyard tree, and over
// the gate.
export function bunting(z) {
  const V = (x, y, zz) => new Vector3(x, y, zz);
  const tree = z.marker('POINT_bigtree').position.clone().setY(4.3);
  const lamp = (x, zz) => V(x, 2.55, zz);
  return buntingMesh([
    [V(-2.7, 3.0, -12.5), lamp(-12, -5), 0.5],
    [V(2.7, 3.0, -12.5), lamp(12, -5), 0.5],
    [lamp(-12, -5), tree, 0.35],
    [tree, lamp(-12, 18), 0.7],
    [tree, lamp(12, -5), 0.9],
    [lamp(12, 18), V(22, 2.55, 34), 0.5],
  ]);
}

export const TABLE = { x: -1.5, z: 16.4, len: 4.6 }; // the breakfast table, out in the lane by the noodle shop

// The long table carried out into the lane: boards on trestles, benches, a bowl at every place, and one pot
// (made in code: a dozen boxes and cylinders in one of each material).
export function breakfastTable(z) {
  const g = new Group();
  const wood = materialFor('wood', { color: '#a9744a', vertexColors: false, key: 'bf-wood' }),
    dark = materialFor('wood', { color: '#6b4430', vertexColors: false, key: 'bf-dark' }),
    bowl = materialFor('stone', { color: '#f2ede2', vertexColors: false, key: 'bf-bowl' }),
    pot = materialFor('stone', { color: '#3a3632', vertexColors: false, key: 'bf-pot' }),
    cloth = materialFor('cloth', { color: '#e0662c', vertexColors: false, key: 'bf-cloth' });
  const add = (geo, mat, x, y, zz) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, zz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const L = TABLE.len;
  add(new BoxGeometry(1.0, 0.08, L), wood, 0, 0.74, 0);
  add(new BoxGeometry(0.34, 0.012, L * 0.9), cloth, 0, 0.787, 0); // a runner down the middle
  for (const s of [-1, 1]) {
    add(new BoxGeometry(0.8, 0.7, 0.1), dark, 0, 0.35, s * (L / 2 - 0.4));
    add(new BoxGeometry(0.32, 0.06, L - 0.3), wood, s * 0.82, 0.42, 0);
    for (const e of [-1, 1]) add(new BoxGeometry(0.26, 0.4, 0.08), dark, s * 0.82, 0.2, e * (L / 2 - 0.5));
  }
  const bowlGeo = new CylinderGeometry(0.13, 0.08, 0.09, 8);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(bowlGeo, bowl, s * 0.3, 0.835, -L / 2 + 0.75 + i * ((L - 1.5) / 3));
  add(new CylinderGeometry(0.3, 0.26, 0.34, 10), pot, 0, 0.96, 0.2);
  add(new CylinderGeometry(0.27, 0.27, 0.02, 10), materialFor('plain', { color: '#e8c88a', vertexColors: false, key: 'bf-soup' }), 0, 1.11, 0.2);
  g.position.set(TABLE.x, 0, TABLE.z);
  z.group.add(g);
  z.collision.addBox(new Vector3(TABLE.x, 0.4, TABLE.z), new Vector3(1.0, 0.8, L));
  for (const s of [-1, 1]) z.collision.addBox(new Vector3(TABLE.x + s * 0.82, 0.22, TABLE.z), new Vector3(0.32, 0.44, L - 0.3));
  z.collision.build();
  // steam off the pot
  const steam = new Vector3(TABLE.x, 1.2, TABLE.z + 0.2);
  let t = 0;
  z.updaters.push((dt) => {
    if ((t -= dt) > 0 || steam.distanceTo(G.player.position) > 30) return;
    t = 0.3;
    G.fx.sparkles.emit(steam, 1, '#f2f6fa', { speed: 0.12, up: 0.5, size: 0.3, life: 2, spread: 0.2 });
  });
  return g;
}

// A seat at the table: i along it (0..3), side -1 (west bench, facing east) or 1.
export const seatAt = (i, side) => ({
  front: new Vector3(TABLE.x + side * 0.66, 0, TABLE.z - TABLE.len / 2 + 0.75 + i * ((TABLE.len - 1.5) / 3)),
  facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
});

