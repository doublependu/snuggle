// SPDX-License-Identifier: GPL-3.0-only
// Chapter 2: The Night Market Mix-Up. The friends visit Lantern Bay's night market, where a flock of "I
// want that but can't afford it" Grumblings has been knocking over stalls. The trick isn't buying them
// things: it's sitting with them and pointing out the free good things. Walking home, the lanterns across
// the harbour go out, and the air turns cold and heavy.
// Every wait is on state (flags, positions), so a reload resumes at the right step.
import { Color, Vector3 } from 'three';
import { G, flag, wait, until } from '../game.js';
import { talk, objective, hint, shot, near } from './helpers.js';
import { writeSave } from '../core/save.js';

const npc = (id) => G.npcs.get(id);

export function chapter2Objective() {
  const f = (k) => flag(k);
  if (!f('ch2_tutorial')) return 'Follow your nose to the dumpling stall';
  if (!f('flock1Done')) return 'Sit with the sparrows at the lantern stall';
  const left = [];
  if (!f('flock2Done')) left.push('at the toy stall');
  if (!f('flock3Done')) left.push('at the end of the pier');
  if (left.length) return 'Sit with the sparrows ' + left.join(' and ');
  if (!f('ch2_dumplings')) return 'Meet everyone at the dumpling stall';
  if (!f('ch2Done')) return 'Walk home along the harbour wall';
  return 'Free roam: guide lost children home, float lanterns, roast chestnuts';
}

export function refreshObjective2() {
  objective(chapter2Objective());
}

export async function chapter2(z) {
  const tt = npc('tangtang'),
    wb = npc('weibao');
  if (!flag('ch2_start')) await arrival(z);
  // the friends walk along with Xiao Pei all evening
  tt?.follow({ x: 1.3, z: 0.5 });
  wb?.follow({ x: -1.3, z: 0.8 });
  wireFriends(z);
  z.on('flock-done', (f) => flockDone(z, f));
  if (flag('ch2Done')) hookAftermath(z, true);
  if (!flag('ch2_tutorial')) await tutorial(z);
  z.enableFlock(1);
  if (flag('flock1Done')) {
    z.enableFlock(2);
    z.enableFlock(3);
  }
  refreshObjective2();
  if (!flag('ch2_dumplings')) {
    await until(() => flag('flock1Done') && flag('flock2Done') && flag('flock3Done') && !G.frozen);
    refreshObjective2();
    await until(() => near(z.marker('POINT_dumpling').position, 3.2) && !G.frozen && G.player.state === 'move');
    await dumplings(z);
  }
  if (!flag('ch2Done')) {
    refreshObjective2();
    await until(() => near(z.marker('POINT_hook').position, 3.5) && !G.frozen && G.player.state === 'move');
    await hook(z);
  }
}

async function arrival(z) {
  const p = G.player;
  G.frozen = true;
  shot('CAM_arrive', p.position, 1.0, 0.01);
  G.ui.card('Chapter 2', 'The Night Market Mix-Up', 2.8);
  await wait(3.2);
  await talk([
    [null, 'The next evening, the friends walk down the hill to the harbour. The whole promenade glows with lanterns.'],
    ['tangtang', 'Welcome to the Lantern Bay night market! Rule number one: dumplings first.'],
    ['honk', 'THE BEST DUMPLING STALL IS THIS WAY. HONK.'],
    ['weibao', '…it really is the best one.'],
  ]);
  p.doudou.userData.awake = true;
  G.audio.play('yawn');
  await talk([['doudou', '…did somebody say dumplings?']]);
  p.doudou.userData.awake = false;
  await talk([['tangtang', 'Also: emergency tarts. For Grumbling emergencies. You never know!']]);
  G.collection.addTarts(3);
  G.ui.toast('🥧 Got 3 of Tangtang’s tarts. Toss one with Assist, then press Assist again for Wei Bao’s Echo Friend.', 5);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  flag('ch2_start', true);
  writeSave(G.save);
  refreshObjective2();
}

