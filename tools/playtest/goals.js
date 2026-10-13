// SPDX-License-Identifier: GPL-3.0-only
// What the autoplayer sets out to do, one goal at a time: walk somewhere, talk to someone, notice or soothe a
// Grumbling, keep a grey one company, sit with a flock, look closer at a glow. Each goal works only from the
// eyes' snapshot (s) and acts through the brain's helpers (travel, aim, explore) and hands.
import { tokens } from './words.js';

const now = () => Date.now();

export class Goal {
  constructor(b, desc) {
    this.b = b;
    this.desc = desc;
    this.t0 = now();
    this.best = Infinity;
    this.bestT = now();
    this.finished = false;
    b.think(desc);
  }
  // progress: a distance (or anything that shrinks) getting smaller, or an explicit nudge
  progress(d = -Infinity) {
    if (d < this.best - 0.5) {
      this.best = d;
      this.bestT = now();
    }
  }
  nudge() {
    this.bestT = now();
  }
  get stale() {
    return (now() - this.bestT) / 1000;
  }
  get age() {
    return (now() - this.t0) / 1000;
  }
  finish(why) {
    if (this.finished) return;
    this.finished = true;
    if (why) this.b.think(why);
  }
}

// Walk around for a while (the train: "Stretch your legs").
export class Wander extends Goal {
  constructor(b, desc, seconds = 4) {
    super(b, desc);
    this.seconds = seconds;
  }
  async tick(s) {
    const b = this.b;
    if (this.age > this.seconds) {
      await b.hands.stop();
      return this.finish();
    }
    const clear = b.clearAhead(s);
    if (clear < 1.5) await b.hands.turn(120);
    await b.hands.move(['KeyW']);
  }
}

// Go to something (a person, a creature, a place): found by how it looks or by a name learned from dialogue.
export class Reach extends Goal {
  // (through: passing through it is the point, so arriving finishes the goal)
  constructor(b, desc, { want = [], kind = null, place = [], radius = 1.5, tiptoe = false, then = null, keepGoing = false, through = false } = {}) {
    super(b, desc);
    Object.assign(this, { want, kind, place, radius, tiptoe, then, keepGoing, through });
  }
  async tick(s) {
    const b = this.b;
    if (this.orbit) return this.goRound(s);
    const t = this.want.length || this.kind ? b.find(s, { kind: this.kind, want: this.want }) : null;
    const p = t || (this.place.length ? b.findPlace(s, this.place, (this.checked ||= new Set())) : null);
    if (!p) return b.explore(s, this, this.place);
    // a fingerpost's arm: go the way it points, on past the end of the arm, and then look again
    if (p.arm && p.post) {
      const dx = p.pos[0] - p.post[0],
        dz = p.pos[2] - p.post[1],
        l = Math.hypot(dx, dz) || 1;
      const on = [p.pos[0] + (dx / l) * 6, p.pos[2] + (dz / l) * 6];
      if (this.armKey !== p.key) {
        this.armKey = p.key;
        b.think(`${p.looks[0].toUpperCase() + p.looks.slice(1)}. I go that way.`);
      }
      const res = await b.travel(s, on[0], on[1], { radius: 1.5, goal: this });
      if (res.arrived) (b.mem.armsUsed ||= new Set()).add(p.key);
      return;
    }
    const [x, , z] = p.pos;
    const r = t ? this.radius : Math.max(this.radius, (p.size || 1) * 0.3);
    const res = await b.travel(s, x, z, { radius: this.keepGoing ? 0 : r, tiptoe: this.tiptoe, goal: this });
    if (res.arrived || (this.keepGoing && res.dist < 0.6)) {
      await b.hands.stop();
      // a beat of standing still on arrival, looking at what I came for
      if (!this.paused) {
        this.paused = true;
        if (t) await b.aimAt(s, t);
        await b.hands.wait(500);
      }
      if (this.then) await this.then(s, p);
      if (this.through) return this.finish();
      // here, and nothing has happened yet? If the game's guide points somewhere else, this wasn't the place:
      // cross it off and follow the guide. Else try its other sides (the front of a stall, say)
      this.arrivedAt ||= Date.now();
      if (Date.now() - this.arrivedAt > 3000 && !t && s.ui.way && s.ui.way.dist > 4) {
        this.checked.add(p.looks + '@' + p.pos[0].toFixed(0) + ',' + p.pos[2].toFixed(0));
        this.arrivedAt = null;
        this.paused = false;
        b.think('Nothing here. The arrow under the objective points on: I follow it.');
        return b.followGuide(s);
      }
      if (Date.now() - this.arrivedAt > 3000) {
        const r2 = (p.size || 1.5) + 1.3;
        const a0 = Math.atan2(s.me.pos[0] - x, s.me.pos[2] - z);
        this.orbit = [1, 2, 3, 4].map((k) => [x + Math.sin(a0 + (k * Math.PI) / 2) * r2, z + Math.cos(a0 + (k * Math.PI) / 2) * r2]);
        b.think('I’m here, but nothing’s happening. I walk round to the other side.');
      }
    }
  }
  async goRound(s) {
    const b = this.b;
    const [x, z] = this.orbit[0];
    const res = await b.travel(s, x, z, { radius: 0.8, goal: this });
    if (res.arrived) {
      await b.hands.wait(800);
      this.orbit.shift();
      this.nudge();
      if (!this.orbit.length) this.finish();
    }
  }
}

