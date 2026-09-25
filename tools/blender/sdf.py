# SPDX-License-Identifier: GPL-3.0-only
"""Sculpting in code with signed distance fields (ai/plan_1.md §3.1).

A Field is a dense numpy grid of signed distances (negative inside) over a box. Primitives are evaluated
only inside their own bounding box and blended in with a smooth union / subtraction, so a character is
a few dozen shapes that melt into one another (a sculpted neck, shoulder or hairline) instead of balls
pushed into each other. Displacement functions add puffs, grooves and folds. Field.mesh() turns the
zero level set into a quad mesh with OpenVDB (bundled with Blender); reduce() brings it down to a
triangle budget and keeps the dense surface's shading through custom normals.

Coordinates are Blender's: metres, Z up, the character faces -Y, +X is the character's left.
"""
import math
import numpy as np
import openvdb as vdb
import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------- maths


def smin(a, b, k):
    """Polynomial smooth minimum; k is the blend radius in metres (0 = hard union)."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def rot(rx=0.0, ry=0.0, rz=0.0):
    """3x3 rotation (degrees), applied X then Y then Z (Blender XYZ Euler)."""
    x, y, z = (math.radians(v) for v in (rx, ry, rz))
    Rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    Ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    Rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def axis_rot(axis, deg):
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    t = math.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * K @ K


def frame(d, up=(0, 0, 1)):
    """Orthonormal frame (x, y, z) with z along d."""
    z = np.asarray(d, float)
    z = z / np.linalg.norm(z)
    u = np.asarray(up, float)
    if abs(np.dot(u, z)) > 0.98:
        u = np.array([0.0, 1.0, 0.0]) if abs(z[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    x = np.cross(u, z)
    x /= np.linalg.norm(x)
    return x, np.cross(z, x), z


def catmull(points, n=24, closed=False):
    """Centripetal-ish Catmull-Rom through points, n samples per span; returns (N, 3)."""
    P = [np.asarray(p, float) for p in points]
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
    else:
        P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return np.array(out)


def lerp_list(vals, t):
    """Piecewise-linear interpolation of a list of values over t in [0, 1] (numpy t)."""
    vals = np.asarray(vals, float)
    x = np.linspace(0, 1, len(vals))
    return np.interp(t, x, vals)

# ---------------------------------------------------------------- primitives
# Each primitive has lo / hi (bounding box, metres) and d(X, Y, Z) -> signed distance arrays.


class Prim:
    lo = hi = None

    def d(self, X, Y, Z):
        raise NotImplementedError

    def local(self, X, Y, Z):
        """Coordinates in the primitive's frame (centre c, rotation R)."""
        x, y, z = X - self.c[0], Y - self.c[1], Z - self.c[2]
        if self.R is None:
            return x, y, z
        R = self.R  # world = R @ local  ->  local = R^T @ world
        return (R[0, 0] * x + R[1, 0] * y + R[2, 0] * z, R[0, 1] * x + R[1, 1] * y + R[2, 1] * z,
                R[0, 2] * x + R[1, 2] * y + R[2, 2] * z)


class Ellipsoid(Prim):
    def __init__(self, c, r, R=None):
        self.c, self.r = np.asarray(c, float), np.asarray(r, float)
        self.R = R if R is None else np.asarray(R, float)
        m = self.r.max()
        self.lo, self.hi = self.c - m, self.c + m

    def d(self, X, Y, Z):
        x, y, z = self.local(X, Y, Z)
        r = self.r
        k0 = np.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2)
        k1 = np.sqrt((x / r[0] ** 2) ** 2 + (y / r[1] ** 2) ** 2 + (z / r[2] ** 2) ** 2)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def Sphere(c, r):
    return Ellipsoid(c, (r, r, r))


