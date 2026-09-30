// SPDX-License-Identifier: GPL-3.0-only
// Reviewing a recorded playthrough without watching it: contact sheets (a frame every few seconds), full frames
// at every logged event worth a look, and ffmpeg's measurements: frozen picture, black frames, silence and
// loudness per chapter. Writes <run>/review/ and <run>/review.md.
//   node tools/playtest/review.mjs tools/playtest/out/<run> [--every 5]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmt } from './log.js';

const dir = process.argv[2];
const ei = process.argv.indexOf('--every');
const every = ei > 0 ? +process.argv[ei + 1] : 5;
if (!dir || !existsSync(join(dir, 'playthrough.mp4'))) throw new Error('usage: review.mjs <run folder with playthrough.mp4>');
const video = join(dir, 'playthrough.mp4');
const out = join(dir, 'review');
mkdirSync(join(out, 'sheets'), { recursive: true });
mkdirSync(join(out, 'frames'), { recursive: true });
const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', video], { encoding: 'utf8' }).stdout);
const duration = +probe.format.duration;
const meta = existsSync(join(dir, 'meta.json')) ? JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) : { videoOffset: 0 };
const events = readFileSync(join(dir, 'log.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .filter((e) => e.type === 'event')
  .map((e) => ({ ...e, v: e.t - meta.videoOffset }));
const md = [`# Review of ${dir.split('/').pop()}`, ''];
md.push(`- ${fmt(duration)} long; streams: ${probe.streams.map((s) => `${s.codec_type} ${s.codec_name}${s.width ? ` ${s.width}×${s.height} ${s.r_frame_rate}` : ''}`).join(', ')}; ${probe.chapters.length} chapters`);

// contact sheets: 30 frames each (6 × 5), one every `every` seconds
ff(['-y', '-i', video, '-vf', `fps=1/${every},scale=320:-1,drawtext=text='%{pts\\:hms}':x=4:y=4:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.5,tile=6x5`, '-q:v', '4', join(out, 'sheets', 'sheet-%03d.jpg')]);
md.push(`- Contact sheets: \`review/sheets/\` (a frame every ${every} s, 30 to a sheet)`);

// frames at the events worth a look (and 2 s later)
const worth = events.filter((e) => /confused|stuck|checkpoint|error|overwhelmed|card|curious|minigame|name|wrong/.test(e.kind));
for (const e of worth) {
  for (const dt of [0, 2]) {
    const t = Math.max(0, Math.min(duration - 0.1, e.v + dt));
    ff(['-y', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', join(out, 'frames', `${String(Math.floor(e.v)).padStart(5, '0')}-${e.kind}${dt ? '+2' : ''}.jpg`)]);
  }
}
md.push(`- ${worth.length} logged events with frames in \`review/frames/\``);

// the picture not changing for 20 s (stuck, or waiting), and black frames
const frz = ff(['-i', video, '-vf', 'freezedetect=n=0.002:d=20', '-map', '0:v', '-f', 'null', '-']).stderr;
const freezes = [...frz.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
md.push('', '## Picture', '', freezes.length ? `The picture stood still for 20 s or more ${freezes.length}×:` : 'The picture never stood still for 20 s.');
for (const [t, d] of freezes) {
  const near = events.filter((e) => e.v >= t - 5 && e.v <= t + d).map((e) => e.kind + (e.text ? ': ' + e.text.slice(0, 60) : '')).slice(0, 3);
  md.push(`- ${fmt(t)} for ${d.toFixed(0)} s${near.length ? ' — ' + near.join('; ') : ''}`);
}
const blk = ff(['-i', video, '-vf', 'blackdetect=d=1:pix_th=0.08', '-map', '0:v', '-f', 'null', '-']).stderr;
const blacks = [...blk.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
md.push('', blacks.length ? `Black for a second or more ${blacks.length}×: ${blacks.map(([a, b]) => `${fmt(a)} (${(b - a).toFixed(1)} s)`).join(', ')}` : 'No black stretches (fades are shorter than a second).');

// sound
if (probe.streams.some((s) => s.codec_type === 'audio')) {
  md.push('', '## Sound', '');
  const loud = ff(['-i', video, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
  const I = loud.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop();
  const LRA = loud.match(/LRA:\s+([\d.]+) LU/g)?.pop();
  const peak = loud.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop();
  md.push(`- Whole run: ${I || '?'}, loudness range ${LRA || '?'}, true peak ${peak || '?'} (streaming platforms aim for about −14 to −16 LUFS; a true peak above −1 dBFS can clip)`);
  const sil = ff(['-i', video, '-map', '0:a', '-af', 'silencedetect=noise=-50dB:d=8', '-f', 'null', '-']).stderr;
  const silences = [...sil.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  md.push(silences.length ? `- Silent (below −50 dB) for 8 s or more ${silences.length}×: ${silences.map(([a, d]) => `${fmt(a)} (${d.toFixed(0)} s)`).join(', ')}` : '- Never silent for 8 s or more.');
  // loudness with and without dialogue on screen, per chapter
  const chapters = probe.chapters.map((c) => [+c.start_time, +c.end_time, c.tags?.title || '']);
  const lines = events.filter((e) => e.kind === 'line').map((e) => e.v);
  const talkAt = (t) => lines.some((l) => l <= t && t - l < 5);
  md.push('', '| Chapter | Mean (all) | Mean while someone talks | Mean otherwise | Max |', '|---|---|---|---|---|');
  for (const [a, b, title] of chapters) {
    if (b - a < 5) continue;
    const r = ff(['-ss', String(a), '-to', String(b), '-i', video, '-map', '0:a', '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-']).stderr;
    const pts = [...r.matchAll(/pts_time:([\d.]+)[\s\S]*?RMS_level=(-?[\d.inf]+)/g)].map((m) => [a + +m[1], +m[2]]).filter(([, v]) => Number.isFinite(v));
    const mean = (xs) => (xs.length ? 10 * Math.log10(xs.reduce((s, v) => s + 10 ** (v / 10), 0) / xs.length) : NaN);
    const talk = pts.filter(([t]) => talkAt(t)).map(([, v]) => v),
      quiet = pts.filter(([t]) => !talkAt(t)).map(([, v]) => v);
    const vd = ff(['-ss', String(a), '-to', String(b), '-i', video, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-']).stderr;
    const max = vd.match(/max_volume: (-?[\d.]+) dB/)?.[1];
    const f = (x) => (Number.isFinite(x) ? x.toFixed(1) + ' dB' : '—');
    md.push(`| ${title} | ${f(mean(pts.map(([, v]) => v)))} | ${f(mean(talk))} | ${f(mean(quiet))} | ${max ?? '?'} dB |`);
  }
}
writeFileSync(join(dir, 'review.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
