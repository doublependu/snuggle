// SPDX-License-Identifier: GPL-3.0-only
// Chapter 4: Bean's Secret. In the Quiet District the fog grows so thick that Pip is separated from her
// friends. Alone and scared, she finds that Bean is wide awake for the first time. He tells her the truth:
// fifty years ago he was one of the Grumblings that made up the great fog, a tiny "five more minutes" feeling
// from a little girl who didn't want to leave her grandmother's kitchen. That girl was Master Fang. "You don't
// just soothe feelings. You stitch them back to people. That's what your thread does." Pip's Lullaby Thread
// glows brighter than ever, and she follows it back to her friends.
// Three places: the Academy on a white morning (academy), the Quiet District under the fog (quiet) and the
// Old Quarter beyond the fog wall (heart, world/zones/heart.js). Loaded after Begin (story/helpers.js
// runStory). Every wait is on state, so a reload resumes at the right step.
import { Vector3 } from 'three';
// (Every script loaded after Begin imports the zone base, as the zones do: without it the bundler moves
// three.js out of the main bundle into a file of its own, and the first load makes one more round trip.)
import '../world/zone.js';
import { G, flag, wait, until } from '../game.js';
import { talk, chat, ask, objective, shot, near, tween } from './helpers.js';
import { writeSave } from '../core/save.js';
import { Sighs } from '../systems/sigh.js';
import { sfx, brightThread, usePockets } from '../systems/fog.js';
import { goldenFigure, ghost } from '../systems/memories.js';
import { makeCreature } from '../actors/creatures.js';
import { noteSign } from '../procgen/props.js';
import { gaitFor } from '../actors/player.js';

const npc = (id) => G.npcs.get(id);
const STORY_STITCHES = ['bell', 'letter', 'lantern'];
const stitched = () => STORY_STITCHES.filter((id) => flag('stitch_' + id)).length;
const save = () => writeSave(G.save);
// A reload starts at the zone's spawn: move it on as she gets further into the Old Quarter.
function checkpoint(spawn) {
  G.save.spawn = spawn;
  save();
}

// ---------------------------------------------------------------- the objective, and where it is
function objective4() {
  const f = flag;
  const zid = G.zone?.id;
  if (!f('ch4_friends')) return zid === 'academy' ? ['It’s so quiet. Find Sunny and Bo in the courtyard', 'POINT_fang_court'] : ['Go back to the Academy', null];
  if (!f('ch4_note')) return zid === 'academy' ? ['Read the note pinned to the lesson pavilion', 'POINT_fang_lesson'] : ['Go back to the Academy', null];
  if (!f('ch4_lost')) {
    if (zid === 'academy') return ['Meet Bo at the gate: the ferry to the Quiet District', 'weibao'];
    if (zid === 'quiet') return ['Check on the neighbours: up the lane, and stay in the colour', () => new Vector3(0, 0, 27)];
    return ['The ferry to the Quiet District leaves from the Academy gate', null];
  }
  if (zid !== 'heart') return ['Sunny and Bo are lost beyond the fog wall', zid === 'quiet' ? 'TRIGGER_fogwall' : null];
  if (!f('ch4_garden')) return ['Get out of the sigh’s way: behind a wall, or under the porch lantern', () => G.zone.marker('AREA_warm_1')?.position];
  if (!f('ch4_gap')) return ['Find a way back to Sunny and Bo', 'GRUMB_gap'];
  if (!f('ch4_secret')) return ['Bean wants to show you something: north, up the Arcade', 'POINT_secret'];
  const n = stitched();
  if (n < 3) {
    const next = () => {
      const s = G.zone.stitch;
      if (s?.holding) return G.zone.marker('POINT_anchor_' + s.holding.id)?.position;
      return STORY_STITCHES.filter((id) => !f('stitch_' + id)).map((id) => 'POINT_loose_' + id);
    };
    return [`Stitch the loose ends of Thread Street back where they belong (${n}/3)`, next];
  }
  if (!f('ch4_followed')) return ['Follow the thread to your friends', 'POINT_cross'];
  if (!f('ch4Done')) return [f('stitch_sunny') ? 'Stitch your friends back: the thread from Sunny to Bo' : 'Stitch your friends back: take the thread to Sunny', f('stitch_sunny') ? 'weibao' : 'tangtang'];
  return ['', null];
}
function refresh4() {
  const [text, target] = objective4();
  objective(text, target);
}

