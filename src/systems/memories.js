// SPDX-License-Identifier: GPL-3.0-only
// Charm Sprite memories (Chapter 3). Every Charm Sprite remembers the feeling it was born from, and in the
// Quiet District, where nobody remembers anything, that makes them the investigators. A faint glow marks a
// memory spot (POINT_mem_<id>); Pip says what she notices, and you choose which Charm Sprite remembers
// it. The right one flies over and the memory plays: a pocket of colour blooms around the spot, golden
// figures from fifty years ago act it out, and afterwards the pocket stays in colour. A wrong guess just
// gets a friendly line: there is nothing to lose. Loaded only with the zones that use it.
import { AdditiveBlending, MeshBasicMaterial, Vector3 } from 'three';
import { G, flag, wait } from '../game.js';
import { talk, ask, tween } from '../story/helpers.js';
import { SPECIES, BOOK_ORDER } from '../content/species.js';
import { MEMORY_BOOK } from '../content/memories.js';
import { Humanoid } from '../actors/humanoid.js';
import { setPockets } from '../render/materials.js';
import { writeSave } from '../core/save.js';

const SHORT = { cloud: '☁️ Cloud', sock: '🧦 Sock', homework: '📄 Homework', pompom: '🎀 Pom-pom', sparrow: '🐦 Sparrow', grey: '🌫️ Grey' };
const WRONG = {
  cloud: 'The Soggy Cloud rains on it a little. That didn’t help.',
  sock: 'The Lost Sock sniffs all around it… nothing but dust.',
  homework: 'Unfinished Homework squints at it. There’s nothing here to read.',
  pompom: 'The Picked-Last Pom-pom cheers as loudly as it can. The fog doesn’t notice.',
  sparrow: 'The Wistful Sparrow flutters about. There’s no path to follow here.',
  grey: 'The Grey Grumbling sighs. It doesn’t remember this one.',
};
const _v = new Vector3();

