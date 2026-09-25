# SPDX-License-Identifier: GPL-3.0-only
"""Painted faces (ai/plan_1.md §3.2): eye and mouth expression cells drawn with anti-aliased 2D shapes.

The head's eye and mouth regions are planar-projected from the front onto one cell each of the
character atlas (see chibi.py LAYOUT); the runtime shows another expression by shifting those UVs
(src/actors/face.js). Cells are painted here in face-plane metres (x = her left as seen from the
front, z = up), so every shape is placed where it will appear on the head.
Colours are sRGB hex; the canvas is linear float RGB, 4x supersampled.
"""
import math
import numpy as np

SS = 4  # supersampling


def lin(h):
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


class Canvas:
    """A cell of the face: rect (x0, x1, z0, z1) in metres, size (w, h) in final pixels."""

    def __init__(self, rect, size, bg):
        self.x0, self.x1, self.z0, self.z1 = rect
        self.w, self.h = size[0] * SS, size[1] * SS
        xs = self.x0 + (np.arange(self.w) + 0.5) / self.w * (self.x1 - self.x0)
        zs = self.z1 - (np.arange(self.h) + 0.5) / self.h * (self.z1 - self.z0)
        self.X, self.Z = np.meshgrid(xs, zs)
        self.px = (self.x1 - self.x0) / self.w  # metres per supersampled pixel
        self.img = np.tile(lin(bg), (self.h, self.w, 1)).astype(np.float64)

    def fill(self, d, color, alpha=1.0, soft=0.0):
        """Composite colour where signed distance d < 0 (anti-aliased over one pixel, or `soft` metres)."""
        w = max(self.px, soft)
        a = np.clip(0.5 - d / w, 0, 1) * alpha
        c = lin(color) if isinstance(color, str) else np.asarray(color)
        self.img = self.img * (1 - a[..., None]) + c * a[..., None]
        return self

    def result(self):
        """Downsample to final pixels (linear float RGB)."""
        h, w = self.h // SS, self.w // SS
        return self.img.reshape(h, SS, w, SS, 3).mean(axis=(1, 3))


# ---------------------------------------------------------------- shapes (signed distances in metres)

def ellipse(cv, c, r, ang=0.0):
    x, z = cv.X - c[0], cv.Z - c[1]
    if ang:
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        x, z = x * ca + z * sa, -x * sa + z * ca
    k0 = np.sqrt((x / r[0]) ** 2 + (z / r[1]) ** 2)
    k1 = np.sqrt((x / r[0] ** 2) ** 2 + (z / r[1] ** 2) ** 2)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-12)


def stroke(cv, pts, width):
    """Distance to a polyline stroke; width may be a list (per point, tapering)."""
    pts = np.asarray(pts, float)
    wid = np.asarray(width, float) if np.ndim(width) else np.full(len(pts), float(width))
    out = np.full(cv.X.shape, 1e3)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        L2 = max(1e-12, ab @ ab)
        t = np.clip(((cv.X - a[0]) * ab[0] + (cv.Z - a[1]) * ab[1]) / L2, 0, 1)
        dx, dz = cv.X - a[0] - ab[0] * t, cv.Z - a[1] - ab[1] * t
        r = (wid[i] + (wid[i + 1] - wid[i]) * t) * 0.5
        out = np.minimum(out, np.sqrt(dx * dx + dz * dz) - r)
    return out


def arc(c, rx, rz, a0, a1, n=24, ang=0.0):
    """Points along an elliptical arc (degrees, 0 = +x, 90 = up)."""
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        x, z = math.cos(a) * rx, math.sin(a) * rz
        if ang:
            ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            x, z = x * ca - z * sa, x * sa + z * ca
        out.append((c[0] + x, c[1] + z))
    return out


def taper(n, w0, w1, w2=None):
    """Widths along a stroke: w0 at the ends rising to w1 in the middle (or w0 -> w1 -> w2)."""
    w2 = w0 if w2 is None else w2
    t = np.linspace(0, 1, n)
    return np.where(t < 0.5, w0 + (w1 - w0) * np.sin(t * math.pi), w2 + (w1 - w2) * np.sin(t * math.pi))


