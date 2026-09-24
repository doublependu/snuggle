# Next 0: what was built for plan 0, and what comes next

Summary of the implementation of `ai/plan_0.md` (answering `ai/prompt_0.md`).

## What was built

A playable, static, single-player three.js web game covering the **Prologue (the Rainy Train → Lantern Bay station)** and **Chapter 1 (Mistbloom Academy)**. Both play from start to finish.

**Engine** (`src/`, vanilla JS + Vite, runtime deps: `three`, `three-mesh-bvh`)
- **Boot:** the loading page paints without JS, with the "Fork me on GitHub" ribbon. Models the first zone needs are preloaded based on the save, then shaders are precompiled with `compileAsync`. Begin is the point of interaction: it unlocks audio and requests fullscreen on touch devices.
- **Rendering:** one stylized Lambert family (`render/materials.js`). Every Blender mesh uses a single **`mixed`** program: the shader family (cloth grid, skin, hair, unlit eye/glow, roof tiles, faceted paper, ground) is stored per vertex in the colour alpha. So each character or kit piece is **one draw call**.
  - Sky dome, karst peak rings, skyline and cloud sprites (`render/sky.js`); water (`render/water.js`, fresnel + sun glint, no render targets); rain, sparkles, glows and the Lullaby Thread ribbon (`render/vfx.js`).
- **World:** a zone base (`world/zone.js`) reads Blender markers (`SPAWN_ NPC_ GRUMB_ POINT_ PLACE_ SCATTER_ WATER_ TRIGGER_ CAM_`) and instances kit pieces. It also builds the capsule-vs-BVH collision (`world/collision.js`), foliage scatter, water, triggers and lights. The shadow frustum follows the player.
- **Actors:**
  - Player controller with coyote time and jump buffering, a spring braid, and Doudou riding in the hood bone (`actors/player.js`).
  - Spring-arm camera with BVH collision and scripted shots.
  - Humanoids with one shared, retargeted animation library and upper-body overlays (`actors/humanoid.js`).
  - NPCs that turn, talk, sit, walk, and (Captain Honk) flap their beak.
  - Grumblings with four tantrum behaviours (rain, dart, throw, sigh), notice, grow-when-ignored, wrap, cocoon, sleep, pop.
  - Charm Sprite followers.
- **Systems:**
  - Soothing (`systems/soothe.js`): hold to hum, beat-clock "Perfect" bonus, snaps, Calm, and an overwhelm that never ends the game.
  - Collection, Cozy Energy, tarts and candies (`systems/collection.js`).
  - Assists: tart toss and Echo Friend.
  - Context interaction.
  - Cooking mini-game with Tangtang.
- **UI** (DOM): HUD, objective, prompts, soothing ring, toasts, bubbles, dialogue with choices, chapter cards, pause/settings/controls with the fork link, a Sprite Book with portraits rendered at runtime, and touch controls. Input covers keyboard/mouse (pointer lock), gamepad and touch.
- **Audio:** entirely synthesized (`core/audio.js`). The lullaby follows the same beat clock the gameplay uses; also rain, rumble, clack, birds, pad, sfx and the honk.
- **Quality:** tiers from a device probe, dynamic resolution, and an automatic tier step-down (`core/quality.js`). Saves are versioned JSON in localStorage (`core/save.js`).

