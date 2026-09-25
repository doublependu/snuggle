# SPDX-License-Identifier: GPL-3.0-only
"""Modular Lantern Bay / Mistbloom architecture kit (env refs: Suzhou-style halls, pavilions,
moon gates, arched bridges). Exports assets-src/export/kit.glb.

Each piece is an empty named after the piece (zones place it with PLACE_<piece> empties) whose children
are one mesh per material plus COL_* collision meshes. Piece origins sit on the ground at the centre;
fronts face -Y (glTF +Z)."""
import os, sys, importlib, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *

C = srgb
TIMBER, TIMBER_D = '#7a3b2a', '#55291e'
PLASTER = '#ece6da'
STONE, STONE_D = '#b9b1a3', '#958d80'
LATTICE, PAPER = '#3f271d', '#dcb47a'
TILE = '#4d5358'


def col_box(name, c, size, rot=(0, 0, 0)):
    o = box('COL_' + name, c, size, 'plain', (1, 1, 1), rot=rot)
    return o


def piece(name, visual, cols, x=0.0, ao=True):
    root = link(bpy.data.objects.new(name, None))
    meshes = join_mixed(visual, name)
    if ao:
        bake_ao(meshes, dist=0.8, samples=20, strength=0.5)
    for m in meshes:
        m.parent = root
    if cols:
        col = join(cols, 'COL_' + name)
        col.parent = root
        col.hide_render = True
    root.location.x = x
    return root


def columns(pts, r, h, z0=0.0, color=TIMBER):
    out = []
    for i, (x, y) in enumerate(pts):
        out.append(tube('col%d' % i, (x, y, z0), (x, y, z0 + h), r, r * 0.92, 'wood', C(color), segs=8, rings=1))
        out.append(box('colbase%d' % i, (x, y, z0 + 0.06), (r * 2.6, r * 2.6, 0.12), 'stone', C(STONE_D)))
    return out


def lattice_window(c, w, h, facing='y', depth=0.06):
    """Dark frame with a paper panel and a simple grid of bars."""
    out = []
    sx, sy = (w, depth) if facing == 'y' else (depth, w)
    out.append(box('win_paper', c, (sx * 0.96, sy * 0.5, h * 0.96), 'plain', C(PAPER)))
    out.append(box('win_top', (c[0], c[1], c[2] + h / 2), (sx * 1.08 if facing == 'y' else sx * 1.5, sy * 1.5 if facing == 'y' else sy * 1.08, 0.09), 'wood', C(LATTICE)))
    out.append(box('win_bot', (c[0], c[1], c[2] - h / 2), (sx * 1.08 if facing == 'y' else sx * 1.5, sy * 1.5 if facing == 'y' else sy * 1.08, 0.09), 'wood', C(LATTICE)))
    for k in (-1, 1):
        if facing == 'y':
            out.append(box('win_s%d' % k, (c[0] + k * w / 2, c[1], c[2]), (0.08, sy * 1.5, h), 'wood', C(LATTICE)))
        else:
            out.append(box('win_s%d' % k, (c[0], c[1] + k * w / 2, c[2]), (sy * 1.5, 0.08, h), 'wood', C(LATTICE)))
    n = 4
    for i in range(1, n):
        t = -0.5 + i / n
        if facing == 'y':
            out.append(box('win_v%d' % i, (c[0] + t * w, c[1], c[2]), (0.035, sy * 1.1, h), 'wood', C(LATTICE)))
        else:
            out.append(box('win_v%d' % i, (c[0], c[1] + t * w, c[2]), (sy * 1.1, 0.035, h), 'wood', C(LATTICE)))
    for i in range(1, 3):
        t = -0.5 + i / 3
        out.append(box('win_h%d' % i, (c[0], c[1], c[2] + t * h), (sx * 1.02, sy * 1.1, 0.035), 'wood', C(LATTICE)))
    return out


def base_platform(w, d, h, steps_front=True, color=STONE):
    out = [box('base', (0, 0, h / 2), (w, d, h), 'stone', C(color), bevel=0.03)]
    cols = [col_box('base', (0, 0, h / 2), (w, d, h))]
    if steps_front and h > 0.15:
        n = max(1, int(h / 0.16))
        for i in range(n):
            sh = h * (i + 1) / (n + 1)
            out.append(box('step%d' % i, (0, -d / 2 - 0.3 * (n - i) + 0.15, sh / 2), (1.8, 0.32, sh), 'stone', C(STONE_D)))
        # collision ramp over the steps
        L = 0.32 * n + 0.1
        ang = math.degrees(math.atan2(h, L))
        cols.append(col_box('ramp', (0, -d / 2 - L / 2, h / 2 - 0.05), (1.8, math.hypot(L, h), 0.1), rot=(-ang, 0, 0)))
    return out, cols


