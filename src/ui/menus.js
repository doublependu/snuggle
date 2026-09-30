// SPDX-License-Identifier: GPL-3.0-only
// Pause screen (with the fork-me link), settings, controls help and the Sprite Book.
import {
  AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderTarget,
} from 'three';
import { G } from '../game.js';
import { SPECIES, BOOK_ORDER } from '../content/species.js';
import { makeCreature } from '../actors/creatures.js';
import { writeSave, resetSave, reloadFromSave } from '../core/save.js';
import { KEYS, PAD, keyLabel, PAD_NAMES } from '../core/input.js';
import { MEMORY_BOOK } from '../content/memories.js';

const REPO = 'https://github.com/doublependu/snuggle';

export class Menus {
  constructor(root) {
    this.root = root;
    this.pause = this.menu('pause', `<div class="fork"><a href="${REPO}" target="_blank" rel="noopener">Fork me on GitHub</a></div>
      <div class="panel"><h2>Paused</h2><div class="col">
        <button class="btn" data-a="resume">Resume</button>
        <button class="btn alt" data-a="book">Sprite Book</button>
        <button class="btn alt" data-a="settings">Settings</button>
        <button class="btn alt" data-a="controls">Controls</button>
        <button class="btn alt" data-a="checkpoint">Stuck? Back to last checkpoint</button>
        <button class="btn alt" data-a="report">Copy bug report</button>
        <button class="btn alt" data-a="restart">Start again from the train</button>
      </div>
      <p class="small">Snuggle Sorcery is free software under the <a href="${REPO}/blob/main/LICENSE" target="_blank" rel="noopener">GNU GPL v3</a>. <a href="${REPO}" target="_blank" rel="noopener">Fork it on GitHub</a> and make your own cozy game!</p></div>`);
    this.confirmRestart = this.menu('restart', `<div class="panel"><h2>Start again?</h2>
      <p>Start the story again from the train? Your Sprite Book, Cozy Energy and story progress will be cleared. Your settings stay.</p>
      <div class="col"><button class="btn alt" data-a="back">Cancel</button><button class="btn" data-a="restart-yes">Start again</button></div></div>`);
    this.report = this.menu('report', `<div class="panel"><h2>Bug report</h2><p class="small" style="margin:-6px 0 0">Paste this into your bug report or chat. It has your device, the game state and any errors.</p>
      <textarea class="report" readonly></textarea><p class="small copied" style="min-height:1.2em"></p>
      <div class="col"><button class="btn" data-a="copy">Copy again</button><button class="btn alt" data-a="back">Back</button></div></div>`);
    this.settings = this.menu('settings', `<div class="panel"><h2>Settings</h2><div class="settings">
        <label for="s-q">Graphics</label><select id="s-q"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
        <label for="s-v">Volume</label><input id="s-v" type="range" min="0" max="1" step="0.05">
        <label for="s-m">Music</label><input id="s-m" type="range" min="0" max="1" step="0.05">
        <label for="s-s">Camera speed</label><input id="s-s" type="range" min="0.3" max="2.5" step="0.1">
        <label for="s-i">Invert camera Y</label><input id="s-i" type="checkbox">
        <label for="s-r">Reduce motion</label><input id="s-r" type="checkbox">
        <label for="s-h">Hum: tap to toggle</label><input id="s-h" type="checkbox">
        <label for="s-t">Text size</label><select id="s-t"><option value="1">Normal</option><option value="1.15">Large</option><option value="1.3">Larger</option><option value="1.5">Largest</option></select>
      </div><div class="col" style="margin-top:16px"><button class="btn" data-a="back">Back</button></div></div>`);
    this.controls = this.menu('controls', `<div class="panel"><h2>Controls</h2><table class="controls"><tbody></tbody></table>
      <div class="col" style="margin-top:14px"><button class="btn alt" data-a="remap">Change controls</button><button class="btn" data-a="back">Back</button></div></div>`);
    this.book = this.menu('book', `<div class="panel"><h2>Sprite Book</h2><p class="small" style="margin:-8px 0 12px">Every soothed Grumbling becomes a Charm Sprite. Equip one as your helper.</p>
      <div class="grid"></div><div class="mems"></div><div class="col" style="margin-top:14px"><button class="btn" data-a="close">Close</button></div></div>`);
    this.book.classList.add('book');
    this.stack = [];
    this.thumbs = {};
    this.bindSettings();
  }

