// SPDX-License-Identifier: GPL-3.0-only
// Chapters 4 and 5 zone: the Old Quarter and the square at the heart of the Quiet District, south of the fog
// wall (tools/blender/build_heart.py). Under the fog you see about 8 m; the Great Sulk's sighs roll up the
// streets from the south (systems/sigh.js); Bean is awake, with his circle of colour (systems/bean.js); the
// sleepers of laundry alley want company, not hugs (systems/greys.js); and after Bean's secret the Lullaby
// Thread can stitch loose ends back where they belong (systems/stitch.js), each stitch lighting its stretch
// of street for good. In the square sits the Great Sulk (systems/sulk.js), and there Master Fang opens
// Grandmother's Kitchen (the DOMAIN_ scenery, render/materials.js uDomain). After the Epilogue the fog is
// gone, every lantern is lit, and the kitchen's long table has stayed in the square.
import { CylinderGeometry, Mesh, Vector3 } from 'three';
import { G, flag } from '../../game.js';
import { loadGLB } from '../../core/assets.js';
import { Zone } from '../zone.js';
import { setGreyOut, shared } from '../../render/materials.js';
import { makeWater } from '../../render/water.js';
import { CreatureBatch } from '../../actors/creatures.js';
import { noteSign } from '../../procgen/props.js';
import { Greys } from '../../systems/greys.js';
import { FOG_ENV, FOG_LOOK, MORNING, usePockets, brightThread } from '../../systems/fog.js';
import { Sighs } from '../../systems/sigh.js';
import { Bean } from '../../systems/bean.js';
import { Stitch } from '../../systems/stitch.js';
import { Sulk } from '../../systems/sulk.js';
import { talk, offerHelper, era, runStory } from '../../story/helpers.js';
import { addSigns } from '../signs.js';
import { Routes, startGuide, signsFor } from '../../systems/wayfinder.js';
import { writeSave } from '../../core/save.js';

// glTF-space rectangle the lamp map covers (the whole quarter)
const LAMP_RECT = { minX: -34, minZ: -50, maxX: 24, maxZ: 70 };

// The streets, for the guide and the fingerposts (systems/wayfinder.js): [x, z].
const NODES = {
  gate: [0, -43], yard: [0, -38.5], arch: [-4, -38.5], court: [-12, -33], courtS: [-14, -28.5], arcade: [-14, -16], junction: [-14, -2], thread: [-14, 12],
  cross: [-14, 24], sq0: [-14, 31], square: [-14, 36], gardenGate: [4, -38.5], garden: [12, -37], gardenS: [12, -30.5], alley: [12, -18], pump: [12, -3],
  row0: [8, -2], row1: [-9, -2], gap: [-11, -2], crossW: [-20, 24], crossE: [-7, 24],
};
const EDGES = ['gate yard arch court courtS arcade junction thread cross sq0 square', 'yard gardenGate garden gardenS alley pump row0 row1 gap junction', 'crossW cross crossE'];
const N = Math.PI,
  E = Math.PI / 2;
const PLACES = [
  ['Persimmon Courtyard', '🍊', -6.6, -35.2, E], ['Laundry Alley', '🧺', 10.7, -29.2, N], ['Pump Yard', '💧', 17.2, -4.9, -E], ['Lantern-makers’ Row', '🏮', 6.8, -0.7, E],
  ['The Arcade', '🚪', -12.7, -26.6, N], ['Thread Street', '🧵', -15.3, 1.2, N], ['The Old Square', '⛲', -12.7, 33.6, N],
];
const FINGERS = [[-12.6, -4.6, ['Persimmon Courtyard', 'The Old Square', 'Lantern-makers’ Row']], [-15.4, 20.4, ['The Old Square', 'Thread Street']]];
const NOTE = 'Soup for twelve. If twelve come, make it for thirteen: somebody always turns up late, and cold. — Grandmother';
const SLEEPER_ECHO = ['I WAS A SHEET NOBODY TOOK IN BEFORE THE RAIN. HONK.', 'I WAS A WASHING DAY WITH NOBODY TO TALK TO. HONK.', 'I WAS A SOCK WITH NOBODY TO DARN IT. HONK.'];

