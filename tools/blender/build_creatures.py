"""Doudou and the Grumblings: faceted paper-craft creatures (ref/doudou_1.png), unrigged.
Each creature is an empty named after its species with two children: <id>_body and <id>_eyes
(eyes separate so the runtime can blink / squint them). Exports assets-src/export/creatures.glb.
Origins sit at the creature's base centre; +Z (glTF +Y) up, facing -Y (glTF +Z)."""
import os, sys, importlib, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import snuglib

importlib.reload(snuglib)
from snuglib import *

C = srgb


def slit_eyes(prefix, y, z, dx, w=0.035, h=0.009, color='#4a3226', yaw_in=0):
    out = []
    for s, g in (('L', 1), ('R', -1)):
        out.append(disc(prefix + s, (dx * g, y, z), w, 'eye', C(color), (0.12 * g, -1, 0), 8, (1, h / w), None, 0.004))
    return out


def round_eyes(prefix, y, z, dx, r=0.04, color='#2a1d17', glint=True, normal_tilt=0.0):
    out = []
    for s, g in (('L', 1), ('R', -1)):
        n = (normal_tilt * g, -1, 0)
        out.append(disc(prefix + s, (dx * g, y, z), r, 'eye', C(color), n, 12, (0.9, 1.0), None, 0.004))
        if glint:
            out.append(disc(prefix + 'g' + s, (dx * g + r * 0.3 * g, y - 0.004, z + r * 0.35), r * 0.3, 'eye',
                            C('#ffffff'), n, 6, (1, 1), None, 0.004))
    return out


def creature(cid, body_parts, eye_parts, x):
    root = link(bpy.data.objects.new(cid, None))
    root.empty_display_size = 0.2
    body = link(bpy.data.objects.new(cid + '_body', None))
    eyes = link(bpy.data.objects.new(cid + '_eyes', None))
    body_meshes = join_mixed(body_parts, cid + '_b')
    bake_ao(body_meshes, dist=0.15, samples=16, strength=0.45)
    for m in body_meshes:
        m.parent = body
    for m in join_mixed(eye_parts, cid + '_e'):
        m.parent = eyes
    body.parent = root
    eyes.parent = root
    root.location.x = x
    return root


def doudou(x):
    cream, shade = C('#f4ede2'), C('#e4d6c2')
    B = [superquad('dd_body', (0, 0, 0.1), (0.13, 0.115, 0.1), 'paper', cream, n=3.0, res=3, jitter=0.1, seed=4,
                   taper=0.18, grad=(shade, cream))]
    for s, g in (('L', 1), ('R', -1)):
        B.append(cone('dd_ear' + s, (0.075 * g, 0.0, 0.17), (0.095 * g, 0.01, 0.235), 0.04, 0.008, 'paper', cream,
                      segs=4))
        B.append(superquad('dd_paw' + s, (0.07 * g, -0.085, 0.02), (0.035, 0.03, 0.022), 'paper', C('#fbf7f0'), n=2.5,
                           res=2, jitter=0.15, seed=9))
    B.append(cone('dd_knot', (0, 0.01, 0.195), (0, 0.015, 0.225), 0.025, 0.004, 'paper', shade, segs=5))
    B.append(ellipsoid('dd_nose', (0, -0.118, 0.1), (0.014, 0.01, 0.011), 'paper', C('#8a5a44'), (6, 4), smooth=False))
    E = slit_eyes('dd_eye', -0.112, 0.125, 0.048, w=0.026, h=0.006)
    for s, g in (('L', 1), ('R', -1)):
        E.append(disc('dd_blush' + s, (0.085 * g, -0.104, 0.085), 0.018, 'paper', C('#f1b9a4'), (0.3 * g, -1, 0), 8,
                      (1.3, 0.7), None, 0.003))
    return creature('doudou', B, E, x)


