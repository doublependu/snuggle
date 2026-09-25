// SPDX-License-Identifier: GPL-3.0-only
// Procedural foliage (the "less substantial assets" generated in JS): low-poly trees built from a few
// primitives with vertex colours, drawn as one InstancedMesh per species with the swaying 'leaf' material.
import {
  BufferAttribute, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { materialFor } from '../render/materials.js';
import { mulberry } from '../render/sky.js';

function paint(geo, color, jitter = 0.08, rnd = Math.random, shadeBottom = 0.25) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new Color(color);
  let minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i += 3) {
    const k = 1 + (rnd() - 0.5) * 2 * jitter;
    for (let j = 0; j < 3; j++) {
      const t = (pos.getY(i + j) - minY) / Math.max(1e-4, maxY - minY);
      const s = k * (1 - shadeBottom + shadeBottom * t);
      col.set([c.r * s, c.g * s, c.b * s], (i + j) * 3);
    }
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

const T = (g, x, y, z) => g.translate(x, y, z);

// Each builder returns a merged BufferGeometry about 1 unit ~ 1 metre.
const BUILDERS = {
  tree(rnd) {
    const parts = [paint(T(new CylinderGeometry(0.16, 0.26, 2.4, 6), 0, 1.2, 0), '#6b4a33', 0.05, rnd)];
    const leaf = ['#5f8f4a', '#6f9f55', '#4f7f45'];
    for (let i = 0; i < 4; i++) {
      const r = 1.1 + rnd() * 0.6;
      const g = new IcosahedronGeometry(r, 0);
      T(g, (rnd() - 0.5) * 1.4, 2.6 + rnd() * 1.4 + (i === 0 ? 0.6 : 0), (rnd() - 0.5) * 1.4);
      parts.push(paint(g, leaf[i % 3], 0.12, rnd, 0.4));
    }
    return mergeGeometries(parts);
  },
  maple(rnd) {
    const parts = [paint(T(new CylinderGeometry(0.14, 0.22, 2.2, 6), 0, 1.1, 0), '#5a3d2a', 0.05, rnd)];
    const leaf = ['#d9572e', '#e8773a', '#c8452a', '#f09a45'];
    for (let i = 0; i < 5; i++) {
      const g = new IcosahedronGeometry(0.9 + rnd() * 0.6, 0);
      g.scale(1.2, 0.8, 1.2);
      T(g, (rnd() - 0.5) * 2.2, 2.3 + rnd() * 1.3, (rnd() - 0.5) * 2.2);
      parts.push(paint(g, leaf[i % 4], 0.1, rnd, 0.35));
    }
    return mergeGeometries(parts);
  },
  pine(rnd) {
    const parts = [paint(T(new CylinderGeometry(0.14, 0.2, 2, 6), 0, 1, 0), '#5a3d2a', 0.05, rnd)];
    for (let i = 0; i < 3; i++) {
      const r = 1.6 - i * 0.4;
      parts.push(paint(T(new ConeGeometry(r, 1.6, 7), 0, 2.2 + i * 0.95, 0), i % 2 ? '#3f6a48' : '#35603f', 0.1, rnd, 0.35));
    }
    return mergeGeometries(parts);
  },
  willow(rnd) {
    const parts = [paint(T(new CylinderGeometry(0.18, 0.28, 2.6, 6), 0, 1.3, 0), '#6b5a40', 0.05, rnd)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const g = new ConeGeometry(0.7, 2.6, 5);
      g.rotateX(Math.PI);
      T(g, Math.cos(a) * 1.1, 2.4, Math.sin(a) * 1.1);
      parts.push(paint(g, i % 2 ? '#8fb35a' : '#7da34f', 0.12, rnd, 0.1));
    }
    parts.push(paint(T(new IcosahedronGeometry(1.3, 0), 0, 3.5, 0), '#8fb35a', 0.1, rnd, 0.3));
    return mergeGeometries(parts);
  },
  blossom(rnd) {
    const parts = [paint(T(new CylinderGeometry(0.12, 0.2, 2, 6), 0, 1, 0), '#5a3d2a', 0.05, rnd)];
    for (let i = 0; i < 5; i++) {
      const g = new IcosahedronGeometry(0.8 + rnd() * 0.5, 0);
      T(g, (rnd() - 0.5) * 2, 2.2 + rnd(), (rnd() - 0.5) * 2);
      parts.push(paint(g, i % 2 ? '#f6e6ec' : '#f2cfdc', 0.06, rnd, 0.2));
    }
    return mergeGeometries(parts);
  },
  bush(rnd) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = new IcosahedronGeometry(0.5 + rnd() * 0.3, 0);
      T(g, (rnd() - 0.5) * 0.8, 0.35, (rnd() - 0.5) * 0.8);
      parts.push(paint(g, i % 2 ? '#5f8f4a' : '#6f9f55', 0.12, rnd, 0.4));
    }
    return mergeGeometries(parts);
  },
};

const geoCache = new Map();
function geometryFor(kind) {
  if (!geoCache.has(kind)) geoCache.set(kind, (BUILDERS[kind] || BUILDERS.tree)(mulberry(kind.length * 31 + 7)));
  return geoCache.get(kind);
}

export const TREE_KINDS = Object.keys(BUILDERS);

// placements: [{ position: Vector3, scale, rot }]. Adds trunk colliders when a collision world is given.
export function plantTrees(kind, placements, { collision = null, sway = true, shadows = true } = {}) {
  if (!placements.length) return null;
  const geo = geometryFor(kind);
  const mat = sway ? materialFor('leaf') : materialFor('leaf', { sway: 0 });
  const im = new InstancedMesh(geo, mat, placements.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  placements.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot ?? 0);
    m.compose(p.position, q, new Vector3(p.scale, p.scale * (0.9 + ((i * 37) % 10) / 50), p.scale));
    im.setMatrixAt(i, m);
    if (collision && kind !== 'bush') collision.addCylinder(p.position.clone().setY(p.position.y - 0.5), 0.3 * p.scale, 3 * p.scale, 6);
  });
  im.castShadow = shadows;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  im.name = 'trees-' + kind;
  return im;
}
