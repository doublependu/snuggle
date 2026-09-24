"""Rigged chibi characters. Each function builds one character from primitives, skins it to the
shared humanoid skeleton, bakes vertex AO and exports assets-src/export/<name>.glb (no animations;
clips live in anim_humanoid.glb, see build_anims.py)."""
import os, sys, importlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *

C = lambda h: srgb(h)


def face(hc, hr, iris='#3a2418', eye_r=0.042, eye_yaw=26, eye_pitch=-8, brow='#2a1c16', blush='#f2a48e',
         mouth='#a85a4e', skin='#f4d3c0', ears=True, nose=True, sclera=False, blush_on=True):
    parts = []
    for s, g in (('L', 1), ('R', -1)):
        if sclera:
            p, n = on_sphere(hc, hr, eye_yaw * g, eye_pitch, 0.001)
            parts.append(disc('sclera_' + s, p, eye_r * 1.08, 'eye', C('#fbf6ee'), n, 14, (1.0, 0.92), 'head', 0.002))
        p, n = on_sphere(hc, hr, eye_yaw * g - 1 * g, eye_pitch - 1.5, 0.004)
        parts.append(disc('iris_' + s, p, eye_r * 0.95, 'eye', C(iris), n, 14, (0.88, 1.0), 'head', 0.002))
        p, n = on_sphere(hc, hr, eye_yaw * g - 1 * g, eye_pitch - 2.5, 0.006)
        parts.append(disc('pupil_' + s, p, eye_r * 0.5, 'eye', C('#120b08'), n, 10, (0.9, 1.0), 'head', 0.002))
        p, n = on_sphere(hc, hr, eye_yaw * g + 3 * g, eye_pitch + 4, 0.008)
        parts.append(disc('glint_' + s, p, eye_r * 0.3, 'eye', C('#ffffff'), n, 8, (1, 1), 'head', 0.002))
        p, n = on_sphere(hc, hr, eye_yaw * g - 5 * g, eye_pitch - 8, 0.008)
        parts.append(disc('glint2_' + s, p, eye_r * 0.13, 'eye', C('#ffffff'), n, 6, (1, 1), 'head', 0.002))
        p, n = on_sphere(hc, hr, (eye_yaw + 2) * g, eye_pitch + 17, 0.004)
        parts.append(disc('brow_' + s, p, eye_r * 0.8, 'eye', C(brow), n, 8, (1.3, 0.28), 'head', 0.003))
        if blush_on:
            p, n = on_sphere(hc, hr, (eye_yaw + 16) * g, eye_pitch - 16, 0.002)
            parts.append(disc('blush_' + s, p, 0.03, 'skin', C(blush), n, 10, (1.25, 0.75), 'head', 0.002))
        if ears:
            p, n = on_sphere(hc, hr, 86 * g, -8, -0.01)
            parts.append(ellipsoid('ear_' + s, p, (0.022, 0.032, 0.04), 'skin', C(skin), (8, 6), bones='head'))
    if nose:
        p, n = on_sphere(hc, hr, 0, eye_pitch - 10, -0.004)
        parts.append(ellipsoid('nose', p, (0.019, 0.016, 0.015), 'skin', mix(C(skin), C('#e8a28c'), 0.35), (8, 6),
                               bones='head'))
    p, n = on_sphere(hc, hr, 0, eye_pitch - 23, 0.002)
    parts.append(disc('mouth', p, 0.015, 'eye', C(mouth), n, 8, (1.5, 0.5), 'head', 0.002))
    return parts


