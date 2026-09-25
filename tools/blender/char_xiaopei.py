"""Xiao Pei (ref/xiaopei_1.png).

Head, hair and braid are sculpted with signed distance fields (tools/blender/sdf.py): a round head with a
painted face, blunt bangs, and a thick three-strand braid swinging off her right side.

The body comes in three versions (BODY):
- 'classic': the first-pass body from plan 0, kept by request: primitives (mustard jacket with the
  gingham grid, cream trousers, boots, the yarn skein on its strap) on the T-posed shared skeleton. The
  sculpted head sits HEAD_DZ lower so its chin meets that body's collar.
- 'puffer': a sculpted oversized quilted puffer (open over a cream checked shirt, hood down), balloon
  trousers gathered at the ankle and checked high-tops, in an A-pose (ARM_DOWN degrees below horizontal).
- 'hero' (experiment): the body starts from the base mesh in ref/hero_male.glb (hero_base.py), warped onto
  the same A-pose skeleton and reshaped toward the ref photo: the shirt becomes the jacket, the bracers
  the rolled cuffs, the rolled trousers her gathered ones, the boots high-tops. Hood, skein and laces are
  sculpted on top. ref/ is not in git, so this version only builds where that file exists.
"""
import math
import numpy as np
from mathutils import Vector
from sdf import (Field, Ellipsoid, Sphere, RoundCone, Capsule, Box, Torus, Tube, Scaled, Fn, catmull, rot, axis_rot,
                 lerp_list, smin)
import face as F
import snuglib as S
import hero_base as HB

NAME = 'xiaopei'
BODY = 'hero'
HEAD_DZ = {'classic': -0.045, 'hero': -0.02}.get(BODY, 0.0)
H = 1.15 + HEAD_DZ
ARM_DOWN = 0 if BODY == 'classic' else 50  # the classic body is T-posed like the animation library

# landmarks (metres, Z up, facing -Y, +X = her left)
SKULL_C = np.array([0.0, 0.004, 0.99 + HEAD_DZ])
SKULL_R = np.array([0.145, 0.138, 0.14])
EYE_Z = 0.975 + HEAD_DZ
MOUTH_Z = 0.908 + HEAD_DZ
NECK = (0.765 + HEAD_DZ, 0.87 + HEAD_DZ)
SHOULDER = np.array([0.098, 0.0, 0.728])
UPPER, FORE, HAND = 0.132, 0.12, 0.066
HIP = np.array([0.06, 0.0, 0.44])
KNEE_Z, ANKLE_Z = 0.245, 0.075

COL = {
    'skin': '#f6d5c3', 'hair': '#231c1a', 'jacket': '#e3a23c', 'jacket_dark': '#c98a2a', 'lining': '#b98f5f',
    'shirt': '#f2ebdd', 'trousers': '#eee4cf', 'sock': '#d8cdb8', 'shoe': '#ece2cc', 'sole': '#c9b99c',
    'lace': '#dd6a2c', 'tie': '#e0662c', 'yarn': '#e1873a', 'strap': '#8a5a33',
}


def arm_dir(g):
    a = math.radians(ARM_DOWN)
    return np.array([math.cos(a) * g, 0.0, -math.sin(a)])


def arm_points(g):
    sh = SHOULDER * np.array([g, 1, 1])
    d = arm_dir(g)
    el = sh + d * UPPER
    wr = el + d * FORE
    tip = wr + d * HAND
    return sh, el, wr, tip


# ---------------------------------------------------------------- skin: head, neck, hands

def head_pt(x, y, z):
    return SKULL_C + np.array([x, y, z])


def skin_field():
    f = Field((-0.34, -0.2, 0.44), (0.34, 0.2, 1.14), vs=0.0025) if BODY == 'puffer' else \
        Field((-0.2, -0.2, NECK[0] - 0.05), (0.2, 0.2, 1.14), vs=0.0025)
    f.add(Ellipsoid(SKULL_C, SKULL_R))
    # soft round cheeks and a small chin: the chibi face is widest low down
    f.add(Ellipsoid(head_pt(0, -0.026, -0.066), (0.118, 0.103, 0.085)), k=0.045)
    f.add(Ellipsoid(head_pt(0, -0.064, -0.11), (0.052, 0.046, 0.033)), k=0.032)
    for g in (1, -1):
        f.add(Ellipsoid(head_pt(0.07 * g, -0.078, -0.075), (0.045, 0.04, 0.036)), k=0.028)  # cheek fat
        f.add(Ellipsoid(head_pt(0.14 * g, 0.0, -0.04), (0.016, 0.026, 0.031), rot(0, 0, -12 * g)), k=0.013)  # ears
    # nose: a tiny button
    f.add(Ellipsoid(head_pt(0, -0.135, -0.045), (0.012, 0.01, 0.011)), k=0.011)
    # neck
    f.add(Capsule((0, 0.012, NECK[0]), (0, 0.012, NECK[1]), 0.034), k=0.03)
    if BODY == 'puffer':  # the classic body brings its own hands
        for g in (1, -1):
            f.add(hand(g), k=0.0)
    return f


def hand(g):
    """Mitten hand with a thumb, in the arm's A-pose frame (palm faces the thigh)."""
    sh, el, wr, tip = arm_points(g)
    d = arm_dir(g)
    side = np.array([0.0, -1.0, 0.0])  # thumb side: forward
    out = np.cross(d, side) * g  # palm normal-ish
    palm_c = wr + d * 0.032
    parts = []
    parts.append(Ellipsoid(palm_c, (0.03, 0.022, 0.014), _frame(d, side)))
    # fingers as one soft block, curled a little toward the palm
    parts.append(Ellipsoid(wr + d * 0.058 - out * 0.004, (0.022, 0.02, 0.012), _frame(d, side)))
    # thumb
    parts.append(RoundCone(wr + d * 0.02 + side * 0.016, wr + d * 0.045 + side * 0.03 - out * 0.004, 0.009, 0.007))
    # wrist
    parts.append(Capsule(wr - d * 0.02, wr + d * 0.01, 0.017))

    def fn(X, Y, Z):
        dd = parts[0].d(X, Y, Z)
        for p in parts[1:]:
            dd = smin(dd, p.d(X, Y, Z), 0.012)
        return dd

    lo = np.minimum.reduce([p.lo for p in parts])
    hi = np.maximum.reduce([p.hi for p in parts])
    return Fn(fn, lo, hi)


def _frame(d, side):
    """Rotation whose local X is along d (the arm), local Y along side."""
    x = np.asarray(d, float) / np.linalg.norm(d)
    y = np.asarray(side, float) - x * np.dot(side, x)
    y /= np.linalg.norm(y)
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)


# ---------------------------------------------------------------- hair

CAP_C = SKULL_C + np.array([0, 0.012, 0.014])
CAP_R = SKULL_R + np.array([0.016, 0.02, 0.016])


