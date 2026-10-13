// SPDX-License-Identifier: GPL-3.0-only
// Cutting the videos: an edit list (tools/video/edits/*.json) in, finished MP4s out. A re-cut is an edit to the
// list and a re-render. Each video in a list:
//   { name, out, size: [w, h], fps, loudness (LUFS, default -14), crf (18), preset ('slow'),
//     segments: [ { card: {kind, ...}, dur } | { clip: 'file.mp4', from, to, crop?: [x, y, w, h] }, ...each with
//                 fadeIn?, fadeOut? (s, through black), gain? (dB on its own sound), chapter? (a YouTube chapter
//                 starting here), chapters? ([{ title, at }] inside a clip), mute? ],
//     overlays: [ { card: {kind: 'caption', ...}, at, dur, fade? } ],          (at: seconds into the video)
//     music: [ { file, at, from?, dur, gain? (dB), fadeIn?, fadeOut? } ],
//     gameGain? (dB on the footage's sound, e.g. under music), duck? (dB the music drops under a 'speak' range),
//     thumb?: { at (s into the video, for the background), title, sub, tag },
//     description?: { title, text } (written next to the video, with the chapter list filled in) }
// Writes <out>, <out>.chapters.txt (YouTube's "0:00 Title" list), and the thumbnail and description if asked.
//
//   node tools/video/edit.mjs tools/video/edits/trailer.json [--only name] [--draft] (draft: fast, lower quality)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { renderCards } from './cards.mjs';

const args = process.argv.slice(2);
const list = JSON.parse(readFileSync(args[0], 'utf8'));
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const DRAFT = args.includes('--draft');
const videos = (list.videos || [list]).filter((v) => !ONLY || ONLY.includes(v.name));

const ff = (a, what) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status) throw new Error(`ffmpeg (${what}) failed:\n${r.stderr.slice(-2000)}`);
  return r;
};
const probe = (f) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', f], { encoding: 'utf8' }).stdout);
const hms = (t) => {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    ss = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
};

for (const v of videos) await cut(v);