// Talk to someone: walk up close, and press Interact when the prompt says Talk.
export class Talk extends Goal {
  constructor(b, desc, { want = [], place = [], hint = '', looks = null } = {}) {
    super(b, desc);
    Object.assign(this, { want, place, choiceHint: hint, looks });
  }
  async tick(s) {
    const b = this.b;
    // (no name: "someone is fishing at the end of the jetty". Not just anybody: whoever is there, by how they look)
    let t = this.want.length ? b.find(s, { kind: 'person', want: this.want }) : null;
    // a name I haven't learned yet: whoever is at that place is probably them
    const pl0 = !t && this.place.length ? b.findPlace(s, this.place) : null;
    if (!t && pl0 && (!this.want.length || !b.knows(this.want))) {
      t = b.find(s, { kind: 'person', want: this.looks || [], near: pl0.pos, within: Math.max(6, (pl0.size || 2) + 3), filter: (x) => !x.following });
      if (t && !this.guessed) {
        this.guessed = true;
        b.think(`I don’t know who ${this.want[0] || 'that'} is yet, but ${t.looks} is right here. I ask them.`);
      }
    }
    if (!t) {
      if (this.place.length && b.findPlace(s, this.place)) {
        const pl = b.findPlace(s, this.place);
        const res = await b.travel(s, pl.pos[0], pl.pos[2], { radius: 3, goal: this });
        if (!res.arrived) return;
      }
      return b.explore(s, this, this.place);
    }
    if (s.ui.prompt?.label !== 'Talk' && b.shouldLookFor(this, t, 6)) return b.lookFor(s, this, t);
    // someone else is nearer (Sunny beside Bo): the prompt would be for them. Step up to the one I want first.
    const nearer = (s.things || []).some((x) => x.kind === 'person' && x.key !== t.key && x.dist < t.dist + 0.3);
    if (nearer && t.dist > 0.95) return b.travel(s, t.pos[0], t.pos[2], { radius: 0.85, goal: this });
    if (s.ui.prompt?.label === 'Talk' && t.dist < 2.9) {
      await b.hands.stop();
      // a moment to face them first, as you would
      if (!this.faced) {
        this.faced = true;
        await b.aimAt(s, t);
        return b.hands.wait(300 + Math.random() * 300);
      }
      await b.hands.tap(b.key('interact'));
      b.mem.talkedTo.add(s.place + '|' + t.looks);
      this.pressed = (this.pressed || 0) + 1;
      await b.hands.wait(400);
      if (this.pressed > 4) this.finish('The prompt says Talk, but nothing happens.');
      return;
    }
    const res = await b.travel(s, t.pos[0], t.pos[2], { radius: 1.6, goal: this });
    if (res.arrived) {
      // close, but no Talk prompt: step round to face them
      await b.aimAt(s, t);
      this.close = (this.close || 0) + 1;
      if (this.close > 40) this.finish('I stood next to them, but there was nothing to say.');
    }
  }
}

