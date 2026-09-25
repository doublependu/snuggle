# SPDX-License-Identifier: GPL-3.0-only
"""Shared pipeline for sculpted characters (ai/plan_1.md §3): SDF groups -> game mesh -> painted atlas ->
A-pose rig -> GLB. A character module (char_<name>.py) provides the sculpt and the art direction:

  NAME, H, ARM_DOWN, EYE_Z, MOUTH_Z      size, A-pose angle, face rows
  GROUPS  [(group, builder, kind, colour key, triangles, symmetric)]   builder() -> sdf.Field, or a list
          of snuglib primitives ("part" groups: colours from their vertex paint, weights from each part's bones),
          or a dense mesh object ("mesh" groups, e.g. hero_base.py: its own vertex groups, optional 'region'
          face attribute passed to face_kind / paint)
  COL     {colour key: '#hex'}           sRGB
  joints() -> {bone: (head, tail, parent)} in the T-pose (the rig then lowers the arms by ARM_DOWN)
  WEIGHTS {group: ('auto', bones) | ('dist', bones) | ('rigid', bone) | ('split', fn(center) -> bone)
           | ('fn', fn(points) -> (bones, weights)) | ('parts',) | ('keep',)}
  face_kind(group, center, normal, region) -> kind or None   per-face shader family override (e.g. a cuff)
  paint(group, P, N, ao, ao_f, base, region=None) -> linear RGB   per-texel albedo (base: (n, 3))
  EYES, MOUTH                            face.EyeStyle / face.MouthStyle

Atlas: 1024 x 512, glTF UVs (origin top-left).
  x    0..512   body: painted albedo x baked occlusion (Smart UV islands)
  x  512..1024  face: eye cells 256 x 128 (2 cols x 3 rows) then mouth cells 128 x 64 (4 cols x 2 rows)
The eye / mouth regions of the head get shader codes 9 / 10 and planar UVs on cell 0; the runtime shifts
them to show another cell (src/render/materials.js, src/actors/face.js).
"""
import json
import math
import os
import time
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

import snuglib as S
import sdf
import face as F

AW, AH = 1024, 512
EYE_CELL, MOUTH_CELL = (256, 128), (128, 64)


def set_atlas(scale=1.0):
    """Atlas size for one character (townsfolk use half): the layout keeps its proportions."""
    global AW, AH, EYE_CELL, MOUTH_CELL, CELL_PAD
    AW, AH = int(1024 * scale), int(512 * scale)
    EYE_CELL, MOUTH_CELL = (int(256 * scale), int(128 * scale)), (int(128 * scale), int(64 * scale))
    CELL_PAD = max(2, int(4 * scale))
EYE_RECT_REL = (-0.13, 0.13, -0.045, 0.085)  # x0, x1, z0, z1 around (0, EYE_Z)
MOUTH_RECT_REL = (-0.036, 0.036, -0.018, 0.018)  # around (0, MOUTH_Z)
CELL_PAD = 4  # px: the region maps inside its cell with a painted margin, so filtering never reads the next cell
FACE_LAYOUT = {
    'eyes': {'names': F.EYE_STATES, 'cols': 2, 'du': EYE_CELL[0] / AW, 'dv': EYE_CELL[1] / AH},
    'mouth': {'names': F.MOUTH_STATES, 'cols': 4, 'du': MOUTH_CELL[0] / AW, 'dv': MOUTH_CELL[1] / AH},
}
CODE = dict(S.KIND_CODE, face_eyes=9, face_mouth=10)


def log(*a):
    print('[chibi]', *a, flush=True)


def srgb_to_lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def hexlin(h):
    return srgb_to_lin(S.srgb(h))

# ---------------------------------------------------------------- rig


def build_rig(name, J, arm_down):
    """Axis-aligned T-pose skeleton (same bone frames as the animation library), then each arm (the upper
    arm and every bone below it, e.g. fingers or a hand puppet's jaw) is turned down by arm_down degrees
    about the shoulder joint: the bone frames rotate rigidly, so the library's absolute local rotations
    still pose the arms correctly (src/actors/humanoid.js)."""
    rig = S.build_armature(name, J)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones

    def under(e, root):
        while e:
            if e.name == root:
                return True
            e = e.parent
        return False

    for side, g in (('L', 1), ('R', -1)):
        root = 'upperarm_' + side
        pivot = eb[root].head.copy()
        R = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(arm_down * g), 4, 'Y') @ Matrix.Translation(-pivot)
        for e in [e for e in eb if under(e, root)]:
            e.matrix = R @ e.matrix
    for e in eb:
        if e.name.startswith('seat_'):
            e.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def _bone_segments(rig):
    return {b.name: (np.array(b.head_local), np.array(b.tail_local)) for b in rig.data.bones}


