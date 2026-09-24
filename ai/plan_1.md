# Plan 1: Character art pass, from stacked primitives to game-ready chibis

Answers `ai/prompt_1.md`. Builds on `ai/plan_0.md` and `ai/next_0.md`. The visual references are in `ref/`.

## 0. Short answer

**You don't need to model them yourself.** I'll rebuild the characters one at a time. Xiao Pei goes first, and I'll **stop for your review after her** before doing the rest. The rebuild keeps everything else working: the shared skeleton, the animation library, one draw call per character, and the load budget.

**Target game: *Animal Crossing: Pocket Camp*** (Nintendo, iOS/Android, now sold as *Pocket Camp Complete*). Why this one:

- **Same genre and tone.** It's cozy, about collecting and befriending, with big-headed chibi humans.
- **It's made for ordinary phones, and so is ours.** Our spec includes entry-level phones up to 5 years old. Games like Genshin Impact or Infinity Nikki set a bar that can't fit that budget.
- **Its characters use the techniques we're missing:**
  - one smooth, continuous body per character
  - hair sculpted as a few big clumps
  - clothes with thick hems and a few large folds
  - faces painted in a texture, with swappable eye and mouth states for blinks and expressions
  - soft, simple shading that still reads at thumbnail size

§2 turns "that level" into a checklist I can verify.

**What's realistic.** The images in `ref/` are offline renders with strand hair, subsurface skin and fabric micro-detail. No mobile game ships characters like that. The goal is Pocket Camp quality while keeping each character's silhouette, palette and signature details: the gingham grid, the braid, Captain Honk, Fang's glasses. I expect hair, hands, and cloth that still looks right when it bends to be the hardest parts.

**Where you come in:**
1. **Review Xiao Pei at the M1 stop.** The style choices made on her carry over to everyone else.
2. *(Optional)* Drop 5–10 screenshots of Pocket Camp, or of any game you'd rather match, into `ref/target/`. That folder is untracked. I'll compare my renders side by side with them. Without them, I'll work from `ref/` and the checklist.
3. *(Optional)* If you'd ever like to hand-sculpt a character, M8 documents how to drop one into the game.

## 1. Why they look like stacked balls

`tools/blender/build_characters.py` builds Xiao Pei from about **60 separate primitives**. They include an ellipsoid head, 6 ellipsoid bangs, a braid made of 5 balls, a tube torso, ellipsoid hands, and 5 stacked discs per eye. The other characters are built the same way. Specifically:

1. **Parts overlap instead of joining.** Each part is a closed shape pushed into its neighbour. Nothing blends at the neck, shoulders, wrists or hairline, so the eye reads a pile of shapes.
2. **The hair is a shell plus blobs.** There are no locks, no tapered tips and no layering.
3. **The clothes are tubes.** There are no hems, no collar thickness, no folds, no gathering at cuffs and ankles, and no overlap between layers.
4. **Hands are ellipsoids and feet are rounded boxes.**
5. **Faces are stacked discs.** Discs can't show eyelids, lashes or expressions, so blinking isn't possible.
6. **Colour is per vertex only.** There's nowhere to put seams, stitching, hair strands or knit.
7. **Skinning is distance-based per part**, a workaround for the parts not forming one surface. It's what gives the doll-like joints in walk and run.

**Worth keeping:** the shared skeleton, the animation library and its retargeting, the one-`mixed`-material/one-draw-call convention, the cloth-grid shader, palettes stored in vertex colours, and building every asset from a script so it's reproducible.

## 2. Quality bar

**Checklist.** A character is done when every item passes. Each item is checked with the review renders and in-game screenshots from §3.5.

