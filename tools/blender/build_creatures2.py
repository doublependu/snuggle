# SPDX-License-Identifier: GPL-3.0-only
"""Free-roam Lantern Bay's three new Grumblings (ai/plan_8.md §8.4), in the paper-craft style of
build_creatures.py and built with its helpers. Exports assets-src/export/creatures2.glb, which the game
loads after Begin, only for a save that has finished the story (src/content/species2.js).

  jitters   First-Day Jitters ("What if nobody likes me?"): a wobbly knot of paper butterflies round a small
            pale worry with enormous eyes. Its two rings of butterflies are parts (ringA, ringB): the runtime
            turns them against each other.
  bottled   Bottled-Up ("I never said it out loud."): a corked glass bottle with a rolled note inside. It
            lives in the water. The cork is a part (cork): it works loose as the feeling is let out.
  letter    Unsent Letter ("I wrote it, but I never sent it."): an envelope with folded paper wings, a
            stamp and a wax seal. The flap is a part (flap): it flutters open, and snaps shut when hummed at.
Each is under 800 triangles. Run headless: blender -b -P tools/blender/build_creatures2.py"""
import os, sys, importlib, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *
import build_creatures

importlib.reload(build_creatures)
from build_creatures import creature, round_eyes

C = srgb


def butterfly(name, c, yaw, col, seed):
    """Two paper wings in a V and a sliver of a body, facing along yaw (degrees)."""
    out = []
    ca, sa = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    for g in (1, -1):
        out.append(superquad('%s_w%d' % (name, g), (c[0] + 0.04 * g * ca, c[1] + 0.04 * g * sa, c[2] + 0.016), (0.052, 0.005, 0.042), 'paper', col,
                             n=2.0, res=1, jitter=0.12, seed=seed + (g > 0), rot=(0, -32 * g, yaw)))
    out.append(tube(name + '_b', (c[0], c[1], c[2] - 0.016), (c[0], c[1], c[2] + 0.02), 0.008, 0.005, 'paper', C('#5a4638'), segs=4, rings=1, smooth=False))
    return out


def jitters(x):
    pale, shade = C('#fff3c4'), C('#f2d58a')
    B = [ico('jt_core', (0, 0, 0.2), (0.12, 0.115, 0.115), 'paper', pale, subdiv=2, jitter=0.16, seed=61, grad=(shade, pale)),
         # a cowlick of paper, and two little feet that don't reach the ground
         cone('jt_lick', (0.01, 0.0, 0.3), (0.05, 0.01, 0.37), 0.02, 0.003, 'paper', pale, segs=4)]
    for s, g in (('L', 1), ('R', -1)):
        B.append(ico('jt_foot' + s, (0.05 * g, -0.03, 0.075), (0.03, 0.035, 0.022), 'paper', shade, subdiv=1, jitter=0.2, seed=62 + (g > 0)))
    E = round_eyes('jt_eye', -0.112, 0.215, 0.05, r=0.036)
    E.append(disc('jt_mouth', (0, -0.118, 0.158), 0.016, 'eye', C('#4a3a3a'), (0, -1, 0), 6, (1.2, 0.5), None, 0.004))
    for s, g in (('L', 1), ('R', -1)):  # worried brows
        E.append(disc('jt_brow' + s, (0.052 * g, -0.108, 0.262), 0.02, 'eye', C('#8a6a3a'), (0.2 * g, -1, 0.2), 6, (1, 0.22), None, 0.004))
    cols = [C('#ff9d86'), C('#8fcaff'), C('#dba6ff'), C('#9fe0b4'), C('#ffd27a'), C('#ffb3cf')]
    rings = {'ringA': [], 'ringB': []}
    for i in range(6):
        a = math.radians(i * 60 + 10)
        r = 0.23 if i % 2 else 0.2
        zz = 0.2 + (0.09 if i % 2 else -0.05) + (i % 3) * 0.03
        rings['ringA' if i % 2 else 'ringB'] += butterfly('jt_bf%d' % i, (math.cos(a) * r, math.sin(a) * r, zz), math.degrees(a) + 90, cols[i], 70 + i * 2)
    extra = {k: (v, (0, 0, 0.2)) for k, v in rings.items()}
    return creature('jitters', B, E, x, extra)


