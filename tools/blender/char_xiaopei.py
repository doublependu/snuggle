# SPDX-License-Identifier: GPL-3.0-only
"""Xiao Pei (ref/xiaopei_1.png), built by chibi.py with the character kit (kit.py).

Head, hair and braid are sculpted with signed distance fields: a round head with a painted face, blunt bangs,
and a thick three-strand braid swinging off her right side. Her body starts from the base mesh
(tools/blender/base/hero_male.glb, hero_base.py), warped onto her A-pose skeleton and reshaped toward the ref photo: its
shirt becomes the oversized mustard jacket, its bracers the rolled cuffs, its rolled trousers her baggy
gathered ones. The jacket's closed hem, the hood (Doudou sleeps in it), her shirt collar, the high-tops,
the yarn skein on its strap and the laces are sculpted on top.
"""
import math
import numpy as np
from sdf import Field, Ellipsoid, RoundCone, Box, Torus, Tube, Scaled, catmull, rot, lerp_list
import face as F
import kit
from kit import REG

NAME = 'xiaopei'
B = kit.Body(height=1.13, skull_c=(0, 0.004, 0.97), skull_r=(0.145, 0.138, 0.14), neck=(0.745, 0.85),
             shoulder=(0.098, 0, 0.728), upper=0.132, fore=0.12, hand=0.066,
             hip_z=0.44, leg_x=0.066, knee_z=0.245, ankle_z=0.075, waist_z=0.475, chest_z=0.62, collar_z=0.765,
             eye_z=0.955, mouth_z=0.888, head_top=1.11)
H, ARM_DOWN, EYE_Z, MOUTH_Z = B.height, B.arm_down, B.eye_z, B.mouth_z

COL = {
    'skin': '#f6d5c3', 'hair': '#231c1a', 'jacket': '#e3a23c', 'lining': '#b98f5f', 'shirt': '#f2ebdd',
    'trousers': '#eee4cf', 'sock': '#d8cdb8', 'shoe': '#ece2cc', 'sole': '#c9b99c', 'lace': '#dd6a2c',
    'tie': '#e0662c', 'yarn': '#e1873a', 'strap': '#8a5a33',
}
EYES = F.EyeStyle(skin=COL['skin'], cx=0.06, w=0.027, h=0.03)
MOUTH = F.MouthStyle(skin=COL['skin'])

# ---------------------------------------------------------------- head and hair

CAP_C, CAP_R = kit.cap(B)


def on_cap(p, inset=0.0):
    return kit.on_cap(CAP_C, CAP_R, p, inset)


def hair_field():
    f = Field((-0.2, -0.2, B.skull_c[2] - 0.19), (0.2, 0.2, B.skull_c[2] + 0.17), vs=0.0025)
    hp = B.head_pt
    f.add(Ellipsoid(CAP_C, CAP_R))
    # open the face below the fringe line; the sides stay as hair framing the cheeks
    f.sub(Ellipsoid(hp(0, -0.19, -0.058), (0.13, 0.15, 0.095)), k=0.012)
    f.sub(Box((0, -0.06, B.skull_c[2] - 0.23), (0.3, 0.2, 0.08)), k=0.02)  # nothing under the jaw
    # fringe: flattened locks from the crown to blunt tips just above the brows
    for x, tip_z, curl in ((-0.1, 0.044, 0.004), (-0.062, 0.04, -0.003), (-0.022, 0.036, 0.002),
                           (0.018, 0.037, -0.002), (0.058, 0.04, 0.003), (0.1, 0.046, -0.004), (0.0, 0.043, 0.0)):
        kit.lock(f, [on_cap(hp(x * 0.3, -0.02, 0.118), 0.008), on_cap(hp(x * 0.9, -0.105, 0.085), 0.002),
                     hp(x * 1.02 + curl, -0.147 + abs(x) * 0.3, tip_z)], [0.012, 0.024, 0.022, 0.006],
                 flat=0.42, centre=B.skull_c, k=0.007)
    # side locks falling past the cheeks, in front of the ears
    for g in (1, -1):
        for x, z_end, y0 in ((0.137, -0.15, -0.07), (0.152, -0.13, -0.03)):
            pts = [on_cap(hp(x * g * 0.78, y0 + 0.03, 0.035), 0.006), hp(x * g, y0, -0.02),
                   hp((x + 0.003) * g, y0 - 0.008, -0.09), hp((x - 0.012) * g, y0 - 0.004, z_end)]
            p = catmull(pts, n=8)
            f.add(Tube(p, lerp_list([0.012, 0.021, 0.016, 0.004], np.linspace(0, 1, len(p))), flat=0.5,
                       flat_dir=[(q - np.array([0, 0, q[2]])) for q in p]), k=0.009)
    # locks over the back of the head, sweeping down toward the braid at her right nape
    for a in (-70, -40, -12, 16, 44, 72):
        r = math.radians(a)
        kit.lock(f, [on_cap(hp(math.sin(r) * 0.05, 0.03, 0.15), 0.008),
                     on_cap(hp(math.sin(r) * 0.15, 0.1 + math.cos(r) * 0.03, 0.04), 0.004),
                     hp(-0.045 + math.sin(r) * 0.06, 0.13, -0.085)], [0.012, 0.03, 0.026, 0.012],
                 flat=0.45, centre=B.skull_c, k=0.01)
    f.add(Ellipsoid(hp(-0.045, 0.12, -0.085), (0.075, 0.048, 0.065)), k=0.03)  # gathered into the braid
    # one loose strand curling off the crown (the ref's flyaways)
    p = catmull([hp(0.02, 0.01, 0.165), hp(0.035, -0.02, 0.19), hp(0.07, -0.055, 0.185), hp(0.095, -0.07, 0.168)], n=10)
    f.add(Tube(p, lerp_list([0.006, 0.005, 0.003, 0.0015], np.linspace(0, 1, len(p)))), k=0.005)
    # fine strand grooves radiating from the crown (they end up in the baked occlusion)
    crown = hp(0, 0.03, 0.14)
    f.displace(lambda X, Y, Z, d: 0.0009 * np.sin(np.arctan2(X - crown[0], -(Y - crown[1])) * 46) * (np.abs(d) < 0.01))
    return f