// ================================================================ the Academy, a white morning
export async function academy(z) {
  const p = G.player,
    tt = npc('tangtang'),
    wb = npc('weibao');
  const court = z.marker('POINT_fang_court').position;
  const gate = z.marker('SPAWN_gate').position;
  const pav = z.marker('POINT_fang_lesson');
  // Master Fang's note, pinned to a post of the lesson pavilion
  const noteAt = pav.position.clone().add(new Vector3(1.5, 0, 1.3));
  const note = noteSign();
  note.position.copy(noteAt).setY(z.collision.floorY(noteAt) ?? noteAt.y);
  note.rotation.y = pav.facing;
  z.group.add(note);
  if (!flag('ch4_note')) G.fx.glows.add(noteAt.clone().setY(noteAt.y + 1.2), '#ffe27a', 0.6);
  z.addInteractable({
    position: noteAt,
    radius: 2.4,
    priority: 1.5,
    label: 'Read Master Fang’s note',
    enabled: () => flag('ch4_friends'),
    action: () => readNote(z),
  });
  const toGate = () => {
    if (wb) wb.walkTo(gate.clone().add(new Vector3(1.6, 0, -1.8)), 2.2).then(() => (wb.homeFacing = Math.PI));
    if (tt) tt.walkTo(gate.clone().add(new Vector3(-1.4, 0, -1.6)), 2.2).then(() => (tt.homeFacing = Math.PI));
  };
  if (wb)
    wb.onTalk = async () => {
      if (!flag('ch4_note')) return talk([['honk', 'THERE IS A NOTE ON THE PAVILION POST. BO IS TOO SCARED TO READ IT. HONK.']]);
      const a = await ask('honk', 'THE FERRYMAN SAYS HE WILL CROSS ONCE MORE, AND NOT AN OAR FURTHER THAN THE JETTY. HONK.', ['The Quiet District', 'The night market', 'Not yet']);
      G.ui.closeDialogue();
      if (a === 0) G.goto('quiet', 'SPAWN_ferry');
      else if (a === 1) G.goto('market', 'SPAWN_start');
    };
  if (tt)
    tt.onTalk = () =>
      talk([['tangtang', flag('ch4_note') ? 'I packed tarts. For the neighbours. And for emergencies. This is at least two emergencies.' : 'Her slippers are by her door, Pip. She NEVER leaves without her slippers.']]);
  if (!flag('ch4_start')) {
    G.frozen = true;
    G.ui.card('Chapter 4', 'Bean’s Secret', 2.8);
    await wait(3.2);
    await talk([
      [null, 'The next morning, the far shore is gone. Where the Quiet District was, there is only white.'],
      ['xiaopei', 'It’s so quiet. Where is everybody?', { face: 'worried' }],
    ]);
    flag('ch4_start', true);
    save();
    G.frozen = false;
  }
  refresh4();
  if (!flag('ch4_friends')) {
    await until(() => near(court, 8) && !G.frozen);
    G.frozen = true;
    shot('CAM_welcome', tt?.position || court, 0.9, 1.2);
    await talk([
      ['tangtang', 'Pip! Master Fang is GONE. Her bed is made. Her slippers are by the door. She never leaves her slippers!'],
      ['weibao', '…the fog crossed the harbour in the night. You can’t see the far shore at all.'],
      ['honk', 'THERE IS A NOTE ON THE PAVILION POST. BO IS TOO SCARED TO READ IT. HONK.'],
    ]);
    G.cam.clearShot();
    G.frozen = false;
    flag('ch4_friends', true);
    save();
    refresh4();
  }
  if (!flag('ch4_note')) {
    tt?.follow({ x: 1.3, z: 0.6 });
    wb?.follow({ x: -1.3, z: 0.9 });
    await until(() => flag('ch4_note'));
    tt?.follow(null);
    wb?.follow(null);
    toGate();
  }
  refresh4();
}

async function readNote(z) {
  const first = !flag('ch4_note');
  await talk([
    [null, 'A note in Master Fang’s neat hand, pinned to the post. Three lemon candies are tied to it in a twist of paper.'],
    ['fang', '“Gone to wake an old kitchen. Check on the neighbours. Do NOT go past the fog wall. — F.”'],
  ]);
  if (!first) return;
  await talk([
    ['tangtang', 'An old kitchen? She HAS a kitchen. I am in it every day!'],
    ['weibao', '…“check on the neighbours.” The barber. The noodle auntie. Old Mr Lau.'],
    ['xiaopei', 'Then that’s what we do. We check on them, and we come straight home.', { face: 'smile' }],
    ['honk', 'THE FERRY. THE GATE. CAPTAIN HONK WILL BRING THE CANDIES. HONK.'],
  ]);
  G.collection.cozy(6, 'Three lemon candies', G.player.position.clone().setY(G.player.position.y + 1.6));
  flag('ch4_note', true);
  save();
  refresh4();
}

