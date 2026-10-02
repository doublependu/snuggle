// SPDX-License-Identifier: GPL-3.0-only
// Small helpers shared by the story scripts.
import { Vector3 } from 'three';
import { G, flag, until, wait } from '../game.js';
import { SPEAKERS } from '../ui/ui.js';
import { SPECIES } from '../content/species.js';

export async function talk(lines) {
  for (let i = 0; i < lines.length; i++) {
    const [who, text, opts] = lines[i];
    await G.ui.say(who, text, { ...opts, more: lines.length - 1 - i });
  }
  G.ui.closeDialogue();
}

// Comments said as speech bubbles over whoever says them, one after another, while the player keeps walking
// (after a soothe, a flock, a memory: nothing the story waits for). Narration (who = null) is a toast.
export async function chat(lines) {
  for (const [who, text] of lines) {
    const life = 2 + text.length / 16;
    const n = G.npcs.get(who === 'honk' ? 'weibao' : who);
    const sprite = G.sprites?.list.find((s) => s.id === who);
    const name = SPEAKERS[who]?.[0];
    if (!who) G.ui.toast(text, life);
    else if (who === 'xiaopei') G.ui.bubble(G.player.root, text, life, 1.6);
    else if (who === 'doudou' && G.zone?.bean?.out) G.ui.bubble(G.player.doudou, text, life, 0.3); // Bean, awake
    else if (n && !n.hidden) G.ui.bubble(n.root, who === 'honk' ? '🪿 ' + text : text, life, 1.55);
    else if (sprite) G.ui.bubble(sprite.obj, text, life, 0.55);
    else G.ui.bubble(G.player.root, `<b>${name || who}:</b> ${text}`, life, 1.6);
    await wait(life + 0.4);
  }
}

// Which part of the story a save is in, once Chapter 3 is over: 'ch4' (Bean's Secret), 'ch5' (The Great Sulk),
// 'epilogue' (Morning in Lantern Bay) or 'free' (free-roam Lantern Bay). null before that.
export function era() {
  if (!flag('ch3Done')) return null;
  return flag('epilogueDone') ? 'free' : flag('ch5Done') ? 'epilogue' : flag('ch4Done') ? 'ch5' : 'ch4';
}

// After Chapter 3 the story's scripts are loaded when a zone starts (src/main.js G.later), not with the zone:
// each exports a function per zone it plays in (chapter4.academy, chapter4.quiet, chapter4.heart, ...).
export async function runStory(z) {
  const e = era();
  if (!e) return false;
  const m = await G.later(e);
  if (G.zone !== z) return true;
  await m[z.id]?.(z);
  return true;
}

// Resolves after `seconds` of game time, calling fn(k) with k going 0..1 every frame.
export function tween(seconds, fn) {
  return new Promise((res) => {
    let t = 0;
    const u = (dt) => {
      t += dt;
      const k = Math.min(1, t / seconds);
      fn(k);
      if (k >= 1) {
        G.updaters.delete(u);
        res();
      }
    };
    G.updaters.add(u);
  });
}

// Ask a question; resolves to the chosen index (dialogue stays open for the reply).
export function ask(who, text, choices) {
  return G.ui.say(who, text, { choices });
}

// A spot that needs a Charm Sprite's ability (thirsty lotus buds, a faded note, a lost child). If that sprite
// is in the book but isn't the helper, offer to equip it right there: the Sprite Book is the only other
// place to do it, and easy to miss. Resolves true when it is helping now.
export async function offerHelper(ability, question) {
  if (G.collection.helper(ability)) return true;
  const id = Object.keys(SPECIES).find((k) => SPECIES[k].ability === ability);
  if (!id || !G.collection.has(id)) return false;
  const a = await ask('xiaopei', question, ['Yes, please', 'Not now']);
  G.ui.closeDialogue();
  if (a !== 0) return false;
  G.collection.equip(id);
  return true;
}

// target: where the objective is, for the guide (systems/wayfinder.js): an NPC's or Grumbling's id, a marker's
// name, a position, a list of those (the nearest counts), or a function that returns one. null: nowhere.
// A friend's passing remark, as a bubble: once a visit for each key, and never over a scene.
const remarked = new Set();
export function remark(key, who, text) {
  const k = G.zone?.id + ':' + key;
  if (remarked.has(k) || G.frozen || G.ui.dialogueOpen) return;
  remarked.add(k);
  chat([[who, text]]);
}

export function objective(text, target = null) {
  G.goal = text ? target : null;
  G.ui.setObjective(text);
  G.events.emit('objective', text);
}

// {action} shows the key or button bound to it on the device in use (the player may have changed them).
const HINTS = {
  move: {
    keyboard: 'Walk with <b>{move}</b>, hold <b>{sprint}</b> to run. Click the view to look around with the <b>mouse</b>.',
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
