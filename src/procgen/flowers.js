// SPDX-License-Identifier: GPL-3.0-only
// Wildflowers inside the map: little clumps in drifts, on grass only (read from the terrain's own colours,
// procgen/terrain.js, so paths, paving and packed earth stay bare), never on a platform, a bench or the water.
// Three instanced meshes (white-yellow, pink, blue-violet), no collision, nothing downloaded.
import { ConeGeometry, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../game.js';
import { materialFor } from '../render/materials.js';
import { mulberry } from '../render/sky.js';
import { paint } from './trees.js';
import { readTerrain, noise2 } from './terrain.js';

const PALETTES = [['#fff6dc', '#f7d24a'], ['#f2a7c0', '#e8607a'], ['#9fb4ee', '#b58ad6']];

// One clump: a green tuft with four flower heads (24 triangles).
function clump(colors, rnd) {
  const parts = [paint(new ConeGeometry(0.14, 0.11, 4, 1, true).translate(0, 0.055, 0), '#6f9a4e', 0.1, rnd, 0.3)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + rnd() * 0.8,
      r = 0.06 + rnd() * 0.12;
    const head = new ConeGeometry(0.075, 0.06, 5, 1, true).rotateX(Math.PI).translate(Math.cos(a) * r, 0.11 + rnd() * 0.08, Math.sin(a) * r);
    parts.push(paint(head, colors[i % 2], 0.06, rnd, 0.15));
  }
  return mergeGeometries(parts);
}


// rect: the play area { minX, maxX, minZ, maxZ }; count: clumps on the high tier (fewer on the others).
export function addFlowers(z, { rect, count = 500, seed = 1 }) {
  const tier = G.quality.tier;
  const want = Math.round(count * (0.05 + 0.95 * tier.particles));
  const rnd = mulberry(seed * 104729 + 5);
  const ter = readTerrain(z.ground);
  const water = z.waterLevel ?? -1e3;
  const lists = PALETTES.map(() => []);
  let n = 0;
  for (let tries = 0; n < want && tries < want * 60; tries++) {
    const x = rect.minX + rnd() * (rect.maxX - rect.minX),
      zz = rect.minZ + rnd() * (rect.maxZ - rect.minZ);
    const s = 0.75 + rnd() * 0.55,
      rot = rnd() * 6.28;
    if (noise2(x * 0.085 + seed, zz * 0.085) < 0.5) continue; // drifts, with bare grass between
    if (!ter.grass(x, zz)) continue;
    const ty = ter.y(x, zz);
    if (ty < water + 0.15) continue;
    // something stands here (a platform, a bench, a wall): the surface isn't the ground
    const gy = z.collision.groundY(x, zz, ty + 3);
    if (gy === null || Math.abs(gy - ty) > 0.12) continue;
    lists[Math.min(2, Math.floor(noise2(x * 0.045 + 40, zz * 0.045 + seed) * 3.6))].push({ x, y: gy - 0.02, z: zz, s, rot });
    n++;
  }
  const m = new Matrix4(),
    q = new Quaternion(),
    up = new Vector3(0, 1, 0);
  const mat = materialFor('leaf', tier.sway ? {} : { sway: 0 });
  lists.forEach((list, i) => {
    if (!list.length) return;
    const im = new InstancedMesh(clump(PALETTES[i], mulberry(50 + i)), mat, list.length);
    list.forEach((p, k) => im.setMatrixAt(k, m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), new Vector3(p.s, p.s, p.s))));
    im.computeBoundingSphere();
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.name = 'flowers-' + i;
    z.group.add(im);
  });
  z.flowers = n;
  return n;
}