DZ = B.skull_c[2] - 0.99  # the braid path was laid out for a skull centre at 0.99
BRAID_PATH = [(x, y, z + DZ) for x, y, z in
              ((-0.05, 0.13, 0.905), (-0.1, 0.15, 0.81), (-0.14, 0.15, 0.69), (-0.16, 0.14, 0.57), (-0.168, 0.13, 0.47))]


def _frame_z(z):
    z = np.asarray(z, float) / np.linalg.norm(z)
    x = np.cross([0, 1.0, 0], z)
    x /= np.linalg.norm(x)
    return np.stack([x, np.cross(z, x), z], axis=1)


def braid_field():
    """A real three-strand braid: three phase-shifted lobes woven along a path, a tie and a flared tuft."""
    f = Field((-0.28, 0.0, 0.3 + DZ), (0.0, 0.26, 0.96 + DZ), vs=0.0025)
    path = catmull(BRAID_PATH, n=24)
    t = np.linspace(0, 1, len(path))
    L = np.cumsum(np.r_[0, np.linalg.norm(np.diff(path, axis=0), axis=1)])
    tang = np.gradient(path, axis=0)
    tang /= np.linalg.norm(tang, axis=1)[:, None]
    side = np.cross(tang, np.array([0, 1.0, 0]))
    side /= np.linalg.norm(side, axis=1)[:, None]
    depth = np.cross(side, tang)
    width = lerp_list([0.042, 0.04, 0.036, 0.03], t)
    for k in range(3):
        ph = 2 * math.pi * (L / 0.085) + k * 2 * math.pi / 3
        off = side * (np.sin(ph) * width * 0.55)[:, None] + depth * (np.sin(2 * ph) * width * 0.18)[:, None]
        f.add(Tube(path + off, width * 0.55, flat=0.8, flat_dir=depth), k=0.004)
    end = path[-1]
    f.add(Torus(end + tang[-1] * 0.004, 0.019, 0.009, _frame_z(tang[-1])), k=0.0)
    for a in np.linspace(0, 2 * math.pi, 7, endpoint=False):
        dirv = tang[-1] + (side[-1] * math.cos(a) + depth[-1] * math.sin(a)) * 0.22
        f.add(RoundCone(end + tang[-1] * 0.01, end + dirv * 0.09, 0.014, 0.003), k=0.006)
    return f


def braid_bones():
    path = catmull(BRAID_PATH, n=24)
    L = np.cumsum(np.r_[0, np.linalg.norm(np.diff(path, axis=0), axis=1)])
    return [tuple(path[np.searchsorted(L, L[-1] * k / 3)]) if k < 3 else tuple(path[-1]) for k in range(4)]

# ---------------------------------------------------------------- body from the base mesh

EXT = {'pelvis': (0.1, 0.125), 'torso': (0.12, 0.16), 'shoulders': (0.108, 0.14), 'head': (0.035, 0.035),
       'bicep': (0.06, 0.06), 'forearm': (0.062, 0.062), 'wrist': (0.056, 0.056), 'hand': (0.026, 0.016),
       'fingers_base': (0.024, 0.013), 'fingers_mid': (0.022, 0.012), 'fingers_tip': (0.02, 0.011),
       'thumb': (0.01, 0.01), 'thigh': (0.075, 0.075), 'shin': (0.068, 0.068), 'foot': (0.075, 0.06)}