class RoundCone(Prim):
    """Capsule from a (radius ra) to b (radius rb); exact round-cone distance."""

    def __init__(self, a, b, ra, rb=None):
        self.a, self.b = np.asarray(a, float), np.asarray(b, float)
        self.ra, self.rb = ra, ra if rb is None else rb
        m = max(self.ra, self.rb)
        self.lo = np.minimum(self.a, self.b) - m
        self.hi = np.maximum(self.a, self.b) + m

    def d(self, X, Y, Z):
        a, b, r1, r2 = self.a, self.b, self.ra, self.rb
        ba = b - a
        l2 = float(ba @ ba)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        px, py, pz = X - a[0], Y - a[1], Z - a[2]
        y = px * ba[0] + py * ba[1] + pz * ba[2]
        z = y - l2
        qx, qy, qz = px * l2 - ba[0] * y, py * l2 - ba[1] * y, pz * l2 - ba[2] * y
        x2 = qx * qx + qy * qy + qz * qz
        y2 = y * y * l2
        z2 = z * z * l2
        k = math.copysign(1.0, rr) * rr * rr * x2
        out = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
        m1 = np.sign(z) * a2 * z2 > k
        m2 = np.sign(y) * a2 * y2 < k
        out = np.where(m1, np.sqrt(x2 + z2) * il2 - r2, out)
        out = np.where(m2 & ~m1, np.sqrt(x2 + y2) * il2 - r1, out)
        return out


def Capsule(a, b, r):
    return RoundCone(a, b, r, r)


class Box(Prim):
    """Rounded box: half extents h, corner radius rad."""

    def __init__(self, c, h, rad=0.0, R=None):
        self.c, self.h = np.asarray(c, float), np.asarray(h, float)
        self.rad = rad
        self.R = R if R is None else np.asarray(R, float)
        m = np.linalg.norm(self.h) + rad
        self.lo, self.hi = self.c - m, self.c + m

    def d(self, X, Y, Z):
        x, y, z = self.local(X, Y, Z)
        h = self.h - self.rad
        qx, qy, qz = np.abs(x) - h[0], np.abs(y) - h[1], np.abs(z) - h[2]
        out = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2 + np.maximum(qz, 0) ** 2)
        return out + np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0) - self.rad


class Torus(Prim):
    """Ring of radius Rr (tube radius r) in the local XY plane; sx/sy squash the ring."""

    def __init__(self, c, Rr, r, R=None, sx=1.0, sy=1.0):
        self.c, self.Rr, self.r, self.sx, self.sy = np.asarray(c, float), Rr, r, sx, sy
        self.R = R if R is None else np.asarray(R, float)
        m = Rr * max(sx, sy) + r
        self.lo, self.hi = self.c - m, self.c + m

    def d(self, X, Y, Z):
        x, y, z = self.local(X, Y, Z)
        q = np.sqrt((x / self.sx) ** 2 + (y / self.sy) ** 2) - self.Rr
        return np.sqrt(q * q + z * z) - self.r


