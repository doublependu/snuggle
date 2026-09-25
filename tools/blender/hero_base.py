"""Start a character's body from a reference base mesh (experiment, ai/plan_1.md): ref/hero_male.glb.

The base is a clean low-poly game character (skinned, A-pose, hand-painted palette texture). We keep its
topology and its skin weights and:
1. read which part of the outfit each face is (shirt, trousers, skin, leather...) from its texture colour
   and its dominant bone, and rename those parts to the new character's (jacket, cuff, trousers, shoe...);
2. warp it onto the new character's skeleton with its own skin weights: every base bone gets a transform
   that moves, stretches (along the bone) and thickens (across it) its segment onto the target bone, and
   each vertex blends the transforms of its bones (linear blend skinning, done once on the rest pose);
3. hand back a smooth dense mesh (Catmull-Clark) whose vertex groups use our bone names and whose faces
   carry a 'region' attribute, ready for chibi.py (reduce, bake, rig).
Note: ref/ is not in git; the base mesh's licence has to allow redistribution before a body built from
it ships in public/assets.
"""
import colorsys
import math
import os
import numpy as np
import bpy
import bmesh

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BASE = os.path.join(REPO, 'ref', 'hero_male.glb')

REGIONS = {'jacket': 1, 'cuff': 2, 'skin': 3, 'trousers': 4, 'shoe': 5}
HAND_BONES = {'hand', 'thumb', 'fingers_base', 'fingers_mid', 'fingers_tip'}
FOREARM_BONES = {'forearm', 'wrist'}
LEG_LOW_BONES = {'shin', 'foot'}


def import_base(path=BASE):
    """Import the base GLB into the current scene; returns (body mesh object, armature, joint heads)."""
    if not os.path.exists(path):
        raise FileNotFoundError('base mesh not found: %s (it lives in ref/, which is not in git)' % path)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    body = next(o for o in new if o.type == 'MESH' and o.data.name.startswith('body'))
    joints = {b.name: np.array(b.head_local) for b in arm.data.bones}
    tails = {b.name: np.array(b.tail_local) for b in arm.data.bones}
    for o in new:
        if o is not body:
            bpy.data.objects.remove(o)
    body.parent = None
    body.modifiers.clear()
    return body, joints, tails


def drop_attributes(ob):
    """The base's own colour layers and UVs are only needed for classify(); the pipeline makes its own."""
    me = ob.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.materials.clear()


def _side(name):
    return name[-1] if name[-2:] in ('.L', '.R') else ''


def _stem(name):
    return name[:-2] if name[-2:] in ('.L', '.R') else name


def dominant_bone(ob):
    """Per vertex: name of the vertex group with the largest weight."""
    names = {g.index: g.name for g in ob.vertex_groups}
    out = []
    for v in ob.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        out.append(names[best.group] if best else 'root')
    return out


def classify(ob, texture_name='hero2'):
    """Region per face from the base texture's colour at the face and the face's dominant bone."""
    img = bpy.data.images.get(texture_name)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    me = ob.data
    uv = me.uv_layers.active.data
    vb = dominant_bone(ob)
    region = np.zeros(len(me.polygons), int)
    for p in me.polygons:
        u, v = np.mean([uv[li].uv[:] for li in p.loop_indices], axis=0)
        r, g, b = px[int(np.clip(v, 0, 0.999) * h), int(np.clip(u, 0, 0.999) * w), :3]
        hh, s, val = colorsys.rgb_to_hsv(r, g, b)
        bones = [_stem(vb[i]) for i in p.vertices]
        bone = max(set(bones), key=bones.count)
        if 0.2 < hh < 0.45 and s > 0.2:
            reg = 'trousers'
        elif val < 0.55:  # leather: bracers become cuffs, boots become shoes, the belt disappears into the jacket
            reg = 'cuff' if bone in FOREARM_BONES | HAND_BONES else 'shoe' if bone in LEG_LOW_BONES else \
                'trousers' if bone == 'thigh' else 'jacket'
        elif bone in HAND_BONES:
            reg = 'skin'
        elif bone in LEG_LOW_BONES:
            reg = 'shoe'
        elif bone == 'head' and p.center.z > 1.7:
            reg = 'skin'  # the base's neck (hidden under the new head's neck)
        else:
            reg = 'jacket'  # shirt, short sleeves and bare forearms all become the jacket
        region[p.index] = REGIONS[reg]
    return region


