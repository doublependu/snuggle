// Versioned progress in localStorage. Everything else is rebuilt from this on load.
const KEY = 'snuggle-sorcery-save';
const VERSION = 1;

export function defaultSave() {
  return {
    v: VERSION,
    zone: 'train',
    spawn: null,
    story: {}, // flags: { prologueDone: true, ... }
    sprites: {}, // species id -> count
    seen: {}, // species id -> true (book silhouettes)
    helper: null, // equipped Charm Sprite species
    cozy: 0,
    tarts: 0,
    candies: {}, // collectible id -> true
    settings: { volume: 0.8, music: 0.6, sensitivity: 1, invertY: false, reducedMotion: false, humToggle: false, quality: 'auto' },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
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
