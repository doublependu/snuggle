// SPDX-License-Identifier: GPL-3.0-only
// Static world collision: every COL_* mesh (and procedural boxes) merged into one BVH.
// Capsule-vs-triangle push-out follows the three-mesh-bvh character controller example.
import { Box3, BufferAttribute, BufferGeometry, Line3, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const _box = new Box3();
const _seg = new Line3();
const _tri = new Vector3();
const _cap = new Vector3();
const _dir = new Vector3();
const _ray = new Ray();
const _m = new Matrix4();

export class Collision {
  constructor() {
    this.parts = [];
    this.bvh = null;
    this.walkableY = 0.55; // normal.y above this counts as ground
  }

  // Copy world-space positions (de-quantized) of a mesh into the collision soup.
  addMesh(mesh) {
    mesh.updateWorldMatrix(true, false);
    const src = mesh.geometry;
    const pa = src.attributes.position;
    const pos = new Float32Array(pa.count * 3);
    const v = new Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    }
    let index;
    if (src.index) index = Array.from(src.index.array);
    else index = Array.from({ length: pa.count }, (_, i) => i);
    this.parts.push({ pos, index });
  }

  // Instanced collider: same geometry at many transforms.
  addInstanced(geometry, matrices) {
    const pa = geometry.attributes.position;
    for (const mat of matrices) {
      const pos = new Float32Array(pa.count * 3);
      const v = new Vector3();
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(mat);
        pos.set([v.x, v.y, v.z], i * 3);
      }
      const index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: pa.count }, (_, i) => i);
      this.parts.push({ pos, index });
    }
  }

  // Axis-aligned-in-local box (rotY radians) for procedural props like tree trunks and benches.
  addBox(center, size, rotY = 0) {
    const hx = size.x / 2,
      hy = size.y / 2,
      hz = size.z / 2;
    const c = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ];
    _m.makeRotationY(rotY).setPosition(center);
    const pos = new Float32Array(24);
    const v = new Vector3();
    c.forEach((p, i) => {
      v.set(p[0], p[1], p[2]).applyMatrix4(_m);
      pos.set([v.x, v.y, v.z], i * 3);
    });
    const index = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
    this.parts.push({ pos, index });
  }

  addCylinder(center, radius, height, segs = 8) {
    const pos = [];
    const index = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(center.x + Math.cos(a) * radius, center.y, center.z + Math.sin(a) * radius);
      pos.push(center.x + Math.cos(a) * radius, center.y + height, center.z + Math.sin(a) * radius);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2,
        b = ((i + 1) % segs) * 2;
      index.push(a, b, b + 1, a, b + 1, a + 1);
    }
    this.parts.push({ pos: new Float32Array(pos), index });
  }

  // Solid capped prism (lily pads, platforms). Returns the part so it can be removed later.
  addDisc(center, radius, thickness = 0.1, segs = 10) {
    const pos = [];
    const index = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(center.x + Math.cos(a) * radius, center.y - thickness, center.z + Math.sin(a) * radius);
      pos.push(center.x + Math.cos(a) * radius, center.y, center.z + Math.sin(a) * radius);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2,
        b = ((i + 1) % segs) * 2;
      index.push(a, b, b + 1, a, b + 1, a + 1);
      if (i > 0 && i < segs - 1) {
        index.push(1, b + 1, a + 1); // top fan
        index.push(0, a, b); // bottom fan
      }
    }
    const part = { pos: new Float32Array(pos), index };
    this.parts.push(part);
    return part;
  }

  build() {
    let n = 0,
      m = 0;
    for (const p of this.parts) {
      n += p.pos.length;
      m += p.index.length;
    }
    const pos = new Float32Array(n);
    const idx = new Uint32Array(m);
    let vo = 0,
      io = 0;
    for (const p of this.parts) {
      pos.set(p.pos, vo);
      const base = vo / 3;
      for (let i = 0; i < p.index.length; i++) idx[io + i] = p.index[i] + base;
      vo += p.pos.length;
      io += p.index.length;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(new BufferAttribute(idx, 1));
    this.geometry = g;
    this.bvh = new MeshBVH(g, { targetLeafSize: 8 });
    return this; // parts are kept so late additions (tree trunks) can rebuild
  }

  // Push a capsule (segment start/end world space, radius) out of the world. Mutates the segment.
  // Returns the up-facing contact count (ground) for the caller.
  collideCapsule(segment, radius) {
    if (!this.bvh) return false;
    let grounded = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      _box.makeEmpty();
      _box.expandByPoint(segment.start);
      _box.expandByPoint(segment.end);
      _box.min.addScalar(-radius);
      _box.max.addScalar(radius);
      _seg.copy(segment);
      this.bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(_seg, _tri, _cap);
          if (d < radius) {
            const depth = radius - d;
            _dir.subVectors(_cap, _tri);
            if (_dir.lengthSq() < 1e-10) tri.getNormal(_dir);
            _dir.normalize();
            if (_dir.y > this.walkableY) grounded = true;
            _seg.start.addScaledVector(_dir, depth);
            _seg.end.addScaledVector(_dir, depth);
            moved = true;
          }
        },
      });
      segment.copy(_seg);
      if (!moved) break;
    }
    return grounded;
  }

  // Distance to the first hit along a ray, or Infinity.
  raycast(origin, dir, far = 100) {
    if (!this.bvh) return Infinity;
    _ray.origin.copy(origin);
    _ray.direction.copy(dir);
    const hit = this.bvh.raycastFirst(_ray, 2); // DoubleSide
    return hit && hit.distance <= far ? hit.distance : Infinity;
  }

  // Ground height under a point (for placing props and NPCs), or null.
  groundY(x, z, fromY = 50) {
    const d = this.raycast(new Vector3(x, fromY, z), new Vector3(0, -1, 0), 200);
    return d === Infinity ? null : fromY - d;
  }

  hasLineOfSight(a, b) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    _dir.normalize();
    return this.raycast(a, _dir, len) >= len - 0.05;
  }
}
