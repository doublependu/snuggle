// SPDX-License-Identifier: GPL-3.0-only
// Epilogue: Morning in Lantern Bay. "The Great Sulk shrinks into thousands of tiny glowing sprites that
// scatter across the city. Each one is a little reminder to call someone, write back, or say hello. The Quiet
// District's lanterns relight. Master Fang gives Pip her own lumpy cardigan. Sunny declares a week-long
// party. Captain Honk gives a speech. Bean climbs into Pip's hood, curls up, and says: 'Five more minutes.'"
//   1. dawn in the square (the Old Quarter): the sky turns, the Great Sulk goes home, the kitchen fades
//      and its table stays
//   2. the walk back through the Quiet District: colour comes back to the streets as she walks, lanterns
//      relight and shutters go up ahead of her, and the neighbours have carried a table out for breakfast
//   3. on the jetty, Uncle Ming teaches thread fishing (systems/fishing.js): three little reminders that
//      fell short into the water
//   4. Mistbloom, that morning: the cardigan (Pip wears it from here on), the speeches, Bean's five more minutes
//   5. THE END, the credits, and "…but new Grumblings are always being born": free roam (story/freeroam.js)
// Checkpoints: ep_dawn, ep_breakfast, ep_walk, ep_fishing, ep_cardigan, epilogueDone. Loaded after Begin.
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import { G, flag, wait, until } from '../game.js';
import { talk, chat, objective, tween, near } from './helpers.js';
import { writeSave } from '../core/save.js';
import { loadGLB } from '../core/assets.js';
import { createSky } from '../render/sky.js';
import { shared, materialFor } from '../render/materials.js';
import { MORNING, usePockets } from '../systems/fog.js';
import { Bean } from '../systems/bean.js';
import { NPC } from '../actors/npc.js';
import { Humanoid } from '../actors/humanoid.js';
import { SPEAKERS } from '../ui/ui.js';
import { bunting, breakfastTable, seatAt, TABLE } from '../procgen/festive.js';
import { species2 } from '../content/species2.js';

const npc = (id) => G.npcs.get(id);
const save = () => writeSave(G.save);
const ease = (k) => k * k * (3 - 2 * k);
const REPO = 'https://github.com/doublependu/snuggle';
const _a = new Vector3(),
  _b = new Vector3();

// ================================================================ 1. dawn in the square
export async function heart(z) {
  species2(); // (the Great Sulk's entry in the Sprite Book, from here on)
  if (!flag('ep_dawn')) {
    // a reload between the last chapter and the dawn: the square as Chapter 5 left it, which comes back here
    if (!z.ch5) return (await G.later('ch5')).heart(z);
    await dawn(z);
  } else (await G.later('fishing')).setupFishing(z);
  if (G.zone !== z) return;
  objective('Walk back through the Quiet District: the neighbours are opening their doors', 'TRIGGER_quiet');
}

// The little reminders the Great Sulk comes apart into: one cloud of points, each leaving in its own time,
// rising and streaming north over the roofs and across the harbour (one draw call).
function homeward(z, from, count) {
  const pos = new Float32Array(count * 3),
    seed = new Float32Array(count * 3),
    col = new Float32Array(count * 3);
  const palette = ['#ffe2b0', '#bfe3ff', '#ffc9b8', '#fff3b0', '#e6c4ff', '#ffd9a0', '#ffffff'].map((c) => new Color(c));
  for (let i = 0; i < count; i++) {
    // inside its shape: a dome 13 m across and 9 high. The ones near the top leave first.
    const a = Math.random() * 6.283,
      r = Math.sqrt(Math.random()) * 6.2,
      h = Math.random();
    const y = 0.4 + h * 8 * (1 - (r / 6.2) ** 2 * 0.8);
    pos.set([from.x + Math.cos(a) * r, y, from.z + Math.sin(a) * r * 0.85], i * 3);
    seed.set([(1 - y / 8.4) * 4.5 + Math.random() * 2.5, 0.7 + Math.random() * 0.6, Math.random() * 6.283], i * 3);
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  const uT = { value: 0 };
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: 2, // additive
    vertexColors: true,
    toneMapped: false,
    uniforms: { uT, scale: { value: innerHeight * 0.9 } },
    vertexShader: `attribute vec3 aSeed; uniform float uT, scale; varying vec3 vColor; varying float vA;
      void main(){ vColor = color; float t = uT - aSeed.x; float k = max(0.0, t) * aSeed.y; vec3 p = position;
        p.y += k * 1.5 + sin(k * 1.7 + aSeed.z) * 0.5;
        p.z -= k * k * 0.5;
        p.x += sin(k * 0.8 + aSeed.z * 5.0) * (0.5 + k * 0.35);
        vA = t < 0.0 ? 0.0 : smoothstep(0.0, 0.7, t) * (1.0 - smoothstep(10.0, 13.0, k));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.15 + 0.09 * sin(aSeed.z * 9.0 + uT * 5.0)) * scale / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0 || vA <= 0.0) discard;
        float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vColor * a * 1.3, a * vA); }`,
  });
  const points = new Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  z.group.add(points);
  return { points, uT };
}

