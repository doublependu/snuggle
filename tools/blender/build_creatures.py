# SPDX-License-Identifier: GPL-3.0-only
"""Bean and the Grumblings: faceted paper-craft creatures (ref/doudou_1.png), unrigged.
Each creature is an empty named after its species with two children: <id>_body and <id>_eyes
(eyes separate so the runtime can blink / squint them). Exports assets-src/export/creatures.glb.
Origins sit at the creature's base centre; +Z (glTF +Y) up, facing -Y (glTF +Z)."""
import os, sys, importlib, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *

C = srgb


def slit_eyes(prefix, y, z, dx, w=0.035, h=0.009, color='#4a3226', yaw_in=0):
    out = []
    for s, g in (('L', 1), ('R', -1)):
        out.append(disc(prefix + s, (dx * g, y, z), w, 'eye', C(color), (0.12 * g, -1, 0), 8, (1, h / w), None, 0.004))
    return out


def round_eyes(prefix, y, z, dx, r=0.04, color='#2a1d17', glint=True, normal_tilt=0.0):
    out = []
    for s, g in (('L', 1), ('R', -1)):
        n = (normal_tilt * g, -1, 0)
        out.append(disc(prefix + s, (dx * g, y, z), r, 'eye', C(color), n, 12, (0.9, 1.0), None, 0.004))
        if glint:
            out.append(disc(prefix + 'g' + s, (dx * g + r * 0.3 * g, y - 0.004, z + r * 0.35), r * 0.3, 'eye',
                            C('#ffffff'), n, 6, (1, 1), None, 0.004))
    return out


def creature(cid, body_parts, eye_parts, x, extra=None):
    """extra: {'wingL': (parts, pivot), ...} -> more children named <id>_<key>, each pivoting at its own
    origin (the runtime flaps the sparrow's wings by rotating them)."""
    root = link(bpy.data.objects.new(cid, None))
    root.empty_display_size = 0.2
    body = link(bpy.data.objects.new(cid + '_body', None))
    eyes = link(bpy.data.objects.new(cid + '_eyes', None))
    body_meshes = join_mixed(body_parts, cid + '_b')
    bake_ao(body_meshes, dist=0.15, samples=16, strength=0.45)
    for m in body_meshes:
        m.parent = body
    for m in join_mixed(eye_parts, cid + '_e'):
        m.parent = eyes
    body.parent = root
    eyes.parent = root
    for key, (parts, pivot) in (extra or {}).items():
        e = link(bpy.data.objects.new(cid + '_' + key, None))
        for m in join_mixed(parts, cid + '_' + key[:1] + key[-1]):
            m.data.transform(Matrix.Translation(-Vector(pivot)))
            m.parent = e
        e.location = pivot
        e.parent = root
    root.location.x = x
    return root


def doudou(x):
    """Bean ("Five more minutes."): a steamed bun with stubby ears, asleep in Pip's hood. His ears are a part of
    their own (they perk up when he's wide awake, src/systems/bean.js), and so are his open eyes (doudou_open:
    hidden until he wakes; the slits are his sleeping eyes)."""
    cream, shade = C('#f4ede2'), C('#e4d6c2')
    B = [superquad('dd_body', (0, 0, 0.1), (0.13, 0.115, 0.1), 'paper', cream, n=3.0, res=3, jitter=0.1, seed=4,
                   taper=0.18, grad=(shade, cream))]
    ears = []
    for s, g in (('L', 1), ('R', -1)):
        ears.append(cone('dd_ear' + s, (0.075 * g, 0.0, 0.17), (0.095 * g, 0.01, 0.235), 0.04, 0.008, 'paper', cream,
                         segs=4))
        B.append(superquad('dd_paw' + s, (0.07 * g, -0.085, 0.02), (0.035, 0.03, 0.022), 'paper', C('#fbf7f0'), n=2.5,
                           res=2, jitter=0.15, seed=9))
    B.append(cone('dd_knot', (0, 0.01, 0.195), (0, 0.015, 0.225), 0.025, 0.004, 'paper', shade, segs=5))
    B.append(ellipsoid('dd_nose', (0, -0.118, 0.1), (0.014, 0.01, 0.011), 'paper', C('#8a5a44'), (6, 4), smooth=False))
    for s, g in (('L', 1), ('R', -1)):
        B.append(disc('dd_blush' + s, (0.085 * g, -0.104, 0.085), 0.018, 'paper', C('#f1b9a4'), (0.3 * g, -1, 0), 8,
                      (1.3, 0.7), None, 0.003))
    E = slit_eyes('dd_eye', -0.112, 0.125, 0.048, w=0.026, h=0.006)
    O = round_eyes('dd_open', -0.113, 0.127, 0.05, r=0.021, color='#3a2a22', normal_tilt=0.12)
    O.append(disc('dd_mouth', (0, -0.119, 0.078), 0.012, 'eye', C('#8a5a44'), (0, -1, 0.1), 6, (1.2, 0.5), None, 0.003))
    return creature('doudou', B, E, x, {'ears': (ears, (0, 0.0, 0.17)), 'open': (O, (0, -0.113, 0.127))})


