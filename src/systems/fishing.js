// SPDX-License-Identifier: GPL-3.0-only
// Thread fishing: the mini-game that carries on in free-roam Lantern Bay. At a fishing spot (content/catches.js)
// Pip casts the Lullaby Thread over the water, and Hum does all of it:
//   cast   hold Hum and a marker slides out across the water; let go to drop the float there (the stick or
//          the move keys nudge it left and right). Nearer a glimmer is better.
//   lure   hum on the beat: each note on it draws the nearest glimmer closer, a note off it makes it shy
//   bite   the float dips and the ring flashes: press Hum
//   reel   hold Hum to wind in; ease off while it tugs (the bar, and the thread itself going taut and bright);
//          too tight for too long and it slips away. Nothing is ever lost.
// In the water: fish (logged with your biggest, then let go), lost things that each belong to someone in town,
// the Great Sulk's little reminders that fell short into the harbour, coins in the old fountain, and one rare
// Grumbling. Loaded after Begin, only for a save that has reached the Epilogue (src/main.js G.later).
// Tests and the Epilogue's lesson ask for known catches: zone.fishing.next = ['carp:40', 'umbrella', 'reminder'].
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { Color, CylinderGeometry, InstancedMesh, Matrix4, Mesh, RingGeometry, Vector3 } from 'three';
import { G, flag, wait } from '../game.js';
import { Ribbon } from '../render/vfx.js';
import { materialFor } from '../render/materials.js';
import { mulberry } from '../render/sky.js';
import { writeSave } from '../core/save.js';
import { SPEAKERS } from '../ui/ui.js';
import { SPECIES } from '../content/species.js';
import { SPOTS, FISH, LOST, REMINDERS, WISHES, REQUESTS } from '../content/catches.js';
import { fishMesh } from '../procgen/fish.js';
import { makeCreature } from '../actors/creatures.js';
import { addPatch } from '../procgen/quilt.js';
import { talk, tween } from '../story/helpers.js';

const ON_BEAT = 0.13; // seconds either side of a beat that count as on it (as in soothing)
const N = 28; // points along the thread
const PTS = Array.from({ length: N }, () => new Vector3());
const DISC = new CylinderGeometry(1, 1, 0.01, 14);
const _a = new Vector3(),
  _b = new Vector3(),
  _c = new Vector3(),
  _s = new Vector3(),
  _m = new Matrix4(),
  _col = new Color();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HELLO = ['Hello, you.', 'Oh! Hello.', 'Sorry to bother you!', 'Aren’t you a handsome one.', 'Good morning. Off you go.', 'Bean, look. …Bean is asleep.'];
// how each kind of thing shows under the water, and how it pulls: [radius, colour, how it moves, tug]
const LOOK = { lost: [0.42, '#ffe9b0', 'still', 0.3], reminder: [0.3, '#ffb45c', 'bob', 0.12], wish: [0.2, '#ffe9b0', 'still', 0.05], bottled: [0.36, '#9fe8cf', 'jitter', 0.6] };

const CSS = `
.cook.fish { width: min(430px, calc(100vw - 24px)); padding: 10px 14px 12px; }
.cook.fish h3 { margin: 0 0 2px; font-size: calc(16px * var(--ts)); }
.fhint { min-height: 2.6em; font-weight: 700; font-size: calc(14px * var(--ts)); display: flex; align-items: center; justify-content: center; }
.fhint b { color: #c2501c; }
.frow { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; }
.frow .beatring { margin: 0; flex: none; width: 44px; height: 44px; }
.frow .beatring.bite { border-color: #e0662c; box-shadow: 0 0 16px #e0662c; animation: fbite .3s ease-in-out infinite alternate; }
@keyframes fbite { to { transform: scale(1.18); } }
.frow .meter { flex: 1; margin: 0; height: 18px; }
.frow .meter .zone { left: 80%; right: 0; background: #f0b9a4; }
.frow .meter .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: #7fbf8f; border-radius: 9px; }
.frow .meter.hot .fill { background: #e0662c; }
.frow .meter.tug { animation: ftug .18s linear infinite; }
@keyframes ftug { 50% { transform: translateX(3px); } }
.frow .meter.away { opacity: .35; }
.fbtns { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.fbtns .btn { padding: 7px 14px; font-size: calc(14px * var(--ts)); }
.fbtns .btn[hidden] { display: none; }
body.touch .fbtns .hold { display: none; }
.fcard { position: absolute; z-index: 5; left: 50%; top: max(62px, 8%); transform: translateX(-50%); width: min(340px, calc(100vw - 32px)); padding: 12px 16px; text-align: center; pointer-events: auto; animation: fcard .35s ease-out; }
.fcard .ico { font-size: 40px; line-height: 1.1; }
.fcard h3 { margin: 2px 0; }
.fcard .tag { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #e0662c; color: #fff; font-size: 12px; vertical-align: middle; }
.fcard .cm { font-weight: 800; color: #2f6f73; }
.fcard p { margin: 6px 0; font-style: italic; font-size: calc(14px * var(--ts)); }
@keyframes fcard { from { opacity: 0; transform: translate(-50%, 12px) scale(.9); } }
.fcard .hello { font-weight: 700; color: #e0662c; font-size: calc(13px * var(--ts)); }
@media (max-height: 520px) { .fcard { top: 8px; padding: 6px 14px; } .fcard .ico { font-size: 26px; } }`;

const sfx = {
  plop: () => {
    G.audio.tone(520, 0.12, { gain: 0.1, slide: 0.45, verb: 0.3 });
    G.audio.burst(0.12, { freq: 1400, q: 1.2, gain: 0.06 });
  },
  splash: () => {
    G.audio.burst(0.45, { freq: 1800, q: 0.6, gain: 0.14, sweep: 0.35 });
    G.audio.burst(0.25, { freq: 500, q: 0.8, gain: 0.1, type: 'lowpass' });
  },
  reel: () => G.audio.burst(0.03, { freq: 2600, q: 4, gain: 0.03 }),
  taut: () => G.audio.tone(880, 0.25, { type: 'triangle', gain: 0.06, slide: 1.25, verb: 0.2 }),
  dip: () => {
    G.audio.tone(392, 0.18, { gain: 0.12, slide: 0.6 });
    G.audio.tone(784, 0.3, { type: 'triangle', gain: 0.07, at: G.audio.now + 0.08, verb: 0.5 });
  },
};

