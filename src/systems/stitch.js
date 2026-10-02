// SPDX-License-Identifier: GPL-3.0-only
// Stitch: what the Lullaby Thread can do after Bean's secret (Chapter 4). "You don't just soothe feelings.
// You stitch them back to people." A loose end is a frayed, glowing end of thread hanging in the air, with a
// small picture of what it is. Take it (Interact) and the thread runs from Pip's hand to it; walk it to
// where it belongs (that place glows the same colour) and hold Hum for four beats: presses on the beat make
// it quicker, as in soothing. A stitch leaves a golden thread between the two for good: it lights its
// stretch of street (the lamp map), brings its colour back (a pocket) and is shelter from the sighs.
// Cozy Energy powers it: a stitch spends 10; with none left it still works, in twice the beats, so nobody
// can be stuck. A sigh that catches her makes the thread slip out of her hand. Loaded only with the zones
// and scenes that use it.
import { Vector3 } from 'three';
import { G, flag } from '../game.js';
import { Ribbon } from '../render/vfx.js';
import { writeSave } from '../core/save.js';
import { BEAT } from '../core/audio.js';
import { sfx, usePockets } from './fog.js';

const REACH = 25; // metres of thread
const COST = 10; // Cozy Energy a stitch spends
const N = 40;
const PTS = Array.from({ length: N }, () => new Vector3());
const _a = new Vector3(),
  _b = new Vector3();
const at = (v) => (typeof v === 'function' ? v() : v);

// the little pictures over a loose end and where it belongs: round, with no speech tail
const CSS = '.bubble.pin{padding:3px 7px;border-radius:999px;background:#fff8e6e6;font-size:calc(17px*var(--ts,1));box-shadow:0 0 12px #ffd98a}.bubble.pin::after{display:none}';