// The sky goes from grey to gold and the fog thins, over `seconds` (it goes on behind the talking).
function sunrise(z, seconds) {
  const scene = G.scene;
  const fog0 = scene.fog.color.clone(),
    near0 = scene.fog.near,
    far0 = scene.fog.far;
  const fog1 = new Color(MORNING.fog),
    far1 = Math.min(MORNING.fogFar, G.quality.tier.drawDistance * 1.3);
  const hemi = z.hemi,
    sun = z.sunLight;
  const h0 = [hemi.color.clone(), hemi.groundColor.clone(), hemi.intensity],
    h1 = [new Color(MORNING.hemiSky), new Color(MORNING.hemiGround), MORNING.hemi];
  const s0 = [sun.color.clone(), sun.intensity],
    s1 = [new Color(MORNING.sunColor), MORNING.sunI];
  const d0 = z.sun.clone(),
    d1 = MORNING.sun.clone().normalize();
  // the morning's sky, the colour of the fog at first
  const sky = createSky({
    top: MORNING.skyTop, horizon: MORNING.horizon, ground: MORNING.ground, sun: d1, sunColor: MORNING.skySun, clouds: MORNING.clouds,
    cloudColor: MORNING.cloudColor, cloudShade: MORNING.cloudShade, peaks: true, peakColor: MORNING.peakColor,
  });
  const u = sky.userData.skyMaterial.uniforms;
  const to = { top: u.top.value.clone(), horizon: u.horizon.value.clone(), ground: u.ground.value.clone(), sunColor: u.sunColor.value.clone() };
  const far = sky.children.slice(1); // the peaks and the clouds: they come out of the fog later
  for (const o of far) o.visible = false;
  const clouds = sky.userData.clouds?.children || [];
  z.group.add(sky);
  z.sky = sky;
  const fade0 = shared.uFade.value,
    hf0 = shared.uHFog.value.w,
    lamp0 = shared.uLampOn.value;
  return tween(seconds, (k) => {
    const e = ease(k);
    scene.fog.color.lerpColors(fog0, fog1, e);
    scene.background.copy(scene.fog.color);
    scene.fog.near = near0 + (MORNING.fogNear - near0) * e * e;
    scene.fog.far = far0 + (far1 - far0) * e * e;
    for (const key of ['top', 'horizon', 'ground']) u[key].value.lerpColors(fog0, to[key], e);
    u.sunColor.value.copy(to.sunColor).multiplyScalar(e);
    hemi.color.lerpColors(h0[0], h1[0], e);
    hemi.groundColor.lerpColors(h0[1], h1[1], e);
    hemi.intensity = h0[2] + (h1[2] - h0[2]) * e;
    sun.color.lerpColors(s0[0], s1[0], e);
    sun.intensity = s0[1] + (s1[1] - s0[1]) * e;
    z.sun.lerpVectors(d0, d1, e).normalize();
    // colour comes back to everything, and the fog along the ground lifts
    shared.uFade.value = fade0 * (1 - e);
    shared.uHFog.value.w = hf0 * (1 - e);
    shared.uLampOn.value = lamp0 + (0.55 - lamp0) * e;
    if (e > 0.5) for (const o of far) o.visible = true;
    for (const c of clouds) c.material.opacity = 0.95 * Math.max(0, (e - 0.5) * 2);
  });
}