// ================================================================ the Quiet District, under the fog
const NEIGHBOURS = {
  barber: ['Barber', 'Who’s— oh! The young sorcerers. I lit the lamp, like neighbours should. Stay in its light: this fog has a bad feeling in it.'],
  noodle: ['Noodle auntie', 'I’ve a pot on, dears, but I daren’t open the door. Come by when this lifts. …You will come by?'],
  oldman: ['Old Mr Lau', 'Lau here. Still here. Mind the sighs: they come up the lane like a tide. Stand where somebody remembered something.'],
};

// The district under the fog, as it is for the rest of Chapters 4 and 5: the friends at her side, the sighs
// up the lane, the neighbours behind their doors (a lamp in the window of the ones she checked on).
export function fogDistrict(z) {
  const tt = npc('tangtang'),
    wb = npc('weibao');
  tt?.follow({ x: 1.2, z: 0.6 });
  wb?.follow({ x: -1.2, z: 0.8 });
  const pockets = usePockets(z);
  // the sighs come up the lane from the south; every pocket of colour is shelter
  z.sighs = new Sighs(z, {
    source: new Vector3(0, 0, 74),
    axis: new Vector3(0, 0, 1),
    period: 19,
    first: 12,
    enabled: () => flag('ch4_sigh') && !flag('ch4_lost') && !z.parting,
    home: z.marker('SPAWN_ferry').position,
  });
  for (const pk of pockets) z.sighs.warm.push({ position: pk.position, radius: pk.radius * 0.9 });
  // the neighbours stay behind their doors; the ones she checked on have put a lamp in the window
  for (const [id, [who, line]] of Object.entries(NEIGHBOURS)) {
    const m = z.marker('NPC_' + id);
    if (!m) continue;
    const kind = flag('kind_' + id);
    const side = Math.sign(m.position.x) || 1;
    const door = m.position.clone().add(new Vector3(side * 0.9, 0, 0));
    if (kind) {
      const at = door.clone().setY(1.9);
      G.fx.glows.add(at, '#ffc46b', 1.5);
      z.lampList.push({ position: at, color: '#ffc46b', radius: 4.5, intensity: 1 });
      const spot = { position: m.position.clone().setY(0), radius: 3.6 };
      pockets.push(spot);
      z.sighs.warm.push({ position: spot.position, radius: 3.2 });
    }
    z.addInteractable({
      position: m.position,
      radius: 2.2,
      label: 'Knock',
      action: async () => {
        G.audio.play('step');
        G.audio.play('step');
        await talk([kind ? [who, line] : [null, 'Nobody answers. The shutters are down, and no light shows. …Somebody should have checked on them sooner.']]);
        if (kind && !flag('knock_' + id)) {
          flag('knock_' + id, true);
          G.collection.cozy(3, 'Checked on a neighbour', m.position.clone().setY(1.6));
          save();
        }
      },
    });
  }
  z.relight();
  if (tt) tt.onTalk = () => talk([['tangtang', 'Stay in the colour, stay in the colour, stay in the colour. …I’m not scared. I’m reminding YOU.']]);
  if (wb) wb.onTalk = () => talk([['honk', 'WHERE THE SPRITES REMEMBERED SOMETHING, THE FOG CAN’T SIT. BO NOTICED. BO NOTICES THINGS. HONK.']]);
}