class Tube(Prim):
    """Tube along a polyline (N, 3) with per-point radius; flat < 1 squashes the cross-section along
    the per-point direction `flat_dir` (default: the tube's side, so locks of hair come out as ribbons)."""

    def __init__(self, pts, radii, flat=1.0, flat_dir=None):
        self.p = np.asarray(pts, float)
        n = len(self.p)
        self.r = np.asarray(radii, float) if np.ndim(radii) else np.full(n, float(radii))
        self.flat = np.asarray(flat, float) if np.ndim(flat) else np.full(n, float(flat))
        if flat_dir is None:
            flat_dir = np.zeros((n, 3))
        self.fd = np.asarray(flat_dir, float).reshape(-1, 3)
        if len(self.fd) == 1:
            self.fd = np.repeat(self.fd, n, axis=0)
        m = self.r.max()
        self.lo, self.hi = self.p.min(0) - m, self.p.max(0) + m

    def seg_box(self, i):
        m = max(self.r[i], self.r[i + 1])
        return np.minimum(self.p[i], self.p[i + 1]) - m, np.maximum(self.p[i], self.p[i + 1]) + m

    def seg_d(self, i, X, Y, Z):
        a, b = self.p[i], self.p[i + 1]
        ab = b - a
        L2 = float(ab @ ab)
        if L2 < 1e-12:
            return None
        px, py, pz = X - a[0], Y - a[1], Z - a[2]
        t = np.clip((px * ab[0] + py * ab[1] + pz * ab[2]) / L2, 0.0, 1.0)
        dx, dy, dz = px - ab[0] * t, py - ab[1] * t, pz - ab[2] * t
        r = self.r[i] + (self.r[i + 1] - self.r[i]) * t
        fd = self.fd[i]
        if np.any(fd) and min(self.flat[i], self.flat[i + 1]) < 1:
            f = self.flat[i] + (self.flat[i + 1] - self.flat[i]) * t
            fdn = fd - ab * (fd @ ab) / L2
            fdn = fdn / max(1e-9, np.linalg.norm(fdn))
            s = dx * fdn[0] + dy * fdn[1] + dz * fdn[2]
            # stretch the offset along fdn, so the tube is thinner (flat * r) in that direction
            g = s * (1.0 / np.maximum(f, 1e-3) - 1.0)
            dx, dy, dz = dx + fdn[0] * g, dy + fdn[1] * g, dz + fdn[2] * g
        return np.sqrt(dx * dx + dy * dy + dz * dz) - r

    def d(self, X, Y, Z):
        out = np.full(X.shape, 1e3, np.float32)
        for i in range(len(self.p) - 1):
            d = self.seg_d(i, X, Y, Z)
            if d is not None:
                out = np.minimum(out, d)
        return out

    def d_region(self, field, sl):
        """Distance over the field slice sl, evaluating each segment only inside its own box."""
        out = np.full(tuple(s.stop - s.start for s in sl), 1e3, np.float32)
        for i in range(len(self.p) - 1):
            lo, hi = self.seg_box(i)
            ss = field._slices(lo - 3 * field.vs, hi + 3 * field.vs)
            if ss is None:
                continue
            ss = tuple(slice(max(a.start, b.start), min(a.stop, b.stop)) for a, b in zip(ss, sl))
            if any(x.stop <= x.start for x in ss):
                continue
            X, Y, Z = field.coords(ss)
            d = self.seg_d(i, X, Y, Z)
            if d is None:
                continue
            loc = tuple(slice(x.start - s.start, x.stop - s.start) for x, s in zip(ss, sl))
            out[loc] = np.minimum(out[loc], d)
        return out


class Scaled(Prim):
    """A primitive stretched by s = (sx, sy, sz) about point c (approximate distance, fine for meshing):
    e.g. a round cone squashed front-to-back into a torso."""

    def __init__(self, prim, s, c=(0, 0, 0)):
        self.prim, self.s, self.c = prim, np.asarray(s, float), np.asarray(c, float)
        self.lo = self.c + (np.asarray(prim.lo) - self.c) * self.s
        self.hi = self.c + (np.asarray(prim.hi) - self.c) * self.s

    def d(self, X, Y, Z):
        c, s = self.c, self.s
        return self.prim.d(c[0] + (X - c[0]) / s[0], c[1] + (Y - c[1]) / s[1], c[2] + (Z - c[2]) / s[2]) * s.min()


class Fn(Prim):
    """Any distance function with a given bounding box."""

    def __init__(self, fn, lo, hi):
        self.fn, self.lo, self.hi = fn, np.asarray(lo, float), np.asarray(hi, float)

    def d(self, X, Y, Z):
        return self.fn(X, Y, Z)


def mirror(prim_fn):
    """Build a primitive for both sides: prim_fn(g) with g = +1 (left, +X) and -1 (right)."""
    return [prim_fn(1), prim_fn(-1)]

# ---------------------------------------------------------------- field