# ---------------------------------------------------------------- warp

def _frame(a, b, up=None):
    """Columns (x = front, y = along the bone, z = side) for segment a -> b."""
    u = b - a
    u = u / np.linalg.norm(u)
    f = np.array([0.0, -1.0, 0.0]) if up is None else np.asarray(up, float)
    if abs(f @ u) > 0.9:
        f = np.array([0.0, 0.0, 1.0])
    x = f - (f @ u) * u
    x /= np.linalg.norm(x)
    z = np.cross(u, x)
    return np.stack([x, u, z], axis=1)


class BoneMap:
    """Maps a base segment (a, b) onto a target segment (a2, b2): translate + rotate, stretch along the
    bone (optionally piecewise via `knots`: base fraction -> target fraction) and scale across it
    (front = depth, side = width, in the bone's frame)."""

    def __init__(self, a, b, a2, b2, front=1.0, side=1.0, knots=None):
        self.a, self.b, self.a2, self.b2 = (np.asarray(x, float) for x in (a, b, a2, b2))
        self.R = _frame(self.a, self.b)
        self.R2 = _frame(self.a2, self.b2)
        self.L = np.linalg.norm(self.b - self.a)
        self.L2 = np.linalg.norm(self.b2 - self.a2)
        self.front, self.side = front, side
        self.knots = knots

    def apply(self, P):
        loc = (P - self.a) @ self.R  # (front, along, side)
        t = loc[:, 1] / self.L
        if self.knots:
            t = np.interp(t, *self.knots, left=None, right=None)
            # outside [0, 1] keep the end slopes
            k0, k1 = self.knots
            t = np.where(loc[:, 1] / self.L < k0[0], k1[0] + (loc[:, 1] / self.L - k0[0]), t)
            t = np.where(loc[:, 1] / self.L > k0[-1], k1[-1] + (loc[:, 1] / self.L - k0[-1]), t)
        out = np.stack([loc[:, 0] * self.front, t * self.L2, loc[:, 2] * self.side], axis=1)
        return self.a2 + out @ self.R2.T


def warp(ob, maps, fallback):
    """Linear-blend the per-bone maps with the base's own skin weights (rest pose, done once)."""
    me = ob.data
    P = np.array([v.co[:] for v in me.vertices])
    names = {g.index: g.name for g in ob.vertex_groups}
    out = np.zeros_like(P)
    wsum = np.zeros(len(P))
    cache = {}
    for i, v in enumerate(me.vertices):
        for g in v.groups:
            if g.weight <= 0:
                continue
            m = maps.get(names[g.group], fallback)
            key = id(m)
            if key not in cache:
                cache[key] = m.apply(P)
            out[i] += g.weight * cache[key][i]
            wsum[i] += g.weight
    none = wsum < 1e-6
    if none.any():
        out[none] = fallback.apply(P[none])
        wsum[none] = 1
    out /= wsum[:, None]
    for v, p in zip(me.vertices, out):
        v.co = p


def rename_groups(ob, table):
    """Merge the base's vertex groups into ours: table {base bone: our bone}; others are dropped."""
    me = ob.data
    names = {g.index: g.name for g in ob.vertex_groups}
    W = {}
    for v in me.vertices:
        for g in v.groups:
            ours = table.get(names[g.group])
            if ours:
                W.setdefault(ours, {}).setdefault(v.index, 0.0)
                W[ours][v.index] += g.weight
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    for bone, ws in W.items():
        vg = ob.vertex_groups.new(name=bone)
        for i, w in ws.items():
            vg.add([i], w, 'REPLACE')


def store_regions(ob, region):
    attr = ob.data.attributes.get('region') or ob.data.attributes.new('region', 'INT', 'FACE')
    attr.data.foreach_set('value', np.asarray(region, np.int32))


def subdivide(ob, levels=2):
    """Catmull-Clark: the smooth dense surface the reduction and the bake work from (vertex groups and
    face attributes follow the subdivision)."""
    mod = ob.modifiers.new('sub', 'SUBSURF')
    mod.levels = mod.render_levels = levels
    mod.uv_smooth = 'PRESERVE_BOUNDARIES'
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in ob.data.polygons:
        p.use_smooth = True
