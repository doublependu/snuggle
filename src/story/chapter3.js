// SPDX-License-Identifier: GPL-3.0-only
// Chapter 3: The Quiet District. Grumblings across the city are getting grey and heavy, and they don't want
// to be hugged anymore; they're all drifting toward the Quiet District, an old neighbourhood of shuttered
// shops across the harbour. Bo's Echo Friend: "Nobody remembers us. So we're going to where nobody
// remembers anything." Master Fang goes very still. Across the water, the friends keep the grey
// Grumblings company and ask their Charm Sprites what the district remembers. That evening, Master Fang
// tells them the story of the fog, fifty years ago.
// Three places: the Academy in the morning (academyMorning), the Quiet District (district, from
// world/zones/quiet.js) and the Academy at dusk (fangStory). Every wait is on state, so a reload resumes
// at the right step.
import { CylinderGeometry, Color, Mesh, Vector3 } from 'three';
import { G, flag, wait, until } from '../game.js';
import { talk, ask, objective, hint, shot, near } from './helpers.js';
import { writeSave } from '../core/save.js';
import { materialFor } from '../render/materials.js';

const npc = (id) => G.npcs.get(id);
export const MEMORY_IDS = ['notice', 'post', 'sweets', 'teahouse', 'thread'];
const memCount = () => MEMORY_IDS.filter((id) => flag('mem_' + id)).length;

export function chapter3Objective() {
  const f = (k) => flag(k);
  if (!f('ch3_greys')) return 'Something is wrong in the courtyard…';
  if (!f('ch3_arrive')) return 'Meet Bo at the gate: the ferry to the Quiet District';
  if (!f('ch3_return')) {
    const n = memCount();
    if (n < MEMORY_IDS.length) return `Ask your Charm Sprites what the Quiet District remembers (${n}/${MEMORY_IDS.length})`;
    if (!G.collection.has('grey')) return 'Keep a grey Grumbling company until it lets you close';
    return 'Something warm is hidden in the fog at the end of the street…';
  }
  if (!f('ch3Done')) return G.zone?.id === 'academy' ? 'Master Fang is waiting at the pavilion' : 'It’s getting dark: take the ferry home to the Academy';
  return 'Free roam: keep the grey Grumblings company, and check on the neighbours';
}

export function refreshObjective3() {
  objective(chapter3Objective());
}

