// SPDX-License-Identifier: GPL-3.0-only
// Friends who walk with Xiao Pei: seek a slot beside / behind her with arrival, stay on the ground,
// slide along walls (capsule vs the zone BVH), and teleport back (out of view) if they fall far behind or
// get stuck. Attached to an NPC with npc.follow(slot); scripts can still take over with npc.walkTo().
import { Line3, MathUtils, Vector3 } from 'three';
import { G } from '../game.js';

const _t = new Vector3();
const _d = new Vector3();
const _seg = new Line3();
const _fwd = new Vector3();

export class Follower {
  // slot: offset in Xiao Pei's frame (x = her right, z = behind her), in metres
  constructor(npc, slot = { x: 1.3, z: 0.5 }) {
    this.npc = npc;
    this.slot = slot;
    this.speed = 0;
    this.stuck = 0;
    this.lastDist = 0;
    this.radius = 0.22;
  }

  target(out) {
    const p = G.player;
    const f = p.facing;
    // her right = (cos f, 0, -sin f); behind = -(sin f, 0, cos f)
    out.set(
      p.position.x + Math.cos(f) * this.slot.x - Math.sin(f) * this.slot.z,
      p.position.y,
      p.position.z - Math.sin(f) * this.slot.x - Math.cos(f) * this.slot.z,
    );
    return out;
  }

  update(dt) {
    const n = this.npc;
    const p = G.player;
    if (!p || dt <= 0) return;
    const root = n.root;
    this.target(_t);
    _d.subVectors(_t, root.position).setY(0);
    const dist = _d.length();
    const toPlayer = root.position.distanceTo(p.position);
    // far behind (or stuck on a corner for a while): pop back in somewhere behind her, out of view
    if (toPlayer > 12 || this.stuck > 2) return this.teleportBehind();
    // speed from distance: stroll, walk, jog; ease to a stop inside the slot
    const want = dist < 0.35 ? 0 : MathUtils.clamp((dist - 0.2) * 1.6, 0.6, dist > 4 ? 4.2 : 2.4);
    this.speed += (want - this.speed) * Math.min(1, dt * 5);
    if (this.speed > 0.05 && dist > 0.01) {
      _d.divideScalar(dist);
      const step = Math.min(dist, this.speed * dt);
      const before = root.position.clone();
      root.position.addScaledVector(_d, step);
      this.collide();
      const moved = root.position.distanceTo(before);
      this.stuck = moved < step * 0.25 && want > 0.5 ? this.stuck + dt : Math.max(0, this.stuck - dt);
      n.turnTo(Math.atan2(_d.x, _d.z), dt, 8);
    } else {
      // idle in the slot: face the way she faces, or toward her while she is still
      const face = p.speed > 0.3 ? p.facing : Math.atan2(p.position.x - root.position.x, p.position.z - root.position.z);
      n.turnTo(face, dt, 3);
      this.stuck = 0;
    }
    const s = this.speed;
    if (s < 0.2) n.h.play(n.base === 'sit' ? 'sit' : 'idle', 0.3);
    else if (s < 2.5) n.h.play('walk', 0.25, MathUtils.clamp(s / 0.95, 0.7, 2.4));
    else n.h.play('run', 0.25, MathUtils.clamp(s / 2.2, 1, 2));
  }

  // Keep the feet on the ground and out of walls (a short capsule against the zone's collision BVH).
  collide() {
    const c = G.collision;
    const pos = this.npc.root.position;
    if (!c?.bvh) return;
    const r = this.radius;
    _seg.start.set(pos.x, pos.y + r + 0.25, pos.z);
    _seg.end.set(pos.x, pos.y + 1.0, pos.z);
    c.collideCapsule(_seg, r);
    pos.x = _seg.start.x;
    pos.z = _seg.start.z;
    const gy = c.groundY(pos.x, pos.z, pos.y + 1.2);
    if (gy !== null && Math.abs(gy - pos.y) < 1.5) pos.y += (gy - pos.y) * 0.6;
  }

  teleportBehind() {
    const p = G.player;
    const root = this.npc.root;
    _fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
    for (const back of [2.2, 1.4, 0.8]) {
      _t.copy(p.position).addScaledVector(_fwd, -back);
      _t.x += Math.cos(p.facing) * this.slot.x * 0.6;
      _t.z -= Math.sin(p.facing) * this.slot.x * 0.6;
      const gy = G.collision?.groundY(_t.x, _t.z, p.position.y + 1.5);
      if (gy === null || gy === undefined || Math.abs(gy - p.position.y) > 1) continue;
      // don't pop in inside a wall: the way from her to the spot must be clear
      _d.copy(_t).setY(p.position.y + 0.6);
      const from = p.position.clone().setY(p.position.y + 0.6);
      if (G.collision && !G.collision.hasLineOfSight(from, _d)) continue;
      root.position.set(_t.x, gy, _t.z);
      this.npc.facing = p.facing;
      root.rotation.y = p.facing;
      break;
    }
    this.stuck = 0;
    this.speed = 0;
  }
}
