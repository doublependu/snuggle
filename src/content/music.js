// SPDX-License-Identifier: GPL-3.0-only
// The scores (played by core/music.js). Every track is a variation on Xiao Pei's mother's lullaby
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
};