# ---------------------------------------------------------------- pieces

def hall(x, name='hall', w=8.0, d=5.5, wall_h=3.0, open_front=False, base_h=0.6):
    V, K = [], []
    bv, bc = base_platform(w + 1.2, d + 1.2, base_h)
    V += bv
    K += bc
    z0 = base_h
    xs = [-w / 2, -w / 6, w / 6, w / 2]
    pts = [(xx, yy) for xx in xs for yy in (-d / 2, d / 2)]
    V += columns(pts, 0.17, wall_h, z0)
    # walls: back + sides plaster with a lower timber band; front with doors & windows unless open
    V.append(box('back', (0, d / 2, z0 + wall_h / 2), (w, 0.2, wall_h), 'plain', C(PLASTER)))
    K.append(col_box('back', (0, d / 2, z0 + wall_h / 2), (w, 0.3, wall_h)))
    for sx in (-1, 1):
        V.append(box('side%d' % sx, (sx * w / 2, 0, z0 + wall_h / 2), (0.2, d, wall_h), 'plain', C(PLASTER)))
        K.append(col_box('side%d' % sx, (sx * w / 2, 0, z0 + wall_h / 2), (0.3, d, wall_h)))
        V += lattice_window((sx * (w / 2 + 0.11), 0, z0 + wall_h * 0.55), d * 0.4, wall_h * 0.4, facing='x')
    if not open_front:
        for i, xx in enumerate((-w / 3, 0, w / 3)):
            if i == 1:
                V.append(box('door', (xx, -d / 2 - 0.08, z0 + 1.05), (1.4, 0.14, 2.1), 'wood', C(TIMBER_D)))
                V.append(box('door_line', (xx, -d / 2 - 0.16, z0 + 1.05), (0.04, 0.04, 2.0), 'wood', C(LATTICE)))
                for sx2 in (-1, 1):
                    V.append(ellipsoid('knob%d' % sx2, (xx + sx2 * 0.12, -d / 2 - 0.17, z0 + 1.05), (0.04, 0.03, 0.04), 'glow', C('#d9b25a'), (6, 4)))
                V.append(box('lintel', (xx, -d / 2, z0 + 2.4), (w / 3, 0.2, wall_h - 2.1 - 0.3), 'plain', C(PLASTER)))
            else:
                V.append(box('fwall%d' % i, (xx, -d / 2, z0 + wall_h / 2), (w / 3 - 0.3, 0.2, wall_h), 'plain', C(PLASTER)))
                V += lattice_window((xx, -d / 2 - 0.11, z0 + wall_h * 0.55), w / 3 * 0.6, wall_h * 0.45)
        K.append(col_box('front', (0, -d / 2, z0 + wall_h / 2), (w, 0.3, wall_h)))
    else:
        # open front: a low counter / railing between the outer columns
        for sx in (-1, 1):
            V.append(box('rail%d' % sx, (sx * w / 3, -d / 2, z0 + 0.45), (w / 3 - 0.3, 0.12, 0.9), 'wood', C(TIMBER)))
            K.append(col_box('rail%d' % sx, (sx * w / 3, -d / 2, z0 + 0.45), (w / 3, 0.3, 0.9)))
        V.append(box('floor', (0, 0, z0 + 0.02), (w, d, 0.04), 'wood', C('#9c7250')))
    # timber beam band under the roof
    V.append(box('beam_f', (0, -d / 2, z0 + wall_h - 0.15), (w + 0.4, 0.3, 0.3), 'wood', C(TIMBER)))
    V.append(box('beam_b', (0, d / 2, z0 + wall_h - 0.15), (w + 0.4, 0.3, 0.3), 'wood', C(TIMBER)))
    V += roof(name + '_roof', (0, 0, z0 + wall_h), w, d, 2.4, over=1.1, lift=0.45)
    return piece(name, V, K, x)