def limbs(J, sleeve, sleeve_r=(0.066, 0.056), cuff=None, hand='#f4d3c0', leg=None, leg_r=(0.074, 0.056),
          sock=None, boot='#e8dcc4', lace=None, bulge=0.018, boot_r=(0.05, 0.078, 0.046), sleeve_kind='cloth',
          leg_kind='cloth', boot_kind='cloth'):
    parts = []
    for s, g in (('L', 1), ('R', -1)):
        sh = Vector(J['shoulder_' + s][0])
        wr = Vector(J['hand_' + s][0])
        parts.append(tube('sleeve_' + s, sh + Vector((0.02 * g, 0, 0)), wr, sleeve_r[0], sleeve_r[1], sleeve_kind,
                          C(sleeve), segs=10, rings=6, bulge=bulge,
                          bones=['shoulder_' + s, 'upperarm_' + s, 'forearm_' + s]))
        if cuff:
            parts.append(torus('cuff_' + s, wr - Vector((0.012 * g, 0, 0)), sleeve_r[1] * 0.9, 0.014, 'cloth', C(cuff),
                               (12, 5), rot=(0, 90, 0), bones='forearm_' + s))
        hp = Vector(J['hand_' + s][1]) - Vector((0.012 * g, 0, 0))
        parts.append(ellipsoid('hand_' + s, hp, (0.036, 0.028, 0.038), 'skin', C(hand), (10, 7), bones='hand_' + s))
        hip = Vector(J['thigh_' + s][0])
        ank = Vector(J['shin_' + s][1])
        if leg:
            parts.append(tube('leg_' + s, hip + Vector((0, 0, 0.02)), ank + Vector((0, 0, 0.04)), leg_r[0], leg_r[1],
                              leg_kind, C(leg), segs=10, rings=6, bulge=bulge,
                              bones=['hips', 'thigh_' + s, 'shin_' + s]))
        if sock:
            parts.append(tube('sock_' + s, ank + Vector((0, 0, 0.0)), ank + Vector((0, 0, 0.06)), 0.035, 0.037, 'cloth',
                              C(sock), segs=8, rings=1, bones='shin_' + s))
        parts.append(superquad('boot_' + s, ank + Vector((0, -0.025, -0.02)), boot_r, boot_kind, C(boot), n=3.0, res=3,
                               smooth=True, bones='foot_' + s))
        if lace:
            parts.append(ellipsoid('lace_' + s, ank + Vector((0, -0.05, 0.02)), (0.03, 0.02, 0.012), 'cloth', C(lace),
                                   (8, 5), bones='foot_' + s))
    return parts


def finish(name, J, parts, ao=0.32, extra_objs=()):
    rig = build_armature(name, J)
    skin(parts, rig)
    meshes = join_mixed(parts, name)
    bake_ao(meshes, dist=0.07, samples=20, strength=ao)
    for m in meshes:
        bind(m, rig)
    return export_glb(name + '.glb', [rig, *meshes, *extra_objs])


# ---------------------------------------------------------------- Xiao Pei

