// SPDX-License-Identifier: GPL-3.0-only
// Reading the objective the way a player does: what it asks for, and where. Every rule works from the words on
// screen (the objective banner, and tips the game has shown); none of them knows how the game is built.
import { Wander, Reach, Talk, Notice, Soothe, Lead, Company, SitWith, LookCloser, Follow, Sequence, Use, Stitch, StandBy, WalkWith, Wait, LookUp, Onward } from './goals.js';
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
  [/^The first-years’ train is due/i, (b) =>
    new Sequence(b, 'The train is due. I wait on the platform.', [
      () => new Reach(b, 'Onto the platform.', { place: ['platform', 'canopy', 'station'], radius: 1.5, through: true }),
      () => new Wait(b, 'I wait for the train, watching the track.', 120),
    ])],
  [/^Each first-year has the Jitters/i, (b) => new Soothe(b, 'Each first-year has butterflies looping round them. I stand with one, and hum.', ['butterflies'])],
  [/^Walk the first-years up the hill/i, (b) => new Reach(b, 'Up the hill to the Academy, with the first-years behind me.', { place: ['path', 'hill'], keepGoing: true })],
  [/^The first-years are waiting on the station platform/i, (b) => new Talk(b, 'The first-years are at the station. Bo at the gate knows the way down.', { want: person(b, 'Bo'), place: ['gate'], hint: 'station' })],
  [/^Show the first-years round: (.+)$/i, (b, m) => {
    b.mem.fy = true;
    if (/Master Fang/i.test(m[1])) return new Reach(b, 'The tour! First, Master Fang at her pavilion.', { kind: 'person', want: person(b, 'Master Fang'), place: ['pavilion'], radius: 3 });
    if (/kitchen/i.test(m[1])) return new Reach(b, 'Next on the tour: Sunny’s kitchen.', { place: ['kitchen'], radius: 3.5 });
    return new Reach(b, 'And the courtyard, where the sprites play tag.', { place: ['courtyard', 'tag', 'sprite'], radius: 3.5 });
  }],
  [/^Sit down with the first-years at the (.+)$/i, (b, m) => new Reach(b, `Last stop: the ${m[1]}. We sit down.`, { place: tokens(m[1]), radius: 2 })],
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
  // ---- Chapter 4: Bean's Secret
  [/^It’s so quiet\. Find (\w+) and (\w+) in the (.+)$/i, (b, m) => new Reach(b, `So quiet. ${m[1]} and ${m[2]} should be in the ${m[3]}.`, { place: tokens(m[3]), radius: 4 })],
  [/^Read the note pinned to the (.+)$/i, (b, m) => new Use(b, `A note pinned to the ${m[1]}. I go and read it.`, ['note', 'pinned', 'post'], /Read (Master Fang’s|the) note/i, tokens(m[1]))],
  [/^Check on the neighbours: up the lane/i, (b) => new Onward(b, 'Up the lane, away from the jetty, to check on the neighbours, keeping to the colour. I knock where there’s a door.', ['ferry', 'jetty'])],
  [/^Get out of the sigh’s way/i, (b) =>
    new Sequence(b, 'A sigh is coming. Behind a wall, or under the porch lantern: somewhere warm.', [
      () => new Reach(b, 'Into the warm light.', { kind: 'warm', radius: 1.2 }),
      () => new Wait(b, 'I wait for it to pass.', 60),
    ])],
  [/^Find a way back to (\w+) and (\w+)(?:: (through|along) (.+))?$/i, (b, m) => {
    const greyInSight = (s) => (s.things || []).some((t) => t.kind === 'creature' && /grey/.test(t.looks) && !t.asleep && t.dist < 14);
    return new Sequence(b, `I have to find a way back to ${m[1]} and ${m[2]}${m[4] ? ', ' + m[3] + ' ' + m[4] : ''}.`, [
      ...(m[4] && !b.mem.passed?.has(m[4]) ? [() => new Reach(b, `${m[3][0].toUpperCase() + m[3].slice(1)} ${m[4]}.`, { place: tokens(m[4]), radius: 3, through: true, then: () => (b.mem.passed ||= new Set()).add(m[4]) })] : []),
      // "along" a street: on down it, away from where it starts, until something's in the way
      ...(m[3] === 'along' ? [() => new Onward(b, `On along ${m[4]}.`, 'heading', { until: greyInSight })] : []),
      () => new Company(b, 'Something grey is in the way. I know what it wants: company.'),
    ]);
  }],
  [/^Bean wants to show you something: (?:\w+, )?up the (.+?)(?:, toward the (.+))?$/i, (b, m) => new Reach(b, `Bean wants to show me something, up the ${m[1]}${m[2] ? ', toward the ' + m[2] : ''}.`, { place: tokens(m[1] + ' ' + (m[2] || '')), keepGoing: true })],
  [/^Walk with the memory/i, (b) => new WalkWith(b, 'A memory, in gold. I walk with it.')],
  [/^Stitch the loose ends of (.+?) back where they belong/i, (b, m) => new Stitch(b, `Loose ends all down ${m[1]}: take one, walk it home, stitch it.`, { place: tokens(m[1]), max: 1 })],
  [/^Follow the thread to your friends/i, (b) => new Reach(b, 'My thread runs on down the street by itself. I follow it.', { place: ['crossroad', 'bench', 'thread'], radius: 3, keepGoing: true })],
  [/^Stitch your friends back/i, (b) => new Stitch(b, 'Don’t soothe them: stitch them. I take my thread to them.', { max: 1 })],
  // ---- Chapter 5: The Great Sulk
  [/^The Great Sulk waits at the heart/i, (b) =>
    b.nav.place === 'academy' ? new Talk(b, 'Back across the water. Bo at the gate knows the way.', { want: person(b, 'Bo'), place: ['gate'], hint: 'Quiet District' }) : new Reach(b, 'Through the fog wall, to the heart of it.', { place: ['fog', 'wall'], keepGoing: true })],
  [/^Follow the street to the heart of/i, (b) => new Reach(b, 'On down the street, to the heart of the district.', { place: ['square', 'fountain', 'heart'], keepGoing: true })],
  [/^Help (\w+) bake at the (.+)$/i, (b, m) => new Talk(b, `${m[1]} wants to bake, at the ${m[2]}. Cake against a sulk!`, { want: person(b, m[1]), place: tokens(m[2]), hint: 'bake' })],
  [/^Check on (\w+): stand by/i, (b, m) => new StandBy(b, `${m[1]} sat down in the sigh. I go and stand by them.`, person(b, m[1]), { radius: 1.3, down: true })],
  [/^Stand by (\w+) while Captain Honk listens/i, (b, m) => new StandBy(b, `${m[1]} is going to listen to it. I stand by him.`, person(b, m[1]), { radius: 2.2 })],
  [/^Stitch each patch to the Charm Sprites/i, (b) => new Stitch(b, 'A loose end hangs from each patch on it. I take one to the sprites with the same picture.', { max: 1 })],
  [/^Help Master Fang: (light the stove|stir the great pot|ring the dinner bell)/i, (b, m) => {
    const [what, label] = /stove/i.test(m[1]) ? [['stove', 'cold'], /Light the stove/] : /pot/i.test(m[1]) ? [['pot'], /Stir the great pot/] : [['bell'], /Ring the dinner bell/];
    return new Use(b, `Master Fang wants help: ${m[1]}.`, what, label, ['fountain', 'kitchen'])
  }],
  [/^Unfold the Everyone Blanket/i, (b) => new Wait(b, 'My turn. I hum the whole lullaby.', 40)],
  [/^Tuck the Great Sulk in/i, (b) => new Use(b, 'It only wants tucking in.', ['blanket', 'edge', 'sleeping'], /Tuck in the Great Sulk/i, ['fountain'])],
  // ---- the Epilogue, and free-roam Lantern Bay
  [/^Breakfast in the street/i, (b) => new Use(b, 'There is a table out in the lane, and people at it. I go and sit down.', ['breakfast', 'table', 'laid'], /breakfast/i, ['lane', 'table'])],
  [/^Someone is fishing at the end of the ferry jetty$/i, (b) => new Talk(b, 'Someone is fishing at the end of the jetty. I go and say hello.', { place: ['ferry', 'jetty'], hint: 'fishing', looks: ['fishing'] })],
  [/^Take the ferry home to Mistbloom Academy/i, (b) => new Talk(b, 'The ferry home. I find the ferryman.', { want: ['ferry', 'boat'], place: ['ferry', 'jetty'], hint: 'home academy' })],
  [/^Master Fang is waiting at her pavilion$/i, (b) => new Reach(b, 'Master Fang is waiting at her pavilion. I go.', { kind: 'person', want: person(b, 'Master Fang'), place: ['pavilion'], radius: 3 })],
  [/^Sunny has a job for you, at the Academy’s kitchen/i, (b) => toAcademy(b, 'Sunny has a job for me at the Academy.')],
  [/^The first-years are waiting to see the Academy/i, (b) => toAcademy(b, 'The first-years want to see the Academy.')],
  [/^Sunny has a job for you: she’s at the kitchen/i, (b) => new Talk(b, 'Sunny has a job for me. She’s at the kitchen.', { want: person(b, 'Sunny'), place: ['kitchen'], hint: 'job' })],
  [/^Lantern Bay, day (\d+) · worries soothed (\d)\/3/i, (b, m) => {
    // something caught that belongs to someone here: take it back first
    const lost = b.mem.giveBack;
    if (lost && (!lost.place || lost.place.test(PLACE_NAMES[b.nav.place] || ''))) return new Use(b, `This belongs to ${lost.who}. I take it back.`, ['someone', 'lost'], /Give it back/i, tokens(lost.who));
    // the day's worries: where would they be written? (a board with notes pinned to it, by the gate). Read it,
    // soothe the one that is here, then try the fishing. One has been soothed since I read the board: I go back
    // and see what is left.
    if (b.mem.worries && b.mem.readAt !== m[2]) b.mem.worries = null;
    if (!b.mem.worries) {
      b.mem.readAt = m[2];
      return new Use(b, b.mem.worried ? 'One less worry. I go back to the board to see what is left.' : 'A new day, and worries to soothe. Where are they written? I look for them.', ['board', 'notes'], /worry board/i, ['gate']);
    }
    // (each one gets two goes: the first may be cut short when another is soothed and I go back to the board)
    const tries = (b.mem.worried ||= new Map());
    const name = { academy: /Mistbloom Academy/, quiet: /Quiet District/, market: /night market/i, station: /station/i, heart: /Old Quarter/ }[b.nav.place] || /Mistbloom Academy/;
    const here = b.mem.worries.find((n) => name.test(n) && (tries.get(n) || 0) < 2);
    if (here && +m[2] < 3) {
      tries.set(here, (tries.get(here) || 0) + 1);
      const kind = [['cloud', /Cloud/], ['sock', /Sock/], ['homework', /Homework/], ['pom-pom', /Pom-pom/], ['butterflies', /Jitters/], ['envelope', /Letter/]].find(([, re]) => re.test(here));
      const where = tokens((here.match(/on the (.+?) step|in the (.+?) (?:yard|that)|under the (.+?) stairs|by the (\w+)|about the (\w+)/) || []).slice(1).filter(Boolean).join(' '));
      // a pom-pom wants company (I learned that with the first one): find it, then lead it to the people it's
      // watching (the breakfast table; the students playing ball)
      if (kind?.[0] === 'pom-pom') {
        const to = /breakfast table/i.test(here) ? ['breakfast', 'table'] : /goal|waving|team/i.test(here) ? ['students', 'ball', 'practice'] : [];
        // (it's somewhere it can see them from: look round there too, if the place it's in isn't one I know)
        return new Sequence(b, `The board says: “${here.slice(0, 90)}…” A pom-pom wants company.`, [
          () => new Notice(b, 'First, the pom-pom.', ['pom-pom'], [...where, ...tokens((here.match(/by the ([A-Z][\w’ ]+?)[,.]/) || [])[1] || ''), ...to]),
          () => new Lead(b, 'Now I lead it over to them.', ['pom-pom'], to),
        ]);
      }
      // (up on the station's platform: in through the station, as for the first-years' train; from the grass
      // beside it the platform's edge is a wall)
      if (/platform/i.test(here) && b.nav.place === 'station')
        return new Sequence(b, `The board says: “${here.slice(0, 90)}…” Up on the platform, then.`, [
          () => new Reach(b, 'Onto the platform.', { place: ['platform', 'canopy', 'station'], radius: 1.5, through: true }),
          () => new Soothe(b, 'There it is. I go and soothe it.', kind ? [kind[0]] : [], { place: where }),
        ]);
      return new Soothe(b, `The board says: “${here.slice(0, 90)}…” I go and find it.`, kind ? [kind[0]] : [], { place: where });
    }
    if (!b.fished && b.nav.place === 'academy') return new Use(b, 'Nothing more on the board for here. The water glints by the pond bridge: I try the thread fishing.', ['glint', 'water', 'fish'], /Cast the thread/i, ['bridge', 'pond']);
    if (!b.fishedHere?.has(b.nav.place) && b.fished && ['quiet', 'market', 'station'].includes(b.nav.place) && (b.fishedHere?.size || 0) < 2) return new Use(b, 'The water glints here too. I try a cast.', ['glint', 'water', 'fish'], /Cast the thread/i, ['jetty', 'pier', 'shore', 'wall']);
    // after the first worry, a look through the Sprite Book's new pages (once)
    if (+m[2] >= 1 && !b.mem.browsed) {
      b.mem.browsed = true;
      b.want.browse = true;
    }
    // the first-years have been shown round: now I want to see the blanket Master Fang hung over the old square
    if (b.mem.fy && +m[1] >= 2 && b.mem.toSee) return seeTheBlanket(b);
    // the rest are somewhere else: Bo at the gate knows every way
    const next = b.objective.match(/next: ([^,]+)/)?.[1];
    if (next && b.nav.place === 'academy') return new Talk(b, `The next worry is in ${next}. Bo at the gate knows the way.`, { want: person(b, 'Bo'), place: ['gate'], hint: next });
    return new Wander(b, 'A quiet day in Lantern Bay. I have a walk round.', 20);
  }],
  [/^Walk back through the Quiet District/i, (b) => new Reach(b, 'Morning. Back through the Quiet District: out through the gateway.', { place: ['gateway', 'quiet', 'district'], keepGoing: true })],
  [/^(.+?) is waiting at the (.+)$/i, (b, m) => new Reach(b, `${m[1]} is waiting at the ${m[2]}. I go.`, { place: tokens(m[2]), radius: 0.8 })],
];

