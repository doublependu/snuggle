# SPDX-License-Identifier: GPL-3.0-only
"""Rigged chibi characters -> assets-src/export/<name>.glb (+ <name>_atlas.webp, attached by tools/optimize.mjs).
No animations here: the clips live in anim_humanoid.glb (build_anims.py).

Each character is a char_<name>.py module built by chibi.py with the character kit (kit.py, ai/plan_1.md):
a sculpted head with a painted face, the body warped from the base mesh (hero_base.py, tools/blender/base/hero_male.glb)
and reshaped to the character's ref, sculpted accessories, a baked texture atlas and the A-pose rig.
Run all:  blender -b -P tools/blender/build_characters.py        (or set ONLY = ['tangtang'] first)
"""
import os, sys, importlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CHARACTERS = ['xiaopei', 'tangtang', 'weibao', 'fang', 'folk_a', 'folk_b', 'folk_c', 'folk_kid']


def build(name):
    import snuglib, sdf, face, hero_base, kit, chibi
    for m in (snuglib, sdf, face, hero_base, kit, chibi):
        importlib.reload(m)
    if name.startswith('folk'):
        import char_folk
        importlib.reload(char_folk)
    mod = importlib.import_module('char_' + name)
    importlib.reload(mod)
    return chibi.build(mod)[0]


if __name__ == '__main__':
    for n in globals().get('ONLY', None) or CHARACTERS:
        print('built', build(n))
