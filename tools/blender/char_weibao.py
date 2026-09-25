# SPDX-License-Identifier: GPL-3.0-only
"""Wei Bao and Captain Honk (ref/weibao.png), built by chibi.py with the character kit.

A shy boy with a big round head, very big dark eyes and big ears, in a mustard gingham bandana knotted at
his left (its tails swing on springs) and a mustard neckerchief. His body starts from the base mesh
(tools/blender/base/hero_male.glb): its shirt becomes his cream checked shirt with the sleeves rolled to the forearm, its
bare forearms and bracers his forearms, its trousers his mustard ones gathered at the ankle over sculpted
sneakers. A rope belt, the satchel on its strap and Captain Honk are sculpted: a white felt goose puppet on
his left hand whose lower beak sits on the puppet_jaw bone (it flaps while Honk talks, src/actors/npc.js).
"""
import math
import numpy as np
from sdf import Field, Ellipsoid, RoundCone, Capsule, Box, Torus, Tube, Scaled, catmull, rot, lerp_list
import face as F
import kit
from kit import REG

NAME = 'weibao'
B = kit.Body(height=1.1, skull_c=(0, 0.004, 0.945), skull_r=(0.152, 0.145, 0.147), neck=(0.72, 0.83),
             shoulder=(0.094, 0, 0.708), upper=0.125, fore=0.115, hand=0.064,
             hip_z=0.425, leg_x=0.064, knee_z=0.235, ankle_z=0.072, waist_z=0.46, chest_z=0.6, collar_z=0.742,
             eye_z=0.93, mouth_z=0.862, foot_len=0.085)
H, ARM_DOWN, EYE_Z, MOUTH_Z = 1.12, B.arm_down, B.eye_z, B.mouth_z

COL = {
    'skin': '#efc8a6', 'hair': '#6b4a33', 'bandana': '#e0a53a', 'shirt': '#efe9dc', 'trousers': '#e0a53a',
    'scarf': '#e0a53a', 'rope': '#c9a877', 'bag': '#d8cdb8', 'strap': '#bfb3a0', 'shoe': '#e6dccb',
    'sole': '#c9b99c', 'sock': '#d9d0bf', 'lace': '#b79a74', 'felt': '#f7f4ee', 'beak': '#f08a2a', 'jaw': '#d9761f',
}
EYES = F.EyeStyle(skin=COL['skin'], cx=0.062, w=0.031, h=0.035, iris='#1e1511', iris_lo='#4a3325', lashes=0,
                  brow='#5a3d2a', brow_w=0.0045, brow_len=0.026, brow_z=0.047, freckles=None, blush='#eea58c')
MOUTH = F.MouthStyle(skin=COL['skin'], w=0.01)

# ---------------------------------------------------------------- head, hair, bandana, scarf


def hair_field():
    """Short brown hair, mostly under the bandana: a few locks over the brow, sideburns and the nape."""
    hp = B.head_pt
    c, r = kit.cap(B, grow=(0.01, 0.014, 0.01))
    f = Field((-0.2, -0.2, B.skull_c[2] - 0.2), (0.2, 0.2, B.skull_c[2] + 0.17), vs=0.0025)
    f.add(Ellipsoid(c, r))
    f.sub(Ellipsoid(hp(0, -0.19, -0.062), (0.132, 0.15, 0.094)), k=0.012)
    f.sub(Box((0, -0.04, B.skull_c[2] - 0.24), (0.3, 0.22, 0.08)), k=0.02)
    for x, tip_z in ((-0.07, 0.045), (-0.03, 0.038), (0.012, 0.042), (0.055, 0.04)):
        kit.lock(f, [kit.on_cap(c, r, hp(x, -0.1, 0.09), 0.003), hp(x * 1.05, -0.148 + abs(x) * 0.25, tip_z)],
                 [0.02, 0.018, 0.004], flat=0.45, centre=B.skull_c, k=0.006, n=8)
    for g in (1, -1):
        kit.lock(f, [kit.on_cap(c, r, hp(0.14 * g, -0.03, 0.02), 0.004), hp(0.146 * g, -0.045, -0.07)],
                 [0.016, 0.014, 0.004], flat=0.5, centre=B.skull_c, k=0.006, n=8)
    return f


KNOT = B.head_pt(0.15, 0.035, 0.02)  # the bandana's knot, on his left


