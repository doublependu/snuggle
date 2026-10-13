// SPDX-License-Identifier: GPL-3.0-only
// The full playthrough's edit list (tools/video/edits/full.json), made from the five recorded parts: where each
// take's loading screen ends, where its chapters start, and where Part 4's take shows the "Lantern Bay" card that
// opens Part 5, all read from the takes' own logs. Then tools/video/edit.mjs cuts the five videos (x264's
// "medium": half the time of "slow" for 90 minutes of video, and no difference once YouTube has re-encoded it).
// (Plan 9 said four parts of about 20 minutes; measured, Chapters 3 and 4 together come to about 29, so Chapter 3
// and Chapter 4 are a part each.)
//
//   node tools/video/parts.mjs <run 1> <run 2> <run 3> <run 4> [<run 5>]   (tools/playtest/out/<run>)
// With four runs, Part 5 is the rest of Part 4's take: a take that played on past the "Lantern Bay" card into
// free roam, until the autoplayer's own ending.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_URL } from './cards.mjs';

const runs = process.argv.slice(2);
if (runs.length < 4 || runs.length > 5) throw new Error('usage: parts.mjs <run 1> <run 2> <run 3> <run 4> [<run 5>]');
const REPO = 'https://github.com/doublependu/snuggle';

// A take: its events, on the video's clock.
function take(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const ev = readFileSync(join(dir, 'log.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .filter((e) => e.type === 'event')
    .map((e) => ({ ...e, v: +(e.t - meta.videoOffset).toFixed(2) }));
  const first = (kind, re = /./) => ev.find((e) => e.kind === kind && re.test(e.text || ''));
  return { dir, video: join(dir, 'playthrough.mp4'), ev, first, begin: first('begin')?.v ?? 0 };
}
const [t1, t2, t3, t4, t5 = t4] = runs.map(take);
const ONE = t5 === t4; // (Parts 4 and 5 in one take)
const chaptersOf = (t, from, to = Infinity) =>
  t.ev.filter((e) => e.kind === 'chapter' && e.v >= from && e.v < to && !/coming soon/i.test(e.text)).map((e) => ({ title: e.text.replace(/: /, ': '), at: e.v }));

// Each part's thumbnail: a scenery shot of its own place (tools/video/shots.mjs), no HUD
const SHOT = (id) => ({ frame: `tools/video/out/shots/${id}.mp4`, at: 5 });
const PARTS = [
  { n: 1, title: 'The Rainy Train and the Night Market', covers: 'the Prologue and Chapters 1 and 2', shot: 'market-street' },
  { n: 2, title: 'The Quiet District', covers: 'Chapter 3', shot: 'quiet-grey' },
  { n: 3, title: 'Bean’s Secret', covers: 'Chapter 4', shot: 'heart-fog-lane' },
  { n: 4, title: 'The Great Sulk, and Morning in Lantern Bay', covers: 'Chapter 5 and the Epilogue', shot: 'heart-sulk' },
  { n: 5, title: 'Lantern Bay: the bonus', covers: 'the free roam after the story', shot: 'academy-pond' },
];
const LAST = PARTS.length;
const spoiler = (p) =>
  p.n === 1
    ? 'This series plays **all** of Snuggle Sorcery, from the first train ride to the ending, and the free roam after it.\nTo play it yourself first: it’s free, in your browser, at'
    : `Part ${p.n} plays ${p.covers}${p.n === 4 ? ', **including the ending**' : ''}.\nTo play it yourself first: it’s free, in your browser, at`;
const opening = (p) => [
  { card: { kind: 'spoiler', text: spoiler(p) }, dur: 6, fadeIn: 0.6, fadeOut: 0.5, chapter: 'Spoiler warning' },
  { card: { kind: 'title', part: `Full playthrough · Part ${p.n}`, sub: p.title }, dur: 4, fadeIn: 0.5, fadeOut: 0.6 },
];
const ending = (p) => ({ card: { kind: 'end', small: `${p.n < LAST ? `Next: Part ${p.n + 1}, ${PARTS[p.n].title}\n` : ''}Open source: github.com/doublependu/snuggle · More at @RadWebGame` }, dur: 20, fadeIn: 0.8, fadeOut: 1 });
const description = (p) => ({
  title: `Snuggle Sorcery · Full playthrough, Part ${p.n}: ${p.title} (no commentary)`,
  text: `Part ${p.n} of ${LAST} of a full playthrough of Snuggle Sorcery: ${p.covers}. Spoilers!

Snuggle Sorcery is a cozy story game in your browser: in the misty harbour city of Lantern Bay, curses born from small worries come out fluffy, and you soothe them by humming a lullaby. Free, no install, no account: https://${GAME_URL}

Played by the game's own autoplayer: a script that plays from what is on screen, like a first-timer.

Chapters:
{chapters}

The whole playthrough: [playlist link]
${p.n > 1 ? `Part ${p.n - 1}: [link]\n` : ''}${p.n < LAST ? `Part ${p.n + 1}: [link]\n` : ''}
Open source (GPL-3.0): ${REPO}
More web games: https://maize.live · @RadWebGame on YouTube and X`,
});

// a few seconds of the loading screen and Begin; a returning save's load is cut to just after Begin
const videos = [];
const p1chapters = chaptersOf(t1, 0);
videos.push({
  name: 'part-1',
  out: 'tools/video/out/full/part-1.mp4',
  segments: [
    ...opening(PARTS[0]),
    { clip: t1.video, from: Math.max(0, t1.begin - 3), to: t1.ev.at(-1).v, fadeIn: 0.5, fadeOut: 1, chapters: p1chapters.map((c) => ({ ...c, at: c.at - Math.max(0, t1.begin - 3) })) },
    ending(PARTS[0]),
  ],
  description: description(PARTS[0]),
  thumb: { ...SHOT(PARTS[0].shot), title: 'Snuggle Sorcery', sub: PARTS[0].title, tag: 'PART 1' },
});
// A take from `from` to `to`, less the stretches in `skip` ([[a, b]], video time), as clips with their chapters
// (each chapter in the piece it falls in). A skip is a cut between two of the game's own cards.
function pieces(t, from, to, ch, skip = []) {
  const out = [];
  let a = from;
  for (const [s0, s1] of [...skip, [to, to]]) {
    const b = Math.min(s0, to);
    if (b - a > 0.5) out.push({ clip: t.video, from: +a.toFixed(2), to: +b.toFixed(2), fadeIn: out.length ? 0.25 : 0.8, fadeOut: s0 >= to ? 1 : 0.25, chapters: ch.filter((c) => c.at >= a - 0.5 && c.at < b).map((c) => ({ ...c, at: Math.max(0, c.at - a) })) });
    a = s1;
  }
  return out;
}
for (const [i, t] of [[1, t2], [2, t3], [3, t4]]) {
  const from = t.begin + 1.2;
  const end = i === 3 ? (t.first('card', /^Lantern Bay/)?.v ?? t.ev.at(-1).v) - 0.3 : t.ev.at(-1).v;
  const cards = (re, title) => t.ev.filter((e) => e.kind === 'card' && re.test(e.text)).map((e) => ({ title: title(e), at: e.v }));
  // (YouTube shows chapters only when there are three or more: Chapters 3 and 4 get their story's beats)
  const obj = (re, title) => t.ev.filter((e) => e.kind === 'objective' && re.test(e.text)).slice(0, 1).map((e) => ({ title, at: e.v }));
  const beats =
    i === 1
      ? t.ev.filter((e) => e.kind === 'toast' && /Memory restored: /.test(e.text)).map((e) => ({ title: 'A memory: ' + e.text.split('Memory restored: ')[1], at: e.v - 20 }))
      : i === 2
        ? [...obj(/^Find a way back/, 'Lost in the fog'), ...obj(/^Bean wants to show/, 'Bean’s secret'), ...obj(/^Stitch the loose ends/, 'Thread Street')]
        : i === 3
          ? [...cards(/^Epilogue/, (e) => e.text.replace(' — ', ': ')), ...cards(/^The End/, () => 'The End')]
          : [];
  const ch = chaptersOf(t, from).concat(beats).sort((x, y) => x.at - y.at);
  // (Part 4: the moment between "Chapter 5 complete" and the Epilogue's card, where the autoplayer had nothing
  // to do and looked round, is cut: from the end of one card to the start of the next)
  const done5 = t.first('card', /^Chapter 5 complete/),
    epi = t.first('card', /^Epilogue/);
  const skip = i === 3 && done5 && epi && epi.v - done5.v > 4.5 ? [[done5.v + 3.9, epi.v - 0.15]] : [];
  videos.push({
    name: `part-${i + 1}`,
    out: `tools/video/out/full/part-${i + 1}.mp4`,
    segments: [...opening(PARTS[i]), ...pieces(t, from, end, ch, skip), ending(PARTS[i])],
    description: description(PARTS[i]),
    thumb: { ...SHOT(PARTS[i].shot), title: 'Snuggle Sorcery', sub: PARTS[i].title, tag: `PART ${i + 1}` },
  });
}
// Part 5: the game's own "Lantern Bay" card (the end of Part 4's take), then free roam
const card = t4.first('card', /^Lantern Bay/);
const from5 = ONE ? card.v - 0.4 : t5.begin + 1.2;
const mark = (title, e) => e && { title, at: e.v - from5 };
// (only from the free roam on: the Epilogue has fishing too, and Chapter 5 was in the square)
const after = (kind, re) => t5.ev.find((e) => e.v >= from5 && e.kind === kind && re.test(e.text || ''));
const ch5 = [
  mark('Day 1: the worry board', after('read', /worry board/i) || after('objective', /worries soothed/)),
  mark('Thread fishing', after('minigame', /fishing/)),
  mark('Day 2: the first-years', after('objective', /Sunny has a job|first-years/)),
  mark('The Everyone Blanket', after('place', /^heart$/)),
]
  .filter(Boolean)
  .sort((a, b) => a.at - b.at);
videos.push({
  name: 'part-5',
  out: 'tools/video/out/full/part-5.mp4',
  segments: [
    ...opening(PARTS[4]),
    ...(card && !ONE ? [{ clip: t4.video, from: card.v - 0.4, to: card.v + 3.6, fadeIn: 0.5, fadeOut: 0.6, chapter: 'Lantern Bay' }] : []),
    { clip: t5.video, from: from5, to: t5.ev.at(-1).v, fadeIn: 0.8, fadeOut: 1.5, chapters: ONE ? [{ title: 'Lantern Bay', at: 0 }, ...ch5] : ch5 },
    ending(PARTS[4]),
  ],
  description: description(PARTS[4]),
  thumb: { ...SHOT(PARTS[4].shot), title: 'Snuggle Sorcery', sub: PARTS[4].title, tag: 'PART 5' },
});
writeFileSync(new URL('edits/full.json', import.meta.url), JSON.stringify({ videos: videos.map((v) => ({ size: [1920, 1080], fps: 60, loudness: -14, preset: 'medium', ...v })) }, null, 1) + '\n');
console.log('✔ tools/video/edits/full.json');
