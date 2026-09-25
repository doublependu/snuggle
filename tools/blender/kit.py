# SPDX-License-Identifier: GPL-3.0-only
"""Character kit (ai/plan_1.md): the shared pieces of the chibi characters built by chibi.py.

A character module (char_<name>.py) describes one character with a Body (proportions) and uses the kit
for everything they have in common:
- Body: landmarks, the A-pose arms, the skeleton (joints) and the segments the base mesh is warped onto;
- head_field: head and neck (the painted face lives on it, see chibi.py);
- hero_outfit: the body built from the base mesh (hero_base.py), with a per-character region mapping,
  reshape and trimming;
- sleeve / puff / trim helpers, a closed jacket hem, shoes, skin-weight helpers and paint helpers.
Coordinates: metres, Z up, facing -Y, +X is the character's left.
"""
import math
import numpy as np
from sdf import Field, Ellipsoid, RoundCone, Capsule, Box, Torus, Tube, Scaled, catmull, rot, lerp_list
import face as F
import hero_base as HB

# the character's own outfit regions (face attribute 'region' on the body built from the base mesh)
REG = {'top': 1, 'cuff': 2, 'skin': 3, 'bottom': 4, 'shoe': 5, 'belt': 6, 'glove': 7}


class Body:
    """Proportions of one character. Torso levels: hip (thigh joints) < waist < chest < collar (top of the
    clothes around the neck); the head's neck capsule runs from neck[0] (inside the collar) to neck[1] (jaw)."""

    def __init__(self, height, skull_c, skull_r, neck, shoulder, upper, fore, hand, hip_z, leg_x, knee_z, ankle_z,
                 waist_z, chest_z, collar_z, eye_z, mouth_z, arm_down=50, foot_len=0.088, head_top=None):
        self.height = height
        self.skull_c = np.asarray(skull_c, float)
        self.skull_r = np.asarray(skull_r, float)
        self.neck = neck
        self.shoulder = np.asarray(shoulder, float)
        self.upper, self.fore, self.hand = upper, fore, hand
        self.hip_z, self.leg_x, self.knee_z, self.ankle_z = hip_z, leg_x, knee_z, ankle_z
        self.waist_z, self.chest_z, self.collar_z = waist_z, chest_z, collar_z
        self.eye_z, self.mouth_z = eye_z, mouth_z
        self.arm_down = arm_down
        self.foot_len = foot_len
        self.head_top = head_top or self.skull_c[2] + self.skull_r[2] + 0.005

    # ---- arms (A-pose)
    def arm_dir(self, g):
        a = math.radians(self.arm_down)
        return np.array([math.cos(a) * g, 0.0, -math.sin(a)])

    def arm_points(self, g):
        sh = self.shoulder * np.array([g, 1, 1])
        d = self.arm_dir(g)
        el = sh + d * self.upper
        wr = el + d * self.fore
        return sh, el, wr, wr + d * self.hand

    def arm_s(self, p, g):
        """Distance along the arm from the shoulder joint, and from the arm's axis."""
        sh = self.shoulder * np.array([g, 1, 1])
        d = self.arm_dir(g)
        v = np.asarray(p) - sh
        s = v @ d
        return s, np.linalg.norm(v - s * d)

    def head_pt(self, x, y, z):
        return self.skull_c + np.array([x, y, z])

    # ---- skeleton
    def joints(self, extra=None):
        """T-pose joints with the shared bone names (chibi.build_rig lowers the arms by arm_down)."""
        hz, sx, sz = self.hip_z, self.shoulder[0], self.shoulder[2]
        spine = hz + (self.chest_z - hz) * 0.45
        J = {
            'root': ((0, 0, 0), (0, 0, 0.1), None),
            'hips': ((0, 0, hz), (0, 0, spine), 'root'),
            'spine': ((0, 0, spine), (0, 0, self.chest_z), 'hips'),
            'chest': ((0, 0, self.chest_z), (0, 0, self.neck[0]), 'spine'),
            'neck': ((0, 0, self.neck[0]), (0, 0, self.neck[1]), 'chest'),
            'head': ((0, 0, self.neck[1]), (0, 0, self.head_top), 'neck'),
            'hood': ((0, 0.07, self.collar_z - 0.02), (0, 0.17, self.collar_z - 0.02), 'chest'),
        }
        w = sx + self.upper + self.fore
        for s, g in (('L', 1), ('R', -1)):
            J['shoulder_' + s] = ((0.03 * g, 0, sz), (sx * g, 0, sz), 'chest')
            J['upperarm_' + s] = ((sx * g, 0, sz), ((sx + self.upper) * g, 0, sz), 'shoulder_' + s)
            J['forearm_' + s] = (((sx + self.upper) * g, 0, sz), (w * g, 0, sz), 'upperarm_' + s)
            J['hand_' + s] = ((w * g, 0, sz), ((w + self.hand) * g, 0, sz), 'forearm_' + s)
            J['thumb_' + s] = (((w + 0.02) * g, -0.016, sz), ((w + 0.045) * g, -0.03, sz), 'hand_' + s)
            J['fingers_' + s] = (((w + 0.045) * g, 0, sz), ((w + 0.075) * g, 0, sz), 'hand_' + s)
            lx = self.leg_x * g
            J['thigh_' + s] = ((lx, 0, hz), (lx, 0, self.knee_z), 'hips')
            J['shin_' + s] = ((lx, 0, self.knee_z), (lx, 0, self.ankle_z), 'thigh_' + s)
            J['foot_' + s] = ((lx, 0, self.ankle_z), (lx, -0.1, self.ankle_z), 'shin_' + s)
        J.update(extra or {})
        return J

    def hero_targets(self):
        """Our skeleton's segments (A-pose) for each bone of the base mesh."""
        tgt = {}
        fr = np.array([0, -1.0, 0])
        for side, g in (('L', 1), ('R', -1)):
            sh, el, wr, tip = self.arm_points(g)
            d = self.arm_dir(g)
            tgt['bicep.' + side] = (sh, el)
            tgt['forearm.' + side] = (el, el + (wr - el) * 0.45)
            tgt['wrist.' + side] = (el + (wr - el) * 0.45, wr)
            tgt['hand.' + side] = (wr, wr + d * 0.045)
            f0, f1 = wr + d * 0.045, wr + d * 0.075
            for i, n in enumerate(('fingers_base.', 'fingers_mid.', 'fingers_tip.')):
                tgt[n + side] = (f0 + (f1 - f0) * i / 3, f0 + (f1 - f0) * (i + 1) / 3)
            tgt['thumb.' + side] = (wr + d * 0.02 + fr * 0.016, wr + d * 0.045 + fr * 0.03)
            lx = self.leg_x * g
            tgt['thigh.' + side] = (np.array([lx, 0, self.hip_z]), np.array([lx, 0, self.knee_z]))
            tgt['shin.' + side] = (np.array([lx, 0, self.knee_z]), np.array([lx, 0, self.ankle_z]))
            tgt['foot.' + side] = (np.array([lx, 0, self.ankle_z]), np.array([lx * 1.02, -self.foot_len, 0.03]))
        tgt['pelvis'] = (np.array([0, 0, self.waist_z]), np.array([0, 0, self.hip_z - 0.02]))
        tgt['torso'] = (np.array([0, 0, self.waist_z]), np.array([0, 0, self.chest_z]))
        tgt['shoulders'] = (np.array([0, 0, self.chest_z]), np.array([0, 0, self.collar_z]))
        tgt['head'] = (np.array([0, 0.012, self.collar_z]), np.array([0, 0.012, self.collar_z + 0.135]))
        return tgt


