// SPDX-License-Identifier: GPL-3.0-only
// Controls > Change controls: rebind the keyboard keys and gamepad buttons (loaded only when opened).
// Press Change, then the new key or button; Esc cancels. If another action had that key, the two swap.
// Saved in the settings (only the actions that differ from the defaults, core/input.js KEYS / PAD).
// It imports nothing: what it needs is passed in, so the lazy chunk never pulls the main bundle apart.

const ACTIONS = [
  ['up', 'Move forward'], ['down', 'Move back'], ['left', 'Move left'], ['right', 'Move right'],
  ['hum', 'Hum (soothe)'], ['interact', 'Notice / talk'], ['jump', 'Jump'], ['sprint', 'Sprint'],
  ['assist', 'Friend assist'], ['book', 'Sprite Book'], ['pause', 'Pause'],
];
const FIXED_KEYS = ['Escape', 'Enter'];

export function openRemap(menus, { G, KEYS, PAD, keyLabel, PAD_NAMES, writeSave }) {
  let m = menus.remap;
  if (!m) {
    m = menus.remap = menus.menu('remap', `<div class="panel"><h2>Change controls</h2>
      <p class="small" style="margin:-8px 0 10px">Choose Change, then press the new key or button (Esc cancels). Esc always pauses and Enter always confirms.</p>
      <table class="controls remap"><thead><tr><td></td><td>Keyboard</td><td>Gamepad</td></tr></thead><tbody></tbody></table>
      <div class="col" style="margin-top:12px"><button class="btn alt" data-r="reset">Reset to defaults</button><button class="btn" data-a="back">Back</button></div></div>`);
    m.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      if (r === 'reset') return save({}, {});
      const [kind, action] = r.split(':');
      listen(e.target.closest('button'), kind, action);
    });
    const back = menus.back.bind(menus);
    menus.back = () => {
      stop();
      back();
    };
  }
  const fill = () => {
    m.querySelector('tbody').innerHTML = ACTIONS.map(([a, name]) =>
      `<tr><td>${name}</td><td><button class="btn alt key-btn" data-r="key:${a}">${keyLabel(G.input.keyBind[a][0])}</button></td>` +
      `<td>${a in PAD ? `<button class="btn alt key-btn" data-r="pad:${a}">${PAD_NAMES[G.input.padBind[a]] ?? '—'}</button>` : ''}</td></tr>`).join('');
  };
  function stop() {
    G.input.capture = null;
    G.input.padCapture = null;
  }
  function save(keys, pad) {
    const s = G.save.settings;
    s.keys = keys;
    s.pad = pad;
    G.input.setBindings(keys, pad);
    writeSave(G.save);
    stop();
    fill();
    menus.fillControls();
  }
  // only what differs from the defaults is kept
  const changedKeys = (all) => Object.fromEntries(Object.entries(all).filter(([a, c]) => c.join() !== KEYS[a].join()));
  const changedPad = (all) => Object.fromEntries(Object.entries(all).filter(([a, b]) => b !== PAD[a]));
  function listen(btn, kind, action) {
    stop();
    btn.textContent = kind === 'key' ? 'Press a key…' : 'Press a button…';
    btn.classList.add('listening');
    if (kind === 'key') {
      G.input.capture = (e) => {
        e.preventDefault();
        if (e.code === 'Escape' || FIXED_KEYS.includes(e.code)) return save(G.save.settings.keys || {}, G.save.settings.pad || {});
        const keys = Object.fromEntries(Object.entries(G.input.keyBind).map(([a, c]) => [a, [...c]]));
        const old = keys[action][0];
        // whoever had this key gives it up; if it was their main key, they get ours in exchange
        for (const [b, codes] of Object.entries(keys)) {
          if (b === action || !codes.includes(e.code)) continue;
          keys[b] = codes[0] === e.code ? [old, ...codes.slice(1).filter((c) => c !== old)] : codes.filter((c) => c !== e.code);
        }
        keys[action] = [e.code, ...keys[action].slice(1).filter((c) => c !== e.code)];
        save(changedKeys(keys), G.save.settings.pad || {});
      };
    } else {
      G.input.padCapture = (i) => {
        const pad = { ...G.input.padBind };
        const other = Object.keys(pad).find((b) => b !== action && pad[b] === i);
        if (other) pad[other] = pad[action]; // a swap
        pad[action] = i;
        save(G.save.settings.keys || {}, changedPad(pad));
      };
    }
  }
  fill();
  menus.show(m);
}
