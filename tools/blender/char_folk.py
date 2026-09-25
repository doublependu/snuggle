"""Townsfolk (train passengers, students, market folk), built by chibi.py with the character kit.

Three variants share this recipe (char_folk_a/b/c.py): the base mesh (ref/hero_male.glb) warped onto
proportions scaled from the height, its tunic top closed with a sculpted hem, its bracers kept as leather
cuffs and its boots kept; a painted face on a round head, simple hair, and one accessory each (a shawl and a
bun, a sash, a straw hat). Half-size atlas and a lighter triangle budget: they are background characters.
"""
import math
import types
import numpy as np
from sdf import Field, Ellipsoid, Sphere, RoundCone, Box, Torus, Tube, Scaled, Fn, catmull, rot, lerp_list
import face as F
import kit
from kit import REG

VARIANTS = {
    'folk_a': dict(height=1.25, skin='#f0c7a8', hair='#3a2c25', top='#8a6fa8', bottom='#5f5470', extra='shawl',
                   extra_col='#c7a3cf', bun=True, iris='#3a2418', seed=1),
    'folk_b': dict(height=1.16, skin='#f5d6c2', hair='#1d1a19', top='#4f7ea3', bottom='#e8e2d6', extra='sash',
                   extra_col='#e9c46a', bun=False, iris='#2a1a12', seed=2),
    'folk_c': dict(height=1.3, skin='#d9a888', hair='#2a211d', top='#6e8b5a', bottom='#6b5a48', extra='hat',
                   extra_col='#c9b28a', bun=False, iris='#221610', seed=3),
}


def make_body(height):
    """Proportions scaled from the height (a head about as big as the heroes')."""
    s = height / 1.28
    r = np.array([0.138, 0.132, 0.134])
    cz = height - r[2] - 0.005
    neck = (cz - 0.195, cz - 0.12)
    collar = neck[0] + 0.02
    hip = 0.4375 * height
    return kit.Body(height=height, skull_c=(0, 0.004, cz), skull_r=r, neck=neck,
                    shoulder=(0.104, 0, collar - 0.04), upper=0.165 * s, fore=0.145 * s, hand=0.068,
                    hip_z=hip, leg_x=0.07, knee_z=0.242 * height, ankle_z=0.08 * s, waist_z=hip + 0.04,
                    chest_z=collar - 0.18 * s, collar_z=collar, eye_z=cz - 0.015, mouth_z=cz - 0.08, foot_len=0.1)


EXT = {'pelvis': (0.098, 0.118), 'torso': (0.1, 0.13), 'shoulders': (0.1, 0.132), 'head': (0.04, 0.04),
       'bicep': (0.05, 0.05), 'forearm': (0.046, 0.046), 'wrist': (0.046, 0.046), 'hand': (0.028, 0.017),
       'fingers_base': (0.025, 0.014), 'fingers_mid': (0.023, 0.013), 'fingers_tip': (0.021, 0.012),
       'thumb': (0.011, 0.011), 'thigh': (0.074, 0.074), 'shin': (0.062, 0.062), 'foot': (0.065, 0.05)}


