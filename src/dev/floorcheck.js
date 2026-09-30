// SPDX-License-Identifier: GPL-3.0-only
// Dev builds only: twice a second, check that Pip and the standing NPCs are on the floor, not inside it.
// (A story spot taken from a marker at ground level once left her inside the pavilion's raised platform.)
// Warns "[floor] …" once per character and zone; tools/e2e fails a test on it.
import { G } from '../game.js';

let t = 0;
let zone = null;
let warned = new Set();

export function floorCheck(dt) {
  if ((t += dt) < 0.5 || !G.collision || !G.zone) return;
  t = 0;
  if (zone !== G.zone) {
    zone = G.zone;
    warned = new Set();
  }
  const check = (id, pos) => {
    const y = G.collision.floorY(pos, 0.8, 0);
    if (y === null || y - pos.y < 0.08 || warned.has(id)) return;
    warned.add(id);
    console.warn(`[floor] ${id} in ${G.zone.id} is ${(y - pos.y).toFixed(2)} m under the floor at ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}`);
  };
  if (G.player.state === 'move') check('xiaopei', G.player.position);
  for (const n of G.npcs.values()) if (!n.hidden && !n.seated && !n.walkTarget && !n.follower && n.root.parent) check(n.id, n.position);
}
