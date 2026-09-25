// SPDX-License-Identifier: GPL-3.0-only
// Gradient sky dome, drifting cloud cards and layered karst-peak silhouettes (env_2 / env_8 refs).
// Everything is generated here: no textures are downloaded.
import {
  BackSide, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Points,
  ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector3,
} from 'three';
import { shared } from './materials.js';

export function createSky(opts = {}) {
  const o = {
    top: '#6fa7d8', horizon: '#dcebf2', ground: '#9fb7a8', sun: new Vector3(0.4, 0.5, -0.6), sunColor: '#fff2d6',
    clouds: 10, cloudColor: '#ffffff', cloudShade: '#c8d4e3', peaks: true, peakColor: '#7f9bb0', skyline: null, radius: 380,
    ...opts,
  };
  const g = new Group();
  g.name = 'sky';
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color(o.top) },
      horizon: { value: new Color(o.horizon) },
      ground: { value: new Color(o.ground) },
      sunDir: { value: o.sun.clone().normalize() },
      sunColor: { value: new Color(o.sunColor) },
      moon: { value: o.moon ? 1 : 0 }, // night: a crisp moon disc instead of the sun's glare
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, horizon, ground, sunDir, sunColor; uniform float moon; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(horizon, ground, smoothstep(0.0, 0.25, -h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (moon * smoothstep(0.9993, 0.9996, s) + pow(s, 600.0) * (1.2 - moon * 0.8) + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(o.radius, 24, 12), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  g.add(dome);
  g.userData.skyMaterial = mat;

  if (o.peaks) {
    g.add(peakRing(o.radius * 0.86, 0.9, o.peakColor, o.horizon, 11, 0.55));
    g.add(peakRing(o.radius * 0.72, 1.25, o.peakColor, o.horizon, 23, 0.3));
  }
  if (o.skyline) g.add(skyline(o.radius * 0.7, o.skyline, o.peakColor, o.horizon));
  if (o.stars) g.add(stars(o.radius * 0.94, o.stars));

  if (o.clouds) {
    const tex = cloudTexture(o.cloudColor, o.cloudShade);
    const clouds = new Group();
    for (let i = 0; i < o.clouds; i++) {
      const sm = new SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, opacity: 0.95 });
      const s = new Sprite(sm);
      const a = (i / o.clouds) * Math.PI * 2 + Math.random() * 0.4;
      const r = o.radius * (0.6 + Math.random() * 0.25);
      s.position.set(Math.cos(a) * r, 55 + Math.random() * 70, Math.sin(a) * r);
      const w = 90 + Math.random() * 90;
      s.scale.set(w, w * 0.45, 1);
      s.renderOrder = -9;
      s.userData.speed = 0.004 + Math.random() * 0.004;
      s.userData.a = a;
      s.userData.r = r;
      clouds.add(s);
    }
    g.add(clouds);
    g.userData.clouds = clouds;
  }
  g.userData.update = (dt, camPos) => {
    g.position.set(camPos.x, 0, camPos.z);
    const c = g.userData.clouds;
    if (c)
      for (const s of c.children) {
        s.userData.a += s.userData.speed * dt;
        s.position.x = Math.cos(s.userData.a) * s.userData.r;
        s.position.z = Math.sin(s.userData.a) * s.userData.r;
      }
  };
  return g;
}

// Night sky: twinkling points on the upper hemisphere (one draw call).
function stars(radius, count) {
  const rnd = mulberry(17);
  const pos = [];
  const size = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.08 + Math.pow(rnd(), 0.7) * 0.92;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius);
    size.push(1 + rnd() * rnd() * 3.5);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('size', new Float32BufferAttribute(size, 1));
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: shared.uTime },
    vertexShader: `attribute float size; uniform float uTime; varying float vA;
      void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww;
        float tw = 0.65 + 0.35 * sin(uTime * (1.3 + size) + position.x * 0.37);
        vA = tw * smoothstep(0.0, 0.25, position.y / ${radius.toFixed(1)}); gl_PointSize = size * 1.6; }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = max(0.0, 1.0 - length(d) * 2.0);
      gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), a * a * vA); }`,
  });
  const p = new Points(geo, mat);
  p.renderOrder = -9;
  p.frustumCulled = false;
  return p;
}