def xiaopei():
    reset_scene()
    use_collection('xiaopei')
    J = humanoid_joints(height=1.15, head_r=0.19, sh_w=0.11, arm=0.30, hip_w=0.07)
    J['braid_1'] = ((0.07, 0.15, 0.9), (0.11, 0.17, 0.79), 'head')
    J['braid_2'] = ((0.11, 0.17, 0.79), (0.14, 0.18, 0.66), 'braid_1')
    J['braid_3'] = ((0.14, 0.18, 0.66), (0.16, 0.19, 0.53), 'braid_2')
    chin = J['neck'][1][2] - 0.02
    hc, hr = (0, 0, chin + 0.19), (0.19, 0.178, 0.19)
    skin_c = '#f4d3c0'
    P = []
    P.append(ellipsoid('head', hc, hr, 'skin', C(skin_c), (18, 12), bones='head'))
    P += face(hc, hr, skin=skin_c)
    # hair cap with an opening for the face, bangs, side locks
    hair = C('#1f1917')
    P.append(ellipsoid('hair', (0, 0.012, hc[2] + 0.012), (0.199, 0.19, 0.2), 'hair', hair, (18, 12), bones='head',
                       cut=lambda co: co.y < -0.25 and co.z < 0.42))
    for i, yaw in enumerate((-44, -24, -6, 12, 30, 46)):
        p, n = on_sphere(hc, hr, yaw, 38, 0.0)
        P.append(ellipsoid('bang%d' % i, p + Vector((0, -0.01, -0.025)), (0.045, 0.026, 0.06), 'hair', hair, (8, 6),
                           rot=(-20, 0, -yaw * 0.6), bones='head'))
    for s, g in (('L', 1), ('R', -1)):
        p, n = on_sphere(hc, hr, 74 * g, -12, -0.012)
        P.append(ellipsoid('lock_' + s, p + Vector((0, -0.005, -0.03)), (0.02, 0.03, 0.085), 'hair', hair, (8, 6),
                           rot=(8, 0, 0), bones='head'))
    # braid
    pts = [Vector((0.06, 0.16, 0.9)), Vector((0.1, 0.18, 0.8)), Vector((0.125, 0.19, 0.72)), Vector((0.14, 0.195, 0.65)),
           Vector((0.15, 0.2, 0.58))]
    bb = ['head', 'braid_1', 'braid_1', 'braid_2', 'braid_3']
    for i, p in enumerate(pts):
        P.append(ellipsoid('braid%d' % i, p, (0.042 - i * 0.003, 0.04 - i * 0.003, 0.055), 'hair', hair, (8, 6),
                           rot=(0, 18 if i % 2 else -18, 0), bones=bb[i]))
    P.append(torus('braid_tie', (0.155, 0.2, 0.545), 0.026, 0.012, 'cloth', C('#e0662c'), (10, 5), bones='braid_3'))
    P.append(cone('braid_tuft', (0.157, 0.2, 0.54), (0.17, 0.205, 0.45), 0.03, 0.006, 'hair', hair, segs=7,
                  bones='braid_3'))
    # neck + body
    P.append(tube('neck', (0, 0, J['neck'][0][2] - 0.03), (0, 0, chin + 0.04), 0.045, 0.045, 'skin', C(skin_c), segs=8,
                  rings=1, bones=['chest', 'neck']))
    hip_z = J['hips'][0][2]
    top = J['chest'][1][2]
    jacket = '#e2a13a'
    P.append(tube('jacket', (0, 0, hip_z - 0.075), (0, 0, top + 0.01), 0.165, 0.11, 'cloth', C(jacket), segs=14, rings=5,
                  bulge=0.02, flat_x=1.12, bones=['hips', 'spine', 'chest']))
    P.append(ellipsoid('collar', (0, -0.035, top - 0.005), (0.085, 0.075, 0.045), 'cloth', C('#f1e9d8'), (12, 6),
                       bones='chest'))
    P.append(ellipsoid('hood', (0, 0.125, top - 0.045), (0.12, 0.07, 0.085), 'cloth', C('#d4922f'), (12, 8),
                       bones='hood'))
    P.append(tube('placket', (0, -0.14, hip_z - 0.08), (0, -0.105, top - 0.04), 0.012, 0.012, 'cloth', C('#c07f26'),
                  segs=6, rings=2, bones=['hips', 'spine', 'chest']))
    for s, g in (('L', 1), ('R', -1)):
        P.append(box('pocket_' + s, (0.085 * g, -0.146, hip_z - 0.0), (0.055, 0.012, 0.05), 'cloth', C('#d6972f'),
                     rot=(0, 0, -12 * g), bones=['hips', 'spine'], bevel=0.008))
    # chest strap with the yarn bundle (Lullaby Thread)
    P.append(tube('strap', (-0.1, -0.1, top - 0.01), (0.13, -0.12, hip_z + 0.02), 0.012, 0.012, 'cloth',
                  C('#8a5a33'), segs=6, rings=3, bones=['chest', 'spine']))
    P.append(ellipsoid('yarn', (-0.025, -0.16, top - 0.11), (0.058, 0.045, 0.055), 'cloth', C('#e1873a'), (10, 8),
                       bones='chest'))
    P.append(torus('yarn_wrap', (-0.025, -0.16, top - 0.11), 0.05, 0.008, 'cloth', C('#c96a26'), (12, 4),
                   rot=(90, 0, 30), bones='chest'))
    # trousers
    P.append(ellipsoid('seat', (0, 0.0, hip_z - 0.04), (0.13, 0.11, 0.09), 'cloth', C('#ece2cc'), (12, 8),
                       bones=['hips', 'thigh_L', 'thigh_R']))
    P += limbs(J, jacket, cuff='#9c7a4c', hand=skin_c, leg='#ece2cc', sock='#d9d0bf', boot='#e8dcc4', lace='#d1692e')
    return finish('xiaopei', J, P)


