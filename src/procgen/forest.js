// SPDX-License-Identifier: GPL-3.0-only
// The woods beyond a map's invisible walls (the station and the Academy). Everything is generated here, so
// nothing is downloaded: a skirt of ground that carries the authored terrain's edge outward, whole trees in
// a band just outside the walls (with a thicket right along them, so the stop reads as woods too thick to
// enter), cheap crowns further out, and a mist that thickens with distance from the map (render/materials.js
// setMist) until it hides where the forest ends. Nobody can get there: no collision.
import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../game.js';
import { materialFor, setMist } from '../render/materials.js';
import { mulberry } from '../render/sky.js';
import { plantTrees, paint } from './trees.js';
import { readTerrain, noise2 } from './terrain.js';

const NEAR = 14; // whole trees this far beyond the wall; crowns from there on
const SINK = 0.15; // the skirt tucks under the authored ground's edge, so there is no crack
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// gentle rolling ground (about +-2 m), the same every visit
const roll = (x, z) => 2.2 * (0.6 * Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.063 - 0.4) + 0.4 * Math.sin(x * 0.153 + z * 0.117));
const segDist = (x, z, s) => {
  const dx = s.x1 - s.x0,
    dz = s.z1 - s.z0;
  const t = Math.min(1, Math.max(0, ((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - s.x0 - dx * t, z - s.z0 - dz * t);
};

// A far tree: a crown and a three-sided trunk (26 or 12 triangles). The near band hides most trunks anyway.
function crown(kind, rnd) {
  const trunk = paint(new CylinderGeometry(0.14, 0.2, 2.2, 3, 1, true).translate(0, 1.1, 0), '#5a4030', 0.05, rnd);
  const top =
    kind === 'pine'
      ? paint(new ConeGeometry(1.5, 4.4, 6, 1, true).translate(0, 3.6, 0), '#35603f', 0.1, rnd, 0.4)
      : paint(new IcosahedronGeometry(1.6, 0).scale(1, 0.85, 1).translate(0, 3.2, 0), kind === 'maple' ? '#d9672e' : '#5a8a48', 0.12, rnd, 0.4);
  return mergeGeometries([trunk, top]);
}

/**
 * z: the zone (after collision.build() and scatter()).
 * rect: the play area { minX, maxX, minZ, maxZ } (glTF x/z; the inside faces of the invisible walls).
 * land: which sides have land beyond them (west, east, north = -z). The south is the sea.
 * kinds: [near species..., ] from procgen/trees.js, the first the most common; far: the far crowns' kinds.
 * clear: [{ x0, z0, x1, z1, r }] corridors kept free of trees (the railway, a path).
 * minY: nothing is planted below this (the shore, a cliff). lines: extra grid lines { x: [], z: [] } where
 * the authored edge has a sharp break (the shore). lowMist: top of the low mist between the trunks (flat maps).
 */
export function addForest(z, { rect, land = { west: true, east: true, north: true }, kinds = ['tree', 'pine'], far = ['tree', 'pine'], clear = [], minY = -0.3, lines = {}, seed = 1, lowMist = null }) {
  const [reach, nearK, farK] = G.quality.tier.forest;
  const rnd = mulberry(seed * 7919 + 13);
  const ter = readTerrain(z.ground);
  const IN = 0.6; // the skirt starts this far inside the authored ground
  const b = { x0: ter.x0 + IN, x1: ter.x1 - IN, z0: ter.z0 + IN, z1: ter.z1 - IN };
  const o = {
    x0: land.west ? rect.minX - reach - 10 : b.x0,
    x1: land.east ? rect.maxX + reach + 10 : b.x1,
    z0: land.north ? rect.minZ - reach - 10 : b.z0,
    z1: b.z1,
  };
  const water = z.waterLevel ?? -1e3;

  // ---- heights: the authored ground's edge carried outward, rolling a little further out
  const inside = (x, zz) => x >= b.x0 && x <= b.x1 && zz >= b.z0 && zz <= b.z1;
  const height = (x, zz) => {
    const cx = Math.min(b.x1, Math.max(b.x0, x)),
      cz = Math.min(b.z1, Math.max(b.z0, zz));
    const y = ter.y(cx, cz);
    const d = Math.hypot(x - cx, zz - cz);
    // the shore and the cliff keep their shape; dry ground rolls
    return y + (y > minY ? roll(x, zz) * smooth(2, 26, d) : 0);
  };

  // ---- the skirt: a grid that is fine at the seam and coarser further out; cells inside the authored ground
  // are left out
  const axis = (b0, b1, o0, o1, extra = []) => {
    const a = [];
    for (let v = b0, s = 2; v > o0 + 0.01; s = Math.min(14, s * 1.45)) a.unshift((v = Math.max(o0, v - s)));
    const n = Math.max(1, Math.ceil((b1 - b0) / 4));
    for (let i = 0; i <= n; i++) a.push(b0 + ((b1 - b0) * i) / n);
    for (let v = b1, s = 2; v < o1 - 0.01; s = Math.min(14, s * 1.45)) a.push((v = Math.min(o1, v + s)));
    for (const e of extra) if (e > o0 && e < o1 && !a.some((v) => Math.abs(v - e) < 0.3)) a.push(e);
    return a.sort((p, q) => p - q);
  };
  const xs = axis(b.x0, b.x1, o.x0, o.x1, lines.x);
  const zs = axis(b.z0, b.z1, o.z0, o.z1, lines.z);
  const pos = [],
    colr = [],
    idx = [];
  const floor = new Color('#5c7a48');
  const c = new Color();
  const vid = new Map();
  const vertex = (i, j) => {
    const k = i * 4096 + j;
    let v = vid.get(k);
    if (v !== undefined) return v;
    const x = xs[i],
      zz = zs[j];
    const y = height(x, zz) - SINK;
    const cx = Math.min(b.x1, Math.max(b.x0, x)),
      cz = Math.min(b.z1, Math.max(b.z0, zz));
    const d = Math.hypot(x - cx, zz - cz);
    // the authored edge's own colour, so the seam doesn't show; grass darkens to a forest floor further out
    // (the shore, the cliff and the railway's gravel keep theirs)
    ter.color(cx, cz, c);
    if (y > water + 0.35 && y > minY - 0.2 && c.g > c.r * 1.2) c.lerp(floor, smooth(3, 24, d) * 0.8);
    v = pos.length / 3;
    pos.push(x, y, zz);
    colr.push(c.r, c.g, c.b, 0.8); // alpha: the 'ground' shader family (render/materials.js 'mixed')
    vid.set(k, v);
    return v;
  };
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      if (inside(xs[i], zs[j]) && inside(xs[i + 1], zs[j + 1])) continue;
      const a = vertex(i, j),
        bq = vertex(i + 1, j),
        cq = vertex(i + 1, j + 1),
        dq = vertex(i, j + 1);
      idx.push(a, dq, bq, bq, dq, cq);
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colr), 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const skirt = new Mesh(geo, materialFor('mixed', z.fade ? { fade: 1 } : {}));
  skirt.name = 'forest-ground';
  skirt.receiveShadow = true;
  skirt.matrixAutoUpdate = false;
  z.group.add(skirt);

  // ---- trees
  const out = (x, zz) => Math.hypot(Math.max(rect.minX - x, 0, x - rect.maxX), Math.max(rect.minZ - zz, 0));
  const sector = (x, zz) => (G.quality.name === 'low' ? 'all' : x < rect.minX ? 'w' : x > rect.maxX ? 'e' : 'n');
  const near = new Map(); // 'kind|sector' -> placements
  const farList = far.map(() => []);
  const groundAt = (x, zz) => (inside(x, zz) ? ter.y(x, zz) : height(x, zz) - SINK);
  const free = (x, zz) => zz < rect.maxZ && !clear.some((s) => segDist(x, zz, s) < s.r);
  const plant = (kind, x, zz, scale) => {
    const y = groundAt(x, zz);
    if (y < minY || y < water + 0.25) return;
    const k = kind + '|' + sector(x, zz);
    if (!near.has(k)) near.set(k, []);
    near.get(k).push({ position: new Vector3(x, y, zz), scale, rot: rnd() * 6.28 });
  };
  const CELL = 3.4;
  for (let gx = o.x0; gx < o.x1; gx += CELL)
    for (let gz = o.z0; gz < o.z1; gz += CELL) {
      const x = gx + rnd() * CELL,
        zz = gz + rnd() * CELL;
      const pick = rnd(),
        keep = rnd(),
        size = rnd();
      if (x > rect.minX && x < rect.maxX && zz > rect.minZ) continue; // the play area (and the sea south of it)
      if (!free(x, zz)) continue;
      const d = out(x, zz);
      const dense = 0.35 + 0.65 * smooth(0.3, 0.62, noise2(x * 0.045 + 7, zz * 0.045));
      if (d <= NEAR) {
        if (keep > nearK * dense * 1.15) continue;
        plant(pick < 0.68 ? kinds[0] : kinds[1] || kinds[0], x, zz, 0.9 + size * 0.5);
      } else if (d <= reach) {
        if (keep > farK * dense * 0.42) continue;
        const y = groundAt(x, zz);
        if (y < minY || y < water + 0.25) continue;
        farList[pick < 0.65 ? 0 : farList.length - 1].push({ x, y, z: zz, s: 1 + size * 0.7 });
      }
    }
  // the thicket: bushes and trunks shoulder to shoulder just outside each wall
  const side = (x0, z0, x1, z1, nx, nz) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0.8; s < len; s += (1.5 + rnd() * 0.6) / Math.sqrt(nearK)) {
      const dd = 0.9 + rnd() * 1.6;
      const x = x0 + ((x1 - x0) * s) / len + nx * dd,
        zz = z0 + ((z1 - z0) * s) / len + nz * dd;
      const bush = rnd() < 0.55,
        size = rnd();
      if (!free(x, zz)) continue;
      plant(bush ? 'bush' : kinds[0], x, zz, bush ? 1.1 + size * 0.6 : 0.85 + size * 0.4);
    }
  };
  if (land.west) side(rect.minX, rect.minZ, rect.minX, rect.maxZ, -1, 0);
  if (land.east) side(rect.maxX, rect.minZ, rect.maxX, rect.maxZ, 1, 0);
  if (land.north) side(rect.minX, rect.minZ, rect.maxX, rect.minZ, 0, -1);

  const tier = G.quality.tier;
  let trees = 0,
    tris = idx.length / 3;
  const count = (im) => (tris += ((im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3) * im.count);
  for (const [k, list] of near) {
    const [kind, sec] = k.split('|');
    const im = plantTrees(kind, list, { sway: tier.sway, shadows: tier.shadowSize >= 2048, fade: z.fade });
    im.name = `forest-${kind}-${sec}`;
    z.group.add(im);
    trees += list.length;
    count(im);
  }
  const m = new Matrix4(),
    q = new Quaternion(),
    up = new Vector3(0, 1, 0);
  let crowns = 0;
  farList.forEach((list, i) => {
    if (!list.length) return;
    const im = new InstancedMesh(crown(far[i], mulberry(31 + i)), materialFor('leaf', { ...(tier.sway ? {} : { sway: 0 }), ...(z.fade ? { fade: 1 } : {}) }), list.length);
    list.forEach((p, n) => im.setMatrixAt(n, m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.x * 12.9 + p.z), new Vector3(p.s, p.s * (0.9 + ((n * 37) % 10) / 40), p.s))));
    im.computeBoundingSphere();
    im.name = 'forest-far-' + far[i];
    im.matrixAutoUpdate = false;
    z.group.add(im);
    crowns += list.length;
    count(im);
  });

  setMist({ minX: land.west ? rect.minX : -Infinity, maxX: land.east ? rect.maxX : Infinity, minZ: land.north ? rect.minZ : -Infinity, maxZ: Infinity }, { start: 8, length: reach - 8, lowTop: lowMist, sea: z.waterLevel });

  // one line when she pushes against the woods
  let push = 0,
    told = false,
    was = 0;
  z.updaters.push((dt) => {
    if (told) return;
    const p = G.player.position;
    // how far inside the nearest wooded wall she is; pushing = walking, within reach of it, and getting no
    // nearer (her velocity stays up against a wall, and on a slope she slides along it)
    const gap = Math.min(land.west ? p.x - rect.minX : 99, land.east ? rect.maxX - p.x : 99, land.north ? p.z - rect.minZ : 99);
    const stuck = gap < 0.6 && Math.abs(gap - was) < 0.4 * dt;
    was = gap;
    push = stuck && G.input.move.lengthSq() > 0.25 && !G.frozen ? push + dt : 0;
    if (push > 0.8) {
      told = z.forest.told = true;
      G.ui.toast('The woods are too thick to walk through.', 3);
    }
  });
  // (ground: the surface at any point outside the walls, authored or generated; for the tests)
  z.forest = { rect, land, reach, trees, crowns, tris: Math.round(tris), skirt, ground: groundAt };
  return z.forest;
}