async function dawn(z) {
  const p = G.player,
    C = z.ch5,
    sulk = z.sulk,
    quilt = C.quilt;
  const tt = npc('tangtang'),
    wb = npc('weibao'),
    fang = npc('fang');
  const M = (name) => z.marker(name).position;
  const at = sulk.position.clone();
  G.frozen = true;
  objective('');
  await wait(1.2);
  await G.ui.card('Epilogue', 'Morning in Lantern Bay', 3);
  G.frozen = true;
  // everyone stands between the fountain and the Great Sulk, and watches
  z.sighs.dispose();
  const stand = (n, x, zz) => {
    n.follow(null);
    n.walkTarget = null;
    n.place(new Vector3(x, 0, zz), 0, z.collision);
  };
  p.teleport(new Vector3(at.x, 0, at.z - 8.2), 0);
  p.setState('move');
  stand(tt, at.x + 1.7, at.z - 8.6);
  stand(wb, at.x - 1.7, at.z - 8.5);
  stand(fang, at.x - 3.5, at.z - 7.9);
  if (fang.hidden) fang.hide(false);
  G.cam.setShot(M('CAM_dawn'), at.clone().setY(3.4), 2.4);
  G.audio.mix('morning');
  const rise = sunrise(z, 16);
  await talk([
    [null, 'The night ends. Over the roofs of the Old Quarter, for the first time in fifty years, the sky begins to turn.'],
    ['doudou', 'Look. It’s letting go.'],
  ]);
  G.frozen = true;
  // it comes apart into its little reminders; the blanket sinks as it goes
  const cloud = homeward(z, at, { low: 800, medium: 2000, high: 4000 }[G.quality.name] || 2000);
  const cover = quilt.cover;
  let sink = 1,
    fold = 0;
  const foldAt = at.clone().add(new Vector3(0, 0, -2.6));
  quilt.settle((x, zz, out) => {
    cover(x, zz, out);
    out.y = 0.12 + (out.y - 0.12) * sink;
    // folded: a neat square of patchwork where its head lay
    if (fold > 0) out.lerp(_a.set(foldAt.x + x * 0.09, 0.12 + (Math.abs(x) + Math.abs(zz)) * 0.006, foldAt.z + zz * 0.09), fold);
    return out;
  });
  let moving = true;
  const tick = (dt) => {
    cloud.uT.value += dt;
    if (moving) quilt.done = false;
  };
  z.updaters.push(tick);
  // the sprites that sat on its patches go back to their lantern posts
  for (const [sp, sw] of Object.entries(C.swarms)) {
    sw.at.copy(M('POINT_post_' + sp));
    sw.high = 3.1;
    sw.r = 1.6;
  }
  G.audio.play('chime');
  G.cam.setShot(M('CAM_sulk').clone().add(new Vector3(-5, 2.5, -5)), at.clone().setY(4.5), 4);
  await tween(7.5, (k) => {
    sink = 1 - ease(k);
    sulk.size = Math.max(0.001, sink);
    if (Math.random() < 0.3) G.fx.sparkles.emit(_b.copy(at).setY(1 + sink * 6), 2, '#ffe9c4', { speed: 2.4, up: 1.5, size: 0.2, life: 1.8, spread: 5 * sink + 1 });
  });
  sulk.obj.visible = false;
  // the threads that ran from its patches to the lantern posts have nothing left to hold
  for (const sp of Object.keys(C.swarms)) z.stitch?.remove('patch_' + sp);
  for (const sp of ['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey']) z.stitch?.remove('patch_' + sp);
  // where it sat is open ground again
  const wall = z.collision.parts.indexOf(z.sulkWall);
  if (wall >= 0) z.collision.parts.splice(wall, 1);
  z.collision.build();
  await talk([
    [null, 'Under the Everyone Blanket the Great Sulk grows smaller, and lighter, and comes apart into thousands of tiny glowing sprites: every forgotten birthday, every unanswered letter, every “I’m fine, really.”'],
    [null, 'They rise over the square and stream north, over the roofs and across the harbour. Each one is a little reminder, on its way home to somebody: call your sister. Write back. Say hello.'],
  ]);
  G.frozen = true;
  // watch them go
  G.cam.setShot(new Vector3(at.x + 6, 3.2, at.z - 2), new Vector3(at.x - 2, 16, at.z - 60), 3.5);
  G.audio.play('sparkle');
  await wait(5.5);
  // the kitchen was only for as long as it was needed; its table would like to stay
  G.cam.setShot(M('CAM_domain').clone(), M('POINT_domain').clone().setY(1.2), 2.5);
  await wait(1.5);
  const table = z.group.getObjectByName('DOMAIN_table');
  if (table) table.material = materialFor('mixed', { fade: 1 });
  const d = shared.uDomain.value,
    r0 = d.w;
  if (C.fire != null) G.fx.glows.set(C.fire, M('POINT_domain'), null, 0);
  G.audio.play('relight');
  await tween(4.5, (k) => {
    const r = r0 * (1 - ease(k));
    d.w = r;
    if (C.domainWarm) C.domainWarm.radius = r;
    if (C.domainAir) C.domainAir.radius = r > 0.5 ? r + 3 + r * 0.45 : 0.01;
  });
  await talk([
    ['fang', 'There. A kitchen is only for as long as somebody needs it.'],
    ['fang', '…The table would like to stay, I think. Tables do.'],
  ]);
  G.frozen = true;
  // the blanket, folded
  G.cam.setShot(foldAt.clone().add(new Vector3(3.4, 2.6, -4.6)), foldAt.clone().setY(0.5), 2.5);
  fang.place(foldAt.clone().add(new Vector3(-1.9, 0, -0.6)), Math.PI / 2, z.collision);
  await tween(3.2, (k) => (fold = ease(k)));
  moving = false;
  await rise;
  await talk([
    [null, 'Master Fang stands for a while, looking at the folded blanket.'],
    ['fang', 'Fifty years. And you did it before breakfast.'],
    ['tangtang', 'BREAKFAST. Pip! I haven’t baked anything in an HOUR.', { face: 'surprised' }],
    ['honk', 'CAPTAIN HONK SAW THE WHOLE THING. CAPTAIN HONK HAD HIS EYES SHUT. HONK.'],
    ['weibao', '…they all knew the way home. Did you see? Every one of them.'],
    ['doudou', 'Not every one. Some fell short. Too soggy to fly. Somebody will have to fish them out.'],
    ['xiaopei', 'Bean. You’re still awake.', { face: 'smile' }],
    ['doudou', 'Don’t make a thing of it.'],
    ['fang', 'Go on ahead, dears: the district will want to see who did this. I’ll hang the blanket over the square. A table wants a roof.'],
    ['fang', 'And come and find me at home afterwards, Pip. I have something for you.'],
  ]);
  flag('ep_dawn', true);
  G.save.spawn = 'SPAWN_square';
  save();
  z.stepFx = '#d6c6a4';
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  tt.follow({ x: 1.3, z: 0.6 });
  wb.follow({ x: -1.3, z: 0.9 });
  tt.onTalk = () => talk([['tangtang', 'I can see the SKY. Has there always been this much of it?']]);
  wb.onTalk = () => talk([['honk', 'THE FOG HAS GONE. CAPTAIN HONK CHASED IT OFF. HONK.']]);
  fang.onTalk = () => talk([['fang', 'Go on, dear. I’ll be home before you are: I know a shortcut. I have known it for fifty years.']]);
}

