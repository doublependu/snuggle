# SPDX-License-Identifier: GPL-3.0-only
"""Chapters 4 and 5: the Old Quarter and the square at the heart of the Quiet District, south of the fog wall.

Exports assets-src/export/heart.glb (run headless: blender -b -P tools/blender/build_heart.py). It uses the
Quiet District's kit (quiet_kit.glb, tools/blender/build_quiet.py) for its shopfronts and street furniture.

The place is drawn as a set of walkable rectangles (WALK below). Everything round them is made from that one
list: the invisible walls, the plaster walls and shuttered shopfronts along every edge, the doorways (recesses
a sigh can't reach into). So the collision and the picture can't drift apart.

  north   the gateway from the Quiet District; the persimmon courtyard behind Grandmother's kitchen (west of
          it) and a neighbour's back garden (east of it), where Chapter 4 begins
  east    laundry alley, down to the pump yard
  middle  Lantern-makers' Row, running west to the long street, with one narrow gap
  west    the long street: the Arcade (its north half, up to the courtyard) and Thread Street (its south
          half), down to the crossroads
  south   the crossroads, and the old square with its dry fountain and street oven, where the Great Sulk sits
          (sulk.glb, tools/blender/build_sulk.py)

Coordinates: +Y is north (the Quiet District), -Y south (the heart). The Great Sulk's sighs come up the streets
from the south. DOMAIN_kitchen is Grandmother's Kitchen, Master Fang's Domain of Comfort: the runtime draws it
only inside the Domain's circle, and the street only outside it (src/render/materials.js uDomain). Its stove,
cupboard and pillars stand exactly where the square's fountain, oven and lantern posts do, so one collision
serves both.

Markers: SPAWN_*, NPC_*, GRUMB_heavy_<n> (the sleepers) and GRUMB_gap, POINT_loose_<id> / POINT_anchor_<id>
(a loose end and where it belongs; prop icon), AREA_warm_<n> (a warm spot), TRIGGER_*, SEAT_*, CAM_*, LIGHT_*
(prop mem: 'warm' is lit from the start, 'after' once the fog has lifted), POINT_post_<species> and
POINT_patch_<species> (Chapter 5: where each kind of Charm Sprite gathers, and its patch on the Great Sulk),
SEAT_table_<n>, POINT_sigh (where the sighs come from).
"""
import os, sys, importlib, math, random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *
import build_kit

importlib.reload(build_kit)
from build_kit import TIMBER, TIMBER_D, PLASTER, STONE, STONE_D, TILE
import build_market

importlib.reload(build_market)
import build_quiet

importlib.reload(build_quiet)
from build_quiet import marker, area, light, place, col, dead_lantern, LIGHTS, SHUTTER

C = srgb
CELL = 0.5

# ---------------------------------------------------------------- the walkable rectangles
# name: (x0, x1, y0, y1, style). style decides what stands along the rectangle's outer edges:
#   'shops'  shuttered shopfronts and house fronts from the kit, plaster in between
#   'blank'  tall plaster walls
#   'wall'   a garden wall (low, tiled on top)
#   'door'   a doorway: a recess in a wall, with a door at the back and a lintel over it
#   'open'   nothing to see (the gateway back to the Quiet District)
WALK = {
    'gateway': (-3, 3, 44, 46, 'open'),
    'gateyard': (-3, 3, 34, 44, 'blank'),
    'court': (-20, -5, 28, 42, 'wall'),
    'court_arch': (-5, -3, 37, 40, 'door'),
    'garden': (5, 19, 30, 44, 'wall'),
    'garden_gate': (3, 5, 37, 40, 'door'),
    'laundry': (10, 14, 6, 30, 'blank'),
    'pump': (8, 18, -2, 6, 'shops'),
    'row': (-10, 8, 0, 4, 'shops'),
    'gap': (-12, -10, 1, 3, 'blank'),
    'street': (-16, -12, -33, 28, 'shops'),
    'cross': (-26, -2, -27, -21, 'shops'),
    'square': (-30, 2, -65, -33, 'shops'),
}
# doorways (recesses 1.5 m deep, 2 m wide): somewhere to stand when a sigh comes up the street
DOORS = [
    # laundry alley
    ('d_l1', 14, 15.5, 22, 24), ('d_l2', 8.5, 10, 15, 17), ('d_l3', 14, 15.5, 9, 11),
    # the Arcade: every 7 m, on alternate sides
    ('d_a1', -17.5, -16, 7, 9), ('d_a2', -12, -10.5, 10.5, 12.5), ('d_a3', -17.5, -16, 14, 16),
    ('d_a4', -12, -10.5, 17.5, 19.5), ('d_a5', -17.5, -16, 21, 23), ('d_a6', -12, -10.5, 24, 26),
    # Thread Street: two (the threads she stitches are the rest of the shelter)
    ('d_t1', -17.5, -16, -7, -5), ('d_t2', -12, -10.5, -15.5, -13.5),
]
for n, x0, x1, y0, y1 in DOORS:
    WALK[n] = (x0, x1, y0, y1, 'door')

X0, X1, Y0, Y1 = -34, 24, -70, 50   # the ground mesh


def cells():
    """{(i, j): style} for every half-metre cell that can be walked on."""
    out = {}
    for name, (x0, x1, y0, y1, style) in WALK.items():
        for i in range(round(x0 / CELL), round(x1 / CELL)):
            for j in range(round(y0 / CELL), round(y1 / CELL)):
                # a doorway keeps its own style; elsewhere the first rectangle to claim a cell wins
                if (i, j) not in out or style == 'door':
                    out[(i, j)] = style
    return out


def edges(cs):
    """The outline of the walkable area as straight runs: (axis, at, a, b, sign, style).
    axis 'x': a wall along x at y = at, from x = a to b; sign +1 if the walkable side is +y (north)."""
    raw = {}
    for (i, j), style in cs.items():
        for axis, n, (di, dj) in (('x', -1, (0, -1)), ('x', 1, (0, 1)), ('y', -1, (-1, 0)), ('y', 1, (1, 0))):
            if (i + di, j + dj) in cs:
                continue
            if axis == 'x':
                key = ('x', (j + (1 if n > 0 else 0)) * CELL, -n, style)
                raw.setdefault(key, []).append(i)
            else:
                key = ('y', (i + (1 if n > 0 else 0)) * CELL, -n, style)
                raw.setdefault(key, []).append(j)
    runs = []
    for (axis, at, sign, style), idx in raw.items():
        idx.sort()
        a = prev = idx[0]
        for k in idx[1:] + [None]:
            if k is None or k != prev + 1:
                runs.append((axis, at, a * CELL, (prev + 1) * CELL, sign, style))
                a = k
            prev = k
    return runs


