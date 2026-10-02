// SPDX-License-Identifier: GPL-3.0-only
// Reading the objective the way a player does: what it asks for, and where. Every rule works from the words on
// screen (the objective banner, and tips the game has shown); none of them knows how the game is built.
import { Wander, Reach, Talk, Notice, Soothe, Lead, Company, SitWith, LookCloser, Follow, Sequence, Use } from './goals.js';
import { tokens } from './words.js';

// Split "Soothe the Lost Sock (laundry yard) and the Homework (under the library stairs)" into its items.
function items(list) {
  return list
    .split(/\s+and\s+|,\s*/)
    .map((it) => {
      const m = it.match(/^(.*?)\s*\((.*)\)\s*$/);
      return m ? { what: m[1], where: m[2] } : { what: it, where: '' };
    })
    .filter((x) => x.what.trim());
}
// Someone named in the objective: a name learned from dialogue, or a guess from what the words suggest.
function person(b, name) {
  const w = tokens(name);
  if (w.includes('master') && !b.knows(w)) w.push('old'); // a Master is probably the old teacher
  return w;
}

export const RULES = [
  // (free roam's outing with the first-years: these come before the general "Meet … at the …" below)
  [/^Meet the first-years’ train at Lantern Bay station/i, (b) => new Talk(b, 'The first-years’ train comes in at the station. Bo at the gate knows the way down.', { want: person(b, 'Bo'), place: ['gate'], hint: 'station hill' })],
  [/^The first-years’ train is due/i, (b) => new Reach(b, 'I wait on the platform for the train.', { place: ['platform', 'station'], radius: 3 })],
  [/^Each first-year has the Jitters/i, (b) => new Soothe(b, 'Each first-year has butterflies looping round them. I stand with one, and hum.', ['butterflies'])],
  [/^Walk the first-years up the hill/i, (b) => new Reach(b, 'Up the hill to the Academy, with the first-years behind me.', { place: ['path', 'hill'], keepGoing: true })],
  [/^Stretch your legs/i, (b, m) => new Wander(b, 'The objective says to stretch my legs. I walk down the carriage.', 5)],
  [/^Find out why (.+)/i, (b) => new Reach(b, 'Everyone’s shoes are wet. I look around for what’s dripping.', { kind: 'creature', radius: 4 })],
  [/^Notice (.+)/i, (b, m) => new Notice(b, `The objective says to notice ${m[1]}. I walk up to it.`, tokens(m[1]))],
  [/^Hum the lullaby to (.+)/i, (b, m) => new Soothe(b, `Time to hum the lullaby to ${m[1]}.`, tokens(m[1]))],
  [/^Say hello to (.+)/i, (b, m) => new Talk(b, `I should say hello to ${m[1]}.`, { want: tokens(m[1]) })],
  [/^Follow (\w+) up the hill/i, (b, m) => new Follow(b, `I follow ${m[1]} up the hill.`, person(b, m[1]), ['path', 'hill'])],
  [/^Walk up the hill/i, (b) => new Reach(b, 'Up the hill to the Academy.', { place: ['path', 'hill'], keepGoing: true })],
  [/^Meet (.+?) in the (.+)$/i, (b, m) => new Reach(b, `I go to the ${m[2]} to meet ${m[1]}.`, { kind: 'person', want: person(b, m[1]), place: tokens(m[2]), radius: 2.5 })],
  [/^Attend .*? at the (.+)$/i, (b, m) => new Reach(b, `The lesson is at the ${m[1]}. I go and sit in.`, { place: tokens(m[1]), radius: 0.8 })],
  [/^Bake (.+?) with (\w+) in the (.+)$/i, (b, m) => new Talk(b, `${m[2]} is in the ${m[3]}. I go and bake with her.`, { want: person(b, m[2]), place: tokens(m[3]), hint: 'bake' })],
  [/^Someone is sitting all alone by the (.+?)…?$/i, (b, m) =>
    new Sequence(b, `Someone is alone by the ${m[1]}. I go and see.`, [
      () => new Reach(b, `To the ${m[1]}.`, { place: tokens(m[1]), radius: 4 }),
      () => new Notice(b, 'Who is sitting all alone here? I go up to them.', [], tokens(m[1])),
    ])],
  [/^Meet everyone at the (.+)$/i, (b, m) => new Reach(b, `Everyone is at the ${m[1]}. I head there.`, { place: tokens(m[1]), radius: 2 })],
  [/^Meet (.+?) at the (.+?)(?::|$)/i, (b, m) => new Talk(b, `I go and find ${m[1]} at the ${m[2]}.`, { want: person(b, m[1]), place: tokens(m[2]), hint: b.objective })],
  [/^The night market is down the hill \((\w+) is at the gate\)/i, (b, m) => new Talk(b, `${m[1]} is at the gate. I talk to him.`, { want: person(b, m[1]), place: ['gate'], hint: 'night market' })],
  [/^Follow your nose to the (.+)$/i, (b, m) => new Reach(b, `Dumplings! I follow my nose to the ${m[1]}.`, { place: tokens(m[1]), radius: 2.5 })],
  [/^Soothe (.+)$/i, (b, m) => {
    const [first] = items(m[1]);
    const place = tokens(first.where);
    if (/sparrow/i.test(first.what)) {
      const at = m[1].match(/at the (.+)$/i);
      return new Soothe(b, `The sparrows at the ${at?.[1] || 'stall'}: I try humming to them.`, ['sparrow'], { place: at ? tokens(at[1]) : [], tryFor: 4 });
    }
    return new Soothe(b, `First, ${first.what}${first.where ? ' (' + first.where + ')' : ''}. I go and find it.`, tokens(first.what), { place });
  }],
  [/^Sit on the stool by the (.+)$/i, (b, m) => new SitWith(b, `A stool by the ${m[1]}. I go and sit with them.`, tokens(m[1]))],
  [/^Sit with the sparrows (?:at|by) the (.+?)(?: and |$)/i, (b, m) => new SitWith(b, `More sparrows at the ${m[1]}. I go and sit with them.`, tokens(m[1]))],
  [/^Walk home along the (.+)$/i, (b, m) => new Reach(b, `Home along the ${m[1]}.`, { place: tokens(m[1]), radius: 1.5 })],
  [/^Walk home: up the stairs/i, (b) => new Reach(b, 'Up the stairs, home to the Academy.', { place: ['stairs', 'up'], keepGoing: true })],
  [/^Something is wrong in the (.+?)…?$/i, (b, m) => new Reach(b, `Something is wrong in the ${m[1]}. I go and look.`, { place: tokens(m[1]), radius: 3 })],
  [/^Try humming to the grey/i, (b) => new Soothe(b, 'The objective says to try humming to the grey ones.', ['grey'], { tryFor: 3 })],
  [/^Ask your Charm Sprites what the (.+) remembers/i, (b) => new LookCloser(b, 'I look for faint glows, and ask my Charm Sprites what they remember.')],
  [/^Keep a grey Grumbling company/i, (b) => new Company(b, 'I keep a grey Grumbling company: close by, no humming.')],
  [/^Something warm is hidden in the fog at the end of the street/i, (b) => new LookCloser(b, 'Something warm in the fog at the end of the street. I go and look.', ['fog', 'end', 'street'])],
  [/take the ferry home/i, (b) => new Talk(b, 'It’s getting dark. I find the ferry home.', { want: ['ferry', 'boat'], place: ['ferry', 'jetty'], hint: 'home academy' })],
  // ---- the Epilogue, and free-roam Lantern Bay (Chapters 4 and 5 are not in the playbook yet: see README)
  [/^Breakfast in the street/i, (b) => new Use(b, 'There is a table out in the lane, and people at it. I go and sit down.', ['table', 'breakfast', 'bench'], /breakfast/i, ['lane', 'table'])],
  [/^Someone is fishing at the end of the ferry jetty$/i, (b) => new Talk(b, 'Someone is fishing at the end of the jetty. I go and say hello.', { place: ['ferry', 'jetty'], hint: 'fishing' })],
  [/^Take the ferry home to Mistbloom Academy/i, (b) => new Talk(b, 'The ferry home. I find the ferryman.', { want: ['ferry', 'boat'], place: ['ferry', 'jetty'], hint: 'home academy' })],
  [/^Master Fang is waiting at her pavilion$/i, (b) => new Reach(b, 'Master Fang is waiting at her pavilion. I go.', { kind: 'person', want: person(b, 'Master Fang'), place: ['pavilion'], radius: 3 })],
  [/^Sunny has a job for you: she’s at the kitchen/i, (b) => new Talk(b, 'Sunny has a job for me. She’s at the kitchen.', { want: person(b, 'Sunny'), place: ['kitchen'], hint: 'job' })],
  [/^Lantern Bay, day (\d+) · worries soothed (\d)\/3/i, (b, m) => {
    // the day's worries are on the board at the gate: read it, soothe the one that is here, then try the fishing
    // (one has been soothed since I read the board: I go back and see what is left)
    if (b.mem.worries && b.mem.readAt !== m[2]) b.mem.worries = null;
    if (!b.mem.worries) {
      b.mem.readAt = m[2];
      return new Use(b, b.mem.worried ? 'One less worry. I go back to the board to see what is left.' : 'A new day in Lantern Bay. There is a board by the gate with notes on it: I go and read it.', ['board', 'notes'], /worry board/i, ['gate']);
    }
    // (each one gets two goes: the first may be cut short when another is soothed and I go back to the board)
    const tries = (b.mem.worried ||= new Map());
    const name = { academy: /Mistbloom Academy/, quiet: /Quiet District/, market: /night market/i, station: /station/i, heart: /Old Quarter/ }[b.nav.place] || /Mistbloom Academy/;
    const here = b.mem.worries.find((n) => name.test(n) && (tries.get(n) || 0) < 2);
    if (here && +m[2] < 3) {
      tries.set(here, (tries.get(here) || 0) + 1);
      const kind = [['cloud', /Cloud/], ['sock', /Sock/], ['homework', /Homework/], ['pom-pom', /Pom-pom/], ['butterflies', /Jitters/], ['envelope', /Letter/]].find(([, re]) => re.test(here));
      const where = tokens((here.match(/on the (.+?) step|in the (.+?) (?:yard|that)|under the (.+?) stairs|by the (\w+)/) || []).slice(1).filter(Boolean).join(' '));
      return new Soothe(b, `The board says: “${here.slice(0, 90)}…” I go and find it.`, kind ? [kind[0]] : [], { place: where });
    }
    if (!b.fished && b.nav.place === 'academy') return new Use(b, 'Nothing more on the board for here. The water glints by the pond bridge: I try the thread fishing.', ['glint', 'water', 'fish'], /Cast the thread/i, ['bridge', 'pond']);
    // the rest are somewhere else: Bo at the gate knows every way
    const next = b.objective.match(/next: ([^,]+)/)?.[1];
    if (next && b.nav.place === 'academy') return new Talk(b, `The next worry is in ${next}. Bo at the gate knows the way.`, { want: person(b, 'Bo'), place: ['gate'], hint: next });
    return new Wander(b, 'A quiet day in Lantern Bay. I have a walk round.', 20);
  }],
  [/^(.+?) is waiting at the (.+)$/i, (b, m) => new Reach(b, `${m[1]} is waiting at the ${m[2]}. I go.`, { place: tokens(m[2]), radius: 0.8 })],
];

// Tips and lines the game shows, and what a player takes from them.
export const REACTIONS = [
  [/lead it to the (.+?) where/i, (b, m) => (b.goal = new Lead(b, `The tip says to lead it to the ${m[1]}. I walk there; it follows me.`, ['pom-pom'], ['charm', 'sprite', 'tag']))],
  [/toss .*tart|Assist/i, (b) => (b.know.assist = true)],
  [/Press Hum again right as the ring pulses/i, (b) => (b.know.beat = true)],
  [/choose which Charm Sprite remembers/i, (b) => (b.want.book = true)],
  [/New Charm Sprite/i, (b) => b.mem.abilities && (b.want.book = true)], // read what the new one can do
  [/don’t hum at first\. Just stay close/i, (b) => (b.know.company = true)],
];

export function planFor(b, objective) {
  for (const [re, make] of RULES) {
    const m = objective.match(re);
    if (m) return make(b, m);
  }
  return null;
}