// ---------------------------------------------------------------- the memories (systems/memories.js)
// sprite: the Charm Sprite who remembers it; figures: golden people from fifty years ago, placed in the
// spot's frame (x = its right, z = in front of it; rot in degrees, 180 = facing back at the spot).
export const MEMORIES = {
  notice: {
    sprite: 'homework',
    clue: 'An old noticeboard. The papers are so faded I can’t read a single word…',
    lines: [
      [null, 'Unfinished Homework reads the faded paper aloud, in a small, careful voice.'],
      ['Notice, fifty years ago', 'FOG ADVISORY. Stay indoors. Keep your windows shut. And please: check on your neighbours.'],
      ['Neighbour', 'Mrs Lau? It’s only me. I brought you some soup. Are you all right in there?'],
      ['Neighbour', 'Everyone is so tired lately. Nobody wants to go out in this fog.'],
      [null, 'The fog stayed for weeks. One by one, people stopped knocking.'],
    ],
    figures: [{ model: 'folk_c', x: 0.6, z: 1.6, rot: 150, anim: 'talk' }, { model: 'folk_a', x: -1.2, z: 2.6, rot: 200, anim: 'shy' }],
  },
  post: {
    sprite: 'cloud',
    clue: 'Cold fog-water drips out of the letterbox. Everything inside must be soaked through.',
    lines: [
      [null, 'The Soggy Cloud spreads itself over the letterbox like an umbrella. The dripping stops… and the letters remember.'],
      ['Postman', 'Another letter for the Chans. And one for young Mei. Nobody has been collecting their post.'],
      ['Postman', 'Hello? …I’ll leave them by the door. Somebody will write back. Surely.'],
      [null, 'Nobody wrote back. The letters piled up, and after a while the postman stopped coming.'],
    ],
    figures: [{ model: 'folk_b', x: -0.3, z: 1.4, rot: 160, anim: 'talk' }],
  },
  sweets: {
    sprite: 'sock',
    clue: 'A smell, very faint, from under the shutter… lemons?',
    lines: [
      [null, 'The Lost Sock sniffs along the shutter and finds a lemon-candy wrapper, pressed flat in the crack.'],
      ['Sweet-shop owner', 'Lemon candies again? You must eat a hundred a week!'],
      ['A little girl', 'They’re not for me. They’re for later. For everyone! In case somebody is sad.'],
      ['Sweet-shop owner', 'Ha! Then here’s one more. For you, sweetheart. In case YOU are sad.'],
      ['xiaopei', 'Lemon candies… for everyone?', { face: 'surprised', memory: false }],
    ],
    figures: [{ model: 'folk_c', x: 0.2, z: 1.7, rot: 180, anim: 'talk' }, { model: 'folk_kid', x: -0.4, z: 0.7, rot: 0, anim: 'wave' }],
  },
  teahouse: {
    sprite: 'pompom',
    clue: 'An empty mahjong table. One chair is pushed right in, as if nobody ever sat there.',
    look: 1.6,
    lines: [
      [null, 'The Picked-Last Pom-pom cheers as loudly as it can. “Pick me! Pick me!” …and the teahouse remembers its noise.'],
      ['Old friend', 'Your turn, Lau! You always take so long. The tea is going cold!'],
      ['Old friend', '…Lau? Has anyone seen Lau this week? Or the week before?'],
      [null, 'Every year one more chair was pushed in. After a while, nobody came at all.'],
    ],
    figures: [{ model: 'folk_a', x: 0.8, z: 1.6, rot: -90, anim: 'sit' }, { model: 'folk_c', x: -0.8, z: 1.6, rot: 90, anim: 'sit', overlay: 'talk' }],
  },
  thread: {
    sprite: 'sparrow',
    clue: 'A crooked trail of red thread runs off down the alley…',
    look: 8,
    lines: [
      [null, 'The Wistful Sparrow follows the thread, hop by hop, all the way to the little shop at the end of the alley.'],
      ['Thread-shop owner', 'Red thread, for the girl in the big cardigan. What will you tie with it?'],
      ['A little girl', 'I don’t know yet. Something that came undone?'],
      ['Thread-shop owner', 'Good answer. Red thread is for tying things back together. People, mostly.'],
      ['tangtang', 'That’s Grandma’s thread shop! She always said red thread was for people, not for socks.', { memory: false }],
    ],
    figures: [{ model: 'folk_b', x: 0, z: 9.2, rot: 180, anim: 'pat' }, { model: 'folk_kid', x: 0.3, z: 8.4, rot: 0, anim: 'shy' }],
  },
  kitchen: {
    sprite: 'grey',
    clue: 'Something warm is hidden in the fog here… a door? I can hardly see it.',
    hidden: () => !G.collection.has('grey') || memCount() < MEMORY_IDS.length,
    look: 1.4,
    lines: [
      [null, 'The Grey Grumbling lets out a long, slow sigh… and the fog in front of the door thins, just a little.'],
      ['Grandmother', 'Autumn! Your tea is ready. Five more minutes, then home, all right?'],
      ['A little girl', 'Five more minutes, Grandma… I don’t want to go yet. It’s so warm in here.'],
      ['Grandmother', 'Then stay. There is always room at this table. Always.'],
    ],
    figures: [{ model: 'folk_c', x: 0.2, z: 1.3, rot: 180, anim: 'idle', overlay: 'stir' }, { model: 'folk_kid', x: -0.6, z: 0.6, rot: 30, anim: 'shy' }],
    async after() {
      const p = G.player;
      p.doudou.userData.awake = true;
      await talk([
        ['xiaopei', 'Autumn… isn’t that Master Fang’s name?', { face: 'surprised' }],
        [null, 'In Pip’s hood, Bean is wide awake, staring at the warm door in the fog. He doesn’t say a word.'],
        ['tangtang', 'It’s getting dark. Master Fang said to be home before the lanterns are lit!'],
        ['weibao', '…let’s go home. She’ll want to hear all of this.'],
      ]);
      p.doudou.userData.awake = false;
      flag('ch3_return', true);
      writeSave(G.save);
      G.frozen = true; // the memory ends its own scene
    },
  },
};