WALLS = ['#d6cfc2', '#cfc6b6', '#c9cfc8', '#dcd2c2', '#c4c9c6', '#d9c9b3']
SHOPS = [('qshop_a', 5.6), ('qhouse_a', 4.2), ('qshop_c', 5.6), ('qhouse_b', 4.2), ('qshop_b', 5.6)]


def heart():
    reset_scene()
    use_collection('heart')
    for fn in build_quiet.PIECES:  # the kit pieces' lanterns (LIGHTS), without keeping the pieces
        fn(0)
    reset_scene()
    use_collection('heart')
    rnd = random.Random(44)
    cs = cells()

    def color(x, y, z):
        i, j = math.floor(x / 1.1), math.floor(y / 1.1)
        k = ((i * 73856093) ^ (j * 19349663)) % 7 / 7
        base = mix(C('#8a857c'), C('#9d978b'), k)
        cell = cs.get((math.floor(x / CELL), math.floor(y / CELL)))
        if -30 <= x <= 2 and -65 <= y <= -33:   # the square: paler flags
            base = mix(base, C('#a39c8e'), 0.5)
        elif cell == 'wall':                    # the garden and the courtyard: packed earth and moss
            base = mix(C('#8d8a72'), C('#7f8468'), k)
        elif cell is None:
            base = C('#77726a')
        return base

    # the ground: flat, and only where someone can stand or see (under the houses there is none)
    near = set()
    G2 = 2   # metres a side: it's flat, and the paving's grain comes from the shader
    for (i, j) in cs:
        for di in (-3, 0, 3):
            for dj in (-3, 0, 3):
                near.add((math.floor((i + di) * CELL / G2) * G2, math.floor((j + dj) * CELL / G2) * G2))
    bm = bmesh.new()
    vs = {}

    def gv(x, y):
        if (x, y) not in vs:
            vs[(x, y)] = bm.verts.new((x, y, 0.0))
        return vs[(x, y)]
    for (x, y) in sorted(near):
        bm.faces.new((gv(x, y), gv(x + G2, y), gv(x + G2, y + G2), gv(x, y + G2)))
    terrain = mesh_obj('GROUND_heart', bm, 'ground', (1, 1, 1), smooth=True)
    attr = terrain.data.color_attributes['Col']
    for poly in terrain.data.polygons:
        c = color(*poly.center)
        for li in poly.loop_indices:
            attr.data[li].color_srgb = (c[0], c[1], c[2], KIND_CODE['ground'] / 10)
    V, K, B = [], [], []

    # ---------------------------------------------------------------- walls from the outline
    shop_i = [0]

    def blank(tag, cx, cy, sx, sy, hh, colour, cap=True, thick_axis='y'):
        V.append(box('w_' + tag, (cx, cy, hh / 2), (sx, sy, hh), 'plain', C(colour), noise=0.04))
        if cap:
            V.append(box('wc_' + tag, (cx, cy, hh + 0.09), (sx + 0.24, sy + 0.24, 0.18), 'roof', C(TILE)))

    for n, (axis, at, a, b, sign, style) in enumerate(sorted(edges(cs))):
        L = b - a
        mid = (a + b) / 2
        tag = '%s%d' % (axis, n)
        # the invisible wall, just outside the edge
        if axis == 'x':
            B.append(col('b_' + tag, (mid, at - sign * 0.2, 4), (L, 0.4, 8)))
        else:
            B.append(col('b_' + tag, (at - sign * 0.2, mid, 4), (0.4, L, 8)))
        if style == 'open':
            continue

        def wall(a0, b0, hh, colour, thick=0.8, cap=True, t='w'):
            m, l = (a0 + b0) / 2, b0 - a0
            if l <= 0.01:
                return
            off = at - sign * thick / 2
            k = '%s%s_%d' % (tag, t, round(a0 * 2))
            if axis == 'x':
                blank(k, m, off, l, thick, hh, colour, cap)
            else:
                blank(k, off, m, thick, l, hh, colour, cap)

        if style == 'wall':
            wall(a, b, 2.7, '#e6dfd0', thick=0.5)
        elif style == 'shops' and L >= 4.4:
            # shopfronts side by side, centred on the run; plaster fills what is left at the ends
            fits = []
            left = L
            while left >= 4.3:
                name, w = SHOPS[shop_i[0] % len(SHOPS)]
                if w > left - 0.1:
                    name, w = 'qhouse_a' if shop_i[0] % 2 else 'qhouse_b', 4.2
                shop_i[0] += 1
                fits.append((name, w))
                left -= w + 0.1
            total = sum(w + 0.1 for _, w in fits) - 0.1
            p = a + (L - total) / 2
            # a plain wall behind the row (it shows through the hairline gaps between the fronts)
            back = at - sign * 0.72
            if axis == 'x':
                V.append(box('wb_' + tag, (mid, back, 2.6), (L, 0.3, 5.2), 'plain', C('#bfb8aa')))
            else:
                V.append(box('wb_' + tag, (back, mid, 2.6), (0.3, L, 5.2), 'plain', C('#bfb8aa')))
            wall(a, p, 5.2, WALLS[n % 6], t='a', cap=False)
            for name, w in fits:
                c = p + w / 2
                if axis == 'x':
                    place(name, (c, at, 0), rot=180 if sign > 0 else 0, mem='after')
                else:
                    place(name, (at, c, 0), rot=90 if sign > 0 else -90, mem='after')
                p += w + 0.1
            wall(p - 0.1, b, 5.2, WALLS[(n + 1) % 6], t='b', cap=False)
        else:
            wall(a, b, 5.0 + (n % 3) * 0.35, WALLS[n % 6], cap=False)   # (their tops are lost in the fog)

    # doorways: a door at the back of each recess, a lintel over it, a step
    for n, x0, x1, y0, y1 in DOORS:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        east = x0 >= 10 or (x0 >= -12 and x0 < 0)   # the recess is in a wall on the street's east side
        bx = x1 - 0.03 if east else x0 + 0.03       # the back of the recess
        V.append(box(n + '_door', (bx, cy, 1.05), (0.06, 1.1, 2.1), 'wood', C(['#6a4a3a', '#4f5f5a', '#7a5a42'][len(n) % 3])))
        V.append(box(n + '_lintel', (cx, cy, 2.75), (x1 - x0 + 0.3, y1 - y0 + 0.5, 0.3), 'stone', C(STONE)))
        V.append(box(n + '_step', (cx, cy, 0.04), (x1 - x0, y1 - y0, 0.08), 'stone', C(STONE_D)))

    # ---------------------------------------------------------------- the gateway and the two arches
    for sx in (-1, 1):
        V.append(box('gw_post%d' % sx, (sx * 3.2, 44.2, 2.4), (0.6, 0.6, 4.8), 'stone', C(STONE)))
    V.append(box('gw_beam', (0, 44.2, 4.9), (7.4, 0.7, 0.5), 'wood', C(TIMBER_D)))
    V.append(box('gw_roof', (0, 44.2, 5.3), (8.2, 1.4, 0.2), 'roof', C(TILE)))
    for i, yy in enumerate((52.0, 58.0)):  # the fog street beyond, fading away (the Quiet District's end of it)
        for sx in (-1, 1):
            V.append(box('fogh%d%d' % (i, sx), (sx * 5.5, yy, 2.6), (1.0, 5.2, 5.2), 'plain', C('#bfb8aa')))
    for name, x in (('court_arch', -4), ('garden_gate', 4)):
        V.append(box(name + '_top', (x, 38.5, 2.95), (2.4, 3.6, 0.5), 'plain', C('#e6dfd0')))
        V.append(box(name + '_cap', (x, 38.5, 3.3), (2.7, 3.9, 0.18), 'roof', C(TILE)))

    # ---------------------------------------------------------------- the back garden (Chapter 4 begins here)
    V.append(box('g_porch', (17.6, 37, 0.12), (2.6, 5.0, 0.24), 'wood', C('#8a7058')))
    V.append(box('g_house', (19.6, 37, 2.6), (1.0, 6.0, 5.2), 'plain', C('#d9c9b3')))
    V.append(box('g_door', (19.07, 37, 1.3), (0.06, 1.1, 2.1), 'wood', C('#6a4a3a')))
    V.append(box('g_win', (19.07, 39, 1.6), (0.06, 0.9, 0.8), 'glow', C('#f6c070')))
    V.append(box('g_roof', (17.7, 37, 3.05), (3.4, 6.0, 0.14), 'roof', C(TILE), rot=(0, 10, 0)))
    for sy in (-1, 1):
        V.append(tube('g_ppost%d' % sy, (16.5, 37 + sy * 2.4, 0.2), (16.5, 37 + sy * 2.4, 2.9), 0.07, 0.07, 'wood', C(TIMBER_D), segs=6, rings=1))
    K.append(col('g_porch', (17.6, 37, 0.12), (2.6, 5.0, 0.24)))
    # a stone bench, clay pots, bare vegetable beds, a wheelbarrow tipped on its side
    V.append(box('g_bench', (8.0, 42.6, 0.4), (2.0, 0.5, 0.12), 'stone', C(STONE)))
    for sx in (-1, 1):
        V.append(box('g_bleg%d' % sx, (8.0 + sx * 0.8, 42.6, 0.2), (0.2, 0.44, 0.4), 'stone', C(STONE_D)))
    K.append(col('g_bench', (8.0, 42.6, 0.23), (2.0, 0.5, 0.46)))
    for i, (bx, by) in enumerate(((8.5, 33.5), (8.5, 36.5), (12.5, 41.0))):
        V.append(box('g_bed%d' % i, (bx, by, 0.1), (3.2, 1.6, 0.2), 'plain', C('#6f6352')))
        V.append(box('g_bedrim%d' % i, (bx, by, 0.12), (3.4, 1.8, 0.16), 'wood', C('#7a6450')))
        for k in range(5):
            V.append(cone('g_stalk%d%d' % (i, k), (bx - 1.2 + k * 0.6, by, 0.2), (bx - 1.2 + k * 0.6 + 0.1, by + 0.1, 0.62), 0.03, 0.005, 'paper', C('#8f9070'), segs=3))
        K.append(col('g_bed%d' % i, (bx, by, 0.1), (3.4, 1.8, 0.2)))
    for i, (px, py) in enumerate(((6.0, 31.2), (6.9, 31.0), (18.0, 31.2), (15.6, 43.2))):
        V.append(tube('g_pot%d' % i, (px, py, 0), (px, py, 0.5 + (i % 2) * 0.15), 0.24, 0.3, 'stone', C('#9a6a4a'), segs=8, rings=1))
        K.append(col('g_pot%d' % i, (px, py, 0.3), (0.6, 0.6, 0.6)))
    # the garden's still-lit lantern on the porch: a warm spot
    V += build_market.lantern('g_lan', (16.5, 34.6, 2.3), 0.16, '#ffb45c')
    light((16.5, 34.6, 2.3), '#ffb45c', 5.0, 1.0, 1.1, 'warm')
    area('AREA_warm_1', (16.3, 36.2, 1), (2.6, 2.8, 1.5))

    # ---------------------------------------------------------------- laundry alley: sheets on lines, baskets, a cart
    sheets = ['#e6eef2', '#f2d9c4', '#cfe0c8', '#f4e7b0', '#d9cde8', '#e8e2f0']
    for i, yy in enumerate((27.5, 24.5, 20.0, 17.5, 13.0, 8.0)):
        # (well above her head: the camera follows a little above and behind it)
        V.append(tube('ln%d' % i, (9.9, yy, 4.1), (14.1, yy, 4.1 - (i % 2) * 0.15), 0.012, 0.012, 'wood', C('#d8cdb8'), segs=3, rings=1, caps=False))
        for k in range(3):
            xx = 10.8 + k * 1.2 + (i % 2) * 0.3
            hh = 0.7 + ((i + k) % 3) * 0.2
            V.append(box('sh%d%d' % (i, k), (xx, yy, 4.03 - hh / 2), (0.8 + (k % 2) * 0.25, 0.03, hh), 'cloth', C(sheets[(i + k) % 6]), rot=(0, 0, (k - 1) * 3)))
    for i, (bx, by) in enumerate(((10.6, 25.6), (13.4, 19.0), (10.7, 12.2), (13.3, 7.2))):
        V.append(tube('bk%d' % i, (bx, by, 0), (bx, by, 0.42), 0.28, 0.34, 'cloth', C('#c9a26a'), segs=10, rings=1))
        V.append(ellipsoid('bkl%d' % i, (bx, by, 0.42), (0.28, 0.28, 0.12), 'cloth', C(sheets[i]), (8, 4)))
        K.append(col('bk%d' % i, (bx, by, 0.25), (0.6, 0.6, 0.5)))

    def cart(tag, cx, cy, rot=0.0):
        """A handcart loaded with crates: as wide as she is tall, so there's shelter behind it."""
        a = math.radians(rot)
        P = lambda lx, ly, lz: (cx + lx * math.cos(a) - ly * math.sin(a), cy + lx * math.sin(a) + ly * math.cos(a), lz)
        V.append(box(tag + '_bed', P(0, 0, 0.55), (1.9, 1.1, 0.12), 'wood', C('#8a6a4a'), rot=(0, 0, rot)))
        V.append(box(tag + '_load', P(0, 0, 0.98), (1.7, 0.95, 0.75), 'wood', C('#a8845a'), rot=(0, 0, rot), noise=0.05))
        V.append(box(tag + '_tarp', P(0, 0, 1.38), (1.8, 1.05, 0.06), 'cloth', C('#8f9a8a'), rot=(0, 0, rot)))
        for s in (-1, 1):
            V.append(tube(tag + '_wh%d' % s, P(0.2, s * 0.6, 0.38), P(0.2, s * 0.68, 0.38), 0.38, 0.38, 'wood', C('#5a4638'), segs=10, rings=1))
            V.append(tube(tag + '_sh%d' % s, P(-0.95, s * 0.45, 0.55), P(-1.9, s * 0.45, 0.2), 0.035, 0.035, 'wood', C('#6b5a48'), segs=4, rings=1))
        K.append(col(tag, P(0, 0, 0.72), (1.9, 1.15, 1.44), rot=(0, 0, rot)))

    cart('cart1', 13.2, 18.0, 90)
    cart('cart2', -13.0, 13.2, 90)
    cart('cart3', -15.2, -12.0, 90)

    # ---------------------------------------------------------------- the pump yard
    V.append(tube('pump', (15.5, 3.5, 0), (15.5, 3.5, 1.1), 0.12, 0.1, 'stone', C('#3f6f4f'), segs=8, rings=1))
    V.append(tube('pump_arm', (15.5, 3.5, 1.0), (14.7, 3.5, 1.35), 0.035, 0.03, 'stone', C('#2f4f3a'), segs=5, rings=1))
    V.append(tube('pump_spout', (15.5, 3.5, 0.8), (15.5, 3.0, 0.7), 0.05, 0.04, 'stone', C('#3f6f4f'), segs=6, rings=1))
    V.append(box('trough', (15.5, 2.6, 0.25), (1.4, 0.7, 0.5), 'stone', C(STONE_D), bevel=0.03))
    K.append(col('pump', (15.5, 3.1, 0.5), (1.4, 1.5, 1.0)))
    V += build_market.lantern('p_lan', (9.2, 5.4, 2.4), 0.16, '#ffb45c')
    V.append(tube('p_hook', (8.6, 5.4, 2.7), (9.2, 5.4, 2.7), 0.015, 0.015, 'wood', C('#3a2e28'), segs=4, rings=1))
    light((9.2, 5.4, 2.4), '#ffb45c', 5.0, 1.0, 1.1, 'warm')
    area('AREA_warm_2', (10.0, 4.4, 1), (2.2, 1.6, 1.5))
    place('bench_m', (16.6, 0.2, 0), rot=180)
    marker('SEAT_1', (16.6, 0.38, 0), rot=180, seat=0.42)

    # ---------------------------------------------------------------- Lantern-makers' Row: frames hung up to dry
    for i in range(6):
        xx = -8.0 + i * 3.0
        V.append(tube('lf_rod%d' % i, (xx, 0.25, 3.0), (xx, 3.75, 3.0), 0.015, 0.015, 'wood', C('#6b5a48'), segs=3, rings=1, caps=False))
        for k in range(2):
            yy, zz, r = 1.2 + k * 1.6 - (i % 2) * 0.3, 2.7 - (k % 2) * 0.1, 0.15 + ((i + k) % 3) * 0.03
            V.append(ellipsoid('lf%d%d' % (i, k), (xx, yy, zz), (r, r, r * 1.25), 'paper', C('#bdb3a2'), (6, 3), smooth=False))
            V.append(cone('lft%d%d' % (i, k), (xx, yy, zz - r * 1.25), (xx, yy, zz - r * 2.3), r * 0.1, r * 0.02, 'cloth', C('#9a8a6a'), segs=3))
    for i, (xx, yy) in enumerate(((5.5, 0.7), (-2.5, 3.3), (-7.6, 0.6))):
        place('crate', (xx, yy, 0), rot=i * 25)

    # ---------------------------------------------------------------- the persimmon courtyard, behind the kitchen
    tx, ty = -12.5, 35.0
    bark = C('#5a463a')
    V.append(tube('pt_trunk', (tx, ty, 0), (tx + 0.15, ty, 2.2), 0.3, 0.2, 'wood', bark, segs=7, rings=2))
    limbs = [((0.15, 0, 2.1), (1.8, 0.6, 3.6)), ((0.15, 0, 2.1), (-1.6, 0.9, 3.9)), ((0.15, 0, 2.0), (0.2, -1.7, 3.5)),
             ((0.15, 0, 2.2), (-0.6, -0.5, 4.4)), ((1.8, 0.6, 3.6), (2.9, 0.2, 4.2)), ((1.8, 0.6, 3.6), (1.7, 1.8, 4.3)),
             ((-1.6, 0.9, 3.9), (-2.7, 0.6, 4.5)), ((-1.6, 0.9, 3.9), (-1.2, 2.1, 4.6)), ((0.2, -1.7, 3.5), (1.1, -2.6, 4.1)),
             ((0.2, -1.7, 3.5), (-0.9, -2.5, 4.2)), ((-0.6, -0.5, 4.4), (-0.4, 0.3, 5.3))]
    for i, (p, q) in enumerate(limbs):
        V.append(tube('pt_l%d' % i, (tx + p[0], ty + p[1], p[2]), (tx + q[0], ty + q[1], q[2]), 0.13 if i < 4 else 0.07, 0.07 if i < 4 else 0.03, 'wood', bark, segs=5, rings=1))
    for i in range(16):  # persimmons: the last colour left in the courtyard
        p, q = limbs[4 + i % 7]
        t = 0.45 + rnd.random() * 0.55
        fx, fy, fz = tx + p[0] + (q[0] - p[0]) * t, ty + p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t
        V.append(ellipsoid('pt_f%d' % i, (fx + rnd.uniform(-0.15, 0.15), fy + rnd.uniform(-0.15, 0.15), fz - 0.16), (0.11, 0.11, 0.095), 'paper', C('#e8772e'), (5, 3)))
    K.append(col('pt_trunk', (tx + 0.07, ty, 1.2), (0.6, 0.6, 2.4)))
    marker('POINT_persimmon', (tx, ty, 0))
    # the back of Grandmother's kitchen (north side): its back door and a lit window, a water jar, a step
    V.append(box('kb_wall', (-12.5, 42.75, 2.6), (15.6, 1.0, 5.2), 'plain', C('#d9c9b0')))
    V.append(box('kb_door', (-10.0, 42.22, 1.05), (1.0, 0.06, 2.1), 'glow', C('#f0a854')))
    V.append(box('kb_frame', (-10.0, 42.2, 1.1), (1.2, 0.05, 2.3), 'wood', C(TIMBER)))
    V.append(box('kb_win', (-13.0, 42.22, 1.6), (1.3, 0.06, 0.8), 'glow', C('#f6c070')))
    V.append(box('kb_sill', (-13.0, 42.15, 1.15), (1.5, 0.2, 0.08), 'wood', C(TIMBER_D)))
    V.append(box('kb_step', (-10.0, 41.6, 0.1), (1.6, 0.8, 0.2), 'stone', C(STONE)))
    V.append(box('kb_roof', (-12.5, 42.1, 5.35), (16.2, 2.2, 0.16), 'roof', C(TILE), rot=(14, 0, 0)))
    V.append(box('kb_eave', (-12.5, 41.4, 2.75), (4.2, 1.5, 0.1), 'roof', C(TILE), rot=(14, 0, 0)))
    V.append(tube('kb_jar', (-7.2, 41.2, 0), (-7.2, 41.2, 0.9), 0.3, 0.42, 'stone', C('#7a6a5a'), segs=10, rings=2, bulge=0.06))
    K.append(col('kb_jar', (-7.2, 41.2, 0.45), (0.9, 0.9, 0.9)))
    K.append(col('kb_step', (-10.0, 41.6, 0.1), (1.6, 0.8, 0.2)))
    light((-10.0, 41.4, 2.2), '#ffb45c', 6.0, 1.1, 1.2, 'warm')
    area('AREA_warm_3', (-10.6, 39.6, 1), (3.6, 2.4, 1.5))
    # a stone table and stools under the tree, a low well
    V.append(tube('ct_table', (-16.5, 31.5, 0), (-16.5, 31.5, 0.7), 0.25, 0.2, 'stone', C(STONE_D), segs=8, rings=1))
    V.append(tube('ct_top', (-16.5, 31.5, 0.7), (-16.5, 31.5, 0.8), 0.75, 0.75, 'stone', C(STONE), segs=12, rings=1))
    K.append(col('ct_table', (-16.5, 31.5, 0.4), (1.3, 1.3, 0.8)))
    for i, (sx, sy) in enumerate(((-17.6, 31.5), (-15.4, 31.5), (-16.5, 32.6))):
        place('stool', (sx, sy, 0))
    marker('SEAT_2', (-16.5, 32.42, 0), rot=0, seat=0.42)
    V.append(tube('well', (-7.5, 30.5, 0), (-7.5, 30.5, 0.65), 0.8, 0.85, 'stone', C(STONE), segs=12, rings=1))
    V.append(tube('well_in', (-7.5, 30.5, 0.3), (-7.5, 30.5, 0.67), 0.62, 0.62, 'stone', C('#3a3834'), segs=12, rings=1, caps=False))
    K.append(col('well', (-7.5, 30.5, 0.4), (1.7, 1.7, 0.8)))
    marker('POINT_secret', (-12.0, 33.0, 0), rot=180)   # the memory you walk through starts here, facing the kitchen
    marker('CAM_court', (-17.5, 30.2, 2.6))

    # ---------------------------------------------------------------- the long street: dead lanterns overhead
    for i, yy in enumerate((24.0, 16.5, 9.0, -3.5, -11.0, -18.0)):
        place('dead_string', (-14, yy, 0), mem='after')
    place('dead_post', (-12.6, 3.0, 0), rot=180, mem='after')
    place('dead_post', (-15.4, -22.0, 0), rot=0, mem='after')
    for i, (xx, yy) in enumerate(((-15.5, 19.2), (-12.5, 6.0), (-15.5, -10.0), (-12.5, -3.2))):
        place('planter', (xx, yy, 0))
    # Thread Street's three places for a stitch: a doorbell, a letterbox, a window with a paper lantern in it
    V.append(box('bell_plate', (-15.96, -7.6, 1.35), (0.04, 0.22, 0.3), 'wood', C(TIMBER_D)))
    V.append(tube('bell', (-15.9, -7.6, 1.4), (-15.9, -7.6, 1.22), 0.03, 0.09, 'stone', C('#c9a85a'), segs=8, rings=1))
    V.append(box('lbox', (-12.12, -14.2, 1.15), (0.22, 0.5, 0.65), 'stone', C('#3f6f4f')))
    V.append(box('lbox_slot', (-12.24, -14.2, 1.3), (0.02, 0.3, 0.05), 'stone', C('#1f2f25')))
    V.append(box('lwin', (-15.96, -20.0, 1.7), (0.05, 1.0, 0.9), 'wood', C(TIMBER_D)))
    V += dead_lantern('lwin_lan', (-15.8, -20.0, 1.7), 0.17)

    # ---------------------------------------------------------------- the crossroads
    place('bench_m', (-20.0, -26.6, 0), rot=180)
    marker('SEAT_3', (-20.0, -26.42, 0), rot=180, seat=0.42)
    place('bench_m', (-7.0, -26.6, 0), rot=180)
    marker('SEAT_4', (-7.0, -26.42, 0), rot=180, seat=0.42)
    place('dead_post', (-24.5, -21.6, 0), rot=-90, mem='after')
    place('dead_post', (-3.4, -21.6, 0), rot=90, mem='after')
    for i, (xx, yy) in enumerate(((-23.0, -26.3), (-4.6, -26.2))):
        place('crate', (xx, yy, 0), rot=i * 40)

    # ---------------------------------------------------------------- the square
    SQ = (-14.0, -49.0)            # its centre
    FOUNT = (-14.0, -46.5)         # the dry fountain: the Domain's centre, and its hearth
    OVEN = (-3.5, -37.5)           # the street oven (north-east corner)
    POSTS = [(-25.0, -41.0), (-20.0, -37.5), (-8.0, -37.5), (-3.0, -44.0), (-25.5, -49.5), (-2.5, -50.5)]
    # the dry fountain: a wide stone basin, a pillar with a cracked bowl
    # (tube()'s caps are domed, so the basin is a wall, a rim and a flat bed: the runtime fills it with water
    # at 0.56 once the fountain runs again)
    V.append(tube('fount', (FOUNT[0], FOUNT[1], 0), (FOUNT[0], FOUNT[1], 0.6), 1.74, 1.66, 'stone', C(STONE), segs=16, rings=1, caps=False, smooth=False))
    V.append(torus('fount_rim', (FOUNT[0], FOUNT[1], 0.6), 1.57, 0.12, 'stone', C(STONE_D), (16, 5), scale=(1, 1, 0.6)))
    V.append(disc('fount_bed', (FOUNT[0], FOUNT[1], 0.5), 1.5, 'stone', C('#5e5a54'), (0, 0, 1), 16))
    V.append(tube('fount_col', (FOUNT[0], FOUNT[1], 0.25), (FOUNT[0], FOUNT[1], 1.5), 0.22, 0.16, 'stone', C(STONE_D), segs=8, rings=1))
    V.append(ellipsoid('fount_bowl', (FOUNT[0], FOUNT[1], 1.6), (0.7, 0.7, 0.3), 'stone', C(STONE), (12, 6), cut=lambda co: co.z > 0.2))
    K.append(col('fount', (FOUNT[0], FOUNT[1], 0.8), (3.0, 3.0, 1.6)))
    K.append(col('fount2', (FOUNT[0], FOUNT[1], 0.8), (2.4, 2.4, 1.6), rot=(0, 0, 45)))
    # the street oven: a brick dome on a plinth, an iron door, a chimney, a stack of firewood, a work table
    ox, oy = OVEN
    V.append(box('oven_base', (ox, oy, 0.5), (2.4, 2.0, 1.0), 'stone', C('#a8846a'), bevel=0.04))
    V.append(ellipsoid('oven_dome', (ox, oy, 1.0), (1.1, 0.95, 0.95), 'stone', C('#b8765a'), (12, 6), cut=lambda co: co.z < -0.05))
    V.append(box('oven_mouth', (ox - 0.3, oy - 0.93, 1.3), (0.6, 0.06, 0.45), 'stone', C('#2e2a28')))
    V.append(tube('oven_chim', (ox + 0.6, oy + 0.4, 1.6), (ox + 0.6, oy + 0.4, 3.0), 0.18, 0.15, 'stone', C('#8a5a46'), segs=8, rings=1))
    K.append(col('oven', (ox, oy, 1.0), (2.4, 2.0, 2.0)))
    for i in range(6):
        V.append(tube('wood%d' % i, (ox + 1.5, oy - 0.6 + (i % 3) * 0.22, 0.12 + (i // 3) * 0.2), (ox + 2.2, oy - 0.6 + (i % 3) * 0.22, 0.12 + (i // 3) * 0.2), 0.1, 0.1, 'wood', C('#8a6a4a'), segs=6, rings=1))
    V.append(box('otable', (ox - 2.4, oy - 0.2, 0.8), (1.8, 0.9, 0.08), 'wood', C('#9c7a54')))
    for sx in (-1, 1):
        V.append(box('otleg%d' % sx, (ox - 2.4 + sx * 0.75, oy - 0.2, 0.4), (0.1, 0.8, 0.8), 'wood', C('#6b5440')))
    K.append(col('otable', (ox - 2.4, oy - 0.2, 0.42), (1.8, 0.9, 0.84)))
    marker('POINT_oven', (ox - 0.9, oy - 1.9, 0), rot=180)       # where Sunny bakes (she faces the oven)
    marker('CAM_oven', (ox - 5.0, oy - 5.6, 2.4))
    # six stone lantern posts on broad plinths (shelter from a sigh, and where the Charm Sprites gather)
    species = ['cloud', 'sock', 'homework', 'pompom', 'sparrow', 'grey']
    for i, (px, py) in enumerate(POSTS):
        V.append(box('lp_base%d' % i, (px, py, 0.5), (1.2, 1.2, 1.0), 'stone', C(STONE_D), bevel=0.04))
        V.append(box('lp_shaft%d' % i, (px, py, 1.5), (0.5, 0.5, 1.0), 'stone', C(STONE)))
        V.append(box('lp_lamp%d' % i, (px, py, 2.25), (0.7, 0.7, 0.5), 'paper', C('#bdb3a2')))
        V.append(cone('lp_roof%d' % i, (px, py, 2.5), (px, py, 3.0), 0.75, 0.08, 'roof', C(TILE), segs=4))
        K.append(col('lp%d' % i, (px, py, 1.25), (1.2, 1.2, 2.5)))
        light((px, py, 2.25), '#ffc46b', 6.0, 1.0, 1.2, 'after')
        marker('POINT_post_' + species[i], (px, py, 0))
    # where each kind's patch on the Great Sulk dangles its loose end (round the front of its hem)
    SULK = (-14.0, -58.0)
    for i, sp in enumerate(species):
        a = math.radians(-65 + i * 26)   # an arc across its front (north side)
        marker('POINT_patch_' + sp, (SULK[0] + math.sin(a) * 8.2, SULK[1] + math.cos(a) * 8.2, 0), rot=0)
    marker('POINT_sulk', (SULK[0], SULK[1], 0), rot=180)
    marker('POINT_sigh', (SULK[0], SULK[1] + 2.0, 0))
    marker('POINT_bo', (-15.6, -50.2, 0), rot=0)                  # Bo holds Honk up to it here
    marker('POINT_fang', (-14.0, -42.5, 0), rot=0)                # Master Fang opens her Domain from here
    marker('POINT_domain', (FOUNT[0], FOUNT[1], 0))
    marker('POINT_bell', (-22.0, -41.6, 0), rot=90)
    marker('POINT_tuck', (-14.0, -51.0, 0), rot=0)                # tucking the Great Sulk in
    marker('CAM_square', (-14.0, -31.0, 3.4))
    marker('CAM_sulk', (-9.0, -38.0, 2.2))
    marker('CAM_bo', (-10.2, -47.8, 1.9))
    marker('CAM_domain', (-6.0, -36.0, 4.6))
    marker('CAM_blanket', (-14.0, -36.5, 5.5))
    marker('CAM_dawn', (-4.0, -40.0, 7.5))
    area('AREA_square', (SQ[0], SQ[1], 2), (16, 16, 4))
    for i, (xx, yy, r) in enumerate(((-28.4, -40.0, 90), (-28.4, -52.0, 90), (0.4, -56.0, -90))):
        place('bench_m', (xx, yy, 0), rot=r)

    meshes = join_mixed(V, 'heart')
    bake_ao(meshes, occluders=meshes + [terrain], dist=0.9, samples=10, strength=0.4)

    # ---------------------------------------------------------------- Grandmother's Kitchen (the Domain's set)
    D = []
    dx, dy = FOUNT
    R = 17.0
    # floorboards: a disc of planks
    n = 22
    for i in range(n):
        yy = dy - R + (i + 0.5) * 2 * R / n
        half = math.sqrt(max(0.0, R * R - (yy - dy) ** 2))
        if half < 0.5:
            continue
        D.append(box('kf%d' % i, (dx, yy, 0.03), (half * 2, 2 * R / n - 0.04, 0.06), 'wood', C(['#b08a62', '#a67f58', '#b8926a'][i % 3]), noise=0.04))
    # the hearth and the great pot, where the fountain was
    D.append(tube('hearth', (dx, dy, 0.05), (dx, dy, 0.8), 1.7, 1.6, 'stone', C('#b86a4a'), segs=16, rings=1))
    D.append(tube('hearth_top', (dx, dy, 0.8), (dx, dy, 0.9), 1.75, 1.75, 'stone', C('#8a4a36'), segs=16, rings=1))
    for k in range(4):
        a = math.radians(45 + k * 90)
        D.append(box('fire%d' % k, (dx + math.cos(a) * 1.62, dy + math.sin(a) * 1.62, 0.35), (0.5, 0.06, 0.34), 'glow', C('#f0892e'), rot=(0, 0, math.degrees(a) + 90)))
    D.append(ellipsoid('pot', (dx, dy, 1.5), (1.15, 1.15, 0.85), 'stone', C('#3a3632'), (14, 7), cut=lambda co: co.z > 0.55))
    D.append(torus('pot_rim', (dx, dy, 1.97), 0.97, 0.07, 'stone', C('#4a4640'), (16, 5)))
    D.append(tube('pot_soup', (dx, dy, 1.86), (dx, dy, 1.88), 0.93, 0.93, 'plain', C('#e8c88a'), segs=14, rings=1))
    D.append(tube('ladle', (dx + 0.5, dy + 0.3, 1.86), (dx + 1.25, dy + 0.75, 2.75), 0.035, 0.03, 'wood', C('#8a6a4a'), segs=5, rings=1))
    # the cupboard, where the street oven was: shelves of jars and bowls
    D.append(box('cup', (ox, oy, 1.3), (2.4, 2.0, 2.6), 'wood', C('#7a5236')))
    for r in range(3):
        zz = 0.75 + r * 0.75
        D.append(box('cup_sh%d' % r, (ox, oy - 1.02, zz), (2.2, 0.06, 0.06), 'wood', C('#9c6a44')))
        for k in range(5):
            D.append(tube('jar%d%d' % (r, k), (ox - 0.85 + k * 0.42, oy - 1.08, zz + 0.04), (ox - 0.85 + k * 0.42, oy - 1.08, zz + 0.3 + (k % 2) * 0.1), 0.11, 0.1, 'stone',
                          C(['#e8dcc0', '#b5483a', '#6e8b5a', '#d9a441', '#3e6f8a'][(r + k) % 5]), segs=5, rings=1))
    # pillars with hanging lamps, where the lantern posts were
    for i, (px, py) in enumerate(POSTS):
        D.append(box('kp_base%d' % i, (px, py, 0.5), (1.2, 1.2, 1.0), 'wood', C('#7a5236'), bevel=0.04))
        D.append(box('kp%d' % i, (px, py, 2.4), (0.5, 0.5, 2.8), 'wood', C(TIMBER)))
        D.append(box('kp_arm%d' % i, (px, py, 3.7), (1.6, 0.14, 0.14), 'wood', C(TIMBER_D), rot=(0, 0, 45 + i * 30)))
        D += build_market.lantern('kp_lan%d' % i, (px + 0.5 * math.cos(math.radians(45 + i * 30)), py + 0.5 * math.sin(math.radians(45 + i * 30)), 3.25), 0.2, '#ffb45c')
    # the long table, with room for everyone (its collision is added when the Domain opens). It is a mesh of its
    # own: the table stays in the square after the story, when the rest of the kitchen has gone
    T = []
    TX, TY, TL = -14.0, -40.2, 11.0
    T.append(box('table', (TX, TY, 0.76), (TL, 1.5, 0.1), 'wood', C('#9c6a44'), noise=0.03))
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            T.append(box('tleg%d%d' % (sx, sy), (TX + sx * (TL / 2 - 0.3), TY + sy * 0.55, 0.38), (0.14, 0.14, 0.76), 'wood', C('#6b4430')))
    for sy in (-1, 1):
        T.append(box('tbench%d' % sy, (TX, TY + sy * 1.25, 0.42), (TL - 0.6, 0.4, 0.07), 'wood', C('#8a5a3c')))
        for sx in (-1, 0, 1):
            T.append(box('tbl%d%d' % (sy, sx), (TX + sx * (TL / 2 - 0.6), TY + sy * 1.25, 0.2), (0.1, 0.34, 0.4), 'wood', C('#5a3d2a')))
    for k in range(10):  # a bowl at every place, steamers down the middle
        for sy in (-1, 1):
            bx = TX - 4.5 + k * 1.0
            T.append(ellipsoid('bowl%d%d' % (k, sy), (bx, TY + sy * 0.42, 0.87), (0.17, 0.17, 0.1), 'stone', C(['#f2ede2', '#dfe8e4', '#f4e7d0'][k % 3]), (6, 3), cut=lambda co: co.z > 0.3))
    for k in range(4):
        T.append(tube('steamer%d' % k, (TX - 3.6 + k * 2.4, TY, 0.81), (TX - 3.6 + k * 2.4, TY, 1.05), 0.34, 0.34, 'wood', C('#c9a26a'), segs=12, rings=2))
        T.append(ellipsoid('slid%d' % k, (TX - 3.6 + k * 2.4, TY, 1.05), (0.34, 0.34, 0.09), 'wood', C('#b08850'), (10, 4)))
    for k in range(3):
        T.append(ellipsoid('teapot%d' % k, (TX - 2.4 + k * 2.4, TY + 0.05, 0.94), (0.16, 0.16, 0.13), 'stone', C(['#6e8b5a', '#b5483a', '#e8dcc0'][k]), (8, 5)))
    for k in range(10):
        for sy in (-1, 1):
            # the seat's front edge is the side of the bench toward the table
            marker('SEAT_table_%d' % (k * 2 + (1 if sy > 0 else 0) + 1), (TX - 4.5 + k * 1.0, TY + sy * 1.07, 0), rot=0 if sy > 0 else 180, seat=0.46)
    # the kitchen's walls, round the north half of the circle (it's open toward the Great Sulk): panels with
    # a lattice window between timber posts, shelves, hanging pots, a dinner bell
    for i in range(11):
        a = math.radians(-10 + i * 20)
        wx, wy = dx + math.cos(a) * (R - 0.4), dy + math.sin(a) * (R - 0.4)
        rot = math.degrees(a) + 90
        if abs(wx - (-14)) < 2.6 and wy > -34:   # the way in from the street stays open
            continue
        D.append(box('kw%d' % i, (wx, wy, 2.3), (6.1, 0.3, 4.6), 'plain', C('#ecdcc0'), rot=(0, 0, rot)))
        D.append(box('kw_rail%d' % i, (wx, wy, 1.0), (6.15, 0.36, 0.14), 'wood', C(TIMBER), rot=(0, 0, rot)))
        D.append(box('kw_top%d' % i, (wx, wy, 4.7), (6.3, 0.5, 0.24), 'wood', C(TIMBER_D), rot=(0, 0, rot)))
        ix, iy = dx + math.cos(a) * (R - 0.62), dy + math.sin(a) * (R - 0.62)
        if i % 2 == 0:
            D.append(box('kwin%d' % i, (ix, iy, 2.6), (2.2, 0.06, 1.5), 'glow', C('#f6cf82'), rot=(0, 0, rot)))
            for k in range(3):
                D.append(box('kwl%d%d' % (i, k), (ix - math.cos(a) * 0.04, iy - math.sin(a) * 0.04, 2.6), (0.06, 0.04, 1.5), 'wood', C('#3f271d'), rot=(0, 0, rot)))
        else:
            for k in range(3):
                t = (k - 1) * 1.5
                hx, hy = ix - math.sin(a) * t - math.cos(a) * 0.2, iy + math.cos(a) * t - math.sin(a) * 0.2
                D.append(ellipsoid('kpan%d%d' % (i, k), (hx, hy, 2.5 - (k % 2) * 0.3), (0.3, 0.3, 0.16), 'stone', C(['#3a3632', '#8a5a3c', '#4a4640'][k]), (8, 4), cut=lambda co: co.z > 0.3))
    D.append(tube('bell_post', (-22.6, -41.6, 0), (-22.6, -41.6, 2.6), 0.09, 0.07, 'wood', C(TIMBER_D), segs=6, rings=1))
    D.append(tube('bell_arm', (-22.6, -41.6, 2.5), (-21.9, -41.6, 2.5), 0.04, 0.04, 'wood', C(TIMBER_D), segs=5, rings=1))
    D.append(tube('dbell', (-21.9, -41.6, 2.4), (-21.9, -41.6, 2.0), 0.06, 0.24, 'stone', C('#c9a85a'), segs=10, rings=2))
    kitchen = join_mixed(D, 'DOMAIN_kitchen')
    table = join_mixed(T, 'DOMAIN_table')
    bake_ao(kitchen + table, occluders=kitchen + table, dist=0.7, samples=8, strength=0.35)

    join(K + B, 'COL_heart')

    # ---------------------------------------------------------------- markers
    marker('SPAWN_start', (0, 43.0, 0.05), rot=0)        # from the Quiet District, through the gateway
    marker('SPAWN_garden', (11.5, 39.0, 0.05), rot=0)    # where Pip finds herself alone (Chapter 4)
    marker('SPAWN_square', (-14.0, -31.0, 0.05), rot=0)
    marker('POINT_garden', (11.5, 37.5, 0))
    marker('CAM_garden', (8.2, 34.0, 1.9))
    area('TRIGGER_quiet', (0, 45.0, 1), (3.0, 0.9, 2))             # back through the gateway
    area('TRIGGER_gardengate', (4.2, 38.5, 1), (0.7, 1.5, 2))      # the garden's gate is stuck in Chapter 4
    area('TRIGGER_gap', (-11.0, 2.0, 1), (0.9, 1.0, 2))            # the one gap, where a grey Grumbling sits
    area('TRIGGER_south', (-14.0, -1.2, 1), (2.0, 1.0, 2))         # not that way, not yet (until the secret)
    area('TRIGGER_square', (-14.0, -31.2, 1), (2.0, 1.4, 2))       # into the square (Chapter 5 begins)
    marker('NPC_tangtang', (-20.0, -25.6, 0.0), rot=180, model='tangtang', anim='idle')
    marker('NPC_weibao', (-7.0, -25.6, 0.0), rot=180, model='weibao', anim='idle')
    marker('NPC_fang', (-14.0, -30.0, 0.0), rot=0, model='fang', anim='idle')
    marker('POINT_cross', (-14.0, -24.0, 0))
    marker('CAM_cross', (-14.0, -17.6, 3.0))
    # the sleepers of laundry alley (curled up under the sheets), and the one in the gap
    for i, (xx, yy) in enumerate(((11.0, 22.6), (13.0, 16.0), (11.2, 10.4))):
        marker('GRUMB_heavy_%d' % (i + 1), (xx, yy, 0), species='grey', asleep=1)
    marker('GRUMB_gap', (-11.0, 2.0, 0), species='grey', echo='I WAS A LANTERN NOBODY CAME TO BUY. HONK.')
    # Thread Street's three stitches, then the ones left for anyone who looks
    loose = {
        'bell': ((-13.2, -1.6), (-15.3, -7.6), '🔔', 'the doorbell nobody rang'),
        'letter': ((-15.0, -9.2), (-12.8, -14.2), '✉️', 'the letterbox'),
        'lantern': ((-12.9, -15.6), (-15.2, -20.0), '🏮', 'the window with the birthday lantern'),
        'shoe': ((13.3, 26.0), (9.3, 16.0), '👟', 'the doorstep it was left on'),
        'tea': ((16.8, 4.6), (1.5, 3.4), '🍵', 'the teashop door'),
        'toy': ((-15.3, 19.4), (-8.6, 30.6), '🪀', 'the well in the courtyard'),
        'key': ((-24.6, -24.0), (-3.4, -22.2), '🗝️', 'the door across the crossroads'),
    }
    for k, (a, b, icon, what) in loose.items():
        marker('POINT_loose_' + k, (a[0], a[1], 0), icon=icon, what=what)
        marker('POINT_anchor_' + k, (b[0], b[1], 0))
    return export_glb('heart.glb', [o for o in bpy.context.scene.objects])


if __name__ == '__main__':
    print('built', heart())