def pavilion(x, name='pavilion', s=3.6, h=2.6):
    V, K = [], []
    bv, bc = base_platform(s + 1.0, s + 1.0, 0.45)
    V += bv
    K += bc
    z0 = 0.45
    pts = [(sx * s / 2, sy * s / 2) for sx in (-1, 1) for sy in (-1, 1)]
    V += columns(pts, 0.14, h, z0)
    for (px, py) in pts:
        K.append(col_box('c%.0f%.0f' % (px, py), (px, py, z0 + h / 2), (0.3, 0.3, h)))
    # benches along three sides
    for i, (bx, by, rw, rd) in enumerate(((0, s / 2 - 0.25, s - 0.4, 0.4), (-s / 2 + 0.25, 0, 0.4, s - 0.4), (s / 2 - 0.25, 0, 0.4, s - 0.4))):
        V.append(box('bench%d' % i, (bx, by, z0 + 0.4), (rw, rd, 0.08), 'wood', C(TIMBER)))
        V.append(box('benchb%d' % i, (bx, by, z0 + 0.2), (rw * 0.95 if rw > 1 else 0.3, rd * 0.95 if rd > 1 else 0.3, 0.4), 'wood', C(TIMBER_D)))
        K.append(col_box('bench%d' % i, (bx, by, z0 + 0.22), (rw, rd, 0.44)))
    V.append(box('lintel_f', (0, -s / 2, z0 + h - 0.2), (s, 0.16, 0.3), 'wood', C(TIMBER)))
    V.append(box('lintel_b', (0, s / 2, z0 + h - 0.2), (s, 0.16, 0.3), 'wood', C(TIMBER)))
    V.append(box('lintel_l', (-s / 2, 0, z0 + h - 0.2), (0.16, s, 0.3), 'wood', C(TIMBER)))
    V.append(box('lintel_r', (s / 2, 0, z0 + h - 0.2), (0.16, s, 0.3), 'wood', C(TIMBER)))
    V += roof(name + '_roof', (0, 0, z0 + h), s, s, 1.9, over=0.9, lift=0.45, pyramid=True)
    V.append(cone('finial', (0, 0, z0 + h + 1.9), (0, 0, z0 + h + 2.4), 0.12, 0.03, 'roof', C('#363b40'), segs=6))
    return piece(name, V, K, x)


def pagoda(x, name='pagoda'):
    V, K = [], []
    bv, bc = base_platform(4.6, 4.6, 0.6)
    V += bv
    K += bc
    z = 0.6
    sizes = [3.4, 2.8, 2.2, 1.7]
    for i, s in enumerate(sizes):
        h = 2.4 if i == 0 else 1.7
        V.append(box('tier%d' % i, (0, 0, z + h / 2), (s, s, h), 'plain', C(PLASTER)))
        for sx in (-1, 1):
            for sy in (-1, 1):
                V.append(tube('tcol%d%d%d' % (i, sx, sy), (sx * s / 2, sy * s / 2, z), (sx * s / 2, sy * s / 2, z + h), 0.12, 0.12, 'wood', C(TIMBER), segs=6, rings=1))
        if i == 0:
            V.append(box('pdoor', (0, -s / 2 - 0.01, z + 1.0), (1.0, 0.1, 2.0), 'wood', C(TIMBER_D)))
            K.append(col_box('tier0', (0, 0, z + h / 2), (s + 0.1, s + 0.1, h)))
        else:
            V += lattice_window((0, -s / 2 - 0.08, z + h * 0.5), s * 0.45, h * 0.45)
        V += roof(name + '_r%d' % i, (0, 0, z + h), s, s, 0.9 if i < 3 else 1.6, over=0.85 - i * 0.08, lift=0.4, pyramid=True, res=(12, 12), ridge=(i == 3))
        z += h + 0.35
    V.append(tube('spire', (0, 0, z + 1.0), (0, 0, z + 2.6), 0.06, 0.02, 'glow', C('#d9b25a'), segs=6, rings=1))
    for k in range(3):
        V.append(ellipsoid('spire_b%d' % k, (0, 0, z + 1.2 + k * 0.35), (0.14 - k * 0.03, 0.14 - k * 0.03, 0.08), 'glow', C('#d9b25a'), (8, 5)))
    return piece(name, V, K, x)


