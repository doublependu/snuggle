// SPDX-License-Identifier: GPL-3.0-only
// The autoplayer's brain: look (eyes.look()), decide, act (hands). It never touches the page itself; it only
// gets the eyes' description of the screen and the hands' keyboard and mouse. It plays like a first-timer:
// it reads the objective and the tips, reads every line of dialogue, looks around for what it's told to
// find, finds its way by what it has seen, and notes where it got confused.
import { Nav, yawTo, wrap, RAD_PER_PX } from './nav.js';
import { planFor, REACTIONS } from './playbook.js';
import { Goal, Company } from './goals.js';
import { tokens, overlap } from './words.js';

const now = () => Date.now();
// the keys the game's hints show (the default bindings)
const KEYS = { interact: 'KeyF', hum: 'KeyE', assist: 'KeyQ', jump: 'Space', book: 'Tab', sprint: 'ShiftLeft' };
// prompts a curious player tries once when walking past
const CURIOUS = /^(Tuck in the sleepy sprite|Read the note|Look at the lotus buds|Water the lotus buds|Float lanterns|Knock|Talk)$/;
// clue words and what they bring to mind (for "Which Charm Sprite remembers this?")
const IDEAS = [
  ['read', 'faded', 'word', 'paper', 'noticeboard', 'notice', 'sign', 'letter', 'note'],
  ['rain', 'drip', 'wet', 'soaked', 'water', 'umbrella'],
  ['smell', 'sniff', 'lemon', 'candie', 'candy', 'scent'],
  ['nobody', 'empty', 'alone', 'chair', 'picked', 'team', 'sat'],
  ['lead', 'trail', 'thread', 'follow', 'path', 'alley', 'way'],
  ['fog', 'hidden', 'forgotten', 'remember', 'warm', 'door'],
];

export class Brain {
  constructor({ eyes, hands, log, opts = {}, known = null }) {
    this.eyes = eyes;
    this.hands = hands;
    this.log = log;
    // reading: about a subtitle's pace (17 characters a second), and a second more for each line, so someone
    // watching can read along
    this.opts = { readCps: 17, linePause: 1000, ...opts };
    this.nav = new Nav();
    this.mem = {
      names: new Map(), // a word from a name -> how that person looks
      seen: new Map(), // key -> the last sighting { ...thing, place, t }
      places: new Map(), // place -> Map(looks@cell -> place thing)
      lines: [],
      toasts: new Set(),
      talkedTo: new Set(),
      tried: new Set(),
      wrong: new Map(), // clue -> sprites that didn't remember it
      doneGlows: new Set(),
      via: new Map(), // a place word -> the words of a landmark on the way there (from directions in dialogue)
      visited: new Map(), // place -> [[x, z]]
      scanned: new Map(), // place -> [[x, z]] where it looked all around
      abilities: null,
    };
    for (const [looks, words] of Object.entries(known || {})) for (const w of words) this.mem.names.set(w, looks);
    this.know = { assist: false, beat: false, company: false };
    this.want = { book: false };
    this.goal = null;
    this.objective = null;
    this.objT = now();
    this.checkpoints = 0;
    this.done = false;
    this.last = now();
    this.dt = 0.1;
    this.cards = new Set();
    this.curiosity = new Map(); // place -> how many optional things tried
    this.time = {}; // seconds spent in dialogue, cutscenes, play, mini-games…
    // how it looked (for the summary): walls walked into, standing about for no reason
    this.metrics = { bumps: 0, playT: 0, still: [], stillFrom: null, stillAt: null };
  }

  key(action) {
    return KEYS[action];
  }
  // What a player carries from one sitting to the next (one take of a playthrough to the next): who is who, what
  // they meant to go and see, what the game has taught them. Not the map: that's seen again.
  mind() {
    return { names: [...this.mem.names], toSee: this.mem.toSee || null, giveBack: this.mem.giveBack ? { who: this.mem.giveBack.who, place: this.mem.giveBack.place?.source || null } : null, browsed: !!this.mem.browsed, fy: !!this.mem.fy, know: this.know };
  }
  remind(m) {
    if (!m) return;
    for (const [k, v] of m.names || []) this.mem.names.set(k, v);
    if (m.toSee) this.mem.toSee = m.toSee;
    if (m.giveBack) this.mem.giveBack = { who: m.giveBack.who, place: m.giveBack.place ? new RegExp(m.giveBack.place, 'i') : null };
    this.mem.browsed = m.browsed;
    this.mem.fy = m.fy;
    Object.assign(this.know, m.know || {});
  }
  think(text) {
    this.log.think(text);
  }
  // TRACE=1: what each tick decided (for working on the autoplayer)
  // (the last few hundred are kept, and written to the log when it gets stuck or stands about)
  trace(...a) {
    const line = [this.log.now().toFixed(1), ...a].join(' ');
    (this.traces ||= []).push(line);
    if (this.traces.length > 300) this.traces.shift();
    if (process.env.TRACE) console.log('   ·', line);
  }
  dumpTrace(why) {
    this.log.saw('trace', { why, lines: (this.traces || []).slice(-120) });
  }

  async run() {
    while (!this.done) {
      let s;
      try {
        s = await this.eyes.look();
      } catch (e) {
        // the page is reloading (a checkpoint): wait for it
        await this.hands.wait(500).catch(() => {});
        continue;
      }
      const t = now();
      this.dt = Math.min(0.5, (t - this.last) / 1000);
      this.last = t;
      this.s = s;
      try {
        this.remember(s);
        await this.tick(s);
        await this.watchdog(s);
      } catch (e) {
        if (e.fatal) throw e;
        if (/Target (page|closed)|has been closed|Execution context/.test(String(e))) {
          await this.hands.wait(500).catch(() => {});
          continue;
        }
        this.log.event('error', { text: String(e.message || e).split('\n')[0].slice(0, 300) + ' @ ' + (String(e.stack).split('\n')[1] || '').trim() });
        await this.hands.releaseAll().catch(() => {});
        await this.hands.wait(300);
      }
      if (this.opts.stop?.(s, this)) break;
      const spent = now() - t;
      if (spent < 50) await this.hands.wait(50 - spent).catch(() => {});
    }
    await this.hands.releaseAll().catch(() => {});
  }