// ---------------------------------------------------------------- the Academy, the morning after
// Where everyone is at the Academy during Chapter 3 (the zone calls this when it loads).
export function placeCast3(z) {
  const fang = npc('fang'),
    tt = npc('tangtang'),
    wb = npc('weibao');
  const at = (n, pos, facing) => n?.place(pos, facing, z.collision); // the zone may still be loading
  const stand = (n) => {
    if (!n) return;
    n.base = 'idle';
    n.h.play('idle', 0.2);
    n.lookAtPlayer = true;
  };
  const court = z.marker('POINT_fang_court').position;
  const gate = z.marker('SPAWN_gate').position;
  const pav = z.marker('POINT_fang_lesson');
  if (flag('ch3_return')) {
    // dusk: Master Fang by the pavilion; Bo on his lesson bench until the story, then at the gate
    at(fang, pav.position, pav.facing);
    if (flag('ch3Done')) {
      stand(wb);
      at(wb, gate.clone().add(new Vector3(1.6, 0, -1.8)), Math.PI);
      at(tt, z.marker('POINT_kitchen').position, Math.PI / 2);
    }
  } else {
    // the grey morning: the friends in the courtyard (then waiting at the gate), Master Fang behind them
    stand(wb);
    stand(tt);
    at(fang, court.clone().add(new Vector3(-1.0, 0, -3.8)), 0);
    if (flag('ch3_greys')) {
      at(wb, gate.clone().add(new Vector3(1.6, 0, -1.8)), Math.PI);
      at(tt, gate.clone().add(new Vector3(-1.4, 0, -1.6)), Math.PI);
    } else {
      at(tt, court.clone().add(new Vector3(1.3, 0, 1.2)), 0);
      at(wb, court.clone().add(new Vector3(-1.4, 0, 1.4)), 0);
    }
  }
  if (fang)
    fang.onTalk = () =>
      talk([['fang', flag('ch3Done')
        ? 'Check on your neighbours, dear. Even the shy ones. Especially the shy ones.'
        : flag('ch3_greys')
          ? 'The grey ones will not want a hug. Stay with them anyway. Staying is its own kind of lullaby.'
          : 'Grey Grumblings, drifting… I have not seen that in a very long time.']]);
}

// The Academy zone (world/zones/academy.js) calls this after Chapter 2.
export async function chapter3Academy(z) {
  if (flag('ch3_return') && !flag('ch3_story')) return fangStory(z);
  if (!flag('ch3_greys')) await greyMorning(z);
  refreshObjective3();
}

