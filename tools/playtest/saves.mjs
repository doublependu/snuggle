// SPDX-License-Identifier: GPL-3.0-only
// Saves to start from partway through the story (development runs of the autoplayer, and the camera's scenery
// shots in tools/video/shots.mjs). A recorded playthrough always starts from a fresh game, or from the save the
// previous part ended with.
const base = (over = {}) => ({ v: 2, zone: 'train', spawn: 'SPAWN_start', story: {}, sprites: {}, soothed: {}, seen: {}, helper: null, cozy: 0, tarts: 0, chestnuts: 0, candies: {}, settings: {}, ...over });
const P = { train_intro: true, prologueTrain: true, prologueDone: true };
const C1 = { ...P, ch1_welcome: true, ch1_lesson: true, sockDone: true, homeworkDone: true, cookDone: true, pompomDone: true, ch1Done: true, weibaoFriend: true };
const C2 = { ...C1, ch2_start: true, ch2_tutorial: true, flock1Done: true, flock2Done: true, flock3Done: true, ch2_dumplings: true, ch2Done: true };
const SP1 = { doudou: 1, cloud: 1, sock: 1, homework: 1, pompom: 1 };
export const FROMS = {
  fresh: base(),
  station: base({ zone: 'station', sprites: { doudou: 1, cloud: 1 }, soothed: { 'train:cloud': true, 'train:doudou': true }, story: { train_intro: true, prologueTrain: true } }),
  ch1: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 20, tarts: 2, sprites: { doudou: 1, cloud: 1 }, soothed: { 'train:cloud': true }, story: P }),
  lesson: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 25, tarts: 2, sprites: { doudou: 1, cloud: 1 }, soothed: { 'train:cloud': true }, story: { ...P, ch1_welcome: true } }),
  ch2: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 50, tarts: 3, sprites: SP1, story: C1 }),
  market: base({ zone: 'market', cozy: 50, tarts: 3, sprites: SP1, story: { ...C1, ch2_start: true } }),
  ch3: base({ zone: 'market', cozy: 70, sprites: { ...SP1, sparrow: 12 }, story: C2 }),
  quiet: base({ zone: 'quiet', spawn: 'SPAWN_ferry', cozy: 70, sprites: { ...SP1, sparrow: 12 }, story: { ...C2, ch3_start: true, ch3_greys: true } }),
  bake: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 40, tarts: 2, sprites: { doudou: 1, cloud: 1, sock: 1, homework: 1 }, soothed: { 'train:cloud': true }, story: { ...P, ch1_welcome: true, ch1_lesson: true, sockDone: true, homeworkDone: true } }),
  dusk: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 90, sprites: { ...SP1, sparrow: 12, grey: 1 }, story: { ...C2, ch3_start: true, ch3_greys: true, ch3_arrive: true, mem_notice: true, mem_post: true, mem_sweets: true, mem_teahouse: true, mem_thread: true, mem_kitchen: true, ch3_return: true } }),
};
// the story's later parts (to watch the autoplayer try them, and to start it in the Epilogue or free roam)
const C3 = { ...C2, ch3_start: true, ch3_greys: true, ch3_arrive: true, mem_notice: true, mem_post: true, mem_sweets: true, mem_teahouse: true, mem_thread: true, mem_kitchen: true, kind_barber: true, kind_oldman: true, ch3_return: true, ch3_story: true, ch3Done: true };
const C4 = { ...C3, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true, ch4_garden: true, ch4_gap: true, ch4_secret: true, ch4_thread: true, ch4_threadTold: true, ch4_followed: true, stitch_bell: true, stitch_letter: true, stitch_lantern: true, stitch_sunny: true, stitch_bo: true, ch4Done: true };
const C5 = { ...C4, ch5_arrive: true, ch5_tier: 3, ch5_score: 12, ch5_p1: true, ch5_heard: 6, ch5_p2: true, ch5_called: true, ch5_p3: true, ch5_kitchen: 3, ch5_p4: true, ch5_golden: 9, ch5_sewn: true, ch5Done: true };
const SP3 = { ...SP1, sparrow: 12, grey: 2 };
Object.assign(FROMS, {
  ch4: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 60, tarts: 2, sprites: SP3, story: C3 }),
  fog: base({ zone: 'quiet', spawn: 'SPAWN_ferry', cozy: 60, tarts: 2, sprites: SP3, story: { ...C3, ch4_start: true, ch4_friends: true, ch4_note: true } }),
  heart: base({ zone: 'heart', spawn: 'SPAWN_garden', cozy: 60, tarts: 2, sprites: SP3, story: { ...C3, ch4_start: true, ch4_friends: true, ch4_note: true, ch4_ferry: true, ch4_sigh: true, ch4_lost: true } }),
  ch5: base({ zone: 'heart', spawn: 'SPAWN_cross', cozy: 60, tarts: 2, sprites: SP3, story: C4 }),
  epilogue: base({ zone: 'heart', spawn: 'SPAWN_square', cozy: 0, sprites: SP3, story: C5 }),
  free: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 30, tarts: 2, sprites: SP3, story: { ...C5, ep_dawn: true, ep_walk: true, ep_breakfast: true, ep_fishing: true, ep_cardigan: true, epilogueDone: true } }),
  // (day 2 of free roam, with the Quiet District's pom-pom on the worry board: for trying the pom-pom quickly)
  free2: base({ zone: 'academy', spawn: 'SPAWN_gate', cozy: 30, tarts: 2, sprites: SP3, day: 2, worries: { day: 2, ids: ['a_cloud', 'q_pompom', 'a_sock'], done: [false, false, true] }, story: { ...C5, ep_dawn: true, ep_walk: true, ep_breakfast: true, ep_fishing: true, ep_cardigan: true, epilogueDone: true } }),
});
