// Unified input: keyboard + mouse, gamepad and touch all feed the same actions.
//   move (x right, y forward), look (dx, dy per frame), held: hum/sprint/jump,
//   edges: jump, interact, assist, book, pause, hum, confirm, back
import { Vector2 } from 'three';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'hum', KeyF: 'interact', Enter: 'interact', KeyQ: 'assist',
  Tab: 'book', KeyB: 'book', Escape: 'pause', KeyP: 'pause',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = new Vector2();
    this.look = new Vector2();
    this.keys = new Set();
    this.edges = new Set();
    this.device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this.listeners = new Set();
    this.enabled = true; // false while menus own the input
    this.pointerLocked = false;
    this.mouseHum = false;
    this.touch = { move: new Vector2(), hum: false, sprint: false, jump: false };
    this.pad = { move: new Vector2(), look: new Vector2(), hum: false, sprint: false, prev: [] };
    this.humToggle = false;
    this.humLatched = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.dragging = null;
    this.bind();
  }

  onDevice(fn) {
    this.listeners.add(fn);
  }

  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    for (const fn of this.listeners) fn(d);
  }

  bind() {
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (a === 'book' || a === 'jump' || e.code.startsWith('Arrow')) e.preventDefault();
      this.setDevice('keyboard');
      if (!e.repeat) this.press(a);
      this.keys.add(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.keys.delete(a);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseHum = false;
      this.edges.add('blur');
    });
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      this.setDevice('keyboard');
      if (!this.pointerLocked && this.enabled && e.button === 0 && !this.noLock) {
        c.requestPointerLock?.()?.catch?.(() => {});
      }
      if (e.button === 0 && this.pointerLocked) {
        this.mouseHum = true;
        this.press('hum');
      }
      if (e.button === 2 || (!this.pointerLocked && e.button === 0)) this.dragging = { x: e.clientX, y: e.clientY };
      this.press('confirm');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseHum = false;
      this.dragging = null;
    });
    addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.look.x += e.movementX;
        this.look.y += e.movementY;
      } else if (this.dragging) {
        this.look.x += (e.clientX - this.dragging.x) * 1.5;
        this.look.y += (e.clientY - this.dragging.y) * 1.5;
        this.dragging.x = e.clientX;
        this.dragging.y = e.clientY;
      }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === c;
      if (was && !this.pointerLocked) this.edges.add('unlocked');
    });
    addEventListener('gamepadconnected', () => this.setDevice('gamepad'));
  }

  press(a) {
    if (a === 'hum' && this.humToggle) this.humLatched = !this.humLatched;
    this.edges.add(a);
    if (a === 'interact' || a === 'jump') this.edges.add('confirm');
  }

  // Touch UI hooks (src/ui/touch.js)
  touchButton(name, down) {
    this.setDevice('touch');
    if (name === 'hum') {
      if (down) this.press('hum');
      this.touch.hum = down;
    } else if (name === 'sprint') this.touch.sprint = down;
    else if (name === 'jump') {
      this.touch.jump = down;
      if (down) this.press('jump');
    } else if (down) this.press(name);
  }
  touchMove(x, y) {
    this.touch.move.set(x, y);
  }
  touchLook(dx, dy) {
    this.setDevice('touch');
    this.look.x += dx * 1.6;
    this.look.y += dy * 1.6;
  }

  pollGamepad() {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find((p) => p && p.connected);
    const pd = this.pad;
    pd.move.set(0, 0);
    pd.look.set(0, 0);
    pd.hum = pd.sprint = false;
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const ax = gp.axes;
    pd.move.set(dz(ax[0] || 0), -dz(ax[1] || 0));
    pd.look.set(dz(ax[2] || 0), dz(ax[3] || 0));
    const b = gp.buttons.map((x) => (typeof x === 'object' ? x.pressed || x.value > 0.3 : x > 0.3));
    const edge = (i, a) => {
      if (b[i] && !pd.prev[i]) {
        this.setDevice('gamepad');
        this.press(a);
      }
    };
    edge(0, 'jump');
    edge(2, 'interact');
    edge(3, 'assist');
    edge(1, 'back');
    edge(8, 'book');
    edge(9, 'pause');
    edge(7, 'hum');
    edge(5, 'hum');
    edge(12, 'up_edge');
    edge(13, 'down_edge');
    pd.hum = !!(b[7] || b[5]);
    pd.sprint = !!(b[4] || b[10]);
    if (pd.move.lengthSq() > 0 || pd.look.lengthSq() > 0) this.setDevice('gamepad');
    pd.prev = b;
  }

  update(dt) {
    this.pollGamepad();
    const k = this.keys;
    let x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    let y = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0);
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    if (this.pad.move.lengthSq() > 0) this.move.copy(this.pad.move);
    if (this.touch.move.lengthSq() > 0) this.move.copy(this.touch.move);
    if (this.pad.look.lengthSq() > 0) {
      this.look.x += this.pad.look.x * 900 * dt;
      this.look.y += this.pad.look.y * 600 * dt;
    }
    if (!this.enabled) this.move.set(0, 0);
  }

  get humHeld() {
    if (!this.enabled) return false;
    if (this.humToggle) return this.humLatched;
    return this.keys.has('hum') || this.mouseHum || this.touch.hum || this.pad.hum;
  }
  get sprintHeld() {
    return this.keys.has('sprint') || this.touch.sprint || this.pad.sprint;
  }
  pressed(a) {
    return this.edges.has(a);
  }
  consume(a) {
    const had = this.edges.has(a);
    this.edges.delete(a);
    return had;
  }
  lookDelta() {
    const s = 0.0024 * this.sensitivity;
    return { x: this.look.x * s, y: this.look.y * s * (this.invertY ? -1 : 1) };
  }
  endFrame() {
    this.edges.clear();
    this.look.set(0, 0);
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
}
