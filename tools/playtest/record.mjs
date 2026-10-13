// SPDX-License-Identifier: GPL-3.0-only
// Recording a playthrough in one piece.
//  - Picture: Chrome's screencast (the whole page, UI included) -> the latest frame written at a steady 30 fps
//    into ffmpeg -> H.264.
//  - Sound: captured inside the page. An init script also sends whatever the page plays to the speakers into
//    a MediaStreamAudioDestinationNode; MediaRecorder streams Opus chunks to Node. Each audio context (a
//    reload makes a new one) is its own file with its start time; they are mixed in at the end.
//  - The finished MP4 gets chapter markers and the autoplayer's thoughts as a subtitle track (off by default).
import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Runs in the page before anything else (page.addInitScript).
export function audioTap() {
  const connect = AudioNode.prototype.connect;
  const taps = new WeakMap();
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) {
      const ctx = this.context;
      let tap = taps.get(ctx);
      if (!tap) {
        tap = ctx.createMediaStreamDestination();
        taps.set(ctx, tap);
        const rec = new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: window.__audioBitrate || 192000 });
        const id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        rec.ondataavailable = async (e) => {
          const b = new Uint8Array(await e.data.arrayBuffer());
          let s = '';
          for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
          window.__audioChunk?.(id, btoa(s));
        };
        rec.onstart = () => window.__audioStart?.(id, Date.now());
        rec.start(1000);
        addEventListener('pagehide', () => rec.state !== 'inactive' && rec.stop());
      }
      connect.call(this, tap);
    }
    return r;
  };
}

export async function startRecording(page, dir, { fps = 30, width = 1280, height = 720, crf = 16, preset = 'veryfast' } = {}) {
  // (Matroska while recording: it can be read before it's finished, to look at a take as it goes)
  const video = join(dir, 'video.mkv');
  // near-lossless while recording (the videos are encoded once more, from this, by tools/video/edit.mjs)
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0', '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(fps), video], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res) => ff.on('close', res));
  // sound
  const tracks = new Map(); // id -> { file, stream, start }
  await page.exposeBinding('__audioStart', (_, id, t) => {
    if (!tracks.has(id)) tracks.set(id, { file: join(dir, `audio-${tracks.size}.webm`), start: t, stream: null });
    else tracks.get(id).start = t;
  });
  await page.exposeBinding('__audioChunk', (_, id, b64) => {
    if (!tracks.has(id)) tracks.set(id, { file: join(dir, `audio-${tracks.size}.webm`), start: Date.now() - 1000, stream: null });
    const tr = tracks.get(id);
    tr.stream ||= createWriteStream(tr.file);
    tr.stream.write(Buffer.from(b64, 'base64'));
  });
  // picture
  const cdp = await page.context().newCDPSession(page);
  let latest = null,
    lastFrameAt = Date.now(),
    t0 = 0;
  const arrivals = new Map(); // second -> frames that arrived in it (how smooth the picture really is)
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    latest = Buffer.from(data, 'base64');
    lastFrameAt = Date.now();
    if (t0) {
      const sec = Math.floor((lastFrameAt - t0) / 1000);
      arrivals.set(sec, (arrivals.get(sec) || 0) + 1);
    }
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const startCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 }).catch(() => {});
  await startCast();
  // the clock starts with the first frame, so the picture and the sound share one timeline
  while (!latest) await new Promise((r) => setTimeout(r, 10));
  t0 = Date.now();
  let n = 0,
    stopped = false,
    timer = null;
  const pump = () => {
    if (stopped) return;
    const due = Math.floor(((Date.now() - t0) * fps) / 1000);
    for (; n <= due; n++) ff.stdin.write(latest);
    // a reload can stop the screencast: start it again
    if (Date.now() - lastFrameAt > 3000) {
      lastFrameAt = Date.now();
      startCast();
    }
    timer = setTimeout(pump, Math.max(1, t0 + (n * 1000) / fps - Date.now()));
  };
  pump();
  return {
    t0,
    arrivals,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await cdp.send('Page.stopScreencast').catch(() => {});
      ff.stdin.end();
      await done;
      await page.evaluate(() => dispatchEvent(new Event('pagehide'))).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      for (const tr of tracks.values()) await new Promise((r) => (tr.stream ? tr.stream.end(r) : r()));
      return { video, frames: n, fps, arrivals: [...arrivals.entries()].sort((a, b) => a[0] - b[0]), audio: [...tracks.values()].filter((t) => t.stream).map((t) => ({ file: t.file, offset: (t.start - t0) / 1000 })) };
    },
  };
}

// How smooth the picture was: new frames per second from the screencast (the rest are repeats).
export function smoothness(arrivals, fps) {
  const per = arrivals.map(([, n]) => Math.min(n, fps)).sort((a, b) => a - b);
  if (!per.length) return null;
  const q = (f) => per[Math.min(per.length - 1, Math.floor(per.length * f))];
  return { median: q(0.5), p10: q(0.1), p01: q(0.01), seconds: per.length, below: per.filter((n) => n < fps * 0.9).length };
}

// The finished file: picture + every sound track at its offset + chapters + the thoughts as subtitles.
export async function finish(dir, rec, { chapters = [], srt = '', out = 'playthrough.mp4', duration }) {
  const meta = [';FFMETADATA1'];
  chapters.forEach((c, i) => {
    const end = chapters[i + 1]?.t ?? duration;
    meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.t * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${c.title}`);
  });
  writeFileSync(join(dir, 'chapters.txt'), meta.join('\n') + '\n');
  writeFileSync(join(dir, 'thoughts.srt'), srt);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', rec.video];
  rec.audio.forEach((a) => args.push('-i', a.file));
  const mi = 1 + rec.audio.length;
  // (chapters and the thoughts' subtitles only when there are any: a scenery shot has neither)
  const subs = !!srt.trim();
  args.push('-i', join(dir, 'chapters.txt'));
  if (subs) args.push('-i', join(dir, 'thoughts.srt'));
  const filters = rec.audio.map((a, i) => `[${i + 1}:a]adelay=${Math.max(0, Math.round(a.offset * 1000))}:all=1[a${i}]`);
  if (rec.audio.length) {
    filters.push(rec.audio.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${rec.audio.length}:normalize=0[aout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  } else args.push('-map', '0:v');
  args.push('-c:v', 'copy');
  if (subs) args.push('-map', `${mi + 1}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=What the autoplayer is thinking', '-disposition:s:0', '0');
  if (chapters.length) args.push('-map_metadata', String(mi), '-map_chapters', String(mi));
  args.push('-t', String(duration), '-movflags', '+faststart', join(dir, out));
  await new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (c) => (c ? rej(new Error('ffmpeg exited ' + c)) : res()));
  });
  return join(dir, out);
}
