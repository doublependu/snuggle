# SPDX-License-Identifier: GPL-3.0-only
"""Lin Tangtang (ref/lintangtang.png, the middle variant), built by chibi.py with the character kit.

A second-year, a head taller than Xiao Pei: a teal beret with a tan band over a dark bob with thin side
plaits, confident eyes. Her body starts from the base mesh (tools/blender/base/hero_male.glb): its shirt becomes her teal
chambray shirt (sleeves rolled to the forearm, a cream apron bib showing at the front), its bracers and hands
her dark gloves, its belt her leather belt, its trousers her very baggy cream ones and its boots her boots
(with wraps painted on). The orange sash (knot and tails on her left hip, on a spring), the belt pouches
with bread, the crossbody strap and the beret are sculpted.
"""
import math
import numpy as np
from sdf import Field, Ellipsoid, RoundCone, Capsule, Box, Torus, Tube, Scaled, catmull, rot, lerp_list
import face as F
import kit
from kit import REG

NAME = 'tangtang'
B = kit.Body(height=1.28, skull_c=(0, 0.004, 1.125), skull_r=(0.14, 0.133, 0.136), neck=(0.9, 1.005),
             shoulder=(0.112, 0, 0.882), upper=0.165, fore=0.145, hand=0.072,
             hip_z=0.56, leg_x=0.072, knee_z=0.31, ankle_z=0.08, waist_z=0.6, chest_z=0.745, collar_z=0.922,
             eye_z=1.11, mouth_z=1.043, foot_len=0.1)
H, ARM_DOWN, EYE_Z, MOUTH_Z = 1.33, B.arm_down, B.eye_z, B.mouth_z

COL = {
    'skin': '#f3cfb6', 'hair': '#2b211c', 'shirt': '#3f6f7a', 'bib': '#efe6d6', 'glove': '#3b2f2a',
    'belt': '#6b4a30', 'trousers': '#ede3cf', 'boot': '#6b4a33', 'wrap': '#9c7b58', 'sash': '#e0762c',
    'beret': '#3f6f7a', 'band': '#b98a5a', 'pouch': '#7a5436', 'bread': '#d9954a', 'strap': '#6b4a30',
}
EYES = F.EyeStyle(skin=COL['skin'], cx=0.057, w=0.025, h=0.026, iris='#4a2a18', iris_lo='#8a5a3a',
                  brow='#2b211c', brow_z=0.04, brow_w=0.0062, freckles=None, blush_z=-0.034)
MOUTH = F.MouthStyle(skin=COL['skin'], w=0.012)

# ---------------------------------------------------------------- head, hair, beret

CAP_C, CAP_R = kit.cap(B, grow=(0.015, 0.018, 0.015))