async function cut(v) {
  const [W, H] = v.size || [1920, 1080];
  const fps = v.fps || 60;
  const out = resolve(v.out);
  const work = out + '.work';
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  const t0 = Date.now();
  console.log(`▶ ${v.name}: ${v.segments.length} segments`);

  // 1. the cards and captions, as PNGs
  const cards = [];
  v.segments.forEach((s, i) => s.card && cards.push({ ...s.card, out: join(work, `card-${i}.png`), width: W, height: H }));
  (v.overlays || []).forEach((o, i) => cards.push({ ...o.card, out: join(work, `over-${i}.png`), width: W, height: H }));
  if (cards.length) await renderCards(cards, { width: W, height: H });

  // 2. every segment to the same size, rate and sound, with its fades (an intermediate that loses next to nothing)
  const vq = DRAFT ? ['-preset', 'ultrafast', '-crf', '23'] : ['-preset', 'veryfast', '-crf', '14'];
  const parts = [];
  let t = 0;
  const chapters = [];
  for (const [i, s] of v.segments.entries()) {
    const file = join(work, `seg-${String(i).padStart(3, '0')}.mkv`);
    let dur;
    const vf = [],
      af = [];
    if (s.card) {
      dur = s.dur;
      ff(['-loop', '1', '-framerate', String(fps), '-t', String(dur), '-i', join(work, `card-${i}.png`), '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo', ...fades(vf, af, s, dur), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', ...vq, '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', file], 'card ' + i);
    } else {
      const src = resolve(s.clip);
      const total = +probe(src).format.duration;
      const from = s.from || 0,
        to = s.to == null ? total : Math.min(s.to, total);
      dur = to - from;
      const hasAudio = probe(src).streams.some((x) => x.codec_type === 'audio') && !s.mute;
      vf.push(s.crop ? `crop=${s.crop.join(':')}` : null, `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${fps}`);
      if (s.gain) af.push(`volume=${s.gain}dB`);
      const inA = hasAudio ? [] : ['-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo'];
      ff(['-ss', String(from), '-t', String(dur), '-i', src, ...inA, ...fades(vf.filter(Boolean), af, s, dur), '-map', '0:v', '-map', hasAudio ? '0:a' : '1:a', '-c:v', 'libx264', ...vq, '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', file], 'clip ' + i);
    }
    if (s.chapter) chapters.push({ title: s.chapter, at: t + (s.chapterAt || 0) });
    // chapters inside a long clip (seconds from the clip's start), as in a playthrough's take
    for (const c of s.chapters || []) if (c.at >= 0 && c.at < dur) chapters.push({ title: c.title, at: t + c.at });
    parts.push(file);
    t += dur;
  }
  const total = t;
  // join them
  const joined = join(work, 'joined.mkv');
  writeFileSync(join(work, 'list.txt'), parts.map((p) => `file '${p}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-c', 'copy', joined], 'join');

  // 3. captions over it, music under it, the loudness, and the final encode
  const inputs = ['-i', joined];
  const vchain = [];
  let vlast = '0:v';
  (v.overlays || []).forEach((o, i) => {
    inputs.push('-loop', '1', '-framerate', String(fps), '-t', String(total), '-i', join(work, `over-${i}.png`));
    const k = inputs.filter((x) => x === '-i').length - 1;
    const f = o.fade ?? 0.35;
    vchain.push(`[${k}:v]format=rgba,fade=t=in:st=${o.at}:d=${f}:alpha=1,fade=t=out:st=${o.at + o.dur - f}:d=${f}:alpha=1[o${i}]`);
    vchain.push(`[${vlast}][o${i}]overlay=0:0:enable='between(t,${o.at},${o.at + o.dur})'[v${i}]`);
    vlast = `v${i}`;
  });
  const achain = [`[0:a]volume=${v.gameGain || 0}dB[g]`];
  const mix = ['[g]'];
  (v.music || []).forEach((m, i) => {
    inputs.push('-i', resolve(m.file));
    const k = inputs.filter((x) => x === '-i').length - 1;
    const fi = m.fadeIn ?? 1,
      fo = m.fadeOut ?? 2;
    achain.push(`[${k}:a]atrim=${m.from || 0}:${(m.from || 0) + m.dur},asetpts=PTS-STARTPTS,afade=t=in:d=${fi},afade=t=out:st=${m.dur - fo}:d=${fo},volume=${m.gain || 0}dB,adelay=${Math.round(m.at * 1000)}:all=1[m${i}]`);
    mix.push(`[m${i}]`);
  });
  achain.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first[mixed]`);
  const graph = (tail) => [...vchain, ...achain, tail].join(';');
  // loudness, two passes: measure, then set (linear, so the mix's own dynamics stay). Peaks aim at -2 dBTP: the AAC
  // encode adds a few tenths, and the target is -1 or under
  const L = v.loudness ?? -14;
  const meas = spawnSync('ffmpeg', ['-hide_banner', ...inputs, '-filter_complex', [...achain, `[mixed]loudnorm=I=${L}:TP=-2:LRA=11:print_format=json[aout]`].join(';'), '-map', '[aout]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const at = meas.stderr.lastIndexOf('{');
  const j = JSON.parse(meas.stderr.slice(at, meas.stderr.indexOf('}', at) + 1));
  const norm = `loudnorm=I=${L}:TP=-2:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  // chapters into the file
  const meta = [';FFMETADATA1', `title=${v.title || v.name}`];
  chapters.forEach((c, i) => meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.at * 1000)}`, `END=${Math.round((chapters[i + 1]?.at ?? total) * 1000)}`, `title=${c.title}`));
  writeFileSync(join(work, 'meta.txt'), meta.join('\n') + '\n');
  inputs.push('-i', join(work, 'meta.txt'));
  const mi = inputs.filter((x) => x === '-i').length - 1;
  const final = DRAFT ? ['-preset', 'veryfast', '-crf', '26'] : ['-preset', v.preset || 'slow', '-crf', String(v.crf || 18)];
  ff([...inputs, '-filter_complex', graph(`[mixed]${norm},aresample=48000[aout]`), '-map', vlast === '0:v' ? '0:v' : `[${vlast}]`, '-map', '[aout]', '-map_metadata', String(mi), '-map_chapters', String(mi),
    '-c:v', 'libx264', ...final, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', String(total), out], 'final');

  // 4. YouTube's chapter list, the description and the thumbnail
  if (chapters.length) writeFileSync(out.replace(/\.mp4$/, '.chapters.txt'), chapters.map((c) => `${hms(c.at)} ${c.title}`).join('\n') + '\n');
  if (v.description) writeFileSync(out.replace(/\.mp4$/, '.description.txt'), `${v.description.title}\n\n${v.description.text.replace('{chapters}', chapters.map((c) => `${hms(c.at)} ${c.title}`).join('\n'))}\n`);
  if (v.thumb) {
    const frame = join(work, 'thumb-frame.jpg');
    ff(['-ss', String(v.thumb.at), '-i', v.thumb.frame ? resolve(v.thumb.frame) : out, '-frames:v', '1', '-q:v', '2', frame], 'thumb frame');
    await renderCards([{ kind: 'thumb', image: frame, ...v.thumb, out: out.replace(/\.mp4$/, '.thumb.png'), width: 1280, height: 720 }]);
  }
  if (!args.includes('--keep')) rmSync(work, { recursive: true, force: true });
  const p = probe(out);
  console.log(`✔ ${v.name}: ${out} (${hms(+p.format.duration)}, ${(+p.format.size / 1e6).toFixed(0)} MB, ${((Date.now() - t0) / 60000).toFixed(1)} min to make)`);
}

// Fades to and from black (and the sound with them), and the filters, as ffmpeg arguments.
function fades(vf, af, s, dur) {
  if (s.fadeIn) vf.push(`fade=t=in:d=${s.fadeIn}`), af.push(`afade=t=in:d=${s.fadeIn}`);
  if (s.fadeOut) vf.push(`fade=t=out:st=${Math.max(0, dur - s.fadeOut)}:d=${s.fadeOut}`), af.push(`afade=t=out:st=${Math.max(0, dur - s.fadeOut)}:d=${s.fadeOut}`);
  const a = [];
  if (vf.length) a.push('-vf', vf.join(','));
  if (af.length) a.push('-af', af.join(','));
  return a;
}
