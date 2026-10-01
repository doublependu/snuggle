// SPDX-License-Identifier: GPL-3.0-only
// Signs: a name board for every building and place, and fingerposts where the paths fork. All of a zone's
// texts are drawn into one canvas (nothing is downloaded) and all its boards and posts are one mesh, so a
// zone's signs are a single draw call. A sign marked `place` also names the place on screen as she walks up
// to it: letters on a board are small on a phone (greet: also when she starts beside it).
//   { kind: 'board', text, icon, at, facing, w }       a board on a wall (at: its centre)
//   { kind: 'post',  text, icon, at, facing, w }       a board on a post (at: the foot of the post)
//   { kind: 'finger', at, arms: [{ text, toward }] }   a fingerpost (toward: a point along the way there)
// facing: the way the board looks (radians, 0 = +z). dim: () => true draws it faded (the Quiet District's
// forgotten shops); z.signs.redraw() repaints after that changes.
import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three';
import { G } from '../game.js';

const CW = 512,
  CH = 128; // one label's cell in the canvas: boards are 4 : 1
const STYLES = {
  board: { bg: '#2f5f5a', rim: '#d9b25a', ink: '#fbeecb' },
  arm: { bg: '#b98a5a', rim: '#8a6240', ink: '#33241a' },
  dim: { bg: '#807b74', rim: '#9a958d', ink: '#c9c4bb' },
};