def on_cap(p, inset=0.0):
    """Project a point radially (from the cap centre) onto the hair cap surface, `inset` metres inside."""
    d = np.asarray(p, float) - CAP_C
    k = 1.0 / np.sqrt(((d / CAP_R) ** 2).sum())
    n = d / np.linalg.norm(d)
    return CAP_C + d * k - n * inset


def hair_field():
    f = Field((-0.2, -0.2, 0.8 + HEAD_DZ), (0.2, 0.2, 1.16 + HEAD_DZ), vs=0.0025)
    f.add(Ellipsoid(CAP_C, CAP_R))
    # open the face below the fringe line; the sides stay as hair framing the cheeks
    f.sub(Ellipsoid(head_pt(0, -0.19, -0.058), (0.13, 0.15, 0.095)), k=0.012)
    # no hair under the jaw / inside the neck
    f.sub(Box((0, -0.06, 0.76 + HEAD_DZ), (0.3, 0.2, 0.08)), k=0.02)
    # fringe: flattened locks from the crown to blunt tips just above the brows
    for x, tip_z, curl in ((-0.1, 0.044, 0.004), (-0.062, 0.04, -0.003), (-0.022, 0.036, 0.002),
                           (0.018, 0.037, -0.002), (0.058, 0.04, 0.003), (0.1, 0.046, -0.004), (0.0, 0.043, 0.0)):
        p0 = on_cap(head_pt(x * 0.3, -0.02, 0.118), 0.008)
        p1 = on_cap(head_pt(x * 0.9, -0.105, 0.085), 0.002)
        p2 = head_pt(x * 1.02 + curl, -0.147 + abs(x) * 0.3, tip_z)
        pts = catmull([p0, p1, p2], n=10)
        t = np.linspace(0, 1, len(pts))
        f.add(Tube(pts, lerp_list([0.012, 0.024, 0.022, 0.006], t), flat=0.42,
                   flat_dir=[(p - SKULL_C) for p in pts]), k=0.007)
    # side locks falling past the cheeks, in front of the ears
    for g in (1, -1):
        for x, z_end, y0 in ((0.137, -0.15, -0.07), (0.152, -0.13, -0.03)):
            pts = catmull([on_cap(head_pt(x * g * 0.78, y0 + 0.03, 0.035), 0.006), head_pt(x * g, y0, -0.02),
                           head_pt((x + 0.003) * g, y0 - 0.008, -0.09), head_pt((x - 0.012) * g, y0 - 0.004, z_end)], n=8)
            t = np.linspace(0, 1, len(pts))
            f.add(Tube(pts, lerp_list([0.012, 0.021, 0.016, 0.004], t), flat=0.5,
                       flat_dir=[(p - np.array([0, 0, p[2]])) for p in pts]), k=0.009)
    # locks over the back of the head, sweeping down toward the braid at her right nape
    for a in (-70, -40, -12, 16, 44, 72):
        r = math.radians(a)
        top = on_cap(head_pt(math.sin(r) * 0.05, 0.03, 0.15), 0.008)
        mid = on_cap(head_pt(math.sin(r) * 0.15, 0.1 + math.cos(r) * 0.03, 0.04), 0.004)
        end = head_pt(-0.045 + math.sin(r) * 0.06, 0.13, -0.085)
        pts = catmull([top, mid, end], n=10)
        t = np.linspace(0, 1, len(pts))
        f.add(Tube(pts, lerp_list([0.012, 0.03, 0.026, 0.012], t), flat=0.45,
                   flat_dir=[(p - SKULL_C) for p in pts]), k=0.01)
    # hair gathered at the back of the head into the braid (her right, -X)
    f.add(Ellipsoid(head_pt(-0.045, 0.12, -0.085), (0.075, 0.048, 0.065)), k=0.03)
    # one loose strand curling off the crown (the ref's flyaways)
    pts = catmull([head_pt(0.02, 0.01, 0.165), head_pt(0.035, -0.02, 0.19), head_pt(0.07, -0.055, 0.185),
                   head_pt(0.095, -0.07, 0.168)], n=10)
    f.add(Tube(pts, lerp_list([0.006, 0.005, 0.003, 0.0015], np.linspace(0, 1, len(pts)))), k=0.005)
    # fine strand grooves radiating from the crown (they end up in the baked occlusion)
    crown = head_pt(0, 0.03, 0.14)

    def strands(X, Y, Z, d):
        az = np.arctan2(X - crown[0], -(Y - crown[1]))
        return 0.0009 * np.sin(az * 46) * (np.abs(d) < 0.01)

    f.displace(strands)
    return f


# ---------------------------------------------------------------- braid

BRAID_PATH = [(x, y, z + HEAD_DZ) for x, y, z in
              ((-0.05, 0.13, 0.905), (-0.1, 0.15, 0.81), (-0.14, 0.15, 0.69), (-0.16, 0.14, 0.57), (-0.168, 0.13, 0.47))]


def braid_field():
    f = Field((-0.28, 0.0, 0.3 + HEAD_DZ), (0.0, 0.26, 0.96 + HEAD_DZ), vs=0.0025)
    path = catmull(BRAID_PATH, n=24)
    t = np.linspace(0, 1, len(path))
    L = np.cumsum(np.r_[0, np.linalg.norm(np.diff(path, axis=0), axis=1)])
    tang = np.gradient(path, axis=0)
    tang /= np.linalg.norm(tang, axis=1)[:, None]
    # side vector: across the braid (roughly her left-right), depth vector: out of the back
    side = np.cross(tang, np.array([0, 1.0, 0]))
    side /= np.linalg.norm(side, axis=1)[:, None]
    depth = np.cross(side, tang)
    width = lerp_list([0.042, 0.04, 0.036, 0.03], t)
    period = 0.085
    for k in range(3):
        ph = 2 * math.pi * (L / period) + k * 2 * math.pi / 3
        off = side * (np.sin(ph) * width * 0.55)[:, None] + depth * (np.sin(2 * ph) * width * 0.18)[:, None]
        pts = path + off
        f.add(Tube(pts, width * 0.55, flat=0.8, flat_dir=depth), k=0.004)
    # tie and a flared tuft
    end = path[-1]
    f.add(Torus(end + tang[-1] * 0.004, 0.019, 0.009, _frame_z(tang[-1])), k=0.0)
    for i, a in enumerate(np.linspace(0, 2 * math.pi, 7, endpoint=False)):
        dirv = tang[-1] + (side[-1] * math.cos(a) + depth[-1] * math.sin(a)) * 0.22
        f.add(RoundCone(end + tang[-1] * 0.01, end + dirv * 0.09, 0.014, 0.003), k=0.006)
    return f, path, tang


def _frame_z(z):
    z = np.asarray(z, float) / np.linalg.norm(z)
    x = np.cross([0, 1.0, 0], z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], axis=1)


# ---------------------------------------------------------------- jacket

