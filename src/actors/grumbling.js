// Grumblings: fluffy curses born from small worries. They grow when ignored, shrink when noticed,
// act out in a species-specific pattern (the "light action" part), and once fully wrapped by the
// Lullaby Thread they cocoon, fall asleep and pop into a Charm Sprite.
import { Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Vector3 } from 'three';
import { G } from '../game.js';
import { SPECIES } from '../content/species.js';
import { makeCreature } from './creatures.js';
import { Rain } from '../render/vfx.js';
import { materialFor } from '../render/materials.js';

const _v = new Vector3();
const _w = new Vector3();

export class Grumbling {
  constructor(species, position, opts = {}) {
    this.id = opts.id || species;
    this.species = species;
    this.def = SPECIES[species];
    this.obj = makeCreature(species);
    this.obj.position.copy(position);
    this.home = position.clone();
    this.ground = position.y;
    this.opts = opts;
    this.size = opts.size || 1;
    this.noticed = false;
    this.progress = 0;
    this.state = 'idle'; // idle | active | cocoon | sleep | gone
    this.t = Math.random() * 10;
    this.blink = 2;
    this.hitCooldown = 0;
    this.enabled = opts.enabled !== false;
    this.behaviour = BEHAVIOURS[this.def.tantrum]?.(this) || {};
    this.interactable = {
      label: 'Notice',
      radius: 3.2,
      position: this.obj.position,
      enabled: () => this.enabled && !this.noticed && this.state !== 'gone',
      action: () => this.notice(),
    };
    G.interactables.add(this.interactable);
    G.grumblings.add(this);
  }

  get position() {
    return this.obj.position;
  }
  get active() {
    return this.enabled && this.state !== 'cocoon' && this.state !== 'sleep' && this.state !== 'gone';
  }

  notice() {
    if (this.noticed) return;
    this.noticed = true;
    this.state = 'active';
    this.size = Math.max(0.8, this.size * 0.85);
    G.save.seen[this.species] = true;
    G.audio.play('notice');
    G.ui.bubble(this.obj, `“${this.def.feeling}”`, 3.2, 0.7 + this.size * 0.3);
    G.fx.sparkles.emit(_v.copy(this.position).setY(this.position.y + 0.4), 10, '#ffe7a8', { speed: 0.8, size: 0.1 });
    G.events.emit('noticed', this);
  }

  // Lullaby Thread wraps; returns true when fully soothed.
  wrap(amount) {
    if (!this.active) return false;
    if (!this.noticed) this.notice();
    this.progress = Math.min(1, this.progress + amount / this.size);
    this.calmedT = 0.4;
    if (this.progress >= 1) {
      this.cocoon();
      return true;
    }
    return false;
  }

  snap(amount = 0.12) {
    this.progress = Math.max(0, this.progress - amount);
  }

  cocoon() {
    this.state = 'cocoon';
    this.stateT = 0;
    this.behaviour.stop?.();
    G.audio.play('chime');
    G.events.emit('cocoon', this);
  }

  // Wrap-rate multiplier from behaviour (e.g. the sock only calms while it is hiding still).
  rate() {
    return this.behaviour.rate ? this.behaviour.rate() : 1;
  }