export async function quiet(z) {
  const p = G.player,
    tt = npc('tangtang'),
    wb = npc('weibao');
  if (flag('ch4_lost')) return void G.goto('heart', 'SPAWN_garden');
  fogDistrict(z);

  if (!flag('ch4_ferry')) {
    G.frozen = true;
    shot('CAM_arrive', z.marker('POINT_arrive').position, 1.0, 0.01);
    await wait(0.8);
    G.audio.play('foghorn');
    await talk([
      [null, 'The ferryman will not come past the jetty. The fog has swallowed the district whole: the lane, the roofs, the sky.'],
      ['tangtang', 'I can’t see my own tarts.'],
      ['weibao', '…look. Colour. Wherever the sprites remembered something, it’s still clear.'],
      ['honk', 'CAPTAIN HONK WOULD LIKE TO HOLD YOUR HAND. FOR YOUR SAKE. HONK.'],
      ['xiaopei', 'Stay close. We check on the neighbours, and then we go home.', { face: 'worried' }],
    ]);
    G.cam.clearShot();
    G.cam.snapBehind(p);
    G.frozen = false;
    flag('ch4_ferry', true);
    save();
    G.ui.toast('💡 Every memory you restored is still a pocket of colour. A lit window is a neighbour you checked on. Knock, and see how they are.', 7);
  }
  refresh4();
  if (!flag('ch4_sigh')) {
    // the first sigh, as they start up the lane
    await until(() => p.position.z > -12.5 && !G.frozen && p.state === 'move');
    await talk([
      ['weibao', '…something’s coming. Up the lane.'],
      ['tangtang', 'It sounds like the whole district sighing. Into the colour! Quick!'],
    ]);
    G.ui.toast('💡 A sigh is coming. Get into a pocket of colour, or behind something solid.', 6);
    const d = z.sighs.distance(p.position);
    let caught = null;
    const off = z.on('sigh-pass', (e) => (caught = e.caught));
    z.sighs.send(5.5, Math.max(3, d - 5.5 * 7));
    await until(() => caught !== null);
    off();
    flag('ch4_sigh', true);
    save();
    await wait(1.2);
    chat(
      caught
        ? [['xiaopei', '…I suddenly wanted to sit down and never get up.'], ['tangtang', 'Me too. Let’s not. Colour next time!']]
        : [['tangtang', 'It went right over us! The colour kept it off.'], ['honk', 'CAPTAIN HONK WAS NOT WORRIED. HONK.']],
    );
  }
  // the square: the longest sigh, and the fog closes
  await until(() => p.position.z > 22.5 && Math.abs(p.position.x) < 12 && !G.frozen && p.state === 'move');
  z.parting = true;
  G.frozen = true;
  const fog = G.scene.fog;
  shot('CAM_square', new Vector3(0, 0, 28), 1.0, 1.4);
  sfx.moan(1);
  await talk([[null, 'In the square the fog is so thick that the old banyan is only a shadow. Then the longest sigh yet rolls up from the south.']]);
  for (const n of [tt, wb]) {
    if (!n) continue;
    n.follow(null);
    n.lookAtPlayer = false;
    n.setAnim('overwhelmed', 0.6);
    for (const m of n.h.meshes) m.material.color.set('#8a909c');
  }
  sfx.pass(1);
  await wait(1.2);
  await talk([
    ['tangtang', 'Oh. …I think I’ll just sit down. For a minute.'],
    ['xiaopei', 'Sunny?', { face: 'worried' }],
    ['tangtang', 'I’m fine, really. You go on.'],
    ['honk', '(very quietly) …bo is fine too. he says. honk.'],
    ['xiaopei', 'No, you’re NOT— Bo, help me get her u—', { face: 'surprised' }],
  ]);
  G.frozen = true;
  const from = { near: fog.near, far: fog.far };
  await tween(2.2, (k) => {
    fog.near = from.near * (1 - k) + 0.1 * k;
    fog.far = from.far * (1 - k) + 1.6 * k;
  });
  await talk([[null, 'The fog closes like a door.']]);
  flag('ch4_lost', true);
  save();
  await G.goto('heart', 'SPAWN_garden');
}

// ================================================================ the Old Quarter, alone
// What Bean says as she comes to each place (once), in glTF coordinates: [key, test, line].
const REMARKS = [
  ['alley', (q) => q.x > 9 && q.z > -30 && q.z < -24, 'Sleepers. Under the sheets. Walk, and don’t wake them.'],
  ['alley2', (q) => q.x > 9 && q.z > -20 && q.z < -14, 'You could keep one company. They like that. They won’t say so.'],
  ['pump', (q) => q.x > 8 && q.z > -6 && q.z < 0, 'A lit window. Somebody still lives here. Catch your breath: it’s warm.'],
  ['row', (q) => q.x < 6 && q.x > -8 && q.z > -4 && q.z < 0, 'Lantern-makers’ Row. They sold hundreds a night, once. I liked the red ones.'],
  ['arcade', (q) => q.x < -11 && q.z < -5 && q.z > -12, 'Doorways. One sigh, one doorway. It’s behind us now, so listen for it.'],
  ['thread', (q) => q.x < -11 && q.z > 1 && q.z < 6, 'Loose ends, all down the street. Take one. Walk it home.'],
];
const STITCH_LINES = {
  bell: 'A doorbell nobody rang. Somebody stood inside for years, hoping.',
  letter: 'A letter. It only ever wanted an answer.',
  lantern: 'A birthday lantern. Nobody came. …It’s lit now.',
};

