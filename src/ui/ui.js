// SPDX-License-Identifier: GPL-3.0-only
// HUD, dialogue, prompts, toasts, chapter cards, fades and world-anchored bubbles.
import { Vector3 } from 'three';
import { G } from '../game.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export const SPEAKERS = {
  xiaopei: ['Pip', '#e0662c'],
  tangtang: ['Sunny Lin', '#2f8a8f'],
  weibao: ['Bo', '#b7862e'],
  honk: ['Captain Honk', '#6d6d6d'],
  fang: ['Master Fang', '#c95a24'],
  doudou: ['Bean', '#a08463'],
  passenger: ['Passenger', '#6f7f8f'],
  auntie: ['Auntie on the train', '#7b6aa0'],
  student: ['Student', '#5e8a5e'],
  sprite: ['Charm Sprite', '#d49a2a'],
  cloud: ['Soggy Cloud', '#6f8fae'],
  sock: ['Lost Sock', '#c9574a'],
  homework: ['Unfinished Homework', '#8a8f5a'],
  pompom: ['Picked-Last Pom-pom', '#9a78b8'],
  conductor: ['Conductor', '#4a6a5e'],
  // Chapter 2: the night market
  sparrow: ['Wistful Sparrow', '#b8875a'],
  musician: ['Street musician', '#8a5a8a'],
  lanternseller: ['Lantern seller', '#b5483a'],
  toyseller: ['Toy seller', '#2f6f73'],
  chestnut: ['Chestnut seller', '#8a5530'],
  kid: ['Little one', '#d98a2a'],
  parent: ['Worried parent', '#6a7fa0'],
};

const _v = new Vector3();