  // ---------------------------------------------------------------- memory
  remember(s) {
    const u = s.ui;
    if (s.place && s.place !== this.nav.place) {
      this.nav.enter(s.place);
      this.log.event('place', { text: s.place });
      this.goal = null;
      this.objT = now();
      this.lookAround = !this.mem.places.has(s.place); // somewhere new: have a look round (once I can move)
    }
    if (u.card && !this.cards.has(u.card.title)) {
      this.cards.add(u.card.title);
      this.log.event('card', { text: u.card.title + (u.card.sub ? ' — ' + u.card.sub : '') });
      // a chapter starts with its own card ("Chapter 2"); "Chapter 2: …" at the end of the one before is a teaser
      if (/^(Prologue|Chapter \d+)$/.test(u.card.title)) this.log.event('chapter', { text: u.card.title + (u.card.sub ? ': ' + u.card.sub : '') });
      else if (/coming soon/i.test(u.card.sub || '')) this.log.event('chapter', { text: 'The end of the story so far (' + u.card.title + ', coming soon)' });
    }
    // (a blank objective's wait counts from when it went blank, or from the last card or fade: between two
    // chapter cards there's nothing to do but watch)
    if (u.objective) this.blankT = null;
    else this.blankT ??= now();
    if (u.card || u.fade) this.cardT = now();
    if (u.objective && u.objective !== this.objective) {
      this.objective = u.objective;
      this.objT = now();
      this.checkpoints = 0;
      this.log.event('objective', { text: u.objective });
      this.goal = null;
    }
    // Calm on screen going down (the HUD's dots): what was I doing?
    if (u.calm != null) {
      if (this.calmWas != null && u.calm < this.calmWas) this.log.event('calm', { text: `Calm ${this.calmWas} → ${u.calm} while: ${this.sheltering ? 'sheltering' : this.goal?.desc || this.objective || '?'}` });
      this.calmWas = u.calm;
    }
    for (const tx of u.toasts || []) {
      if (this.mem.toasts.has(tx)) continue;
      this.mem.toasts.add(tx);
      this.log.event('toast', { text: tx });
      this.react(tx);
    }
    if (!s.things) return;
    for (const th of s.things) {
      this.mem.seen.set(th.key, { ...th, place: s.place, t: now() });
      if (th.kind === 'place') {
        const m = this.mem.places.get(s.place) || new Map();
        const k = th.looks + '@' + Math.round(th.pos[0] / 4) + ',' + Math.round(th.pos[2] / 4);
        if (!m.has(k)) this.goal?.nudge(); // found somewhere new: that's progress when exploring
        m.set(k, { ...th, place: s.place });
        this.mem.places.set(s.place, m);
      }
    }
    // standing where I remember something, and it isn't there any more: forget it (a glow that's been used up,
    // a candy picked up, someone who walked off)
    const seenNow = new Set(s.things.map((t) => t.key));
    for (const [k, t] of this.mem.seen) {
      if (t.place !== s.place || seenNow.has(k) || now() - t.t < 1500) continue;
      if (Math.hypot(t.pos[0] - s.me.pos[0], t.pos[2] - s.me.pos[2]) < 2.2) this.mem.seen.delete(k);
    }
    this.nav.observe(s);
    // fell in the water ("Splash!", and she's put back on dry land): the last steps led into it, so don't go there
    this.steps = (this.steps || []).filter((p) => now() - p[2] < 2500);
    this.steps.push([s.me.pos[0], s.me.pos[2], now(), s.me.pos[1]]);
    const splash = (u.floaties || []).includes('Splash!');
    if (splash && !(this.splashT > now() - 1600)) {
      this.splashT = now();
      const wet = this.steps.filter((p) => p[3] < -0.2);
      for (const [x, z] of wet.length ? wet : this.steps.slice(-4)) this.nav.mark(x, z, 'water');
      this.nav.route = null;
      this.log.event('splash', { text: 'fell in the water' });
      this.think('Splash! Not that way: the water is deep there.');
    }
    // breadcrumbs
    const v = this.mem.visited.get(s.place) || [];
    const [x, , z] = s.me.pos;
    if (!v.length || Math.hypot(v[v.length - 1][0] - x, v[v.length - 1][1] - z) > 3) v.push([x, z]);
    this.mem.visited.set(s.place, v);
    // who is who: a speaker's name, and the one person visibly talking
    const d = u.dialogue;
    if (d?.who) {
      const talking = s.things.filter((t) => t.kind === 'person' && t.talking);
      if (talking.length === 1) {
        const w = tokens(d.who);
        const who = talking[0].appearance || talking[0].looks;
        const fresh = w.some((x) => this.mem.names.get(x) !== who);
        for (const x of w.concat([d.who.toLowerCase()])) this.mem.names.set(x, who);
        if (fresh) this.log.event('name', { text: `${d.who} is ${who}` });
      }
    }
  }
  react(text) {
    for (const [re, fn] of REACTIONS) {
      const m = text.match(re);
      if (m) fn(this, m);
    }
  }
  // Directions in dialogue: "…in the laundry yard, through the moon gate to the south-west" -> to find the
  // laundry yard, go through the moon gate first.
  directions(text) {
    for (const m of text.matchAll(/\b(?:in|under|at|by) the ([\w -]+?), (?:through|across|past|over|behind) the ([\w -]+?)(?: to the| on the|[.,!…]|$)/gi)) {
      for (const w of tokens(m[1])) this.mem.via.set(w, tokens(m[2]));
      this.log.event('directions', { text: `${m[1]}: via the ${m[2]}` });
    }
  }
  knows(words) {
    return words.some((w) => this.mem.names.has(w));
  }

  // ---------------------------------------------------------------- seeing
  // The best visible (or remembered) thing matching: a learned name, or the most words of its description.
  find(s, { kind = null, want = [], filter = null, prefer = null, near = null, within = Infinity, skip = null } = {}) {
    const named = want.map((w) => this.mem.names.get(w)).filter(Boolean);
    const rate = (t) => {
      if (kind && t.kind !== kind) return -1;
      if (filter && !filter(t)) return -1;
      if (skip && skip.has(t.key)) return -1;
      if (near && Math.hypot(t.pos[0] - near[0], t.pos[2] - near[2]) > within) return -1;
      let sc = named.includes(t.appearance || t.looks) ? 5 : overlap(want, t.looks);
      if (want.length && sc === 0) return -1;
      if (prefer) sc += prefer(t);
      return sc;
    };
    const pick = (list) => {
      let best = null,
        bs = -1;
      for (const t of list) {
        const r = rate(t);
        if (r < 0) continue;
        if (r > bs || (r === bs && t.dist < best.dist)) {
          bs = r;
          best = t;
        }
      }
      return best;
    };
    const seen = pick(s.things || []);
    if (seen) return seen;
    // remembered: people and creatures move, so only recent sightings; objects stay put
    const [x, , z] = s.me.pos;
    const mem = [...this.mem.seen.values()]
      .filter((t) => t.place === s.place && (t.kind === 'object' || t.kind === 'candy' || now() - t.t < 45000) && !(s.things || []).some((v) => v.key === t.key))
      .map((t) => ({ ...t, dist: Math.hypot(t.pos[0] - x, t.pos[2] - z), remembered: true, unseen: (now() - t.t) / 1000 }));
    return pick(mem);
  }
  findPlace(s, want, skip = null) {
    if (!want?.length) return null;
    const [x, , z] = s.me.pos;
    let best = null,
      bs = 0;
    for (const p of (this.mem.places.get(s.place) || new Map()).values()) {
      if (skip?.has(p.looks + '@' + p.pos[0].toFixed(0) + ',' + p.pos[2].toFixed(0))) continue;
      if (p.arm && this.mem.armsUsed?.has(p.key)) continue; // (followed it already)
      // (a fingerpost's arm only points the way: the place itself, once seen, is better)
      const sc = overlap(want, p.looks) * (p.arm ? 0.45 : 1);
      const d = Math.hypot(p.pos[0] - x, p.pos[2] - z);
      if (sc > 0 && (sc > bs || (sc === bs && d < best.d))) {
        bs = sc;
        best = { ...p, d };
      }
    }
    return best;
  }
  clearAhead(s) {
    const mid = (s.ahead || []).filter((r) => Math.abs(r.deg) <= 10);
    return mid.length ? Math.min(...mid.map((r) => r.dist)) : 14;
  }
  snacks(s) {
    let n = 0;
    for (const c of s.ui.hud?.chips || []) if (/🥧|🌰/.test(c)) n += parseInt(c.replace(/\D+/g, '')) || 0;
    return n;
  }