// Back to the Academy from wherever I am: the ferry from the Quiet District, the stairs from the night market,
// the hill path from the station, the gateway out of the Old Quarter.
function toAcademy(b, why) {
  if (b.nav.place === 'quiet') return new Talk(b, `${why} The ferryman goes back to the Academy.`, { want: ['ferry', 'boat'], place: ['ferry', 'jetty'], hint: 'home academy' });
  if (b.nav.place === 'market') return new Reach(b, `${why} Up the stairs to the Academy.`, { place: ['stairs', 'up', 'academy'], keepGoing: true });
  if (b.nav.place === 'station') return new Reach(b, `${why} Up the hill to the Academy.`, { place: ['path', 'hill'], keepGoing: true });
  if (b.nav.place === 'heart') return new Reach(b, `${why} Out through the gateway first.`, { place: ['gateway', 'quiet'], keepGoing: true });
  return new Wander(b, why, 10);
}

// To the old square, to look up at the Everyone Blanket: Bo at the gate (the Quiet District), down its street to
// the gateway where the fog wall was, and on to the square.
function seeTheBlanket(b) {
  if (b.nav.place === 'academy') return new Talk(b, `I want to see ${b.mem.toSee}. Bo at the gate knows the way to the Quiet District.`, { want: person(b, 'Bo'), place: ['gate'], hint: 'Quiet District' });
  if (b.nav.place === 'quiet') return new Reach(b, 'Down the street, through the gateway where the fog wall was.', { place: ['gateway', 'end', 'street'], keepGoing: true });
  if (b.nav.place === 'heart') return new Sequence(b, 'On to the old square.', [() => new Reach(b, 'The old square, with the fountain.', { place: ['fountain', 'square'], radius: 5 }), () => new LookUp(b, 'There it is, over the whole square: the Everyone Blanket. Some of those patches are mine.')]);
  return new Wander(b, 'A walk round.', 20);
}

const PLACE_NAMES = { academy: 'Mistbloom Academy', quiet: 'the Quiet District', market: 'the night market', station: 'the station', heart: 'the Old Quarter' };

// Tips and lines the game shows, and what a player takes from them.
export const REACTIONS = [
  // a catch that belongs to someone ("Take it back to a student in the Academy's courtyard.")
  [/Take it back to (.+?)\.?$/i, (b, m) => {
    const where = m[1].match(/(Academy|Quiet District|night market|station|Old Quarter)/i)?.[1];
    b.mem.giveBack = { who: m[1].replace(/,? in the .*$|, at the .*$/i, ''), place: where ? new RegExp(where, 'i') : null };
  }],
  [/^Pip holds out/i, (b) => (b.mem.giveBack = null)],
  // a memory restored: that glow is done (a wrong guess leaves it to try again)
  [/Memory restored/i, (b) => b.mem.pendingGlow && b.mem.doneGlows.add(b.mem.pendingGlow)],
  // somewhere worth seeing, when there's a moment
  [/hang the blanket over the square|Go and see the square/i, (b) => (b.mem.toSee = 'the Everyone Blanket over the old square')],
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
