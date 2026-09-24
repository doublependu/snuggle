"""Zone scenes: the Rainy Train (prologue), Lantern Bay station and Mistbloom Academy.

Blender is the level editor: visual meshes, COL_* colliders, GROUND_* meshes (visual + collision) and
marker empties that the runtime (src/world/zone.js) reads:
  SPAWN_<id>   player spawn (empty -Y = facing)      NPC_<id>     character placement (props: model, anim, seat)
  GRUMB_<id>   Grumbling (props: species)            POINT_<id>   script / interactable spot (props vary)
  PLACE_<piece>.nnn  kit instance from kit.glb       SCATTER_<kind>  procedural foliage area (scale = extents)
  WATER_<id>   water surface (scale = extents)       TRIGGER_<id> box volume (scale = half extents)
Run a single zone with ONLY=['train'] in the exec globals."""
import os, sys, importlib, math, random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *

C = srgb


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


def place(piece, pos, rot=0.0, n=[0]):
    n[0] += 1
    return marker('PLACE_%s.%03d' % (piece, n[0]), pos, rot)


def col(name, c, size, rot=(0, 0, 0)):
    return box('COL_' + name, c, size, 'plain', (1, 1, 1), rot=rot)


def grid_terrain(name, x0, x1, y0, y1, nx, ny, hfn, cfn, kind='ground'):
    bm = bmesh.new()
    verts = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * j / ny
            row.append(bm.verts.new((x, y, hfn(x, y))))
        verts.append(row)
    for j in range(ny):
        for i in range(nx):
            q = (verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i])
            bm.faces.new(q)
    ob = mesh_obj(name, bm, kind, (1, 1, 1), smooth=True)
    me = ob.data
    attr = me.color_attributes['Col']
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            c = cfn(v.x, v.y, v.z)
            attr.data[li].color_srgb = (c[0], c[1], c[2], KIND_CODE['ground'] / 10)
    return ob


def export_zone(name, objs_root_coll):
    objs = [o for o in bpy.context.scene.objects]
    for o in objs:
        if o.type == 'MESH' and o.name.startswith('COL_'):
            o.display_type = 'WIRE'
    return export_glb(name + '.glb', objs)


# ---------------------------------------------------------------- the Rainy Train (interior)

