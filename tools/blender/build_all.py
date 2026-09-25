# SPDX-License-Identifier: GPL-3.0-only
"""Rebuild every asset: blender -b -P tools/blender/build_all.py  (then `npm run assets`)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
for name in ('build_characters.py', 'build_anims.py', 'build_creatures.py', 'build_kit.py', 'build_zones.py', 'build_market.py'):
    path = os.path.join(HERE, name)
    print('==>', name)
    exec(compile(open(path).read(), path, 'exec'), {'__file__': path, '__name__': '__main__'})