def hair_field():
    """A dark bob to the jaw with a side-swept fringe and two thin plaits by the ears."""
    hp = B.head_pt
    f = Field((-0.2, -0.2, B.skull_c[2] - 0.2), (0.2, 0.2, B.skull_c[2] + 0.17), vs=0.0025)
    f.add(Ellipsoid(CAP_C, CAP_R))
    f.sub(Ellipsoid(hp(0, -0.19, -0.056), (0.128, 0.15, 0.094)), k=0.012)  # the face
    f.sub(Box((0, -0.04, B.skull_c[2] - 0.24), (0.3, 0.22, 0.08)), k=0.02)
    # bob: fuller sides and back down to the jaw line
    for g in (1, -1):
        f.add(Ellipsoid(hp(0.118 * g, 0.03, -0.075), (0.045, 0.1, 0.075)), k=0.03)
    f.add(Ellipsoid(hp(0, 0.1, -0.07), (0.12, 0.06, 0.08)), k=0.03)
    # side-swept fringe: locks from the crown sweeping to her right, uneven tips
    for x, tip_z, sweep in ((-0.1, 0.05, -0.02), (-0.06, 0.036, -0.02), (-0.02, 0.03, -0.018), (0.02, 0.034, -0.015),
                            (0.06, 0.044, -0.012), (0.098, 0.058, -0.01)):
        kit.lock(f, [kit.on_cap(CAP_C, CAP_R, hp(x * 0.3 + 0.03, -0.02, 0.118), 0.008),
                     kit.on_cap(CAP_C, CAP_R, hp(x * 0.9 + sweep * 0.5, -0.105, 0.085), 0.002),
                     hp(x * 1.02 + sweep, -0.144 + abs(x) * 0.3, tip_z)], [0.012, 0.024, 0.021, 0.005],
                 flat=0.42, centre=B.skull_c, k=0.007)
    # locks over the sides and back of the bob, ending in points along the jaw (a: degrees from the front)
    for g in (1, -1):
        for a in (68, 95, 125, 155):
            r = math.radians(a)
            top = kit.on_cap(CAP_C, CAP_R, hp(math.sin(r) * 0.05 * g, -math.cos(r) * 0.05 + 0.02, 0.14), 0.006)
            mid = kit.on_cap(CAP_C, CAP_R, hp(math.sin(r) * 0.15 * g, -math.cos(r) * 0.12, 0.0), 0.002)
            end = hp(math.sin(r) * 0.135 * g, -math.cos(r) * 0.1 + 0.01, -0.13)
            kit.lock(f, [top, mid, end], [0.01, 0.028, 0.022, 0.006], flat=0.5, centre=B.skull_c, k=0.01)
    # thin plaits hanging in front of the shoulders
    for g in (1, -1):
        path = catmull([hp(0.125 * g, -0.03, -0.1), hp(0.13 * g, -0.035, -0.19), hp(0.132 * g, -0.03, -0.27)], n=12)
        for k in range(2):
            ph = np.linspace(0, 6 * math.pi, len(path)) + k * math.pi
            off = np.stack([np.sin(ph) * 0.006, np.cos(ph) * 0.004, np.zeros_like(ph)], axis=1)
            f.add(Tube(path + off, lerp_list([0.011, 0.01, 0.007], np.linspace(0, 1, len(path)))), k=0.003)
    crown = hp(0.02, 0.03, 0.14)
    f.displace(lambda X, Y, Z, d: 0.0008 * np.sin(np.arctan2(X - crown[0], -(Y - crown[1])) * 44) * (np.abs(d) < 0.01))
    return f


def beret_field():
    """A big soft teal beret, tilted to her left, with a tan band."""
    hp = B.head_pt
    f = Field((-0.25, -0.25, B.skull_c[2] + 0.02), (0.25, 0.25, B.skull_c[2] + 0.24), vs=0.0025)
    tilt = rot(4, -10, 0)
    f.add(Ellipsoid(hp(0.02, 0.01, 0.125), (0.19, 0.18, 0.075), tilt))
    f.add(Ellipsoid(hp(0.035, 0.02, 0.15), (0.15, 0.14, 0.06), tilt), k=0.04)
    f.add(Scaled(Torus(hp(0.008, 0.01, 0.086), 0.143, 0.017, tilt), (1.0, 0.97, 1.0), hp(0.008, 0.01, 0.086)), k=0.01)
    f.sub(Ellipsoid(B.skull_c + np.array([0, 0.012, 0.0]), B.skull_r + 0.006), k=0.004)  # sits on the head
    return f

# ---------------------------------------------------------------- body from the base mesh

EXT = {'pelvis': (0.1, 0.12), 'torso': (0.098, 0.128), 'shoulders': (0.098, 0.13), 'head': (0.04, 0.04),
       'bicep': (0.05, 0.05), 'forearm': (0.042, 0.042), 'wrist': (0.042, 0.042), 'hand': (0.03, 0.018),
       'fingers_base': (0.027, 0.014), 'fingers_mid': (0.025, 0.013), 'fingers_tip': (0.022, 0.012),
       'thumb': (0.011, 0.011), 'thigh': (0.092, 0.092), 'shin': (0.078, 0.078), 'foot': (0.07, 0.055)}
KNOTS = {'shin': ([0, 0.64, 0.70, 1], [0, 0.58, 0.66, 1])}
ROLL = 0.215  # rolled sleeve edge, along the arm from the shoulder joint
SLEEVE = ([0.0, 0.05, 0.14, 0.19, 0.205, 0.222, 0.236, 0.27, 0.31], [0.054, 0.053, 0.05, 0.052, 0.058, 0.052, 0.04, 0.038, 0.042])


