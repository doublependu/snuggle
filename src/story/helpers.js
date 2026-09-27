// SPDX-License-Identifier: GPL-3.0-only
// Small helpers shared by the story scripts.
import { Vector3 } from 'three';
import { G, until } from '../game.js';

export async function talk(lines) {
  for (const [who, text, opts] of lines) await G.ui.say(who, text, opts);
  G.ui.closeDialogue();
}

// Ask a question; resolves to the chosen index (dialogue stays open for the reply).
export function ask(who, text, choices) {
  return G.ui.say(who, text, { choices });
}

export function objective(text) {
  G.ui.setObjective(text);
  G.events.emit('objective', text);
}

// {action} shows the key or button bound to it on the device in use (the player may have changed them).
const HINTS = {
  move: {
    keyboard: 'Move with <b>{move}</b>. Click the view to look around with the <b>mouse</b>.',
    gamepad: 'Move with the <b>left stick</b>, look with the <b>right stick</b>.',
    touch: 'Drag on the <b>left</b> to walk, drag on the <b>right</b> to look around.',
  },
  notice: { key: 'Walk up to it and press <b>{interact}</b> to Notice it.', touch: 'Walk up to it and tap <b>Notice</b>.' },
  hum: { keyboard: 'Hold <b>{hum}</b> (or the left mouse button) to hum.', gamepad: 'Hold <b>{hum}</b> to hum.', touch: 'Hold the big <b>Hum</b> button.' },
  talk: { key: 'Press <b>{interact}</b> to talk.', touch: 'Tap <b>Talk</b>.' },
  assist: { key: 'Press <b>{assist}</b> to toss a tart at a Grumbling.', touch: 'Tap <b>Tart</b> to toss a tart at a Grumbling.' },
  book: { key: 'Press <b>{book}</b> to open your Sprite Book.', touch: 'Tap 📖 to open your Sprite Book.' },
  jump: { key: 'Press <b>{jump}</b> to jump.', touch: 'Tap <b>Jump</b>.' },
};

export function hint(name, life = 5) {
  const h = HINTS[name];
  const d = G.input.device;
  const text = (h?.[d] || (d !== 'touch' && h?.key) || h?.keyboard || h?.key || name).replace(/\{(\w+)\}/g, (_, a) => G.input.label(a));
  G.ui.toast('💡 ' + text, life);
}

export function markerPos(name) {
  return G.zone.marker(name)?.position.clone() || new Vector3();
}

// Frame a shot from a CAM_ marker at the player's (or a target's) head.
export function shot(camMarker, target = G.player.position, height = 0.9, blend = 1.2) {
  const m = G.zone.marker(camMarker);
  if (!m) return;
  G.cam.setShot(m.position, target.clone().setY(target.y + height), blend);
}

export function near(pos, r) {
  return G.player.position.distanceTo(pos) < r;
}

// Story waits on *state*, never on a one-shot event: the player may get there first (notice or soothe
// a Grumbling before the script asks), and a missed event would wait forever.
export const noticed = (g) => until(() => !g || g.noticed);
export const soothed = (g) => until(() => !g || g.soothed);
