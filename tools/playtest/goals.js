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
  constructor(b, desc, { want = [], kind = null, place = [], radius = 1.5, tiptoe = false, then = null, keepGoing = false } = {}) {
    super(b, desc);
    Object.assign(this, { want, kind, place, radius, tiptoe, then, keepGoing });
  }
  async tick(s) {
    const b = this.b;
    if (this.orbit) return this.goRound(s);
    const t = this.want.length || this.kind ? b.find(s, { kind: this.kind, want: this.want }) : null;
    const p = t || (this.place.length ? b.findPlace(s, this.place) : null);
    if (!p) return b.explore(s, this, this.place);
    const [x, , z] = p.pos;
    const r = t ? this.radius : Math.max(this.radius, (p.size || 1) * 0.3);
    const res = await b.travel(s, x, z, { radius: this.keepGoing ? 0 : r, tiptoe: this.tiptoe, goal: this });
    if (res.arrived || (this.keepGoing && res.dist < 0.6)) {
      await b.hands.stop();
      if (this.then) await this.then(s, p);
      // here, and nothing has happened yet? try its other sides (the front of a stall, say)
      this.arrivedAt ||= Date.now();
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
  constructor(b, desc, { want = [], place = [], hint = '' } = {}) {
    super(b, desc);
    Object.assign(this, { want, place, choiceHint: hint });
  }
  async tick(s) {
    const b = this.b;
    let t = b.find(s, { kind: 'person', want: this.want });
    // a name I haven't learned yet: whoever is at that place is probably them
    const pl0 = !t && this.place.length ? b.findPlace(s, this.place) : null;
    if (!t && pl0 && !b.knows(this.want)) {
      t = b.find(s, { kind: 'person', near: pl0.pos, within: Math.max(6, (pl0.size || 2) + 3), filter: (x) => !x.following });
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
    if (s.ui.prompt?.label === 'Talk' && t.dist < 2.3) {
      await b.hands.stop();
      await b.hands.tap(b.key('interact'));
      b.mem.talkedTo.add(s.place + '|' + t.looks);
      this.pressed = (this.pressed || 0) + 1;
      await b.hands.wait(400);
      if (this.pressed > 4) this.finish('The prompt says Talk, but nothing happens.');
      return;
    }
    const res = await b.travel(s, t.pos[0], t.pos[2], { radius: 1.1, goal: this });
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
    if (res.arrived) {
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
      await b.hands.wait(500);
      return this.finish();
    }
    const pl = this.place.length ? b.findPlace(s, this.place) : null;
    const glow = b.find(s, { kind: 'object', want: ['faint', 'glow'], near: pl?.pos, within: pl ? 14 : Infinity, skip: b.mem.doneGlows });
    if (glow) return b.travel(s, glow.pos[0], glow.pos[2], { radius: 1.3, goal: this });
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