// Notice a Grumbling: walk up (gently) and press Interact on the Notice prompt.
export class Notice extends Goal {
  constructor(b, desc, want, place = []) {
    super(b, desc);
    this.want = want;
    this.place = place;
  }
  async tick(s) {
    const b = this.b;
    const t = b.find(s, { kind: 'creature', want: this.want, filter: (x) => !x.asleep && (this.want.length || !x.noticed) });
    if (!t) return b.explore(s, this, this.place || []);
    if (t.noticed) return this.finish();
    if (b.shouldLookFor(this, t, 8)) return b.lookFor(s, this, t);
    if (s.ui.prompt?.label === 'Notice') {
      await b.hands.stop();
      await b.hands.tap(b.key('interact'));
      await b.hands.wait(300);
      return;
    }
    await b.travel(s, t.pos[0], t.pos[2], { radius: 2.2, tiptoe: true, goal: this });
  }
}

// How far to keep from each kind of Grumbling while humming (a sock runs off if you come close; paper balls
// are easier to dodge from further away; a cloud follows you anyway).
const KEEP = [
  [/sock/, [3.4, 6.2]],
  [/homework/, [3.8, 6.5]],
  [/cloud/, [1.5, 5]],
  [/pom-pom/, [0, 5]],
  [/sparrow/, [2.2, 5]],
  [/grey/, [1.8, 5]],
  [/butterflies/, [0.8, 2.0]], // they loop round a person: stand right with them
];

// Soothe a Grumbling: get within humming range, face it, hold Hum; step out of rain rings and away from
// where a paper ball is about to land; re-press Hum on the beat once the game has taught that; toss a tart.
export class Soothe extends Goal {
  constructor(b, desc, want, { place = [], tryFor = 0, only = null, keep = null } = {}) {
    super(b, desc);
    Object.assign(this, { want, place, tryFor, only, keepOverride: keep });
    this.humT = 0;
    this.lastProg = 0;
    this.tossed = new Set();
  }
  async tick(s) {
    const b = this.b;
    const t = b.find(s, { kind: 'creature', want: this.want, filter: (x) => !x.asleep && (!this.only || this.only(x)) });
    if (!t) {
      await b.hands.up('KeyE');
      if (this.seenAsleep && this.age > 3) return this.finish('It fell asleep.');
      if (this.only && this.age > 8) return this.finish();
      return b.explore(s, this, this.place);
    }
    if (b.shouldLookFor(this, t, 8)) return b.lookFor(s, this, t);
    const keep = this.keepOverride || KEEP.find(([re]) => re.test(t.looks))?.[1] || [2, 5];
    const ring = s.ui.ring;
    if (ring) {
      if (ring.progress > this.lastProg + 0.02) {
        this.lastProg = ring.progress;
        this.nudge();
      }
      if (ring.progress >= 0.99) this.seenAsleep = true;
    }
    if (t.dist > keep[1] + 1.5 && !s.me.humming) {
      await b.hands.up('KeyE');
      return b.travel(s, t.pos[0], t.pos[2], { radius: keep[1], tiptoe: t.dist < 9 && /sparrow|grey/.test(t.looks), goal: this });
    }
    // in range: face it and hum
    this.progress(0);
    await b.aimAt(s, t);
    const keys = [];
    if (t.dist < keep[0]) keys.push('KeyS');
    else if (t.dist > keep[1]) keys.push('KeyW');
    const dodge = b.dodge(s);
    if (dodge) keys.push(dodge);
    await b.hands.move(keys);
    await b.hands.down(b.key('hum'));
    this.humT += b.dt;
    if (this.tryFor && this.humT > this.tryFor) {
      await b.hands.up(b.key('hum'));
      return this.finish();
    }
    // re-press Hum right on the pulse (once the tip has shown up)
    if (b.know.beat && ring && ring.label === '♪') await b.onBeat(s, async () => {
      await b.hands.up(b.key('hum'));
      await b.hands.down(b.key('hum'));
    });
    // a tart helps when it's slow going
    if (b.know.assist && !this.tossed.has(t.key) && this.stale > 5 && ring && ring.progress < 0.7 && b.snacks(s) > 0) {
      this.tossed.add(t.key);
      b.think('This is slow going. I toss it a tart.');
      await b.hands.tap(b.key('assist'));
    }
  }
}