async function greyMorning(z) {
  const p = G.player,
    fang = npc('fang'),
    tt = npc('tangtang'),
    wb = npc('weibao');
  const court = z.marker('POINT_fang_court').position;
  if (!flag('ch3_start')) {
    G.frozen = true;
    G.ui.card('Chapter 3', 'The Quiet District', 2.8);
    await wait(3.2);
    await talk([[null, 'The next morning, the sky over Mistbloom is grey. Even the courtyard sprites have stopped playing tag.']]);
    flag('ch3_start', true);
    writeSave(G.save);
    G.frozen = false;
  }
  refreshObjective3();
  // three grey Grumblings drift across the courtyard toward the gate, and down the hill to the harbour
  const gate = z.marker('SPAWN_gate').position;
  const greys = z.morningGreys || [];
  await until(() => near(court, 9) && !G.frozen);
  G.frozen = true;
  shot('CAM_welcome', greys[0]?.position || court, 0.4, 1.2);
  await talk([
    ['xiaopei', 'Those Grumblings… they’re grey. And so heavy. They’re barely floating.', { face: 'worried' }],
    ['tangtang', 'Poor things! Here, little one, a tart. A fresh one!'],
    [null, 'The grey Grumbling doesn’t even look at the tart.'],
  ]);
  G.cam.clearShot();
  G.frozen = false;
  objective('Try humming to the grey Grumblings');
  hint('hum', 4);
  let t = 0,
    tried = 0;
  await until(() => {
    t += 1 / 60;
    if (p.humming && greys.some((g) => G.soothe.target === g)) tried += 1 / 60;
    return (tried > 1.2 || t > 16) && !G.frozen;
  });
  G.frozen = true;
  shot('CAM_welcome', greys[0]?.position || court, 0.4, 1.0);
  await talk([
    ['xiaopei', 'They won’t let me near. They don’t want to be hugged at all…', { face: 'sad' }],
    ['weibao', '…let me ask them.'],
  ]);
  wb?.h.overlayPlay('puppet', 0.2);
  G.audio.play('honk');
  await talk([['honk', '(in a tiny, sad voice) …NOBODY REMEMBERS US. SO WE’RE GOING TO WHERE NOBODY REMEMBERS ANYTHING.']]);
  wb?.h.overlayPlay(null, 0.3);
  shot('CAM_welcome', fang.position, 0.8, 1.0);
  fang.lookAtPlayer = false;
  fang.setAnim('idle', 0.4);
  await wait(1.4);
  await talk([
    [null, 'Master Fang has come up behind them. She goes very, very still.'],
    ['tangtang', 'Master Fang? Where are they going?'],
    ['fang', '…Across the harbour. To the Quiet District, I should think.'],
    ['fang', 'Go and see where they gather, the three of you. Stay together. Keep them company if they will let you.'],
    ['fang', 'And be home before the lanterns are lit. I… have a story to tell you tonight.'],
    ['honk', 'THE FERRY LEAVES FROM THE HARBOUR. I WILL MEET YOU AT THE GATE. HONK.'],
  ]);
  fang.lookAtPlayer = true;
  G.cam.clearShot();
  for (const g of greys) g.opts.path = [g.position.clone(), gate.clone().add(new Vector3((Math.random() - 0.5) * 3, 0, 4)), gate.clone().add(new Vector3(0, 0, 14))];
  flag('ch3_greys', true);
  writeSave(G.save);
  G.frozen = false;
  if (wb) wb.walkTo(gate.clone().add(new Vector3(1.6, 0, -1.8)), 2.0).then(() => (wb.homeFacing = Math.PI));
  if (tt) tt.walkTo(gate.clone().add(new Vector3(-1.4, 0, -1.6)), 2.0).then(() => (tt.homeFacing = Math.PI));
  refreshObjective3();
}

// ---------------------------------------------------------------- across the harbour
export async function district(z) {
  const tt = npc('tangtang'),
    wb = npc('weibao');
  if (!flag('ch3_arrive')) await arrival(z);
  tt?.follow({ x: 1.3, z: 0.6 });
  wb?.follow({ x: -1.3, z: 0.9 });
  wireFriends(z);
  refreshObjective3();
  z.memories.afterEach = memoryLines;
  z.on('grey-ready', async () => {
    if (flag('greyReadyTalk')) return;
    flag('greyReadyTalk', true);
    await until(() => !G.frozen && !G.ui.dialogueOpen);
    await talk([
      ['xiaopei', 'It’s looking at me… Maybe it just needed someone to stay.', { face: 'smile' }],
      ['weibao', '…now it might let you hum to it.'],
    ]);
  });
  z.on('sprite', async ({ id, first }) => {
    if (id !== 'grey' || !first) return;
    await wait(2.2);
    await until(() => !G.frozen && !G.ui.dialogueOpen);
    await talk([
      ['tangtang', 'It’s glowing! A grey Charm Sprite… it looks so much lighter now.'],
      ['honk', 'IT REMEMBERS THINGS NOBODY ELSE DOES. MAYBE IT CAN FIND WHAT THE FOG IS HIDING. HONK.'],
    ]);
    refreshObjective3();
  });
  z.on('flag', ({ name }) => {
    if (name.startsWith('mem_') || name === 'ch3_return') refreshObjective3();
  });
}

async function arrival(z) {
  const p = G.player;
  G.frozen = true;
  shot('CAM_arrive', z.marker('POINT_arrive').position, 1.0, 0.01);
  await wait(0.8);
  G.audio.play('foghorn');
  await talk([
    [null, 'The ferry bumps against the old jetty. Across the water, the market is waking up; here, everything is grey and shut.'],
    ['tangtang', 'The Quiet District… my grandma used to buy thread here. It was never quiet back then.'],
    ['weibao', '…the grey ones are all drifting down the lane. Toward the fog.'],
    ['xiaopei', 'Everything here looks like it forgot what colour it was.', { face: 'worried' }],
    ['honk', 'CHARM SPRITES REMEMBER THE FEELING THEY CAME FROM. MAYBE THEY CAN REMEMBER THIS PLACE TOO. HONK.'],
  ]);
  G.cam.clearShot();
  G.cam.snapBehind(p);
  G.frozen = false;
  flag('ch3_arrive', true);
  writeSave(G.save);
  G.ui.toast('💡 Look for faint glows, then choose which Charm Sprite remembers what’s there. And the grey Grumblings: don’t hum at first. Just stay close.', 7);
}