  menu(id, html) {
    const m = document.createElement('div');
    m.className = 'menu';
    m.id = 'menu-' + id;
    m.innerHTML = html;
    m.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      G.audio.play('blip');
      this.action(a);
    });
    this.root.append(m);
    return m;
  }

  get open() {
    return this.stack.length > 0;
  }

  show(m) {
    if (!this.open) {
      G.paused = true;
      G.input.enabled = false;
      G.input.releaseLock();
      G.touch?.reset();
      G.audio.setHumming(false);
      G.audio.play('open');
    }
    this.stack.at(-1)?.classList.remove('show');
    this.stack.push(m);
    m.classList.add('show');
    m.querySelector('button, select, input')?.focus();
  }
  back() {
    const m = this.stack.pop();
    m?.classList.remove('show');
    const prev = this.stack.at(-1);
    if (prev) {
      prev.classList.add('show');
      prev.querySelector('button')?.focus();
    } else this.resume();
  }
  resume() {
    for (const m of this.stack) m.classList.remove('show');
    this.stack = [];
    G.paused = false;
    G.input.enabled = true;
    G.audio.play('close');
    writeSave(G.save);
  }

  togglePause() {
    if (this.open) this.resume();
    else this.show(this.pause);
  }
  toggleBook() {
    if (this.stack.at(-1) === this.book) this.back();
    else if (!this.open) this.openBook();
  }

  action(a) {
    switch (a) {
      case 'resume':
      case 'close':
        if (a === 'close' && this.stack.length > 1) this.back();
        else this.resume();
        break;
      case 'book':
        this.openBook();
        break;
      case 'settings':
        this.syncSettings();
        this.show(this.settings);
        break;
      case 'controls':
        this.fillControls();
        this.show(this.controls);
        break;
      case 'remap':
        // the rebinding panel is only loaded when someone wants it
        import('./remap.js').then((m) => m.openRemap(this, { G, KEYS, PAD, keyLabel, PAD_NAMES, writeSave })).catch((e) => console.error(e));
        break;
      case 'back':
        this.back();
        break;
      case 'checkpoint':
        // the save always holds the last checkpoint (zone, spawn and story flags); reloading replays from there
        writeSave(G.save);
        reloadFromSave();
        break;
      case 'report':
        this.show(this.report);
        this.copyReport();
        break;
      case 'copy':
        this.copyReport();
        break;
      case 'restart':
        this.show(this.confirmRestart);
        break;
      case 'restart-yes':
        // a fresh save (settings kept) and a lock, so the unload autosave can't write the old progress back
        G.save = resetSave(G.save.settings);
        reloadFromSave();
        break;
    }
  }

  // Keyboard / gamepad navigation inside menus (Tab/arrows handled natively; Esc / B go back).
  update() {
    const input = G.input;
    if (!this.open) return;
    if (input.consume('back') || input.consume('pause')) this.stack.length > 1 ? this.back() : this.resume();
    if (input.consume('book') && this.stack.at(-1) === this.book) this.back();
    if (!this.open) return; // that closed the last menu
    const focusables = [...this.stack.at(-1).querySelectorAll('button, select, input, a')];
    const i = focusables.indexOf(document.activeElement);
    if (input.consume('down_edge')) focusables[(i + 1) % focusables.length]?.focus();
    if (input.consume('up_edge')) focusables[(i - 1 + focusables.length) % focusables.length]?.focus();
    if (input.consume('jump') && document.activeElement?.tagName === 'BUTTON' && input.device === 'gamepad') document.activeElement.click();
  }

  // ---------------------------------------------------------------- bug report (device, state, errors, save)
  copyReport() {
    const text = bugReport();
    const ta = this.report.querySelector('textarea');
    const msg = this.report.querySelector('.copied');
    ta.value = text;
    const done = () => (msg.textContent = '✔ Copied to the clipboard.');
    const manual = () => {
      ta.focus();
      ta.select();
      msg.textContent = 'Select the text above and copy it.';
    };
    try {
      navigator.clipboard?.writeText(text).then(done, manual) ?? manual();
    } catch {
      manual();
    }
  }

  // The controls table, with the keys and buttons as they are bound now.
  fillControls() {
    const i = G.input;
    const k = (a) => i.label(a, 'keyboard'),
      p = (a) => i.label(a, 'gamepad');
    const rows = [
      ['Move', `${k('move')} / arrows · left stick · touch stick`],
      ['Camera', 'Mouse (click to capture) · right stick · drag right side'],
      ['Hum (soothe)', `Hold ${k('hum')} or left mouse · ${p('hum')} · big Hum button`],
      ['On-beat bonus', 'Re-press Hum when the ring pulses'],
      ['Notice / talk', `${k('interact')} or Enter · ${p('interact')} · context button`],
      ['Jump', `${k('jump')} · ${p('jump')} · Jump button`],
      ['Sprint', `${k('sprint')} · ${p('sprint')} · push the stick all the way`],
      ['Friend assist', `${k('assist')} · ${p('assist')} · Assist button`],
      ['Sprite Book', `${k('book')} · ${p('book')} · 📖`],
      ['Pause', `Esc or ${k('pause')} · ${p('pause')} · Ⅱ`],
    ];
    this.controls.querySelector('tbody').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------- settings
  bindSettings() {
    const $ = (id) => this.settings.querySelector(id);
    const s = () => G.save.settings;
    $('#s-q').addEventListener('change', (e) => {
      s().quality = e.target.value;
      G.quality.auto = e.target.value === 'auto';
      if (e.target.value !== 'auto') G.quality.set(e.target.value);
    });
    $('#s-v').addEventListener('input', (e) => {
      s().volume = +e.target.value;
      G.audio.setVolume(s().volume);
    });
    $('#s-m').addEventListener('input', (e) => {
      s().music = +e.target.value;
      G.audio.setMusic(s().music);
    });
    $('#s-s').addEventListener('input', (e) => {
      s().sensitivity = +e.target.value;
      G.input.sensitivity = s().sensitivity;
    });
    $('#s-i').addEventListener('change', (e) => {
      s().invertY = e.target.checked;
      G.input.invertY = e.target.checked;
    });
    $('#s-r').addEventListener('change', (e) => {
      s().reducedMotion = e.target.checked;
    });
    $('#s-h').addEventListener('change', (e) => {
      s().humToggle = e.target.checked;
      G.input.humToggle = e.target.checked;
      G.input.humLatched = false;
    });
    $('#s-t').addEventListener('change', (e) => {
      s().textSize = +e.target.value;
      applyTextSize(s().textSize);
    });
  }
  syncSettings() {
    const s = G.save.settings;
    const $ = (id) => this.settings.querySelector(id);
    $('#s-q').value = s.quality;
    $('#s-v').value = s.volume;
    $('#s-m').value = s.music;
    $('#s-s').value = s.sensitivity;
    $('#s-i').checked = s.invertY;
    $('#s-r').checked = s.reducedMotion;
    $('#s-h').checked = s.humToggle;
    $('#s-t').value = String(s.textSize || 1);
  }

  // ---------------------------------------------------------------- sprite book
  openBook() {
    const grid = this.book.querySelector('.grid');
    grid.innerHTML = '';
    const save = G.save;
    for (const id of BOOK_ORDER) {
      const sp = SPECIES[id];
      const count = save.sprites[id] || 0;
      const known = count > 0 || save.seen[id];
      const e = document.createElement('div');
      e.className = 'entry' + (count ? '' : ' unknown');
      const img = this.thumb(id);
      e.innerHTML = `${count ? `<span class="count">×${count}</span>` : ''}<img alt="" src="${img}">
        <h3>${known ? sp.name : '???'}</h3><div class="feelq">${known ? '“' + sp.feeling + '”' : sp.chapter > 1 ? 'Chapter ' + sp.chapter : 'Not yet met'}</div>
        ${count && sp.ability ? `<div class="ability">${sp.abilityName}: ${sp.abilityDesc}</div>` : count ? `<div class="ability">${sp.about}</div>` : ''}`;
      if (count && sp.ability) {
        const b = document.createElement('button');
        const equipped = save.helper === id;
        b.textContent = equipped ? 'Helping' : 'Equip helper';
        b.disabled = equipped;
        b.addEventListener('click', () => {
          G.collection.equip(id);
          this.openBook();
        });
        e.append(b);
      }
      grid.append(e);
    }
    // Chapter 3: the Quiet District's memories, once the friends have been there
    const mems = this.book.querySelector('.mems');
    mems.innerHTML = save.story.ch3_arrive
      ? `<h3>Memories of the Quiet District</h3><div class="memrow">${MEMORY_BOOK.map(([id, icon, title]) => (save.story['mem_' + id] ? `<span class="mem">${icon}<small>${title}</small></span>` : '<span class="mem unknown">?<small>Not yet remembered</small></span>')).join('')}</div>`
      : '';
    if (this.stack.at(-1) !== this.book) this.show(this.book);
  }

  // Render a creature portrait once into a small render target and cache it as a data URL.
  thumb(id) {
    if (this.thumbs[id]) return this.thumbs[id];
    const size = 128;
    const renderer = G.renderer;
    try {
      const scene = new Scene();
      scene.add(new AmbientLight(0xffffff, 1.6));
      const d = new DirectionalLight(0xfff2e0, 2.4);
      d.position.set(1, 2, 3);
      scene.add(d);
      const c = makeCreature(id);
      c.position.set(0, 0, 0);
      c.rotation.y = -0.35;
      scene.add(c);
      const cam = new PerspectiveCamera(30, 1, 0.05, 20);
      const h = { grey: 0.55, cloud: 0.52, homework: 0.58, sock: 0.48, pompom: 0.5 }[id] || 0.35;
      cam.position.set(0.35, h * 0.9, h * 3.2);
      cam.lookAt(0, h * 0.5, 0);
      const rt = new WebGLRenderTarget(size, size);
      rt.texture.colorSpace = SRGBColorSpace;
      const prevRT = renderer.getRenderTarget();
      const prevClear = renderer.getClearColor(new Color());
      const prevAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
      const px = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
      renderer.setRenderTarget(prevRT);
      renderer.setClearColor(prevClear, prevAlpha);
      rt.dispose();
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      this.thumbs[id] = cv.toDataURL();
    } catch {
      this.thumbs[id] = '';
    }
    return this.thumbs[id];
  }
}