// Walk up to something that can be used (a board to read, a spot to fish from) and use it: Interact, when the
// prompt says so.
export class Use extends Goal {
  constructor(b, desc, want, label, place = []) {
    super(b, desc);
    Object.assign(this, { want, label, place });
  }
  async tick(s) {
    const b = this.b;
    if (s.ui.prompt && this.label.test(s.ui.prompt.label)) {
      await b.hands.stop();
      await b.hands.tap(b.key('interact'));
      await b.hands.wait(700);
      return this.finish();
    }
    const t = b.find(s, { kind: 'object', want: this.want, skip: (this.tried ||= new Set()) });
    if (!t) return b.explore(s, this, this.place);
    this.progress(t.dist);
    const res = await b.travel(s, t.pos[0], t.pos[2], { radius: 0.9, goal: this });
    // right by it, and it doesn't offer what I'm after: not this one
    if (res.arrived) {
      this.closeT ||= Date.now();
      if (Date.now() - this.closeT > 2500) {
        this.tried.add(t.key);
        this.closeT = 0;
        b.think('Not this one. I look for another.');
      }
    } else this.closeT = 0;
  }
}

// Lead a Grumbling somewhere (the lonely pom-pom wants company), then soothe it there.
export class Lead extends Goal {
  constructor(b, desc, want, place) {
    super(b, desc);
    Object.assign(this, { want, place });
  }
  async tick(s) {
    const b = this.b;
    if (this.soothe) return this.soothe.finished ? this.finish() : this.soothe.tick(s);
    const pl = b.findPlace(s, this.place);
    if (!pl) return b.explore(s, this, this.place);
    const t = b.find(s, { kind: 'creature', want: this.want, filter: (x) => !x.asleep });
    // wait for it to catch up
    if (t && t.dist > 6) {
      await b.hands.stop();
      await b.aimAt(s, t);
      return;
    }
    const res = await b.travel(s, pl.pos[0], pl.pos[2], { radius: 2, goal: this });
    // (beside it will do: a long table's middle is out of reach from its end)
    if (res.arrived || Math.hypot(pl.pos[0] - s.me.pos[0], pl.pos[2] - s.me.pos[2]) < 3.5) {
      await b.hands.stop();
      this.soothe = new Soothe(b, 'We are here. Now I hum to it.', this.want);
    }
  }
}