// The save's fishing keys (older saves have none of them).
export function harbour(s = G.save) {
  s.fish ||= {}; // fish id -> [the biggest (cm), how many]
  s.lost ||= {}; // lost thing id -> 1 found, 2 given back
  s.line ||= {}; // Uncle Ming's gifts: cast, calm, lucky -> how many
  s.reminders ||= 0;
  s.ming ||= 0; // requests of his met
  return s;
}

const sizeOf = (f, rnd, big = false) => {
  let r = rnd();
  if (big) r = Math.max(r, rnd());
  return Math.round(f.size[0] + (f.size[1] - f.size[0]) * Math.pow(r, 1.6));
};
// 'carp:40' | 'umbrella' | 'reminder' | 'reminder:Call your sister.' | 'wish' | 'bottled' -> a catch
const parse = (spec, rnd) => {
  const i = spec.indexOf(':');
  const id = i < 0 ? spec : spec.slice(0, i),
    arg = i < 0 ? '' : spec.slice(i + 1);
  if (FISH[id]) return { kind: 'fish', id, cm: +arg || sizeOf(FISH[id], rnd) };
  if (LOST[id]) return { kind: 'lost', id };
  return arg ? { kind: id, text: arg } : { kind: id };
};
const onBeat = () => {
  const b = G.audio.beat();
  return Math.min(b.phase, 1 - b.phase) * G.audio.beatLength < ON_BEAT;
};