def regions(ob, base, vb):
    """Shirt sleeves rolled up to ROLL, bare forearm below, gloves from the base's bracers down."""
    reg = kit.base_to(base, {'shirt': 'top', 'bracer': 'glove', 'hand': 'glove', 'trousers': 'bottom', 'boot': 'shoe',
                             'belt': 'belt', 'arm_skin': 'skin', 'neck': 'skin'})
    glove_s = B.upper + B.fore - 0.04
    for p in ob.data.polygons:
        if base[p.index] != kit.HB.BASE['hand'] and reg[p.index] in (REG['top'], REG['skin'], REG['glove']):
            s, dist = B.arm_s(p.center, 1 if p.center.x > 0 else -1)
            if dist < 0.09 and s > 0.03:
                reg[p.index] = REG['top'] if s < ROLL + 0.008 else REG['skin'] if s < glove_s else REG['glove']
    return reg


def reshape(ob, region, vb):
    kit.sleeves(ob, region, vb, B, SLEEVE, regions=('top', 'skin', 'glove'))
    kit.puff(ob, region, {'bottom': 0.006})


def trim(ob, region):
    """The tunic's split flaps go (her shirt is tucked into the trousers under the sash)."""
    return kit.trim(ob, region, lambda r, c: r == REG['top'] and c[2] < B.waist_z - 0.012)


def outfit():
    return kit.hero_outfit(B, EXT, KNOTS, regions, reshape, trim)


SASH_Z = B.waist_z + 0.028
KNOT = np.array([0.1, -0.095, SASH_Z])


def sash_field():
    """The orange sash wrapped over the belt, knotted on her left hip, two tails hanging down."""
    f = Field((-0.2, -0.2, B.hip_z - 0.26), (0.24, 0.2, SASH_Z + 0.08), vs=0.0025)
    c = np.array([0, 0.004, SASH_Z])
    f.add(Scaled(RoundCone(c + [0, 0, 0.022], c - [0, 0, 0.022], 0.13, 0.134), (1.0, 0.8, 1.0), c))
    f.sub(Scaled(RoundCone(c + [0, 0, 0.07], c - [0, 0, 0.07], 0.112, 0.116), (1.0, 0.78, 1.0), c), k=0.004)
    f.add(Ellipsoid(KNOT, (0.03, 0.022, 0.028)), k=0.01)
    for dx, ln, sw in ((-0.012, 0.2, -0.01), (0.018, 0.16, 0.012)):
        p = catmull([KNOT + [dx, -0.004, -0.01], KNOT + [dx + sw, -0.012, -ln * 0.5], KNOT + [dx + sw * 2, -0.006, -ln]], n=10)
        f.add(Tube(p, lerp_list([0.018, 0.022, 0.02], np.linspace(0, 1, len(p))), flat=0.3, flat_dir=(0.3, -1, 0)), k=0.006)
    return f


def gear_field():
    """Leather pouches on the belt (one with a loaf of bread) and the crossbody strap."""
    f = Field((-0.22, -0.2, B.hip_z - 0.1), (0.22, 0.2, B.collar_z + 0.02), vs=0.002)
    for c, h in (((-0.105, -0.085, B.waist_z - 0.035), (0.034, 0.02, 0.036)), ((-0.14, 0.03, B.waist_z - 0.03), (0.02, 0.03, 0.032))):
        f.add(Box(c, h, 0.01, rot(0, 0, 25 if c[1] < 0 else 70)))
    f.add(Ellipsoid((-0.105, -0.1, B.waist_z + 0.012), (0.032, 0.02, 0.02), rot(0, 20, 25)), k=0.004)  # bread
    p = catmull([(-0.095, 0.02, B.collar_z - 0.01), (-0.06, -0.09, B.chest_z + 0.06), (0.06, -0.105, B.waist_z + 0.07),
                 (0.12, -0.05, B.waist_z + 0.02)], n=14)
    f.add(Tube(p, 0.008, flat=0.4, flat_dir=[(0, -1, 0.2)]), k=0.003)
    return f


GROUPS = [
    ('skin', lambda: kit.head_field(B, cheeks=0.9, chin=1.05), 'skin', 'skin', 900, True),
    ('hair', hair_field, 'hair', 'hair', 1150, False),
    ('beret', beret_field, 'plain', 'beret', 380, False),
    ('outfit', outfit, 'cloth', 'shirt', 2300, True),
    ('sash', sash_field, 'plain', 'sash', 400, False),
    ('seat', lambda: kit.waistband(B, B.waist_z, B.hip_z - 0.07, 0.122, 0.128), 'cloth', 'trousers', 260, True),
    ('gear', gear_field, 'plain', 'pouch', 360, False),
]
CULL = {'skin': ['hair', 'beret'], 'hair': ['beret']}

