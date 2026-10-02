// SPDX-License-Identifier: GPL-3.0-only
// Free-roam Lantern Bay, after the Epilogue: "…but new Grumblings are always being born." Every place is
// open, in its after-the-story state, and there is always something to do:
//   the worry board (systems/worries.js): three worries a day, each a Grumbling to soothe somewhere in town
//   thread fishing (systems/fishing.js) at six spots, with Uncle Ming's requests at the station
//   lost things to take back to their owners, and three new kinds of Grumbling for the Sprite Book
//   the first-years' train to meet (story/firstyears.js), on the first new day
//   the Everyone Blanket over the old square, which grows with every patch earned
// Loaded after Begin, with the zone (story/helpers.js runStory).
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { Vector3 } from 'three';
import { G, flag } from '../game.js';
import { talk, ask, objective } from './helpers.js';
import { writeSave } from '../core/save.js';
import { SPECIES, BOOK_ORDER } from '../content/species.js';
import { species2 } from '../content/species2.js';
import { WORRIES, PLACE } from '../content/worries.js';
import { LOST, FISH } from '../content/catches.js';
import { Worries, today } from '../systems/worries.js';
import { Quilt } from '../procgen/quilt.js';
import { bunting, buntingMesh, breakfastTable } from '../procgen/festive.js';
import * as firstYears from './firstyears.js';

const npc = (id) => G.npcs.get(id);
const worry = (id) => WORRIES.find((w) => w.id === id);

// ---------------------------------------------------------------- what every place gets
async function common(z) {
  await species2();
  const fish = await G.later('fishing');
  if (G.zone !== z) return null;
  fish.setupFishing(z);
  // (the new kinds were not in the book when the zone was entered: her followers and the helper's portrait)
  if (['jitters', 'bottled', 'letter'].some((id) => G.save.sprites[id] > 0 && !G.sprites.list.some((s) => s.id === id)) && G.sprites.list.length < 5) G.sprites.rebuild();
  G.collection.refreshHud();
  const worries = new Worries(z);
  // Brave (the First-Day Jitters' sprite): a Grumbling's sigh doesn't slow her down
  z.updaters.push(() => {
    if (G.player.moveScale < 1 && G.collection.helper('brave')) G.player.moveScale = 1;
  });
  (G.bookPages ||= new Map()).set('bay', bayPage);
  const refresh = () => G.zone === z && objectiveNow(z, worries);
  for (const ev of ['worry', 'day', 'lost-returned', 'helper', 'fish-catch', 'flag']) z.on(ev, refresh);
  refresh();
  bookComplete(z);
  z.on('sprite', () => bookComplete(z));
  return { worries, fish };
}

// What to do next, in a line, and where the guide points: the nearest of the day's worries here (or, with the
// Unsent Letter's Deliver, whoever a lost thing in her pockets belongs to).
function objectiveNow(z, worries) {
  const s = G.save,
    t = today();
  const fy = firstYears.pending(z);
  if (fy) return objective(fy[0], fy[1]);
  const left = t.ids.filter((id, i) => !t.done[i]).map(worry);
  const here = left.filter((w) => w.zone === z.id);
  const others = [...new Set(left.filter((w) => w.zone !== z.id).map((w) => PLACE[w.zone]))];
  let text = `Lantern Bay, day ${t.day} · worries soothed ${3 - left.length}/3`;
  if (!here.length && others.length) text += ` · next: ${others.join(', ')}`;
  objective(text, () => {
    const near = worries.nearest();
    if (near) return near;
    if (G.collection.helper('deliver')) {
      const id = Object.keys(s.lost || {}).find((k) => s.lost[k] === 1 && LOST[k].zone === z.id && npc(LOST[k].owner));
      if (id) return LOST[id].owner;
    }
    return null;
  });
}

