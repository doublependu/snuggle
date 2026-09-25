// SPDX-License-Identifier: GPL-3.0-only
// Sitting with a Wistful Sparrow flock (Chapter 2). The trick, Xiao Pei discovers, isn't buying them
// things: it's sitting with them and pointing out all the free good things. Sit on the flock's seat and
// its sparrows hop over and perch around her; pick one of the free good things nearby (a chip on
// screen: tap / click it, press 1-3, or d-pad left / right) and hold Hum: the Lullaby Thread runs toward
// that good thing and fans out to every perched sparrow at once. Each sparrow loves one good thing best.
// Team-up combos: a snack (Tangtang) or Echo Friend (Wei Bao) just before humming.
import { Vector3 } from 'three';
import { G } from '../game.js';
import { Ribbon } from '../render/vfx.js';

export const GOODS = {
  chestnut: ['🌰', 'Roasting chestnuts'],
  steam: ['♨️', 'Dumpling steam'],
  lanterns: ['🏮', 'Lanterns on the water'],
  music: ['🎻', "The musician's song"],
  moon: ['🌕', 'The moon over the bay'],
  stars: ['✨', 'All the stars'],
};

const MAX = 5;
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _v = new Vector3();
const PTS = Array.from({ length: 72 }, () => new Vector3());

