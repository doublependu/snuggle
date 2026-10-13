// SPDX-License-Identifier: GPL-3.0-only
// The trailer, the X video and the Short (tools/video/edits/trailer.json, x.json, short.json), made from the
// recorded takes and the scenery shots: each moment is found in a take's own log (a toast, a mini-game, a
// thought: "✨ New Charm Sprite: Lost Sock", "Stitched."), so a re-recorded take gives a new cut with no times
// typed in. Clips are whole bars of the score (84 bpm), so cuts fall on the beat. Then tools/video/edit.mjs
// cuts them. Spoiler-free (ai/plan_9.md §6.2): nothing of the ending, Bean's secret or the Epilogue's story
// (so not the Everyone Blanket over the square either).
//
//   node tools/video/moments.mjs [--takes tools/playtest/out/takes] [--shots tools/video/out/shots]
//   (takes: part-1 … part-5 from the playthrough; short-fresh, short-market, short-heart, short-free in portrait)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_URL } from './cards.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const TAKES = opt('takes', 'tools/playtest/out/takes');
const SHOTS = opt('shots', 'tools/video/out/shots');
const MUSIC = 'tools/video/out/music';
const DRY = args.includes('--dry'); // (check the moments are found in development runs' logs: no video, nothing written)
const BAR = (60 / 84) * 4; // 2.857 s
const missing = [];

