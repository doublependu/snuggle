// SPDX-License-Identifier: GPL-3.0-only
// All sound is synthesized with WebAudio: zero download. The lullaby also drives the soothing
// beat clock (see systems/soothe.js), so humming, the HUD ring and the melody stay in sync.
const BOOST = 2.5; // the master's make-up gain (+8 dB), ahead of the limiter
const MUSIC = 0.8; // the music bus at full Music volume (it was 0.5: the quiet zones are mostly music)
const BPM = 84;
export const BEAT = 60 / BPM;
// Pip's mother's lullaby: 16 beats, D major pentatonic (MIDI numbers, 0 = rest)
const LULLABY = [69, 66, 64, 62, 64, 66, 69, 0, 71, 69, 66, 64, 62, 64, 62, 0];
const PAD_CHORDS = [
  [50, 57, 62, 66],
  [47, 54, 59, 62],
  [43, 50, 55, 59],
  [45, 52, 57, 61],
];
// The night-market musician's tune (Chapter 2): a bowed-string variation on the lullaby, 32 beats.
const MUSICIAN = [62, 0, 66, 69, 71, 69, 66, 0, 64, 66, 69, 0, 66, 64, 62, 0, 69, 71, 74, 0, 71, 69, 66, 64, 66, 0, 64, 62, 64, 66, 62, 0];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Each place's soundscape: its ambience beds (level 0..1; any bed not listed fades out) and its music
// track (content/music.js). Zones call G.audio.mix(id); proximity beds (the musician, the wok) are set
// by their zones every frame on top of this. 'pad' is the simple chord pad heard until the music loads.
// On the train the rain is outside the windows ('rainOut': duller, heard through the carriage); the Soggy
// Cloud's own rain is 'patter', set by the cloud itself (actors/grumbling.js), so soothing it is heard.
const AMBIENCE = {
  train: { rumble: 0.8, rainOut: 0.6, clack: 1, pad: 1, music: 'train' },
  station: { water: 0.8, birds: 1, pad: 1, music: 'academy' },
  academy: { birds: 1, water: 0.4, pad: 1, music: 'academy' },
  'academy-dusk': { water: 0.4, insects: 0.5, pad: 1, music: 'dusk' },
  'academy-grey': { wind: 0.3, water: 0.3, pad: 0.6, music: 'grey' },
  market: { water: 0.6, crowd: 1, insects: 1, music: 'market' },
  quiet: { wind: 0.7, water: 0.35, pad: 0.6, music: 'quiet' },
  fog: { wind: 1, pad: 0.4, music: 'fog' }, // Chapters 4 and 5, under the fog
  morning: { birds: 1, water: 0.4, pad: 1, music: 'morning' }, // the Epilogue, and the district ever after
};
// The noise beds: filter type, frequency, Q, and the gain at level 1.
const NOISE_BEDS = {
  rain: ['highpass', 1200, 0.3, 0.18], rainOut: ['lowpass', 900, 0.5, 0.14], patter: ['bandpass', 3200, 0.7, 0.2], rumble: ['lowpass', 140, 1.2, 0.2],
  wind: ['bandpass', 500, 0.5, 0.08], water: ['bandpass', 700, 0.7, 0.06], crowd: ['bandpass', 420, 1.1, 0.09], sizzle: ['highpass', 3800, 0.5, 0.05],
};
const BEDS = ['rumble', 'rain', 'rainOut', 'patter', 'clack', 'water', 'birds', 'insects', 'wind', 'crowd', 'pad'];

export class Audio {
  constructor() {
    this.ctx = null;
    this.t0 = performance.now() / 1000;
    this.volume = 0.8;
    this.musicVolume = 0.6;
    this.humming = false;
    this.nextNote = 0;
    this.noteIndex = 0;
    this.loops = {};
  }