const MEMORY_LINES = {
  notice: [['weibao', '…“check on your neighbours.” Nobody did, in the end.']],
  post: [['tangtang', 'All those letters, and nobody wrote back… That’s the saddest thing I ever heard.']],
  sweets: [['tangtang', 'Lemon candies for everyone. That sounds like someone we know!']],
  teahouse: [['honk', 'THE CHAIRS REMEMBER. CHAIRS ARE VERY LOYAL. HONK.']],
  thread: [['weibao', '…a girl in a big cardigan. Lemon candies. Red thread.'], ['xiaopei', 'Who was she?', { face: 'worried' }]],
};

async function memoryLines(id) {
  const lines = MEMORY_LINES[id];
  if (lines) await talk(lines);
  if (memCount() === MEMORY_IDS.length && !flag('mem_kitchen')) {
    await talk([
      ['xiaopei', 'The whole district remembers a little girl… and a fog. Where did it all start?', { face: 'worried' }],
      ['weibao', '…at the end of the street, the fog is so thick. Something warm is in there.'],
    ]);
    if (!G.collection.has('grey')) G.ui.toast('💡 The fog hides what’s left. Maybe a grey Grumbling remembers the way: keep one company, then soothe it.', 6);
  }
  refreshObjective3();
}

function wireFriends(z) {
  const tt = npc('tangtang'),
    wb = npc('weibao');
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (tt)
    tt.onTalk = () =>
      talk([['tangtang', pick([
        'The grey ones won’t take my tarts. Not even the custard ones! This is serious.',
        'If you sit down on a bench near a grey one, it comes closer. I saw it!',
        'Grandma said the whole district used to have breakfast in the street. Can you imagine?',
      ])]]);
  if (wb)
    wb.onTalk = () =>
      talk([['honk', pick([
        'THE GREY ONES DO NOT WANT A HUG. THEY WANT SOMEONE TO STAY. STAYING IS HARDER. HONK.',
        'ASK YOUR CHARM SPRITES. THEY REMEMBER WHAT THIS PLACE FORGOT. HONK.',
        'BO USED TO FEEL GREY SOMETIMES. BEFORE HE HAD FRIENDS. HONK.',
      ])]]);
}