# ---------------------------------------------------------------- head

def head_field(B, cheeks=1.0, chin=1.0, nose=1.0, ears=1.0, jowls=0.0):
    """Head and neck: a round skull, soft cheeks low on the face, a small chin, a button nose, ears."""
    f = Field((-0.22, -0.22, B.neck[0] - 0.05), (0.22, 0.22, B.head_top + 0.02), vs=0.0025)
    r = B.skull_r
    f.add(Ellipsoid(B.skull_c, r))
    k = r[0] / 0.145  # features scale with the skull
    f.add(Ellipsoid(B.head_pt(0, -0.026 * k, -0.066 * k), np.array([0.118, 0.103, 0.085]) * k * cheeks ** 0.3), k=0.045 * k)
    f.add(Ellipsoid(B.head_pt(0, -0.064 * k, -0.11 * k), np.array([0.052, 0.046, 0.033]) * k * chin), k=0.032 * k)
    for g in (1, -1):
        f.add(Ellipsoid(B.head_pt(0.07 * g * k, -0.078 * k, -0.075 * k), np.array([0.045, 0.04, 0.036]) * k * cheeks), k=0.028 * k)
        if ears:
            f.add(Ellipsoid(B.head_pt(0.14 * g * k, 0.0, -0.04 * k), np.array([0.016, 0.026, 0.031]) * k * ears,
                            rot(0, 0, -12 * g)), k=0.013)
        if jowls:
            f.add(Ellipsoid(B.head_pt(0.085 * g * k, -0.06 * k, -0.1 * k), np.array([0.04, 0.035, 0.03]) * k * jowls), k=0.03)
    f.add(Ellipsoid(B.head_pt(0, -r[1] * 0.98 + 0.003, -0.045 * k), np.array([0.012, 0.01, 0.011]) * k * nose), k=0.011)
    f.add(Capsule((0, 0.012, B.neck[0]), (0, 0.012, B.neck[1]), 0.034 * k), k=0.03)
    return f