// Text size (Settings): scales the reading text (dialogue, choices, prompts, toasts, menus); see ui.css --ts.
export function applyTextSize(k = 1) {
  document.documentElement.style.setProperty('--ts', String(k || 1));
}

export function bugReport() {
  const r = G.renderer;
  let gpu = '';
  try {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch {
    /* no GPU string */
  }
  const p = G.player;
  const vv = window.visualViewport;
  const f = (n) => (n ?? 0).toFixed(2);
  return [
    'Snuggle Sorcery bug report',
    'time: ' + new Date().toISOString(),
    'url: ' + location.href,
    'ua: ' + navigator.userAgent,
    `screen: ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} zoom ${f(vv?.scale ?? 1)} input ${G.input?.device}`,
    'gpu: ' + gpu,
    `quality: ${G.quality?.name} x${f(G.quality?.scale)} ${(1000 / (G.quality?.ema || 16.7)).toFixed(0)} fps dpr ${f(r?.getPixelRatio())}`,
    `zone: ${G.zone?.id} at ${p ? [p.position.x, p.position.y, p.position.z].map(f).join(',') : '-'} state ${p?.state} frozen ${G.frozen} paused ${G.paused}`,
    'objective: ' + (G.ui?.objective.textContent || ''),
    'errors:',
    ...(G.errors.length ? G.errors.map((e) => '  ' + e) : ['  (none)']),
    'save: ' + JSON.stringify(G.save),
  ].join('\n');
}