// ================================================================ 2. the walk back, and 3. the jetty

export async function quiet(z) {
  const p = G.player,
    tt = npc('tangtang'),
    wb = npc('weibao');
  species2();
  const { setupFishing } = await G.later('fishing');
  if (G.zone !== z) return;
  const fishing = setupFishing(z);
  new Bean(z, { circle: false }).climbOut();
  for (const [id, name] of [['noodle', 'Noodle auntie'], ['barber', 'The barber'], ['oldman', 'Old Mr Lau']]) SPEAKERS[id] ||= [name, '#6a7fa0'];
  for (const [n, slot] of [[tt, { x: 1.3, z: 0.6 }], [wb, { x: -1.3, z: 0.9 }]]) {
    if (!n) continue;
    n.place(p.position.clone().add(new Vector3(slot.x, 0, 1.2)), p.facing, z.collision);
    n.follow(slot);
  }
  if (tt) tt.onTalk = () => talk([['tangtang', flag('ep_breakfast') ? 'I got the noodle recipe. It’s mostly “a bit” and “until it looks right”. My favourite kind!' : 'Do you smell that? Somebody is cooking. In the QUIET District!']]);
  if (wb) wb.onTalk = () => talk([['honk', 'EVERY DOOR IS OPEN. CAPTAIN HONK HAS COUNTED THEM. THERE ARE SEVERAL. HONK.']]);
  breakfastTable(z);
  await z.streamed;
  if (G.zone !== z) return;
  const friend = await atBreakfast(z);
  if (G.zone !== z) return;
  // Uncle Ming, off the first ferry in fifty years
  SPEAKERS.ming = ['Uncle Ming', '#4a6a8a'];
  const mingAt = new Vector3(1.15, 0.1, -29.7);
  const ming = await NPC.create('ming', 'folk_a', mingAt, -Math.PI / 2, {});
  if (G.zone !== z) return ming.dispose();
  z.addNPC(ming);
  ming.place(mingAt, -Math.PI / 2, z.collision);
  ming.onTalk = () =>
    talk(
      flag('ep_fishing')
        ? [['ming', 'Wherever the water glints, cast. And come and find me at the station: I’ll have things to ask you for.']]
        : [['ming', 'Eat first. Nobody fishes well on an empty stomach, and I can smell those noodles from here.']],
    );

  const refresh = () =>
    !flag('ep_breakfast')
      ? objective('Breakfast in the street: sit down with the neighbours', new Vector3(TABLE.x + 0.9, 0, TABLE.z))
      : !flag('ep_fishing')
        ? objective('Someone is fishing at the end of the ferry jetty', 'ming')
        : objective('Take the ferry home to Mistbloom Academy: Master Fang has something for you', 'ferryman');
  refresh();
  if (!flag('ep_walk')) colourReturns(z);
  if (!flag('ep_breakfast')) {
    await breakfast(z, friend);
    refresh();
  }
  if (!flag('ep_fishing')) {
    let go = false;
    ming.onTalk = () => (go = true);
    await until(() => go && !G.frozen);
    await lesson(z, fishing, ming);
    refresh();
  }
}

