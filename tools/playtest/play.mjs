// SPDX-License-Identifier: GPL-3.0-only
// The autoplayer: plays Snuggle Sorcery from a new player's point of view, in real time, with real keyboard
// and mouse input, deciding only from what's on screen (see eyes.js for exactly what it can see). Optionally
// records the whole run as one uncut video with the game's sound.
//
//   npm run playtest                      play from a fresh game (all the way: stop it with --until or --for)
//   npm run playtest -- --record          ...and record it (tools/playtest/out/<run>/playthrough.mp4)
//   npm run playtest -- --from market     start from a saved point (development only: station ch1 lesson bake ch2 market ch3 quiet dusk
//                                         ch4 fog heart ch5 epilogue free)
//   npm run playtest -- --until "Chapter 2"   stop at the first card/objective matching this
//   HEADED=1 npm run playtest             watch it in a window
// Options: --for N (stop after N minutes, as a finished run), --retries N (recording: start again from scratch if a run fails), --minutes N (give up after),
// --quality low|medium|high, --out DIR, --swiftshader (software rendering, as in the e2e tests).
// The page is 1920×1080 (Chrome's screencast captures CSS pixels, so this is also the video's size), at the
// high tier with the dev-only ?capture (full resolution all the time) when recording, and the game's largest
// reading text (--text 1.5), so dialogue reads as well as it would at 1280×720. --portrait is 1080×1920 (a
// YouTube Short); --view WxH sets any size. --fps 30|60.
// One playthrough across several runs: --save-out FILE writes the game's save when the run stops, and
// --save-in FILE starts from it (instead of a fresh game or --from).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installEyes } from './eyes.js';
import { makeHands } from './hands.js';
import { makeLog, fmt } from './log.js';
import { Brain } from './brain.js';
import { audioTap, startRecording, finish, smoothness } from './record.mjs';
import { FROMS } from './saves.mjs';

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
const FOR = +opt('for', 0); // stop (as a finished run) after this many minutes: clips, and measuring
const PORTRAIT = !!opt('portrait');
const QUALITY = opt('quality') || (RECORD ? 'high' : null);
const VIEW = opt('view') ? Object.fromEntries(['width', 'height'].map((k, i) => [k, +opt('view').split('x')[i]])) : PORTRAIT ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const SCALE = 1;
const TEXT = +opt('text', 1.5);
const FPS = +opt('fps', 30);
const SAVE_IN = opt('save-in');
const SAVE_OUT = opt('save-out');
const PORT = +opt('port', 5198); // (another port lets two runs go at once)