def jacket_field():
    f = Field((-0.36, -0.24, 0.36), (0.36, 0.28, 0.83), vs=0.003)
    torso = Scaled(RoundCone((0, 0, 0.465), (0, 0, 0.685), 0.168, 0.126), (1.0, 0.78, 1.0), (0, 0, 0.56))
    f.add(torso)
    for g in (1, -1):
        f.add(Ellipsoid((0.092 * g, 0.0, 0.715), (0.08, 0.075, 0.056)), k=0.04)  # shoulders
    for g in (1, -1):  # puffy sleeves, A-pose
        sh, el, wr, tip = arm_points(g)
        f.add(RoundCone(sh + np.array([-0.01 * g, 0, 0]), el, 0.058, 0.062), k=0.03)
        f.add(RoundCone(el, wr - arm_dir(g) * 0.014, 0.062, 0.052), k=0.02)
    f.add(Scaled(Torus((0, 0, 0.412), 0.155, 0.026), (1.02, 0.8, 1.0), (0, 0, 0.412)), k=0.02)  # hem
    quilt(f)
    # open front: the shirt shows between the thick edges
    f.sub(Box((0, -0.2, 0.52), (0.026, 0.08, 0.26), 0.01), k=0.012)
    for g in (1, -1):
        # rolled cuffs (checked lining) sit on top of the quilting
        sh, el, wr, tip = arm_points(g)
        f.add(Torus(wr - arm_dir(g) * 0.016, 0.044, 0.015, _frame_z(arm_dir(g))), k=0.006)
        # flap pockets low on the front
        f.add(Box((0.088 * g, -0.13, 0.475), (0.045, 0.012, 0.012), 0.008, rot(-8, 0, -14 * g)), k=0.004)
        f.add(Box((0.086 * g, -0.126, 0.445), (0.042, 0.01, 0.034), 0.01, rot(-6, 0, -14 * g)), k=0.006)
    # stand-up collar and the hood bunched behind the neck (Doudou sleeps in it)
    f.add(Scaled(Torus((0, 0.02, 0.775), 0.072, 0.021), (1.05, 1.0, 1.0), (0, 0.02, 0.775)), k=0.015)
    f.sub(Box((0, -0.1, 0.79), (0.022, 0.04, 0.04), 0.01), k=0.01)  # the collar ring opens at the front
    f.add(Ellipsoid((0, 0.14, 0.745), (0.11, 0.072, 0.072)), k=0.03)
    f.sub(Ellipsoid((0, 0.15, 0.79), (0.08, 0.052, 0.05)), k=0.015)
    return f


QUILT = 0.064  # quilting cell (m)


def quilt_lines(x, y, z):
    """Distance (m) to the nearest quilting stitch line: a grid wrapped around the torso and around
    each sleeve, blended where the sleeves meet the shoulders."""
    u = np.arctan2(x, -y) * 0.16
    line_t = _line(u, z + 0.01)
    w_arm = np.zeros_like(x)
    line_a = np.zeros_like(x)
    for g in (1, -1):
        sh, el, wr, tip = arm_points(g)
        ax = wr - sh
        ax = ax / np.linalg.norm(ax)
        px, py, pz = x - sh[0], y - sh[1], z - sh[2]
        v = px * ax[0] + py * ax[1] + pz * ax[2]
        rx, ry, rz = px - ax[0] * v, py - ax[1] * v, pz - ax[2] * v
        rad = np.sqrt(rx * rx + ry * ry + rz * rz)
        w = np.clip((0.1 - rad) / 0.03, 0, 1) * np.clip(v / 0.03, 0, 1)
        ang = np.arctan2(ry, rz * np.sign(ax[0]) + 1e-9) * 0.06
        la = _line(ang, v)
        line_a = np.where(w > w_arm, la, line_a)
        w_arm = np.maximum(w_arm, w)
    return line_t * (1 - w_arm) + line_a * w_arm


def _line(u, v, cell=QUILT):
    lu = cell * 0.5 - cell * np.abs(((u / cell) % 1.0) - 0.5)
    lv = cell * 0.5 - cell * np.abs(((v / cell) % 1.0) - 0.5)
    return np.minimum(lu, lv)


def quilt(f, width=0.004, depth=0.0045, puff=0.0025):
    """Stitched puffer quilting: grooves along the stitch lines, puffs between them."""
    def fn(X, Y, Z, d):
        near = np.abs(d) < 0.02
        out = np.zeros_like(d)
        if near.any():
            line = quilt_lines(X[near], Y[near], Z[near])
            out[near] = depth * np.exp(-(line / width) ** 2) - puff * np.clip(line / (QUILT * 0.5), 0, 1)
        return out

    f.displace(fn)


def shirt_field():
    f = Field((-0.2, -0.2, 0.4), (0.2, 0.15, 0.82), vs=0.0025)
    f.add(Scaled(RoundCone((0, 0, 0.47), (0, 0, 0.71), 0.15, 0.115), (1.0, 0.78, 1.0), (0, 0, 0.56)))
    # pointed collar lying open on the jacket lapels, splayed down and out
    for g in (1, -1):
        pts = catmull([(0.018 * g, -0.088, 0.785), (0.042 * g, -0.112, 0.758), (0.07 * g, -0.126, 0.728)], n=8)
        t = np.linspace(0, 1, len(pts))
        f.add(Tube(pts, lerp_list([0.018, 0.02, 0.011, 0.003], t), flat=0.2, flat_dir=(0.3 * g, -1, 0.4)), k=0.004)
    f.add(Scaled(Torus((0, 0.012, 0.786), 0.052, 0.009), (1.05, 1.0, 1.0), (0, 0.012, 0.786)), k=0.006)
    return f


def trousers_field():
    f = Field((-0.2, -0.16, 0.06), (0.2, 0.16, 0.5), vs=0.003)
    f.add(Ellipsoid((0, 0.012, 0.45), (0.122, 0.098, 0.07)))
    for g in (1, -1):
        x = HIP[0] * g
        f.add(RoundCone((x * 1.08, 0.0, 0.42), (x * 1.18, -0.005, 0.27), 0.062, 0.062), k=0.02)
        f.add(RoundCone((x * 1.18, -0.005, 0.27), (x * 1.12, 0.0, 0.16), 0.062, 0.056), k=0.02)
        f.add(Ellipsoid((x * 1.12, -0.004, 0.155), (0.064, 0.062, 0.042)), k=0.02)  # balloon over the gather
        # gathered at the ankle
        f.add(Torus((x * 1.12, 0.0, 0.118), 0.031, 0.012), k=0.012)

    def folds(X, Y, Z, d):
        # soft creases wrapping the legs, stronger near the knees and the gathered ankles
        w = np.exp(-((Z - 0.25) / 0.06) ** 2) * 0.6 + np.exp(-((Z - 0.15) / 0.035) ** 2)
        ph = Z * 90 + np.sin(np.arctan2(X - np.sign(X) * 0.07, Y) * 2.0 + Z * 20) * 1.6
        return 0.0028 * w * np.sin(ph)

    f.displace(folds, (-0.2, -0.16, 0.1), (0.2, 0.16, 0.33))
    return f