// ---------------------------------------------------------------- that evening: Master Fang's story
async function fangStory(z) {
  const p = G.player,
    fang = npc('fang'),
    tt = npc('tangtang'),
    wb = npc('weibao');
  const pav = z.marker('POINT_fang_lesson');
  const seat = z.marker('POINT_lessonseat');
  // a little brazier glowing by the pavilion, and the friends sitting on the lesson benches
  const brazier = new Mesh(new CylinderGeometry(0.32, 0.22, 0.5, 8).translate(0, 0.25, 0), materialFor('plain', { color: 0x4a3a32, vertexColors: false }));
  const fire = pav.position.clone().add(new Vector3(1.4, 0, 1.2));
  brazier.position.copy(fire);
  z.group.add(brazier);
  const glow = G.fx.glows.add(fire.clone().setY(fire.y + 0.6), '#ff9a4a', 1.4);
  z.updaters.push(() => {
    if (Math.random() < 0.3) G.fx.sparkles.emit(fire.clone().setY(fire.y + 0.55), 1, '#ffb05a', { speed: 0.25, up: 0.9, size: 0.1, life: 1.1 });
    G.fx.glows.set(glow, fire.clone().setY(fire.y + 0.6), null, 1.3 + Math.sin(G.time * 9) * 0.15);
  });
  fang.place(pav.position, pav.facing, z.collision);
  refreshObjective3();
  await until(() => near(seat.position, 3.6) && !G.frozen);
  G.frozen = true;
  p.sitOn(seat.position, seat.facing, seat.data.seat ?? 0.89);
  if (tt) {
    // Sunny sits beside her on the lesson bench
    tt.walkTarget = null;
    tt.follow(null);
    const right = new Vector3(Math.cos(seat.facing), 0, -Math.sin(seat.facing));
    tt.sitOn(seat.data.seat ?? 0.89, seat.position.clone().addScaledVector(right, -0.75), seat.facing);
  }
  shot('CAM_lesson', fang.position, 0.8, 1.2);
  G.audio.score?.play('story');
  await talk([
    ['fang', 'You are home, and before the lanterns. Good. Sit, sit. Tell me what you found.'],
    ['tangtang', 'The whole district is grey, Master Fang! But when our Charm Sprites remembered things, the colour came back.'],
    ['weibao', '…a notice about a fog. Letters nobody answered. A teahouse that emptied, one chair at a time.'],
    ['xiaopei', 'And a little girl with lemon candies, and red thread… and a kitchen, hidden in the fog.', { face: 'worried' }],
  ]);
  await wait(0.8);
  await talk([
    [null, 'Master Fang is quiet for a long time. The brazier crackles.'],
    ['fang', 'Fifty years ago, a Grumbling grew so big from everyone’s forgotten feelings that it covered half the city in a grey fog.'],
  ]);
  // the fog of the story rolls over the courtyard while she tells it
  await fogOfTheStory(z, true);
  await talk([
    ['fang', 'Every birthday nobody remembered. Every letter nobody answered. Every “I’m fine, really.” It all rolled together.'],
    ['fang', 'I calmed it once. But only barely, and only because I had help. I had assumed it was gone for good.'],
    ['fang', 'It isn’t a monster. It’s everyone’s loneliness, all rolled together.'],
    ['fang', 'And loneliness always comes back when people stop checking on each other.'],
  ]);
  await fogOfTheStory(z, false);
  await talk([
    ['tangtang', 'Then we’ll check on them! All of them! Every grey one, every neighbour. We’ll bring tarts.'],
    ['honk', 'AND WE WILL LISTEN. LISTENING IS FREE. HONK.'],
    ['fang', '…Yes. You will, won’t you.', { face: 'smile' }],
  ]);
  p.doudou.userData.awake = true;
  G.audio.play('yawn');
  shot('CAM_lesson', p.position, 1.0, 1.0);
  await talk([
    [null, 'In Pip’s hood, Bean is awake again, very quiet, looking at Master Fang.'],
    [null, 'Master Fang looks back at him for a long moment. Then she takes a lemon candy from her pocket and gives it to him, without a word.'],
  ]);
  G.collection.cozy(10, 'A story by the fire', p.position.clone().setY(p.position.y + 1.6));
  p.doudou.userData.awake = false;
  flag('ch3_story', true);
  flag('ch3Done', true);
  writeSave(G.save);
  G.cam.clearShot();
  G.frozen = true;
  await G.ui.card('Chapter 3 complete', 'The Quiet District', 3);
  await G.ui.card('Chapter 4: Bean’s Secret', 'Coming soon — keep the grey Grumblings company, and check on the neighbours', 3.6);
  p.stand(seat.position.clone().add(new Vector3(0, 0, 1.6)));
  G.cam.snapBehind(p);
  G.frozen = false;
  G.audio.mix('academy-dusk');
  refreshObjective3();
}

// The courtyard fills with a cold grey fog while Master Fang tells the story, then it clears.
function fogOfTheStory(z, on) {
  const fog = G.scene.fog;
  if (!fog) return Promise.resolve();
  z.storyFog ||= { color: fog.color.clone(), near: fog.near, far: fog.far };
  const from = { color: fog.color.clone(), near: fog.near, far: fog.far };
  const to = on ? { color: new Color('#9aa0aa'), near: 2, far: 26 } : z.storyFog;
  G.audio.bed('wind', on ? 0.8 : 0);
  return new Promise((res) => {
    let t = 0;
    const fn = (dt) => {
      t = Math.min(1, t + dt / 2.4);
      fog.color.lerpColors(from.color, to.color, t);
      fog.near = from.near + (to.near - from.near) * t;
      fog.far = from.far + (to.far - from.far) * t;
      if (G.scene.background?.isColor) G.scene.background.copy(fog.color);
      if (t >= 1) {
        G.updaters.delete(fn);
        res();
      }
    };
    G.updaters.add(fn);
  });
}