# ---------------------------------------------------------------- rig


def joints():
    k0 = KNOT + [0.003, 0, -0.01]
    extra = {'spring_sash_1': (tuple(k0), tuple(k0 + [0.008, -0.01, -0.09]), 'hips'),
             'spring_sash_2': (tuple(k0 + [0.008, -0.01, -0.09]), tuple(k0 + [0.016, -0.004, -0.19]), 'spring_sash_1')}
    return B.joints(extra)


def sash_weights(P):
    """The band follows the hips; the tails swing on their spring bones."""
    d = np.linalg.norm(P - KNOT, axis=1)
    below = np.clip((KNOT[2] - 0.02 - P[:, 2]) / 0.03, 0, 1) * (d < 0.25)
    t2 = np.clip((KNOT[2] - 0.09 - P[:, 2]) / 0.05, 0, 1) * below
    return ['hips', 'spring_sash_1', 'spring_sash_2'], np.stack([1 - below, below - t2, t2], axis=1)


WEIGHTS = {
    'skin': kit.HEAD_WEIGHTS,
    'hair': ('rigid', 'head'),
    'beret': ('rigid', 'head'),
    'outfit': ('keep',),
    'sash': ('fn', sash_weights),
    'seat': ('fn', kit.leg_weights(B, top=0.0)),
    'gear': ('split', lambda c: 'hips' if c[2] < B.waist_z + 0.03 else 'chest'),
}

# ---------------------------------------------------------------- paint


def face_kind(group, c, n, region=None):
    if group == 'outfit':
        if region in (REG['skin'],):
            return 'skin'
        if region in (REG['glove'], REG['belt'], REG['shoe']):
            return 'plain'
        return 'cloth'
    return None


def face_shade(ao, ao_f):
    return kit.shade(ao, ao_f)


def paint(g, P, N, ao, ao_f, base, region=None):
    lin = kit.lin
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    col = np.array(base, float)
    if g == 'outfit':
        col = np.tile(lin(COL['shirt']), (len(P), 1))
        for name, key in (('skin', 'skin'), ('glove', 'glove'), ('belt', 'belt'), ('bottom', 'trousers'), ('shoe', 'boot')):
            col[region == REG[name]] = lin(COL[key])
        top = region == REG['top']
        # cream apron bib and undershirt showing in a V at the front
        bib = top & (y < -0.03) & (z > B.waist_z) & (np.abs(x) < 0.058 - np.clip(z - B.chest_z - 0.07, 0, 1) * 0.3)
        col[bib] = lin(COL['bib'])
        # the rolled sleeve edge, lighter lining
        for gg in (1, -1):
            s = (P - B.shoulder * [gg, 1, 1]) @ B.arm_dir(gg)
            col[top & (x * gg > 0.12) & (np.abs(s - ROLL + 0.004) < 0.009)] = lin('#d9d2c2')
        # boot wraps
        shoe = region == REG['shoe']
        col[shoe & (np.sin(z * 180) > 0.55) & (z > 0.05)] = lin(COL['wrap'])
        col[shoe & (z < 0.018)] = lin('#3f2e22')
        col[(region == REG['bottom']) & (z < B.ankle_z + 0.09)] *= 0.93
    elif g == 'hair':
        col = kit.paint_hair(col, P, N, B.head_pt(0.02, 0.03, 0.14))
    elif g == 'beret':
        band = z < B.skull_c[2] + 0.105
        col[band] = lin(COL['band'])
        col[~band] *= (0.92 + 0.12 * kit.noise1(x * 90 + y * 60))[~band, None]
    elif g == 'gear':
        col[:] = lin(COL['pouch'])
        col[np.linalg.norm(P - np.array([-0.105, -0.1, B.waist_z + 0.012]), axis=1) < 0.04] = lin(COL['bread'])
        col[z > B.waist_z + 0.04] = lin(COL['strap'])
    return col * kit.shade(ao, ao_f)[:, None]
