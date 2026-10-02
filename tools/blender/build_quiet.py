# SPDX-License-Identifier: GPL-3.0-only
"""Chapter 3: the Quiet District, an old neighbourhood of shuttered shops across the harbour from the night
market. The runtime greys it out (src/render/materials.js uFade) except where a memory has been restored,
and a height fog thickens toward the fog wall at the south end (where the Great Sulk waits, Chapter 5).

Exports two files (run headless: blender -b -P tools/blender/build_quiet.py):
  assets-src/export/quiet_kit.glb  shuttered shopfronts (roll-down shutters, faded signboards, tong-lau
                                   balconies with laundry poles), narrow houses, dead lanterns and strings,
                                   benches, stools, bollards, crates, a moored sampan
  assets-src/export/quiet.glb      the ferry landing, the lane, the canal and its bridge, the thread-shop
                                   alley, the square with the old well and the teahouse, the fog street and
                                   the kitchen door, the far shore (the night market, still lit), the
                                   shutters that lift when a memory returns (SHUT_<memory>), and every marker
                                   the runtime reads (src/world/zones/quiet.js)

Coordinates: +Y is north (the harbour and the market across it), -Y south (the fog). Kit pieces follow
build_kit.py (an empty named after the piece, one 'mixed' mesh, COL_* colliders; front faces -Y).
Markers: POINT_mem_<id> (a memory spot; props sprite, radius), CAM_mem_<id>, GRUMB_grey_<n> (props echo),
LIGHT_* (a dead lantern; prop mem = the memory that relights it), SEAT_<n>, AREA_heart, TRIGGER_fogwall,
NPC_* (the ferryman and the residents who still live here), POINT_farlight_<n> (the market's lanterns).
"""
import os, sys, importlib, math, random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *
import build_kit

importlib.reload(build_kit)
from build_kit import piece, col_box, TIMBER, TIMBER_D, PLASTER, STONE, STONE_D, TILE
import build_market

importlib.reload(build_market)
from build_market import grid_terrain, bench_m, stool, bollard, boat, crate

C = srgb
DEAD = '#bdb3a2'      # an unlit paper lantern
SHUTTER = '#6f7a78'   # roll-down metal shutters
LIGHTS = {}           # piece -> [(x, y, z, color, radius, intensity, glow)] in the piece's frame


def dead_lantern(name, c, r=0.16):
    """An unlit paper lantern: faded paper body, dark caps, a limp tassel."""
    x, y, z = c
    h = r * 1.25
    return [ellipsoid(name, c, (r, r, h), 'paper', C(DEAD), (6, 4), smooth=False),
            tube(name + '_ct', (x, y, z + h * 0.82), (x, y, z + h * 1.05), r * 0.45, r * 0.4, 'wood', C('#3a2e28'), segs=5, rings=1, caps=False),
            tube(name + '_cb', (x, y, z - h * 1.02), (x, y, z - h * 0.8), r * 0.4, r * 0.45, 'wood', C('#3a2e28'), segs=5, rings=1, caps=False),
            cone(name + '_ts', (x, y, z - h * 1.02), (x, y, z - h * 1.02 - r * 1.1), r * 0.1, r * 0.02, 'cloth', C('#9a8a6a'), segs=3)]


# ---------------------------------------------------------------- kit pieces

