// SPDX-License-Identifier: GPL-3.0-only
// Grumbling species: story text for the Sprite Book, soothing tuning, and the Charm Sprite helper ability.
// Chapter 2+ species are defined so the book can show silhouettes; their behaviours arrive with those chapters.
export const SPECIES = {
  doudou: {
    name: 'Doudou',
    feeling: 'Five more minutes.',
    about: 'A steamed-bun Grumbling who naps in your hood. Wakes up only for dumplings and emergencies.',
    glow: '#ffe2b0',
    chapter: 0,
  },
  cloud: {
    name: 'Soggy Cloud',
    feeling: 'I forgot my umbrella.',
    about: 'Rains on shoes when nobody notices it. Loves being hummed to sleep.',
    ability: 'umbrella',
    abilityName: 'Umbrella',
    abilityDesc: 'Shelters you from rain and waters thirsty lotus buds.',
    glow: '#bfe3ff',
    wrap: 5, // seconds of humming at full rate
    tantrum: 'rain',
    chapter: 0,
  },
  sock: {
    name: 'Lost Sock',
    feeling: 'I lost my other sock.',
    about: 'Darts between laundry baskets looking for its partner. Corner it gently.',
    ability: 'sniff',
    abilityName: 'Sniff',
    abilityDesc: 'Sniffs out hidden lemon candies nearby.',
    glow: '#ffc9b8',
    wrap: 6,
    tantrum: 'dart',
    chapter: 1,
  },
  homework: {
    name: 'Unfinished Homework',
    feeling: "I didn't finish my homework.",
    about: 'Hides under the library stairs and throws crumpled worries at anyone who asks.',
    ability: 'read',
    abilityName: 'Read',
    abilityDesc: 'Reads old notes and signposts aloud.',
    glow: '#fff1b8',
    wrap: 7,
    tantrum: 'throw',
    chapter: 1,
  },
  pompom: {
    name: 'Picked-Last Pom-pom',
    feeling: 'Nobody picked me for their team.',
    about: 'Follows you around sighing. It just wants to come along.',
    ability: 'cheer',
    abilityName: 'Cheer',
    abilityDesc: 'Kind acts give half again as much Cozy Energy.',
    glow: '#f3c9ff',
    wrap: 6,
    tantrum: 'sigh',
    chapter: 1,
  },
  sparrow: {
    name: 'Wistful Sparrow',
    feeling: "I want that, but I can't afford it.",
    about: 'Flocks around the night market with enormous wistful eyes. Buying them things never helps: sit with them and point out the free good things.',
    ability: 'guide',
    abilityName: 'Guide',
    abilityDesc: 'Leads lost children (and you) back to where they belong.',
    glow: '#ffd9a8',
    wrap: 3.2, // per sparrow, while perched and shown a free good thing (systems/perch.js)
    tantrum: 'flock',
    chapter: 2,
  },
  grey: {
    name: 'Grey Grumbling',
    feeling: 'Nobody remembers us.',
    about: 'Heavy, quiet and drifting toward the Quiet District. Chapter 3.',
    glow: '#dddddd',
    chapter: 3,
  },
};

export const BOOK_ORDER = ['doudou', 'cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey'];