let ghostMat = null;
// The golden memory figures: one shared additive material (they fade in and out together).
export function ghost() {
  return (ghostMat ||= new MeshBasicMaterial({ color: '#f7c98e', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
}

export class Memories {
  // defs: { <id>: { sprite, clue, lines: [[who, text, opts]], figures: [{ model, x, z, rot, anim, overlay, scale }],
  //   hidden() (true while it can't be found yet), before(spot), after(spot) } }
  constructor(zone, defs) {
    this.zone = zone;
    this.defs = defs;
    this.spots = [];
    this.pockets = zone.pockets || []; // the zone's own list, if it keeps one (systems/fog.js usePockets)
    this.busy = false;
    for (const m of zone.markersBy('POINT_mem_')) {
      const id = m.name.slice(10);
      const def = defs[id];
      if (!def) continue;
      const spot = { id, def, marker: m, position: m.position, radius: m.data.radius || 6, title: MEMORY_BOOK.find((b) => b[0] === id)?.[2] || id };
      spot.glow = G.fx.glows.add(m.position, '#ffe2a8', 0);
      zone.addInteractable({
        position: m.position,
        radius: 2.4,
        priority: 1,
        label: 'Look closer',
        enabled: () => this.available(spot),
        action: () => this.look(spot),
      });
      this.spots.push(spot);
      if (flag('mem_' + id)) this.pockets.push({ position: m.position, radius: spot.radius });
    }
    setPockets(this.pockets);
    G.updaters.add((dt) => this.update(dt));
  }

  available(spot) {
    return !this.busy && !flag('mem_' + spot.id) && !spot.def.hidden?.();
  }
  get count() {
    return this.spots.filter((s) => flag('mem_' + s.id)).length;
  }
  // Is this point inside a restored memory's pocket of colour? (A grey Grumbling there trusts sooner.)
  near(pos) {
    return this.pockets.some((p) => p.radius > 1 && p.position.distanceTo(pos) < p.radius);
  }

  update() {
    // a faint, breathing glow over every memory still waiting to be found
    for (const s of this.spots) {
      const on = this.available(s);
      _v.copy(s.position).setY(s.position.y + 1.0 + Math.sin(G.time * 1.3 + s.position.x) * 0.08);
      G.fx.glows.set(s.glow, _v, null, on ? 0.45 + Math.sin(G.time * 2 + s.position.z) * 0.12 : 0);
      if (on && Math.random() < 0.03) G.fx.sparkles.emit(_v, 1, '#ffe2a8', { speed: 0.2, up: 0.25, size: 0.1, life: 1.4 });
    }
  }

  async look(spot) {
    if (this.busy) return;
    this.busy = true;
    const def = spot.def;
    const ids = BOOK_ORDER.filter((id) => id !== 'doudou' && G.collection.has(id));
    try {
      await talk([['xiaopei', def.clue, { face: 'worried' }]]);
      if (!ids.length) return;
      const a = await ask('xiaopei', 'Which Charm Sprite remembers this?', ids.map((id) => SHORT[id] || SPECIES[id].name).concat(['Not now']));
      G.ui.closeDialogue();
      const id = ids[a];
      if (!id) return;
      if (id !== def.sprite) {
        const lines = [[null, WRONG[id] || 'Nothing happens.']];
        if (!ids.includes(def.sprite)) lines.push(['xiaopei', 'Maybe a Charm Sprite I haven’t met yet remembers this…', { face: 'worried' }]);
        await talk(lines);
        return;
      }
      await this.play(spot, id);
    } finally {
      this.busy = false;
    }
  }

  // The memory: the sprite flies over, colour blooms, golden figures act out the moment, then it stays.
  async play(spot, spriteId) {
    const def = spot.def;
    const p = G.player;
    G.frozen = true;
    let s = G.sprites.list.find((x) => x.id === spriteId);
    const temp = !s;
    if (temp) s = G.sprites.spawn(spriteId, p.position.clone().setY(p.position.y + 1.1));
    s.hold = spot.position.clone().setY(spot.position.y + 1.2);
    G.audio.play('sparkle');
    const cam = this.zone.marker('CAM_mem_' + spot.id);
    const look = spot.position.clone().setY(spot.position.y + 1.0);
    if (cam) G.cam.setShot(cam.position, look, 1.2);
    await wait(1.1);
    const pocket = { position: spot.position, radius: 0.01 };
    this.pockets.push(pocket);
    const figures = (await Promise.all((def.figures || []).map((f) => this.figure(spot, f).catch(() => null)))).filter(Boolean);
    G.audio.play('memory');
    G.fx.sparkles.emit(look, 40, '#ffe2a8', { speed: 1.6, up: 1, size: 0.14, life: 1.4, spread: 0.6 });
    await tween(2.4, (k) => {
      pocket.radius = spot.radius * (1 - (1 - k) * (1 - k));
      setPockets(this.pockets);
      ghost().opacity = 0.4 * k;
    });
    await def.before?.(spot);
    await talk((def.lines || []).map(([who, text, o]) => [who, text, { memory: true, ...o }]));
    G.frozen = true;
    await tween(1.2, (k) => (ghost().opacity = 0.4 * (1 - k)));
    for (const h of figures) {
      G.updaters.delete(h.userUpdate);
      h.root.removeFromParent();
    }
    flag('mem_' + spot.id, true);
    writeSave(G.save);
    this.zone.onMemory?.(spot.id);
    await def.after?.(spot);
    await this.afterEach?.(spot.id); // the friends' thoughts, still inside the scene
    G.frozen = true;
    s.hold = null;
    if (temp) G.sprites.remove(s);
    G.cam.clearShot();
    G.frozen = false;
    G.collection.cozy(5, 'Remembered', p.position.clone().setY(p.position.y + 1.6));
    G.ui.toast(`🕯️ Memory restored: <b>${spot.title}</b>`, 3.2);
    G.events.emit('memory', spot.id);
  }

  // One golden figure, placed in the spot's frame (x = its right, z = in front of it).
  async figure(spot, f) {
    const h = await goldenFigure(f.model);
    const fa = spot.marker.facing;
    const x = spot.position.x + Math.cos(fa) * (f.x || 0) + Math.sin(fa) * (f.z || 0);
    const z = spot.position.z - Math.sin(fa) * (f.x || 0) + Math.cos(fa) * (f.z || 0);
    const y = G.collision?.groundY(x, z, spot.position.y + 1.5) ?? spot.position.y;
    h.root.position.set(x, y, z);
    h.root.rotation.y = fa + ((f.rot || 0) * Math.PI) / 180;
    if (f.scale) h.root.scale.setScalar(f.scale);
    h.play(f.anim || 'idle', 0);
    if (f.overlay) h.overlayPlay(f.overlay, 0);
    this.zone.group.add(h.root);
    h.userUpdate = (dt) => h.update(dt, 5);
    G.updaters.add(h.userUpdate);
    return h;
  }

  // Compile the memory material once, early (an invisible figure for a moment), so the first memory
  // doesn't stutter on a phone.
  async warm(model) {
    const spot = this.spots[0];
    if (!spot) return;
    const h = await this.figure(spot, { model }).catch(() => null);
    if (!h) return;
    setTimeout(() => {
      G.updaters.delete(h.userUpdate);
      h.root.removeFromParent();
    }, 600);
  }
}

// A townsperson in the golden memory material (not yet in the scene; the caller places and updates it).
export async function goldenFigure(model) {
  const h = await Humanoid.load(model, { fresh: true });
  h.root.traverse((o) => {
    if (o.isMesh) {
      o.material = ghost();
      o.castShadow = o.receiveShadow = false;
    }
  });
  return h;
}
