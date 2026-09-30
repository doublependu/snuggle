// SPDX-License-Identifier: GPL-3.0-only
// The playthrough log: every change the autoplayer saw, every decision with its reason, every input, and the
// events that matter for a review (confusions, stuck, checkpoints, errors). Times are seconds since the run
// started, which is also the time in the recording. Written as JSON lines, plus a subtitle track of thoughts.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function makeLog(dir, { echo = true } = {}) {
  const t0 = Date.now();
  const file = join(dir, 'log.jsonl');
  writeFileSync(file, '');
  const thoughts = [];
  const events = [];
  let lastThought = '';
  const now = () => +((Date.now() - t0) / 1000).toFixed(2);
  const write = (o) => appendFileSync(file, JSON.stringify({ t: now(), ...o }) + '\n');
  const log = {
    t0,
    now,
    // what it's thinking (goes to the subtitles too)
    think(text) {
      if (text === lastThought) return;
      lastThought = text;
      const t = now();
      thoughts.push({ t, text });
      write({ type: 'think', text });
      if (echo) console.log(`${fmt(t)}  ${text}`);
    },
    saw(what, data) {
      write({ type: 'saw', what, ...data });
    },
    input(what) {
      write({ type: 'input', what });
    },
    // something worth reviewing: confused, stuck, checkpoint, error, chapter, objective, wrong-guess, ...
    event(kind, data = {}) {
      const e = { t: now(), kind, ...data };
      events.push(e);
      write({ type: 'event', ...e });
      if (echo && kind !== 'objective' && kind !== 'line') console.log(`${fmt(e.t)}  [${kind}] ${data.text || data.goal || ''}`);
    },
    events,
    thoughts,
    // Thoughts as an .srt subtitle track (each shows until the next one, at most 6 s)
    srt() {
      return thoughts
        .map((th, i) => {
          const end = Math.min(th.t + 6, thoughts[i + 1]?.t ?? th.t + 6);
          return `${i + 1}\n${srtTime(th.t)} --> ${srtTime(Math.max(th.t + 0.1, end))}\n${th.text}\n`;
        })
        .join('\n');
    },
  };
  return log;
}

export const fmt = (t) => {
  const d = Math.round(t * 10); // tenths, rounded first (so 179.96 s is 03:00.0, not 02:60.0)
  return `${String(Math.floor(d / 600)).padStart(2, '0')}:${((d % 600) / 10).toFixed(1).padStart(4, '0')}`;
};
function srtTime(t) {
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60),
    ms = Math.round((t % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
