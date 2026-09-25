# SPDX-License-Identifier: GPL-3.0-only
"""Shared humanoid animation library -> assets-src/export/anim_humanoid.glb.

Every clip is generated from simple periodic functions on the axis-aligned chibi T-pose skeleton.
Rotations are written in armature space (x = character's left, y = backward, z = up):
  thigh forward  = rx(-a)   knee bend   = rx(+a)   toe up = rx(-a)
  lean forward   = rx(+a)   side bend L = ry(+a)   turn left = rz(+a)
  arm L down     = ry(+a)   arm R down  = ry(-a)   arm forward = rx(-a) after lowering
  elbow L bend   = rz(-a)   elbow R bend = rz(+a)
The runtime (src/actors/humanoid.js) rescales the hips translation track per character.
"""
import os, sys, importlib, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *

TAU = math.pi * 2
S = math.sin
Cn = math.cos


def base(arm_down=74, arm_fwd=6, elbow=12):
    return {
        'upperarm_L': arot(('y', arm_down), ('x', -arm_fwd)),
        'upperarm_R': arot(('y', -arm_down), ('x', -arm_fwd)),
        'forearm_L': arot(('z', -elbow)),
        'forearm_R': arot(('z', elbow)),
    }


def idle(t):
    p = base(arm_down=74 + 2 * S(TAU * t))
    p['chest'] = arot(('x', 1.5 * S(TAU * t)))
    p['head'] = arot(('x', -1 - 1.5 * S(TAU * t)), ('y', 2 * S(TAU * t * 0.5 + 1)))
    p['spine'] = arot(('y', 1.2 * S(TAU * t)))
    return p, (0, 0, -0.004 + 0.004 * S(TAU * t))


def locomotion(t, stride, knee, arm, lean, bob, elbow, twist):
    a = TAU * t
    p = base(arm_down=76, arm_fwd=0, elbow=elbow)
    for s, g in (('L', 1), ('R', -1)):
        ph = a if s == 'L' else a + math.pi
        p['thigh_' + s] = arot(('x', -stride * S(ph)))
        swing = max(0.0, Cn(ph))  # knee bends while the leg swings forward
        p['shin_' + s] = arot(('x', 6 + knee * swing))
        p['foot_' + s] = arot(('x', -10 * S(ph) - 6))
        # arms counter-swing
        armph = ph + math.pi
        p['upperarm_' + s] = arot(('y', 76 * g), ('x', -arm * S(armph)))
    p['spine'] = arot(('x', lean * 0.5), ('z', twist * S(a)))
    p['chest'] = arot(('x', lean * 0.5), ('z', -twist * 1.4 * S(a)))
    p['hips'] = arot(('z', -twist * S(a)), ('y', 2.5 * S(a)))
    p['head'] = arot(('x', -lean * 0.6), ('z', twist * 0.6 * S(a)))
    return p, (0, 0, -bob * 0.5 + bob * abs(S(a)))


def walk(t):
    return locomotion(t, 26, 38, 22, 3, 0.022, 14, 5)


def run(t):
    return locomotion(t, 42, 78, 38, 13, 0.035, 70, 9)


def air(t):
    a = TAU * t
    p = base(arm_down=38 + 6 * S(a), arm_fwd=10, elbow=25)
    p['thigh_L'] = arot(('x', -48))
    p['shin_L'] = arot(('x', 70))
    p['thigh_R'] = arot(('x', -18))
    p['shin_R'] = arot(('x', 38))
    p['foot_L'] = arot(('x', 12))
    p['foot_R'] = arot(('x', 14))
    p['spine'] = arot(('x', 4))
    p['head'] = arot(('x', -6))
    return p, (0, 0, 0.02)


def land(t):
    k = S(math.pi * t)  # crouch and recover
    p = base(arm_down=60 + 10 * (1 - k), arm_fwd=10 * k, elbow=20)
    for s in 'LR':
        p['thigh_' + s] = arot(('x', -40 * k))
        p['shin_' + s] = arot(('x', 70 * k))
        p['foot_' + s] = arot(('x', -28 * k))
    p['spine'] = arot(('x', 16 * k))
    return p, (0, 0, -0.07 * k)