def inter(a, b):
    return np.maximum(a, b)


def sub(a, b):
    return np.maximum(a, -b)


# ---------------------------------------------------------------- eyes

class EyeStyle:
    def __init__(self, **kw):
        self.cx = 0.058  # eye centre x (each side)
        self.cz = 0.0  # eye centre z (relative to the eye row)
        self.w, self.h = 0.025, 0.028  # half width / half height of the opening
        self.iris = '#3a2419'
        self.iris_lo = '#7a4c30'
        self.pupil = '#140c09'
        self.white = '#fbf6ef'
        self.line = '#1c1310'
        self.lid = 0.0042  # upper lid line thickness
        self.lashes = 2
        self.brow = '#2a1c16'
        self.brow_z = 0.042
        self.brow_w = 0.0055
        self.brow_len = 0.03
        self.blush = '#f19a86'
        self.blush_z = -0.036
        self.freckles = '#c98870'
        self.skin = '#f6d5c3'
        self.dot = False  # small dark dot eyes (Master Fang) instead of the big anime eye
        self.wrinkles = None  # colour of smile lines and crow's feet, if any
        self.__dict__.update(kw)


def _dot_eye(cv, st, g, state):
    cx, cz = st.cx * g, st.cz
    k = {'surprised': 1.25, 'sleepy': 0.55, 'sad': 0.9}.get(state, 1.0)
    shape = ellipse(cv, (cx, cz), (st.w, st.h * k))
    if state == 'sleepy':
        shape = np.maximum(shape, cv.Z - cz)
    cv.fill(shape, st.pupil)
    cv.fill(ellipse(cv, (cx - st.w * 0.35, cz + st.h * 0.35 * k), (st.w * 0.3, st.w * 0.3)), '#ffffff', 0.9)
    if state == 'sad':
        pts = arc((cx, cz + st.h * 1.3), st.w * 1.4, st.h * 0.5, 160, 20, 10)
        cv.fill(stroke(cv, pts, taper(len(pts), 0.0005, 0.0012)), st.line, 0.7)


def _wrinkles(cv, st):
    for g in (1, -1):
        cx, cz = st.cx * g, st.cz
        # crow's feet at the outer corners and a soft line under each eye
        for a in (-25, 0, 25):
            r = math.radians(a)
            p0 = (cx + (st.w + 0.006) * g, cz)
            p1 = (p0[0] + 0.009 * g * math.cos(r), p0[1] + 0.009 * math.sin(r))
            cv.fill(stroke(cv, [p0, p1], [0.0007, 0.0002]), st.wrinkles, 0.5)
        pts = arc((cx, cz - st.h * 0.4), st.w * 1.2, st.h * 0.9, 215, 325, 12)
        cv.fill(stroke(cv, pts, taper(len(pts), 0.0002, 0.0008)), st.wrinkles, 0.45)


