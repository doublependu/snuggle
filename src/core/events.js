// SPDX-License-Identifier: GPL-3.0-only
// Tiny event bus used by story scripts, systems and UI.
export class Events {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    this.map.get(type)?.delete(fn);
  }
  emit(type, data) {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) fn(data);
  }
  // Promise that resolves on the next event matching the (optional) predicate.
  once(type, pred = () => true) {
    return new Promise((resolve) => {
      const off = this.on(type, (d) => {
        if (pred(d)) {
          off();
          resolve(d);
        }
      });
    });
  }
}