# trousers end at the ankle over the shoes; the tunic's long flaps are cut below the belt (see trim)
KNOTS = {'shin': ([0, 0.64, 0.70, 1], [0, 0.73, 0.79, 1]), 'pelvis': ([0, 1, 3.2], [0, 1, 1.9])}
SLEEVE = ([0.0, 0.05, 0.13, 0.2, 0.222, 0.238, 0.252], [0.064, 0.064, 0.066, 0.06, 0.055, 0.06, 0.057])


def regions(ob, base, vb):
    """Shirt, short sleeves and bare forearms become the jacket; the bracers a rolled cuff at the wrist."""
    reg = kit.base_to(base, {'shirt': 'top', 'bracer': 'cuff', 'hand': 'skin', 'trousers': 'bottom', 'boot': 'shoe',
                             'belt': 'top', 'arm_skin': 'top', 'neck': 'skin'})
    for p in ob.data.polygons:
        if reg[p.index] in (REG['top'], REG['cuff']):
            s, dist = B.arm_s(p.center, 1 if p.center.x > 0 else -1)
            reg[p.index] = REG['cuff'] if s > B.upper + B.fore - 0.03 and dist < 0.09 else REG['top']
    return reg


def reshape(ob, region, vb):
    kit.sleeves(ob, region, vb, B, SLEEVE)
    kit.puff(ob, region, {'top': 0.009}, max_x=0.14)
    kit.puff(ob, region, {'bottom': 0.004})


def trim(ob, region):
    """The tunic's split flaps (single-sided panels) go; her jacket has a sculpted hem. The boots go too."""
    return kit.trim(ob, region, lambda r, c: (r == REG['top'] and c[2] < 0.452) or r == REG['shoe'])


def outfit():
    return kit.hero_outfit(B, EXT, KNOTS, regions, reshape, trim)


def hood_field():
    """The jacket's hood, down, bunched behind the collar: Doudou sleeps in it (seat_doudou)."""
    f = Field((-0.16, 0.0, 0.62), (0.16, 0.24, 0.84), vs=0.0025)
    f.add(Ellipsoid((0, 0.128, 0.728), (0.105, 0.062, 0.068)))
    f.add(Scaled(Torus((0, 0.12, 0.752), 0.082, 0.02), (1.0, 0.8, 1.0), (0, 0.12, 0.752)), k=0.02)
    f.sub(Ellipsoid((0, 0.142, 0.77), (0.072, 0.045, 0.045)), k=0.012)
    return f


def collar_field():
    """Her shirt's pointed collar, open over the jacket's stand-up collar."""
    f = Field((-0.12, -0.16, 0.7), (0.12, 0.08, 0.86), vs=0.002)
    for g in (1, -1):
        p = catmull([(0.016 * g, -0.066, 0.812), (0.04 * g, -0.092, 0.786), (0.064 * g, -0.106, 0.756)], n=8)
        f.add(Tube(p, lerp_list([0.017, 0.018, 0.01, 0.003], np.linspace(0, 1, len(p))), flat=0.22,
                   flat_dir=(0.3 * g, -1, 0.45)), k=0.004)
    f.add(Scaled(Torus((0, 0.012, 0.81), 0.046, 0.008), (1.05, 1.0, 1.0), (0, 0.012, 0.81)), k=0.006)
    return f


SKEIN = np.array([0.045, -0.158, 0.615])


def extras_field():
    """The yarn skein on a chest strap (her Lullaby Thread) and the bow laces."""
    f = Field((-0.2, -0.24, 0.0), (0.2, 0.16, 0.8), vs=0.002)
    for a in (0, 60, 120):  # three fat loops of yarn twisted around each other
        f.add(Scaled(Torus(SKEIN, 0.036, 0.016, rot(90, 0, 0) @ rot(0, a, 0) @ rot(12, 0, 0)), (1.0, 0.8, 1.15), SKEIN), k=0.006)
    f.add(Ellipsoid(SKEIN + np.array([0, -0.005, 0]), (0.03, 0.03, 0.036)), k=0.01)
    # strap: over her right shoulder and down across the chest to the skein
    p = catmull([(-0.1, 0.05, 0.775), (-0.1, -0.075, 0.74), (-0.03, -0.155, 0.68), (0.03, -0.18, 0.64)], n=12)
    f.add(Tube(p, 0.0095, flat=0.4, flat_dir=[(0, -1, 0.3)]), k=0.004)
    kit.laces(f, B)
    return f


