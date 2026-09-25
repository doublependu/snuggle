// SPDX-License-Identifier: GPL-3.0-only
// Chapter 1: Welcome to Mistbloom. Master Fang's welcome and first lesson, Captain Honk's interruption,
// the lost-sock and homework missions, baking with Tangtang, the lonely pom-pom, and the chapter end.
import { Vector3 } from 'three';
import { G, flag, wait, until } from '../game.js';
import { talk, ask, objective, hint, shot, near } from './helpers.js';
import { cookingGame } from '../systems/cooking.js';
import { writeSave } from '../core/save.js';

const npc = (id) => G.npcs.get(id);

export function chapterObjective() {
  const f = (k) => flag(k);
  if (!f('ch1_welcome')) return 'Meet Master Fang in the courtyard';
  if (!f('ch1_lesson')) return "Attend Master Fang's lesson at the pavilion";
  const left = [];
  if (!f('sockDone')) left.push('the Lost Sock (laundry yard)');
  if (!f('homeworkDone')) left.push('the Homework (under the library stairs)');
  if (left.length) return 'Soothe ' + left.join(' and ');
  if (!f('cookDone')) return 'Bake custard tarts with Tangtang in the kitchen';
  if (!f('pompomDone')) return 'Someone is sitting all alone by the practice field…';
  if (!f('ch1Done')) return 'Meet everyone at the harbour overlook';
  if (!f('ch2_start')) return 'Meet Wei Bao at the Academy gate: the night market awaits!';
  if (!f('ch2Done')) return 'The night market is down the hill (Wei Bao is at the gate)';
  return 'Free roam: find every lemon candy and fill your Sprite Book';
}

export function refreshObjective() {
  objective(chapterObjective());
}

// ---------------------------------------------------------------- main flow
export async function chapter1(z) {
  placeCast(z);
  if (!flag('ch1_welcome')) await welcome(z);
  refreshObjective();
  if (!flag('ch1_lesson')) {
    await until(() => near(z.marker('POINT_lessonseat').position, 3.2) && !G.frozen);
    await lesson(z);
  }
  placeCast(z);
  refreshObjective();
  if (!flag('ch1Done')) {
    await until(() => flag('sockDone') && flag('homeworkDone') && flag('cookDone') && flag('pompomDone'));
    placeCast(z);
    refreshObjective();
    G.ui.toast('💌 A paper crane note: “Meet us at the overlook! — Tangtang, Wei Bao & Captain Honk”', 5);
    await until(() => near(z.marker('POINT_overlook').position, 4.5) && !G.frozen);
    await ending(z);
  }
}

// Put Fang / Tangtang / Wei Bao where the story currently needs them.
function placeCast(z) {
  const fang = npc('fang'),
    tt = npc('tangtang'),
    wb = npc('weibao');
  const at = (n, m, facing) => {
    if (!n || !m) return;
    n.walkTarget = null;
    n.root.position.copy(m.position);
    n.facing = n.homeFacing = facing ?? m.facing;
    n.root.rotation.y = n.facing;
  };
  if (flag('ch1Done')) {
    // evening: Fang at the pavilion, Tangtang baking, Wei Bao at the gate ready for the night market
    at(fang, z.marker('POINT_fang_lesson'));
    at(tt, z.marker('POINT_kitchen'));
    tt.homeFacing = Math.PI / 2;
    if (wb) {
      wb.base = 'idle';
      wb.h.play('idle', 0.2);
      wb.lookAtPlayer = true;
      const g = z.marker('SPAWN_gate').position;
      at(wb, { position: g.clone().add(new Vector3(1.6, 0, -1.8)), facing: Math.PI });
    }
    return;
  }
  if (flag('sockDone') && flag('homeworkDone') && flag('cookDone') && flag('pompomDone')) {
    const o = z.marker('POINT_overlook').position;
    at(fang, { position: o.clone().add(new Vector3(-1.2, 0, -0.6)), facing: 0 });
    at(tt, { position: o.clone().add(new Vector3(1.4, 0, -0.4)), facing: -0.4 });
    if (wb) {
      wb.base = 'idle';
      wb.h.play('idle', 0.2);
      wb.lookAtPlayer = true;
      at(wb, { position: o.clone().add(new Vector3(0.2, 0, -1.4)), facing: 0.3 });
    }
    return;
  }
  if (flag('ch1_welcome')) {
    at(tt, z.marker('POINT_kitchen'));
    tt.homeFacing = Math.PI / 2;
    at(fang, z.marker('POINT_fang_lesson'));
  }
}

