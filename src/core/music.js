// SPDX-License-Identifier: GPL-3.0-only
// Composed music: a small step sequencer playing the scores in content/music.js (all variations on Xiao
// Pei's mother's lullaby, one per place and mood). Loaded after Begin, so it costs nothing before the
// first interaction, and synthesized like every other sound (no audio files). It runs on the lullaby's
// beat clock (core/audio.js), so the soothing ring and the on-beat bonus still line up with the music.
// Tracks crossfade; the music ducks under dialogue and steps back while she hums (the lullaby is the star).
import { SCORES } from '../content/music.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LOOKAHEAD = 0.3;

// 'D5 . F#5 - A5' -> [{ step, midi, len }]: one token per step, '.' a rest, '-' holds the previous note.
function parse(line) {
  const out = [];
  line
    .trim()
    .split(/\s+/)
    .forEach((tok, i) => {
      if (tok === '.') return;
      if (tok === '-') {
        if (out.length) out.at(-1).len++;
        return;
      }
      const m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
      if (!m) return;
      const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      out.push({ step: i, midi, len: 1 });
    });
  return out;
}

// Scores are parsed once, the first time they play.
const parsed = new Map();
function score(id) {
  let s = parsed.get(id);
  if (s) return s;
  const src = SCORES[id];
  if (!src) return null;
  const steps = src.steps || 2; // steps per beat
  const layers = src.layers.map((l) => ({ ...l, notes: parse(l.notes), length: l.notes.trim().split(/\s+/).length }));
  s = { id, steps, layers, length: Math.max(...layers.map((l) => l.length)) };
  parsed.set(id, s);
  return s;
}

export class Music {
  constructor(audio) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.bus = this.ctx.createGain(); // ducking
    this.bus.connect(audio.music);
    this.playing = []; // { score, gain, next (audio time of the next step), step, stopAt }
    this.level = 0; // how much of the district has been remembered (Chapter 3 adds layers back)
    this.duckWas = 1;
  }

  // Crossfade to a track (null for silence).
  play(id, fade = 2.5) {
    if (this.current?.score.id === id) return;
    const t = this.ctx.currentTime;
    for (const p of this.playing) {
      if (p.stopAt) continue;
      p.gain.gain.setTargetAtTime(0.0001, t, fade / 3);
      p.stopAt = t + fade;
    }
    this.current = null;
    const s = id && score(id);
    if (!s) return;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.setTargetAtTime(s.gain ?? 1, t, fade / 3);
    gain.connect(this.bus);
    // start on the next bar of the shared beat clock, so everything stays on the beat
    const b = this.a.beat();
    const stepDur = this.a.beatLength / s.steps;
    const beatsToBar = (4 - (b.index + 1) % 4) % 4;
    const p = { score: s, gain, next: b.time + beatsToBar * this.a.beatLength, step: 0, stepDur };
    this.playing.push(p);
    this.current = p;
  }

  update(duck = 1) {
    const t = this.ctx.currentTime;
    if (duck !== this.duckWas) {
      this.duckWas = duck;
      this.bus.gain.setTargetAtTime(duck, t, 0.25);
    }
    for (const p of [...this.playing]) {
      if (p.stopAt && t > p.stopAt) {
        p.gain.disconnect();
        this.playing = this.playing.filter((x) => x !== p);
        continue;
      }
      while (p.next < t + LOOKAHEAD) {
        if (p.next > t - 0.05) this.stepNotes(p, p.step % p.score.length, p.next);
        p.step++;
        p.next += p.stepDur;
      }
    }
  }

  stepNotes(p, step, at) {
    for (const l of p.score.layers) {
      if ((l.from || 0) > this.level) continue;
      const k = step % l.length;
      for (const n of l.notes) if (n.step === k) this.voice(l.voice, n.midi, n.len * p.stepDur, at, l.gain ?? 1, p.gain);
    }
  }

  // The instruments: a plucked string (guzheng / pipa), a soft pad, a small bell, a woodblock, the bowed erhu.
  voice(kind, midi, dur, at, level, dest) {
    const a = this.a;
    const f = mtof(midi);
    switch (kind) {
      case 'pluck':
        a.tone(f, Math.max(0.9, dur), { type: 'triangle', gain: 0.07 * level, attack: 0.004, release: Math.max(0.6, dur * 0.8), at, dest, verb: 0.35 });
        a.tone(f * 2, 0.35, { type: 'sine', gain: 0.02 * level, attack: 0.003, release: 0.3, at, dest, verb: 0.2 });
        break;
      case 'pad':
        a.tone(f, dur + 1.0, { type: 'triangle', gain: 0.02 * level, attack: Math.min(1.4, dur * 0.4), release: 1.2, at, dest, verb: 0.6 });
        break;
      case 'bell':
        a.tone(f, 1.8, { type: 'sine', gain: 0.035 * level, attack: 0.005, release: 1.6, at, dest, verb: 0.7 });
        a.tone(f * 2.76, 0.9, { type: 'sine', gain: 0.01 * level, attack: 0.005, release: 0.8, at, dest, verb: 0.5 });
        break;
      case 'wood':
        a.burst(0.06, { freq: 900 + (midi % 12) * 60, q: 4, gain: 0.05 * level, at, dest });
        break;
      case 'bow':
        a.bowed(f, dur, 0.55 * level, at, dest);
        break;
    }
  }
}