class Field:
    def __init__(self, lo, hi, vs=0.003, bg=0.05):
        self.vs = vs
        self.bg = bg
        self.lo = np.asarray(lo, float) - 3 * vs
        hi = np.asarray(hi, float) + 3 * vs
        self.n = (np.ceil((hi - self.lo) / vs).astype(int) + 1)
        self.d = np.full(self.n, bg, np.float32)

    # index slices covering a world-space box, clipped to the grid
    def _slices(self, lo, hi):
        i0 = np.clip(np.floor((np.asarray(lo) - self.lo) / self.vs).astype(int), 0, self.n)
        i1 = np.clip(np.ceil((np.asarray(hi) - self.lo) / self.vs).astype(int) + 1, 0, self.n)
        if np.any(i1 <= i0):
            return None
        return tuple(slice(a, b) for a, b in zip(i0, i1))

    def coords(self, sl):
        ax = [self.lo[i] + np.arange(sl[i].start, sl[i].stop) * self.vs for i in range(3)]
        return np.meshgrid(ax[0], ax[1], ax[2], indexing='ij')

    def _region(self, prim, k, pad=0.0):
        m = k + 3 * self.vs + pad
        return self._slices(np.asarray(prim.lo) - m, np.asarray(prim.hi) + m)

    def _eval(self, prim, sl):
        if hasattr(prim, 'd_region'):
            return prim.d_region(self, sl)
        X, Y, Z = self.coords(sl)
        return prim.d(X, Y, Z).astype(np.float32)

    def add(self, prim, k=0.0):
        """Smooth union (k = blend radius)."""
        sl = self._region(prim, k)
        if sl is None:
            return self
        self.d[sl] = smin(self.d[sl], self._eval(prim, sl), k)
        return self

    def sub(self, prim, k=0.0):
        """Smooth subtraction: carve prim out."""
        sl = self._region(prim, k)
        if sl is None:
            return self
        self.d[sl] = smax(self.d[sl], -self._eval(prim, sl), k)
        return self

    def inter(self, prim, k=0.0):
        """Smooth intersection over the whole grid (keep only what is inside prim)."""
        X, Y, Z = self.coords(tuple(slice(0, n) for n in self.n))
        self.d = smax(self.d, prim.d(X, Y, Z).astype(np.float32), k).astype(np.float32)
        return self

    def displace(self, fn, lo=None, hi=None):
        """d += fn(X, Y, Z, d) inside a box (whole grid by default). Positive values dent, negative bulge."""
        sl = self._slices(lo, hi) if lo is not None else tuple(slice(0, n) for n in self.n)
        if sl is None:
            return self
        X, Y, Z = self.coords(sl)
        self.d[sl] = self.d[sl] + fn(X, Y, Z, self.d[sl]).astype(np.float32)
        return self

    def union_field(self, other, k=0.0):
        """Blend another Field on the same grid (same lo / vs / n)."""
        self.d = smin(self.d, other.d, k).astype(np.float32)
        return self

    def sample(self, pts):
        """Trilinear sample of the field at world points (N, 3); outside the grid -> bg."""
        g = (np.asarray(pts, float) - self.lo) / self.vs
        i0 = np.floor(g).astype(int)
        f = g - i0
        out = np.zeros(len(g))
        inside = np.all((i0 >= 0) & (i0 < self.n - 1), axis=1)
        i0c = np.clip(i0, 0, self.n - 2)
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                    out += w * self.d[i0c[:, 0] + dx, i0c[:, 1] + dy, i0c[:, 2] + dz]
        return np.where(inside, out, self.bg)

    def mesh(self, name, link=None):
        """Zero level set -> Blender mesh object (dense quads, outward normals)."""
        g = vdb.FloatGrid(self.bg)
        g.copyFromArray(np.ascontiguousarray(self.d))
        g.gridClass = vdb.GridClass.LEVEL_SET
        pts, quads = g.convertToQuads(isovalue=0.0)
        pts = self.lo + np.asarray(pts, float) * self.vs
        quads = np.asarray(quads, np.int64)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(pts))
        me.vertices.foreach_set('co', pts.astype(np.float32).ravel())
        me.loops.add(len(quads) * 4)
        me.loops.foreach_set('vertex_index', quads[:, ::-1].astype(np.int32).ravel())
        me.polygons.add(len(quads))
        me.polygons.foreach_set('loop_start', np.arange(0, len(quads) * 4, 4, dtype=np.int32))
        me.update(calc_edges=True)
        me.validate(clean_customdata=False)
        ob = bpy.data.objects.new(name, me)
        (link or bpy.context.scene.collection).objects.link(ob)
        _orient_outward(ob, self)
        for p in me.polygons:
            p.use_smooth = True
        return ob


