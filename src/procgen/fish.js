// SPDX-License-Identifier: GPL-3.0-only
// A paper-craft fish, made in code from a few numbers (content/catches.js): its length, height, width and
// tail, and two colours (back and belly). One faceted mesh, about a hundred triangles; nothing is downloaded.
// shape: [length, height, width, tail]. A tail of 0 gives a crab (wide and flat, with claws).
import { BufferAttribute, BufferGeometry, Color, Mesh } from 'three';
import { materialFor } from '../render/materials.js';

export function fishMesh({ shape, c }, metres = 0.5) {
  const [L, H, W, tail] = shape;
  const pos = [],
    col = [];
  const back = new Color(c[0]),
    belly = new Color(c[1]),
    tmp = new Color();
  const tri = (a, b, d, ca, cb, cd) => {
    for (const [p, k] of [[a, ca], [b, cb], [d, cd]]) {
      pos.push(p[0], p[1], p[2]);
      tmp.copy(k);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  };
  const shade = (y, h) => tmp.copy(belly).lerp(back, Math.max(0, Math.min(1, y / h + 0.5))).clone();
  // the body: rings along its length (x), six sides each, fat in the front third
  const N = 6,
    S = 6;
  const ring = (i) => {
    const t = i / N;
    const fat = Math.sin(Math.pow(t, 0.7) * Math.PI) * (tail ? 1 : 0.9) + (i === 0 ? 0.12 : 0);
    const x = (0.5 - t) * L;
    const out = [];
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2;
      out.push([x, Math.sin(a) * H * 0.5 * fat, Math.cos(a) * W * 0.5 * fat]);
    }
    return out;
  };
  let prev = ring(0);
  for (let i = 1; i <= N; i++) {
    const cur = ring(i);
    for (let s = 0; s < S; s++) {
      const a = prev[s],
        b = prev[(s + 1) % S],
        d = cur[s],
        e = cur[(s + 1) % S];
      tri(a, b, e, shade(a[1], H), shade(b[1], H), shade(e[1], H));
      tri(a, e, d, shade(a[1], H), shade(e[1], H), shade(d[1], H));
    }
    prev = cur;
  }
  const fin = back.clone().multiplyScalar(0.8);
  if (tail) {
    // the tail fin, and one on its back
    const x0 = -L * 0.5;
    tri([x0 + L * 0.06, 0, 0], [x0 - tail * L * 0.5, tail * H, 0], [x0 - tail * L * 0.3, 0, 0], fin, fin, fin);
    tri([x0 + L * 0.06, 0, 0], [x0 - tail * L * 0.3, 0, 0], [x0 - tail * L * 0.5, -tail * H, 0], fin, fin, fin);
    tri([L * 0.12, H * 0.42, 0], [-L * 0.2, H * 0.42, 0], [-L * 0.14, H * 0.8, 0], fin, fin, fin);
  } else {
    // a crab: two claws held up
    for (const s of [-1, 1]) tri([L * 0.3, 0, s * W * 0.4], [L * 0.75, H * 0.5, s * W * 0.75], [L * 0.6, -H * 0.1, s * W * 0.5], fin, fin, fin);
  }
  // an eye on each side
  const dark = new Color('#2a1d17');
  for (const s of [-1, 1]) {
    const ex = L * 0.32,
      ey = H * 0.12,
      ez = s * W * 0.36;
    const r = Math.max(0.02, H * 0.09);
    tri([ex, ey + r, ez], [ex - r, ey - r, ez * 1.02], [ex + r, ey - r, ez * 1.02], dark, dark, dark);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  const m = new Mesh(g, materialFor('paper', { side: 'double' }));
  m.scale.setScalar(metres / L);
  m.castShadow = false;
  return m;
}