def head_basics(J, skin_c, head_r=0.19, squash=(1.0, 0.94, 1.0)):
    chin = J['neck'][1][2] - 0.02
    hc = (0, 0, chin + head_r)
    hr = (head_r * squash[0], head_r * squash[1], head_r * squash[2])
    P = [ellipsoid('head', hc, hr, 'skin', C(skin_c), (18, 12), bones='head'),
         tube('neck', (0, 0, J['neck'][0][2] - 0.03), (0, 0, chin + 0.04), 0.045, 0.045, 'skin', C(skin_c), segs=8,
              rings=1, bones=['chest', 'neck'])]
    return hc, hr, chin, P


def hair_cap(hc, hr, color, front=0.42, back_drop=0.0, scale=1.05):
    return ellipsoid('hair', (0, 0.012, hc[2] + 0.012 - back_drop), (hr[0] * scale, hr[1] * scale, hr[2] * scale),
                     'hair', C(color), (18, 12), bones='head', cut=lambda co: co.y < -0.25 and co.z < front)


def bangs(hc, hr, color, yaws=(-40, -20, 0, 20, 40), pitch=38, size=(0.045, 0.026, 0.06)):
    out = []
    for i, yaw in enumerate(yaws):
        p, n = on_sphere(hc, hr, yaw, pitch, 0.0)
        out.append(ellipsoid('bang%d' % i, p + Vector((0, -0.01, -0.025)), size, 'hair', C(color), (8, 6),
                             rot=(-20, 0, -yaw * 0.6), bones='head'))
    return out


# ---------------------------------------------------------------- Lin Tangtang (middle variant of the ref)

