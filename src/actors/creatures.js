// SPDX-License-Identifier: GPL-3.0-only
// Creature meshes (Doudou, Grumblings) from creatures.glb. Each species is an Object3D with
// <id>_body and <id>_eyes children (and <id>_wingL / _wingR for the sparrow); clones share geometry.
import { Color, InstancedMesh } from 'three';
import { loadGLB } from '../core/assets.js';
import { materialFor, stylize } from '../render/materials.js';

let protos = null;

export async function loadCreatures() {
  if (protos) return protos;
  const gltf = await loadGLB('creatures');
  protos = {};
  for (const child of [...gltf.scene.children]) {
    child.position.set(0, 0, 0);
    stylize(child, { shadows: true });
    protos[child.name] = child;
  }
  return protos;
}

export function makeCreature(id, { glow = null } = {}) {
  const p = protos?.[id];
  if (!p) throw new Error('creature not loaded: ' + id);
  const c = p.clone(true);
  c.userData.species = id;
  for (const o of c.children) {
    if (o.name.startsWith(id + '_eyes')) c.userData.eyes = o;
    if (o.name.startsWith(id + '_body')) c.userData.body = o;
    if (o.name.startsWith(id + '_wing')) (c.userData.wings ||= []).push(o); // the sparrow's flapping wings
  }
  if (glow && c.userData.body) {
    c.userData.body.traverse((m) => {
      if (m.isMesh) m.material = materialFor(m.material.name, { emissive: '#' + new Color(glow).multiplyScalar(0.3).getHexString() });
    });
  }
  return c;
}

// Draw many creatures of one species in a few calls: each part (body, eyes, wings) of every registered
// creature becomes an instance of one InstancedMesh. The creatures keep working as normal Object3Ds (the
// game moves, scales and flaps them); their own meshes are hidden and update() copies their transforms.
// Call update() after the creatures have moved for the frame (a G.updaters entry does that).
export class CreatureBatch {
  constructor(id, max) {
    const meshes = [];
    protos[id].traverse((o) => o.isMesh && meshes.push(o));
    this.parts = meshes.map((m) => {
      const im = new InstancedMesh(m.geometry, m.material, max);
      im.frustumCulled = false;
      im.count = 0;
      im.name = id + '-batch';
      return im;
    });
    this.list = [];
    this.max = max;
  }
  add(obj) {
    const meshes = [];
    obj.traverse((o) => o.isMesh && meshes.push(o));
    for (const m of meshes) m.visible = false;
    if (this.list.length < this.max) this.list.push({ obj, meshes });
  }
  update() {
    let n = 0;
    for (const { obj, meshes } of this.list) {
      if (!obj.parent || !obj.visible) continue;
      obj.updateMatrixWorld(true);
      meshes.forEach((m, k) => this.parts[k]?.setMatrixAt(n, m.matrixWorld));
      n++;
    }
    for (const im of this.parts) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
