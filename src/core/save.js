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
    settings: { volume: 0.8, music: 0.6, sensitivity: 1, invertY: false, reducedMotion: false, humToggle: false, quality: 'auto' },
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

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