def _orient_outward(ob, field):
    """Flip all faces if the first ones point into the field (OpenVDB's winding differs by version)."""
    me = ob.data
    votes = 0
    for p in list(me.polygons)[:: max(1, len(me.polygons) // 200)]:
        c = np.array(p.center)
        n = np.array(p.normal)
        votes += 1 if field.sample((c + n * field.vs * 1.5)[None])[0] > field.sample((c - n * field.vs * 1.5)[None])[0] else -1
    if votes < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()

# ---------------------------------------------------------------- reduction


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def _apply(ob, mod):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def reduce(ob, tris, symmetric=True, keep_normals=True, protect=None, post=None):
    """Decimate to about `tris` triangles and transfer the dense mesh's normals onto the result.
    protect(co) -> weight in [0, 1] keeps detail where it returns 1 (e.g. the face);
    post(ob) runs after decimation, before the normals are transferred (e.g. cutting face regions)."""
    dense = None
    if keep_normals:
        dense = ob.copy()
        dense.data = ob.data.copy()
        ob.users_collection[0].objects.link(dense)
        dense.hide_render = True
    cur = tri_count(ob)
    if cur > tris:
        dec = ob.modifiers.new('dec', 'DECIMATE')
        dec.decimate_type = 'COLLAPSE'
        dec.ratio = tris / cur
        dec.use_collapse_triangulate = True
        if symmetric:
            dec.use_symmetry = True
            dec.symmetry_axis = 'X'
        if protect:
            vg = ob.vertex_groups.new(name='protect')
            for v in ob.data.vertices:
                w = float(protect(v.co))
                if w > 0:
                    vg.add([v.index], w, 'REPLACE')
            dec.vertex_group = 'protect'
            dec.invert_vertex_group = True
            dec.vertex_group_factor = 4.0
        _apply(ob, dec)
        if protect:
            ob.vertex_groups.remove(ob.vertex_groups['protect'])
    # sliver triangles from the collapse would get no texels of their own in the atlas
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0004, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(ob.data)
    bm.free()
    if post:
        post(ob)
    if dense:
        transfer_normals(ob, dense)
        me = dense.data
        bpy.data.objects.remove(dense)
        bpy.data.meshes.remove(me)
    return ob


def transfer_normals(ob, dense):
    """One custom normal per vertex, taken from the nearest point of the dense sculpt: the low mesh shades
    like the sculpt, and (unlike per-corner transfer) no vertex is split by slightly different normals."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(dense, bpy.context.evaluated_depsgraph_get())
    out = []
    for v in ob.data.vertices:
        loc, n, _, _ = tree.find_nearest(v.co, 0.02)
        out.append(n if n is not None and n.dot(v.normal) > 0.2 else v.normal.copy())
    ob.data.normals_split_custom_set_from_vertices(out)


def smooth_verts(ob, iterations=2, factor=0.5):
    """Laplacian-ish relax of a dense mesh (removes voxel stair-steps before decimation)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(ob.data)
    bm.free()


def cull_hidden(ob, fields, margin=0.004):
    """Delete faces whose vertices all lie inside any of `fields` by more than margin (skin under
    clothes, hair roots inside the scalp) - triangles nobody can see."""
    me = ob.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    inside = np.zeros(len(co), bool)
    for f in fields:
        inside |= f.sample(co) < -margin
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dead = [f for f in bm.faces if all(inside[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(me)
    bm.free()
    return len(dead)
