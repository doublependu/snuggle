// SPDX-License-Identifier: GPL-3.0-only
// The Everyone Blanket (Chapter 5): Pip's Domain of Comfort, "an enormous patchwork quilt stitched from
// glowing thread, big enough to wrap the whole Great Sulk and everyone in it". Made in code, in the cloth
// material the game already has (its stitched grid is the game's signature look). Every patch takes its
// colour from something in the player's own save: a Charm Sprite, a restored memory, a neighbour checked on,
// a kind act, a lemon candy. It is sewn patch by patch, spread out in the air over the kitchen, and then it
// settles over the Great Sulk's shape. After the story it hangs over the square, and goes on growing.
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Mesh, Vector3 } from 'three';
import { G } from '../game.js';
import { materialFor } from '../render/materials.js';
import { SPECIES } from '../content/species.js';

const FILL = ['#e2a13a', '#f3e6d3', '#e0662c', '#2f8a8f', '#f6c56a', '#d9c9b0'];
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const _p = new Vector3(),
  _q = new Vector3(),
  _t = new Vector3();

// The colours of the player's own patches, most telling first: [colour, how many].
export function patchColours(save = G.save) {
  const f = save.story;
  const out = [];
  for (const [id, n] of Object.entries(save.sprites)) if (SPECIES[id]) out.push([SPECIES[id].glow, Math.min(12, n) * 3]);
  const count = (keys) => keys.filter((k) => f[k]).length;
  out.push(['#ffd27a', count(['mem_notice', 'mem_post', 'mem_sweets', 'mem_teahouse', 'mem_thread', 'mem_kitchen']) * 4]); // memories
  out.push(['#7fc4b8', count(['kind_barber', 'kind_noodle', 'kind_oldman']) * 5]); // neighbours
  out.push(['#ff9a7a', Object.keys(f).filter((k) => /^kind_|^kid\dHome$|^note_/.test(k) && f[k]).length * 3]); // kind acts
  out.push(['#ffe27a', Object.keys(save.candies).length * 2]); // lemon candies
  out.push(['#ffd98a', Object.keys(f).filter((k) => k.startsWith('stitch_') && f[k]).length * 3]); // stitches
  out.push(['#bfe0ff', (save.patches || 0) * 1]); // free-roam Lantern Bay: worries soothed, lost things returned
  return out;
}

// A patch more for the Everyone Blanket: free-roam Lantern Bay earns them (worries soothed, lost things given
// back, reminders sent home, new entries in either book), and the canopy over the square grows with them.
export function addPatch(n = 1) {
  G.save.patches = (G.save.patches || 0) + n;
  G.events.emit('patch', G.save.patches);
}