// The lantern stall: the first flock, and Xiao Pei working out what they really need.
async function tutorial(z) {
  const stall = z.marker('POINT_tutorial').position;
  const f1 = z.flocks[0];
  const nest = new Vector3();
  for (const g of f1.sparrows) nest.add(g.home);
  if (f1.sparrows.length) nest.divideScalar(f1.sparrows.length).setY(stall.y);
  else nest.copy(stall);
  await until(() => near(stall, 7.5) && !G.frozen && G.player.state === 'move');
  G.frozen = true;
  z.enableFlock(1);
  G.audio.play('crash');
  shot('CAM_flock1', nest, 0.9, 1.0);
  await wait(0.8);
  await talk([
    ['lanternseller', 'Shoo! Shoo! Oh, my poor lanterns!'],
    ['xiaopei', 'Grumblings! Tiny little sparrows…', { face: 'surprised' }],
    ['tangtang', 'Wistful Sparrows. Every market night they flock to the stalls and knock everything over.'],
  ]);
  G.cam.clearShot();
  G.frozen = false;
  objective('Soothe the sparrows at the lantern stall');
  hint('hum', 5);
  // humming alone barely calms them, and running at them scatters the flock: let her try for a bit
  let tried = 0,
    t = 0;
  const off = z.on('scatter', (g) => f1.sparrows.includes(g) && (tried += 3));
  await until(() => {
    t += 1 / 60;
    if (f1.sparrows.includes(G.soothe.target) && G.player.humming) tried += 1 / 60;
    return (tried > 2.2 || t > 22 || f1.sparrows.some((g) => g.noticed && g.progress > 0.2)) && !G.frozen;
  });
  off();
  G.frozen = true;
  shot('CAM_flock1', nest, 0.9, 1.0);
  await talk([
    ['xiaopei', 'They won’t settle down… What do you want, little ones?', { face: 'worried' }],
    ['weibao', '…let me ask them.'],
  ]);
  const wb = npc('weibao');
  wb?.h.overlayPlay('puppet', 0.2);
  G.audio.play('honk');
  await talk([
    ['honk', '(in a tiny voice) I WANT THAT. BUT I CAN’T AFFORD IT.'],
    ['tangtang', 'Oh… they want the lanterns! Should we buy them one? I have… three coins and a button.'],
    ['xiaopei', 'Buying them things won’t fix it. When I wanted things we couldn’t have, Mama didn’t buy them.', { face: 'sad' }],
    ['xiaopei', 'She sat with me and pointed out all the free good things. The smell of chestnuts. The lanterns on the water. The moon.', { face: 'smile' }],
    ['xiaopei', 'Maybe we just… sit with them.', { face: 'happy' }],
  ]);
  wb?.h.overlayPlay(null, 0.3);
  G.cam.clearShot();
  G.frozen = false;
  flag('ch2_tutorial', true);
  writeSave(G.save);
  objective('Sit on the stool by the lantern stall');
  G.ui.toast('💡 Walk to the stool and choose “Sit with them”.', 4.5);
}

const FLOCK_LINES = {
  1: [
    ['lanternseller', 'They’re… asleep? And look, they’re glowing!'],
    ['tangtang', 'Free good things. I would NEVER have thought of that.'],
    ['honk', 'IT IS BRILLIANT. HONK.'],
    ['xiaopei', 'I heard more sparrows by the toy stall… and out on the pier.', { face: 'smile' }],
  ],
  2: [
    ['toyseller', 'My pinwheels are safe! Thank you, young sorcerers.'],
    ['weibao', '…the music really is nice, when you stop and listen.'],
  ],
  3: [
    ['tangtang', 'Look at them, all tucked up by the water.'],
    ['weibao', '…the lanterns on the water are my favourite free thing.'],
    ['honk', 'MINE IS BREAD. BREAD IS NOT FREE. HONK.'],
  ],
};

async function flockDone(z, f) {
  if (flag(`flock${f.id}Done`)) return;
  flag(`flock${f.id}Done`, true);
  writeSave(G.save);
  await wait(2.6);
  await until(() => !G.frozen && !G.ui.dialogueOpen);
  await talk(FLOCK_LINES[f.id] || []);
  if (f.id === 1) {
    z.enableFlock(2);
    z.enableFlock(3);
    G.ui.toast('✨ Sparrow sprites know the way home. Equip one in the Sprite Book to help lost children.', 5);
  }
  refreshObjective2();
}

async function dumplings(z) {
  const p = G.player;
  G.frozen = true;
  shot('CAM_dumpling', z.marker('POINT_dumpling').position, 1.1, 1.1);
  await talk([
    ['tangtang', 'Three whole flocks of sparrows AND the best dumplings in Lantern Bay. What a night!'],
    ['weibao', '…I told you it was the best stall.'],
  ]);
  p.doudou.userData.awake = true;
  G.audio.play('yawn');
  await talk([
    ['doudou', '…five more dumplings.'],
    ['xiaopei', 'You mean five more minutes?', { face: 'happy' }],
    ['doudou', 'Dumplings. Minutes. Same thing.'],
  ]);
  p.doudou.userData.awake = false;
  G.collection.cozy(10, 'Dumplings with friends', p.position.clone().setY(p.position.y + 1.6));
  await talk([['honk', 'IT IS LATE. WE SHOULD WALK HOME ALONG THE HARBOUR WALL. HONK.']]);
  G.cam.clearShot();
  G.frozen = false;
  flag('ch2_dumplings', true);
  writeSave(G.save);
  refreshObjective2();
}

