# Character base mesh

`hero_male.glb` is a low-poly, skinned game character (A-pose, hand-painted palette texture). It is the
starting point for every character body: `tools/blender/hero_base.py` reads its parts and skin weights and
warps it onto each character's skeleton (see `ai/plan_1.md`).

It's obtain from here: <https://playableworkshop.com/videos/action-adventure-series-ep-3>
Here's the download link: <https://cdn.playableworkshop.com/_astro/ep3_assets.CEw0C9Rc.zip>

You can download it and put in tools/blender/base/ and then run 
`blender -b -P tools/blender/build_characters.py`.