def cap(B, grow=(0.016, 0.02, 0.016), lift=(0, 0.012, 0.014)):
    """The hair cap ellipsoid around the skull: (centre, radii)."""
    return B.skull_c + np.asarray(lift), B.skull_r + np.asarray(grow)


def on_cap(c, r, p, inset=0.0):
    """Project a point radially (from c) onto the ellipsoid (c, r), `inset` metres inside it."""
    d = np.asarray(p, float) - c
    k = 1.0 / np.sqrt(((d / r) ** 2).sum())
    n = d / np.linalg.norm(d)
    return c + d * k - n * inset


def lock(f, pts, radii, flat=0.45, centre=None, k=0.008, n=10):
    """A flattened, tapered lock of hair along a spline, lying on the head (flattened toward `centre`)."""
    p = catmull(pts, n=n)
    t = np.linspace(0, 1, len(p))
    fd = [(q - centre) for q in p] if centre is not None else None
    f.add(Tube(p, lerp_list(radii, t), flat=flat, flat_dir=fd), k=k)


# ---------------------------------------------------------------- body from the base mesh

HERO_BONES = {'root': 'hips', 'pelvis': 'hips', 'torso': 'spine', 'shoulders': 'chest', 'head': 'neck'}
for _s in 'LR':
    HERO_BONES.update({'bicep.' + _s: 'upperarm_' + _s, 'forearm.' + _s: 'forearm_' + _s, 'wrist.' + _s: 'forearm_' + _s,
                       'hand.' + _s: 'hand_' + _s, 'thumb.' + _s: 'thumb_' + _s, 'fingers_base.' + _s: 'fingers_' + _s,
                       'fingers_mid.' + _s: 'fingers_' + _s, 'fingers_tip.' + _s: 'fingers_' + _s,
                       'thigh.' + _s: 'thigh_' + _s, 'shin.' + _s: 'shin_' + _s, 'foot.' + _s: 'foot_' + _s})