def train():
    reset_scene()
    use_collection('train')
    L, W, H = 16.0, 3.0, 2.55
    wood, wood_d, cream, brass = C('#a8744a'), C('#6e4a30'), C('#efe5cf'), C('#c9a24a')
    seat, seat_d = C('#3e7a73'), C('#2f5f59')
    V = []
    V.append(box('floor', (0, 0, -0.05), (L, W, 0.1), 'wood', C('#8a6446')))
    V.append(box('runner', (0, 0, 0.003), (L - 0.4, 0.8, 0.01), 'cloth', C('#a8433a')))
    V.append(box('runner_edge', (0, 0, 0.002), (L - 0.3, 0.9, 0.008), 'cloth', C('#d9b25a')))
    # side walls: lower panel, window band with openings, upper band
    nwin = 7
    bay = L / nwin
    for sy in (-1, 1):
        y = sy * (W / 2)
        V.append(box('lower%d' % sy, (0, y, 0.45), (L, 0.12, 0.9), 'wood', wood))
        V.append(box('upper%d' % sy, (0, y, 2.12), (L, 0.12, 0.44), 'plain', cream))
        V.append(box('sill%d' % sy, (0, y - sy * 0.08, 0.92), (L, 0.2, 0.05), 'wood', wood_d))
        for i in range(nwin + 1):
            xx = -L / 2 + i * bay
            V.append(box('pillar%d_%d' % (sy, i), (xx, y, 1.4), (0.5 if 0 < i < nwin else 0.3, 0.14, 1.0), 'wood', wood))
        for i in range(nwin):
            xx = -L / 2 + (i + 0.5) * bay
            V.append(box('glass%d_%d' % (sy, i), (xx, y + sy * 0.03, 1.4), (bay - 0.5, 0.02, 0.98), 'glass', C('#bcd6de')))
            V.append(box('frame%d_%d' % (sy, i), (xx, y - sy * 0.02, 1.88), (bay - 0.45, 0.06, 0.05), 'wood', brass))
    # ceiling (slightly arched) and lamps
    V.append(box('ceil_flat', (0, 0, 2.5), (L, W, 0.06), 'plain', cream))
    for i in range(nwin + 1):
        V.append(box('ceil_rib%d' % i, (-L / 2 + i * bay, 0, 2.45), (0.12, W, 0.08), 'wood', wood))
    for i in range(nwin):
        xx = -L / 2 + (i + 0.5) * bay
        V.append(ellipsoid('lamp%d' % i, (xx, 0, 2.47), (0.18, 0.18, 0.1), 'glow', C('#ffd89a'), (10, 6)))
        V.append(torus('lampring%d' % i, (xx, 0, 2.47), 0.19, 0.025, 'wood', brass, (12, 4)))
    # end walls with doors
    for sx in (-1, 1):
        x = sx * L / 2
        V.append(box('end%d' % sx, (x, 0, H / 2), (0.14, W, H), 'wood', wood))
        V.append(box('door%d' % sx, (x - sx * 0.08, 0, 1.0), (0.05, 0.9, 2.0), 'wood', wood_d))
        V.append(box('doorwin%d' % sx, (x - sx * 0.11, 0, 1.45), (0.02, 0.5, 0.6), 'glass', C('#bcd6de')))
        V.append(ellipsoid('knob%d' % sx, (x - sx * 0.12, 0.3, 1.0), (0.04, 0.04, 0.04), 'glow', brass, (6, 4)))
    # seat bays: pairs of benches facing each other either side of the aisle
    K = [col('floor', (0, 0, -0.1), (L, W, 0.2))]
    for sy in (-1, 1):
        K.append(col('wall%d' % sy, (0, sy * (W / 2 + 0.1), H / 2), (L, 0.3, H)))
        K.append(col('end%d' % sy, (sy * (L / 2 + 0.1), 0, H / 2), (0.3, W, H)))
    K.append(col('ceiling', (0, 0, H + 0.1), (L, W, 0.2)))
    seats = []
    for i in range(nwin):
        cx = -L / 2 + (i + 0.5) * bay
        for sy in (-1, 1):
            yc = sy * 0.95
            for face in (-1, 1):  # bench at the bay end, facing the bay centre
                bx = cx + face * (bay / 2 - 0.35)
                V.append(box('cush%d%d%d' % (i, sy, face), (bx, yc, 0.44), (0.5, 1.05, 0.12), 'cloth', seat))
                V.append(box('base%d%d%d' % (i, sy, face), (bx, yc, 0.2), (0.48, 1.0, 0.38), 'wood', wood_d))
                V.append(box('back%d%d%d' % (i, sy, face), (bx + face * 0.27, yc, 0.88), (0.1, 1.05, 0.85), 'cloth', seat_d))
                V.append(box('backtop%d%d%d' % (i, sy, face), (bx + face * 0.27, yc, 1.32), (0.14, 1.07, 0.06), 'wood', wood))
                K.append(col('bench%d%d%d' % (i, sy, face), (bx + face * 0.05, yc, 0.55), (0.62, 1.05, 1.1)))
                seats.append((bx + face * 0.1, yc, face))
        # luggage racks
        for sy in (-1, 1):
            V.append(box('rack%d%d' % (i, sy), (cx, sy * 1.15, 2.02), (bay - 0.6, 0.55, 0.03), 'wood', brass))
            V.append(tube('rackbar%d%d' % (i, sy), (cx - bay / 2 + 0.3, sy * 0.9, 2.04), (cx + bay / 2 - 0.3, sy * 0.9, 2.04), 0.02, 0.02, 'wood', brass, segs=5, rings=1))
    # a few bags on the racks, Xiao Pei's cardboard suitcase near her seat
    for i, (xx, sy, colr) in enumerate(((-5.2, 1, '#8a5a8a'), (-0.6, -1, '#5f8a5a'), (3.9, 1, '#b5483a'), (6.2, -1, '#3e6f8a'))):
        V.append(superquad('bag%d' % i, (xx, sy * 1.15, 2.2), (0.3, 0.2, 0.15), 'cloth', C(colr), n=3, res=2, smooth=True))
    V.append(box('suitcase', (-5.75, 0.55, 0.22), (0.5, 0.18, 0.4), 'paper', C('#c49a64')))
    V.append(tube('suit_str', (-5.75, 0.45, 0.43), (-5.75, 0.65, 0.43), 0.012, 0.012, 'cloth', C('#e8dcc0'), segs=4, rings=1))
    meshes = join_mixed(V, 'carriage')
    bake_ao(meshes, dist=0.7, samples=24, strength=0.55)
    join(K, 'COL_train')

    # markers
    marker('SPAWN_start', (-5.9, -0.05, 0.02), rot=90)       # facing +x down the aisle
    marker('POINT_seat', (seats[2][0], seats[2][1], 0.0), rot=-90 * seats[2][2], seat=0.5)
    marker('GRUMB_cloud', (2.0, 0.0, 0.0), species='cloud')
    marker('CAM_intro', (-7.4, 0.2, 1.7))
    marker('CAM_lap', (-4.2, -0.4, 1.3))
    marker('CAM_window', (-2.0, -0.2, 1.5))
    marker('POINT_arrive', (7.3, 0, 0))
    # seated passengers (bench index -> seat pose); facing = toward bay centre
    folk = [('NPC_auntie', 9, 'folk_a'), ('NPC_student', 13, 'folk_b'), ('NPC_worker', 12, 'folk_c'),
            ('NPC_p4', 18, 'folk_a'), ('NPC_p5', 22, 'folk_c'), ('NPC_p6', 25, 'folk_b')]
    for name, si, model in folk:
        x, y, face = seats[si]
        marker(name, (x, y, 0.0), rot=-90 * face, model=model, anim='sit', seat=0.5)
    return export_zone('train', None)


