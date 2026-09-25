// SPDX-License-Identifier: GPL-3.0-only
// Prologue: The Rainy Train (tutorial) and arrival at Lantern Bay station.
import { Vector3 } from 'three';
import { G, flag, wait, until } from '../game.js';
import { talk, objective, hint, shot, near, ask, noticed, soothed } from './helpers.js';
import { writeSave } from '../core/save.js';

// ---------------------------------------------------------------- on the train
// Checkpointed: a reload resumes at the right step (intro -> wander and soothe -> lap scene -> arrival),
// and every wait is on state, so playing ahead of the script (humming at the cloud straight away,
// noticing it early) can never leave it waiting.
export async function prologueTrain(z) {
  const p = G.player;
  if (flag('prologueTrain')) {
    // already arrived (e.g. reloaded mid-transition): straight to the platform
    return G.goto('station', 'SPAWN_start');
  }
  const cloud = z.cloud; // null when it was soothed before a reload
  if (cloud && !flag('train_intro')) await trainIntro(z);
  if (cloud && !cloud.soothed) await trainCloud(z, cloud);
  await trainLap(z, !!cloud);
}

async function trainIntro(z) {
  const p = G.player;
  G.frozen = true;
  shot('CAM_intro', p.position, 1.0, 0.01);
  G.ui.card('Prologue', 'The Rainy Train', 2.6);
  await wait(3.4);
  await talk([
    [null, 'Xiao Pei is on her way to live with her aunt in Lantern Bay. Everything she owns fits in one cardboard suitcase.'],
    ['xiaopei', 'Auntie Mei says the harbour lanterns glow even in the rain… I hope she likes me.', { face: 'worried' }],
  ]);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  flag('train_intro', true);
  writeSave(G.save);
}

async function trainCloud(z, cloud) {
  const p = G.player;
  objective('Stretch your legs in the carriage');
  hint('move', 6);
  const start = p.position.clone();
  let t = 0;
  await until(() => (t += 1 / 60) > 9 || p.position.distanceTo(start) > 2.5);
  const npc = (id) => G.npcs.get(id)?.root;
  G.ui.bubble(npc('p4') || p.root, 'Hey! My shoes are soaked!', 3, 1.3);
  G.audio.play('grumble');
  await wait(1.6);
  G.ui.bubble(npc('auntie') || p.root, 'Where is that drip coming from?', 3, 1.3);
  await wait(1.2);
  cloud.enable();
  objective("Find out why everyone's shoes are wet");
  await until(() => near(cloud.position, 5.5) || cloud.noticed);
  if (!cloud.noticed) {
    G.ui.bubble(npc('student') || p.root, "Ugh, a Grumbling. Just ignore it, it'll go away.", 3.5, 1.3);
    objective('Notice the little rain cloud');
    hint('notice');
    await noticed(cloud);
  }
  await talk([
    ['xiaopei', "Oh… you're just a little rain cloud. You look so soggy.", { face: 'worried' }],
    ['cloud', '…forgot… my… umbrella…'],
    ['auntie', "Don't look at it, dear! Grumblings only get bigger if you pay them attention."],
    ['xiaopei', 'When I felt soggy inside, Mama used to hum me a lullaby. Maybe…', { face: 'smile' }],
  ]);
  if (cloud.soothed) return;
  objective('Hum the lullaby to the cloud');
  hint('hum', 6);
  let tipped = false;
  const offT = G.events.on('tantrum', (g) => {
    if (g === cloud && !tipped) {
      tipped = true;
      G.ui.toast("💡 It's about to rain! Step out from under the cloud, then keep humming.", 4.5);
    }
  });
  let beatTip = false;
  const beatWatch = () => {
    if (!beatTip && G.soothe.target === cloud && cloud.progress > 0.2) {
      beatTip = true;
      G.ui.toast('💡 Press Hum again right as the ring pulses for a ♪ Perfect note.', 5);
    }
  };
  G.updaters.add(beatWatch);
  await soothed(cloud);
  offT();
  G.updaters.delete(beatWatch);
}

