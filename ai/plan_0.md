# Plan 0: Snuggle Sorcery, a cozy third-person game in three.js

Answers `ai/prompt_0.md`. The source story is `ai/snuggle_sorcery_story.md` and the visual references are in `ref/`.

## 0. Summary

We're building a third-person exploration, creature-collection and light action-adventure game in **three.js (WebGLRenderer, vanilla JS, Vite)**. The core verb is **soothing** Grumblings with Xiao Pei's *Lullaby Thread*. Each soothed Grumbling becomes a **Charm Sprite** that goes into a collection book and gives the player a field ability.

The story is too big for one pass, so the work is split into milestones:

- **Pass 1 (implementing this plan):** a complete, polished vertical slice covering the **Prologue (Rainy Train → Lantern Bay platform)** and **Chapter 1 (Mistbloom Academy hub)**. This pass also delivers the full engine, the asset pipeline, the loading and pause screens, and the performance harness.
- **Later prompts:** Chapters 2–5, the Epilogue and the post-game. The architecture below is designed so that each of these is mostly new content (a zone GLB, a zone script and data) rather than new engine work.

**It is a static, single-player web game.** `vite build` produces plain files (HTML, JS and GLBs) that any static host can serve. There is no backend, no accounts, no multiplayer and no network calls after assets load. Progress is saved only in the browser's `localStorage`.

The load-time budget drives several decisions:

- **No physics engine.** Rapier's wasm alone is about 0.5 MB gzipped, and a light action-adventure doesn't need rigid bodies. Character-vs-world collision uses **three-mesh-bvh** capsule collision instead.
- **The first playable scene is tiny.** It's the train carriage, and every other zone streams in behind it.

## 1. Constraints (from CLAUDE.md, turned into numbers)

| Spec | Target used for design and testing |
|---|---|
| Time to interaction (TTI) 2–3 s, 1 s great, 4 s max | **"Must pass" profile: 10 Mbps down, 60 ms RTT, 4× CPU throttle → TTI ≤ 3 s.** "Goal" profile: 50 Mbps, 20 ms RTT, no throttle → TTI ≈ 1 s |
| Definition of TTI | The **Begin** button on the loading page is enabled, the train zone is rendered behind the loading page, and its shaders are precompiled. Pressing Begin gives control immediately |
| Critical payload (everything needed for TTI) | **≤ 1.2 MB transferred.** JS ≤ 220 KB gz; first-zone GLBs ≤ 700 KB; HTML+CSS ≤ 20 KB; meshopt decoder ≈ 12 KB gz |
| 5-year-old PC with iGPU | 60 fps at 1080p. Dynamic resolution may drop the render scale to about 0.75 |
| 5-year-old entry-level phone (Mali-G52 / Adreno 610 class) | Stable ≥ 30 fps (aiming for 45–60 in light scenes), DPR capped at 1.0–1.25 |
| Per-frame scene budget (mobile / desktop) | ≤ 120 / 250 draw calls; ≤ 150k / 400k triangles; ≤ 6 skinned characters animating at full rate; ≤ 2 real-time lights plus fake glows |

## 2. Key technical decisions

1. **Renderer: `THREE.WebGLRenderer` (WebGL2).** `WebGPURenderer` and TSL add bundle weight and are less proven on entry-level Android. All materials are one custom **stylized Lambert/toon family** built with `onBeforeCompile` patches on `MeshLambertMaterial`, plus a separate water shader. PBR is avoided for mobile fill-rate. The target is 6–10 shader programs in total, precompiled with `renderer.compileAsync()` before the Begin button enables.
2. **Physics: none (for now).**
   - `three-mesh-bvh` handles the capsule-vs-static-mesh character controller (in the style of the three-mesh-bvh `characterMovement` example). Each zone has one merged low-poly collision mesh exported from Blender.
   - Grumblings, sprites and projectiles use simple kinematic steering with sphere checks against the player and the BVH.
   - If a later chapter truly needs dynamics (for example, a physics-toy mini-game), Rapier is **lazy-loaded inside that zone only**, never on the critical path.
