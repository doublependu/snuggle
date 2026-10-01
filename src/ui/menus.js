// SPDX-License-Identifier: GPL-3.0-only
// Pause screen (with the fork-me link), settings, controls help and the Sprite Book. Loaded after Begin
// (src/main.js): nothing before it needs a menu, and the first load stays small. Like ui/remap.js, it imports
// nothing: what it needs from the main bundle is handed over in `deps` (a lazy chunk that imports shared
// modules makes the bundler split the main bundle into several files).
let G, SPECIES, BOOK_ORDER, MEMORY_BOOK, thumb, applyTextSize, writeSave, resetSave, reloadFromSave, KEYS, PAD, keyLabel, PAD_NAMES;

const REPO = 'https://github.com/doublependu/snuggle';

export class Menus {
  constructor(root, deps) {
    ({ G, SPECIES, BOOK_ORDER, MEMORY_BOOK, thumb, applyTextSize, writeSave, resetSave, reloadFromSave, KEYS, PAD, keyLabel, PAD_NAMES } = deps);
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
      <div class="todo"></div>
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
        <label for="s-ts">Text speed</label><select id="s-ts"><option value="1">Normal</option><option value="2">Fast</option><option value="0">All at once</option></select>
        <label for="s-g">Direction hints</label><select id="s-g"><option value="auto">After a while</option><option value="always">Always</option><option value="off">Off</option></select>
      </div><div class="col" style="margin-top:16px"><button class="btn" data-a="back">Back</button></div></div>`);
    this.controls = this.menu('controls', `<div class="panel"><h2>Controls</h2><table class="controls"><tbody></tbody></table>
      <div class="col" style="margin-top:14px"><button class="btn alt" data-a="remap">Change controls</button><button class="btn" data-a="back">Back</button></div></div>`);
    this.book = this.menu('book', `<div class="panel"><h2>Sprite Book</h2><p class="small" style="margin:-8px 0 12px">Every soothed Grumbling becomes a Charm Sprite. Equip one as your helper.</p>
      <div class="grid"></div><div class="mems"></div><div class="col" style="margin-top:14px"><button class="btn" data-a="close">Close</button></div></div>`);
    this.book.classList.add('book');
    this.stack = [];
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
    if (this.open) return this.resume();
    // "Things to do here": the zone's optional things and how far along they are (zone.todo, each zone's module)
    const todo = G.zone?.todo?.() || [];
    this.pause.querySelector('.todo').innerHTML = todo.length
      ? '<h3>Things to do here</h3>' + todo.map(([label, n, of]) => `<span class="${n >= of ? 'done' : ''}">${label} <b>${of > 1 ? n + '/' + of : n ? '✔' : '–'}</b></span>`).join('')
      : '';
    this.show(this.pause);
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
      ['Walk', `${k('move')} / arrows · left stick · touch stick`],
      ['Camera', 'Mouse (click to capture) · right stick · drag right side'],
      ['Hum (soothe)', `Hold ${k('hum')} or left mouse · ${p('hum')} · big Hum button`],
      ['On-beat bonus', 'Re-press Hum when the ring pulses'],
      ['Notice / talk', `${k('interact')} or Enter · ${p('interact')} · context button`],
      ['Jump', `${k('jump')} · ${p('jump')} · Jump button`],
      ['Run', `Hold ${k('sprint')} while walking · ${p('sprint')} · push the stick all the way`],
      ['Skip a conversation', `Hold ${k('interact')} · hold ${p('interact')} · tap Skip`],
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
    $('#s-ts').addEventListener('change', (e) => (s().textSpeed = +e.target.value));
    $('#s-g').addEventListener('change', (e) => (s().hints = e.target.value));
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
    $('#s-ts').value = String(s.textSpeed ?? 1);
    $('#s-g').value = s.hints || 'auto';
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
      const img = thumb(id);
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
    'version: ' + (document.getElementById('ver')?.textContent || '?'),
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
