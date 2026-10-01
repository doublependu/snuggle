// SPDX-License-Identifier: GPL-3.0-only
// Prologue zone: the Rainy Train carriage. The world slides past the windows; rain falls outside.
import { Vector3 } from 'three';
import { G } from '../../game.js';
import { Zone } from '../zone.js';
import { Rain } from '../../render/vfx.js';
import { trainScenery } from '../../procgen/scenery.js';
import { prologueTrain } from '../../story/prologue.js';

export async function create() {
  const z = new Zone('train');
  z.next = ['station', 'kit', 'tangtang'];
  await z.addGLB('train', { castShadows: false });
  await z.populateNPCs();
  z.setupEnvironment({
    skyTop: '#8c9fb0', horizon: '#c9d3d8', ground: '#6d7f6a', fog: '#bac6cc', fogNear: 25, fogFar: 170,
    hemiSky: '#fff3e0', hemiGround: '#9a7250', hemi: 2.4, sunColor: '#fff4e6', sunI: 1.3, sun: new Vector3(0.15, 1, 0.1),
    clouds: 14, cloudColor: '#e3e8ec', cloudShade: '#8e9aa6', peakColor: '#7e8e98',
  });
  z.updaters.push(trainScenery(z.group, { density: G.quality.tier.foliage }));
  const streaks = [-1, 1].map((side) => {
    const r = new Rain({ count: Math.round(420 * G.quality.tier.particles) + 60, size: new Vector3(44, 9, 9), speed: 12, length: 0.5, wrap: false, opacity: 0.38 });
    r.center.set(0, 5.5, side * 6.3);
    z.group.add(r.mesh);
    return r;
  });
  // warm ceiling lamps
  for (let i = 0; i < 7; i++) G.fx.glows.add(new Vector3(-8 + (i + 0.5) * (16 / 7), 2.4, 0), '#ffcf86', 0.9);
  // dormant until the story points it out (story/prologue.js); stays inside the carriage (AREA_cloud)
  z.cloud = z.grumblingAt('GRUMB_cloud', { enabled: false });
  z.collision.build();
  z.killY = -4;
  G.audio.mix('train');
  // once the cloud is asleep the rain outside eases to a drizzle, to hear and to see (the station carries on
  // from there: "The rain softens to a drizzle as the train pulls into Lantern Bay")
  const ease = (seconds) => {
    G.audio.bed('rainOut', 0.22, seconds);
    let t = 0;
    z.updaters.push((dt) => {
      if (t >= 1) return;
      t = Math.min(1, t + dt / Math.max(0.01, seconds));
      for (const r of streaks) r.mat.uniforms.opacity.value = 0.38 - 0.22 * t;
    });
  };
  if (!z.cloud) ease(0);
  else z.on('soothed', (g) => g === z.cloud && ease(4));
  z.start = () => prologueTrain(z);
  return z;
}
