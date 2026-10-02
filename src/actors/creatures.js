// SPDX-License-Identifier: GPL-3.0-only
// Creature meshes (Bean, Grumblings) from creatures.glb. Each species is an Object3D with
// <id>_body and <id>_eyes children, and some have moving parts: <id>_wingL / _wingR (the sparrow, flapped by
// its behaviour) and <id>_<part> (the cloud's puffs, the sock's toe, the homework's page corner, the
// pom-pom's tuft; see animateParts). Clones share geometry.
import { Color, InstancedMesh } from 'three';
import { loadGLB } from '../core/assets.js';
import { materialFor, stylize } from '../render/materials.js';

let protos = null;

// file: 'creatures' (Bean and the species of the story so far), or a later set added to it ('creatures2').
export async function loadCreatures(file = 'creatures') {
  if (protos && file === 'creatures') return protos;
  const gltf = await loadGLB(file);
  protos ||= {};
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
    else if (o.name.startsWith(id + '_') && !/_(body|eyes)/.test(o.name)) (c.userData.parts ||= {})[o.name.slice(id.length + 1)] = o;
  }
  if (c.userData.parts?.open) c.userData.parts.open.visible = false; // Bean's open eyes (systems/bean.js)
  if (glow && c.userData.body) {
    c.userData.body.traverse((m) => {
      if (m.isMesh) m.material = materialFor(m.material.name, { emissive: '#' + new Color(glow).multiplyScalar(0.3).getHexString() });
    });
  }
  return c;
}

// Idle motion for a creature's moving parts; calm (0..1) slows it down as a Grumbling is soothed.
export function animateParts(obj, t, calm = 0) {
  const p = obj.userData.parts;
  if (!p) return;
  const k = 1 - calm * 0.6;
  switch (obj.userData.species) {
    case 'cloud': // the side puffs breathe, a little out of step
      p.puffL?.scale.setScalar(1 + Math.sin(t * 2.2 * k) * 0.08);
      p.puffR?.scale.setScalar(1 + Math.sin(t * 2.2 * k + 1.7) * 0.08);
      break;
    case 'sock': // the toe wiggles
      if (p.toe) p.toe.rotation.x = Math.sin(t * 6 * k) * 0.22;
      break;
    case 'homework': // the page corner flaps
      if (p.flap) p.flap.rotation.y = Math.sin(t * 8 * k) * 0.35 * k;
      break;
    case 'pompom': // the tuft sways (and perks up with company)
      if (p.tuft) {
        p.tuft.rotation.z = Math.sin(t * 1.8) * 0.18;
        p.tuft.rotation.x = -0.25 + calm * 0.25 + Math.sin(t * 2.3) * 0.08;
      }
      break;
  }
}

// Draw many creatures of one species in a few calls: each part (body, eyes, wings) of every registered
// creature becomes an instance of one InstancedMesh. The creatures keep working as normal Object3Ds (the
// game moves, scales and flaps them); their own meshes are hidden and update() copies their transforms.
// Call update() after the creatures have moved for the frame (a G.updaters entry does that).
// tint: body parts take each creature's obj.userData.tint (a Color; the grey Grumblings warm up with it).
export class CreatureBatch {
  constructor(id, max, { tint = false } = {}) {
    const meshes = [];
    protos[id].traverse((o) => o.isMesh && meshes.push(o));
    const white = new Color(1, 1, 1);
    this.parts = meshes.map((m) => {
      const im = new InstancedMesh(m.geometry, m.material, max);
      im.frustumCulled = false;
      im.count = 0;
      im.name = id + '-batch';
      // made up front, so the shader is compiled with instance colours before the zone starts
      if (tint && !m.name.startsWith(id + '_e')) for (let i = 0; i < max; i++) im.setColorAt(i, white);
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
      if (obj.userData.tint) for (const im of this.parts) if (im.instanceColor) im.setColorAt(n, obj.userData.tint);
      n++;
    }
    for (const im of this.parts) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