def variant(name):
    """Everything chibi.build needs for one townsperson, as module-level names."""
    v = VARIANTS[name]
    B = make_body(v['height'])
    hp = B.head_pt
    wrist = B.upper + B.fore
    sleeve = ([0.0, 0.05, wrist - 0.04, wrist - 0.02, wrist], [0.054, 0.052, 0.048, 0.05, 0.05])

    def regions(ob, base, vb):
        return kit.base_to(base, {'shirt': 'top', 'bracer': 'cuff', 'hand': 'skin', 'trousers': 'bottom',
                                  'boot': 'shoe', 'belt': 'belt', 'arm_skin': 'top', 'neck': 'skin'})

    def reshape(ob, region, vb):
        kit.sleeves(ob, region, vb, B, sleeve, amount=0.7)
        kit.puff(ob, region, {'top': 0.004}, max_x=0.14)

    def trim(ob, region):
        return kit.trim(ob, region, lambda r, c: r == REG['top'] and c[2] < B.waist_z - 0.012)

    def hair():
        c, r = kit.cap(B)
        f = Field((-0.2, -0.2, B.skull_c[2] - 0.2), (0.2, 0.22, B.skull_c[2] + 0.24), vs=0.003)
        f.add(Ellipsoid(c, r))
        f.sub(Ellipsoid(hp(0, -0.19, -0.056), (0.126, 0.15, 0.094)), k=0.012)
        f.sub(Box((0, -0.04, B.skull_c[2] - 0.235), (0.3, 0.22, 0.08)), k=0.02)
        for x, tip_z in ((-0.08, 0.05), (-0.035, 0.042), (0.012, 0.044), (0.06, 0.048)):
            kit.lock(f, [kit.on_cap(c, r, hp(x * 0.9, -0.1, 0.09), 0.003), hp(x, -0.142 + abs(x) * 0.25, tip_z)],
                     [0.024, 0.02, 0.005], flat=0.45, centre=B.skull_c, k=0.006, n=8)
        if v['bun']:
            f.add(Sphere(hp(0, 0.08, 0.13), 0.058), k=0.015)
        return f

    def accessory():
        if v['extra'] == 'shawl':
            z = B.collar_z - 0.02
            f = Field((-0.22, -0.2, z - 0.1), (0.22, 0.2, z + 0.08), vs=0.0025)
            f.add(Scaled(Torus((0, 0.0, z), 0.1, 0.035), (1.2, 1.0, 0.8), (0, 0.0, z)))
            return f
        if v['extra'] == 'sash':
            z = B.waist_z + 0.02
            f = Field((-0.2, -0.2, z - 0.06), (0.2, 0.2, z + 0.06), vs=0.0025)
            f.add(Scaled(RoundCone((0, 0.004, z + 0.022), (0, 0.004, z - 0.022), 0.124, 0.128), (1.0, 0.8, 1.0), (0, 0.004, z)))
            f.sub(Scaled(RoundCone((0, 0.004, z + 0.07), (0, 0.004, z - 0.07), 0.106, 0.11), (1.0, 0.78, 1.0), (0, 0.004, z)), k=0.004)
            return f
        # a conical straw hat: a thin shell around a cone (apex above the crown, wide sloped brim)
        apex, R, h, t = hp(0, 0.01, 0.235), 0.25, 0.13, 0.009

        def cone(X, Y, Z):
            r = np.sqrt((X - apex[0]) ** 2 + (Y - apex[1]) ** 2)
            v = apex[2] - Z
            k = np.clip((r * R + v * h) / (R * R + h * h), 0, 1)
            return np.sqrt((r - R * k) ** 2 + (v - h * k) ** 2) - t

        f = Field(apex - [R + 0.03, R + 0.03, h + 0.03], apex + [R + 0.03, R + 0.03, 0.03], vs=0.003)
        f.add(Fn(cone, apex - [R + 0.02, R + 0.02, h + 0.02], apex + [R + 0.02, R + 0.02, 0.02]))
        return f

    def paint(g, P, N, ao, ao_f, base, region=None):
        lin = kit.lin
        z = P[:, 2]
        col = np.array(base, float)
        if g == 'outfit':
            col = np.tile(lin(v['top']), (len(P), 1))
            col[region == REG['cuff']] = lin('#5a4636')
            col[region == REG['skin']] = lin(v['skin'])
            col[region == REG['bottom']] = lin(v['bottom'])
            col[region == REG['belt']] = lin('#4a3a2e')
            col[region == REG['shoe']] = lin('#5a4a3e')
        elif g == 'hair':
            col = kit.paint_hair(col, P, N, hp(0, 0.03, 0.14))
        elif g == 'extra' and v['extra'] == 'hat':
            col *= (0.9 + 0.14 * np.sin(np.arctan2(P[:, 0], P[:, 1]) * 40))[:, None]  # woven straw
        return col * kit.shade(ao, ao_f)[:, None]

    def face_kind(group, c, n, region=None):
        if group == 'outfit':
            return 'skin' if region == REG['skin'] else 'plain' if region in (REG['cuff'], REG['belt'], REG['shoe']) else 'cloth'
        if group in ('hem', 'extra'):
            return 'cloth' if v['extra'] != 'hat' else 'plain'
        return None

    groups = [
        ('skin', lambda: kit.head_field(B, cheeks=0.95), 'skin', 'skin', 580, True),
        ('hair', hair, 'hair', 'hair', 380, True),
        ('outfit', lambda: kit.hero_outfit(B, EXT, None, regions, reshape, trim), 'cloth', 'top', 1350, True),
        ('hem', lambda: kit.hem_field(B, B.waist_z - 0.008, B.hip_z - 0.07, 0.124, 0.134, depth=0.8, open_front=0, roll=0.01),
         'cloth', 'top', 220, True),
        ('extra', accessory, 'cloth', 'extra', 220, True),
    ]
    col = {'skin': v['skin'], 'hair': v['hair'], 'top': v['top'], 'extra': v['extra_col']}
    extra_w = ('rigid', 'head') if v['extra'] == 'hat' else ('rigid', 'hips') if v['extra'] == 'sash' else ('dist', ['chest', 'neck'])
    return dict(
        NAME=name, B=B, H=B.height + (0.1 if v['extra'] == 'hat' else 0.0), ARM_DOWN=B.arm_down, EYE_Z=B.eye_z,
        MOUTH_Z=B.mouth_z, ATLAS_SCALE=0.5, COL=col, GROUPS=groups,
        EYES=F.EyeStyle(skin=v['skin'], cx=0.055, w=0.022, h=0.025, iris=v['iris'], iris_lo='#6a4a36', lashes=1,
                        brow=v['hair'], freckles=None, blush='#eea58c'),
        MOUTH=F.MouthStyle(skin=v['skin'], w=0.011),
        CULL={'skin': ['hair'] + (['extra'] if v['extra'] == 'hat' else [])},
        WEIGHTS={'skin': kit.HEAD_WEIGHTS, 'hair': ('rigid', 'head'), 'outfit': ('keep',),
                 'hem': ('fn', kit.hem_weights(B)), 'extra': extra_w},
        joints=lambda: B.joints(), face_kind=face_kind, paint=paint, face_shade=kit.shade,
    )
