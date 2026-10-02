// SPDX-License-Identifier: GPL-3.0-only
// Thread fishing (systems/fishing.js): where you can fish, and what is in the water.
// Add a catch: a line in FISH (and its id in a spot's `fish`), or in LOST with the person it belongs to.

// The six spots. at: where she stands [x, y, z]; face: the way she casts (radians, 0 = +z); y: the water's
// height there; range: how near and far the float can land (m); wide: how far to either side the glimmers
// swim; fish: what lives there; cam: where the camera sits [behind her, above, to her right] if not the usual.
export const SPOTS = {
  academy: [{ id: 'pond', name: 'The pond bridge', at: [24, 1.3, 11.3], face: Math.PI, y: -0.45, range: [3, 9], wide: 1.6, fish: ['carp', 'loach', 'goldfish', 'koi'] }],
  station: [{ id: 'shore', name: 'The shore by the station', at: [19.4, 0, 3.7], face: 0, y: -0.65, range: [3.2, 9.5], wide: 3, fish: ['bream', 'sprat', 'eel', 'whiskers'] }],
  market: [{ id: 'seawall', name: 'The sea wall', at: [-2, 0, 4.4], face: 0, y: -0.75, range: [3, 9.5], wide: 3, fish: ['squid', 'puffer', 'bream', 'sprat', 'eel'] }],
  quiet: [
    { id: 'jetty', name: 'The end of the jetty', at: [-0.5, 0.1, -30.1], face: Math.PI, y: -0.75, cam: [4, 2, -1.5], range: [3, 9.5], wide: 3, fish: ['mullet', 'ray', 'squid', 'bream'] },
    { id: 'canal', name: 'The canal bridge', at: [2.85, 0, 0], face: Math.PI / 2, y: -0.95, range: [2.6, 8.5], wide: 0.9, fish: ['minnow', 'crab', 'goldfish', 'loach'] },
  ],
  // the old fountain runs again: nothing swims in it, but fifty years of things were dropped there
  heart: [{ id: 'fountain', name: 'The old fountain', at: [-14.6, 0, 48.9], face: Math.PI, y: 0.57, cam: [3.2, 2.7, 1.3], range: [1.3, 3.2], wide: 0.3, fish: [] }],
};

