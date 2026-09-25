// SPDX-License-Identifier: GPL-3.0-only
// Charm Sprite followers: small glowing versions of soothed Grumblings that trail Xiao Pei.
// At most MAX are visible (the rest are "in her pockets") to keep phones happy.
import { Group, Vector3 } from 'three';
import { G } from '../game.js';
import { makeCreature } from './creatures.js';
import { SPECIES } from '../content/species.js';

const MAX = 5;
const _t = new Vector3();

export class SpriteFollowers {
  constructor() {
    this.group = new Group();
    this.group.name = 'sprites';
    this.list = [];
  }

  rebuild() {
    for (const s of this.list) s.obj.removeFromParent();
    this.list = [];
    const ids = Object.keys(G.save.sprites).filter((id) => id !== 'doudou' && SPECIES[id] && G.save.sprites[id] > 0);
    for (const id of ids.slice(0, MAX)) this.spawn(id, G.player.position);
  }

  spawn(id, from) {
    const obj = makeCreature(id, { glow: SPECIES[id].glow });
    obj.scale.setScalar(0.42);
    obj.position.copy(from);
    obj.traverse((o) => (o.castShadow = false));
    this.group.add(obj);
    const s = { id, obj, phase: Math.random() * 6.28, vel: new Vector3(), glow: G.fx.glows.add(from, SPECIES[id].glow, 0.35) };
    this.list.push(s);
    return s;
  }

  // One follower per species (the Sprite Book keeps the count), like rebuild().
  add(id, from) {
    if (id === 'doudou' || this.list.length >= MAX || this.list.some((s) => s.id === id)) return;
    this.spawn(id, from || G.player.position);
  }

  update(dt) {
    const p = G.player;
    if (!p) return;
    const n = this.list.length;
    this.list.forEach((s, i) => {
      // slots in a loose arc behind her, bobbing
      const a = p.facing + Math.PI + (i - (n - 1) / 2) * 0.55;
      const r = 0.9 + (i % 2) * 0.35;
      s.phase += dt * 2;
      _t.set(p.position.x + Math.sin(a) * r, p.position.y + 1.05 + Math.sin(s.phase) * 0.12 + (i % 2) * 0.2, p.position.z + Math.cos(a) * r);
      s.vel.lerp(_t.sub(s.obj.position).multiplyScalar(4), Math.min(1, dt * 3));
      s.obj.position.addScaledVector(s.vel, dt);
      s.obj.rotation.y = Math.atan2(p.position.x - s.obj.position.x, p.position.z - s.obj.position.z);
      G.fx.glows.set(s.glow, _t.copy(s.obj.position).setY(s.obj.position.y + 0.08));
      if (Math.random() < dt * 1.5) G.fx.sparkles.emit(s.obj.position, 1, SPECIES[s.id].glow, { speed: 0.2, up: 0.2, size: 0.06, life: 0.8 });
    });
  }
}
