# Snuggle Sorcery

A cozy take on the cursed-energy genre.

In the misty harbour city of Lantern Bay, curses born from small worries come out *fluffy*. They're called
**Grumblings**, and at Mistbloom Academy of Gentle Sorcery you don't fight them — you **soothe** them.
Play as Xiao Pei, hum her mother's lullaby, wrap Grumblings in glowing yarn, and collect the Charm Sprites
they become. The story is in [`ai/snuggle_sorcery_story.md`](ai/snuggle_sorcery_story.md).

A static, single-player three.js web game: no backend, no accounts, progress saved in your browser.

## Setup and run

```bash
npm install
npm run dev          # http://localhost:5173  (add ?debug for an fps / draw-call overlay)
npm run build        # static site in dist/ — host it anywhere (relative paths)
npm run budget       # first-load size check (fails if over budget)
npm run perf         # throttled time-to-interaction test in Chrome (needs a build)
```

Handy URL parameters while developing: `?zone=train|station|academy|test`, `?spawn=SPAWN_gate`,
`?quality=low|medium|high`, `?debug`.

## Playing

| Action | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move / look | WASD, mouse (click to capture) | sticks | left stick, drag right side |
| Hum (soothe) | hold E or left mouse | hold RT | hold the big Hum button |
| On-beat bonus | re-press Hum when the ring pulses | RT | Hum |
| Notice / talk | F or Enter | X | context button |
| Jump / sprint | Space / Shift | A / LB | Jump / push the stick all the way |
| Friend assist (tart, Echo Friend) | Q | Y | Assist |
| Sprite Book / pause | Tab / Esc | Back / Start | 📖 / Ⅱ |

**Soothing:** Notice a Grumbling, then hold Hum to wrap it in the Lullaby Thread. Dodge its tantrums (rain,
paper balls, darting socks, sighs) — a hit snaps the thread and costs Calm. Run out of Calm and Xiao Pei just
sits down for "five more minutes"; there is no game over. Fully wrapped Grumblings fall asleep and become
**Charm Sprites**, each with a helper ability (Umbrella, Sniff, Read, Cheer). **Cozy Energy** comes from kind
acts — sharing snacks, tucking in sleepy sprites, helping classmates, baking with Tangtang.

**This build:** the Prologue (the Rainy Train, Lantern Bay station) and Chapter 1 (Mistbloom Academy). Later
chapters are planned in [`ai/plan_0.md`](ai/plan_0.md) and [`ai/next_0.md`](ai/next_0.md).

## How it's made

- **three.js** (WebGL2) with one small family of stylized Lambert materials: colours come from vertex colours,
  cloth gets a procedural stitched-fabric grid, Grumblings are faceted paper-craft. No textures are downloaded.
- **No physics engine**: the player is a capsule against a [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
  collision soup built from each zone's `COL_*` meshes.
- **All sound is synthesized** with WebAudio (the lullaby, rain, the train, Captain Honk).
- **Assets are built by Python scripts in Blender** ([`tools/blender`](tools/blender)), driven through the Blender
  MCP while developing. Characters are rigged to one shared chibi skeleton, so a single animation library
  (`anim_humanoid.glb`) drives everyone. Blender is also the level editor: zones carry marker empties
  (`SPAWN_`, `NPC_`, `GRUMB_`, `POINT_`, `PLACE_<kit piece>`, `SCATTER_`, `WATER_`, `TRIGGER_`) that the game reads.
- Trees, lotus pads, candies, sky, water, rain and the scenery outside the train are generated in JavaScript.
- Load budget: the first playable scene needs about 0.6 MB; everything else streams in while you play.
  Quality tiers + dynamic resolution keep integrated GPUs and entry-level phones happy.

### Rebuilding assets

```bash
# headless (developed with Blender 5.2 LTS); or run one build_*.py at a time
blender -b -P tools/blender/build_all.py
npm run assets       # meshopt-compress assets-src/export/*.glb into public/assets/models/
```

### Fork it!

Snuggle Sorcery is MIT licensed and meant to be remixed. A few starting points:

- **Add a Grumbling:** model it in `tools/blender/build_creatures.py`, describe it in `src/content/species.js`,
  give it a tantrum in `src/actors/grumbling.js` (`BEHAVIOURS`), and place a `GRUMB_<species>` marker in a zone.
- **Write a scene:** story scripts are plain async functions (`src/story/*.js`) using `talk()`, `objective()`,
  `shot()` and events like `G.events.once('soothed', …)`.
- **Build a new area:** add a zone function to `tools/blender/build_zones.py` and a matching module in
  `src/world/zones/`.

## Initial setup

```bash
npm create vite@latest . -- --template vanilla
claude --dangerously-skip-permissions
```

## Backed by

Man & Bot

Browse web games at [Maize.Live](https://maize.live)
, or watch on YouTube [@RadWebGame](https://www.youtube.com/@RadWebGame)
, or follow us on X [RadWebGame](https://x.com/RadWebGame)