export function addSigns(z, list) {
  // ---- the labels: one cell per distinct text and style; the last cell is plain wood for the posts
  const labels = [];
  const label = (text, icon, style, dim) => {
    let l = labels.find((x) => x.text === text && x.style === style && x.dim === dim);
    if (!l) labels.push((l = { text, icon, style, dim, i: labels.length }));
    return l;
  };
  for (const s of list) {
    if (s.kind === 'finger') for (const a of s.arms) a.label = label(a.text, '', 'arm', null);
    else s.label = label(s.text, s.icon || '', 'board', s.dim || null);
  }
  const wood = { i: labels.length };
  const rows = Math.ceil((labels.length + 1) / 2);
  const res = G.quality.name === 'low' ? 0.5 : 1; // half the pixels on the low tier
  const canvas = document.createElement('canvas');
  canvas.width = CW * 2 * res;
  canvas.height = CH * rows * res;
  const x = canvas.getContext('2d');
  const cell = (i) => [(i % 2) * CW, Math.floor(i / 2) * CH];
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    x.setTransform(res, 0, 0, res, 0, 0);
    for (const l of labels) {
      const [cx, cy] = cell(l.i);
      const st = STYLES[l.dim?.() ? 'dim' : l.style];
      x.fillStyle = st.rim;
      x.fillRect(cx, cy, CW, CH);
      x.fillStyle = st.bg;
      x.fillRect(cx + 10, cy + 10, CW - 20, CH - 20);
      x.fillStyle = st.ink;
      x.textBaseline = 'middle';
      x.textAlign = 'left';
      // the picture gets a box of its own: emoji are often wider than they measure, and would cover the first letter
      let px = 66,
        iw,
        tw;
      do {
        x.font = `bold ${px}px system-ui, "Segoe UI", sans-serif`;
        iw = l.icon ? px * 1.4 : 0;
        tw = x.measureText(l.text).width;
      } while (iw + tw > CW - 56 && (px -= 4) > 20);
      const x0 = cx + (CW - iw - tw) / 2;
      if (l.icon) x.fillText(l.icon, x0, cy + CH / 2 + 3);
      x.fillText(l.text, x0 + iw, cy + CH / 2 + 3);
    }
    const [wx, wy] = cell(wood.i);
    x.fillStyle = '#6b4a33';
    x.fillRect(wx, wy, CW, CH);
    tex.needsUpdate = true;
  };
  draw();

  // ---- the geometry: every board, arm and post in one mesh
  const pos = [],
    uv = [];
  const W = CW * 2,
    H = CH * rows;
  const rect = (l) => {
    const [cx, cy] = cell(l.i);
    return [cx / W, 1 - (cy + CH) / H, (cx + CW) / W, 1 - cy / H]; // u0, v0, u1, v1
  };
  const flat = (l) => {
    const [u0, v0, u1, v1] = rect(l);
    const u = u0 + (u1 - u0) * 0.03,
      v = v0 + (v1 - v0) * 0.12; // inside the rim: one plain colour
    return [u, v, u, v];
  };
  const up = new Vector3(0, 1, 0);
  // a quad seen from the side its normal points to: c centre, r its right (for that viewer), w x h
  const quad = (c, r, w, h, [u0, v0, u1, v1]) => {
    const a = c.clone().addScaledVector(r, -w / 2).addScaledVector(up, -h / 2),
      b = c.clone().addScaledVector(r, w / 2).addScaledVector(up, -h / 2),
      cc = c.clone().addScaledVector(r, w / 2).addScaledVector(up, h / 2),
      d = c.clone().addScaledVector(r, -w / 2).addScaledVector(up, h / 2);
    for (const p of [a, b, cc, a, cc, d]) pos.push(p.x, p.y, p.z);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  const tri = (a, b, c, [u, v]) => {
    for (const p of [a, b, c]) pos.push(p.x, p.y, p.z);
    uv.push(u, v, u, v, u, v);
  };
  // a board with a face on both sides: the label in front, `back` (a label or plain) behind
  const board = (c, n, w, h, front, back) => {
    const r = new Vector3().crossVectors(up, n); // the right of someone looking at the front
    quad(c.clone().addScaledVector(n, 0.012), r, w, h, front);
    quad(c.clone().addScaledVector(n, -0.012), r.clone().negate(), w, h, back);
  };
  const post = (foot, h) => {
    const t = 0.045;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = new Vector3(nx, 0, nz);
      quad(foot.clone().setY(foot.y + h / 2).addScaledVector(n, t), new Vector3().crossVectors(up, n), t * 2, h, flat(wood));
    }
  };
  const ground = (p) => p.clone().setY(z.collision.groundY(p.x, p.z, 60) ?? p.y);
  const places = [];
  for (const s of list) {
    if (s.kind === 'finger') {
      const foot = ground(s.at);
      post(foot, 2.35);
      s.arms.forEach((a, i) => {
        const dir = new Vector3(a.toward.x - foot.x, 0, a.toward.z - foot.z).normalize();
        const n = new Vector3().crossVectors(dir, up); // one face; the other looks the opposite way
        const w = 1.24,
          h = w / 4;
        const c = foot.clone().addScaledVector(dir, 0.1 + w / 2).setY(foot.y + 2.12 - i * (h + 0.05));
        board(c, n, w, h, rect(a.label), rect(a.label));
        // the pointed end
        const e = c.clone().addScaledVector(dir, w / 2),
          tip = e.clone().addScaledVector(dir, 0.2);
        const top = e.clone().setY(e.y + h / 2),
          bot = e.clone().setY(e.y - h / 2);
        const f = flat(a.label);
        tri(top.clone().addScaledVector(n, 0.012), bot.clone().addScaledVector(n, 0.012), tip, f);
        tri(bot.clone().addScaledVector(n, -0.012), top.clone().addScaledVector(n, -0.012), tip, f);
      });
      continue;
    }
    const n = new Vector3(Math.sin(s.facing), 0, Math.cos(s.facing));
    const w = s.w || (s.kind === 'post' ? 1.5 : 1.8),
      h = w / 4;
    if (s.kind === 'post') {
      const foot = ground(s.at);
      post(foot.clone().addScaledVector(n, -0.06), 1.7);
      board(foot.clone().setY(foot.y + 1.72), n, w, h, rect(s.label), flat(wood));
      if (s.place !== false) places.push({ name: (s.icon ? s.icon + ' ' : '') + s.text, at: foot, r: s.range || 9 });
    } else {
      board(s.at, n, w, h, rect(s.label), flat(wood));
      if (s.place) places.push({ name: (s.icon ? s.icon + ' ' : '') + s.text, at: s.at.clone(), r: s.range || 9, greet: s.greet });
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex }));
  mesh.name = 'signs';
  mesh.matrixAutoUpdate = false;
  z.group.add(mesh);

  // ---- the place's name on screen as she arrives (once a minute per place at most)
  let t = 0,
    first = true;
  z.updaters.push((dt) => {
    if ((t -= dt) > 0) return;
    t = 0.3;
    if (G.frozen) return;
    const q = G.player.position;
    for (const p of places) {
      const inside = Math.hypot(q.x - p.at.x, q.z - p.at.z) < p.r && Math.abs(q.y - p.at.y) < 5;
      // not the places she starts next to (unless the place greets arrivals: the station's own board)
      if (first) p.seen = inside && !p.greet ? G.time : -99;
      if (inside && G.time - p.seen > 60) G.ui.toast(p.name, 2.5, 'place');
      if (inside) p.seen = G.time;
    }
    first = false;
  });
  z.signs = { list, places, mesh, labels, redraw: draw, tex };
  const dispose = z.onExit;
  z.onExit = () => {
    dispose?.();
    tex.dispose();
    mesh.material.dispose();
  };
  return z.signs;
}