def bandana_field():
    """A mustard gingham bandana tied over the head, knotted on his left with two short tails."""
    hp = B.head_pt
    f = Field((-0.22, -0.22, B.skull_c[2] - 0.1), (0.26, 0.24, B.skull_c[2] + 0.2), vs=0.0025)
    f.add(Ellipsoid(hp(0, 0.012, 0.035), B.skull_r + np.array([0.022, 0.026, 0.028])))
    f.add(Ellipsoid(hp(0, 0.02, 0.07), B.skull_r * [0.95, 0.95, 0.75] + 0.03), k=0.03)  # a soft slouch on top
    f.sub(Box(hp(0, 0, -0.08), (0.3, 0.3, 0.075), 0.02, rot(-14, 0, 0)), k=0.02)  # the lower edge, low at the back
    f.sub(Ellipsoid(B.skull_c, B.skull_r - 0.004), k=0.004)
    f.add(Ellipsoid(KNOT, (0.028, 0.03, 0.026)), k=0.012)
    for dz, dy, ln in ((-0.01, 0.02, 0.09), (0.012, 0.045, 0.07)):
        p = catmull([KNOT + [0.008, dy * 0.3, dz], KNOT + [0.025, dy, dz - ln * 0.45], KNOT + [0.03, dy + 0.01, dz - ln]], n=8)
        f.add(Tube(p, lerp_list([0.016, 0.018, 0.012], np.linspace(0, 1, len(p))), flat=0.35, flat_dir=(1, 0, 0)), k=0.006)
    return f


def scarf_field():
    """His mustard neckerchief: a roll around the neck and a small triangle knotted at the front."""
    z = B.collar_z + 0.012
    f = Field((-0.12, -0.14, z - 0.1), (0.12, 0.12, z + 0.05), vs=0.002)
    f.add(Scaled(Torus((0, 0.004, z), 0.058, 0.019), (1.05, 1.0, 1.0), (0, 0.004, z)))
    f.add(Ellipsoid((0, -0.07, z - 0.012), (0.022, 0.018, 0.02)), k=0.008)
    p = catmull([(0, -0.07, z - 0.02), (0, -0.082, z - 0.05), (0.004, -0.08, z - 0.075)], n=8)
    f.add(Tube(p, lerp_list([0.034, 0.024, 0.006], np.linspace(0, 1, len(p))), flat=0.25, flat_dir=(0, -1, 0.2)), k=0.006)
    return f

# ---------------------------------------------------------------- body from the base mesh


EXT = {'pelvis': (0.098, 0.118), 'torso': (0.1, 0.13), 'shoulders': (0.098, 0.13), 'head': (0.035, 0.035),
       'bicep': (0.05, 0.05), 'forearm': (0.04, 0.04), 'wrist': (0.036, 0.036), 'hand': (0.026, 0.016),
       'fingers_base': (0.024, 0.013), 'fingers_mid': (0.022, 0.012), 'fingers_tip': (0.02, 0.011),
       'thumb': (0.01, 0.01), 'thigh': (0.078, 0.078), 'shin': (0.07, 0.07), 'foot': (0.07, 0.056)}
KNOTS = {'shin': ([0, 0.64, 0.70, 1], [0, 0.73, 0.79, 1])}
ROLL = 0.165
SLEEVE = ([0.0, 0.05, 0.12, 0.15, 0.162, 0.176, 0.19, 0.24], [0.054, 0.053, 0.05, 0.052, 0.057, 0.05, 0.036, 0.034])


def regions(ob, base, vb):
    """Shirt sleeves rolled up to ROLL, bare forearms and hands below."""
    reg = kit.base_to(base, {'shirt': 'top', 'bracer': 'skin', 'hand': 'skin', 'trousers': 'bottom', 'boot': 'shoe',
                             'belt': 'top', 'arm_skin': 'skin', 'neck': 'skin'})
    for p in ob.data.polygons:
        if base[p.index] != kit.HB.BASE['hand'] and reg[p.index] in (REG['top'], REG['skin']):
            s, dist = B.arm_s(p.center, 1 if p.center.x > 0 else -1)
            if dist < 0.09 and s > 0.03:
                reg[p.index] = REG['top'] if s < ROLL + 0.008 else REG['skin']
    return reg


def reshape(ob, region, vb):
    kit.sleeves(ob, region, vb, B, SLEEVE, regions=('top', 'skin'))
    kit.puff(ob, region, {'bottom': 0.006})


def trim(ob, region):
    """His shirt is tucked in (a waistband closes the gap); the boots become sculpted sneakers."""
    return kit.trim(ob, region, lambda r, c: (r == REG['top'] and c[2] < B.waist_z - 0.012) or r == REG['shoe'])


def outfit():
    return kit.hero_outfit(B, EXT, KNOTS, regions, reshape, trim)