// A take's events (thoughts too), on its video's clock.
const takes = new Map();
function take(name) {
  if (takes.has(name)) return takes.get(name);
  // 'part-4+': the free roam at the end of Part 4's take, when it played on past the "Lantern Bay" card
  if (name.endsWith('+')) {
    const t = take(name.slice(0, -1));
    const card = t?.ev.find((e) => e.kind === 'card' && /^Lantern Bay/.test(e.text));
    const tail = card ? { ...t, ev: t.ev.filter((e) => e.v >= card.v) } : null;
    takes.set(name, tail);
    return tail;
  }
  const dir = join(TAKES, name);
  let t = null;
  if (existsSync(join(dir, 'log.jsonl')) && (DRY || existsSync(join(dir, 'playthrough.mp4')))) {
    const meta = DRY ? { videoOffset: 0 } : JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    const ev = readFileSync(join(dir, 'log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((e) => e.type === 'event' || e.type === 'think')
      .map((e) => ({ kind: e.kind || 'think', text: e.text || '', v: +(e.t - meta.videoOffset).toFixed(2) }));
    t = { video: join(dir, 'playthrough.mp4'), ev };
  }
  takes.set(name, t);
  return t;
}
// The moment: the nth event of a kind whose text matches, in a take.
function find(name, kind, re, nth = 0) {
  return take(name)?.ev.filter((e) => e.kind === kind && re.test(e.text))[nth]?.v ?? null;
}
// A clip of a take: `bars` long, starting `before` seconds before the moment.
function clip(name, kind, re, before, bars, extra = {}) {
  const { nth = 0, ...rest } = extra;
  const v = find(name, kind, re, nth);
  if (v == null) {
    missing.push(`${name}: ${kind} ${re}${nth ? ' #' + (nth + 1) : ''}`);
    return null;
  }
  const from = Math.max(0, v - before);
  return { clip: take(name).video, from: +from.toFixed(2), to: +(from + bars * BAR).toFixed(2), where: 'low', ...rest };
}
// A scenery shot (tools/video/shots.mjs), from just after its start.
function shot(id, bars, extra = {}) {
  const file = join(SHOTS, id + '.mp4');
  if (!existsSync(file)) {
    missing.push(`shot ${id}`);
    return null;
  }
  return { clip: file, from: 0.25, to: +(0.25 + bars * BAR).toFixed(2), mute: true, ...extra };
}
const card = (c, bars, extra = {}) => ({ card: c, dur: +(bars * BAR).toFixed(2), ...extra });

// Lay out sections: their segments one after another, a caption per segment that has one, a music cue per
// section (fading over the join).
function build(sections, { portrait = false } = {}) {
  const segments = [],
    overlays = [],
    music = [];
  let t = 0;
  for (const sec of sections) {
    const start = t;
    for (const s of sec.items) {
      if (!s) continue;
      const { caption, where, ...seg } = s;
      const dur = seg.dur ?? seg.to - seg.from;
      if (caption) overlays.push({ card: { kind: 'caption', text: caption, where: portrait ? 'top' : where || 'bottom' }, at: +(t + 0.25).toFixed(2), dur: +(dur - 0.5).toFixed(2) });
      segments.push(seg);
      t += dur;
    }
    if (sec.music && t > start) {
      const lead = music.length ? 1 : 0; // (starts a second early, under the end of the one before)
      music.push({ file: join(MUSIC, sec.music + '.wav'), at: +(start - lead).toFixed(2), from: 2.5, dur: +(t - start + lead + 1).toFixed(2), fadeIn: lead ? 1.5 : 0.5, fadeOut: 2 });
    }
  }
  return { segments, overlays, music, length: t };
}

// ---------------------------------------------------------------- the trailer (YouTube, 16:9, ~4:30)
const P1 = 'part-1',
  P2 = 'part-2',
  P3 = 'part-3',
  P5 = existsSync(join(TAKES, 'part-5', 'log.jsonl')) ? 'part-5' : 'part-4+';
const trailer = build([
  { music: 'train', items: [
    shot('train-carriage', 3, { fadeIn: 1 }),
    clip(P1, 'think', /^Time to hum the lullaby/, 2, 4, { caption: 'A little rain cloud, sulking on everyone’s shoes.' }),
    card({ kind: 'title', sub: 'A cozy story game where you hum curses to sleep' }, 2, { fadeIn: 0.3, fadeOut: 0.3 }),
  ] },
  { music: 'academy', items: [
    shot('academy-gate', 3, { caption: 'In Lantern Bay, curses born from small worries…' }),
    shot('academy-court', 3, { caption: '…come out **fluffy**.' }),
    clip(P1, 'toast', /New Charm Sprite: Lost Sock/, 9, 4, { caption: 'You don’t fight them. You **soothe** them.' }),
    shot('academy-pond', 2),
    clip(P1, 'toast', /New Charm Sprite: Unfinished Homework/, 9, 3, { caption: 'Notice them. Hum. Wrap them in glowing yarn.' }),
    clip(P1, 'minigame', /Perfect/, 2, 3, { caption: 'Bake with your friends.' }),
    clip(P1, 'toast', /It calms best with company/, 0, 3, { caption: 'Some of them just need company.' }),
    clip(P1, 'toast', /New Charm Sprite: Picked-Last Pom-pom/, 7, 3, { caption: 'Each one you soothe becomes a **Charm Sprite**.' }),
    shot('academy-overlook', 2),
    shot('academy-pagoda', 2),
  ] },
  { music: 'market', items: [
    shot('market-street', 3, { caption: 'A night market by the harbour.' }),
    clip(P1, 'toast', /New Charm Sprite: Wistful Sparrow/, 10, 4, { caption: 'Everyone together.' }),
    clip(P1, 'minigame', /chestnut/, 2, 2),
    clip(P1, 'toast', /lanterns on the water shine/, 8, 3, { caption: 'Float a lantern for someone.' }),
    shot('market-pier', 2),
    shot('market-hook', 2),
  ] },
  { music: 'quiet', items: [
    shot('quiet-grey', 3, { caption: 'Across the water, a district that forgot its colours.' }),
    clip(P2, 'toast', /Memory restored/, 9, 3, { caption: 'Help it remember.', nth: 2 }),
    shot('quiet-banyan-after', 2),
  ] },
  { music: 'fog', items: [
    shot('heart-fog-lane', 3, { caption: 'Then the fog came.' }),
    clip(P3, 'sigh', /./, 1, 3, { caption: 'Something out there is sighing.', nth: 3 }),
    clip(P3, 'toast', /Grey Grumbling joined/, 10, 3, { caption: 'Not everyone wants a hug.' }),
  ] },
  { music: 'bean', items: [
    clip(P3, 'think', /^Stitched/, 8, 3, { caption: 'Stitch the town back together.' }),
    shot('heart-sulk', 3, { caption: 'And something very big is very sad.' }),
  ] },
  { music: 'morning', items: [
    clip(P5, 'minigame', /fishing/, 1, 4, { caption: 'Thread fishing.' }),
    clip(P5, 'read', /worry board/i, 1, 3, { caption: 'A worry board, every morning.' }),
    shot('heart-persimmon', 3, { caption: 'A whole town to look after.' }),
    shot('quiet-after', 2),
  ] },
  { music: 'blanket', items: [card({ kind: 'end' }, 7, { fadeIn: 0.8, fadeOut: 1.5 })] },
]);

// ---------------------------------------------------------------- X (16:9, under a minute; muted by default)
const x = build([
  { music: 'academy', items: [
    clip(P1, 'think', /^Time to hum the lullaby/, 1, 3, { caption: 'In Snuggle Sorcery, curses come out **fluffy**.', fadeIn: 0.3 }),
    clip(P1, 'toast', /New Charm Sprite: Lost Sock/, 8, 3, { caption: 'You don’t fight them. You **hum them to sleep**.' }),
    clip(P1, 'toast', /New Charm Sprite: Wistful Sparrow/, 9, 3, { caption: 'Make friends all over Lantern Bay.' }),
    clip(P2, 'toast', /Memory restored/, 8, 2, { caption: 'Help a forgotten district remember.', nth: 2 }),
    shot('heart-fog-lane', 2, { caption: 'Brave the fog.' }),
    clip(P3, 'think', /^Stitched/, 7, 2, { caption: 'Stitch the town back together.' }),
    clip(P5, 'minigame', /fishing/, 1, 2, { caption: 'Go fishing for lost things.' }),
  ] },
  { music: 'blanket', items: [card({ kind: 'end', small: 'Open source · @RadWebGame' }, 2, { fadeIn: 0.4, fadeOut: 0.6 })] },
]);

// ---------------------------------------------------------------- the Short (9:16, under a minute)
// From the portrait takes; a moment with no portrait take falls back to the middle of the landscape one.
const CROP = [608, 1080, 656, 0]; // (9:16 out of 1920×1080)
function tall(name, land, kind, re, before, bars, extra = {}) {
  if (take(name)) {
    const c = clip(name, kind, re, before, bars, extra);
    if (c) return c;
    missing.pop();
  }
  const c = clip(land, kind, re, before, bars, extra);
  return c && { ...c, crop: CROP };
}
const short = build(
  [
    { music: 'academy', items: [
      // (the rain cloud up the aisle as she walks up to it, then the hum, the thread and the ball of yarn)
      tall('short-fresh', P1, 'think', /^Time to hum the lullaby/, 7, 2, { caption: 'You don’t fight curses here.' }),
      tall('short-fresh', P1, 'think', /^Time to hum the lullaby/, -0.6, 3, { caption: '…you **hum them to sleep**.' }),
      tall('short-market', P1, 'toast', /New Charm Sprite: Wistful Sparrow/, 9, 3, { caption: 'Every one becomes a friend.' }),
      tall('short-heart', P3, 'toast', /Grey Grumbling joined/, 9, 3, { caption: 'Even in the fog.' }),
      tall('short-free', P5, 'minigame', /fishing/, 1, 3, { caption: 'Then go fishing.' }),
    ] },
    { music: 'blanket', items: [card({ kind: 'end', text: 'Free, in your browser.', small: '@RadWebGame' }, 3, { fadeIn: 0.4, fadeOut: 0.6 })] },
  ],
  { portrait: true },
);

if (DRY) {
  console.log(`trailer ${trailer.length.toFixed(0)} s, x ${x.length.toFixed(0)} s, short ${short.length.toFixed(0)} s`);
  console.log('not found:\n  ' + ([...new Set(missing)].join('\n  ') || '(none)'));
  process.exit(0);
}
const desc = (title, text) => ({ title, text });
// (the same words as ai/videos_9.md §2)
const TRAILER_TEXT = `In the misty harbour city of Lantern Bay, curses born from small worries come out fluffy. You don't fight them: you notice them, hum your mother's lullaby, and wrap them in glowing yarn until they fall asleep.

Snuggle Sorcery is a cozy story game in your browser: five chapters, an epilogue, thread fishing and a whole town to look after when the story is done. Free to play, no install, no account: https://${GAME_URL}

Made in the open: three.js, Blender scripts and a lot of patience. Open source (GPL-3.0): https://github.com/doublependu/snuggle

Music: the game's own score. More web games at https://maize.live`;
const out = (name, size, v, extra) => ({ name, out: `tools/video/out/${name}.mp4`, size, fps: 60, loudness: -14, gameGain: -9, segments: v.segments, overlays: v.overlays, music: v.music, ...extra });
writeFileSync(
  new URL('edits/trailer.json', import.meta.url),
  JSON.stringify(out('trailer', [1920, 1080], trailer, { thumb: { frame: join(SHOTS, 'academy-gate.mp4'), at: 6, title: 'Snuggle Sorcery', sub: 'Hum curses to sleep', tag: 'TRAILER' }, description: desc('Snuggle Sorcery · Trailer · a cozy story game where you soothe curses with a lullaby', TRAILER_TEXT) }), null, 1) + '\n',
);
writeFileSync(new URL('edits/x.json', import.meta.url), JSON.stringify(out('x', [1920, 1080], x, {}), null, 1) + '\n');
writeFileSync(new URL('edits/short.json', import.meta.url), JSON.stringify(out('short', [1080, 1920], short, { description: desc('You don’t fight curses here. You hum them to sleep. #Shorts', `Snuggle Sorcery: a cozy story game in your browser. Free, no install: https://${GAME_URL}\n#cozygames #indiegame #webgame #threejs`) }), null, 1) + '\n');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
console.log(`✔ edits/trailer.json ${mmss(trailer.length)}, x.json ${mmss(x.length)}, short.json ${mmss(short.length)}`);
if (missing.length) console.log('  not found (left out):\n  ' + [...new Set(missing)].join('\n  '));
