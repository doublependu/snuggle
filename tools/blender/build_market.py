# SPDX-License-Identifier: GPL-3.0-only
"""Chapter 2: the Lantern Bay night market on the harbour promenade.

Exports two files (run headless: blender -b -P tools/blender/build_market.py):
  assets-src/export/market_kit.glb  stalls, the chestnut cart, the dumpling stall, lantern posts and strings,
                                    shopfronts, the musician's stage, stools, benches, crates, bollards, a boat
  assets-src/export/market.glb      the promenade, sea wall, pier, stairs up to the Academy, the far shore
                                    (the Quiet District, whose lanterns go out at the end of the chapter) and
                                    every marker the runtime reads (src/world/zones/market.js)

Kit pieces follow build_kit.py (an empty named after the piece, one 'mixed' mesh, COL_* colliders; front
faces -Y). Every lantern is also written as a LIGHT_* marker (props: color, radius, intensity, glow): the
runtime paints them into the lamp map (src/render/lamps.js) and draws a glow sprite for each.
New markers here: SEAT_<id> (centre of a seat's front edge; prop seat = seat-top height), GOOD_<flock>_<kind>
(the free good things Xiao Pei points out to a sparrow flock), GRUMB_sparrow_<n> (prop flock).
"""
import os, sys, importlib, math, random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *
import build_kit

importlib.reload(build_kit)
from build_kit import piece, col_box, lattice_window, TIMBER, TIMBER_D, PLASTER, STONE, STONE_D, TILE

C = srgb
WARM, RED, AMBER = '#ffb45c', '#ff6a3d', '#ffc46b'
LIGHTS = {}  # piece -> [(x, y, z, color, radius, intensity, glow)] in the piece's local frame


def lantern(name, c, r=0.16, color=RED, h=None):
    """A paper lantern: glowing body, dark wooden caps, a tassel."""
    h = h or r * 1.25
    x, y, z = c
    small = r < 0.13
    return [ellipsoid(name, c, (r, r, h), 'glow', C(color), (6, 4) if small else (8, 5)),
            tube(name + '_ct', (x, y, z + h * 0.82), (x, y, z + h * 1.05), r * 0.45, r * 0.4, 'wood', C('#3a2a22'), segs=5 if small else 6, rings=1, caps=False),
            tube(name + '_cb', (x, y, z - h * 1.02), (x, y, z - h * 0.8), r * 0.4, r * 0.45, 'wood', C('#3a2a22'), segs=5 if small else 6, rings=1, caps=False),
            cone(name + '_ts', (x, y, z - h * 1.02), (x, y, z - h * 1.02 - r * 1.2), r * 0.12, r * 0.02, 'cloth', C('#d9a441'), segs=3)]


# ---------------------------------------------------------------- kit pieces

def stall_base(name, stripes, sign, goods, w=2.8, d=1.6):
    """Counter, four posts, a striped slanted awning with a scalloped valance, a sign and two lanterns."""
    V, K = [], []
    V.append(box('counter', (0, 0.05, 0.47), (w, 0.75, 0.94), 'wood', C('#8a5a3c'), bevel=0.02))
    V.append(box('counter_top', (0, -0.02, 0.96), (w + 0.1, 0.9, 0.05), 'wood', C('#a8744a')))
    V.append(box('counter_front', (0, -0.33, 0.45), (w - 0.2, 0.02, 0.7), 'plain', C(stripes[0])))
    K.append(col_box('counter', (0, 0.05, 0.5), (w + 0.1, 0.9, 1.0)))
    for sx in (-1, 1):
        for sy, hh in ((-1, 2.2), (1, 2.5)):
            V.append(tube('post%d%d' % (sx, sy), (sx * w / 2, sy * d / 2, 0), (sx * w / 2, sy * d / 2, hh), 0.05, 0.05, 'wood', C('#5a3d2a'), segs=5, rings=1, caps=False))
        K.append(col_box('post%d' % sx, (sx * w / 2, 0, 1.1), (0.15, d, 2.2)))
    # awning: strips across x, sloping from the back (2.5) down to the front (2.15), out past the posts
    n = 7
    y0, y1, z0, z1 = d / 2 + 0.05, -d / 2 - 0.45, 2.52, 2.12
    L = math.hypot(y1 - y0, z1 - z0)
    ang = math.degrees(math.atan2(z0 - z1, y0 - y1))
    for i in range(n):
        xx = -w / 2 - 0.2 + (w + 0.4) * (i + 0.5) / n
        V.append(box('awn%d' % i, (xx, (y0 + y1) / 2, (z0 + z1) / 2), ((w + 0.4) / n + 0.005, L, 0.04), 'cloth', C(stripes[i % 2]), rot=(-ang, 0, 0)))
        V.append(ellipsoid('scal%d' % i, (xx, y1 + 0.01, z1 - 0.06), ((w + 0.4) / n * 0.5, 0.03, 0.12), 'cloth', C(stripes[i % 2]), (6, 3), cut=lambda co: co.z > 0.05))
    V.append(box('sign', (0, d / 2 + 0.02, 2.75), (1.5, 0.06, 0.38), 'wood', C(sign)))
    V.append(box('sign_rim', (0, d / 2 + 0.04, 2.75), (1.62, 0.04, 0.46), 'wood', C('#3a2a22')))
    LIGHTS[name] = []
    for sx in (-1, 1):
        V += lantern('lan%d' % sx, (sx * (w / 2 - 0.25), -d / 2 - 0.3, 1.78), 0.15, RED if sx < 0 else WARM)
        LIGHTS[name].append((sx * (w / 2 - 0.25), -d / 2 - 0.3, 1.78, WARM, 4.2, 0.9, 0.9))
    V += goods
    return V, K


def mstall_lantern(x, name='mstall_lantern'):
    g = []
    cols = [RED, WARM, '#ff8fb0', '#8fd0ff', '#ffe27a', RED, '#c9a0ff']
    for i, c in enumerate(cols):
        xx = -1.2 + i * 0.4
        g.append(tube('rod%d' % i, (xx, -0.45, 1.95), (xx, -0.45, 1.75), 0.008, 0.008, 'wood', C('#3a2a22'), segs=4, rings=1))
        g += lantern('gl%d' % i, (xx, -0.45, 1.6 - (i % 2) * 0.08), 0.1, c)
    for i in range(5):  # stacked folded lanterns on the counter
        g.append(tube('stack%d' % i, (-0.9 + i * 0.45, -0.1, 1.0), (-0.9 + i * 0.45, -0.1, 1.18), 0.12, 0.12, 'paper', C(cols[i]), segs=8, rings=2, bulge=0.03))
    V, K = stall_base(name, ('#c8412f', '#f3e4c8'), '#b5483a', g)
    return piece(name, V, K, x)


