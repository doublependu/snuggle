# SPDX-License-Identifier: GPL-3.0-only
"""Chapter 5: the Great Sulk, "a Grumbling the size of a building, shaped like a huge grey blanket-lump with
just two enormous tearful eyes peeking out". The grey Grumbling's design (build_creatures.py grey()) at the
size of a house: about 9 m tall and 14 m wide, the hem of the blanket pooled on the ground.

Exports assets-src/export/sulk.glb (run headless: blender -b -P tools/blender/build_sulk.py). Like the other
creatures it is an empty (sulk) with parts the runtime moves (src/systems/sulk.js):
  sulk_body            the lump, the blanket over it and the pooled hem
  sulk_eyes            the two eyes in the blanket's opening, each with a tear welling
  sulk_pupils          their pupils (they follow Pip, slowly)
  sulk_lids            the heavy lids (they droop, and close when it falls asleep)
  sulk_patch_<kind>    seven patches on the blanket, one for each kind of Charm Sprite and one for Bean; pale,
                       so the runtime can warm each into its own colour as that feeling is comforted
Origin at the centre of its base; it faces -Y (glTF +Z)."""
import os, sys, importlib, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *
import build_creatures

importlib.reload(build_creatures)
from build_creatures import creature

C = srgb
BODY_C, BODY_R = (0, 0.2, 3.5), (6.3, 5.4, 3.7)       # the lump under the blanket
BLANKET_C, BLANKET_R = (0, 0.3, 4.1), (7.0, 6.1, 4.6)  # the blanket over it
PATCHES = [('cloud', -60, 10), ('sock', -44, 40), ('homework', -17, 58), ('pompom', 17, 58), ('sparrow', 44, 40), ('grey', 60, 10), ('bean', 0, 76)]


def sulk(x=0.0):
    g1, g2, g3, g4 = C('#6f737b'), C('#8f939b'), C('#aeb1b8'), C('#c4c7cd')

    def window(co):  # the blanket's opening at the front (the eyes peek out of it), and its open bottom
        return co.z < -0.42 or (co.y < -0.6 and abs(co.x) < 0.5 and -0.32 < co.z < 0.3)
    B = [superquad('sk_lump', BODY_C, BODY_R, 'paper', g2, n=2.3, res=5, jitter=0.07, seed=71, taper=0.2, grad=(g1, g2)),
         ellipsoid('sk_blanket', BLANKET_C, BLANKET_R, 'paper', g3, (18, 11), smooth=False, grad=(g2, g4), cut=window),
         # a corner of the blanket flopped over at the top, like the little ones'
         cone('sk_corner', (0.6, 1.4, 8.3), (4.6, 4.2, 6.6), 1.5, 0.2, 'paper', g4, segs=5)]
    # the hem, pooled on the ground in heavy folds all the way round
    for i in range(11):
        a = math.radians(i * 360 / 11 + 8)
        r = 0.95 + (i % 3) * 0.08
        B.append(superquad('sk_hem%d' % i, (math.sin(a) * 6.4 * r, 0.3 + math.cos(a) * 5.5 * r, 0.55 + (i % 2) * 0.12),
                           (2.3, 1.9, 0.6 + (i % 2) * 0.12), 'paper', g1 if i % 2 else g2, n=2.3, res=2, jitter=0.25, seed=80 + i,
                           rot=(0, 0, -math.degrees(a))))
    # long creases down the blanket
    for i, (yaw, p0, p1) in enumerate(((-78, 55, -8), (-30, 80, 34), (30, 80, 34), (78, 55, -8), (140, 60, -5), (-140, 60, -5), (180, 70, 0))):
        a, _ = on_sphere(BLANKET_C, BLANKET_R, yaw, p0, 0.05)
        b, _ = on_sphere(BLANKET_C, BLANKET_R, yaw + 6, p1, 0.12)
        B.append(tube('sk_fold%d' % i, a, b, 0.16, 0.3, 'paper', g2, segs=4, rings=2, caps=False, smooth=False))
    # the dark of the opening, and a small, wobbly mouth
    c, n = on_sphere(BODY_C, BODY_R, 0, 8, 0.02)
    B.append(disc('sk_dark', c, 3.4, 'paper', C('#5c6068'), n, 14, (1.0, 0.62), None, 0.05))

    # two enormous tearful eyes: pale, so they show in the dark of the opening; the pupils are a part of their own
    E, PUP = [], []
    for s, g in (('L', 1), ('R', -1)):
        c, n = on_sphere(BODY_C, BODY_R, 15.5 * g, 14, 0.1)
        E.append(disc('sk_eye' + s, c, 1.28, 'eye', C('#dfe5ee'), n, 16, (1.0, 1.04), None, 0.05))
        # the tear welling at the bottom of each eye
        ct = (c[0] - 0.08 * g, c[1] - 0.08, c[2] - 0.9)
        E.append(disc('sk_well' + s, ct, 0.62, 'eye', C('#9cc4ea'), n, 10, (1.3, 0.42), None, 0.05))
        cp = (c[0], c[1] - 0.07, c[2] - 0.1)
        PUP.append(disc('sk_pupil' + s, cp, 0.76, 'eye', C('#24252b'), n, 14, (1.0, 1.06), None, 0.05))
        cg = (c[0] + 0.3 * g, c[1] - 0.14, c[2] + 0.28)
        PUP.append(disc('sk_glint' + s, cg, 0.25, 'eye', C('#ffffff'), n, 8, (1, 1), None, 0.05))
    c, n = on_sphere(BODY_C, BODY_R, 0, -11, 0.08)
    E.append(disc('sk_mouth', c, 0.36, 'eye', C('#33343b'), n, 8, (1.6, 0.34), None, 0.05))
    pc, _ = on_sphere(BODY_C, BODY_R, 0, 14, 0.1)

    # the lids: one part, hinged along the top of the eyes
    L = []
    top = None
    for s, g in (('L', 1), ('R', -1)):
        c, n = on_sphere(BODY_C, BODY_R, 15.5 * g, 14, 0.2)
        cl = (c[0], c[1] - 0.18, c[2] + 0.95)
        L.append(disc('sk_lid' + s, cl, 1.28, 'paper', g2, n, 12, (1.12, 0.42), None, 0.06))
        top = (0, c[1], c[2] + 1.5)

    extra = {'lids': (L, top), 'pupils': (PUP, tuple(pc))}
    # seven patches sewn on the blanket: pale, each a different shape
    for i, (kind, yaw, pitch) in enumerate(PATCHES):
        c, n = on_sphere(BLANKET_C, BLANKET_R, yaw, pitch, 0.08)
        segs = (4, 6, 5, 6, 4, 5, 8)[i]
        r = 1.25 if kind != 'bean' else 1.0
        # the patch, on a slightly bigger backing whose edge shows as a hem round it
        P = [disc('sk_patch_' + kind, c, r, 'cloth', C('#d5d7db'), n, segs, (1, 1), None, 0.12),
             disc('sk_hem_' + kind, c, r * 1.14, 'cloth', C('#eef0f2'), n, segs, (1, 1), None, 0.05)]
        extra['patch_' + kind] = (P, tuple(c))
    return creature('sulk', B, E, x, extra)


def build():
    reset_scene()
    use_collection('sulk')
    root = sulk(0)
    return export_glb('sulk.glb', descendants(root))


if __name__ == '__main__':
    print('built', build())