  unlock() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    // The game used to be quiet (-28 LUFS over a playthrough, ai/playtest_5.md): the master is 8 dB hotter
    // now, with a limiter after it so the loud moments (a pop, a chime over the music) don't clip.
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * BOOST;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -12;
    lim.knee.value = 4;
    lim.ratio.value = 20;
    lim.attack.value = 0.003;
    lim.release.value = 0.2;
    // (the compressor adds make-up gain of its own: the trim after it keeps the peaks under full scale)
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    this.master.connect(lim).connect(trim).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume * MUSIC;
    this.music.connect(this.master);
    // soft room reverb from a generated impulse
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(1.8);
    const vg = ctx.createGain();
    vg.gain.value = 0.35;
    this.verb.connect(vg).connect(this.master);
    this.noise = this.noiseBuffer(2);
    this.t0 = ctx.currentTime - (performance.now() / 1000 - this.t0);
    this.applyLoops();
  }

  get beatLength() {
    return BEAT;
  }

  // Crossfade to a place's soundscape (AMBIENCE above). The composed music takes over from the simple pad
  // once it has loaded (attachScore).
  mix(id) {
    this.mixId = id;
    const m = AMBIENCE[id] || {};
    for (const b of BEDS) this.bed(b, b === 'pad' && this.score ? 0 : m[b] || 0);
    this.score?.play(m.music || null);
  }
  attachScore(score) {
    this.score = score;
    if (this.mixId) this.mix(this.mixId);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }
  // beat phase in [0,1) and beat index, shared by the soothing mechanic and the HUD
  beat() {
    const b = (this.now - this.t0) / BEAT;
    return { phase: b - Math.floor(b), index: Math.floor(b), time: this.t0 + Math.ceil(b) * BEAT };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v * BOOST, this.ctx.currentTime, 0.05);
  }
  setMusic(v) {
    this.musicVolume = v;
    if (this.music) this.music.gain.setTargetAtTime(v * MUSIC, this.ctx.currentTime, 0.1);
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }
  noiseBuffer(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------------------------------------------------------- voices
  tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.01, release = 0.2, at = 0, slide = 0, dest, verb = 0.3, detune = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  burst(dur, { freq = 1200, q = 1, gain = 0.2, type = 'bandpass', at = 0, sweep = 0, dest } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = at || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'blip':
        this.tone(880, 0.08, { type: 'triangle', gain: 0.08, verb: 0.1 });
        break;
      case 'open':
        this.tone(660, 0.12, { type: 'triangle', gain: 0.07 });
        this.tone(990, 0.16, { type: 'triangle', gain: 0.06, at: t + 0.06 });
        break;
      case 'close':
        this.tone(990, 0.1, { type: 'triangle', gain: 0.06 });
        this.tone(660, 0.14, { type: 'triangle', gain: 0.06, at: t + 0.05 });
        break;
      case 'notice':
        this.tone(587, 0.3, { gain: 0.12 });
        this.tone(880, 0.4, { gain: 0.1, at: t + 0.09 });
        break;
      case 'pop':
        this.tone(300, 0.12, { gain: 0.25, slide: 3, verb: 0.2 });
        [1175, 1480, 1760, 2349].forEach((f, i) => this.tone(f, 0.5, { gain: 0.07, at: t + 0.1 + i * 0.07, verb: 0.6 }));
        break;
      case 'sparkle':
        [1568, 1976, 2349].forEach((f, i) => this.tone(f, 0.35, { gain: 0.05, at: t + i * 0.05, verb: 0.6 }));
        break;
      case 'cozy':
        [587, 740, 880].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', gain: 0.06, at: t + i * 0.08, verb: 0.5 }));
        break;
      case 'candy':
        this.tone(1319, 0.15, { type: 'triangle', gain: 0.08 });
        this.tone(1760, 0.3, { type: 'triangle', gain: 0.08, at: t + 0.08, verb: 0.5 });
        break;
      case 'snap':
        this.burst(0.12, { freq: 2500, q: 2, gain: 0.25, sweep: 0.3 });
        this.tone(500, 0.2, { type: 'triangle', gain: 0.1, slide: 0.4 });
        break;
      case 'jump':
        this.tone(330, 0.16, { type: 'sine', gain: 0.1, slide: 1.8, verb: 0.05 });
        break;
      case 'land':
        this.burst(0.08, { freq: 300, q: 0.7, gain: 0.12, type: 'lowpass' });
        break;
      case 'step':
        this.burst(0.05, { freq: 700 + Math.random() * 300, q: 1.2, gain: 0.03 });
        break;
      case 'honk':
        this.tone(330, 0.22, { type: 'sawtooth', gain: 0.1, slide: 0.75, verb: 0.2 });
        this.tone(335, 0.22, { type: 'square', gain: 0.04, slide: 0.7, verb: 0 });
        break;
      case 'grumble':
        this.tone(140 + Math.random() * 40, 0.4, { type: 'triangle', gain: 0.12, slide: 0.7, verb: 0.2 });
        break;
      case 'sigh':
        this.burst(1.2, { freq: 900, q: 0.8, gain: 0.08, sweep: 0.4 });
        break;
      case 'whoosh':
        this.burst(0.35, { freq: 600, q: 0.8, gain: 0.12, sweep: 4 });
        break;
      case 'perfect':
        this.tone(1175, 0.25, { type: 'triangle', gain: 0.07, verb: 0.5 });
        break;
      case 'drip':
        this.tone(1400 + Math.random() * 600, 0.08, { gain: 0.05, slide: 0.5, verb: 0.3 });
        break;
      case 'door':
        this.burst(0.5, { freq: 220, q: 0.6, gain: 0.2, type: 'lowpass' });
        this.tone(740, 0.5, { type: 'triangle', gain: 0.05, at: t + 0.1 });
        this.tone(587, 0.7, { type: 'triangle', gain: 0.05, at: t + 0.35 });
        break;
      case 'chime':
        [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 1.2, { gain: 0.05, at: t + i * 0.12, verb: 0.8 }));
        break;
      case 'yawn':
        this.tone(420, 0.9, { type: 'triangle', gain: 0.06, slide: 0.55, attack: 0.2, verb: 0.3 });
        break;
      // ---- Chapter 2: the night market
      case 'flutter':
        for (let i = 0; i < 4; i++) this.burst(0.05, { freq: 1600 + Math.random() * 600, q: 1.5, gain: 0.07, at: t + i * 0.045 });
        break;
      case 'chirp':
        this.tone(2400 + Math.random() * 300, 0.08, { gain: 0.05, slide: 1.4, verb: 0.3 });
        this.tone(3000 + Math.random() * 300, 0.1, { gain: 0.05, slide: 1.25, at: t + 0.1, verb: 0.3 });
        break;
      case 'sadchirp':
        this.tone(2600, 0.22, { gain: 0.04, slide: 0.7, verb: 0.3 });
        break;
      case 'crash':
        this.burst(0.25, { freq: 900, q: 0.8, gain: 0.16, sweep: 0.5 });
        [0, 0.07, 0.15].forEach((d) => this.tone(700 + Math.random() * 500, 0.06, { type: 'triangle', gain: 0.06, at: t + d, verb: 0.1 }));
        break;
      case 'sizzle':
        this.burst(0.4, { freq: 3200, q: 0.6, gain: 0.08, type: 'highpass' });
        break;
      case 'launch':
        this.burst(0.5, { freq: 500, q: 0.7, gain: 0.08, sweep: 3 });
        this.tone(1175, 0.8, { gain: 0.05, at: t + 0.2, verb: 0.7 });
        break;
      case 'combo':
        [587, 740, 880, 1175, 1480].forEach((f, i) => this.tone(f, 0.7, { type: 'triangle', gain: 0.06, at: t + i * 0.06, verb: 0.6 }));
        break;
      case 'lightsout':
        this.tone(220, 2.4, { type: 'triangle', gain: 0.08, slide: 0.6, attack: 0.3, verb: 0.8 });
        this.tone(233, 2.4, { type: 'sine', gain: 0.05, slide: 0.55, attack: 0.4, verb: 0.8 });
        break;
      // ---- Chapter 3: the Quiet District
      case 'memory': // the start of the lullaby on a music box, far away
        [81, 78, 76, 74, 76, 78].forEach((m, i) => this.tone(mtof(m), 1.4, { gain: 0.045, at: t + i * 0.32, verb: 0.9, attack: 0.02 }));
        break;
      case 'relight':
        this.burst(0.3, { freq: 1800, q: 0.9, gain: 0.05, sweep: 0.6 });
        [740, 880, 1109].forEach((f, i) => this.tone(f, 0.9, { type: 'triangle', gain: 0.045, at: t + 0.12 + i * 0.1, verb: 0.7 }));
        break;
      case 'foghorn':
        this.tone(98, 3.2, { type: 'sawtooth', gain: 0.035, attack: 0.6, release: 1.4, verb: 0.9 });
        this.tone(97, 3.2, { type: 'triangle', gain: 0.05, attack: 0.6, release: 1.4, verb: 0.9 });
        break;
      case 'thanks':
        [880, 1109, 1319].forEach((f, i) => this.tone(f, 0.5, { gain: 0.05, at: t + i * 0.09, verb: 0.5 }));
        break;
      default:
        break;
    }
  }

  // Humming: melody notes quantized to the beat clock while held.
  setHumming(on) {
    this.humming = on;
  }
  update() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (this.humming) {
      const b = this.beat();
      if (this.nextNote < ctx.currentTime) this.nextNote = b.time;
      while (this.nextNote < ctx.currentTime + 0.1) {
        const i = Math.round((this.nextNote - this.t0) / BEAT) % LULLABY.length;
        const m = LULLABY[i];
        if (m) {
          const f = mtof(m);
          this.tone(f, BEAT * 0.95, { type: 'sine', gain: 0.1, attack: 0.07, release: 0.3, at: this.nextNote, verb: 0.45 });
          this.tone(f * 2, BEAT * 0.9, { type: 'sine', gain: 0.018, attack: 0.1, release: 0.3, at: this.nextNote, verb: 0.3 });
          this.tone(f, BEAT * 0.95, { type: 'triangle', gain: 0.025, attack: 0.08, at: this.nextNote, detune: 7, verb: 0 });
        }
        this.nextNote += BEAT;
      }
    } else this.nextNote = 0;
    // the composed music: quieter under dialogue, and further back while she hums (the lullaby is the star)
    this.score?.update(this.humming ? 0.4 : this.duck ?? 1);
    // background pad (until the music has loaded)
    if (this.loops.pad) {
      if (!this.padNext || this.padNext < ctx.currentTime) this.padNext = ctx.currentTime + 0.1;
      if (this.padNext < ctx.currentTime + 0.2) {
        const chord = PAD_CHORDS[(this.padIdx = ((this.padIdx || 0) + 1) % PAD_CHORDS.length)];
        const dur = BEAT * 8;
        for (const m of chord) this.tone(mtof(m), dur + 1.2, { type: 'triangle', gain: 0.022, attack: 1.4, release: 1.6, at: this.padNext, dest: this.music, verb: 0.6 });
        this.padNext += dur;
      }
    }
    if (this.loops.birds && Math.random() < 0.006) {
      const f = 2200 + Math.random() * 1600;
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) this.tone(f * (1 + i * 0.06), 0.09, { gain: 0.025, slide: 1.3, at: ctx.currentTime + i * 0.11, verb: 0.4 });
    }
    // night insects: soft high chirps in little bursts
    if (this.loops.insects && Math.random() < 0.02 * this.loops.insects) {
      const f = 4200 + Math.random() * 900;
      for (let i = 0; i < 3; i++) this.tone(f, 0.03, { gain: 0.012, at: ctx.currentTime + i * 0.07, verb: 0.2 });
    }
    // crowd chatter: murmur (a noise bed) plus the odd laugh-like blip
    if (this.loops.crowd && Math.random() < 0.012 * this.loops.crowd) {
      const f = 260 + Math.random() * 220;
      this.tone(f, 0.12 + Math.random() * 0.1, { type: 'triangle', gain: 0.012 * this.loops.crowd, slide: 1 + (Math.random() - 0.5) * 0.4, verb: 0.3 });
    }
    // the street musician (loudness = distance to the stage, set every frame by the market zone)
    const mus = this.loops.musician || 0;
    if (mus > 0.01) {
      if (!this.musNext || this.musNext < ctx.currentTime) this.musNext = this.beat().time;
      while (this.musNext < ctx.currentTime + 0.15) {
        const i = Math.round((this.musNext - this.t0) / BEAT) % MUSICIAN.length;
        const m = MUSICIAN[i];
        if (m) this.bowed(mtof(m), BEAT * (MUSICIAN[(i + 1) % MUSICIAN.length] ? 0.95 : 1.8), mus, this.musNext);
        this.musNext += BEAT;
      }
    } else this.musNext = 0;
    if (this.loops.clack && ctx.currentTime > (this.clackNext || 0)) {
      this.clackNext = ctx.currentTime + 1.9;
      this.burst(0.07, { freq: 900, q: 3, gain: 0.07 });
      this.burst(0.07, { freq: 800, q: 3, gain: 0.06, at: ctx.currentTime + 0.22 });
    }
  }

  // An erhu-ish bowed voice: a sawtooth through a vibrato'd lowpass, swelling in and out.
  bowed(freq, dur, level, at, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * 0.985, at);
    o.frequency.linearRampToValueAtTime(freq, at + 0.08);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, at);
    lg.gain.linearRampToValueAtTime(freq * 0.012, at + dur * 0.5);
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1900;
    f.Q.value = 2;
    const g = ctx.createGain();
    const peak = 0.05 * Math.min(1, level);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.12);
    g.gain.setValueAtTime(peak, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f).connect(g).connect(dest || this.music);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s).connect(this.verb);
    o.start(at);
    lfo.start(at);
    o.stop(at + dur + 0.05);
    lfo.stop(at + dur + 0.05);
  }

  // Continuous beds: rain / rumble / wind / water / crowd / sizzle are filtered noise loops with smooth gain.
  // fade: seconds to get there (the time constant is a third of it).
  bed(name, level, fade = 1.2) {
    this.loops[name] = level;
    if (!this.ctx) return;
    const ctx = this.ctx;
    let b = this.beds?.[name];
    if (!b && level > 0 && NOISE_BEDS[name]) {
      this.beds = this.beds || {};
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      const cfg = NOISE_BEDS[name];
      f.type = cfg[0];
      f.frequency.value = cfg[1];
      f.Q.value = cfg[2];
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfx);
      src.start();
      b = this.beds[name] = { src, g };
    }
    if (b) b.g.gain.setTargetAtTime(level * NOISE_BEDS[name][3], ctx.currentTime, fade / 3);
  }
  applyLoops() {
    for (const [k, v] of Object.entries(this.loops)) this.bed(k, v);
  }
}