# ---------------------------------------------------------------- Lantern Bay station, plaza and the hill path

def seg_d2(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / max(1e-9, dx * dx + dy * dy)))
    qx, qy = ax + dx * t, ay + dy * t
    return math.hypot(px - qx, py - qy), t


def poly_dist(x, y, pts):
    best = (1e9, 0, 0)
    for i in range(len(pts) - 1):
        d, t = seg_d2(x, y, *pts[i][:2], *pts[i + 1][:2])
        if d < best[0]:
            best = (d, i, t)
    return best


def station():
    reset_scene()
    use_collection('station')
    rnd = random.Random(5)
    PATH = [(30, 17, 0.0), (24, 32, 3.7), (36, 46, 7.4), (28, 60, 11.0), (30, 70, 13.2)]
    PLAT_Z = 0.9

    def path_z(i, t):
        return PATH[i][2] + (PATH[i + 1][2] - PATH[i][2]) * t

    def h(x, y):
        if y < -4.5:
            return -1.4 + 0.9 * max(0.0, (y + 8) / 3.5)
        z = 0.0
        if y > 16:
            z = min(14.5, (y - 16) * 0.255) + 0.7 * math.sin(x * 0.17) * math.cos(y * 0.13) * min(1, (y - 16) / 8)
        z += max(0.0, x - 40) * 0.7 + max(0.0, -26 - x) * 0.7
        d, i, t = poly_dist(x, y, PATH)
        if d < 3.5 and y > 15:
            k = max(0.0, 1 - max(0.0, d - 1.6) / 1.9)
            z = z * (1 - k) + path_z(i, t) * k
        return z

    def color(x, y, z):
        d, i, t = poly_dist(x, y, PATH)
        if y < -4.2:
            return mix(C('#9a948a'), C('#7f7a70'), rnd.random() * 0.5)
        if -4.2 <= y < 0.2:
            return C('#8c7f6c')
        if d < 1.7 and y > 15:
            return mix(C('#bba98c'), C('#a8977a'), rnd.random())
        if 12 < x < 42 and -3 < y < 17:
            return mix(C('#cfc6b4'), C('#bfb5a2'), rnd.random() * 0.8)
        g = mix(C('#86a863'), C('#9cbb72'), 0.5 + 0.5 * math.sin(x * 0.3 + y * 0.2))
        return mix(g, C('#6f9150'), rnd.random() * 0.3)

    terrain = grid_terrain('GROUND_station', -34, 52, -9, 82, 64, 70, h, color, kind='ground')
    V = []
    # platform with a yellow safety edge, track bed and rails
    V.append(box('platform', (-4, 3.7, PLAT_Z / 2), (36, 6.4, PLAT_Z), 'stone', C('#c7bfb0'), bevel=0.04))
    V.append(box('plat_edge', (-4, 0.55, PLAT_Z + 0.005), (36, 0.3, 0.02), 'glow', C('#e2b33a')))
    K = [col('platform', (-4, 3.7, PLAT_Z / 2), (36, 6.4, PLAT_Z))]
    V.append(box('bed', (8, -2.2, 0.08), (90, 4.0, 0.16), 'stone', C('#8a8074')))
    for sy in (-2.9, -1.5):
        V.append(box('rail%.1f' % sy, (8, sy, 0.24), (90, 0.1, 0.12), 'stone', C('#6e6e70')))
    for i in range(45):
        V.append(box('sleeper%d' % i, (-36 + i * 2, -2.2, 0.17), (0.25, 2.2, 0.08), 'wood', C('#6b5240')))
    # steps down from the platform's east end to the plaza
    for i in range(5):
        hgt = PLAT_Z * (5 - i) / 5
        V.append(box('pstep%d' % i, (14.2 + i * 0.36, 3.7, hgt / 2), (0.38, 4.0, hgt), 'stone', C('#b9b1a3')))
    ang = math.degrees(math.atan2(PLAT_Z, 1.9))
    K.append(col('psteps', (15.1, 3.7, PLAT_Z / 2 - 0.08), (math.hypot(1.9, PLAT_Z), 4.0, 0.16), rot=(0, ang, 0)))
    # signboard over the station building
    V.append(box('sign', (-4, 8.9, 4.2), (4.2, 0.12, 0.8), 'wood', C('#2f5f5a')))
    V.append(box('sign_rim', (-4, 8.95, 4.2), (4.4, 0.1, 0.95), 'glow', C('#d9b25a')))
    meshes = join_mixed(V, 'station')
    bake_ao(meshes, occluders=meshes + [terrain], dist=1.2, samples=16, strength=0.45)
    # invisible bounds: shore, hill sides, back of the station
    K.append(col('b_shore', (8, -4.7, 1.5), (90, 0.4, 4)))
    K.append(col('b_west', (-24, 30, 5), (0.4, 80, 20)))
    K.append(col('b_east', (43, 30, 8), (0.4, 80, 30)))
    K.append(col('b_north', (8, 76, 18), (90, 0.4, 12)))
    K.append(col('train', (-6, -2.2, 1.6), (16.4, 3.2, 3.2)))
    join(K, 'COL_station')

    # kit placements
    place('train_shell', (-6, -2.2, 0.25))
    for x in (-18, -12, -6, 0, 6):
        place('canopy', (x, 4.6, PLAT_Z))
    place('hall_small', (-4, 12.2, 0))
    place('bench', (-13, 6.3, PLAT_Z))
    place('bench', (-1, 6.3, PLAT_Z))
    place('stall', (9.5, 5.0, PLAT_Z))
    for x in (-19, -7, 5):
        place('lamp_post', (x, 1.1, PLAT_Z), rot=90)
    for x, y, r in ((18, 2, 0), (24, 12, 30), (34, 6, -20)):
        place('stall', (x, y, 0), rot=r)
    for i in range(len(PATH) - 1):
        (x0, y0, z0), (x1, y1, z1) = PATH[i], PATH[i + 1]
        place('lamp_post', ((x0 + x1) / 2 + 2.2, (y0 + y1) / 2, (z0 + z1) / 2), rot=180)
    place('stone_lantern', (16, 14, 0))
    place('stone_lantern', (38, 14, 0))
    place('gate', (30, 70.5, 13.2))
    place('wall', (25.5, 71.5, 13.0), rot=0)
    place('wall', (34.5, 71.5, 13.0), rot=0)
    # the far shore of Lantern Bay across the water (Chapter 2 hook: the Quiet District)
    for i in range(9):
        x = -60 + i * 16 + rnd.uniform(-3, 3)
        place('hall_small' if i % 3 else 'hall', (x, -78 - rnd.uniform(0, 8), -0.2), rot=180 + rnd.uniform(-10, 10))
    place('pagoda', (30, -92, -0.2))

    # markers
    marker('SPAWN_start', (-6, 1.3, PLAT_Z), rot=180)
    marker('SPAWN_hill', (30, 66, 12.2), rot=0)
    marker('NPC_tangtang', (-2.2, 3.4, PLAT_Z), rot=-90, model='tangtang', anim='idle')
    marker('NPC_vendor', (9.5, 6.3, PLAT_Z), rot=0, model='folk_c', anim='idle')
    marker('NPC_fisher', (22, -2.8, 0), rot=150, model='folk_a', anim='idle')
    marker('NPC_kid', (28, 9, 0), rot=200, model='folk_b', anim='wave')
    marker('POINT_sign', (-1.2, 2.3, PLAT_Z), rot=-60)
    marker('CAM_platform', (-11, -0.2, 2.6))
    marker('CAM_tangtang', (-4.6, 1.1, 2.1))
    pts = [(8, 3.2, PLAT_Z), (15.9, 3.7, 0.0)] + [(x, y, z) for (x, y, z) in PATH[1:]]
    for i, (x, y, z) in enumerate(pts):
        marker('POINT_path_%d' % (i + 1), (x, y, z))
    area('TRIGGER_academy', (30, 72.5, 14.2), (3.2, 1.2, 2.5))
    area('WATER_harbour', (8, -70, -0.65), (180, 130, 1))
    area('SCATTER_tree_hill1', (12, 45, 8), (14, 22, 1), count=26)
    area('SCATTER_tree_hill2', (45, 45, 10), (6, 24, 1), count=12)
    area('SCATTER_tree_back', (-12, 24, 2), (12, 10, 1), count=14)
    area('SCATTER_maple', (20, 30, 5), (6, 8, 1), count=6)
    return export_zone('station', None)