| Area | Pass condition |
|---|---|
| Silhouette | Filled black at 64 px tall, each named character is recognisable and distinct from the others. Proportions match the ref. |
| Surface | No visible primitive intersections. Neck, shoulders, wrists, ankles and hairline either blend smoothly or tuck under a garment. |
| Face | Eyes are the ref's size and placement, with highlights, a lid line, brows, a sculpted nose and cheeks, and blush. It blinks and has at least 4 expressions. It reads at gameplay distance and holds up in a dialogue close-up. |
| Hair | Grouped locks with tapered tips and layering. No gaps at any camera angle. Strand lines follow the flow. Xiao Pei's braid is a real three-strand braid. |
| Clothes | Garments have thickness at hems, cuffs and collars. Each garment has 2–4 large folds where it bends, gathers where the ref has them, and seams or stitching in the texture. |
| Hands and feet | Mitten hands with a thumb that can grip (bag, tart, puppet). Shoes have soles, laces or wraps as in the ref. |
| Motion | No candy-wrapper twisting or collapsed joints in any of the 16 clips. No limbs passing through the torso in walk, run, hum or sit. |
| Colour | The palette and value structure match the ref, e.g. Xiao Pei's dark hair, mid-tone jacket and light trousers. |
| Tech | Within the budgets below. One draw call per character. At most one new shader program for the whole pass. |

**Budgets** (after `npm run assets`):

| Asset | Triangles | Texture | GLB |
|---|---|---|---|
| Xiao Pei | ≤ 7k | 512² WebP atlas | ≤ 130 KB |
| Tangtang, Wei Bao (+ Honk), Fang | ≤ 6k each | 512² | ≤ 120 KB each |
| Townsfolk ×3 | ≤ 3.5k each | 256² | ≤ 60 KB each |
| Doudou and Grumblings (`creatures.glb`) | ≤ 800 each | none (vertex colour) | ≤ 100 KB total |

**Load budget check.** First-zone models would total about 530 KB (Xiao Pei 130 + townsfolk 180 + creatures 100 + animations 65 + train 58), against the existing 700 KB budget. The whole critical path stays under 1.2 MB. At 10 Mbps, the extra ~220 KB adds about 0.2 s to the measured 1.16 s median time to interaction, which is still well under the 3 s must-pass. **Per frame:** the scene is limited to 6 skinned humanoids of about 6k triangles each, so +36k triangles at worst. The busiest low-tier academy view goes from 75k to about 100k triangles, against the 150k mobile budget.

## 3. Approach

### 3.1 Sculpting in code with signed distance fields (new `tools/blender/sdf.py`)
- **Shape functions.** Primitives are written as distance functions in numpy: ellipsoid, capsule, rounded cone, rounded box, torus, and a tube along a spline.
  - They combine with **smooth union, subtraction and intersection**, each join with its own blend radius. Smooth union gives a sculpted neck, shoulder and hairline instead of two balls touching.
  - Domain operations: mirror, bend, twist.
  - Displacement fields: quilted puffs (Xiao Pei's jacket), gathers (cuffs, trouser ankles), masked fold creases at bend lines, and knit bumps (Fang's cardigan).
- **Meshing** (already checked in the connected Blender 5.2):
  1. Evaluate a numpy grid at 3–4 mm voxels, computing each primitive only inside its bounding box.
  2. Load it with `openvdb.FloatGrid.copyFromArray`.
  3. Mesh it with `convertToQuads`.

  A 96³ smooth union of two spheres meshed in **0.03 s**. Blender also has SDF grid nodes (`SDFGridBoolean`, `SDFGridFillet`, …), which are a fallback if the numpy path hits limits.
