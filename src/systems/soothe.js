// SPDX-License-Identifier: GPL-3.0-only
// The Lullaby Thread: hold Hum near a Grumbling to wrap it in glowing yarn. Re-pressing Hum on the
// lullaby's beat gives a bonus; tantrum hits snap the thread and cost Calm. Calm at zero means a short
// sit-down (Doudou: "five more minutes") — never a game over.
import { Vector3 } from 'three';
import { G } from '../game.js';
import { Ribbon } from '../render/vfx.js';

const RANGE = 7.5;
const _a = new Vector3();
const _b = new Vector3();
const PTS = Array.from({ length: 96 }, () => new Vector3());

export class Soothe {
  constructor() {
    this.target = null;
    this.calm = 4;
    this.maxCalm = 4;
    this.sinceHit = 99;
    this.ribbon = new Ribbon(96, 0.045, '#ffb35c');
    this.cocoonRibbon = new Ribbon(96, 0.03, '#ffcf8a');
    this.perfectStreak = 0;
    this.show = 0;
  }

  attach(scene) {
    scene.add(this.ribbon.mesh, this.cocoonRibbon.mesh);
  }

  pickTarget() {
    const p = G.player;
    let best = null,
      bd = RANGE;
    for (const g of G.grumblings) {
      if (!g.active) continue;
      const d = g.position.distanceTo(p.position);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  hit(g, calmCost = 1, snap = true) {
    const p = G.player;
    if (p.state !== 'move') return;
    this.sinceHit = 0;
    if (snap && this.target) {
      this.target.snap(0.12);
      G.audio.play('snap');
      G.fx.sparkles.emit(_a.copy(p.position).setY(p.position.y + 0.8), 8, '#ffb35c', { speed: 1.5, size: 0.08, life: 0.6 });
    }
    G.cam.shake = 0.25;
    if (calmCost > 0) {
      this.calm = Math.max(0, this.calm - calmCost);
      G.ui.floaty(_a.copy(p.position).setY(p.position.y + 1.5), 'Calm −1');
    }
    if (this.calm <= 0) this.overwhelmed(g);
  }

  async overwhelmed(g) {
    const p = G.player;
    p.overwhelm();
    this.target = null;
    this.ribbon.hide();
    G.audio.setHumming(false);
    g?.snap(0.35);
    if (p.doudou) p.doudou.userData.awake = true;
    G.ui.bubble(p.root, 'Doudou: “Five more minutes…”', 2.6, 1.55);
    G.audio.play('yawn');
    await new Promise((r) => setTimeout(r, 2800));
    if (p.doudou) p.doudou.userData.awake = false;
    this.calm = this.maxCalm;
    p.setState('move');
    G.events.emit('recovered');
  }

  update(dt) {
    const p = G.player;
    if (!p) return;
    this.sinceHit += dt;
    if (this.sinceHit > 4 && this.calm < this.maxCalm) {
      this.calm++;
      this.sinceHit = 2.5;
    }
    const humming = p.humming && p.state === 'move';
    G.audio.setHumming(humming);
    if (humming) {
      if (!this.target || !this.target.active || this.target.position.distanceTo(p.position) > RANGE + 1) this.target = this.pickTarget();
    } else if (this.target && !this.target.active) this.target = null;

    const t = humming ? this.target : null;
    let active = false;
    if (t) {
      p.h.worldBone('hand_R', _a);
      _b.copy(t.position);
      _b.y += 0.3 * t.size;
      const los = G.collision ? G.collision.hasLineOfSight(_a, _b) : true;
      if (los) {
        active = true;
        // on-beat bonus when Hum is (re)pressed near a pulse
        if (G.input.pressed('hum')) {
          const b = G.audio.beat();
          const off = Math.min(b.phase, 1 - b.phase) * (60 / 84);
          if (off < 0.13) {
            this.perfectStreak++;
            t.wrap(0.07);
            G.audio.play('perfect');
            G.ui.floaty(_b, this.perfectStreak > 1 ? `♪ Perfect ×${this.perfectStreak}` : '♪ Perfect!');
          } else this.perfectStreak = 0;
        }
        const rate = (1 / (t.def.wrap || 5)) * t.rate();
        t.wrap(rate * dt);
        this.drawThread(_a, t);
      }
    }
    if (!active) this.ribbon.hide();
    this.drawCocoons();
    G.cam.focus = active ? t.position : null;
    // HUD: show the ring whenever a noticed Grumbling is nearby
    const near = t || [...G.grumblings].find((g) => g.noticed && g.active && g.position.distanceTo(p.position) < 10);
    this.show = near ? 1 : Math.max(0, this.show - dt);
    if (near) G.ui.soothe(true, near.progress, this.calm, `“${near.def.feeling}”`, active ? '♪' : 'Hum');
    else if (this.show <= 0) G.ui.soothe(false);
  }

  // Thread from her hand arcs to the target, then spirals around it as the wrap progresses.
  drawThread(from, t) {
    const n = 96;
    const center = _b.copy(t.position);
    center.y += 0.28 * t.size;
    const r = 0.36 * t.size;
    const spiralN = Math.floor(20 + t.progress * 60);
    const arcN = n - spiralN;
    const time = G.time;
    const first = PTS[arcN - 1];
    const a0 = time * 3;
    first.set(center.x + Math.cos(a0) * r, center.y - r * 0.6, center.z + Math.sin(a0) * r);
    for (let i = 0; i < arcN; i++) {
      const k = i / (arcN - 1);
      const q = PTS[i];
      q.lerpVectors(from, first, k);
      q.y += Math.sin(k * Math.PI) * 0.35 + Math.sin(k * 12 - time * 8) * 0.03 * (1 - k);
    }
    for (let i = 0; i < spiralN; i++) {
      const k = i / Math.max(1, spiralN - 1);
      const a = a0 + k * Math.PI * 2 * (2 + t.progress * 6);
      const y = -0.6 + k * 1.2 * (0.4 + t.progress * 0.6);
      const rr = r * Math.sqrt(Math.max(0.05, 1 - y * y)) * 1.05;
      PTS[arcN + i].set(center.x + Math.cos(a) * rr, center.y + y * r, center.z + Math.sin(a) * rr);
    }
    this.ribbon.set(PTS, G.camera);
  }

  drawCocoons() {
    // a slowly turning wrap around any cocooned Grumbling
    const c = [...G.grumblings].find((g) => g.state === 'cocoon' || g.state === 'sleep');
    if (!c) {
      this.cocoonRibbon.hide();
      return;
    }
    const center = _b.copy(c.position);
    center.y += 0.25;
    const n = 90;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const a = k * Math.PI * 16 + G.time * 2;
      const y = -0.9 + k * 1.8;
      const rr = 0.31 * Math.sqrt(Math.max(0.02, 1 - y * y * 0.8));
      PTS[i].set(center.x + Math.cos(a) * rr, center.y + y * 0.3, center.z + Math.sin(a) * rr);
    }
    this.cocoonRibbon.set(PTS.slice(0, n), G.camera, 0.025);
  }
}