def tangtang():
    reset_scene()
    use_collection('tangtang')
    J = humanoid_joints(height=1.3, head_r=0.19, sh_w=0.12, arm=0.34, hip_w=0.075)
    skin_c = '#f3cfb6'
    hc, hr, chin, P = head_basics(J, skin_c)
    P += face(hc, hr, iris='#5a3421', eye_r=0.04, skin=skin_c)
    hair = '#2b211c'
    P.append(hair_cap(hc, hr, hair))
    P += bangs(hc, hr, hair, yaws=(-44, -26, -8, 10, 28, 46), pitch=34)
    for s, g in (('L', 1), ('R', -1)):
        p, n = on_sphere(hc, hr, 72 * g, -20, -0.01)
        P.append(ellipsoid('lock_' + s, p + Vector((0, 0.0, -0.04)), (0.03, 0.035, 0.1), 'hair', C(hair), (8, 6),
                           bones='head'))
        P.append(ellipsoid('plait_' + s, p + Vector((0.01 * g, 0.03, -0.14)), (0.022, 0.022, 0.05), 'hair', C(hair),
                           (8, 6), bones='head'))
    # teal beret with a tan band, tilted
    P.append(ellipsoid('beret', (0.02, 0.02, hc[2] + 0.13), (0.215, 0.2, 0.085), 'cloth', C('#3f6f7a'), (16, 8),
                       rot=(0, -10, 0), bones='head'))
    P.append(torus('band', (0.01, 0.015, hc[2] + 0.095), 0.18, 0.018, 'cloth', C('#b98a5a'), (18, 5),
                   rot=(0, -8, 0), bones='head'))
    hip_z, top = J['hips'][0][2], J['chest'][1][2]
    P.append(tube('shirt', (0, 0, hip_z - 0.03), (0, 0, top + 0.01), 0.15, 0.115, 'cloth', C('#efe6d6'), segs=14,
                  rings=4, bulge=0.012, flat_x=1.1, bones=['hips', 'spine', 'chest']))
    P.append(tube('vest', (0, 0.005, hip_z + 0.1), (0, 0.005, top + 0.012), 0.155, 0.122, 'cloth', C('#3f6f7a'),
                  segs=14, rings=3, bulge=0.01, flat_x=1.12, caps=False, bones=['spine', 'chest']))
    P.append(ellipsoid('scarf', (0, -0.03, top - 0.01), (0.1, 0.09, 0.04), 'cloth', C('#e0762c'), (12, 6),
                       bones='chest'))
    P.append(torus('sash', (0, 0, hip_z + 0.02), 0.155, 0.035, 'cloth', C('#e0762c'), (16, 6), scale=(1.1, 1, 1),
                   bones=['hips', 'spine']))
    P.append(ellipsoid('sash_tail', (0.1, -0.12, hip_z - 0.1), (0.04, 0.02, 0.11), 'cloth', C('#e0762c'), (8, 6),
                       rot=(0, 12, 0), bones='hips'))
    P.append(torus('belt', (0, 0, hip_z - 0.02), 0.16, 0.014, 'wood', C('#6b4a30'), (16, 4), scale=(1.1, 1, 1),
                   bones='hips'))
    P.append(box('pouch', (-0.15, -0.07, hip_z - 0.06), (0.07, 0.05, 0.08), 'wood', C('#7a5436'), bevel=0.012,
                 bones='hips'))
    P.append(ellipsoid('bread', (-0.16, -0.08, hip_z + 0.0), (0.05, 0.03, 0.03), 'plain', C('#d9954a'), (8, 6),
                       rot=(0, 30, 20), bones='hips'))
    P.append(ellipsoid('seat', (0, 0.0, hip_z - 0.05), (0.14, 0.12, 0.1), 'cloth', C('#ede3cf'), (12, 8),
                       bones=['hips', 'thigh_L', 'thigh_R']))
    P += limbs(J, '#3f6f7a', sleeve_r=(0.065, 0.055), cuff='#efe6d6', hand='#3b2f2a', leg='#ede3cf',
               leg_r=(0.085, 0.06), bulge=0.03, sock='#6b4a33', boot='#6b4a33', lace='#b98a5a')
    return finish('tangtang', J, P)


# ---------------------------------------------------------------- Wei Bao + Captain Honk