// name, the smallest and biggest (cm), how hard it tugs (0..1), how often it bites (weight), a line for the
// log, and its shape for procgen/fish.js: [length, height, width, tail] and two colours.
export const FISH = {
  carp: { name: 'Lotus Carp', icon: '🐟', size: [28, 72], tug: 0.55, w: 5, line: 'Sleeps under the lotus pads and eats their shadows.', shape: [1, 0.36, 0.2, 0.34], c: ['#e89a4a', '#f6e2c0'] },
  loach: { name: 'Sleepy Loach', icon: '🐟', size: [8, 18], tug: 0.2, w: 6, line: 'Five more minutes, it says. Every time.', shape: [0.9, 0.16, 0.14, 0.14], c: ['#9a8a6a', '#e4d6b8'] },
  goldfish: { name: 'Paper Goldfish', icon: '🐠', size: [9, 24], tug: 0.25, w: 5, line: 'Somebody folded the first one, long ago, and it swam.', shape: [0.7, 0.4, 0.2, 0.5], c: ['#f0703a', '#ffd9a8'] },
  koi: { name: 'Moon Koi', icon: '🎏', size: [48, 96], tug: 0.85, w: 1, line: 'White as the moon on the pond. It only comes up for a lullaby.', shape: [1.1, 0.34, 0.22, 0.4], c: ['#f6f2ea', '#e0563a'] },
  bream: { name: 'Harbour Bream', icon: '🐟', size: [20, 46], tug: 0.5, w: 6, line: 'Follows the ferry, hoping for crumbs of tart.', shape: [0.85, 0.46, 0.16, 0.3], c: ['#8fa9b8', '#e8eef0'] },
  sprat: { name: 'Tin Sprat', icon: '🐟', size: [6, 14], tug: 0.15, w: 7, line: 'They come in hundreds. This one came alone, to see what the humming was.', shape: [0.8, 0.2, 0.1, 0.22], c: ['#b8c4cc', '#f2f5f6'] },
  eel: { name: 'Lantern Eel', icon: '🐍', size: [40, 92], tug: 0.7, w: 3, line: 'Glows a little, like a lantern left on the water.', shape: [1.6, 0.13, 0.12, 0.1], c: ['#5a6f5a', '#ffd98a'] },
  whiskers: { name: 'Old Whiskers', icon: '🐡', size: [60, 122], tug: 0.95, w: 1, line: 'The fisherman has been after this one for thirty years. It let itself be caught.', shape: [1.2, 0.36, 0.3, 0.3], c: ['#6a5a4a', '#d9c9b0'] },
  squid: { name: 'Night Squid', icon: '🦑', size: [15, 40], tug: 0.45, w: 4, line: 'Comes to the market’s lantern-light, like everybody else.', shape: [0.9, 0.28, 0.26, 0.55], c: ['#c98aa8', '#f6dce6'] },
  puffer: { name: 'Dumpling Puffer', icon: '🐡', size: [12, 28], tug: 0.35, w: 4, line: 'Round, pale and pleated. The dumpling stall is not amused.', shape: [0.6, 0.52, 0.5, 0.2], c: ['#f2ead8', '#d9b88a'] },
  mullet: { name: 'Fog Mullet', icon: '🐟', size: [24, 52], tug: 0.5, w: 6, line: 'Grey all its life. It came up to look at the colours.', shape: [0.95, 0.3, 0.18, 0.3], c: ['#9aa0a8', '#dfe3e8'] },
  ray: { name: 'Letter Ray', icon: '🪁', size: [44, 82], tug: 0.8, w: 1, line: 'Flat as an envelope. People say it carries the letters that never arrived.', shape: [0.9, 0.08, 0.9, 0.5], c: ['#d8cdb8', '#f6efe0'] },
  minnow: { name: 'Canal Minnow', icon: '🐟', size: [5, 11], tug: 0.1, w: 7, line: 'The canal was empty for fifty years. These are new.', shape: [0.7, 0.2, 0.1, 0.24], c: ['#7fb0a8', '#e4f2ee'] },
  crab: { name: 'Shutter Crab', icon: '🦀', size: [8, 20], tug: 0.4, w: 4, line: 'Lives under the bridge and rattles like a roll-down shutter.', shape: [0.5, 0.2, 0.62, 0], c: ['#c8563a', '#f0c8a8'] },
};

// Lost things: where each turns up, who it belongs to (the zone they are in and their id there; as: the name
// over what they say, for those the dialogue box doesn't know), what Pip finds, and what they say getting it back.
export const LOST = {
  umbrella: { as: 'Noodle auntie', name: 'A striped umbrella', icon: '☂️', spot: 'canal', zone: 'quiet', owner: 'noodle', who: 'the noodle auntie, in the Quiet District', found: 'An umbrella, striped red and cream. The Soggy Cloud looks at it for a long time.', thanks: 'My umbrella! It blew off the balcony the autumn before last. Sit down, you’re having noodles.' },
  sock: { as: 'Student', name: 'The other sock', icon: '🧦', spot: 'pond', zone: 'academy', owner: 's1', who: 'a student in the Academy’s courtyard', found: 'A sock. One sock. Striped. …The Lost Sock goes very still.', thanks: 'That’s MINE! I’ve been one-footed since the first week of term!' },
  tile: { as: 'Old Mr Lau', name: 'A mahjong tile', icon: '🀄', spot: 'canal', zone: 'quiet', owner: 'oldman', who: 'old Mr Lau, in the Quiet District', found: 'A mahjong tile: the East Wind, worn smooth.', thanks: 'The East Wind! We have played with a trouser button in its place since before you were born.' },
  bottle: { as: 'The barber', name: 'A letter in a bottle', icon: '✉️', spot: 'jetty', zone: 'quiet', owner: 'barber', who: 'the barber, in the Quiet District', found: 'A bottle with a letter in it, the ink still dry. “To my brother, at the barber’s.”', thanks: 'From my brother… he did write. It only came the long way round.' },
  boat: { as: 'Little one', name: 'A toy boat', icon: '⛵', spot: 'seawall', zone: 'market', owner: 'kid2', who: 'a little one at the night market', found: 'A toy boat with a paper sail, a little soggy.', thanks: 'My boat! I thought it had sailed to the moon!' },
  specs: { as: 'Soy-milk seller', name: 'A pair of round spectacles', icon: '👓', spot: 'shore', zone: 'station', owner: 'vendor', who: 'the soy-milk seller at the station', found: 'Round spectacles, one arm bent.', thanks: 'So THAT is why the soy milk has looked blurry all year.' },
  tin: { name: 'A lemon-candy tin', icon: '🍋', spot: 'pond', zone: 'academy', owner: 'fang', who: 'Master Fang', found: 'A tin of lemon candies, still shut tight. There are initials on the lid: F.Q.', thanks: 'My emergency tin. I did wonder. There are four left, dear. Have one.' },
  brush: { name: 'A lantern-maker’s brush', icon: '🖌️', spot: 'fountain', zone: 'market', owner: 'lanternseller', who: 'the lantern seller at the night market', found: 'A fine brush, red paint dried in the bristles.', thanks: 'My grandfather’s brush! He dropped it the day the fog came. He talked about it until he was ninety.' },
  bell: { as: 'The ferryman', name: 'A brass doorbell', icon: '🔔', spot: 'fountain', zone: 'quiet', owner: 'ferryman', who: 'the ferryman, in the Quiet District', found: 'A small brass doorbell. It still rings.', thanks: 'Off my old front door, that is. Fifty years without a ring. I’ll hang it on the ferry.' },
  thimble: { name: 'A silver thimble', icon: '🪡', spot: 'jetty', zone: 'academy', owner: 'tangtang', who: 'Sunny', found: 'A silver thimble, with a tiny spool engraved on it.', thanks: 'That’s GRANDMA’S. From the thread shop! Pip, I’m going to cry on you. Stand still.' },
};