def wall(x, name='wall', L=4.0, h=2.2, gate=False):
    V, K = [], []
    if gate:
        R = 1.15
        cz = 1.3
        # plaster wall with a round moon-gate opening: build from boxes around a circle
        n = 20
        seg = L / n
        for i in range(n):
            xx = -L / 2 + seg * (i + 0.5)
            if abs(xx) < R:
                dz = math.sqrt(max(0.0, R * R - xx * xx))
                lo, hi = cz - dz, cz + dz
                if lo > 0.02:
                    V.append(box('wl%d' % i, (xx, 0, lo / 2), (seg * 1.02, 0.35, lo), 'plain', C(PLASTER)))
                V.append(box('wh%d' % i, (xx, 0, (hi + h) / 2), (seg * 1.02, 0.35, h - hi), 'plain', C(PLASTER)))
            else:
                V.append(box('w%d' % i, (xx, 0, h / 2), (seg * 1.02, 0.35, h), 'plain', C(PLASTER)))
        V.append(torus('ring', (0, 0, cz), R + 0.02, 0.07, 'stone', C(STONE_D), (28, 5), rot=(90, 0, 0)))
        for sx in (-1, 1):
            K.append(col_box('side%d' % sx, (sx * (L / 4 + R / 2), 0, h / 2), (L / 2 - R, 0.4, h)))
        K.append(col_box('top', (0, 0, (cz + R + h) / 2 + 0.2), (2 * R, 0.4, h - cz - R + 0.4)))
    else:
        V.append(box('w', (0, 0, h / 2), (L, 0.35, h), 'plain', C(PLASTER)))
        V.append(box('band', (0, 0, 0.2), (L + 0.02, 0.37, 0.4), 'stone', C(STONE_D)))
        K.append(col_box('w', (0, 0, h / 2), (L, 0.4, h)))
    # little tiled cap on top
    V.append(box('cap', (0, 0, h + 0.08), (L + 0.1, 0.7, 0.16), 'roof', C(TILE)))
    V.append(box('capr', (0, 0, h + 0.2), (L + 0.1, 0.18, 0.12), 'roof', C('#3b4045')))
    return piece(name, V, K, x)


def bridge(x, name='bridge', span=7.0, width=2.2, rise=1.4):
    V, K = [], []
    n = 12
    pts = []
    for i in range(n + 1):
        t = i / n
        yy = -span / 2 + span * t
        zz = rise * math.sin(math.pi * t) ** 0.8
        pts.append((yy, zz))
    for i in range(n):
        (y0, z0), (y1, z1) = pts[i], pts[i + 1]
        cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
        ang = math.degrees(math.atan2(z1 - z0, y1 - y0))
        L = math.hypot(y1 - y0, z1 - z0) + 0.02
        V.append(box('deck%d' % i, (0, cy, cz - 0.12), (width, L, 0.3), 'stone', C(STONE), rot=(ang, 0, 0)))
        K.append(col_box('deck%d' % i, (0, cy, cz - 0.12), (width, L, 0.3), rot=(ang, 0, 0)))
        for sx in (-1, 1):
            V.append(box('rail%d%d' % (i, sx), (sx * (width / 2 - 0.08), cy, cz + 0.35), (0.14, L, 0.12), 'stone', C(STONE_D), rot=(ang, 0, 0)))
            K.append(col_box('rail%d%d' % (i, sx), (sx * (width / 2 - 0.08), cy, cz + 0.4), (0.2, L, 0.8), rot=(ang, 0, 0)))
            if i % 3 == 0:
                V.append(box('post%d%d' % (i, sx), (sx * (width / 2 - 0.08), y0, z0 + 0.25), (0.18, 0.18, 0.7), 'stone', C(STONE_D)))
    # arch face underneath
    for sx in (-1, 1):
        for i in range(n):
            (y0, z0), (y1, z1) = pts[i], pts[i + 1]
            V.append(box('face%d%d' % (i, sx), (sx * (width / 2 - 0.05), (y0 + y1) / 2, (z0 + z1) / 2 - 0.45), (0.1, abs(y1 - y0) + 0.02, 0.6), 'stone', C(STONE_D)))
    return piece(name, V, K, x)


def gate(x, name='gate', w=5.0, h=4.2):
    V, K = [], []
    for sx in (-1, 1):
        V.append(tube('gp%d' % sx, (sx * w / 2, 0, 0), (sx * w / 2, 0, h), 0.2, 0.18, 'wood', C(TIMBER), segs=8, rings=1))
        V.append(box('gpb%d' % sx, (sx * w / 2, 0, 0.3), (0.6, 0.6, 0.6), 'stone', C(STONE_D), bevel=0.04))
        K.append(col_box('gp%d' % sx, (sx * w / 2, 0, h / 2), (0.5, 0.5, h)))
    V.append(box('beam1', (0, 0, h - 0.6), (w + 0.8, 0.3, 0.3), 'wood', C(TIMBER)))
    V.append(box('beam2', (0, 0, h - 1.3), (w + 0.2, 0.25, 0.25), 'wood', C(TIMBER)))
    V.append(box('plaque', (0, -0.16, h - 0.95), (1.8, 0.08, 0.5), 'wood', C('#2f5f5a')))
    V.append(box('plaque_rim', (0, -0.12, h - 0.95), (1.95, 0.06, 0.62), 'glow', C('#d9b25a')))
    V += roof(name + '_roof', (0, 0, h - 0.4), w + 0.6, 0.6, 0.9, over=0.5, lift=0.35, res=(16, 4))
    return piece(name, V, K, x)


