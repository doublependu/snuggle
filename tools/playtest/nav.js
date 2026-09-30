// SPDX-License-Identifier: GPL-3.0-only
// Finding the way, from what she has seen: a 0.5 m grid per place, where walls seen across the view (the eyes'
// `ahead` distances) and walls bumped into are blocked, and everything else is assumed walkable until shown
// otherwise. A* over it gives a route; steering turns the camera toward a point a few metres along it.
const CELL = 0.5;
const key = (i, j) => i * 100003 + j;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const RAD_PER_PX = 0.0036; // the game's mouse look: 0.0024 rad per unit x 1.5 units per dragged pixel

export class Nav {
  constructor() {
    this.maps = new Map(); // place -> Map(cell -> { b: blocked evidence, f: free evidence })
    this.place = null;
    this.grid = null;
  }

  enter(place) {
    if (place === this.place) return;
    this.place = place;
    if (!this.maps.has(place)) this.maps.set(place, new Map());
    this.grid = this.maps.get(place);
    this.route = null;
  }

  cell(x, z) {
    return [Math.floor(x / CELL), Math.floor(z / CELL)];
  }
  get(i, j) {
    return this.grid.get(key(i, j));
  }
  // what = true (a wall), false (seen walkable), or 'water' (deep water or a drop: that one stays)
  mark(x, z, what) {
    const [i, j] = this.cell(x, z);
    const k = key(i, j);
    const c = this.grid.get(k) || { b: 0, f: 0 };
    if (what === 'water') c.w = true;
    else if (what) c.b += 1;
    else c.f += 1;
    this.grid.set(k, c);
  }
  blocked(i, j) {
    const c = this.get(i, j);
    // a wall seen twice (or bumped into) is a wall, however many rays passed by it
    return !!c && (c.w || c.b >= 2 || (c.b > 0 && c.b * 4 > c.f));
  }

  // What she can see ahead: free up to each wall, the wall itself blocked, and drops ahead blocked.
  observe(s) {
    if (!s.ahead || !s.me) return;
    const [px, , pz] = s.me.pos;
    for (const r of s.ahead) {
      const a = s.view.yaw + Math.PI + (r.deg * Math.PI) / 180;
      const dx = Math.sin(a),
        dz = Math.cos(a);
      const free = Math.min(r.dist - 0.4, 9);
      for (let d = 0.5; d < free; d += CELL) this.mark(px + dx * d, pz + dz * d, false);
      // the wall itself, a little behind its surface (routes start from her own cell even when that's marked)
      if (r.dist < 14) this.mark(px + dx * (r.dist + 0.1), pz + dz * (r.dist + 0.1), true);
      if (r.drop && Math.abs(r.deg) <= 40) this.mark(px + dx * 1.6, pz + dz * 1.6, 'water');
      for (const k of r.waterAt || []) this.mark(px + dx * k, pz + dz * k, 'water');
    }
  }

  // Walked into something that the eyes didn't catch (a low wall, a post): block the cell in front.
  bump(s, dirAngle) {
    const [px, , pz] = s.me.pos;
    for (const d of [0.45, 0.7]) {
      const x = px + Math.sin(dirAngle) * d,
        z = pz + Math.cos(dirAngle) * d;
      this.mark(x, z, true);
      this.mark(x, z, true); // stronger evidence than a glance
    }
  }

  cost(i, j) {
    if (this.blocked(i, j)) return Infinity;
    let near = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if ((di || dj) && this.blocked(i + di, j + dj)) near++;
    const c = this.get(i, j);
    return (c ? 1 : 1.3) + near * 1.5;
  }

