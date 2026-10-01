// SPDX-License-Identifier: GPL-3.0-only
// Finding the way. Each zone has a small graph of path points (Routes); the guide takes the shortest way along
// it from Pip to the objective's target (story/helpers.js objective(text, target)), so it leads over the
// bridge and through the gate, not through the pond or a wall. After a while without progress her Charm
// Sprite flies ahead along that way, leaving sparkles, and an arrow under the objective points to the next
// path point with the distance left. Settings > Direction hints: After a while / Always / Off.
// The fingerposts (world/signs.js) point along the same routes, so signs and guide always agree.
import { Vector3 } from 'three';
import { G } from '../game.js';
import { makeCreature } from '../actors/creatures.js';
import { SPECIES } from '../content/species.js';

const DELAY = 40; // seconds of free play without getting nearer before the guide starts
const _f = new Vector3(),
  _r = new Vector3(),
  _a = new Vector3(),
  _b = new Vector3(),
  _d = new Vector3();

export class Routes {
  // nodes: { id: [x, z] }, edges: [[a, b], ...] or 'a b c' chains
  constructor(z, nodes, edges) {
    this.z = z;
    this.nodes = new Map();
    for (const [id, [x, zz, y]] of Object.entries(nodes)) this.nodes.set(id, new Vector3(x, y ?? z.collision.groundY(x, zz, 60) ?? 0, zz));
    this.edges = [];
    this.adj = new Map([...this.nodes.keys()].map((k) => [k, []]));
    for (const e of edges) {
      const ids = typeof e === 'string' ? e.split(' ') : e;
      for (let i = 0; i < ids.length - 1; i++) {
        const [a, b] = [ids[i], ids[i + 1]];
        const d = this.nodes.get(a).distanceTo(this.nodes.get(b));
        this.adj.get(a).push([b, d]);
        this.adj.get(b).push([a, d]);
        this.edges.push([a, b]);
      }
    }
  }
  sees(a, b) {
    return this.z.collision.hasLineOfSight(_a.copy(a).setY(a.y + 0.7), _b.copy(b).setY(b.y + 0.7));
  }
  // the path point to start from or end at: the nearest she can see, else simply the nearest
  nearest(p) {
    const byDist = [...this.nodes].map(([id, n]) => [id, n.distanceTo(p)]).sort((x, y) => x[1] - y[1]);
    for (const [id] of byDist.slice(0, 4)) if (this.sees(p, this.nodes.get(id))) return id;
    return byDist[0][0];
  }
  // the way from one place to another: { points: [Vector3, ...] ending at `to`, length }
  path(from, to) {
    const d0 = from.distanceTo(to);
    let points = [];
    if (!(d0 < 14 && this.sees(from, to))) {
      const a = this.nearest(from),
        b = this.nearest(to);
      const dist = new Map([[a, 0]]),
        prev = new Map(),
        open = new Set([a]),
        done = new Set();
      while (open.size) {
        let u = null;
        for (const k of open) if (u === null || dist.get(k) < dist.get(u)) u = k;
        open.delete(u);
        done.add(u);
        if (u === b) break;
        for (const [v, w] of this.adj.get(u)) {
          if (done.has(v)) continue;
          const nd = dist.get(u) + w;
          if (nd < (dist.get(v) ?? Infinity)) {
            dist.set(v, nd);
            prev.set(v, u);
            open.add(v);
          }
        }
      }
      for (let k = b; k !== undefined; k = prev.get(k)) points.unshift(this.nodes.get(k));
      // she is already past the first point, or standing on it
      while (points.length > 1 && from.distanceTo(points[1]) < points[0].distanceTo(points[1]) + 1 && this.sees(from, points[1])) points.shift();
      while (points.length && from.distanceTo(points[0]) < 2.2) points.shift();
      // the last point is behind the target as she comes: go straight to the target from the one before
      while (points.length > 1 && points.at(-2).distanceTo(to) < points.at(-2).distanceTo(points.at(-1)) + 1) points.pop();
    }
    points = [...points, to];
    let length = 0,
      p = from;
    for (const q of points) {
      length += p.distanceTo(q);
      p = q;
    }
    return { points, length };
  }
}

// What the objective's target is right now: a position, or null.
export function resolveGoal(t) {
  while (typeof t === 'function') t = t();
  if (!t) return null;
  if (Array.isArray(t)) {
    let best = null;
    for (const x of t) {
      const p = resolveGoal(x);
      if (p && (!best || p.distanceTo(G.player.position) < best.distanceTo(G.player.position))) best = p;
    }
    return best;
  }
  if (t.isVector3) return t;
  if (typeof t === 'string') {
    const n = G.npcs.get(t);
    if (n && !n.hidden) return n.position;
    for (const g of G.grumblings) if (g.id === t && !g.soothed) return g.position;
    return G.zone?.marker(t)?.position || null;
  }
  return t.position || null;
}