export async function heart(z) {
  const p = G.player,
    bean = z.bean;
  const pockets = usePockets(z);
  const court = new Vector3(-12.5, 0, -35);
  if (flag('ch4_secret')) pockets.push({ position: court, radius: 11 });
  z.updaters.push(remarks(z));
  z.on('stitched', (d) => {
    bean.say(STITCH_LINES[d.id] || 'Stitched. That one’s home.');
    refresh4();
  });
  z.on('thread-taken', () => refresh4());
  z.on('thread-dropped', ({ why }) => {
    if (why === 'sigh') bean.say('It slipped. Go back for it. It doesn’t mind waiting: it’s had practice.');
    refresh4();
  });
  z.on('sigh-near', () => {
    bean.alert(3.5);
    if (flag('ch4_garden') && !z.memoryPlaying) bean.say(z.sighs.sheltered(p.position) ? 'Here it comes. Stay put.' : 'Sigh! Get behind something!', 2.2);
  });
  z.on('recovered', () => bean.say('There. Better. It doesn’t mean it, you know. It’s just very, very sad.'));
  z.on('flag', ({ name }) => name.startsWith('ch4_') && refresh4());
  refresh4();

  if (!flag('ch4_garden')) await garden(z);
  if (!flag('ch4_gap')) {
    await until(() => flag('ch4_gap'));
    checkpoint('SPAWN_row');
    z.sighs.comfort(1);
    bean.say('See? It only wanted somebody to stay.');
  }
  if (!flag('ch4_secret')) {
    await until(() => near(z.marker('POINT_secret').position, 5.5) && !G.frozen && p.state === 'move');
    await secret(z, court);
    checkpoint('SPAWN_court');
  }
  if (stitched() < 3) await until(() => stitched() >= 3);
  // the thread she follows: from the last stitch on to the crossroads, where its end hangs
  const cross = z.marker('POINT_cross').position;
  z.stitch.add({
    id: 'sunny',
    icon: '🥧',
    what: 'Sunny',
    take: 'Take the thread',
    from: cross,
    to: () => npc('tangtang').position,
    enabled: () => flag('ch4_followed'),
    pocket: 5,
    onDone: () => friendBack('tangtang'),
  });
  z.stitch.add({
    id: 'bo',
    icon: '🪿',
    what: 'Bo',
    take: 'Take the thread on to Bo',
    from: () => npc('tangtang').position,
    to: () => npc('weibao').position,
    enabled: () => flag('stitch_sunny'),
    pocket: 5,
    onTake: () => {
      // one last sigh: wait for it in the side street, don't let go
      if (!z.lastSigh) z.sighs.send(6, Math.max(3, z.sighs.distance(p.position) - 6 * 6));
      z.lastSigh = true;
      bean.say('One more sigh, before the street. Hold on to it. Wait here, then cross.');
    },
    onDone: () => friendBack('weibao'),
  });
  for (const id of ['tangtang', 'weibao']) if (flag('stitch_' + (id === 'tangtang' ? 'sunny' : 'bo'))) friendBack(id, true);
  if (!flag('ch4_followed')) {
    if (stitched() === 3 && !flag('ch4_threadTold')) {
      flag('ch4_threadTold', true);
      bean.say('Look at your thread. It’s running on down the street by itself. It knows where they are.', 4.5);
    }
    refresh4();
    await until(() => near(cross, 5) && !G.frozen && p.state === 'move');
    await found(z);
    checkpoint('SPAWN_cross');
  }
  if (!flag('ch4Done')) {
    await until(() => flag('stitch_sunny') && flag('stitch_bo') && !G.frozen);
    await reunion(z);
  }
  // the square is next (story/chapter5.js, in the same place)
  const next = await G.later('ch5');
  if (G.zone === z) next.heart(z);
}

// Bean's remarks as she comes to each place, once each.
function remarks(z) {
  let t = 0;
  return (dt) => {
    if ((t -= dt) > 0 || G.frozen || !z.bean.out || z.memoryPlaying) return;
    t = 0.5;
    const q = G.player.position;
    for (const [key, test, line] of REMARKS) {
      if (flag('bean_' + key) || !test(q)) continue;
      if (key === 'thread' && !flag('ch4_thread')) continue;
      flag('bean_' + key, true);
      z.bean.say(line);
      break;
    }
  };
}