export class Stitch {
  // sighs: the zone's Sighs (systems/sigh.js), if it has them: a stitched thread is shelter, a sigh makes her
  // drop a carried one. light: stitched threads light the lamp map (zones that have one).
  constructor(zone, { sighs = null } = {}) {
    this.zone = zone;
    this.sighs = sighs;
    this.defs = [];
    this.holding = null;
    this.progress = 0;
    if (!document.getElementById('stitch-css')) {
      const st = document.createElement('style');
      st.id = 'stitch-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.held = new Ribbon(N, 0.055, '#ffd98a');
    zone.group.add(this.held.mesh);
    zone.stitch = this;
    zone.on('sigh-pass', ({ caught }) => caught && this.drop('sigh'));
    this.tick = (dt) => this.update(dt);
    G.updaters.add(this.tick); // after Interact and Soothe (the prompt and the humming here win)
    const exit = zone.onExit;
    zone.onExit = () => {
      exit?.();
      this.drop();
      G.updaters.delete(this.tick);
      for (const d of this.defs) this.clear(d);
    };
  }

  // def: { id, from, to (a Vector3 or a function giving one: where the loose end hangs, and where it belongs),
  //   icon, color, take (the prompt), what (the place it belongs, for the tip), beats (4), enabled(),
  //   onTake(), onDone(), save (true: remembered as the flag stitch_<id>), pocket (radius of the colour it
  //   brings back, 0 for none), keep (true: the golden thread stays) }
  add(def) {
    const d = { icon: '🧵', color: '#ffd98a', take: 'Take the loose end', beats: 4, save: true, pocket: 7, keep: true, enabled: () => true, ...def };
    d.done = d.save && flag('stitch_' + d.id);
    d.end = new Ribbon(10, 0.05, d.color); // the frayed end, waving
    d.thread = new Ribbon(N, 0.05, '#ffd98a');
    this.zone.group.add(d.end.mesh, d.thread.mesh);
    d.glowA = G.fx.glows.add(at(d.from), d.color, 0);
    d.glowB = G.fx.glows.add(at(d.to), d.color, 0);
    d.anchor = { position: new Vector3() };
    d.it = this.zone.addInteractable({
      position: new Vector3(),
      radius: 2.4,
      priority: 1.4,
      label: d.take,
      enabled: () => !d.done && !this.holding && d.enabled(),
      action: () => this.take(d),
    });
    this.defs.push(d);
    if (d.done) this.finish(d, true);
    return d;
  }
  get(id) {
    return this.defs.find((d) => d.id === id);
  }
  remove(id) {
    const d = this.get(id);
    if (!d) return;
    if (this.holding === d) this.drop();
    this.clear(d);
    this.defs.splice(this.defs.indexOf(d), 1);
    G.interactables.delete(d.it);
  }
  clear(d) {
    for (const b of [d.bubbleA, d.bubbleB]) if (b) b.life = 0;
    d.bubbleA = d.bubbleB = null;
    d.end.mesh.removeFromParent();
    d.thread.mesh.removeFromParent();
    G.fx.glows.set(d.glowA, _a.set(0, -99, 0), null, 0);
    G.fx.glows.set(d.glowB, _a, null, 0);
  }

  take(d) {
    this.holding = d;
    this.progress = 0;
    this.warned = false;
    sfx.pluck();
    d.onTake?.();
    G.events.emit('thread-taken', d);
    if (!G.save.story.stitchTip) {
      G.save.story.stitchTip = true;
      G.ui.toast(`💡 Walk the thread to ${d.what || 'where it belongs'} (it glows the same colour), then hold <b>Hum</b> to stitch it there.`, 6.5);
    }
  }

  drop(why = '') {
    const d = this.holding;
    if (!d) return;
    this.holding = null;
    this.progress = 0;
    this.held.hide();
    const p = G.player;
    p.canHum = true;
    p.overlayName = null;
    G.audio.setHumming(false);
    if (why) {
      sfx.slip();
      G.ui.floaty(_a.copy(p.position).setY(p.position.y + 1.5), why === 'sigh' ? 'The thread slipped!' : 'The thread won’t reach!');
    }
    G.events.emit('thread-dropped', { def: d, why });
  }

  // The stitch is made (quiet: it was made on an earlier visit).
  finish(d, quiet = false) {
    d.done = true;
    const a = at(d.from).clone(),
      b = at(d.to).clone();
    d.a = a;
    d.b = b;
    G.interactables.delete(d.it);
    for (const bb of [d.bubbleA, d.bubbleB]) if (bb) bb.life = 0;
    d.bubbleA = d.bubbleB = null;
    d.end.hide();
    const z = this.zone;
    if (d.keep) {
      if (d.pocket) usePockets(z).push({ position: a.clone().lerp(b, 0.5), radius: Math.max(d.pocket, a.distanceTo(b) / 2 + 2.5) });
      this.sighs?.warm.push({ a, b, radius: 3 });
      if (z.lampList) {
        const n = Math.max(2, Math.ceil(a.distanceTo(b) / 4));
        for (let i = 0; i <= n; i++) z.lampList.push({ position: a.clone().lerp(b, i / n), color: '#ffc46b', radius: 4.5, intensity: 0.8 });
        z.relight();
      }
    }
    if (quiet) return;
    if (d.save) {
      flag('stitch_' + d.id, true);
      writeSave(G.save);
    }
    sfx.stitch();
    for (let i = 0; i <= 12; i++) G.fx.sparkles.emit(_a.copy(a).lerp(b, i / 12).setY(a.y + (b.y - a.y) * (i / 12) + 1.2), 3, '#ffe2a8', { speed: 0.6, up: 0.6, size: 0.12, life: 1.3 });
    this.sighs?.comfort(1);
    d.onDone?.();
    G.events.emit('stitched', d);
  }

  update(dt) {
    const p = G.player;
    if (!p) return;
    const t = G.time;
    for (const d of this.defs) {
      const from = at(d.from),
        to = at(d.to);
      d.it.position.copy(from);
      if (d.done) {
        // the golden thread, for good: a gentle sag between the two, breathing a little
        if (!d.keep) continue;
        this.curve(d.a, d.b, 1.25, 0.5 + Math.sin(t * 1.1 + d.a.x) * 0.04);
        d.thread.set(PTS, G.camera, 0.05);
        continue;
      }
      const on = d.enabled();
      const mine = this.holding === d;
      // the loose end: a short frayed thread waving above its spot (in her hand while she carries it)
      if (on && !mine) {
        for (let i = 0; i < 10; i++) {
          const k = i / 9;
          PTS[i].set(from.x + Math.sin(t * 1.7 + k * 3 + from.z) * 0.12 * k, from.y + 0.75 + k * 0.55, from.z + Math.cos(t * 1.3 + k * 4) * 0.1 * k);
        }
        d.end.set(PTS, G.camera, 0.05, 10);
      } else d.end.hide();
      G.fx.glows.set(d.glowA, _a.copy(from).setY(from.y + 1.1), null, on ? 0.55 + Math.sin(t * 2.4) * 0.12 : 0);
      // where it belongs: a soft glow, brighter while she carries it there
      G.fx.glows.set(d.glowB, _a.copy(to).setY(to.y + 1.1), null, on ? (mine ? 0.9 + Math.sin(t * 5) * 0.2 : 0.3) : 0);
      // the same little picture over both ends (only from nearby: they would show through the walls)
      // (the place it belongs shows its picture once she carries the thread, or stands close)
      const pin = (key, obj, show) => {
        if (show && !d[key]) (d[key] = G.ui.bubble(obj, d.icon, 1e9, 1.75)).el.classList.add('pin');
        else if (!show && d[key]) {
          d[key].life = 0;
          d[key] = null;
        }
      };
      d.it.obj ||= { position: d.it.position };
      pin('bubbleA', d.it.obj, on && !mine && from.distanceTo(p.position) < 16);
      pin('bubbleB', d.anchor, on && (mine || to.distanceTo(p.position) < 6));
      d.anchor.position.copy(to);
    }
    const d = this.holding;
    if (!d) return;
    if (p.state !== 'move') return this.drop(); // a scene took over, or she sat down
    const from = at(d.from),
      to = at(d.to);
    // the thread from her hand back to where she took it
    p.h.worldBone('hand_R', _a);
    const far = _b.copy(from).setY(from.y + 0.9).distanceTo(_a);
    this.curve(_a, _b, 0, Math.max(0.05, 0.9 * (1 - far / REACH)));
    this.held.set(PTS, G.camera, 0.055);
    if (far > REACH - 4 && !this.warned) {
      this.warned = true;
      G.ui.floaty(_b.copy(p.position).setY(p.position.y + 1.5), 'The thread is nearly taut…');
    }
    if (far > REACH + 1) return this.drop('far');
    // stitching: close to where it belongs, hold Hum
    const near = Math.hypot(to.x - p.position.x, to.z - p.position.z) < 2.8 && Math.abs(to.y - p.position.y) < 2.5;
    p.canHum = !near;
    if (!near) {
      this.progress = Math.max(0, this.progress - dt * 0.3);
      p.overlayName = null;
      return;
    }
    const input = G.input;
    const hum = !G.frozen && input.humHeld;
    const beats = d.beats * (d.free || G.save.cozy >= COST ? 1 : 2);
    if (hum) {
      if (input.pressed('hum')) {
        const b = G.audio.beat();
        const off = Math.min(b.phase, 1 - b.phase) * BEAT;
        if (off < 0.13) {
          this.progress += 1 / beats;
          G.audio.play('perfect');
          G.ui.floaty(_b.copy(to).setY(to.y + 1.6), '♪ Perfect!');
        }
      }
      this.progress += dt / (beats * BEAT);
      // she turns to it, humming
      const want = Math.atan2(to.x - p.position.x, to.z - p.position.z);
      p.facing += Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing)) * Math.min(1, dt * 8);
      if (Math.random() < dt * 10) G.fx.sparkles.emit(_b.copy(to).setY(to.y + 1), 1, '#ffe2a8', { speed: 0.4, up: 0.5, size: 0.1, life: 0.9 });
    } else this.progress = Math.max(0, this.progress - dt * 0.15);
    G.audio.setHumming(hum);
    p.overlayName = hum ? 'hum' : null;
    G.ui.prompt('Stitch it here', input.device === 'touch' ? 'Hum' : 'hold ' + input.label('hum'));
    G.touch?.setAct('');
    G.ui.soothe(true, Math.min(1, this.progress), G.soothe.calm, G.save.cozy >= COST || d.free ? '“Stitch it back.”' : '“Stitch it back.” (no Cozy Energy: slower)', hum ? '♪' : 'Hum');
    if (this.progress >= 1) {
      if (!d.free) G.collection.spend(COST);
      this.holding = null;
      this.held.hide();
      p.canHum = true;
      p.overlayName = null;
      G.audio.setHumming(false);
      this.progress = 0;
      this.finish(d);
    }
  }

  // A sagging thread from a to b into PTS (lift: metres both ends are raised above their points).
  curve(a, b, lift, sag) {
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      PTS[i].lerpVectors(a, b, k);
      PTS[i].y += lift - Math.sin(k * Math.PI) * sag;
    }
  }
}
