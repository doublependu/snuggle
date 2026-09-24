// Zone base: loads Blender-authored GLBs (visuals + COL_* colliders + marker empties), instances
// PLACE_<piece> kit pieces, sets up lights / fog / sky, and cleans everything up on exit.
import {
  Box3, Color, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3,
} from 'three';
import { makeWater } from '../render/water.js';
import { plantTrees } from '../procgen/trees.js';
import { mulberry } from '../render/sky.js';
import { G } from '../game.js';
import { loadGLB } from '../core/assets.js';
import { stylize } from '../render/materials.js';
import { createSky } from '../render/sky.js';
import { Collision } from './collision.js';
import { NPC } from '../actors/npc.js';
import { Grumbling } from '../actors/grumbling.js';

const _m = new Matrix4();

export class Zone {
  constructor(id) {
    this.id = id;
    this.group = new Group();
    this.group.name = 'zone-' + id;
    this.markers = new Map();
    this.collision = new Collision();
    this.killY = -20;
    this.updaters = [];
    this.npcs = [];
    this.grumblings = [];
    this.interactables = [];
    this.sun = new Vector3(0.45, 0.7, -0.4).normalize();
    G.zone = this; // actors created while the zone builds attach their effects here
  }

  // Add a GLB: markers are collected, COL_* become collision only, the rest is stylized static scenery.
  async addGLB(name, { castShadows = null } = {}) {
    const gltf = await loadGLB(name);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const cols = [];
    root.traverse((o) => {
      if (o.name.startsWith('GROUND_') && o.isMesh) this.collision.addMesh(o);
      if (o.name.startsWith('COL_')) cols.push(o);
      else if (/^(SPAWN|NPC|GRUMB|TRIGGER|POINT|CAM|PLACE|SCATTER|WATER|LIGHT)_/.test(o.name)) this.addMarker(o);
    });
    for (const c of cols) {
      c.traverse((m) => m.isMesh && this.collision.addMesh(m));
      c.removeFromParent();
    }
    const shadows = castShadows ?? G.quality.tier.shadowSize >= 2048;
    stylize(root, { shadows, receive: true });
    root.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
    this.group.add(root);
    return root;
  }

  addMarker(o) {
    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();
    o.matrixWorld.decompose(pos, quat, scale);
    // Blender empties face -Y, which exports as +Z: the facing angle is the yaw of local +Z
    const fwd = new Vector3(0, 0, 1).applyQuaternion(quat);
    this.markers.set(o.name, { name: o.name, position: pos, quaternion: quat, scale, facing: Math.atan2(fwd.x, fwd.z), data: o.userData || {}, object: o });
  }

  marker(name) {
    return this.markers.get(name);
  }
  markersBy(prefix) {
    return [...this.markers.values()].filter((m) => m.name.startsWith(prefix));
  }

