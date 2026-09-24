// Small procedural props: lily pads and lotus flowers, thirsty lotus buds (Umbrella puzzle),
// lemon candies (collectibles), wooden note signs and cozy bits. All vertex-coloured, no textures.
import {
  BufferAttribute, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, Quaternion,
  SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { materialFor } from '../render/materials.js';
import { mulberry } from '../render/sky.js';

function tint(geo, color, jitter = 0.06, rnd = Math.random) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const c = new Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd() - 0.5) * 2 * jitter;
    for (let j = 0; j < 3; j++) col.set([c.r * k, c.g * k, c.b * k], (i + j) * 3);
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

// A lily pad: a flat disc with a notch.
export function padGeometry(r = 0.7) {
  const g = new CylinderGeometry(r, r, 0.04, 12, 1, false, 0.35, Math.PI * 2 - 0.7);
  return tint(g, '#5d8f4e', 0.1);
}

function lotusGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const p = new ConeGeometry(0.09, 0.26, 4);
    p.translate(0, 0.13, 0);
    p.rotateZ(0.5);
    p.rotateY((i / 6) * Math.PI * 2);
    parts.push(tint(p, i % 2 ? '#f5c6d6' : '#fbe3ea', 0.05));
  }
  parts.push(tint(new SphereGeometry(0.06, 6, 4).translate(0, 0.08, 0), '#f2c94c'));
  return mergeGeometries(parts);
}

// Decorative lotus field on a water marker (scale = half extents); skips the given keep-out points.
export function lotusField(marker, count, seed = 3, avoid = []) {
  const rnd = mulberry(seed);
  const g = new Group();
  const pads = new InstancedMesh(padGeometry(0.55), materialFor('plain'), count);
  const flowers = new InstancedMesh(lotusGeometry(), materialFor('plain'), Math.ceil(count / 3));
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  let fi = 0;
  for (let i = 0; i < count; i++) {
    let x, z;
    let tries = 0;
    do {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.85;
      x = marker.position.x + Math.cos(a) * r * marker.scale.x;
      z = marker.position.z + Math.sin(a) * r * marker.scale.z;
    } while (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r || 1.2)) && ++tries < 8);
    const s = 0.6 + rnd() * 0.8;
    q.setFromAxisAngle(up, rnd() * 6.28);
    m.compose(new Vector3(x, marker.position.y + 0.03, z), q, new Vector3(s, 1, s));
    pads.setMatrixAt(i, m);
    if (i % 3 === 0 && fi < flowers.count) {
      m.compose(new Vector3(x + 0.1, marker.position.y + 0.05, z), q, new Vector3(1.2, 1.2, 1.2));
      flowers.setMatrixAt(fi++, m);
    }
  }
  flowers.count = fi;
  pads.receiveShadow = true;
  pads.computeBoundingSphere();
  flowers.computeBoundingSphere();
  g.add(pads, flowers);
  return g;
}

// A thirsty lotus bud on a stalk; bloom() swaps it for a big pad you can stand on.
export function lotusBud(pos) {
  const g = new Group();
  g.position.copy(pos);
  const stalk = new Mesh(tint(new CylinderGeometry(0.03, 0.03, 0.5, 5).translate(0, 0.25, 0), '#6f8f4a'), materialFor('plain'));
  const bud = new Mesh(tint(new ConeGeometry(0.14, 0.34, 6).translate(0, 0.62, 0), '#e9a9bf'), materialFor('plain'));
  const pad = new Mesh(padGeometry(0.85), materialFor('plain'));
  pad.position.y = 0.06;
  pad.scale.setScalar(0.01);
  pad.visible = false;
  const flower = new Mesh(lotusGeometry(), materialFor('plain'));
  flower.position.set(0.35, 0.08, 0.2);
  flower.visible = false;
  g.add(stalk, bud, pad, flower);
  g.userData = { stalk, bud, pad, flower, bloomT: -1 };
  g.userData.update = (dt) => {
    const u = g.userData;
    if (u.bloomT < 0) {
      bud.rotation.z = Math.sin(performance.now() / 700 + pos.x) * 0.08;
      return;
    }
    u.bloomT = Math.min(1, u.bloomT + dt * 1.5);
    const k = u.bloomT;
    pad.visible = flower.visible = true;
    pad.scale.setScalar(Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.15)));
    flower.scale.setScalar(k);
    stalk.visible = bud.visible = k < 0.4;
  };
  g.userData.bloom = () => {
    if (g.userData.bloomT < 0) g.userData.bloomT = 0;
  };
  return g;
}

// Lemon candy: a yellow sweet with twisted wrapper ends; spins and bobs.
export function candy() {
  const parts = [tint(new SphereGeometry(0.1, 8, 6).scale(1.2, 1, 1), '#f7d24a', 0.03)];
  for (const s of [-1, 1]) {
    const c = new ConeGeometry(0.07, 0.12, 5);
    c.rotateZ((s * Math.PI) / 2);
    c.translate(s * 0.16, 0, 0);
    parts.push(tint(c, '#fff4c9', 0.03));
  }
  const m = new Mesh(mergeGeometries(parts), materialFor('plain', { emissive: '#6a5410' }));
  m.castShadow = true;
  return m;
}

// Wooden note sign on a post.
export function noteSign() {
  const parts = [
    tint(new CylinderGeometry(0.05, 0.06, 1.1, 5).translate(0, 0.55, 0), '#6b4a33'),
    tint(new CylinderGeometry(0.34, 0.34, 0.05, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1.3, 0.8, 1).translate(0, 1.15, 0), '#b98a5a'),
    tint(new CylinderGeometry(0.26, 0.26, 0.06, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1.3, 0.8, 1).translate(0, 1.15, 0.01), '#f1e3c4'),
  ];
  const m = new Mesh(mergeGeometries(parts), materialFor('wood'));
  m.castShadow = true;
  return m;
}

// A big old courtyard tree, taller than the scattered ones.
export function bigTreeGeometry(seed = 5) {
  const rnd = mulberry(seed);
  const parts = [tint(new CylinderGeometry(0.35, 0.6, 4.2, 7).translate(0, 2.1, 0), '#6b4a33', 0.05, rnd)];
  for (let i = 0; i < 3; i++) {
    const b = new CylinderGeometry(0.12, 0.22, 2.2, 5);
    b.translate(0, 1.1, 0);
    b.rotateZ(0.7);
    b.rotateY((i / 3) * Math.PI * 2);
    b.translate(0, 3.4, 0);
    parts.push(tint(b, '#6b4a33', 0.05, rnd));
  }
  const leaf = ['#6f9f55', '#5f8f4a', '#7faa5c'];
  for (let i = 0; i < 9; i++) {
    const g = new IcosahedronGeometry(1.4 + rnd() * 0.9, 0);
    const a = rnd() * Math.PI * 2;
    const r = i === 0 ? 0 : 1.6 + rnd() * 1.4;
    g.translate(Math.cos(a) * r, 5.2 + rnd() * 1.8, Math.sin(a) * r);
    parts.push(tint(g, leaf[i % 3], 0.1, rnd));
  }
  return mergeGeometries(parts);
}