def shoes_field():
    f = Field((-0.16, -0.14, -0.01), (0.16, 0.1, 0.16), vs=0.002)
    for g in (1, -1):
        x = HIP[0] * 1.12 * g
        f.add(Capsule((x, 0.0, 0.13 if BODY == 'hero' else 0.1), (x, 0.0, 0.07), 0.031), k=0.0)  # sock
        f.add(Box((x, -0.018, 0.04), (0.04, 0.066, 0.036), 0.028), k=0.015)  # high-top
        f.add(Ellipsoid((x, -0.062, 0.035), (0.04, 0.038, 0.032)), k=0.015)  # round toe
        f.add(Box((x, -0.02, 0.009), (0.043, 0.071, 0.009), 0.008), k=0.004)  # sole
        f.add(Capsule((x, -0.008, 0.085), (x, 0.004, 0.09), 0.035), k=0.012)  # ankle collar
    return f


def extras_field():
    """The yarn skein on a chest strap (her Lullaby Thread) and the bow laces."""
    f = Field((-0.2, -0.24, 0.0), (0.2, 0.16, 0.8), vs=0.002)
    c = np.array([0.045, -0.158, 0.615])
    # a coiled skein: three fat loops of yarn twisted around each other
    for i, a in enumerate((0, 60, 120)):
        R = rot(90, 0, 0) @ rot(0, a, 0) @ rot(12, 0, 0)
        f.add(Scaled(Torus(c, 0.036, 0.016, R), (1.0, 0.8, 1.15), c), k=0.006)
    f.add(Ellipsoid(c + np.array([0, -0.005, 0]), (0.03, 0.03, 0.036)), k=0.01)
    # strap: over her right shoulder and down across the chest to the skein
    pts = catmull([(-0.1, 0.05, 0.775), (-0.1, -0.075, 0.74), (-0.03, -0.155, 0.68), (0.03, -0.18, 0.64)], n=12)
    f.add(Tube(pts, 0.0095, flat=0.4, flat_dir=[(0, -1, 0.3)]), k=0.004)
    for g in (1, -1):
        x = HIP[0] * 1.12 * g
        for sd in (1, -1):
            f.add(Scaled(Torus((x + 0.014 * sd, -0.063, 0.072), 0.012, 0.005, rot(0, 90, 20 * sd)), (1, 1, 1.2),
                         (x + 0.014 * sd, -0.063, 0.072)), k=0.003)
    return f


# ---------------------------------------------------------------- classic body (plan 0)

def classic_joints():
    """The first-pass proportions (snuglib.humanoid_joints) the classic body was built on."""
    return S.humanoid_joints(height=1.15, head_r=0.19, sh_w=0.11, arm=0.30, hip_w=0.07)


def classic_limbs(J, sleeve, sleeve_r=(0.066, 0.056), cuff=None, hand='#f4d3c0', leg=None, leg_r=(0.074, 0.056),
                  sock=None, boot='#e8dcc4', lace=None, bulge=0.018, boot_r=(0.05, 0.078, 0.046)):
    C = S.srgb
    parts = []
    for s_, g in (('L', 1), ('R', -1)):
        sh = Vector(J['shoulder_' + s_][0])
        wr = Vector(J['hand_' + s_][0])
        parts.append(S.tube('sleeve_' + s_, sh + Vector((0.02 * g, 0, 0)), wr, sleeve_r[0], sleeve_r[1], 'cloth',
                            C(sleeve), segs=10, rings=6, bulge=bulge,
                            bones=['shoulder_' + s_, 'upperarm_' + s_, 'forearm_' + s_]))
        if cuff:
            parts.append(S.torus('cuff_' + s_, wr - Vector((0.012 * g, 0, 0)), sleeve_r[1] * 0.9, 0.014, 'cloth',
                                 C(cuff), (12, 5), rot=(0, 90, 0), bones='forearm_' + s_))
        hp = Vector(J['hand_' + s_][1]) - Vector((0.012 * g, 0, 0))
        parts.append(S.ellipsoid('hand_' + s_, hp, (0.036, 0.028, 0.038), 'skin', C(hand), (10, 7), bones='hand_' + s_))
        hip = Vector(J['thigh_' + s_][0])
        ank = Vector(J['shin_' + s_][1])
        if leg:
            parts.append(S.tube('leg_' + s_, hip + Vector((0, 0, 0.02)), ank + Vector((0, 0, 0.04)), leg_r[0], leg_r[1],
                                'cloth', C(leg), segs=10, rings=6, bulge=bulge, bones=['hips', 'thigh_' + s_, 'shin_' + s_]))
        if sock:
            parts.append(S.tube('sock_' + s_, ank, ank + Vector((0, 0, 0.06)), 0.035, 0.037, 'cloth', C(sock), segs=8,
                                rings=1, bones='shin_' + s_))
        parts.append(S.superquad('boot_' + s_, ank + Vector((0, -0.025, -0.02)), boot_r, 'cloth', C(boot), n=3.0, res=3,
                                 smooth=True, bones='foot_' + s_))
        if lace:
            parts.append(S.ellipsoid('lace_' + s_, ank + Vector((0, -0.05, 0.02)), (0.03, 0.02, 0.012), 'cloth', C(lace),
                                     (8, 5), bones='foot_' + s_))
    return parts


def classic_body():
    """Jacket, trousers, boots, hands and the yarn skein on its strap, as built in plan 0."""
    C = S.srgb
    J = classic_joints()
    hip_z, top = J['hips'][0][2], J['chest'][1][2]
    jacket = '#e2a13a'
    P = [S.tube('jacket', (0, 0, hip_z - 0.075), (0, 0, top + 0.01), 0.165, 0.11, 'cloth', C(jacket), segs=14, rings=5,
                bulge=0.02, flat_x=1.12, bones=['hips', 'spine', 'chest']),
         S.ellipsoid('collar', (0, -0.035, top - 0.005), (0.085, 0.075, 0.045), 'cloth', C('#f1e9d8'), (12, 6),
                     bones='chest'),
         S.ellipsoid('hood', (0, 0.125, top - 0.045), (0.12, 0.07, 0.085), 'cloth', C('#d4922f'), (12, 8), bones='hood'),
         S.tube('placket', (0, -0.14, hip_z - 0.08), (0, -0.105, top - 0.04), 0.012, 0.012, 'cloth', C('#c07f26'),
                segs=6, rings=2, bones=['hips', 'spine', 'chest'])]
    for s_, g in (('L', 1), ('R', -1)):
        P.append(S.box('pocket_' + s_, (0.085 * g, -0.146, hip_z), (0.055, 0.012, 0.05), 'cloth', C('#d6972f'),
                       rot=(0, 0, -12 * g), bones=['hips', 'spine'], bevel=0.008))
    # chest strap with the yarn bundle (Lullaby Thread)
    P.append(S.tube('strap', (-0.1, -0.1, top - 0.01), (0.13, -0.12, hip_z + 0.02), 0.012, 0.012, 'cloth',
                    C('#8a5a33'), segs=6, rings=3, bones=['chest', 'spine']))
    P.append(S.ellipsoid('yarn', (-0.025, -0.16, top - 0.11), (0.058, 0.045, 0.055), 'cloth', C('#e1873a'), (10, 8),
                         bones='chest'))
    P.append(S.torus('yarn_wrap', (-0.025, -0.16, top - 0.11), 0.05, 0.008, 'cloth', C('#c96a26'), (12, 4),
                     rot=(90, 0, 30), bones='chest'))
    P.append(S.ellipsoid('seat', (0, 0.0, hip_z - 0.04), (0.13, 0.11, 0.09), 'cloth', C('#ece2cc'), (12, 8),
                         bones=['hips', 'thigh_L', 'thigh_R']))
    P += classic_limbs(J, jacket, cuff='#9c7a4c', hand=COL['skin'], leg='#ece2cc', sock='#d9d0bf', boot='#e8dcc4',
                       lace='#d1692e')
    return P