// The cloud falls asleep in her lap, Doudou wakes up in her hood, and the train pulls in.
async function trainLap(z, justSoothed) {
  const p = G.player;
  G.frozen = true;
  objective('');
  if (justSoothed) await wait(1.4);
  const seat = z.marker('POINT_seat');
  p.sitOn(seat.position, seat.facing, seat.data.seat ?? 0.44);
  shot('CAM_lap', p.position, 0.75, justSoothed ? 1.4 : 0.01);
  await wait(1.2);
  await talk([
    [null, 'The cloud stops raining. It curls up in her lap and snores.'],
    ['auntie', 'Well I never. It fell asleep!'],
    ['student', 'Um… miss? There is something else in your hood.'],
    ['xiaopei', 'Huh?', { face: 'surprised' }],
  ]);
  p.doudou.userData.awake = true;
  G.audio.play('yawn');
  G.fx.sparkles.emit(p.doudou.getWorldPosition(new Vector3()), 12, '#ffe2b0', { speed: 0.6, size: 0.08 });
  await wait(0.8);
  await talk([
    ['doudou', '…five more minutes.'],
    ['xiaopei', 'Wh— who are YOU?! How long have you been in there?', { face: 'surprised' }],
  ]);
  p.doudou.userData.awake = false;
  G.collection.add('doudou', null, 'train:doudou');
  await talk([
    [null, "The little bun-shaped Grumbling is already snoring again. He doesn't seem to be going anywhere."],
    ['conductor', 'Next stop: Lantern Bay! Lantern Bay, everybody!'],
  ]);
  flag('prologueTrain', true);
  writeSave(G.save);
  G.audio.play('door');
  G.cam.clearShot();
  p.stand();
  await G.goto('station', 'SPAWN_start');
}

// ---------------------------------------------------------------- Lantern Bay station
export async function prologueStation(z) {
  const p = G.player;
  const tt = G.npcs.get('tangtang');
  if (flag('prologueDone')) {
    tt?.hide();
    objective('Walk up the hill to Mistbloom Academy');
    return;
  }
  G.audio.bed('rain', 0.25);
  G.frozen = true;
  shot('CAM_platform', tt.position, 1.0, 0.01);
  await wait(0.8);
  await talk([
    [null, 'The rain softens to a drizzle as the train pulls into Lantern Bay. A girl is waiting on the platform with a sign and a big box.'],
  ]);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  objective('Say hello to the girl with the sign');
  hint('talk');
  await new Promise((res) => {
    tt.onTalk = () => {
      tt.onTalk = null;
      res();
    };
  });
  G.frozen = true;
  shot('CAM_tangtang', tt.position, 1.0, 1);
  const a = await ask('tangtang', 'Aha! Cardboard suitcase, cloud on your shoulder — you must be the new student. Probably! I made a sign.', ['Hi… I think I am?', "I'm just visiting my aunt…"]);
  await talk([
    ['tangtang', a === 0 ? "Great! I'm Lin Tangtang, second-year, best baker at Mistbloom. You're a sorcerer, by the way." : "Visiting your aunt AND starting at Mistbloom. You're a sorcerer, by the way. I'm Lin Tangtang, second-year, best baker around."],
    ['tangtang', 'Also you have a cloud on you. And a bun in your hood. Welcome to Lantern Bay!'],
    ['xiaopei', "A sorcerer? Me? I just hummed at it…", { face: 'surprised' }],
    ['tangtang', 'Exactly! Soothing a Grumbling on your first try? Master Fang is going to adore you. Here — custard tarts. Sharing snacks makes Cozy Energy.'],
  ]);
  G.collection.addTarts(3);
  G.ui.toast('🥧 Got 3 of Tangtang’s custard tarts! Toss one at an upset Grumbling to cheer it up.', 4.5);
  await talk([
    ['tangtang', "Go on, share one with your cloud. Kindness is the whole trick, you'll see."],
  ]);
  const share = await ask('xiaopei', '(Share a tart with the sleepy cloud?)', ['Share a tart', 'Save them for later']);
  G.ui.closeDialogue();
  if (share === 0) {
    G.save.tarts--;
    G.collection.cozy(15, 'Shared a snack', p.position.clone().setY(p.position.y + 1.6));
    await talk([
      ['tangtang', 'See that warm glow? That is Cozy Energy. Every kind thing you do builds it up, and sorcerers channel it into their techniques.'],
    ]);
  } else {
    G.collection.cozy(8, 'A warm welcome', p.position.clone().setY(p.position.y + 1.6));
    await talk([['tangtang', "Saving them? Smart! Being welcomed counts too — feel that warm glow? That's Cozy Energy."]]);
  }
  await talk([
    ['tangtang', "Mistbloom Academy is up the hill. Race you! Well — I'll walk. Carrying tarts."],
  ]);
  G.cam.clearShot();
  G.frozen = false;
  hint('book', 5);
  objective('Follow Tangtang up the hill to Mistbloom Academy');
  flag('prologueDone', true);
  writeSave(G.save);
  // Tangtang walks the path ahead, waiting for Xiao Pei at each bend
  const pts = z.markersBy('POINT_path').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  tt.onTalk = () => talk([['tangtang', pick(['This way! The Academy is right at the top.', 'Mind the steps, they get mossy in the rain.', 'Did you know Grumblings love humming? Of course you did.'])]]);
  for (const m of pts) {
    await tt.walkTo(m.position, 2.0);
    await until(() => tt.position.distanceTo(p.position) < 7);
  }
}

function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}