def canopy(x, name='canopy', L=6.0, d=4.0, h=3.2):
    V, K = [], []
    for sx in (-1, 1):
        V.append(tube('cp%d' % sx, (sx * (L / 2 - 0.3), 0, 0), (sx * (L / 2 - 0.3), 0, h), 0.12, 0.12, 'wood', C('#2f5f5a'), segs=8, rings=1))
        K.append(col_box('cp%d' % sx, (sx * (L / 2 - 0.3), 0, h / 2), (0.3, 0.3, h)))
    V.append(box('cbeam', (0, 0, h), (L, 0.25, 0.25), 'wood', C('#2f5f5a')))
    V += roof(name + '_roof', (0, 0, h + 0.1), L, d * 0.3, 0.8, over=0.8, lift=0.25, res=(14, 6), tile='#5b6a6a', ridge=False)
    return piece(name, V, K, x)


def bench(x, name='bench'):
    V = [box('seat', (0, 0, 0.42), (1.6, 0.45, 0.07), 'wood', C('#9c6a44')),
         box('back', (0, 0.2, 0.75), (1.6, 0.06, 0.4), 'wood', C('#9c6a44'))]
    for sx in (-1, 1):
        V.append(box('leg%d' % sx, (sx * 0.65, 0, 0.21), (0.08, 0.4, 0.42), 'wood', C('#5a3d2a')))
    return piece(name, V, [col_box('b', (0, 0.02, 0.4), (1.6, 0.5, 0.8))], x)


def basket(x, name='basket'):
    V = [tube('bk', (0, 0, 0), (0, 0, 0.45), 0.3, 0.36, 'cloth', C('#c9a26a'), segs=12, rings=2),
         torus('rim', (0, 0, 0.45), 0.36, 0.035, 'wood', C('#9c7a4c'), (14, 4)),
         ellipsoid('laundry', (0, 0, 0.45), (0.3, 0.3, 0.12), 'cloth', C('#e8e2f0'), (10, 6))]
    return piece(name, V, [col_box('b', (0, 0, 0.25), (0.7, 0.7, 0.5))], x)


def rack(x, name='rack', L=4.0):
    """Laundry drying line: two poles, a line and hanging cloths."""
    V, K = [], []
    for sx in (-1, 1):
        V.append(tube('pole%d' % sx, (sx * L / 2, 0, 0), (sx * L / 2, 0, 2.0), 0.05, 0.05, 'wood', C('#7a5a3e'), segs=6, rings=1))
        K.append(col_box('pole%d' % sx, (sx * L / 2, 0, 1.0), (0.15, 0.15, 2.0)))
    V.append(tube('line', (-L / 2, 0, 1.9), (L / 2, 0, 1.9), 0.012, 0.012, 'wood', C('#d8cdb8'), segs=4, rings=1))
    cols = ['#e6eef2', '#f2d9c4', '#cfe0c8', '#f4e7b0', '#d9cde8']
    for i in range(5):
        xx = -L / 2 + L * (i + 0.7) / 5.6
        w = 0.45 + (i % 2) * 0.2
        V.append(box('cloth%d' % i, (xx, 0, 1.55 - (i % 2) * 0.1), (w, 0.03, 0.7 + (i % 3) * 0.12), 'cloth', C(cols[i]), rot=(0, 0, (i - 2) * 2)))
    return piece(name, V, K, x, ao=False)


