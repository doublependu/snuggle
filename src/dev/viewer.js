// Character viewer (?viewer): every character in a row under the game's lighting, with orbit
// controls, clip / expression pickers, wireframe and silhouette views and a triangle readout.
// Used to review character art (ai/plan_1.md §3.5); lazy-loaded, never on the critical path.
// URL: ?viewer&char=xiaopei&clip=walk&face=happy&cam=front|34|side|back|face|row&t=0.3&quality=high
// Scripted use (Playwright): await window.__viewer.set({ char, clip, face, cam, t }).
import {
  CircleGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Humanoid } from '../actors/humanoid.js';
import { loadCreatures, makeCreature } from '../actors/creatures.js';
import { seatDoudou } from '../actors/player.js';
import { materialFor, shared } from '../render/materials.js';
import { TIERS } from '../core/quality.js';

const CAST = ['xiaopei', 'tangtang', 'weibao', 'fang', 'folk_a', 'folk_b', 'folk_c'];
const CLIPS = ['bind', 'idle', 'walk', 'run', 'air', 'land', 'hum', 'throw', 'talk', 'wave', 'sit', 'overwhelmed', 'celebrate', 'shy', 'puppet', 'stir', 'pat'];
const FACES = ['neutral', 'happy', 'sad', 'surprised', 'sleepy', 'blink', 'talk'];
const SPACING = 1.1;

export async function runViewer() {
  const params = new URLSearchParams(location.search);
  document.getElementById('loading')?.classList.add('gone');
  const tier = TIERS[params.get('quality')] || TIERS.high;
  const canvas = document.getElementById('game');
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = tier.shadows;
  const scene = new Scene();
  scene.background = new Color('#dfe9ea');
  const camera = new PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  // same light rig as Zone.setupEnvironment() defaults
  scene.add(new HemisphereLight('#cfe3ff', '#b89f7a', 1.9));
  const sun = new DirectionalLight('#fff0d8', 2.6);
  sun.position.set(-4, 9, 6);
  sun.castShadow = tier.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const ground = new Mesh(new CircleGeometry(12, 48).rotateX(-Math.PI / 2), materialFor('cloth', { color: 0xb9c79f, vertexColors: false }));
  ground.receiveShadow = true;
  scene.add(ground);

  const names = (params.get('chars') || CAST.join(',')).split(',').filter(Boolean);
  await loadCreatures();
  const chars = {};
  const loaded = await Promise.all(names.map((n) => Humanoid.load(n).catch((e) => (console.warn(n, e), null))));
  loaded.forEach((h, i) => {
    if (!h) return;
    h.root.position.x = (i - (names.length - 1) / 2) * SPACING;
    scene.add(h.root);
    chars[names[i]] = h;
    if (names[i] === 'xiaopei') seatDoudou(h, makeCreature('doudou'));
  });

  const silhouette = new MeshBasicMaterial({ color: 0x000000 });
  const state = { char: params.get('char') || names[0], clip: params.get('clip') || 'idle', face: params.get('face') || 'neutral', cam: params.get('cam') || 'row', t: Number(params.get('t') ?? -1), wire: false, sil: false, spin: false };

  function frame(cam) {
    const h = chars[state.char] || Object.values(chars)[0];
    const p = h.root.position;
    const height = h.height;
    const at = new Vector3(p.x, height * 0.52, p.z);
    const dist = height * 2.45;
    const dirs = { front: [0, 0, 1], 34: [0.62, 0.05, 0.78], side: [1, 0, 0], back: [0, 0, -1], face: [0.18, 0.02, 1] };
    if (cam === 'row') {
      // fit the whole line-up horizontally
      const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
      at.set(0, 0.6, 0);
      camera.position.set(0, 1.1, Math.max(3.5, (names.length * SPACING * 0.5 + 0.5) / Math.tan(hfov / 2)));
    } else if (cam === 'face') {
      at.y = height - h.headRadius;
      camera.position.copy(at).addScaledVector(new Vector3(...dirs.face).normalize(), h.headRadius * 6.5);
    } else {
      camera.position.copy(at).addScaledVector(new Vector3(...(dirs[cam] || dirs.front)).normalize(), dist);
      camera.position.y += height * 0.12;
    }
    controls.target.copy(at);
    camera.lookAt(at);
  }

  function apply() {
    for (const h of Object.values(chars)) {
      if (state.clip === 'bind') {
        h.mixer.stopAllAction();
        h.base = null;
        h.root.traverse((o) => o.isSkinnedMesh && o.skeleton.pose());
      } else {
        h.play(state.clip, 0);
        if (state.t >= 0 && h.base) {
          // frozen frame: no fades (a zero-length fade never completes without time passing)
          for (const a of Object.values(h.actions)) if (a !== h.base) a.stop();
          h.base.stopFading().setEffectiveWeight(1);
          h.base.time = state.t * h.base.getClip().duration;
          h.mixer.update(0);
        }
      }
      if (h.face) {
        h.face.talk(state.face === 'talk');
        if (state.face === 'blink') h.face.set('neutral', { eyes: 'blink', hold: true });
        else if (state.face !== 'talk') h.face.set(state.face, { hold: true });
      }
      for (const m of h.meshes) {
        m.material = state.sil ? silhouette : m.userData.mat || m.material;
        if (!state.sil) m.material.wireframe = state.wire;
      }
    }
    frame(state.cam);
  }
  for (const h of Object.values(chars)) for (const m of h.meshes) m.userData.mat = m.material;

  // ---- panel
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:30;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font:13px system-ui;background:#fbf4e8e6;padding:6px 8px;border-radius:10px;max-width:calc(100vw - 16px)';
  const select = (key, opts) => {
    const s = document.createElement('select');
    for (const o of opts) s.append(new Option(o, o, false, o === state[key]));
    s.onchange = () => ((state[key] = s.value), apply());
    panel.append(s);
  };
  const toggle = (key, label) => {
    const b = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.onchange = () => ((state[key] = c.checked), apply());
    b.append(c, label);
    panel.append(b);
  };
  select('char', Object.keys(chars));
  select('cam', ['row', 'front', '34', 'side', 'back', 'face']);
  select('clip', CLIPS);
  select('face', FACES);
  toggle('wire', 'wire');
  toggle('sil', 'silhouette');
  toggle('spin', 'spin');
  const stats = document.createElement('span');
  panel.append(stats);
  document.body.append(panel);
  if (params.has('clean')) panel.style.display = 'none';

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  apply();

  let last = performance.now();
  let time = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    shared.uTime.value = time;
    const frozen = state.t >= 0 || state.clip === 'bind';
    for (const h of Object.values(chars)) {
      if (!frozen) h.update(dt);
      else h.face?.update(0);
      if (state.spin) h.root.rotation.y += dt * 0.6;
    }
    controls.update();
    renderer.render(scene, camera);
    const r = renderer.info.render;
    const h = chars[state.char];
    stats.textContent = `calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(1)}k  ${state.char} ${(h?.triangles / 1000).toFixed(1)}k`;
  };
  requestAnimationFrame(loop);

  window.__viewer = {
    ready: true,
    chars,
    async set(o) {
      Object.assign(state, o);
      apply();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
  };
}
