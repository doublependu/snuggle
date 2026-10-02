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
const CURIOUS = /^(Tuck in the sleepy sprite|Read the note|Look at the lotus buds|Water the lotus buds|Float lanterns|Talk)$/;
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
  constructor({ eyes, hands, log, opts = {} }) {
    this.eyes = eyes;
    this.hands = hands;
    this.log = log;
    this.opts = { readCps: 20, ...opts };
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
  }

  key(action) {
    return KEYS[action];
  }
  think(text) {
    this.log.think(text);
  }
  // TRACE=1: what each tick decided (for working on the autoplayer)
  trace(...a) {
    if (process.env.TRACE) console.log('   ·', this.log.now().toFixed(1), ...a);
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
    if (u.objective && u.objective !== this.objective) {
      this.objective = u.objective;
      this.objT = now();
      this.checkpoints = 0;
      this.log.event('objective', { text: u.objective });
      this.goal = null;
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
      const sc = overlap(want, p.looks);
      const d = Math.hypot(p.pos[0] - x, p.pos[2] - z);
      if (sc > bs || (sc === bs && sc > 0 && d < best.d)) {
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
  // Turn the camera toward a thing (so W walks at it, and she keeps it in view).
  async aimAt(s, t) {
    const err = yawTo(s, t.pos[0], t.pos[2]);
    if (Math.abs(err) > 0.12) await this.hands.turn(-err / RAD_PER_PX);
  }
  // Walk toward (x, z): steer by the camera, run (Shift) when there's room, walk near shy Grumblings, step
  // round what's in the way, pick up a lemon candy seen close by, and try something interesting once.
  async travel(s, x, z, { radius = 1, tiptoe = false, goal = null } = {}) {
    const [px, , pz] = s.me.pos;
    let dist = Math.hypot(x - px, z - pz);
    // someone said how to get there ("across the little bridge"): go that way first
    const via = goal && !goal.viaDone && goal.place?.map((w) => this.mem.via.get(w)).find(Boolean);
    if (via && dist > 8) {
      const v = this.findPlace(s, via);
      const dv = v && Math.hypot(v.pos[0] - px, v.pos[2] - pz);
      if (v && dv > 1.5 && dv < dist + 4) {
        if (!goal.viaSaid) {
          goal.viaSaid = true;
          this.think(`They said to go by the ${via.join(' ')}. That way first.`);
        }
        x = v.pos[0];
        z = v.pos[2];
        radius = 1.2;
        dist = dv;
      } else if (v) goal.viaDone = true;
    }
    this.trace('travel', x.toFixed(1), z.toFixed(1), 'dist', dist.toFixed(2), 'r', radius);
    goal?.progress(dist);
    if (dist <= radius) {
      await this.hands.stop();
      return { arrived: true, dist };
    }
    if (await this.detour(s)) return { arrived: false, dist };
    // straight at it when it's in sight and close, else along the route
    const direct = dist < 7 && (s.things || []).some((t) => Math.hypot(t.pos[0] - x, t.pos[2] - z) < 0.8);
    const [lx, lz] = direct ? [x, z] : this.nav.lookahead(s, x, z, now());
    let err = yawTo(s, lx, lz);
    // what's in the way right in front: steer along the clearest direction nearest to where I want to go
    const rays = s.ahead || [];
    const toward = rays.reduce((b2, r) => (Math.abs(r.deg * Math.PI / 180 - err) < Math.abs(b2.deg * Math.PI / 180 - err) ? r : b2), rays[0] || { deg: 0, dist: 14 });
    const need = Math.min(dist, 1.6);
    if (rays.length && Math.abs(err) < 1.4 && (toward.dist < need || toward.drop || toward.water)) {
      const open = rays.filter((r) => r.dist >= Math.min(need, 1.2) + 0.3 && !r.drop && !r.water);
      if (open.length) err = open.map((r) => (r.deg * Math.PI) / 180).sort((a, b) => Math.abs(a - err) - Math.abs(b - err))[0];
    }
    if (Math.abs(err) > 0.06) await this.hands.turn(-err / RAD_PER_PX);
    const shy = (s.things || []).some((t) => t.kind === 'creature' && !t.asleep && t.dist < 7 && /sparrow|grey/.test(t.looks));
    const keys = [];
    // just walked into something: a step back first
    if (this.backoffUntil > now()) {
      await this.hands.move(['KeyS']);
      return { arrived: false, dist };
    }
    if (Math.abs(err) < 1.3) keys.push('KeyW');
    const dodge = this.dodge(s);
    if (dodge) keys.push(dodge);
    // W walks and Shift runs: run when there's some way to go and room ahead; walk the last steps, and near
    // shy Grumblings (the game says running startles them)
    if (!tiptoe && !shy && dist > 3.5 && this.clearAhead(s) > 3 && Math.abs(err) < 0.5) keys.push(this.key('sprint'));
    await this.hands.move(keys);
    this.bumpCheck(s, keys.includes('KeyW') && Math.abs(err) < 0.5, dist);
    return { arrived: false, dist };
  }
  // Walked into something: remember it, try a hop, and route round it.
  bumpCheck(s, pushing, dist) {
    const [x, , z] = s.me.pos;
    const t = now();
    this.trail = (this.trail || []).filter((p) => t - p[2] < 1200);
    this.trail.push([x, z, t, pushing, dist]);
    if (this.trail.length < 6 || !this.trail.every((p) => p[3])) return;
    const [ox, oz, , , od] = this.trail[0];
    // pushing on, and neither moving nor getting any closer (sliding along a wall counts as stuck)
    if (Math.hypot(x - ox, z - oz) < 0.3 || od - dist < 0.25) {
      const heading = s.view.yaw + Math.PI;
      this.nav.bump(s, heading);
      this.nav.route = null;
      this.trail = [];
      this.backoffUntil = now() + 450;
      this.bumps = (this.bumps || 0) + 1;
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
    if (!done.some(([a, b]) => Math.hypot(a - x, b - z) < 6)) return this.scan(s, goal);
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
    for (let i = 0; i < 6; i++) {
      await this.hands.turn(Math.PI / 3 / RAD_PER_PX);
      await this.hands.wait(quick ? 200 : 350);
      const look = await this.eyes.look();
      this.remember(look);
      // stop as soon as what I'm after is in view
      if (quick && goal?.want && look.things?.some((t) => overlap(goal.want, t.looks) > 0)) break;
    }
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
    await this.hands.wait(Math.max(0, wait + (Math.random() - 0.5) * 70));
    await fn();
    this.beatBusy = false;
    this.lastBeatPress = now();
  }

  // ---------------------------------------------------------------- what's on screen
  async tick(s) {
    const u = s.ui;
    const mode = u.loading ? 'loading' : u.menu ? 'menu' : u.dialogue ? 'dialogue' : u.panel ? 'minigame' : !s.me || u.card || u.fade || s.view?.cutscene ? 'cutscene' : s.me.state === 'sit' ? 'seated' : 'play';
    this.time[mode] = (this.time[mode] || 0) + this.dt;
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
    this.flock = null;
    if (this.want.book) return this.readBook();
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
    if (!u.objective && now() - this.objT < 12000) {
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
    }
    // a person reads at about 20 characters a second (some of it while the line is typing)
    const need = Math.max(d.text.length / 48, d.text.length / this.opts.readCps) * 1000 + 350;
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
    // the answer that fits what I'm trying to do (the objective, or what the current goal is about)
    const want = tokens((this.objective || '') + ' ' + (this.goal?.choiceHint || ''));
    let bi = -1,
      bs = 0;
    ch.forEach((c, i) => {
      const n = overlap(want, c);
      if (n > bs) (bs = n), (bi = i);
    });
    if (bi >= 0) return bi;
    // an offer to do something again ("Back for more tarts?"): not now, there's the story to get on with
    if (/^Back for|another round|again\?/i.test(d.text)) {
      const no = ch.findIndex((c) => /not now|not yet|maybe later|later/i.test(c));
      if (no >= 0) return no;
    }
    // otherwise the friendly, eager answer
    const i = ch.findIndex((c) => !/not now|not yet|maybe later|later|save them/i.test(c));
    return i >= 0 ? i : 0;
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
    const f = (this.fishing ||= { t: now(), caught: 0, said: '' });
    const say = (t) => f.said !== t && ((f.said = t), this.think(t));
    // a few catches are enough for one visit
    if (f.caught >= (this.opts.catches || 2) && /Pack up/.test(p.buttons.join(' ')) && /send the thread out/.test(p.hint)) {
      await this.hands.up(hum);
      this.think('That will do for now. I pack up.');
      await this.hands.tap(this.key('interact'));
      this.fishing = null;
      this.fished = now();
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
