// Pause screen (with the fork-me link), settings, controls help and the Sprite Book.
import {
  AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderTarget,
} from 'three';
import { G } from '../game.js';
import { SPECIES, BOOK_ORDER } from '../content/species.js';
import { makeCreature } from '../actors/creatures.js';
import { writeSave, clearSave } from '../core/save.js';

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
        <button class="btn alt" data-a="restart">Start over</button>
      </div>
      <p class="small">Snuggle Sorcery is open source (MIT). <a href="${REPO}" target="_blank" rel="noopener">Fork it on GitHub</a> and make your own cozy game!</p></div>`);
    this.settings = this.menu('settings', `<div class="panel"><h2>Settings</h2><div class="settings">
        <label for="s-q">Graphics</label><select id="s-q"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
        <label for="s-v">Volume</label><input id="s-v" type="range" min="0" max="1" step="0.05">
        <label for="s-m">Music</label><input id="s-m" type="range" min="0" max="1" step="0.05">
        <label for="s-s">Camera speed</label><input id="s-s" type="range" min="0.3" max="2.5" step="0.1">
        <label for="s-i">Invert camera Y</label><input id="s-i" type="checkbox">
        <label for="s-r">Reduce motion</label><input id="s-r" type="checkbox">
        <label for="s-h">Hum: tap to toggle</label><input id="s-h" type="checkbox">
      </div><div class="col" style="margin-top:16px"><button class="btn" data-a="back">Back</button></div></div>`);
    this.controls = this.menu('controls', `<div class="panel"><h2>Controls</h2><table class="controls"><tbody>
        <tr><td>Move</td><td>WASD / arrows · left stick · touch stick</td></tr>
        <tr><td>Camera</td><td>Mouse (click to capture) · right stick · drag right side</td></tr>
        <tr><td>Hum (soothe)</td><td>Hold E or left mouse · RT · big Hum button</td></tr>
        <tr><td>On-beat bonus</td><td>Re-press Hum when the ring pulses</td></tr>
        <tr><td>Notice / talk</td><td>F or Enter · X · context button</td></tr>
        <tr><td>Jump</td><td>Space · A · Jump button</td></tr>
        <tr><td>Sprint</td><td>Shift · LB · push the stick all the way</td></tr>
        <tr><td>Friend assist</td><td>Q · Y · Assist button</td></tr>
        <tr><td>Sprite Book</td><td>Tab or B · Back/Select · 📖</td></tr>
        <tr><td>Pause</td><td>Esc or P · Start · Ⅱ</td></tr>
      </tbody></table><div class="col" style="margin-top:14px"><button class="btn" data-a="back">Back</button></div></div>`);
    this.book = this.menu('book', `<div class="panel"><h2>Sprite Book</h2><p class="small" style="margin:-8px 0 12px">Every soothed Grumbling becomes a Charm Sprite. Equip one as your helper.</p>
      <div class="grid"></div><div class="col" style="margin-top:14px"><button class="btn" data-a="close">Close</button></div></div>`);
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
        this.show(this.controls);
        break;
      case 'back':
        this.back();
        break;
      case 'restart':
        if (confirm('Start the story over from the train? Your Sprite Book will be cleared.')) {
          clearSave();
          location.reload();
        }
        break;
    }
  }

  // Keyboard / gamepad navigation inside menus (Tab/arrows handled natively; Esc / B go back).
  update() {
    const input = G.input;
    if (!this.open) return;
    if (input.consume('back') || input.consume('pause')) this.stack.length > 1 ? this.back() : this.resume();
    if (input.consume('book') && this.stack.at(-1) === this.book) this.back();
    const focusables = [...this.stack.at(-1).querySelectorAll('button, select, input, a')];
    const i = focusables.indexOf(document.activeElement);
    if (input.consume('down_edge')) focusables[(i + 1) % focusables.length]?.focus();
    if (input.consume('up_edge')) focusables[(i - 1 + focusables.length) % focusables.length]?.focus();
    if (input.consume('jump') && document.activeElement?.tagName === 'BUTTON' && input.device === 'gamepad') document.activeElement.click();
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
      const h = { grey: 0.55, cloud: 0.5, homework: 0.5 }[id] || 0.35;
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