// A closed ring of limestone towers: steep rounded pillars with green caps, hazed toward the horizon.
function peakRing(radius, heightScale, color, haze, seed, hazeAmt) {
  const rnd = mulberry(seed);
  const N = 220;
  const pos = [];
  const col = [];
  const base = new Color(color).lerp(new Color(haze), hazeAmt);
  const cap = new Color('#5f8a6a').lerp(new Color(haze), hazeAmt + 0.15);
  const foot = new Color(haze);
  // height profile: sum of narrow bumps (towers)
  const towers = [];
  for (let i = 0; i < 26; i++) towers.push({ a: rnd() * Math.PI * 2, w: 0.03 + rnd() * 0.07, h: (25 + rnd() * 55) * heightScale });
  const H = (a) => {
    let h = 6 + 4 * Math.sin(a * 5 + seed);
    for (const t of towers) {
      let d = Math.abs(a - t.a);
      d = Math.min(d, Math.PI * 2 - d);
      const k = Math.max(0, 1 - Math.pow(d / t.w, 2.5));
      h = Math.max(h, t.h * Math.pow(k, 0.35));
    }
    return h;
  };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const h0 = H(a0),
      h1 = H(a1);
    const p = (a, h) => [Math.cos(a) * radius, h, Math.sin(a) * radius];
    const v = [p(a0, -5), p(a1, -5), p(a1, h1), p(a0, -5), p(a1, h1), p(a0, h0)];
    for (const q of v) {
      pos.push(...q);
      const t = Math.max(0, q[1]) / 80;
      const c = q[1] < 0 ? foot : base.clone().lerp(cap, Math.min(1, t * 1.2) * 0.6);
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const m = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, fog: false, side: 2 }));
  m.renderOrder = -8;
  m.frustumCulled = false;
  return m;
}

// Distant modern towers across the bay (env_7): a sector of hazy boxes.
function skyline(radius, { from = -0.6, to = 0.3 } = {}, color, haze) {
  const rnd = mulberry(7);
  const pos = [];
  const col = [];
  const c = new Color(color).lerp(new Color(haze), 0.68);
  for (let i = 0; i < 40; i++) {
    const a = from + (to - from) * rnd();
    const w = 5 + rnd() * 9;
    const h = 8 + Math.pow(rnd(), 2.5) * 42;
    const cx = Math.cos(a) * radius,
      cz = Math.sin(a) * radius;
    const tx = -Math.sin(a) * w,
      tz = Math.cos(a) * w;
    const q = [
      [cx - tx, -2, cz - tz], [cx + tx, -2, cz + tz], [cx + tx, h, cz + tz],
      [cx - tx, -2, cz - tz], [cx + tx, h, cz + tz], [cx - tx, h, cz - tz],
    ];
    const shade = 0.9 + rnd() * 0.15;
    for (const v of q) {
      pos.push(...v);
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const m = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, fog: false, side: 2 }));
  m.renderOrder = -8;
  m.frustumCulled = false;
  return m;
}

function cloudTexture(light, shade) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  const rnd = mulberry(3);
  const puffs = [];
  for (let i = 0; i < 14; i++) puffs.push([40 + rnd() * 176, 58 + rnd() * 34 - (i % 3) * 8, 18 + rnd() * 26]);
  for (const [px, py, r] of puffs) {
    const gr = x.createRadialGradient(px, py + r * 0.4, r * 0.2, px, py, r);
    gr.addColorStop(0, shade);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(px, py + 6, r, 0, Math.PI * 2);
    x.fill();
  }
  for (const [px, py, r] of puffs) {
    const gr = x.createRadialGradient(px, py - r * 0.3, r * 0.1, px, py, r);
    gr.addColorStop(0, light);
    gr.addColorStop(0.7, light);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(px, py, r * 0.9, 0, Math.PI * 2);
    x.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
