# SPDX-License-Identifier: GPL-3.0-only
"""Pip in the cardigan Master Fang gives her on the last morning (the Epilogue): "one like mine, with
extra-deep pockets, for Grumblings and sweets". She wears it from then on.

The same body, sculpt and rig as char_xiaopei.py (so the two models swap freely: src/story/epilogue.js);
only the paint differs. Her mustard jacket becomes Master Fang's chunky orange knit (char_fang.py), with
darker ribbed cuffs and hem, a ribbed band down the opening, wooden buttons, and two deep patch pockets:
a lemon candy peeks out of one.
"""
import importlib
import numpy as np
import kit
from kit import REG
import char_xiaopei as P0

importlib.reload(P0)
from char_xiaopei import *  # noqa: F401,F403  (the body, the fields, the rig, the face)

NAME = 'xiaopei_cardigan'
COL = dict(P0.COL, jacket='#e8843a', lining='#d06f2a', button='#5a3d2a', sweet='#f6c945')


def knit(col, P):
    """Chunky knit: vertical ribs of stitches (as on Master Fang's)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    az = np.arctan2(x, -y)
    k = (0.5 + 0.5 * np.sin(az * 36)) * (0.5 + 0.5 * np.sin(z * 150 + np.sin(az * 36) * 1.5))
    return col * (0.94 + 0.07 * k)[:, None]


def paint_outfit(P, ao, ao_f, region):
    lin = kit.lin
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    col = np.tile(lin(COL['jacket']), (len(P), 1))
    top = region == REG['top']
    col[top] = knit(col[top], P[top])
    col[region == REG['cuff']] = lin(COL['lining'])
    col[region == REG['skin']] = lin(COL['skin'])
    col[region == REG['bottom']] = lin(COL['trousers'])
    front = top & (y < -0.04)
    # it hangs open over her cream shirt, with a ribbed band down each side of the opening
    band = front & (np.abs(x) < 0.046) & (z > 0.4) & (z < B.neck[0] - 0.01)
    col[band] = lin(COL['lining'])
    col[front & (np.abs(x) < 0.024) & (z > 0.4) & (z < B.neck[0] - 0.01)] = lin(COL['shirt'])
    col[top & (z > 0.735) & (y < -0.03) & (np.abs(x) < 0.028 + (z - 0.735) * 0.9)] = lin(COL['shirt'])
    # wooden buttons down the band on her left
    for bz in (0.5, 0.565, 0.63, 0.695):
        col[front & (np.hypot(x - 0.035, z - bz) < 0.0085)] = lin(COL['button'])
    # extra-deep patch pockets, for Grumblings and sweets
    for g in (1, -1):
        dx, dz = np.abs(x - 0.092 * g), np.abs(z - 0.505)
        pk = front & (dx < 0.044) & (dz < 0.05)
        col[pk] = knit(np.tile(lin(COL['lining']), (int(pk.sum()), 1)), P[pk] * 1.7)
        col[pk & ((np.abs(dx - 0.044) < 0.005) | (np.abs(dz - 0.05) < 0.005))] *= 0.72
    # a lemon candy peeking out of the one on her left
    col[front & (np.hypot((x - 0.1) * 0.8, z - 0.566) < 0.017) & (z > 0.553)] = lin(COL['sweet'])
    col[(region == REG['bottom']) & (z < 0.14)] *= 0.93  # gathered at the ankle
    return col * kit.shade(ao, ao_f)[:, None]


def paint(g, P, N, ao, ao_f, base, region=None):
    if g == 'outfit':
        return paint_outfit(P, ao, ao_f, region)
    if g in ('hood', 'hem'):
        col = knit(np.array(base, float), P)
        if g == 'hem':  # a darker ribbed band round the bottom
            rib = P[:, 2] < 0.412
            col[rib] = knit(np.tile(kit.lin(COL['lining']), (int(rib.sum()), 1)), P[rib] * 1.7)
        return col * kit.shade(ao, ao_f)[:, None]
    return P0.paint(g, P, N, ao, ao_f, base, region)
