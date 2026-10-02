// SPDX-License-Identifier: GPL-3.0-only
// The autoplayer: plays Snuggle Sorcery from a new player's point of view, in real time, with real keyboard
// and mouse input, deciding only from what's on screen (see eyes.js for exactly what it can see). Optionally
// records the whole run as one uncut video with the game's sound.
//
//   npm run playtest                      play from a fresh game to the end of the story so far
//   npm run playtest -- --record          ...and record it (tools/playtest/out/<run>/playthrough.mp4)
//   npm run playtest -- --from market     start from a saved point (development only: station ch1 lesson ch2 market ch3 quiet dusk
//                                         ch4 fog heart ch5 epilogue free)
//   npm run playtest -- --until "Chapter 2"   stop at the first card/objective matching this
//   HEADED=1 npm run playtest             watch it in a window
// Options: --retries N (recording: start again from scratch if a run fails), --minutes N (give up after),
// --quality low|medium|high, --out DIR, --swiftshader (software rendering, as in the e2e tests).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installEyes } from './eyes.js';
import { makeHands } from './hands.js';
import { makeLog, fmt } from './log.js';
import { Brain } from './brain.js';
import { audioTap, startRecording, finish } from './record.mjs';

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const RECORD = !!opt('record');
const FROM = opt('from');
const UNTIL = opt('until');
const RETRIES = +opt('retries', RECORD ? 3 : 1);
const MINUTES = +opt('minutes', 150);
const QUALITY = opt('quality');
const PORT = 5198;

// The brain may only see through the eyes and act through the hands: make sure nothing else crept in.
for (const f of ['brain.js', 'goals.js', 'playbook.js', 'nav.js', 'words.js']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  if (/__G|\.evaluate\(|page\./.test(src)) throw new Error(`${f} reaches into the game: the decision code may only use the eyes and hands`);
}

// Development only: start partway through (the recorded run always starts from a fresh game).
const base = (over = {}) => ({ v: 2, zone: 'train', spawn: 'SPAWN_start', story: {}, sprites: {}, soothed: {}, seen: {}, helper: null, cozy: 0, tarts: 0, chestnuts: 0, candies: {}, settings: {}, ...over });
const P = { train_intro: true, prologueTrain: true, prologueDone: true };
const C1 = { ...P, ch1_welcome: true, ch1_lesson: true, sockDone: true, homeworkDone: true, cookDone: true, pompomDone: true, ch1Done: true, weibaoFriend: true };
const C2 = { ...C1, ch2_start: true, ch2_tutorial: true, flock1Done: true, flock2Done: true, flock3Done: true, ch2_dumplings: true, ch2Done: true };
const SP1 = { doudou: 1, cloud: 1, sock: 1, homework: 1, pompom: 1 };
const FROMS = {
  station: base({ zone: 'station', sprites: { doudou: 1, cloud: 1 }, soothed: { 'train:cloud': true, 'train:doudou': true }, story: { train_intro: true, prologueTrain: true } }),
  ch1: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 20, tarts: 2, sprites: { doudou: 1, cloud: 1 }, soothed: { 'train:cloud': true }, story: P }),
  lesson: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 25, tarts: 2, sprites: { doudou: 1, cloud: 1 }, soothed: { 'train:cloud': true }, story: { ...P, ch1_welcome: true } }),
  ch2: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 50, tarts: 3, sprites: SP1, story: C1 }),
  market: base({ zone: 'market', cozy: 50, tarts: 3, sprites: SP1, story: { ...C1, ch2_start: true } }),
  ch3: base({ zone: 'market', cozy: 70, sprites: { ...SP1, sparrow: 12 }, story: C2 }),
  quiet: base({ zone: 'quiet', spawn: 'SPAWN_ferry', cozy: 70, sprites: { ...SP1, sparrow: 12 }, story: { ...C2, ch3_start: true, ch3_greys: true } }),
  dusk: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 90, sprites: { ...SP1, sparrow: 12, grey: 1 }, story: { ...C2, ch3_start: true, ch3_greys: true, ch3_arrive: true, mem_notice: true, mem_post: true, mem_sweets: true, mem_teahouse: true, mem_thread: true, mem_kitchen: true, ch3_return: true } }),
};
// the story's later parts (to watch the autoplayer try them, and to start it in the Epilogue or free roam)
const C3 = { ...C2, ch3_start: true, ch3_greys: true, ch3_arrive: true, mem_notice: true, mem_post: true, mem_sweets: true, mem_teahouse: true, mem_thread: true, mem_kitchen: true, kind_barber: true, kind_oldman: true, ch3_return: true, ch3_story: true, ch3Done: true };
const C4 = { ...C3, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true, ch4_gap: true, ch4_secret: true, ch4_thread: true, ch4_threadTold: true, ch4_followed: true, stitch_bell: true, stitch_letter: true, stitch_lantern: true, stitch_sunny: true, stitch_bo: true, ch4Done: true };
const C5 = { ...C4, ch5_arrive: true, ch5_tier: 3, ch5_score: 12, ch5_p1: true, ch5_heard: 6, ch5_p2: true, ch5_called: true, ch5_p3: true, ch5_kitchen: 3, ch5_p4: true, ch5_golden: 9, ch5_sewn: true, ch5Done: true };
const SP3 = { ...SP1, sparrow: 12, grey: 2 };
Object.assign(FROMS, {
  ch4: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 60, tarts: 2, sprites: SP3, story: C3 }),
  fog: base({ zone: 'quiet', spawn: 'SPAWN_ferry', cozy: 60, tarts: 2, sprites: SP3, story: { ...C3, ch4_start: true, ch4_friends: true, ch4_note: true } }),
  heart: base({ zone: 'heart', spawn: 'SPAWN_garden', cozy: 60, tarts: 2, sprites: SP3, story: { ...C3, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true } }),
  ch5: base({ zone: 'heart', spawn: 'SPAWN_cross', cozy: 60, tarts: 2, sprites: SP3, story: C4 }),
  epilogue: base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 0, sprites: SP3, story: C5 }),
  free: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 30, tarts: 2, sprites: SP3, story: { ...C5, ep_dawn: true, ep_walk: true, ep_breakfast: true, ep_fishing: true, ep_cardigan: true, epilogueDone: true } }),
});
if (FROM && !FROMS[FROM]) throw new Error('--from: one of ' + Object.keys(FROMS).join(' '));

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = opt('out', join('tools/playtest/out', stamp + (FROM ? '-from-' + FROM : '')));
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
await server.listen();
const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const gpu = opt('swiftshader') ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];
const browser = await chromium.launch({ executablePath, headless: !process.env.HEADED, args: [...gpu, '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1280,720'] });

