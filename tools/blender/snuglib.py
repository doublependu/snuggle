"""Shared helpers for building Snuggle Sorcery assets in Blender.

Run build scripts through the Blender MCP or headless:
    blender -b -P tools/blender/build_all.py
    # MCP / Blender Python console:
    p = '<repo>/tools/blender/build_characters.py'
    exec(compile(open(p).read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})

Conventions (the runtime in src/render/materials.js depends on them):
- 1 unit = 1 metre, characters face -Y (glTF +Z after export).
- Colour lives in the "Col" colour attribute (exported as COLOR_0); no textures.
- Parts are modelled with a "kind" material (cloth, skin, hair, paper, plain, wood, roof, stone,
  glow, eye, ground, glass). join_mixed() merges every opaque kind into ONE mesh with the 'mixed'
  material and stores the kind in the colour alpha (KIND_CODE / 10); the runtime 'mixed' shader
  branches on it. One mesh per character / kit piece = one draw call on phones.
- Humanoid skeletons are axis-aligned T-poses with roll 0 so one animation
  library drives every character.
"""
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXPORT_DIR = os.path.join(REPO, 'assets-src', 'export')

# ---------------------------------------------------------------- basics

def srgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials, bpy.data.curves):
        for d in list(coll):
            if d.users == 0 or coll is bpy.data.actions:
                coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def collection(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


_active_coll = None


def use_collection(name):
    global _active_coll
    _active_coll = collection(name)
    return _active_coll


def link(ob):
    (_active_coll or bpy.context.scene.collection).objects.link(ob)
    return ob


# Shader family codes stored in the colour alpha (see src/render/materials.js 'mixed').
KIND_CODE = {'plain': 1, 'wood': 1, 'stone': 1, 'cloth': 2, 'skin': 3, 'hair': 4, 'eye': 5, 'glow': 5, 'roof': 6,
             'paper': 7, 'ground': 8}


def material(kind):
    m = bpy.data.materials.get(kind)
    if m:
        return m
    m = bpy.data.materials.new(kind)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if kind == 'mixed':
        # no colour node on purpose: the exporter then writes the active colour attribute *with* alpha
        return m
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    nt.links.new(vc.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    if kind == 'glow':
        nt.links.new(vc.outputs[0], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 2.0
    return m


def mesh_obj(name, bm, kind, color, smooth=True, bones=None, grad=None, noise=0.0):
    """bmesh -> object with one material and a filled colour attribute.
    grad: (color_bottom, color_top) gradient along local Z; noise: per-face value jitter."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    me.materials.append(material(kind))
    for p in me.polygons:
        p.use_smooth = smooth
    paint(ob, color, grad=grad, noise=noise)
    if bones is not None:
        ob['bones'] = bones if isinstance(bones, str) else ','.join(bones)
    return ob


def paint(ob, color, grad=None, noise=0.0, seed=0):
    me = ob.data
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    try:
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception:
        pass
    rnd = random.Random(seed or hash(ob.name) & 0xffff)
    code = KIND_CODE.get(me.materials[0].name if me.materials else 'plain', 1) / 10
    zs = [v.co.z for v in me.vertices] or [0]
    z0, z1 = min(zs), max(zs)
    for poly in me.polygons:
        j = 1 + (rnd.random() - 0.5) * 2 * noise
        for li in poly.loop_indices:
            c = color
            if grad:
                vz = me.vertices[me.loops[li].vertex_index].co.z
                t = 0 if z1 == z0 else (vz - z0) / (z1 - z0)
                c = mix(grad[0], grad[1], t)
            attr.data[li].color_srgb = (min(1, c[0] * j), min(1, c[1] * j), min(1, c[2] * j), code)


def xform_bm(bm, mat):
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)


def look_matrix(direction, up=Vector((0, 0, 1))):
    """Rotation matrix whose local Z axis points along direction."""
    d = Vector(direction).normalized()
    if abs(d.dot(up)) > 0.99:
        up = Vector((0, 1, 0))
    x = up.cross(d).normalized()
    y = d.cross(x)
    return Matrix((x, y, d)).transposed().to_4x4()

# ---------------------------------------------------------------- primitives


def ellipsoid(name, c, r, kind, color, segs=(12, 8), rot=(0, 0, 0), smooth=True, bones=None, grad=None, noise=0.0,
              squash_bottom=0.0, cut=None):
    """cut(co) -> True deletes that vertex (co on the unit sphere, before scaling) e.g. to open a face in a hair cap."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    if cut:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if cut(v.co)], context='VERTS')
    if squash_bottom:
        for v in bm.verts:
            if v.co.z < 0:
                v.co.z *= (1 - squash_bottom)
    m = Matrix.Translation(Vector(c)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Diagonal(
        (r[0], r[1], r[2], 1))
    xform_bm(bm, m)
    return mesh_obj(name, bm, kind, color, smooth, bones, grad, noise)


def tube(name, p0, p1, r0, r1, kind, color, segs=10, rings=4, bulge=0.0, caps=True, smooth=True, bones=None,
         flat_x=1.0, grad=None, noise=0.0, twist=0.0):
    """Tapered tube from p0 to p1 with rounded-ish caps; bulge pushes the middle out (puffy sleeves)."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    L = axis.length
    M = Matrix.Translation(p0) @ look_matrix(axis)
    bm = bmesh.new()
    ringv = []
    for i in range(rings + 1):
        t = i / rings
        r = r0 + (r1 - r0) * t + bulge * math.sin(math.pi * t)
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs + twist * t
            ring.append(bm.verts.new((math.cos(a) * r * flat_x, math.sin(a) * r, t * L)))
        ringv.append(ring)
    for i in range(rings):
        for s in range(segs):
            a, b = ringv[i][s], ringv[i][(s + 1) % segs]
            c_, d = ringv[i + 1][(s + 1) % segs], ringv[i + 1][s]
            bm.faces.new((a, b, c_, d))
    if caps:
        for ring, z, rr, flip in ((ringv[0], 0, r0, True), (ringv[-1], L, r1, False)):
            tip = bm.verts.new((0, 0, z + (-rr * 0.45 if flip else rr * 0.45)))
            for s in range(segs):
                a, b = ring[s], ring[(s + 1) % segs]
                bm.faces.new((b, a, tip) if flip else (a, b, tip))
    xform_bm(bm, M)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, kind, color, smooth, bones, grad, noise)


def superquad(name, c, r, kind, color, n=4.0, res=4, rot=(0, 0, 0), jitter=0.0, smooth=False, bones=None, grad=None,
              noise=0.0, seed=1, taper=0.0):
    """Rounded box / superellipsoid. Low res + jitter gives the faceted paper-craft look.
    taper > 0 makes the top narrower than the bottom."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=res - 1, use_grid_fill=True)
    rnd = random.Random(seed)
    for v in bm.verts:
        d = v.co.normalized()
        s = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (-1.0 / n)
        p = d * s
        if jitter:
            p = p * (1 + (rnd.random() - 0.5) * jitter)
        if taper:
            k = 1 - taper * (p.z + 1) / 2
            p.x *= k
            p.y *= k
        v.co = p
    m = Matrix.Translation(Vector(c)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Diagonal(
        (r[0], r[1], r[2], 1))
    xform_bm(bm, m)
    bmesh.ops.triangulate(bm, faces=bm.faces) if jitter else None
    return mesh_obj(name, bm, kind, color, smooth, bones, grad, noise)


def ico(name, c, r, kind, color, subdiv=1, jitter=0.0, seed=1, rot=(0, 0, 0), smooth=False, bones=None, grad=None,
        noise=0.0, spikes=0.0):
    """Faceted icosphere; spikes > 0 pushes original vertices out (fluffy pom-pom)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rnd = random.Random(seed)
    for i, v in enumerate(bm.verts):
        k = 1 + (rnd.random() - 0.5) * jitter
        if spikes and i < 12:
            k += spikes
        v.co = v.co.normalized() * k
    m = Matrix.Translation(Vector(c)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Diagonal(
        (r[0], r[1], r[2], 1))
    xform_bm(bm, m)
    return mesh_obj(name, bm, kind, color, smooth, bones, grad, noise)


def box(name, c, size, kind, color, rot=(0, 0, 0), bones=None, grad=None, noise=0.0, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES', profile=0.5)
    m = Matrix.Translation(Vector(c)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Diagonal(
        (size[0], size[1], size[2], 1))
    xform_bm(bm, m)
    return mesh_obj(name, bm, kind, color, False, bones, grad, noise)


def cone(name, p0, p1, r0, r1, kind, color, segs=8, bones=None, smooth=False, grad=None, noise=0.0):
    return tube(name, p0, p1, r0, r1, kind, color, segs=segs, rings=1, caps=True, smooth=smooth, bones=bones,
                grad=grad, noise=noise)


def torus(name, c, R, r, kind, color, segs=(16, 6), rot=(0, 0, 0), scale=(1, 1, 1), bones=None, smooth=True,
          arc=1.0):
    bm = bmesh.new()
    rings = []
    n_major = segs[0] if arc >= 1 else segs[0] + 1
    for i in range(n_major):
        a = 2 * math.pi * arc * i / segs[0]
        ring = []
        for j in range(segs[1]):
            b = 2 * math.pi * j / segs[1]
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    last = len(rings) if arc >= 1 else len(rings) - 1
    for i in range(last):
        ra, rb = rings[i], rings[(i + 1) % len(rings)]
        for j in range(segs[1]):
            bm.faces.new((ra[j], rb[j], rb[(j + 1) % segs[1]], ra[(j + 1) % segs[1]]))
    m = Matrix.Translation(Vector(c)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Diagonal(
        (*scale, 1))
    xform_bm(bm, m)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, kind, color, smooth, bones)


def disc(name, c, r, kind, color, normal=(0, -1, 0), segs=10, scale=(1, 1), bones=None, depth=0.004):
    """Thin flattened cylinder lying on a surface (eyes, blush, buttons)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=1, radius2=1, depth=1)
    m = Matrix.Translation(Vector(c)) @ look_matrix(normal) @ Matrix.Diagonal((r * scale[0], r * scale[1], depth, 1))
    xform_bm(bm, m)
    return mesh_obj(name, bm, kind, color, True, bones)


def on_sphere(center, radii, yaw_deg, pitch_deg, out=0.0):
    """Point on an ellipsoid surface. yaw 0 = facing -Y (the character's front); +yaw turns to the character's left (+X)."""
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    pt = Vector((center[0] + d.x * radii[0], center[1] + d.y * radii[1], center[2] + d.z * radii[2]))
    n = Vector((d.x / radii[0], d.y / radii[1], d.z / radii[2])).normalized()
    return pt + n * out, n


def join(objs, name):
    objs = [o for o in objs if o]
    target = objs[0]
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=objs,
                                   selected_editable_objects=objs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


def roof(name, c, w, d, h, over=0.6, lift=0.35, concave=1.5, res=(18, 10), tile='#4d5358', under='#5a2c20',
         ridge=True, pyramid=False):
    """Chinese hip roof with concave slopes and upturned eave corners. Returns [top, underside, ridges...].
    c is the centre of the eave line (roof base); w x d footprint *before* overhang."""
    W, D = w / 2 + over, d / 2 + over
    rl = 0 if pyramid else max(0.0, (w - d) / 2)  # half ridge length
    nx, ny = res

    def height(x, y):
        t = max(abs(y) / D, (abs(x) - rl) / max(1e-6, D if not pyramid else W))
        t = min(1.0, max(0.0, t))
        z = h * (1 - t) ** concave
        s = min(1.0, (abs(x) / W) ** 6 + (abs(y) / D) ** 6)
        return z + lift * (t ** 4) * (0.35 + 0.65 * s)

    def surface(offset, flip):
        bm = bmesh.new()
        grid = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                x = -W + 2 * W * i / nx
                y = -D + 2 * D * j / ny
                row.append(bm.verts.new((c[0] + x, c[1] + y, c[2] + height(x, y) - offset)))
            grid.append(row)
        for j in range(ny):
            for i in range(nx):
                q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
                bm.faces.new(tuple(reversed(q)) if flip else q)
        return bm

    top = mesh_obj(name + '_tiles', surface(0, False), 'roof', srgb(tile), smooth=True, noise=0.04)
    bot = mesh_obj(name + '_eaves', surface(0.1, True), 'wood', srgb(under), smooth=True)
    out = [top, bot]
    if ridge:
        dark = srgb('#363b40')
        zr = c[2] + height(0, 0)
        if rl > 0:
            out.append(tube(name + '_ridge', (c[0] - rl - 0.2, c[1], zr + 0.05), (c[0] + rl + 0.2, c[1], zr + 0.05),
                            0.1, 0.1, 'roof', dark, segs=6, rings=1))
        for sx in (-1, 1):
            if rl > 0 or sx > 0:
                out.append(cone(name + '_orn%d' % sx, (c[0] + sx * (rl + 0.2), c[1], zr + 0.05),
                                (c[0] + sx * (rl + 0.36), c[1], zr + 0.38), 0.09, 0.02, 'roof', dark, segs=5))
            for sy in (-1, 1):
                pts = []
                for k in range(7):
                    t = k / 6
                    x = sx * (rl + (W - rl) * t)
                    y = sy * D * t
                    pts.append(Vector((c[0] + x, c[1] + y, c[2] + height(x * 0.999, y * 0.999) + 0.06)))
                for k in range(6):
                    out.append(tube(name + '_hip%d%d%d' % (sx, sy, k), pts[k], pts[k + 1], 0.07, 0.07, 'roof', dark,
                                    segs=5, rings=1, caps=(k == 5)))
    return out


def join_mixed(objs, name):
    """Join all opaque parts into ONE mesh with the single 'mixed' material (kind lives in the colour
    alpha); transparent glass stays a separate mesh. Also avoids a Blender 5.2 glTF exporter bug where
    only the first material of a multi-material mesh gets its vertex colours mapped."""
    objs = [o for o in objs if o]
    glass = [o for o in objs if o.data.materials[0].name == 'glass']
    rest = [o for o in objs if o not in glass]
    out = []
    if rest:
        m = join(rest, name)
        m.data.materials.clear()
        m.data.materials.append(material('mixed'))
        for p in m.data.polygons:
            p.material_index = 0
        out.append(m)
    if glass:
        out.append(join(glass, name + '_glass'))
    return out


def apply_transform(ob):
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)

# ---------------------------------------------------------------- ambient occlusion bake (vertex colours)


def bake_ao(targets, occluders=None, dist=0.35, samples=24, strength=0.55, seed=3):
    """Cheap per-vertex AO: hemisphere ray casts against a BVH of occluders; multiplies into Col."""
    occluders = occluders or targets
    verts, polys = [], []
    for o in occluders:
        me = o.data
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in me.vertices)
        polys.extend([base + i for i in p.vertices] for p in me.polygons)
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    rnd = random.Random(seed)
    dirs = []
    while len(dirs) < samples:
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.05 < v.length <= 1:
            dirs.append(v.normalized())
    for o in targets:
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        attr = me.color_attributes.get('Col')
        if not attr:
            continue
        occ = []
        for v in me.vertices:
            p = mw @ v.co
            n = (nm @ v.normal).normalized()
            hits = 0
            tot = 0
            for d in dirs:
                if d.dot(n) < 0:
                    d = -d
                tot += 1
                loc, _, _, dd = tree.ray_cast(p + n * 0.004, d, dist)
                if loc is not None:
                    hits += 1 - (dd / dist) * 0.5
            occ.append(1 - strength * (hits / max(1, tot)))
        for li, loop in enumerate(me.loops):
            k = occ[loop.vertex_index]
            c = attr.data[li].color_srgb
            attr.data[li].color_srgb = (c[0] * k, c[1] * k, c[2] * k, c[3])

# ---------------------------------------------------------------- skeleton

HUMANOID = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'hood',
            'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L',
            'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R',
            'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R']


def humanoid_joints(height=1.15, head_r=0.19, sh_w=0.12, arm=0.30, hip_w=0.075, hip_z=None, foot=0.10):
    """Joint positions for an axis-aligned chibi T-pose. Returns {bone: (head, tail, parent)}."""
    head_top = height
    chin = head_top - head_r * 1.9
    neck_z = chin - 0.01
    chest_top = neck_z - 0.03
    hip_z = hip_z or chest_top * 0.56
    knee = hip_z * 0.52
    ankle = 0.065
    sh_z = chest_top - 0.03
    ua, fa, hd = arm * 0.46, arm * 0.40, arm * 0.14
    J = {
        'root': ((0, 0, 0), (0, 0, 0.1), None),
        'hips': ((0, 0, hip_z), (0, 0, hip_z + 0.08), 'root'),
        'spine': ((0, 0, hip_z + 0.08), (0, 0, (hip_z + chest_top) / 2 + 0.04), 'hips'),
        'chest': ((0, 0, (hip_z + chest_top) / 2 + 0.04), (0, 0, neck_z), 'spine'),
        'neck': ((0, 0, neck_z), (0, 0, chin + 0.02), 'chest'),
        'head': ((0, 0, chin + 0.02), (0, 0, head_top), 'neck'),
        'hood': ((0, 0.07, neck_z - 0.02), (0, 0.17, neck_z - 0.02), 'chest'),
    }
    for s, sx in (('L', 1), ('R', -1)):
        x0 = 0.03 * sx
        x1 = sh_w * sx
        J['shoulder_' + s] = ((x0, 0, sh_z), (x1, 0, sh_z), 'chest')
        J['upperarm_' + s] = ((x1, 0, sh_z), (x1 + ua * sx, 0, sh_z), 'shoulder_' + s)
        J['forearm_' + s] = ((x1 + ua * sx, 0, sh_z), (x1 + (ua + fa) * sx, 0, sh_z), 'upperarm_' + s)
        J['hand_' + s] = ((x1 + (ua + fa) * sx, 0, sh_z), (x1 + (ua + fa + hd) * sx, 0, sh_z), 'forearm_' + s)
        hx = hip_w * sx
        J['thigh_' + s] = ((hx, 0, hip_z), (hx, 0, knee), 'hips')
        J['shin_' + s] = ((hx, 0, knee), (hx, 0, ankle), 'thigh_' + s)
        J['foot_' + s] = ((hx, 0, ankle), (hx, -foot, ankle), 'shin_' + s)
    return J


def build_armature(name, J):
    arm = bpy.data.armatures.new(name + '_rig')
    ob = link(bpy.data.objects.new(name + '_rig', arm))
    arm.display_type = 'STICK'
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bn, (h, t, parent) in J.items():
        eb = arm.edit_bones.new(bn)
        eb.head, eb.tail, eb.roll = Vector(h), Vector(t), 0.0
    for bn, (h, t, parent) in J.items():
        if parent:
            arm.edit_bones[bn].parent = arm.edit_bones[parent]
            arm.edit_bones[bn].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return ob


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (a + ab * t - p).length


def skin(parts, rig, power=6.0):
    """Assign vertex groups per part from its 'bones' property (comma list); nearest-segment weighting."""
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    for ob in parts:
        names = [n for n in str(ob.get('bones', 'root')).split(',') if n]
        groups = {n: ob.vertex_groups.new(name=n) for n in names}
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            if len(names) == 1:
                groups[names[0]].add([v.index], 1.0, 'REPLACE')
                continue
            ws = [(n, 1.0 / (seg_dist(p, *segs[n]) ** power + 1e-9)) for n in names]
            ws.sort(key=lambda x: -x[1])
            ws = ws[:2]
            tot = sum(w for _, w in ws)
            for n, w in ws:
                if w / tot > 0.01:
                    groups[n].add([v.index], w / tot, 'REPLACE')
        if 'bones' in ob:
            del ob['bones']


def bind(mesh, rig):
    mesh.parent = rig
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig

# ---------------------------------------------------------------- animation authoring

AX = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}