def mstall_toy(x, name='mstall_toy'):
    g = []
    for i in range(5):  # pinwheels on sticks
        xx = -1.1 + i * 0.55
        g.append(tube('stk%d' % i, (xx, -0.2, 0.98), (xx, -0.2, 1.55), 0.01, 0.01, 'wood', C('#e8dcc0'), segs=4, rings=1))
        for k in range(4):
            a = k * 90 + i * 20
            g.append(cone('pw%d_%d' % (i, k), (xx, -0.22, 1.55), (xx + 0.12 * math.cos(math.radians(a)), -0.22, 1.55 + 0.12 * math.sin(math.radians(a))), 0.05, 0.005, 'paper',
                          C(['#e0662c', '#2f8a8f', '#ffd166', '#ef8fb4'][(i + k) % 4]), segs=3))
    for i in range(4):  # plush bunnies and balls on the counter
        xx = -0.9 + i * 0.6
        if i % 2:
            g.append(ico('ball%d' % i, (xx, 0.0, 1.1), (0.11, 0.11, 0.11), 'paper', C(['#e0662c', '#6fb3d9'][i // 2]), subdiv=1))
        else:
            g.append(ellipsoid('bun%d' % i, (xx, 0.0, 1.1), (0.1, 0.09, 0.12), 'cloth', C('#f6efe4'), (8, 6)))
            for s in (-1, 1):
                g.append(ellipsoid('ear%d%d' % (i, s), (xx + s * 0.04, 0.0, 1.27), (0.025, 0.02, 0.07), 'cloth', C('#f6efe4'), (6, 4)))
    V, K = stall_base(name, ('#2f8a8f', '#f3e4c8'), '#2f6f73', g)
    return piece(name, V, K, x)


def mstall_tea(x, name='mstall_tea'):
    g = []
    for i in range(3):
        xx = -0.8 + i * 0.8
        g.append(ellipsoid('pot%d' % i, (xx, 0.0, 1.08), (0.14, 0.14, 0.11), 'stone', C(['#6e8b5a', '#e8dcc0', '#b5483a'][i]), (10, 6)))
        g.append(cone('spout%d' % i, (xx + 0.1, 0.0, 1.08), (xx + 0.22, 0.0, 1.16), 0.03, 0.015, 'stone', C('#6e8b5a'), segs=5))
        for k in (-1, 1):
            g.append(tube('cup%d%d' % (i, k), (xx + k * 0.25, -0.15, 0.98), (xx + k * 0.25, -0.15, 1.04), 0.035, 0.04, 'stone', C('#f2ede2'), segs=8, rings=1))
    V, K = stall_base(name, ('#4f7f4a', '#f3e4c8'), '#3f5f3a', g)
    return piece(name, V, K, x)


def mstall_sweets(x, name='mstall_sweets'):
    g = []
    for i in range(4):  # candied hawthorn skewers standing in a straw bundle
        a = i * 0.5 - 0.75
        g.append(tube('sk%d' % i, (0.8, -0.1, 1.0), (0.8 + a * 0.2, -0.1, 1.55), 0.008, 0.008, 'wood', C('#e8dcc0'), segs=4, rings=1))
        for k in range(4):
            t = 0.55 + k * 0.13
            g.append(ellipsoid('haw%d%d' % (i, k), (0.8 + a * 0.2 * t, -0.1, 1.0 + 0.55 * t), (0.035, 0.035, 0.035), 'glow', C('#e2352d'), (6, 4)))
    g.append(tube('bundle', (0.8, -0.1, 0.96), (0.8, -0.1, 1.12), 0.08, 0.06, 'cloth', C('#c9a26a'), segs=8, rings=1))
    for i in range(3):  # jars of sweets
        xx = -1.0 + i * 0.45
        g.append(tube('jar%d' % i, (xx, 0.0, 0.98), (xx, 0.0, 1.25), 0.1, 0.1, 'glass', C('#cfe7ee'), segs=10, rings=1))
        g.append(ellipsoid('sw%d' % i, (xx, 0.0, 1.07), (0.08, 0.08, 0.08), 'paper', C(['#ffd166', '#ef8fb4', '#8fd0a0'][i]), (8, 5)))
        g.append(tube('lid%d' % i, (xx, 0.0, 1.25), (xx, 0.0, 1.29), 0.105, 0.105, 'wood', C('#b5483a'), segs=10, rings=1))
    V, K = stall_base(name, ('#e8859e', '#f3e4c8'), '#b5486a', g)
    return piece(name, V, K, x)


def mstall_fish(x, name='mstall_fish'):
    g = [tube('pot', (0.5, 0.0, 0.96), (0.5, 0.0, 1.3), 0.3, 0.28, 'stone', C('#3b3b3b'), segs=12, rings=1),
         ellipsoid('broth', (0.5, 0.0, 1.29), (0.26, 0.26, 0.02), 'plain', C('#d9a25a'), (10, 3))]
    for i in range(5):
        a = i * 1.25
        g.append(tube('st%d' % i, (0.5 + 0.12 * math.cos(a), 0.12 * math.sin(a), 1.2), (0.5 + 0.2 * math.cos(a), 0.2 * math.sin(a), 1.6), 0.008, 0.008, 'wood', C('#e8dcc0'), segs=4, rings=1))
        for k in range(3):
            t = 0.55 + k * 0.18
            g.append(ellipsoid('fb%d%d' % (i, k), (0.5 + (0.12 + 0.08 * t) * math.cos(a), (0.12 + 0.08 * t) * math.sin(a), 1.2 + 0.4 * t), (0.035, 0.035, 0.035), 'plain', C('#f2e6c8'), (6, 4)))
    g.append(box('board', (-0.6, -0.05, 0.99), (0.9, 0.5, 0.04), 'wood', C('#c9a26a')))
    V, K = stall_base(name, ('#e0662c', '#f3e4c8'), '#a8432a', g)
    return piece(name, V, K, x)


def mdumpling(x, name='mdumpling', w=3.2, d=2.0):
    """Tangtang's favourite: a small roofed stall with bamboo steamer stacks (the steam is a runtime effect)."""
    V, K = [], []
    V.append(box('counter', (0, 0.1, 0.47), (w, 0.8, 0.94), 'wood', C(TIMBER), bevel=0.02))
    V.append(box('top', (0, 0.05, 0.96), (w + 0.1, 0.95, 0.05), 'wood', C('#a8744a')))
    K.append(col_box('counter', (0, 0.1, 0.5), (w + 0.1, 1.0, 1.0)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            V.append(tube('p%d%d' % (sx, sy), (sx * w / 2, sy * d / 2, 0), (sx * w / 2, sy * d / 2, 2.45), 0.07, 0.07, 'wood', C(TIMBER), segs=6, rings=1))
        K.append(col_box('p%d' % sx, (sx * w / 2, 0, 1.2), (0.2, d, 2.4)))
    V += roof(name + '_roof', (0, 0, 2.45), w, d, 0.9, over=0.45, lift=0.3, res=(12, 8), tile=TILE)
    for i, sx in enumerate((-0.9, 0.0, 0.9)):
        for k in range(3 - (i == 1)):
            V.append(tube('st%d%d' % (i, k), (sx, 0.0, 0.99 + k * 0.13), (sx, 0.0, 1.11 + k * 0.13), 0.24, 0.24, 'wood', C('#c9a26a' if k % 2 else '#b8904e'), segs=12, rings=1))
        top = 0.99 + (3 - (i == 1)) * 0.13
        V.append(ellipsoid('lid%d' % i, (sx, 0.0, top), (0.24, 0.24, 0.07), 'wood', C('#a88048'), (12, 4), cut=lambda co: co.z < -0.1))
    V.append(box('sign', (0, -d / 2 - 0.02, 2.3), (1.6, 0.06, 0.34), 'wood', C('#2f5f5a')))
    V.append(box('sign_rim', (0, -d / 2 - 0.05, 2.3), (1.72, 0.04, 0.42), 'glow', C('#d9b25a')))
    LIGHTS[name] = []
    for sx in (-1, 1):
        V += lantern('lan%d' % sx, (sx * (w / 2 + 0.05), -d / 2 - 0.25, 1.95), 0.17, RED)
        LIGHTS[name].append((sx * (w / 2 + 0.05), -d / 2 - 0.25, 1.95, WARM, 4.5, 1.0, 1.0))
    return piece(name, V, K, x)


def mcart(x, name='mcart'):
    """The chestnut roaster's cart: a big black wok over glowing coals under a paper umbrella."""
    V, K = [], []
    V.append(box('body', (0, 0.15, 0.55), (1.7, 0.9, 0.6), 'wood', C('#7a3b2a'), bevel=0.03))
    V.append(box('shelf', (0, 0.15, 0.28), (1.6, 0.85, 0.04), 'wood', C('#55291e')))
    for sx in (-1, 1):
        V.append(torus('wheel%d' % sx, (sx * 0.9, 0.35, 0.33), 0.3, 0.04, 'wood', C('#3a2a22'), (14, 4), rot=(0, 90, 0)))
    V.append(tube('brazier', (-0.25, 0.1, 0.85), (-0.25, 0.1, 1.05), 0.36, 0.3, 'stone', C('#3b3b3b'), segs=12, rings=1))
    V.append(ellipsoid('coals', (-0.25, 0.1, 1.02), (0.3, 0.3, 0.05), 'glow', C('#ff6a2a'), (10, 3)))
    V.append(ellipsoid('wok', (-0.25, 0.1, 1.2), (0.42, 0.42, 0.18), 'stone', C('#262626'), (14, 6), cut=lambda co: co.z > 0.2))
    for i in range(9):
        a = i * 2.4
        rr = 0.1 + (i % 3) * 0.08
        V.append(ellipsoid('nut%d' % i, (-0.25 + rr * math.cos(a), 0.1 + rr * math.sin(a), 1.1), (0.045, 0.045, 0.035), 'paper', C('#7a4a2a'), (6, 4)))
    V.append(tube('pole', (0.6, 0.45, 0.85), (0.6, 0.45, 2.3), 0.025, 0.025, 'wood', C('#3a2a22'), segs=5, rings=1))
    V.append(cone('umb', (0.6, 0.45, 2.05), (0.6, 0.45, 2.45), 1.05, 0.05, 'paper', C('#e0662c'), segs=12))
    V.append(box('sign', (0.1, -0.33, 0.6), (0.9, 0.02, 0.35), 'plain', C('#f3e4c8')))
    V.append(box('bags', (0.55, 0.0, 0.9), (0.4, 0.3, 0.12), 'paper', C('#c9a26a')))
    K.append(col_box('cart', (0, 0.15, 0.6), (1.9, 1.0, 1.2)))
    V += lantern('lan', (0.6, -0.2, 1.75), 0.14, WARM)
    LIGHTS[name] = [(-0.25, 0.1, 1.2, '#ff7a3a', 3.6, 1.3, 0.8), (0.6, -0.2, 1.75, WARM, 3.2, 0.6, 0.7)]
    return piece(name, V, K, x)


def lantern_post(x, name='lantern_post'):
    V = [tube('post', (0, 0, 0), (0, 0, 2.7), 0.07, 0.055, 'wood', C('#3a2a22'), segs=6, rings=1),
         box('base', (0, 0, 0.1), (0.3, 0.3, 0.2), 'stone', C(STONE_D)),
         tube('arm', (0, 0, 2.6), (0.5, 0, 2.6), 0.03, 0.03, 'wood', C('#3a2a22'), segs=5, rings=1)]
    V += lantern('lan', (0.5, 0, 2.25), 0.18, RED)
    LIGHTS[name] = [(0.5, 0, 2.25, WARM, 5.0, 1.0, 1.2)]
    return piece(name, V, [col_box('p', (0, 0, 1.3), (0.25, 0.25, 2.6))], x, ao=False)


def lantern_string(x, name='lantern_string', L=8.0, h=3.4, sag=0.45):
    """A rope of little lanterns strung across the walkway (along X); no collision."""
    V = []
    pts = []
    for i in range(9):
        t = i / 8
        pts.append(Vector((-L / 2 + L * t, 0, h - sag * 4 * t * (1 - t))))
    for i in range(8):
        V.append(tube('rope%d' % i, pts[i], pts[i + 1], 0.01, 0.01, 'wood', C('#3a2a22'), segs=3, rings=1, caps=False))
    LIGHTS[name] = []
    cols = [RED, WARM, '#ffd166', RED, WARM, '#ffd166', RED]
    for i in range(7):
        p = (pts[i] + pts[i + 1]) / 2
        V += lantern('l%d' % i, (p.x, 0, p.z - 0.2), 0.1, cols[i])
        LIGHTS[name].append((p.x, 0, p.z - 0.2, WARM, 3.0, 0.45 if i % 2 == 0 else 0.0, 0.6))
    return piece(name, V, [], x, ao=False)


def stool(x, name='stool'):
    V = [tube('seat', (0, 0, 0.36), (0, 0, 0.42), 0.2, 0.2, 'wood', C('#a8744a'), segs=10, rings=1)]
    for i in range(3):
        a = i * 2.094
        V.append(tube('leg%d' % i, (0.12 * math.cos(a), 0.12 * math.sin(a), 0.36), (0.16 * math.cos(a), 0.16 * math.sin(a), 0), 0.02, 0.02, 'wood', C('#6b4430'), segs=4, rings=1))
    return piece(name, V, [col_box('s', (0, 0, 0.2), (0.4, 0.4, 0.4))], x, ao=False)


def bench_m(x, name='bench_m', L=1.6):
    """Backless bench, 0.36 deep, seat top 0.42."""
    V = [box('seat', (0, 0, 0.39), (L, 0.36, 0.06), 'wood', C('#9c6a44'))]
    for sx in (-1, 1):
        V.append(box('leg%d' % sx, (sx * (L / 2 - 0.15), 0, 0.18), (0.08, 0.3, 0.36), 'wood', C('#5a3d2a')))
    return piece(name, V, [col_box('b', (0, 0, 0.21), (L, 0.36, 0.42))], x, ao=False)


def crate(x, name='crate'):
    V = [box('c', (0, 0, 0.25), (0.5, 0.5, 0.5), 'wood', C('#a8744a'), bevel=0.02)]
    for k in (-1, 1):
        V.append(box('slat%d' % k, (0, -0.255, 0.25 + k * 0.12), (0.52, 0.02, 0.06), 'wood', C('#7a5236')))
    V.append(ellipsoid('fruit', (0, 0, 0.5), (0.2, 0.2, 0.08), 'plain', C('#e8a13a'), (8, 4)))
    return piece(name, V, [col_box('c', (0, 0, 0.25), (0.5, 0.5, 0.5))], x, ao=False)


def bollard(x, name='bollard'):
    V = [tube('b', (0, 0, 0), (0, 0, 0.5), 0.14, 0.12, 'stone', C('#3b3b3b'), segs=8, rings=1),
         ellipsoid('cap', (0, 0, 0.5), (0.16, 0.16, 0.08), 'stone', C('#2e2e2e'), (8, 4)),
         torus('rope', (0, 0, 0.3), 0.15, 0.025, 'cloth', C('#c9b28a'), (10, 4))]
    return piece(name, V, [col_box('b', (0, 0, 0.25), (0.3, 0.3, 0.5))], x, ao=False)


def boat(x, name='boat'):
    """A little moored sampan with a lantern (no collision: it floats beside the pier)."""
    V = [superquad('hull', (0, 0, 0.1), (0.9, 2.4, 0.35), 'wood', C('#6b4430'), n=2.4, res=4, taper=-0.1),
         box('deck', (0, 0, 0.4), (1.5, 3.6, 0.05), 'wood', C('#a8744a'))]
    for i in range(5):  # a woven cabin roof: arches of cloth
        yy = -0.6 + i * 0.3
        V.append(torus('arch%d' % i, (0, yy, 0.45), 0.62, 0.05, 'cloth', C('#c9a26a'), (10, 4), rot=(90, 0, 0), arc=0.5))
    V += lantern('lan', (0, -1.6, 1.3), 0.14, RED)
    V.append(tube('pole', (0, -1.6, 0.4), (0, -1.6, 1.45), 0.02, 0.02, 'wood', C('#3a2a22'), segs=4, rings=1))
    LIGHTS[name] = [(0, -1.6, 1.3, WARM, 3.5, 0.6, 0.8)]
    return piece(name, V, [], x, ao=False)


def facade(x, name='facade_a', w=6.0, h=5.2, col='#ece6da', trim='#7a3b2a', shut='#2f5f5a'):
    """A two-storey shopfront backdrop: warm lit windows, half-shuttered shop, a tiled eave."""
    V, K = [], []
    V.append(box('wall', (0, 0.3, h / 2), (w, 0.6, h), 'plain', C(col)))
    V.append(box('plinth', (0, 0.0, 0.25), (w + 0.05, 0.1, 0.5), 'stone', C(STONE_D)))
    K.append(col_box('wall', (0, 0.3, h / 2), (w, 0.8, h)))
    # ground floor: a shop opening with a warm interior glow and half-rolled shutters
    V.append(box('shop_glow', (0, -0.01, 1.2), (w * 0.55, 0.02, 1.9), 'glow', C('#f6b35c')))
    V.append(box('shutter', (0, -0.03, 2.0), (w * 0.57, 0.04, 0.5), 'wood', C(shut)))
    for sx in (-1, 1):
        V.append(box('jamb%d' % sx, (sx * w * 0.29, -0.04, 1.25), (0.12, 0.08, 2.5), 'wood', C(trim)))
    V.append(box('lintel', (0, -0.05, 2.5), (w * 0.62, 0.1, 0.14), 'wood', C(trim)))
    # upper floor: two lit windows
    for sx in (-1, 1):
        V.append(box('win%d' % sx, (sx * w * 0.25, -0.01, 3.6), (1.1, 0.02, 0.9), 'glow', C('#ffcf86' if sx < 0 else '#f6b35c')))
        V += lattice_window((sx * w * 0.25, -0.04, 3.6), 1.1, 0.9)
    # tiled eave between the floors and a roof edge on top
    V.append(box('eave', (0, -0.35, 2.85), (w + 0.2, 0.8, 0.08), 'roof', C(TILE), rot=(-12, 0, 0)))
    V.append(box('roofedge', (0, -0.1, h + 0.1), (w + 0.3, 0.9, 0.2), 'roof', C(TILE)))
    V.append(box('ridge', (0, 0.25, h + 0.3), (w + 0.3, 0.3, 0.2), 'roof', C('#3b4045')))
    V.append(box('sign', (0, -0.12, 2.72), (1.8, 0.06, 0.32), 'wood', C(trim)))
    LIGHTS[name] = [(0, -0.6, 1.2, '#ffc46b', 3.5, 0.7, 0.0)]
    return piece(name, V, K, x)


def stage(x, name='stage', w=3.0, d=2.2):
    """The street musician's little platform with a stool and a paper-lantern canopy."""
    V, K = [], []
    V.append(box('deck', (0, 0, 0.175), (w, d, 0.35), 'wood', C('#8a5a3c'), bevel=0.02))
    K.append(col_box('deck', (0, 0, 0.175), (w, d, 0.35)))
    V.append(box('step', (0, -d / 2 - 0.2, 0.09), (1.2, 0.4, 0.18), 'wood', C('#6b4430')))
    V += [tube('seat', (0, 0.3, 0.71), (0, 0.3, 0.77), 0.2, 0.2, 'wood', C('#a8744a'), segs=10, rings=1)]
    for i in range(3):
        a = i * 2.094
        V.append(tube('leg%d' % i, (0.12 * math.cos(a), 0.3 + 0.12 * math.sin(a), 0.71), (0.16 * math.cos(a), 0.3 + 0.16 * math.sin(a), 0.35), 0.02, 0.02, 'wood', C('#6b4430'), segs=4, rings=1))
    for sx in (-1, 1):
        V.append(tube('pole%d' % sx, (sx * (w / 2 - 0.1), d / 2 - 0.1, 0.35), (sx * (w / 2 - 0.1), d / 2 - 0.1, 2.8), 0.05, 0.05, 'wood', C('#3a2a22'), segs=6, rings=1))
        K.append(col_box('pole%d' % sx, (sx * (w / 2 - 0.1), d / 2 - 0.1, 1.5), (0.15, 0.15, 3.0)))
    V.append(tube('bar', (-w / 2 + 0.1, d / 2 - 0.1, 2.75), (w / 2 - 0.1, d / 2 - 0.1, 2.75), 0.04, 0.04, 'wood', C('#3a2a22'), segs=5, rings=1))
    LIGHTS[name] = []
    for i, c in enumerate((RED, WARM, RED)):
        xx = -0.9 + i * 0.9
        V += lantern('lan%d' % i, (xx, d / 2 - 0.1, 2.4), 0.15, c)
        LIGHTS[name].append((xx, d / 2 - 0.1, 2.4, WARM, 4.0, 0.7, 0.8))
    V.append(box('banner', (0, d / 2 - 0.08, 1.6), (1.6, 0.03, 1.1), 'cloth', C('#b5483a')))
    return piece(name, V, K, x)


PIECES = [mstall_lantern, mstall_toy, mstall_tea, mstall_sweets, mstall_fish, mdumpling, mcart, lantern_post, lantern_string,
          stool, bench_m, crate, bollard, boat, lambda x: facade(x, 'facade_a'),
          lambda x: facade(x, 'facade_b', col='#e6d6bf', trim='#55291e', shut='#6b4430'), stage]


def build_kit():
    reset_scene()
    use_collection('market_kit')
    roots = []
    x = 0.0
    for fn in PIECES:
        roots.append(fn(x))
        x += 10
    objs = []
    for r in roots:
        objs += descendants(r)
    return export_glb('market_kit.glb', objs)


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


def light(pos, color=WARM, radius=4.0, intensity=1.0, glow=1.0):
    _nl[0] += 1
    return marker('LIGHT_%03d' % _nl[0], pos, color=color, radius=radius, intensity=intensity, glow=glow)


def place(piece_name, pos, rot=0.0):
    """PLACE_ marker for a kit piece, plus LIGHT_ markers for its lanterns (transformed into the zone)."""
    _n[0] += 1
    marker('PLACE_%s.%03d' % (piece_name, _n[0]), pos, rot)
    a = math.radians(rot)
    for (lx, ly, lz, col, rad, inten, glow) in LIGHTS.get(piece_name, []):
        wx = pos[0] + lx * math.cos(a) - ly * math.sin(a)
        wy = pos[1] + lx * math.sin(a) + ly * math.cos(a)
        light((wx, wy, pos[2] + lz), col, rad, inten, glow)


def col(name, c, size, rot=(0, 0, 0)):
    return box('COL_' + name, c, size, 'plain', (1, 1, 1), rot=rot)


def grid_terrain(name, x0, x1, y0, y1, nx, ny, hfn, cfn):
    bm = bmesh.new()
    verts = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            xx = x0 + (x1 - x0) * i / nx
            yy = y0 + (y1 - y0) * j / ny
            row.append(bm.verts.new((xx, yy, hfn(xx, yy))))
        verts.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    ob = mesh_obj(name, bm, 'ground', (1, 1, 1), smooth=True)
    me = ob.data
    attr = me.color_attributes['Col']
    for poly in me.polygons:
        c = cfn(*poly.center)
        for li in poly.loop_indices:
            attr.data[li].color_srgb = (c[0], c[1], c[2], KIND_CODE['ground'] / 10)
    return ob


WALL_Y = -5.2          # sea wall (the promenade's south edge)
PIER = (24.0, 28.0, -21.0)   # x0, x1, y end of the walkway; the end platform is wider
STAIRS_X = -36.0


def market():
    reset_scene()
    use_collection('market')
    rnd = random.Random(12)

    def h(x, y):
        return 0.0

    def color(x, y, z):
        if y < WALL_Y + 0.3:
            return C('#6f6a62')
        # flagstones: a slightly different tone per 1.2 m slab, darker joints every slab
        i, j = math.floor(x / 1.2), math.floor(y / 1.2)
        k = ((i * 73856093) ^ (j * 19349663)) % 7 / 7
        base = mix(C('#8f887c'), C('#a39b8c'), k)
        if 0.2 < y < 3.9:  # the walkway down the middle of the market: warmer, worn stone
            base = mix(base, C('#b09a7c'), 0.35)
        return base

    terrain = grid_terrain('GROUND_market', -46, 46, WALL_Y, 20, 92, 26, h, color)
    V = []
    # sea wall + a low stone balustrade, open where the pier starts
    V.append(box('seawall', (0, WALL_Y - 0.25, -0.55), (92, 0.5, 1.3), 'stone', C('#7f786e')))
    V.append(box('seawall_top', (0, WALL_Y - 0.25, 0.08), (92, 0.62, 0.12), 'stone', C(STONE)))
    K = []
    for (x0, x1) in ((-46, PIER[0] - 0.2), (PIER[1] + 0.2, 46)):
        cx, L = (x0 + x1) / 2, x1 - x0
        V.append(box('rail_%d' % x0, (cx, WALL_Y - 0.2, 0.62), (L, 0.18, 0.1), 'stone', C(STONE)))
        V.append(box('railb_%d' % x0, (cx, WALL_Y - 0.2, 0.2), (L, 0.22, 0.1), 'stone', C(STONE_D)))
        for k in range(int(L / 1.1)):
            V.append(box('bal_%d_%d' % (x0, k), (x0 + 0.5 + k * 1.1, WALL_Y - 0.2, 0.4), (0.12, 0.12, 0.4), 'stone', C(STONE)))
        K.append(col('rail_%d' % x0, (cx, WALL_Y - 0.25, 0.6), (L, 0.5, 1.4)))
    # the pier: plank deck on posts, a wider end platform, rails along the sides
    px0, px1, py1 = PIER
    for k in range(int((WALL_Y - py1) / 0.5)):
        yy = WALL_Y - 0.25 - k * 0.5
        V.append(box('plank%d' % k, ((px0 + px1) / 2, yy, 0.04), (px1 - px0, 0.46, 0.08), 'wood', mix(C('#8a6446'), C('#a07a54'), rnd.random())))
    V.append(box('pier_end', ((px0 + px1) / 2, py1 - 2.0, 0.04), (8.0, 4.0, 0.08), 'wood', C('#8f6a48')))
    K.append(col('pier', ((px0 + px1) / 2, (WALL_Y + py1) / 2, -0.4), (px1 - px0, WALL_Y - py1, 0.9)))
    K.append(col('pier_end', ((px0 + px1) / 2, py1 - 2.0, -0.4), (8.0, 4.0, 0.9)))
    for yy in [WALL_Y - 2 - k * 4 for k in range(4)] + [py1 - 0.2, py1 - 3.8]:
        for xx in ((px0, px1) if yy > py1 else ((px0 + px1) / 2 - 4, (px0 + px1) / 2 + 4)):
            V.append(tube('pile%.0f_%.0f' % (xx, yy), (xx, yy, -2.2), (xx, yy, 0.05), 0.15, 0.15, 'wood', C('#4a3428'), segs=6, rings=1))
    for sx, xx in ((-1, px0), (1, px1)):
        V.append(box('prail%d' % sx, (xx, (WALL_Y + py1) / 2, 0.85), (0.1, WALL_Y - py1, 0.08), 'wood', C(TIMBER)))
        for k in range(9):
            V.append(box('ppost%d_%d' % (sx, k), (xx, WALL_Y - 0.6 - k * 1.8, 0.45), (0.1, 0.1, 0.8), 'wood', C(TIMBER)))
        K.append(col('prail%d' % sx, (xx, (WALL_Y + py1) / 2, 0.6), (0.3, WALL_Y - py1, 1.2)))
    ex0, ex1 = (px0 + px1) / 2 - 4, (px0 + px1) / 2 + 4
    for sx, xx in ((-1, ex0), (1, ex1)):  # end platform: rails on its sides, open to the water at the front
        V.append(box('erail%d' % sx, (xx, py1 - 2.0, 0.85), (0.1, 4.0, 0.08), 'wood', C(TIMBER)))
        K.append(col('erail%d' % sx, (xx, py1 - 2.0, 0.6), (0.3, 4.0, 1.2)))
    for sx, (a, b) in ((-1, (ex0, px0)), (1, (px1, ex1))):
        V.append(box('eback%d' % sx, ((a + b) / 2, py1, 0.85), (abs(b - a), 0.1, 0.08), 'wood', C(TIMBER)))
        K.append(col('eback%d' % sx, ((a + b) / 2, py1, 0.6), (abs(b - a), 0.3, 1.2)))
    V.append(box('elip', ((px0 + px1) / 2, py1 - 4.05, 0.25), (8.0, 0.12, 0.35), 'wood', C(TIMBER)))
    K.append(col('elip', ((px0 + px1) / 2, py1 - 4.1, 0.5), (8.0, 0.3, 1.0)))
    # stairs up the hill to the Academy (north-west), between the shopfronts
    n = 16
    for i in range(n):
        V.append(box('st%d' % i, (STAIRS_X, 11.3 + i * 0.45, (i + 1) * 0.19 / 2), (3.0, 0.46, (i + 1) * 0.19), 'stone', C(STONE if i % 2 else STONE_D)))
    top = n * 0.19
    V.append(box('landing', (STAIRS_X, 11.3 + n * 0.45 + 1.0, top / 2), (3.0, 2.2, top), 'stone', C(STONE)))
    for sx in (-1, 1):
        V.append(box('swall%d' % sx, (STAIRS_X + sx * 1.7, 14.9, 1.6), (0.4, 8.2, 3.2), 'plain', C(PLASTER)))
        K.append(col('swall%d' % sx, (STAIRS_X + sx * 1.7, 14.9, 1.8), (0.5, 8.4, 3.6)))
    ang = math.degrees(math.atan2(top, n * 0.45))
    K.append(col('stairs', (STAIRS_X, 11.3 + n * 0.45 / 2, top / 2 - 0.1), (3.0, math.hypot(n * 0.45, top), 0.2), rot=(ang, 0, 0)))
    K.append(col('landing', (STAIRS_X, 11.3 + n * 0.45 + 1.0, top / 2), (3.0, 2.2, top)))
    # a little paifang arch over the bottom of the stairs, with the Academy's lanterns
    for sx in (-1, 1):
        V.append(tube('arch%d' % sx, (STAIRS_X + sx * 1.8, 10.6, 0), (STAIRS_X + sx * 1.8, 10.6, 3.6), 0.14, 0.12, 'wood', C(TIMBER), segs=8, rings=1))
        K.append(col('arch%d' % sx, (STAIRS_X + sx * 1.8, 10.6, 1.8), (0.35, 0.35, 3.6)))
    V.append(box('archbeam', (STAIRS_X, 10.6, 3.4), (4.2, 0.25, 0.25), 'wood', C(TIMBER)))
    V += roof('archroof', (STAIRS_X, 10.6, 3.6), 4.0, 0.5, 0.7, over=0.4, lift=0.3, res=(12, 4))
    V.append(box('archplaque', (STAIRS_X, 10.45, 3.0), (1.4, 0.06, 0.4), 'wood', C('#2f5f5a')))
    # the far shore: the Quiet District, low hills and rooftops (its lanterns are POINT_far_* glows)
    for i in range(26):
        xx = -95 + i * 7.6 + rnd.uniform(-2, 2)
        yy = -96 - rnd.uniform(0, 12)
        w, d, hh = rnd.uniform(4, 7), rnd.uniform(4, 6), rnd.uniform(3, 8)
        dark = mix(C('#2c3048'), C('#3a3d58'), rnd.random())
        V.append(box('far%d' % i, (xx, yy, hh / 2 - 0.5), (w, d, hh), 'plain', dark))
        V.append(cone('farroof%d' % i, (xx, yy, hh - 0.5), (xx, yy, hh + 1.3), w * 0.72, 0.2, 'plain', C('#22253a'), segs=4))
    for i in range(9):
        xx = -110 + i * 28
        V.append(ellipsoid('hill%d' % i, (xx, -122, -2), (22, 10, 14 + (i % 3) * 5), 'plain', C('#1e2234'), (10, 5)))
    meshes = join_mixed(V, 'market')
    bake_ao(meshes, occluders=meshes + [terrain], dist=0.9, samples=12, strength=0.4)

    # invisible bounds
    K.append(col('b_west', (-46.5, 7, 3), (0.5, 26, 8)))
    K.append(col('b_east', (46.5, 7, 3), (0.5, 26, 8)))
    K.append(col('b_north_w', ((-46 + STAIRS_X - 1.5) / 2, 12.2, 3), (STAIRS_X - 1.5 + 46, 0.6, 8)))
    K.append(col('b_north_e', ((STAIRS_X + 1.5 + 46) / 2, 12.2, 3), (46 - STAIRS_X - 1.5, 0.6, 8)))
    K.append(col('b_stairs_top', (STAIRS_X, 20.2, 5), (3.0, 0.5, 6)))
    join(K, 'COL_market')

    # ---------------- kit placements (stalls line both sides of the walkway; fronts face the walkway)
    NORTH, SOUTH = 6.2, -2.2
    place('mstall_tea', (-28, NORTH, 0))
    place('mdumpling', (-13, NORTH + 0.2, 0))
    place('mcart', (-4, NORTH - 0.4, 0))
    place('mstall_sweets', (6, NORTH, 0))
    place('mstall_fish', (15, NORTH, 0))
    place('mstall_tea', (32, NORTH, 0))
    place('stage', (-28, SOUTH - 0.4, 0), rot=180)
    place('mstall_lantern', (-16, SOUTH, 0), rot=180)
    place('mstall_toy', (4, SOUTH, 0), rot=180)
    place('mstall_fish', (14, SOUTH, 0), rot=180)
    place('mstall_sweets', (36, SOUTH, 0), rot=180)
    for i, xx in enumerate(range(-44, 46, 6)):
        if abs(xx - STAIRS_X) < 3.5:
            continue
        place('facade_a' if i % 2 else 'facade_b', (xx, 11.6, 0))
    for xx in (-22, -8, 10, 21, 30, 40):
        place('lantern_string', (xx, 2.0, 0), rot=90)
    for xx in (-42, -34, -22, -9, 0, 9, 20, 32, 42):
        place('lantern_post', (xx, WALL_Y + 0.35, 0), rot=90)
    for yy in (WALL_Y - 4, WALL_Y - 9.5, PIER[2] - 0.3):
        for xx in (PIER[0] + 0.25, PIER[1] - 0.25):
            place('lantern_post', (xx, yy, 0.08), rot=0 if xx < 26 else 180)
    place('boat', (21.2, -13.5, -0.7), rot=4)
    place('boat', (31.0, -18.0, -0.7), rot=-8)
    for (xx, yy) in ((PIER[0] - 3.4, PIER[2] - 3.6), (PIER[1] + 3.4, PIER[2] - 3.6), (PIER[0] - 3.4, PIER[2] - 0.5), (PIER[1] + 3.4, PIER[2] - 0.5)):
        place('bollard', (xx, yy, 0.08))
    for (xx, yy, r) in ((-18.2, SOUTH - 1.2, 10), (-18.8, SOUTH - 0.6, 30), (2.0, SOUTH - 1.3, -15), (16.5, NORTH + 1.2, 0), (-30.5, NORTH + 0.9, 20)):
        place('crate', (xx, yy, 0), rot=r)
    # seats: stools facing each flock's stall, a bench on the pier end facing the water
    place('stool', (-16, 2.25, 0))
    place('stool', (4, 2.25, 0))
    place('bench_m', (26, PIER[2] - 1.2, 0.08))
    place('bench_m', (-6, WALL_Y + 1.0, 0), rot=180)
    place('bench_m', (-20, WALL_Y + 1.0, 0), rot=180)
    place('stool', (-11.0, 3.6, 0))
    place('stool', (-3.0, 3.6, 0))
    # a warm light over the promenade near the stairs (the way home) and on the stage
    light((STAIRS_X, 10.2, 2.8), WARM, 5.0, 0.8, 1.0)

    # ---------------- markers
    marker('SPAWN_start', (STAIRS_X + 0.2, 9.0, 0), rot=-30)   # at the foot of the stairs, facing the market
    marker('SPAWN_stairs', (STAIRS_X + 0.2, 9.0, 0), rot=-30)
    area('TRIGGER_academy', (STAIRS_X, 18.6, top + 1.0), (1.4, 0.9, 1.5))
    marker('NPC_tangtang', (STAIRS_X + 1.1, 8.6, 0), rot=180, model='tangtang', anim='idle')
    marker('NPC_weibao', (STAIRS_X - 1.0, 8.8, 0), rot=180, model='weibao', anim='idle')
    # vendors behind their counters, the musician on the stage, parents and lost children, a few shoppers
    for (name, model, x, y, r) in (
            ('tea', 'folk_a', -28, NORTH + 0.75, 0), ('dumpling', 'folk_c', -13, NORTH + 0.9, 0), ('chestnut', 'folk_a', -4.0, NORTH + 0.55, 0),
            ('sweets', 'folk_b', 6, NORTH + 0.75, 0), ('fishball', 'folk_c', 15, NORTH + 0.75, 0),
            ('lanternseller', 'folk_b', -16, SOUTH - 0.75, 180), ('toyseller', 'folk_c', 4, SOUTH - 0.75, 180)):
        marker('NPC_' + name, (x, y, 0), rot=r, model=model, anim='idle')
    marker('NPC_musician', (-28, SOUTH - 0.4 - 0.1, 0), rot=180, model='folk_b', anim='sit', seat=0.77)
    for (name, model, x, y, r, anim) in (
            ('parent1', 'folk_a', 31, 3.4, -100, 'idle'), ('parent2', 'folk_c', -33.5, 3.0, 60, 'idle'), ('parent3', 'folk_b', -7.5, 8.2, 160, 'idle'),
            ('kid1', 'folk_kid', -22.5, 3.6, 30, 'shy'), ('kid2', 'folk_kid', 10.5, WALL_Y + 0.9, 200, 'shy'), ('kid3', 'folk_kid', 26.6, -10.5, 140, 'shy'),
            ('shopper1', 'folk_b', -1.0, 2.6, 110, 'talk'), ('shopper2', 'folk_a', 0.2, 1.4, -60, 'idle'), ('shopper3', 'folk_c', 20.5, 3.2, 200, 'wave'),
            ('shopper4', 'folk_a', 38.0, 1.5, 250, 'idle')):
        marker('NPC_' + name, (x, y, 0), rot=r, model=model, anim=anim)
    # the three sparrow flocks: at the lantern stall (the tutorial), the toy stall, the end of the pier
    flocks = {
        1: [(-17.1, SOUTH + 0.2, 1.0), (-15.4, SOUTH + 0.1, 1.0), (-16.2, SOUTH - 0.95, 2.6)],
        2: [(2.9, SOUTH + 0.15, 1.0), (4.7, SOUTH + 0.2, 1.0), (5.6, SOUTH - 0.9, 2.6), (3.2, SOUTH + 1.4, 0)],
        3: [(24.6, PIER[2] - 3.6, 0.6), (27.4, PIER[2] - 3.8, 0.6), (23.2, PIER[2] - 2.0, 0.95), (28.8, PIER[2] - 1.5, 0.95), (26.0, PIER[2] - 3.9, 0.45)],
    }
    k = 0
    for f, pts in flocks.items():
        for p in pts:
            k += 1
            marker('GRUMB_sparrow_%d' % k, p, species='sparrow', flock=f)
    area('AREA_flock1', (-16, 0.2, 1.5), (4.5, 3.0, 1.5))
    area('AREA_flock2', (4, 0.2, 1.5), (4.5, 3.0, 1.5))
    area('AREA_flock3', (26, PIER[2] - 1.8, 1.5), (3.6, 3.0, 1.5))
    # seat markers (centre of the seat's front edge; seat-top height) and each flock's free good things
    marker('SEAT_flock1', (-16, 2.05, 0), rot=0, seat=0.42, flock=1)
    marker('SEAT_flock2', (4, 2.05, 0), rot=0, seat=0.42, flock=2)
    marker('SEAT_flock3', (26, PIER[2] - 1.38, 0.08), rot=0, seat=0.42, flock=3)
    goods = {
        1: [('chestnut', (-4.3, NORTH - 0.3, 1.9)), ('lanterns', (-15, WALL_Y - 5, 0.2)), ('moon', (-60, -150, 70))],
        2: [('steam', (-13, NORTH + 0.1, 1.8)), ('music', (-28, SOUTH - 0.3, 2.0)), ('lanterns', (4, WALL_Y - 5, 0.2))],
        3: [('lanterns', (26, PIER[2] - 12, 0.1)), ('moon', (-60, -150, 70)), ('stars', (40, -80, 60))],
    }
    for f, lst in goods.items():
        for kind, p in lst:
            marker('GOOD_%d_%s' % (f, kind), p, kind=kind, flock=f)
    # story spots and camera shots
    marker('POINT_dumpling', (-13, 4.4, 0), rot=0)
    marker('POINT_chestnut', (-4.0, 4.3, 0), rot=0)
    marker('POINT_launch', (26, PIER[2] - 3.2, 0.08), rot=0)
    marker('POINT_hook', (-2.0, WALL_Y + 0.9, 0), rot=0)
    marker('POINT_tutorial', (-16, 3.4, 0), rot=0)
    marker('CAM_arrive', (-31.0, 5.0, 2.6))
    marker('CAM_flock1', (-12.6, 3.8, 2.3))
    marker('CAM_dumpling', (-10.2, 2.6, 2.1))
    marker('CAM_hook', (-2.0, 1.2, 2.3))
    marker('CAM_launch', (26.0, PIER[2] + 1.5, 2.4))
    area('WATER_harbour', (0, -62, -0.75), (150, 57, 1))
    for i in range(64):  # the far shore's lanterns (they go out at the end of Chapter 2)
        xx = -95 + (i % 32) * 6.1 + rnd.uniform(-2, 2)
        yy = -93 - rnd.uniform(0, 14) - (i // 32) * 3
        marker('POINT_far_%d' % (i + 1), (xx, yy, rnd.uniform(0.5, 6.5)))
    return export_glb('market.glb', [o for o in bpy.context.scene.objects])


if __name__ == '__main__':
    print('built', build_kit())
    print('built', market())