// Colour comes back to the streets as she walks: one pocket of colour that only grows, centred on the gateway
// she came in by. Lanterns relight and shutters go up just ahead of it. Once she reaches the ferry plaza the
// whole district is in colour for good (ep_walk).
function colourReturns(z) {
  const p = G.player;
  const from = new Vector3(0, 0, 39);
  const pocket = { position: from, radius: Math.max(9, p.position.distanceTo(from) + 6) };
  usePockets(z).push(pocket);
  let reach = 0,
    t = 0,
    done = false;
  const shut = Object.entries(z.shutters).map(([id, o]) => [id, o.getWorldPosition(new Vector3())]);
  const light = (all) => {
    const edge = pocket.radius + 5;
    let lit = 0;
    for (const m of [...z.lightsLeft]) {
      if (!all && m.position.distanceTo(from) > edge) continue;
      z.lightsLeft.splice(z.lightsLeft.indexOf(m), 1);
      z.lampList.push(z.lampOf(m));
      z.lightGlow(m);
      if (!all) G.fx.sparkles.emit(m.position, 6, m.data.color || '#ffb45c', { speed: 0.6, up: 0.4, size: 0.14, life: 1 });
      lit++;
    }
    if (lit) {
      z.relight();
      if (!all) G.audio.play('relight');
    }
    for (const [id, at] of shut) if (all || at.distanceTo(from) < edge) z.liftShutter(id);
    // and every shuttered shopfront along the lane opens
    for (const s of z.shops || []) {
      if (s.opened || (!all && s.at.distanceTo(from) > edge)) continue;
      s.opened = true;
      s.open();
      if (!all) G.fx.sparkles.emit(s.at.clone().setY(1.6), 10, '#ffe2a8', { speed: 0.9, up: 0.8, size: 0.14, life: 1.1, spread: 1.6 });
    }
  };
  z.updaters.push((dt) => {
    if (done) return;
    reach = Math.max(reach, p.position.distanceTo(from));
    const want = flag('ep_walk') ? 140 : reach + 10;
    pocket.radius += (want - pocket.radius) * Math.min(1, dt * 1.4);
    if ((t -= dt) < 0) {
      t = 0.45;
      light(false);
    }
    if (!flag('ep_walk') && p.position.z < -11 && !G.frozen) {
      flag('ep_walk', true);
      save();
      light(true);
      z.signs?.redraw();
      G.audio.play('chime');
      G.ui.toast('🏮 Every lantern in the Quiet District is lit. It isn’t very quiet any more.', 4.5);
    }
    // once the colour has reached everything, the grey is simply gone
    if (flag('ep_walk') && pocket.radius > 120) {
      done = true;
      tween(1.5, (k) => (shared.uFade.value *= 1 - k));
    }
  });
}

// On the morning itself the neighbours are at the table: the barber, old Mr Lau and a mahjong friend he
// hasn't seen in years, the noodle auntie standing over her pot.
async function atBreakfast(z) {
  if (flag('ep_fishing')) return null; // (afterwards they are back at their own doors)
  const sit = (n, i, side) => {
    if (!n) return;
    const s = seatAt(i, side);
    n.sitOn(0.45, s.front, s.facing);
    n.interactable.radius = 1.7;
  };
  sit(npc('barber'), 0, 1);
  sit(npc('oldman'), 2, 1);
  const noodle = npc('noodle');
  if (noodle) noodle.place(new Vector3(TABLE.x + 0.2, 0, TABLE.z + TABLE.len / 2 + 0.75), Math.PI, z.collision);
  SPEAKERS.laufriend = ['Old friend', '#7b6aa0'];
  const friend = await NPC.create('laufriend', 'folk_c', new Vector3(), 0, { look: false });
  if (G.zone !== z) return void friend.dispose();
  z.addNPC(friend);
  sit(friend, 2, -1);
  friend.onTalk = () => talk([['laufriend', 'Fifty years I walked the long way round this lane. This morning I just… didn’t.']]);
  return friend;
}