def cloud(x):
    """Soggy Cloud ("I forgot my umbrella."): a sulky, crumpled paper cloud, heavier at the bottom, with a
    grumpy little face, raindrops hanging underneath and stubby paws tucked in front. Its side puffs are
    separate children, so they can breathe (src/actors/creatures.js animateParts)."""
    grey, light, shade = C('#98acc0'), C('#d6e0ea'), C('#7d92a8')
    B = [ico('cl_core', (0, 0, 0.3), (0.22, 0.19, 0.18), 'paper', light, subdiv=2, jitter=0.08, seed=10, grad=(grey, light)),
         ico('cl_top', (0.03, 0.03, 0.45), (0.14, 0.13, 0.1), 'paper', light, subdiv=1, jitter=0.16, seed=11, grad=(grey, light)),
         ico('cl_base', (0, 0.01, 0.2), (0.21, 0.17, 0.08), 'paper', grey, subdiv=1, jitter=0.2, seed=12, grad=(shade, grey))]
    for i, (dx, dz) in enumerate(((-0.12, 0.08), (0.01, 0.05), (0.13, 0.07))):  # raindrops, falling
        B.append(ellipsoid('cl_drop%d' % i, (dx, -0.03, dz), (0.016, 0.016, 0.024), 'glow', C('#8cc4ec'), (6, 4), smooth=False))
        B.append(cone('cl_dtip%d' % i, (dx, -0.03, dz + 0.015), (dx, -0.03, dz + 0.045), 0.014, 0.002, 'glow', C('#8cc4ec'), segs=4))
    for s_, g in (('L', 1), ('R', -1)):
        B.append(superquad('cl_paw' + s_, (0.085 * g, -0.175, 0.17), (0.045, 0.038, 0.032), 'paper', C('#eef3f8'), n=2.5, res=2,
                           jitter=0.12, seed=13 if g > 0 else 14))
    E = slit_eyes('cl_eye', -0.192, 0.335, 0.062, w=0.03, h=0.008, color='#3a4656')
    for s_, g in (('L', 1), ('R', -1)):  # sulky brows, tilted down toward the middle
        E.append(disc('cl_brow' + s_, (0.064 * g, -0.19, 0.362), 0.03, 'eye', C('#4d5b6b'), (0.1 * g, -1, 0.1), 6, (1, 0.2), None, 0.004))
    E.append(ellipsoid('cl_nose', (0, -0.2, 0.312), (0.014, 0.011, 0.011), 'paper', C('#6a7a8c'), (6, 4), smooth=False))
    E.append(disc('cl_mouth', (0, -0.192, 0.282), 0.016, 'eye', C('#4d5b6b'), (0, -1, 0), 6, (1.4, 0.35), None, 0.004))
    extra = {}
    for s_, g in (('L', 1), ('R', -1)):
        pivot = (0.14 * g, 0.01, 0.3)
        extra['puff' + s_] = ([ico('cl_puff' + s_, (0.2 * g, 0.02, 0.33), (0.13, 0.12, 0.11), 'paper', light, subdiv=1, jitter=0.18,
                                   seed=15 if g > 0 else 16, grad=(grey, light))], pivot)
    return creature('cloud', B, E, x, extra)


