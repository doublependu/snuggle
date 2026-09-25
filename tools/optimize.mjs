// SPDX-License-Identifier: GPL-3.0-only
// Optimizes raw Blender exports (assets-src/export/*.glb) into public/assets/models/*.glb.
// meshopt compression + quantization keeps every model small; the runtime decodes with MeshoptDecoder.
// Usage: npm run assets [-- name1 name2]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, resample, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readdirSync, statSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = 'assets-src/export';
const OUT = 'public/assets/models';
mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// Shared animation library: keep rotations for every bone and translation only for the hips,
// so the clips retarget onto characters with different proportions.
// Channels that never leave the rest pose are dropped too (the runtime fills them back as rest tracks).
function atRest(ch) {
  const node = ch.getTargetNode();
  const rest = ch.getTargetPath() === 'rotation' ? node.getRotation() : node.getTranslation();
  const out = ch.getSampler().getOutput();
  const v = [];
  for (let i = 0; i < out.getCount(); i++) {
    out.getElement(i, v);
    let d = 0;
    for (let k = 0; k < v.length; k++) d = Math.max(d, Math.abs(v[k] - rest[k]));
    // q and -q are the same rotation
    if (d > 1e-3 && v.length === 4 && Math.max(...v.map((x, k) => Math.abs(x + rest[k]))) < 1e-3) d = 0;
    if (d > 1e-3) return false;
  }
  return true;
}

function stripAnimChannels(doc) {
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const path = ch.getTargetPath();
      const node = ch.getTargetNode();
      const keep = (path === 'rotation' || (path === 'translation' && node?.getName() === 'hips')) && !atRest(ch);
      if (!keep) {
        const s = ch.getSampler();
        ch.dispose();
        if (s && s.listParents().length <= 1) s.dispose();
      }
    }
  }
}

// Sculpted characters (tools/blender/chibi.py) come with <name>_atlas.webp: attach it as the base colour
// texture of their 'mixed' material. Done here rather than in Blender because the 'mixed' material has
// no colour node on purpose (the exporter then keeps the shader codes in the colour alpha).
function attachAtlas(doc, name) {
  const file = join(SRC, name + '_atlas.webp');
  if (!existsSync(file)) return false;
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const tex = doc.createTexture(name + '_atlas').setImage(readFileSync(file)).setMimeType('image/webp').setURI(name + '_atlas.webp');
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getName().startsWith('mixed')) m.setBaseColorTexture(tex);
  }
  return true;
}

// Materials only carry a name (the runtime shader family); drop PBR extras.
function simplifyMaterials(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicFactor(0).setRoughnessFactor(1);
    for (const ext of m.listExtensions()) ext.dispose();
  }
}

const only = process.argv.slice(2);
const files = readdirSync(SRC).filter((f) => f.endsWith('.glb') && (!only.length || only.includes(basename(f, '.glb'))));
let total = 0;
for (const f of files) {
  const doc = await io.read(join(SRC, f));
  if (f === 'anim_humanoid.glb') stripAnimChannels(doc);
  simplifyMaterials(doc);
  const atlas = attachAtlas(doc, basename(f, '.glb'));
  await doc.transform(
    dedup({ keepUniqueNames: true }),
    weld(),
    resample({ tolerance: 0.0005 }),
    prune({ keepAttributes: false, keepLeaves: true, keepExtras: true }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, quantizeWeight: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = join(OUT, f);
  await io.write(out, doc);
  const a = statSync(join(SRC, f)).size, b = statSync(out).size;
  total += b;
  console.log(`${f.padEnd(24)} ${(a / 1024).toFixed(1).padStart(8)} KB -> ${(b / 1024).toFixed(1).padStart(7)} KB${atlas ? '  (+ atlas)' : ''}`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB in ${files.length} files`);