def cloud(x):
    grey, light = C('#9fb2c4'), C('#c9d6e2')
    B = []
    puffs = [((0, 0, 0.36), (0.2, 0.17, 0.16)), ((0.17, 0.02, 0.32), (0.13, 0.12, 0.12)),
             ((-0.17, 0.02, 0.32), (0.14, 0.12, 0.12)), ((0.07, 0.05, 0.47), (0.12, 0.11, 0.1)),
             ((-0.09, 0.04, 0.46), (0.11, 0.1, 0.1))]
    for i, (c, r) in enumerate(puffs):
        B.append(ico('cl_puff%d' % i, c, r, 'paper', light, subdiv=1, jitter=0.18, seed=10 + i, grad=(grey, light)))
    for i, (dx, dz) in enumerate(((-0.1, 0.18), (0.02, 0.14), (0.12, 0.19))):
        B.append(cone('cl_drop%d' % i, (dx, -0.02, dz + 0.02), (dx, -0.02, dz - 0.05), 0.022, 0.003, 'glow',
                      C('#8fc3e8'), segs=5))
    E = round_eyes('cl_eye', -0.165, 0.37, 0.07, r=0.03, normal_tilt=0.1)
    for s, g in (('L', 1), ('R', -1)):  # worried brows
        E.append(disc('cl_brow' + s, (0.075 * g, -0.162, 0.425), 0.025, 'eye', C('#4d5b6b'), (0.1 * g, -1, 0.1), 6,
                      (1, 0.22), None, 0.004))
    E.append(disc('cl_mouth', (0, -0.172, 0.32), 0.014, 'eye', C('#4d5b6b'), (0, -1, 0), 6, (1.4, 0.5), None, 0.004))
    return creature('cloud', B, E, x)


def sock(x):
    red, white = C('#d9574a'), C('#f3ece2')
    B = []
    # leg of the sock standing up, foot pointing forward, stripes as separate rings
    for i in range(3):
        z0 = 0.12 + i * 0.065
        B.append(tube('sk_leg%d' % i, (0, 0.03, z0), (0, 0.03, z0 + 0.065), 0.1, 0.1 - i * 0.006, 'paper',
                      red if i % 2 == 0 else white, segs=7, rings=1, caps=(i == 2), smooth=False))
    B.append(torus('sk_cuff', (0, 0.03, 0.315), 0.09, 0.024, 'paper', white, (8, 4), smooth=False))
    B.append(superquad('sk_heel', (0, 0.0, 0.09), (0.11, 0.12, 0.1), 'paper', red, n=2.4, res=3, jitter=0.12, seed=3))
    B.append(superquad('sk_toe', (0, -0.12, 0.06), (0.085, 0.08, 0.06), 'paper', white, n=2.4, res=2, jitter=0.12,
                       seed=5))
    E = round_eyes('sk_eye', -0.074, 0.235, 0.045, r=0.028)
    E.append(disc('sk_mouth', (0, -0.098, 0.15), 0.016, 'eye', C('#5a2a24'), (0, -1, 0.3), 6, (1.3, 0.6), None, 0.004))
    return creature('sock', B, E, x)


def homework(x):
    paper, line = C('#f7f3ea'), C('#b9cde0')
    B = [ico('hw_ball', (0, 0, 0.21), (0.2, 0.19, 0.19), 'paper', paper, subdiv=1, jitter=0.35, seed=21,
             grad=(mix(line, paper, 0.6), paper), noise=0.08)]
    # crumple flaps
    for i, (dx, dz, rz) in enumerate(((0.15, 0.3, 30), (-0.16, 0.26, -40), (0.02, 0.4, 5))):
        B.append(cone('hw_flap%d' % i, (dx * 0.8, 0.0, dz - 0.04), (dx, 0.02, dz + 0.05), 0.06, 0.005, 'paper', paper,
                      segs=3))
    # pencil stuck in the top
    B.append(tube('hw_pencil', (0.04, 0.03, 0.3), (0.12, 0.05, 0.52), 0.018, 0.018, 'paper', C('#f2b33d'), segs=6,
                  rings=1, smooth=False))
    B.append(cone('hw_tip', (0.12, 0.05, 0.52), (0.135, 0.054, 0.56), 0.018, 0.002, 'paper', C('#2b2b2b'), segs=6))
    B.append(tube('hw_eraser', (0.036, 0.029, 0.29), (0.044, 0.031, 0.31), 0.019, 0.019, 'paper', C('#e98a9a'),
                  segs=6, rings=1))
    E = round_eyes('hw_eye', -0.19, 0.24, 0.06, r=0.032)
    for s, g in (('L', 1), ('R', -1)):  # tears
        E.append(ellipsoid('hw_tear' + s, (0.075 * g, -0.185, 0.19), (0.012, 0.008, 0.02), 'glow', C('#9fd0f2'),
                           (6, 4)))
    E.append(disc('hw_mouth', (0, -0.195, 0.17), 0.018, 'eye', C('#4a3a3a'), (0, -1, 0), 6, (1.5, 0.5), None, 0.004))
    return creature('homework', B, E, x)


