// SPDX-License-Identifier: GPL-3.0-only
// The fog of Chapters 4 and 5, shared by the zones under it (the Quiet District overnight, the Old Quarter and
// the square at its heart): the zone's pockets of colour and clear air, kept by everyone who makes one (a
// restored memory, Bean's own circle, a stitched thread, a warm window), and the sounds only these chapters
// make. Loaded only with the zones that use it.
import { Vector3 } from 'three';
import { G } from '../game.js';
import { setPockets } from '../render/materials.js';

// The fog itself: you see about 8 m, and no sky. (Zone.setupEnvironment and materials.js setGreyOut.)
export const FOG_ENV = {
  sky: false, fog: '#b9bec6', fogNear: 1.5, fogFar: 15, hemiSky: '#d6dbe4', hemiGround: '#8a8478', hemi: 1.55,
  sunColor: '#e8e4dc', sunI: 0.7, sun: new Vector3(-0.3, 0.6, -0.5), shadows: false,
};
export const FOG_LOOK = { fade: 0.9, tint: '#e4e7ec', fog: { top: 1.4, falloff: 1.8, strength: 0.5 }, clear: 0.9 };

// The morning after (the Epilogue, and the district ever since): early gold over the roofs, a clear sky.
export const MORNING = {
  skyTop: '#7fb0dc', horizon: '#ffe6c2', ground: '#a8a394', fog: '#f1e3cf', fogNear: 40, fogFar: 190,
  hemiSky: '#ffeccc', hemiGround: '#9a8f7c', hemi: 1.9, sunColor: '#ffd9a0', sunI: 2.5, sun: new Vector3(0.6, 0.42, -0.5),
  skySun: '#ffe0aa', clouds: 9, cloudColor: '#fff3e2', cloudShade: '#e9c9b0', peaks: true, peakColor: '#9fb0bf',
};

// The zone's pockets: [{ position: Vector3, radius }]. Every pixel is tested against the ones handed to the
// shaders, so only those near enough to be seen through the fog go: at most six, nearest first.
export function usePockets(z) {
  if (z.pockets) return z.pockets;
  const list = (z.pockets = []);
  const near = [];
  const d = (a) => a.position.distanceTo(G.player.position) - a.radius;
  z.updaters.push(() => {
    near.length = 0;
    for (const a of list) if (a.radius > 0.02 && d(a) < 42) near.push(a);
    if (near.length > 6) near.sort((a, b) => d(a) - d(b));
    setPockets(near.length > 6 ? near.slice(0, 6) : near);
  });
  return list;
}

// Sounds made straight on the audio engine (core/audio.js keeps only the sounds every zone needs).
export const sfx = {
  // the Great Sulk's sigh setting out, far away: a long low breath
  moan(level = 1) {
    const a = G.audio;
    if (!a.ctx) return;
    a.tone(82, 3.4, { type: 'triangle', gain: 0.07 * level, attack: 1.0, release: 1.6, slide: 0.8, verb: 0.9 });
    a.tone(123, 3.0, { type: 'sine', gain: 0.04 * level, attack: 1.2, release: 1.4, slide: 0.82, verb: 0.9 });
    a.burst(3.2, { freq: 320, q: 0.6, gain: 0.05 * level, sweep: 0.5 });
  },
  // the sigh passing over her: wind, close
  pass(level = 1) {
    const a = G.audio;
    if (!a.ctx) return;
    a.burst(1.8, { freq: 520, q: 0.5, gain: 0.16 * level, sweep: 0.35 });
    a.tone(110, 1.6, { type: 'triangle', gain: 0.05 * level, attack: 0.3, release: 1.0, slide: 0.7, verb: 0.8 });
  },
  // a stitch pulled tight: three plucked notes of the lullaby, rising
  stitch() {
    const a = G.audio;
    if (!a.ctx) return;
    const t = a.ctx.currentTime;
    [587, 740, 880, 1175].forEach((f, i) => a.tone(f, 0.9, { type: 'triangle', gain: 0.07, attack: 0.005, release: 0.7, at: t + i * 0.09, verb: 0.6 }));
  },
  // taking a loose end: a soft pluck
  pluck() {
    G.audio.tone?.(660, 0.5, { type: 'triangle', gain: 0.07, attack: 0.005, release: 0.4, verb: 0.5 });
  },
  // the thread slipping out of her hand
  slip() {
    const a = G.audio;
    if (!a.ctx) return;
    a.tone(520, 0.35, { type: 'triangle', gain: 0.06, slide: 0.5, verb: 0.3 });
    a.burst(0.2, { freq: 1800, q: 1.5, gain: 0.05, sweep: 0.4 });
  },
  bell() {
    const a = G.audio;
    if (!a.ctx) return;
    const t = a.ctx.currentTime;
    for (const [f, g] of [[784, 0.09], [1568, 0.04], [2093, 0.025]]) a.tone(f, 2.6, { gain: g, attack: 0.004, release: 2.3, at: t, verb: 0.8 });
  },
};

// The Lullaby Thread after Bean's secret: golden, and it reaches further (systems/soothe.js range()).
export function brightThread() {
  G.soothe.ribbon.mat.uniforms.color.value.set('#ffd98a');
  G.soothe.ribbon.width = 0.06;
}