def _eye(cv, st, g, state):
    """One eye; g = +1 her left (viewer's right), -1 her right."""
    cx, cz = st.cx * g, st.cz
    w, h = st.w, st.h
    if st.dot and state not in ('blink', 'happy'):
        _dot_eye(cv, st, g, state)
        return
    if state in ('blink', 'happy'):
        if state == 'blink':  # closed: a soft downward curve with a lash flick
            pts = arc((cx, cz + h * 0.1), w * 0.95, h * 0.35, 190, 350)
        else:  # ^ happy squint
            pts = arc((cx, cz - h * 0.25), w * 0.85, h * 0.55, 20, 160)
        cv.fill(stroke(cv, pts, taper(len(pts), st.lid * 0.5, st.lid * 1.1)), st.line)
        o = pts[-1] if g > 0 else pts[0]
        if state == 'blink':
            cv.fill(stroke(cv, [o, (o[0] + 0.006 * g, o[1] + 0.002)], [st.lid * 0.7, st.lid * 0.2]), st.line)
        return
    top = {'open': 1.0, 'sleepy': 0.25, 'surprised': 1.12, 'sad': 0.82}[state]
    hh = h * (1.1 if state == 'surprised' else 1.0)
    shape = ellipse(cv, (cx, cz), (w, hh))
    # upper lid cut (lowered when sleepy; tilted down at the outer corner when sad)
    lid_z = cz + hh * (2 * top - 1) + 0.0005
    tilt = (cv.X - cx) * g * (-0.3 if state == 'sad' else 0.05)
    lidcut = cv.Z - (lid_z + tilt)
    shape = inter(shape, lidcut)
    cv.fill(shape, st.white)
    ir = w * (0.72 if state == 'surprised' else 0.93)
    ic = (cx - 0.001 * g, cz - hh * 0.06)
    iris = inter(ellipse(cv, ic, (ir, ir * 1.08)), shape)
    # iris gradient: dark under the lid, warm light at the bottom
    t = np.clip((ic[1] + ir - cv.Z) / (2 * ir), 0, 1)[..., None]
    col = lin(st.iris) * (1 - t ** 1.6) + lin(st.iris_lo) * t ** 1.6
    a = np.clip(0.5 - iris / cv.px, 0, 1)[..., None]
    cv.img = cv.img * (1 - a) + col * a
    cv.fill(inter(ellipse(cv, ic, (ir * 0.47, ir * 0.5)), shape), st.pupil)
    cv.fill(inter(ellipse(cv, (ic[0], ic[1] + ir * 0.1), (ir * 1.02, ir * 1.1)), sub(shape, ellipse(cv, ic, (ir * 0.93, ir)))),
            st.line, 0.35)  # thin dark rim
    # lid shadow on the eyeball
    cv.fill(inter(shape, lidcut + h * 0.35), st.line, 0.18, soft=h * 0.3)
    # highlights (same side for both eyes: light from the upper left of the screen)
    cv.fill(inter(ellipse(cv, (ic[0] - ir * 0.36, ic[1] + ir * 0.38), (ir * 0.3, ir * 0.34)), shape), '#ffffff')
    cv.fill(inter(ellipse(cv, (ic[0] + ir * 0.4, ic[1] - ir * 0.42), (ir * 0.12, ir * 0.12)), shape), '#ffffff', 0.9)
    if state == 'sad':
        wet = arc((ic[0], ic[1] - ir * 0.1), ir * 0.62, ir * 0.62, 215, 325, 12)
        cv.fill(inter(stroke(cv, wet, taper(len(wet), 0.0004, 0.0016)), shape), '#ffffff', 0.7)
    # upper lid line with lashes at the outer corner
    pts = arc((cx, cz), w * 1.04, hh * 1.0, 170, 10, 20)
    pts = [(x, min(z, lid_z + (x - cx) * g * (-0.3 if state == 'sad' else 0.05)) + 0.0003) for x, z in pts]
    if g < 0:
        pts = pts[::-1]  # draw inner -> outer
    lw = taper(len(pts), st.lid * 0.55, st.lid * 1.15, st.lid * 1.3)
    cv.fill(stroke(cv, pts, lw), st.line)
    o = pts[-1] if g > 0 else pts[-1]
    for i in range(st.lashes):
        d = (0.0055 + 0.0015 * i) * g * (1 if g > 0 else -1)
        tip = (o[0] + (0.004 + i * 0.002) * g, o[1] + 0.0035 - i * 0.004)
        cv.fill(stroke(cv, [(o[0] - 0.002 * g * i, o[1] - 0.001 * i), tip], [st.lid * 0.8, st.lid * 0.15]), st.line)
    # a soft lower lash line
    lo = arc((cx, cz + hh * 0.05), w * 0.85, hh * 1.0, 215, 325, 14)
    cv.fill(stroke(cv, lo, taper(len(lo), 0.0003, 0.0011)), '#a0705f', 0.55)