let result = null;
for (let attempt = 1; attempt <= RETRIES && !result; attempt++) {
  const dir = RECORD ? join(OUT, 'attempt-' + attempt) : OUT;
  mkdirSync(dir, { recursive: true });
  result = await playOnce(dir, attempt).catch((e) => {
    console.log(`✘ attempt ${attempt}: ${e.message}`);
    return null;
  });
  if (result && RECORD) {
    // the uncut recording only lands in the run folder when the whole run completed
    for (const f of ['playthrough.mp4', 'log.jsonl', 'thoughts.srt', 'summary.md', 'chapters.txt', 'meta.json']) if (existsSync(join(dir, f))) renameSync(join(dir, f), join(OUT, f));
    rmSync(dir, { recursive: true, force: true });
  }
}
await browser.close();
await server.close();
console.log(result ? `✔ done: ${OUT}` : '✘ no complete run');
process.exit(result ? 0 : 1);

async function playOnce(dir, attempt) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const log = makeLog(dir);
  log.event('run', { text: `attempt ${attempt}${FROM ? ' from ' + FROM : ''}` });
  const errors = [];
  page.on('pageerror', (e) => (errors.push(e.message), log.event('page-error', { text: e.message })));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && m.text().startsWith('[floor]'))) {
      if (/favicon|Failed to load resource/.test(m.text())) return;
      errors.push(m.text());
      log.event('console-error', { text: m.text().slice(0, 400) });
    }
  });
  await page.addInitScript(`(${installEyes})()`);
  if (RECORD) await page.addInitScript(`(${audioTap})()`);
  const seed = FROM ? FROMS[FROM] : null;
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    if (s) localStorage.setItem('snuggle-sorcery-save', JSON.stringify(s));
  }, seed);
  const rec = RECORD ? await startRecording(page, dir) : null;
  const eyes = { look: () => page.evaluate(() => window.__eyes.look()), peek: () => page.evaluate(() => window.__eyes.peek()) };
  const hands = makeHands(page, log);
  const q = QUALITY ? '?quality=' + QUALITY : '';
  await page.goto(`http://127.0.0.1:${PORT}/${q}`, { waitUntil: 'load' });
  let endAt = null;
  const deadline = Date.now() + MINUTES * 60000;
  const brain = new Brain({
    eyes,
    hands,
    log,
    opts: {
      stop(s, b) {
        if (Date.now() > deadline) throw Object.assign(new Error(`out of time (${MINUTES} min)`), { fatal: true });
        const seen = [...b.cards].concat(b.objective || '');
        if (UNTIL && seen.some((t) => t.includes(UNTIL))) return true;
        // where the playbook ends: "Chapter 3 complete" (Chapters 4 and 5 need goals it doesn't have yet:
        // sheltering from a sigh, stitching), or THE END when started from the Epilogue
        if (!endAt && [...b.cards].some((t) => /^Chapter 3 complete|^The End/.test(t))) endAt = Date.now() + 12000;
        return endAt && Date.now() > endAt && !s.ui.card;
      },
      finishing: () => !!endAt, // the story so far is over: just enjoy the view
    },
  });
  const t0 = Date.now();
  // --shots N: a screenshot and what the eyes saw every N seconds (for debugging the autoplayer)
  const SHOTS = +opt('shots', 0);
  let shotT = null;
  if (SHOTS) {
    mkdirSync(join(dir, 'shots'), { recursive: true });
    const shoot = async () => {
      const t = log.now().toFixed(0).padStart(5, '0');
      await page.screenshot({ path: join(dir, 'shots', t + '.jpg'), type: 'jpeg', quality: 70 }).catch(() => {});
      const snap = await eyes.look().catch(() => null);
      if (snap) writeFileSync(join(dir, 'shots', t + '.json'), JSON.stringify({ ...snap, brain: { goal: brain.goal?.desc, stale: brain.goal?.stale, route: brain.nav.route?.pts?.slice(0, 12) } }, null, 1));
      shotT = setTimeout(shoot, SHOTS * 1000);
    };
    shotT = setTimeout(shoot, SHOTS * 1000);
  }
  await brain.run();
  clearTimeout(shotT);
  const duration = (Date.now() - (rec?.t0 ?? t0)) / 1000;
  let video = null;
  if (rec) {
    const r = await rec.stop();
    const chapters = log.events.filter((e) => e.kind === 'chapter').map((e) => ({ t: Math.max(0, e.t - (rec.t0 - log.t0) / 1000), title: e.text }));
    chapters.unshift({ t: 0, title: 'Loading' });
    video = await finish(dir, r, { chapters, srt: shiftSrt(log, (rec.t0 - log.t0) / 1000), duration });
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ videoOffset: (rec.t0 - log.t0) / 1000, frames: r.frames, audio: r.audio }, null, 1));
  } else writeFileSync(join(dir, 'thoughts.srt'), log.srt());
  writeFileSync(join(dir, 'summary.md'), summary(log, brain, errors, duration, video));
  await ctx.close();
  return { dir, video };
}

