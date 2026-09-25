// Load budget check (run after `npm run build`): the bytes a first-time player downloads before the
// Begin button enables, i.e. HTML + entry JS + the first zone's chunks + the models it preloads.
// Fails (exit 1) when over budget. See ai/plan_0.md §1.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const DIST = 'dist';
const BUDGET = {
  js: 240 * 1024, // gzip
  models: 700 * 1024, // raw .glb (meshopt-compressed; hosts rarely gzip .glb)
  total: 1200 * 1024,
};
const FIRST_ZONE_MODELS = ['xiaopei', 'anim_humanoid', 'creatures', 'train', 'folk_a', 'folk_b', 'folk_c'];
// per-character limits (ai/plan_1.md §2): bytes (mesh + atlas) and triangles
const MODEL_BUDGET = {
  xiaopei: [130, 7000],
  tangtang: [120, 6000],
  weibao: [120, 6000],
  fang: [120, 6000],
  folk_a: [60, 3500],
  folk_b: [60, 3500],
  folk_c: [60, 3500],
  creatures: [100, 7 * 800],
};

if (!existsSync(DIST)) {
  console.error('dist/ not found: run `npm run build` first');
  process.exit(1);
}
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';

const html = gz(join(DIST, 'index.html'));
const assets = readdirSync(join(DIST, 'assets'));
const js = assets.filter((f) => f.endsWith('.js'));
const entry = js.filter((f) => f.startsWith('index-'));
const firstZone = js.filter((f) => /^(train|prologue|helpers)-/.test(f));
let jsBytes = 0;
const rows = [];
for (const f of [...entry, ...firstZone]) {
  const b = gz(join(DIST, 'assets', f));
  jsBytes += b;
  rows.push([f, b, 'gz']);
}
let modelBytes = 0;
for (const m of FIRST_ZONE_MODELS) {
  const p = join(DIST, 'assets', 'models', m + '.glb');
  const b = existsSync(p) ? statSync(p).size : 0;
  modelBytes += b;
  rows.push([m + '.glb', b, 'raw']);
}
const total = html + jsBytes + modelBytes;
console.log('Critical path for a first visit (train zone):');
console.log(`  ${'index.html'.padEnd(34)}${kb(html)} gz`);
for (const [f, b, k] of rows) console.log(`  ${f.padEnd(34)}${kb(b)} ${k}`);
const check = (name, v, max) => {
  const ok = v <= max;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(8)} ${kb(v)} / ${kb(max)}`);
  return ok;
};
const ok = [check('js', jsBytes, BUDGET.js), check('models', modelBytes, BUDGET.models), check('total', total, BUDGET.total)].every(Boolean);
// characters: size and triangles against their own budget
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
console.log('Characters:');
let modelsOk = true;
for (const [name, [maxKb, maxTris]] of Object.entries(MODEL_BUDGET)) {
  const p = join(DIST, 'assets', 'models', name + '.glb');
  if (!existsSync(p)) continue;
  const bytes = statSync(p).size;
  const doc = await io.read(p);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const prim of m.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  const ok = bytes <= maxKb * 1024 && tris <= maxTris;
  modelsOk &&= ok;
  const atlas = doc.getRoot().listTextures().length ? ' atlas' : '';
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(10)} ${kb(bytes)} / ${maxKb} KB   ${String(tris).padStart(5)} / ${maxTris} tris${atlas}`);
}
// the full asset folder, for information (streams in after Begin)
const all = readdirSync(join(DIST, 'assets', 'models')).reduce((a, f) => a + statSync(join(DIST, 'assets', 'models', f)).size, 0);
console.log(`(all models, streamed later: ${kb(all)})`);
process.exit(ok && modelsOk ? 0 : 1);
