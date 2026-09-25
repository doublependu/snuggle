// SPDX-License-Identifier: GPL-3.0-only
// Boot: loading page → renderer + first zone → Begin (time to interaction) → game loop.
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import css from './ui/ui.css?inline';
import { G, logError } from './game.js';
import { loadSave, writeSave } from './core/save.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Quality, probeTier } from './core/quality.js';
import { trackProgress, prefetch } from './core/assets.js';
import { shared } from './render/materials.js';
import { Glows, Sparkles } from './render/vfx.js';
import { UI } from './ui/ui.js';
import { Menus } from './ui/menus.js';
import { createTouch } from './ui/touch.js';
import { lockZoom } from './ui/zoomlock.js';
import { Humanoid } from './actors/humanoid.js';
import { Player } from './actors/player.js';
import { FollowCamera } from './actors/camera.js';
import { loadCreatures, makeCreature } from './actors/creatures.js';
import { SpriteFollowers } from './actors/sprites.js';
import { Soothe } from './systems/soothe.js';
import { Interact } from './systems/interact.js';
import { Collection } from './systems/collection.js';
import { useAssist } from './systems/assists.js';
// shared by every zone: bundle it with the main chunk to save a round trip
import './world/zone.js';

const ZONES = {
  train: () => import('./world/zones/train.js'),
  station: () => import('./world/zones/station.js'),
  academy: () => import('./world/zones/academy.js'),
  market: () => import('./world/zones/market.js'),
  test: () => import('./world/zones/test.js'),
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (import.meta.env.DEV) window.__G = G; // for tools/e2e and the console; not in production builds

// keep the last errors for the in-game bug report
addEventListener('error', (e) => logError(e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
addEventListener('unhandledrejection', (e) => logError('unhandled: ' + (e.reason?.stack || e.reason)));
const consoleError = console.error.bind(console);
console.error = (...a) => {
  logError(a.map((x) => (x instanceof Error ? x.stack || x.message : String(x))).join(' '));
  consoleError(...a);
};

async function boot() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const save = (G.save = loadSave());
  const tierName = save.settings.quality !== 'auto' ? save.settings.quality : probeTier();
  const canvas = $('game');
  const renderer = new WebGLRenderer({ canvas, antialias: tierName !== 'low', powerPreference: 'high-performance', stencil: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  G.renderer = renderer;
  G.quality = new Quality(renderer, tierName);
  G.quality.auto = save.settings.quality === 'auto';
  G.scene = new Scene();
  G.camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.08, 900);
  G.scene.add(G.camera);
  G.input = new Input(canvas);
  Object.assign(G.input, { sensitivity: save.settings.sensitivity, invertY: save.settings.invertY, humToggle: save.settings.humToggle });
  G.audio = new Audio();
  G.audio.volume = save.settings.volume;
  G.audio.musicVolume = save.settings.music;
  const uiRoot = $('ui');
  G.ui = new UI(uiRoot);
  G.menus = new Menus(uiRoot);
  G.touch = createTouch(uiRoot, G.input);
  lockZoom(document.body);
  watchContext(canvas);
  const setDevice = (d) => document.body.classList.toggle('touch', d === 'touch');
  setDevice(G.input.device);
  G.input.onDevice(setDevice);
  G.ui.pauseBtn.addEventListener('click', () => G.menus.togglePause());
  G.ui.bookBtn.addEventListener('click', () => G.menus.toggleBook());
  G.fx = { sparkles: new Sparkles(Math.round(500 * G.quality.tier.particles) + 60), glows: new Glows(320) };
  G.fx.sparkles.scale = G.quality.tier.particles;
  G.scene.add(G.fx.sparkles.points, G.fx.glows.points);
  G.collection = new Collection();
  G.soothe = new Soothe();
  G.soothe.attach(G.scene);
  G.interact = new Interact();
  G.sprites = new SpriteFollowers();
  G.scene.add(G.sprites.group);
  G.goto = goto;
  addEventListener('resize', onResize);
  onResize();

  const bar = $('progress');
  trackProgress((p) => (bar.style.width = Math.max(3, p * 100).toFixed(1) + '%'));
  const status = $('status');

  const zoneId = ZONES[params.get('zone')] ? params.get('zone') : ZONES[save.zone] ? save.zone : 'train';
  const [, h] = await Promise.all([loadCreatures(), Humanoid.load('xiaopei'), ZONES[zoneId]()]);
  status.textContent = 'Tucking Doudou into the hood…';
  const doudou = makeCreature('doudou');
  G.player = new Player(h, doudou);
  G.player.doudou.userData.eyes = doudou.userData.eyes;
  G.scene.add(G.player.root);
  G.cam = new FollowCamera(G.camera);
  await enterZone(zoneId, params.get('spawn') || save.spawn || 'SPAWN_start');
  status.textContent = 'Ready when you are.';
  G.collection.refreshHud();
  await renderer.compileAsync(G.scene, G.camera);
  renderer.render(G.scene, G.camera);
  const begin = $('begin');
  begin.disabled = false;
  begin.focus({ preventScroll: true });
  window.__snuggle = { readyAt: performance.now(), tier: tierName };
  const start = () => {
    removeEventListener('keydown', onKey);
    begin.removeEventListener('click', start);
    G.audio.unlock();
    G.audio.setVolume(save.settings.volume);
    G.audio.setMusic(save.settings.music);
    $('loading').classList.add('gone');
    G.paused = false;
    if (G.input.device === 'touch') document.documentElement.requestFullscreen?.().catch(() => {});
    G.zone.start?.();
  };
  const onKey = (e) => {
    if (e.code !== 'Tab') start();
  };
  begin.addEventListener('click', start);
  addEventListener('keydown', onKey);
  requestAnimationFrame(frame);
}

async function enterZone(id, spawn) {
  G.fx.glows.clear();
  G.interactables.clear();
  G.updaters.clear();
  G.collection.candyTotal = 0; // zones with lemon candies set their own total
  const mod = await ZONES[id]();
  const zone = await mod.create();
  G.zone = zone;
  G.collision = zone.collision;
  G.scene.add(zone.group);
  const m = zone.marker(spawn) || zone.marker('SPAWN_start') || zone.markersBy('SPAWN_')[0];
  if (m) G.player.teleport(m.position, m.facing);
  G.cam.snapBehind(G.player);
  G.sprites.rebuild();
  if (id !== 'test') {
    G.save.zone = id;
    G.save.spawn = spawn;
    writeSave(G.save);
  }
  prefetch(zone.next || []);
  return zone;
}

// Zone transition with a cozy fade; the next zone is usually already prefetched.
async function goto(id, spawn = 'SPAWN_start') {
  G.frozen = true;
  G.soothe.target = null;
  await G.ui.fade(true);
  G.zone?.dispose();
  G.zone = null;
  const zone = await enterZone(id, spawn);
  await G.renderer.compileAsync(G.scene, G.camera);
  await G.ui.fade(false);
  G.frozen = false;
  zone.start?.();
}

function onResize() {
  G.renderer.setSize(innerWidth, innerHeight);
  G.camera.aspect = innerWidth / innerHeight;
  // widen the view in portrait so the scene stays readable on phones
  G.camera.fov = G.camera.aspect < 1 ? 68 : 55;
  G.camera.updateProjectionMatrix();
  G.quality.applyPixelRatio();
}

let last = performance.now();
let debugT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const ms = now - last;
  last = now;
  const dt = Math.min(ms / 1000, 1 / 20);
  G.quality.sample(ms, now);
  const input = G.input;
  input.update(dt);
  // global shortcuts
  if (input.consume('unlocked') && !G.menus.open && !G.paused && !G.ui.dialogueOpen) G.menus.togglePause();
  if (input.consume('pause') && !G.menus.open) G.menus.togglePause();
  if (input.pressed('book') && !G.menus.open && !G.frozen) {
    input.consume('book');
    G.menus.toggleBook();
  }
  G.menus.update();
  if (!G.paused) {
    if (input.consume('assist') && !G.frozen) useAssist();
    G.time += dt;
    shared.uTime.value = G.time;
    G.player.update(dt);
    G.cam.update(dt, G.player);
    G.zone?.update(dt);
    for (const g of [...G.grumblings]) g.update(dt);
    G.sprites.update(dt);
    G.soothe.update(dt);
    G.interact.update();
    for (const fn of [...G.updaters]) fn(dt);
    G.fx.sparkles.update(dt);
    G.ui.update(dt);
  }
  G.audio.update();
  G.renderer.render(G.scene, G.camera);
  input.endFrame();
  if (G.ui.debugEl && (debugT += dt) > 0.25) {
    debugT = 0;
    const r = G.renderer.info.render;
    G.ui.debugEl.textContent = `${(1000 / G.quality.ema).toFixed(0)} fps  ${G.quality.ema.toFixed(1)} ms\ncalls ${r.calls}  tris ${(r.triangles / 1000).toFixed(1)}k\ntier ${G.quality.name} × ${G.quality.scale.toFixed(2)}  dpr ${G.renderer.getPixelRatio().toFixed(2)}\n${G.zone?.id} ${G.player.position.x.toFixed(1)},${G.player.position.y.toFixed(1)},${G.player.position.z.toFixed(1)}`;
  }
}

// Phones (iOS Safari especially) may discard a background tab and reload it later: save on the way out.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !G.save) return;
  writeSave(G.save);
  if (!G.paused && !G.menus?.open) G.menus?.togglePause();
});
addEventListener('pagehide', () => G.save && writeSave(G.save));

// WebGL context loss (low memory, long in the background): pause, wait for the browser to restore it,
// and if it doesn't come back, save and reload (the save resumes at the last checkpoint).
function watchContext(canvas) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.hidden = true;
  overlay.textContent = 'Waking the lanterns back up…';
  $('ui').append(overlay);
  let timer = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    logError('webgl context lost');
    writeSave(G.save);
    overlay.hidden = false;
    if (!G.paused && !G.menus.open) G.menus.togglePause();
    clearTimeout(timer);
    timer = setTimeout(() => location.reload(), 5000);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(timer);
    overlay.hidden = true;
    G.renderer.compileAsync(G.scene, G.camera).catch(() => {});
  });
}

if (params.has('viewer')) import('./dev/viewer.js').then((m) => m.runViewer()).catch((e) => console.error(e));
else boot().catch((e) => {
  console.error(e);
  const s = $('status');
  if (s) s.textContent = 'Something went wrong while loading. Please refresh. (' + (e?.message || e) + ')';
});