export class Perch {
  // flocks: [{ id, seat (marker), goods: [{ kind, position }], sparrows: [Grumbling] }]
  constructor(zone, flocks) {
    this.zone = zone;
    this.flocks = flocks;
    this.active = null;
    this.selected = -1;
    this.humWas = false;
    this.combo = { snack: -99, echo: -99, sweetUntil: -99, echoUntil: -99, used: -99 };
    this.ribbons = Array.from({ length: MAX + 1 }, (_, i) => new Ribbon(72, i ? 0.03 : 0.045, i ? '#ffc98a' : '#ffb35c'));
    for (const r of this.ribbons) zone.group.add(r.mesh);
    this.chipsEl = document.createElement('div');
    this.chipsEl.className = 'goodchips';
    G.ui.root.append(this.chipsEl);
    for (const f of flocks) {
      f.goods.forEach((gd, i) => (gd.index = i));
      f.sparrows.forEach((g, i) => (g.favourite = f.goods[i % f.goods.length].kind));
      zone.addInteractable({
        position: f.seat.position,
        radius: 2.2,
        priority: 1.5,
        label: 'Sit with them',
        enabled: () => !f.done && f.enabled !== false && f.sparrows.some((g) => !g.soothed),
        action: () => this.sit(f),
      });
    }
    zone.on('assist', (a) => this.onAssist(a));
    this.onKey = (e) => {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined && this.active) this.select(n);
    };
    addEventListener('keydown', this.onKey);
    const prevExit = zone.onExit;
    zone.onExit = () => {
      prevExit?.();
      removeEventListener('keydown', this.onKey);
      this.chipsEl.remove();
    };
    // a game-wide updater (runs after Interact and Soothe, so the seated prompt and humming win);
    // G.updaters is cleared when the zone changes
    G.updaters.add((dt) => this.update(dt));
  }

  // The lantern-on-water good thing shines brighter for every lantern floated from the pier (systems/lanterns.js).
  strength(kind) {
    if (kind === 'lanterns') return 1 + Math.min(0.8, (G.save.story.lanternsFloated || 0) * 0.1);
    return 1;
  }

  sit(f) {
    const p = G.player;
    this.active = f;
    p.sitOn(f.seat.position, f.seat.facing, f.seat.data.seat ?? 0.42);
    G.cam.snapBehind(p);
    G.cam.pitch = 0.42;
    this.selected = -1;
    this.standT = 0;
    // the flock hops over and perches around her (the first one gets a proper Notice)
    const live = f.sparrows.filter((g) => !g.soothed);
    live.forEach((g, i) => {
      g.enable(true);
      if (!g.noticed) {
        if (i === 0) g.notice();
        else {
          g.noticed = true;
          g.state = 'active';
          G.save.seen.sparrow = true;
        }
      }
      const n = live.length;
      const a = f.seat.facing + (n > 1 ? (i / (n - 1) - 0.5) * 2.3 : 0);
      const r = 0.75 + (i % 2) * 0.35;
      g.perch = new Vector3(f.seat.position.x + Math.sin(a) * r, f.seat.position.y + 0.02, f.seat.position.z + Math.cos(a) * r);
    });
    G.audio.play('flutter');
    this.buildChips(f);
    G.events.emit('perch', f);
    if (!G.save.story.perchTip) {
      G.save.story.perchTip = true;
      const how = { keyboard: 'click one, or press <b>1</b>–<b>3</b>', gamepad: 'use the <b>d-pad</b>', touch: 'tap one' }[G.input.device] || 'click one';
      G.ui.toast(`💡 Point out a free good thing (${how}), then hold <b>Hum</b> to share it with them.`, 6);
    }
  }

  stand() {
    const f = this.active;
    if (!f) return;
    this.active = null;
    for (const g of f.sparrows) {
      g.perch = null;
      g.perched = false;
    }
    G.player.h.overlayPlay(null);
    G.player.stand();
    this.chipsEl.innerHTML = '';
    for (const r of this.ribbons) r.hide();
    G.events.emit('unperch', f);
  }

  buildChips(f) {
    this.chipsEl.innerHTML = '';
    f.chips = f.goods.map((gd, i) => {
      const [icon, label] = GOODS[gd.kind] || ['✨', gd.kind];
      const b = document.createElement('button');
      b.className = 'goodchip';
      b.innerHTML = `<span class="k">${i + 1}</span>${icon} ${label}`;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.select(i);
      });
      this.chipsEl.append(b);
      return b;
    });
  }

  select(i) {
    const f = this.active;
    if (!f || !f.goods[i]) return;
    this.selected = i;
    f.chips.forEach((c, k) => c.classList.toggle('sel', k === i));
    G.audio.play('blip');
    G.fx.sparkles.emit(f.goods[i].position, 10, '#ffe7a8', { speed: 0.6, size: 0.18 });
    G.events.emit('pointed', f.goods[i].kind);
  }

  onAssist({ kind, target }) {
    const f = this.active;
    if (!f || !f.sparrows.includes(target)) return;
    this.combo[kind] = G.time;
    if (kind === 'echo') {
      // Captain Honk tells us which free good thing each sparrow loves best
      for (const g of f.sparrows) if (!g.soothed) G.ui.bubble(g.obj, (GOODS[g.favourite] || ['✨'])[0], 6, 0.45);
    }
  }

  // Combos fire when Hum starts right after a friend's assist.
  startHum() {
    const c = this.combo;
    const t = G.time;
    if (t - c.used < 1) return;
    const snack = t - c.snack < 2.5,
      echo = t - c.echo < 2.5;
    const both = Math.abs(c.snack - c.echo) < 4 && (snack || echo) && t - Math.min(c.snack, c.echo) < 6;
    let name = null;
    if (both) {
      name = 'Everyone Together!';
      for (const g of this.active.sparrows) if (g.perched && g.active) g.wrap(1);
    } else if (snack) {
      name = 'Sweet Lullaby!';
      c.sweetUntil = t + 4;
    } else if (echo) {
      name = 'Echo Lullaby!';
      c.echoUntil = t + 6;
    }
    if (!name) return;
    c.used = t;
    c.snack = c.echo = -99;
    G.audio.play('combo');
    G.ui.combo(name);
    G.save.story.combos = (G.save.story.combos || 0) + 1;
    G.events.emit('combo', name);
  }

  update(dt) {
    for (const f of this.flocks) {
      if (!f.done && f.sparrows.every((g) => g.soothed)) {
        f.done = true;
        G.events.emit('flock-done', f);
      }
    }
    const f = this.active;
    const p = G.player;
    if (!f) return;
    if (p.state !== 'sit') return this.stand(); // a script took over (cutscene / overwhelm)
    const input = G.input;
    // standing up: Interact / Jump, or pushing the stick for a moment
    this.standT = input.move.lengthSq() > 0.5 ? this.standT + dt : 0;
    G.ui.prompt('Stand up', { keyboard: 'F', gamepad: 'X', touch: '' }[input.device] || 'F');
    G.touch?.setAct('Stand up');
    if (input.consume('interact') || input.consume('jump') || this.standT > 0.45 || (f.done && !f.sparrows.some((g) => g.state === 'cocoon' || g.state === 'sleep'))) {
      if (!G.frozen) return this.stand();
    }
    if (input.consume('left_edge')) this.select((Math.max(0, this.selected) - 1 + f.goods.length) % f.goods.length);
    if (input.consume('right_edge')) this.select((this.selected + 1) % f.goods.length);
    this.placeChips(f);

    const perched = f.sparrows.filter((g) => g.perched && g.active).slice(0, MAX);
    const good = f.goods[this.selected];
    const humming = !G.frozen && input.humHeld && !!good && perched.length > 0;
    if (!G.frozen && input.pressed('hum') && !good) G.ui.toast('Point out a free good thing first!', 1.8);
    if (humming && !this.humWas) this.startHum();
    this.humWas = humming;
    G.audio.setHumming(humming);
    p.h.overlayPlay(humming ? 'hum' : null, 0.25);
    if (humming) {
      // on-beat bonus, like soothing a single Grumbling
      if (input.pressed('hum')) {
        const b = G.audio.beat();
        const off = Math.min(b.phase, 1 - b.phase) * (60 / 84);
        if (off < 0.13) {
          for (const g of perched) g.wrap(0.05);
          G.audio.play('perfect');
          G.ui.floaty(_a.copy(p.position).setY(p.position.y + 1.3), '♪ Perfect!');
        }
      }
      const sweet = G.time < this.combo.sweetUntil ? 1.5 : 1;
      const match = G.time < this.combo.echoUntil ? 3 : 2;
      for (const g of perched) {
        const k = g.favourite === good.kind ? match : 0.6;
        g.wrap((1 / (g.def.wrap || 3)) * k * this.strength(good.kind) * sweet * dt);
      }
      if (Math.random() < dt * 5) G.fx.sparkles.emit(good.position, 1, '#ffe7a8', { speed: 0.3, size: 0.2 });
      this.drawThreads(perched, good);
    } else for (const r of this.ribbons) r.hide();
    // HUD: the flock's calm as one ring
    const live = f.sparrows.filter((g) => !g.soothed);
    const prog = live.length ? live.reduce((a, g) => a + g.progress, 0) / f.sparrows.length + (f.sparrows.length - live.length) / f.sparrows.length : 1;
    G.ui.soothe(true, Math.min(1, prog), G.soothe.calm, `“${f.sparrows[0].def.feeling}”`, humming ? '♪' : good ? 'Hum' : 'Pick');
  }

  // World-anchored chips, clamped to the screen edge (with an arrow) when the good thing is off screen.
  placeChips(f) {
    const w = innerWidth,
      h = innerHeight;
    f.goods.forEach((gd, i) => {
      const el = f.chips[i];
      _v.copy(gd.position).project(G.camera);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * w,
        y = (-_v.y * 0.5 + 0.5) * h;
      if (behind) {
        x = w - x;
        y = h * 0.62;
      }
      const m = 90;
      const off = behind || x < m || x > w - m || y < 70 || y > h - 150;
      x = Math.min(w - m, Math.max(m, x));
      y = Math.min(h - 150, Math.max(90, y)) + i * (off ? 38 : 0);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.classList.toggle('edge', off);
    });
  }

  // From her hand, the thread arcs toward the good thing, then down to each perched sparrow and
  // spirals around it as it calms.
  drawThreads(perched, good) {
    const p = G.player;
    p.h.worldBone('hand_R', _a);
    _c.subVectors(good.position, _a);
    const far = _c.length();
    _c.normalize();
    const tip = _b.copy(_a).addScaledVector(_c, Math.min(far, 2.2));
    tip.y += 0.5;
    // the main thread toward the good thing
    for (let i = 0; i < 24; i++) {
      const k = i / 23;
      PTS[i].lerpVectors(_a, tip, k);
      PTS[i].y += Math.sin(k * Math.PI) * 0.25 + Math.sin(k * 14 - G.time * 8) * 0.02;
    }
    this.ribbons[0].set(PTS, G.camera, undefined, 24);
    this.ribbons.forEach((r, i) => {
      if (!i) return;
      const g = perched[i - 1];
      if (!g) return r.hide();
      const c = g.position;
      const center = _v.set(c.x, c.y + 0.13 * g.size, c.z);
      const rr = 0.15 * g.size;
      const spiral = Math.floor(10 + g.progress * 30);
      const arc = 64 - spiral;
      for (let j = 0; j < arc; j++) {
        const k = j / (arc - 1);
        // quadratic bezier: tip -> (up and over) -> sparrow
        const u = 1 - k;
        PTS[j].set(
          u * u * tip.x + 2 * u * k * (tip.x + center.x) * 0.5 + k * k * center.x,
          u * u * tip.y + 2 * u * k * (Math.max(tip.y, center.y) + 0.6) + k * k * (center.y + rr),
          u * u * tip.z + 2 * u * k * (tip.z + center.z) * 0.5 + k * k * center.z,
        );
      }
      const a0 = G.time * 3 + i;
      for (let j = 0; j < spiral; j++) {
        const k = j / Math.max(1, spiral - 1);
        const a = a0 + k * Math.PI * 2 * (2 + g.progress * 4);
        const y = 1 - k * 2;
        const r2 = rr * Math.sqrt(Math.max(0.05, 1 - y * y)) * 1.1;
        PTS[arc + j].set(center.x + Math.cos(a) * r2, center.y + y * rr, center.z + Math.sin(a) * r2);
      }
      r.set(PTS, G.camera, undefined, 64);
    });
  }
}