export class Fishing {
  constructor(zone) {
    this.zone = zone;
    zone.fishing = this;
    harbour();
    if (!document.getElementById('fish-css')) {
      const st = document.createElement('style');
      st.id = 'fish-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.spots = (SPOTS[zone.id] || []).map((s) => ({
      ...s,
      at: new Vector3(...s.at),
      dir: new Vector3(Math.sin(s.face), 0, Math.cos(s.face)),
      right: new Vector3(-Math.cos(s.face), 0, Math.sin(s.face)),
    }));
    this.next = []; // catches asked for (tests, the Epilogue's lesson): handed out before the water's own
    this.phase = null; // aim | fly | lure | bite | reel | card (null: not fishing)
    this.glimmers = [];
    // what shows: the thread, the float, the glimmers under the water (one instanced mesh), a ring on the
    // water (the cast's marker, then ripples), and the catch itself: five draw calls
    this.ribbon = new Ribbon(N, 0.035, '#ffb35c');
    this.float = new Mesh(new CylinderGeometry(0.06, 0.09, 0.2, 7), materialFor('glow', { color: '#ffd98a', vertexColors: false }));
    this.ring = new Mesh(new RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2), materialFor('sprite', { color: '#eaf6ff', vertexColors: false, key: 'fish-ring' }));
    this.shimmer = new InstancedMesh(DISC, materialFor('glass', { color: '#ffffff', vertexColors: false, transparent: 0.6, key: 'fish-glimmer' }), 6);
    this.shimmer.frustumCulled = false;
    this.ring.renderOrder = this.shimmer.renderOrder = 3;
    for (const o of [this.float, this.ring, this.shimmer]) o.visible = false;
    zone.group.add(this.ribbon.mesh, this.float, this.ring, this.shimmer);
    this.ripple = 9; // seconds since the last ripple
    this.tick = (dt) => this.update(dt);

    for (const spot of this.spots) {
      zone.addInteractable({
        position: spot.at,
        radius: 1.7,
        priority: 0.5,
        label: 'Cast the thread',
        enabled: () => !this.phase && flag('ep_fishing'),
        action: () => this.open(spot),
      });
    }
    // a glint on the water at each spot now and then, so they can be found
    let glint = 1;
    zone.updaters.push((dt) => {
      if (this.phase || !flag('ep_fishing') || (glint -= dt) > 0) return;
      glint = 0.7 + Math.random();
      for (const s of this.spots) {
        if (s.at.distanceTo(G.player.position) > 40) continue;
        this.place(_a, s, s.range[0] + Math.random() * (s.range[1] - s.range[0]), (Math.random() * 2 - 1) * s.wide);
        G.fx.sparkles.emit(_a, 1, '#eaf6ff', { speed: 0.05, up: 0.12, size: 0.2, life: 1.3, spread: 0.3 });
      }
    });
    this.owners();
    (G.bookPages ||= new Map()).set('harbour', harbourPage);
  }

  // A point on the water of a spot: d metres out, l to the right.
  place(out, spot, d, l = 0, lift = 0.03) {
    return out.copy(spot.at).addScaledVector(spot.dir, d).addScaledVector(spot.right, l).setY(spot.y + lift);
  }

  // Whoever a lost thing belongs to takes it back, if they live in this zone.
  owners() {
    const z = this.zone;
    for (const [id, l] of Object.entries(LOST)) {
      if (l.zone !== z.id) continue;
      if (l.as) SPEAKERS[l.owner] ||= [l.as, '#6a7fa0'];
      z.whenNPC(l.owner, (n) => {
        z.addInteractable({
          position: n.root.position,
          radius: 2.4,
          priority: 1.5,
          label: 'Give it back',
          enabled: () => G.save.lost[id] === 1 && !n.hidden,
          action: async () => {
            await talk([
              [null, `Pip holds out ${l.name.replace(/^A /, 'a ').replace(/^The /, 'the ')}, still a little damp.`],
              [l.owner, l.thanks],
            ]);
            G.save.lost[id] = 2;
            G.audio.play('thanks');
            G.collection.cozy(6, 'Back where it belongs', n.root.position.clone().setY(n.root.position.y + 1.7));
            addPatch(2);
            writeSave(G.save);
            G.events.emit('lost-returned', id);
          },
        });
      });
    }
  }

  // ---------------------------------------------------------------- what is in the water
  // Three glimmers: from what was asked for (this.next, opts.queue), or from what lives at this spot.
  stock() {
    const s = G.save,
      spot = this.spot;
    s.fishN = (s.fishN || 0) + 1;
    const rnd = (this.rnd = mulberry(7919 * s.fishN + spot.id.length * 131 + spot.id.charCodeAt(0)));
    const asked = this.opts.queue?.[0] || this.next[0];
    const lucky = (s.line.lucky || 0) * 0.5 + (this.baited ? 1 : 0);
    let picks = [];
    if (asked) picks = [0, 1, 2].map(() => parse(asked, rnd));
    else {
      const pool = [];
      for (const id of spot.fish) pool.push([{ kind: 'fish', id }, FISH[id].w <= 2 ? FISH[id].w * (1 + lucky) : FISH[id].w]);
      for (const [id, l] of Object.entries(LOST)) if (l.spot === spot.id && !s.lost[id]) pool.push([{ kind: 'lost', id }, 2.5 + lucky]);
      pool.push([{ kind: 'reminder' }, spot.fish.length ? 4 : 3]);
      if (!spot.fish.length) pool.push([{ kind: 'wish' }, 5], [{ kind: 'wish' }, 5]);
      // the one Grumbling that lives in the water (this.want: the spot where the day's worries say there is one)
      if (SPECIES.bottled && spot.fish.length && flag('epilogueDone')) pool.push([{ kind: 'bottled' }, this.want === spot.id ? 60 : s.sprites.bottled ? 0.5 : 1.2 + lucky]);
      for (let k = 0; k < 3 && pool.length; k++) {
        let r = rnd() * pool.reduce((a, p) => a + p[1], 0);
        const i = pool.findIndex((p) => (r -= p[1]) < 0);
        const [c] = pool.splice(Math.max(0, i), 1)[0];
        if (c.kind === 'fish') c.cm = sizeOf(FISH[c.id], rnd, this.baited);
        picks.push(c);
      }
    }
    const [near, far] = this.reach();
    this.glimmers = picks.map((c, i) => {
      const f = c.kind === 'fish' ? FISH[c.id] : null;
      const [r, color, mode, tug] = f ? [0.32 + Math.min(1, c.cm / 100) * 0.6, '#e6f6ff', 'swim', f.tug] : LOOK[c.kind] || LOOK.lost;
      const hd = near + ((i + 0.3 + rnd() * 0.4) / picks.length) * (far - near);
      const hl = (rnd() * 2 - 1) * spot.wide * 0.7;
      return { what: c, r, color: new Color(color), mode, tug, hd, hl, d: hd, l: hl, yaw: 0, ph: rnd() * 6, speed: 0.5 + rnd() * 0.5 + (f ? (1 - f.tug) * 0.5 : 0), pull: 0 };
    });
    this.target = null;
  }

  // How near and far the float can land (Uncle Ming's longer thread reaches further, where the water allows).
  reach() {
    const [a, b] = this.spot.range;
    return [a, b + Math.min(2, (G.save.line.cast || 0) * 0.8) * (this.spot.fish.length ? 1 : 0)];
  }

  // ---------------------------------------------------------------- a session
  // Fish at a spot until she packs up. opts.queue: catches to hand out first (the Epilogue's lesson);
  // opts.until(): checked after each catch, true ends it; opts.stay: no packing up before that;
  // opts.onCatch(catch): awaited after each. Resolves when it is over.
  open(spot, opts = {}) {
    if (this.phase) return this.done;
    const p = G.player;
    this.spot = spot;
    this.opts = opts;
    this.baited = false;
    this.caught = 0;
    G.frozen = true;
    G.soothe.target = null;
    p.teleport(spot.at, spot.face);
    p.setState('pose');
    p.h.play('idle', 0.3);
    p.h.overlayPlay(null);
    // over her shoulder, at the water (pulled in if a wall is behind her)
    p.h.root.updateMatrixWorld(true);
    const head = _a.copy(spot.at).setY(spot.at.y + 1.0);
    const [back, up, side] = spot.cam || [4, 2, 1.5];
    const cam = _b.copy(spot.at).addScaledVector(spot.dir, -back).addScaledVector(spot.right, side);
    cam.y += up;
    const to = _c.subVectors(cam, head);
    const len = to.length();
    const hit = G.collision ? G.collision.raycast(head, to.normalize(), len + 0.3) : Infinity;
    if (hit < len + 0.3) cam.copy(head).addScaledVector(to, Math.max(1.2, hit - 0.3));
    const [near, far] = this.reach();
    // (a tall screen looks nearer the shore, which keeps her above the panel)
    G.cam.setShot(cam, this.place(new Vector3(), spot, near + (far - near) * (G.camera.aspect < 1 ? 0.1 : 0.4), 0, 0.2), 0.9);
    // friends walking with her step aside, out of the camera's way
    this.aside = this.zone.npcs.filter((n) => n.follower && !n.hidden).map((n, i) => {
      const slot = n.follower.slot;
      n.follow(null);
      n.place(_c.copy(spot.at).addScaledVector(spot.dir, -0.4 - i * 0.5).addScaledVector(spot.right, -(1.5 + i * 0.95) * Math.sign(side || 1)), spot.face, this.zone.collision);
      return [n, slot];
    });
    this.hud();
    this.stock();
    this.shimmer.visible = true;
    this.d = near;
    this.l = 0;
    this.set('aim');
    this.wait = 0.35; // (the press that started this must not also pack up)
    G.updaters.add(this.tick);
    G.events.emit('fishing', true);
    return (this.done = new Promise((res) => (this.resolve = res)));
  }

  close() {
    const p = G.player;
    G.updaters.delete(this.tick);
    this.el?.remove();
    this.card?.remove();
    this.el = this.card = null;
    this.ribbon.hide();
    for (const o of [this.float, this.ring, this.shimmer]) o.visible = false;
    this.phase = null;
    G.audio.setHumming(false);
    G.cam.clearShot();
    G.cam.snapBehind(p);
    for (const [n, slot] of this.aside || []) n.follow(slot);
    p.h.overlayPlay(null);
    p.setState('move');
    G.frozen = false;
    writeSave(G.save);
    G.events.emit('fishing', false);
    this.resolve?.(this.caught);
  }

  hud() {
    const el = (this.el = document.createElement('div'));
    el.className = 'cook panel show lanterns fish';
    el.setAttribute('role', 'dialog');
    const key = (a) => (G.input.device === 'touch' ? '' : ` <small>(${G.input.label(a)})</small>`);
    el.innerHTML = `<h3>🧵 ${this.spot.name}</h3><div class="fhint" aria-live="polite"></div>
      <div class="frow"><div class="beatring"><div class="pulse"></div></div><div class="meter away"><div class="zone"></div><div class="fill"></div></div></div>
      <div class="fbtns"><button class="btn hold">Hum</button><button class="btn alt bait"></button><button class="btn alt leave">Pack up${key('interact')}</button></div>`;
    const q = (c) => el.querySelector(c);
    this.hintEl = q('.fhint');
    this.pulseEl = q('.pulse');
    this.ringEl = q('.beatring');
    this.meterEl = q('.meter');
    this.fillEl = q('.fill');
    this.baitEl = q('.bait');
    this.leaveEl = q('.leave');
    this.holdBtn = false;
    const hold = q('.hold');
    hold.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      hold.setPointerCapture?.(e.pointerId);
      this.holdBtn = this.clicked = true;
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(ev, () => (this.holdBtn = false));
    this.baitEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.wantBait = true;
    });
    this.leaveEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.wantLeave = true;
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    G.ui.root.append(el);
  }

  hint(text) {
    if (!this.hintEl || this.hintText === text) return;
    this.hintText = text;
    this.hintEl.innerHTML = `<span>${text}</span>`;
  }

  set(phase) {
    this.phase = phase;
    this.t = 0;
    const hum = G.input.device === 'touch' ? 'Hum' : `Hum (${G.input.label('hum')})`;
    if (phase === 'aim') {
      const s = G.save;
      const bait = s.tarts > 0 ? '🥧 Tart' : s.chestnuts > 0 ? '🌰 Chestnuts' : '';
      this.baitEl.hidden = !bait || this.baited;
      this.baitEl.innerHTML = bait ? `Bait: ${bait}${G.input.device === 'touch' ? '' : ` <small>(${G.input.label('jump')})</small>`}` : '';
      this.leaveEl.hidden = !!this.opts.stay;
      this.hint(`Hold <b>${hum}</b> to send the thread out. Let go to drop the float${this.baited ? ' <b>(baited)</b>' : ''}.`);
      this.T = 0;
      this.holding = false;
    } else {
      this.baitEl.hidden = true;
      this.leaveEl.hidden = phase !== 'lure' || !!this.opts.stay;
    }
    if (phase === 'lure') this.hint(`Hum <b>on the beat</b> to call it closer.`);
    if (phase === 'bite') this.hint(`<b>A bite! Press ${hum}!</b>`);
    this.ringEl?.classList.toggle('bite', phase === 'bite');
    this.meterEl?.classList.toggle('away', phase !== 'reel');
    if (this.el) this.el.style.display = phase === 'card' ? 'none' : '';
  }

  splash(at, n = 10, big = false) {
    G.fx.sparkles.emit(at, n, '#dff3ff', { speed: big ? 1.6 : 0.9, up: big ? 1.8 : 1, size: big ? 0.2 : 0.13, life: 0.8, spread: 0.25 });
    this.ripple = 0;
    this.rippleAt = (this.rippleAt || new Vector3()).copy(at);
  }

  update(dt) {
    const input = G.input,
      p = G.player,
      spot = this.spot;
    this.t += dt;
    this.wait -= dt;
    const phase = this.phase;
    // (while a card is up, the presses are its own: show())
    const press = phase !== 'card' && (input.consume('hum') || this.clicked);
    if (phase !== 'card') this.clicked = false;
    const held = input.humHeld || this.holdBtn;
    const [near, far] = this.reach();
    // the beat, on the ring
    const b = G.audio.beat();
    if (b.index !== this.lastBeat) {
      this.lastBeat = b.index;
      this.pulseEl.classList.remove('beat');
      void this.pulseEl.offsetWidth;
      this.pulseEl.classList.add('beat');
    }
    const fl = this.float.position;
    let humming = false;

    if (phase === 'aim') {
      const ok = this.wait <= 0;
      // (a tap or a press that comes a moment early still counts)
      if (!ok && (input.consume('interact') || input.consume('back'))) this.wantLeave = true;
      const leave = ok && (input.consume('interact') || input.consume('back') || this.wantLeave) && !this.opts.stay;
      const bait = ok && (input.consume('jump') || this.wantBait) && !this.baitEl.hidden;
      if (ok) this.wantLeave = this.wantBait = false;
      if (leave) return this.close();
      if (bait) this.bait();
      // the marker slides out and back while Hum is held; let go, and the float drops there
      if (held && ok) {
        if (!this.holding) {
          this.holding = true;
          this.sweep = 0;
          p.h.overlayPlay('hum', 0.2);
        }
        this.sweep += dt * 3.2;
        const span = far - near;
        const k = this.sweep % (span * 2);
        this.d = near + (k < span ? k : span * 2 - k);
        this.l = clamp(this.l + input.move.x * 2.2 * dt, -spot.wide, spot.wide);
        humming = true;
      } else if (this.holding) {
        this.holding = false;
        this.cast();
      }
      this.place(this.ring.position, spot, this.d, this.l);
      this.ring.visible = true;
      this.ring.scale.setScalar(0.3 + Math.sin(G.time * 5) * 0.03);
      this.ring.material.opacity = this.holding ? 0.9 : 0.45;
      this.float.visible = false;
      this.ribbon.hide();
    } else if (phase === 'fly') {
      // the float flies out on the end of the thread
      const k = Math.min(1, this.t / 0.55);
      p.h.worldBone('hand_R', _a);
      this.place(_b, spot, this.d, this.l, 0.06);
      fl.lerpVectors(_a, _b, k);
      fl.y += Math.sin(k * Math.PI) * 1.3;
      this.float.visible = true;
      if (k >= 1) {
        sfx.plop();
        this.splash(_b, 8);
        // the nearest glimmer has noticed it
        let bd = 1e9;
        for (const g of this.glimmers) {
          const dd = Math.hypot(g.d - this.d, g.l - this.l);
          if (dd < bd) {
            bd = dd;
            this.target = g;
          }
        }
        this.interest = clamp(0.75 - bd * 0.2, 0.1, 0.7) + (this.baited ? 0.15 : 0);
        this.nibble = 0;
        this.set('lure');
        G.events.emit('fish-cast', { d: this.d, off: bd });
      }
    } else if (phase === 'lure') {
      const leave = (input.consume('interact') || input.consume('back') || this.wantLeave) && !this.opts.stay;
      this.wantLeave = false;
      if (leave) return this.close();
      if (press) {
        if (onBeat()) {
          this.interest += 0.3;
          G.audio.play('perfect');
          this.splash(fl, 2);
          G.ui.floaty(fl, '♪');
        } else {
          this.interest = Math.max(0, this.interest - 0.12);
          this.hint('It shied a little. Hum <b>on the beat</b>: watch the ring.');
        }
      }
      // (it comes in the end anyway, slowly: nobody is left waiting at the water)
      this.interest += dt * ((this.baited ? 0.1 : 0.05) + (G.collection.helper('float') ? 0.08 : 0));
      if (this.interest >= 1 && (this.nibble += dt) > 0.5) {
        sfx.dip();
        this.splash(fl, 6);
        this.set('bite');
        G.events.emit('fish-bite');
      }
    } else if (phase === 'bite') {
      if (press) {
        sfx.taut();
        this.p = 0;
        this.T = 0.15;
        this.over = 0;
        this.tug = false;
        this.tugT = 1 + this.rnd();
        this.gentle = true;
        this.d0 = this.d;
        p.h.overlayPlay('hum', 0.2);
        this.set('reel');
      } else if (this.t > 1.5) {
        this.interest = 0.45;
        this.nibble = 0;
        this.set('lure');
        this.hint('It nibbled, and let go. It’s still there: hum <b>on the beat</b>.');
      }
    } else if (phase === 'reel') {
      const g = this.target;
      // it tugs and rests by turns: the stronger it is, the longer the tugs and the shorter the rests
      if ((this.tugT -= dt) <= 0) {
        this.tug = !this.tug;
        this.tugT = this.tug ? 0.6 + g.tug * 0.9 + this.rnd() * 0.4 : 2.3 - g.tug * 1.2 + this.rnd() * 0.8;
        if (g.mode === 'jitter') this.tugT *= 0.55;
        if (this.tug) {
          sfx.taut();
          this.splash(fl, 5);
        }
      }
      const calm = 1 - Math.min(0.45, (G.save.line.calm || 0) * 0.15);
      if (held) {
        humming = true;
        this.p += dt * (this.tug ? 0.05 : 0.2) * (g.mode === 'still' ? 0.8 : 1);
        this.T += dt * (this.tug ? 0.7 + g.tug * 0.6 : -0.25) * (this.tug ? calm : 1);
        if ((this.click = (this.click || 0) + dt) > 0.12) {
          this.click = 0;
          sfx.reel();
        }
        if (press && onBeat()) {
          this.p += 0.05;
          G.audio.play('perfect');
          G.ui.floaty(fl, '♪');
        }
      } else {
        this.T -= dt * 0.7;
        this.p = Math.max(0, this.p - dt * (this.tug ? 0.06 : 0.012));
      }
      this.T = clamp(this.T, 0, 1.05);
      if (this.T > 0.8) this.gentle = false;
      this.over = this.T >= 1 ? this.over + dt : Math.max(0, this.over - dt * 2);
      this.fillEl.style.width = Math.min(100, this.T * 100) + '%';
      this.meterEl.classList.toggle('hot', this.T > 0.8);
      this.meterEl.classList.toggle('tug', this.tug);
      this.hint(this.tug ? (held ? '<b>It’s pulling! Ease off!</b>' : 'It’s pulling… wait for it to rest.') : `<b>Hold ${G.input.device === 'touch' ? 'Hum' : 'Hum (' + G.input.label('hum') + ')'}</b> to wind it in.`);
      // the float comes in as she winds, and thrashes when it tugs
      this.d = this.d0 + (near * 0.55 - this.d0) * Math.min(1, this.p);
      this.place(fl, spot, this.d, this.l + (this.tug ? Math.sin(this.t * 19) * 0.16 : 0), 0.06 - (this.tug ? 0.05 : 0));
      if (this.tug && Math.random() < dt * 6) G.fx.sparkles.emit(fl, 1, '#dff3ff', { speed: 0.6, up: 0.8, size: 0.1, life: 0.5, spread: 0.2 });
      // a Bottled-Up is only soothed by a gentle hand: one hard pull and it goes back under
      if (g.what.kind === 'bottled' && !this.gentle) return this.away('It went back under. It wants a gentler hand: ease off <b>before</b> the bar is red.');
      if (this.over > 0.5) return this.away();
      if (this.p >= 1) return this.land(g.what);
    }

    if (phase === 'lure' || phase === 'bite') {
      this.place(fl, spot, this.d, this.l, 0.06 + Math.sin(G.time * 3) * 0.015 - (phase === 'bite' ? 0.09 + Math.sin(this.t * 16) * 0.03 : 0));
    }
    this.glimmer(dt);
    // the thread: slack and soft, or taut and bright
    if (this.float.visible) {
      p.h.worldBone('hand_R', _a);
      const taut = phase === 'reel' ? this.T : phase === 'fly' ? 0.6 : 0.1;
      const sag = (1 - taut) * 0.14 * _a.distanceTo(fl);
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        PTS[i].lerpVectors(_a, fl, k).y -= Math.sin(k * Math.PI) * sag;
        if (phase === 'reel' && this.tug) PTS[i].y += Math.sin(k * 14 - this.t * 30) * 0.012 * Math.sin(k * Math.PI);
      }
      this.ribbon.mat.uniforms.color.value.set('#ffb35c').lerp(_col.set('#ff5a3c'), phase === 'reel' ? clamp((this.T - 0.5) * 2, 0, 1) : 0);
      this.ribbon.set(PTS, G.camera, 0.03 + taut * 0.015);
    }
    // ripples
    if (phase !== 'aim') {
      this.ripple += dt;
      const k = this.ripple / 1.1;
      this.ring.visible = k < 1 && !!this.rippleAt;
      if (this.ring.visible) {
        this.ring.position.copy(this.rippleAt).setY(spot.y + 0.03);
        this.ring.scale.setScalar(0.15 + k * 0.75);
        this.ring.material.opacity = (1 - k) * 0.7;
      }
    }
    if (phase !== 'card') G.audio.setHumming(humming);
  }

  bait() {
    const s = G.save;
    if (s.tarts > 0) s.tarts--;
    else if (s.chestnuts > 0) s.chestnuts--;
    else return;
    this.baited = true;
    G.collection.refreshHud();
    G.audio.play('blip');
    this.stock(); // the smell of it brings other things up
    this.set('aim');
    this.wait = 0.2;
  }

  cast() {
    const p = G.player;
    p.h.overlayPlay('throw', 0.1);
    G.audio.play('whoosh');
    p.h.worldBone('hand_R', this.float.position);
    this.set('fly');
  }

  // The glimmers under the water: fish swim to and fro, lost things lie still, reminders bob. The one the
  // float has caught the eye of comes to it as its interest grows.
  glimmer(dt) {
    const spot = this.spot;
    const [near, far] = this.reach();
    this.glimmers.forEach((g, i) => {
      const t = G.time * g.speed + g.ph;
      let d = g.hd,
        l = g.hl;
      if (g.mode === 'swim') {
        d += Math.sin(t * 0.7) * 0.9;
        l += Math.sin(t) * spot.wide * 0.55;
      } else if (g.mode === 'jitter') {
        d += Math.sin(t * 5) * 0.12;
        l += Math.cos(t * 4.3) * 0.12;
      }
      d = clamp(d, near * 0.8, far + 0.5);
      l = clamp(l, -spot.wide, spot.wide);
      const mine = g === this.target && this.phase !== 'aim' && this.phase !== 'fly';
      // drawn to the float (and on the line, under it)
      g.pull += ((mine ? (this.phase === 'lure' ? clamp(this.interest, 0, 1) * 0.92 : 1) : 0) - g.pull) * Math.min(1, dt * 3);
      d += (this.d - d) * g.pull;
      l += (this.l - l) * g.pull;
      if (mine && this.phase === 'lure') {
        // circling, closer and closer
        const r = (1 - g.pull) * 0.5 + 0.12;
        d += Math.cos(t * 2.2) * r;
        l += Math.sin(t * 2.2) * r;
      }
      const vd = d - g.d,
        vl = l - g.l;
      if (Math.hypot(vd, vl) > 1e-4) g.yaw = Math.atan2(vd * spot.dir.x + vl * spot.right.x, vd * spot.dir.z + vl * spot.right.z);
      g.d = d;
      g.l = l;
      this.place(_a, spot, d, l, 0.02);
      // its shadow under the water (long for a fish, round for a thing), and a glint that comes and goes on it
      const long = g.mode === 'swim' ? 1 : 0.55;
      const s = this.phase === 'card' && mine ? 0 : g.r;
      _m.makeRotationY(g.yaw).scale(_s.set(s * 0.45 * (g.mode === 'swim' ? 1 : 1.2), 1, s * long));
      _m.setPosition(_a);
      this.shimmer.setMatrixAt(i * 2, _m);
      this.shimmer.setColorAt(i * 2, _col.set(g.mode === 'swim' ? '#16404a' : '#3a3626'));
      const glint = g.mode === 'bob' ? 0.75 + Math.sin(t * 4) * 0.25 : g.mode === 'still' ? 0.6 + Math.sin(t * 1.3) * 0.15 : Math.max(0, Math.sin(t * 2.1 + i)) * 0.8 + 0.15;
      _a.y += 0.01;
      _m.makeRotationY(g.yaw).scale(_s.set(s * 0.2 * glint, 1, s * (g.mode === 'swim' ? 0.55 : 0.2) * glint));
      _m.setPosition(_a);
      this.shimmer.setMatrixAt(i * 2 + 1, _m);
      this.shimmer.setColorAt(i * 2 + 1, g.color);
    });
    this.shimmer.count = this.glimmers.length * 2;
    this.shimmer.instanceMatrix.needsUpdate = true;
    if (this.shimmer.instanceColor) this.shimmer.instanceColor.needsUpdate = true;
  }

  // It got away. Nothing is lost: the water is restocked and she casts again.
  async away(why) {
    const c = this.target.what;
    this.set('card');
    sfx.splash();
    G.audio.play('snap');
    this.splash(this.float.position, 14, true);
    this.float.visible = false;
    this.ribbon.hide();
    const looked = c.kind === 'fish' ? `a <b>${FISH[c.id].name}</b>` : c.kind === 'lost' ? 'something that wasn’t a fish' : c.kind === 'reminder' ? 'a little light' : c.kind === 'bottled' ? 'a bottle with a note in it' : 'a coin';
    G.ui.toast(why || `It got away! It looked like ${looked}.`, 3.2);
    G.events.emit('fish-escape', c);
    await wait(1.3);
    if (this.phase !== 'card') return;
    this.again();
  }

  again() {
    if (this.opts.until?.()) return this.close();
    this.baited = false;
    this.stock();
    this.d = this.reach()[0];
    this.set('aim');
    this.wait = 0.3;
  }

  // A card over the scene; resolves when it is dismissed (Hum, Interact, a tap).
  show(html) {
    const card = (this.card = document.createElement('div'));
    card.className = 'fcard panel';
    card.setAttribute('role', 'dialog');
    card.innerHTML = html + `<div class="small">${G.input.device === 'touch' ? 'Tap' : 'Press ' + G.input.label('hum') + ' or ' + G.input.label('interact')} to carry on</div>`;
    G.ui.root.append(card);
    let tapped = false;
    card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tapped = true;
    });
    return new Promise((res) => {
      let t = 0;
      const u = (dt) => {
        const i = G.input;
        const press = i.consume('hum') || i.consume('interact') || i.consume('jump') || i.consume('confirm') || tapped || this.clicked;
        if ((t += dt) < 0.5 || !press) return;
        this.clicked = false;
        G.updaters.delete(u);
        card.remove();
        this.card = null;
        G.audio.play('blip');
        res();
      };
      G.updaters.add(u);
    });
  }

  // The catch is in.
  async land(c) {
    const s = G.save,
      p = G.player,
      spot = this.spot,
      z = this.zone;
    this.set('card');
    this.caught++;
    G.audio.setHumming(false);
    p.h.overlayPlay(null, 0.3);
    const from = this.float.position.clone();
    sfx.splash();
    this.splash(from, 16, true);
    this.float.visible = false;
    this.ribbon.hide();
    // where she holds it up: in front of her, at her chest
    const hold = spot.at.clone().addScaledVector(spot.dir, 0.7).addScaledVector(spot.right, -0.8);
    hold.y = p.position.y + 1.15;
    const asked = this.opts.queue?.length ? this.opts.queue : this.next;
    if (asked.length) asked.shift();
    const ev = { ...c, spot: spot.id };
    const leap = (obj, to, seconds, up = 1) => {
      const a = obj.position.clone();
      return tween(seconds, (k) => {
        obj.position.lerpVectors(a, to, k).y += Math.sin(k * Math.PI) * up;
      });
    };

    if (c.kind === 'fish') {
      const f = FISH[c.id];
      const rec = s.fish[c.id];
      const first = (ev.first = !rec);
      const record = (ev.record = !!rec && c.cm > rec[0]);
      s.fish[c.id] = [Math.max(c.cm, rec?.[0] || 0), (rec?.[1] || 0) + 1];
      if (s.ask && s.ask[0] === c.id && c.cm >= s.ask[1]) s.ask[2] = 1; // what Uncle Ming asked for
      const mesh = fishMesh(f, 0.3 + Math.min(1.2, c.cm / 100) * 0.6); // (held up a little larger than life)
      mesh.position.copy(from);
      mesh.rotation.y = spot.face + Math.PI / 2;
      z.group.add(mesh);
      const spin = (dt) => {
        mesh.rotation.y += dt * 0.9;
        mesh.rotation.z = Math.sin(G.time * 9) * 0.12; // it wriggles
      };
      G.updaters.add(spin);
      G.audio.play(first ? 'pop' : 'sparkle');
      await leap(mesh, hold, 0.6, 0.9);
      await this.show(`<div class="ico">${f.icon}</div><h3>${f.name}${first ? '<span class="tag">New!</span>' : record ? '<span class="tag">A record!</span>' : ''}</h3>
        <div class="cm">${c.cm} cm${rec && !record ? ` · your biggest: ${rec[0]} cm` : ''}</div><p>${f.line}</p>
        <div class="hello">Pip: “${HELLO[Math.floor(Math.random() * HELLO.length)]}” And back it goes.</div>`);
      // and back it goes
      await leap(mesh, from, 0.5, 0.7);
      G.updaters.delete(spin);
      mesh.removeFromParent();
      mesh.geometry.dispose();
      sfx.plop();
      this.splash(from, 8);
      if (first) {
        G.collection.cozy(3, 'A new fish', hold);
        addPatch(1);
      } else if (record) G.collection.cozy(1, 'A record', hold);
    } else if (c.kind === 'lost') {
      const l = LOST[c.id];
      s.lost[c.id] = 1;
      G.audio.play('notice');
      G.fx.sparkles.emit(hold, 14, '#ffe9b0', { speed: 0.7, up: 0.6, size: 0.14, life: 1.1 });
      await this.show(`<div class="ico">${l.icon}</div><h3>${l.name}<span class="tag">Lost</span></h3><p>${l.found}</p><div class="cm">It belongs to ${l.who}.</div>`);
      G.ui.toast(`🎒 Take it back to ${l.who}.`, 4);
    } else if (c.kind === 'bottled') {
      // soothed on the line: the cork comes out with a sigh, and there is the Charm Sprite
      const bottle = makeCreature('bottled', { glow: SPECIES.bottled.glow });
      bottle.position.copy(from);
      bottle.rotation.y = spot.face + Math.PI;
      z.group.add(bottle);
      const cork = bottle.userData.parts?.cork;
      await leap(bottle, hold.clone().setY(hold.y - 0.2), 0.7, 0.9);
      // the cork comes out, with a sigh
      G.audio.play('sigh');
      if (cork) await tween(0.6, (k) => (cork.position.y += k * 0.02));
      G.collection.add('bottled', bottle.position.clone());
      G.audio.play('pop');
      bottle.removeFromParent();
      await this.show(`<div class="ico">🍾</div><h3>${SPECIES.bottled.name}</h3><p>“${SPECIES.bottled.feeling}”</p><div class="cm">It said it out loud, all the way in. It feels lighter.</div>`);
      addPatch(1);
    } else if (c.kind === 'wish') {
      const text = WISHES[Math.floor(this.rnd() * WISHES.length)];
      G.audio.play('candy');
      await this.show(`<div class="ico">🪙</div><h3>A coin, and the wish that went with it</h3><p>“${text}”</p><div class="cm">Pip puts it back. Plink.</div>`);
      sfx.plop();
      this.splash(from, 4);
      G.collection.cozy(1, 'A wish, kept', hold);
    } else {
      // a little reminder: a piece of the Great Sulk that fell short. It says what it is, and flies home.
      const text = (ev.text = c.text || REMINDERS[(s.reminders + Math.floor(this.rnd() * 3)) % REMINDERS.length]);
      s.reminders++;
      const mote = new Mesh(DISC, materialFor('glow', { color: '#ffd9a0', vertexColors: false }));
      mote.scale.set(0.09, 9, 0.09);
      mote.position.copy(from);
      z.group.add(mote);
      const trail = (dt) => Math.random() < dt * 14 && G.fx.sparkles.emit(mote.position, 1, '#ffcf8a', { speed: 0.15, up: 0.1, size: 0.16, life: 0.9, spread: 0.1 });
      G.updaters.add(trail);
      G.audio.play('sparkle');
      await leap(mote, hold.clone().setY(hold.y + 0.35), 0.8, 0.5);
      G.ui.bubble(mote, `“${text}”`, 2.8, 0.3);
      await wait(2.6);
      // home, across the bay
      G.audio.play('chime');
      const up = mote.position.clone().addScaledVector(spot.dir, 16).addScaledVector(spot.right, (Math.random() - 0.5) * 12);
      up.y += 14;
      await leap(mote, up, 1.6, 2);
      G.updaters.delete(trail);
      mote.removeFromParent();
      G.ui.toast(`🕊️ A little reminder went home. That makes <b>${s.reminders}</b>.`, 3);
      G.collection.cozy(1, '', null);
      if (s.reminders % 3 === 0) addPatch(1);
    }
    writeSave(s);
    G.events.emit('fish-catch', ev);
    await this.opts.onCatch?.(ev);
    if (this.phase !== 'card') return;
    this.again();
  }
}

