// SPDX-License-Identifier: GPL-3.0-only
// The Great Sulk (Chapter 5): "a Grumbling the size of a building, shaped like a huge grey blanket-lump with
// just two enormous tearful eyes peeking out. Every forgotten birthday, unanswered letter, and 'I'm fine,
// really' in Lantern Bay has piled into it. It doesn't attack. It just sighs."
// The model is sulk.glb (tools/blender/build_sulk.py); everything it does is here: it breathes, its heavy
// lids droop and lift, its eyes follow Pip slowly, tears well up and fall, it heaves when it sighs. Colour
// seeps back into it as the finale's phases pass, and each of the seven patches on its blanket warms into
// its own colour when the feeling it stands for is comforted. In the end it falls asleep.
// Loaded only with the zone that has it (world/zones/heart.js).
import { Color, Vector3 } from 'three';
import { G } from '../game.js';
import { loadGLB } from '../core/assets.js';
import { materialFor } from '../render/materials.js';

const GREY = new Color(0.82, 0.84, 0.9);
const WARM = new Color(1.32, 1.14, 0.98);
// what each patch warms into (the Charm Sprites' own colours, a little stronger; Bean's is his cream)
export const PATCH_COLORS = { cloud: '#8fcaff', sock: '#ff9d86', homework: '#ffe27a', pompom: '#dba6ff', sparrow: '#ffbb6a', grey: '#aebee6', bean: '#ffe9c4' };
const _v = new Vector3(),
  _w = new Vector3();

export class Sulk {
  static async create(zone, at, facing = Math.PI) {
    const gltf = await loadGLB('sulk');
    return new Sulk(zone, gltf.scene.getObjectByName('sulk') || gltf.scene, at, facing);
  }

  constructor(zone, model, at, facing) {
    this.zone = zone;
    const o = (this.obj = model);
    o.position.copy(at);
    o.rotation.y = facing;
    this.parts = {};
    this.patches = {};
    for (const c of o.children) {
      const key = c.name.slice(5);
      if (key.startsWith('patch_')) this.patches[key.slice(6)] = { obj: c, warm: 0, to: 0 };
      else this.parts[key] = c;
    }
    // every part gets a material of its own (one shared program), so each can be tinted
    const mat = (o3, key, kind) => {
      const m = materialFor(kind, { key: 'sulk-' + key });
      o3.traverse((x) => {
        if (!x.isMesh) return;
        x.material = m;
        x.castShadow = false;
        x.receiveShadow = false;
      });
      return m;
    };
    this.bodyMat = mat(this.parts.body, 'body', 'mixed');
    this.lidMat = mat(this.parts.lids, 'lids', 'mixed');
    for (const k of ['eyes', 'pupils']) this.parts[k]?.traverse((x) => x.isMesh && (x.material = materialFor('mixed')));
    for (const [id, p] of Object.entries(this.patches)) {
      p.mat = mat(p.obj, 'patch-' + id, 'mixed');
      p.mat.color.copy(GREY);
      p.color = new Color(PATCH_COLORS[id] || '#ffffff');
    }
    this.pupil0 = this.parts.pupils?.position.clone();
    this.warmth = 0; // 0 grey .. 1 comforted
    this.warmTo = 0;
    this.lid = 1.25; // the lids' droop: 1 open and sad, 2.8 shut
    this.lidTo = 1.25;
    this.heaveT = 9;
    this.tearT = 0;
    this.tears = 1; // how freely it weeps (0 when comforted)
    this.asleep = false;
    this.size = 1;
    this.t = 0;
    zone.group.add(o);
    zone.sulk = this;
    this.tick = (dt) => this.update(dt);
    zone.updaters.push(this.tick);
  }

  get position() {
    return this.obj.position;
  }
  // Where a part is in the world (a patch's centre, an eye).
  at(part, out = new Vector3()) {
    const o = this.patches[part]?.obj || this.parts[part];
    return o ? o.getWorldPosition(out) : out.copy(this.obj.position);
  }

  // Colour seeps back into it (k: 0 grey .. 1 comforted), and its lids lift.
  comfort(k) {
    this.warmTo = Math.max(this.warmTo, k);
    this.tears = Math.max(0, 1 - k * 1.2);
    if (!this.asleep) this.lidTo = 1.25 - k * 0.3;
  }
  warmPatch(id) {
    const p = this.patches[id];
    if (!p) return;
    p.to = 1;
    this.at(id, _v);
    G.fx.sparkles.emit(_v, 40, p.color, { speed: 2.2, up: 1.2, size: 0.22, life: 1.6, spread: 1.4 });
  }
  // A sigh: it heaves, and its lids sink.
  heave() {
    this.heaveT = 0;
  }
  sleep() {
    this.asleep = true;
    this.lidTo = 2.9;
    this.tears = 0;
    this.warmTo = 1;
  }

  update(dt) {
    const o = this.obj;
    this.t += dt;
    const p = G.player;
    // breathing: slow and enormous; slower still asleep
    const br = Math.sin(this.t * (this.asleep ? 0.7 : 1.1)) * (this.asleep ? 0.018 : 0.012);
    this.heaveT += dt;
    const hv = this.heaveT < 3 ? Math.sin((this.heaveT / 3) * Math.PI) : 0;
    const s = this.size;
    o.scale.set(s * (1 - br * 0.5 + hv * 0.03), s * (1 + br - hv * 0.05), s * (1 - br * 0.5 + hv * 0.03));
    // colour
    this.warmth += (this.warmTo - this.warmth) * Math.min(1, dt * 0.5);
    this.bodyMat.color.lerpColors(GREY, WARM, this.warmth);
    this.lidMat.color.copy(this.bodyMat.color);
    for (const pt of Object.values(this.patches)) {
      pt.warm += (pt.to - pt.warm) * Math.min(1, dt * 0.8);
      pt.mat.color.lerpColors(GREY, pt.color, pt.warm);
    }
    // lids: they sink when it sighs, and blink now and then
    const blink = !this.asleep && this.t % 6.3 < 0.16 ? 1.4 : 0;
    this.lid += (this.lidTo + hv * 0.7 + blink - this.lid) * Math.min(1, dt * (blink ? 14 : 2.5));
    if (this.parts.lids) this.parts.lids.scale.y = this.lid;
    // its pupils follow her, slowly (in its own frame: x is its left)
    if (this.parts.pupils && p && !this.asleep) {
      _v.copy(p.position).sub(o.position);
      const yaw = o.rotation.y;
      const lx = _v.x * Math.cos(yaw) - _v.z * Math.sin(yaw);
      const want = _w.copy(this.pupil0);
      want.x += Math.max(-0.42, Math.min(0.42, lx / 26));
      want.y -= 0.22;
      this.parts.pupils.position.lerp(want, Math.min(1, dt * 1.2));
    }
    // tears: one wells up and falls from each eye in turn
    if (this.tears > 0.05 && p && (this.tearT -= dt) < 0 && p.position.distanceTo(o.position) < 45) {
      this.tearT = 0.5 + Math.random() * 1.6 / this.tears;
      // (the bottom of an eye, in the model's own frame: tools/blender/build_sulk.py)
      _v.set((Math.random() < 0.5 ? -1 : 1) * 1.63, 3.3, 5.05);
      o.localToWorld(_v);
      G.fx.sparkles.emit(_v, 1, '#b9dcff', { speed: 0.05, up: -2.2, size: 0.42 * s, life: 2.4, spread: 0.2 });
    }
  }
}