  // ---------------------------------------------------------------- moving
  // Turn the camera toward a thing (so W walks at it, and she keeps it in view), and tilt it so the thing sits
  // in the middle band of the screen (a cloud overhead, someone up the steps).
  async aimAt(s, t, opts) {
    const err = yawTo(s, t.pos[0], t.pos[2]);
    const dy = t.y != null && (t.y > 0.5 || t.y < -0.65) ? (-(t.y - 0.15) * 0.48) / RAD_PER_PX : 0;
    const dx = Math.abs(err) > 0.12 && this.settled(err) ? -err / RAD_PER_PX : 0;
    if (dx || dy) await this.hands.turn(dx, dy, opts);
  }
  // A hand on a mouse doesn't flick back for a few degrees: a small turn the other way from the last one, soon
  // after it, waits (a little off is fine while walking on). A big one doesn't. Notes the turn when it's made.
  settled(err) {
    const dir = Math.sign(-err),
      t = now();
    if (this.lastTurn && dir === -this.lastTurn.dir && t - this.lastTurn.t < 1200 && Math.abs(err) < 0.8) return false;
    this.lastTurn = { dir, t };
    return true;
  }
  // Back to the usual tilt when walking (after looking up at something).
  async level(s) {
    const off = (s.view?.pitch ?? 0.3) - 0.3;
    if (Math.abs(off) > 0.22) await this.hands.turn(0, -off / 1.5 / 0.0024 / 2);
  }
  // Walk toward (x, z): steer by the camera, run (Shift) when there's room, walk near shy Grumblings, step
  // round what's in the way, pick up a lemon candy seen close by, and try something interesting once.
  async travel(s, x, z, { radius = 1, tiptoe = false, goal = null, hurry = false } = {}) {
    const [px, , pz] = s.me.pos;
    let dist = Math.hypot(x - px, z - pz);
    const realDist = dist,
      [ox, oz] = [x, z];
    // someone said how to get there ("across the little bridge"): go that way first
    const via = goal && !goal.viaDone && goal.place?.map((w) => this.mem.via.get(w)).find(Boolean);
    if (via && dist > 8) {
      const v = this.findPlace(s, via);
      const dv = v && Math.hypot(v.pos[0] - px, v.pos[2] - pz);
      // (if I can't get any nearer to it for a while, from this side, I find my own way instead)
      if (v && (goal.viaBest === undefined || dv < goal.viaBest - 0.3)) [goal.viaBest, goal.viaT] = [dv, now()];
      if (v && now() - goal.viaT > 6000) {
        goal.viaDone = true;
        this.think(`I can’t get onto the ${via.join(' ')} from here. I find my own way.`);
      } else if (v && dv > Math.max(1.5, (v.size || 1) * 0.6) && dv < dist + 4) {
        if (!goal.viaSaid) {
          goal.viaSaid = true;
          this.think(`They said to go by the ${via.join(' ')}. That way first.`);
        }
        x = v.pos[0];
        z = v.pos[2];
        radius = Math.max(1.2, (v.size || 1) * 0.6);
        dist = dv;
      } else if (v) goal.viaDone = true;
    }
    // walked into things again and again on the way somewhere far (a pier's railing between me and where I'm
    // going): go back the way I came, along my own trail, to the point on it nearest where I'm going (up to 60 m
    // back), and try again from there
    const recent = (this.bumpTimes || []).filter((t) => now() - t < 20000);
    if (!this.retrace && recent.length >= 3 && dist > 8) {
      const v = this.mem.visited.get(s.place) || [];
      let acc = 0,
        best = -1,
        bd = dist - 3;
      for (let i = v.length - 1; i > 0 && acc < 60; i--) {
        acc += Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]);
        const d = Math.hypot(v[i - 1][0] - x, v[i - 1][1] - z);
        if (d < bd) [bd, best] = [d, i - 1];
      }
      // (nothing on the trail nearer: just ten metres back)
      if (best < 0) for (let i = v.length - 1, a = 0; i > 0; i--) if ((a += Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1])) > 10) {
        best = i - 1;
        break;
      }
      if (best >= 0) {
        this.retrace = { path: v.slice(best).reverse(), i: 0, until: now() + 45000 };
        this.bumpTimes = [];
        this.think('I keep walking into things. I go back the way I came, and try again from there.');
      }
    }
    if (this.retrace) {
      const r = this.retrace;
      while (r.i < r.path.length && Math.hypot(r.path[r.i][0] - px, r.path[r.i][1] - pz) < 1.5) r.i++;
      if (now() > r.until || r.i >= r.path.length) this.retrace = null;
      else {
        [x, z] = r.path[r.i];
        dist = Math.hypot(x - px, z - pz);
        radius = 1.2;
      }
    }
    // getting nowhere, and the game's guide is pointing (the arrow under the objective): its way, not mine
    if (goal && s.ui.way && s.ui.way.dist > 4 && (goal.guideUntil > now() || (goal.stale > 20 && dist > 6)) && !this.retrace) {
      if (!(goal.guideUntil > now())) goal.guideUntil = now() + 10000;
      if (!goal.guided) {
        goal.guided = true;
        this.log.event('guide', { text: `The guide is showing the way (${Math.round(s.ui.way.dist)} m) for: ${this.objective}` });
        this.think('I’m getting nowhere. The arrow under the objective knows the way: I follow it.');
      }
      const h = s.view.yaw + Math.PI - s.ui.way.angle;
      x = px + Math.sin(h) * Math.min(6, s.ui.way.dist);
      z = pz + Math.cos(h) * Math.min(6, s.ui.way.dist);
      dist = Math.hypot(x - px, z - pz);
      radius = 0.8;
    }
    this.trace('travel', x.toFixed(1), z.toFixed(1), 'dist', dist.toFixed(2), 'r', radius);
    goal?.progress(realDist); // (progress is toward where I'm really going, not a step on the way)
    if (dist <= radius) {
      // (a step on the way, not where I'm going: the landmark I was told to pass, a point on the guide's way)
      if (x !== ox || z !== oz) {
        if (goal && via) goal.viaDone = true;
        return { arrived: false, dist: realDist };
      }
      await this.hands.stop();
      return { arrived: true, dist };
    }
    if (await this.detour(s)) return { arrived: false, dist };
    // straight at it when it's in sight and close, else along the route
    // (not straight at it if what I've learned says the way is blocked: water I've fallen into, a wall)
    const direct = dist < 7 && (s.things || []).some((t) => Math.hypot(t.pos[0] - x, t.pos[2] - z) < 0.8) && this.nav.clear(px, pz, x, z);
    const [lx, lz] = direct ? [x, z] : this.nav.lookahead(s, x, z, now());
    let err = yawTo(s, lx, lz);
    // what's in the way right in front: steer along the clearest direction nearest to where I want to go
    const rays = s.ahead || [];
    const toward = rays.reduce((b2, r) => (Math.abs(r.deg * Math.PI / 180 - err) < Math.abs(b2.deg * Math.PI / 180 - err) ? r : b2), rays[0] || { deg: 0, dist: 14 });
    const need = Math.min(dist, 1.6);
    // something in the way: keep looking where I'm going and step round it (W with A or D, or A or D alone),
    // keeping to the side chosen a moment ago while that side stays open
    let step = 0; // the way to walk, relative to where I look (radians; + is to the left)
    const stepDown = (r) => r.down != null && r.down < need + 0.4;
    if (rays.length && Math.abs(err) < 1.4 && (toward.dist < need || toward.drop || toward.water || stepDown(toward))) {
      const open = rays.filter((r) => r.dist >= Math.min(need, 1.2) + 0.3 && !r.drop && !r.water && !stepDown(r)).map((r) => (r.deg * Math.PI) / 180);
      if (open.length) {
        let pick = open.sort((a, b) => Math.abs(a - err) - Math.abs(b - err));
        if (this.sideUntil > now()) pick = pick.filter((a) => Math.sign(a - err) === this.side).concat(pick);
        step = pick[0] - err;
        this.side = Math.sign(step) || this.side || 1;
        this.sideUntil = now() + 1500;
      }
    }
    // a small dead zone (once lined up, small drifts wait), so the camera doesn't twitch at every step
    if (Math.abs(err) > (this.aligned ? 0.2 : 0.06)) {
      this.aligned = false;
      if (this.settled(err)) await this.hands.turn(-err / RAD_PER_PX);
    } else this.aligned = true;
    await this.level(s);
    const shy = (s.things || []).some((t) => t.kind === 'creature' && !t.asleep && t.dist < 7 && /sparrow|grey/.test(t.looks));
    const keys = [];
    // just walked into something: a step to the more open side, round it
    if (this.backoffUntil > now()) {
      await this.hands.move([this.backoffKey || 'KeyS']);
      return { arrived: false, dist };
    }
    const dodge = this.dodge(s);
    if (Math.abs(err) < 1.3 && Math.abs(step) < 1.1) keys.push('KeyW');
    if (dodge) keys.push(dodge);
    else if (Math.abs(step) >= 0.4) keys.push(step > 0 ? 'KeyA' : 'KeyD');
    // W walks and Shift runs. Run only on a long, clear stretch (and keep running while it stays one); walk the
    // last steps, near people, and near shy Grumblings (the game says running startles them)
    const people = (s.things || []).some((t) => t.kind === 'person' && t.dist < 6 && !t.following);
    const clear = this.clearAhead(s);
    this.running = !step && (this.running ? dist > 5 && clear > 3 && Math.abs(err) < 0.6 : dist > 10 && clear > 6 && Math.abs(err) < 0.3);
    // in a hurry (a sigh coming): run, unless sleepers lie close by (running wakes them)
    const sleepers = (s.things || []).some((t) => t.kind === 'creature' && t.asleep && /grey/.test(t.looks) && t.dist < 8);
    if (!tiptoe && !shy && (hurry ? !sleepers && dist > 1.5 && !step : !people && this.running)) keys.push(this.key('sprint'));
    await this.hands.move(keys);
    this.trace('keys', keys.join('+') || '-', 'err', err.toFixed(2), 'step', step.toFixed(2), 'at', s.me.pos[0].toFixed(1), s.me.pos[2].toFixed(1), 'yaw', s.view.yaw.toFixed(2));
    // which way the keys move her, relative to where she looks (+ is to the left)
    const W = keys.includes('KeyW'),
      A = keys.includes('KeyA'),
      D = keys.includes('KeyD');
    const moveRel = A ? (W ? Math.PI / 4 : Math.PI / 2) : D ? (W ? -Math.PI / 4 : -Math.PI / 2) : 0;
    this.bumpCheck(s, (W || A || D) && Math.abs(err) < 0.5, dist, moveRel);
    return { arrived: false, dist };
  }
  // Walked into something: remember it, try a hop, and route round it.
  bumpCheck(s, pushing, dist, moveRel = 0) {
    const [x, , z] = s.me.pos;
    const t = now();
    this.trail = (this.trail || []).filter((p) => t - p[2] < 1200);
    this.trail.push([x, z, t, pushing, dist]);
    if (this.trail.length < 6 || !this.trail.every((p) => p[3])) return;
    const [ox, oz] = this.trail[0];
    // pushing on, and hardly moving (a detour that doesn't bring me closer yet is not a wall: walking round
    // something, at a walk, often doesn't; sliding along a wall for long is the watchdog's business)
    if (Math.hypot(x - ox, z - oz) < 0.35) {
      const heading = s.view.yaw + Math.PI + moveRel;
      this.nav.bump(s, heading);
      // stepping round it that side didn't work: the other side next
      if (moveRel) {
        this.side = -Math.sign(moveRel);
        this.sideUntil = now() + 2500;
      }
      this.nav.route = null;
      this.trail = [];
      this.backoffUntil = now() + 500;
      // which side is more open (the rays to the left are the positive ones)?
      const side = (sg) => (s.ahead || []).filter((r) => Math.sign(r.deg) === sg && Math.abs(r.deg) <= 60).reduce((a, r) => a + Math.min(r.dist, 4), 0);
      this.backoffKey = moveRel ? (this.side > 0 ? 'KeyA' : 'KeyD') : (this.bumps || 0) % 4 === 3 ? 'KeyS' : side(1) >= side(-1) ? 'KeyA' : 'KeyD';
      this.bumps = (this.bumps || 0) + 1;
      (this.bumpTimes ||= []).push(now());
      this.metrics.bumps++;
      this.trace('bump', x.toFixed(1), z.toFixed(1), 'toward', dist.toFixed(1));
      this.log.input(`bump ${x.toFixed(1)},${z.toFixed(1)}`);
      if (this.bumps % 3 === 0) this.hands.tap(this.key('jump')).catch(() => {});
    }
  }
  // A ring on the ground near her (rain about to fall, a paper ball about to land): step sideways out of it.
  dodge(s) {
    if (this.dodgeUntil > now()) return this.dodgeKey;
    const hz = (s.things || []).find((t) => t.kind === 'hazard' && /rain|land/.test(t.looks) && t.dist < t.r + 0.8);
    if (!hz) return null;
    this.dodgeKey = hz.x > 0 ? 'KeyA' : 'KeyD';
    this.dodgeUntil = now() + 700;
    this.think(`${hz.looks[0].toUpperCase() + hz.looks.slice(1)}! I step aside.`);
    return this.dodgeKey;
  }
  // Something worth a small detour: a lemon candy close by, or a prompt not tried yet.
  async detour(s) {
    this.candyT ||= new Map(); // candy -> when I went for it (give up after a while: some are out of reach)
    const candy = (s.things || []).find((t) => t.kind === 'candy' && t.dist < 7 && !(now() - (this.candyT.get(t.key) ?? now()) > 9000));
    if (candy) {
      if (!this.candyT.has(candy.key)) {
        this.candyT.set(candy.key, now());
        this.think('Ooh, a lemon candy! I grab it.');
      }
      const err = yawTo(s, candy.pos[0], candy.pos[2]);
      if (Math.abs(err) > 0.1) await this.hands.turn(-err / RAD_PER_PX);
      await this.hands.move(Math.abs(err) < 1 ? ['KeyW'] : []);
      // it's up high: jump for it
      const flat = Math.hypot(candy.pos[0] - s.me.pos[0], candy.pos[2] - s.me.pos[2]);
      if (flat < 1.2 && candy.pos[1] > s.me.pos[1] + 0.8 && s.me.onGround) await this.hands.tap(this.key('jump'));
      return true;
    }
    const pr = s.ui.prompt?.label;
    if (pr && CURIOUS.test(pr) && !/Talk/.test(this.goal?.constructor.name || '')) {
      // once per thing: a person by how they look, anything else by what it says and roughly where
      const spot = `${s.place}|${pr}|${Math.round(s.me.pos[0] / 8)},${Math.round(s.me.pos[2] / 8)}`;
      const n = this.curiosity.get(s.place) || 0;
      const near = (s.things || []).filter((t) => t.kind === 'person' && t.dist < 2.4).sort((a, b) => a.dist - b.dist)[0];
      const who = pr === 'Talk' && near ? s.place + '|' + near.looks : null;
      if (!(pr !== 'Talk' && this.mem.tried.has(spot)) && n < 10 && !(pr === 'Talk' && (!who || this.mem.talkedTo.has(who)))) {
        if (pr !== 'Talk') this.mem.tried.add(spot);
        if (who) this.mem.talkedTo.add(who);
        this.curiosity.set(s.place, n + 1);
        this.think(pr === 'Talk' ? `Someone to talk to (${near?.looks || 'someone'}). I say hello.` : `“${pr}”? Let’s see.`);
        await this.hands.stop();
        await this.hands.tap(this.key('interact'));
        this.log.event('curious', { text: pr });
        await this.hands.wait(400);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- looking around
  // Look all the way round (once per spot), then head for somewhere not visited yet.
  async explore(s, goal, place = []) {
    this.trace('explore', place.join(' '));
    if (s.ui.way && s.ui.way.dist > 3) return this.followGuide(s);
    goal.checked ||= new Set();
    let pl = place.length ? this.findPlace(s, place, goal.checked) : null;
    // not seen yet, but someone said how to get there: head for the landmark on the way
    const via = !pl && place.map((w) => this.mem.via.get(w)).find(Boolean);
    if (via) {
      const v = this.findPlace(s, via);
      const [x, , z] = s.me.pos;
      if (v && Math.hypot(v.pos[0] - x, v.pos[2] - z) > 3 && !goal.viaDone) {
        if (!goal.viaSaid) {
          goal.viaSaid = true;
          this.think(`They said it’s through the ${via.join(' ')}. I head there first.`);
        }
        const r = await this.travel(s, v.pos[0], v.pos[2], { radius: 1.2, goal });
        if (r.arrived) goal.viaDone = true;
        return;
      }
    }
    if (pl) {
      goal.lookingFor = place.join(' ');
      const res = await this.travel(s, pl.pos[0], pl.pos[2], { radius: Math.max(2, (pl.size || 1) * 0.6), goal });
      if (res.arrived) {
        // here, and still not found: look all round once, then it wasn't this one
        const [x, , z] = s.me.pos;
        if (!(this.mem.scanned.get(s.place) || []).some(([a, b]) => Math.hypot(a - x, b - z) < 4)) await this.scan(s, goal);
        else goal.checked.add(pl.looks + '@' + pl.pos[0].toFixed(0) + ',' + pl.pos[2].toFixed(0));
      }
      return;
    }
    const [x, , z] = s.me.pos;
    const done = this.mem.scanned.get(s.place) || [];
    // (in the fog a look round shows little: look round less often there)
    if (!done.some(([a, b]) => Math.hypot(a - x, b - z) < (s.ui.calm != null ? 14 : 6))) return this.scan(s, goal);
    // somewhere seen but not visited, nearest first; else a direction nobody has been
    const visited = this.mem.visited.get(s.place) || [];
    // ways through (gates, bridges, stairs, paths) look the most promising
    const WAY = /gate|bridge|stair|path|steps|jetty|pier|lane|alley/;
    const places = [...(this.mem.places.get(s.place) || new Map()).values()]
      .filter((p) => !visited.some(([a, b]) => Math.hypot(a - p.pos[0], b - p.pos[2]) < 6))
      .map((p) => ({ p, d: Math.hypot(p.pos[0] - x, p.pos[2] - z) * (WAY.test(p.looks) ? 0.4 : /wall/.test(p.looks) ? 1.6 : 1) }))
      .sort((a, b) => a.d - b.d);
    let target = places[0]?.p.pos;
    if (!target) {
      if (!this.wanderTo || Math.hypot(this.wanderTo[0] - x, this.wanderTo[2] - z) < 2 || now() - this.wanderT > 25000) {
        const a = Math.random() * Math.PI * 2;
        this.wanderTo = [x + Math.sin(a) * 15, 0, z + Math.cos(a) * 15];
        this.wanderT = now();
      }
      target = this.wanderTo;
    }
    if (!goal.exploring) {
      goal.exploring = true;
      this.think(`I can’t see ${goal.lookingFor ? 'the ' + goal.lookingFor : 'it'} from here. I look around.`);
    }
    await this.travel(s, target[0], target[2], { radius: 2, goal: null });
  }
  // Something that moves isn't where I last saw it: look toward that spot, then all round, once per time it went
  // out of sight. If it's still not in view after that, just walk to where it was.
  shouldLookFor(goal, t, within) {
    return t.remembered && t.unseen > 2.5 && t.dist < within && (goal.searched ||= new Map()).get(t.key) !== t.t;
  }
  async lookFor(s, goal, t) {
    this.trace('lookFor', t.looks, t.dist, goal.lookedAt);
    await this.hands.stop();
    if (!goal.lookedAt || goal.lookedAt !== t.key) {
      goal.lookedAt = t.key;
      return this.aimAt(s, t);
    }
    goal.lookedAt = null;
    goal.searched.set(t.key, t.t);
    return this.scan(s, goal, true);
  }
  async scan(s, goal, quick = false) {
    this.trace('scan', quick);
    const [x, , z] = s.me.pos;
    const done = this.mem.scanned.get(s.place) || [];
    done.push([x, z]);
    this.mem.scanned.set(s.place, done);
    this.think('I turn round and look all about.');
    await this.hands.stop();
    this.scanning = true;
    for (let i = 0; i < 6; i++) {
      await this.hands.turn(Math.PI / 3 / RAD_PER_PX, 0, { speed: quick ? 90 : 70 });
      await this.hands.wait(quick ? 150 : 250);
      const look = await this.eyes.look();
      this.remember(look);
      // stop as soon as what I'm after is in view
      if (quick && goal?.want && look.things?.some((t) => overlap(goal.want, t.looks) > 0)) break;
    }
    this.scanning = false;
    this.metrics.stillFrom = now(); // (looking round isn't standing about)
  }

  // ---------------------------------------------------------------- a sigh coming (Chapters 4 and 5)
  // You hear it set out (a long low moan from one direction), then see the grey front come up the street, and
  // the edge of the screen greys three seconds before it arrives (or glows warm, if she is sheltered). Get
  // into a warm spot (colour in the grey, a lit lantern, a golden thread), or put something solid between her
  // and where it comes from, and stay there until it has passed.
  async shelter(s) {
    const f = s.sighFront,
      w = s.ui.sigh;
    const eta = f ? f.dist / f.speed : 0;
    if ((!f && !w) || (f && eta > 6 && !w)) {
      if (this.sheltering) {
        this.sheltering = null;
        this.metrics.stillFrom = now();
        this.think(this.caughtBySigh ? 'It went over me. I get up and go on.' : 'It has passed over. On we go.');
        this.caughtBySigh = false;
      }
      return false;
    }
    // a scene, a seat or a mini-game: nothing to do
    if (s.me.state !== 'move') return false;
    const [x, , z] = s.me.pos;
    const warm = (s.things || []).filter((t) => t.kind === 'warm');
    const inside = warm.find((t) => t.inside && t.dist < t.r - 0.6);
    const sh = (this.sheltering ||= { t: now(), said: false, spot: null });
    this.goal && (this.goal.waits = true);
    if (inside || w?.sheltered) {
      // (a spot that worked: remember it for the next one)
      const good = (this.goodShelter ||= new Map()).get(s.place) || [];
      if (!good.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 2)) good.push([x, z]);
      this.goodShelter.set(s.place, good);
      if (!sh.safe) {
        sh.safe = true;
        this.think(inside ? 'A sigh is coming, and I am in the warm colour. I stay put.' : 'A sigh is coming. The wall is between us: I stay put.');
      }
      await this.hands.up(this.key('hum'));
      await this.hands.stop();
      if (f) await this.aimAt(s, { pos: [x + f.from[0] * 5, 0, z + f.from[1] * 5] }, { speed: 60 });
      return true;
    }
    sh.safe = false;
    // here, and the edge of the screen still says I'm in the open: that spot was no good
    const bad = (this.badShelter ||= []);
    if (w && sh.spot && Math.hypot(sh.spot[0] - x, sh.spot[1] - z) < 1) {
      bad.push([x, z]);
      if (bad.length > 30) bad.shift();
      sh.spot = null;
    }
    const ok = ([sx, sz]) => !bad.some(([bx, bz]) => Math.hypot(bx - sx, bz - sz) < 1.5);
    // somewhere to go: the nearest warm spot, or a spot behind a wall I have seen
    if (!sh.spot || now() - sh.spotT > 2500) {
      const best = warm.filter((t) => ok([t.pos[0], t.pos[2]])).map((t) => ({ t, d: Math.max(0, t.dist - t.r * 0.6) })).sort((a, b) => a.d - b.d)[0];
      // somewhere that sheltered me before, that I can reach in time at a run
      const reach = Math.max(4, (f ? f.dist / f.speed : 3) * 3);
      const known = (this.goodShelter?.get(s.place) || []).filter((p) => ok(p)).map((p) => ({ p, d: Math.hypot(p[0] - x, p[1] - z) })).filter((k) => k.d < reach).sort((a, b) => a.d - b.d)[0];
      if (best && best.d < 14 && !(known && known.d < best.d)) {
        sh.spot = [best.t.pos[0], best.t.pos[2], Math.min(1.5, best.t.r * 0.5)];
        sh.why = best.t.looks;
      } else if (known) {
        sh.spot = [known.p[0], known.p[1], 0.6];
        sh.why = 'the spot that sheltered me before';
      } else if (f) {
        const behind = this.nav.shelterNear(x, z, f.from, ok);
        sh.spot = behind ? [behind[0], behind[1], 0.5] : null;
        sh.why = 'behind the wall';
      }
      sh.spotT = now();
    }
    if (!sh.said) {
      sh.said = true;
      this.log.event('sigh', { text: sh.spot ? `A sigh is coming: I go ${sh.why === 'behind the wall' ? 'behind the wall' : 'into ' + sh.why}.` : 'A sigh is coming, and there is nowhere to hide.' });
      this.think(sh.spot ? `A sigh! ${sh.why === 'behind the wall' ? 'I get behind the wall.' : sh.why.startsWith('the spot') ? 'Back to the spot that sheltered me before.' : 'Into ' + sh.why + '.'}` : 'A sigh, and nowhere to hide. I brace myself.');
    }
    await this.hands.up(this.key('hum'));
    if (!sh.spot) {
      await this.hands.stop();
      return true;
    }
    const res = await this.travel(s, sh.spot[0], sh.spot[1], { radius: sh.spot[2], hurry: true });
    if (res.arrived) await this.hands.stop();
    return true;
  }

  // Lost, and the game's guide is showing the way (the arrow under the objective, my sprite flying ahead):
  // follow it, as a player would.
  async followGuide(s) {
    const way = s.ui.way;
    if (this.guideFor !== this.objective) {
      this.guideFor = this.objective;
      this.log.event('guide', { text: `The guide is showing the way (${Math.round(way.dist)} m) for: ${this.objective}` });
      this.think(`An arrow under the objective, and my Charm Sprite flying ahead: ${Math.round(way.dist)} m that way. I follow it.`);
    }
    const sprite = (s.things || []).find((t) => t.kind === 'guide');
    let tx, tz;
    if (sprite && sprite.dist > 2) [tx, , tz] = sprite.pos;
    else {
      const h = s.view.yaw + Math.PI - way.angle;
      const k = Math.min(6, way.dist);
      tx = s.me.pos[0] + Math.sin(h) * k;
      tz = s.me.pos[2] + Math.cos(h) * k;
    }
    await this.travel(s, tx, tz, { radius: 0.8, goal: this.goal });
  }

  // ---------------------------------------------------------------- the beat
  // Run fn right on the next beat of the lullaby (you can hear it), if it is coming up soon.
  async onBeat(s, fn) {
    if (!s.beat || this.beatBusy) return;
    const spb = s.beat.spb * 1000;
    const since = now() - this.last; // the snapshot is this old
    let wait = (1 - s.beat.phase) * spb - since - 12;
    if (wait < 0) wait += spb;
    if (wait > 260) return;
    this.beatBusy = true;
    // a person's timing: off by a few tens of milliseconds, either way (mostly Perfect, now and then not)
    await this.hands.wait(Math.max(0, wait + (Math.random() + Math.random() + Math.random() - 1.5) * 70));
    await fn();
    this.beatBusy = false;
    this.lastBeatPress = now();
  }

  // ---------------------------------------------------------------- what's on screen
  async tick(s) {
    const u = s.ui;
    const mode = u.loading ? 'loading' : u.menu ? 'menu' : u.dialogue ? 'dialogue' : u.panel ? 'minigame' : !s.me || u.card || u.fade || s.view?.cutscene ? 'cutscene' : s.me.state === 'sit' ? 'seated' : 'play';
    this.time[mode] = (this.time[mode] || 0) + this.dt;
    this.stillness(s, mode);
    // time spent reading, watching or in a mini-game isn't time spent getting nowhere
    if (mode !== 'play' && this.goal) this.goal.bestT += this.dt * 1000;
    if (u.loading) return this.onLoading(u.loading);
    if (u.menu) return this.onMenu(s);
    if (u.dialogue) return this.onDialogue(s);
    if (u.panel) return this.onPanel(s);
    if (!s.me || u.card || u.fade || s.view?.cutscene) {
      await this.hands.releaseAll();
      if (u.card) this.think(`“${u.card.title}”`);
      return this.hands.wait(150);
    }
    if (s.me.state === 'overwhelmed') {
      await this.hands.releaseAll();
      if (!this.overT || now() - this.overT > 5000) {
        this.overT = now();
        this.log.event('overwhelmed', { text: 'Out of Calm: she sits down for five more minutes.' });
        this.think('Oof. Out of Calm: she has to sit down for a moment.');
      }
      return this.hands.wait(250);
    }
    if (s.me.state === 'pose') return this.hands.wait(150);
    if (s.me.state === 'sit') return this.onSeated(s);
    if (await this.shelter(s)) return;
    this.flock = null;
    if (this.want.book) return this.readBook();
    if (this.want.browse) return this.browseBook();
    if (this.lookAround && u.objective && now() - this.objT > 1500) {
      this.lookAround = false;
      this.think('Somewhere new. I have a look round.');
      return this.scan(s, null);
    }
    if (this.opts.finishing?.(s, this)) {
      await this.hands.releaseAll();
      return this.hands.wait(150);
    }
    // no objective yet: a scene is still setting up, or the story is about to say something
    if (!u.objective && now() - Math.max(this.objT, this.blankT || 0, this.cardT || 0) < 12000) {
      await this.hands.stop();
      return this.hands.wait(200);
    }
    if (!this.goal || this.goal.finished) {
      this.goal = u.objective ? planFor(this, u.objective) : null;
      if (!this.goal) {
        if (!this.noPlanFor || this.noPlanFor !== u.objective) {
          this.noPlanFor = u.objective;
          this.log.event('confused', { text: `I don’t know what to do about “${u.objective || '(no objective)'}”.` });
        }
        this.goal = new Goal(this, 'I’ll look around.');
        this.goal.tick = (s2) => this.explore(s2, this.goal, []);
      }
    }
    await this.goal.tick(s);
  }

  // Standing about in free play for no reason (humming, keeping someone company, waiting out a sigh or for a
  // train are reasons: a goal that waits says so with `waits`).
  stillness(s, mode) {
    const m = this.metrics;
    const busy = mode !== 'play' || !s.me || s.me.humming || s.ui.ring || this.goal?.waits || this.scanning;
    if (mode === 'play') m.playT += this.dt;
    if (busy || !m.stillAt || Math.hypot(s.me.pos[0] - m.stillAt[0], s.me.pos[2] - m.stillAt[2]) > 0.4) {
      m.stillAt = s.me?.pos || null;
      m.stillFrom = now();
      m.flagged = false;
      return;
    }
    if (!m.flagged && now() - m.stillFrom > 8000) {
      m.flagged = true;
      m.still.push(this.log.now());
      this.log.event('still', { text: `Standing still for 8 s on: ${this.goal?.desc || this.objective || '?'}` });
      this.dumpTrace('still');
    }
  }

  async onLoading(l) {
    await this.hands.releaseAll();
    if (!l.begin) {
      this.think(l.status ? `Loading… “${l.status}”` : 'Loading…');
      return this.hands.wait(250);
    }
    this.think('The game has loaded. I press Begin.');
    await this.hands.wait(1200);
    await this.hands.clickSel('#begin');
    this.log.event('begin', {});
    await this.hands.wait(800);
  }

  async onMenu(s) {
    const m = s.ui.menu;
    await this.hands.releaseAll();
    if (m.id === 'book' && this.bookOpen) return;
    this.think(`The ${m.title || m.id} menu is open. I close it.`);
    if (m.buttons.some((b) => /^(Resume|Close|Back|Cancel)$/.test(b))) await this.hands.click(m.buttons.find((b) => /^(Resume|Close|Back|Cancel)$/.test(b)));
    else await this.hands.tap('Escape');
    await this.hands.wait(300);
  }

  async readBook() {
    this.want.book = false;
    this.think('Which Charm Sprite remembers what? I open my Sprite Book to read what each one can do.');
    await this.hands.releaseAll();
    await this.hands.tap(this.key('book'));
    await this.hands.wait(700);
    this.bookOpen = true;
    const s = await this.eyes.look();
    const text = s.ui.menu?.text || '';
    this.mem.abilities = text;
    this.log.event('book', { text: text.slice(0, 600) });
    await this.hands.wait(2500); // reading
    this.bookOpen = false;
    await this.hands.tap(this.key('book'));
    await this.hands.wait(400);
  }

  // Leaf through the Sprite Book to its last pages (the Harbour Book, Lantern Bay), slowly enough to read.
  async browseBook() {
    this.want.browse = false;
    this.think('I have a look through my Sprite Book, right to the back.');
    await this.hands.releaseAll();
    await this.hands.tap(this.key('book'));
    this.bookOpen = true;
    await this.hands.wait(2000);
    for (let i = 0; i < 7; i++) {
      await this.hands.wheel(260);
      await this.hands.wait(1300);
    }
    const s = await this.eyes.look();
    this.log.event('book', { text: (s.ui.menu?.text || '').slice(-600) });
    await this.hands.wait(3000);
    this.bookOpen = false;
    await this.hands.tap(this.key('book'));
    await this.hands.wait(500);
  }

  async onDialogue(s) {
    const d = s.ui.dialogue;
    await this.hands.releaseAll();
    const id = d.who + '|' + d.text.slice(0, 12) + '|' + d.choices.length;
    if (!this.line || this.line.id !== id) this.line = { id, start: now() };
    if (!d.typed) return this.hands.wait(60);
    if (!this.line.typed) {
      this.line.typed = now();
      this.mem.lines.push({ who: d.who, text: d.text });
      if (this.mem.lines.length > 60) this.mem.lines.shift();
      this.log.event('line', { who: d.who, text: d.text });
      this.react(d.text);
      // that Charm Sprite didn't remember it: try another one next time
      if (this.lastGuess && /didn’t help|nothing but dust|nothing here to read|doesn’t notice|no path to follow|doesn’t remember this/.test(d.text)) {
        const w = this.mem.wrong.get(this.lastGuess.clue) || new Set();
        w.add(this.lastGuess.choice);
        this.mem.wrong.set(this.lastGuess.clue, w);
        this.log.event('wrong', { text: `${this.lastGuess.choice} didn’t remember “${this.lastGuess.clue.slice(0, 50)}…”` });
        this.lastGuess = null;
      }
      this.directions(d.text);
      if (this.lastReply && /doesn’t want fixing|That’s what everybody said/.test(d.text)) {
        (this.mem.wrongReplies ||= new Set()).add(this.lastReply);
        this.log.event('wrong', { text: `“${this.lastReply}” wasn’t what it needed` });
        this.lastReply = null;
      }
    }
    // reading (some of it while the line is typing), and a moment to think before picking an answer
    this.line.think ??= d.choices.length ? 1500 + Math.random() * 1000 : 0;
    const need = (d.text.length / this.opts.readCps) * 1000 + this.opts.linePause + this.line.think;
    if (now() - this.line.start < need) return this.hands.wait(60);
    if (d.choices.length) {
      const i = this.choose(d);
      this.think(`“${d.text.slice(0, 80)}” I choose “${d.choices[i]}”.`);
      this.log.event('choice', { text: d.text, choice: d.choices[i] });
      await this.hands.click(d.choices[i], '.dialogue .choices button');
      this.line = null;
      return this.hands.wait(250);
    }
    await this.hands.tap('Enter');
    this.line = null;
    await this.hands.wait(120);
  }

  choose(d) {
    const ch = d.choices;
    if (/Which Charm Sprite remembers/i.test(d.text)) return this.guessSprite(ch);
    if (/say back\?/i.test(d.text)) return this.listen(ch);
    // the answer that fits what I'm trying to do (the objective, or what the current goal is about)
    const want = tokens((this.objective || '') + ' ' + (this.goal?.choiceHint || ''));
    let bi = -1,
      bs = 0;
    ch.forEach((c, i) => {
      const n = overlap(want, c);
      if (n > bs) (bs = n), (bi = i);
    });
    if (bi >= 0) return bi;
    // an offer to take me somewhere the objective doesn't mention (a ferryman, Bo at the gate): not now
    if (ch.some((c) => /\b(home|academy|district|market|station|quarter|across)\b/i.test(c))) {
      const no = ch.findIndex((c) => /not yet|not now|stay|later|no thanks/i.test(c));
      if (no >= 0) return no;
    }
    // an offer to do something again ("Back for more tarts?"): not now, there's the story to get on with
    if (/^Back for|another round|again\?/i.test(d.text)) {
      const no = ch.findIndex((c) => /not now|not yet|maybe later|later/i.test(c));
      if (no >= 0) return no;
    }
    // otherwise the friendly, eager answer
    const i = ch.findIndex((c) => !/not now|not yet|maybe later|later|save them/i.test(c));
    return i >= 0 ? i : 0;
  }

  // What to say back to a sad feeling (Chapter 5, while Captain Honk listens): the answer that listens, not one
  // that tries to fix it or brushes it off. (Bo says which kind was wrong, if one was.)
  listen(choices) {
    const score = (c) =>
      (/\b(hear|sorry|miss|asking|waited|telling me|not going anywhere|sounds|must|really hard)\b/i.test(c) ? 3 : 0) -
      (/!\s*$|\b(cheer up|then write|call them|open it|you’ll|we could|have a tart)\b/i.test(c) ? 2 : 0) -
      (/\b(probably|all the time|that’s life|only a|now and then|you did say|everyone forgets)\b/i.test(c) ? 2 : 0);
    const tried = this.mem.wrongReplies || new Set();
    const ranked = choices.map((c, i) => ({ i, sc: score(c) - (tried.has(c) ? 9 : 0) })).sort((a, b) => b.sc - a.sc);
    const pick = ranked[0].i;
    this.lastReply = choices[pick];
    this.think(`It needs hearing, not fixing. I say: “${choices[pick]}”`);
    return pick;
  }

  // Which Charm Sprite remembers the clue? Match what the clue brings to mind with what the Sprite Book says
  // about each sprite; skip the ones that already didn't remember it.
  guessSprite(choices) {
    const clue = [...this.mem.lines].reverse().find((l) => !/Which Charm Sprite/.test(l.text))?.text || '';
    const tried = this.mem.wrong.get(clue) || new Set();
    const words = tokens(clue);
    const book = (this.mem.abilities || '').toLowerCase();
    let best = -1,
      bs = -1;
    choices.forEach((c, i) => {
      if (/not now/i.test(c) || tried.has(c)) return;
      const name = c.replace(/[^A-Za-z- ]/g, '').trim().toLowerCase();
      // its entry in the book: each entry starts with "×<count>"; take the one that names this sprite
      const entry = book.split('×').find((e) => e.includes(name)) || name;
      let sc = 0;
      for (const idea of IDEAS) {
        const hits = words.filter((w) => idea.some((x) => w.startsWith(x))).length;
        if (hits && idea.some((x) => entry.includes(x))) sc += hits;
      }
      if (sc > bs) (bs = sc), (best = i);
    });
    const pick = best >= 0 ? best : 0;
    this.lastGuess = { clue, choice: choices[pick] };
    this.think(`“${clue.slice(0, 70)}…” I think the ${choices[pick].replace(/^\S+\s/, '')} remembers this.`);
    return pick;
  }

  // ---------------------------------------------------------------- mini-games
  async onPanel(s) {
    const p = s.ui.panel;
    await this.hands.stop();
    if (p.kind === 'cooking') return this.cook(p);
    if (p.kind === 'chestnuts') return this.chestnuts(s, p);
    if (p.kind === 'lanterns') return this.lanterns(s, p);
    if (p.kind === 'fishing') return this.fish(s, p);
    if (p.kind === 'card' || p.kind === 'board') return this.readPanel(p);
  }
  // Something to read (a catch held up, the worry board, the credits): read it, then carry on.
  async readPanel(p) {
    await this.hands.releaseAll();
    if (this.reading !== p.text) {
      this.reading = p.text;
      this.readT = now();
      this.think(p.kind === 'board' ? `The worry board: ${(p.notes || []).filter((n) => !n.done).map((n) => n.text.slice(0, 70)).join(' / ')}` : `“${p.text.slice(0, 110)}”`);
      this.log.event('read', { text: p.text.slice(0, 300) });
      if (p.kind === 'board') this.mem.worries = (p.notes || []).filter((n) => !n.done).map((n) => n.text);
    }
    if (now() - this.readT < Math.min(6000, 900 + (p.text.length / this.opts.readCps) * 1000)) return this.hands.wait(120);
    await this.hands.tap(this.key('interact'));
    this.reading = null;
    await this.hands.wait(400);
  }
  // Thread fishing, as the panel says: hold Hum to send the thread out and let go; hum on the beat to call
  // it closer; press at the bite; hold to wind in, and ease off while it tugs or the bar is nearly full.
  async fish(s, p) {
    const hum = this.key('hum');
    if (!this.fishing) this.log.event('minigame', { text: 'fishing' });
    const f = (this.fishing ||= { t: now(), caught: 0, said: '' });
    const say = (t) => f.said !== t && ((f.said = t), this.think(t));
    // a few catches are enough for one visit
    if (f.caught >= (this.opts.catches || 2) && /Pack up/.test(p.buttons.join(' ')) && /send the thread out/.test(p.hint)) {
      await this.hands.up(hum);
      this.think('That will do for now. I pack up.');
      await this.hands.tap(this.key('interact'));
      this.fishing = null;
      this.fished = now();
      (this.fishedHere ||= new Set()).add(this.nav.place);
      return this.hands.wait(600);
    }
    if (/send the thread out/.test(p.hint)) {
      f.reeling = false;
      say('I hold Hum to send the thread out over the water, and let go.');
      if (!f.cast) {
        f.cast = now();
        await this.hands.down(hum);
      } else if (now() - f.cast > 900 + Math.random() * 900) {
        await this.hands.up(hum);
        f.cast = 0;
        await this.hands.wait(700);
      }
      return this.hands.wait(40);
    }
    f.cast = 0;
    if (p.bite || /A bite/.test(p.hint)) {
      say('A bite! I press Hum.');
      await this.hands.wait(120 + Math.random() * 160);
      await this.hands.tap(hum, 40);
      return this.hands.wait(150);
    }
    if (/on the beat/.test(p.hint)) {
      say('The float is down. I hum on the beat to call it closer.');
      await this.hands.up(hum);
      if (!this.lastBeatPress || now() - this.lastBeatPress > 500) await this.onBeat(s, () => this.hands.tap(hum, 30));
      return this.hands.wait(30);
    }
    if (/pulling|Ease off/i.test(p.hint) || p.tug || p.tension > 0.72) {
      say('It’s pulling: I ease off, and wind again when it rests.');
      await this.hands.up(hum);
      return this.hands.wait(40);
    }
    if (/wind it in/.test(p.hint)) {
      if (!f.reeling) {
        f.reeling = true;
        f.caught++;
        f.said = '';
      }
      await this.hands.down(hum);
      return this.hands.wait(40);
    }
    f.reeling = false;
    return this.hands.wait(60);
  }
  // A marker swings across a meter: press when it's in the middle of the green.
  async cook(p) {
    if (p.mark == null || !p.perfect) return this.hands.wait(50);
    if (this.cookStep === p.text) return this.hands.wait(80);
    const a = p.mark;
    const t0 = now();
    await this.hands.wait(40);
    const s2 = await this.eyes.peek();
    const b = s2.ui.panel?.mark;
    if (b == null) return;
    const v = (b - a) / ((now() - t0) / 1000); // per second, signed
    const target = (p.perfect[0] + p.perfect[1]) / 2;
    let dist = v > 0 ? (target >= b ? target - b : 1 - b + (1 - target)) : target <= b ? b - target : b + target;
    const secs = dist / Math.max(0.2, Math.abs(v));
    if (secs > 1.6) return this.hands.wait(Math.min(400, (secs - 1.4) * 1000));
    this.think(`${(p.text.match(/· (.+?) (?:Press|$)/) || [])[1] || 'Next step'}: I wait for the marker to reach the middle, then press.`);
    // a person's timing: a few tens of milliseconds either way
    const jitter = (Math.random() + Math.random() + Math.random() - 1.5) * 60;
    await this.hands.wait(Math.max(0, secs * 1000 - 30 + jitter));
    await this.hands.tap(this.key('hum'), 30);
    this.cookStep = p.text;
    await this.hands.wait(500);
    const s3 = await this.eyes.peek();
    if (s3.ui.panel?.result) this.log.event('minigame', { text: 'cooking: ' + s3.ui.panel.result });
  }
  // Stir on the beat; take each chestnut out once it has been golden for a moment.
  async chestnuts(s, p) {
    const t = now();
    this.nuts = this.nuts || { start: t, gold: [] };
    for (let i = 0; i < p.nuts.length; i++) {
      const n = p.nuts[i];
      if (n.out) continue;
      if (n.gold && !this.nuts.gold[i]) this.nuts.gold[i] = t;
      // golden at 0.6 of the way, perfect at about 0.73: wait about a fifth again as long as it took to turn gold
      if (this.nuts.gold[i] && t - this.nuts.gold[i] > (this.nuts.gold[i] - this.nuts.start) * 0.2) {
        this.think(`Chestnut ${i + 1} is golden. Out it comes.`);
        await this.hands.tap('Digit' + (i + 1));
        this.log.event('minigame', { text: 'chestnut ' + (i + 1) });
      }
    }
    if (p.nuts.every((n) => n.out)) this.nuts = null;
    else if (!this.lastBeatPress || now() - this.lastBeatPress > 1300) await this.onBeat(s, () => this.hands.tap(this.key('hum'), 30));
    await this.hands.wait(40);
  }
  // Release each lantern on the beat.
  async lanterns(s) {
    if (!this.lastBeatPress || now() - this.lastBeatPress > 600) await this.onBeat(s, () => this.hands.tap(this.key('hum'), 30));
    await this.hands.wait(30);
  }

  // ---------------------------------------------------------------- sitting
  async onSeated(s) {
    if (s.ui.goodChips?.length) return this.sitWithFlock(s);
    if (this.goal instanceof Company) return this.goal.seated(s);
    await this.hands.releaseAll();
    return this.hands.wait(200);
  }
  // Sitting with a flock: ask Bo which free good thing each sparrow loves (if there's Cozy Energy to spare,
  // with a snack first for a team-up), point it out, and hum; try another good thing if it's slow.
  async sitWithFlock(s) {
    const f = (this.flock ||= { t: now(), asked: false, sel: -1, prog: 0, progT: now(), tried: [] });
    const ring = s.ui.ring;
    const chips = s.ui.goodChips;
    if (f.sel < 0) {
      await this.hands.up(this.key('hum'));
      let pick = 0;
      const cozy = s.ui.hud?.cozy || 0;
      if (this.know.assist && cozy >= 20 && !f.asked) {
        f.asked = true;
        const snack = this.snacks(s) > 0;
        this.think(snack ? 'A snack from Sunny, then Bo asks them what they love best.' : 'I ask Bo which free thing they love best.');
        if (snack) {
          await this.hands.tap(this.key('assist'));
          await this.hands.wait(700);
        }
        await this.hands.tap(this.key('assist'));
        await this.hands.wait(700);
        const look = await this.eyes.look();
        const icons = look.ui.bubbles.map((b) => b.text.trim());
        const counts = chips.map((c) => icons.filter((i) => i && c.text.includes(i)).length);
        pick = counts.indexOf(Math.max(...counts));
        if (icons.length) this.think(`Bo says they love: ${icons.join(' ')}. I point out ${chips[pick].text.replace(/^\d\s*/, '')}.`);
      } else this.think(`I point out ${chips[0].text.replace(/^\d\s*/, '')} and hum.`);
      f.sel = pick;
      f.tried.push(pick);
      await this.hands.tap('Digit' + (pick + 1));
      f.progT = now();
    }
    await this.hands.down(this.key('hum'));
    if (ring && ring.progress > f.prog + 0.02) {
      f.prog = ring.progress;
      f.progT = now();
    }
    if (this.know.beat && ring?.label === '♪') await this.onBeat(s, async () => {
      await this.hands.up(this.key('hum'));
      await this.hands.down(this.key('hum'));
    });
    if (now() - f.progT > 5000) {
      const next = [0, 1, 2].find((i) => i < chips.length && !f.tried.includes(i)) ?? (f.sel + 1) % chips.length;
      this.think(`It’s slow. I try ${chips[next].text.replace(/^\d\s*/, '')} instead.`);
      f.sel = next;
      f.tried.push(next);
      await this.hands.tap('Digit' + (next + 1));
      f.progT = now();
    }
    await this.hands.wait(60);
  }

  // ---------------------------------------------------------------- when it's going nowhere
  async watchdog(s) {
    // the same objective for a long time in free play, however busy I look: I'm lost
    const mode = s.ui.dialogue || s.ui.card || s.ui.panel || s.ui.menu || s.ui.loading || s.me?.state !== 'move' ? 'busy' : 'play';
    if (mode === 'play') this.objPlay = (this.objPlayFor === this.objective ? this.objPlay || 0 : 0) + this.dt;
    this.objPlayFor = this.objective;
    if (this.objPlay > 240 && !(this.objWarned === this.objective)) {
      this.objWarned = this.objective;
      this.log.event('confused', { text: `Four minutes of play on “${this.objective}” and it hasn’t changed.` });
      if (this.checkpoints < 2) {
        this.checkpoints++;
        this.objPlay = 0;
        this.objWarned = null;
        await this.checkpoint();
        this.goal = null;
        return;
      }
      throw Object.assign(new Error(`Gave up on “${this.objective}”`), { fatal: true });
    }
    const g = this.goal;
    if (!g || s.ui.dialogue || s.ui.card || s.ui.loading || s.ui.menu || s.me?.state !== 'move') return;
    if (g.stale > 45 && !g.warned) {
      g.warned = true;
      this.log.event('stuck', { text: `No progress for 45 s on: ${g.desc}`, goal: g.desc });
      this.dumpTrace('stuck');
      this.think('I’m not getting anywhere. I try another way round.');
      this.nav.route = null;
      await this.hands.move(['KeyS']);
      await this.hands.wait(600);
      await this.hands.turn((Math.random() > 0.5 ? 1 : -1) * 350);
      await this.hands.move(['KeyW']);
      await this.hands.wait(900);
    }
    if (g.stale > 100) {
      this.log.event('confused', { text: `Still stuck on: ${g.desc} (objective: ${this.objective})`, goal: g.desc });
      if (this.checkpoints < 2) {
        this.checkpoints++;
        await this.checkpoint();
      } else throw Object.assign(new Error(`Gave up on “${this.objective}”`), { fatal: true });
      this.goal = null;
    }
  }
  async checkpoint() {
    this.think('I’m lost. The pause menu has “Stuck? Back to last checkpoint”. I use it.');
    this.log.event('checkpoint', { text: this.objective });
    await this.hands.releaseAll();
    await this.hands.tap('Escape');
    await this.hands.wait(700);
    await this.hands.click('Stuck? Back to last checkpoint');
    await this.hands.wait(3000);
  }
}

export { wrap };
