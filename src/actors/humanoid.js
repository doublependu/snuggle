// SPDX-License-Identifier: GPL-3.0-only
// Skinned chibi characters driven by the shared animation library (anim_humanoid.glb).
// Clips are retargeted once per character: missing bones get rest tracks, and the hips translation
// track is rescaled to the character's hip height. Upper-body overlay clips (hum/talk/wave/...)
// are masked copies that play over locomotion with a higher weight. Tracks hold absolute local
// rotations, so a character may be bound in its own rest pose (A-pose) as long as its bone axes
// match the library's (tools/blender/snuglib.py).
// Characters with an atlas get a painted Face; bones named spring_<chain>_<n> swing on damped springs.
import { AnimationClip, AnimationMixer, Box3, LoopOnce, LoopRepeat, MathUtils, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack, Vector3 } from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from '../core/assets.js';
import { stylize } from '../render/materials.js';
import { Face } from './face.js';

const _p = new Vector3();
const _right = new Vector3();
const _fwd = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _pq = new Quaternion();
const _up = new Vector3(0, 1, 0);

const UPPER = new Set(['spine', 'chest', 'neck', 'head', 'hood', 'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R']);
const LOOK = [['neck', 0.35], ['head', 0.65]]; // bones the look-at turns, and their share of the turn
const ONCE = new Set(['land', 'throw']);
const sitCache = new Map();
let library = null;

async function animLibrary() {
  if (library) return library;
  const gltf = await loadGLB('anim_humanoid');
  const rest = {};
  gltf.scene.traverse((o) => {
    rest[o.name] = { q: o.quaternion.clone(), p: o.position.clone() };
  });
  library = { clips: gltf.animations, rest, hipsY: rest.hips?.p.y || 0.42 };
  return library;
}

const cache = new Map();

function retarget(lib, charRest) {
  const hipsLib = lib.rest.hips.p;
  const hipsChar = charRest.hips?.p || hipsLib;
  const k = hipsChar.y / hipsLib.y;
  const out = {};
  // bones that no clip ever animates (neck, hood) keep the character's own rest pose: the library's rest
  // for them assumes the library's bone axes, which rolled Wei Bao's neck sideways
  const animated = new Set();
  for (const clip of lib.clips) for (const t of clip.tracks) animated.add(t.name.split('.')[0]);
  for (const clip of lib.clips) {
    const tracks = [];
    const have = new Set();
    for (const t of clip.tracks) {
      const [bone, prop] = t.name.split('.');
      if (!charRest[bone]) continue;
      if (prop === 'position') {
        if (bone !== 'hips') continue;
        const v = t.values.slice();
        for (let i = 0; i < v.length; i += 3) {
          v[i] = hipsChar.x + (v[i] - hipsLib.x) * k;
          v[i + 1] = hipsChar.y + (v[i + 1] - hipsLib.y) * k;
          v[i + 2] = hipsChar.z + (v[i + 2] - hipsLib.z) * k;
        }
        tracks.push(new VectorKeyframeTrack(t.name, t.times, v));
      } else tracks.push(t);
      have.add(t.name);
    }
    for (const bone of Object.keys(lib.rest)) {
      if (!charRest[bone] || bone === 'root' || lib.rest[bone] === undefined) continue;
      const qn = bone + '.quaternion';
      const rest = animated.has(bone) ? lib.rest[bone].q : charRest[bone].q;
      if (!have.has(qn) && rest) tracks.push(new QuaternionKeyframeTrack(qn, [0], rest.toArray()));
    }
    if (!have.has('hips.position') && charRest.hips) tracks.push(new VectorKeyframeTrack('hips.position', [0], hipsChar.toArray()));
    out[clip.name] = new AnimationClip(clip.name, clip.duration, tracks);
    out[clip.name + '_upper'] = new AnimationClip(clip.name + '_upper', clip.duration, tracks.filter((t) => UPPER.has(t.name.split('.')[0])));
  }
  return out;
}