BAG = np.array([-0.14, -0.035, B.hip_z - 0.02])


def gear_field():
    """The rope belt, the cloth satchel on his right hip and its strap over his left shoulder, shoe laces."""
    f = Field((-0.22, -0.18, 0.0), (0.2, 0.18, B.collar_z + 0.02), vs=0.002)
    z = B.waist_z - 0.004
    f.add(Scaled(Torus((0, 0.004, z), 0.122, 0.007), (1.0, 0.8, 1.0), (0, 0.004, z)))
    f.add(Ellipsoid((0.03, -0.1, z - 0.004), (0.012, 0.008, 0.01)), k=0.004)  # the knot
    f.add(Box(BAG, (0.02, 0.055, 0.058), 0.02, rot(0, 0, -8)), k=0.0)
    f.add(Box(BAG + [-0.004, -0.006, 0.04], (0.022, 0.058, 0.02), 0.012, rot(-10, 0, -8)), k=0.006)  # flap
    p = catmull([(0.095, 0.02, B.collar_z - 0.012), (0.06, -0.09, B.chest_z + 0.07), (-0.07, -0.1, B.waist_z + 0.03),
                 BAG + [0.0, -0.02, 0.05]], n=14)
    f.add(Tube(p, 0.0075, flat=0.45, flat_dir=[(0, -1, 0.2)]), k=0.003)
    kit.laces(f, B, z=0.066)
    return f

# ---------------------------------------------------------------- Captain Honk


def _honk_frame():
    """The left hand's frame in the A-pose: d along the arm, u 'up' across it (the T-pose's +Z), f front."""
    sh, el, wr, tip = B.arm_points(1)
    d = B.arm_dir(1)
    a = math.radians(B.arm_down)
    return tip, d, np.array([math.sin(a), 0.0, math.cos(a)]), np.array([0, -1.0, 0])


def honk_pt(along, up, front=0.0):
    tip, d, u, fr = _honk_frame()
    return tip + d * along + u * up + fr * front


def honk_field():
    """A white felt goose puppet over his left hand: body, neck, head and upper beak."""
    tip, d, u, fr = _honk_frame()
    R = np.stack([d, fr, u], axis=1)
    pts = [honk_pt(-0.1, -0.08), honk_pt(0.17, 0.2), honk_pt(-0.1, 0.2), honk_pt(0.17, -0.08)]
    f = Field(np.min(pts, 0) - [0, 0.08, 0], np.max(pts, 0) + [0, 0.08, 0], vs=0.0022)
    f.add(Ellipsoid(honk_pt(-0.012, 0.012), (0.078, 0.066, 0.07), R))
    f.add(RoundCone(honk_pt(0.012, 0.045), honk_pt(0.05, 0.13), 0.03, 0.026), k=0.02)
    f.add(Ellipsoid(honk_pt(0.06, 0.15), (0.048, 0.042, 0.042), R), k=0.02)
    f.add(RoundCone(honk_pt(0.095, 0.155), honk_pt(0.152, 0.15), 0.018, 0.005), k=0.006)  # upper beak
    return f


def jaw_field():
    a, b = honk_pt(0.092, 0.137), honk_pt(0.142, 0.135)
    f = Field(np.minimum(a, b) - 0.03, np.maximum(a, b) + 0.03, vs=0.0015)
    f.add(RoundCone(honk_pt(0.092, 0.137), honk_pt(0.142, 0.135), 0.013, 0.0035))
    return f


GROUPS = [
    ('skin', lambda: kit.head_field(B, cheeks=1.05, nose=1.4, ears=1.45), 'skin', 'skin', 950, True),
    ('hair', hair_field, 'hair', 'hair', 420, True),
    ('bandana', bandana_field, 'cloth', 'bandana', 460, False),
    ('outfit', outfit, 'cloth', 'shirt', 1900, True),
    ('seat', lambda: kit.waistband(B, B.waist_z + 0.004, B.hip_z - 0.065, 0.12, 0.126), 'cloth', 'trousers', 220, True),
    ('scarf', scarf_field, 'cloth', 'scarf', 260, True),
    ('shoes', lambda: kit.hightops(B, collar=0.088, sock_top=0.12), 'cloth', 'shoe', 380, True),
    ('gear', gear_field, 'plain', 'bag', 380, False),
    ('honk', honk_field, 'plain', 'felt', 460, False),
    ('honk_jaw', jaw_field, 'plain', 'jaw', 70, False),
]
CULL = {'skin': ['hair', 'bandana', 'scarf'], 'hair': ['bandana']}