// The brain may only see through the eyes and act through the hands: make sure nothing else crept in.
for (const f of ['brain.js', 'goals.js', 'playbook.js', 'nav.js', 'words.js']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  if (/__G|\.evaluate\(|page\./.test(src)) throw new Error(`${f} reaches into the game: the decision code may only use the eyes and hands`);
}

// Development only: start partway through (the recorded run always starts from a fresh game or --save-in).
const CAST = {
  'a girl in a teal beret': ['sunny', 'lin', 'sunny lin'],
  'a boy in an orange cap with a white goose puppet on his hand': ['bo', 'captain', 'honk', 'captain honk'],
  'an old lady with round glasses, a flat cap and an orange cardigan': ['master', 'fang', 'master fang'],
};
if (FROM && !FROMS[FROM]) throw new Error('--from: one of ' + Object.keys(FROMS).join(' '));
if (SAVE_IN && !existsSync(SAVE_IN)) throw new Error('--save-in: no such file ' + SAVE_IN);

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = opt('out', join('tools/playtest/out', stamp + (FROM ? '-from-' + FROM : SAVE_IN ? '-from-save' : '')));
mkdirSync(OUT, { recursive: true });

// (no file watching: an edit to the game while a run goes on must not reload its page)
const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const gpu = opt('swiftshader') ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];
const browser = await chromium.launch({ executablePath, headless: !process.env.HEADED, args: [...gpu, '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--window-size=${VIEW.width},${VIEW.height}`] });

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
    for (const f of ['playthrough.mp4', 'log.jsonl', 'thoughts.srt', 'summary.md', 'chapters.txt', 'meta.json', 'save.json']) if (existsSync(join(dir, f))) renameSync(join(dir, f), join(OUT, f));
    rmSync(dir, { recursive: true, force: true });
  }
}
await browser.close();
await server.close();
console.log(result ? `✔ done: ${OUT}` : '✘ no complete run');
process.exit(result ? 0 : 1);

async function playOnce(dir, attempt) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
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
  // the reading text's size (as the Settings' Text size does, without touching the save)
  if (TEXT !== 1) await page.addInitScript((k) => addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: `:root{--ts:${k}!important}` }))), TEXT);
  if (RECORD) await page.addInitScript(`(${audioTap})()`);
  const seed = SAVE_IN ? JSON.parse(readFileSync(SAVE_IN, 'utf8')) : FROM ? FROMS[FROM] : null;
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    if (s) localStorage.setItem('snuggle-sorcery-save', JSON.stringify(s));
  }, seed);
  const rec = RECORD ? await startRecording(page, dir, { fps: FPS, width: Math.round(VIEW.width * SCALE), height: Math.round(VIEW.height * SCALE) }) : null;
  const eyes = { look: () => page.evaluate(() => window.__eyes.look()), peek: () => page.evaluate(() => window.__eyes.peek()) };
  const hands = makeHands(page, log, VIEW);
  // (diagnosis, outside the decision code: when it stalls, what did the game itself think? frozen, her state, the
  // keys it believes are held. Logged, never shown to the brain)
  const event = log.event;
  log.event = (kind, data) => {
    event(kind, data);
    if (/^(still|stuck|confused)$/.test(kind))
      page
        .evaluate(() => { const G = window.__G; return G && { frozen: !!G.frozen, paused: !!G.paused, state: G.player?.state, moveScale: G.player?.moveScale, keys: [...(G.input?.keys || [])], dialogue: !!G.ui?.dialogueOpen }; })
        .then((d) => d && log.saw('diag', { kind, ...d }))
        .catch(() => {});
  };
  const params = new URLSearchParams();
  if (QUALITY) params.set('quality', QUALITY);
  if (RECORD) params.set('capture', '');
  const q = params.size ? '?' + params.toString().replace(/=(&|$)/g, '$1') : '';
  await page.goto(`http://127.0.0.1:${PORT}/${q}`, { waitUntil: 'load' });
  let endAt = null;
  const t0 = Date.now();
  const deadline = t0 + MINUTES * 60000;
  const brain = new Brain({
    eyes,
    hands,
    log,
    // a run that starts partway through knows the main cast by sight, as a player would by then (they're met in
    // the Prologue and Chapter 1); a playthrough from the start learns them from the dialogue
    known: SAVE_IN || (FROM && !['station', 'ch1'].includes(FROM)) ? CAST : null,
    opts: {
      stop(s, b) {
        if (FOR && Date.now() - t0 > FOR * 60000) return true;
        if (b.ended && !endAt) endAt = Date.now() + 4000; // (the autoplayer's own ending: Part 4's look at the blanket)
        if (Date.now() > deadline) throw Object.assign(new Error(`out of time (${MINUTES} min)`), { fatal: true });
        // --until: a card or objective containing this text; the run stops once a card has finished showing
        const seen = [...b.cards].concat(b.objective || '');
        if (!endAt && UNTIL && seen.some((t) => t.includes(UNTIL))) endAt = Date.now() + 1200;
        return endAt && Date.now() > endAt && !s.ui.card && !s.ui.fade;
      },
      finishing: () => !!endAt, // the story so far is over: just enjoy the view
    },
  });
  // --shots N: a screenshot and what the eyes saw every N seconds (for debugging the autoplayer)
  const SHOTS = +opt('shots', 0);
  let shotT = null;
  if (SHOTS) {
    mkdirSync(join(dir, 'shots'), { recursive: true });
    const shoot = async () => {
      const t = log.now().toFixed(0).padStart(5, '0');
      await page.screenshot({ path: join(dir, 'shots', t + '.jpg'), type: 'jpeg', quality: 70 }).catch(() => {});
      const snap = await eyes.look().catch(() => null);
      const rt = brain.nav.route;
      if (snap) writeFileSync(join(dir, 'shots', t + '.json'), JSON.stringify({ ...snap, brain: { goal: brain.goal?.desc, stale: brain.goal?.stale, route: rt?.pts?.slice(0, 12), routeTo: rt && [rt.tx, rt.tz], reached: rt?.reached, line: rt && snap.me && brain.nav.line(snap.me.pos[0], snap.me.pos[2], rt.tx, rt.tz), map: rt && snap.me && brain.goal?.stale > 20 ? brain.nav.box(snap.me.pos[0], snap.me.pos[2], rt.tx, rt.tz) : undefined } }, null, 1));
      shotT = setTimeout(shoot, SHOTS * 1000);
    };
    shotT = setTimeout(shoot, SHOTS * 1000);
  }
  // the same player, carrying on from the take before: what it remembers (tools/playtest/brain.js mind())
  const mindIn = SAVE_IN && SAVE_IN.replace(/\.json$/, '') + '.mind.json';
  if (mindIn && existsSync(mindIn)) brain.remind(JSON.parse(readFileSync(mindIn, 'utf8')));
  await brain.run();
  clearTimeout(shotT);
  // the game's save as it is now, to carry on from in the next run (--save-in)
  const saved = await page.evaluate(() => localStorage.getItem('snuggle-sorcery-save')).catch(() => null);
  if (saved) writeFileSync(join(dir, 'save.json'), saved);
  if (saved && SAVE_OUT) {
    writeFileSync(SAVE_OUT, saved);
    writeFileSync(SAVE_OUT.replace(/\.json$/, '') + '.mind.json', JSON.stringify(brain.mind(), null, 1));
  }
  const duration = (Date.now() - (rec?.t0 ?? t0)) / 1000;
  let video = null,
    smooth = null;
  if (rec) {
    const r = await rec.stop();
    const chapters = log.events.filter((e) => e.kind === 'chapter').map((e) => ({ t: Math.max(0, e.t - (rec.t0 - log.t0) / 1000), title: e.text }));
    chapters.unshift({ t: 0, title: 'Loading' });
    video = await finish(dir, r, { chapters, srt: shiftSrt(log, (rec.t0 - log.t0) / 1000), duration });
    smooth = smoothness(r.arrivals, r.fps);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ videoOffset: (rec.t0 - log.t0) / 1000, frames: r.frames, fps: r.fps, size: [Math.round(VIEW.width * SCALE), Math.round(VIEW.height * SCALE)], smoothness: smooth, arrivals: r.arrivals, audio: r.audio }, null, 1));
  } else writeFileSync(join(dir, 'thoughts.srt'), log.srt());
  writeFileSync(join(dir, 'summary.md'), summary(log, brain, errors, duration, video, smooth, hands));
  await ctx.close();
  // a recorded take must be clean (plan 9 §4.3): no checkpoint, no stall, no confusion, no page errors
  const dirty = log.events.filter((e) => /^(checkpoint|confused|stuck|page-error|console-error)$/.test(e.kind));
  if (RECORD && dirty.length && !opt('accept-dirty')) throw new Error(`not a clean take: ${dirty.map((e) => fmt(e.t) + ' ' + e.kind).join(', ')}`);
  return { dir, video };
}