// The thoughts' times are from the log's start; the video starts at its first frame.
function shiftSrt(log, off) {
  const th = log.thoughts;
  log.thoughts.splice(0, th.length, ...th.map((x) => ({ ...x, t: Math.max(0, x.t - off) })));
  return log.srt();
}

function summary(log, brain, errors, duration, video) {
  const ev = log.events;
  const count = (k) => ev.filter((e) => e.kind === k).length;
  const lines = [`# Playthrough summary`, '', `- Length: ${fmt(duration)} (${(duration / 60).toFixed(1)} min)${video ? `, recorded to \`${video.split('/').pop()}\`` : ''}`];
  const tot = Object.values(brain.time).reduce((a, b) => a + b, 0) || 1;
  lines.push('- Time spent: ' + Object.entries(brain.time).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / tot) * 100)}% (${fmt(v)})`).join(', '));
  lines.push(`- Confused ${count('confused')}×, stuck ${count('stuck')}×, used the checkpoint ${count('checkpoint')}×, out of Calm ${count('overwhelmed')}×, wrong Charm Sprite guesses ${ev.filter((e) => e.kind === 'line' && /didn’t help|nothing but dust|nothing here to read|doesn’t notice|no path to follow|doesn’t remember this/.test(e.text)).length}×, page errors ${errors.length}`);
  lines.push('', '## Chapters', '');
  const ch = ev.filter((e) => e.kind === 'chapter');
  ch.forEach((c, i) => lines.push(`- ${fmt(c.t)} ${c.text}${ch[i + 1] ? ` (${fmt(ch[i + 1].t - c.t)})` : ''}`));
  lines.push('', '## Objectives', '');
  const ob = ev.filter((e) => e.kind === 'objective');
  ob.forEach((o, i) => lines.push(`- ${fmt(o.t)} (${fmt((ob[i + 1]?.t ?? log.now()) - o.t)}) ${o.text}`));
  lines.push('', '## Things to look at', '');
  for (const e of ev.filter((e) => /confused|stuck|checkpoint|error|overwhelmed/.test(e.kind))) lines.push(`- ${fmt(e.t)} **${e.kind}** ${e.text || e.goal || ''}`);
  return lines.join('\n') + '\n';
}
