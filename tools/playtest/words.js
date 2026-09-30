// SPDX-License-Identifier: GPL-3.0-only
// Reading: the words in an objective or a line that are worth looking for.
const STOP = new Set(
  'the a an to at in by of and with your you on up for from all is it its what who her his she he be this that some someone somebody little one down into out about as are was were been not no so just my me i we our they them their there here then than when where why how can will would could should may might more most very too also only even still yet'.split(' '),
);

export function tokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

// How many of the wanted words appear in a description, as whole words or their stems ("stair" finds
// "staircase", "lantern" finds "lanterns", but "yard" doesn't find "courtyard").
export function overlap(want, text) {
  const words = (text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let n = 0;
  for (const w of want) {
    const parts = w.split(/[^a-z]+/).filter(Boolean); // "pom-pom"
    if (parts.every((p) => words.some((x) => x === p || (p.length >= 4 && x.startsWith(p)) || (x.length >= 4 && p.startsWith(x))))) n++;
  }
  return n;
}