# ---------------------------------------------------------------- Mistbloom Academy (Chapter 1 hub)

def academy():
    reset_scene()
    use_collection('academy')
    rnd = random.Random(9)
    POND = (26.0, 4.0, 9.0, 10.0)      # cx, cy, rx, ry
    ISLAND = (27.4, 6.0, 1.7)
    STREAM = [(24.0, -5.5), (23.5, -14.0), (24.5, -24.0)]
    RISE = (-36.0, 42.0, 10.0, 3.2)    # pagoda hill
    PATHS = [
        [(0, -33), (0, 10)], [(0, 17), (0, 32)],                       # main axis
        [(-12, -8), (-21, -12)],                                      # courtyard -> kitchen
        [(-10, 2), (-26, 14), (-26, 26)],                             # -> dorms
        [(-12, -14), (-18, -22), (-23, -27)],                         # -> laundry (moon gate)
        [(12, -8), (22, -12), (30, -12), (38, -6), (38, 16), (32, 21)],  # -> bridge -> library
        [(-6, 30), (-14, 40)],                                        # -> practice yard
        [(-24, 30), (-30, 37), (-34, 41)],                            # -> pagoda
        [(14, -18), (20, -30), (24, -36)],                            # -> overlook
    ]

    def pond_k(x, y):
        return ((x - POND[0]) / POND[2]) ** 2 + ((y - POND[1]) / POND[3]) ** 2

    def stream_d(x, y):
        return poly_dist(x, y, STREAM)[0]

    def h(x, y):
        z = 0.0
        # pagoda rise
        d = math.hypot(x - RISE[0], y - RISE[1])
        if d < RISE[2]:
            t = 1 - d / RISE[2]
            z += RISE[3] * (t * t * (3 - 2 * t)) * 1.25
        z = min(z, RISE[3])
        # outer hills hide the world edge
        z += max(0.0, abs(x) - 46) ** 1.3 * 0.9 + max(0.0, y - 53) ** 1.3 * 0.9
        # south cliff down to the harbour (behind the wall / overlook railing)
        if y < -40:
            z -= min(14.0, (-40 - y) * 2.2)
        # south of the gate the hill path descends
        if -40 <= y < -35 and abs(x) < 3:
            z -= (-35 - y) * 0.4
        # pond, island and stream
        k = pond_k(x, y)
        if k < 1.35:
            depth = 2.4 * max(0.0, min(1.0, (1.35 - k) / 0.55))
            z -= depth
        di = math.hypot(x - ISLAND[0], y - ISLAND[1])
        if di < ISLAND[2] + 1.0:
            z = max(z, 0.12 - max(0.0, di - ISLAND[2]) * 1.2)
        sd = stream_d(x, y)
        if sd < 3.2 and y < -3:
            z -= 1.9 * max(0.0, min(1.0, (3.2 - sd) / 1.4))
        return z

    def color(x, y, z):
        if z < -0.35:
            return mix(C('#6e7a5a'), C('#5a6650'), rnd.random() * 0.5) if z > -1.0 else C('#4a5a52')
        if z < -0.05 and (pond_k(x, y) < 1.6 or stream_d(x, y) < 3.6):
            return C('#c9b893')
        for pts in PATHS:
            if poly_dist(x, y, pts)[0] < 1.5:
                return mix(C('#cbbfa6'), C('#b8ab90'), rnd.random())
        if -18 < y < 6 and -14 < x < 14:
            return mix(C('#d2c9b6'), C('#c0b6a2'), rnd.random() * 0.8)
        if -32 < x < -16 and -34 < y < -20:
            return mix(C('#b6a88c'), C('#a39679'), rnd.random())   # laundry yard: packed earth
        if -21 < x < -7 and 37 < y < 49:
            return mix(C('#a9b872'), C('#98a866'), rnd.random())   # practice field
        g = mix(C('#83a45f'), C('#9ab86e'), 0.5 + 0.5 * math.sin(x * 0.21 + y * 0.17) * math.cos(y * 0.09))
        return mix(g, C('#6f9150'), rnd.random() * 0.25)

    terrain = grid_terrain('GROUND_academy', -56, 56, -58, 62, 80, 86, h, color, kind='ground')
    V = []
    # courtyard paving border and the pond's stone rim stones
    for i in range(28):
        a = i / 28 * math.tau
        x = POND[0] + math.cos(a) * POND[2] * 1.12
        y = POND[1] + math.sin(a) * POND[3] * 1.12
        if abs(y - (-5.5)) < 2.5 and abs(x - 24) < 3:
            continue  # stream outlet
        V.append(ico('rim%d' % i, (x, y, h(x, y) + 0.05), (0.55 + rnd.random() * 0.4, 0.5 + rnd.random() * 0.4, 0.35 + rnd.random() * 0.3), 'stone', C('#b7b0a2'), subdiv=1, jitter=0.3, seed=i))
    # the island's little shrine for the lemon candy
    V.append(box('shrine', (ISLAND[0], ISLAND[1] + 0.6, 0.45), (0.5, 0.4, 0.6), 'wood', C('#7a3b2a')))
    V.append(cone('shrine_roof', (ISLAND[0], ISLAND[1] + 0.6, 0.75), (ISLAND[0], ISLAND[1] + 0.6, 1.05), 0.45, 0.05, 'roof', C('#4d5358'), segs=4))
    # practice-yard goal posts and a ball
    for sx in (-1, 1):
        V.append(tube('goal%d' % sx, (-14 + sx * 1.4, 48, 0), (-14 + sx * 1.4, 48, 1.6), 0.06, 0.06, 'wood', C('#ece6da'), segs=6, rings=1))
    V.append(tube('goalbar', (-15.4, 48, 1.6), (-12.6, 48, 1.6), 0.06, 0.06, 'wood', C('#ece6da'), segs=6, rings=1))
    V.append(ico('ball', (-12, 43, 0.22), (0.22, 0.22, 0.22), 'paper', C('#e0662c'), subdiv=1))
    meshes = join_mixed(V, 'academy')
    bake_ao(meshes, occluders=meshes + [terrain], dist=1.0, samples=12, strength=0.4)

    K = []
    K.append(col('b_west', (-47, 5, 5), (0.5, 120, 20)))
    K.append(col('b_east', (47, 5, 5), (0.5, 120, 20)))
    K.append(col('b_north', (0, 54, 5), (100, 0.5, 20)))
    K.append(col('b_south_w', (-17, -35.2, 2), (62, 0.5, 6)))
    K.append(col('b_south_e', (31, -40.2, 2), (34, 0.5, 6)))
    K.append(col('b_gate_s', (0, -36.5, 1.5), (6, 0.5, 4)))
    K.append(col('b_link', (14.2, -37.6, 2), (0.5, 5.4, 6)))
    join(K, 'COL_academy')

    # ---------------- kit placements
    place('gate', (0, -34.3, 0))
    for sgn in (-1, 1):
        x = 4.5
        while x < 41:
            if sgn > 0 and x > 13:
                break
            place('wall', (sgn * x, -34.3, 0))
            x += 4
    place('hall', (0, 37, 0))
    place('pavilion', (0, 14, 0))
    place('library', (30, 26, 0))
    place('hall_open', (-26, -12, 0), rot=90)
    place('stove', (-27.9, -12, 0.6), rot=90)
    place('table', (-25.4, -12, 0.6), rot=90)
    place('shelf', (-27.8, -14.2, 0.6), rot=90)
    place('hall_small', (-31, 14, 0), rot=90)
    place('hall_small', (-31, 26, 0), rot=90)
    place('pagoda', (-37, 43.5, RISE[3]))
    place('bridge', (23.8, -12, -0.1), rot=90)
    # laundry yard behind a moon-gate wall
    place('moongate', (-16, -24, 0), rot=90)
    place('wall', (-16, -19.5, 0), rot=90)
    place('wall', (-16, -29, 0), rot=90)
    place('wall', (-16, -33, 0), rot=90)
    for (x, y, r) in ((-28, -25.5, 0), (-22, -30, 20), (-31, -31, -10)):
        place('rack', (x, y, 0), rot=r)
    BASKETS = [(-24, -23.5), (-27, -29.5), (-20, -26.8), (-31.5, -24.5), (-23.6, -32.2), (-19.4, -31.5)]
    for x, y in BASKETS:
        place('basket', (x, y, 0), rot=rnd.uniform(0, 360))
    # overlook
    for x in (18, 22, 26, 30, 34):
        place('railing', (x, -39.6, h(x, -39.6)))
    place('bench', (24, -37, 0), rot=180)
    place('bench', (-6, -6, 0), rot=90)
    place('bench', (6, -12, 0), rot=-90)
    place('bench', (-12, 44, 0), rot=180)
    for y in (-28, -20, -12, 22, 28):
        for sx in (-1, 1):
            place('stone_lantern', (sx * 2.6, y, 0))
    for (x, y, r) in ((-12, -18, 0), (12, -18, 0), (-12, 5, 180), (12, 5, 180), (-22, -6, 90), (36, -12, 0), (38, 20, -90), (-22, 32, 90), (22, -34, 0)):
        place('lamp_post', (x, y, h(x, y)), rot=r)

    # ---------------- markers
    marker('SPAWN_gate', (0, -31.5, 0), rot=180)
    marker('SPAWN_start', (0, -31.5, 0), rot=180)
    marker('NPC_fang', (0, -21, 0), rot=0, model='fang', anim='idle')
    marker('NPC_tangtang', (2.2, -28.8, 0), rot=180, model='tangtang', anim='idle')
    marker('NPC_weibao', (-1.55, 14, 0.0), rot=90, model='weibao', anim='sit', seat=0.89)
    marker('NPC_classmate', (1.55, 14.4, 0.0), rot=-90, model='folk_b', anim='sit', seat=0.89)
    marker('NPC_s1', (-6.5, 2.5, 0), rot=150, model='folk_a', anim='idle')
    marker('NPC_s2', (9, -15, 0), rot=-40, model='folk_c', anim='idle')
    marker('NPC_player1', (-16, 42, 0), rot=30, model='folk_b', anim='celebrate')
    marker('NPC_player2', (-11.5, 45.5, 0), rot=200, model='folk_c', anim='wave')
    marker('NPC_player3', (-9.5, 41, 0), rot=250, model='folk_a', anim='celebrate')
    marker('NPC_bookworm', (27.5, 20.5, 0), rot=160, model='folk_b', anim='shy')
    marker('POINT_kitchen', (-26.6, -12, 0.6), rot=90)
    marker('POINT_fang_lesson', (0, 11.4, 0), rot=180)
    marker('POINT_lessonseat', (0, 15.6, 0), rot=0, seat=0.89)
    marker('POINT_fang_court', (-2, -6, 0), rot=0)
    marker('POINT_tag', (5, -6, 0))
    marker('POINT_bigtree', (-7.5, -2.5, 0))
    marker('POINT_overlook', (24, -38.2, 0))
    marker('GRUMB_sock', (-24.8, -27.4, 0), species='sock')
    for i, (x, y) in enumerate(BASKETS):
        marker('POINT_sockspot_%d' % (i + 1), (x + 0.8, y - 0.6, 0))
    marker('GRUMB_homework', (34.5, 23.6, 0), species='homework')
    marker('GRUMB_pompom', (-19.5, 46.5, 0), species='pompom')
    buds = [(19.2, 8.2), (21.0, 7.6), (22.8, 7.1), (24.6, 6.6), (26.1, 6.2)]
    for i, (x, y) in enumerate(buds):
        marker('POINT_bud_%d' % (i + 1), (x, y, -0.45))
    candies = [(ISLAND[0], ISLAND[1] - 0.3, 0.2, 0), (-8.5, -1.8, 0, 0), (0, 41.5, 0, 0), (-37, 40.4, RISE[3] + 0.6, 0),
               (-19.8, -27.6, 0, 1), (30, 22.8, 3.5, 0), (-29.8, -9.2, 0, 0), (26, -37.4, 0, 1), (0.8, 13.2, 0.45, 0), (26.8, -12, 1.35, 0)]
    for i, (x, y, z, hidden) in enumerate(candies):
        marker('POINT_candy_%d' % (i + 1), (x, y, z + 0.5), hidden=hidden)
    notes = [((1.6, -33.4, 0), 'gate'), ((-33, 37, h(-33, 37)), 'pagoda'), ((20.5, -37.6, 0), 'overlook')]
    for i, (p, key) in enumerate(notes):
        marker('POINT_note_%d' % (i + 1), p, note=key)
    for i, (x, y) in enumerate(((-28.4, 17.2), (-28.4, 23.0), (-27.9, 29.0))):
        marker('POINT_sleepy_%d' % (i + 1), (x, y, 0))
    marker('CAM_welcome', (4.5, -25.5, 2.0))
    marker('CAM_lesson', (-2.6, 10.2, 2.1))
    marker('CAM_honk', (-3.8, 12.6, 1.4))
    marker('CAM_kitchen', (-22.5, -10.5, 2.3))
    marker('CAM_overlook', (22, -33.5, 2.4))
    area('WATER_pond', (POND[0], POND[1], -0.45), (POND[2] * 1.18, POND[3] * 1.18, 1))
    area('WATER_stream', (24, -15, -0.45), (3.2, 10.5, 1))
    area('WATER_harbour', (0, -120, -13.6), (220, 60, 1))
    area('SCATTER_pine_north', (0, 50, 0), (40, 3, 1), count=22, size=1.2)
    area('SCATTER_tree_east', (43, 10, 0), (2.5, 34, 1), count=12)
    area('SCATTER_tree_west', (-43, 0, 0), (2.5, 30, 1), count=10)
    area('SCATTER_maple_court', (-10, -16, 0), (2, 2, 1), count=2)
    area('SCATTER_maple_court2', (10, 4, 0), (2, 1.5, 1), count=2)
    area('SCATTER_maple_lib', (36, 30, 0), (3, 4, 1), count=3)
    area('SCATTER_willow_pond', (17, 10, 0), (1.5, 4, 1), count=2)
    area('SCATTER_willow_pond2', (34, 0, 0), (1.5, 4, 1), count=2)
    area('SCATTER_blossom_dorm', (-38, 20, 0), (3, 8, 1), count=4)
    area('SCATTER_bush_wall', (-20, -33, 0), (16, 0.6, 1), count=10)
    area('SCATTER_bush_hall', (0, 32, 0), (8, 0.8, 1), count=6)
    area('SCATTER_pine_pagoda', (-38, 46, 3), (6, 4, 1), count=6)
    area('SCATTER_tree_south', (-30, -38.5, 0), (10, 1.5, 1), count=6)
    return export_zone('academy', None)


ZONES = {'train': train, 'station': station, 'academy': academy}

if __name__ == '__main__':
    for n in globals().get('ONLY', None) or list(ZONES):
        print('built', ZONES[n]())