# ---------------------------------------------------------------- hero-based body (experiment)

# base bone -> our bone (weights are merged)
HERO_BONES = {'root': 'hips', 'pelvis': 'hips', 'torso': 'spine', 'shoulders': 'chest', 'head': 'neck'}
for _s in 'LR':
    HERO_BONES.update({'bicep.' + _s: 'upperarm_' + _s, 'forearm.' + _s: 'forearm_' + _s, 'wrist.' + _s: 'forearm_' + _s,
                       'hand.' + _s: 'hand_' + _s, 'thumb.' + _s: 'thumb_' + _s, 'fingers_base.' + _s: 'fingers_' + _s,
                       'fingers_mid.' + _s: 'fingers_' + _s, 'fingers_tip.' + _s: 'fingers_' + _s,
                       'thigh.' + _s: 'thigh_' + _s, 'shin.' + _s: 'shin_' + _s, 'foot.' + _s: 'foot_' + _s})

# target half extents across each bone (front / depth, side / width), metres: her proportions in the jacket
HERO_EXT = {'pelvis': (0.1, 0.125), 'torso': (0.12, 0.16), 'shoulders': (0.108, 0.14), 'head': (0.035, 0.035),
            'bicep': (0.06, 0.06), 'forearm': (0.062, 0.062), 'wrist': (0.056, 0.056), 'hand': (0.026, 0.016),
            'fingers_base': (0.024, 0.013), 'fingers_mid': (0.022, 0.012), 'fingers_tip': (0.02, 0.011),
            'thumb': (0.01, 0.01), 'thigh': (0.075, 0.075), 'shin': (0.068, 0.068), 'foot': (0.075, 0.06)}
# along-bone remaps (base fraction -> target fraction): trousers end at the ankle over the shoes; the tunic's
# long flaps become a jacket hem at the top of the thighs
HERO_KNOTS = {'shin': ([0, 0.64, 0.70, 1], [0, 0.73, 0.79, 1]), 'pelvis': ([0, 1, 3.2], [0, 1, 1.9])}


def hero_targets():
    """Our skeleton's segments in the A-pose, for each base bone."""
    tgt = {}
    for side, g in (('L', 1), ('R', -1)):
        sh, el, wr, tip = arm_points(g)
        d = arm_dir(g)
        fr = np.array([0, -1.0, 0])
        tgt['bicep.' + side] = (sh, el)
        tgt['forearm.' + side] = (el, el + (wr - el) * 0.45)
        tgt['wrist.' + side] = (el + (wr - el) * 0.45, wr)
        tgt['hand.' + side] = (wr, wr + d * 0.045)
        f0, f1 = wr + d * 0.045, wr + d * 0.075
        for i, n in enumerate(('fingers_base.', 'fingers_mid.', 'fingers_tip.')):
            tgt[n + side] = (f0 + (f1 - f0) * i / 3, f0 + (f1 - f0) * (i + 1) / 3)
        tgt['thumb.' + side] = (wr + d * 0.02 + fr * 0.016, wr + d * 0.045 + fr * 0.03)
        lx = 0.066 * g
        tgt['thigh.' + side] = (np.array([lx, 0, HIP[2]]), np.array([lx, 0, KNEE_Z]))
        tgt['shin.' + side] = (np.array([lx, 0, KNEE_Z]), np.array([lx, 0, ANKLE_Z]))
        tgt['foot.' + side] = (np.array([lx, 0, ANKLE_Z]), np.array([lx * 1.02, -0.088, 0.03]))
    tgt['pelvis'] = (np.array([0, 0, 0.475]), np.array([0, 0, 0.42]))
    tgt['torso'] = (np.array([0, 0, 0.475]), np.array([0, 0, 0.62]))
    tgt['shoulders'] = (np.array([0, 0, 0.62]), np.array([0, 0, NECK[0]]))
    tgt['head'] = (np.array([0, 0.012, 0.765]), np.array([0, 0.012, 0.9]))  # stretches the stand-up collar up
    return tgt


def hero_outfit():
    """Her body from the base mesh: classify, warp, reshape, smooth; a dense mesh with our bones and regions."""
    body, J, T = HB.import_base()
    region = HB.classify(body)
    vb = HB.dominant_bone(body)
    P0 = np.array([v.co[:] for v in body.data.vertices])
    base = {'pelvis': (J['pelvis'], J['pelvis'] + [0, 0, -0.104]), 'torso': (J['torso'], J['shoulders']),
            'shoulders': (J['shoulders'], J['head']), 'head': (J['head'], J['head'] + [0, 0, 0.12])}
    for side in ('.L', '.R'):
        chain = [('bicep', 'forearm'), ('forearm', 'wrist'), ('wrist', 'hand'), ('hand', 'fingers_base'),
                 ('fingers_base', 'fingers_mid'), ('fingers_mid', 'fingers_tip'), ('thigh', 'shin'), ('shin', 'foot')]
        for a, b in chain:
            base[a + side] = (J[a + side], J[b + side])
        base['fingers_tip' + side] = (J['fingers_tip' + side], T['fingers_tip' + side])
        base['thumb' + side] = (J['thumb' + side], T['thumb' + side])
        base['foot' + side] = (J['foot' + side], np.array([J['foot' + side][0] * 0.75, -0.24, 0.03]))
    tgt = hero_targets()
    maps = {}
    for n, (a, b) in base.items():
        stem = HB._stem(n)
        up = [0, 0, 1.0] if stem == 'foot' else None
        R = HB._frame(np.asarray(a, float), np.asarray(b, float), up)
        m = np.array([v == n for v in vb])
        loc = (P0[m] - a) @ R
        bf, bs = np.percentile(np.abs(loc[:, 0]), 90), np.percentile(np.abs(loc[:, 2]), 90)
        tf, ts = HERO_EXT[stem]
        bm = HB.BoneMap(a, b, *tgt[n], front=tf / max(bf, 1e-3), side=ts / max(bs, 1e-3), knots=HERO_KNOTS.get(stem))
        if up:
            bm.R, bm.R2 = HB._frame(bm.a, bm.b, up), HB._frame(bm.a2, bm.b2, up)
        maps[n] = bm
    HB.warp(body, maps, maps['pelvis'])
    region = hero_regions(body, region)
    hero_reshape(body, region, vb)
    region = hero_drop_flaps(body, region)
    HB.rename_groups(body, HERO_BONES)
    HB.store_regions(body, region)
    HB.drop_attributes(body)
    HB.subdivide(body, 2)
    return body