def pompom(x):
    lilac, pink = C('#b69ccf'), C('#e3b6cf')
    B = [ico('pp_fluff', (0, 0, 0.19), (0.17, 0.16, 0.17), 'paper', pink, subdiv=2, jitter=0.3, seed=31,
             grad=(lilac, pink), spikes=0.25)]
    for s, g in (('L', 1), ('R', -1)):
        B.append(superquad('pp_foot' + s, (0.06 * g, -0.03, 0.02), (0.035, 0.045, 0.02), 'paper', C('#8e76a8'), n=2.5,
                           res=2, jitter=0.1))
    E = []
    for s, g in (('L', 1), ('R', -1)):  # droopy eyes
        E.append(disc('pp_eye' + s, (0.055 * g, -0.155, 0.21), 0.028, 'eye', C('#2e2438'), (0.15 * g, -1, 0), 10,
                      (1.0, 0.65), None, 0.004))
        E.append(disc('pp_lid' + s, (0.055 * g, -0.158, 0.225), 0.03, 'paper', pink, (0.15 * g, -1, 0), 10,
                      (1.05, 0.4), None, 0.004))
    E.append(disc('pp_mouth', (0, -0.16, 0.155), 0.012, 'eye', C('#4a3a4f'), (0, -1, 0), 6, (1.3, 0.45), None, 0.004))
    return creature('pompom', B, E, x)


def sparrow(x):
    brown, cream = C('#a8795a'), C('#f1e2c8')
    B = [ico('sp_body', (0, 0, 0.13), (0.12, 0.12, 0.12), 'paper', brown, subdiv=1, jitter=0.12, seed=41,
             grad=(cream, brown)),
         cone('sp_beak', (0, -0.11, 0.14), (0, -0.16, 0.13), 0.02, 0.002, 'paper', C('#e8a43c'), segs=4),
         cone('sp_tail', (0, 0.1, 0.14), (0, 0.18, 0.2), 0.04, 0.01, 'paper', C('#7d5a44'), segs=3)]
    for s, g in (('L', 1), ('R', -1)):
        B.append(superquad('sp_wing' + s, (0.11 * g, 0.01, 0.13), (0.02, 0.07, 0.05), 'paper', C('#8b6448'), n=2.2,
                           res=2, jitter=0.1))
    E = round_eyes('sp_eye', -0.1, 0.17, 0.05, r=0.035, normal_tilt=0.35)
    return creature('sparrow', B, E, x)


def grey(x):
    g1, g2 = C('#8c8f96'), C('#b4b6bb')
    B = [superquad('gr_lump', (0, 0, 0.22), (0.3, 0.26, 0.22), 'paper', g2, n=2.3, res=4, jitter=0.12, seed=51,
                   taper=0.3, grad=(g1, g2))]
    for i, (dx, dy) in enumerate(((0.22, -0.2), (-0.24, -0.16), (0.2, 0.2), (-0.2, 0.22))):
        B.append(cone('gr_fold%d' % i, (dx, dy, 0.02), (dx * 1.1, dy * 1.1, 0.12), 0.08, 0.02, 'paper', g1, segs=4))
    E = round_eyes('gr_eye', -0.245, 0.27, 0.085, r=0.045)
    return creature('grey', B, E, x)


def build():
    reset_scene()
    use_collection('creatures')
    roots = [doudou(0), cloud(0.8), sock(1.6), homework(2.4), pompom(3.2), sparrow(4.0), grey(5.0)]
    objs = []
    for r in roots:
        objs += descendants(r)
    return export_glb('creatures.glb', objs)


if __name__ == '__main__':
    print('built', build())
