// Chapter 1 hub: Mistbloom Academy on the hill above the harbour.
import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { G, flag } from '../../game.js';
import { Zone } from '../zone.js';
import { Rain } from '../../render/vfx.js';
import { materialFor } from '../../render/materials.js';
import { makeCreature } from '../../actors/creatures.js';
import { SPECIES } from '../../content/species.js';
import { bigTreeGeometry, candy, lotusBud, lotusField, noteSign } from '../../procgen/props.js';
import { chapter1, wireAcademy, refreshObjective } from '../../story/chapter1.js';
import { talk, ask } from '../../story/helpers.js';
import { writeSave } from '../../core/save.js';

const NOTES = {
  gate: 'Mistbloom Academy of Gentle Sorcery. Founded in the year of the Great Warm Winter, when the curses of Lantern Bay first came out fluffy.',
  pagoda: 'Fifty years ago, a grey fog covered half the city. We calmed it together, in Grandmother’s Kitchen. I never did find out where the last little piece went. — F.Q.',
  overlook: 'Across the bay lies the old Quiet District. Check on your neighbours, dear students — even the shy ones. Especially the shy ones.',
};

export async function create() {
  const z = new Zone('academy');
  z.next = [];
  await z.addGLB('academy');
  await z.placeKit('kit');
  z.setupEnvironment({
    skyTop: '#6f9fcc', horizon: '#f3e2c6', ground: '#9fb59a', fog: '#eadfcb', fogNear: 50, fogFar: 210,
    hemiSky: '#ffeccc', hemiGround: '#8f9a6a', hemi: 2.0, sunColor: '#ffdcaa', sunI: 2.7, sun: new Vector3(-0.55, 0.5, 0.45),
    clouds: 12, cloudColor: '#fff6ea', cloudShade: '#e2c9b8', skyline: { from: 1.2, to: 1.9 }, peakColor: '#8aa0b3',
  });
  z.addWater({ deep: '#24555a', shallow: '#3f7f78' });
  // ---- the big old courtyard tree
  const bt = z.marker('POINT_bigtree');
  const tree = new InstancedMesh(bigTreeGeometry(), materialFor('leaf'), 1);
  tree.setMatrixAt(0, new Matrix4().makeTranslation(bt.position.x, bt.position.y, bt.position.z));
  tree.castShadow = tree.receiveShadow = true;
  tree.computeBoundingSphere();
  z.group.add(tree);
  z.collision.addCylinder(bt.position.clone().setY(-0.5), 0.6, 5, 8);
  z.collision.build();
  z.scatter(9, [{ x: 0, z: 0, r: 6 }]);
  await z.populateNPCs();
  z.safeMinY = -0.25; // never "save" a spot at the bottom of the pond

  // ---- Charm Sprites playing tag in the courtyard
  const tag = z.marker('POINT_tag').position;
  const taggers = ['cloud', 'sock', 'homework', 'pompom'].map((id, i) => {
    const o = makeCreature(id, { glow: SPECIES[id].glow });
    o.scale.setScalar(0.45);
    z.group.add(o);
    return { o, i, glow: G.fx.glows.add(tag, SPECIES[id].glow, 0.4), id };
  });
  z.updaters.push((dt) => {
    const t = G.time;
    for (const s of taggers) {
      const a = t * (0.9 + s.i * 0.07) + s.i * 1.6;
      const r = 2.2 + Math.sin(t * 0.7 + s.i) * 0.8;
      s.o.position.set(tag.x + Math.cos(a) * r, tag.y + 0.5 + Math.abs(Math.sin(t * 4 + s.i)) * 0.35, tag.z + Math.sin(a) * r);
      s.o.rotation.y = -a;
      G.fx.glows.set(s.glow, s.o.position);
    }
  });

  // ---- pond: lotus field + thirsty buds that bloom into stepping pads (Umbrella helper)
  const pond = z.marker('WATER_pond');
  const buds = z.markersBy('POINT_bud_').map((m) => m.position);
  const island = z.marker('POINT_candy_1').position;
  z.group.add(lotusField(pond, Math.round(40 * (0.5 + G.quality.tier.foliage * 0.5)), 3, [...buds.map((b) => ({ x: b.x, z: b.z, r: 1.4 })), { x: island.x, z: island.z, r: 2.6 }]));
  const budObjs = buds.map((b) => {
    const o = lotusBud(b);
    z.group.add(o);
    z.updaters.push((dt) => o.userData.update(dt));
    return o;
  });
  const bloomAll = () => {
    budObjs.forEach((o, i) => setTimeout(() => o.userData.bloom(), i * 250));
    for (const b of buds) z.collision.addDisc(b.clone().setY(b.y + 0.06), 0.8, 0.2);
    z.collision.build();
  };
  if (flag('lotusBloomed')) bloomAll();
  z.addInteractable({
    position: buds[0],
    radius: 3,
    label: () => (G.collection.helper('umbrella') ? 'Water the lotus buds' : 'Thirsty lotus buds'),
    enabled: () => !flag('lotusBloomed'),
    action: async () => {
      if (!G.collection.helper('umbrella')) {
        await talk([['xiaopei', 'These lotus buds look so thirsty… If only I had a little rain cloud to help.']]);
        if (G.collection.has('cloud')) G.ui.toast('💡 Equip the Soggy Cloud as your helper in the Sprite Book.', 4);
        return;
      }
      const r = new Rain({ count: 160, size: new Vector3(8, 3, 3), speed: 5, length: 0.25, wrap: false, opacity: 0.6, color: '#bfe3ff' });
      r.center.set((buds[0].x + buds[buds.length - 1].x) / 2, buds[0].y + 3, buds[0].z);
      z.group.add(r.mesh);
      G.ui.toast('☁️ Your Soggy Cloud rains happily over the pond!', 3);
      G.audio.play('sparkle');
      setTimeout(() => {
        r.mesh.removeFromParent();
        bloomAll();
        G.audio.play('chime');
        flag('lotusBloomed', true);
        G.collection.cozy(6, 'Watered the lotus', buds[2].clone().setY(1));
        writeSave(G.save);
      }, 1600);
    },
  });

  // ---- lemon candies (hidden ones need the Lost Sock's Sniff)
  const candies = z.markersBy('POINT_candy_');
  G.collection.candyTotal = candies.length;
  for (const m of candies) {
    const id = m.name;
    if (G.save.candies[id]) continue;
    const c = candy();
    c.position.copy(m.position);
    z.group.add(c);
    const hidden = !!m.data.hidden;
    const glow = G.fx.glows.add(m.position, '#ffe27a', hidden ? 0 : 0.5);
    const base = m.position.y;
    const up = (dt) => {
      if (G.save.candies[id]) return;
      c.rotation.y += dt * 2;
      c.position.y = base + Math.sin(G.time * 2 + base) * 0.08;
      const d = c.position.distanceTo(G.player.position);
      const sniff = hidden && G.collection.helper('sniff') && d < 14;
      c.visible = !hidden || sniff;
      G.fx.glows.set(glow, c.position, null, c.visible ? 0.5 : 0);
      if (sniff && Math.random() < dt * 3) G.fx.sparkles.emit(c.position, 1, '#ffe27a', { speed: 0.4, up: 0.6, size: 0.1 });
      if (c.visible && d < 1.1) {
        G.collection.candy(id, c.position.clone());
        c.removeFromParent();
        G.fx.glows.set(glow, c.position, null, 0);
        G.fx.sparkles.emit(c.position, 16, '#ffe27a', { speed: 1.2, size: 0.1 });
      }
    };
    z.updaters.push(up);
  }

  // ---- notes (Unfinished Homework's Read)
  for (const m of z.markersBy('POINT_note_')) {
    const s = noteSign();
    s.position.copy(m.position);
    s.rotation.y = m.facing;
    z.group.add(s);
    z.addInteractable({
      position: m.position,
      radius: 2,
      label: 'Read the note',
      action: async () => {
        if (!G.collection.helper('read')) {
          await talk([[null, 'The ink is faded and smudged… Maybe someone who knows all about homework could read it.']]);
          if (G.collection.has('homework')) G.ui.toast('💡 Equip Unfinished Homework as your helper to read old notes.', 4);
          return;
        }
        await talk([['homework', '(reading carefully) ' + (NOTES[m.data.note] || '…')]]);
        if (!G.save.story['note_' + m.data.note]) {
          G.save.story['note_' + m.data.note] = true;
          G.collection.cozy(3, 'Learned something', m.position.clone().setY(m.position.y + 1.4));
        }
      },
    });
  }

  // ---- kind acts: sleepy sprites by the dorms, the student who dropped her books, students to chat with
  for (const m of z.markersBy('POINT_sleepy_')) {
    const key = 'kind_' + m.name;
    const o = makeCreature(['cloud', 'pompom', 'sock'][Number(m.name.slice(-1)) % 3], { glow: '#ffe7c0' });
    o.scale.setScalar(0.4);
    o.position.copy(m.position).setY(m.position.y + 0.05);
    if (o.userData.eyes) o.userData.eyes.scale.y = 0.15;
    z.group.add(o);
    const blanket = new Mesh(o.userData.body.children[0]?.geometry || undefined, materialFor('cloth', { color: 0xe0a53a, vertexColors: false }));
    blanket.visible = !!G.save.story[key];
    blanket.scale.set(1.1, 0.5, 1.1);
    o.add(blanket);
    z.updaters.push(() => o.scale.set(0.4, 0.4 * (1 + Math.sin(G.time * 2 + m.position.x) * 0.05), 0.4));
    z.addInteractable({
      position: m.position,
      radius: 1.8,
      label: 'Tuck in the sleepy sprite',
      enabled: () => !G.save.story[key],
      action: () => {
        G.save.story[key] = true;
        blanket.visible = true;
        G.ui.bubble(o, 'z z z… ♡', 2, 0.6);
        G.collection.cozy(4, 'Tucked someone in', m.position.clone().setY(1.2));
      },
    });
  }
  const bw = G.npcs.get('bookworm');
  if (bw) {
    bw.onTalk = async () => {
      if (G.save.story.kind_books) return talk([['student', 'Thanks again for helping with my books! The library has a balcony, did you know?']]);
      const a = await ask('student', "Oh no, oh no… I dropped all my books on the steps and my arms are full…", ['Help pick them up', "Sorry, I'm busy"]);
      G.ui.closeDialogue();
      if (a === 0) {
        G.save.story.kind_books = true;
        bw.setAnim('celebrate', 0.3);
        setTimeout(() => bw.setAnim('idle', 0.3), 2500);
        await talk([['student', "You're so kind! Here, the view from the library balcony is lovely. There might even be a candy up there."]]);
        G.collection.cozy(6, 'Helped a classmate', bw.position.clone().setY(1.6));
      } else await talk([['student', 'That’s okay… I’ll manage…']]);
    };
  }
  const chat = {
    s1: ['Welcome to Mistbloom! The courtyard sprites never stop playing tag.', 'Master Fang hides lemon candies everywhere. Everywhere!'],
    s2: ['The pagoda on the hill has the best view. There might be a candy up there too.', 'Have you been to the overlook? You can see the Quiet District across the bay.'],
    classmate: ['Master Fang’s lessons are short but they stick with you.', 'Wei Bao is really nice once you get to know Captain Honk.'],
    player1: ['We have even teams… oh. Is that pom-pom still sitting alone by the goal?', 'Nobody told it the game started, I think.'],
    player2: ['Go team! Um, which team am I on again?'],
    player3: ['That little pom-pom looks so sad. Maybe it just wants someone to ask it to play.'],
  };
  for (const [id, lines] of Object.entries(chat)) {
    const n = G.npcs.get(id);
    if (!n) continue;
    let i = 0;
    n.onTalk = async () => {
      if (id === 's1' && G.save.tarts > 0 && !G.save.story.kind_share) {
        const a = await ask('student', 'Is that… a custard tart? I skipped breakfast…', ['Share a tart', 'Not right now']);
        G.ui.closeDialogue();
        if (a === 0) {
          G.save.tarts--;
          G.save.story.kind_share = true;
          G.collection.cozy(8, 'Shared a snack', n.position.clone().setY(1.6));
          return talk([['student', 'Mmm! Tangtang made this, right? You’re the best!']]);
        }
      }
      await talk([['student', lines[i++ % lines.length]]]);
    };
  }

  // ---- Grumblings
  const sockSpots = z.markersBy('POINT_sockspot_').map((m) => m.position);
  if (!flag('sockDone')) z.grumblingAt('GRUMB_sock', { spots: [z.marker('GRUMB_sock').position, ...sockSpots] });
  if (!flag('homeworkDone')) z.grumblingAt('GRUMB_homework');
  if (!flag('pompomDone')) z.grumblingAt('GRUMB_pompom', { company: tag, companyRadius: 7 });
  wireAcademy(z);

  // ---- falling into the pond: splash, and back to the shore
  z.updaters.push(() => {
    const p = G.player;
    if (p.position.y < -0.75 && p.state === 'move') {
      G.fx.sparkles.emit(p.position.clone().setY(-0.4), 24, '#bfe3ff', { speed: 1.8, up: 2, size: 0.12 });
      G.audio.play('drip');
      G.ui.floaty(p.position.clone().setY(0.6), 'Splash!');
      p.teleport(p.safe);
      if (!G.save.story.splashTip) {
        G.save.story.splashTip = true;
        G.ui.toast('💡 The pond is deep! Maybe the lotus buds could help you cross.', 4);
      }
    }
  });
  G.audio.bed('birds', 1);
  G.audio.bed('water', 0.4);
  G.audio.bed('pad', 1);
  z.onExit = () => ['birds', 'water'].forEach((b) => G.audio.bed(b, 0));
  z.killY = -12;
  z.start = () => chapter1(z);
  refreshObjective();
  return z;
}
