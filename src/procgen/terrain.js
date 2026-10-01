// SPDX-License-Identifier: GPL-3.0-only
// Read a zone's authored terrain (the GROUND_ mesh, a regular grid built by tools/blender/build_zones.py) back
// into a height and colour grid: the forest beyond the walls continues its edge, and the flowers grow only
// where it is grass. Unlike a collision ray, this sees the ground alone (no walls, platforms or trunks).
import { Vector3 } from 'three';

export function readTerrain(mesh) {
  if (mesh.userData.terrain) return mesh.userData.terrain;
  const pa = mesh.geometry.attributes.position,
    ca = mesh.geometry.attributes.color;
  const v = new Vector3();
  const P = new Float32Array(pa.count * 3);
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  const xk = new Set(),
    zk = new Set();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld);
    P.set([v.x, v.y, v.z], i * 3);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    z0 = Math.min(z0, v.z);
    z1 = Math.max(z1, v.z);
    xk.add(Math.round(v.x * 20));
    zk.add(Math.round(v.z * 20));
  }
  // columns and rows: vertices of one column share one (quantized) x, so the distinct values count them
  const nx = xk.size,
    nz = zk.size;
  const dx = (x1 - x0) / (nx - 1),
    dz = (z1 - z0) / (nz - 1);
  const Y = new Float32Array(nx * nz),
    C = new Float32Array(nx * nz * 3);
  for (let i = 0; i < pa.count; i++) {
    const k = Math.round((P[i * 3] - x0) / dx) + Math.round((P[i * 3 + 2] - z0) / dz) * nx;
    Y[k] = P[i * 3 + 1];
    if (ca) C.set([ca.getX(i), ca.getY(i), ca.getZ(i)], k * 3);
  }
  const cell = (x, z) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / dx)),
      fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / dz));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    return [i + j * nx, fx - i, fz - j];
  };
  const lerp4 = (A, k, s, u, w) => (A[k * s] * (1 - u) + A[(k + 1) * s] * u) * (1 - w) + (A[(k + nx) * s] * (1 - u) + A[(k + nx + 1) * s] * u) * w;
  const t = {
    x0, x1, z0, z1, nx, nz, dx, dz,
    // ground height at (x, z), clamped to the grid
    y(x, z) {
      const [k, u, w] = cell(x, z);
      return lerp4(Y, k, 1, u, w);
    },
    // the nearest vertex's colour (linear rgb) into a Color
    color(x, z, out) {
      const [k, u, w] = cell(x, z);
      const n = (k + (u > 0.5 ? 1 : 0) + (w > 0.5 ? nx : 0)) * 3;
      return out.setRGB(C[n], C[n + 1], C[n + 2]);
    },
    // grass: green clearly ahead of red (paths, paving, packed earth and the shore are not)
    grass(x, z) {
      const [k, u, w] = cell(x, z);
      for (const n of [k, k + 1, k + nx, k + nx + 1]) if (!(C[n * 3 + 1] > C[n * 3] * 1.3)) return false;
      return u >= 0 && w >= 0;
    },
  };
  mesh.userData.terrain = t;
  return t;
}

// Smooth value noise in 0..1 (clumps and clearings in the woods, drifts of flowers): the same every visit.
export function noise2(x, z) {
  const h = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x),
    j = Math.floor(z);
  const u = x - i,
    v = z - j;
  const a = u * u * (3 - 2 * u),
    b = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b;
}
