// SPDX-License-Identifier: GPL-3.0-only
// Bean, awake (Chapter 4 on). He climbs out of the hood onto the top of Pip's head, eyes open and ears up, and
// talks as she walks (bubbles over him, never a dialogue box). He was a piece of the great fog himself, one
// that got loved, so he carries a small circle of colour and clear air with him: one of the zone's pockets
// (systems/fog.js), moving with her. Its size is her Calm: 9 m at full Calm, 3 m at one. Lose Calm and you
// see less. Loaded only with the zones that use it.
import { Object3D, Vector3 } from 'three';
import { G } from '../game.js';
import { seatDoudou } from '../actors/player.js';
import { materialFor } from '../render/materials.js';
import { usePockets } from './fog.js';

const _p = new Vector3();

export class Bean {
  // circle: false for Bean awake without his circle of colour (out of the fog)
  constructor(zone, { circle = true } = {}) {
    this.zone = zone;
    const p = G.player;
    const d = (this.obj = p.doudou);
    this.out = false;
    this.radius = 0;
    this.earT = 0;
    this.lookAt = null; // a Vector3 he turns to (else he looks the way she walks)
    this.sayT = 0;
    this.queue = [];
    if (circle) {
      this.pocket = { position: p.position, radius: 0.01 };
      usePockets(zone).push(this.pocket);
    }
    this.glow = G.fx.glows.add(p.position, '#ffe2b0', 0);
    zone.bean = this;
    this.tick = (dt) => this.update(dt);
    zone.updaters.push(this.tick);
    const exit = zone.onExit;
    zone.onExit = () => {
      exit?.();
      this.tuckIn();
    };
    if (d) d.userData.homeScale = d.userData.baseScale || d.scale.x;
  }

  // Out of the hood, onto her head.
  climbOut() {
    const p = G.player,
      d = this.obj;
    if (this.out || !d) return;
    this.out = true;
    const h = p.h;
    h.root.updateMatrixWorld(true);
    // On top of her head: her head is wider than her shoulders, so on a shoulder he was hidden behind her
    // cheek from the front. A holder that faces the way she faces rides on her head bone; Bean turns inside
    // it (so his yaw is simply "relative to her").
    const top = h.bones.head || h.bones.chest;
    top.getWorldPosition(_p);
    _p.y = h.root.position.y + h.height * h.root.scale.y - 0.035;
    _p.x -= Math.sin(p.facing) * 0.02;
    _p.z -= Math.cos(p.facing) * 0.02;
    const hold = (this.hold ||= new Object3D());
    h.root.add(hold);
    hold.position.copy(h.root.worldToLocal(_p.clone()));
    hold.quaternion.identity();
    hold.scale.setScalar(1);
    hold.updateMatrixWorld(true);
    top.attach(hold);
    const scale = d.getWorldScale(_p).x / h.root.scale.x;
    hold.add(d);
    d.position.set(0, 0, 0);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(scale * 1.1);
    d.userData.baseScale = scale * 1.1;
    const s = d.userData;
    s.awake = true;
    // warm, against the grey: he was a piece of the fog that got loved
    s.body?.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.asleep = m.material;
      m.material = materialFor(m.material.name, { emissive: '#5a4a34' });
    });
    G.fx.sparkles.emit(d.getWorldPosition(_p), 14, '#ffe2b0', { speed: 0.6, size: 0.08 });
  }

  // Back into the hood, asleep.
  tuckIn() {
    const d = this.obj;
    if (!this.out || !d) return;
    this.out = false;
    const s = d.userData;
    s.awake = false;
    s.body?.traverse((m) => m.isMesh && m.userData.asleep && (m.material = m.userData.asleep));
    s.parts?.ears?.rotation.set(0, 0, 0);
    s.parts?.ears?.scale.setScalar(1);
    d.removeFromParent();
    this.hold?.removeFromParent();
    d.scale.setScalar(1);
    s.baseScale = 0;
    seatDoudou(G.player.h, d);
  }

  // He says something, as a bubble over him; lines said at once queue up.
  say(text, life = 2.2 + text.length / 16) {
    if (!text) return;
    this.queue.push([text, life]);
  }
  // Ears up, wide eyes (a sigh on its way).
  alert(seconds = 2.5) {
    this.earT = seconds;
  }

  update(dt) {
    const p = G.player,
      d = this.obj;
    if (!d) return;
    const calm = G.soothe.calm;
    // his circle: its size is her Calm
    const want = this.out ? Math.max(3, 3 + (calm - 1) * 2) : 0.01;
    this.radius += (want - this.radius) * Math.min(1, dt * 1.5);
    if (this.pocket) this.pocket.radius = this.radius;
    d.getWorldPosition(_p);
    G.fx.glows.set(this.glow, _p, null, this.out ? 0.5 + Math.sin(G.time * 2.3) * 0.08 : 0);
    if (!this.out) return;
    const s = d.userData;
    // he blinks (Player.updateDoudou shows his open eyes while he's awake)
    const blink = G.time % 4.3 < 0.12 ? 0.15 : 1;
    if (s.parts?.open) s.parts.open.scale.y = blink * (this.earT > 0 ? 1.15 : 1);
    this.earT -= dt;
    // his ears: perked up and quivering when something is coming, a lazy twitch otherwise
    const ears = s.parts?.ears;
    if (ears) {
      const up = this.earT > 0 ? 1 : 0;
      ears.scale.y += (1 + up * 0.35 - ears.scale.y) * Math.min(1, dt * 10);
      ears.rotation.x = -up * 0.25 + Math.sin(G.time * (up ? 26 : 1.9)) * (up ? 0.05 : 0.04);
    }
    // he turns to what he is talking about
    let yaw = 0;
    if (this.lookAt) {
      const a = Math.atan2(this.lookAt.x - p.position.x, this.lookAt.z - p.position.z) - p.facing;
      yaw = Math.max(-1.4, Math.min(1.4, Math.atan2(Math.sin(a), Math.cos(a))));
    }
    d.rotation.y += (yaw - d.rotation.y) * Math.min(1, dt * 4);
    // what he has to say, one bubble after another (never over a dialogue box)
    this.sayT -= dt;
    if (this.sayT <= 0 && this.queue.length && !G.ui.dialogueOpen) {
      const [text, life] = this.queue.shift();
      G.ui.bubble(d, text, life, 0.3);
      this.sayT = life + 0.5;
      G.events.emit('bean-said', text);
    }
  }
}