async function breakfast(z) {
  const p = G.player;
  const s = seatAt(0, -1);
  let go = false;
  const it = z.addInteractable({ position: s.front, radius: 2.4, priority: 2.5, label: 'Sit down to breakfast', action: () => (go = true) });
  await until(() => go && !G.frozen && p.state === 'move');
  G.interactables.delete(it);
  G.frozen = true;
  p.sitOn(s.front, s.facing, 0.45);
  // (from the middle of the lane: the walls are close on both sides)
  G.cam.setShot(new Vector3(TABLE.x + 3.3, 2.5, TABLE.z - 3.7), new Vector3(TABLE.x - 0.2, 0.9, TABLE.z + 0.4), 1.4);
  const kind = (id) => flag('kind_' + id);
  await talk([
    [null, 'A long table has been carried out into the lane. There is one pot of noodles on it, and it is not a small pot.'],
    ['noodle', kind('noodle') ? 'You! You’re the one who knocked. Sit, sit. I said a small pot, in case. Then I made the big one, in case of you.' : 'Sit, sit, whoever you are! I said a small pot, in case. Then I looked out of the window and made the big one.'],
    ['barber', kind('barber') ? 'I told you I’d remembered their names. This morning three of them walked past my window, and I shouted every one. They came in for a trim out of sheer surprise.' : 'Fifty years of sweeping an empty step, and this morning there was somebody standing on it. I very nearly swept him.'],
    ['oldman', kind('oldman') ? 'You remembered my name at the mahjong table, young one. Look who else did.' : 'Lau. That is me. And look who has turned up this morning, asking for me.'],
    ['laufriend', 'Lau, you still owe me four tiles and an apology from the summer the fog came. Your turn. You always take so long.'],
    ['tangtang', 'These noodles are INCREDIBLE. Auntie, what’s in the broth? Don’t tell me. Tell me. Write it down.', { face: 'happy' }],
    ['honk', 'CAPTAIN HONK HAS BEEN GIVEN A BOWL. CAPTAIN HONK HAS NO STOMACH. IT IS THE THOUGHT. HONK.'],
    ['doudou', 'Eat. It’s a long way home, and I’m not carrying you.'],
  ]);
  G.audio.play('thanks');
  G.collection.cozy(8, 'Breakfast with the neighbours', p.position.clone().setY(p.position.y + 1.5));
  flag('ep_breakfast', true);
  G.save.spawn = 'SPAWN_breakfast';
  save();
  p.stand(new Vector3(TABLE.x - 1.6, 0, s.front.z));
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
}

// Uncle Ming teaches thread fishing: three little reminders, too waterlogged to fly, and the last is her own.
async function lesson(z, fishing, ming) {
  const p = G.player;
  const spot = fishing.spots.find((s) => s.id === 'jetty');
  G.frozen = true;
  await talk([
    ['ming', 'Nobody’s fished this jetty since I was a boy. Fifty years I’ve had to look at this water from the wrong side of it.'],
    ['ming', 'Uncle Ming. I do the fishing at the station. Your Master Fang sent word across: somebody young, with a thread.'],
    ['doudou', 'There. In the water. Those are the ones that fell short.'],
    [null, 'A few little reminders bob in the water under the jetty, glowing faintly, too waterlogged to fly.'],
    ['ming', 'You don’t need a rod, with a thread like that. Cast it as if you mean it, hum as if you don’t, and never pull while it’s pulling.'],
  ]);
  let n = 0;
  const said = [
    [['ming', 'That’s it! Let it go where it’s going.']],
    [['ming', 'Ease off when it tugs. There. You’ve done this before, with smaller sulks.']],
    [['doudou', '…that one’s yours.'], ['xiaopei', 'I’ll write tonight.']],
  ];
  await fishing.open(spot, {
    queue: ['reminder:Call your sister.', 'reminder:Say: actually, I’m not fine. Can we talk?', 'reminder:Write to Mum. Tell her you made friends.'],
    stay: true,
    until: () => n >= 3,
    onCatch: async () => {
      await chat(said[n++] || []);
    },
  });
  G.frozen = true;
  await talk([
    ['ming', 'Three home, and the water’s the better for it.'],
    ['ming', 'There’ll be more of those, all round the bay. And fish. And everything this town ever dropped in the water and was too sad to go looking for.'],
    ['ming', 'Wherever the water glints, cast. And come and find me at the station: I’ll have things to ask you for.'],
  ]);
  flag('ep_fishing', true);
  G.save.spawn = 'SPAWN_jetty';
  save();
  G.ui.toast('🧵 <b>Thread fishing:</b> cast wherever the water glints. What you catch is kept in the Sprite Book.', 6);
  G.frozen = false;
  ming.onTalk = () => talk([['ming', 'Wherever the water glints, cast. And come and find me at the station: I’ll have things to ask you for.']]);
}