  update(dt) {
    const o = this.obj;
    this.t += dt;
    this.hitCooldown -= dt;
    this.calmedT = (this.calmedT || 0) - dt;
    const p = G.player;
    const dist = p ? o.position.distanceTo(p.position) : 99;
    const eyes = o.userData.eyes;
    // blink
    this.blink -= dt;
    if (eyes) eyes.scale.y = this.blink < 0.12 ? 0.15 : this.state === 'sleep' || this.state === 'cocoon' ? 0.15 : 1;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;

    if (this.state === 'cocoon' || this.state === 'sleep') return this.updateSoothed(dt);
    if (this.state === 'gone') return;

    // ignored Grumblings slowly grow; being near and noticed keeps them small
    if (!this.noticed && dist > 6) this.size = Math.min(1.35, this.size + dt * 0.004);
    if (this.enabled && this.noticed) this.behaviour.update?.(dt, dist);
    else this.behaviour.idle?.(dt, dist);

    // squash & stretch idle, grumpy shiver when upset, face the player when close
    const calm = this.calmedT > 0;
    const shake = this.noticed && !calm && this.progress < 0.5 ? Math.sin(this.t * 40) * 0.015 : 0;
    const bob = Math.sin(this.t * (calm ? 2 : 3.2));
    const s = this.size * (1 - this.progress * 0.25);
    o.scale.set(s * (1 + bob * 0.04) + shake, s * (1 - bob * 0.05), s * (1 + bob * 0.04));
    if (dist < 8 && !this.behaviour.ownsFacing) {
      const want = Math.atan2(p.position.x - o.position.x, p.position.z - o.position.z);
      o.rotation.y += (Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y))) * Math.min(1, dt * 4);
    }
    if (calm && Math.random() < dt * 4) G.fx.sparkles.emit(_v.copy(o.position).setY(o.position.y + 0.3 * s), 1, '#ffd27a', { speed: 0.3, size: 0.07, life: 0.8 });
  }

  // Hit the player (called by behaviours): snaps the thread and costs Calm.
  hitPlayer(calmCost = 1, snap = true) {
    if (this.hitCooldown > 0) return;
    this.hitCooldown = 1.1;
    G.soothe.hit(this, calmCost, snap);
  }

  updateSoothed(dt) {
    const o = this.obj;
    this.stateT += dt;
    if (this.state === 'cocoon') {
      if (!this.cocoonMesh) {
        this.cocoonMesh = new Mesh(new SphereGeometry(0.28, 8, 6), materialFor('cloth', { color: 0xffc27a, vertexColors: false }));
        this.cocoonMesh.position.y = 0.25;
        o.add(this.cocoonMesh);
      }
      const k = Math.min(1, this.stateT / 0.8);
      this.cocoonMesh.scale.setScalar(k * 1.1);
      o.position.y += (this.ground + (this.behaviour.hover || 0) * 0.5 - o.position.y) * Math.min(1, dt * 3);
      if (this.stateT > 1.1) {
        this.state = 'sleep';
        this.stateT = 0;
      }
    } else if (this.state === 'sleep') {
      const breathe = 1 + Math.sin(this.stateT * 3) * 0.05;
      this.cocoonMesh.scale.set(1.1 * breathe, 1.1 / breathe, 1.1 * breathe);
      if (this.stateT > 0.6 && !this.zzz) {
        this.zzz = G.ui.bubble(o, 'z z z…', 1.4, 0.9);
      }
      if (this.stateT > 1.8) this.pop();
    }
  }

  pop() {
    this.state = 'gone';
    const o = this.obj;
    _v.copy(o.position).setY(o.position.y + 0.4);
    G.fx.sparkles.emit(_v, 40, this.def.glow, { speed: 2.2, up: 1.5, size: 0.14, life: 1.4, spread: 0.3 });
    G.audio.play('pop');
    G.collection.add(this.species, _v.clone());
    G.events.emit('soothed', this);
    this.dispose();
  }

  dispose() {
    this.behaviour.stop?.();
    this.obj.removeFromParent();
    G.interactables.delete(this.interactable);
    G.grumblings.delete(this);
    if (G.soothe?.target === this) G.soothe.target = null;
  }
}

// ---------------------------------------------------------------- species behaviours

