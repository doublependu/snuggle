// SPDX-License-Identifier: GPL-3.0-only
// The Great Sulk's sighs (Chapters 4 and 5). "It doesn't attack. It just sighs, and the sigh makes everyone
// who hears it want to curl up alone and give up." A sigh is a wide, slow front of grey that sets out from
// the heart of the district and rolls down the streets. You hear it set out, and you are warned three
// seconds before it reaches you. Caught in the open, Pip slows to a shuffle and loses one Calm, and a thread
// she is carrying slips out of her hand. Sheltered, nothing happens: something solid between her and where
// the sigh comes from (a wall, a doorway, a cart), or a warm spot (a lit window, a restored memory, a
// stitched thread). Calm only comes back in a warm spot here, and it is also how far Bean's colour reaches
// (systems/bean.js), so it matters. Out of Calm she sits down for "five more minutes" and gets up at the last
// warm spot: there is no game over. Loaded only with the zones that use it.
import { CylinderGeometry, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { G } from '../game.js';
import { shared } from '../render/materials.js';
import { sfx } from './fog.js';

const SPEED = 8; // m/s: you can watch it come down a street
const _a = new Vector3(),
  _b = new Vector3(),
  _d = new Vector3();

const CSS = `.calmhud{display:flex;align-items:center;gap:5px;padding:4px 10px 4px 8px;border-radius:999px;background:#fbf4e8e6;font-weight:800;font-size:calc(12px*var(--ts,1));width:max-content;box-shadow:0 2px 8px #0002}
.calmhud i{width:13px;height:13px;border-radius:50%;background:#f6b3a0;border:2px solid #fff;box-shadow:0 1px 3px #0003;transition:opacity .2s,transform .2s}
.calmhud i.gone{opacity:.25;transform:scale(.7)}
.calmhud.low{animation:calmlow 1s ease-in-out infinite}
@keyframes calmlow{50%{box-shadow:0 0 0 4px #f6b3a088}}
.sighwarn{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity .6s;box-shadow:inset 0 0 120px 40px #dfe3ea}
.sighwarn.on{opacity:.9}
.sighwarn.safe{box-shadow:inset 0 0 90px 20px #ffe2a8}`;

export class Sighs {
  // source: where the sighs come from (Vector3). axis: a unit vector pointing that way, for sighs that roll
  // up the streets as one straight front (the Old Quarter); without it they spread in rings from the source
  // (the square, round the Great Sulk itself). period: seconds between sighs, or a function.
  // enabled(): sighs set out only while it's true (never during a scene). warm: [{ position, radius }]
  // or [{ a, b, radius }] (along a stitched thread): shelter, and where Calm comes back.
  constructor(zone, { source, axis = null, period = 16, first = 7, enabled = () => true, home = null } = {}) {
    this.zone = zone;
    this.source = source.clone();
    this.axis = axis ? axis.clone().setY(0).normalize() : null;
    this.period = period;
    this.enabled = enabled;
    this.warm = [];
    this.watchers = []; // others a sigh can catch (friends in Chapter 5): { position, fn(sheltered) }
    this.fronts = [];
    this.t = first;
    this.quiet = 0; // seconds a new sigh must still wait (after a scene)
    this.home = home?.clone() || null; // where she gets up if she has not reached a warm spot yet
    this.lastWarm = null;
    this.regenT = 0;
    this.slowT = 0;
    this.count = 0; // sighs that have reached her (for tips and tests)
    this.caught = 0;
    this.was = { noRegen: G.soothe.noRegen };
    G.soothe.noRegen = true;
    if (!document.getElementById('sigh-css')) {
      const st = document.createElement('style');
      st.id = 'sigh-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    // Calm, always on screen here (the soothing ring only shows it near a Grumbling)
    this.hud = document.createElement('div');
    this.hud.className = 'calmhud';
    this.hud.innerHTML = '<span>Calm</span>' + '<i></i>'.repeat(G.soothe.maxCalm);
    document.querySelector('.hud-tl')?.append(this.hud);
    this.warn = document.createElement('div');
    this.warn.className = 'sighwarn';
    G.ui.root.prepend(this.warn);
    // the front you see: one tall ring of drifting grey, scaled out from the source
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uTime: shared.uTime, opacity: { value: 0 } },
      vertexShader: `varying vec3 vP; varying float vH;
        void main(){ vH = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, opacity; varying vec3 vP; varying float vH;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){ float a = (vP.x + vP.z) * 0.3;
          float c = n(vec2(a + uTime * 0.35, vH * 0.7 - uTime * 0.5)) * 0.6 + n(vec2(a * 2.3, vH * 1.9 + uTime * 0.4)) * 0.4;
          float top = 1.0 - smoothstep(0.35, 1.0, vH / 5.5);
          gl_FragColor = vec4(vec3(0.84, 0.86, 0.9), opacity * top * (0.45 + 0.55 * c)); }`,
    });
    // rings from the source, or one straight front across the streets
    this.ring = new Mesh(new CylinderGeometry(1, 1, 5.5, 96, 1, true).translate(0, 2.75, 0), this.mat);
    this.wall = new Mesh(new PlaneGeometry(120, 5.5).translate(0, 2.75, 0), this.mat);
    for (const m of [this.ring, this.wall]) {
      m.frustumCulled = false;
      m.renderOrder = 2;
      m.visible = false;
      zone.group.add(m);
    }
    this.ring.position.copy(this.source);
    this.tick = (dt) => this.update(dt);
    G.updaters.add(this.tick);
    const exit = zone.onExit;
    zone.onExit = () => {
      exit?.();
      this.dispose();
    };
  }

  dispose() {
    G.updaters.delete(this.tick);
    G.soothe.noRegen = this.was.noRegen;
    this.hud.remove();
    this.warn.remove();
    this.ring.removeFromParent();
    this.wall.removeFromParent();
    if (G.player) G.player.moveScale = 1;
  }

  // Is this spot out of the sigh's way? In a warm spot, or with something solid toward where it comes from.
  inWarm(pos) {
    for (const w of this.warm) {
      if (w.a) {
        // along a stitched thread
        _d.subVectors(w.b, w.a);
        const k = Math.max(0, Math.min(1, _b.subVectors(pos, w.a).dot(_d) / Math.max(1e-6, _d.lengthSq())));
        if (_b.copy(w.a).addScaledVector(_d, k).setY(pos.y).distanceTo(pos) < w.radius) return true;
      } else if (Math.hypot(pos.x - w.position.x, pos.z - w.position.z) < w.radius) return true;
    }
    return false;
  }
  sheltered(pos) {
    if (this.inWarm(pos)) return true;
    const col = this.zone.collision;
    if (!col?.bvh) return false;
    if (this.axis) _d.copy(this.axis);
    else _d.set(this.source.x - pos.x, 0, this.source.z - pos.z).normalize();
    // from her chest and from her knees: a low cart shelters only someone who ducks behind all of it
    return [0.95, 0.4].every((hh) => col.raycast(_a.set(pos.x, pos.y + hh, pos.z), _d, 7) < 7);
  }

  // A sigh sets out now (the story calls this for the ones it stages). speed: m/s.
  send(speed = SPEED, from = 3) {
    const f = { r: from, speed, warned: false, done: false, passed: new Set() };
    this.fronts.push(f);
    const d = this.distance(G.player.position);
    sfx.moan(Math.max(0.35, 1 - d / 120));
    G.events.emit('sigh', f);
    return f;
  }
  // How far a spot is from where the sighs set out (along the streets, or straight from the source).
  distance(pos) {
    if (this.axis) return (this.source.x - pos.x) * this.axis.x + (this.source.z - pos.z) * this.axis.z;
    return Math.hypot(pos.x - this.source.x, pos.z - this.source.z);
  }
  // Seconds until the nearest sigh on its way reaches her (Infinity: none).
  eta() {
    const d = this.distance(G.player.position);
    let best = Infinity;
    for (const f of this.fronts) if (!f.done) best = Math.min(best, (d - f.r) / f.speed);
    return best;
  }

  update(dt) {
    const p = G.player;
    if (!p) return;
    const calm = G.soothe.calm;
    // Calm on screen
    this.hud.querySelectorAll('i').forEach((c, i) => c.classList.toggle('gone', i >= calm));
    this.hud.classList.toggle('low', calm <= 1);
    const scene = G.frozen || G.ui.dialogueOpen;
    if (scene) this.quiet = 4;
    else this.quiet = Math.max(0, this.quiet - dt);
    // a new sigh
    if (!scene && this.quiet <= 0 && this.enabled() && p.state !== 'overwhelmed') {
      this.t -= dt;
      if (this.t <= 0) {
        this.t = typeof this.period === 'function' ? this.period() : this.period * (0.9 + Math.random() * 0.2);
        this.send();
      }
    }
    // warm spots: Calm comes back, and this is where she gets up again
    const warm = this.inWarm(p.position);
    if (warm && p.onGround && p.state === 'move') (this.lastWarm ||= new Vector3()).copy(p.position);
    this.regenT = warm && calm < G.soothe.maxCalm ? this.regenT + dt : 0;
    if (this.regenT > 3.5) {
      this.regenT = 0;
      this.comfort(1);
    }
    if (this.slowT > 0 && (this.slowT -= dt) <= 0 && p.moveScale < 1) p.moveScale = 1;
    // the fronts (they wait while a scene plays)
    let near = null;
    const d = this.distance(p.position);
    for (const f of [...this.fronts]) {
      if (!scene) f.r += f.speed * dt;
      const eta = (d - f.r) / f.speed;
      if (!f.done && eta < 3 && !f.warned) {
        f.warned = true;
        G.events.emit('sigh-near', f);
      }
      for (const w of this.watchers) {
        if (f.passed.has(w) || f.r < this.distance(w.position)) continue;
        f.passed.add(w);
        w.fn(this.sheltered(w.position), f);
      }
      if (!f.done && f.r >= d) {
        f.done = true;
        this.reach(f);
      }
      if (f.r > d + 30 && f.r > 20) this.fronts.splice(this.fronts.indexOf(f), 1);
      else if (!near || Math.abs(f.r - d) < Math.abs(near.r - d)) near = f;
    }
    // the one nearest her is the one drawn (two are never close together)
    this.ring.visible = !!near && !this.axis;
    this.wall.visible = !!near && !!this.axis;
    if (near) {
      const gap = Math.abs(near.r - d);
      if (this.axis) {
        this.wall.position.copy(this.source).addScaledVector(this.axis, -near.r);
        this.wall.rotation.y = Math.atan2(this.axis.x, this.axis.z);
      } else {
        this.ring.position.copy(this.source);
        this.ring.scale.set(near.r, 1, near.r);
      }
      this.mat.uniforms.opacity.value = 0.55 * Math.min(1, near.r / 6) * Math.max(0.25, 1 - gap / 60);
    }
    const coming = this.fronts.some((f) => !f.done && f.warned);
    this.warn.classList.toggle('on', coming && !scene);
    this.warn.classList.toggle('safe', coming && this.sheltered(p.position));
  }

  // The front reaches her.
  reach(f) {
    const p = G.player;
    this.count++;
    sfx.pass();
    const safe = this.sheltered(p.position) || p.state !== 'move';
    G.events.emit('sigh-pass', { caught: !safe, front: f });
    // grey motes streaming past, the way the sigh is going
    _a.copy(p.position).setY(p.position.y + 1);
    G.fx.sparkles.emit(_a, 26, '#c9ced8', { speed: 2.2, up: 0.2, size: 0.2, life: 1.3, spread: 3 });
    if (!safe) this.hit();
  }

  // Caught by a sigh (or by a sleeper woken with a start): she slows to a shuffle and loses one Calm.
  hit() {
    const p = G.player;
    this.caught++;
    p.moveScale = 0.35;
    this.slowT = 2.5;
    G.cam.shake = 0.3;
    G.soothe.sinceHit = 0;
    G.soothe.calm = Math.max(0, G.soothe.calm - 1);
    G.ui.floaty(_a.copy(p.position).setY(p.position.y + 1.5), 'Calm −1');
    if (G.soothe.target) G.soothe.target.snap(0.12);
    G.events.emit('sighed');
    if (G.soothe.calm <= 0) this.rest();
  }

  // Calm back (a warm spot, a comforted Grumbling, a stitch).
  comfort(n = 1) {
    const s = G.soothe;
    if (s.calm >= s.maxCalm) return;
    s.calm = Math.min(s.maxCalm, s.calm + n);
    G.ui.floaty(_a.copy(G.player.position).setY(G.player.position.y + 1.5), 'Calm +' + n);
  }

  // Out of Calm: she sits down where she is; Bean keeps watch; she gets up at the last warm spot.
  async rest() {
    const p = G.player;
    if (this.resting) return;
    this.resting = true;
    p.overwhelm();
    G.soothe.target = null;
    G.audio.setHumming(false);
    G.audio.play('yawn');
    G.ui.bubble(p.doudou || p.root, G.zone?.bean ? 'Five more minutes. I’ll keep watch.' : 'Bean: “Five more minutes…”', 3, p.doudou ? 0.3 : 1.55);
    G.events.emit('rested');
    await new Promise((r) => setTimeout(r, 3000));
    this.resting = false;
    if (G.zone !== this.zone) return;
    const at = this.lastWarm || this.home;
    await G.ui.fade(true);
    if (at) p.teleport(at, p.facing);
    G.cam.snapBehind(p);
    G.soothe.calm = G.soothe.maxCalm;
    p.moveScale = 1;
    p.setState('move');
    this.fronts.length = 0;
    this.quiet = 5;
    await G.ui.fade(false);
    G.events.emit('recovered');
  }
}