// Keep a grey Grumbling company: walk up slowly, sit on a bench near it if there is one, stay without humming
// until it looks up at her (colour comes back), then Notice it and hum.
export class Company extends Goal {
  constructor(b, desc) {
    super(b, desc);
    this.lastRing = 0;
  }
  async tick(s) {
    const b = this.b;
    if (this.soothe) return this.soothe.finished ? this.finish() : this.soothe.tick(s);
    const t = b.find(s, { kind: 'creature', want: ['grey'], filter: (x) => !x.asleep, prefer: (x) => (x.colour?.startsWith('warm') ? 3 : x.colour?.startsWith('a little') ? 1 : 0) });
    if (!t) return b.explore(s, this, []);
    await b.hands.up(b.key('hum'));
    if (t.colour?.startsWith('warm')) {
      b.think('It is looking up at me. Now it might let me hum.');
      // close to this one, so it's the one the thread reaches (the others still won't be hugged)
      this.soothe = new Soothe(b, 'I notice it and hum the lullaby.', ['grey'], { only: (x) => x.colour?.startsWith('warm'), keep: [0.6, 1.6] });
      return;
    }
    const ring = s.ui.ring;
    if (ring?.company && ring.progress > this.lastRing + 0.02) {
      this.lastRing = ring.progress;
      this.nudge();
    }
    // a bench close to it?
    if (s.ui.prompt?.label === 'Sit down' && t.dist < 3.4) {
      b.think('There is a bench right here. I sit down near it.');
      await b.hands.stop();
      await b.hands.tap(b.key('interact'));
      return;
    }
    if (t.dist > 2) {
      await b.travel(s, t.pos[0], t.pos[2], { radius: 1.8, tiptoe: true, goal: this });
      return;
    }
    this.progress(0);
    await b.hands.stop();
    await b.aimAt(s, t);
  }
  // sitting on a bench near it: wait, then stand up once it looks up
  async seated(s) {
    const b = this.b;
    const t = b.find(s, { kind: 'creature', want: ['grey'], filter: (x) => !x.asleep });
    if (t?.colour?.startsWith('warm')) {
      b.think('It looks up at me. I stand up.');
      await b.hands.tap(b.key('interact'));
      return;
    }
    if (!t || t.dist > 4) {
      b.think('It drifted off. I get up again.');
      await b.hands.tap(b.key('interact'));
      return;
    }
    this.nudge();
    await b.hands.wait(250);
  }
}

// Sit with a flock of sparrows: find the stool, sit (the brain's seated handler does the rest).
export class SitWith extends Goal {
  constructor(b, desc, place) {
    super(b, desc);
    this.place = place;
  }
  async tick(s) {
    const b = this.b;
    if (s.ui.prompt?.label === 'Sit with them') {
      await b.hands.stop();
      await b.hands.tap(b.key('interact'));
      await b.hands.wait(500);
      return;
    }
    const pl = this.place.length ? b.findPlace(s, this.place) : null;
    const stool = b.find(s, { kind: 'object', want: ['stool', 'sparrow'], near: pl?.pos, within: 9 });
    if (stool) return b.travel(s, stool.pos[0], stool.pos[2], { radius: 0.8, tiptoe: true, goal: this });
    if (pl) {
      const res = await b.travel(s, pl.pos[0], pl.pos[2], { radius: 3, tiptoe: true, goal: this });
      if (res.arrived) await b.scan(s, this);
      return;
    }
    return b.explore(s, this, this.place);
  }
}

// Look closer at a faint glow (the Quiet District's memories). The dialogue handler picks the Charm Sprite.
export class LookCloser extends Goal {
  constructor(b, desc, place = []) {
    super(b, desc);
    this.place = place;
  }
  async tick(s) {
    const b = this.b;
    if (s.ui.prompt?.label === 'Look closer') {
      await b.hands.stop();
      await b.hands.tap(b.key('interact'));
      // (once it's restored, don't come back to it from memory: the toast says so, playbook.js)
      b.mem.pendingGlow = this.target;
      await b.hands.wait(500);
      return this.finish();
    }
    const pl = this.place.length ? b.findPlace(s, this.place) : null;
    const glow = b.find(s, { kind: 'object', want: ['faint', 'glow'], near: pl?.pos, within: pl ? 14 : Infinity, skip: b.mem.doneGlows });
    if (glow) {
      this.target = glow.key;
      return b.travel(s, glow.pos[0], glow.pos[2], { radius: 1.3, goal: this });
    }
    return b.explore(s, this, this.place);
  }
}