// The back garden: alone; Bean climbs out of the hood; the first sigh she faces by herself.
async function garden(z) {
  const p = G.player,
    bean = z.bean;
  G.frozen = true;
  shot('CAM_garden', p.position, 0.95, 0.01);
  await wait(1.0);
  await talk([
    [null, 'When the fog thins, the square is gone. So are Sunny and Bo. There is only a garden she has never seen.'],
    ['xiaopei', 'Sunny? …Bo? Captain Honk?', { face: 'worried' }],
    [null, 'Nothing answers. Only, a long way off, something enormous breathing out.'],
  ]);
  G.audio.play('yawn');
  bean.climbOut();
  await wait(0.9);
  await talk([
    ['doudou', 'Don’t run.'],
    ['xiaopei', 'Bean?! You’re… awake. Properly awake.', { face: 'surprised' }],
    ['doudou', 'Dumplings and emergencies. I did say.'],
    ['doudou', 'Running makes it worse. That sound is a sigh, and it’s coming this way. Get behind the wall, or under that lantern. Anywhere warm.'],
  ]);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  refresh4();
  G.ui.toast('💡 A sigh is coming up from the south. Shelter behind something solid, or in a warm light. <b>Calm</b> is how far Bean’s colour reaches.', 8);
  let caught = null;
  const off = z.on('sigh-pass', (e) => (caught = e.caught));
  z.sighs.send(4.5, Math.max(3, z.sighs.distance(p.position) - 4.5 * 8));
  await until(() => caught !== null);
  off();
  await wait(1.0);
  bean.say(caught ? 'That’s what it does. Makes you want to sit down and stop. Don’t. Next time: a wall, or a warm light.' : 'Good. That’s all there is to it. A wall, or a warm light.');
  bean.say('See the colour round us? That’s me. It gets smaller when you’re frightened. So: don’t be. I’m here.', 5);
  flag('ch4_garden', true);
  save();
  refresh4();
}

// One golden figure standing somewhere (a pose, or walking: see walkFigure).
async function figure(z, model, pos, facing, anim = 'idle', overlay = null) {
  const h = await goldenFigure(model);
  h.root.position.copy(pos).setY(z.collision.floorY(pos) ?? pos.y);
  h.root.rotation.y = facing;
  h.play(anim, 0);
  if (overlay) h.overlayPlay(overlay, 0);
  z.group.add(h.root);
  h.userUpdate = (dt) => h.update(dt, 5);
  G.updaters.add(h.userUpdate);
  return h;
}
function walkFigure(h, to, speed = 1.1) {
  return new Promise((res) => {
    const [clip, ts] = gaitFor(h, speed);
    h.play(clip, 0.2, ts);
    const fn = (dt) => {
      const d = new Vector3(to.x - h.root.position.x, 0, to.z - h.root.position.z);
      const len = d.length();
      if (len < 0.08) {
        G.updaters.delete(fn);
        h.play('idle', 0.3);
        return res();
      }
      d.divideScalar(len);
      h.root.position.addScaledVector(d, Math.min(len, speed * dt));
      h.root.rotation.y = Math.atan2(d.x, d.z);
    };
    G.updaters.add(fn);
  });
}
const says = (h, text, life = 2.2 + text.length / 16) => {
  G.ui.bubble(h.root, text, life, 1.25).el.classList.add('memory');
  return wait(life + 0.3);
};

