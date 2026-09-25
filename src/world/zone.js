// SPDX-License-Identifier: GPL-3.0-only
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
import { BlobShadows } from '../render/vfx.js';
import { bakeLampMap, clearLamps } from '../render/lamps.js';
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
    this.offs = []; // event subscriptions owned by this zone (removed on dispose)
    this.npcWaiters = new Map();
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
      else if (/^(SPAWN|NPC|GRUMB|TRIGGER|POINT|CAM|PLACE|SCATTER|WATER|LIGHT|AREA|SEAT|GOOD)_/.test(o.name)) this.addMarker(o);
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
  // Box from an AREA_* / TRIGGER_* marker (scale = half extents).
  box(name) {
    const m = this.marker(name);
    return m ? new Box3(m.position.clone().sub(m.scale), m.position.clone().add(m.scale)) : null;
  }
  // G.events.on() that lasts only while this zone is loaded.
  on(type, fn) {
    const off = G.events.on(type, fn);
    this.offs.push(off);
    return off;
  }
  markersBy(prefix) {
    return [...this.markers].filter(([k]) => k.startsWith(prefix)).map(([, m]) => m);
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
      const sky = {
        top: env.skyTop, horizon: env.horizon, ground: env.ground, sun: this.sun, sunColor: env.skySun, clouds: env.clouds,
        cloudColor: env.cloudColor, cloudShade: env.cloudShade, peaks: env.peaks, skyline: env.skyline, peakColor: env.peakColor || '#7f9bb0',
        stars: env.stars || 0, moon: !!env.moon,
      };
      for (const k of Object.keys(sky)) if (sky[k] === undefined) delete sky[k];
      this.sky = createSky(sky);
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
    // no shadow map (low tier, or a night zone lit by lanterns): soft blob shadows keep everyone grounded
    if (!d.castShadow) {
      this.blobs = new BlobShadows();
      this.group.add(this.blobs.mesh);
    }
  }

  // Lantern light for night zones: LIGHT_* markers (props: color, radius, intensity) plus extra lamps,
  // baked into the lamp map over rect (render/lamps.js).
  lamps(rect, extra = [], opts = {}) {
    const list = this.markersBy('LIGHT_').map((m) => ({ position: m.position, color: m.data.color, radius: m.data.radius, intensity: m.data.intensity }));
    this.lampList = list.concat(extra);
    bakeLampMap(this.lampList, rect, opts);
    this.lampRect = rect;
    this.lampOpts = opts;
    return this.lampList;
  }
  relight() {
    if (this.lampList) bakeLampMap(this.lampList, this.lampRect, this.lampOpts);
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
    if (this.blobs && p) {
      const list = this.blobList || (this.blobList = []);
      list.length = 0;
      if (p.root.visible) list.push({ obj: p.root, radius: 0.3 });
      for (const n of this.npcs) if (!n.hidden && n.root.visible) list.push({ obj: n.root, radius: n.blobRadius || 0.3 });
      for (const g of this.grumblings) if (g.state !== 'gone' && g.obj.parent) list.push({ obj: g.obj, radius: 0.22 * g.size });
      this.blobs.update(list, (x, z, y) => this.collision.groundY(x, z, y));
    }
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
    const box = this.box(name);
    if (!box) return;
    let inside = false;
    this.updaters.push(() => {
      const now = box.containsPoint(G.player.position);
      if (now && !inside && !G.frozen) fn();
      inside = now;
    });
  }

  // Create NPCs for NPC_* markers that carry a model prop (seated ones sit on their seat height).
  // essential: ids the zone can't start without (the story cast); everyone else streams in after Begin
  // (their models are not in index.html's preload list). Use whenNPC() to set up a streamed NPC.
  async populateNPCs(filter = () => true, { essential = null } = {}) {
    const ms = this.markersBy('NPC_').filter((m) => m.data.model && filter(m));
    const make = (m) =>
      NPC.create(m.name.slice(4), m.data.model, m.position, m.facing, { anim: m.data.anim || 'idle', look: m.data.anim !== 'sit' }).then((n) => {
        if (this.disposed) {
          n.dispose();
          return null;
        }
        // seat markers mark the centre of the seat's front edge (see NPC.sitOn)
        if (m.data.anim === 'sit') n.sitOn(m.data.seat ?? 0.45, m.position, m.facing);
        this.addNPC(n);
        for (const fn of this.npcWaiters.get(n.id) || []) fn(n);
        this.npcWaiters.delete(n.id);
        return n;
      });
    const now = ms.filter((m) => !essential || essential.includes(m.name.slice(4)));
    const npcs = await Promise.all(now.map(make));
    const later = ms.filter((m) => !now.includes(m));
    this.streamed = Promise.all(later.map((m) => make(m).catch((e) => console.error(e))));
    return npcs;
  }

  // Run fn(npc) once this zone's NPC <id> exists (at once if it already does).
  whenNPC(id, fn) {
    const n = this.npcs.find((x) => x.id === id);
    if (n) return fn(n);
    if (!this.npcWaiters.has(id)) this.npcWaiters.set(id, []);
    this.npcWaiters.get(id).push(fn);
  }

  // A story Grumbling from a GRUMB_<id> marker. It is a one-off encounter ('<zone>:<id>'): once soothed
  // it never spawns again. An AREA_<id> marker, if present, keeps it inside that box.
  grumblingAt(name, opts = {}) {
    const m = this.marker(name);
    if (!m) return null;
    const id = name.slice(6);
    const key = this.id + ':' + id;
    if (G.save.soothed[key]) return null;
    const bounds = this.box('AREA_' + id);
    return this.addGrumbling(new Grumbling(m.data.species || id.replace(/_\d+$/, ''), m.position, { id, key, bounds, ...opts }));
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
    this.disposed = true;
    this.onExit?.();
    for (const off of this.offs) off();
    if (this.lampList) clearLamps();
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