3. **Build:** Vite with vanilla JS, as the README already says, using JSDoc types. Set `base: './'` so it runs from any host path (GitHub Pages sub-path, maize.live or a custom domain). Zone modules use dynamic `import()` so Vite code-splits them.
4. **Assets:** glTF binary (`.glb`). **Blender is the level editor.** Blender scenes contain the visual meshes plus named empties that carry custom properties, and these export as glTF `extras`. The runtime reads the empties to spawn NPCs, Grumblings, triggers, foliage scatter areas and so on. The post-export optimizer is `@gltf-transform/cli`: meshopt compression, quantization, dedup, prune, and WebP textures capped at 512 px.
5. **Textures kept to a minimum.** Most colour comes from **one shared 256×256 palette atlas** (UV-to-swatch) plus baked vertex colours (AO and bounce light, baked in Blender). Cloth gets its gingham/grid look from a **procedural shader grid** in UV space rather than from textures (see §3). This keeps GLBs small and materials shared, which in turn allows merging and instancing.
6. **Audio: synthesized with WebAudio in pass 1**, so there is no download. This covers the hum lullaby (an original pentatonic melody stored as note data), rain noise, Captain Honk's honk, UI blips and soft pad ambience. Recorded or composed music can come later, lazy-loaded after TTI.
7. **UI is a DOM overlay** (HTML/CSS) for the HUD, dialogue, menus and touch controls. Text stays crisp, it costs nothing on the GPU and it's accessible. The loading page uses system fonts; a single small display font may be lazy-loaded after TTI with `font-display: swap`.
8. **No framework or ECS library.** Entities are small classes with `update(dt)`, managed by the zone. A tiny event bus handles story and quest triggers. Progress is saved to versioned JSON in `localStorage`.

## 3. Art direction (from `ref/`)

**Environment (env_1–8).** The look is a Suzhou-style classical garden and water town on a harbour:

- dark grey tiled roofs with upturned eaves, and white plaster walls with round moon gates
- red-brown timber pavilions with lattice windows
- arched stone bridges, taihu rocks, lotus/lily ponds
- red maples, weeping willows, pines, and white blossom trees
- paper lanterns
- a backdrop of karst limestone peaks under big cumulus clouds
- a faint modern skyline far across the bay (env_7)

The lighting is warm, golden-hour sun with teal-green water.

**Humans (xiaopei, lintangtang, weibao, fangqiuye).** Chibi proportions, about 3.5–4 heads tall, with big dark eyes and soft cloth in mustard, orange, cream and teal. Their clothing carries a visible **grid/gingham line pattern**. We lean into that as the game's signature: everything soft is *stitched fabric*. That ties into the Lullaby Thread and pays off with the *Everyone Blanket* quilt in the finale. It's implemented as a thin anti-aliased UV-grid overlay in the cloth shader chunk, using `fwidth`, so it costs no texture.

**Grumblings and Doudou (doudou_1).** Chunky **faceted paper-craft** creatures, blocky with little ears, grumpy or sleepy slit eyes and a small nose. They're rendered flat-shaded (`flatShading: true`, so no split normals are needed in the GLB) in matte paper colours.

- **Doudou** uses the cream/white design, a "steamed bun with stubby ears".
- The red hooded and blue designs seed the Grumbling species palette.
- **Charm Sprites** are small, glowing versions of their Grumbling, with an emissive tint, a bob, and an additive sparkle trail.

**Character picks from the references:**