def _brow(cv, st, g, state):
    z = st.cz + st.brow_z
    L = st.brow_len
    inner = st.cx * g - 0.45 * L * g + 0.006 * g * -1
    outer = st.cx * g + 0.55 * L * g
    zi, zo = z, z + 0.001
    if state == 'surprised':
        zi, zo = z + 0.008, z + 0.009
    elif state == 'sad':
        zi, zo = z + 0.006, z - 0.004
    elif state in ('happy', 'blink'):
        zi, zo = z + 0.002, z + 0.002
    elif state == 'sleepy':
        zi, zo = z - 0.002, z - 0.001
    mid = ((inner + outer) / 2, max(zi, zo) + 0.0028)
    pts = [(inner, zi), mid, (outer, zo)]
    fine = []
    for i in range(12):  # smooth quadratic through the three points
        t = i / 11
        fine.append(tuple((1 - t) ** 2 * np.array(pts[0]) + 2 * (1 - t) * t * np.array(pts[1]) + t ** 2 * np.array(pts[2])))
    cv.fill(stroke(cv, fine, taper(len(fine), st.brow_w * 0.9, st.brow_w, st.brow_w * 0.35)), st.brow)


def _cheeks(cv, st):
    for g in (1, -1):
        cv.fill(ellipse(cv, (st.cx * g * 1.28, st.cz + st.blush_z), (0.02, 0.011)), st.blush, 0.4, soft=0.009)
    if st.freckles:
        rng = np.random.default_rng(7)
        for g in (1, -1):
            for _ in range(6):
                x = st.cx * g * 1.2 + rng.uniform(-0.016, 0.016)
                z = st.cz + st.blush_z + 0.004 + rng.uniform(-0.006, 0.006)
                cv.fill(ellipse(cv, (x, z), (0.0011, 0.0010)), st.freckles, 0.55)


EYE_STATES = ['open', 'blink', 'happy', 'sleepy', 'surprised', 'sad']


def eye_cell(rect, size, st, state, ao=None):
    cv = Canvas(rect, size, st.skin)
    _cheeks(cv, st)
    if st.wrinkles:
        _wrinkles(cv, st)
    for g in (1, -1):
        _brow(cv, st, g, state)
        _eye(cv, st, g, state)
    return cv.result()


# ---------------------------------------------------------------- mouths

class MouthStyle:
    def __init__(self, **kw):
        self.line = '#9a4f45'
        self.inside = '#6e2a27'
        self.tongue = '#d8747a'
        self.skin = '#f6d5c3'
        self.w = 0.011  # half width of a neutral mouth
        self.__dict__.update(kw)


MOUTH_STATES = ['neutral', 'smile', 'talk', 'o', 'wobbly', 'talk_smile', 'pout', 'neutral2']


def mouth_cell(rect, size, st, state):
    cv = Canvas(rect, size, st.skin)
    w = st.w
    if state in ('neutral', 'neutral2', 'pout'):
        pts = arc((0, 0.004), w, 0.004, 200, 340, 16)
        cv.fill(stroke(cv, pts, taper(len(pts), 0.0008, 0.0019)), st.line)
        if state == 'pout':
            lp = arc((0, -0.001), w * 0.5, 0.002, 200, 340, 10)
            cv.fill(stroke(cv, lp, taper(len(lp), 0.0003, 0.0009)), st.line, 0.4)
    elif state == 'smile':
        pts = arc((0, 0.008), w * 1.25, 0.008, 205, 335, 18)
        cv.fill(stroke(cv, pts, taper(len(pts), 0.0009, 0.0022)), st.line)
    elif state in ('talk', 'talk_smile', 'o'):
        if state == 'o':
            shape = ellipse(cv, (0, 0.0), (w * 0.45, w * 0.55))
        elif state == 'talk':
            shape = ellipse(cv, (0, 0.0), (w * 0.72, w * 0.62))
            shape = np.maximum(shape, cv.Z - w * 0.35)
        else:
            shape = ellipse(cv, (0, 0.004), (w * 1.05, w * 0.85))
            shape = np.maximum(shape, cv.Z - 0.004)
        cv.fill(shape, st.inside)
        cv.fill(np.maximum(shape, ellipse(cv, (0, -w * 0.62), (w * 0.62, w * 0.36))), st.tongue)
        cv.fill(np.abs(shape) - 0.0004, st.line, 0.8)
    elif state == 'wobbly':
        xs = np.linspace(-w * 1.1, w * 1.1, 24)
        pts = [(x, -0.001 + 0.0018 * math.sin(x / w * 5.5)) for x in xs]
        cv.fill(stroke(cv, pts, taper(len(pts), 0.0008, 0.0018)), st.line)
    return cv.result()
