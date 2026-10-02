// SPDX-License-Identifier: GPL-3.0-only
// The scores (played by core/music.js). Every track is a variation on Pip's mother's lullaby
// (D major pentatonic: A F# E D E F# A . B A F# E D E D .), at the lullaby's own tempo (84 bpm).
// Notation: one token per step ('steps' per beat, 2 = eighth notes), '.' a rest, '-' holds the note.
// A layer with from: n only plays once n memories of the Quiet District are restored (Chapter 3).

// the lullaby, as the melody of an 8-bar phrase in eighth notes
const LULLABY = `A5 - F#5 - E5 - D5 - E5 - F#5 - A5 - - - B5 - A5 - F#5 - E5 - D5 - E5 - D5 - - -
  F#5 - A5 - B5 - A5 - F#5 - E5 - F#5 - - - A5 - F#5 - E5 - D5 - E5 - F#5 - D5 - - -`;
const CHORDS = `D3 - - - - - - - B2 - - - - - - - G2 - - - - - - - A2 - - - - - - -
  D3 - - - - - - - G2 - - - - - - - B2 - - - - - - - A2 - - - D3 - - -`;
const FIFTHS = `A3 - - - - - - - F#3 - - - - - - - D3 - - - - - - - E3 - - - - - - -
  A3 - - - - - - - D3 - - - - - - - F#3 - - - - - - - E3 - - - A3 - - -`;

// a note held for n steps, and n steps of rest (for the slow tracks, where counting dashes would go wrong)
const hold = (note, n) => note + ' -'.repeat(n - 1);
const rest = (n) => Array(n).fill('.').join(' ');
const seq = (...parts) => parts.join(' ');
// the lullaby in B minor (the relative minor: every note a third lower)
const MINOR = ['F#5', 'D5', 'C#5', 'B4', 'C#5', 'D5', 'F#5', 0, 'G5', 'F#5', 'D5', 'C#5', 'B4', 'C#5', 'B4', 0];
const ARP = `D4 . A4 . D4 . A4 . B3 . F#4 . B3 . F#4 . G3 . D4 . G3 . D4 . A3 . E4 . A3 . E4 .
  D4 . A4 . D4 . A4 . G3 . D4 . G3 . D4 . B3 . F#4 . B3 . F#4 . A3 . E4 . D4 . A4 .`;

