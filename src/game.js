// Global game context. Systems register themselves here so story scripts can reach everything.
import { Events } from './core/events.js';

export const G = {
  time: 0,
  paused: true, // true until Begin, and while menus are open
  frozen: false, // player input locked (dialogue / cutscene)
  events: new Events(),
  interactables: new Set(),
  updaters: new Set(), // per-frame callbacks owned by the current zone
  grumblings: new Set(),
  npcs: new Map(),
  save: null,
  renderer: null,
  scene: null,
  camera: null,
  cam: null,
  input: null,
  audio: null,
  quality: null,
  collision: null,
  player: null,
  zone: null,
  ui: null,
  fx: null,
};

export function flag(name, value) {
  if (value === undefined) return !!G.save.story[name];
  G.save.story[name] = value;
  G.events.emit('flag', { name, value });
  return value;
}

export const wait = (s) =>
  new Promise((res) => {
    let t = 0;
    const fn = (dt) => {
      t += dt;
      if (t >= s) {
        G.updaters.delete(fn);
        res();
      }
    };
    G.updaters.add(fn);
  });

// Resolve when predicate() becomes true (checked each frame).
export const until = (pred) =>
  new Promise((res) => {
    const fn = () => {
      if (pred()) {
        G.updaters.delete(fn);
        res();
      }
    };
    G.updaters.add(fn);
  });