def qshop(x, name, w=5.6, h=6.2, col='#d8d0c2', trim='#5e4a3c', sign='#8a6a52', shut=SHUTTER, balcony=True, cloth=('#b7a792', '#9aa7b0'),
          open=False, goods=('#e0662c', '#f6c56a', '#2f8a8f', '#f3e6d3')):
    """A two-storey tong-lau shopfront, shut: a roll-down shutter over the shop, a faded signboard with no
    words left on it, closed wooden window shutters upstairs, a balcony with a laundry pole, a dead lantern.
    open: the same shop on the morning after the story (the zone swaps the pieces): the shutter rolled up, a lit
    shop behind a counter with things on it, a bright awning, the signboard repainted, a window open upstairs,
    the lantern lit."""
    V, K = [], []
    V.append(box('wall', (0, 0.4, h / 2), (w, 0.8, h), 'plain', C(col), noise=0.03))
    V.append(box('plinth', (0, -0.02, 0.2), (w + 0.04, 0.1, 0.4), 'stone', C(STONE_D)))
    K.append(col_box('wall', (0, 0.45, h / 2), (w, 1.0, h)))
    for sx in (-1, 1):
        V.append(box('pil%d' % sx, (sx * (w / 2 - 0.15), -0.04, h / 2), (0.3, 0.12, h), 'stone', mix(C(col), (0.4, 0.38, 0.36), 0.25)))
    # the shutter, pulled all the way down: corrugated metal and its housing
    sw = w * 0.72
    if open:
        # rolled up under its housing; behind it the shop, lit, with a counter across the doorway
        V.append(box('shutter', (0, -0.04, 2.55), (sw, 0.06, 0.3), 'stone', C(shut)))
        V.append(box('rib0', (0, -0.075, 2.48), (sw, 0.02, 0.05), 'stone', mix(C(shut), (0, 0, 0), 0.25)))
        V.append(box('inside', (0, -0.015, 1.2), (sw, 0.03, 2.4), 'glow', C('#f2b261')))
        for i in range(2):  # shelves on the back wall, with jars and boxes
            V.append(box('shelf%d' % i, (0, -0.07, 1.45 + i * 0.5), (sw * 0.86, 0.1, 0.05), 'wood', C(trim)))
            for k in range(6):
                V.append(box('jar%d%d' % (i, k), (-sw * 0.36 + k * sw * 0.145, -0.08, 1.59 + i * 0.5), (0.2, 0.1, 0.22 - (k % 2) * 0.06), 'paper', C(goods[(i + k) % 4])))
        V.append(box('counter', (0, -0.3, 0.5), (sw * 0.82, 0.46, 1.0), 'wood', C(trim)))
        V.append(box('counter_top', (0, -0.32, 1.03), (sw * 0.86, 0.56, 0.06), 'wood', mix(C(sign), (1, 0.9, 0.7), 0.3)))
        K.append(col_box('counter', (0, -0.32, 0.55), (sw * 0.86, 0.6, 1.1)))
        for k in range(4):  # what is for sale, set out on the counter
            V.append(ellipsoid('ware%d' % k, (-sw * 0.3 + k * sw * 0.2, -0.36, 1.14), (0.15, 0.13, 0.1), 'paper', C(goods[k]), (6, 3), smooth=False))
        # a striped awning over it
        for k in range(6):
            V.append(box('awn%d' % k, (-sw * 0.5 + (k + 0.5) * (sw + 0.3) / 6 - 0.15, -0.62, 2.92), ((sw + 0.3) / 6, 1.0, 0.04), 'cloth',
                         C(goods[0] if k % 2 else goods[3]), rot=(-16, 0, 0)))
    else:
        V.append(box('shutter', (0, -0.04, 1.35), (sw, 0.06, 2.7), 'stone', C(shut)))
        for i in range(10):
            V.append(box('rib%d' % i, (0, -0.075, 0.18 + i * 0.26), (sw, 0.02, 0.05), 'stone', mix(C(shut), (0, 0, 0), 0.25)))
        V.append(box('lock', (0, -0.08, 0.1), (0.25, 0.04, 0.14), 'stone', C('#4a4a4a')))
    V.append(box('housing', (0, -0.14, 2.85), (sw + 0.16, 0.3, 0.32), 'stone', mix(C(shut), (0, 0, 0), 0.35)))
    # faded signboard: the words have long since weathered into pale shapes (repainted, on the open shop)
    V.append(box('sign', (0, -0.16, 3.4), (w * 0.72, 0.08, 0.62), 'wood', mix(C(sign), C(goods[0]), 0.35) if open else C(sign)))
    V.append(box('sign_rim', (0, -0.12, 3.4), (w * 0.72 + 0.14, 0.04, 0.74), 'wood', C(trim)))
    for k in (-1, 0, 1):
        V.append(box('glyph%d' % k, (k * 0.85, -0.205, 3.4), (0.42, 0.02, 0.34), 'wood', C('#fbf4e8') if open else mix(C(sign), (0.92, 0.9, 0.86), 0.35)))
    # upstairs: two windows behind closed wooden shutters (one of them thrown open, on the open shop)
    for sx in (-1, 1):
        cx = sx * w * 0.25
        V.append(box('win%d' % sx, (cx, -0.03, 4.9), (1.25, 0.06, 1.35), 'wood', C(trim)))
        thrown = open and sx > 0
        if thrown:
            V.append(box('pane%d' % sx, (cx, -0.065, 4.9), (1.1, 0.02, 1.2), 'glow', C('#ffd9a0')))
        for k in (-1, 1):
            leaf = (cx + k * 0.82, -0.2, 4.9) if thrown else (cx + k * 0.3, -0.07, 4.9)
            V.append(box('shut%d%d' % (sx, k), leaf, (0.56, 0.04, 1.22), 'wood', mix(C(sign), (0.3, 0.3, 0.3), 0.3), rot=(0, 0, -62 * k) if thrown else (0, 0, 0)))
            if thrown:
                continue
            for j in range(4):
                V.append(box('slat%d%d%d' % (sx, k, j), (cx + k * 0.3, -0.095, 4.45 + j * 0.3), (0.52, 0.02, 0.05), 'wood', C(trim)))
    if balcony:
        V.append(box('balc', (0, -0.55, 4.05), (w * 0.82, 1.1, 0.12), 'stone', C(STONE)))
        V.append(box('rail', (0, -1.07, 4.72), (w * 0.82, 0.06, 0.06), 'wood', C(trim)))
        for i in range(9):
            xx = -w * 0.39 + i * w * 0.0975
            V.append(box('bal%d' % i, (xx, -1.07, 4.4), (0.05, 0.05, 0.62), 'wood', C(trim)))
        V.append(tube('pole', (-w * 0.38, -1.05, 5.45), (w * 0.38, -1.05, 5.45), 0.02, 0.02, 'wood', C('#6b5a48'), segs=4, rings=1))
        for i, (xx, ww, c) in enumerate(((-1.3, 0.6, cloth[0]), (-0.3, 0.45, cloth[1]), (0.9, 0.7, cloth[0]))):
            V.append(box('cloth%d' % i, (xx, -1.05, 5.05), (ww, 0.02, 0.78), 'cloth', C(c)))
    else:
        V.append(box('eave', (0, -0.35, 3.95), (w + 0.2, 0.8, 0.08), 'roof', C(TILE), rot=(-12, 0, 0)))
    V.append(box('roofedge', (0, 0.1, h + 0.1), (w + 0.3, 1.0, 0.2), 'roof', C(TILE)))
    V.append(box('ridge', (0, 0.4, h + 0.3), (w + 0.3, 0.3, 0.2), 'roof', C('#3b4045')))
    if open:
        V += build_market.lantern('lan', (w * 0.43, -0.4, 2.35), 0.15, '#ff9a4a')
    else:
        V += dead_lantern('lan', (w * 0.43, -0.4, 2.35), 0.15)
    V.append(tube('lanhook', (w * 0.43, -0.4, 2.62), (w * 0.43, 0.0, 2.62), 0.015, 0.015, 'wood', C('#3a2e28'), segs=4, rings=1))
    LIGHTS[name] = [(w * 0.43, -0.4, 2.35, '#ffb45c', 4.2, 0.9, 0.9)]
    return piece(name, V, K, x)