def arot(*pairs):
    """Armature-space rotation from (axis, degrees) pairs applied left-to-right in order.
    Axes: x = character's left, y = backward, z = up."""
    q = Quaternion()
    for ax, deg in pairs:
        q = Quaternion(AX[ax], math.radians(deg)) @ q
    return q


def set_pose(rig, pose, hips_offset=(0, 0, 0)):
    """pose: {bone: armature-space Quaternion} relative to the parent's frame."""
    for pb in rig.pose.bones:
        q = pose.get(pb.name)
        if q is None:
            pb.rotation_quaternion = Quaternion()
        else:
            M = pb.bone.matrix_local.to_3x3().to_quaternion()
            pb.rotation_quaternion = M.inverted() @ q @ M
        pb.location = (0, 0, 0)
    hp = rig.pose.bones.get('hips')
    if hp:
        M = hp.bone.matrix_local.to_3x3()
        hp.location = M.inverted() @ Vector(hips_offset)


def make_action(rig, name, frames, pose_fn, loop=True, fps=30):
    """pose_fn(t in [0,1]) -> (pose dict, hips offset). Keys every frame; loops share first/last frame."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    n = frames
    for f in range(n + 1 if loop else n):
        t = (f % n) / n if loop else f / max(1, n - 1)
        pose, off = pose_fn(t)
        set_pose(rig, pose, off)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f + 1)
            if pb.name == 'hips':
                pb.keyframe_insert('location', frame=f + 1)
    # push to its own NLA track so the exporter emits one glTF animation per action
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    rig.animation_data.action = None
    return act

# ---------------------------------------------------------------- export


def export_glb(filename, objs, animations=False, anim_mode='NLA_TRACKS', extras=True):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    path = os.path.join(EXPORT_DIR, filename)
    for o in bpy.context.view_layer.objects:
        if o:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_vertex_color='ACTIVE', export_extras=extras, export_animations=animations,
        export_animation_mode=anim_mode, export_skins=True, export_materials='EXPORT',
        export_image_format='NONE', export_yup=True, export_cameras=False, export_lights=False,
        export_def_bones=False, export_force_sampling=True, export_optimize_animation_size=True,
        export_reset_pose_bones=True)
    return path


def descendants(ob):
    out = [ob]
    for c in ob.children:
        out += descendants(c)
    return out
