// Cheap effects shared by every zone: the Lullaby Thread ribbon, sparkles, rain streaks and glow billboards.
// All buffers are preallocated; nothing is allocated per frame.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, LineSegments, Mesh, Points, ShaderMaterial, Vector3,
} from 'three';
import { shared } from './materials.js';

const _a = new Vector3(),
  _b = new Vector3(),
  _t = new Vector3(),
  _v = new Vector3();

// ---------------------------------------------------------------- Lullaby Thread
export class Ribbon {
  constructor(max = 96, width = 0.04, color = '#ffb35c') {
    this.max = max;
    this.width = width;
    const g = new BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    const uv = new Float32Array(max * 2 * 2);
    const idx = [];
    for (let i = 0; i < max; i++) {
      uv.set([i / (max - 1), 0, i / (max - 1), 1], i * 4);
      if (i < max - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: 2,
      uniforms: { uTime: shared.uTime, color: { value: new Color(color) }, opacity: { value: 1 }, len: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime, opacity, len; uniform vec3 color; varying vec2 vUv;
        void main(){ float side = abs(vUv.y - 0.5) * 2.0; float core = 1.0 - smoothstep(0.2, 1.0, side);
          float fib = 0.65 + 0.35 * sin(vUv.x * len * 90.0 - uTime * 7.0 + vUv.y * 6.0);
          float tip = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          gl_FragColor = vec4(color * (0.7 + 0.8 * core) * fib, core * opacity * tip); }`,
      toneMapped: false,
    });
    this.mesh = new Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }
  // points: array of Vector3 (count <= max); camera for billboarding
  set(points, camera, width = this.width) {
    const n = Math.min(points.length, this.max);
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    let length = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(n - 1, i + 1)];
      _t.subVectors(next, prev).normalize();
      _v.subVectors(camera.position, p).normalize();
      _a.crossVectors(_t, _v).normalize().multiplyScalar(width * 0.5);
      this.pos.set([p.x - _a.x, p.y - _a.y, p.z - _a.z, p.x + _a.x, p.y + _a.y, p.z + _a.z], i * 6);
      if (i) length += p.distanceTo(points[i - 1]);
    }
    this.mat.uniforms.len.value = length;
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
    this.mesh.visible = true;
  }
  hide() {
    this.mesh.visible = false;
  }
}

// ---------------------------------------------------------------- sparkles
export class Sparkles {
  constructor(max = 400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max);
    this.cursor = 0;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('size', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    this.points = new Points(g, pointMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.scale = 1;
  }
  emit(p, n, color = '#ffd27a', { speed = 1, up = 1, size = 0.12, life = 1.2, spread = 0.2, gravity = 0 } = {}) {
    const c = typeof color === 'string' ? new Color(color) : color;
    n = Math.max(1, Math.round(n * this.scale));
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      this.vel[i * 3] = Math.cos(a) * r;
      this.vel[i * 3 + 1] = up * (0.3 + Math.random()) - gravity * 0;
      this.vel[i * 3 + 2] = Math.sin(a) * r;
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.base[i] = size * (0.6 + Math.random() * 0.8);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3] *= 0.97;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * 0.97 - 0.3 * dt;
      this.vel[i * 3 + 2] *= 0.97;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.base[i] * Math.sin(k * Math.PI) * (0.75 + 0.25 * Math.sin(i + k * 30));
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.color.needsUpdate = true;
  }
}

function pointMaterial(opacity = 1) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms: { opacity: { value: opacity }, scale: { value: 600 } },
    vertexShader: `attribute float size; varying vec3 vColor; uniform float scale;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor; uniform float opacity;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float a = pow(1.0 - r, 1.8); float star = max(0.0, 1.0 - abs(d.x * d.y) * 60.0) * (1.0 - r);
        gl_FragColor = vec4(vColor * (a + star * 0.6), (a + star * 0.4) * opacity); }`,
    toneMapped: false,
  });
}

// ---------------------------------------------------------------- glow billboards (lanterns, sprite halos)
export class Glows {
  constructor(max = 256) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('size', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    const m = pointMaterial(0.55);
    m.fragmentShader = `varying vec3 vColor; uniform float opacity;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float a = pow(1.0 - r, 2.2); gl_FragColor = vec4(vColor * a, a * opacity); }`;
    this.points = new Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }
  add(p, color = '#ffb35c', size = 1) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.set(i, p, color, size);
    this.points.geometry.setDrawRange(0, this.n);
    return i;
  }
  set(i, p, color, size) {
    this.pos.set([p.x, p.y, p.z], i * 3);
    if (color) {
      const c = typeof color === 'string' ? new Color(color) : color;
      this.col.set([c.r, c.g, c.b], i * 3);
    }
    if (size !== undefined) this.size[i] = size;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
  }
  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

// ---------------------------------------------------------------- rain (shader-animated streaks)
export class Rain {
  // size: box extents; follow: a Vector3 the box is centred on (camera or a cloud)
  constructor({ count = 600, size = new Vector3(30, 14, 30), speed = 11, length = 0.45, color = '#cfe3f0', opacity = 0.35, wrap = true } = {}) {
    const pos = new Float32Array(count * 2 * 3);
    const top = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size.x,
        y = Math.random() * size.y,
        z = Math.random() * size.z;
      pos.set([x, y, z, x, y, z], i * 6);
      top[i * 2 + 1] = 1;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aTop', new BufferAttribute(top, 1));
    this.center = new Vector3();
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: shared.uTime, uCenter: { value: this.center }, uSize: { value: size.clone() }, uSpeed: { value: speed },
        uLen: { value: length }, color: { value: new Color(color) }, opacity: { value: opacity }, uWrap: { value: wrap ? 1 : 0 },
      },
      vertexShader: `attribute float aTop; uniform float uTime, uSpeed, uLen, uWrap; uniform vec3 uCenter, uSize; varying float vA;
        void main(){ vec3 p = position;
          p.y = mod(p.y - uTime * uSpeed, uSize.y);
          vec3 w = uCenter - uSize * vec3(0.5, 0.0, 0.5);
          if (uWrap > 0.5) { w.xz = uCenter.xz + mod(p.xz - uCenter.xz, uSize.xz) - uSize.xz * 0.5; w.y += p.y - uSize.y * 0.5; }
          else { w += p; w.y = uCenter.y - (uSize.y - p.y); }
          w.y += aTop * uLen; w.x += aTop * uLen * 0.12;
          vA = 1.0 - aTop * 0.8;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(color, opacity * vA); }`,
    });
    this.mesh = new LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
}