def sock(x):
    """Lost Sock ("I lost my other sock."): a lone striped sock standing up on its heel, toe pointing
    forward, with big worried eyes looking all around for its partner. Crumpled knit; the toe wiggles."""
    red, white, dark = C('#d9574a'), C('#f5eee4'), C('#b5443a')
    B = [superquad('sk_leg', (0, 0.03, 0.25), (0.1, 0.09, 0.15), 'paper', red, n=2.6, res=3, jitter=0.07, seed=3, grad=(dark, red)),
         torus('sk_cuff', (0, 0.03, 0.39), 0.086, 0.034, 'paper', white, (8, 4), smooth=False),
         superquad('sk_heel', (0, 0.035, 0.09), (0.11, 0.115, 0.09), 'paper', red, n=2.4, res=3, jitter=0.1, seed=4, grad=(dark, red))]
    for i in range(2):  # white stripes knitted around the leg
        B.append(superquad('sk_band%d' % i, (0, 0.03, 0.2 + i * 0.1), (0.108, 0.098, 0.03), 'paper', white, n=2.6, res=2, jitter=0.04, seed=6 + i))
    E = round_eyes('sk_eye', -0.066, 0.3, 0.043, r=0.03)
    for s_, g in (('L', 1), ('R', -1)):  # brows raised in the middle: worried
        E.append(disc('sk_brow' + s_, (0.045 * g, -0.066, 0.342), 0.024, 'eye', C('#5a2a24'), (0.12 * g, -1, 0.1), 6, (1, 0.22), None, 0.004))
    E.append(disc('sk_mouth', (0, -0.068, 0.25), 0.012, 'eye', C('#5a2a24'), (0, -1, 0.1), 8, (1, 1.2), None, 0.004))
    extra = {'toe': ([superquad('sk_toe', (0, -0.13, 0.058), (0.085, 0.09, 0.058), 'paper', white, n=2.4, res=2, jitter=0.12, seed=5)], (0, -0.05, 0.06))}
    return creature('sock', B, E, x, extra)


def homework(x):
    """Unfinished Homework ("I didn't finish my homework."): a crumpled-up worksheet balled up tight, a red
    mark on its side, a pencil stuck in the top and teary eyes. One page corner sticks out and flaps."""
    paper, line = C('#f7f3ea'), C('#b9cde0')
    B = [ico('hw_ball', (0, 0, 0.22), (0.21, 0.2, 0.2), 'paper', paper, subdiv=2, jitter=0.24, seed=21, grad=(mix(line, paper, 0.55), paper), noise=0.1),
         tube('hw_pencil', (0.05, 0.04, 0.33), (0.13, 0.06, 0.55), 0.019, 0.019, 'paper', C('#f2b33d'), segs=6, rings=1, smooth=False),
         cone('hw_tip', (0.13, 0.06, 0.55), (0.145, 0.064, 0.59), 0.019, 0.002, 'paper', C('#2b2b2b'), segs=6),
         tube('hw_eraser', (0.046, 0.039, 0.32), (0.054, 0.041, 0.34), 0.02, 0.02, 'paper', C('#e98a9a'), segs=6, rings=1),
         disc('hw_mark', (0.19, -0.08, 0.26), 0.04, 'paper', C('#d9412f'), (1, -0.4, 0.1), 8, (1, 1), None, 0.004)]
    for s_, g in (('L', 1), ('R', -1)):  # little paper-wad paws
        B.append(ico('hw_paw' + s_, (0.085 * g, -0.17, 0.045), (0.045, 0.04, 0.035), 'paper', paper, subdiv=1, jitter=0.25, seed=24 if g > 0 else 25))
    E = round_eyes('hw_eye', -0.2, 0.25, 0.062, r=0.032)
    for s_, g in (('L', 1), ('R', -1)):  # tears
        E.append(ellipsoid('hw_tear' + s_, (0.078 * g, -0.196, 0.2), (0.012, 0.008, 0.022), 'glow', C('#9fd0f2'), (6, 4)))
    E.append(disc('hw_mouth', (0, -0.205, 0.18), 0.018, 'eye', C('#4a3a3a'), (0, -1, 0), 6, (1.5, 0.45), None, 0.004))
    extra = {'flap': ([superquad('hw_flap', (-0.15, 0.03, 0.4), (0.075, 0.01, 0.06), 'paper', paper, n=2.0, res=2, jitter=0.15, seed=26, rot=(10, 35, 20))],
                      (-0.1, 0.02, 0.36))}
    return creature('homework', B, E, x, extra)