def hero_outfit(B, ext, knots=None, regions=None, reshape=None, trim=None, subdiv=2):
    """The character's body from the base mesh (hero_base.py): classify its parts, warp it onto B's skeleton
    (ext: target half extents (front, side) across each base bone; knots: along-bone remaps), then the
    character's own steps: regions(ob, base_region, vb) -> region, reshape(ob, region, vb),
    trim(ob, region) -> region. Returns the smooth dense mesh with our bones and a 'region' attribute."""
    body, J, T = HB.import_base()
    base_region = HB.classify(body)
    vb = HB.dominant_bone(body)
    P0 = np.array([v.co[:] for v in body.data.vertices])
    seg = {'pelvis': (J['pelvis'], J['pelvis'] + [0, 0, -0.104]), 'torso': (J['torso'], J['shoulders']),
           'shoulders': (J['shoulders'], J['head']), 'head': (J['head'], J['head'] + [0, 0, 0.12])}
    for side in ('.L', '.R'):
        for a, b in (('bicep', 'forearm'), ('forearm', 'wrist'), ('wrist', 'hand'), ('hand', 'fingers_base'),
                     ('fingers_base', 'fingers_mid'), ('fingers_mid', 'fingers_tip'), ('thigh', 'shin'), ('shin', 'foot')):
            seg[a + side] = (J[a + side], J[b + side])
        seg['fingers_tip' + side] = (J['fingers_tip' + side], T['fingers_tip' + side])
        seg['thumb' + side] = (J['thumb' + side], T['thumb' + side])
        seg['foot' + side] = (J['foot' + side], np.array([J['foot' + side][0] * 0.75, -0.24, 0.03]))
    tgt = B.hero_targets()
    maps = {}
    for n, (a, b) in seg.items():
        stem = HB._stem(n)
        up = [0, 0, 1.0] if stem == 'foot' else None
        R = HB._frame(np.asarray(a, float), np.asarray(b, float), up)
        m = np.array([v == n for v in vb])
        loc = (P0[m] - a) @ R
        bf, bs = np.percentile(np.abs(loc[:, 0]), 90), np.percentile(np.abs(loc[:, 2]), 90)
        tf, ts = ext[stem]
        bm = HB.BoneMap(a, b, *tgt[n], front=tf / max(bf, 1e-3), side=ts / max(bs, 1e-3), knots=(knots or {}).get(stem))
        if up:
            bm.R, bm.R2 = HB._frame(bm.a, bm.b, up), HB._frame(bm.a2, bm.b2, up)
        maps[n] = bm
    HB.warp(body, maps, maps['pelvis'])
    region = regions(body, base_region, vb) if regions else base_region
    if reshape:
        reshape(body, region, vb)
    if trim:
        region = trim(body, region)
    HB.rename_groups(body, HERO_BONES)
    HB.store_regions(body, region)
    HB.drop_attributes(body)
    HB.subdivide(body, subdiv)
    return body


def vertex_regions(ob, region):
    """Per vertex: the largest region id among its faces."""
    vreg = np.zeros(len(ob.data.vertices), int)
    for p in ob.data.polygons:
        for i in p.vertices:
            vreg[i] = max(vreg[i], region[p.index])
    return vreg


def sleeves(ob, region, vb, B, profile, regions=('top', 'cuff'), bones=('bicep', 'forearm', 'wrist'), amount=0.85):
    """Put every sleeve vertex back on a radius profile around the arm axis (s along the arm -> radius):
    one continuous sleeve, whatever the base had (short sleeves, bare forearms, bracers). Laplacian smoothing
    would collapse these thin low-poly tubes."""
    import bmesh
    ids = {REG[r] for r in regions}
    vreg = vertex_regions(ob, region)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        if HB._stem(vb[v.index]) not in bones or vreg[v.index] not in ids:
            continue
        g = 1 if v.co.x > 0 else -1
        sh = B.shoulder * np.array([g, 1, 1])
        d = B.arm_dir(g)
        rel = np.array(v.co) - sh
        s = rel @ d
        rv = rel - s * d
        r = np.linalg.norm(rv)
        if r < 1e-6:
            continue
        k = np.clip((s - 0.02) / 0.04, 0, 1) * amount  # leave the shoulder seam to the torso
        v.co = sh + s * d + rv / r * (r + (np.interp(s, *profile) - r) * k)
    bm.to_mesh(ob.data)
    bm.free()