- **Xiao Pei:** mustard gingham puffer jacket with a hood (Doudou rides in it), cream checked trousers, a long braid with an orange tie, a yarn bundle on a chest strap, and an orange thread trailing from her. That thread *is* the Lullaby Thread.
- **Lin Tangtang:** the middle variant in `lintangtang.png`: teal cap and sleeves, cream bloomers, orange sash, and belt pouches holding bread.
- **Wei Bao:** mustard bandana cap and scarf, white shirt, satchel. Add **Captain Honk**, a white felt goose hand-puppet with an orange beak, on his left hand, with a hinged jaw bone.
- **Master Fang:** tiny and round, with big round glasses, a flat cap over an orange band, an orange knitted cardigan with sweet-filled pockets, a checked scarf and a bag.

**Mood by zone:** Train is rainy grey-blue outside and warm inside. Academy is golden hour. Night Market is indigo with lantern pools (Chapter 2). Quiet District is desaturated with height fog (Chapter 3). Domains of Comfort are warm interior light (Chapter 5).

## 4. Game design

### 4.1 Core loop
Explore → **Notice** a Grumbling → **Soothe** it (light action) → it cocoons, sleeps and pops into a **Charm Sprite** → the sprite joins the **Sprite Book** and can be equipped as the **helper**, whose field ability opens new paths or secrets → gain **Cozy Energy** from kind acts → use it for stronger techniques and companion assists.

### 4.2 Soothing (the "combat", with no damage or death)
- **Notice (tap Interact near a Grumbling).** It shrinks slightly and shows its feeling in a speech bubble ("I forgot my umbrella…"). Grumblings that are **ignored slowly grow**, up to a cap, which means more loops are needed later. This is the story's rule turned into a mechanic.
- **Hum (hold).** Xiao Pei hums, and a glowing yarn ribbon tethers her to the target and spirals around it. Wrap progress rises while she is in range, has line of sight, and isn't interrupted.
  - A soft **beat ring** pulses with the lullaby. Re-pressing Hum on the beat gives bonus wraps, which adds some skill without stress.
- **Tantrums.** Each species acts out with a readable pattern that the player dodges (move, jump, sprint). Getting caught **snaps the thread**, losing some wrap progress, and drains Xiao Pei's **Calm** meter.
  - If Calm empties she sits down, Doudou mumbles *"five more minutes,"* and after a few seconds she gets back up. The Grumbling's progress partly resets. There is no game over.