// The persimmon courtyard: Bean's secret, told as a memory she walks through.
async function secret(z, court) {
  const p = G.player,
    bean = z.bean;
  const pockets = usePockets(z);
  z.memoryPlaying = true; // (no sigh comes while he tells it)
  G.audio.score?.play('bean', 2); // the lullaby on one soft voice, half remembered
  G.frozen = true;
  shot('CAM_court', z.marker('POINT_persimmon').position, 2.4, 1.4);
  await talk([
    ['doudou', 'Stop. …I know this tree.'],
    ['doudou', 'And that door. That’s her kitchen. This is the back of it.'],
    ['xiaopei', 'Whose kitchen? Bean, how do you know this place?', { face: 'worried' }],
    ['doudou', 'It’s easier if I show you. Walk with them. I’ll tell it.'],
  ]);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  objective('Walk with the memory', () => z.beat || null);
  // colour blooms over the whole courtyard, and stays
  const pocket = { position: court, radius: 0.01 };
  pockets.push(pocket);
  G.audio.play('memory');
  const seat = z.marker('SEAT_2');
  const door = new Vector3(-10, 0, -41.0);
  const [gran, girl] = await Promise.all([figure(z, 'folk_c', door, 0, 'idle', 'stir'), figure(z, 'folk_kid', seat.position, seat.facing, 'sit')]);
  girl.seatRoot(seat.position, seat.facing, seat.data.seat ?? 0.42, girl.root.position);
  await tween(2.6, (k) => {
    pocket.radius = 11 * (1 - (1 - k) * (1 - k));
    ghost().opacity = 0.45 * k;
  });
  const beat = (pos, r = 4) => {
    z.beat = pos;
    return until(() => near(pos, r) && !G.frozen);
  };
  // 1. the stone table: tea, and five more minutes
  await beat(seat.position.clone().add(new Vector3(0, 0, 1.6)), 4.5);
  bean.lookAt = girl.root.position;
  await says(gran, 'Autumn! Your tea is ready. Five more minutes, then home.');
  await says(girl, 'Five more minutes, Grandma…');
  bean.say('Fifty years ago. The fog was over the roofs by then. Nobody knocked on anybody’s door any more.', 5);
  await wait(5.2);
  // 2. under the persimmon tree: lemon candies and a red thread
  const tree = new Vector3(-11.3, 0, -33.6);
  girl.root.position.copy(seat.position).add(new Vector3(0.9, 0, 0)).setY(0);
  await walkFigure(girl, tree);
  await beat(tree, 4);
  girl.root.rotation.y = Math.atan2(p.position.x - tree.x, p.position.z - tree.z);
  girl.play('wave', 0.3);
  await says(girl, 'Everybody is so sad. I’ve got lemon candies. I’ll give everyone one, and then they won’t be.');
  bean.say('A pocketful of lemon candies, and a red thread round her wrist. That was her whole plan.', 5);
  await wait(5.2);
  // 3. out of the gate, into the fog: she hugs it
  const gateAt = new Vector3(-14, 0, -29.6);
  // the fog of fifty years ago, as one enormous shape: fainter than the people (it would glare, that size)
  const haze = ghost().clone();
  haze.opacity = 0.13;
  const lump = makeCreature('grey');
  lump.traverse((o) => o.isMesh && (o.material = haze));
  lump.scale.setScalar(6);
  lump.position.set(-14, 0, -24.6);
  lump.rotation.y = Math.PI;
  z.group.add(lump);
  await walkFigure(girl, gateAt, 1.2);
  girl.root.rotation.y = 0;
  girl.play('pat', 0.3);
  await beat(gateAt.clone().add(new Vector3(0, 0, -2.2)), 4.5);
  bean.lookAt = lump.position;
  bean.say('She walked out into it. And she hugged it. The whole fog: every forgotten thing in Lantern Bay, and a girl of seven with her arms out.', 6.5);
  await wait(6.8);
  bean.say('It went quiet. It let go of the city.', 3.2);
  await tween(3.2, (k) => lump.scale.setScalar(6 - 5.4 * k));
  const mini = makeCreature('doudou');
  mini.traverse((o) => o.isMesh && (o.material = ghost()));
  mini.position.copy(girl.root.position).add(new Vector3(0, 0.62, -0.16));
  mini.scale.setScalar(0.8);
  z.group.add(mini);
  lump.removeFromParent();
  G.fx.sparkles.emit(mini.position, 20, '#ffe2a8', { speed: 0.7, up: 0.6, size: 0.12, life: 1.4 });
  G.audio.play('chime');
  bean.say('One small piece didn’t let go.', 3);
  await wait(3.2);
  // the secret itself, in the story's words
  G.frozen = true;
  bean.lookAt = null;
  G.cam.setShot(p.position.clone().add(new Vector3(1.3, 1.5, -1.9)), p.position.clone().setY(p.position.y + 1.15), 1.2);
  await talk([
    ['doudou', 'That was me. A “five more minutes” from a little girl who didn’t want to leave her grandmother’s kitchen.'],
    ['xiaopei', 'The little girl… Autumn. That’s Master Fang.', { face: 'surprised' }],
    ['doudou', 'She calmed it, once. Only barely. I held on to her cardigan and fell asleep, and I’ve slept in sorcerers’ pockets and hoods ever since.'],
    ['doudou', 'Fifty years. Waiting for somebody who could finish what she started.'],
    ['xiaopei', 'Me? Bean, I can only hum. I can’t even find my friends.', { face: 'sad' }],
    ['doudou', 'You don’t just soothe feelings. You stitch them back to people. That’s what your thread does.'],
  ]);
  G.frozen = true;
  await tween(1.4, (k) => (ghost().opacity = 0.45 * (1 - k)));
  for (const h of [gran, girl]) {
    G.updaters.delete(h.userUpdate);
    h.root.removeFromParent();
  }
  mini.removeFromParent();
  // the Lullaby Thread, brighter than ever
  brightThread();
  sfx.stitch();
  const c = p.position.clone().setY(p.position.y + 0.9);
  for (let i = 0; i < 5; i++) G.fx.sparkles.emit(c, 16, '#ffd98a', { speed: 1.6, up: 1.2, size: 0.14, life: 1.5, spread: 0.6 });
  await talk([
    [null, 'Pip’s Lullaby Thread glows brighter than ever.'],
    ['doudou', 'There. Look at it. The fog is full of loose ends: things that came undone. Take one, walk it home, and stitch.'],
  ]);
  G.collection.cozy(20, 'Bean believes in you', p.position.clone().setY(p.position.y + 1.6));
  flag('ch4_secret', true);
  flag('ch4_thread', true);
  save();
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  z.memoryPlaying = false;
  z.beat = null;
  G.audio.score?.play('fog', 4);
  G.ui.toast('✨ The Lullaby Thread can <b>Stitch</b>, and it reaches further. A stitch spends 10 Cozy Energy; with none left it still works, only slower.', 7);
  refresh4();
}