def weibao():
    reset_scene()
    use_collection('weibao')
    J = humanoid_joints(height=1.1, head_r=0.185, sh_w=0.105, arm=0.29, hip_w=0.068)
    sh_z = J['hand_L'][0][2]
    hx = J['hand_L'][1][0]
    J['puppet_jaw'] = ((hx + 0.075, 0, sh_z + 0.13), (hx + 0.135, 0, sh_z + 0.13), 'hand_L')
    skin_c = '#efc8a6'
    hc, hr, chin, P = head_basics(J, skin_c, head_r=0.185)
    P += face(hc, hr, iris='#1e1511', eye_r=0.047, eye_yaw=27, skin=skin_c, brow='#5a3d2a')
    P.append(hair_cap(hc, hr, '#6b4a33', front=0.2, scale=1.03))
    # mustard bandana cap with a knot tail
    P.append(ellipsoid('cap', (0, 0.02, hc[2] + 0.07), (0.205, 0.2, 0.15), 'cloth', C('#e0a53a'), (16, 10),
                       bones='head', cut=lambda co: co.z < -0.1))
    P.append(ellipsoid('cap_tail', (0.19, 0.08, hc[2] - 0.02), (0.035, 0.07, 0.03), 'cloth', C('#d8962e'), (8, 6),
                       rot=(0, -30, 20), bones='head'))
    hip_z, top = J['hips'][0][2], J['chest'][1][2]
    P.append(tube('shirt', (0, 0, hip_z - 0.06), (0, 0, top + 0.01), 0.155, 0.11, 'cloth', C('#efe9dc'), segs=14,
                  rings=4, bulge=0.018, flat_x=1.12, bones=['hips', 'spine', 'chest']))
    P.append(ellipsoid('scarf', (0, -0.02, top - 0.005), (0.11, 0.1, 0.05), 'cloth', C('#e0a53a'), (12, 6),
                       bones='chest'))
    P.append(tube('strap', (0.1, -0.1, top - 0.01), (-0.13, -0.12, hip_z + 0.0), 0.011, 0.011, 'cloth',
                  C('#bfb3a0'), segs=6, rings=3, bones=['chest', 'spine']))
    P.append(superquad('satchel', (-0.15, -0.06, hip_z - 0.05), (0.07, 0.035, 0.07), 'cloth', C('#d8cdb8'), n=3,
                       res=2, smooth=True, bones='hips'))
    P.append(ellipsoid('seat', (0, 0.0, hip_z - 0.04), (0.13, 0.11, 0.09), 'cloth', C('#e0a53a'), (12, 8),
                       bones=['hips', 'thigh_L', 'thigh_R']))
    P += limbs(J, '#efe9dc', sleeve_r=(0.062, 0.052), hand=skin_c, leg='#e0a53a', leg_r=(0.08, 0.058), bulge=0.03,
               sock='#d9d0bf', boot='#e6dccb', lace='#b79a74')
    # Captain Honk: a felt goose hand puppet on his left hand (beak on puppet_jaw)
    white, orange = C('#f7f4ee'), C('#f08a2a')
    P.append(ellipsoid('honk_body', (hx - 0.01, 0, sh_z + 0.01), (0.075, 0.065, 0.07), 'cloth', white, (12, 8),
                       bones=['forearm_L', 'hand_L']))
    P.append(tube('honk_neck', (hx + 0.01, 0, sh_z + 0.04), (hx + 0.05, 0, sh_z + 0.13), 0.03, 0.026, 'cloth', white,
                  segs=8, rings=3, bones='hand_L'))
    P.append(ellipsoid('honk_head', (hx + 0.06, 0, sh_z + 0.15), (0.045, 0.04, 0.04), 'cloth', white, (10, 8),
                       bones='hand_L'))
    P.append(cone('honk_beak', (hx + 0.095, 0, sh_z + 0.155), (hx + 0.15, 0, sh_z + 0.15), 0.018, 0.004, 'plain',
                  orange, segs=6, bones='hand_L'))
    P.append(cone('honk_jaw', (hx + 0.09, 0, sh_z + 0.137), (hx + 0.14, 0, sh_z + 0.135), 0.013, 0.003, 'plain',
                  C('#d9761f'), segs=6, bones='puppet_jaw'))
    for s, g in (('L', 1), ('R', -1)):
        P.append(disc('honk_eye' + s, (hx + 0.07, -0.038 * g, sh_z + 0.165), 0.009, 'eye', C('#111111'),
                      (0.2, -g, 0.1), 8, (1, 1), 'hand_L', 0.003))
    return finish('weibao', J, P)


# ---------------------------------------------------------------- Master Fang Qiuyue