export function setupFishing(z) {
  return z.fishing || new Fishing(z);
}

// ---------------------------------------------------------------- Uncle Ming
// The fisherman who has always stood at the station asks for one thing at a time. The first six are written
// (content/catches.js), and each makes the thread a little better; after those he asks for a fish of a size,
// without end.
const where = (id) => {
  for (const spots of Object.values(SPOTS)) for (const s of spots) if (s.fish.includes(id)) return s.name.replace(/^The /, 'the ');
  return 'the water';
};
function request(s) {
  if (s.ming < REQUESTS.length) return REQUESTS[s.ming];
  if (!s.ask) {
    const rnd = mulberry(977 + s.ming * 31);
    const ids = Object.keys(FISH);
    const id = ids[Math.floor(rnd() * ids.length)];
    const f = FISH[id];
    s.ask = [id, Math.round(f.size[0] + (f.size[1] - f.size[0]) * (0.3 + rnd() * 0.4)), 0];
  }
  const [id, cm] = s.ask;
  return { ask: `A ${FISH[id].name}, ${cm} cm or more. You’ll find them from ${where(id)}.`, met: (v) => !!v.ask?.[2], gift: null };
}
export function mingAsks(s = harbour()) {
  return request(s).ask;
}
export async function uncleMing(who = 'fisher') {
  const s = harbour();
  SPEAKERS[who] ||= ['Uncle Ming', '#4a6a8a'];
  const r = request(s);
  if (!flag('ming_met')) {
    flag('ming_met', true);
    await talk([
      [who, 'Thread-fisher! Sit. No, stand. Fishing is standing still on purpose.'],
      [who, 'I’ll ask you for one thing at a time. Bring me that, and I’ll do something for your thread.'],
      [who, r.ask],
    ]);
    return;
  }
  if (!r.met(s)) {
    await talk([[who, 'Still waiting on this one:'], [who, r.ask]]);
    return;
  }
  s.ming++;
  delete s.ask;
  const lines = [[who, ['Ha! There it is.', 'Well, look at that.', 'I knew you had it in you.'][s.ming % 3]]];
  if (r.gift) {
    s.line[r.gift[0]] = (s.line[r.gift[0]] || 0) + 1;
    lines.push([who, `Give me your thread a moment… There. Now it’s ${r.gift[1]}.`]);
  } else lines.push([who, 'Your thread’s as good as I can make it. So this one’s for the pleasure of it.']);
  await talk(lines);
  G.audio.play('thanks');
  G.collection.cozy(r.gift ? 6 : 4, 'Uncle Ming’s request', G.player.position.clone().setY(G.player.position.y + 1.6));
  addPatch(2);
  writeSave(s);
  G.events.emit('ming', s.ming);
  await talk([[who, 'Next, then.'], [who, request(s).ask]]);
}