// ---------------------------------------------------------------- the Sprite Book's last page
const eleven = () => BOOK_ORDER.filter((id) => (G.save.sprites[id] || 0) > 0 || (SPECIES[id].story && G.save.story[SPECIES[id].story])).length;
function bayPage() {
  const s = G.save,
    f = s.story;
  const count = (re) => Object.keys(f).filter((k) => re.test(k) && f[k]).length;
  const rows = [
    ['✨ Kinds of Charm Sprite', eleven(), BOOK_ORDER.length],
    ['🕯️ Memories of the Quiet District', count(/^mem_/), 6],
    ['🚪 Neighbours checked on', count(/^kind_(barber|noodle|oldman)$/), 3],
    ['🍬 Lemon candies', Object.keys(s.candies).length, 10],
    ['🐟 Fish in the Harbour Book', Object.keys(s.fish || {}).length, Object.keys(FISH).length],
    ['🎒 Lost things given back', Object.values(s.lost || {}).filter((v) => v === 2).length, Object.keys(LOST).length],
    ['📌 Worries soothed', s.worried || 0, 0],
    ['🕊️ Little reminders sent home', s.reminders || 0, 0],
    ['🧵 Patches on the Everyone Blanket', s.patches || 0, 0],
  ];
  return `<h3>Lantern Bay · day ${s.day || 1}</h3><div class="memrow">${rows
    .map(([label, n, of]) => `<span class="mem${of && n >= of ? ' full' : ''}" style="font-size:16px"><b>${of ? n + '/' + of : n}</b><small>${label}</small></span>`)
    .join('')}</div>`;
}

// All eleven entries: a last small scene with Bean, and a gold border on the book.
async function bookComplete(z) {
  if (document.getElementById('book-gold') === null) {
    const st = document.createElement('style');
    st.id = 'book-gold';
    st.textContent = '#menu-book.gold .panel{border-color:#d9a441;box-shadow:0 0 0 4px #f6c56a,0 0 0 6px #d9a441,0 8px 28px #0005}.mem.full{border-color:#d9a441;background:#fbe9b8}';
    document.head.append(st);
  }
  // (the menus load after Begin: until then G.menus is a stand-in that can fetch them)
  const gold = () => {
    const set = () => document.getElementById('menu-book')?.classList.add('gold');
    if (G.menus.load) G.menus.load().then(set);
    else set();
  };
  if (flag('bookDone')) return void gold();
  if (eleven() < BOOK_ORDER.length || z.bookScene) return;
  z.bookScene = true;
  // (when she next has a quiet moment)
  await new Promise((res) => {
    const u = () => {
      if (G.frozen || G.ui.dialogueOpen || G.player.state !== 'move' || G.zone !== z) return;
      G.updaters.delete(u);
      res();
    };
    setTimeout(() => G.updaters.add(u), 5000);
  });
  if (G.zone !== z) return;
  await talk([
    [null, 'The Sprite Book is full: eleven entries, and every one of them a feeling that somebody noticed.'],
    ['doudou', '(from the hood, without opening his eyes) …you know what you did? You remembered all of us.'],
    ['xiaopei', 'Go back to sleep, Bean.', { face: 'smile' }],
    ['doudou', 'Five more minutes.'],
  ]);
  flag('bookDone', true);
  G.audio.play('combo');
  G.collection.cozy(20, 'The Sprite Book, complete', G.player.position.clone().setY(G.player.position.y + 1.6));
  G.ui.toast('📖 The Sprite Book has a gold border now. It suits it.', 4.5);
  writeSave(G.save);
  gold();
}

