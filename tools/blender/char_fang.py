# SPDX-License-Identifier: GPL-3.0-only
"""Master Fang Qiuyue (ref/fangqiuye.png), built by chibi.py with the character kit.

Tiny and round: a tan tweed flat cap with an orange knit band over white curly hair, round wire glasses, small
dark dot eyes, rosy cheeks and smile lines. Her body starts from the base mesh (tools/blender/base/hero_male.glb): its
shirt becomes her chunky orange knit cardigan (over a cream undershirt, rolled cuffs at the wrists, a long
sculpted hem), its trousers her grey checked ones; the boots become sculpted felt slippers. Wooden buttons,
patch pockets with sweets, the knotted checked scarf and the tote bag in her right hand are sculpted.
"""
import math
import numpy as np
from sdf import Field, Ellipsoid, Sphere, RoundCone, Capsule, Box, Torus, Tube, Scaled, catmull, rot, lerp_list
import face as F
import kit
from kit import REG

NAME = 'fang'
B = kit.Body(height=1.0, skull_c=(0, 0.004, 0.83), skull_r=(0.15, 0.144, 0.14), neck=(0.615, 0.715),
             shoulder=(0.1, 0, 0.605), upper=0.1, fore=0.095, hand=0.058,
             hip_z=0.33, leg_x=0.072, knee_z=0.185, ankle_z=0.058, waist_z=0.37, chest_z=0.495, collar_z=0.64,
             eye_z=0.815, mouth_z=0.752, foot_len=0.075)
H, ARM_DOWN, EYE_Z, MOUTH_Z = 1.02, B.arm_down, B.eye_z, B.mouth_z

COL = {
    'skin': '#f2c9b0', 'hair': '#f2efe9', 'cardigan': '#e8843a', 'cuff': '#d06f2a', 'undershirt': '#f1e9d8',
    'trousers': '#7d7a70', 'slipper': '#bdb3a3', 'cap': '#a88c68', 'band': '#e27a36', 'glasses': '#6b4a33',
    'scarf': '#c9a27a', 'button': '#5a3d2a', 'bag': '#a8916b', 'sweet_a': '#f6c945', 'sweet_b': '#e86f5c',
}
EYES = F.EyeStyle(skin=COL['skin'], dot=True, cx=0.056, w=0.0135, h=0.0155, pupil='#15100d', lashes=0,
                  brow='#d9d4cc', brow_w=0.0042, brow_len=0.026, brow_z=0.036, blush='#ee9f8a', blush_z=-0.03,
                  freckles=None, wrinkles='#c98f78')
MOUTH = F.MouthStyle(skin=COL['skin'], w=0.012, line='#a05a4d')

# ---------------------------------------------------------------- head: curls, cap, glasses


def hair_field():
    """White curls puffing out below the cap at the sides and the back."""
    hp = B.head_pt
    f = Field((-0.24, -0.2, B.skull_c[2] - 0.2), (0.24, 0.24, B.skull_c[2] + 0.16), vs=0.0025)
    c, r = kit.cap(B, grow=(0.01, 0.012, 0.012))
    f.add(Ellipsoid(c, r))
    f.sub(Ellipsoid(hp(0, -0.2, -0.04), (0.13, 0.16, 0.11)), k=0.012)
    f.sub(Box((0, -0.04, B.skull_c[2] - 0.23), (0.3, 0.22, 0.08)), k=0.02)
    rng = np.random.default_rng(5)
    for g in (1, -1):
        for (x, y, z, rad) in ((0.15, -0.02, 0.0, 0.05), (0.155, 0.04, -0.045, 0.052), (0.13, -0.035, -0.06, 0.042),
                               (0.12, 0.1, -0.02, 0.05), (0.08, 0.13, -0.06, 0.05)):
            f.add(Sphere(hp(x * g, y, z), rad * (0.9 + 0.2 * rng.random())), k=0.018)
    f.add(Sphere(hp(0, 0.14, -0.04), 0.055), k=0.02)
    f.displace(lambda X, Y, Z, d: 0.003 * np.sin(X * 110) * np.sin(Y * 100) * np.sin(Z * 115) * (np.abs(d) < 0.012))
    return f