def pompom(x):
    """Picked-Last Pom-pom ("Nobody picked me for their team."): a fluffy knitted pom-pom with droopy,
    half-shut eyes, a blush and little feet, waiting to be picked. A tuft of long strands on top sways."""
    lilac, pink = C('#b69ccf'), C('#e6b8d2')
    B = [ico('pp_fluff', (0, 0, 0.2), (0.17, 0.16, 0.17), 'paper', pink, subdiv=2, jitter=0.22, seed=31, grad=(lilac, pink), spikes=0.45)]
    for s_, g in (('L', 1), ('R', -1)):
        B.append(superquad('pp_foot' + s_, (0.065 * g, -0.04, 0.022), (0.04, 0.05, 0.022), 'paper', C('#8e76a8'), n=2.5, res=2, jitter=0.1))
    E = []
    for s_, g in (('L', 1), ('R', -1)):  # droopy eyes under heavy lids, and a shy blush
        E.append(disc('pp_eye' + s_, (0.058 * g, -0.172, 0.215), 0.03, 'eye', C('#2e2438'), (0.15 * g, -1, 0), 10, (1.0, 0.7), None, 0.004))
        E.append(disc('pp_lid' + s_, (0.058 * g, -0.176, 0.232), 0.033, 'paper', pink, (0.15 * g, -1, 0), 10, (1.05, 0.42), None, 0.004))
        E.append(disc('pp_blush' + s_, (0.1 * g, -0.158, 0.18), 0.022, 'paper', C('#f29ab4'), (0.35 * g, -1, 0), 8, (1.3, 0.7), None, 0.003))
    E.append(disc('pp_mouth', (0, -0.178, 0.165), 0.012, 'eye', C('#4a3a4f'), (0, -1, 0), 6, (1.3, 0.45), None, 0.004))
    tuft = [cone('pp_strand%d' % i, (0.02 * i, 0.0, 0.36), (0.05 * i, -0.02 + 0.03 * abs(i), 0.5 - 0.03 * abs(i)), 0.022, 0.004, 'paper', lilac, segs=3)
            for i in (-1, 0, 1)]
    extra = {'tuft': (tuft, (0, 0, 0.35))}
    return creature('pompom', B, E, x, extra)


def sparrow(x):
    """Wistful Sparrow ("I want that, but I can't afford it"): a plump round bird with enormous, shiny,
    longing eyes, a cream belly and stubby wings (separate, so they flap)."""
    brown, cream, dark = C('#a8795a'), C('#f3e3c6'), C('#7a5238')
    B = [ico('sp_body', (0, 0, 0.13), (0.125, 0.12, 0.12), 'paper', brown, subdiv=2, jitter=0.1, seed=41, grad=(dark, brown)),
         ico('sp_belly', (0, -0.045, 0.105), (0.095, 0.08, 0.085), 'paper', cream, subdiv=1, jitter=0.08, seed=42),
         ico('sp_cap', (0, 0.01, 0.2), (0.085, 0.08, 0.05), 'paper', dark, subdiv=1, jitter=0.1, seed=43),
         cone('sp_beak', (0, -0.112, 0.125), (0, -0.15, 0.118), 0.022, 0.003, 'paper', C('#e8a43c'), segs=4),
         cone('sp_tail', (0, 0.1, 0.13), (0, 0.19, 0.19), 0.045, 0.012, 'paper', dark, segs=3)]
    for s, g in (('L', 1), ('R', -1)):
        B.append(cone('sp_foot' + s, (0.035 * g, -0.01, 0.025), (0.04 * g, -0.045, 0.0), 0.012, 0.004, 'paper', C('#e8a43c'), segs=3))
    E = []
    for s, g in (('L', 1), ('R', -1)):  # big, glossy, looking up and a little wistful
        n = (0.3 * g, -1, 0.15)
        E.append(disc('sp_eye' + s, (0.048 * g, -0.1, 0.155), 0.036, 'eye', C('#241a14'), n, 12, (0.95, 1.05), None, 0.004))
        E.append(disc('sp_glint' + s, (0.052 * g, -0.104, 0.172), 0.012, 'eye', C('#ffffff'), n, 6, (1, 1), None, 0.004))
        E.append(disc('sp_glint2' + s, (0.041 * g, -0.104, 0.141), 0.006, 'eye', C('#cfe7ff'), n, 6, (1, 1), None, 0.004))
        E.append(disc('sp_brow' + s, (0.046 * g, -0.098, 0.2), 0.02, 'eye', C('#5a3a28'), n, 6, (1, 0.25), None, 0.004))
    extra = {}
    for s, g in (('L', 1), ('R', -1)):
        pivot = (0.1 * g, 0.0, 0.16)
        extra['wing' + s] = ([superquad('sp_wing' + s, (0.13 * g, 0.03, 0.13), (0.022, 0.07, 0.055), 'paper', dark, n=2.2, res=2,
                                         jitter=0.1, seed=44 if g > 0 else 45, rot=(20, 0, -15 * g))], pivot)
    return creature('sparrow', B, E, x, extra)