def fang():
    reset_scene()
    use_collection('fang')
    J = humanoid_joints(height=1.0, head_r=0.18, sh_w=0.115, arm=0.26, hip_w=0.075, hip_z=0.33)
    skin_c = '#f2c9b0'
    hc, hr, chin, P = head_basics(J, skin_c, head_r=0.18, squash=(1.08, 1.0, 0.98))
    P += face(hc, hr, iris='#15100d', eye_r=0.032, eye_yaw=24, eye_pitch=-4, skin=skin_c, brow='#d9d4cc',
              blush='#ee9f8a')
    # round glasses
    for s, g in (('L', 1), ('R', -1)):
        p, n = on_sphere(hc, hr, 24 * g, -4, 0.02)
        P.append(torus('glass_' + s, p, 0.05, 0.006, 'wood', C('#6b4a33'), (16, 4), rot=(90, 0, 0), bones='head'))
    p, n = on_sphere(hc, hr, 0, -2, 0.02)
    P.append(tube('bridge', p + Vector((-0.02, 0, 0)), p + Vector((0.02, 0, 0)), 0.005, 0.005, 'wood', C('#6b4a33'),
                  segs=5, rings=1, bones='head'))
    # white curls and the flat cap
    for s, g in (('L', 1), ('R', -1)):
        for i, (dy, dz) in enumerate(((0.02, 0.02), (0.07, -0.03), (0.0, -0.06))):
            P.append(ico('curl_%s%d' % (s, i), (0.17 * g, dy, hc[2] + dz), (0.055, 0.05, 0.05), 'hair',
                         C('#f2efe9'), subdiv=1, jitter=0.2, seed=i + (7 if g > 0 else 3), bones='head', smooth=True))
    P.append(hair_cap(hc, hr, '#ece8e1', front=0.35, scale=1.03))
    P.append(ellipsoid('cap', (0, 0.02, hc[2] + 0.14), (0.235, 0.22, 0.07), 'cloth', C('#a88c68'), (18, 8),
                       bones='head'))
    P.append(torus('cap_band', (0, 0.01, hc[2] + 0.1), 0.18, 0.025, 'cloth', C('#e27a36'), (18, 6), bones='head'))
    P.append(ellipsoid('cap_nub', (0, 0.02, hc[2] + 0.21), (0.03, 0.03, 0.02), 'cloth', C('#8a7050'), (8, 5),
                       bones='head'))
    hip_z, top = J['hips'][0][2], J['chest'][1][2]
    # enormous knitted cardigan with sweet-filled pockets
    P.append(tube('cardigan', (0, 0, hip_z - 0.12), (0, 0, top + 0.015), 0.19, 0.13, 'cloth', C('#e8843a'),
                  segs=16, rings=5, bulge=0.035, flat_x=1.1, bones=['hips', 'spine', 'chest']))
    P.append(tube('placket', (0, -0.2, hip_z - 0.1), (0, -0.14, top - 0.03), 0.016, 0.016, 'cloth', C('#f1e9d8'),
                  segs=6, rings=2, bones=['hips', 'spine', 'chest']))
    for i in range(3):
        P.append(ellipsoid('button%d' % i, (0.035, -0.2 + i * 0.02, hip_z - 0.02 + i * 0.09), (0.014, 0.008, 0.014),
                           'wood', C('#5a3d2a'), (8, 5), bones=['spine', 'chest']))
    for s, g in (('L', 1), ('R', -1)):
        P.append(box('pocket_' + s, (0.12 * g, -0.19, hip_z - 0.05), (0.09, 0.03, 0.08), 'cloth', C('#d8742e'),
                     bevel=0.012, bones=['hips', 'spine']))
        P.append(ellipsoid('sweet_' + s, (0.12 * g, -0.2, hip_z - 0.0), (0.025, 0.018, 0.022), 'glow',
                           C('#f6c945') if g > 0 else C('#e86f5c'), (8, 6), bones=['hips', 'spine']))
    P.append(torus('scarf', (0, -0.01, top - 0.01), 0.1, 0.04, 'cloth', C('#c9a27a'), (14, 6), scale=(1.1, 1, 0.8),
                   bones='chest'))
    P.append(ellipsoid('scarf_knot', (0.03, -0.12, top - 0.04), (0.05, 0.035, 0.05), 'cloth', C('#b8906a'), (8, 6),
                       bones='chest'))
    P += limbs(J, '#e8843a', sleeve_r=(0.075, 0.062), cuff='#d06f2a', hand=skin_c, leg='#7d7a70',
               leg_r=(0.075, 0.06), bulge=0.02, boot='#bdb3a3', boot_r=(0.052, 0.07, 0.042))
    # tote bag in her right hand
    hx = J['hand_R'][1][0]
    P.append(superquad('bag', (hx - 0.01, -0.02, J['hand_R'][0][2] - 0.12), (0.06, 0.03, 0.07), 'cloth',
                       C('#a8916b'), n=3, res=2, smooth=True, bones='hand_R'))
    return finish('fang', J, P)