def cap_field():
    """A flat tweed newsboy cap with an orange knit band, a short brim and a button on top."""
    hp = B.head_pt
    f = Field((-0.28, -0.3, B.skull_c[2] + 0.02), (0.28, 0.26, B.skull_c[2] + 0.22), vs=0.0025)
    f.add(Ellipsoid(hp(0, 0.01, 0.12), (0.225, 0.215, 0.07), rot(-6, 0, 0)))
    f.add(Scaled(Torus(hp(0, 0.004, 0.083), 0.158, 0.026), (1.0, 0.98, 1.0), hp(0, 0.004, 0.083)), k=0.012)  # band
    f.add(Ellipsoid(hp(0, -0.16, 0.07), (0.11, 0.06, 0.012), rot(-14, 0, 0)), k=0.01)  # brim
    f.add(Sphere(hp(0, 0.01, 0.192), 0.018), k=0.006)
    f.sub(Ellipsoid(B.skull_c + [0, 0.008, 0], B.skull_r + 0.006), k=0.004)
    return f


def glasses_field():
    """Round wire glasses resting on the nose, arms back to the ears."""
    hp = B.head_pt
    f = Field((-0.2, -0.2, B.eye_z - 0.08), (0.2, 0.05, B.eye_z + 0.08), vs=0.0015)
    y = -B.skull_r[1] - 0.012
    for g in (1, -1):
        cx = EYES.cx * g
        f.add(Torus((cx, y + abs(cx) * 0.25, B.eye_z), 0.031, 0.0033, rot(90, 0, 18 * g)))
        f.add(Capsule((0.087 * g, y + 0.03, B.eye_z + 0.004), (0.15 * g, 0.0, B.eye_z + 0.01), 0.003), k=0.002)
    f.add(Capsule((-0.024, y + 0.002, B.eye_z + 0.006), (0.024, y + 0.002, B.eye_z + 0.006), 0.003), k=0.002)
    return f

# ---------------------------------------------------------------- body from the base mesh


EXT = {'pelvis': (0.125, 0.14), 'torso': (0.15, 0.172), 'shoulders': (0.122, 0.15), 'head': (0.04, 0.04),
       'bicep': (0.058, 0.058), 'forearm': (0.058, 0.058), 'wrist': (0.054, 0.054), 'hand': (0.028, 0.017),
       'fingers_base': (0.025, 0.014), 'fingers_mid': (0.023, 0.013), 'fingers_tip': (0.021, 0.012),
       'thumb': (0.011, 0.011), 'thigh': (0.078, 0.078), 'shin': (0.068, 0.068), 'foot': (0.07, 0.055)}
KNOTS = {'shin': ([0, 0.64, 0.70, 1], [0, 0.73, 0.79, 1])}
SLEEVE = ([0.0, 0.05, 0.1, 0.15, 0.165, 0.18, 0.195], [0.062, 0.063, 0.063, 0.058, 0.053, 0.059, 0.056])


def regions(ob, base, vb):
    reg = kit.base_to(base, {'shirt': 'top', 'bracer': 'cuff', 'hand': 'skin', 'trousers': 'bottom', 'boot': 'shoe',
                             'belt': 'top', 'arm_skin': 'top', 'neck': 'skin'})
    for p in ob.data.polygons:
        if reg[p.index] in (REG['top'], REG['cuff']):
            s, dist = B.arm_s(p.center, 1 if p.center.x > 0 else -1)
            reg[p.index] = REG['cuff'] if s > B.upper + B.fore - 0.026 and dist < 0.09 else REG['top']
    return reg


def reshape(ob, region, vb):
    kit.sleeves(ob, region, vb, B, SLEEVE)
    kit.puff(ob, region, {'top': 0.01}, max_x=0.15)
    kit.puff(ob, region, {'bottom': 0.004})