def grey(x):
    """Grey Grumbling ("Nobody remembers us."): a heavy lump under a grey blanket that pools on the ground,
    with only two tired eyes peeking out of the opening (a small echo of the Great Sulk). Grey all over:
    the runtime tints colour back into it while someone keeps it company (src/systems/greys.js)."""
    g1, g2, g3 = C('#7a7e86'), C('#9c9fa7'), C('#b8bbc2')

    def window(co):  # the blanket's opening at the front, and its open bottom
        return co.z < -0.34 or (co.y < -0.5 and abs(co.x) < 0.6 and -0.5 < co.z < 0.36)
    B = [superquad('gr_lump', (0, 0, 0.2), (0.26, 0.23, 0.2), 'paper', g2, n=2.3, res=3, jitter=0.1, seed=51,
                   taper=0.2, grad=(g1, g2)),
         ellipsoid('gr_blanket', (0, 0.012, 0.225), (0.3, 0.275, 0.235), 'paper', g3, (10, 7), smooth=False,
                   grad=(g2, g3), cut=window),
         # a corner of the blanket flopped over at the top, and the hem pooled on the ground
         cone('gr_corner', (0.02, 0.05, 0.43), (0.21, 0.19, 0.35), 0.065, 0.01, 'paper', g3, segs=4),
         superquad('gr_hem', (0, 0.015, 0.045), (0.31, 0.285, 0.05), 'paper', g1, n=2.2, res=3, jitter=0.2, seed=52)]
    for s, g in (('L', 1), ('R', -1)):
        B.append(superquad('gr_foot' + s, (0.1 * g, -0.27, 0.025), (0.05, 0.045, 0.024), 'paper', g1, n=2.5, res=2,
                           jitter=0.1, seed=53 if g > 0 else 54))
    E = []
    for s, g in (('L', 1), ('R', -1)):  # tired eyes under heavy lids, a small glint of hope
        n = (0.22 * g, -1, 0.05)
        E.append(disc('gr_eye' + s, (0.075 * g, -0.228, 0.265), 0.04, 'eye', C('#26262c'), n, 12, (1.0, 0.85), None, 0.004))
        E.append(disc('gr_lid' + s, (0.075 * g, -0.233, 0.287), 0.044, 'paper', g2, n, 10, (1.06, 0.42), None, 0.004))
        E.append(disc('gr_glint' + s, (0.086 * g, -0.235, 0.257), 0.01, 'eye', C('#e2e8f2'), n, 6, (1, 1), None, 0.004))
    E.append(disc('gr_mouth', (0, -0.236, 0.195), 0.018, 'eye', C('#3a3a42'), (0, -1, 0.1), 6, (1.5, 0.32), None, 0.004))
    return creature('grey', B, E, x)


def build():
    reset_scene()
    use_collection('creatures')
    roots = [doudou(0), cloud(0.8), sock(1.6), homework(2.4), pompom(3.2), sparrow(4.0), grey(5.0)]
    objs = []
    for r in roots:
        objs += descendants(r)
    return export_glb('creatures.glb', objs)


if __name__ == '__main__':
    print('built', build())