# ---------------------------------------------------------------- townsfolk (passengers, students)

FOLK = {
    'folk_a': dict(height=1.25, skin='#f0c7a8', hair='#3a2c25', top='#8a6fa8', bottom='#5f5470', hat=None,
                   bun=True, shawl='#c7a3cf'),
    'folk_b': dict(height=1.16, skin='#f5d6c2', hair='#1d1a19', top='#4f7ea3', bottom='#e8e2d6', hat=None,
                   bun=False, shawl=None, sash='#e9c46a'),
    'folk_c': dict(height=1.3, skin='#d9a888', hair='#2a211d', top='#6e8b5a', bottom='#6b5a48', hat='#c9b28a',
                   bun=False, shawl=None),
}


def folk(name):
    f = FOLK[name]
    reset_scene()
    use_collection(name)
    J = humanoid_joints(height=f['height'], head_r=0.18, sh_w=0.115, arm=0.31, hip_w=0.072)
    hc, hr, chin, P = head_basics(J, f['skin'], head_r=0.18)
    P += face(hc, hr, iris='#221610', eye_r=0.034, skin=f['skin'], brow=f['hair'], blush_on=False)
    P.append(hair_cap(hc, hr, f['hair'], front=0.3))
    P += bangs(hc, hr, f['hair'], yaws=(-30, -10, 10, 30), pitch=40, size=(0.05, 0.025, 0.05))
    if f['bun']:
        P.append(ellipsoid('bun', (0, 0.1, hc[2] + 0.14), (0.07, 0.07, 0.06), 'hair', C(f['hair']), (10, 8),
                           bones='head'))
    if f['hat']:
        P.append(cone('hat', (0, 0.01, hc[2] + 0.1), (0, 0.01, hc[2] + 0.26), 0.3, 0.02, 'cloth', C(f['hat']),
                      segs=14))
        P[-1]['bones'] = 'head'
    hip_z, top = J['hips'][0][2], J['chest'][1][2]
    P.append(tube('top', (0, 0, hip_z - 0.08), (0, 0, top + 0.01), 0.16, 0.115, 'cloth', C(f['top']), segs=14,
                  rings=4, bulge=0.015, flat_x=1.1, bones=['hips', 'spine', 'chest']))
    if f['shawl']:
        P.append(torus('shawl', (0, 0, top - 0.02), 0.11, 0.045, 'cloth', C(f['shawl']), (14, 6),
                       scale=(1.15, 1, 0.8), bones='chest'))
    if f.get('sash'):
        P.append(torus('sash', (0, 0, hip_z + 0.02), 0.16, 0.022, 'cloth', C(f['sash']), (16, 5),
                       scale=(1.1, 1, 1), bones=['hips', 'spine']))
    P.append(ellipsoid('seat', (0, 0.0, hip_z - 0.04), (0.13, 0.11, 0.09), 'cloth', C(f['bottom']), (12, 8),
                       bones=['hips', 'thigh_L', 'thigh_R']))
    P += limbs(J, f['top'], hand=f['skin'], leg=f['bottom'], boot='#5a4a3e', leg_r=(0.07, 0.055))
    return finish(name, J, P, ao=0.28)


BUILDERS = {'xiaopei': xiaopei, 'tangtang': tangtang, 'weibao': weibao, 'fang': fang,
            'folk_a': lambda: folk('folk_a'), 'folk_b': lambda: folk('folk_b'), 'folk_c': lambda: folk('folk_c')}

if __name__ == '__main__':
    for n in globals().get('ONLY', None) or list(BUILDERS):
        print('built', BUILDERS[n]())