async function welcome(z) {
  const p = G.player,
    fang = npc('fang'),
    tt = npc('tangtang');
  G.frozen = true;
  G.ui.card('Chapter 1', 'Welcome to Mistbloom', 2.8);
  await wait(3.2);
  G.frozen = false;
  objective('Meet Master Fang in the courtyard');
  tt.walkTo(new Vector3(1.6, 0, 23.5), 1.9);
  await until(() => near(fang.position, 4));
  G.frozen = true;
  shot('CAM_welcome', fang.position, 0.8, 1.2);
  await talk([
    ['tangtang', 'Master Fang! I found her! Cardboard suitcase and everything!'],
    ['fang', 'So I see. Welcome to Mistbloom Academy, Xiao Pei. We have been expecting you — for about fifty years, give or take.'],
    ['xiaopei', 'F-fifty years? I only turned eleven…', { face: 'surprised' }],
  ]);
  fang.setAnim('pat', 0.3);
  await wait(0.6);
  await talk([
    ['fang', 'Hush now. A warm hand on the head and a lemon candy: that is how we welcome every new sorcerer here.'],
  ]);
  fang.setAnim('idle', 0.3);
  G.collection.cozy(10, 'A lemon candy from Master Fang', p.position.clone().setY(p.position.y + 1.6));
  await talk([
    ['fang', 'One thing to remember before anything else: Grumblings grow bigger when they are ignored, and smaller when someone notices them.'],
    ['fang', 'Come to the pavilion when you are ready, dear. Your first lesson is short. My knees insist on it.'],
    ['tangtang', "And I'll be in the kitchen! Come find me when you're hungry. Or sad. Or bored. Or awake."],
  ]);
  G.cam.clearShot();
  G.frozen = false;
  flag('ch1_welcome', true);
  writeSave(G.save);
  hint('book', 4);
  tt.walkTo(z.marker('POINT_kitchen').position, 2.2).then(() => (tt.homeFacing = Math.PI / 2));
  fang.walkTo(z.marker('POINT_fang_lesson').position, 1.2).then(() => (fang.homeFacing = z.marker('POINT_fang_lesson').facing));
}

async function lesson(z) {
  const p = G.player,
    fang = npc('fang'),
    wb = npc('weibao');
  G.frozen = true;
  fang.root.position.copy(z.marker('POINT_fang_lesson').position);
  const seat = z.marker('POINT_lessonseat');
  p.sitOn(seat.position, seat.facing, seat.data.seat ?? 0.89);
  shot('CAM_lesson', fang.position, 0.8, 1.2);
  await talk([
    ['fang', 'Every sorcerer carries Cozy Energy: the warm glow you get from doing kind things. Sharing snacks. Listening. Tucking someone in.'],
    ['fang', 'Grumblings are not monsters. They are small feelings that never got a hug. We do not fight them. We soothe them.'],
    ['fang', 'And when a Grumbling is fully calmed, it becomes a Charm Sprite. It remembers the feeling that made it, and helps others who feel the same.'],
  ]);
  shot('CAM_honk', wb.position, 0.7, 0.6);
  await talk([['honk', 'THE NEW GIRL HAS CRUMBS ON HER FACE.']]);
  wb.h.overlayPlay('shy', 0.2);
  await talk([
    ['xiaopei', 'Ah— custard tart crumbs! Um. Thank you… goose?', { face: 'shy' }],
    ['honk', 'CAPTAIN HONK. THE BOY IS WEI BAO. HE SAYS HELLO. HE IS TOO SHY TO SAY IT HIMSELF.'],
    ['weibao', '…hello.'],
    ['fang', "Wei Bao's technique is Echo Friend. A Grumbling can speak through Captain Honk, so we can hear what it really needs."],
    ['weibao', "If you ever want to know what a Grumbling needs… I can ask it. It takes a little Cozy Energy, though."],
  ]);
  wb.h.overlayPlay(null, 0.3);
  flag('weibaoFriend', true);
  G.collection.refreshHud();
  shot('CAM_lesson', fang.position, 0.8, 1.0);
  await talk([
    ['fang', 'Now then. Two small missions for our newest sorcerer.'],
    ['fang', 'A lost-sock Grumbling has been knocking over baskets in the laundry yard, through the moon gate to the south-west.'],
    ['fang', "And somebody's unfinished homework is hiding under the library stairs, across the little bridge to the east."],
    ['fang', 'Off you go, dear. And do visit Tangtang. She bakes when she is nervous, so the kitchen is always full.'],
  ]);
  G.cam.clearShot();
  p.stand(seat.position.clone().add(new Vector3(0, 0, 1.6)));
  p.facing = 0;
  G.cam.snapBehind(p);
  G.frozen = false;
  flag('ch1_lesson', true);
  writeSave(G.save);
  hint('assist', 5);
}

async function ending(z) {
  const p = G.player;
  G.frozen = true;
  shot('CAM_overlook', npc('fang').position, 0.9, 1.4);
  await talk([
    ['tangtang', 'THERE you are! Look — you can see the whole bay from here.'],
    ['fang', 'A lost sock, a worried page of homework, a lonely pom-pom… and a kitchen full of tarts. You did wonderfully, Xiao Pei.'],
    ['honk', 'TOMORROW NIGHT IS THE NIGHT MARKET. WE WILL SHOW YOU THE BEST DUMPLING STALL. HONK.'],
    ['weibao', '…it really is the best one.'],
    ['xiaopei', 'I think… I am going to like it here.', { face: 'happy' }],
  ]);
  p.doudou.userData.awake = true;
  G.audio.play('yawn');
  await talk([
    ['doudou', '…did somebody say dumplings?'],
    ['tangtang', 'HE TALKS?!'],
  ]);
  p.doudou.userData.awake = false;
  await talk([[null, 'Doudou is already asleep again. Across the water, the harbour lanterns begin to glow.']]);
  flag('ch1Done', true);
  writeSave(G.save);
  placeCast(z);
  G.frozen = true; // talk() unfroze her; stay put through the chapter cards
  G.cam.clearShot();
  await G.ui.card('Chapter 1 complete', 'Welcome to Mistbloom', 3);
  await G.ui.card('Chapter 2: The Night Market Mix-Up', 'The next evening, down by the harbour… (Wei Bao is waiting at the gate)', 3.4);
  G.frozen = false;
  refreshObjective();
}