def qhouse(x, name, w=4.2, h=5.4, col='#cfc6b6', trim='#55443a', open=False, flowers=('#e0662c', '#f6c56a', '#f3e6d3')):
    """A narrow house front: a plank door, a boarded-up window, a small tiled eave.
    open: the same house on the morning after the story: the boards are off the window, there is a light on
    behind it and a box of flowers under it, the door stands ajar, and the window upstairs is lit."""
    V, K = [], []
    V.append(box('wall', (0, 0.4, h / 2), (w, 0.8, h), 'plain', C(col), noise=0.03))
    V.append(box('plinth', (0, -0.02, 0.2), (w + 0.04, 0.1, 0.4), 'stone', C(STONE_D)))
    K.append(col_box('wall', (0, 0.45, h / 2), (w, 1.0, h)))
    if open:
        # ajar: the doorway lit from inside, the door swung a little way in on its hinge
        V.append(box('doorway', (-w * 0.22, -0.02, 1.05), (1.0, 0.03, 2.1), 'glow', C('#f2b261')))
        V.append(box('door', (-w * 0.22 - 0.16, -0.26, 1.05), (0.72, 0.06, 2.1), 'wood', mix(C(trim), (1, 0.8, 0.6), 0.2), rot=(0, 0, 58)))
    else:
        V.append(box('door', (-w * 0.22, -0.04, 1.05), (1.0, 0.06, 2.1), 'wood', C(trim)))
        for k in range(5):
            V.append(box('plank%d' % k, (-w * 0.22 - 0.4 + k * 0.2, -0.075, 1.05), (0.02, 0.02, 2.0), 'wood', mix(C(trim), (0, 0, 0), 0.3)))
    V.append(box('lintel', (-w * 0.22, -0.08, 2.18), (1.2, 0.1, 0.12), 'wood', C(TIMBER_D)))
    V.append(box('win', (w * 0.2, -0.03, 1.6), (1.1, 0.06, 1.0), 'wood', C(trim)))
    if open:
        V.append(box('winp', (w * 0.2, -0.065, 1.6), (0.95, 0.02, 0.85), 'glow', C('#ffd9a0')))
        V.append(box('wbar', (w * 0.2, -0.08, 1.6), (0.05, 0.02, 0.85), 'wood', C(trim)))
        V.append(box('fbox', (w * 0.2, -0.16, 1.02), (1.1, 0.22, 0.16), 'wood', C('#8a5a3c')))
        for k in range(5):
            V.append(ellipsoid('fl%d' % k, (w * 0.2 - 0.42 + k * 0.21, -0.17, 1.16 + (k % 2) * 0.03), (0.09, 0.09, 0.08), 'paper', C(flowers[k % 3]), (5, 3), smooth=False))
    else:
        for k, a in ((0, 30), (1, -30)):
            V.append(box('board%d' % k, (w * 0.2, -0.08, 1.6), (1.2, 0.03, 0.14), 'wood', C('#8a7458'), rot=(0, a, 0)))
    V.append(box('win2', (0, -0.03, 3.9), (1.3, 0.06, 1.1), 'wood', C(trim)))
    V.append(box('win2p', (0, -0.05, 3.9), (1.15, 0.03, 0.95), 'glow' if open else 'plain', C('#ffd9a0' if open else '#a89a82')))
    V.append(box('eave', (0, -0.3, 2.65), (w + 0.1, 0.6, 0.07), 'roof', C(TILE), rot=(-14, 0, 0)))
    V.append(box('roofedge', (0, 0.1, h + 0.1), (w + 0.3, 1.0, 0.2), 'roof', C(TILE)))
    return piece(name, V, K, x)


def dead_post(x, name='dead_post'):
    V = [tube('post', (0, 0, 0), (0, 0, 2.7), 0.07, 0.055, 'wood', C('#3a2e28'), segs=6, rings=1),
         box('base', (0, 0, 0.1), (0.3, 0.3, 0.2), 'stone', C(STONE_D)),
         tube('arm', (0, 0, 2.6), (0.5, 0, 2.6), 0.03, 0.03, 'wood', C('#3a2e28'), segs=5, rings=1)]
    V += dead_lantern('lan', (0.5, 0, 2.25), 0.18)
    LIGHTS[name] = [(0.5, 0, 2.25, '#ffb45c', 5.0, 1.0, 1.1)]
    return piece(name, V, [col_box('p', (0, 0, 1.3), (0.25, 0.25, 2.6))], x, ao=False)


def dead_string(x, name='dead_string', L=7.0, h=4.6, sag=0.5):
    """A rope of little unlit lanterns strung across the lane (along X); no collision."""
    V = []
    pts = [Vector((-L / 2 + L * i / 8, 0, h - sag * 4 * (i / 8) * (1 - i / 8))) for i in range(9)]
    for i in range(8):
        V.append(tube('rope%d' % i, pts[i], pts[i + 1], 0.01, 0.01, 'wood', C('#3a2e28'), segs=3, rings=1, caps=False))
    LIGHTS[name] = []
    for i in range(7):
        p = (pts[i] + pts[i + 1]) / 2
        V += dead_lantern('l%d' % i, (p.x, 0, p.z - 0.22), 0.11)
        LIGHTS[name].append((p.x, 0, p.z - 0.22, '#ffb45c', 3.0, 0.5 if i % 2 == 0 else 0.0, 0.6))
    return piece(name, V, [], x, ao=False)


def planter(x, name='planter'):
    """A clay pot of a plant nobody watered."""
    V = [tube('pot', (0, 0, 0), (0, 0, 0.45), 0.22, 0.28, 'stone', C('#9a6a4a'), segs=8, rings=1),
         ellipsoid('soil', (0, 0, 0.44), (0.25, 0.25, 0.03), 'plain', C('#5a4a3a'), (8, 3))]
    for i in range(5):
        a = i * 1.26
        V.append(cone('stem%d' % i, (0.05 * math.cos(a), 0.05 * math.sin(a), 0.45), (0.25 * math.cos(a), 0.25 * math.sin(a), 0.95 - i * 0.05), 0.02, 0.005, 'paper', C('#8a8a6a'), segs=3))
    return piece(name, V, [col_box('p', (0, 0, 0.3), (0.55, 0.55, 0.6))], x, ao=False)


PIECES = [lambda x: qshop(x, 'qshop_a'),
          lambda x: qshop(x, 'qshop_b', col='#c9cfc8', trim='#3f4a48', sign='#5f7a74', shut='#7d7466', balcony=False),
          lambda x: qshop(x, 'qshop_c', col='#e0d4c4', trim='#6a3e32', sign='#9a5a4a', shut='#687480', cloth=('#c9b8a0', '#a8a0b8')),
          # the same three on the morning after the story (src/world/zones/quiet.js swaps them in)
          lambda x: qshop(x, 'qshop_a_open', open=True, cloth=('#e0662c', '#f3e6d3')),
          lambda x: qshop(x, 'qshop_b_open', col='#c9cfc8', trim='#3f4a48', sign='#5f7a74', shut='#7d7466', balcony=False, open=True,
                          goods=('#2f8a8f', '#f3e6d3', '#e2a13a', '#b5483a')),
          lambda x: qshop(x, 'qshop_c_open', col='#e0d4c4', trim='#6a3e32', sign='#9a5a4a', shut='#687480', cloth=('#f6c56a', '#8fcaff'), open=True,
                          goods=('#b5483a', '#f6c56a', '#f3e6d3', '#6e8b5a')),
          lambda x: qhouse(x, 'qhouse_a'),
          lambda x: qhouse(x, 'qhouse_b', col='#c4c9c6', trim='#3f4a48'),
          lambda x: qhouse(x, 'qhouse_a_open', open=True),
          lambda x: qhouse(x, 'qhouse_b_open', col='#c4c9c6', trim='#3f4a48', open=True, flowers=('#dba6ff', '#f3e6d3', '#ff9d86')),
          dead_post, dead_string, planter, bench_m, stool, bollard, boat, crate]