// Walking home: across the harbour, the Quiet District's lanterns go out one by one.
async function hook(z) {
  const p = G.player;
  G.frozen = true;
  const at = z.marker('POINT_hook').position;
  const across = at.clone().add(new Vector3(0, 2.5, 60));
  G.cam.setShot(z.marker('CAM_hook').position, across, 1.6);
  await wait(1.2);
  await talk([['xiaopei', 'Look at all the lanterns across the bay… Lantern Bay really does glow, even at night.', { face: 'smile' }]]);
  G.audio.play('lightsout');
  // east to west, a wave of lanterns going out
  const far = [...z.far].sort((a, b) => b.pos.x - a.pos.x);
  far.forEach((l, i) => setTimeout(() => G.fx.glows.set(l.i, l.pos, null, 0), 200 + i * 60));
  await wait(far.length * 0.06 + 0.8);
  hookAftermath(z, false);
  await wait(1.2);
  await talk([
    ['tangtang', 'Did… did the lights just go out over there?'],
    ['weibao', '…that’s the Quiet District.'],
    ['honk', '(very quietly) …honk.'],
    ['xiaopei', 'It feels cold all of a sudden. Like somebody sighed.', { face: 'worried' }],
    [null, 'In Xiao Pei’s hood, Doudou is wide awake, staring across the water. He doesn’t say a word.'],
  ]);
  flag('ch2Done', true);
  writeSave(G.save);
  G.frozen = true; // talk() unfroze her; stay put through the chapter cards
  G.cam.clearShot();
  await G.ui.card('Chapter 2 complete', 'The Night Market Mix-Up', 3);
  await G.ui.card('Chapter 3: The Quiet District', 'Coming soon — float lanterns, roast chestnuts, and help every lost child home', 3.6);
  G.frozen = false;
  refreshObjective2();
}

// After the lights go out: the fog turns cold, a wind picks up, the far shore stays dark.
function hookAftermath(z, instant) {
  for (const l of z.far) G.fx.glows.set(l.i, l.pos, null, 0);
  const fog = G.scene.fog;
  const to = new Color('#262c4e');
  const from = fog.color.clone();
  const hemi0 = z.hemi.intensity;
  G.audio.bed('wind', 0.7);
  if (instant) {
    fog.color.copy(to);
    G.scene.background = to.clone();
    z.hemi.intensity = hemi0 * 0.85;
    return;
  }
  let t = 0;
  const fn = (dt) => {
    t = Math.min(1, t + dt / 3);
    fog.color.lerpColors(from, to, t);
    G.scene.background?.copy?.(fog.color);
    z.hemi.intensity = hemi0 * (1 - 0.15 * t);
    if (t >= 1) G.updaters.delete(fn);
  };
  G.updaters.add(fn);
}

// Talking to the friends in the market.
function wireFriends(z) {
  const tt = npc('tangtang'),
    wb = npc('weibao');
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (tt)
    tt.onTalk = () =>
      talk([['tangtang', pick([
        'If a sparrow looks sad, toss it a tart and then HUM. Sugar and song: works every time.',
        'Try the chestnuts! The old man lets you stir the wok.',
        'Floating lanterns from the pier is the best part. Make a wish!',
        flag('ch2Done') ? 'The Quiet District… my grandma used to buy thread there. It was never quiet back then.' : 'Dumplings. Soon. I can smell them.',
      ])]]);
  if (wb)
    wb.onTalk = () =>
      talk([['honk', pick([
        'PRESS ASSIST TWICE: A SNACK, THEN ME. WE WORK BEST TOGETHER. HONK.',
        'THE SPARROWS EACH LOVE ONE FREE THING BEST. I CAN ASK THEM. HONK.',
        flag('ch2Done') ? 'CAPTAIN HONK IS NOT SCARED OF THE DARK. CAPTAIN HONK WOULD LIKE TO HOLD YOUR HAND. HONK.' : 'WEI BAO HAS NEVER BEEN TO THE MARKET WITH FRIENDS BEFORE. HE IS VERY HAPPY. HONK.',
      ])]]);
}
