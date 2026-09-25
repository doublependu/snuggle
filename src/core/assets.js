// SPDX-License-Identifier: GPL-3.0-only
// GLB loading with meshopt decoding, caching, progress aggregation and idle-time prefetch.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = './assets/models/';
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map();
const progress = new Map(); // name -> [loaded, total]
let onProgress = null;

export function trackProgress(fn) {
  onProgress = fn;
}

function report() {
  if (!onProgress) return;
  let l = 0,
    t = 0;
  for (const [a, b] of progress.values()) {
    l += a;
    t += b || a || 1;
  }
  onProgress(t ? l / t : 0);
}

export function loadGLB(name) {
  let p = cache.get(name);
  if (p) return p;
  progress.set(name, [0, 0]);
  p = loader
    .loadAsync(BASE + name + '.glb', (e) => {
      progress.set(name, [e.loaded, e.total || e.loaded]);
      report();
    })
    .then((gltf) => {
      const [, t] = progress.get(name) || [1, 1];
      progress.set(name, [t || 1, t || 1]);
      report();
      return gltf;
    });
  cache.set(name, p);
  return p;
}

// Load a list of models one at a time when the main thread is idle.
export function prefetch(names) {
  const queue = names.filter((n) => !cache.has(n));
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const next = () => {
    const n = queue.shift();
    if (!n) return;
    idle(() => loadGLB(n).catch(() => cache.delete(n)).finally(next), { timeout: 1500 });
  };
  next();
}

export function isLoaded(name) {
  return cache.has(name);
}

// Find nodes by name prefix inside a loaded glTF scene.
export function nodesByPrefix(root, prefix) {
  const out = [];
  root.traverse((o) => {
    if (o.name.startsWith(prefix)) out.push(o);
  });
  return out;
}