export const SCORES = {
  // the rainy train: the lullaby slowly on a plucked string, rain-soft pad underneath
  train: {
    gain: 0.9,
    layers: [
      { voice: 'pluck', gain: 0.8, notes: LULLABY },
      { voice: 'pad', notes: CHORDS },
      { voice: 'pad', gain: 0.7, notes: FIFTHS },
      { voice: 'bell', gain: 0.6, notes: 'D6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . A5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .' },
    ],
  },
  // the Academy by day (and the station): a brighter dance on the same tune, a woodblock keeping time
  academy: {
    layers: [
      { voice: 'pluck', notes: `A5 F#5 E5 D5 E5 F#5 A5 . B5 A5 F#5 E5 D5 E5 D5 . F#5 A5 B5 A5 F#5 E5 F#5 . A5 F#5 E5 D5 E5 F#5 D5 .
        D5 . E5 F#5 A5 . F#5 . E5 . D5 E5 F#5 . E5 . A4 . B4 D5 E5 . D5 . B4 . A4 B4 D5 - - .` },
      { voice: 'pad', gain: 0.8, notes: CHORDS },
      { voice: 'pluck', gain: 0.45, notes: `D4 . A4 . D4 . A4 . B3 . F#4 . B3 . F#4 . G3 . D4 . G3 . D4 . A3 . E4 . A3 . E4 .
        D4 . A4 . D4 . A4 . G3 . D4 . G3 . D4 . B3 . F#4 . B3 . F#4 . A3 . E4 . D4 . A4 .` },
      { voice: 'wood', gain: 0.8, notes: 'C4 . . C4 . . C4 . C4 . . C4 . . C4 .' },
    ],
  },
  // dusk at the Academy: slower and warmer, bells like the first lanterns
  dusk: {
    layers: [
      { voice: 'pluck', gain: 0.8, notes: LULLABY },
      { voice: 'pad', notes: CHORDS },
      { voice: 'bell', gain: 0.8, notes: `F#6 . . . . . . . . . . . A5 . . . . . . . D6 . . . . . . . . . . .
        . . . . A5 . . . . . . . . . . . E6 . . . . . . . . . . . D6 . . .` },
    ],
  },
  // the night market: the street musician is the music there; just a soft pad and a little percussion
  market: {
    gain: 0.8,
    layers: [
      { voice: 'pad', gain: 0.8, notes: CHORDS },
      { voice: 'wood', gain: 0.6, notes: 'C4 . . . C4 . C4 . . . C4 . . . C4 C4' },
    ],
  },
  // the Quiet District: the lullaby in B minor, in fragments that stop mid-phrase, as if forgotten. Each
  // restored memory brings a voice back.
  quiet: {
    gain: 0.95,
    layers: [
      { voice: 'pluck', gain: 0.7, notes: `F#5 - D5 - C#5 - B4 - . . . . . . . . . . . . . . . . . . . . . . . .
        D5 - F#5 - G5 - F#5 - D5 - . . . . . . . . . . . . . . . . . . . . . .` },
      { voice: 'pad', gain: 0.9, notes: `B2 - - - - - - - - - - - - - - - G2 - - - - - - - - - - - - - - -
        E2 - - - - - - - - - - - - - - - F#2 - - - - - - - - - - - - - - -` },
      { voice: 'bell', gain: 0.5, from: 1, notes: `. . . . . . . . . . . . B5 . . . . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . D6 . . . . . . . . . . . . . . . . . . .` },
      { voice: 'pluck', gain: 0.5, from: 3, notes: `. . . . . . . . C#5 - B4 - A4 - B4 - . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . E5 - D5 - C#5 - B4 - . . . . . . . . . . . .` },
      { voice: 'bow', gain: 0.8, from: 5, notes: `. . . . . . . . . . . . . . . . D5 - - - C#5 - - - B4 - - - - - - -
        . . . . . . . . . . . . . . . . F#5 - - - E5 - - - D5 - - - - - - -` },
    ],
  },
  // the grey morning at the Academy: the day tune, hesitant, missing notes
  grey: {
    gain: 0.85,
    layers: [
      { voice: 'pluck', gain: 0.7, notes: `A5 - F#5 - E5 - . . . . . . . . . . B5 - A5 - . . . . . . . . . . . .
        F#5 - A5 - . . . . . . . . . . . . A5 - F#5 - E5 - D5 - . . . . . . . .` },
      { voice: 'pad', gain: 0.8, notes: `B2 - - - - - - - - - - - - - - - G2 - - - - - - - - - - - - - - -
        D3 - - - - - - - - - - - - - - - A2 - - - - - - - - - - - - - - -` },
    ],
  },
  // Master Fang's story: the lullaby alone on a plucked string, very slowly
  story: {
    steps: 2,
    layers: [
      { voice: 'pluck', gain: 0.9, notes: `A5 - - - F#5 - - - E5 - - - D5 - - - E5 - - - F#5 - - - A5 - - - - - - -
        B5 - - - A5 - - - F#5 - - - E5 - - - D5 - - - E5 - - - D5 - - - - - - -` },
      { voice: 'pad', gain: 0.6, notes: `D3 - - - - - - - - - - - - - - - B2 - - - - - - - - - - - - - - -
        G2 - - - - - - - - - - - - - - - A2 - - - - - - - D3 - - - - - - -` },
    ],
  },
  // ---- Chapters 4 and 5, the Epilogue and free roam
  // under the fog: the Quiet District's fragments, slower, with long gaps (the layers are of different
  // lengths, so they drift against each other and it never quite repeats)
  fog: {
    layers: [
      { voice: 'pluck', gain: 0.6, notes: seq(hold('F#5', 4), hold('D5', 6), rest(30), hold('C#5', 4), hold('B4', 8), rest(44), hold('D5', 4), hold('F#5', 6), rest(54)) },
      { voice: 'pad', gain: 0.9, notes: seq(hold('B2', 32), hold('G2', 32), hold('E2', 32), hold('F#2', 32)) },
      { voice: 'bell', gain: 0.35, notes: seq('B5', rest(75), 'F#5', rest(60)) },
    ],
  },
  // Bean's secret: the lullaby on one soft plucked voice, as if half remembered
  bean: {
    layers: [
      { voice: 'pluck', gain: 0.65, notes: seq(hold('A5', 4), hold('F#5', 4), hold('E5', 4), hold('D5', 4), hold('E5', 4), rest(4), hold('A5', 8), hold('B5', 4), hold('A5', 4), rest(4), hold('E5', 4), hold('D5', 4), hold('E5', 4), hold('D5', 8), rest(8)) },
      { voice: 'pad', gain: 0.5, notes: seq(hold('D3', 32), hold('G2', 16), hold('A2', 16), hold('D3', 8)) },
    ],
  },
  // the Great Sulk: a low drone, and the lullaby in the minor, very slowly. A voice joins with each phase of
  // the finale (core/music.js level, set by story/chapter5.js)
  sulk: {
    layers: [
      { voice: 'pad', gain: 1.2, notes: seq(hold('B1', 32), hold('B1', 32)) },
      { voice: 'pad', gain: 0.8, notes: seq(hold('F#2', 48), hold('G2', 16)) },
      { voice: 'pluck', gain: 0.6, from: 1, notes: MINOR.map((n) => (n ? hold(n, 4) : rest(4))).join(' ') },
      { voice: 'bell', gain: 0.45, from: 2, notes: seq('F#6', rest(31), 'D6', rest(31)) },
      { voice: 'pluck', gain: 0.4, from: 3, notes: 'B2 . F#3 . B3 . F#3 . G2 . D3 . G3 . D3 . E2 . B2 . E3 . B2 . F#2 . C#3 . F#3 . C#3 .' },
      { voice: 'bow', gain: 0.7, from: 4, notes: seq(hold('D5', 16), hold('C#5', 16), hold('B4', 24), rest(8)) },
    ],
  },
  // the Everyone Blanket: the whole lullaby, every voice, in the major
  blanket: {
    layers: [
      { voice: 'pluck', notes: LULLABY },
      { voice: 'bow', gain: 0.6, notes: seq(hold('A5', 16), hold('B5', 8), hold('A5', 8), hold('F#5', 16), hold('E5', 8), hold('D5', 8)) },
      { voice: 'pad', notes: CHORDS },
      { voice: 'pad', gain: 0.7, notes: FIFTHS },
      { voice: 'pluck', gain: 0.45, notes: ARP },
      { voice: 'bell', gain: 0.7, notes: seq('D6', rest(7), 'A5', rest(7), 'F#6', rest(7), 'A5', rest(7)) },
    ],
  },
  // the morning after, and Lantern Bay ever since: the Academy's daytime tune, brighter, with bells
  morning: {
    layers: [
      { voice: 'pluck', notes: `A5 F#5 E5 D5 E5 F#5 A5 . B5 A5 F#5 E5 D5 E5 D5 . F#5 A5 B5 A5 F#5 E5 F#5 . A5 F#5 E5 D5 E5 F#5 D5 .
        D5 . E5 F#5 A5 . F#5 . E5 . D5 E5 F#5 . E5 . A4 . B4 D5 E5 . D5 . B4 . A4 B4 D5 - - .` },
      { voice: 'pad', gain: 0.8, notes: CHORDS },
      { voice: 'pluck', gain: 0.45, notes: ARP },
      { voice: 'bell', gain: 0.7, notes: seq('A6', rest(3), 'F#6', rest(3), 'D6', rest(7), 'B5', rest(3), 'A5', rest(11), 'D6', rest(7), 'F#6', rest(23)) },
      { voice: 'wood', gain: 0.6, notes: 'C4 . . C4 . . C4 . C4 . . C4 . . C4 .' },
    ],
  },
};