// The crossroads: Sunny and Bo, sitting apart, each saying they're fine.
async function found(z) {
  const p = G.player,
    tt = npc('tangtang'),
    wb = npc('weibao');
  G.frozen = true;
  shot('CAM_cross', tt.position.clone().lerp(wb.position, 0.5), 0.8, 1.4);
  await talk([
    [null, 'The thread ends at a crossroads. Sunny sits on a bench down one arm of it, Bo down the other, as far apart as the street allows.'],
    ['xiaopei', 'Sunny! Bo!', { face: 'happy' }],
    ['tangtang', 'Oh. Pip. I’m fine, really. You go on.'],
    ['honk', '(very quietly) …bo is fine too. he says. honk.'],
    ['xiaopei', 'You’re not fine. And I’m not going on.', { face: 'sad' }],
    ['doudou', 'Don’t soothe them. Stitch them. Your thread ends right here: take it to her.'],
  ]);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  flag('ch4_followed', true);
  save();
  refresh4();
}

// Colour comes back into a friend the thread has reached.
function friendBack(id, quiet = false) {
  const n = npc(id);
  if (!n) return;
  for (const m of n.h.meshes) m.material.color.set('#ffffff');
  n.opts.overlay = null;
  n.h.overlayPlay(null, 0.4);
  n.lookAtPlayer = true;
  if (quiet) return;
  G.fx.sparkles.emit(n.position.clone().setY(n.position.y + 0.9), 26, '#ffe2a8', { speed: 1.2, up: 1, size: 0.13, life: 1.4 });
  G.ui.bubble(n.root, id === 'tangtang' ? '…Pip? Oh. Oh, I went all grey, didn’t I.' : '🪿 …HONK?', 3.2, 1.5);
  refresh4();
}

async function reunion(z) {
  const p = G.player,
    tt = npc('tangtang'),
    wb = npc('weibao');
  G.frozen = true;
  await wait(1.0);
  // they get up and come to her
  const mid = z.marker('POINT_cross').position;
  for (const [n, dx] of [[tt, -1.1], [wb, 1.1]]) {
    n.seated = false;
    n.base = 'idle';
    n.place(n.position.clone().add(new Vector3(0, 0, -0.7)), n.facing, z.collision);
  }
  p.teleport(mid.clone().add(new Vector3(0, 0, -1.2)), 0);
  shot('CAM_cross', mid, 0.9, 1.2);
  await Promise.all([tt.walkTo(mid.clone().add(new Vector3(-1.2, 0, 0.4)), 2.2), wb.walkTo(mid.clone().add(new Vector3(1.2, 0, 0.4)), 2.2)]);
  tt.homeFacing = wb.homeFacing = Math.PI;
  tt.setAnim('celebrate', 0.3);
  await talk([
    ['weibao', '…you came back.'],
    ['tangtang', 'Of COURSE she came back! I knew she’d come back! …I did not know. I sat down, Pip. I sat DOWN.'],
    ['honk', 'CAPTAIN HONK NEVER DOUBTED. CAPTAIN HONK DOUBTED A LITTLE. HONK.'],
  ]);
  tt.setAnim('idle', 0.3);
  await talk([
    ['tangtang', 'And— is that BEAN? On your HEAD? AWAKE?'],
    ['doudou', 'Emergencies.'],
    ['xiaopei', 'He told me about the fog. And about Master Fang. I’ll tell you on the way.', { face: 'smile' }],
    ['weibao', '…on the way where?'],
    [null, 'Ahead, where the street opens out, the fog glows faintly around something very large.'],
    ['doudou', 'There.'],
  ]);
  G.collection.cozy(15, 'Stitched back together', p.position.clone().setY(p.position.y + 1.6));
  flag('ch4Done', true);
  save();
  G.frozen = true;
  G.cam.clearShot();
  await G.ui.card('Chapter 4 complete', 'Bean’s Secret', 3);
  G.cam.snapBehind(p);
  G.frozen = false;
}