export class Humanoid {
  static async load(name) {
    const [gltf, lib] = await Promise.all([loadGLB(name), animLibrary()]);
    let entry = cache.get(name);
    if (!entry) {
      const rest = {};
      gltf.scene.traverse((o) => {
        if (o.isBone) rest[o.name] = { q: o.quaternion.clone(), p: o.position.clone() };
      });
      entry = { clips: retarget(lib, rest), used: false };
      cache.set(name, entry);
    }
    const root = entry.used ? skeletonClone(gltf.scene) : gltf.scene;
    entry.used = true;
    return new Humanoid(name, root, entry.clips);
  }

  constructor(name, root, clips) {
    this.name = name;
    this.root = root;
    stylize(root);
    this.bones = {};
    this.meshes = [];
    this.triangles = 0;
    this.face = null;
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.frustumCulled = true;
        o.geometry.computeBoundingSphere();
        o.geometry.boundingSphere.radius *= 1.6;
        this.meshes.push(o);
        this.triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        if (o.material.userData.face && o.userData.face) {
          const layout = typeof o.userData.face === 'string' ? JSON.parse(o.userData.face) : o.userData.face;
          this.face = new Face(o.material.userData.face, layout);
        }
      }
    });
    // size in the bind pose (framing, seating); head radius from the head bone to the top
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    this.height = box.max.y - root.position.y;
    const headY = this.bones.head ? this.bones.head.getWorldPosition(_p).y - root.position.y : this.height * 0.7;
    this.headRadius = (this.height - headY) / 2;
    this.springs = this.findSprings();
    this.vel = new Vector3();
    this.lastPos = null;
    this.mixer = new AnimationMixer(root);
    this.clips = clips;
    this.actions = {};
    this.base = null;
    this.overlay = null;
    this.speed = 1;
    this.lodTimer = 0;
    this.lookSaved = {}; // per look bone: its clip pose and the turned pose updateLook left it in
  }

  action(name) {
    let a = this.actions[name];
    if (!a && this.clips[name]) {
      a = this.actions[name] = this.mixer.clipAction(this.clips[name]);
      const once = ONCE.has(name.replace('_upper', ''));
      a.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
      a.clampWhenFinished = once;
    }
    return a;
  }

  // Base (full-body) clip with crossfade.
  play(name, fade = 0.2, timeScale = 1) {
    const a = this.action(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (this.base === a) return;
    a.reset().setEffectiveWeight(1).play();
    if (this.base) this.base.crossFadeTo(a, fade, false);
    else a.fadeIn(fade);
    this.base = a;
  }

  // Upper-body overlay (hum/talk/wave/throw/...), null to clear.
  overlayPlay(name, fade = 0.2, weight = 4) {
    const a = name ? this.action(name + '_upper') : null;
    if (a === this.overlay) return;
    if (this.overlay) this.overlay.fadeOut(fade);
    if (a) {
      a.reset().setEffectiveWeight(weight).fadeIn(fade).play();
    }
    this.overlay = a;
  }

  // Hips height (relative to the root) in a clip's first frame; used to seat characters on benches.
  clipHipsY(name) {
    const t = this.clips[name]?.tracks.find((k) => k.name === 'hips.position');
    return t ? t.values[1] : this.bones.hips?.position.y || 0.4;
  }

  // The seated pose measured once per character: hips height and how far the knees reach in front of
  // the root, so the knees rest just past a seat's front edge whatever the leg length.
  sitPose() {
    const cached = sitCache.get(this.name);
    if (cached) return cached;
    const clip = this.clips.sit;
    const saved = [];
    this.root.traverse((o) => o.isBone && saved.push([o, o.position.clone(), o.quaternion.clone()]));
    const pos = this.root.position.clone(),
      rot = this.root.rotation.clone();
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    let knee = 0.2;
    if (clip) {
      const m = new AnimationMixer(this.root);
      m.clipAction(clip).play();
      m.update(0);
      this.root.updateMatrixWorld(true);
      const k = ['shin_L', 'shin_R'].map((b) => this.bones[b]?.getWorldPosition(new Vector3()).z).filter((z) => z !== undefined);
      if (k.length) knee = Math.max(...k);
      m.stopAllAction();
      m.uncacheRoot(this.root);
    }
    for (const [o, p, q] of saved) {
      o.position.copy(p);
      o.quaternion.copy(q);
    }
    this.root.position.copy(pos);
    this.root.rotation.copy(rot);
    this.root.updateMatrixWorld(true);
    const out = { hipsY: this.clipHipsY('sit'), knee };
    sitCache.set(this.name, out);
    return out;
  }

  // Root transform for sitting on a seat: front = centre of the seat's front edge (on the floor), seat =
  // seat-top height above it, facing = away from the seat back.
  seatRoot(front, facing, seat, out = new Vector3()) {
    const { hipsY, knee } = this.sitPose();
    const back = knee - 0.03; // knees 3 cm past the edge
    out.set(front.x - Math.sin(facing) * back, front.y + seat - (hipsY - 0.11), front.z - Math.cos(facing) * back);
    return out;
  }

  // Distant / hidden characters update at a lower rate to save CPU on phones.
  update(dt, distance = 0) {
    const every = distance > 25 ? 4 : distance > 12 ? 2 : 1;
    this.lodTimer += dt;
    this.lodFrame = (this.lodFrame || 0) + 1;
    this.face?.update(dt);
    if (this.lodFrame % every) return;
    this.unlook();
    this.mixer.update(this.lodTimer);
    this.updateLook(this.lodTimer);
    if (this.springs.length) this.updateSprings(this.lodTimer);
    this.lodTimer = 0;
  }

  // Head look-at: set lookTarget (a world Vector3, or null). Applied on top of whatever clip is playing,
  // split between neck and head, limited to what a neck can do, and faded in and out.
  updateLook(dt) {
    const want = this.lookTarget ? 1 : 0;
    this.lookW = (this.lookW || 0) + (want - (this.lookW || 0)) * Math.min(1, dt * 4);
    if (this.lookW < 0.01 || !this.bones.head) return;
    if (this.lookTarget) this.lookPos = (this.lookPos || new Vector3()).copy(this.lookTarget);
    const head = this.bones.head.getWorldPosition(_p);
    const dx = this.lookPos.x - head.x,
      dy = this.lookPos.y - head.y,
      dz = this.lookPos.z - head.z;
    _fwd.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q));
    const facing = Math.atan2(_fwd.x, _fwd.z);
    let yaw = Math.atan2(dx, dz) - facing;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    // don't wrench the head round to something behind her
    const behind = MathUtils.smoothstep(Math.abs(yaw), 1.7, 2.3);
    const w = this.lookW * (1 - behind);
    if (w < 0.01) return;
    yaw = MathUtils.clamp(yaw, -1.05, 1.05) * w;
    // chibi heads are big: a gentle nod reads better than a full one
    const pitch = MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 0.6, -0.28, 0.22) * w;
    for (const [name, k] of LOOK) {
      const b = this.bones[name];
      if (!b) continue;
      const turned = facing + yaw * (name === 'neck' ? k : 1);
      _right.set(Math.cos(turned), 0, -Math.sin(turned));
      _q.setFromAxisAngle(_up, yaw * k);
      _q2.setFromAxisAngle(_right, -pitch * k);
      _q2.multiply(_q);
      b.parent.getWorldQuaternion(_pq);
      const saved = (this.lookSaved[name] ||= { pose: new Quaternion(), turned: new Quaternion() });
      saved.pose.copy(b.quaternion);
      b.quaternion.premultiply(_pq).premultiply(_q2).premultiply(_pq.invert());
      saved.turned.copy(b.quaternion);
    }
  }

  // Take the look turn back off before the mixer runs. The mixer only writes a bone whose clip value
  // changed, so a bone the clip holds still (the neck always: no clip animates it) kept every turn ever
  // added to it: heads spun, or folded into the chest and stayed there. A bone that something else has
  // posed since (the viewer, sitPose) is left alone.
  unlook() {
    for (const name in this.lookSaved) {
      const b = this.bones[name];
      const saved = this.lookSaved[name];
      if (b.quaternion.equals(saved.turned)) b.quaternion.copy(saved.pose);
    }
  }

  // Chains of spring_<chain>_<n> bones (legacy: braid_<n>), ordered root to tip.
  findSprings() {
    const chains = {};
    for (const [name, b] of Object.entries(this.bones)) {
      const m = /^spring_(.+)_(\d+)$/.exec(name) || /^(braid)_(\d+)$/.exec(name);
      if (m) (chains[m[1]] ||= []).push([Number(m[2]), b]);
    }
    return Object.values(chains).map((list) => {
      const bones = list.sort((a, b) => a[0] - b[0]).map(([, b]) => b);
      return { bones, rest: bones.map((b) => b.quaternion.clone()), angle: new Vector3(), vel: new Vector3(), phase: Math.random() * 6 };
    });
  }

  // Secondary motion from the root's own movement (works for the player and walking NPCs alike):
  // speed swings the chain back, acceleration and gravity add to it, a slow sway keeps it alive.
  updateSprings(dt) {
    if (dt <= 0) return;
    const p = this.root.getWorldPosition(_p);
    if (!this.lastPos) this.lastPos = p.clone();
    const vx = (p.x - this.lastPos.x) / dt,
      vy = (p.y - this.lastPos.y) / dt,
      vz = (p.z - this.lastPos.z) / dt;
    this.lastPos.copy(p);
    const k = Math.min(1, dt * 20);
    const ax = ((vx - this.vel.x) * k) / dt,
      az = ((vz - this.vel.z) * k) / dt;
    this.vel.x += (vx - this.vel.x) * k;
    this.vel.y += (MathUtils.clamp(vy, -6, 6) - this.vel.y) * k;
    this.vel.z += (vz - this.vel.z) * k;
    const yaw = this.root.rotation.y;
    const s = Math.sin(yaw),
      c = Math.cos(yaw);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const fwdAcc = MathUtils.clamp(ax * s + az * c, -30, 30);
    const sideAcc = MathUtils.clamp(ax * c - az * s, -30, 30);
    _right.set(c, 0, -s);
    _fwd.set(s, 0, c);
    this.sprTime = (this.sprTime || 0) + dt;
    for (const ch of this.springs) {
      const tx = -speed * 0.09 - fwdAcc * 0.015 + this.vel.y * 0.04;
      const tz = sideAcc * 0.02 + Math.sin(this.sprTime * 1.3 + ch.phase) * 0.03;
      const h = Math.min(dt, 1 / 30);
      ch.vel.x += ((tx - ch.angle.x) * 40 - ch.vel.x * 7) * h;
      ch.vel.z += ((tz - ch.angle.z) * 40 - ch.vel.z * 7) * h;
      ch.angle.addScaledVector(ch.vel, h);
      ch.angle.x = MathUtils.clamp(ch.angle.x, -0.9, 0.6);
      ch.angle.z = MathUtils.clamp(ch.angle.z, -0.6, 0.6);
      ch.bones.forEach((b, i) => {
        const w = 0.45 + i * 0.3;
        _q.setFromAxisAngle(_right, -ch.angle.x * w);
        _q2.setFromAxisAngle(_fwd, ch.angle.z * w);
        _q.multiply(_q2);
        b.parent.getWorldQuaternion(_pq);
        // local = parentWorld^-1 * swing * parentWorld * rest
        b.quaternion.copy(_pq).invert().multiply(_q).multiply(_pq).multiply(ch.rest[i]);
      });
    }
  }

  worldBone(name, target = new Vector3()) {
    const b = this.bones[name];
    if (!b) return target.copy(this.root.position);
    return b.getWorldPosition(target);
  }
}
