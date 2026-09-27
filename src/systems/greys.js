// SPDX-License-Identifier: GPL-3.0-only
// Grey Grumblings (Chapter 3): "Nobody remembers us." Heavy and quiet, they drift toward the heart of the
// Quiet District and don't want to be hugged: humming at one makes it turn away (the thread won't catch),
// and running at it makes it slide off. Keep it company instead: walk up and stay close without humming.
// Sitting nearby is faster, friends standing by count too, and a restored memory close to it halves the
// time. The company ring fills, colour seeps back into it, it looks up at her... and then it lets the
// Lullaby Thread wrap it like any other Grumbling. Loaded only with the zones that use it.
import { Color, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { G } from '../game.js';
import { registerBehaviour } from '../actors/grumbling.js';

const WARM = new Color(1.3, 1.08, 0.94); // body tint when it has been kept company (its vertex colours are grey)
const WHITE = new Color(1, 1, 1);
const COMPANY_TIME = 8; // seconds of company, before bonuses
const _v = new Vector3();
const _w = new Vector3();

const turn = (o, want, k) => (o.rotation.y += Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y)) * Math.min(1, k));

// opts: heart (Vector3 it drifts toward), wander (m around home), echo (its forgotten feeling, for Echo
// Friend), helped() (a restored memory nearby), aloof (it never lets anyone near: the Academy's morning
// greys), path ([Vector3]: a scripted grey that only drifts along it, e.g. out of the Academy's gate).
registerBehaviour('heavy', (g) => {
  const home = g.home.clone();
  const wanderTo = home.clone();
  const path = g.opts.path;
  let pathI = 0,
    wanderT = 0,
    slideT = 0,
    sighT = 3 + Math.random() * 5,
    waveT = 9,
    bubbleT = 0;
  const slide = new Vector3();
  g.company = 0;
  g.ready = false;
  g.obj.userData.tint = new Color(1, 1, 1);
  g.echoLine = () =>
    g.ready ? g.opts.echo || 'IT WAS A FEELING NOBODY REMEMBERED. HONK.' : 'IT DOES NOT WANT A HUG. IT WANTS SOMEONE TO STAY. HONK.';
  const wave = new Mesh(new RingGeometry(0.9, 1, 32), new MeshBasicMaterial({ color: 0x9aa6bf, transparent: true, opacity: 0, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2;
  wave.visible = false;
  G.zone.group.add(wave);

  const ground = (o, dt) => {
    const gy = G.collision?.groundY(o.x, o.z, o.y + 1.2);
    if (gy !== null && gy !== undefined) g.ground += (gy - g.ground) * Math.min(1, dt * 6);
    o.y = g.ground + Math.abs(Math.sin(g.t * 1.4)) * 0.015;
  };
  const say = (text, life = 2.2) => {
    if (bubbleT > 0) return;
    bubbleT = life + 1.4;
    G.ui.bubble(g.obj, text, life, 0.62 * g.size);
  };

  return {
    always: true, // drifts whether or not anyone has noticed it
    ownsFacing: true,
    hover: 0,
    refuses: () => !g.ready,
    noNotice: () => !g.ready, // it notices *her*, once it's ready
    rate: () => (g.ready ? (G.time < (g.boostUntil || 0) ? 1.5 : 1) : 0),
    idle(dt) {
      g.obj.position.y = g.ground + Math.abs(Math.sin(g.t * 1.4)) * 0.015;
    },
    update(dt, dist) {
      const o = g.obj.position;
      const p = G.player;
      bubbleT -= dt;
      const toHer = Math.atan2(p.position.x - o.x, p.position.z - o.z);
      if (g.ready) {
        // it lets her close now: looks up at her, a little brighter every moment
        turn(g.obj, toHer, dt * 3);
        ground(o, dt);
        g.obj.userData.tint.lerpColors(WHITE, WARM, 1);
        return;
      }
      const humAt = p.humming && G.soothe.target === g;
      const running = p.speed > 2.6 && dist < 4;
      // scripted greys only drift along their path, and never let anyone near
      if (path) {
        if (humAt) {
          turn(g.obj, toHer + Math.PI, dt * 5);
          say('…leave us alone.');
          if (Math.random() < dt * 8) G.fx.sparkles.emit(_v.copy(o).setY(o.y + 0.35), 1, '#8d93a0', { speed: 0.4, size: 0.12, life: 1 });
        }
        const to = path[Math.min(pathI, path.length - 1)];
        _w.subVectors(to, o).setY(0);
        const d = _w.length();
        if (d < 0.3 && pathI < path.length - 1) pathI++;
        else if (d > 0.01) {
          o.addScaledVector(_w.normalize(), Math.min(d, dt * (g.opts.speed || 0.55)));
          if (!humAt) turn(g.obj, Math.atan2(_w.x, _w.z), dt * 2);
        }
        ground(o, dt);
        g.atEnd = pathI >= path.length - 1 && d < 0.3;
        return;
      }
      if (humAt) {
        // no hug, thank you: it turns its back, sighs out a little grey mist, and some trust is lost
        turn(g.obj, toHer + Math.PI, dt * 6);
        g.company = Math.max(0, g.company - dt * 0.12);
        say(g.company > 0.4 ? '…not yet.' : '…leave us alone.');
        if (Math.random() < dt * 8) G.fx.sparkles.emit(_v.copy(o).setY(o.y + 0.35), 1, '#8d93a0', { speed: 0.4, size: 0.12, life: 1 });
        if (!G.save.story.greyHumTip) {
          G.save.story.greyHumTip = true;
          G.events.emit('grey-refused', g);
        }
      } else if (running && slideT <= 0) {
        // running at it: it slides away, heavy as a sack of rice
        slideT = 1.1;
        slide.subVectors(o, p.position).setY(0).normalize().multiplyScalar(2.2);
        g.company = Math.max(0, g.company - 0.25);
        say('…');
      }
      if (slideT > 0) {
        slideT -= dt;
        o.addScaledVector(slide, dt * 0.9);
      } else if (!humAt) {
        const seated = p.state === 'sit';
        const reach = seated ? 3.2 : 2.5;
        if (dist < reach && (p.state === 'move' || seated) && !G.frozen && !g.opts.aloof) {
          // company: it inches closer, looks up at her, and colour seeps back in
          let k = 1 / COMPANY_TIME;
          if (seated) k *= 1.5;
          if (friendsNear(o)) k *= 1.25;
          if (g.opts.helped?.()) k *= 2;
          const was = g.company;
          g.company = Math.min(1, g.company + dt * k);
          if (was < 0.35 && g.company >= 0.35) say('…', 1.6);
          if (was < 0.7 && g.company >= 0.7) say('…?', 1.6);
          if (dist > 1.15) {
            _w.subVectors(p.position, o).setY(0).normalize();
            o.addScaledVector(_w, dt * 0.25 * g.company);
          }
          turn(g.obj, toHer, dt * (0.6 + g.company * 2));
          if (g.company >= 1) {
            g.ready = true;
            g.notice();
            say('…you’re still here?', 2.6);
            G.audio.play('chime');
            G.fx.sparkles.emit(_v.copy(o).setY(o.y + 0.4), 18, '#ffe7a8', { speed: 0.8, size: 0.1, life: 1.2 });
            G.events.emit('grey-ready', g);
          }
        } else {
          // drifting: slow wandering around its spot, always leaning toward the heart of the district
          wanderT -= dt;
          if (wanderT < 0) {
            wanderT = 4 + Math.random() * 4;
            const r = g.opts.wander ?? 2.2;
            wanderTo.set(home.x + (Math.random() - 0.5) * 2 * r, home.y, home.z + (Math.random() - 0.5) * 2 * r);
            if (g.opts.heart) wanderTo.lerp(g.opts.heart, 0.12);
          }
          _w.subVectors(wanderTo, o).setY(0);
          const d = _w.length();
          if (d > 0.05) {
            o.addScaledVector(_w.normalize(), Math.min(d, dt * 0.35));
            turn(g.obj, Math.atan2(_w.x, _w.z), dt * 1.5);
          }
          // it forgets slowly while left alone, but never all the way
          g.company = Math.max(Math.min(g.company, 0.3), g.company - dt * 0.01);
        }
      }
      ground(o, dt);
      g.obj.userData.tint.lerpColors(WHITE, WARM, g.company * 0.6);
      // its sigh: a slow grey ring; if it reaches her she wants to curl up for a moment (walks slowly)
      sighT -= dt;
      if (sighT < 0 && dist < 9) {
        sighT = 7 + Math.random() * 3;
        waveT = 0;
        G.audio.play('sigh');
        if (dist < 6) say('sigh…', 1.2);
      }
      waveT += dt;
      const k = waveT / 1.6;
      wave.visible = k < 1;
      if (k < 1) {
        const r = 0.3 + k * 3.2;
        wave.position.set(o.x, g.ground + 0.05, o.z);
        wave.scale.setScalar(r);
        wave.material.opacity = 0.5 * (1 - k);
        if (Math.abs(dist - r * 0.95) < 0.4 && !g.sighHit && p.state === 'move') {
          g.sighHit = true;
          p.moveScale = 0.5;
          setTimeout(() => (p.moveScale = 1), 2000);
        }
      } else g.sighHit = false;
    },
    stop() {
      wave.removeFromParent();
      g.obj.userData.tint?.copy(WARM);
    },
  };
});

function friendsNear(o) {
  let n = 0;
  for (const id of ['tangtang', 'weibao']) {
    const f = G.npcs.get(id);
    if (f && !f.hidden && f.position.distanceTo(o) < 4) n++;
  }
  return n > 0;
}

// The zone's side of it: the company ring over the nearest grey that isn't ready yet, a first-time tip,
// and the team-up combos (a snack or Echo Friend just before humming at a grey that's ready).
export class Greys {
  constructor(zone, list) {
    this.zone = zone;
    this.list = list;
    this.humWas = false;
    this.combo = { snack: -99, echo: -99, used: -99 };
    zone.on('assist', ({ kind, target }) => {
      if (this.list.includes(target)) this.combo[kind] = G.time;
    });
    zone.on('grey-refused', () => G.ui.toast('💡 It doesn’t want a hug. Maybe just… stay with it for a while? Walk up and stand close, without humming.', 6));
    G.updaters.add((dt) => this.update(dt));
  }

  update() {
    const p = G.player;
    if (!p) return;
    const ring = G.ui.sootheEl;
    let near = null,
      bd = 4.5;
    for (const g of this.list) {
      if (g.soothed || g.ready || !g.enabled || g.opts.path) continue;
      const d = g.position.distanceTo(p.position);
      if (d < bd) {
        bd = d;
        near = g;
      }
    }
    ring.classList.toggle('company', !!near);
    if (near && !G.frozen) {
      const label = p.humming ? '…' : p.state === 'sit' ? 'Stay' : bd < 2.5 ? 'Stay' : 'Closer';
      G.ui.soothe(true, near.company, G.soothe.calm, '“Nobody remembers us.”', label);
    }
    // team-ups on a grey that's ready
    const t = G.soothe.target;
    const humming = p.humming && t && this.list.includes(t) && t.ready;
    if (humming && !this.humWas) this.startHum(t);
    this.humWas = !!humming;
  }

  startHum(g) {
    const c = this.combo;
    const t = G.time;
    if (t - c.used < 1) return;
    const snack = t - c.snack < 2.5,
      echo = t - c.echo < 2.5;
    const both = Math.abs(c.snack - c.echo) < 4 && (snack || echo) && t - Math.min(c.snack, c.echo) < 6;
    let name = null;
    if (both) {
      name = 'Everyone Together!';
      g.wrap(1);
    } else if (snack) {
      name = 'Sweet Lullaby!';
      g.boostUntil = t + 4;
    } else if (echo) name = 'Echo Lullaby!';
    if (!name) return;
    c.used = t;
    c.snack = c.echo = -99;
    G.audio.play('combo');
    G.ui.combo(name);
    G.save.story.combos = (G.save.story.combos || 0) + 1;
  }
}