export class Quilt {
  // n: patches a side. size: metres a side, spread flat. flat: where it is spread out (its centre, in the air).
  constructor(zone, { n = 28, size = 17, flat = new Vector3(), seed = 7 } = {}) {
    this.zone = zone;
    this.n = n;
    this.size = size;
    this.flat = flat.clone();
    const N = n * n;
    this.count = N;
    const pos = new Float32Array(N * 4 * 3);
    const col = new Float32Array(N * 4 * 3);
    const nor = new Float32Array(N * 4 * 3);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 4;
      idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    }
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    const g = (this.geo = new BufferGeometry());
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('normal', new BufferAttribute(nor, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setIndex(idx);
    this.pos = pos;
    this.nor = nor;
    this.mesh = new Mesh(g, materialFor('cloth', { side: 'double', key: 'quilt' }));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'quilt';
    zone.group.add(this.mesh);
    // each patch's colour: the save's own, dealt round the quilt, cream and mustard in between
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const mine = [];
    for (const [c, k] of patchColours()) for (let i = 0; i < k; i++) mine.push(c);
    const order = Array.from({ length: N }, (_, i) => i).sort(() => rnd() - 0.5);
    const c = new Color();
    order.forEach((slot, k) => {
      c.set(k < mine.length ? mine[k] : FILL[(rnd() * FILL.length) | 0]);
      if (k >= mine.length) c.multiplyScalar(0.92 + rnd() * 0.12);
      for (let v = 0; v < 4; v++) col.set([c.r, c.g, c.b], (slot * 4 + v) * 3);
    });
    this.mine = Math.min(N, mine.length);
    // the order the patches are sewn in: outward from the middle, a little ragged
    this.sewn = 0; // 0..1: how much of it is sewn
    this.rank = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i % n) / (n - 1) - 0.5,
        z = Math.floor(i / n) / (n - 1) - 0.5;
      this.rank[i] = Math.min(0.999, Math.hypot(x, z) / 0.72 + rnd() * 0.08);
    }
    this.from = new Vector3(); // where new patches fly from (her hands)
    this.sag = 0; // metres the middle hangs below the edges (the canopy over the square)
    this.drape = 0; // 0 spread flat .. 1 settled over what it covers
    this.cover = null; // (x, z, out) => where that point of the spread quilt comes to rest
    this.t = 0;
    this.still = false; // true: no billow (it hangs over the square after the story)
    this.done = false; // nothing left to move
  }

  // Sew more of it (k: 0..1 of the whole), the new patches flying in from `from`.
  sew(k, from) {
    this.sewn = Math.max(this.sewn, k);
    if (from) this.from.copy(from);
    this.done = false;
  }
  // Let it settle: place(x, z, out) says where the point (x, z) of the spread quilt (measured from its middle)
  // comes to rest. Laid over a dome by its arc length, the patches keep their shape instead of stretching
  // down the sides.
  settle(place) {
    this.cover = place;
    this.done = false;
  }

  update(dt) {
    if (this.done) return;
    if (!this.still) this.t += dt;
    const { n, size, pos, flat } = this;
    const p = _p,
      q = _q;
    const wave = this.still ? 0 : 1;
    // corner (ix, iz) of the sheet: flat in the air (with a slow billow), or settled over the cover
    const corner = (ix, iz, out) => {
      const x = (ix / n - 0.5) * size,
        z = (iz / n - 0.5) * size;
      out.set(flat.x + x, flat.y + (Math.sin(x * 0.5 + this.t * 1.3) * 0.18 + Math.cos(z * 0.6 + this.t * 1.1) * 0.14) * wave - this.sag * (1 - (x * x + z * z) / (size * size * 0.5)), flat.z + z);
      if (this.drape > 0 && this.cover) {
        // the middle settles first, the edges trail after it
        const k = ease(this.drape * 1.6 - (Math.hypot(x, z) / size) * 0.6);
        this.cover(x, z, _t);
        out.set(out.x + (_t.x - out.x) * ease(this.drape * 1.25), out.y + (_t.y - out.y) * k, out.z + (_t.z - out.z) * ease(this.drape * 1.25));
      }
      return out;
    };
    let moving = false;
    for (let i = 0; i < this.count; i++) {
      const ix = i % n,
        iz = Math.floor(i / n);
      // how far this patch has flown from her hands to its place (it is sewn once `sewn` passes its rank)
      const a = this.fly ? Math.min(1, (this.fly[i] += this.sewn > this.rank[i] ? dt * 1.4 : 0)) : this.sewn > this.rank[i] ? 1 : 0;
      if (a > 0 && a < 1) moving = true;
      const k = ease(a);
      for (let v = 0; v < 4; v++) {
        corner(ix + (v === 1 || v === 2 ? 1 : 0), iz + (v >= 2 ? 1 : 0), p);
        if (k < 1) {
          q.copy(this.from);
          q.y += Math.sin(k * Math.PI) * 2.2; // an arc on the way
          p.lerpVectors(q, p, k);
          if (k <= 0) p.copy(this.from);
        }
        pos.set([p.x, p.y, p.z], (i * 4 + v) * 3);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    // once it has settled (or hangs still) there is nothing more to move
    this.done = !moving && (this.still || (this.cover && this.drape >= 1));
  }

  // Start with nothing sewn, patches flying in as sew() moves on.
  begin(from) {
    this.fly = new Float32Array(this.count);
    this.from.copy(from);
    this.sewn = 0;
    this.done = false;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
  }
}
