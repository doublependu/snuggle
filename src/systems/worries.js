// SPDX-License-Identifier: GPL-3.0-only
// The worry board: "…but new Grumblings are always being born." After the story, three worries are pinned up
// each day (content/worries.js): a line, a place and a person. Each is a real Grumbling at a set spot,
// soothed the way its species is; the person thanks you afterwards. A day is three worries: when all three
// are soothed, or when she sleeps on it at the dormitory, the next day's are pinned up. There is no real
// clock. Loaded after Begin, in free roam only (story/freeroam.js).
import '../world/zone.js'; // (what a late script shares with the zones stays in the main bundle: src/main.js)
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { G } from '../game.js';
import { Grumbling } from '../actors/grumbling.js';
import { CreatureBatch } from '../actors/creatures.js';
import { materialFor } from '../render/materials.js';
import { mulberry } from '../render/sky.js';
import { writeSave } from '../core/save.js';
import { SPEAKERS } from '../ui/ui.js';
import { SPECIES } from '../content/species.js';
import { WORRIES, PLACE, ICON, BY } from '../content/worries.js';
import { addPatch } from '../procgen/quilt.js';
import { chat } from '../story/helpers.js';
import { Greys } from './greys.js';
import { Stitch } from './stitch.js';

const byId = (id) => WORRIES.find((w) => w.id === id);
const FIRST = ['a_cloud', 'q_cloud', 'a_jitters']; // the first day: two at home, and one across the water

const CSS = `
.wboard { width: min(520px, calc(100vw - 24px)); max-height: calc(100vh - 40px); overflow: auto; text-align: left; padding: 14px 16px; top: 46%; }
.wboard h3 { text-align: center; margin: 0 0 8px; }
.wnote { display: flex; gap: 10px; align-items: flex-start; margin: 8px 0; padding: 9px 12px; border-radius: 6px 14px 8px 12px; background: #fff8dc; border: 1px solid #e6d3a0; box-shadow: 0 2px 5px #0002; transform: rotate(-.6deg); }
.wnote:nth-child(odd) { transform: rotate(.5deg); background: #fdf1e0; }
.wnote .ico { font-size: 24px; line-height: 1.2; }
.wnote b { color: #2f6f73; font-size: calc(13px * var(--ts)); }
.wnote p { margin: 2px 0; font-size: calc(14px * var(--ts)); }
.wnote small { opacity: .7; font-size: calc(12px * var(--ts)); }
.wnote .tick { margin-left: auto; font-size: 22px; color: #5fb36b; }
.wnote.done { opacity: .6; }
.wnote.done p { text-decoration: line-through; }
.wboard .foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.wboard .foot .small { flex: 1; }`;