// The thoughts' times are from the log's start; the video starts at its first frame.
function shiftSrt(log, off) {
  const th = log.thoughts;
  log.thoughts.splice(0, th.length, ...th.map((x) => ({ ...x, t: Math.max(0, x.t - off) })));
  return log.srt();
}

function summary(log, brain, errors, duration, video, smooth, hands) {
  const ev = log.events;
  const count = (k) => ev.filter((e) => e.kind === k).length;
  const lines = [`# Playthrough summary`, '', `- Length: ${fmt(duration)} (${(duration / 60).toFixed(1)} min)${video ? `, recorded to \`${video.split('/').pop()}\`` : ''}`];
  if (smooth) lines.push(`- Picture: ${FPS} fps; new frames each second: median ${smooth.median}, 10th percentile ${smooth.p10}, worst 1% ${smooth.p01}; ${smooth.below} of ${smooth.seconds} s under ${Math.round(FPS * 0.9)}`);
  const tot = Object.values(brain.time).reduce((a, b) => a + b, 0) || 1;
  lines.push('- Time spent: ' + Object.entries(brain.time).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / tot) * 100)}% (${fmt(v)})`).join(', '));
  lines.push(`- Confused ${count('confused')}×, stuck ${count('stuck')}×, used the checkpoint ${count('checkpoint')}×, out of Calm ${count('overwhelmed')}×, wrong Charm Sprite guesses ${ev.filter((e) => e.kind === 'line' && /didn’t help|nothing but dust|nothing here to read|doesn’t notice|no path to follow|doesn’t remember this/.test(e.text)).length}×, page errors ${errors.length}`);
  lines.push('', '## How it looked', '', ...looks(brain, hands));
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

// Did it look like a person playing? Camera turning speed, twitches (left-right-left within a second or two),
// walls walked into, and standing about for no reason (plan 9 §1.2's targets in brackets).
function looks(brain, hands) {
  const turns = hands.turns.filter((t) => t.deg > 2);
  const speed = turns.filter((t) => !t.look).map((t) => t.deg / (t.ms / 1000)).sort((a, b) => a - b);
  const pct = (xs, f) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * f))] : 0);
  let twitches = 0;
  for (let i = 2; i < turns.length; i++) {
    const [a, b, c] = [turns[i - 2], turns[i - 1], turns[i]];
    if (a.deg > 4 && b.deg > 4 && c.deg > 4 && a.dir && a.dir === -b.dir && b.dir === -c.dir && c.t - a.t < 2000) twitches++;
  }
  const m = brain.metrics;
  const min = Math.max(1, (brain.time.play || 0) / 60);
  return [
    `- Camera turns: ${turns.length}; average speed ${pct(speed, 0.5).toFixed(0)}°/s, 95th percentile ${pct(speed, 0.95).toFixed(0)}°/s (under 120), fastest ${pct(speed, 1).toFixed(0)}°/s (under 240)`,
    `- Twitches (left-right-left): ${twitches}, ${(twitches / min * 5).toFixed(1)} per 5 min of play (at most 1)`,
    `- Walked into a wall: ${m.bumps}×, ${(m.bumps / min * 2).toFixed(1)} per 2 min of play (at most 1)`,
    `- Stood still 8 s or more for no reason: ${m.still.length}× (none)${m.still.length ? ' at ' + m.still.map((t) => fmt(t)).join(', ') : ''}`,
  ];
}