// ---------------------------------------------------------------- side content wiring (called from the zone)
export function wireAcademy(z) {
  const tt = npc('tangtang'),
    fang = npc('fang'),
    wb = npc('weibao');
  // Grumbling missions
  z.on('soothed', async (g) => {
    const lines = {
      sock: [['xiaopei', "You'll find your pair one day. Until then, you've got me.", { face: 'smile' }], ['sock', '…warm… toes…']],
      homework: [['xiaopei', 'One page is enough for today. You did your best.', { face: 'smile' }], ['homework', '…really…? …okay…']],
      pompom: [['xiaopei', 'See? Everyone wanted you on their team.', { face: 'happy' }], ['pompom', '…picked… me…!']],
    }[g.species];
    if (!lines) return;
    flag(g.species + 'Done', true);
    writeSave(G.save);
    await wait(2.4);
    if (!G.frozen) await talk(lines);
    refreshObjective();
  });
  z.on('noticed', async (g) => {
    if (g.species !== 'pompom') return;
    await talk([
      ['pompom', '…nobody picked me for their team…'],
      ['xiaopei', 'Then come with me! I know some friends who are playing tag right now.', { face: 'happy' }],
    ]);
    G.ui.toast('💡 It calms best with company: lead it to the courtyard where the Charm Sprites play tag, then hum.', 5.5);
  });
  // Tangtang: cooking (repeatable, restocks tarts)
  tt.onTalk = async () => {
    if (!flag('ch1_welcome')) return;
    const first = !flag('cookDone');
    const a = await ask('tangtang', first ? "You came! Want to bake custard tarts with me? It's easy. Mostly. Usually." : 'Back for more tarts? I never say no to baking.', ['Let’s bake!', 'Maybe later']);
    G.ui.closeDialogue();
    if (a !== 0) return;
    tt.setAnim('stir', 0.3);
    G.player.setState('pose');
    G.player.h.play('stir', 0.3);
    shot('CAM_kitchen', tt.position, 0.9, 1);
    const score = await cookingGame();
    tt.setAnim('idle', 0.3);
    G.player.setState('move');
    G.cam.clearShot();
    const tarts = 2 + (score >= 5 ? 1 : 0);
    G.collection.addTarts(tarts);
    await talk([
      ['tangtang', score >= 5 ? 'PERFECT tarts! Look at that shine! You are a natural!' : score >= 3 ? 'Golden and wobbly, just right!' : "A little lumpy… which means extra love. That's the rule."],
    ]);
    G.ui.toast(`🥧 +${tarts} custard tarts`, 2.5);
    if (first) {
      G.collection.cozy(12 + score * 2, 'Baked with a friend', G.player.position.clone().setY(G.player.position.y + 1.6));
      flag('cookDone', true);
      writeSave(G.save);
      refreshObjective();
    }
  };
  fang.onTalk = () =>
    talk([
      ['fang', pickLine([
        'Notice them first. A Grumbling that feels seen is already half soothed.',
        'If a Grumbling acts out, step aside and keep humming. There is no rush in kindness.',
        'Tangtang’s tarts can calm even a very grumpy Grumbling. Toss one if you need to.',
        'The lemon candies around the grounds? I may have dropped a few. Or ten.',
      ])],
    ]);
  wb.onTalk = async () => {
    if (flag('ch1Done')) {
      // Chapter 2: off to the night market (and back again any time)
      const a = await ask('honk', flag('ch2_start') ? 'BACK TO THE NIGHT MARKET? HONK.' : 'THE NIGHT MARKET AWAITS. TANGTANG IS ALREADY THERE, GUARDING THE DUMPLINGS. HONK.', ['Let’s go!', 'Not yet']);
      G.ui.closeDialogue();
      if (a === 0) G.goto('market', 'SPAWN_start');
      return;
    }
    return flag('weibaoFriend')
      ? talk([['honk', pickLine(['NEED ECHO FRIEND? PRESS THE ASSIST BUTTON NEAR A GRUMBLING. HONK.', 'WEI BAO LIKES YOU. HE WILL NOT SAY IT. I WILL. HONK.', 'THE LIBRARY STAIRS ARE MOSSY. MIND YOUR FEET.'])]])
      : talk([['weibao', '…(he hides behind his puppet)']]);
  };
}

function pickLine(a) {
  return a[Math.floor(Math.random() * a.length)];
}
