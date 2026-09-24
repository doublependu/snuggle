// Creature meshes (Doudou, Grumblings) from creatures.glb. Each species is an Object3D with
// <id>_body and <id>_eyes children; clones share geometry.
import { Color } from 'three';
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
  }
  if (glow && c.userData.body) {
    c.userData.body.traverse((m) => {
      if (m.isMesh) m.material = materialFor(m.material.name, { emissive: '#' + new Color(glow).multiplyScalar(0.3).getHexString() });
    });
  }
  return c;
}
