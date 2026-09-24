// Small helpers shared by the story scripts.
import { Vector3 } from 'three';
import { G } from '../game.js';

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

const HINTS = {
  move: {
    keyboard: 'Move with <b>WASD</b>. Click the view to look around with the <b>mouse</b>.',
    gamepad: 'Move with the <b>left stick</b>, look with the <b>right stick</b>.',
    touch: 'Drag on the <b>left</b> to walk, drag on the <b>right</b> to look around.',
  },
  notice: { keyboard: 'Walk up to it and press <b>F</b> to Notice it.', gamepad: 'Walk up to it and press <b>X</b> to Notice it.', touch: 'Walk up to it and tap <b>Notice</b>.' },
  hum: { keyboard: 'Hold <b>E</b> (or the left mouse button) to hum.', gamepad: 'Hold <b>RT</b> to hum.', touch: 'Hold the big <b>Hum</b> button.' },
  talk: { keyboard: 'Press <b>F</b> to talk.', gamepad: 'Press <b>X</b> to talk.', touch: 'Tap <b>Talk</b>.' },
  assist: { keyboard: 'Press <b>Q</b> to toss a tart at a Grumbling.', gamepad: 'Press <b>Y</b> to toss a tart at a Grumbling.', touch: 'Tap <b>Tart</b> to toss a tart at a Grumbling.' },
  book: { keyboard: 'Press <b>Tab</b> to open your Sprite Book.', gamepad: 'Press <b>Back</b> to open your Sprite Book.', touch: 'Tap 📖 to open your Sprite Book.' },
  jump: { keyboard: 'Press <b>Space</b> to jump.', gamepad: 'Press <b>A</b> to jump.', touch: 'Tap <b>Jump</b>.' },
};

export function hint(name, life = 5) {
  const h = HINTS[name];
  const text = typeof h === 'string' ? h : h?.[G.input.device] || h?.keyboard || name;
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