# ---------------------------------------------------------------- rig


def joints():
    sh_x, sz = B.shoulder[0], B.shoulder[2]
    tip_x = sh_x + B.upper + B.fore + B.hand
    k0 = KNOT + [0.012, 0.03, -0.01]
    extra = {  # T-pose coordinates: build_rig lowers everything under the upper arm with it
        'puppet_jaw': ((tip_x + 0.075, 0, sz + 0.13), (tip_x + 0.135, 0, sz + 0.13), 'hand_L'),
        'spring_bandana_1': (tuple(k0), tuple(k0 + [0.02, 0.005, -0.045]), 'head'),
        'spring_bandana_2': (tuple(k0 + [0.02, 0.005, -0.045]), tuple(k0 + [0.03, 0.01, -0.09]), 'spring_bandana_1'),
    }
    return B.joints(extra)


def bandana_weights(P):
    d = np.linalg.norm(P - KNOT, axis=1)
    tail = np.clip((KNOT[2] - 0.01 - P[:, 2]) / 0.03, 0, 1) * (d < 0.12) * (P[:, 0] > 0.14)
    t2 = np.clip((KNOT[2] - 0.05 - P[:, 2]) / 0.03, 0, 1) * tail
    return ['head', 'spring_bandana_1', 'spring_bandana_2'], np.stack([1 - tail, tail - t2, t2], axis=1)


WEIGHTS = {
    'skin': kit.HEAD_WEIGHTS,
    'hair': ('rigid', 'head'),
    'bandana': ('fn', bandana_weights),
    'outfit': ('keep',),
    'seat': ('fn', kit.leg_weights(B, top=0.0)),
    'scarf': ('dist', ['chest', 'neck']),
    'shoes': kit.SHOE_WEIGHTS,
    'gear': ('split', lambda c: ('foot_L' if c[0] > 0 else 'foot_R') if c[2] < 0.15 else 'hips' if c[2] < B.waist_z + 0.02 else 'chest'),
    'honk': ('rigid', 'hand_L'),
    'honk_jaw': ('rigid', 'puppet_jaw'),
}

# ---------------------------------------------------------------- paint


def face_kind(group, c, n, region=None):
    if group == 'outfit':
        return 'skin' if region == REG['skin'] else 'cloth'
    if group in ('bandana', 'seat', 'scarf'):
        return 'cloth'
    if group == 'shoes':
        return 'plain' if c[2] < 0.017 else None
    return None


def face_shade(ao, ao_f):
    return kit.shade(ao, ao_f)


def paint(g, P, N, ao, ao_f, base, region=None):
    lin = kit.lin
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    col = np.array(base, float)
    if g == 'outfit':
        col = np.tile(lin(COL['shirt']), (len(P), 1))
        col[region == REG['skin']] = lin(COL['skin'])
        col[region == REG['bottom']] = lin(COL['trousers'])
        top = region == REG['top']
        col[top & (np.abs(x) < 0.006) & (y < -0.05) & (z < B.chest_z + 0.1)] *= 0.8  # button placket
        for gg in (1, -1):  # the rolled sleeve edge
            s = (P - B.shoulder * [gg, 1, 1]) @ B.arm_dir(gg)
            col[top & (x * gg > 0.1) & (np.abs(s - ROLL + 0.004) < 0.009)] *= 0.9
        col[(region == REG['bottom']) & (z < 0.13)] *= 0.92
    elif g == 'hair':
        col = kit.paint_hair(col, P, N, B.head_pt(0, 0.03, 0.14))
    elif g == 'shoes':
        col[z < 0.017] = lin(COL['sole'])
        col[z > 0.09] = lin(COL['sock'])
    elif g == 'gear':
        col[:] = lin(COL['bag'])
        col[np.abs(z - (B.waist_z - 0.004)) < 0.012] = lin(COL['rope'])
        col[(z > B.waist_z + 0.02)] = lin(COL['strap'])
        col[z < 0.12] = lin(COL['lace'])
    elif g == 'honk':
        col[:] = lin(COL['felt'])
        col[np.linalg.norm(P - honk_pt(0.13, 0.153), axis=1) < 0.026] = lin(COL['beak'])
        for s in (1, -1):  # button eyes
            col[np.linalg.norm(P - honk_pt(0.072, 0.168, 0.036 * s), axis=1) < 0.009] = lin('#111111')
        col *= (0.93 + 0.1 * kit.noise1(x * 300 + z * 170))[:, None]  # felt
    return col * kit.shade(ao, ao_f)[:, None]