def hum(t):
    """Arms raised in front, hands weaving small circles; gentle sway to the lullaby."""
    a = TAU * t
    p = {}
    p['upperarm_L'] = arot(('y', 58 + 8 * S(a)), ('x', -52 - 8 * Cn(a)))
    p['upperarm_R'] = arot(('y', -58 + 8 * S(a + 1.2)), ('x', -52 - 8 * Cn(a + 1.2)))
    p['forearm_L'] = arot(('z', -48 - 10 * S(a)))
    p['forearm_R'] = arot(('z', 48 + 10 * S(a + 1.2)))
    p['hand_L'] = arot(('y', 15 * S(a)))
    p['hand_R'] = arot(('y', -15 * S(a + 1.2)))
    p['spine'] = arot(('y', 4 * S(a)))
    p['chest'] = arot(('x', -4), ('y', 3 * S(a)))
    p['head'] = arot(('y', 9 * S(a + 0.6)), ('x', -3))
    return p, (0, 0, -0.006 + 0.006 * S(2 * a))


def throw(t):
    # 0..0.45 wind-up, 0.45..0.6 release, then recover
    p = base()
    if t < 0.45:
        k = t / 0.45
        p['upperarm_R'] = arot(('y', -76 + 100 * k), ('x', 40 * k))
        p['forearm_R'] = arot(('z', 12 + 70 * k))
        p['chest'] = arot(('z', -18 * k))
    else:
        k = min(1, (t - 0.45) / 0.15)
        r = max(0, (t - 0.6) / 0.4)
        p['upperarm_R'] = arot(('y', -76 + (100 - 60 * k) * (1 - r)), ('x', (40 - 110 * k) * (1 - r)))
        p['forearm_R'] = arot(('z', 12 + 70 * (1 - k) * (1 - r)))
        p['chest'] = arot(('z', (-18 + 30 * k) * (1 - r)))
    return p, (0, 0, 0)


def talk(t):
    a = TAU * t
    p = base()
    g = max(0.0, S(a))
    p['upperarm_R'] = arot(('y', -70 + 25 * g), ('x', -25 * g))
    p['forearm_R'] = arot(('z', 12 + 60 * g))
    p['hand_R'] = arot(('x', -20 * S(2 * a)))
    p['head'] = arot(('x', 4 * S(2 * a)), ('y', 4 * S(a)))
    p['chest'] = arot(('z', 4 * S(a)))
    return p, (0, 0, 0)


def wave(t):
    """Right hand raised beside the head, waving side to side (for the right arm +y raises)."""
    a = TAU * t
    p = base()
    p['upperarm_R'] = arot(('y', 18), ('x', -12))
    p['forearm_R'] = arot(('y', 78 + 16 * S(2 * a)))
    p['hand_R'] = arot(('y', 12 * S(2 * a + 0.6)))
    p['head'] = arot(('y', 6), ('x', -4))
    p['spine'] = arot(('y', 3))
    return p, (0, 0, 0.004 * S(2 * a))


def sit(t):
    a = TAU * t
    p = base(arm_down=70, arm_fwd=28, elbow=40)
    for s in 'LR':
        p['thigh_' + s] = arot(('x', -88))
        p['shin_' + s] = arot(('x', 82 + 6 * S(a + (0 if s == 'L' else 2))))
        p['foot_' + s] = arot(('x', -4))
    p['chest'] = arot(('x', 3 + 1.5 * S(a)))
    p['head'] = arot(('x', 4), ('y', 3 * S(a)))
    return p, (0, 0, -0.2)


