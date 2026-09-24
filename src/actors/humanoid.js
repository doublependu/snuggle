// Skinned chibi characters driven by the shared animation library (anim_humanoid.glb).
// Clips are retargeted once per character: missing bones get rest tracks, and the hips translation
// track is rescaled to the character's hip height. Upper-body overlay clips (hum/talk/wave/...)
// are masked copies that play over locomotion with a higher weight.
import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, QuaternionKeyframeTrack, VectorKeyframeTrack, Vector3 } from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from '../core/assets.js';
import { stylize } from '../render/materials.js';

const UPPER = new Set(['spine', 'chest', 'neck', 'head', 'hood', 'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R']);
const ONCE = new Set(['land', 'throw']);
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
      if (!have.has(qn) && lib.rest[bone].q) tracks.push(new QuaternionKeyframeTrack(qn, [0], lib.rest[bone].q.toArray()));
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
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.frustumCulled = true;
        o.geometry.computeBoundingSphere();
        o.geometry.boundingSphere.radius *= 1.6;
        this.meshes.push(o);
      }
    });
    this.mixer = new AnimationMixer(root);
    this.clips = clips;
    this.actions = {};
    this.base = null;
    this.overlay = null;
    this.speed = 1;
    this.lodTimer = 0;
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

  // Distant / hidden characters update at a lower rate to save CPU on phones.
  update(dt, distance = 0) {
    const every = distance > 25 ? 4 : distance > 12 ? 2 : 1;
    this.lodTimer += dt;
    this.lodFrame = (this.lodFrame || 0) + 1;
    if (this.lodFrame % every) return;
    this.mixer.update(this.lodTimer);
    this.lodTimer = 0;
  }

  worldBone(name, target = new Vector3()) {
    const b = this.bones[name];
    if (!b) return target.copy(this.root.position);
    return b.getWorldPosition(target);
  }
}