GROUPS = [
    # name, builder, kind, colour, triangle budget, symmetric
    ('skin', lambda: kit.head_field(B), 'skin', 'skin', 950, True),
    ('hair', hair_field, 'hair', 'hair', 1050, False),
    ('braid', braid_field, 'hair', 'hair', 470, False),
    ('outfit', outfit, 'cloth', 'jacket', 2000, True),
    ('hood', hood_field, 'cloth', 'jacket', 260, True),
    ('hem', lambda: kit.hem_field(B, 0.462, 0.385, 0.16, 0.176), 'cloth', 'jacket', 320, True),
    ('shoes', lambda: kit.hightops(B), 'cloth', 'shoe', 400, True),
    ('collar', collar_field, 'cloth', 'shirt', 200, True),
    ('extras', extras_field, 'plain', 'yarn', 220, False),
]
CULL = {'skin': ['hair', 'hood', 'collar'], 'braid': ['hair']}

# ---------------------------------------------------------------- rig


def joints():
    b = braid_bones()
    extra = {'seat_doudou': ((0, 0.158, 0.732), (0, 0.158, 0.78), 'hood')}
    for i in range(3):
        extra['spring_braid_%d' % (i + 1)] = (b[i], b[i + 1], 'head' if i == 0 else 'spring_braid_%d' % i)
    return B.joints(extra)


WEIGHTS = {
    'skin': kit.HEAD_WEIGHTS,
    'hair': ('rigid', 'head'),
    'braid': ('dist', ['head', 'spring_braid_1', 'spring_braid_2', 'spring_braid_3']),
    'outfit': ('keep',),
    'hood': ('dist', ['chest', 'hood']),
    'hem': ('fn', kit.hem_weights(B)),
    'shoes': kit.SHOE_WEIGHTS,
    'collar': ('dist', ['chest', 'neck']),
    'extras': ('split', lambda c: ('foot_L' if c[0] > 0 else 'foot_R') if c[2] < 0.2 else 'chest'),
}

# ---------------------------------------------------------------- paint


def face_kind(group, c, n, region=None):
    """Per-face shader family: the gingham grid (cloth) where the ref has checked fabric."""
    if group == 'outfit':
        return 'skin' if region == REG['skin'] else 'cloth'
    if group in ('hood', 'hem', 'collar'):
        return 'cloth'
    if group == 'shoes':
        return 'plain' if c[2] < 0.017 else None
    if group == 'extras':
        return 'plain'
    return None


def face_shade(ao, ao_f):
    return kit.shade(ao, ao_f)


def paint_outfit(P, ao, ao_f, region):
    lin = kit.lin
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    col = np.tile(lin(COL['jacket']), (len(P), 1))
    col[region == REG['cuff']] = lin(COL['lining'])
    col[region == REG['skin']] = lin(COL['skin'])
    col[region == REG['bottom']] = lin(COL['trousers'])
    top = region == REG['top']
    # the jacket hangs open: the cream shirt shows down the front, and in a V at the neck
    col[top & (np.abs(x) < 0.024) & (y < -0.04) & (z > 0.4) & (z < B.neck[0] - 0.01)] = lin(COL['shirt'])
    col[top & (z > 0.735) & (y < -0.03) & (np.abs(x) < 0.028 + (z - 0.735) * 0.9)] = lin(COL['shirt'])
    for g in (1, -1):  # flap pockets low on the front
        pk = top & (np.abs(x - 0.085 * g) < 0.042) & (y < -0.06) & (np.abs(z - 0.47) < 0.03)
        col[pk] *= 0.9
        col[pk & ((np.abs(np.abs(x - 0.085 * g) - 0.042) < 0.004) | (np.abs(np.abs(z - 0.47) - 0.03) < 0.004))] *= 0.75
    col[(region == REG['bottom']) & (z < 0.14)] *= 0.93  # gathered at the ankle
    return col * kit.shade(ao, ao_f)[:, None]


def paint(g, P, N, ao, ao_f, base, region=None):
    if g == 'outfit':
        return paint_outfit(P, ao, ao_f, region)
    lin = kit.lin
    col = np.array(base, float)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    if g in ('hair', 'braid'):
        col = kit.paint_hair(col, P, N, B.head_pt(0, 0.03, 0.14))
        if g == 'braid':
            col[np.linalg.norm(P - np.array(BRAID_PATH[-1]), axis=1) < 0.021] = lin(COL['tie'])
    elif g == 'shoes':
        col[z < 0.017] = lin(COL['sole'])
        col[z > 0.094] = lin(COL['sock'])
        col[(z < 0.05) & (np.abs(y + 0.07) < 0.03)] *= 0.93  # toe cap
    elif g == 'extras':
        yarn = np.linalg.norm(P - SKEIN, axis=1) < 0.075
        col[:] = lin(COL['strap'])
        col[yarn] = lin(COL['yarn']) * (0.85 + 0.25 * kit.noise1((x * 0.4 + z) * 420)[yarn])[:, None]
        col[z < 0.2] = lin(COL['lace'])
    return col * kit.shade(ao, ao_f)[:, None]