def build_kit():
    reset_scene()
    use_collection('quiet_kit')
    roots = []
    x = 0.0
    for fn in PIECES:
        roots.append(fn(x))
        x += 10
    objs = []
    for r in roots:
        objs += descendants(r)
    return export_glb('quiet_kit.glb', objs)


# ---------------------------------------------------------------- the zone

def marker(name, pos, rot=0.0, **props):
    e = link(bpy.data.objects.new(name, None))
    e.location = pos
    e.rotation_euler = (0, 0, math.radians(rot))
    e.empty_display_size = 0.4
    for k, v in props.items():
        e[k] = v
    return e


def area(name, pos, extents, rot=0.0, **props):
    e = marker(name, pos, rot, **props)
    e.empty_display_type = 'CUBE'
    e.scale = extents
    return e


_n = [0]
_nl = [0]


def light(pos, color='#ffb45c', radius=4.0, intensity=1.0, glow=1.0, mem=''):
    _nl[0] += 1
    return marker('LIGHT_%03d' % _nl[0], pos, color=color, radius=radius, intensity=intensity, glow=glow, mem=mem)


def place(piece_name, pos, rot=0.0, mem=''):
    """PLACE_ marker for a kit piece. Its dead lanterns become LIGHT_ markers only when a memory relights
    them (mem = that memory's id); the rest of the district stays dark."""
    _n[0] += 1
    marker('PLACE_%s.%03d' % (piece_name, _n[0]), pos, rot)
    if not mem:
        return
    a = math.radians(rot)
    for (lx, ly, lz, col, rad, inten, glow) in LIGHTS.get(piece_name, []):
        wx = pos[0] + lx * math.cos(a) - ly * math.sin(a)
        wy = pos[1] + lx * math.sin(a) + ly * math.cos(a)
        light((wx, wy, pos[2] + lz), col, rad, inten, glow, mem)


def col(name, c, size, rot=(0, 0, 0)):
    return box('COL_' + name, c, size, 'plain', (1, 1, 1), rot=rot)


HARBOUR_Y = 22.0     # the harbour wall (north edge); water beyond
CANAL = (-1.8, 1.8)  # the canal crosses the lane east-west
LANE = 3.5           # the lane runs between x = -LANE and +LANE
SQUARE = (-34.0, -22.0, 12.0)   # y0, y1, half width
FOG_Y = -42.0        # the fog wall