def _seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def _co(ob):
    co = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3) @ np.array(ob.matrix_world.to_3x3()).T + np.array(ob.matrix_world.translation)


def set_weights(ob, W, names):
    """W: (nverts, nbones) weights; keeps the 4 largest per vertex, normalised."""
    W = np.asarray(W, float)
    if W.shape[1] > 4:
        idx = np.argsort(-W, axis=1)[:, 4:]
        np.put_along_axis(W, idx, 0, axis=1)
    W[W < 0.01] = 0
    s = W.sum(1, keepdims=True)
    W = np.where(s > 0, W / np.maximum(s, 1e-9), 0)
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    for j, n in enumerate(names):
        vg = ob.vertex_groups.new(name=n)
        nz = np.nonzero(W[:, j])[0]
        for i in nz:
            vg.add([int(i)], float(W[i, j]), 'REPLACE')


def dist_weights(ob, rig, bones, power=6.0, top=2):
    segs = _bone_segments(rig)
    P = _co(ob)
    D = np.stack([_seg_dist(P, *segs[b]) for b in bones], axis=1)
    W = 1.0 / (D ** power + 1e-12)
    if top < len(bones):
        idx = np.argsort(-W, axis=1)[:, top:]
        np.put_along_axis(W, idx, 0, axis=1)
    return W