- **Meshed in groups.** Each character is split into a few SDF groups, and each group is meshed separately:
  - skin (head, neck, hands; body under clothes isn't meshed)
  - one group per garment
  - the hair mass
  - locks and braid
  - accessories

  Layered garments overlap by design, like on any game character; they aren't primitives stuck together.
- **Getting to budget.**
  - Remesh each group with **QuadriFlow** (built into Blender) to a target face count, then shrinkwrap it back onto the dense surface. If QuadriFlow fails on thin parts, use Decimate instead.
  - Then **transfer normals** from the dense mesh (Data Transfer → custom normals), so the low-poly model shades like the sculpt.
- **Hair locks** are tapered, slightly flattened tubes along splines. Their UVs run from root to tip, so the painted strand lines follow the hair.
- **Xiao Pei's braid** is three phase-shifted lobes woven along a spline. It ends in the orange tie and a flared tuft.

### 3.2 Painted faces with expressions (new `tools/blender/face.py`, `src/actors/face.js`)
- **Face cards.** The eyes (with brows) and the mouth are thin patches that follow the head surface 0.5 mm above it. They're part of the same mesh, so they cost no extra draw call. They get their own shader codes in the colour alpha: 9 for eyes, 10 for mouth.
- **Painted by script.** A 256×256 face region in the atlas is drawn by script with anti-aliased 2D shapes in numpy. It includes:
  - the iris gradient, pupil and two highlights
  - the upper lid line, and lashes where the ref has them
  - brows and blush
  - freckles (Xiao Pei) and wrinkles (Fang)
- **Cells:**
  - eyes: open, blink, happy (^ ^), sleepy, surprised, sad
  - mouth: neutral, smile, talk, small "o", wobbly
- **No seams.** The shader blends each card over the vertex colour (the skin tone) with `mix(vColor, texel, texel.a)`. That avoids seams, alpha blending and `discard`.
- **Runtime** (`face.js`):
  - The expression is chosen by UV offset uniforms.
  - Characters blink every 2–6 s, and the mouth flaps while they talk.
  - A dialogue line can set an expression through the existing opts slot, e.g. `['tangtang', 'Welcome!', { face: 'happy' }]` (`src/story/helpers.js` already passes `opts` to `G.ui.say`).
- **Sculpted features.** The nose, cheeks, brow ridge and chin are also small sculpted forms, so the paint sits on a real face shape.

### 3.3 One small texture atlas per character (new `tools/blender/bake.py`)
- **Colour stays in vertex colours.** Palette swaps stay a one-line change, and the cloth-grid shader stays as it is.
- **The atlas holds a grey detail layer**, multiplied over the vertex colour, plus the face cells. The detail layer contains:
  - baked ambient occlusion and cavity (darkening in creases)
  - seams, stitching, hems and pocket edges
  - fold shading
  - hair strand lines
  - Fang's knit texture
- **UVs** come from an automatic unwrap (Smart UV Project) for sculpted groups. Hair locks use the UVs generated with them.
- **Baking** uses Cycles: AO, plus procedural shader patterns baked as emission. It runs headless.
- **Texture size and format:** 512² WebP for named characters, 256² for townsfolk.
- **The atlas is attached in `tools/optimize.mjs`** (gltf-transform, `EXT_texture_webp`), not by Blender's exporter. The `mixed` material deliberately has no colour node (see the exporter bug noted in `snuglib.py`), and adding one risks losing the shader codes stored in the colour alpha.
- **Runtime:** a textured variant of `mixed` in `src/render/materials.js`. It's one extra shader program, precompiled before Begin. Each character gets its own material clone that shares that program, so its face uniforms are its own.

### 3.4 Rig and deformation
- **Skeleton and animations stay.** The shared bone names and `anim_humanoid.glb` are unchanged, so clips and retargeting keep working.
- **Proportions per character** via `humanoid_joints`: Xiao Pei about 4 heads tall, Tangtang about 4.5, Wei Bao about 3.5, Fang about 2.8.
- **New optional bones:**
  - `thumb_L/R` and `fingers_L/R`, so a mitten hand can grip.
  - `spring_*` chains for secondary motion: the braid (renamed), Tangtang's sash tails, Wei Bao's bandana tails, and Fang's scarf end.
  - A `seat_doudou` marker in Xiao Pei's hood. It replaces the hard-coded offset in `src/actors/player.js`.
- **Skinning:**
  - Blender's **automatic weights** work now that each group is one closed surface. The old distance-based `skin()` stays as a fallback for accessories.
  - Hair and hard accessories are rigidly bound to their bone.
  - A scripted weight-smoothing pass follows.
- **Checking deformation.** A pose gallery renders every character across the 16 clips. Clip angles that now cause intersections are fixed in `build_anims.py`, for example the arms-down angle against the puffier jacket. Per-character offsets are added only if a shared fix isn't enough.

### 3.5 Review tooling, for my iteration loop and for your review
- **`tools/blender/review.py`** renders each character with Eevee into `assets-src/review/`, which is gitignored. I read these images on every iteration:
  - front, three-quarter, side and back views
  - a face close-up
  - a pose gallery: idle, walk contact, run, hum, sit, wave
  - a black-silhouette sheet at 64 px
  - a side-by-side with the ref image
- **In-game character viewer at `?viewer`.** It's lazy-loaded, so it isn't on the critical path.
  - It shows every character in a row under game lighting, with orbit controls.
  - It has pickers for clip and expression, a wireframe toggle, and a triangle/draw-call readout.
  - I take Playwright screenshots of it at 390×844 and 1280×720.
  - It's also the page you open to judge the results.

### 3.6 Not using AI image-to-3D by default
The Blender MCP can drive Hunyuan3D or Rodin, which build a 3D model from an image. It isn't the default because:

- It would send the `ref/` images to a third party.
- The licence of the output is unclear for an MIT repo meant to be forked.
- The output is a dense triangle mesh with lighting baked into the texture. It would still need retopology, UVs and rigging, so it only replaces the sculpting step.
- It can't be regenerated from the scripts.

It stays available as an **opt-in, per-character fallback** if the SDF route stalls below the bar, for example on hair. That needs your approval first.

## 4. Character briefs (from `ref/`)

- **Xiao Pei** (`xiaopei_1.png`, player, on the critical path)
  - **Silhouette:** big head, trapezoid puffer jacket, balloon trousers, and the braid swinging out on one side.
  - **Face and hair:** round face with dark brown eyes, thick brows, freckles and blush. Blunt bangs with strands falling past the cheeks, plus a few flyaway locks.
  - **Jacket:** oversized mustard quilted-grid puffer, open over a cream checked shirt with its collar layered on top. Checked lining on rolled cuffs, flap pockets. The hood is down, and Doudou sits in it.
  - **Carried items:** a netted bag on her back, and the orange yarn skein on a chest strap. The Lullaby Thread trail stays a VFX effect.
  - **Lower half:** cream checked harem trousers gathered at the ankle with drawstring ties, checked socks, and checked high-tops with orange lace bows.
- **Doudou** (`doudou_1.png`, cream figure)
  - A faceted paper-craft steamed bun with stubby ears, sleepy slit eyes, a small brown nose, and chunky separate paws.
  - He must sit correctly in the new hood, attached through `seat_doudou`.
- **Lin Tangtang** (`lintangtang.png`, middle variant)
  - **Build:** taller and older-looking. Short dark bob with small side plaits, under a teal beret with a tan band.
  - **Top:** teal chambray shirt with rolled sleeves over a white undershirt and a cream apron bib, plus a crossbody leather strap.
  - **Waist:** orange sash knotted at the waist with the tails on a spring chain, and a leather belt with pouches and bread.
  - **Lower half:** dark gloves, very baggy cream trousers, and brown boots with wraps.
- **Wei Bao and Captain Honk** (`weibao.png`)
  - **Head:** large round head with very big round dark eyes, a round nose and big ears.
  - **Clothing:** mustard gingham bandana cap tied at the side (tails on a spring chain), mustard neckerchief, white checked shirt with rolled sleeves, mustard gathered trousers, checked sneakers and a cloth satchel.
  - **Honk:** a white felt goose puppet on the left hand, with felt seams in the atlas, button eyes, and the orange beak on `puppet_jaw` as now.
- **Master Fang** (`fangqiuye.png`)
  - **Build:** very round and short.
  - **Head:** tan tweed flat cap with an orange knit band and a top button. White curly hair puffs, round wire glasses, dot eyes, round nose, rosy cheeks, and painted wrinkles.
  - **Clothing:** chunky orange knit cardigan (knit in both the shape and the atlas) with wooden buttons and patch pockets holding sweets, a cream undershirt, a knotted checked scarf (the end on a spring chain), grey checked trousers and felt slippers.
  - **Tote bag** gripped with the new fingers bones.
- **Townsfolk ×3:** one shared SDF base body with swappable hair, hats and garments. Colours come from palettes, so later chapters can add crowd variety cheaply.
- **Grumblings** (cloud, sock, homework, pom-pom, sparrow, grey)
  - Each is one fused SDF form, e.g. the cloud's puffs smooth-unioned instead of five icospheres.
  - It's then reduced with Decimate's planar mode so the facets look deliberate, with small crease jitter, to match the paper-craft look of `doudou_1.png`.
  - The runtime layout of an `<id>_body` and `<id>_eyes` child stays, so blinking, the Sprite Book portraits and the glow tint keep working.

## 5. Loop for each character

1. **Blockout.** SDF proportions and silhouette against the ref, including the 64 px silhouette test. Up to 3 rounds.
2. **Forms.** Garments, hair, hands and feet, checked in the review renders. Up to 4 rounds.
3. **Face.** Paint the cells and review the close-up and gameplay-distance views. Up to 3 rounds.
4. **Game-ready.**
   - Remesh, transfer normals, UVs and bake.
   - Rig and weights, then check the pose gallery.
   - `npm run assets`.
5. **In game.**
   - Screenshots from the viewer and in the character's own zone, on the low and high tiers.
   - A dialogue close-up.
   - `npm run budget`.
6. **Checklist.** If it passes, move to the next character. If an item still fails after its round limit, I record it in `next_1.md` instead of looping forever.

## 6. Milestones

**M0: Tooling.** The existing characters stay in place during this milestone.
- **Work:**
  - `sdf.py`, `face.py`, `bake.py`, `review.py`, plus the character-rig parts of `snuglib.py`.
  - Atlas attachment and UV quantization in `optimize.mjs`.
  - The textured `mixed` shader variant and `face.js`.
  - The `?viewer` page.
  - Per-model limits and triangle counts in `budget.mjs`.
- **Accept:**
  - A test head goes from Blender to a GLB to the viewer, with a neck and hands smooth-unioned and blinking face cards.
  - The existing characters still load and animate.
  - `npm run build && npm run budget` passes.

**M1: Xiao Pei, then stop.**
- **Work:** the full §5 loop, `seat_doudou`, and generalized spring chains in `player.js`.
- **Accept:** the checklist passes, the budget passes, and `npm run perf` still meets ≤ 3 s must-pass.
- **Then stop:** I post the review sheet, before/after screenshots, and how to open `?viewer`, and wait for your go-ahead or notes.

**M2: Doudou.** Rebuilt, sitting in the new hood, and checked in the prologue's reveal shot.

**M3: Lin Tangtang.** **M4: Wei Bao and Captain Honk**, including the beak flap while talking. **M5: Master Fang**, including the fingers-bone grip on the tote. Each follows the §5 loop and must pass the checklist.

**M6: Townsfolk.** The shared base plus 3 variants, within the critical-path budget, since all 3 are in the train.

**M7: Grumblings.** The faceted rebuild of all six species. Soothing, cocoon, sprite glow and Sprite Book portraits are checked in game.

**M8: Integration and handoff.**
- **Work:**
  - `face` options on key lines in `story/prologue.js` and `story/chapter1.js`, e.g. Xiao Pei's surprise at the Doudou reveal, Tangtang's sign, and Wei Bao's mortification.
  - A "Characters" section in the README: the pipeline, and how to swap in a hand-made mesh (bone names, shader codes in the colour alpha, face-card codes, atlas layout, the export step).
  - Add `__pycache__/` to `.gitignore`. A `.pyc` file is currently staged.
  - Write `ai/next_1.md`.
- **Accept:**
  - Budget and perf numbers are recorded in `next_1.md`.
  - The low tier holds the §1 frame-rate targets in the busiest academy view.
  - The Prologue and Chapter 1 play through with no console errors.

## 7. Files

- **New:** `tools/blender/{sdf,face,bake,review}.py`, `src/actors/face.js`, `src/dev/viewer.js`.
- **Rewritten:** `tools/blender/build_characters.py` (one function per character on the new pipeline) and `tools/blender/build_creatures.py`.
- **Changed:**
  - `tools/blender/snuglib.py`: proportions, optional bones, the automatic-weights path.
  - `tools/blender/build_anims.py`: rest poses for the new bones, fixes for intersecting poses.
  - `tools/optimize.mjs` and `tools/budget.mjs`.
  - `src/render/materials.js`, `src/actors/{humanoid,player,npc}.js`.
  - `src/ui/ui.js`: tells the speaking character which face to show.
  - `src/main.js`: the `?viewer` route.
  - `src/story/{prologue,chapter1}.js`, `README.md`, `.gitignore`.
- **Regenerated:** every `public/assets/models/*.glb` except `academy`, `kit`, `station` and `train`.

## 8. Verification

- **Visual:**
  - Review sheets for each character: views, face, poses, silhouette, and the ref side by side.
  - Viewer and in-zone Playwright screenshots at phone and desktop sizes.
  - Your review at M1 and at the end.
- **Technical:**
  - `npm run assets && npm run build && npm run budget` after each character.
  - `npm run perf` at M1 and M8.
  - The `?debug` overlay (draw calls, triangles, fps) in the busiest academy view on the low tier.
  - Load each GLB through three.js to check its bones, attributes and texture.
- **Gameplay:** a full Prologue and Chapter 1 playthrough at M8.
- **Still open from `next_0.md`:** real-device testing (an entry Android phone, an iPhone). New shaders and textures make it more important. I'll ask you to try the viewer on a phone after M1.

## 9. Risks

| Risk | Mitigation |
|---|---|
| The SDF route plateaus below the bar (most likely on hair) | Per-character round limits and the M1 stop. The opt-in image-to-3D fallback (§3.6) needs your approval. |
| QuadriFlow fails or produces poor edge flow at elbows and knees | Decimate as a fallback. Joints are mostly hidden under puffy clothes. The pose gallery catches problems before export. |
| Automatic weights fail on a group | Keep the existing distance-based `skin()` for that group. |
| Blender's exporter drops the colour-alpha shader codes once a texture is involved | The atlas is attached in `optimize.mjs`, not by the exporter. The runtime is checked on the M0 test head. |
| Size or triangle creep | Per-model limits in `budget.mjs`. Townsfolk use 256² atlases. Triangle counts are set at remesh time. |
| Mobile GPU cost of the textured shader | One extra program, precompiled before Begin. Texture sampling happens only on character pixels. It's checked on the low tier in M8. |
| New proportions break seating, hood or camera framing | `seat_doudou` comes from the GLB, not a hard-coded offset. Clip hips height is already read per character (`clipHipsY`). Cutscene shots are checked in M8. |

## 10. Out of scope (candidates for `next_1.md`)

- Animation polish: foot sliding, weight shifts, character-specific idles such as Tangtang's hands-on-hips from the ref.
- Level-of-detail meshes, inverted-hull outlines, normal maps.
- New characters for Chapter 2.

## 11. Open questions (defaults in bold; implementation proceeds with the defaults unless told otherwise)

1. **Target game:** ***Animal Crossing: Pocket Camp***, or name another you'd rather match.
2. **AI image-to-3D:** **not used**. It becomes an opt-in fallback for a single character only if the SDF route stalls, and only after you approve sending the refs to a third party.
3. **Review stops:** **one stop after Xiao Pei, then the rest in one run, with a final review.** The alternative is a stop after every character.
4. **Tangtang's design:** **the middle variant** of `ref/lintangtang.png`, as in plan 0.