// ================================================================ 4. Mistbloom, that morning
export async function academy(z) {
  const p = G.player,
    fang = npc('fang'),
    wb = npc('weibao');
  z.group.add(bunting(z));
  species2();
  const { setupFishing } = await G.later('fishing');
  if (G.zone !== z) return;
  setupFishing(z);
  const bean = new Bean(z, { circle: false });
  if (!flag('ep_cardigan')) {
    bean.climbOut();
    if (!flag('ep_fishing')) {
      // home early: somebody is still waiting across the water
      objective('Someone is fishing at the end of the ferry jetty, in the Quiet District', 'weibao');
      fang.onTalk = () => talk([['fang', 'Not yet, dear. Somebody is waiting for you on the jetty across the water, and he is not a patient man. He only looks like one.']]);
      return;
    }
    objective('Master Fang is waiting at her pavilion', 'fang');
    fang.onTalk = null;
    await until(() => near(fang.position, 4.4) && !G.frozen && p.state === 'move');
    await ceremony(z, bean);
  }
  if (!flag('epilogueDone')) await theEnd(z);
  if (G.zone !== z) return;
  (await G.later('free')).academy(z, wb);
}

// Pip puts on the cardigan: the same Pip in another coat (tools/blender/char_xiaopei_cardigan.py), so only
// the picture her model is painted with changes.
async function wearCardigan() {
  const gltf = await loadGLB('xiaopei_cardigan');
  let map = null;
  gltf.scene.traverse((o) => (map ||= o.isSkinnedMesh && o.material.map));
  if (!map) return;
  for (const m of G.player.h.meshes) if (m.material.map) m.material.map = map;
}

async function ceremony(z, bean) {
  const p = G.player,
    fang = npc('fang'),
    tt = npc('tangtang'),
    wb = npc('weibao');
  G.frozen = true;
  objective('');
  const front = fang.position.clone().add(new Vector3(Math.sin(fang.homeFacing), 0, Math.cos(fang.homeFacing)).multiplyScalar(1.5));
  p.teleport(front, fang.homeFacing + Math.PI);
  // from the courtyard, over everyone's shoulders, at Pip in the pavilion's doorway
  const out = fang.position.clone().sub(front).setY(0).normalize(); // from the pavilion toward the courtyard
  const side = new Vector3(out.z, 0, -out.x);
  for (const [n, k] of [[tt, 1], [wb, -1]]) n?.place(fang.position.clone().addScaledVector(out, 2.1).addScaledVector(side, 2.6 * k), fang.homeFacing, z.collision);
  G.cam.setShot(fang.position.clone().addScaledVector(out, 6.4).addScaledVector(side, 1.4).setY(fang.position.y + 2.6), fang.position.clone().lerp(p.position, 0.6).setY(p.position.y + 0.8), 1.6);
  const wearing = wearCardigan(); // (loads while she talks)
  await talk([
    ['fang', 'There she is. Stand still, dear: this is a ceremony. A small one. I dislike the large kind.'],
    ['fang', 'When I was your age, somebody gave me a cardigan much too big for me and said: you’ll grow into it.'],
    ['fang', 'It took me fifty years and one morning. You were quicker.'],
    [null, 'Master Fang holds out a cardigan like her own: orange, chunky, a little lumpy, knitted by somebody who talks while she knits.'],
    ['fang', 'With extra-deep pockets. For Grumblings, and sweets.'],
  ]);
  G.frozen = true;
  await G.ui.fade(true);
  await wearing.catch((e) => console.error(e));
  flag('ep_cardigan', true);
  G.save.spawn = 'SPAWN_gate';
  save();
  await G.ui.fade(false);
  G.audio.play('combo');
  G.fx.sparkles.emit(p.position.clone().setY(p.position.y + 0.8), 30, '#ffb45c', { speed: 1.4, up: 1.2, size: 0.14, life: 1.4 });
  p.h.play('celebrate', 0.3);
  p.setState('pose');
  await talk([
    ['xiaopei', 'It fits. …It has a lemon candy in the pocket already.', { face: 'happy' }],
    ['fang', 'It has four. Don’t tell Sunny.'],
    ['tangtang', 'I HEARD THAT. And I don’t even mind, because I DECLARE A PARTY! A week-long party! A different tart every day, and TWO on the last day!', { face: 'happy' }],
    ['honk', 'CAPTAIN HONK WILL NOW GIVE A SPEECH. HONK.'],
    ['honk', 'FRIENDS. SORCERERS. SPRITES. WE WENT INTO THE FOG. WE CAME OUT WITH EVERYBODY. THAT IS THE WHOLE SPEECH. HONK.'],
    [null, 'Bo lowers the puppet.'],
    ['weibao', 'I’d like to say something too. Me, I mean. Not the goose.'],
    ['weibao', 'When I came here I thought being quiet meant I had nothing to say. It turns out I was only waiting for people who would wait for me.'],
    ['weibao', 'So. Thank you for waiting. I’m Bo. It’s nice to meet you properly.'],
    ['honk', '…HONK.'],
    ['tangtang', 'BO. That was four WHOLE sentences! I’m going to cry into a tart!', { face: 'happy' }],
  ]);
  G.frozen = true;
  p.setState('move');
  p.h.play('idle', 0.4);
  await talk([
    ['doudou', 'Good speech. Good blanket. Good morning.'],
    [null, 'Bean climbs down into the hood of the new cardigan, turns round twice, and curls up.'],
  ]);
  bean.tuckIn();
  G.audio.play('yawn');
  await talk([['doudou', 'Five more minutes.']]);
  G.frozen = true;
  save();
  tt?.h.face?.set('neutral');
  wb?.h.face?.set('neutral');
}