// The Great Sulk's little reminders that fell short into the water: each reads its own, and flies home.
export const REMINDERS = [
  'Call your sister.', 'Write back to Auntie Mei.', 'Say sorry about the vase.', 'Ask how the exam went.', 'Tell Grandpa you got home safe.', 'Return the borrowed umbrella.',
  'Invite the new neighbour to tea.', 'Tell your friend you miss them.', 'Water Mrs Chan’s plants.', 'Remember the birthday on the ninth.', 'Thank the ferryman.',
  'Say: actually, I’m not fine. Can we talk?',
];

// The old fountain's coins: each came with a wish. She reads it, and puts it back.
export const WISHES = [
  'I wish the lanterns would come back on.', 'I wish Mei would write.', 'I wish for a little sister. Or a goose.', 'I wish I had said goodbye properly.', 'I wish the soup was always this good.',
  'I wish somebody would knock.', 'I wish to pass the exam. Any exam.', 'I wish it would stop raining on Thursdays.', 'I wish for one more summer like this one.', 'I wish I was brave enough to ask her to dance.',
];

// Uncle Ming's requests, one at a time: what he asks, how it is met (given the save), and how the thread is
// better for it afterwards (cast: metres further; calm: the line stays calmer; lucky: rarer things bite).
export const REQUESTS = [
  { ask: 'Catch me anything at all. A fish is a fish.', met: (s) => Object.keys(s.fish).length >= 1, gift: ['cast', 'a longer thread: it casts further'] },
  { ask: 'A Lotus Carp from the Academy’s pond, longer than my forearm. Call it 40 cm.', met: (s) => (s.fish.carp?.[0] || 0) >= 40, gift: ['calm', 'a calmer line: it takes a tug better'] },
  { ask: 'Three different fish in your book.', met: (s) => Object.keys(s.fish).length >= 3, gift: ['lucky', 'a lucky float: rarer things come to it'] },
  { ask: 'Something that isn’t a fish, and take it back to whoever lost it.', met: (s) => Object.values(s.lost).some((v) => v === 2), gift: ['cast', 'a longer thread still'] },
  { ask: 'A Night Squid, from the market’s sea wall. They like the lanterns.', met: (s) => !!s.fish.squid, gift: ['calm', 'a calmer line still'] },
  { ask: 'Send ten of those little reminders home.', met: (s) => (s.reminders || 0) >= 10, gift: ['lucky', 'a luckier float'] },
];