def _arm_s(p, g):
    """Distance along her arm (from the shoulder joint) and from its axis."""
    sh, el, wr, tip = arm_points(g)
    d = arm_dir(g)
    v = np.asarray(p) - sh
    s_ = v @ d
    return s_, np.linalg.norm(v - s_ * d)


def hero_regions(ob, region):
    """Her outfit's parts on the warped base: a rolled cuff only at the wrist (the rest of the bracer and the
    bare forearm become sleeve)."""
    R = HB.REGIONS
    out = region.copy()
    for p in ob.data.polygons:
        c = np.array(p.center)
        if region[p.index] in (R['jacket'], R['cuff']):
            s_, dist = _arm_s(c, 1 if c[0] > 0 else -1)
            out[p.index] = R['cuff'] if s_ > UPPER + FORE - 0.03 and dist < 0.09 else R['jacket']
    return out


SLEEVE_R = ([0.0, 0.05, 0.13, 0.2, 0.222, 0.238, 0.252], [0.064, 0.064, 0.066, 0.06, 0.055, 0.06, 0.057])


def hero_reshape(ob, region, vb):
    """Turn the base's short sleeves, bare forearms and bracers into one puffy sleeve ending in a rolled cuff
    (every sleeve vertex is put back on a radius profile around her arm), then puff the jacket up a little.
    (Laplacian smoothing collapses these thin low-poly tubes.)"""
    import bmesh
    R = HB.REGIONS
    me = ob.data
    vreg = np.zeros(len(me.vertices), int)
    for p in me.polygons:
        for i in p.vertices:
            vreg[i] = max(vreg[i], region[p.index])
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        if HB._stem(vb[v.index]) not in ('bicep', 'forearm', 'wrist') or vreg[v.index] not in (R['jacket'], R['cuff']):
            continue
        g = 1 if v.co.x > 0 else -1
        sh, el, wr, tip = arm_points(g)
        d = arm_dir(g)
        rel = np.array(v.co) - sh
        s_ = rel @ d
        rv = rel - s_ * d
        r = np.linalg.norm(rv)
        if r < 1e-6:
            continue
        target = np.interp(s_, *SLEEVE_R)
        k = np.clip((s_ - 0.02) / 0.04, 0, 1) * 0.85  # leave the shoulder seam to the torso
        v.co = sh + s_ * d + rv / r * (r + (target - r) * k)
    bm.normal_update()
    for v in bm.verts:
        r = vreg[v.index]
        if r == R['jacket'] and abs(v.co.x) < 0.14:
            v.co += v.normal * 0.009
        elif r == R['trousers']:
            v.co += v.normal * 0.004
    bm.to_mesh(me)
    bm.free()


def hero_drop_flaps(ob, region, z_belt=0.452):
    """Remove the base tunic's split flaps below the belt (single-sided panels; her jacket has a closed
    hem, sculpted in hem_field) and the base's boots (her chunky high-tops are sculpted: shoes_field)."""
    import bmesh
    R = HB.REGIONS
    HB.store_regions(ob, region)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = [f for f in bm.faces if (region[f.index] == R['jacket'] and f.calc_center_median().z < z_belt)
            or region[f.index] == R['shoe']]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    out = np.zeros(len(ob.data.polygons), np.int32)
    ob.data.attributes['region'].data.foreach_get('value', out)
    return out


def hem_field():
    """The jacket below the belt: a closed, slightly flared puffy hem, open at the front like the ref."""
    f = Field((-0.24, -0.22, 0.34), (0.24, 0.2, 0.5), vs=0.0025)
    outer = Scaled(RoundCone((0, 0.004, 0.462), (0, 0.004, 0.385), 0.16, 0.176), (1.0, 0.8, 1.0), (0, 0.004, 0.42))
    f.add(outer)
    f.add(Scaled(Torus((0, 0.004, 0.388), 0.168, 0.016), (1.02, 0.8, 1.0), (0, 0.004, 0.388)), k=0.012)
    f.sub(Scaled(RoundCone((0, 0.004, 0.52), (0, 0.004, 0.33), 0.135, 0.15), (1.0, 0.78, 1.0), (0, 0.004, 0.42)), k=0.004)
    f.sub(Box((0, -0.2, 0.42), (0.024, 0.08, 0.1), 0.01), k=0.008)
    return f


def collar_field():
    """Her shirt's pointed collar, open over the jacket's stand-up collar."""
    f = Field((-0.12, -0.16, 0.7), (0.12, 0.08, 0.86), vs=0.002)
    for g in (1, -1):
        pts = catmull([(0.016 * g, -0.066, 0.812), (0.04 * g, -0.092, 0.786), (0.064 * g, -0.106, 0.756)], n=8)
        t = np.linspace(0, 1, len(pts))
        f.add(Tube(pts, lerp_list([0.017, 0.018, 0.01, 0.003], t), flat=0.22, flat_dir=(0.3 * g, -1, 0.45)), k=0.004)
    f.add(Scaled(Torus((0, 0.012, 0.81), 0.046, 0.008), (1.05, 1.0, 1.0), (0, 0.012, 0.81)), k=0.006)
    return f


def hem_weights(P):
    """The hem follows the hips, and each side a little of its thigh (so walking doesn't cut through it)."""
    x, z = P[:, 0], P[:, 2]
    left = np.clip(0.5 + x / 0.06, 0, 1)
    leg = np.clip((0.44 - z) / 0.07, 0, 1) * 0.35
    W = np.stack([1 - leg, leg * left, leg * (1 - left)], axis=1)
    return ['hips', 'thigh_L', 'thigh_R'], W


def hood_field():
    """The jacket's hood, down, bunched behind the collar: Doudou sleeps in it (seat_doudou)."""
    f = Field((-0.16, 0.0, 0.62), (0.16, 0.24, 0.84), vs=0.0025)
    f.add(Ellipsoid((0, 0.128, 0.728), (0.105, 0.062, 0.068)))
    f.add(Scaled(Torus((0, 0.12, 0.752), 0.082, 0.02), (1.0, 0.8, 1.0), (0, 0.12, 0.752)), k=0.02)
    f.sub(Ellipsoid((0, 0.142, 0.77), (0.072, 0.045, 0.045)), k=0.012)
    return f