// Follow someone (Sunny up the hill), keeping a few metres behind.
export class Follow extends Goal {
  constructor(b, desc, want, place = []) {
    super(b, desc);
    Object.assign(this, { want, place });
  }
  async tick(s) {
    const b = this.b;
    const t = b.find(s, { kind: 'person', want: this.want });
    if (!t) {
      const pl = this.place.length ? b.findPlace(s, this.place) : null;
      if (pl) return b.travel(s, pl.pos[0], pl.pos[2], { radius: 0, goal: this });
      return b.explore(s, this, this.place);
    }
    // they've stopped: we must be nearly there. Go on to the place, or keep going the way they were going
    if (t.walking || this.walkedT === undefined) this.walkedT = Date.now();
    if (!t.walking && Date.now() - this.walkedT > 4000 && t.dist < 5) {
      if (!this.onAhead) {
        this.onAhead = true;
        b.think(`${this.want[0] ? this.want[0][0].toUpperCase() + this.want[0].slice(1) : 'She'} has stopped. It must be just ahead: I go on.`);
      }
      const pl = this.place.length ? b.findPlace(s, this.place) : null;
      if (pl) return b.travel(s, pl.pos[0], pl.pos[2], { radius: 0, goal: this });
      return b.explore(s, this, this.place);
    }
    if (t.dist < 6) this.nudge(); // keeping up with them is progress
    // a few steps behind: set off when they're more than 4 m ahead, stop at 2.5 m, and don't swing the camera
    // round at every small step of theirs while close (a person walking beside you is a big angle, close up)
    this.walking = this.walking ? t.dist > 2.5 : t.dist > 4;
    if (!this.walking) {
      await b.hands.stop();
      const err = Math.atan2(t.pos[0] - s.me.pos[0], t.pos[2] - s.me.pos[2]);
      if (Math.abs(Math.atan2(Math.sin(err + Math.PI - s.view.yaw), Math.cos(err + Math.PI - s.view.yaw))) > 1.6) await b.aimAt(s, t, { speed: 70 });
      return b.hands.wait(150);
    }
    await b.travel(s, t.pos[0], t.pos[2], { radius: 2.5, goal: null });
  }
}

export const words = tokens;

// One goal after another (go to the practice field, then notice whoever is there).
export class Sequence extends Goal {
  constructor(b, desc, makers) {
    super(b, desc);
    this.makers = makers;
    this.cur = null;
  }
  async tick(s) {
    if (!this.cur || this.cur.finished) {
      const next = this.makers.shift();
      if (!next) return this.finish();
      this.cur = next();
    }
    this.bestT = this.cur.bestT;
    return this.cur.tick(s);
  }
}

// ---------------------------------------------------------------- the fog chapters