// Today's three worries (made the first time the day is asked for): { day, ids, done }.
export function today(s = G.save) {
  s.day ||= 1;
  if (s.worries?.day === s.day) return s.worries;
  const before = s.worries?.ids || [];
  let ids = FIRST;
  if (s.day > 1) {
    // three from the list, shuffled by the day: different places and different kinds where they can be,
    // and none of yesterday's
    const rnd = mulberry(s.day * 7919 + 13);
    const pool = WORRIES.filter((w) => !before.includes(w.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const out = [];
    for (const w of pool) if (out.length < 3 && !out.some((o) => o.zone === w.zone || o.species === w.species)) out.push(w);
    for (const w of pool) if (out.length < 3 && !out.includes(w)) out.push(w);
    ids = out.map((w) => w.id);
  }
  return (s.worries = { day: s.day, ids, done: [false, false, false] });
}

export class Worries {
  constructor(zone) {
    this.zone = zone;
    zone.worries = this;
    this.live = new Map(); // worry id -> { g: its Grumbling(s), at: where }
    if (!document.getElementById('worry-css')) {
      const st = document.createElement('style');
      st.id = 'worry-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    zone.on('soothed', (g) => g.worry && this.soothedOne(g));
    zone.on('fish-catch', (c) => c.kind === 'bottled' && this.bottled(c.spot));
    this.spawn();
  }

  // A spot named in the list: a marker, an NPC, or [x, z] dropped onto the floor there.
  point(at) {
    const z = this.zone;
    if (typeof at === 'string') return (z.marker(at)?.position || G.npcs.get(at)?.position || new Vector3()).clone();
    const y = z.collision.groundY(at[0], at[1], 3.2);
    return new Vector3(at[0], y ?? 0, at[1]);
  }

  // The day's worries that are in this zone and not yet soothed come out.
  spawn() {
    const t = today();
    t.ids.forEach((id, i) => {
      const w = byId(id);
      if (!w || w.zone !== this.zone.id || t.done[i] || this.live.has(id)) return;
      this.live.set(id, { g: [], at: null });
      this.make(w);
    });
  }

  make(w) {
    const z = this.zone;
    const live = this.live.get(w.id);
    const add = (g) => {
      g.worry = w.id;
      z.addGrumbling(g);
      live.g.push(g);
      return g;
    };
    const id = 'worry_' + w.id;
    if (w.species === 'bottled') {
      // it is in the water: the fishing spot knows (systems/fishing.js)
      const spot = z.fishing?.spots.find((s) => s.id === w.spot);
      if (z.fishing) z.fishing.want = w.spot;
      live.at = spot?.at.clone() || new Vector3();
      return;
    }
    const at = (live.at = this.point(w.at));
    if (w.species === 'sock') return void add(new Grumbling('sock', at, { id, spots: [at, ...w.spots.map((s) => this.point(s))] }));
    if (w.species === 'pompom') return void add(new Grumbling('pompom', at, { id, company: this.point(w.company), companyRadius: w.radius }));
    if (w.species === 'grey') {
      // a grey one wants company first (systems/greys.js keeps its ring, and it is drawn with the others)
      z.greys ||= new Greys(z, []);
      const g = add(new Grumbling('grey', at, { id, wander: 1.2, echo: 'I WAS A DOORSTEP NOBODY CAME BACK TO. HONK.' }));
      z.greys.list.push(g);
      if (!z.greyBatch) {
        z.greyBatch = new CreatureBatch('grey', 4, { tint: true });
        z.group.add(...z.greyBatch.parts);
        z.updaters.push(() => z.greyBatch.update());
      }
      z.greyBatch.add(g.obj);
      return;
    }
    if (w.species === 'sparrow') {
      // two of them are back at their stall: the flock's seat works as it did (systems/perch.js)
      const f = z.flocks?.[w.flock - 1];
      if (!f) return;
      const spots = z.markersBy('GRUMB_sparrow_').filter((m) => (m.data.flock || 1) === w.flock).slice(0, 2);
      for (const m of spots) {
        const g = add(new Grumbling('sparrow', m.position, { id: id + '_' + m.name.slice(-1), bounds: z.box('AREA_flock' + f.id) }));
        g.favourite = f.goods[f.sparrows.length % f.goods.length]?.kind;
        f.sparrows.push(g);
      }
      f.done = false;
      f.enabled = true;
      live.at = f.seat.position.clone();
      return;
    }
    if (w.species === 'jitters') {
      // it loops round its person (who may still be on their way in)
      return void z.whenNPC(w.person || w.who, (n) => this.live.has(w.id) && add(new Grumbling('jitters', n.position.clone(), { id, person: n })));
    }
    if (w.species === 'letter') {
      // it wants delivering: its thread is stitched to whoever it was written to (systems/stitch.js)
      const g = add(new Grumbling('letter', at, { id }));
      const to = () => (typeof w.to === 'string' && G.npcs.get(w.to) ? G.npcs.get(w.to).position : (live.to ||= this.point(w.to)));
      z.stitch ||= new Stitch(z);
      z.stitch.add({
        id,
        from: () => at,
        to,
        icon: '✉️',
        color: '#ffd9c4',
        take: 'Take the letter’s thread',
        what: 'whoever it was written to',
        save: false,
        keep: false,
        pocket: 0,
        enabled: () => g.noticed && !g.delivered && this.live.has(w.id),
        onDone: () => g.deliver(to().clone()),
      });
      return;
    }
    add(new Grumbling(w.species, at, { id }));
  }

  // Where the nearest of the day's worries in this zone is (for the guide), or null.
  nearest() {
    let best = null,
      bd = Infinity;
    for (const { g, at } of this.live.values()) {
      const p = g.find((x) => !x.soothed)?.position || at;
      if (!p) continue;
      const d = p.distanceTo(G.player.position);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  soothedOne(g) {
    const live = this.live.get(g.worry);
    if (live && live.g.every((x) => x.soothed)) this.done(g.worry, g.position);
  }
  bottled(spot) {
    for (const id of this.live.keys()) {
      const w = byId(id);
      if (w.species === 'bottled' && w.spot === spot) {
        this.zone.fishing.want = null;
        this.done(id, G.player.position);
      }
    }
  }

  // A worry is soothed: a patch for the quilt, a word from whoever pinned it up, and, when it was the day's
  // third, the next day's worries.
  done(id, pos) {
    const s = G.save,
      t = today(),
      w = byId(id);
    const i = t.ids.indexOf(id);
    this.live.delete(id);
    this.zone.stitch?.remove('worry_' + id);
    if (i < 0 || t.done[i]) return;
    t.done[i] = true;
    s.worried = (s.worried || 0) + 1;
    addPatch(1);
    G.collection.cozy(4, 'A worry soothed', pos.clone().setY(pos.y + 1.4));
    const left = t.done.filter((d) => !d).length;
    G.events.emit('worry', { id, left });
    const who = w.who && G.npcs.get(w.who);
    const after = async () => {
      await new Promise((r) => setTimeout(r, 3200));
      if (G.zone !== this.zone) return;
      if (who && !who.hidden && w.thanks) {
        SPEAKERS[w.who] ||= [BY[w.who] || w.who, '#6a7fa0'];
        await chat([[w.who, w.thanks]]);
      }
      if (!left) this.newDay(true);
      else G.ui.toast(`📌 ${left} of today’s worries left on the board.`, 3);
    };
    after();
    writeSave(s);
  }

  // The next day: what is left of today's goes (it will keep), and tomorrow's are pinned up.
  newDay(allDone = false) {
    const s = G.save;
    for (const [id, { g }] of this.live) {
      for (const x of g) x.dispose();
      this.zone.stitch?.remove('worry_' + id);
    }
    this.live.clear();
    if (this.zone.fishing) this.zone.fishing.want = null;
    s.day = (s.day || 1) + 1;
    today();
    writeSave(s);
    this.spawn();
    G.audio.play('chime');
    G.ui.toast(allDone ? `🌙 All three of today’s worries are soothed. Tomorrow’s are on the board already: <b>day ${s.day}</b>.` : `☀️ A new day in Lantern Bay: <b>day ${s.day}</b>. New worries are on the board.`, 5);
    G.events.emit('day', s.day);
  }

  // ---------------------------------------------------------------- the board
  // A board to read the day's worries from: an interactable at pos (and, with prop, a little board to stand
  // there: two posts, a plank and three notes).
  board(pos, facing = 0, prop = true) {
    const z = this.zone;
    if (prop) {
      const g = new Group();
      const wood = materialFor('wood', { color: '#8a5a3c', vertexColors: false, key: 'wb-wood' }),
        plank = materialFor('wood', { color: '#c9a26a', vertexColors: false, key: 'wb-plank' });
      const add = (geo, mat, x, y, zz, rz = 0) => {
        const m = new Mesh(geo, mat);
        m.position.set(x, y, zz);
        m.rotation.z = rz;
        m.castShadow = true;
        g.add(m);
      };
      for (const s of [-1, 1]) add(new BoxGeometry(0.1, 1.9, 0.1), wood, s * 0.75, 0.95, 0);
      add(new BoxGeometry(1.7, 1.0, 0.06), plank, 0, 1.3, 0);
      add(new BoxGeometry(1.9, 0.1, 0.22), wood, 0, 1.86, 0); // a little roof
      ['#fff8dc', '#fdf1e0', '#ffe9c4'].forEach((c, i) => add(new BoxGeometry(0.4, 0.5, 0.012), materialFor('paper', { color: c, vertexColors: false, key: 'wb-note' + i }), (i - 1) * 0.5, 1.3 + (i % 2) * 0.06, 0.04, (i - 1) * 0.06));
      g.position.copy(pos);
      g.rotation.y = facing;
      g.name = 'worryboard';
      z.group.add(g);
      z.collision.addBox(pos.clone().setY(pos.y + 0.95), new Vector3(1.7, 1.9, 0.3), facing);
      z.collision.build();
    }
    const at = pos.clone().add(new Vector3(Math.sin(facing) * 0.9, 0, Math.cos(facing) * 0.9));
    z.addInteractable({ position: at, radius: 2.3, priority: 0.8, label: 'Read the worry board', action: () => this.read() });
    return at;
  }

  read() {
    if (this.el) return;
    const t = today();
    const el = (this.el = document.createElement('div'));
    el.className = 'cook panel show wboard';
    el.setAttribute('role', 'dialog');
    const notes = t.ids.map((id, i) => {
      const w = byId(id);
      const by = w.by || BY[w.who] || SPEAKERS[w.who]?.[0] || '';
      return `<div class="wnote${t.done[i] ? ' done' : ''}"><span class="ico">${ICON[w.species] || '❓'}</span><div><b>${PLACE[w.zone].replace(/^t/, 'T')} · ${SPECIES[w.species]?.name || 'a Grumbling'}</b><p>${w.note}</p>${by && !w.note.includes('— ') ? `<small>— ${by}</small>` : ''}</div>${t.done[i] ? '<span class="tick">✔</span>' : ''}</div>`;
    });
    el.innerHTML = `<h3>📌 The worry board · day ${t.day}</h3><div>${notes.join('')}</div>
      <div class="foot"><div class="small">When all three are soothed, tomorrow’s are pinned up. Or sleep on it, at the dormitory door.</div><button class="btn">Close</button></div>`;
    G.ui.root.append(el);
    G.frozen = true;
    G.audio.play('open');
    G.events.emit('board', t);
    let first = true;
    const close = () => {
      G.updaters.delete(tick);
      el.remove();
      this.el = null;
      G.frozen = false;
      G.audio.play('close');
    };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('button').addEventListener('click', close);
    const tick = () => {
      const i = G.input;
      const press = i.consume('interact') || i.consume('back') || i.consume('jump');
      i.consume('confirm');
      if (!first && press) close();
      first = false;
    };
    G.updaters.add(tick);
  }
}