// ================================================================ Mistbloom Academy
export async function academy(z) {
  const fang = npc('fang'),
    wb = npc('weibao');
  if (!z.group.getObjectByName('bunting')) z.group.add(bunting(z));
  const c = await common(z);
  if (!c) return;
  // the worry board, just inside the gate
  c.worries.board(new Vector3(-3.6, 0, 27.6), Math.PI / 2);
  // Bo at the gate knows every way out
  if (wb)
    wb.onTalk = async () => {
      const a = await ask('honk', 'WHERE TO? CAPTAIN HONK KNOWS EVERY WAY. HONK.', ['The Quiet District', 'The night market', 'The station, down the hill', 'Not yet']);
      G.ui.closeDialogue();
      if (a === 0) G.goto('quiet', 'SPAWN_ferry');
      else if (a === 1) G.goto('market', 'SPAWN_start');
      else if (a === 2) G.goto('station', 'SPAWN_hill');
    };
  let said = 0;
  if (fang)
    fang.onTalk = () =>
      talk([['fang', [
        'A lesson? You gave me one, dear. I am still doing the homework.',
        'New Grumblings every morning, and nobody to blame but people having feelings. Thank goodness.',
        'The worry board at the gate was Sunny’s idea. The spelling on it is also Sunny’s.',
        'Go and see the square, when you’ve a moment. The blanket has grown.',
      ][said++ % 4]]]);
  // a night's sleep: the dormitory door
  const bed = z.marker('POINT_sleepy_2').position.clone().add(new Vector3(2.2, 0, 0));
  z.addInteractable({
    position: bed,
    radius: 2.2,
    label: 'Turn in for the night',
    action: async () => {
      const a = await ask('doudou', 'Bed? It’s the middle of the day. …I’m in.', ['Sleep until tomorrow', 'Not yet']);
      G.ui.closeDialogue();
      if (a !== 0) return;
      G.frozen = true;
      await G.ui.fade(true);
      c.worries.newDay();
      await new Promise((r) => setTimeout(r, 900));
      await G.ui.fade(false);
      G.frozen = false;
      G.ui.bubble(G.player.root, 'Bean: “Five more minutes…”', 2.8, 1.55);
      G.audio.play('yawn');
    },
  });
  firstYears.academy(z);
}

// ================================================================ the station
export async function station(z) {
  const c = await common(z);
  if (!c) return;
  // the fisherman who has always stood here has a name, and things to ask for
  z.whenNPC('fisher', (n) => (n.onTalk = () => c.fish.uncleMing('fisher')));
  firstYears.station(z);
}

// ================================================================ the night market
export const market = common;

// ================================================================ the Quiet District
export async function quiet(z) {
  breakfastTable(z); // it stayed
  const c = await common(z);
  if (!c) return;
  // the neighbours pin their own notes to the old noticeboard now
  c.worries.board(new Vector3(-7.6, 0, -15.2), Math.PI / 2, false);
}

// ================================================================ the Old Quarter
export async function heart(z) {
  canopy(z);
  await common(z);
}

// The Everyone Blanket, hung over the old square between the roofs. Its patches are her own (procgen/quilt.js),
// and more of it is sewn the more patches she has earned; past 400 it gains a new border.
function canopy(z) {
  const patches = () => G.save.patches || 0;
  const big = patches() >= 400;
  const n = (G.quality.name === 'low' ? 14 : 20) + (big ? 2 : 0);
  const size = 19 + (big ? 2 : 0);
  const at = new Vector3(-14, 7.6, 44.5);
  const quilt = new Quilt(z, { n, size, flat: at, seed: 7 });
  quilt.sag = 1.3;
  quilt.still = true;
  quilt.from.copy(at);
  const sewn = () => Math.min(1, 0.45 + (patches() / 200) * 0.55);
  quilt.sew(sewn());
  z.quilt = quilt;
  z.updaters.push((dt) => quilt.update(dt));
  z.on('patch', () => quilt.sew(sewn()));
  // ropes of bunting from its corners to the roofs round the square
  const h = size / 2;
  const corner = (sx, sz) => new Vector3(at.x + sx * h, at.y, at.z + sz * h);
  z.group.add(
    buntingMesh([
      [corner(-1, -1), new Vector3(-30.2, 8.8, 33.4), 0.4],
      [corner(1, -1), new Vector3(2.2, 8.8, 33.4), 0.4],
      [corner(-1, 1), new Vector3(-30.2, 8.8, 60), 0.5],
      [corner(1, 1), new Vector3(2.2, 8.8, 60), 0.5],
    ]),
  );
}