// THE END, and the credits: what she did, who made it, and where to take it from here.
async function theEnd(z) {
  const s = G.save,
    f = s.story;
  G.frozen = true;
  G.cam.setShot(G.camera.position.clone().add(new Vector3(0, 2.2, 0)), G.player.position.clone().setY(G.player.position.y + 4), 6);
  await wait(1.6);
  await G.ui.card('The End', 'Snuggle Sorcery', 3.6);
  const count = (re) => Object.keys(f).filter((k) => re.test(k) && f[k]).length;
  const rows = [
    ['✨ Charm Sprites befriended', Object.values(s.sprites).reduce((a, b) => a + b, 0)],
    ['🕯️ Memories restored', count(/^mem_/)],
    ['🚪 Neighbours checked on', count(/^kind_(barber|noodle|oldman)$/)],
    ['🧵 Loose ends stitched back', count(/^stitch_/)],
    ['💛 Kind things done along the way', count(/^kind_|^kid\dHome$|^note_/)],
    ['🍬 Lemon candies found', Object.keys(s.candies).length],
  ];
  const el = document.createElement('div');
  el.className = 'card show credits';
  el.style.cssText = 'pointer-events:auto;overflow:auto;place-items:start center;padding:6vh 16px';
  el.innerHTML = `<div style="max-width:520px"><h2 style="font-size:clamp(24px,5vw,40px)">Snuggle Sorcery</h2><p>A cozy story about noticing people.</p>
    <table style="margin:18px auto;text-align:left;font-size:calc(15px * var(--ts,1));border-spacing:10px 4px">${rows.map(([a, b]) => `<tr><td>${a}</td><td style="text-align:right;font-weight:800">${b}</td></tr>`).join('')}</table>
    <p style="font-style:normal">Story, world, characters, music and code: made in the open, in code and Blender scripts.<br>Built with three.js and three-mesh-bvh, on a CC0 character base mesh. No trackers, no ads, no account.</p>
    <p style="font-style:normal">Free software under the GNU GPL v3.<br><a href="${REPO}" target="_blank" rel="noopener" style="color:#ffd98a;font-weight:800">Fork me on GitHub</a> and make your own cozy game.</p>
    <p>Thank you for playing. Go and call someone.</p>
    <button class="btn" style="margin-top:14px">…but new Grumblings are always being born</button></div>`;
  G.ui.root.append(el);
  G.events.emit('credits');
  await new Promise((res) => {
    const done = () => {
      G.updaters.delete(tick);
      res();
    };
    el.querySelector('button').addEventListener('click', done);
    let t = 0;
    const tick = (dt) => {
      // (a key or a button, once it has been up long enough to read)
      const i = G.input;
      const press = i.consume('interact') || i.consume('jump') || i.consume('hum');
      if ((t += dt) > 2.5 && press) done();
    };
    G.updaters.add(tick);
  });
  el.remove();
  G.audio.play('blip');
  flag('epilogueDone', true);
  save();
  await G.ui.card('Lantern Bay', '…but new Grumblings are always being born.', 3.2);
  G.cam.clearShot();
  G.cam.snapBehind(G.player);
  G.frozen = false;
}
