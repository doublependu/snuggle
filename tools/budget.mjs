// SPDX-License-Identifier: GPL-3.0-only
// Load budget check (run after `npm run build`): the bytes a player downloads before the Begin button
// enables. A first visit starts on the train; a returning player starts in the zone their save is in, so
// every zone is checked: HTML + entry JS + the zone's chunks (from Vite's manifest) + the models that
// index.html preloads for it. Fails (exit 1) when over budget. See ai/plan_0.md §1 and ai/plan_2.md §4.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const DIST = 'dist';
// first visit (train) keeps the original budget; returning players may start somewhere bigger, and
// `npm run perf` is the real gate for them (<= 3 s must-pass)
const BUDGET = {
  first: { js: 240 * 1024, models: 700 * 1024, total: 1200 * 1024 },
  returning: { js: 280 * 1024, models: 1250 * 1024, total: 1600 * 1024 },
};
// per-model limits (ai/plan_1.md §2, ai/plan_2.md §5.5): KB and triangles
const MODEL_BUDGET = {
  xiaopei: [130, 7000],
  tangtang: [130, 6500],
  weibao: [130, 6500],
  fang: [135, 6500],
  folk_a: [62, 3500],
  folk_b: [65, 3500],
  folk_c: [62, 3500],
  folk_kid: [65, 3500], // planned 60 KB; a townsperson's full detail (streams in after Begin)
  creatures: [110, 9 * 800],
  market: [200, 60000],
  market_kit: [150, 30000], // planned 130 KB; 145 KB with every stall's lanterns (ai/next_2.md)
};

if (!existsSync(DIST)) {
  console.error('dist/ not found: run `npm run build` first');
  process.exit(1);
}
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const html = gz(join(DIST, 'index.html'));

// the preload map is the inline script in index.html: var zones = { train: [...], ... }
const src = readFileSync('index.html', 'utf8');
const always = JSON.parse(src.match(/\[('xiaopei'[^\]]*)\]\.concat/)[1].replace(/'/g, '"').replace(/^/, '[') + ']');
const zones = Function('return ' + src.match(/var zones = (\{[\s\S]*?\n\s*\});/)[1])();

// JS files reachable (statically) from a manifest entry
function chunks(key, seen = new Set()) {
  const e = manifest[key];
  if (!e || seen.has(key)) return seen;
  seen.add(key);
  for (const i of e.imports || []) chunks(i, seen);
  return seen;
}
const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);

let ok = true;
const check = (name, v, max) => {
  const pass = v <= max;
  ok &&= pass;
  return `${pass ? '✓' : '✗'} ${name} ${kb(v).trim()} / ${kb(max).trim()}`;
};
for (const zone of Object.keys(zones)) {
  const keys = chunks(entryKey);
  const zoneKey = `src/world/zones/${zone}.js`;
  if (!manifest[zoneKey]) {
    console.log(`(${zone}: no zone module in this build, skipped)`);
    continue;
  }
  chunks(zoneKey, keys);
  let js = 0;
  for (const k of keys) js += gz(join(DIST, manifest[k].file));
  const models = always.concat(zones[zone]);
  let mb = 0;
  const rows = [];
  for (const m of models) {
    const p = join(DIST, 'assets', 'models', m + '.glb');
    const b = existsSync(p) ? statSync(p).size : 0;
    mb += b;
    rows.push(`${m} ${(b / 1024).toFixed(0)}`);
  }
  const b = zone === 'train' ? BUDGET.first : BUDGET.returning;
  const total = html + js + mb;
  console.log(`${zone === 'train' ? 'First visit' : 'Returning'} -> ${zone}: ${check('js', js, b.js)}  ${check('models', mb, b.models)}  ${check('total', total, b.total)}`);
  console.log(`    models (KB): ${rows.join(', ')}`);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
console.log('Models:');
for (const [name, [maxKb, maxTris]] of Object.entries(MODEL_BUDGET)) {
  const p = join(DIST, 'assets', 'models', name + '.glb');
  if (!existsSync(p)) continue;
  const bytes = statSync(p).size;
  const doc = await io.read(p);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const prim of m.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  const pass = bytes <= maxKb * 1024 && tris <= maxTris;
  ok &&= pass;
  const atlas = doc.getRoot().listTextures().length ? ' atlas' : '';
  console.log(`${pass ? '✓' : '✗'} ${name.padEnd(10)} ${kb(bytes)} / ${maxKb} KB   ${String(tris).padStart(6)} / ${maxTris} tris${atlas}`);
}
const lic = existsSync(join(DIST, 'third-party-licenses.md'));
ok &&= lic;
console.log(`${lic ? '✓' : '✗'} third-party-licenses.md shipped`);
const all = readdirSync(join(DIST, 'assets', 'models')).reduce((a, f) => a + statSync(join(DIST, 'assets', 'models', f)).size, 0);
console.log(`(all models, streamed later: ${kb(all)})`);
process.exit(ok ? 0 : 1);