**Content**
- **Story scripts:** `story/prologue.js` (train tutorial, the Doudou reveal, Tangtang and her tarts) and `story/chapter1.js` (welcome, lesson with Honk's interruption, sock and homework missions, baking, the lonely pom-pom taken to the courtyard tag game, and the overlook ending).
- **Side content:**
  - 10 lemon candies (2 need the Lost Sock's Sniff).
  - 3 lore notes (need Homework's Read).
  - Thirsty lotus buds that bloom into stepping pads (need the Soggy Cloud's Umbrella) and lead to the island candy.
  - Kind acts: tucking in sleepy sprites, helping the student with her books, sharing a tart, chatting.
- **Species** (`content/species.js`): Doudou, Soggy Cloud, Lost Sock, Unfinished Homework, Picked-Last Pom-pom, plus silhouettes for Chapter 2 and 3.

**Assets** (`tools/blender/*.py`, driven through the Blender MCP, also headless with `blender -b -P tools/blender/build_all.py`)
- **Characters:** Xiao Pei, Lin Tangtang (middle ref variant), Wei Bao + Captain Honk (jaw bone), Master Fang, and 3 townsfolk. All share one axis-aligned chibi skeleton, with custom distance-based skinning.
- **Animation library:** 16 procedurally keyed clips (`build_anims.py`).
- **Creatures:** faceted paper-craft (`build_creatures.py`).
- **Architecture kit** (`build_kit.py`, 23 pieces): halls, open kitchen hall, pavilion, pagoda, wall and moon gate, arched bridge, paifang gate, platform canopy, library with outside stairs, props, train shell. Roofs come from a generator with concave slopes, upturned eaves and hip ridges.
- **Zones** (`build_zones.py`): train interior, station/plaza/hill path, academy hub.
- **Optimization:** `tools/optimize.mjs` (gltf-transform: meshopt + quantization; strips animation channels that stay at rest and non-hips translations so clips retarget).

**Tooling:** `npm run assets | budget | perf`. `?zone= ?spawn= ?quality= ?debug` URL parameters. A greybox test zone at `?zone=test`.

## Measured
- **First-visit critical path:** 531 KB (JS 222 KB gz + models 306 KB) against a 1.2 MB budget. All models together: 1.03 MB, streamed per zone.
- **Time to interaction** (`npm run perf`, cold cache, gzip text, `.glb` uncompressed, 5 runs):
  - must-pass profile (10 Mbps / 60 ms RTT / 4× CPU): **median 1.16 s** (target ≤ 3 s)
  - goal profile (50 Mbps / 20 ms / 1×): **median 0.34 s** (target ≈ 1 s)
- **Frame cost:**
  - Academy hub on the low tier at 844×390: 86 draw calls, 75k triangles.
  - High tier: about 50–90 draw calls; the busiest view peaked around 130k triangles before the one-mesh-per-object merge.
  - 60 fps on the dev machine (RTX 3060).

## Deviations from the plan (and why)
- **One `mixed` material per mesh**, with the shader family in the vertex alpha, instead of a material per kind. This fixed a Blender 5.2 glTF exporter bug (only the first material of a multi-material mesh got its vertex colours) and cut draw calls roughly in half.
- **Colour comes from vertex colours only**, not a palette atlas texture. The cloth grid is object-space triplanar rather than UV-based, so no UVs are exported.
- **Variable timestep with physics substeps** instead of a fixed 60 Hz step with interpolation.
- **Companion assists are abilities** (Tangtang's tarts, Wei Bao's Echo Friend); companions don't follow you around the field.
- **Not done yet:** planar reflections on the high tier, a lazy-loaded display font (system fonts only), a service worker.

## Known issues / limitations
- **Not yet tested on a real entry-level phone, a real touch screen or a physical gamepad.** Touch was checked with the UI forced into touch mode at phone size on a desktop GPU. Shader compile times on Mali/Adreno GPUs may be noticeably slower than measured here.
- **Character detail:** built from primitives, so they are toy-like chibis rather than the painterly refs. Some foot sliding in walk/run.
- **Terrain:** path edges are stair-stepped by the terrain grid resolution. Distant karst peaks are simple silhouettes.
- **Saves:** progress is stored per zone plus story flags. Reloading mid-cutscene resumes at the zone's entry with the same flags.
- **Balance:** the tutorial cloud can overwhelm a player who stands in the rain. Harmless, but the tuning in `grumbling.js` and `soothe.js` could be gentler.

## What to work on next (suggested order)
1. **Real-device pass:** an entry Android phone, an iPhone, an iGPU laptop and a gamepad. Tune tier thresholds (`core/quality.js`), touch button sizes, and the camera auto-recentre.
2. **Chapter 2: The Night Market Mix-Up.**
   - Night lighting: lantern glows, warm point-light fakes, the market stall kit.
   - Wistful Sparrow flock (a multi-Grumbling encounter), team-up soothing combos with Tangtang and Wei Bao, and 2 market mini-games (chestnut roasting, floating lanterns).
   - The lights-go-out hook across the harbour.
   - Sparrow sprites as guides.
3. **Feel:** companions who follow in the field (simple steering plus teleport-if-stuck), head look-at, turn-in-place, footstep dust, better walk-speed matching.
4. **Art pass:** a second modelling pass on the named characters (hair shapes, hands, more cloth folds), a finer path mask on the terrain, and more kit variety for the Quiet District (shuttered shops).
5. **Audio:** optional composed music, lazy-loaded after Begin; a per-zone ambience mix.
6. **Nice-to-haves:** a service worker for repeat visits, high-tier water reflections, remappable controls, a text-size option.