def overwhelmed(t):
    a = TAU * t
    p = {}
    for s, g in (('L', 1), ('R', -1)):
        p['thigh_' + s] = arot(('x', -120))
        p['shin_' + s] = arot(('x', 145))
        p['foot_' + s] = arot(('x', -20))
        p['upperarm_' + s] = arot(('y', 60 * g), ('x', -55))
        p['forearm_' + s] = arot(('z', -75 * g))
    p['spine'] = arot(('x', 18 + 2 * S(a)))
    p['chest'] = arot(('x', 10))
    p['head'] = arot(('x', 26 + 3 * S(a)))
    return p, (0, 0, -0.31)


def celebrate(t):
    a = TAU * t
    hop = max(0.0, S(a))
    p = {}
    p['upperarm_L'] = arot(('y', -40 - 10 * hop))
    p['upperarm_R'] = arot(('y', 40 + 10 * hop))
    p['forearm_L'] = arot(('z', -10))
    p['forearm_R'] = arot(('z', 10))
    for s in 'LR':
        p['thigh_' + s] = arot(('x', -20 * hop))
        p['shin_' + s] = arot(('x', 35 * hop))
    p['head'] = arot(('x', -10 * hop))
    return p, (0, 0, 0.09 * hop)


def shy(t):
    """Hands (and a puppet) held up in front of the face."""
    a = TAU * t
    p = {}
    p['upperarm_L'] = arot(('y', 62), ('x', -62))
    p['upperarm_R'] = arot(('y', -62), ('x', -62))
    p['forearm_L'] = arot(('z', -95))
    p['forearm_R'] = arot(('z', 95))
    p['head'] = arot(('x', 16 + 2 * S(a)), ('z', 8))
    p['spine'] = arot(('x', 6))
    return p, (0, 0, -0.01)


def puppet(t):
    """Left arm raised forward so the hand puppet can talk; body idle."""
    a = TAU * t
    p = base()
    p['upperarm_L'] = arot(('y', 50), ('x', -60 - 4 * S(2 * a)))
    p['forearm_L'] = arot(('z', -55))
    p['hand_L'] = arot(('x', -10 * S(2 * a)))
    p['head'] = arot(('z', 18), ('x', 4))
    return p, (0, 0, 0)


def stir(t):
    a = TAU * t
    p = base()
    for s, g in (('L', 1), ('R', -1)):
        p['upperarm_' + s] = arot(('y', 62 * g), ('x', -40 - 6 * S(a)))
        p['forearm_' + s] = arot(('z', (-60 - 8 * Cn(a)) * g))
    p['chest'] = arot(('x', 8), ('z', 5 * S(a)))
    p['head'] = arot(('x', 14))
    return p, (0, 0, 0)


def pat(t):
    """Reach out and pat someone's head (Master Fang)."""
    a = TAU * t
    p = base()
    p['upperarm_R'] = arot(('y', -35), ('x', -55))
    p['forearm_R'] = arot(('z', 20), ('x', 10 * max(0, S(2 * a))))
    p['hand_R'] = arot(('x', 20 + 12 * S(2 * a)))
    p['head'] = arot(('x', 6))
    return p, (0, 0, 0)


CLIPS = [
    ('idle', 72, idle, True), ('walk', 24, walk, True), ('run', 16, run, True), ('air', 24, air, True),
    ('land', 10, land, False), ('hum', 40, hum, True), ('throw', 18, throw, False), ('talk', 48, talk, True),
    ('wave', 30, wave, True), ('sit', 72, sit, True), ('overwhelmed', 72, overwhelmed, True),
    ('celebrate', 24, celebrate, True), ('shy', 60, shy, True), ('puppet', 40, puppet, True),
    ('stir', 36, stir, True), ('pat', 40, pat, True),
]


def build():
    reset_scene()
    use_collection('anims')
    rig = build_armature('anim', humanoid_joints())
    for name, frames, fn, loop in CLIPS:
        make_action(rig, name, frames, fn, loop)
    set_pose(rig, {})
    return export_glb('anim_humanoid.glb', [rig], animations=True, anim_mode='NLA_TRACKS')


if __name__ == '__main__':
    print('built', build())
