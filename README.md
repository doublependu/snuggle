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
npm run budget       # load-size check for a first visit and for a returning player in every zone
npm run perf         # throttled time-to-interaction test in Chrome, per zone (needs a build)
npm run e2e          # end-to-end tests in headless Chrome: the story, touch UI at phone sizes, saves
```

Handy URL parameters while developing: `?zone=train|station|academy|market|test`, `?spawn=SPAWN_gate`,
`?quality=low|medium|high`, `?debug`, `?viewer` (every character, clip and face), `?zone=test&night`
(the greybox under lantern light). In dev builds the game object is `window.__G` in the console.

**Playtesting on a phone?** The pause menu has **Copy bug report** (your device, the game state, recent
errors and the save, ready to paste) and **Stuck? Back to last checkpoint**. To see the console itself:
Android Chrome via `chrome://inspect` on a desktop Chrome, iPhone Safari via Settings > Safari > Advanced >
Web Inspector and the Develop menu of Safari on a Mac.

## Playing

| Action | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move / look | WASD, mouse (click to capture) | sticks | left stick, drag right side |
| Hum (soothe) | hold E or left mouse | hold RT | hold the big Hum button |
| On-beat bonus | re-press Hum when the ring pulses | RT | Hum |
| Notice / talk | F or Enter | X | context button |
| Jump / sprint | Space / Shift | A / LB | Jump / push the stick all the way |
| Friend assist (a snack, then Echo Friend) | Q (twice for both) | Y | Assist |
| Point out a free good thing (sparrows) | click it, or 1–3 | d-pad left / right | tap it |
| Sprite Book / pause | Tab / Esc | Back / Start | 📖 / Ⅱ |

**Soothing:** Notice a Grumbling, then hold Hum to wrap it in the Lullaby Thread. Dodge its tantrums (rain,
paper balls, darting socks, sighs) — a hit snaps the thread and costs Calm. Run out of Calm and Xiao Pei just
sits down for "five more minutes"; there is no game over. Fully wrapped Grumblings fall asleep and become
**Charm Sprites**, each with a helper ability (Umbrella, Sniff, Read, Cheer, Guide). **Cozy Energy** comes from
kind acts — sharing snacks, tucking in sleepy sprites, helping classmates, baking with Tangtang, bringing lost
children home.

**The night market (Chapter 2):** the Wistful Sparrows ("I want that, but I can't afford it") won't settle for
humming alone. Sit with a flock, point out one of the free good things nearby — roasting chestnuts, lanterns
on the water, the musician's song, the moon — and hum: the thread reaches every perched sparrow at once.
Each sparrow loves one good thing best (Wei Bao's Echo Friend tells you which). Team up before humming: a snack
from Tangtang gives a **Sweet Lullaby**, Echo Friend an **Echo Lullaby**, both together **Everyone Together**.
Between flocks: roast chestnuts on the beat, float lanterns from the pier, and guide lost children home.

**This build:** the Prologue (the Rainy Train, Lantern Bay station), Chapter 1 (Mistbloom Academy) and
Chapter 2 (the Night Market Mix-Up). Later chapters are planned in [`ai/plan_0.md`](ai/plan_0.md); what was
built and what's next is in [`ai/next_2.md`](ai/next_2.md).

## How it's made

- **three.js** (WebGL2) with one small family of stylized Lambert materials: colours come from vertex colours,
  cloth gets a procedural stitched-fabric grid, Grumblings are faceted paper-craft. No textures are downloaded.
- **No physics engine**: the player is a capsule against a [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
  collision soup built from each zone's `COL_*` meshes.
- **Night lighting that phones can afford:** lantern light is painted into a small top-down texture over the
  zone (the *lamp map*, [`src/render/lamps.js`](src/render/lamps.js)); every material adds it with one texture
  fetch, so a hundred lanterns cost the same as one and light kit pieces, characters and the water alike.
  Without a shadow map (the low tier, and night), soft blob shadows keep everyone grounded.
- **All sound is synthesized** with WebAudio (the lullaby, rain, the train, Captain Honk, the night market's
  crowd and its street musician).
- **Assets are built by Python scripts in Blender** ([`tools/blender`](tools/blender)), driven through the Blender
  MCP while developing. Characters are rigged to one shared chibi skeleton, so a single animation library
  (`anim_humanoid.glb`) drives everyone. Character bodies start from a CC0 base mesh
  ([`tools/blender/base`](tools/blender/base)) warped onto each character's proportions, with sculpted heads,
  hair and clothes (signed distance fields), painted faces that blink and emote, and a small baked atlas.
  Blender is also the level editor: zones carry marker empties (`SPAWN_`, `NPC_`, `GRUMB_`, `POINT_`,
  `PLACE_<kit piece>`, `SCATTER_`, `WATER_`, `TRIGGER_`, `AREA_`, `LIGHT_`, `SEAT_`, `GOOD_`) that the game reads.
- Trees, lotus pads, candies, sky, water, rain and the scenery outside the train are generated in JavaScript.
- Load budget: the first playable scene needs about 0.75 MB; a returning player's zone at most 1.35 MB, with
  townsfolk streaming in after Begin. Every zone is interactive in under 2.2 s on a throttled 10 Mbps / 4x-CPU
  profile. Quality tiers + dynamic resolution keep integrated GPUs and entry-level phones happy.

### Rebuilding assets

```bash
# headless (developed with Blender 5.2 LTS); or run one build_*.py at a time
blender -b -P tools/blender/build_all.py
blender -b -P tools/blender/build_market.py      # just the night market (kit + zone)
npm run assets       # meshopt-compress assets-src/export/*.glb into public/assets/models/
```

### Fork it!

Snuggle Sorcery is free software and meant to be remixed. It is licensed under the
[GNU General Public License v3](LICENSE) (GPL-3.0-only): you can use, change and share it, and if you
publish a fork, it stays under the same licence with its source available. A few starting points:

- **Add a Grumbling:** model it in `tools/blender/build_creatures.py`, describe it in `src/content/species.js`,
  give it a tantrum in `src/actors/grumbling.js` (`BEHAVIOURS`), and place a `GRUMB_<species>` marker in a zone.
- **Write a scene:** story scripts are plain async functions (`src/story/*.js`) using `talk()`, `objective()`,
  `shot()` and waits on state such as `await soothed(grumbling)` (never on a one-shot event: players get
  ahead of the script).
- **Build a new area:** add a zone function to `tools/blender/build_zones.py` and a matching module in
  `src/world/zones/`.

## Licence and credits

- **Code, assets and story:** GPL-3.0-only, see [`LICENSE`](LICENSE).
- **Bundled libraries:** [three.js](https://threejs.org) and
  [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), both MIT. `npm run build` writes their
  licence texts to `dist/third-party-licenses.md`.
- **Character base mesh:** [`tools/blender/base/hero_male.glb`](tools/blender/base), CC0 1.0.
- **Sound:** synthesized in the browser. **Fonts:** your system's.

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