def quiet():
    reset_scene()
    use_collection('quiet')
    rnd = random.Random(33)

    def h(x, y):
        if CANAL[0] - 0.2 < y < CANAL[1] + 0.2 and abs(x) > LANE + 0.1:
            return -1.3
        return 0.0

    def color(x, y, z):
        if z < -0.5:
            return C('#5e5a54')
        i, j = math.floor(x / 1.1), math.floor(y / 1.1)
        k = ((i * 73856093) ^ (j * 19349663)) % 7 / 7
        base = mix(C('#8a857c'), C('#9d978b'), k)
        if abs(x) < LANE - 0.4 and y > SQUARE[1]:  # the lane: older, worn setts
            base = mix(base, C('#8c8272'), 0.4)
        return base

    terrain = grid_terrain('GROUND_quiet', -26, 26, -50, HARBOUR_Y, 52, 72, h, color)
    V, K = [], []

    # ---- the harbour: a sea wall, the ferry jetty, a moored sampan, bollards
    V.append(box('seawall', (0, HARBOUR_Y + 0.25, -0.55), (52, 0.5, 1.3), 'stone', C('#77726a')))
    V.append(box('seawall_top', (0, HARBOUR_Y + 0.25, 0.08), (52, 0.62, 0.12), 'stone', C(STONE)))
    for (x0, x1) in ((-26, -1.8), (1.8, 26)):
        cx, L = (x0 + x1) / 2, x1 - x0
        V.append(box('rail_%d' % x0, (cx, HARBOUR_Y + 0.2, 0.62), (L, 0.18, 0.1), 'stone', C(STONE)))
        for kk in range(int(L / 1.2)):
            V.append(box('bal_%d_%d' % (x0, kk), (x0 + 0.6 + kk * 1.2, HARBOUR_Y + 0.2, 0.36), (0.12, 0.12, 0.5), 'stone', C(STONE_D)))
        K.append(col('rail_%d' % x0, (cx, HARBOUR_Y + 0.25, 0.6), (L, 0.5, 1.4)))
    for kk in range(18):
        yy = HARBOUR_Y + 0.25 + kk * 0.5
        V.append(box('plank%d' % kk, (0, yy + 0.25, 0.04), (3.2, 0.46, 0.08), 'wood', mix(C('#7a6450'), C('#8a7058'), rnd.random())))
    jy1 = HARBOUR_Y + 9.25
    K.append(col('jetty', (0, (HARBOUR_Y + jy1) / 2, -0.4), (3.2, jy1 - HARBOUR_Y, 0.9)))
    for sx in (-1, 1):
        V.append(box('jrail%d' % sx, (sx * 1.6, (HARBOUR_Y + jy1) / 2 + 0.2, 0.85), (0.08, jy1 - HARBOUR_Y - 0.4, 0.08), 'wood', C(TIMBER_D)))
        K.append(col('jrail%d' % sx, (sx * 1.6, (HARBOUR_Y + jy1) / 2, 0.6), (0.3, jy1 - HARBOUR_Y, 1.2)))
        for kk in range(5):
            V.append(box('jpost%d_%d' % (sx, kk), (sx * 1.6, HARBOUR_Y + 0.8 + kk * 2.0, 0.45), (0.1, 0.1, 0.8), 'wood', C(TIMBER_D)))
        for yy in (HARBOUR_Y + 3, HARBOUR_Y + 7):
            V.append(tube('pile%d_%d' % (sx, yy), (sx * 1.6, yy, -2.2), (sx * 1.6, yy, 0.05), 0.14, 0.14, 'wood', C('#4a3a30'), segs=6, rings=1))
    V.append(box('jend', (0, jy1 + 0.05, 0.3), (3.2, 0.12, 0.45), 'wood', C(TIMBER_D)))
    K.append(col('jend', (0, jy1 + 0.1, 0.5), (3.2, 0.3, 1.0)))

    # ---- the canal: stone banks, parapets, and a flat stone bridge carrying the lane over it
    for sy in (-1, 1):
        yy = CANAL[1] + 0.12 if sy > 0 else CANAL[0] - 0.12
        for (x0, x1) in ((-26, -LANE), (LANE, 26)):
            cx, L = (x0 + x1) / 2, x1 - x0
            V.append(box('bank%d_%d' % (sy, x0), (cx, yy, -0.6), (L, 0.3, 1.3), 'stone', C('#7f786e')))
            V.append(box('parapet%d_%d' % (sy, x0), (cx, yy, 0.35), (L, 0.28, 0.7), 'stone', C(STONE)))
            K.append(col('parapet%d_%d' % (sy, x0), (cx, yy, 0.6), (L, 0.4, 1.4)))
    V.append(box('bridge', (0, 0, -0.2), (LANE * 2 + 0.2, CANAL[1] - CANAL[0] + 0.5, 0.4), 'stone', C(STONE)))
    V.append(box('bridge_arch', (0, 0, -0.75), (LANE * 2 - 0.6, CANAL[1] - CANAL[0] + 0.5, 0.7), 'stone', C('#6f6a62')))
    for sx in (-1, 1):
        V.append(box('bpar%d' % sx, (sx * (LANE + 0.05), 0, 0.3), (0.28, CANAL[1] - CANAL[0] + 0.5, 0.6), 'stone', C(STONE)))
        K.append(col('bpar%d' % sx, (sx * (LANE + 0.05), 0, 0.6), (0.35, CANAL[1] - CANAL[0] + 0.6, 1.2)))
    V.append(box('canal_bed', (0, 0, -1.35), (52, CANAL[1] - CANAL[0], 0.1), 'stone', C('#4f4c46')))

    # ---- the thread-shop alley (east, off the lane) between two blind walls
    AL = (-14.5, -11.5)
    for yy in AL:
        V.append(box('alley_wall%d' % yy, (9.5, yy + (-0.4 if yy < -13 else 0.4), 2.4), (11.2, 0.8, 4.8), 'plain', C('#c9c1b3'), noise=0.04))
        K.append(col('alley%d' % yy, (9.5, yy + (-0.4 if yy < -13 else 0.4), 2.4), (11.2, 0.8, 4.8)))
    V.append(box('alley_arch', (4.2, (AL[0] + AL[1]) / 2, 4.1), (0.5, AL[1] - AL[0] + 1.6, 0.5), 'wood', C(TIMBER_D)))
    # the thread shop at the end of the alley, facing back down it (west): a little glow behind its shutter
    V.append(box('tshop', (15.4, -13, 2.6), (0.8, 3.8, 5.2), 'plain', C('#d9c9b3')))
    V.append(box('tshop_sign', (14.9, -13, 3.3), (0.08, 2.2, 0.5), 'wood', C('#8a3a32')))
    V.append(box('tshop_glow', (14.97, -13, 1.2), (0.02, 1.8, 1.9), 'glow', C('#f6b35c')))
    for i in range(4):  # spools in the window above
        V.append(tube('spool%d' % i, (14.95, -13.9 + i * 0.6, 4.3), (14.85, -13.9 + i * 0.6, 4.3), 0.13, 0.13, 'cloth', C(['#c8412f', '#e0a33a', '#2f8a8f', '#c8412f'][i]), segs=8, rings=1))
    K.append(col('tshop', (15.4, -13, 2.6), (1.0, 3.8, 5.2)))
    # the red thread: a crooked trail from the lane along the alley floor to the shop's door
    pts = [(4.0, -12.4), (5.5, -13.4), (7.2, -12.7), (8.8, -13.5), (10.4, -12.8), (12.0, -13.3), (13.4, -12.9), (14.8, -13.1)]
    for i in range(len(pts) - 1):
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        V.append(tube('thread%d' % i, (xa, ya, 0.025), (xb, yb, 0.025), 0.012, 0.012, 'glow', C('#d8412f'), segs=3, rings=1))

    # ---- memory props on the lane: the noticeboard, the post office's letterbox, the sweet shop's jars
    nb = (-6.0, 16.0)
    V.append(box('nb_board', (nb[0], nb[1], 1.55), (2.2, 0.1, 1.3), 'wood', C('#7a5a42')))
    V.append(box('nb_paper1', (nb[0] - 0.5, nb[1] - 0.06, 1.65), (0.7, 0.02, 0.8), 'paper', C('#d8d0bc')))
    V.append(box('nb_paper2', (nb[0] + 0.45, nb[1] - 0.06, 1.5), (0.8, 0.02, 0.6), 'paper', C('#cfc6ae')))
    V.append(box('nb_roof', (nb[0], nb[1] - 0.1, 2.35), (2.6, 0.6, 0.08), 'roof', C(TILE), rot=(-15, 0, 0)))
    for sx in (-1, 1):
        V.append(tube('nb_leg%d' % sx, (nb[0] + sx * 1.0, nb[1], 0), (nb[0] + sx * 1.0, nb[1], 2.35), 0.05, 0.05, 'wood', C(TIMBER_D), segs=5, rings=1))
    K.append(col('nb', (nb[0], nb[1], 1.2), (2.3, 0.3, 2.4)))
    lb = (3.0, 6.4)
    V.append(tube('letterbox', (lb[0], lb[1], 0), (lb[0], lb[1], 1.25), 0.24, 0.24, 'stone', C('#3f6f4f'), segs=10, rings=1))
    V.append(ellipsoid('lb_top', (lb[0], lb[1], 1.25), (0.26, 0.26, 0.14), 'stone', C('#3f6f4f'), (10, 4), cut=lambda co: co.z < -0.1))
    V.append(box('lb_slot', (lb[0] - 0.24, lb[1], 1.0), (0.02, 0.28, 0.05), 'stone', C('#1f2f25')))
    K.append(col('letterbox', (lb[0], lb[1], 0.7), (0.5, 0.5, 1.4)))
    # warm glows that show when their shutters lift (a memory restored)
    for (name, c, size) in (('post', (4.215, 5.0, 1.25), (0.02, 3.6, 2.3)), ('sweets', (-4.215, -5.0, 1.25), (0.02, 3.6, 2.3)),
                            ('teahouse', (-11.975, -26.0, 1.3), (0.02, 3.6, 2.4))):
        V.append(box('glow_' + name, c, size, 'glow', C('#f2b261')))
    for i in range(3):  # jars of lemon candies in the sweet shop's window (seen when its shutter lifts)
        V.append(tube('jar%d' % i, (-4.1, -6.0 + i * 0.9, 1.0), (-4.1, -6.0 + i * 0.9, 1.35), 0.12, 0.12, 'glass', C('#cfe7ee'), segs=8, rings=1))
        V.append(ellipsoid('sw%d' % i, (-4.1, -6.0 + i * 0.9, 1.1), (0.09, 0.09, 0.09), 'paper', C('#f2d23a'), (6, 4)))

    # ---- the square: the old well, the teahouse (west side) with its mahjong table out front
    y0, y1, hw = SQUARE
    wl = (4.5, -28.5)
    V.append(tube('well', (wl[0], wl[1], 0), (wl[0], wl[1], 0.7), 0.85, 0.9, 'stone', C(STONE), segs=12, rings=1))
    V.append(tube('well_in', (wl[0], wl[1], 0.3), (wl[0], wl[1], 0.72), 0.7, 0.7, 'stone', C('#3a3834'), segs=12, rings=1, caps=False))
    for sx in (-1, 1):
        V.append(tube('well_post%d' % sx, (wl[0] + sx * 0.8, wl[1], 0.7), (wl[0] + sx * 0.8, wl[1], 2.1), 0.05, 0.05, 'wood', C(TIMBER_D), segs=5, rings=1))
    V.append(tube('well_bar', (wl[0] - 0.85, wl[1], 2.0), (wl[0] + 0.85, wl[1], 2.0), 0.04, 0.04, 'wood', C(TIMBER_D), segs=5, rings=1))
    V += roof('well_roof', (wl[0], wl[1], 2.05), 1.8, 1.0, 0.5, over=0.3, lift=0.15, res=(8, 4), tile=TILE)
    K.append(col('well', (wl[0], wl[1], 0.5), (1.8, 1.8, 1.0)))
    th = (-hw, -26.0)  # the teahouse front, facing east onto the square
    V.append(box('th_wall', (th[0] - 0.4, th[1], 2.7), (0.8, 7.0, 5.4), 'plain', C('#d6c8b0')))
    V.append(box('th_sign', (th[0] + 0.02, th[1], 3.3), (0.1, 3.0, 0.6), 'wood', C('#4a6a5a')))
    V += roof('th_roof', (th[0] - 0.4, th[1], 5.4), 1.6, 7.0, 1.0, over=0.6, lift=0.35, res=(8, 12), tile=TILE)
    K.append(col('th', (th[0] - 0.4, th[1], 2.7), (1.0, 7.0, 5.4)))
    mj = (-8.6, -26.0)
    V.append(box('mj_top', (mj[0], mj[1], 0.74), (0.95, 0.95, 0.06), 'wood', C('#3f6a4f')))
    for sx in (-1, 1):
        for sy in (-1, 1):
            V.append(box('mj_leg%d%d' % (sx, sy), (mj[0] + sx * 0.4, mj[1] + sy * 0.4, 0.36), (0.06, 0.06, 0.72), 'wood', C(TIMBER_D)))
    for i in range(8):  # a few tiles left on the table
        V.append(box('tile%d' % i, (mj[0] - 0.3 + (i % 4) * 0.2, mj[1] - 0.25 + (i // 4) * 0.5, 0.79), (0.08, 0.11, 0.04), 'plain', C('#efe8d8')))
    K.append(col('mj', (mj[0], mj[1], 0.4), (1.0, 1.0, 0.8)))

    # ---- the fog street and the kitchen door (west side of it): warm light, just visible in the fog
    kd = (-4.0, -39.0)
    V.append(box('kh_wall', (kd[0] - 0.4, kd[1], 2.4), (0.8, 5.0, 4.8), 'plain', C('#d9c9b0')))
    V.append(box('kh_door', (kd[0] + 0.02, kd[1], 1.05), (0.06, 1.0, 2.1), 'glow', C('#f0a854')))
    V.append(box('kh_frame', (kd[0] + 0.05, kd[1], 1.1), (0.05, 1.2, 2.3), 'wood', C(TIMBER)))
    V.append(box('kh_win', (kd[0] + 0.02, kd[1] + 1.5, 1.5), (0.06, 0.8, 0.7), 'glow', C('#f6c070')))
    V += roof('kh_roof', (kd[0] - 0.4, kd[1], 4.8), 1.4, 5.0, 0.8, over=0.5, lift=0.3, res=(6, 10), tile=TILE)
    K.append(col('kh', (kd[0] - 0.4, kd[1], 2.4), (1.0, 5.0, 4.8)))
    for i, yy in enumerate((-44.0, -50.0)):  # house fronts fading into the fog
        for sx in (-1, 1):
            V.append(box('fogh%d%d' % (i, sx), (sx * 5.5, yy, 2.6), (1.0, 5.2, 5.2), 'plain', C('#bfb8aa')))

    # ---- the far shore across the water: the night market's roofs (its lanterns are glows at runtime)
    for i in range(22):
        xx = -60 + i * 6 + rnd.uniform(-1.5, 1.5)
        yy = 96 + rnd.uniform(0, 8)
        w, d, hh = rnd.uniform(4, 6.5), rnd.uniform(4, 6), rnd.uniform(3, 6)
        V.append(box('far%d' % i, (xx, yy, hh / 2 - 0.5), (w, d, hh), 'plain', mix(C('#5a5048'), C('#6a5a4e'), rnd.random())))
        V.append(cone('farroof%d' % i, (xx, yy, hh - 0.5), (xx, yy, hh + 1.2), w * 0.72, 0.2, 'plain', C('#3e3834'), segs=4))
    for i in range(6):
        V.append(ellipsoid('hill%d' % i, (-70 + i * 28, 118, -2), (20, 9, 18 + (i % 3) * 6), 'plain', C('#6e7a72'), (10, 5)))

    def blank(name, x0, x1, y0, y1, hh=5.0, colour='#c8c0b2'):
        cx, cy, sx, sy = (x0 + x1) / 2, (y0 + y1) / 2, abs(x1 - x0), abs(y1 - y0)
        V.append(box(name, (cx, cy, hh / 2), (sx, sy, hh), 'plain', C(colour), noise=0.04))
        V.append(box(name + '_top', (cx, cy, hh + 0.1), (sx + 0.2, sy + 0.2, 0.2), 'roof', C(TILE)))
        K.append(col(name, (cx, cy, hh / 2), (sx, sy, hh)))
    for sx in (-1, 1):
        blank('plaza_s%d' % sx, sx * 4.3, sx * 12.0, 11.5, 12.3, 5.4)
        blank('sq_n%d' % sx, sx * 4.3, sx * 12.0, -22.3, -21.5, 5.2)
    blank('gap_w', -5.1, -4.3, -19.0, -21.5)
    blank('gap_e1', 4.3, 5.1, -7.8, -11.5)
    blank('gap_e2', 4.3, 5.1, -20.1, -21.5)
    blank('sq_w', -12.8, -12.0, -34.0, -29.5, 5.0)
    blank('fog_e', 4.0, 4.8, -34.5, -44.0, 4.6, '#bdb6a8')
    blank('fog_w', -4.8, -4.0, -36.5, -34.5, 4.6, '#bdb6a8')
    blank('fog_w2', -4.8, -4.0, -41.5, -44.0, 4.6, '#bdb6a8')

    meshes = join_mixed(V, 'quiet')
    bake_ao(meshes, occluders=meshes + [terrain], dist=0.9, samples=12, strength=0.4)

    # ---- shutters that lift when their memory returns (separate objects; src/world/zones/quiet.js)
    for (name, c, size) in (('post', (4.17, 5.0, 1.35), (0.06, 3.9, 2.7)), ('sweets', (-4.17, -5.0, 1.35), (0.06, 3.9, 2.7)),
                            ('teahouse', (-11.93, -26.0, 1.4), (0.06, 3.9, 2.8))):
        parts = [box('shut_' + name, c, size, 'stone', C(SHUTTER))]
        for i in range(9):
            parts.append(box('shr_%s%d' % (name, i), (c[0] + (0.035 if c[0] > 0 else -0.035) * (-1), c[1], 0.2 + i * 0.3), (0.02, size[1], 0.05), 'stone', C('#566060')))
        join_mixed(parts, 'SHUT_' + name)

    # ---- invisible bounds: the walkable plaza, lane, alley, square and fog street
    B = []
    B.append(col('b_plaza_w', (-12.2, 17, 3), (0.4, 10.5, 8)))
    B.append(col('b_plaza_e', (12.2, 17, 3), (0.4, 10.5, 8)))
    B.append(col('b_plaza_sw', (-7.9, 11.9, 3), (8.6, 0.4, 8)))
    B.append(col('b_plaza_se', (7.9, 11.9, 3), (8.6, 0.4, 8)))
    B.append(col('b_lane_w', (-LANE - 0.9, (y1 + 12) / 2, 3), (0.4, 12 - y1, 8)))
    B.append(col('b_lane_e_n', (LANE + 0.9, (AL[1] + 12) / 2, 3), (0.4, 12 - AL[1], 8)))
    B.append(col('b_lane_e_s', (LANE + 0.9, (y1 + AL[0]) / 2, 3), (0.4, AL[0] - y1, 8)))
    B.append(col('b_sq_nw', (-(hw + LANE) / 2 - 0.5, y1 + 0.2, 3), (hw - LANE, 0.4, 8)))
    B.append(col('b_sq_ne', ((hw + LANE) / 2 + 0.5, y1 + 0.2, 3), (hw - LANE, 0.4, 8)))
    B.append(col('b_sq_w', (-hw - 0.2, (y0 + y1) / 2, 3), (0.4, y1 - y0, 8)))
    B.append(col('b_sq_e', (hw + 0.2, (y0 + y1) / 2, 3), (0.4, y1 - y0, 8)))
    B.append(col('b_sq_sw', (-(hw + 4) / 2, y0 - 0.2, 3), (hw - 4, 0.4, 8)))
    B.append(col('b_sq_se', ((hw + 4) / 2, y0 - 0.2, 3), (hw - 4, 0.4, 8)))
    B.append(col('b_fog_w', (-4.2, (FOG_Y + y0) / 2, 3), (0.4, y0 - FOG_Y, 8)))
    B.append(col('b_fog_e', (4.2, (FOG_Y + y0) / 2, 3), (0.4, y0 - FOG_Y, 8)))
    B.append(col('b_fogwall', (0, FOG_Y - 0.2, 3), (8.4, 0.4, 8)))
    join(K + B, 'COL_quiet')

    # ---------------- kit placements: shops along both sides of the lane, fronts facing it
    WEST, EAST = -LANE - 0.8, LANE + 0.8
    for (yy, kind, mem) in ((5.0, 'qshop_a', ''), (9.9, 'qhouse_a', ''), (-5.0, 'qshop_b', 'sweets'), (-10.6, 'qshop_c', ''), (-16.2, 'qshop_a', '')):
        place(kind, (WEST, yy, 0), rot=90, mem=mem)
    for (yy, kind, mem) in ((5.0, 'qshop_b', 'post'), (9.9, 'qhouse_b', ''), (-5.0, 'qshop_c', ''), (-17.3, 'qshop_a', '')):
        place(kind, (EAST, yy, 0), rot=-90, mem=mem)
    # the plaza: house fronts on its east and west, facing in
    for (xx, yy, rot, kind) in ((-12.6, 19.0, 90, 'qhouse_a'), (-12.6, 14.6, 90, 'qhouse_b'), (12.6, 19.0, -90, 'qhouse_b'), (12.6, 14.6, -90, 'qhouse_a')):
        place(kind, (xx, yy, 0), rot=rot)
    # the square: houses on its east side, shops along its south edge facing north
    for (xx, yy, rot, kind) in ((12.6, -24.6, -90, 'qhouse_a'), (12.6, -29.2, -90, 'qhouse_b'), (8.5, -34.4, 180, 'qshop_b'), (-8.5, -34.4, 180, 'qshop_c')):
        place(kind, (xx, yy, 0), rot=rot)
    # dead lanterns: posts on the plaza and the square, strings across the lane
    place('dead_post', (-3.0, 20.8, 0), rot=90, mem='notice')
    place('dead_post', (3.0, 20.8, 0), rot=90)
    place('dead_post', (-10.8, -23.0, 0), rot=0, mem='teahouse')
    place('dead_post', (9.8, -32.6, 0), rot=180)
    for (yy, mem) in ((13.6, 'notice'), (7.4, 'post'), (-3.5, 'sweets'), (-9.5, ''), (-15.0, 'thread'), (-20.5, '')):
        place('dead_string', (0, yy, 0), mem=mem)
    light((-3.4, -39.0, 2.4), '#ffb45c', 4.5, 1.0, 1.0, 'kitchen')
    light((-6.0, 16.6, 2.4), '#ffc46b', 3.5, 0.7, 0.6, 'notice')
    light((13.6, -13.0, 2.6), '#ffc46b', 4.0, 1.0, 0.8, 'thread')
    # benches and stools to sit with a grey Grumbling (SEAT_ markers: centre of the seat's front edge)
    seats = [(-2.4, 13.2, 180), (-2.9, 7.4, 90), (2.9, -8.4, -90), (-5.0, -22.9, 0), (2.0, -33.2, 180), (8.0, 17.0, -90), (8.8, -26.5, -90)]
    for i, (xx, yy, r) in enumerate(seats):
        place('bench_m', (xx, yy, 0), rot=r)
        a = math.radians(r)
        marker('SEAT_%d' % (i + 1), (xx + 0.18 * math.sin(a), yy - 0.18 * math.cos(a), 0), rot=r, seat=0.42)
    for (xx, yy) in ((-9.4, -26.0), (-7.8, -26.0), (-8.6, -26.8), (-8.6, -25.2)):
        place('stool', (xx, yy, 0))
    for (xx, yy, r) in ((-2.6, 21.2, 0), (2.8, 21.4, 0), (-8.0, 21.2, 0), (8.2, 21.2, 0)):
        place('bollard', (xx, yy, 0), rot=r)
    place('boat', (3.4, 28.0, -0.7), rot=6)
    place('boat', (-5.5, 30.5, -0.7), rot=-10)
    for (xx, yy, r) in ((-2.7, 5.4, 10), (2.7, -10.2, -20), (-2.8, -14.2, 5), (10.5, -24.0, 0), (-10.4, -33.0, 30)):
        place('crate', (xx, yy, 0), rot=r)
    for (xx, yy) in ((-2.8, 11.0), (2.8, -3.0), (-2.8, -19.2), (2.8, -15.3)):
        place('planter', (xx, yy, 0))

    # ---------------- markers
    marker('SPAWN_start', (0, HARBOUR_Y + 1.6, 0.05), rot=0)     # off the ferry, facing into the district
    marker('SPAWN_ferry', (0, HARBOUR_Y + 1.6, 0.05), rot=0)
    marker('NPC_tangtang', (1.3, HARBOUR_Y + 2.6, 0.05), rot=0, model='tangtang', anim='idle')
    marker('NPC_weibao', (-1.3, HARBOUR_Y + 2.8, 0.05), rot=0, model='weibao', anim='idle')
    marker('NPC_ferryman', (0.9, HARBOUR_Y + 6.0, 0.05), rot=0, model='folk_a', anim='idle')
    marker('POINT_ferry', (0, HARBOUR_Y + 5.0, 0.05), rot=180)   # talk to the ferryman here to leave
    # the neighbours who never left
    marker('NPC_barber', (-2.5, 4.2, 0), rot=90, model='folk_c', anim='idle')
    marker('NPC_noodle', (2.5, -17.0, 0), rot=-90, model='folk_b', anim='idle')
    marker('NPC_oldman', (2.9, 10.6, 0), rot=-90, model='folk_a', anim='sit', seat=0.42)
    place('stool', (3.15, 10.6, 0))
    # the memories (props: sprite who remembers it, colour-pocket radius) and their camera shots
    mems = {
        'notice': ((-5.2, 14.7, 0), 180, 'homework', 6.5, (-1.8, 10.6, 2.2)),
        'post': ((2.0, 5.6, 0), 90, 'cloud', 6.5, (-1.9, 9.6, 2.2)),
        'sweets': ((-2.1, -5.0, 0), -90, 'sock', 6.0, (2.1, -1.0, 2.2)),
        'teahouse': ((-7.0, -26.0, 0), -90, 'pompom', 7.0, (-1.8, -23.0, 2.6)),
        'thread': ((4.4, -13.0, 0), 90, 'sparrow', 7.5, (2.0, -10.4, 2.2)),
        'kitchen': ((-2.4, -39.0, 0), -90, 'grey', 5.5, (1.8, -35.2, 1.9)),
    }
    for mid, (p, r, spr, rad, cam) in mems.items():
        marker('POINT_mem_' + mid, p, rot=r, sprite=spr, radius=rad)
        marker('CAM_mem_' + mid, cam)
    # grey Grumblings, each near the memory that will help it; they drift toward the heart of the district
    greys = [((-1.6, 14.4, 0), 'I WAS A BIRTHDAY NOBODY REMEMBERED. HONK.'),
             ((1.0, 8.2, 0), 'I WAS A LETTER NOBODY ANSWERED. HONK.'),
             ((-1.6, -7.8, 0), 'I WAS “I’M FINE, REALLY.” NOBODY ASKED TWICE. HONK.'),
             ((7.4, -12.8, 0), 'I WAS A FRIEND WHO MOVED AWAY AND NEVER WROTE. HONK.'),
             ((-5.2, -24.0, 0), 'I WAS A SHOP THAT CLOSED, AND NOBODY SAID GOODBYE. HONK.'),
             ((2.8, -31.2, 0), 'I WAS A PHONE CALL NOBODY MADE. HONK.')]
    for i, (p, echo) in enumerate(greys):
        marker('GRUMB_grey_%d' % (i + 1), p, species='grey', echo=echo)
    area('AREA_heart', (0, -38.0, 1), (4, 3, 1.5))
    area('TRIGGER_fogwall', (0, FOG_Y + 2.2, 1), (4.0, 1.2, 2))
    marker('POINT_banyan', (-5.5, -29.5, 0))
    marker('POINT_arrive', (0, 16.0, 0))
    marker('CAM_arrive', (1.8, HARBOUR_Y - 3.5, 2.6))
    marker('CAM_square', (0.0, -19.0, 3.2))
    marker('CAM_fog', (0.0, -31.5, 2.2))
    area('WATER_harbour', (0, HARBOUR_Y + 58, -0.75), (150, 57, 1))
    area('WATER_canal', (0, 0, -0.95), (26, 1.8, 1))
    for i in range(40):  # the night market's lanterns across the water (still lit)
        marker('POINT_farlight_%d' % (i + 1), (-58 + i * 3 + rnd.uniform(-1, 1), 94 + rnd.uniform(0, 6), rnd.uniform(0.6, 4.5)))
    return export_glb('quiet.glb', [o for o in bpy.context.scene.objects])


if __name__ == '__main__':
    print('built', build_kit())
    print('built', quiet())