def puff(ob, region, amounts, max_x=None):
    """Push regions out along their normals (metres), e.g. a puffy jacket; max_x keeps it off the arms."""
    import bmesh
    vreg = vertex_regions(ob, region)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for v in bm.verts:
        for name, a in amounts.items():
            if vreg[v.index] == REG[name] and (max_x is None or abs(v.co.x) < max_x):
                v.co += v.normal * a
    bm.to_mesh(ob.data)
    bm.free()


def trim(ob, region, dead):
    """Delete faces where dead(region_id, centre) is true; returns the regions of the faces that remain."""
    import bmesh
    HB.store_regions(ob, region)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if dead(region[f.index], np.array(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    out = np.zeros(len(ob.data.polygons), np.int32)
    ob.data.attributes['region'].data.foreach_get('value', out)
    return out


def base_to(base_region, table):
    """Map the base mesh's parts (hero_base.BASE names) to the character's regions (REG names)."""
    out = np.zeros(len(base_region), np.int32)
    for name, bid in HB.BASE.items():
        out[base_region == bid] = REG[table.get(name, 'top')]
    return out


# ---------------------------------------------------------------- sculpted clothes

def hem_field(B, top_z, bottom_z, r_top, r_bottom, depth=0.8, open_front=0.024, roll=0.016):
    """A closed, slightly flared jacket / cardigan hem below the belt, open at the front if open_front."""
    c = np.array([0, 0.004, (top_z + bottom_z) / 2])
    f = Field((-r_bottom - 0.05, -r_bottom * depth - 0.05, bottom_z - 0.04), (r_bottom + 0.05, r_bottom * depth + 0.05, top_z + 0.04),
              vs=0.0025)
    f.add(Scaled(RoundCone((0, 0.004, top_z), (0, 0.004, bottom_z), r_top, r_bottom), (1.0, depth, 1.0), c))
    if roll:
        f.add(Scaled(Torus((0, 0.004, bottom_z + 0.003), r_bottom - 0.008, roll), (1.02, depth, 1.0), (0, 0.004, bottom_z)), k=0.012)
    f.sub(Scaled(RoundCone((0, 0.004, top_z + 0.06), (0, 0.004, bottom_z - 0.05), r_top - 0.025, r_bottom - 0.026),
                 (1.0, depth - 0.02, 1.0), c), k=0.004)
    if open_front:
        f.sub(Box((0, -0.2, c[2]), (open_front, 0.08, (top_z - bottom_z) / 2 + 0.03), 0.01), k=0.008)
    return f


def waistband(B, top_z, bottom_z, r_top, r_bottom, depth=0.8, thick=0.02):
    """A closed band of trouser fabric from under the belt / sash to below the hips: closes the gap the
    base's tunic flaps leave when they are cut (the base's trousers start below its tunic)."""
    c = np.array([0, 0.004, (top_z + bottom_z) / 2])
    f = Field((-r_bottom - 0.05, -r_bottom - 0.05, bottom_z - 0.04), (r_bottom + 0.05, r_bottom + 0.05, top_z + 0.04), vs=0.0025)
    f.add(Scaled(RoundCone((0, 0.004, top_z), (0, 0.004, bottom_z), r_top, r_bottom), (1.0, depth, 1.0), c))
    f.sub(Scaled(RoundCone((0, 0.004, top_z + 0.05), (0, 0.004, bottom_z - 0.05), r_top - thick, r_bottom - thick),
                 (1.0, depth - 0.02, 1.0), c), k=0.004)
    return f


def hightops(B, collar=0.1, sock_top=0.13, width=1.0):
    """Chunky high-top shoes with a sock above (Xiao Pei / Wei Bao)."""
    f = Field((-B.leg_x - 0.1, -0.16, -0.01), (B.leg_x + 0.1, 0.1, sock_top + 0.03), vs=0.002)
    for g in (1, -1):
        x = B.leg_x * 1.02 * g
        f.add(Capsule((x, 0.0, sock_top), (x, 0.0, 0.07), 0.031), k=0.0)  # sock
        f.add(Box((x, -0.018, 0.04), (0.04 * width, 0.066, 0.036), 0.028), k=0.015)  # upper
        f.add(Ellipsoid((x, -0.062, 0.035), (0.04 * width, 0.038, 0.032)), k=0.015)  # round toe
        f.add(Box((x, -0.02, 0.009), (0.043 * width, 0.071, 0.009), 0.008), k=0.004)  # sole
        f.add(Capsule((x, -0.008, collar - 0.015), (x, 0.004, collar - 0.01), 0.035), k=0.012)  # ankle collar
    return f


def laces(f, B, z=0.072, y=-0.063):
    """Bow laces on the front of both shoes (added to an accessories field)."""
    for g in (1, -1):
        x = B.leg_x * 1.02 * g
        for sd in (1, -1):
            f.add(Scaled(Torus((x + 0.014 * sd, y, z), 0.012, 0.005, rot(0, 90, 20 * sd)), (1, 1, 1.2),
                         (x + 0.014 * sd, y, z)), k=0.003)


# ---------------------------------------------------------------- weights

def leg_weights(B, top=0.04):
    """Trousers: each leg follows its own thigh / shin, a narrow blend at the crotch, the waist the hips."""
    def fn(P):
        x, z = P[:, 0], P[:, 2]
        left = np.clip(0.5 + x / 0.012, 0, 1)
        hip = np.clip((z - (B.hip_z - top)) / 0.06, 0, 1)
        upper = np.clip((z - (B.knee_z - 0.04)) / 0.08, 0, 1)
        th, sh = (1 - hip) * upper, (1 - hip) * (1 - upper)
        W = np.stack([hip, th * left, sh * left, th * (1 - left), sh * (1 - left)], axis=1)
        return ['hips', 'thigh_L', 'shin_L', 'thigh_R', 'shin_R'], W
    return fn


def hem_weights(B, share=0.35):
    """A hem follows the hips, and each side a little of its thigh (so walking doesn't cut through it)."""
    def fn(P):
        x, z = P[:, 0], P[:, 2]
        left = np.clip(0.5 + x / 0.06, 0, 1)
        leg = np.clip((B.hip_z - z) / 0.07, 0, 1) * share
        return ['hips', 'thigh_L', 'thigh_R'], np.stack([1 - leg, leg * left, leg * (1 - left)], axis=1)
    return fn


HEAD_WEIGHTS = ('auto', ['head', 'neck', 'chest'])
SHOE_WEIGHTS = ('dist', ['shin_L', 'foot_L', 'shin_R', 'foot_R'])

# ---------------------------------------------------------------- paint


def lin(h):
    return F.lin(h)


def shade(ao, ao_f):
    """Baked shading multiplied into the albedo (the lights in the game add the rest)."""
    return (0.5 + 0.5 * np.clip(ao, 0, 1) ** 1.3) * (0.7 + 0.3 * np.clip(ao_f, 0, 1))


def _hash(n):
    return (np.sin(n * 127.1 + 311.7) * 43758.5453) % 1.0


def noise1(x):
    i = np.floor(x)
    f = x - i
    f = f * f * (3 - 2 * f)
    return _hash(i) * (1 - f) + _hash(i + 1) * f


def mixc(a, b, t):
    t = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return a * (1 - t) + b * t


def paint_hair(col, P, N, crown, sheen='#6a5a55', strands=(30, 70)):
    """Strand streaks radiating from the crown and a soft highlight on top."""
    v = P - crown
    az = np.arctan2(v[:, 0], -v[:, 1])
    k = noise1(az * strands[0]) * 0.7 + noise1(az * strands[1] + 3) * 0.3
    col = col * (0.86 + 0.3 * k)[:, None]
    up = np.clip(N[:, 2] * 0.8 - N[:, 1] * 0.3, 0, 1)
    return col + lin(sheen) * (0.25 * up ** 3 * k)[:, None]
