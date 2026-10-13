// SPDX-License-Identifier: GPL-3.0-only
// The game's own score, recorded track by track for the trailer, the Short and the X video. The music is
// synthesized in the page (core/music.js plays the scores in content/music.js), so this loads the game on the
// greybox, switches every ambience bed off and mutes the sound effects, plays one track at its fullest (every
// layer: core/music.js level), and records what the page plays (tools/playtest/record.mjs's audio tap) to a
// WAV per track. It's the game's own music, so a video using it gets no copyright claims.
//
// Each track is then levelled to the same loudness (-18 LUFS, a plain gain: the music's own dynamics stay), so an
// edit list's music gains are about the mix, not about how loud one score happens to be.
//
//   node tools/video/music.mjs [--tracks train,academy,...] [--seconds 120] [--out tools/video/out/music]
//   node tools/video/music.mjs --level      (level the tracks already recorded, recording nothing)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { audioTap } from '../playtest/record.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const TRACKS = opt('tracks', 'train,academy,dusk,market,quiet,grey,story,fog,bean,sulk,blanket,morning').split(',');
const SECONDS = +opt('seconds', 120);
const OUT = opt('out', 'tools/video/out/music');
const PORT = +opt('port', 5197);
mkdirSync(OUT, { recursive: true });

// Integrated loudness and true peak of a file, then a gain to bring it to -18 LUFS (and its peaks under -2 dBTP).
function level(wav) {
  const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const I = +m.match(/I:\s+(-?[\d.]+) LUFS/g).at(-1).match(/-?[\d.]+/)[0];
  const tp = +m.match(/Peak:\s+(-?[\d.]+) dBFS/g).at(-1).match(/-?[\d.]+/)[0];
  const gain = Math.min(-18 - I, -2 - tp);
  const tmp = wav.replace(/\.wav$/, '.lvl.wav');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', `volume=${gain.toFixed(2)}dB`, '-ar', '48000', '-c:a', 'pcm_s16le', tmp]);
  if (r.status) throw new Error(`ffmpeg: ${r.stderr}`);
  renameSync(tmp, wav);
  return { I, tp, gain };
}
if (args.includes('--level')) {
  for (const id of TRACKS) {
    const wav = join(OUT, id + '.wav');
    if (!existsSync(wav)) continue;
    const { I, tp, gain } = level(wav);
    console.log(`✔ ${id}: ${I} LUFS (peak ${tp} dBTP), ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
  }
  process.exit(0);
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
try {
  for (const id of TRACKS) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await ctx.newPage();
    // music at a higher bit rate than a playthrough's sound
    await page.addInitScript(() => (window.__audioBitrate = 320000));
    await page.addInitScript(`(${audioTap})()`);
    const webm = join(OUT, id + '.webm');
    const file = createWriteStream(webm);
    let started = 0;
    await page.exposeBinding('__audioStart', () => (started ||= Date.now()));
    await page.exposeBinding('__audioChunk', (_, _id, b64) => file.write(Buffer.from(b64, 'base64')));
    await page.goto(`http://127.0.0.1:${PORT}/?zone=test&nosw`, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.querySelector('#begin')?.disabled, null, { timeout: 60000 });
    await page.click('#begin', { force: true });
    // the score loads after Begin
    await page.waitForFunction(() => window.__G?.audio?.score, null, { timeout: 60000 });
    await page.evaluate((track) => {
      const G = window.__G;
      G.frozen = true; // (no footsteps)
      G.audio.mix('__silence__'); // every ambience bed down, and the place's music off
      G.audio.sfx.gain.value = 0;
      G.audio.score.level = 9; // every layer (the Quiet District's and the Great Sulk's grow with the story)
      G.audio.score.play(track, 0.05);
    }, id);
    await page.waitForTimeout(SECONDS * 1000 + 3000);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(1500);
    await ctx.close();
    await new Promise((r) => file.end(r));
    // to WAV, from the first bar (the track starts on the next bar of the beat clock)
    const wav = join(OUT, id + '.wav');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', webm, '-af', 'silenceremove=start_periods=1:start_threshold=-60dB', '-t', String(SECONDS), '-ar', '48000', '-ac', '2', wav]);
    if (r.status) throw new Error(`ffmpeg: ${r.stderr}`);
    rmSync(webm);
    const { gain } = level(wav);
    console.log(`✔ ${id}: ${wav} (levelled ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB)`);
  }
} finally {
  await browser.close();
  await server.close();
}