// Stitch (Chapter 4 on): take a loose end (it glows, with a little picture over it), walk it to where it
// belongs (a glow with the same picture), and hold Hum there, pressing again on the beat. `max`: how many to
// do before calling it done (the objective's count says when the story ones are done; extra ones are a
// curious player's).
export class Stitch extends Goal {
  constructor(b, desc, { place = [], max = Infinity } = {}) {
    super(b, desc);
    Object.assign(this, { place, max, done: 0 });
  }
  async tick(s) {
    const b = this.b;
    const hum = b.key('hum');
    // at the spot: the prompt says to hold Hum
    if (s.ui.prompt?.label === 'Stitch it here') {
      this.waits = true;
      await b.hands.stop();
      if (!this.humming) {
        this.humming = true;
        b.think('Here is where it belongs. I hold Hum to stitch it.');
      }
      await b.hands.down(hum);
      const ring = s.ui.ring;
      if (ring && ring.progress > (this.prog || 0) + 0.02) {
        this.prog = ring.progress;
        this.nudge();
      }
      if (b.know.beat) await b.onBeat(s, async () => {
        await b.hands.up(hum);
        await b.hands.down(hum);
      });
      return;
    }
    this.waits = false;
    if (this.humming) {
      this.humming = false;
      this.prog = 0;
      await b.hands.up(hum);
      if (!s.me.carrying) {
        this.done++;
        this.nudge();
        if (this.done >= this.max) return this.finish('Stitched.');
      }
    }
    if (s.me.carrying) {
      // where it belongs: the glow with the same little picture (or any such glow, before I can see the picture)
      const to = b.find(s, { kind: 'object', filter: (x) => x.belongs && (x.icon === s.me.carrying || !x.icon) , prefer: (x) => (x.icon === s.me.carrying ? 3 : 0) });
      if (!to) {
        if (!this.saidLook) {
          this.saidLook = true;
          b.think(`I have the thread (${s.me.carrying}). Where does it belong? I look for a glow with the same picture.`);
        }
        return b.explore(s, this, this.place);
      }
      this.saidLook = false;
      await b.travel(s, to.pos[0], to.pos[2], { radius: 1.6, goal: this });
      return;
    }
    // a loose end to take
    if (/^Take the/.test(s.ui.prompt?.label || '')) {
      await b.hands.stop();
      b.think(`A loose end${s.things?.find((t) => t.loose && t.dist < 3)?.icon ? ' (' + s.things.find((t) => t.loose && t.dist < 3).icon + ')' : ''}. I take it.`);
      await b.hands.tap(b.key('interact'));
      this.nudge();
      return b.hands.wait(500);
    }
    // the objective names a street: get there first, then take the loose ends along it (others on the way, like
    // one in the Arcade that belongs back in the courtyard, aren't the ones asked for)
    const key = this.place.join(' ');
    this.at ||= b.mem.streets?.get(key);
    if (this.place.length && !this.at) {
      const pl = b.findPlace(s, this.place);
      if (!pl) return b.explore(s, this, this.place);
      if (Math.hypot(pl.pos[0] - s.me.pos[0], pl.pos[2] - s.me.pos[2]) > 7) return b.travel(s, pl.pos[0], pl.pos[2], { radius: 6, goal: this });
      this.at = pl.pos;
      (b.mem.streets ||= new Map()).set(key, pl.pos);
    }
    const along = (x) => !this.at || Math.hypot(x.pos[0] - this.at[0], x.pos[2] - this.at[2]) < 18;
    const end = b.find(s, { kind: 'object', filter: (x) => x.loose && along(x) });
    if (!end) return b.explore(s, this, this.place);
    await b.travel(s, end.pos[0], end.pos[2], { radius: 1.2, goal: this });
  }
}

// Stand by someone (a friend a sigh sat down; Bo while Captain Honk listens): walk up, and stay there.
// (down: it's a friend a sigh sat down: the one sitting there, grey, if I don't know them by name yet)
export class StandBy extends Goal {
  constructor(b, desc, want, { radius = 1.5, place = [], down = false } = {}) {
    super(b, desc);
    Object.assign(this, { want, radius, place, down });
  }
  async tick(s) {
    const b = this.b;
    const t = b.find(s, { kind: 'person', want: this.want }) || (this.down ? b.find(s, { kind: 'person', filter: (x) => x.down }) : null);
    if (!t) return b.explore(s, this, this.place);
    const res = await b.travel(s, t.pos[0], t.pos[2], { radius: this.radius, goal: this });
    if (res.arrived) {
      this.waits = true;
      this.nudge();
      await b.aimAt(s, t);
      await b.hands.wait(250);
    } else this.waits = false;
  }
}

