// SPDX-License-Identifier: GPL-3.0-only
// Versioned progress in localStorage. Everything else is rebuilt from this on load.
// Old saves are migrated forward, never thrown away.
const KEY = 'snuggle-sorcery-save';
const VERSION = 2;

// One-off story Grumblings: each can only ever be soothed once (keys are '<zone>:<grumbling id>').
const STORY_SPECIES = { doudou: 'train:doudou', cloud: 'train:cloud', sock: 'academy:sock', homework: 'academy:homework', pompom: 'academy:pompom' };

export function defaultSave() {
  return {
    v: VERSION,
    zone: 'train',
    spawn: null,
    story: {}, // flags: { prologueDone: true, ... }
    sprites: {}, // species id -> count
    soothed: {}, // '<zone>:<grumbling id>' -> true, so a reload never respawns (or double-counts) a Grumbling
    seen: {}, // species id -> true (book silhouettes)
    helper: null, // equipped Charm Sprite species
    cozy: 0,
    tarts: 0,
    chestnuts: 0,
    candies: {}, // collectible id -> true
    // keys / pad: only the actions the player rebound (core/input.js); textSize scales the reading text;
    // textSpeed: 1 normal, 2 fast, 0 all at once; hints: the guide (systems/wayfinder.js) 'auto' | 'always' | 'off'
    settings: { volume: 0.8, music: 0.6, sensitivity: 1, invertY: false, reducedMotion: false, humToggle: false, quality: 'auto', textSize: 1, textSpeed: 1, hints: 'auto', keys: {}, pad: {} },
  };
}

// v1 -> v2: record which story Grumblings were already soothed, and undo double counts from the
// v1 bug where reloading the train respawned the cloud.
function migrate(data) {
  if (data.v === 1) {
    data.soothed = {};
    const f = data.story || {};
    for (const [id, key] of Object.entries(STORY_SPECIES)) {
      const done = (data.sprites?.[id] || 0) > 0 || f[id + 'Done'];
      if (done) data.soothed[key] = true;
      if (data.sprites?.[id] > 1) data.sprites[id] = 1;
    }
    data.v = 2;
  }
  return data;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = migrate(JSON.parse(raw));
    if (data.v !== VERSION) return defaultSave();
    const d = defaultSave();
    return { ...d, ...data, settings: { ...d.settings, ...data.settings } };
  } catch {
    return defaultSave();
  }
}

// Set by resetSave(): nothing may write until the page is gone. The unload autosave (main.js) would
// otherwise put the old progress straight back while "Start again" reloads.
let locked = false;

export function writeSave(data) {
  if (locked) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Reload and play on from the save. ?zone= and ?spawn= would override it, so they are dropped
// (other parameters such as ?debug or ?quality stay).
export function reloadFromSave() {
  const u = new URL(location.href);
  u.searchParams.delete('zone');
  u.searchParams.delete('spawn');
  location.replace(u.href);
}

// A fresh story that keeps the player's settings. Saving stays locked until the page reloads.
export function resetSave(settings) {
  const fresh = defaultSave();
  if (settings) fresh.settings = { ...fresh.settings, ...settings };
  writeSave(fresh);
  locked = true;
  return fresh;
}