export async function create() {
  const z = new Zone('heart');
  const after = flag('ep_dawn'); // the fog has lifted (the Epilogue's first morning, and ever after)
  const story = era();
  z.fade = true;
  z.domain = !after; // (the kitchen opens in Chapter 5; afterwards only its table is left)
  z.next = ['quiet', 'fang', 'folk_a', 'folk_b', 'folk_c', 'folk_kid'];
  // the Great Sulk sits in the square until the morning it has gone home (story/epilogue.js sees it off)
  const [, , sulkModel] = await Promise.all([z.addGLB('heart'), z.placeKit('quiet_kit'), flag('ep_dawn') ? null : loadGLB('sulk')]);
  // where a reload starts in Chapter 4, further in each time (story/chapter4.js checkpoint())
  for (const [name, x, zz, facing] of [['SPAWN_row', 6, -2, -Math.PI / 2], ['SPAWN_court', -12, -31, Math.PI], ['SPAWN_cross', -14, 20, 0]])
    z.markers.set(name, { name, position: new Vector3(x, 0.05, zz), facing, data: {}, scale: new Vector3(1, 1, 1) });
  z.setupEnvironment(after ? MORNING : FOG_ENV);
  if (!after) setGreyOut(FOG_LOOK);
  const sulkAt = z.marker('POINT_sulk').position;
  // the Great Sulk is as solid as a house (until it has fallen asleep and gone home)
  if (!after) {
    z.collision.addCylinder(sulkAt.clone().setY(-0.5), 6.6, 9, 14);
    z.sulkWall = z.collision.parts.at(-1); // (taken away the morning it goes home: story/epilogue.js)
    new Sulk(z, sulkModel.scene.getObjectByName('sulk') || sulkModel.scene, sulkAt, Math.PI);
    if (flag('ch5Done')) z.sulk.sleep();
    else z.sulk.comfort([0, 0.15, 0.3, 0.5, 0.7][['ch5_p1', 'ch5_p2', 'ch5_p3', 'ch5_p4'].filter((k) => flag(k)).length]);
  }
  if (after) {
    // the kitchen has gone, and its long table stayed in the square
    z.group.getObjectByName('DOMAIN_kitchen').visible = false;
    const tx = -14,
      tz = 40.2;
    z.collision.addBox(new Vector3(tx, 0.4, tz), new Vector3(11, 0.8, 1.5));
    for (const s of [-1, 1]) z.collision.addBox(new Vector3(tx, 0.22, tz + s * 1.25), new Vector3(10.4, 0.44, 0.4));
    // and the old fountain runs again (there is fishing in it: systems/fishing.js)
    const fount = z.marker('POINT_domain').position;
    const water = new Mesh(new CylinderGeometry(1.5, 1.5, 0.01, 16), makeWater({ top: '#4f9fd0', horizon: '#a8dcec', sun: z.sun, detail: 0, deep: '#2f7f96', shallow: '#6fbcc4' }));
    water.position.copy(fount).setY(0.555);
    z.group.add(water);
    const spout = fount.clone().setY(1.8);
    let drip = 0;
    z.updaters.push((dt) => {
      if ((drip -= dt) > 0 || spout.distanceTo(G.player.position) > 30) return;
      drip = 0.09;
      G.fx.sparkles.emit(spout, 1, '#dff3ff', { speed: 0.55, up: 0.5, size: 0.11, life: 0.9, spread: 0.1 });
    });
  }
  z.collision.build();

  // ---- light: the warm spots are lit from the start, every other lantern once the fog has lifted; a stitched
  // thread lights its own stretch (systems/stitch.js adds to z.lampList)
  const lights = z.markersBy('LIGHT_');
  const lamp = (m) => ({ position: m.position, color: m.data.color, radius: m.data.radius, intensity: m.data.intensity });
  const lit = lights.filter((m) => m.data.mem === 'warm' || after);
  z.lamps(LAMP_RECT, [], { texel: 0.5, floorY: 0, top: 3.8 });
  z.lampList = lit.map(lamp);
  z.relight();
  if (after) shared.uLampOn.value = 0.55; // by day the lanterns only warm what is near them
  for (const m of lit) if (m.data.glow > 0) G.fx.glows.add(m.position, m.data.color || '#ffb45c', m.data.glow);

  const pockets = usePockets(z);
  const routes = new Routes(z, NODES, EDGES);

  // ---- under the fog: the sighs, the warm spots, Bean, the sleepers, the loose ends
  if (!after) {
    const south = new Vector3(0, 0, 1);
    const inArcade = () => G.player.position.x < -11 && G.player.position.z > -28 && G.player.position.z < -4;
    z.sighs = new Sighs(z, {
      source: z.marker('POINT_sigh').position,
      axis: south, // they roll up the streets from the south, one straight front
      period: () => (inArcade() ? 9 : 16) * (0.9 + Math.random() * 0.2),
      first: 9,
      // only once Bean has told her what it is; and never again once her friends are stitched back, until
      // the square (story/chapter5.js takes them over there)
      enabled: () => flag('ch4_garden') && !flag('ch4Done'),
      home: z.marker('SPAWN_garden').position,
    });
    for (const m of z.markersBy('AREA_warm_')) {
      const r = Math.max(m.scale.x, m.scale.z);
      const at = m.position.clone().setY(0);
      z.sighs.warm.push({ position: at, radius: r });
      pockets.push({ position: at, radius: r + 1.2 });
    }
    new Bean(z);
    if (flag('ch4_garden')) z.bean.climbOut();
    if (flag('ch4_thread')) brightThread();

    // the sleepers of laundry alley, and the one who sits in the gap
    const greys = [];
    z.markersBy('GRUMB_heavy_').forEach((m, i) => {
      const g = z.grumblingAt(m.name, { asleep: true, wander: 0, echo: SLEEPER_ECHO[i % 3] });
      if (g) greys.push(g);
    });
    const gap = z.grumblingAt('GRUMB_gap', { wander: 0, echo: z.marker('GRUMB_gap').data.echo });
    if (gap) greys.push(gap);
    z.gapGrey = gap;
    const batch = new CreatureBatch('grey', 6, { tint: true });
    for (const g of greys) batch.add(g.obj);
    z.group.add(...batch.parts);
    G.updaters.add(() => batch.update());
    z.greys = new Greys(z, greys);
    // woken with a start, a sleeper sighs there and then
    z.on('grey-woke', (g) => {
      if (g.position.distanceTo(G.player.position) < 6 && !z.sighs.inWarm(G.player.position)) z.sighs.hit();
      z.bean.say('…told you. Walk.');
    });
    z.on('grey-ready', () => z.sighs.comfort(1));
    // the one gap in Lantern-makers' Row: it sits right in it until someone has kept it company
    const gapBox = z.box('TRIGGER_gap');
    const aside = new Vector3(-9.3, 0, -3.3);
    z.updaters.push((dt) => {
      const p = G.player;
      if (!gap || flag('ch4_gap')) {
        if (gap && !gap.soothed && gap.position.distanceTo(aside) > 0.1) {
          // it shuffles out of the way, into the corner
          gap.position.lerp(aside, Math.min(1, dt * 1.2));
          gap.home.copy(aside);
        }
        return;
      }
      if (gap.ready || gap.soothed) {
        flag('ch4_gap', true);
        writeSave(G.save);
        if (!gap.soothed) G.ui.bubble(gap.obj, '…go on, then.', 2.4, 0.6);
        return;
      }
      if (gapBox.containsPoint(p.position) && p.position.x < gap.position.x + 0.9 && !G.frozen) {
        p.teleport(p.position.clone().setX(gap.position.x + 1.3), p.facing);
        G.ui.bubble(gap.obj, '…', 1.6, 0.6);
        if (!z.gapTold) z.bean.say('It won’t move for a hum. You know what it wants.');
        z.gapTold = true;
      }
    });

    // the loose ends: Thread Street's three, then the ones left for anyone who looks
    z.stitch = new Stitch(z, { sighs: z.sighs });
    const STORY = ['bell', 'letter', 'lantern'];
    for (const m of z.markersBy('POINT_loose_')) {
      const id = m.name.slice(12);
      const to = z.marker('POINT_anchor_' + id);
      if (!to) continue;
      z.stitch.add({
        id,
        from: m.position,
        to: to.position,
        icon: m.data.icon,
        what: m.data.what,
        free: id === 'bell',
        enabled: () => flag('ch4_thread'),
        onDone: () => {
          if (!STORY.includes(id)) G.collection.cozy(4, 'Stitched it back', to.position.clone().setY(1.6));
        },
      });
    }
    z.storyStitches = () => STORY.filter((id) => flag('stitch_' + id)).length;

    // ways that are shut, for now
    const back = (box, line) => {
      const p = G.player;
      const c = box.getCenter(new Vector3());
      const d = new Vector3(p.position.x - c.x, 0, p.position.z - c.z);
      // out the way she came in: the side of the box she is nearest
      const sx = box.max.x - box.min.x,
        sz = box.max.z - box.min.z;
      if (Math.abs(d.x) / sx > Math.abs(d.z) / sz) d.set(Math.sign(d.x) * (sx / 2 + 0.7), 0, 0);
      else d.set(0, 0, Math.sign(d.z) * (sz / 2 + 0.7));
      p.teleport(new Vector3(d.x ? c.x + d.x : p.position.x, p.position.y, d.z ? c.z + d.z : p.position.z), p.facing);
      if (line) z.bean.out ? z.bean.say(line) : G.ui.bubble(p.root, line, 2.6, 1.6);
    };
    const shut = (name, open, line) => {
      const box = z.box(name);
      z.updaters.push(() => {
        if (!G.frozen && !open() && box.containsPoint(G.player.position)) back(box, line);
      });
    };
    shut('TRIGGER_gardengate', () => flag('ch4Done'), 'That gate is stuck fast.');
    shut('TRIGGER_south', () => flag('ch4_thread'), 'Not that way. That’s where it’s coming from. North first: there’s something I have to show you.');
    shut('TRIGGER_square', () => flag('ch4Done'), 'Not without them.');
    const quietBox = z.box('TRIGGER_quiet');
    z.updaters.push(() => {
      if (G.frozen || !quietBox.containsPoint(G.player.position)) return;
      if (!flag('ch4Done')) back(quietBox, 'The fog has closed behind us. The only way is on.');
      else G.goto('quiet', 'SPAWN_south');
    });
  } else {
    z.onTrigger('TRIGGER_quiet', () => G.goto('quiet', 'SPAWN_south'));
  }

  // ---- an old note on the kitchen's back door (Unfinished Homework's Read)
  const noteAt = new Vector3(-11.4, 0, -41.5);
  const note = noteSign();
  note.position.copy(noteAt);
  z.group.add(note);
  z.addInteractable({
    position: noteAt,
    radius: 2,
    label: 'Read the note',
    action: async () => {
      if (!G.collection.helper('read')) {
        await talk([[null, 'The ink is faded and smudged… Maybe someone who knows all about homework could read it.']]);
        if (!(await offerHelper('read', '(Ask Unfinished Homework to read it?)'))) return;
      }
      await talk([['homework', '(reading carefully) ' + NOTE]]);
      if (!flag('note_kitchen')) {
        flag('note_kitchen', true);
        G.collection.cozy(3, 'Learned something', noteAt.clone().setY(1.4));
      }
    },
  });

  // ---- the cast: Sunny and Bo (lost at the crossroads in Chapter 4, with Pip after it); Master Fang arrives
  // in Chapter 5. After the story nobody waits here.
  const cast = story === 'ch4' || story === 'ch5' || (story === 'epilogue' && !after) ? ['tangtang', 'weibao', 'fang'] : [];
  await z.populateNPCs((m) => cast.includes(m.name.slice(4)), { essential: cast.slice(0, 2) });
  for (const id of ['tangtang', 'weibao']) z.whenNPC(id, (n) => (n.blobRadius = 0.32));
  z.whenNPC('fang', (n) => !flag('ch5_p3') && n.hide());
  if (story === 'ch4') {
    // sat apart at the crossroads, gone a little grey, each saying they're fine
    for (const [id, seat] of [['tangtang', 'SEAT_3'], ['weibao', 'SEAT_4']]) {
      const n = G.npcs.get(id),
        s = z.marker(seat);
      if (!n) continue;
      n.sitOn(s.data.seat ?? 0.42, s.position, s.facing);
      n.h.overlayPlay('shy', 0);
      n.opts.overlay = 'shy';
      n.onTalk = null;
      for (const m of n.h.meshes) m.material.color.set('#8a909c');
    }
  }

  // ---- signs and the guide
  const dim = () => !flag('ep_dawn');
  addSigns(z, signsFor(z, routes, PLACES.map((p) => [...p, { dim }]), FINGERS));
  startGuide(z, routes);

  // the pause menu's "Things to do here"
  const EXTRA = ['shoe', 'tea', 'toy', 'key'];
  z.todo = () => [
    ['🧵 Loose ends stitched back', EXTRA.filter((id) => flag('stitch_' + id)).length, EXTRA.length],
    ['🌫️ Sleepers kept company', ['heavy_1', 'heavy_2', 'heavy_3', 'gap'].filter((id) => G.save.soothed['heart:' + id]).length, 4],
    ['📜 Grandmother’s note read', flag('note_kitchen') ? 1 : 0, 1],
  ];

  G.audio.mix(after ? 'morning' : 'fog');
  z.killY = -6;
  z.stepFx = after ? '#d6c6a4' : '#d9dde3';
  z.start = () => runStory(z);
  return z;
}