def trim(ob, region):
    return kit.trim(ob, region, lambda r, c: (r == REG['top'] and c[2] < B.waist_z - 0.012) or r == REG['shoe'])


def outfit():
    return kit.hero_outfit(B, EXT, KNOTS, regions, reshape, trim)


def scarf_field():
    """A checked scarf wound around the neck and knotted at the front, two short ends."""
    z = B.collar_z + 0.008
    f = Field((-0.16, -0.2, z - 0.14), (0.16, 0.14, z + 0.07), vs=0.0022)
    f.add(Scaled(Torus((0, 0.0, z), 0.075, 0.03), (1.08, 1.0, 0.85), (0, 0.0, z)))
    knot = np.array([0.03, -0.1, z - 0.02])
    f.add(Ellipsoid(knot, (0.038, 0.028, 0.034)), k=0.012)
    for dx, ln in ((-0.012, 0.09), (0.026, 0.07)):
        p = catmull([knot + [dx, -0.005, -0.015], knot + [dx * 1.5, -0.012, -ln * 0.5], knot + [dx * 2, -0.006, -ln]], n=8)
        f.add(Tube(p, lerp_list([0.026, 0.028, 0.024], np.linspace(0, 1, len(p))), flat=0.35, flat_dir=(0, -1, 0)), k=0.006)
    return f


def slippers_field():
    f = Field((-B.leg_x - 0.09, -0.14, -0.01), (B.leg_x + 0.09, 0.1, 0.12), vs=0.002)
    for g in (1, -1):
        x = B.leg_x * 1.02 * g
        f.add(Capsule((x, 0.0, 0.1), (x, 0.0, 0.05), 0.034), k=0.0)  # thick socks
        f.add(Ellipsoid((x, -0.018, 0.034), (0.052, 0.074, 0.037)), k=0.02)  # round felt slipper
        f.add(Ellipsoid((x, -0.05, 0.036), (0.046, 0.045, 0.034)), k=0.02)  # a fat toe
        f.add(Box((x, -0.02, 0.008), (0.05, 0.075, 0.008), 0.008), k=0.006)
    return f


POCKETS = [np.array([0.1 * g, -0.148, 0.305]) for g in (1, -1)]


def gear_field():
    """Wooden buttons down the cardigan, patch pockets with sweets peeking out."""
    f = Field((-0.22, -0.24, 0.2), (0.22, 0.05, B.collar_z), vs=0.0018)
    for i, z in enumerate((0.33, 0.42, 0.51)):
        f.add(Ellipsoid((0.042, -0.162 + (z - 0.42) * 0.12 + abs(z - 0.42) * 0.25, z), (0.012, 0.007, 0.012)))
    for c in POCKETS:
        f.add(Box(c, (0.045, 0.012, 0.042), 0.01, rot(-6, 0, 12 * np.sign(c[0]))), k=0.004)
        f.add(Ellipsoid(c + [0.01, -0.004, 0.045], (0.02, 0.014, 0.016), rot(0, 30, 0)), k=0.004)  # sweet
    return f


def bag_field():
    """A checked tote bag held in her right hand."""
    sh, el, wr, tip = B.arm_points(-1)
    c = tip + np.array([0, 0, -0.075])
    f = Field(c - 0.12, c + 0.12, vs=0.002)
    f.add(Box(c, (0.062, 0.03, 0.07), 0.018))
    f.add(Torus(c + [0, 0, 0.07], 0.036, 0.006, rot(90, 0, 90)), k=0.004)  # handle loop around the hand
    return f