// Walk with a memory (Bean's secret): stay with the golden figures as they move. Out of sight: look round here
// (it plays where it happened, so don't wander off), or follow the guide if it shows the way.
export class WalkWith extends Goal {
  constructor(b, desc) {
    super(b, desc);
    this.want = ['golden', 'figure', 'memory'];
  }
  async tick(s) {
    const b = this.b;
    const t = b.find(s, { kind: 'memory', prefer: (x) => 1 - x.dist / 100 }); // (nearest first; a score under 0 means "not it")
    if (!t) {
      if (s.ui.way && s.ui.way.dist > 3) return b.followGuide(s);
      if (!this.lookedAt || Date.now() - this.lookedAt > 8000) {
        this.lookedAt = Date.now();
        return b.scan(s, this, true);
      }
      this.waits = true;
      await b.hands.stop();
      return b.hands.wait(300);
    }
    const res = await b.travel(s, t.pos[0], t.pos[2], { radius: 2.4, goal: this });
    if (res.arrived) {
      this.waits = true;
      this.nudge();
      await b.aimAt(s, t);
      await b.hands.wait(200);
    } else this.waits = false;
  }
}

// Wait: something is about to happen here (a scene, a mini-game, a train). Look about a little.
export class Wait extends Goal {
  constructor(b, desc, seconds = 30) {
    super(b, desc);
    this.seconds = seconds;
    this.waits = true;
  }
  async tick(s) {
    this.nudge();
    if (this.age > this.seconds) return this.finish();
    await this.b.hands.stop();
    await this.b.hands.wait(300);
  }
}

// Stop and look up at something overhead (the Everyone Blanket over the old square), slowly, for a while.
export class LookUp extends Goal {
  async tick() {
    const b = this.b;
    this.waits = true;
    this.nudge();
    if (!this.looked) {
      this.looked = true;
      await b.hands.stop();
      await b.hands.turn(0, -150, { speed: 25 });
      await b.hands.turn(-90, 0, { speed: 15 });
      await b.hands.wait(2500);
      b.ended = true; // (the end of a recorded part: plan 9's Part 4)
    }
    await b.hands.wait(300);
  }
}

// Onward, away from where I came in ("up the lane", off the ferry jetty): keep walking the way that leads away
// from it, a few metres at a time, until the objective changes.
export class Onward extends Goal {
  // until(s): done once this is true (what I'm walking on to find has come into sight)
  constructor(b, desc, from, { until = null } = {}) {
    super(b, desc);
    this.from = from;
    this.until = until;
  }
  async tick(s) {
    const b = this.b;
    if (this.until?.(s)) return this.finish();
    // (from 'heading': on the way I was already going, from my own trail)
    if (this.from === 'heading') {
      if (!this.dir) {
        const v = b.mem.visited.get(s.place) || [];
        const a = v.at(-1) || [s.me.pos[0], s.me.pos[2]];
        const c = v.slice(0, -1).reverse().find((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) > 5) || [a[0] + Math.sin(s.view.yaw), a[1] + Math.cos(s.view.yaw)];
        const l = Math.hypot(a[0] - c[0], a[1] - c[1]) || 1;
        this.dir = [(a[0] - c[0]) / l, (a[1] - c[1]) / l];
      }
      await b.travel(s, s.me.pos[0] + this.dir[0] * 8, s.me.pos[2] + this.dir[1] * 8, { radius: 0.5, goal: this });
      return this.nudge();
    }
    const f = b.findPlace(s, this.from);
    if (!f) return b.explore(s, this, []);
    let dx = s.me.pos[0] - f.pos[0],
      dz = s.me.pos[2] - f.pos[2];
    const l = Math.hypot(dx, dz) || 1;
    // (standing on it: the way off it is the way I'm looking)
    if (l < 2) [dx, dz] = [-Math.sin(s.view.yaw), -Math.cos(s.view.yaw)];
    else [dx, dz] = [dx / l, dz / l];
    await b.travel(s, s.me.pos[0] + dx * 8, s.me.pos[2] + dz * 8, { radius: 0.5, goal: this });
    this.nudge();
  }
}