def stall(x, name='stall', w=3.0, d=1.8):
    V, K = [], []
    V.append(box('counter', (0, 0, 0.5), (w, d * 0.5, 1.0), 'wood', C('#9c6a44')))
    K.append(col_box('counter', (0, 0, 0.5), (w, d * 0.5, 1.0)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            V.append(tube('sp%d%d' % (sx, sy), (sx * w / 2, sy * d / 2, 0), (sx * w / 2, sy * d / 2, 2.4), 0.05, 0.05, 'wood', C('#5a3d2a'), segs=6, rings=1))
    V.append(box('awning', (0, -0.1, 2.45), (w + 0.4, d + 0.6, 0.08), 'cloth', C('#e0662c'), rot=(8, 0, 0)))
    V.append(box('awning2', (0, -0.1, 2.46), (w + 0.42, d * 0.3, 0.085), 'cloth', C('#f3e4c8'), rot=(8, 0, 0)))
    for i in range(4):
        V.append(ellipsoid('good%d' % i, (-w / 2 + 0.4 + i * 0.7, -0.1, 1.08), (0.18, 0.18, 0.1), 'plain', C(['#e8b04a', '#d9574a', '#f3e4c8', '#8fbf6a'][i]), (8, 6)))
    return piece(name, V, K, x)


def shelf(x, name='shelf', w=2.0, h=2.2):
    V = [box('frame', (0, 0, h / 2), (w, 0.45, h), 'wood', C('#6b4430'))]
    cols = ['#b5483a', '#3e6f8a', '#d9a441', '#5f8a5a', '#8a5a8a', '#e8dcc0']
    for r in range(4):
        z = 0.25 + r * (h - 0.3) / 4
        V.append(box('board%d' % r, (0, -0.02, z), (w - 0.08, 0.44, 0.04), 'wood', C('#8a5a3c')))
        xx = -w / 2 + 0.12
        k = 0
        while xx < w / 2 - 0.15:
            bw = 0.06 + ((r * 7 + k * 3) % 5) * 0.015
            bh = 0.3 + ((r + k) % 3) * 0.05
            V.append(box('book%d_%d' % (r, k), (xx + bw / 2, -0.05, z + 0.02 + bh / 2), (bw, 0.3, bh), 'plain', C(cols[(r + k) % 6])))
            xx += bw + 0.01
            k += 1
    return piece(name, V, [col_box('s', (0, 0, h / 2), (w, 0.5, h))], x, ao=False)


def stove(x, name='stove'):
    V = [box('body', (0, 0, 0.45), (2.2, 1.0, 0.9), 'stone', C('#b86a4a'), bevel=0.05),
         box('top', (0, 0, 0.92), (2.3, 1.1, 0.06), 'stone', C('#8a4a36'))]
    for i, sx in enumerate((-0.55, 0.55)):
        V.append(ellipsoid('wok%d' % i, (sx, 0, 0.95), (0.38, 0.38, 0.14), 'stone', C('#2e2e2e'), (14, 6), squash_bottom=0.0, cut=lambda co: co.z > 0.1))
        V.append(tube('steamer%d' % i, (sx, 0, 0.95), (sx, 0, 1.25), 0.3, 0.3, 'wood', C('#c9a26a'), segs=12, rings=2))
        V.append(ellipsoid('lid%d' % i, (sx, 0, 1.25), (0.3, 0.3, 0.08), 'wood', C('#b08850'), (12, 5)))
    V.append(box('fire', (0, -0.51, 0.3), (0.5, 0.02, 0.3), 'glow', C('#f0892e')))
    V.append(tube('chimney', (0.9, 0.35, 0.9), (0.9, 0.35, 2.6), 0.14, 0.12, 'stone', C('#8a4a36'), segs=8, rings=1))
    return piece(name, V, [col_box('s', (0, 0, 0.6), (2.3, 1.1, 1.2))], x)


def table(x, name='table', w=2.4, d=1.2):
    V = [box('top', (0, 0, 0.72), (w, d, 0.08), 'wood', C('#9c6a44'))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            V.append(box('leg%d%d' % (sx, sy), (sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), 0.36), (0.08, 0.08, 0.72), 'wood', C('#6b4430')))
    for i in range(3):
        V.append(ellipsoid('dish%d' % i, (-0.7 + i * 0.7, 0, 0.8), (0.2, 0.2, 0.05), 'plain', C('#f2ede2'), (10, 4)))
        V.append(ellipsoid('bun%d' % i, (-0.7 + i * 0.7, 0, 0.85), (0.08, 0.08, 0.06), 'paper', C('#f6efe4'), (8, 5)))
    return piece(name, V, [col_box('t', (0, 0, 0.4), (w, d, 0.8))], x)


def lamp_post(x, name='lamp_post'):
    V = [tube('post', (0, 0, 0), (0, 0, 2.6), 0.07, 0.05, 'wood', C('#3b3b3b'), segs=6, rings=1),
         tube('arm', (0, 0, 2.5), (0.45, 0, 2.5), 0.03, 0.03, 'wood', C('#3b3b3b'), segs=5, rings=1),
         tube('lantern', (0.45, 0, 1.95), (0.45, 0, 2.35), 0.16, 0.16, 'glow', C('#e8553a'), segs=10, rings=3, bulge=0.06),
         box('ltop', (0.45, 0, 2.38), (0.18, 0.18, 0.05), 'wood', C('#3b3b3b'))]
    return piece(name, V, [col_box('p', (0, 0, 1.3), (0.2, 0.2, 2.6))], x, ao=False)


def stone_lantern(x, name='stone_lantern'):
    V = [box('base', (0, 0, 0.15), (0.6, 0.6, 0.3), 'stone', C(STONE_D), bevel=0.03),
         tube('shaft', (0, 0, 0.3), (0, 0, 0.9), 0.1, 0.1, 'stone', C(STONE), segs=6, rings=1),
         box('light', (0, 0, 1.08), (0.4, 0.4, 0.35), 'glow', C('#f6cf82')),
         cone('roofc', (0, 0, 1.25), (0, 0, 1.6), 0.45, 0.05, 'stone', C(STONE_D), segs=6)]
    return piece(name, V, [col_box('l', (0, 0, 0.7), (0.6, 0.6, 1.4))], x, ao=False)


def train_shell(x, name='train_shell', L=16.0, W=3.0, H=3.1):
    """Exterior of the Lantern Bay train car (the interior is the separate train zone)."""
    V, K = [], []
    green, cream = C('#3e6f5e'), C('#efe4c8')
    V.append(box('lower', (0, 0, 0.95), (L, W, 1.1), 'plain', green))
    V.append(box('upper', (0, 0, 2.1), (L, W - 0.04, 1.2), 'plain', cream))
    for i in range(8):
        xx = -L / 2 + 1.2 + i * (L - 2.4) / 7
        for sy in (-1, 1):
            V.append(box('win%d%d' % (i, sy), (xx, sy * (W / 2 + 0.01), 2.05), (1.2, 0.03, 0.7), 'glass', C('#9fc2c9')))
    V.append(box('roofc', (0, 0, 2.8), (L + 0.1, W + 0.1, 0.22), 'plain', C('#4b5552')))
    V.append(box('roofc2', (0, 0, 2.95), (L - 0.2, W - 0.6, 0.12), 'plain', C('#5b6562')))
    for sx in (-1, 1):
        V.append(box('endface%d' % sx, (sx * (L / 2 + 0.03), 0, 1.6), (0.06, W - 0.4, 2.1), 'plain', C('#34574b')))
        V.append(box('endwin%d' % sx, (sx * (L / 2 + 0.07), 0, 2.1), (0.03, 1.0, 0.6), 'glass', C('#9fc2c9')))
    for sx in (-1, 1):
        for k in (-1, 1):
            V.append(tube('wheel%d%d' % (sx, k), (sx * (L / 2 - 2) + k * 0.8, -W / 2 + 0.1, 0.35), (sx * (L / 2 - 2) + k * 0.8, W / 2 - 0.1, 0.35), 0.35, 0.35, 'stone', C('#2e2e2e'), segs=10, rings=1))
    V.append(box('stripe', (0, 0, 1.52), (L + 0.02, W + 0.02, 0.08), 'glow', C('#d9b25a')))
    K.append(col_box('body', (0, 0, H / 2), (L, W, H)))
    return piece(name, V, K, x)


def railing(x, name='railing', L=4.0):
    V = [box('top', (0, 0, 0.95), (L, 0.12, 0.1), 'wood', C(TIMBER))]
    for i in range(5):
        V.append(box('bal%d' % i, (-L / 2 + i * L / 4, 0, 0.47), (0.1, 0.1, 0.95), 'wood', C(TIMBER)))
    V.append(box('mid', (0, 0, 0.5), (L, 0.06, 0.06), 'wood', C(TIMBER_D)))
    return piece(name, V, [col_box('r', (0, 0, 0.6), (L, 0.3, 1.2))], x, ao=False)


def stairs(x, name='stairs', w=2.4, h=2.0, run=3.2):
    V, K = [], []
    n = int(h / 0.18)
    for i in range(n):
        V.append(box('st%d' % i, (0, -run / 2 + run * (i + 0.5) / n, (i + 1) * h / n / 2), (w, run / n + 0.01, (i + 1) * h / n), 'stone', C(STONE if i % 2 else STONE_D)))
    ang = math.degrees(math.atan2(h, run))
    K.append(col_box('ramp', (0, 0, h / 2 - 0.08), (w, math.hypot(run, h), 0.16), rot=(ang, 0, 0)))
    K.append(col_box('under', (0, run / 4, h / 4), (w, run / 2, h / 2)))
    return piece(name, V, K, x)


def library(x, name='library', w=7.0, d=5.0):
    """Two-storey library with an outside staircase; a cosy nook under the stairs."""
    V, K = [], []
    bv, bc = base_platform(w + 1.0, d + 1.0, 0.4, steps_front=True)
    V += bv
    K += bc
    z0 = 0.4
    h1, h2 = 3.0, 2.6
    V.append(box('f1', (0, 0, z0 + h1 / 2), (w, d, h1), 'plain', C(PLASTER)))
    K.append(col_box('f1', (0, 0, z0 + h1 / 2), (w, d, h1)))
    V.append(box('door', (0, -d / 2 - 0.06, z0 + 1.05), (1.4, 0.12, 2.1), 'wood', C(TIMBER_D)))
    for sx in (-1, 1):
        V += lattice_window((sx * w / 3, -d / 2 - 0.08, z0 + 1.7), 1.4, 1.2)
    V.append(box('balcony', (0, -0.3, z0 + h1 + 0.1), (w + 1.2, d + 1.2, 0.2), 'wood', C(TIMBER)))
    V.append(box('f2', (0, 0, z0 + h1 + 0.2 + h2 / 2), (w * 0.82, d * 0.8, h2), 'plain', C(PLASTER)))
    for sx in (-1, 0, 1):
        V += lattice_window((sx * w / 3.6, -d * 0.4 - 0.08, z0 + h1 + 0.2 + h2 * 0.5), 1.1, 1.1)
    for i in range(7):
        xx = -(w + 1.2) / 2 + i * (w + 1.2) / 6
        V.append(box('bal%d' % i, (xx, -0.3 - (d + 1.2) / 2, z0 + h1 + 0.6), (0.08, 0.08, 0.8), 'wood', C(TIMBER)))
    V.append(box('balrail', (0, -0.3 - (d + 1.2) / 2, z0 + h1 + 1.0), (w + 1.2, 0.1, 0.08), 'wood', C(TIMBER)))
    V += roof(name + '_r1', (0, -0.3, z0 + h1 + 0.2), w + 1.2, d + 1.2, 0.6, over=0.5, lift=0.3, ridge=False, res=(14, 8))
    V += roof(name + '_r2', (0, 0, z0 + h1 + 0.2 + h2), w * 0.82, d * 0.8, 2.0, over=0.9, lift=0.45)
    # outside staircase up the east side (collision ramp), open underneath
    sx0 = w / 2 + 0.9
    n = 16
    for i in range(n):
        yy = d / 2 - (i + 0.5) * (d + 1.0) / n
        zz = z0 + (i + 1) * h1 / n
        V.append(box('ost%d' % i, (sx0, yy, zz - 0.06), (1.3, (d + 1.0) / n + 0.02, 0.12), 'wood', C('#8a5a3c')))
    ang = math.degrees(math.atan2(h1, d + 1.0))
    K.append(col_box('stairs', (sx0, -0.5 + 0.0, z0 + h1 / 2 - 0.1), (1.3, math.hypot(d + 1.0, h1), 0.15), rot=(-ang, 0, 0)))
    V.append(box('ostrail', (sx0 + 0.62, -0.5, z0 + h1 / 2 + 0.7), (0.08, math.hypot(d + 1.0, h1), 0.08), 'wood', C(TIMBER), rot=(-ang, 0, 0)))
    for k in range(4):
        V.append(tube('ostpost%d' % k, (sx0 + 0.62, d / 2 - k * (d + 1) / 3, 0), (sx0 + 0.62, d / 2 - k * (d + 1) / 3, z0 + h1 * (k / 3) + 0.9), 0.05, 0.05, 'wood', C(TIMBER), segs=5, rings=1))
    return piece(name, V, K, x)


PIECES = [hall, lambda x: hall(x, 'hall_open', open_front=True), lambda x: hall(x, 'hall_small', w=5.5, d=4.2, wall_h=2.7),
          pavilion, pagoda, wall, lambda x: wall(x, 'moongate', gate=True), bridge, gate, canopy, bench, basket, rack,
          stall, shelf, stove, table, lamp_post, stone_lantern, train_shell, railing, stairs, library]


def build():
    reset_scene()
    use_collection('kit')
    roots = []
    x = 0.0
    for fn in PIECES:
        roots.append(fn(x))
        x += 14
    objs = []
    for r in roots:
        objs += descendants(r)
    return export_glb('kit.glb', objs)


if __name__ == '__main__':
    print('built', build())