  // A* from a to b (world x, z). Returns a list of world points, or null.
  path(ax, az, bx, bz) {
    const [si, sj] = this.cell(ax, az);
    const [gi, gj] = this.cell(bx, bz);
    const lo = [Math.min(si, gi) - 50, Math.min(sj, gj) - 50],
      hi = [Math.max(si, gi) + 50, Math.max(sj, gj) + 50];
    const open = new Heap();
    const g = new Map(),
      from = new Map();
    const sk = key(si, sj),
      gk = key(gi, gj);
    g.set(sk, 0);
    open.push(sk, Math.hypot(gi - si, gj - sj), si, sj);
    let n = 0,
      best = sk,
      bestH = Infinity;
    while (open.size && n++ < 60000) {
      const [k, , i, j] = open.pop();
      if (k === gk) {
        best = gk;
        break;
      }
      const h = Math.hypot(gi - i, gj - j);
      if (h < bestH) (bestH = h), (best = k);
      const gk0 = g.get(k);
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = i + di,
            nj = j + dj;
          if (ni < lo[0] || nj < lo[1] || ni > hi[0] || nj > hi[1]) continue;
          // no cutting corners between two blocked cells
          if (di && dj && (this.blocked(i + di, j) || this.blocked(i, j + dj))) continue;
          let c = ni === gi && nj === gj ? 1 : this.cost(ni, nj);
          // standing in (or right next to) a blocked spot, e.g. put back at the water's edge after a splash:
          // let her walk out of it, dearly
          if (c === Infinity && this.get(ni, nj)?.w && Math.hypot(ni - si, nj - sj) <= 3) c = 12;
          if (c === Infinity) continue;
          const nk = key(ni, nj);
          const ng = gk0 + c * (di && dj ? 1.414 : 1);
          if (ng < (g.get(nk) ?? Infinity)) {
            g.set(nk, ng);
            from.set(nk, k);
            open.push(nk, ng + Math.hypot(gi - ni, gj - nj), ni, nj);
          }
        }
    }
    const pts = [];
    for (let k = best; k !== undefined; k = from.get(k)) {
      const i = Math.round(k / 100003),
        j = k - i * 100003;
      pts.push([(i + 0.5) * CELL, (j + 0.5) * CELL]);
      if (k === sk) break;
    }
    pts.reverse();
    return { pts, reached: best === gk };
  }

  // Can she walk straight from a to b on the grid?
  clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const [si, sj] = this.cell(ax, az);
    for (let t = 0; t <= d; t += CELL * 0.5) {
      const [i, j] = this.cell(ax + ((bx - ax) * t) / d, az + ((bz - az) * t) / d);
      if ((i !== si || j !== sj) && this.blocked(i, j)) return false; // her own cell doesn't count
    }
    return true;
  }

  // The point to steer at on the way to (tx, tz): straight there if nothing blocks it, else a few metres
  // along the A* route (replanned every half second).
  lookahead(s, tx, tz, now) {
    const [px, , pz] = s.me.pos;
    if (this.clear(px, pz, tx, tz)) {
      this.route = null;
      return [tx, tz];
    }
    if (!this.route || now - this.route.t > 500 || Math.hypot(this.route.tx - tx, this.route.tz - tz) > 1) {
      const r = this.path(px, pz, tx, tz);
      this.route = { t: now, tx, tz, pts: r.pts, reached: r.reached };
    }
    const pts = this.route.pts;
    let far = null;
    for (const [x, z] of pts) {
      const d = Math.hypot(x - px, z - pz);
      if (d > 4.5) break;
      if (d > 0.8 && this.clear(px, pz, x, z)) far = [x, z];
    }
    return far || pts.find(([x, z]) => Math.hypot(x - px, z - pz) > 0.6) || [tx, tz];
  }
}

// Camera yaw needed to walk toward (x, z) with W, and the error from the current yaw.
export function yawTo(s, x, z) {
  const [px, , pz] = s.me.pos;
  const heading = Math.atan2(x - px, z - pz);
  return wrap(heading + Math.PI - s.view.yaw);
}
export { wrap };

class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(k, f, i, j) {
    const a = this.a;
    a.push([k, f, i, j]);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (a[p][1] <= a[n][1]) break;
      [a[p], a[n]] = [a[n], a[p]];
      n = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1,
          r = l + 1;
        let m = n;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        n = m;
      }
    }
    return top;
  }
}