GROUPS = [
    ('skin', lambda: kit.head_field(B, cheeks=1.15, chin=0.9, nose=1.35, ears=0.9, jowls=0.6), 'skin', 'skin', 850, True),
    ('hair', hair_field, 'hair', 'hair', 560, True),
    ('cap', cap_field, 'cloth', 'cap', 380, True),
    ('glasses', glasses_field, 'plain', 'glasses', 220, True),
    ('outfit', outfit, 'cloth', 'cardigan', 1750, True),
    ('hem', lambda: kit.hem_field(B, B.waist_z - 0.008, B.hip_z - 0.075, 0.172, 0.186, depth=0.86, open_front=0),
     'cloth', 'cardigan', 280, True),
    ('scarf', scarf_field, 'cloth', 'scarf', 320, False),
    ('slippers', slippers_field, 'plain', 'slipper', 300, True),
    ('gear', gear_field, 'plain', 'button', 300, False),
    ('bag', bag_field, 'cloth', 'bag', 200, False),
]
CULL = {'skin': ['hair', 'cap', 'scarf'], 'hair': ['cap']}

# ---------------------------------------------------------------- rig


def joints():
    return B.joints()


WEIGHTS = {
    'skin': kit.HEAD_WEIGHTS,
    'hair': ('rigid', 'head'),
    'cap': ('rigid', 'head'),
    'glasses': ('rigid', 'head'),
    'outfit': ('keep',),
    'hem': ('fn', kit.hem_weights(B)),
    'scarf': ('dist', ['chest', 'neck']),
    'slippers': kit.SHOE_WEIGHTS,
    'gear': ('split', lambda c: 'hips' if c[2] < B.waist_z else 'spine' if c[2] < B.chest_z else 'chest'),
    'bag': ('rigid', 'hand_R'),
}

# ---------------------------------------------------------------- paint


def face_kind(group, c, n, region=None):
    if group == 'outfit':
        return 'skin' if region == REG['skin'] else 'cloth'
    if group in ('hem', 'scarf', 'cap', 'bag'):
        return 'cloth'
    return None


def face_shade(ao, ao_f):
    return kit.shade(ao, ao_f)


def knit(col, P):
    """Chunky knit: vertical ribs of stitches."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    az = np.arctan2(x, -y)
    k = (0.5 + 0.5 * np.sin(az * 36)) * (0.5 + 0.5 * np.sin(z * 150 + np.sin(az * 36) * 1.5))
    return col * (0.94 + 0.07 * k)[:, None]


def paint(g, P, N, ao, ao_f, base, region=None):
    lin = kit.lin
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    col = np.array(base, float)
    if g == 'outfit':
        col = np.tile(lin(COL['cardigan']), (len(P), 1))
        col[region == REG['cuff']] = lin(COL['cuff'])
        col[region == REG['skin']] = lin(COL['skin'])
        col[region == REG['bottom']] = lin(COL['trousers'])
        top = region == REG['top']
        col[top] = knit(col[top], P[top])
        # the cream undershirt showing down the front of the open cardigan
        col[top & (np.abs(x) < 0.03) & (y < -0.06) & (z > B.waist_z - 0.02)] = lin(COL['undershirt'])
        col[(region == REG['bottom']) & (z < 0.1)] *= 0.92
    elif g == 'hem':
        col = knit(col, P)
    elif g == 'hair':
        col *= (0.95 + 0.06 * kit.noise1(x * 60 + z * 50))[:, None]
    elif g == 'cap':
        band = z < B.skull_c[2] + 0.1
        col[band] = knit(np.tile(lin(COL['band']), (int(band.sum()), 1)), P[band])
        col[~band] *= (0.94 + 0.07 * kit.noise1(x * 80 + y * 70 + z * 30))[~band, None]  # tweed
    elif g == 'slippers':
        col[z > 0.05] = lin('#d8cfc0')
    elif g == 'gear':
        col[:] = lin(COL['cardigan'])
        col[z > 0.32] = lin(COL['button'])
        for c in POCKETS:
            near = np.linalg.norm(P - c, axis=1) < 0.06
            col[near] = lin(COL['cuff'])
            sweet = np.linalg.norm(P - (c + [0.01, -0.004, 0.045]), axis=1) < 0.024
            col[sweet] = lin(COL['sweet_a'] if c[0] > 0 else COL['sweet_b'])
    return col * kit.shade(ao, ao_f)[:, None]