def bottled(x):
    glass, cork, paper = C('#9fd8c8'), C('#b98a5a'), C('#f7f0de')
    B = [  # the bottle: glass, so the note shows (it exports as a mesh of its own)
        tube('bt_belly', (0, 0, 0.05), (0, 0, 0.25), 0.1, 0.1, 'glass', glass, segs=8, rings=3, bulge=0.035),
        tube('bt_neck', (0, 0, 0.27), (0, 0, 0.37), 0.05, 0.04, 'glass', glass, segs=8, rings=1, caps=False),
        torus('bt_lip', (0, 0, 0.37), 0.042, 0.012, 'paper', C('#7fbfae'), (8, 4)),
        # the note, rolled up inside, tied with a thread
        tube('bt_note', (0.0, 0.0, 0.07), (0.015, 0.0, 0.26), 0.036, 0.03, 'paper', paper, segs=6, rings=1, smooth=False),
        torus('bt_tie', (0.007, 0, 0.16), 0.036, 0.007, 'paper', C('#e0662c'), (6, 3)),
        # a ring of sea-weed green round its foot, where it sat on the bottom
        torus('bt_foot', (0, 0, 0.04), 0.1, 0.022, 'paper', C('#6fa58f'), (8, 4), scale=(1, 1, 0.6)),
    ]
    E = round_eyes('bt_eye', -0.132, 0.17, 0.045, r=0.03)
    E.append(disc('bt_mouth', (0, -0.136, 0.118), 0.014, 'eye', C('#3a4a4a'), (0, -1, 0), 6, (1.6, 0.35), None, 0.004))
    E.append(ellipsoid('bt_tear', (0.062, -0.128, 0.132), (0.011, 0.007, 0.019), 'glow', C('#bfe6ff'), (6, 4)))
    extra = {'cork': ([tube('bt_cork', (0, 0, 0.36), (0, 0, 0.43), 0.036, 0.044, 'paper', cork, segs=7, rings=1, smooth=False)], (0, 0, 0.37))}
    return creature('bottled', B, E, x, extra)


def letter(x):
    cream, edge, red = C('#fbf3e2'), C('#e4d3b4'), C('#d9412f')
    zc = 0.3  # it hovers: an envelope held upright, like a face
    B = [box('lt_env', (0, 0, zc), (0.32, 0.03, 0.21), 'paper', cream, bevel=0.004, noise=0.03, grad=(edge, cream)),
         # the folds of the back, showing at the front as a V
         box('lt_foldL', (-0.078, -0.017, zc - 0.045), (0.19, 0.004, 0.012), 'paper', edge, rot=(0, 28, 0)),
         box('lt_foldR', (0.078, -0.017, zc - 0.045), (0.19, 0.004, 0.012), 'paper', edge, rot=(0, -28, 0)),
         # a stamp, and the address it never got: three lines, one crossed out
         box('lt_stamp', (0.115, -0.018, zc + 0.062), (0.05, 0.004, 0.06), 'paper', C('#3e6f8a')),
         box('lt_stamp2', (0.115, -0.02, zc + 0.062), (0.032, 0.004, 0.04), 'paper', C('#f6c56a'))]
    for s, g in (('L', 1), ('R', -1)):  # folded paper wings, like a plane's
        B.append(superquad('lt_wing' + s, (0.2 * g, 0.03, zc + 0.01), (0.075, 0.006, 0.05), 'paper', cream, n=2.0, res=1, jitter=0.1, seed=91 + (g > 0),
                           rot=(18, -24 * g, -14 * g)))
    # a little paper tail
    B.append(cone('lt_tail', (0, 0.02, zc - 0.1), (0, 0.07, zc - 0.19), 0.03, 0.004, 'paper', edge, segs=3))
    E = round_eyes('lt_eye', -0.018, zc - 0.012, 0.062, r=0.03)
    E.append(disc('lt_mouth', (0, -0.018, zc - 0.066), 0.014, 'eye', C('#4a3a3a'), (0, -1, 0), 6, (1.5, 0.4), None, 0.004))
    for s, g in (('L', 1), ('R', -1)):  # blushes
        E.append(disc('lt_blush' + s, (0.105 * g, -0.018, zc - 0.045), 0.016, 'eye', C('#f2a7a0'), (0, -1, 0), 6, (1.2, 0.7), None, 0.004))
    # the flap: hinged along the top edge, sealed with red wax
    flap = [box('lt_flap', (0, -0.02, zc + 0.062), (0.3, 0.006, 0.085), 'paper', edge, bevel=0.002),
            cone('lt_point', (0, -0.02, zc + 0.02), (0, -0.02, zc - 0.012), 0.07, 0.004, 'paper', edge, segs=3),
            disc('lt_seal', (0, -0.026, zc + 0.012), 0.026, 'paper', red, (0, -1, 0), 8, (1, 1), None, 0.006)]
    return creature('letter', B, E, x, {'flap': (flap, (0, -0.02, zc + 0.105))})


def build():
    reset_scene()
    use_collection('creatures2')
    roots = [jitters(0), bottled(0.9), letter(1.8)]
    objs = []
    for r in roots:
        objs += descendants(r)
    return export_glb('creatures2.glb', objs)


if __name__ == '__main__':
    print('built', build())
