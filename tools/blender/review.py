# SPDX-License-Identifier: GPL-3.0-only
"""Review renders for character art (ai/plan_1.md §3.5), written to assets-src/review/ (gitignored).

sheet(): front / three-quarter / side / back views next to the ref image, plus a face close-up and a
black silhouette at 64 px tall (the "can you tell who it is" test). Workbench is fast and shows the
sculpted forms with cavity shading; the final look is checked in the game's ?viewer page.
Used from the build scripts: review.sheet('xiaopei', objects, height=1.15).
"""
import os
import math
import numpy as np
import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(REPO, 'assets-src', 'review')
REF = os.path.join(REPO, 'ref')

VIEWS = {'front': (0, -1, 0.04), 'three_q': (0.62, -0.78, 0.08), 'side': (1, 0, 0.04), 'back': (0, 1, 0.08)}


def _camera(name='review_cam'):
    sc = bpy.context.scene
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def _look(cam, target, direction, dist):
    d = Vector(direction).normalized()
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def _setup(res, texture=False):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'TEXTURE' if texture else 'VERTEX'
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.cavity_ridge_factor = 0.6
    sh.cavity_valley_factor = 1.0
    sh.show_shadows = True
    sh.shadow_intensity = 0.35
    sh.show_specular_highlight = False
    sh.background_type = 'VIEWPORT'
    sh.background_color = (0.78, 0.78, 0.76)
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'


def _render(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, :3]  # top-down RGB


def _load_ref(name, height):
    for fn in (name + '.png', name + '_1.png'):
        p = os.path.join(REF, fn)
        if os.path.exists(p):
            img = bpy.data.images.load(p, check_existing=False)
            w, h = img.size
            px = np.empty(w * h * 4, np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            a = px.reshape(h, w, 4)[::-1, :, :3]
            # nearest resample to the sheet height
            ys = (np.arange(height) * h / height).astype(int)
            nw = int(w * height / h)
            xs = (np.arange(nw) * w / nw).astype(int)
            return a[ys][:, xs]
    return None


def _save(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new('review_out', w, h, alpha=False)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[:, :, :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def sheet(name, objs, height, head_z=None, tag='', res=(420, 640), texture=False, ref=None):
    """Render the review sheet for the given objects (others are hidden while rendering)."""
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    hidden = []
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE', 'META') and o not in objs and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    _setup(res, texture)
    cam = _camera()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = height * 1.12
    tmp = os.path.join(OUT, '_tmp.png')
    tiles = []
    for v, d in VIEWS.items():
        _look(cam, (0, 0, height * 0.5), d, 6)
        tiles.append(_render(tmp))
    # face close-up
    hz = head_z if head_z is not None else height * 0.82
    sc.render.resolution_x = sc.render.resolution_y = res[1] // 2
    cam.data.ortho_scale = height * 0.36
    _look(cam, (0, 0, hz), (0.22, -1, 0.05), 6)
    face = _render(tmp)
    _look(cam, (0, 0, hz), (0.9, -0.55, 0.1), 6)
    face2 = _render(tmp)
    # silhouette at 64 px
    sh = sc.display.shading
    sh.light, sh.color_type, sh.single_color, sh.show_cavity, sh.show_shadows = 'FLAT', 'SINGLE', (0, 0, 0), False, False
    sh.background_color = (1, 1, 1)
    sc.render.resolution_x, sc.render.resolution_y = 44, 64
    cam.data.ortho_scale = height * 1.12
    sils = []
    for v in ('front', 'three_q', 'side', 'back'):
        _look(cam, (0, 0, height * 0.5), VIEWS[v], 6)
        s = _render(tmp)
        sils.append(np.repeat(np.repeat(s, 2, 0), 2, 1))  # shown at 2x, still 64 px of information
    for o in hidden:
        o.hide_render = False
    os.remove(tmp)
    H = res[1]
    row = [t for t in tiles]
    refimg = _load_ref(ref or name, H)
    if refimg is not None:
        row = [refimg] + row
    top = np.concatenate(row, axis=1)
    bottom_parts = [face, face2] + [np.pad(s, ((0, H // 2 - s.shape[0]), (4, 4), (0, 0)), constant_values=1) for s in sils]
    bottom = np.concatenate(bottom_parts, axis=1)
    W = max(top.shape[1], bottom.shape[1])
    pad = lambda a: np.pad(a, ((0, 0), (0, W - a.shape[1]), (0, 0)), constant_values=0.9)
    out = np.concatenate([pad(top), pad(bottom)], axis=0)
    path = os.path.join(OUT, '%s%s.png' % (name, ('_' + tag) if tag else ''))
    _save(out, path)
    return path