HEAD_GROUPS = [
    # name, builder, kind, colour, triangle budget, symmetric
    ('skin', skin_field, 'skin', 'skin', 950, True),
    ('hair', hair_field, 'hair', 'hair', 1050, False),
    ('braid', lambda: braid_field()[0], 'hair', 'hair', 470, False),
]
PUFFER_GROUPS = [
    ('jacket', jacket_field, 'plain', 'jacket', 1560, True),
    ('shirt', shirt_field, 'cloth', 'shirt', 260, True),
    ('trousers', trousers_field, 'cloth', 'trousers', 650, True),
    ('shoes', shoes_field, 'cloth', 'shoe', 520, True),
    ('extras', extras_field, 'plain', 'yarn', 340, False),
]
CLASSIC_GROUPS = [('body', classic_body, None, None, 4000, False)]
HERO_GROUPS = [
    ('outfit', lambda: hero_outfit(), 'cloth', 'jacket', 2000, True),
    ('hood', lambda: hood_field(), 'cloth', 'jacket', 260, True),
    ('hem', lambda: hem_field(), 'cloth', 'jacket', 320, True),
    ('shoes', lambda: shoes_field(), 'cloth', 'shoe', 400, True),
    ('collar', lambda: collar_field(), 'cloth', 'shirt', 200, True),
    ('extras', lambda: extras_field(), 'plain', 'yarn', 220, False),
]
GROUPS = HEAD_GROUPS + {'classic': CLASSIC_GROUPS, 'puffer': PUFFER_GROUPS, 'hero': HERO_GROUPS}[BODY]


# ---------------------------------------------------------------- rig

def braid_bones():
    path = catmull(BRAID_PATH, n=24)
    L = np.cumsum(np.r_[0, np.linalg.norm(np.diff(path, axis=0), axis=1)])
    pts = [path[np.searchsorted(L, L[-1] * k / 3)] if k < 3 else path[-1] for k in range(4)]
    return [tuple(p) for p in pts]


def joints():
    if BODY == 'classic':
        J = classic_joints()
        b = braid_bones()
        for i in range(3):
            J['spring_braid_%d' % (i + 1)] = (b[i], b[i + 1], 'head' if i == 0 else 'spring_braid_%d' % i)
        return J  # no seat_doudou: Doudou keeps the classic body's hood placement
    hz = HIP[2]
    sx, sz = SHOULDER[0], SHOULDER[2]
    J = {
        'root': ((0, 0, 0), (0, 0, 0.1), None),
        'hips': ((0, 0, hz), (0, 0, 0.52), 'root'),
        'spine': ((0, 0, 0.52), (0, 0, 0.62), 'hips'),
        'chest': ((0, 0, 0.62), (0, 0, NECK[0]), 'spine'),
        'neck': ((0, 0, NECK[0]), (0, 0, NECK[1]), 'chest'),
        'head': ((0, 0, NECK[1]), (0, 0, 1.13), 'neck'),
        'hood': ((0, 0.07, 0.745), (0, 0.17, 0.745), 'chest'),
        'seat_doudou': ((0, 0.158, 0.732), (0, 0.158, 0.78), 'hood'),
    }
    for s_, g in (('L', 1), ('R', -1)):
        w = sx + UPPER + FORE
        J['shoulder_' + s_] = ((0.03 * g, 0, sz), (sx * g, 0, sz), 'chest')
        J['upperarm_' + s_] = ((sx * g, 0, sz), ((sx + UPPER) * g, 0, sz), 'shoulder_' + s_)
        J['forearm_' + s_] = (((sx + UPPER) * g, 0, sz), (w * g, 0, sz), 'upperarm_' + s_)
        J['hand_' + s_] = ((w * g, 0, sz), ((w + HAND) * g, 0, sz), 'forearm_' + s_)
        J['thumb_' + s_] = (((w + 0.02) * g, -0.016, sz), ((w + 0.045) * g, -0.03, sz), 'hand_' + s_)
        J['fingers_' + s_] = (((w + 0.045) * g, 0, sz), ((w + 0.075) * g, 0, sz), 'hand_' + s_)
        lx = 0.066 * g
        J['thigh_' + s_] = ((lx, 0, hz), (lx, 0, KNEE_Z), 'hips')
        J['shin_' + s_] = ((lx, 0, KNEE_Z), (lx, 0, ANKLE_Z), 'thigh_' + s_)
        J['foot_' + s_] = ((lx, 0, ANKLE_Z), (lx, -0.1, ANKLE_Z), 'shin_' + s_)
    b = braid_bones()
    for i in range(3):
        J['spring_braid_%d' % (i + 1)] = (b[i], b[i + 1], 'head' if i == 0 else 'spring_braid_%d' % i)
    return J


# layers hidden under others (culled before decimation)
CULL = {'skin': ['hair', 'jacket', 'shirt', 'hood', 'collar'], 'shirt': ['jacket'], 'trousers': ['jacket', 'shoes'], 'braid': ['hair'],
        'shoes': ['trousers']}  # groups that aren't fields (the classic body) are skipped

ARMS = ['shoulder_L', 'upperarm_L', 'forearm_L', 'shoulder_R', 'upperarm_R', 'forearm_R']
WEIGHTS = {
    'skin': ('auto', ['head', 'neck', 'chest', 'forearm_L', 'hand_L', 'thumb_L', 'fingers_L', 'forearm_R', 'hand_R',
                      'thumb_R', 'fingers_R'] if BODY == 'puffer' else ['head', 'neck', 'chest']),
    'body': ('parts',),
    'outfit': ('keep',),
    'hood': ('dist', ['chest', 'hood']),
    'hem': ('fn', lambda P: hem_weights(P)),
    'collar': ('dist', ['chest', 'neck']),
    'hair': ('rigid', 'head'),
    'braid': ('dist', ['head', 'spring_braid_1', 'spring_braid_2', 'spring_braid_3']),
    'jacket': ('auto', ['hips', 'spine', 'chest', 'neck', 'hood'] + ARMS),
    'shirt': ('auto', ['hips', 'spine', 'chest', 'neck']),
    'trousers': ('fn', lambda P: leg_weights(P)),
    'shoes': ('dist', ['shin_L', 'foot_L', 'shin_R', 'foot_R']),
    'extras': ('split', lambda c: ('foot_L' if c[0] > 0 else 'foot_R') if c[2] < 0.2 else 'chest'),
}

def leg_weights(P):
    """Balloon trousers: each leg follows its own thigh / shin with a narrow blend at the crotch seam,
    the waist follows the hips (bone heat blends the seat across both thighs, which webs in a run)."""
    x, z = P[:, 0], P[:, 2]
    left = np.clip(0.5 + x / 0.012, 0, 1)
    hip = np.clip((z - 0.4) / 0.06, 0, 1)
    upper = np.clip((z - (KNEE_Z - 0.04)) / 0.08, 0, 1)
    th, sh = (1 - hip) * upper, (1 - hip) * (1 - upper)
    W = np.stack([hip, th * left, sh * left, th * (1 - left), sh * (1 - left)], axis=1)
    return ['hips', 'thigh_L', 'shin_L', 'thigh_R', 'shin_R'], W