// Call once per zone (routes: its Routes, or null for a straight line to the target).
export function startGuide(z, routes = null) {
  z.routes = routes;
  const p = G.player;
  let key = null,
    stuck = 0,
    best = Infinity,
    on = false,
    tick = 0,
    path = null,
    bird = null,
    glow = -1,
    fly = 0;
  const hide = () => {
    G.ui.way(null);
    if (bird) bird.visible = false;
    if (glow >= 0) G.fx.glows.set(glow, _a.set(0, -99, 0), null, 0);
  };
  z.updaters.push((dt) => {
    const mode = G.save.settings.hints || 'auto';
    const text = G.ui.objective.textContent;
    if (text !== key) {
      key = text;
      stuck = 0;
      best = Infinity;
      on = false;
      path = null;
      tick = 0;
    }
    // free to walk: not in a scene, a menu, a mini-game or a seat, and not busy soothing or leading a child
    const free = !G.frozen && !G.ui.dialogueOpen && p.state === 'move' && !p.humming && !G.soothe.target && !z.leading;
    if ((tick -= dt) <= 0) {
      tick = 0.4;
      const to = mode === 'off' ? null : resolveGoal(G.goal);
      path = to ? (routes ? routes.path(p.position, to) : { points: [to], length: p.position.distanceTo(to) }) : null;
      if (path && path.length < best - 3) {
        best = path.length;
        if (!on) stuck = 0;
      }
    }
    if (free && path) stuck += dt;
    if (path && (mode === 'always' || stuck >= DELAY)) on = true;
    z.guide = { on, stuck, path }; // (for the tests and the autoplayer's log)
    if (!on || !path || !free || path.length < 5) return hide();
    // the arrow: toward the next path point, relative to where the camera looks
    const next = path.points[0];
    G.cam.basis(_f, _r);
    _d.set(next.x - p.position.x, 0, next.z - p.position.z);
    G.ui.way(Math.atan2(_d.dot(_r), _d.dot(_f)), path.length);
    // the sprite: from her shoulder along the way, up to 9 m ahead, over and over
    const id = G.sprites?.list[0]?.id;
    if (!id) return;
    if (!bird || bird.userData.id !== id) {
      bird?.removeFromParent();
      bird = makeCreature(id, { glow: SPECIES[id].glow });
      bird.userData.id = id;
      bird.name = 'guide';
      bird.scale.setScalar(0.5);
      z.group.add(bird);
      if (glow < 0) glow = G.fx.glows.add(p.position, SPECIES[id].glow, 0.5);
    }
    bird.visible = true;
    fly += dt;
    const k = (fly % 2.6) / 2.6;
    let left = Math.min(9, path.length) * k;
    _a.copy(p.position);
    for (const q of path.points) {
      const seg = _a.distanceTo(q);
      if (left <= seg) {
        _a.lerp(q, seg ? left / seg : 0);
        break;
      }
      left -= seg;
      _b.copy(_a);
      _a.copy(q);
    }
    _d.copy(_a).sub(bird.position).setY(0);
    bird.position.set(_a.x, _a.y + 1.5 + Math.sin(k * Math.PI) * 0.6, _a.z);
    if (_d.lengthSq() > 1e-6 && k > 0.02) bird.rotation.y = Math.atan2(_d.x, _d.z);
    G.fx.glows.set(glow, bird.position, null, 0.6 * Math.sin(k * Math.PI) + 0.15);
    if (Math.random() < dt * 14) G.fx.sparkles.emit(bird.position, 1, SPECIES[id].glow, { speed: 0.15, up: -0.2, size: 0.12, life: 1.6 });
  });
  const exit = z.onExit;
  z.onExit = () => {
    exit?.();
    G.ui.way(null);
  };
}

// A zone's signs from two short tables, with every fingerpost arm pointing along the route to its place.
//   places: [[text, icon, x, z, facing, extra?]]   a board on a post in front of each place
//   fingers: [[x, z, [place texts...]]]             fingerposts
export function signsFor(z, routes, places, fingers = []) {
  const at = (x, zz) => new Vector3(x, z.collision.groundY(x, zz, 60) ?? 0, zz);
  const where = new Map(places.map(([text, , x, zz]) => [text, at(x, zz)]));
  return [
    ...places.map(([text, icon, x, zz, facing, extra]) => ({ kind: 'post', text, icon, at: at(x, zz), facing, ...extra })),
    ...fingers.map(([x, zz, names]) => {
      const p = at(x, zz);
      return { kind: 'finger', at: p, arms: names.map((text) => ({ text, toward: routes.path(p, where.get(text)).points[0] })) };
    }),
  ];
}