export class UI {
  constructor(root) {
    this.root = root;
    // top-left: cozy energy + chips
    const tl = el('div', 'hud-tl');
    this.cozy = el('div', 'cozy', '<span class="ico"></span><span class="bar"><i></i></span><b>0</b>');
    this.cozy.title = 'Cozy Energy';
    this.chips = el('div', 'chips');
    this.tartChip = el('span', 'chip');
    this.nutChip = el('span', 'chip');
    this.candyChip = el('span', 'chip');
    this.chips.append(this.tartChip, this.nutChip, this.candyChip);
    tl.append(this.cozy, this.chips);
    this.objective = el('div', 'objective');
    const tr = el('div', 'hud-tr');
    this.bookBtn = el('button', 'round', '📖');
    this.bookBtn.title = 'Sprite Book (Tab)';
    this.bookBtn.setAttribute('aria-label', 'Open the Sprite Book');
    this.pauseBtn = el('button', 'round', 'Ⅱ');
    this.pauseBtn.title = 'Pause (Esc)';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    tr.append(this.bookBtn, this.pauseBtn);
    this.helper = el('div', 'helper');
    this.promptEl = el('div', 'prompt');
    // soothing ring
    this.sootheEl = el('div', 'soothe off');
    this.sootheEl.innerHTML = `<div class="feel"></div><div class="ring"><svg viewBox="0 0 78 78"><circle cx="39" cy="39" r="33" fill="#0006" stroke="#fff4" stroke-width="6"/>
      <circle class="prog" cx="39" cy="39" r="33" fill="none" stroke="#ffb35c" stroke-width="6" stroke-linecap="round" stroke-dasharray="207.3" stroke-dashoffset="207.3"/></svg>
      <div class="pulse"></div><div class="label">Hum</div></div><div class="calm"></div>`;
    this.progEl = this.sootheEl.querySelector('.prog');
    this.pulseEl = this.sootheEl.querySelector('.pulse');
    this.feelEl = this.sootheEl.querySelector('.feel');
    this.ringLabel = this.sootheEl.querySelector('.label');
    this.calmEl = this.sootheEl.querySelector('.calm');
    for (let i = 0; i < 4; i++) this.calmEl.append(el('i'));
    this.toasts = el('div', 'toasts');
    // the guide's arrow and distance (systems/wayfinder.js), under the objective, above the toasts
    this.wayEl = el('div', 'way', '<i>▲</i><span></span>');
    this.wayEl.hidden = true;
    this.toasts.append(this.wayEl);
    this.cardEl = el('div', 'card');
    this.fadeEl = el('div', 'fade');
    // dialogue
    this.dlg = el('div', 'dialogue panel');
    this.dlgWho = el('div', 'who');
    this.dlgText = el('div', 'text');
    this.dlgMore = el('div', 'more', '▼');
    this.dlgChoices = el('div', 'choices');
    // skip to the end of a long conversation: tap it, or hold the key that advances (it fills up meanwhile)
    this.dlgSkip = el('button', 'skip', '<i></i><span>Skip ⏭</span>');
    this.dlgSkip.setAttribute('aria-label', 'Skip to the end of this conversation');
    this.dlgSkip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.skip();
    });
    this.dlg.append(this.dlgWho, this.dlgText, this.dlgChoices, this.dlgMore, this.dlgSkip);
    this.dlg.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!this.dlgChoices.childElementCount) this.advance = true;
    });
    this.worldLayer = el('div');
    this.worldLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    // the top of the screen, in the middle: the objective, then the guide's arrow and the toasts under it
    // (one column, so however many lines the objective takes, nothing lands on top of it)
    const mid = el('div', 'topmid');
    mid.append(this.objective, this.toasts);
    root.append(this.worldLayer, tl, mid, tr, this.helper, this.promptEl, this.sootheEl, this.dlg, this.cardEl, this.fadeEl);
    this.bubbles = new Set();
    this.dialogueOpen = false;
    this.lastBeat = -1;
    if (new URLSearchParams(location.search).has('debug')) {
      this.debugEl = el('div', 'debug');
      root.append(this.debugEl);
    }
  }

  // ---------------------------------------------------------------- HUD values
  setCozy(v) {
    this.cozy.querySelector('i').style.width = Math.min(100, v) + '%';
    this.cozy.querySelector('b').textContent = Math.floor(v);
  }
  setChips(tarts, candies, candyTotal, chestnuts = 0) {
    this.tartChip.textContent = tarts ? `🥧 ${tarts}` : '';
    this.nutChip.textContent = chestnuts ? `🌰 ${chestnuts}` : '';
    this.candyChip.textContent = candyTotal ? `🍬 ${candies}/${candyTotal}` : '';
  }
  setObjective(text) {
    if (this.objective.textContent === text) return;
    this.objective.textContent = text || '';
    this.objective.classList.remove('new');
    void this.objective.offsetWidth;
    if (text) this.objective.classList.add('new');
  }
  setHelper(name, img, ability) {
    this.helper.innerHTML = name ? `<img alt="" src="${img || ''}"><span>${name}<br><small>${ability}</small></span>` : '';
  }
  prompt(label, key) {
    const html = label ? `<span class="key">${key}</span>${label}` : '';
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
  }

  // soothing ring: progress 0..1, calm 0..4, beat pulse from the lullaby clock
  soothe(active, progress = 0, calm = 4, feeling = '', label = 'Hum') {
    this.sootheEl.classList.toggle('off', !active);
    this.root.classList.toggle('soothing', active); // lifts the context prompt above the ring
    if (!active) return;
    this.progEl.style.strokeDashoffset = String(207.3 * (1 - progress));
    this.calmEl.querySelectorAll('i').forEach((c, i) => c.classList.toggle('gone', i >= calm));
    if (this.feelEl.textContent !== feeling) this.feelEl.textContent = feeling;
    if (this.ringLabel.textContent !== label) this.ringLabel.textContent = label;
    const b = G.audio.beat();
    if (b.index !== this.lastBeat) {
      this.lastBeat = b.index;
      this.pulseEl.classList.remove('beat');
      void this.pulseEl.offsetWidth;
      this.pulseEl.classList.add('beat');
    }
  }

  // Big celebratory banner (team-up combos).
  combo(text) {
    const c = el('div', 'combo', text);
    this.root.append(c);
    setTimeout(() => c.remove(), 1900);
  }

  toast(text, life = 2.6, cls = '') {
    const t = el('div', 'toast ' + cls, text);
    t.style.setProperty('--life', life + 's');
    this.toasts.append(t);
    setTimeout(() => t.remove(), (life + 0.6) * 1000);
    const all = this.toasts.querySelectorAll('.toast');
    for (let i = 0; i < all.length - 3; i++) all[i].remove();
  }
  // The guide: an arrow turned `angle` radians from straight ahead (clockwise) and the metres to go; null hides it.
  way(angle, metres = 0) {
    this.wayEl.hidden = angle === null;
    if (angle === null) return;
    this.wayEl.firstChild.style.transform = `rotate(${angle.toFixed(2)}rad)`;
    const m = Math.round(metres) + ' m';
    if (this.wayEl.lastChild.textContent !== m) this.wayEl.lastChild.textContent = m;
  }

  async card(title, sub, seconds = 3) {
    this.cardEl.innerHTML = `<div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
    this.cardEl.classList.add('show');
    await new Promise((r) => setTimeout(r, seconds * 1000));
    this.cardEl.classList.remove('show');
    await new Promise((r) => setTimeout(r, 900));
  }

  fade(on) {
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, 480));
  }

  // text rising from a world position
  floaty(pos, text) {
    const p = this.project(pos);
    if (!p) return;
    const f = el('div', 'floaty', text);
    f.style.left = p.x + 'px';
    f.style.top = p.y + 'px';
    this.worldLayer.append(f);
    setTimeout(() => f.remove(), 1500);
  }

  // speech bubble following an Object3D (offset above it)
  bubble(obj, text, seconds = 2.5, height = 1.5) {
    const b = { obj, height, el: el('div', 'bubble', text), life: seconds };
    this.worldLayer.append(b.el);
    this.bubbles.add(b);
    return b;
  }

  project(pos) {
    _v.copy(pos).project(G.camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }

  // ---------------------------------------------------------------- dialogue
  // Skip to the end of the conversation: every line until the next question (or until the scene has been
  // quiet for a moment) goes by at once. Lines are still "said", so faces, flags and the story keep in step.
  skip() {
    this.skipping = true;
    this.skipT = 1.2;
    this.advance = true;
    G.audio.play('blip');
  }
  // memory: a sepia line from fifty years ago (Chapter 3's Charm Sprite memories); who may be a plain name.
  // more: how many lines follow in this conversation (story/helpers.js talk()): two or more shows Skip.
  say(who, text, { choices = null, auto = 0, face = null, memory = false, more = 0 } = {}) {
    const [name, color] = SPEAKERS[who] || [who || '', '#2f6f73'];
    this.dialogueOpen = true;
    G.frozen = true;
    if (choices) this.skipping = false;
    if (this.skipping) {
      G.events.emit('say', { who, text, face });
      G.events.emit('typed', { who });
      G.events.emit('said', { who });
      return Promise.resolve(0);
    }
    this.dlgSkip.style.display = more >= 2 && !choices ? '' : 'none';
    let held = 0;
    this.dlg.classList.add('show');
    this.dlg.classList.toggle('memory', !!memory);
    this.dlgWho.textContent = name;
    this.dlgWho.style.display = name ? '' : 'none';
    this.dlgWho.style.background = color;
    this.dlgChoices.innerHTML = '';
    this.dlgMore.style.display = 'none';
    G.events.emit('say', { who, text, face });
    const full = text;
    let shown = 0;
    this.advance = false;
    return new Promise((resolve) => {
      // Settings > Text speed: 1 normal (48 letters a second), 2 fast, 0 all at once
      const ts = G.save.settings.textSpeed ?? 1;
      const speed = ts ? 48 * ts : 1e6;
      let t = 0;
      const done = (v) => {
        G.updaters.delete(tick);
        G.events.emit('said', { who });
        resolve(v);
      };
      const showChoices = () => {
        if (!choices) return;
        choices.forEach((c, i) => {
          const b = el('button', '', c);
          b.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            G.audio.play('blip');
            done(i);
          });
          this.dlgChoices.append(b);
        });
        this.choiceIndex = 0;
        this.dlgChoices.firstChild?.focus();
      };
      let firstTick = true;
      const tick = (dt) => {
        const input = G.input;
        if (firstTick) {
          // the press that opened this line must not also skip it
          firstTick = false;
          input.consume('confirm');
          input.consume('interact');
          this.advance = false;
          return;
        }
        const confirm = input.consume('confirm') || input.consume('interact') || this.advance;
        this.advance = false;
        // holding the advance key for 0.8 s skips the rest (the button fills up as a cue)
        if (more >= 2 && !choices) {
          held = input.confirmHeld ? held + dt : 0;
          this.dlgSkip.firstChild.style.width = Math.min(100, (held / 0.8) * 100) + '%';
          if (held >= 0.8) this.skip();
        }
        if (this.skipping) return done(0);
        if (shown < full.length) {
          t += dt * speed;
          const n = confirm ? full.length : Math.min(full.length, Math.floor(t));
          if (n !== shown) {
            shown = n;
            this.dlgText.textContent = full.slice(0, shown);
            if (shown === full.length) {
              G.events.emit('typed', { who });
              this.dlgMore.style.display = choices ? 'none' : '';
              showChoices();
            }
          }
          return;
        }
        if (choices) {
          if (input.consume('up_edge') || input.consume('up') || input.consume('left')) this.moveChoice(-1);
          if (input.consume('down_edge') || input.consume('down') || input.consume('right')) this.moveChoice(1);
          const k = [...this.dlgChoices.children].indexOf(document.activeElement);
          if (confirm && k >= 0) {
            G.audio.play('blip');
            done(k);
          }
          return;
        }
        if (auto) {
          auto -= dt;
          if (auto <= 0) done(0);
        }
        if (confirm) {
          G.audio.play('blip');
          done(0);
        }
      };
      this.dlgText.textContent = '';
      G.updaters.add(tick);
    });
  }
  moveChoice(d) {
    const kids = [...this.dlgChoices.children];
    const i = Math.max(0, kids.indexOf(document.activeElement));
    kids[(i + d + kids.length) % kids.length]?.focus();
  }
  closeDialogue() {
    this.dlg.classList.remove('show');
    this.dialogueOpen = false;
    G.frozen = false;
    this.skipT = 1.2;
  }

  update(dt) {
    // a skip carries over a short pause between two parts of a scene, then ends
    if (this.skipping && !this.dialogueOpen && (this.skipT -= dt) <= 0) this.skipping = false;
    for (const b of [...this.bubbles]) {
      b.life -= dt;
      _v.copy(b.obj.position);
      b.obj.getWorldPosition?.(_v);
      _v.y += b.height;
      const p = this.project(_v);
      if (!p || b.life <= 0) {
        if (b.life <= 0) {
          b.el.remove();
          this.bubbles.delete(b);
        } else b.el.style.opacity = 0;
        continue;
      }
      b.el.style.opacity = Math.min(1, b.life * 2);
      b.el.style.left = p.x + 'px';
      b.el.style.top = p.y + 'px';
    }
  }
}

// Text size (Settings): scales the reading text (dialogue, choices, prompts, toasts, menus); see ui.css --ts.
export function applyTextSize(k = 1) {
  document.documentElement.style.setProperty('--ts', String(k || 1));
}