  // Instance kit pieces for every PLACE_<piece>[.nnn] marker. Kit GLB roots are named <piece>.
  async placeKit(kitName) {
    const gltf = await loadGLB(kitName);
    const pieces = new Map();
    for (const child of gltf.scene.children) pieces.set(child.name, child);
    const groups = new Map();
    for (const m of this.markersBy('PLACE_')) {
      const piece = m.name.slice(6).replace(/[._]?\d+$/, ''); // three strips the '.' from 'name.001'
      if (!pieces.has(piece)) continue;
      if (!groups.has(piece)) groups.set(piece, []);
      groups.get(piece).push(new Matrix4().compose(m.position, m.quaternion, m.scale));
    }
    const shadows = G.quality.tier.shadowSize >= 2048;
    for (const [piece, mats] of groups) {
      const src = pieces.get(piece);
      src.position.set(0, 0, 0);
      src.rotation.set(0, 0, 0);
      src.scale.set(1, 1, 1);
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        if (!o.isMesh) return;
        let isCol = false;
        for (let p = o; p; p = p.parent) if (p.name.startsWith('COL_')) isCol = true;
        if (isCol) {
          this.collision.addInstanced(o.geometry, mats.map((mm) => new Matrix4().multiplyMatrices(mm, o.matrixWorld)));
          return;
        }
        stylize(o, { shadows });
        const im = new InstancedMesh(o.geometry, o.material, mats.length);
        mats.forEach((mm, i) => im.setMatrixAt(i, _m.multiplyMatrices(mm, o.matrixWorld)));
        im.castShadow = o.castShadow;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        im.name = piece;
        this.group.add(im);
      });
    }
  }

  // Sky, fog, hemisphere + sun (the sun's shadow frustum follows the player).
  setupEnvironment(o = {}) {
    const env = {
      skyTop: '#6fa7d8', horizon: '#e4eef0', ground: '#a7b89c', fog: '#dfe9ea', fogNear: 30, fogFar: 150,
      hemiSky: '#cfe3ff', hemiGround: '#b89f7a', hemi: 1.9, sunColor: '#fff0d8', sunI: 2.6, clouds: 10, peaks: true, skyline: null,
      ...o,
    };
    if (o.sun) this.sun.copy(o.sun).normalize();
    this.env = env;
    const scene = G.scene;
    scene.fog = new Fog(env.fog, env.fogNear, Math.min(env.fogFar, G.quality.tier.drawDistance * 1.3));
    scene.background = new Color(env.fog);
    if (env.sky !== false) {
      this.sky = createSky({ top: env.skyTop, horizon: env.horizon, ground: env.ground, sun: this.sun, clouds: env.clouds, peaks: env.peaks, skyline: env.skyline, peakColor: env.peakColor || '#7f9bb0' });
      this.group.add(this.sky);
    }
    this.hemi = new HemisphereLight(env.hemiSky, env.hemiGround, env.hemi);
    this.group.add(this.hemi);
    const d = (this.sunLight = new DirectionalLight(env.sunColor, env.sunI));
    const t = G.quality.tier;
    if (t.shadows && env.shadows !== false) {
      d.castShadow = true;
      d.shadow.mapSize.set(t.shadowSize, t.shadowSize);
      const s = t.shadowSize >= 2048 ? 14 : 9;
      Object.assign(d.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 60 });
      d.shadow.bias = -0.0006;
      d.shadow.normalBias = 0.03;
    }
    this.group.add(d, d.target);
  }

  update(dt) {
    const p = G.player;
    if (this.sunLight && p) {
      // keep the shadow frustum centred on the player (snapped to texels to avoid shimmering)
      const step = 0.25;
      const cx = Math.round(p.position.x / step) * step,
        cz = Math.round(p.position.z / step) * step;
      this.sunLight.target.position.set(cx, p.position.y, cz);
      this.sunLight.position.set(cx, p.position.y, cz).addScaledVector(this.sun, 30);
      this.sunLight.target.updateMatrixWorld();
    }
    this.sky?.userData.update(dt, G.camera.position);
    for (const n of this.npcs) n.update(dt);
    for (const u of this.updaters) u(dt);
  }

  // Water planes for WATER_* markers (scale = half extents).
  addWater(opts = {}) {
    const env = this.env || {};
    for (const m of this.markersBy('WATER_')) {
      const mat = makeWater({ top: env.skyTop, horizon: env.horizon, sun: this.sun, detail: G.quality.tier.water > 0 ? 1 : 0, ...opts });
      const w = new Mesh(new PlaneGeometry(m.scale.x * 2, m.scale.z * 2, 1, 1).rotateX(-Math.PI / 2), mat);
      w.position.copy(m.position);
      w.receiveShadow = false;
      w.name = m.name;
      this.group.add(w);
      this.waterLevel = m.position.y;
    }
  }

  // SCATTER_<kind>_* markers: plant trees of that kind inside the marker box, dropped onto the ground.
  // Call after collision.build(); trunks are added and the BVH is rebuilt.
  scatter(seed = 1, avoid = []) {
    const rnd = mulberry(seed);
    const byKind = new Map();
    for (const m of this.markersBy('SCATTER_')) {
      const kind = m.name.slice(8).split('_')[0];
      const n = Math.max(1, Math.round((m.data.count || 10) * G.quality.tier.foliage));
      for (let i = 0; i < n; i++) {
        const x = m.position.x + (rnd() * 2 - 1) * m.scale.x;
        const z = m.position.z + (rnd() * 2 - 1) * m.scale.z;
        if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < (a.r || 3))) continue;
        const y = this.collision.groundY(x, z, m.position.y + 40);
        if (y === null || (this.waterLevel !== undefined && y < this.waterLevel + 0.1)) continue;
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push({ position: new Vector3(x, y, z), scale: (m.data.size || 1) * (0.75 + rnd() * 0.5), rot: rnd() * 6.28 });
      }
    }
    const shadows = G.quality.tier.shadows;
    for (const [kind, list] of byKind) {
      const im = plantTrees(kind, list, { collision: this.collision, sway: G.quality.tier.sway, shadows });
      if (im) this.group.add(im);
    }
    this.collision.build();
  }

  // Box trigger from a TRIGGER_* marker (scale = half extents); fn runs when the player enters.
  onTrigger(name, fn) {
    const m = this.marker(name);
    if (!m) return;
    const box = new Box3(m.position.clone().sub(m.scale), m.position.clone().add(m.scale));
    let inside = false;
    this.updaters.push(() => {
      const now = box.containsPoint(G.player.position);
      if (now && !inside && !G.frozen) fn();
      inside = now;
    });
  }

  // Create NPCs for NPC_* markers that carry a model prop (seated ones sit on their seat height).
  async populateNPCs(filter = () => true) {
    const ms = this.markersBy('NPC_').filter((m) => m.data.model && filter(m));
    const npcs = await Promise.all(
      ms.map((m) => NPC.create(m.name.slice(4), m.data.model, m.position, m.facing, { anim: m.data.anim || 'idle', look: m.data.anim !== 'sit' })),
    );
    npcs.forEach((n, i) => {
      if (ms[i].data.anim === 'sit') n.sitOn(ms[i].data.seat ?? 0.5);
      this.addNPC(n);
    });
    return npcs;
  }

  grumblingAt(name, opts = {}) {
    const m = this.marker(name);
    if (!m) return null;
    return this.addGrumbling(new Grumbling(m.data.species || name.slice(6).replace(/_\d+$/, ''), m.position, opts));
  }

  addNPC(npc) {
    this.npcs.push(npc);
    this.group.add(npc.root);
    return npc;
  }
  addGrumbling(g) {
    this.grumblings.push(g);
    this.group.add(g.obj);
    return g;
  }
  addInteractable(it) {
    this.interactables.push(it);
    G.interactables.add(it);
    return it;
  }

  dispose() {
    this.onExit?.();
    for (const n of this.npcs) n.dispose();
    for (const g of [...G.grumblings]) g.dispose();
    for (const it of this.interactables) G.interactables.delete(it);
    this.group.removeFromParent();
    const geoms = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !o.isSkinnedMesh) geoms.add(o.geometry);
    });
    for (const g of geoms) g.dispose();
    this.sunLight?.shadow.map?.dispose();
    G.scene.fog = null;
  }
}