- **Full wrap:** the Grumbling becomes a cocoon, then a sleep animation plays, then it pops, and a Charm Sprite floats to Xiao Pei.
- **Cozy Energy** (a HUD meter) is earned from kind acts: sharing snacks with NPCs, listening to a full conversation, tucking in sleeping sprites, and the cooking mini-game. It is spent on:
  - **Sugarcraft Tart** (Tangtang assist, when she's in the party): an area-of-effect calm plus a pause in tantrums.
  - **Echo Friend** (Wei Bao assist): reveals the Grumbling's *need*, which gives that species' bonus (for example "just wants company": standing close doubles wrap speed).
  - **Thread Surge:** a multi-target wrap. It's a Chapter 4 upgrade, stubbed in pass 1.

### 4.3 Species in the vertical slice (full game target is about 16–20)
| Grumbling | Feeling | Tantrum pattern | Charm Sprite helper ability |
|---|---|---|---|
| Soggy Cloud | "I forgot my umbrella" | Hovers over the player and rains in a circle; move out of the rain | **Umbrella**: shelters from rain zones; waters plants, which makes lotus stepping-stones bloom |
| Lost Sock | "I lost my other sock" | Darts between hiding spots; corner it, then hum | **Sniff**: highlights hidden collectibles nearby |
| Unfinished Homework | "I didn't finish my homework" | Throws paper balls in arcs that you dodge; hides under the library stairs | **Read**: reveals lore notes and signposts |
| Picked-Last Pom-pom | "Nobody picked me for their team" | Doesn't attack; follows you sighing, and each sigh slows you. Soothe it by *letting it follow* while you finish another task | **Cheer**: speeds up Cozy Energy gain |
| Five More Minutes (Doudou) | "Five more minutes" | Story only | Pre-registered in the book at the Prologue |

The Chapter 2+ species (Wistful Sparrows flock, grey Grumblings, The Great Sulk and others) are defined as data stubs so the book shows silhouettes.

### 4.4 Vertical slice content
**Prologue: The Rainy Train** (first playable scene, and the smallest)

- **Setting:** one train carriage interior, about 20 m long. Low-poly passengers are generic chibi bodies with palette swaps, animated with procedural sway and no skinning. The windows show a parallax scroll of rain-washed karst peaks and paddies, generated in JS.
- **Tutorial beats:** movement and camera → Notice the Soggy Cloud raining on shoes → passengers grumble and move away → first hum (it can't really fail) → the cloud sleeps in her lap (cutscene: sit animation) → a Doudou-in-hood reveal gag.
- **Arrival:** the Lantern Bay station platform. **Lin Tangtang** waits with a sign reading "WELCOME NEW STUDENT (probably)" and custard tarts. She gives the first Cozy Energy through a shared snack. Walking up the hill path leads to Chapter 1.
- **Streaming:** the platform and hill path load while the player is on the train.

**Chapter 1: Welcome to Mistbloom** (hub, about 120 × 120 m on a hill above the harbour)

- **Layout:** a courtyard with Charm Sprites playing tag, a lotus pond with an arched bridge, pavilions, a moon gate, the dorm, and Master Fang's classroom.
  - Interior-lite rooms (a small interior set, no separate zone load) for the laundry room and the library stairs.
  - A kitchen where Tangtang runs the **cooking mini-game**, a rhythm/timing game that grants Cozy Energy.
  - A harbour overlook showing the far side of the bay, where Chapter 2's hook, the lights going out, will be visible later.
- **Story beats:** Master Fang's welcome and lemon candy (Grumblings grow when ignored and shrink when noticed) → the lost-sock mission → the homework mission → Captain Honk interrupts the lesson with "THE NEW GIRL HAS CRUMBS ON HER FACE", and Wei Bao joins → free-roam to find the Picked-Last Pom-pom, a few hidden collectibles, and kind acts.
- **End of slice:** the chapter-end card reads "Chapter 2: The Night Market Mix-Up — coming soon". Save, then free roam continues.

### 4.5 Controls
- **Keyboard + mouse:** WASD move, mouse orbit (pointer lock on click), Space jump, Shift sprint, **E / left-click hold = Hum**, F = Notice/Interact, Q = companion assist, Tab = Sprite Book, Esc/P = pause.
- **Gamepad** (Gamepad API, standard mapping): left stick move, right stick camera, A jump, RT hold Hum, X interact, Y assist, Start pause.
- **Touch:**
  - Left-half floating joystick; right-half drag to orbit.
  - Buttons: **Hum (hold, large)**, Jump, Interact (context-shown), Assist, and a pause icon.
  - The camera auto-recentres behind the player when there's no touch input.
  - Both orientations work (FOV adapts to aspect ratio); landscape is recommended on the loading page.
- **Camera:** a spring-arm third-person camera with a BVH sphere-cast to avoid clipping. While humming it soft-locks to frame Xiao Pei and the target.

## 5. Architecture

```
index.html                 inline critical CSS + loading page markup + fork ribbon (no JS needed to paint)
src/
  main.js                  boot: capability probe → quality tier → renderer → load zone 'train' → compileAsync → enable Begin
  core/        loop.js (fixed-step sim 60 Hz + render interp), events.js, input/ (keyboard, mouse, gamepad, touch → unified actions),
               assets.js (GLTFLoader + MeshoptDecoder, cache, priority queue, idle prefetch), save.js, audio/ (synth voices, lullaby, sfx),
               quality.js (tiers + dynamic resolution from frame-time EMA)
  render/      renderer.js, materials.js (toon/cloth-grid/paper/foliage-sway/glow), water.js, sky.js (gradient dome + cloud cards + karst silhouettes),
               fog.js (height fog chunk), vfx/ (thread ribbon, sparkles, rain, cocoon)
  world/       zone.js (load/unload/dispose, reads glTF extras → spawns), collision.js (BVH capsule controller, sphere-cast),
               zones/train.js, zones/platform.js, zones/academy.js   (each dynamically imported)
  actors/      player.js, camera.js, companion.js, npc.js, grumbling.js (+ species/ behaviours), sprite.js (followers, boids-lite), doudou.js
  systems/     soothe.js, cozy.js, collection.js, dialogue.js, quests.js (data-driven story steps), cooking.js
  ui/          hud.js, dialogue-box.js, pause.js, sprite-book.js, touch-controls.js, loading.js, ui.css
  procgen/     trees.js (maple, willow, pine, blossom as instanced clumps), lotus.js, rocks.js, lanterns.js, passengers.js, window-parallax.js
  content/     species.js, dialogue/*.js, quests/*.js   (plain data; easy for forkers to edit)
public/assets/models/*.glb  optimized, committed (the game runs without Blender)
tools/
  blender/lib/*.py         shared helpers: palette material, cloth-grid UVs, chibi body builder, armature + auto-weights, anim keyframer, glTF export
  blender/build_*.py       one script per asset or zone; runnable via Blender MCP (exec of the file) or headless `blender -b -P`
  optimize.mjs             gltf-transform pipeline: assets-src/export/*.glb → public/assets/models/*.glb
  budget.mjs               fails if the critical-path gz size or GLB sizes exceed budget
  perf/load-test.mjs       Playwright + CDP throttling → measures TTI (window.__snuggle.readyAt) on both network profiles
assets-src/                .blend and raw exports (gitignored; the scripts are the source of truth)
```

npm scripts: `dev`, `build`, `preview`, `assets` (optimize), `budget`, `perf`.

Runtime dependencies are only `three` and `three-mesh-bvh`. Dev dependencies are `vite`, `@gltf-transform/cli` and `playwright`.

### Loading sequence (critical path)
1. The HTML arrives (about 15 KB), and the loading page paints immediately: a CSS/SVG Doudou napping on a yarn ball, a progress thread, and a **"Fork me on GitHub" ribbon** linking to `https://github.com/doublependu/snuggle` (`target=_blank rel=noopener`).
2. `modulepreload` fetches the main chunk. In parallel, `<link rel=preload>` fetches `train.glb`, `xiaopei.glb`, `anim_humanoid.glb` and `grumblings_core.glb`.
3. Build the scene, then `compileAsync`, then render one frame behind the loading overlay. **Begin is enabled here (TTI).** Pressing Begin unlocks audio, can request fullscreen on mobile, and fades the overlay.
4. After TTI, idle-priority prefetch pulls in the platform, the academy, NPC GLBs and the optional font. Prefetching pauses while the player is actively loading or rendering heavy frames.
5. Zone transitions (train doors, the hill gate) use a short cozy wipe. If the next zone is already cached, the wipe takes less than 300 ms.
6. On unload, the previous zone's geometry, materials and textures are disposed, because entry-level phone memory is tight.

A service worker for repeat-visit caching is a later nice-to-have, not part of pass 1.

### Quality tiers (auto-selected, overridable in pause → Settings)
| | Low (entry mobile) | Medium (default) | High (iGPU desktop and up) |
|---|---|---|---|
| Pixel ratio cap | 1.0 | 1.25 | 1.5 (dynamic 0.7–1.0 scale) |
| Shadows | blob decals | 1 × 1024 dir. shadow, player + NPCs only, tight frustum follows player | 1 × 2048, includes near props |
| Water | gradient + scrolling noise + fresnel to sky colour | + fake reflection from mirrored sky/skyline | + half-res planar reflection (`Reflector`) for pond zones only |
| Foliage density / sway | 40% / off | 70% / on | 100% / on |
| Particles | 30% | 60% | 100% |
| Far LOD / draw distance | short + fog | medium | long |

The starting tier comes from a probe (`navigator.hardwareConcurrency`, `deviceMemory`, mobile UA hints and a GPU renderer string). During the first ~5 s of play, a frame-time EMA can step the tier down (or up once). Dynamic resolution runs on every tier.

### Rendering and performance rules
- Static zone geometry is merged per material in Blender at export, or with `BatchedMesh` at runtime for props that need culling. Repeated props (lanterns, lotus pads, rocks, trees) use `InstancedMesh`. Static objects set `matrixAutoUpdate = false`.
- Lighting is baked into vertex colours (Cycles bake → colour attribute) for the environment. At runtime there's one directional light, hemisphere ambient, and additive **glow billboards** instead of bloom post-processing. There is **no post-processing chain** in pass 1.
- Skinned characters share one skeleton and one animation library. Mixers for off-screen or distant characters update at 15 Hz or pause.
- Grumblings, Doudou and sprites have **no skeletons**: squash-stretch, bob, blink and ear-wiggle are procedural (per-part transforms or a vertex shader).
- The Lullaby Thread is a preallocated ribbon strip (about 64 segments) updated on the CPU along a Catmull-Rom curve, with an additive shader scrolling a fibre pattern. Nothing is allocated per frame.
- Avoid large transparent overdraw: fog is a shader chunk, not stacked planes, and rain is a cheap instanced-streak shader.

## 6. Asset pipeline (Blender MCP → GLB)

Connected: **Blender 5.2.0 LTS**, MCP addon 1.7. Telemetry is off, and the Hyper3D/Hunyuan3D/PolyHaven/Sketchfab/PolyPizza integrations are all disabled. The plan therefore uses **scripted procedural modelling with `bpy`**. This is fully reproducible, keeps the licence clean for forkers, and doesn't depend on any third-party service.

**Workflow per asset:**
1. Write `tools/blender/build_<asset>.py` using the shared helpers.
2. Run it through MCP with `execute_blender_code`: `exec(open('<repo>/tools/blender/build_<asset>.py').read())`.
3. Check the result with `get_viewport_screenshot` from 2–3 angles and compare it against the `ref/` image. Iterate.
4. The script exports to `assets-src/export/<asset>.glb`.
5. Run `npm run assets`, which does `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512 --simplify false` plus quantization, and writes to `public/assets/models/`.
6. Check the result in-game.

Scripts must follow the MCP rules: find nodes by type, not name, and read enum values rather than hardcoding them.

**Characters (Blender, rigged and animated):**
- A shared **chibi humanoid armature** (about 22 bones): root, hips, spine, chest, neck, head, hood (Doudou attach point), shoulder/upper/fore/hand ×2, thigh/shin/foot ×2. Optional extras: braid_1–3 on Xiao Pei, driven by a JS spring for secondary motion, and puppet_jaw on Wei Bao.
- **Bodies are built from parts.** Rounded primitives and subdivision are applied, then decimated to budget. Clothes are separate shells with cloth-grid UVs.
- **Skinning** uses automatic weights. When bone-heat fails on a part (non-manifold geometry), that part is rigidly parented to a bone instead. A slightly "doll-jointed" look is acceptable and fits the style.
- **Animation library** `anim_humanoid.glb` holds keyframes generated in Python (sine-based cycles, then hand-tuned): idle, walk, run, jump_up/air/land, hum_loop (arms weaving thread), throw, talk, wave, sit_down/sit_idle, overwhelmed_sit, celebrate. It is exported once. Every humanoid GLB uses the same bone names, so the clips apply to any of them. That saves bytes because clips aren't duplicated per character.
- **Budgets (after optimization):**
  - Xiao Pei: about 4k triangles, ≤ 180 KB.
  - Other named NPCs: about 3k triangles, ≤ 150 KB each.
  - Animation library: ≤ 120 KB.
  - Generic passenger/townsfolk base: about 1.5k triangles with 3 hair/hat variants. It is animated procedurally without a skeleton on the Low tier.

**Creatures (Blender, faceted, unrigged):** Doudou and the Grumbling species are grouped by chapter in `grumblings_core.glb` (about 300–900 triangles each). Separate part meshes (eyes, ears) allow procedural animation.

**Environment (Blender):**
- **A modular Chinese-architecture kit:** hip-and-gable roof with upturned eaves in 3 sizes, wall and pillar bays, lattice window panels (geometry on High, texture otherwise), moon gate, arched bridge, stairs, balustrade, pagoda tier stack, platform and dock, and the train carriage.
- **Zone scenes** are assembled from the kit plus terrain sculpted from displaced grids. They carry:
  - `COL_*` collision meshes (merged into one BVH)
  - empties for `SPAWN_*`, `NPC_*`, `GRUMB_*`, `TRIGGER_*`, `WATER_*`, `SCATTER_<type>` (density area) and `CAM_*` (cutscene cameras)
  - baked vertex AO and light
- Budgets: `train.glb` ≤ 300 KB; `platform.glb` ≤ 400 KB; `academy.glb` ≤ 1.2 MB (not critical path).

**Generated in JS (not Blender):** the sky dome and clouds, distant karst silhouettes and skyline, water surfaces, trees and foliage clumps, lotus pads and flowers, rocks, lanterns, rain, sparkles, the thread and cocoon, Charm Sprite glows, and the window parallax.

## 7. Milestones and acceptance criteria (pass 1)

**M0: Scaffold and shell**
- **Work:**
  - Vite vanilla setup (per the README), `three` and `three-mesh-bvh`, folder structure.
  - `index.html` loading page with the fork ribbon and the Begin button.
  - Pause screen (Resume, Sprite Book, Settings, Controls, **fork ribbon/link**). Auto-pause on `visibilitychange` and blur.
  - Unified input (keyboard/mouse, gamepad, touch).
  - Quality tiers and dynamic resolution.
  - `budget.mjs` and `perf/load-test.mjs`.
- **Accept:** a greybox capsule runs around a greybox room on desktop and touch. Both screens show a working fork link. `npm run build && npm run budget` passes. The perf script reports TTI.

**M1: Asset pipeline**
- **Work:** Blender helper library, chibi armature, animation library, **Xiao Pei**, Doudou, the Soggy Cloud, the optimize script.
- **Accept:** Xiao Pei idles, walks, runs, jumps and hums in-game with crossfades. The braid spring and Doudou riding in the hood both work. GLB sizes are within budget. Viewport screenshots are compared against the refs.

**M2: Core systems**
- **Work:** BVH character controller (slopes, steps, jump, ground snap), spring-arm camera with collision, Notice and Soothe with the thread ribbon, beat ring, tantrum/Calm, cocoon → sprite, Cozy Energy, Sprite Book UI, helper-ability slot, dialogue box, quest steps, save/load.
- **Accept:** in a test room the Soggy Cloud can be noticed, soothed, collected, equipped and saved, and it survives a reload. It works with all three input types.

**M3: Prologue**
- **Work:** train carriage, passengers, window parallax, rain, the tutorial script, the Doudou reveal, the platform zone, **Lin Tangtang** (model and animation), tarts and first Cozy Energy, streaming to the hill path.
- **Accept:** a **fresh-cache TTI of ≤ 3 s on the must-pass profile** (goal about 1 s on the fast profile). The prologue can be played end to end with no hitch over 100 ms at the zone transition.

**M4: Chapter 1, Mistbloom Academy**
- **Work:**
  - Architecture kit; academy zone with ponds, bridge, moon gate and courtyard; foliage scatter; the water shader tiers.
  - **Master Fang**, **Wei Bao and Captain Honk**.
  - Lost Sock, Homework and Picked-Last Pom-pom species with their helper abilities.
  - Cooking mini-game, hidden collectibles, kind acts.
  - Chapter end card, free roam.
- **Accept:** the whole chapter plays through. Four species are collectable. Frame-rate targets from §1 are met on the Low tier in the busiest academy view (checked with a debug HUD showing fps, draw calls, triangles and the tier).

**M5: Polish and handoff**
- **Work:** audio pass (lullaby, ambience, sfx), settings (volume, sensitivity, invert-Y, reduced motion, quality), accessibility basics (hold-to-toggle Hum option, readable text sizes), README update (controls, asset pipeline, how to fork and add a Grumbling), and `ai/next_0.md`.
- **Accept:** all budgets still pass, the perf script numbers are recorded in `next_0.md`, and there are no console errors.

**Later prompts (outline only, not built in pass 1):**
- **Chapter 2: Night Market.** Night lighting, the Wistful Sparrow flock (multi-Grumbling), team combos, market mini-games, and the lights-out hook.
- **Chapter 3: Quiet District.** Height fog, grey Grumblings that refuse hugs, Echo Friend investigation, Charm Sprite memory flashbacks.
- **Chapter 4: Doudou's Secret.** A solo stealth-and-comfort fog section, Doudou awake, the Thread Surge upgrade.
- **Chapter 5: The Great Sulk.** A 5-phase finale that uses every relationship and sprite, plus the **Domain of Comfort** transformation shader (a radial dissolve from street to Grandmother's Kitchen, then the Everyone Blanket quilt).
- **Epilogue and post-game.** Free roam of Lantern Bay, complete the book, and welcome the next first-years.

## 8. Verification

- **Load:** `npm run perf` runs Playwright with CDP network and CPU throttling on both profiles, 5 runs each, fresh cache, and reports the median TTI. During development the same check can run through the Playwright MCP.
- **Size:** `npm run budget` after every asset or dependency change.
- **Frame rate:** a debug overlay (`?debug`) shows fps, frame ms, draw calls, triangles, tier and render scale. Test on a real iGPU laptop, and **ask the user to try an entry-level phone**, because a GPU can't be emulated faithfully.
- **Visuals:** Blender viewport screenshots against the `ref/` images for each asset, and in-game screenshots through Playwright at both mobile and desktop viewports.
- **Gameplay:** manual playthrough of the Prologue and Chapter 1 with keyboard/mouse, gamepad and touch emulation.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Characters scripted with `bpy` fall well short of the painterly refs | Aim for strong silhouettes, colour blocking and the cloth-grid signature rather than realism. Iterate with viewport screenshots. Enabling Hunyuan3D/Rodin image-to-3D (which would send ref images to a third party) is possible **only with the user's approval** |
| Auto-weights fail on generated meshes | Build from parts, fall back to rigid-parenting per part, keep the bone count small |
| Load budget creep | Budget script, a single palette atlas, a shared animation library, meshopt, and lazy loading of everything outside the first zone |
| Mobile GPU cost of water, foliage and shadows | Quality tiers, dynamic resolution, and the Low tier tested first |
| Shader-compile hitches on mobile | A small material family, `compileAsync` before Begin, and a pre-warm of the next zone's materials during the transition |
| Scope (5 chapters and a finale) | Vertical slice first; later chapters are content-only work on the same systems |

## 10. Open questions (defaults in bold; implementation proceeds with the defaults unless told otherwise)

1. **Pass-1 scope:** **Prologue and Chapter 1, polished**, or a rough greybox of all chapters?
2. **Hosting target** (this affects brotli/gzip for `.glb` and the base path): **relative base that works anywhere**; GitHub Pages and maize.live both work.
3. **Language:** **JS with JSDoc**, following the README's vanilla template, or TypeScript?
4. **Lin Tangtang design:** **middle variant** of `ref/lintangtang.png`?