def auto_weights(ob, rig, bones):
    """Blender's bone-heat weights restricted to `bones`; vertices it can't solve fall back to distance."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(active_object=rig, object=rig, selected_objects=[ob, rig],
                                   selected_editable_objects=[ob, rig]):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    n = len(ob.data.vertices)
    W = np.zeros((n, len(bones)))
    for j, b in enumerate(bones):
        vg = ob.vertex_groups.get(b)
        if not vg:
            continue
        for i in range(n):
            try:
                W[i, j] = vg.weight(i)
            except RuntimeError:
                pass
    miss = W.sum(1) < 1e-3
    if miss.any():
        Wd = dist_weights(ob, rig, bones)
        W[miss] = Wd[miss]
        log('  auto weights: %d / %d vertices fell back to distance' % (miss.sum(), n))
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw
    return W


def apply_weights(ob, rig, rule):
    kind = rule[0]
    if kind == 'parts':
        return
    if kind == 'keep':  # the mesh came with weights: just normalise and keep the 4 largest
        names = [g.name for g in ob.vertex_groups]
        W = np.zeros((len(ob.data.vertices), len(names)))
        for v in ob.data.vertices:
            for g in v.groups:
                W[v.index, g.group] = g.weight
        set_weights(ob, W, names)
        return
    if kind == 'rigid':
        set_weights(ob, np.ones((len(ob.data.vertices), 1)), [rule[1]])
    elif kind == 'dist':
        set_weights(ob, dist_weights(ob, rig, rule[1]), rule[1])
    elif kind == 'auto':
        set_weights(ob, auto_weights(ob, rig, rule[1]), rule[1])
    elif kind == 'fn':  # character-defined: fn(points) -> (bone names, weights)
        names, W = rule[1](_co(ob))
        set_weights(ob, W, names)
    elif kind == 'split':  # each connected island to one bone chosen from its centre
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        seen = set()
        assign = {}
        for v in bm.verts:
            if v.index in seen:
                continue
            stack, isl = [v], []
            seen.add(v.index)
            while stack:
                u = stack.pop()
                isl.append(u.index)
                for e in u.link_edges:
                    w = e.other_vert(u)
                    if w.index not in seen:
                        seen.add(w.index)
                        stack.append(w)
            c = np.mean([np.array(bm.verts[i].co) for i in isl], axis=0)
            b = rule[1](c)
            for i in isl:
                assign[i] = b
        bm.free()
        names = sorted(set(assign.values()))
        W = np.zeros((len(ob.data.vertices), len(names)))
        for i, b in assign.items():
            W[i, names.index(b)] = 1
        set_weights(ob, W, names)

# ---------------------------------------------------------------- face regions


def face_rects(C):
    ex0, ex1, ez0, ez1 = EYE_RECT_REL
    mx0, mx1, mz0, mz1 = MOUTH_RECT_REL
    return (ex0, ex1, C.EYE_Z + ez0, C.EYE_Z + ez1), (mx0, mx1, C.MOUTH_Z + mz0, C.MOUTH_Z + mz1)


def cut_face(C):
    """Post-decimation hook for the skin group: slice the head along the face rectangles so the eye and
    mouth regions are made of whole faces."""
    eye, mouth = face_rects(C)

    def post(ob):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for (x0, x1, z0, z1) in (eye, mouth):
            for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)), ((0, 0, z0), (0, 0, 1)), ((0, 0, z1), (0, 0, 1))):
                faces = [f for f in bm.faces if f.calc_center_median().y < -0.02
                         and x0 - 0.04 < f.calc_center_median().x < x1 + 0.04 and z0 - 0.04 < f.calc_center_median().z < z1 + 0.04]
                geom = list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts}) + faces
                bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(ob.data)
        bm.free()
    return post


def face_region(C, center, normal):
    eye, mouth = face_rects(C)
    if normal[1] > -0.3 or center[1] > -0.05:
        return None
    for r, name in ((eye, 'face_eyes'), (mouth, 'face_mouth')):
        if r[0] <= center[0] <= r[1] and r[2] <= center[2] <= r[3]:
            return name
    return None

# ---------------------------------------------------------------- vertex colours


def paint_group(ob, C, group, kind, colour):
    """Per-face shader code (colour alpha) and a flat review colour; a Gid attribute names the group."""
    me = ob.data
    me.materials.clear()
    me.materials.append(S.material(kind))
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    gid = me.color_attributes.new('Gid', 'FLOAT_COLOR', 'CORNER')
    base = S.srgb(C.COL[colour])
    gidv = (C.GROUP_IDS[group] / 255.0, 0, 0, 1)
    ra = me.attributes.get('region')
    regions = np.zeros(len(me.polygons), np.int32)
    if ra:
        ra.data.foreach_get('value', regions)
    for p in me.polygons:
        c, n = tuple(p.center), tuple(p.normal)
        k = kind
        if group == 'skin':
            k = face_region(C, c, n) or k
        k = C.face_kind(group, c, n, int(regions[p.index]) if ra else None) or k
        code = CODE.get(k, 1) / 10
        for li in p.loop_indices:
            attr.data[li].color_srgb = (base[0], base[1], base[2], code)
            gid.data[li].color = gidv
    me.color_attributes.render_color_index = me.color_attributes.find('Col')


def add_gid(ob, C, group):
    """Only the group id: a part group keeps its own vertex colours and shader codes."""
    me = ob.data
    gid = me.color_attributes.new('Gid', 'FLOAT_COLOR', 'CORNER')
    buf = np.tile([C.GROUP_IDS[group] / 255.0, 0, 0, 1], len(gid.data)).astype(np.float32)
    gid.data.foreach_set('color', buf)
    me.color_attributes.active_color = me.color_attributes['Col']


def whiten(ob):
    """Albedo lives in the atlas: keep only the shader codes in the colour alpha."""
    attr = ob.data.color_attributes['Col']
    n = len(attr.data)
    buf = np.empty(n * 4, np.float32)
    attr.data.foreach_get('color', buf)
    buf = buf.reshape(-1, 4)
    buf[:, :3] = 1.0
    attr.data.foreach_set('color', buf.ravel())

# ---------------------------------------------------------------- UVs


def chart_seams(ob, face_code, cone=66.0, smooth_iters=25, min_faces=16):
    """Cut the mesh into a few large charts. Charts grow from seed faces while the face normals (of a
    smoothed copy, so quilting bumps don't matter) stay within `cone` degrees of the chart's normal; tiny
    charts are merged into a neighbour. Returns (count, chart per face, normals of the smoothed faces).
    Smart UV Project cuts these bumpy low-poly meshes into hundreds of islands, which splits most
    vertices and wastes texels."""
    import heapq
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(smooth_iters):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    nf = len(bm.faces)
    N = np.nan_to_num(np.array([f.normal[:] for f in bm.faces]))
    A = np.array([max(f.calc_area(), 1e-9) for f in bm.faces])
    adj = [[g.index for e in f.edges for g in e.link_faces if g.index != f.index] for f in bm.faces]
    bm.free()
    cosl = math.cos(math.radians(cone))
    chart = -np.ones(nf, int)
    special = face_code >= 9
    chart[special] = -2  # face regions: handled separately
    order = np.argsort(-A)
    nc = 0
    for seed in order:
        if chart[seed] != -1:
            continue
        cn = N[seed].copy()
        acc = N[seed] * A[seed]
        chart[seed] = nc
        heap = [(0.0, int(j)) for j in adj[seed]]
        heapq.heapify(heap)
        while heap:
            _, j = heapq.heappop(heap)
            if chart[j] != -1 or N[j] @ cn < cosl:
                continue
            chart[j] = nc
            acc += N[j] * A[j]
            cn = acc / np.linalg.norm(acc)
            for k in adj[j]:
                if chart[k] == -1:
                    heapq.heappush(heap, (1.0 - float(N[k] @ cn), int(k)))
        nc += 1
    # merge tiny charts into a neighbour (never a whole small part: a closed chart can't be flattened)
    comp = _components(adj, nf)
    comp_size = np.bincount(comp)
    for _ in range(3):
        sizes = np.bincount(chart[chart >= 0], minlength=nc)
        for c in np.nonzero((sizes > 0) & (sizes < min_faces))[0]:
            faces = np.nonzero(chart == c)[0]
            if comp_size[comp[faces[0]]] < 4 * min_faces:
                continue
            nb = {}
            for f in faces:
                for k in adj[f]:
                    if chart[k] >= 0 and chart[k] != c:
                        nb[chart[k]] = nb.get(chart[k], 0) + 1
            if nb:
                chart[faces] = max(nb, key=nb.get)
    # any chart that still covers a whole closed part is cut in two across its widest axis
    for c in np.unique(chart[chart >= 0]):
        faces = np.nonzero(chart == c)[0]
        if len(faces) == comp_size[comp[faces[0]]]:
            nrm = N[faces]
            ax = np.linalg.svd(nrm - nrm.mean(0))[2][0]
            chart[faces[nrm @ ax < 0]] = nc
            nc += 1
    return len(np.unique(chart[chart >= 0])), chart, N, A


def _cell_uv(px, py, cell, fx, fy):
    """glTF UV of a point at fraction (fx, fy) of a face region, inside the padded cell at pixel (px, py)."""
    return ((px + CELL_PAD + fx * (cell[0] - 2 * CELL_PAD)) / AW, (py + CELL_PAD + fy * (cell[1] - 2 * CELL_PAD)) / AH)


def _padded(rect, cell):
    """A region rectangle grown so it covers the whole cell including the padding."""
    x0, x1, z0, z1 = rect
    gx = (x1 - x0) * CELL_PAD / (cell[0] - 2 * CELL_PAD)
    gz = (z1 - z0) * CELL_PAD / (cell[1] - 2 * CELL_PAD)
    return (x0 - gx, x1 + gx, z0 - gz, z1 + gz)


def _components(adj, n):
    comp = -np.ones(n, int)
    k = 0
    for i in range(n):
        if comp[i] >= 0:
            continue
        stack = [i]
        comp[i] = k
        while stack:
            j = stack.pop()
            for m in adj[j]:
                if comp[m] < 0:
                    comp[m] = k
                    stack.append(m)
        k += 1
    return comp


def unwrap(ob, C):
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    me.uv_layers.active = me.uv_layers[0]
    col = me.color_attributes['Col']
    codes = np.empty(len(col.data) * 4, np.float32)
    col.data.foreach_get('color', codes)
    loop_code = np.rint(codes.reshape(-1, 4)[:, 3] * 10).astype(int)
    face_code = np.array([loop_code[p.loop_start] for p in me.polygons])
    charts, chart, N, A = chart_seams(ob, face_code)
    # each chart is a height field over the plane normal to its mean normal: project it flat (metres,
    # so every chart has the same texel density), then let Blender pack the islands
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    uvl = me.uv_layers.active.data
    frames = {}
    for c in np.unique(chart):
        m = chart == c
        n = np.nan_to_num((N[m] * A[m, None]).sum(0))
        if np.linalg.norm(n) < 1e-9:
            n = np.array([0.0, -1.0, 0.0])
        n = n / np.linalg.norm(n)
        e1 = np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0, 0])
        e1 /= np.linalg.norm(e1)
        frames[c] = (e1, np.cross(n, e1))
    for p in me.polygons:
        e1, e2 = frames[chart[p.index]]
        for li in p.loop_indices:
            v = co[me.loops[li].vertex_index]
            uvl[li].uv = (float(v @ e1), float(v @ e2))
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.005)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = me.uv_layers.active.data
    eye, mouth = face_rects(C)
    for p, c in zip(me.polygons, face_code):
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if c == 9:
                x0, x1, z0, z1 = eye
                u, vg = _cell_uv(AW // 2, 0, EYE_CELL, (co.x - x0) / (x1 - x0), (z1 - co.z) / (z1 - z0))
            elif c == 10:
                x0, x1, z0, z1 = mouth
                u, vg = _cell_uv(AW // 2, 3 * EYE_CELL[1], MOUTH_CELL, (co.x - x0) / (x1 - x0), (z1 - co.z) / (z1 - z0))
            else:
                u, v = uv[li].uv
                uv[li].uv = (u * 0.5 * 0.985 + 0.004, v * 0.985 + 0.007)
                continue
            uv[li].uv = (u, 1.0 - vg)
    a = np.array([l.uv[:] for l in uv])
    body = np.repeat(face_code < 9, [p.loop_total for p in me.polygons])
    log('  uv: %d charts, body range %s..%s, %d distinct' % (charts, a[body].min(0).round(3), a[body].max(0).round(3), len(np.unique(a[body].round(4), axis=0))))

# ---------------------------------------------------------------- baking


def _bake_emit(ob, image, socket_fn):
    """Bake an emission shader (socket_fn(node_tree) -> colour socket) into image via Cycles."""
    sc = bpy.context.scene
    mat = bpy.data.materials.new('bake_tmp')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(socket_fn(nt), em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    nt.nodes.active = tex
    old = list(ob.data.materials)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 1
    sc.cycles.device = 'CPU'
    sc.render.bake.margin = 4
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    with bpy.context.temp_override(active_object=ob, object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.bake(type='EMIT')
    ob.data.materials.clear()
    for m in old:
        ob.data.materials.append(m)
    bpy.data.materials.remove(mat)
    px = np.empty(AW * AH * 4, np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(AH, AW, 4)[::-1]  # top-down rows


def _img(name):
    im = bpy.data.images.get(name)
    if im:
        bpy.data.images.remove(im)
    im = bpy.data.images.new(name, AW, AH, alpha=True, float_buffer=True)
    im.generated_color = (0, 0, 0, 0)
    return im


def bake_maps(ob):
    def pos(nt):
        return nt.nodes.new('ShaderNodeNewGeometry').outputs['Position']

    def gid(nt):
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = 'Gid'
        return a.outputs['Color']

    def col(nt):
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = 'Col'
        return a.outputs['Color']

    P = _bake_emit(ob, _img('bake_pos'), pos)
    G = _bake_emit(ob, _img('bake_gid'), gid)
    V = _bake_emit(ob, _img('bake_col'), col)
    cover = P[..., 3] > 0.5
    gids = np.rint(G[..., 0] * 255).astype(int)
    return P[..., :3].astype(np.float64), gids, cover, V[..., :3].astype(np.float64)


class Dense:
    """The dense sculpt: per-group BVHs (nearest surface) and one combined BVH (occlusion rays)."""

    def __init__(self, his):
        self.trees = {}
        allv, allp = [], []
        for g, ob in his.items():
            me = ob.data
            co = np.empty(len(me.vertices) * 3, np.float32)
            me.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3)
            n = np.empty(len(me.polygons), np.int32)
            me.polygons.foreach_get('loop_total', n)
            li = np.empty(len(me.loops), np.int32)
            me.loops.foreach_get('vertex_index', li)
            polys = np.split(li, np.cumsum(n)[:-1])
            verts = [Vector(v) for v in co]
            self.trees[g] = BVHTree.FromPolygons(verts, [p.tolist() for p in polys], epsilon=0.0)
            base = sum(len(v) for v in allv)
            allv.append(verts)
            allp += [(p + base).tolist() for p in polys]
        self.all = BVHTree.FromPolygons([v for vs in allv for v in vs], allp, epsilon=0.0)


def occlusion(dense, P, gids, cover, id_to_group, rays=14, dist=0.07, fine_rays=6, fine_dist=0.014):
    """Per texel: snap to the group's dense surface, then cast cosine-weighted rays against the whole sculpt.
    Returns dense points, dense normals and two occlusion terms (broad and fine creases)."""
    t0 = time.time()
    rng = np.random.default_rng(3)
    dirs = rng.normal(size=(64, 3))
    dirs /= np.linalg.norm(dirs, axis=1)[:, None]
    H, W = cover.shape
    Pd = np.zeros((H, W, 3))
    Nd = np.zeros((H, W, 3))
    ao = np.ones((H, W))
    ao_f = np.ones((H, W))
    Ix = np.zeros((H, W), np.int64)
    ys, xs = np.nonzero(cover)
    for k, (y, x) in enumerate(zip(ys, xs)):
        g = id_to_group.get(int(gids[y, x]))
        tree = dense.trees.get(g)
        if tree is None:
            continue
        loc, nrm, idx, _ = tree.find_nearest(Vector(P[y, x]), 0.05)
        if loc is None:
            continue
        Ix[y, x] = idx
        Pd[y, x] = loc
        Nd[y, x] = nrm
        o = loc + nrm * 0.0015
        occ = 0.0
        sel = dirs[(k * 7) % 50:(k * 7) % 50 + rays]
        for d in sel:
            dv = Vector(d)
            if dv.dot(nrm) < 0:
                dv = -dv
            dv = (dv + nrm * 0.35).normalized()
            hit = dense.all.ray_cast(o, dv, dist)
            if hit[0] is not None:
                occ += 1.0 - 0.5 * hit[3] / dist
        ao[y, x] = 1.0 - occ / len(sel)
        occ = 0.0
        for d in sel[:fine_rays]:
            dv = Vector(d)
            if dv.dot(nrm) < 0:
                dv = -dv
            hit = dense.all.ray_cast(o, dv, fine_dist)
            if hit[0] is not None:
                occ += 1.0
        ao_f[y, x] = 1.0 - occ / fine_rays
    log('  occlusion: %d texels in %.1fs' % (len(ys), time.time() - t0))
    return Pd, Nd, ao, ao_f, Ix


def _save_image(arr_srgb, path, fmt='PNG', quality=90, alpha=False):
    h, w = arr_srgb.shape[:2]
    im = bpy.data.images.new('save_tmp', w, h, alpha=alpha)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :arr_srgb.shape[2]] = arr_srgb
    im.pixels.foreach_set(rgba[::-1].ravel())
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    s = sc.render.image_settings
    s.file_format = fmt
    s.color_mode = 'RGBA' if alpha else 'RGB'
    s.quality = quality
    if fmt == 'WEBP':
        s.color_depth = '8'
    im.save_render(path, scene=sc)
    bpy.data.images.remove(im)


def paint_atlas(C, ob, his):
    """Bake positions + group ids, compute occlusion from the dense sculpt, let the character paint
    albedo per group, paint the face cells; returns the atlas (sRGB float) and writes the WebP."""
    P, gids, cover, vcol = bake_maps(ob)
    id_to_group = {v: k for k, v in C.GROUP_IDS.items()}
    u, n = np.unique(gids, return_counts=True)
    log('  baked: %d covered texels, gids %s, pos range %s..%s' % (cover.sum(), dict(zip(u.tolist(), n.tolist())), P[cover].min(0).round(2), P[cover].max(0).round(2)))
    dense = Dense(his)
    Pd, Nd, ao, ao_f, Ix = occlusion(dense, P, gids, cover, id_to_group)
    albedo = np.zeros((AH, AW, 3))
    body = cover.copy()
    body[:, AW // 2:] = False
    for gid, g in id_to_group.items():
        m = body & (gids == gid)
        if not m.any():
            continue
        colour = [c for (n, _, _, c, _, _) in C.GROUPS if n == g][0]
        # part groups carry their colours in the vertex paint; sculpted groups take the palette colour
        base = vcol[m] if colour is None else np.tile(hexlin(C.COL[colour]), (int(m.sum()), 1))
        kw = {}
        ra = his[g].data.attributes.get('region')
        if ra:  # the region of the dense face under each texel
            arr = np.zeros(len(his[g].data.polygons), np.int32)
            ra.data.foreach_get('value', arr)
            kw['region'] = arr[Ix[m]]
        albedo[m] = C.paint(g, Pd[m], Nd[m], ao[m], ao_f[m], base, **kw)
    # face cells: painted expression cells x the occlusion baked on cell 0 (same geometry for every cell)
    ex0, ex1, ez0, ez1 = EYE_RECT_REL
    mx0, mx1, mz0, mz1 = MOUTH_RECT_REL
    shade = lambda y0, x0, w, h: np.where(cover[y0:y0 + h, x0:x0 + w], C.face_shade(ao[y0:y0 + h, x0:x0 + w], ao_f[y0:y0 + h, x0:x0 + w]), 1.0)
    eye_sh = shade(0, AW // 2, *EYE_CELL)
    for i, st in enumerate(F.EYE_STATES):
        x0 = AW // 2 + (i % 2) * EYE_CELL[0]
        y0 = (i // 2) * EYE_CELL[1]
        cell = F.eye_cell(_padded((ex0, ex1, ez0, ez1), EYE_CELL), EYE_CELL, C.EYES, st)
        albedo[y0:y0 + EYE_CELL[1], x0:x0 + EYE_CELL[0]] = cell * eye_sh[..., None]
    m_y = 3 * EYE_CELL[1]
    mouth_sh = shade(m_y, AW // 2, *MOUTH_CELL)
    for i, st in enumerate(F.MOUTH_STATES):
        x0 = AW // 2 + (i % 4) * MOUTH_CELL[0]
        y0 = m_y + (i // 4) * MOUTH_CELL[1]
        cell = F.mouth_cell(_padded((mx0, mx1, mz0, mz1), MOUTH_CELL), MOUTH_CELL, C.MOUTH, st)
        albedo[y0:y0 + MOUTH_CELL[1], x0:x0 + MOUTH_CELL[0]] = cell * mouth_sh[..., None]
    # fill uncovered body texels with the nearest colour (mip-mapping bleeds them in at a distance)
    albedo = _dilate(albedo, body | np.pad(np.zeros((AH, AW // 2), bool), ((0, 0), (0, AW // 2)), constant_values=True), 16)
    atlas = lin_to_srgb(albedo)
    os.makedirs(S.EXPORT_DIR, exist_ok=True)
    _save_image(atlas, os.path.join(S.EXPORT_DIR, C.NAME + '_atlas.webp'), 'WEBP', 67)
    review = os.path.join(S.REPO, 'assets-src', 'review')
    os.makedirs(review, exist_ok=True)
    _save_image(atlas, os.path.join(review, C.NAME + '_atlas.png'))
    _save_image(np.repeat(ao[..., None], 3, 2), os.path.join(review, C.NAME + '_ao.png'))
    return atlas


def _dilate(img, mask, n):
    img = img.copy()
    m = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(img)
        cnt = np.zeros(m.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1))
            acc += np.roll(img, (dy, dx), (0, 1)) * sm[..., None]
            cnt += sm
        grow = (~m) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        m = m | grow
    return img

# ---------------------------------------------------------------- review material


def review_material(ob, atlas):
    h, w = atlas.shape[:2]
    im = bpy.data.images.get('review_atlas') or bpy.data.images.new('review_atlas', w, h)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = atlas
    im.pixels.foreach_set(rgba[::-1].ravel())
    mat = bpy.data.materials.new('review_tex')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = im
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.nodes.active = tex
    ob.data.materials.append(mat)
    ob.active_material_index = len(ob.data.materials) - 1
    for p in ob.data.polygons:
        p.material_index = len(ob.data.materials) - 1
    return mat


def drop_review_material(ob, mat):
    for p in ob.data.polygons:
        p.material_index = 0
    ob.data.materials.pop(index=len(ob.data.materials) - 1)
    bpy.data.materials.remove(mat)

# ---------------------------------------------------------------- build


def build(C, review_only=False, tag=''):
    import review
    t0 = time.time()
    set_atlas(getattr(C, 'ATLAS_SCALE', 1.0))
    S.reset_scene()
    S.use_collection(C.NAME)
    C.GROUP_IDS = {g[0]: i + 1 for i, g in enumerate(C.GROUPS)}
    rig = build_rig(C.NAME, C.joints(), C.ARM_DOWN)
    his, los, fields, parts, meshes = {}, [], {}, {}, {}
    for name, builder, *_ in C.GROUPS:
        res = builder()
        if isinstance(res, sdf.Field):
            fields[name] = res
        elif isinstance(res, bpy.types.Object):
            meshes[name] = res
        else:
            parts[name] = res
    for name, builder, kind, colour, tris, sym in C.GROUPS:
        t = time.time()
        if name in parts:
            # primitives: weights from each part's bones, then one mesh; it is its own "dense" surface
            S.skin(parts[name], rig)
            lo = S.join_mixed(parts[name], name)[0]
            add_gid(lo, C, name)
            hi = lo.copy()
            hi.data = lo.data.copy()
            hi.name = name + '_hi'
            S._active_coll.objects.link(hi)
            his[name] = hi
            los.append(lo)
            log('%-9s parts -> %5d tris  %.1fs' % (name, sdf.tri_count(lo), time.time() - t))
            continue
        if name in meshes:
            hi = meshes[name]
            hi.name = name + '_hi'
            if hi.name not in S._active_coll.objects:
                for c in list(hi.users_collection):
                    c.objects.unlink(hi)
                S._active_coll.objects.link(hi)
        else:
            hi = fields[name].mesh(name + '_hi', S._active_coll)
        lo = hi.copy()
        lo.data = hi.data.copy()
        lo.name = name
        S._active_coll.objects.link(lo)
        # triangles hidden under other layers are dropped before decimating, so the budget goes to what shows
        culled = sdf.cull_hidden(lo, [fields[g] for g in getattr(C, 'CULL', {}).get(name, []) if g in fields])
        sdf.reduce(lo, tris, symmetric=sym, post=cut_face(C) if name == 'skin' else None)
        paint_group(lo, C, name, kind, colour)
        apply_weights(lo, rig, C.WEIGHTS[name])
        his[name] = hi
        los.append(lo)
        log('%-9s dense %6d faces (%d hidden) -> %5d tris  %.1fs' % (name, len(hi.data.polygons), culled, sdf.tri_count(lo), time.time() - t))
    del fields
    if review_only:
        for hi in his.values():
            hi.hide_render = True
        return review.sheet(C.NAME, los, C.H, head_z=C.EYE_Z, tag=tag or 'shape')
    mesh = S.join(los, C.NAME)
    mesh.data.materials.clear()
    mesh.data.materials.append(S.material('mixed'))
    for p in mesh.data.polygons:
        p.material_index = 0
    unwrap(mesh, C)
    for hi in his.values():
        hi.hide_render = True
    atlas = paint_atlas(C, mesh, his)
    log('atlas done %.1fs' % (time.time() - t0))
    # review sheet with the atlas
    mat = review_material(mesh, atlas)
    sheet = review.sheet(C.NAME, [mesh], C.H, head_z=C.EYE_Z, tag=tag or 'final', texture=True)
    drop_review_material(mesh, mat)
    for hi in his.values():
        me = hi.data
        bpy.data.objects.remove(hi)
        bpy.data.meshes.remove(me)
    bpy.context.view_layer.update()
    whiten(mesh)
    mesh.data.color_attributes.remove(mesh.data.color_attributes['Gid'])
    S.bind(mesh, rig)
    mesh['face'] = json.dumps(FACE_LAYOUT)
    mesh.data.color_attributes.active_color = mesh.data.color_attributes['Col']
    rig['height'] = C.H
    path = S.export_glb(C.NAME + '.glb', [rig, mesh])
    log('%s: %d tris, exported in %.1fs' % (C.NAME, sdf.tri_count(mesh), time.time() - t0))
    return path, sheet