const BEHAVIOURS = {
  // Soggy Cloud: drifts overhead and rains in a circle; step out of the rain.
  rain(g) {
    const hover = 1.55;
    g.ground = g.home.y;
    g.obj.position.y = g.home.y + hover;
    const rain = new Rain({ count: Math.round(90 * (G.quality.tier.particles + 0.3)), size: new Vector3(0.7, hover, 0.7), speed: 6, length: 0.22, wrap: false, opacity: 0.55, color: '#bcd9f0' });
    G.zone.group.add(rain.mesh);
    const ring = new Mesh(new RingGeometry(0.55, 0.62, 24), new MeshBasicMaterial({ color: 0x8fc3e8, transparent: true, opacity: 0.0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    G.zone.group.add(ring);
    let timer = 2,
      phase = 'drift',
      raining = 0.4;
    const b = {
      hover,
      idle(dt) {
        // gentle ambient drizzle on whoever is below (the passengers' shoes)
        g.obj.position.y = g.home.y + hover + Math.sin(g.t * 1.3) * 0.08;
        rain.center.copy(g.obj.position);
        rain.mat.uniforms.opacity.value = 0.35;
        ring.material.opacity = 0;
        if (Math.random() < dt * 0.8) G.audio.play('drip');
      },
      update(dt, dist) {
        timer -= dt;
        const p = G.player.position;
        const o = g.obj.position;
        if (phase === 'drift') {
          // hover near, a little in front of the player
          _w.set(p.x + Math.sin(g.t * 0.6) * 1.6, g.ground + hover + Math.sin(g.t * 1.3) * 0.08, p.z + Math.cos(g.t * 0.6) * 1.6);
          if (dist > 7) _w.copy(g.home).setY(g.ground + hover);
          o.lerp(_w, Math.min(1, dt * 0.8));
          raining = Math.max(0.05, raining - dt);
          if (timer < 0 && dist < 7) {
            phase = 'windup';
            timer = 0.9;
            G.audio.play('grumble');
            G.events.emit('tantrum', g);
          }
        } else if (phase === 'windup') {
          _w.set(p.x, g.ground + hover + 0.2, p.z);
          o.lerp(_w, Math.min(1, dt * 2.2));
          ring.material.opacity = 0.5;
          if (timer < 0) {
            phase = 'rain';
            timer = 2.4;
          }
        } else if (phase === 'rain') {
          raining = 1;
          if (Math.random() < dt * 6) G.audio.play('drip');
          const dx = p.x - o.x,
            dz = p.z - o.z;
          if (dx * dx + dz * dz < 0.62 * 0.62 && !G.collection.helper('umbrella')) g.hitPlayer(1, true);
          if (timer < 0) {
            phase = 'drift';
            timer = 2.5 + Math.random() * 1.5;
          }
        }
        rain.center.copy(o);
        rain.mat.uniforms.opacity.value = 0.25 + raining * 0.4;
        rain.mat.uniforms.uSize.value.y = o.y - g.ground;
        ring.position.set(o.x, g.ground + 0.03, o.z);
        ring.material.opacity = phase === 'rain' ? 0.35 : phase === 'windup' ? 0.5 + Math.sin(g.t * 20) * 0.2 : 0;
      },
      stop() {
        rain.mesh.removeFromParent();
        ring.removeFromParent();
      },
    };
    return b;
  },

  // Lost Sock: darts between hiding spots; calms only while hiding still. Bumps you if you block it.
  dart(g) {
    const spots = (g.opts.spots || [g.home]).map((s) => s.clone());
    let target = null,
      rest = 1.5,
      hops = 0;
    return {
      ownsFacing: true,
      rate: () => (target ? 0.15 : 1),
      idle(dt) {
        g.obj.position.y = g.ground + Math.abs(Math.sin(g.t * 5)) * 0.04;
      },
      update(dt, dist) {
        const o = g.obj.position;
        if (target) {
          _w.subVectors(target, o).setY(0);
          const d = _w.length();
          const speed = 3.4 - hops * 0.35 - (g.calmedT > 0 ? 1.2 : 0);
          if (d < 0.1) {
            target = null;
            rest = 2.6 + hops * 0.6;
          } else {
            _w.normalize();
            o.addScaledVector(_w, Math.min(d, Math.max(1.2, speed) * dt));
            o.y = g.ground + Math.abs(Math.sin(g.t * 14)) * 0.12;
            g.obj.rotation.y = Math.atan2(_w.x, _w.z);
            if (dist < 0.6) g.hitPlayer(1, true);
          }
        } else {
          rest -= dt;
          o.y = g.ground + Math.abs(Math.sin(g.t * 3)) * 0.02;
          const p = G.player.position;
          g.obj.rotation.y = Math.atan2(p.x - o.x, p.z - o.z);
          // flee when approached and not calm enough yet
          if (rest < 0 && dist < 2.6 && g.progress < 0.85) {
            let best = null,
              bd = -1;
            for (const s of spots) {
              const ds = s.distanceTo(p) - s.distanceTo(o) * 0.3;
              if (s.distanceTo(o) > 0.5 && ds > bd) {
                bd = ds;
                best = s;
              }
            }
            target = best;
            hops = Math.min(4, hops + 1);
            if (target) G.audio.play('whoosh');
          }
        }
      },
    };
  },

  // Unfinished Homework: stays put and lobs crumpled paper balls where you're heading.
  throw(g) {
    const balls = [];
    const geo = new SphereGeometry(0.09, 6, 5);
    const mat = materialFor('paper', { color: 0xf5f0e6, vertexColors: false });
    let timer = 1.5;
    return {
      update(dt, dist) {
        timer -= dt;
        const p = G.player;
        if (timer < 0 && dist < 9) {
          timer = g.calmedT > 0 ? 2.4 : 1.7;
          const m = new Mesh(geo, mat);
          m.castShadow = true;
          const from = g.obj.position.clone().setY(g.obj.position.y + 0.45);
          const lead = 0.6;
          const to = p.position.clone().addScaledVector(p.velocity, lead).setY(p.position.y + 0.1);
          const shadow = new Mesh(new RingGeometry(0.2, 0.3, 16), new MeshBasicMaterial({ color: 0x4a3428, transparent: true, opacity: 0.35, depthWrite: false }));
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.copy(to).setY(p.position.y + 0.03);
          G.zone.group.add(m, shadow);
          balls.push({ m, shadow, from, to, t: 0, dur: 0.95 });
          G.audio.play('whoosh');
          G.events.emit('tantrum', g);
        }
        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i];
          b.t += dt / b.dur;
          const k = Math.min(1, b.t);
          b.m.position.lerpVectors(b.from, b.to, k);
          b.m.position.y += Math.sin(k * Math.PI) * 1.4;
          b.m.rotation.x += dt * 8;
          b.shadow.material.opacity = 0.2 + k * 0.4;
          if (k >= 1) {
            if (b.to.distanceTo(p.position.clone().setY(p.position.y + 0.1)) < 0.55) g.hitPlayer(1, true);
            G.fx.sparkles.emit(b.to, 4, '#ffffff', { speed: 0.8, size: 0.06, life: 0.5 });
            b.m.removeFromParent();
            b.shadow.removeFromParent();
            balls.splice(i, 1);
          }
        }
      },
      stop() {
        for (const b of balls) {
          b.m.removeFromParent();
          b.shadow.removeFromParent();
        }
        balls.length = 0;
      },
    };
  },

  // Picked-Last Pom-pom: follows you sighing (slows you). It calms only with company nearby.
  sigh(g) {
    let timer = 3;
    const wave = new Mesh(new RingGeometry(0.9, 1, 32), new MeshBasicMaterial({ color: 0xb69ccf, transparent: true, opacity: 0, depthWrite: false }));
    wave.rotation.x = -Math.PI / 2;
    G.zone.group.add(wave);
    let waveT = 9;
    return {
      ownsFacing: false,
      rate: () => {
        const c = g.opts.company;
        return c && g.position.distanceTo(c) < (g.opts.companyRadius || 7) ? 1.6 : 0.2;
      },
      idle(dt) {
        g.obj.position.y = g.ground + Math.abs(Math.sin(g.t * 2)) * 0.03;
      },
      update(dt, dist) {
        const o = g.obj.position;
        const p = G.player;
        if (dist > 1.6) {
          _w.subVectors(p.position, o).setY(0).normalize();
          o.addScaledVector(_w, Math.min(dist - 1.6, 2.6 * dt));
        }
        o.y = g.ground + Math.abs(Math.sin(g.t * 6)) * 0.08;
        if (G.collision) {
          const gy = G.collision.groundY(o.x, o.z, o.y + 1.5);
          if (gy !== null) g.ground += (gy - g.ground) * Math.min(1, dt * 8);
        }
        timer -= dt;
        if (timer < 0) {
          timer = 5 + Math.random() * 2;
          waveT = 0;
          G.audio.play('sigh');
          G.ui.bubble(g.obj, 'sigh…', 1.2, 0.7);
        }
        waveT += dt;
        const k = waveT / 1.2;
        wave.visible = k < 1;
        if (k < 1) {
          wave.position.set(o.x, g.ground + 0.05, o.z);
          wave.scale.setScalar(0.3 + k * 3);
          wave.material.opacity = 0.6 * (1 - k);
          const r = (0.3 + k * 3) * 0.95;
          if (Math.abs(dist - r) < 0.4 && !g.sighHit) {
            g.sighHit = true;
            p.moveScale = 0.45;
            setTimeout(() => (p.moveScale = 1), 1600);
            G.soothe.hit(g, 0, false);
          }
        } else g.sighHit = false;
      },
      stop() {
        wave.removeFromParent();
      },
    };
  },
};
