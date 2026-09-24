// Named characters and townsfolk: a Humanoid that idles, turns toward Xiao Pei when she is close,
// gestures while speaking, and offers a "Talk" interaction that runs a script.
import { Quaternion, Vector3 } from 'three';
import { G } from '../game.js';
import { Humanoid } from './humanoid.js';

const _v = new Vector3();
const _q = new Quaternion();
const X = new Vector3(1, 0, 0);

export class NPC {
  static async create(id, model, position, facing = 0, opts = {}) {
    const h = await Humanoid.load(model);
    const npc = new NPC(id, h, position, facing, opts);
    return npc;
  }

  constructor(id, h, position, facing, opts) {
    this.id = id;
    this.h = h;
    this.root = h.root;
    this.root.position.copy(position);
    this.root.rotation.y = facing;
    this.facing = facing;
    this.homeFacing = facing;
    this.opts = opts;
    this.base = opts.anim || 'idle';
    this.h.play(this.base, 0);
    this.h.mixer.update(Math.random() * 2);
    this.lookAtPlayer = opts.look !== false;
    this.talking = false;
    this.walkTarget = null;
    this.onTalk = opts.onTalk || null;
    this.interactable = {
      label: opts.label || 'Talk',
      radius: opts.radius || 2.2,
      position: this.root.position,
      enabled: () => !!this.onTalk && !this.hidden,
      action: () => this.onTalk?.(this),
    };
    G.interactables.add(this.interactable);
    G.npcs.set(id, this);
    this.offSay = G.events.on('say', ({ who }) => this.speak(who === id || (id === 'weibao' && who === 'honk'), who));
    this.offSaid = G.events.on('said', () => this.speak(false));
  }

  get position() {
    return this.root.position;
  }

  speak(on, who) {
    if (on === this.talking && who !== 'honk') return;
    this.talking = on;
    if (on && who === 'honk') {
      this.h.overlayPlay('puppet', 0.2);
      G.audio.play('honk');
    } else this.h.overlayPlay(on ? this.opts.talkAnim || 'talk' : this.opts.overlay || null, 0.25);
  }

  setAnim(name, fade = 0.3) {
    this.base = name;
    this.h.play(name, fade);
  }

  // Walk (script-driven) to a point; resolves on arrival.
  walkTo(p, speed = 1.6) {
    this.walkTarget = { p: p.clone(), speed };
    this.h.play(speed > 2.4 ? 'run' : 'walk', 0.2, speed > 2.4 ? speed / 2.2 : speed / 0.95);
    return new Promise((res) => (this.walkTarget.res = res));
  }

  // Sit on a seat of the given height (the root is raised so the hips rest on it).
  sitOn(seat) {
    this.base = 'sit';
    this.h.play('sit', 0);
    this.root.position.y += seat - (this.h.clipHipsY('sit') - 0.11);
    this.lookAtPlayer = false;
  }

  hide(h = true) {
    this.hidden = h;
    this.root.visible = !h;
  }

  update(dt) {
    const p = G.player;
    if (this.hidden) return;
    if (this.walkTarget) {
      const w = this.walkTarget;
      _v.subVectors(w.p, this.root.position).setY(0);
      const d = _v.length();
      if (d < 0.08) {
        this.walkTarget = null;
        this.h.play(this.base, 0.3);
        w.res?.();
      } else {
        _v.normalize();
        this.root.position.addScaledVector(_v, Math.min(d, w.speed * dt));
        if (G.collision) {
          const gy = G.collision.groundY(this.root.position.x, this.root.position.z, this.root.position.y + 1.2);
          if (gy !== null) this.root.position.y += (gy - this.root.position.y) * Math.min(1, dt * 10);
        }
        this.turnTo(Math.atan2(_v.x, _v.z), dt, 8);
      }
    } else if (p && this.lookAtPlayer && this.base !== 'sit') {
      const d = this.root.position.distanceTo(p.position);
      const want = d < 4.5 || this.talking ? Math.atan2(p.position.x - this.root.position.x, p.position.z - this.root.position.z) : this.homeFacing;
      this.turnTo(want, dt, 3);
    }
    const camD = G.camera.position.distanceTo(this.root.position);
    this.h.update(dt, camD);
    // Captain Honk's beak flaps while he talks
    const jaw = this.h.bones.puppet_jaw;
    if (jaw) {
      // hinge = the bone's local X; negative opens the lower beak downwards
      jaw.userData.rest = jaw.userData.rest || jaw.quaternion.clone();
      const open = this.talking ? Math.max(0, Math.sin(G.time * 22)) * 0.55 : 0;
      jaw.quaternion.copy(jaw.userData.rest).multiply(_q.setFromAxisAngle(X, -open));
    }
  }

  turnTo(want, dt, rate) {
    const d = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
    this.facing += d * Math.min(1, dt * rate);
    this.root.rotation.y = this.facing;
  }

  dispose() {
    G.interactables.delete(this.interactable);
    G.npcs.delete(this.id);
    this.offSay();
    this.offSaid();
    this.root.removeFromParent();
  }
}