# ---------------------------------------------------------------- paint

EYES = F.EyeStyle(skin=COL['skin'], cx=0.06, w=0.027, h=0.03)
MOUTH = F.MouthStyle(skin=COL['skin'])


def _cuff_dist(P):
    d = np.full(len(P), 1.0)
    for g in (1, -1):
        sh, el, wr, tip = arm_points(g)
        c = wr - arm_dir(g) * 0.016
        d = np.minimum(d, np.linalg.norm(P - c, axis=1))
    return d


def face_kind(group, c, n, region=None):
    """Per-face shader family: the gingham grid (cloth) only where the ref has checked fabric."""
    c = np.asarray(c)
    if group == 'outfit':
        if region == HB.REGIONS['skin']:
            return 'skin'
        if region == HB.REGIONS['shoe'] and c[2] < 0.017:
            return 'plain'
        return 'cloth'
    if group in ('hood', 'hem', 'collar'):
        return 'cloth'
    if group == 'jacket':
        return 'cloth' if _cuff_dist(c[None])[0] < 0.058 else 'plain'
    if group == 'shoes':
        return 'plain' if c[2] < 0.017 else None
    if group == 'extras':
        return 'plain'
    return None


def paint_outfit(P, N, ao, ao_f, region):
    """The hero-based body in her colours: jacket (open over the cream shirt), cuffs, hands, trousers, shoes."""
    R = HB.REGIONS
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    col = np.tile(lin(COL['jacket']), (len(P), 1))
    col[region == R['cuff']] = lin(COL['lining'])
    col[region == R['skin']] = lin(COL['skin'])
    col[region == R['trousers']] = lin(COL['trousers'])
    shoe = region == R['shoe']
    col[shoe] = lin(COL['shoe'])
    col[shoe & (z < 0.017)] = lin(COL['sole'])
    jacket = region == R['jacket']
    # the jacket hangs open: the cream shirt shows down the front, its collar inside the jacket's
    front = jacket & (np.abs(x) < 0.024) & (y < -0.04) & (z > 0.4) & (z < NECK[0] - 0.01)
    col[front] = lin(COL['shirt'])
    # the shirt shows in a V at the neck; the jacket's own stand-up collar stays mustard
    col[jacket & (z > 0.735) & (y < -0.03) & (np.abs(x) < 0.028 + (z - 0.735) * 0.9)] = lin(COL['shirt'])
    # flap pockets low on the front
    for g_ in (1, -1):
        pk = jacket & (np.abs(x - 0.085 * g_) < 0.042) & (y < -0.06) & (np.abs(z - 0.47) < 0.03)
        col[pk] *= 0.9
        edge = pk & ((np.abs(np.abs(x - 0.085 * g_) - 0.042) < 0.004) | (np.abs(np.abs(z - 0.47) - 0.03) < 0.004))
        col[edge] *= 0.75
    # the trousers' gathered cuffs at the ankle
    col[(region == R['trousers']) & (z < 0.14)] *= 0.93
    return col * shade(ao, ao_f)[:, None]


def shade(ao, ao_f):
    return (0.5 + 0.5 * np.clip(ao, 0, 1) ** 1.3) * (0.7 + 0.3 * np.clip(ao_f, 0, 1))


def face_shade(ao, ao_f):
    return shade(ao, ao_f)


def _hash(n):
    return (np.sin(n * 127.1 + 311.7) * 43758.5453) % 1.0


def noise1(x):
    i = np.floor(x)
    f = x - i
    f = f * f * (3 - 2 * f)
    return _hash(i) * (1 - f) + _hash(i + 1) * f


def mixc(a, b, t):
    t = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return a * (1 - t) + b * t


def lin(h):
    return F.lin(h)


def paint(g, P, N, ao, ao_f, base, region=None):
    col = np.array(base, float)
    if g == 'outfit':
        return paint_outfit(P, N, ao, ao_f, region)
    if g == 'body':
        # the classic look: flat vertex-painted colours, gentle occlusion (the grid comes from the shader)
        return col * (0.72 + 0.28 * np.clip(ao, 0, 1))[:, None] * (0.85 + 0.15 * np.clip(ao_f, 0, 1))[:, None]
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    if g == 'jacket':
        cuff = _cuff_dist(P) < 0.056
        col[cuff] = lin(COL['lining'])
        line = quilt_lines(x, y, z)
        stitch = np.exp(-(line / 0.0013) ** 2) * (~cuff)
        col = col * (1 - 0.3 * stitch[:, None])
        # warm variation across the puffs, darker in the grooves
        col = col * (0.94 + 0.08 * np.clip(line / (QUILT * 0.5), 0, 1))[:, None]
    elif g in ('hair', 'braid'):
        crown = SKULL_C + np.array([0, 0.03, 0.14])
        v = P - crown
        az = np.arctan2(v[:, 0], -v[:, 1])
        k = noise1(az * 30) * 0.7 + noise1(az * 70 + 3) * 0.3
        if g == 'braid':
            k = noise1(z * 160 + x * 90) * 0.6 + noise1(y * 200) * 0.4
        col = col * (0.86 + 0.3 * k)[:, None]
        # soft highlight band on the top of the head
        up = np.clip(N[:, 2] * 0.8 - N[:, 1] * 0.3, 0, 1)
        col = col + lin('#6a5a55') * (0.25 * up ** 3 * k)[:, None]
        if g == 'braid':
            end = np.array(BRAID_PATH[-1])
            col[np.linalg.norm(P - end, axis=1) < 0.021] = lin(COL['tie'])
    elif g == 'shoes':
        col[z < 0.017] = lin(COL['sole'])
        col[z > 0.094] = lin(COL['sock'])
        # toe cap and heel panels a touch darker
        col[(z < 0.05) & (np.abs(y + 0.07) < 0.03)] *= 0.93
    elif g == 'trousers':
        band = np.abs(z - 0.118) < 0.012
        col[band] *= 0.88
    elif g == 'extras':
        yarn = np.linalg.norm(P - np.array([0.045, -0.158, 0.615]), axis=1) < 0.075
        col[:] = lin(COL['strap'])
        col[yarn] = lin(COL['yarn'])
        # yarn fibres wrapping the skein
        k = noise1((x * 0.4 + z) * 420)
        col[yarn] *= (0.85 + 0.25 * k[yarn])[:, None]
        col[z < 0.2] = lin(COL['lace'])
    elif g == 'skin':
        # warmer fingertips and ears
        warm = np.clip((0.03 - np.abs(np.abs(x) - 0.3)) / 0.03, 0, 1)
        col = mixc(col, lin('#f3b8a4'), 0.25 * warm)
    return col * shade(ao, ao_f)[:, None]