// ---------------------------------------------------------------- the Harbour Book (a page of the Sprite Book)
function harbourPage() {
  const s = harbour();
  const fish = Object.entries(FISH)
    .map(([id, f]) => (s.fish[id] ? `<span class="mem">${f.icon}<small>${f.name}<br>${s.fish[id][0]} cm · ×${s.fish[id][1]}</small></span>` : '<span class="mem unknown">?<small>Not yet caught</small></span>'))
    .join('');
  const lost = Object.entries(LOST)
    .map(([id, l]) => (s.lost[id] ? `<span class="mem">${l.icon}<small>${l.name}<br>${s.lost[id] === 2 ? '✔ given back' : 'for ' + l.who}</small></span>` : '<span class="mem unknown">?<small>Still out there</small></span>'))
    .join('');
  return `<h3>The Harbour Book · ${Object.keys(s.fish).length}/${Object.keys(FISH).length} fish</h3><div class="memrow">${fish}</div>
    <h3>Lost things · ${Object.values(s.lost).filter((v) => v === 2).length}/${Object.keys(LOST).length} given back</h3><div class="memrow">${lost}</div>
    <p class="small">🕊️ Little reminders sent home: <b>${s.reminders}</b>${s.ming ? ` · Uncle Ming’s requests: <b>${s.ming}</b>` : ''}</p>`;
}
