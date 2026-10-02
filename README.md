# Snuggle Sorcery

A cozy take on the cursed-energy genre.

In the misty harbour city of Lantern Bay, curses born from small worries come out *fluffy*. They're called
**Grumblings**, and at Mistbloom Academy of Gentle Sorcery you don't fight them — you **soothe** them.
Play as Pip, hum her mother's lullaby, wrap Grumblings in glowing yarn, and collect the Charm Sprites
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
GPU=1 npm run e2e    # ...on this machine's GPU: about a third of the time (the fog chapters are slow in software)
npm run deploy       # publish to Cloudflare (see "Deploy" below)
```

### Deploy (Cloudflare)

The game deploys as an assets-only Cloudflare Worker ([`wrangler.jsonc`](wrangler.jsonc)): no server code, just
the static build in `dist/`, so every request is a (free) static-asset request.

```bash
npx wrangler login   # once: opens a browser to connect your Cloudflare account
npm run deploy       # build + budget check + wrangler deploy -> https://snuggle.<your-subdomain>.workers.dev
npm run cf:dev       # the same asset server locally (http://localhost:8787), no account needed
npm run cf:check     # checks headers, caching and types on wrangler dev; or: npm run cf:check -- <your URL>
URL=<your URL> npm run perf   # time to interaction from Cloudflare's edge, throttled like the local test
```

- **Caching** ([`public/_headers`](public/_headers)): everything under `/assets/` is cached for a year. JS chunks
  have content hashes in their names, and production builds add each model's content revision to its URL
  (`xiaopei.glb?v=…`, from `vite.config.js`), so a changed model is never served stale. `index.html` always
  revalidates, so a new deploy shows up on the next load.
- **Version:** the corner of the screen (and the bug report) shows `v.` and the first 4 characters of the
  commit the build came from, e.g. `v.9305`. A `+` (`v.9305+`) means it was built with uncommitted changes;
  the dev server shows `v.dev`. Workers Builds passes its commit in `WORKERS_CI_COMMIT_SHA`; a local build asks
  git (`vite.config.js`).
- **Custom domain:** add it in the Cloudflare dashboard, or a `routes` entry with `"custom_domain": true` in
  `wrangler.jsonc`. **Deploy on every push:** connect the GitHub repo under Workers Builds in the dashboard
  (build command `npm run build`, deploy command `npx wrangler deploy`).

### Autoplayer (a new player, automated)

```bash
npm run playtest                     # play from a fresh game to the end of Chapter 3, in real time
npm run playtest -- --record         # ...and record it as one uncut video with sound (needs ffmpeg)
npm run playtest -- --from market    # start partway (station, ch1, lesson, ch2, market, ch3, quiet, dusk,
                                     #   ch4, fog, heart, ch5, epilogue, free)
node tools/playtest/review.mjs tools/playtest/out/<run>   # contact sheets, event frames, freeze and loudness checks
```

[`tools/playtest`](tools/playtest) plays like a first-timer. It reads the objective, the tips and every line of
dialogue, looks for what it's told to find, and plays with real keyboard and mouse input. It decides only from
what's on screen: `eyes.js` is the one part that touches the game, and it reports only what's in view, described
by how it looks ("an old lady with round glasses"). It never reads story flags, markers or triggers, and never
teleports. Each run writes a log of what it thought and did, a summary (time per chapter and objective, and where
it got stuck or confused), and with `--record` a 1280×720 MP4. The MP4 has the game's sound, chapter markers, and
its thoughts as a subtitle track (off by default). It runs headless on the GPU if Chrome can use one (add
`--swiftshader` for software rendering); `HEADED=1` shows the window.

Its playbook covers the Prologue and Chapters 1 to 3 (a full run stops at "Chapter 3 complete"), and a day of free
roam: `npm run playtest -- --from free --minutes 8` reads the worry board, soothes the day's worries (crossing to
the Quiet District for one), and fishes at the pond bridge. It has rules for the Epilogue's objectives and the
first-years' outing that have not been run yet. It does not know how to shelter from a sigh or to stitch, so
Chapters 4 and 5 are covered by the end-to-end tests only (`GPU=1 npm run e2e -- chapter4-full chapter5-full`).

Handy URL parameters while developing: `?zone=train|station|academy|market|quiet|heart|test`, `?spawn=SPAWN_gate`,
`?quality=low|medium|high`, `?debug`, `?viewer` (every character, clip and face; add `&look` to have
them look at the camera), `?zone=test&night` (the greybox under lantern light), `?zone=test&quiet` (the
Quiet District's grey-out, fog wall, grey Grumblings and a memory, on the greybox), `?zone=test&fog` (Chapter
4's fog: the sighs, Bean awake, loose ends to stitch), `?nosw` (no service worker). In dev builds the game
object is `window.__G` in the console. `GPU=1 npm run e2e` runs the tests on the machine's GPU instead of
software rendering: the fog chapters' long tests are several times faster that way.

**Playtesting on a phone?** The pause menu has **Copy bug report** (your device, the game state, recent
errors and the save, ready to paste) and **Stuck? Back to last checkpoint**. To see the console itself:
Android Chrome via `chrome://inspect` on a desktop Chrome, iPhone Safari via Settings > Safari > Advanced >
Web Inspector and the Develop menu of Safari on a Mac.

## Playing

| Action | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Walk / look | WASD, mouse (click to capture) | sticks | left stick, drag right side |
| Run | hold Shift while walking | LB | push the stick all the way |
| Hum (soothe) | hold E or left mouse | hold RT | hold the big Hum button |
| On-beat bonus | re-press Hum when the ring pulses | RT | Hum |
| Notice / talk | F or Enter | X | context button |
| Jump | Space | A | Jump |
| Skip a long conversation | hold F (or Enter) | hold X | tap Skip |
| Friend assist (a snack, then Echo Friend) | Q (twice for both) | Y | Assist |
| Stitch (Chapter 4 on) | F to take a loose end, hold E where it belongs | X, hold RT | context button, hold Hum |
| Thread fishing (after the story) | E does all of it; F packs up, Space baits | RT; X, A | Hum; the panel's buttons |
| Point out a free good thing (sparrows) | click it, or 1–3 | d-pad left / right | tap it |
| Sprite Book / pause | Tab / Esc | Back / Start | 📖 / Ⅱ |

Keys and gamepad buttons can be changed in **Pause > Controls > Change controls**. **Settings** has a text size
for the dialogue, prompts and menus, a text speed (normal, fast, all at once), and the direction hints (after a
while, always, off). The pause menu also lists the **things to do here**: the place's optional things and how far
along they are.

**Finding your way:** every building and place has a name board, fingerposts stand where the paths fork, and a
place's name shows on screen as you walk up to it. After 40 seconds without getting nearer the objective, your
Charm Sprite flies ahead along the path and an arrow under the objective points the way, with the distance
left. Running (Shift) startles the shy Grumblings (the sparrows, the grey ones): walk up to them.

**Soothing:** Notice a Grumbling, then hold Hum to wrap it in the Lullaby Thread. Dodge its tantrums (rain,
paper balls, darting socks, sighs) — a hit snaps the thread and costs Calm. Run out of Calm and Pip just
sits down for "five more minutes"; there is no game over. Fully wrapped Grumblings fall asleep and become
**Charm Sprites**, each with a helper ability (Umbrella, Sniff, Read, Cheer, Guide). **Cozy Energy** comes from
kind acts — sharing snacks, tucking in sleepy sprites, helping classmates, baking with Sunny, bringing lost
children home.

**The night market (Chapter 2):** the Wistful Sparrows ("I want that, but I can't afford it") won't settle for
humming alone. Sit with a flock, point out one of the free good things nearby — roasting chestnuts, lanterns
on the water, the musician's song, the moon — and hum: the thread reaches every perched sparrow at once.
Each sparrow loves one good thing best (Bo's Echo Friend tells you which). Team up before humming: a snack
from Sunny gives a **Sweet Lullaby**, Echo Friend an **Echo Lullaby**, both together **Everyone Together**: for
five seconds every sparrow shows its favourite, and calms three times as fast to it.
Between flocks: roast chestnuts on the beat, float lanterns from the pier, and guide lost children home.

**The Quiet District (Chapter 3):** the Grumblings are turning grey and heavy, and they don't want to be hugged:
humming at one only makes it turn away. Keep it company instead — walk up and stay close (sitting on a bench
nearby is faster, and friends count too) until it looks up at you; then it lets the thread wrap it. Its
Charm Sprite has **Recall**. Across the harbour, the district has forgotten itself and gone grey: look for faint
glows, say what you notice, and choose which Charm Sprite remembers it (the Soggy Cloud's umbrella, the Lost
Sock's nose, the Homework's reading…). Each memory brings a pocket of colour back, relights its lanterns and
lifts a shutter. And check on the neighbours who never left.

**Bean's Secret (Chapter 4):** the fog covers the whole district overnight, and you see about eight metres.
Bean is awake, on Pip's head, and carries a small circle of colour with him: its size is her Calm. The Great
Sulk's **sighs** roll up the streets from the south: Bean's ears go up, the screen's edge greys, and you have a
few seconds to get behind something solid or into a warm spot (a lit window, a restored memory, a stitched
thread). A sigh that catches her costs a Calm and slows her; Calm comes back only in a warm spot. After Bean's
secret the Lullaby Thread can **Stitch**: take a loose end (a doorbell nobody rang, an unanswered letter), walk
it to where it belongs and hum it there. A stitch lights its stretch of street for good, and costs 10 Cozy
Energy (with none left it still works, only slower). The sleepers of Laundry Alley want company, not hugs, and
running wakes them.

**The Great Sulk (Chapter 5):** five phases, each one something learned in an earlier chapter, bigger: bake the
biggest cake anyone has seen with Sunny; choose the reply that *listens* as Bo lets the Great Sulk speak through
Captain Honk; call every Charm Sprite you have befriended and stitch each patch on the Sulk to its own kind;
light the fire, stir the pot and ring the bell of Master Fang's Domain of Comfort; then hum the whole lullaby to
sew Pip's own, the Everyone Blanket. What you did before changes it: the grey Grumblings you kept company
answer with Bo, the people you were kind to are the guests at the table, and the quilt's patches are your own.

**Morning in Lantern Bay (the Epilogue), and afterwards:** the walk back through the district brings its colour
back as you go. Then Lantern Bay is yours to wander:
- **Thread fishing** at six spots (the pond bridge, the station's shore, the market's sea wall, the district's
  jetty and canal bridge, and the old fountain). Hold Hum to send the thread out and let go to drop the float;
  hum on the beat to call the nearest glimmer closer; press at the bite; hold to wind in, and ease off while it
  tugs. Too tight for too long and it slips away, and nothing is lost. There are 14 fish (logged with your
  biggest, then let go), 10 lost things to take back to their owners, the Great Sulk's little reminders that
  fell short into the water, and one Grumbling that lives in a bottle. A tart or chestnuts on the thread bring
  bigger and rarer things. Uncle Ming at the station asks for one thing at a time, and improves your thread.
- **The worry board** at the Academy's gate (and the district's noticeboard): three worries a day, each a
  Grumbling somewhere in town. When all three are soothed, or when you sleep at the dormitory door, the next
  day's are pinned up. Three new kinds turn up: the **First-Day Jitters** (stand with its person, then hum), the
  **Bottled-Up** (fish it out gently) and the **Unsent Letter** (stitch its thread to whoever it was written to).
- **The first-years' train**, on the second day: this time Pip is the one on the platform with the sign.
- **The Everyone Blanket** hangs over the old square and grows with every patch you earn. The Sprite Book has
  eleven entries, a Harbour Book and a Lantern Bay page.

**This build:** the whole story: the Prologue (the Rainy Train, Lantern Bay station), Chapter 1 (Mistbloom
Academy), Chapter 2 (the Night Market Mix-Up), Chapter 3 (the Quiet District), Chapter 4 (Bean's Secret),
Chapter 5 (the Great Sulk), the Epilogue, and free-roam Lantern Bay. The plan for the last four is
[`ai/plan_8.md`](ai/plan_8.md); what was built and what's next is in [`ai/next_8.md`](ai/next_8.md), and a new
player's playtest of the first three chapters in [`ai/playtest_5.md`](ai/playtest_5.md).

## Characters

| Name | Who | Technique | Id in the code and saves | Built by |
|---|---|---|---|---|
| **Pip** (you) | An eleven-year-old first-year with a cardboard suitcase, off to live with her aunt | Lullaby Thread | `xiaopei` | `tools/blender/char_xiaopei.py` |
| **Bean** | A sleepy, bun-shaped Grumbling ("five more minutes") who naps in Pip's hood | | `doudou` | `tools/blender/build_creatures.py` |
| **Sunny Lin** | A bubbly second-year and the Academy's best baker | Sugarcraft | `tangtang` | `tools/blender/char_tangtang.py` |
| **Bo** and **Captain Honk** | A shy boy, and the felt goose puppet who does his talking | Echo Friend | `weibao` | `tools/blender/char_weibao.py` |
| **Master Fang** (Autumn Fang) | The Academy's gentle old master, who calmed the great fog fifty years ago | Domain of Comfort | `fang` | `tools/blender/char_fang.py` |
| **The Great Sulk** | A Grumbling the size of a building: every forgotten birthday and "I'm fine, really" in Lantern Bay. It doesn't attack. It just sighs | | `sulk` | `tools/blender/build_sulk.py` |
| **Uncle Ming** | The fisherman at the station, who teaches thread fishing | | `fisher` | `tools/blender/char_folk_a.py` |

The names were chosen to be easy to say in English (plan 5). Ids, model files and saves keep the earlier names
(Xiao Pei, Lin Tangtang, Wei Bao, Doudou), so existing saves still work.

## How it's made

- **three.js** (WebGL2) with one small family of stylized Lambert materials: colours come from vertex colours,
  cloth gets a procedural stitched-fabric grid, Grumblings are faceted paper-craft. No textures are downloaded.
- **No physics engine**: the player is a capsule against a [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
  collision soup built from each zone's `COL_*` meshes.
- **Night lighting that phones can afford:** lantern light is painted into a small top-down texture over the
  zone (the *lamp map*, [`src/render/lamps.js`](src/render/lamps.js)); every material adds it with one texture
  fetch, so a hundred lanterns cost the same as one and light kit pieces, characters and the water alike.
  Without a shadow map (the low tier, and night), soft blob shadows keep everyone grounded.
- **The Quiet District's grey** is a few instructions in the same shaders: zone scenery fades to grey except in
  *pockets of colour* around restored memories (up to eight spheres, one uniform array), and a height fog
  thickens near the ground and toward the fog wall. Characters and Charm Sprites keep their colour.
- **The deep fog and the Domains** (Chapters 4 and 5) are in the same shaders. Pockets of colour also clear
  the fog, and one of them travels with Bean. A **Domain of Comfort** is two sets of scenery in one place: inside
  a circle the street is discarded and Grandmother's Kitchen is drawn, outside it the other way round, with a
  bright rim between (one uniform; only the zone that has a Domain compiles it). The **Everyone Blanket**
  ([`src/procgen/quilt.js`](src/procgen/quilt.js)) is one mesh whose patches take their colours from your save.
  The Great Sulk's little reminders at dawn are one cloud of points animated in its vertex shader.
- **Made in code after the story:** the fish ([`src/procgen/fish.js`](src/procgen/fish.js): one faceted mesh
  from a few numbers), the bunting and the breakfast table ([`src/procgen/festive.js`](src/procgen/festive.js)),
  the worry board. Everything after Chapter 3 (the scripts, fishing, the worry board, the new species' text and
  models) loads after Begin, so the first load is the size it was.
- **The woods beyond the map** ([`src/procgen/forest.js`](src/procgen/forest.js)): the station and the Academy
  end at invisible walls, and beyond them the ground carries on into a forest generated when the zone loads
  (nothing is downloaded): a skirt of ground that continues the authored terrain's edge, whole trees and a
  thicket along the walls, cheap crowns further out. A mist that thickens with distance *from the map* (not
  from the camera, so the grounds stay clear) hides where it ends; it is a few lines in the shared fog code.
  Wildflowers grow where the terrain's own vertex colours say grass ([`src/procgen/flowers.js`](src/procgen/flowers.js)).
- **Signs and the guide:** a zone's name boards and fingerposts are one mesh and one canvas texture
  ([`src/world/signs.js`](src/world/signs.js)). The guide follows a small graph of path points per zone
  ([`src/systems/wayfinder.js`](src/systems/wayfinder.js)), so it leads over the bridge, not through the pond;
  the fingerposts point along the same graph.
- **All sound is synthesized** with WebAudio (the lullaby, rain, the train, Captain Honk, the night market's
  crowd and its street musician). The **music** is composed as note data ([`src/content/music.js`](src/content/music.js)):
  every track is a variation on Pip's mother's lullaby, played by a small step sequencer
  ([`src/core/music.js`](src/core/music.js)) on the lullaby's beat clock, so soothing stays in time with it. It
  loads after Begin, and each place has its own ambience mix (`G.audio.mix`).
- **Feel:** walk and run clips play at the speed that keeps a planted foot planted (measured once per
  character from the clip, `Humanoid.gait`), footsteps and little puffs land where the feet do, Pip
  pivots on the spot before walking off the other way, and turns to face whoever is talking to her.
- **Repeat visits:** production builds register a service worker after Begin that caches the whole game, so a
  returning player starts from the cache (even offline).
- **Assets are built by Python scripts in Blender** ([`tools/blender`](tools/blender)), driven through the Blender
  MCP while developing. Characters are rigged to one shared chibi skeleton, so a single animation library
  (`anim_humanoid.glb`) drives everyone. Character bodies start from a CC0 base mesh
  ([`tools/blender/base`](tools/blender/base)) warped onto each character's proportions, with sculpted heads,
  hair and clothes (signed distance fields), painted faces that blink and emote, and a small baked atlas.
  Blender is also the level editor: zones carry marker empties (`SPAWN_`, `NPC_`, `GRUMB_`, `POINT_`,
  `PLACE_<kit piece>`, `SCATTER_`, `WATER_`, `TRIGGER_`, `AREA_`, `LIGHT_`, `SEAT_`, `GOOD_`, `POINT_mem_`)
  that the game reads.
- Trees, flowers, signs, lotus pads, candies, sky, water, rain and the scenery outside the train are generated
  in JavaScript.
- Load budget: the first playable scene needs about 0.79 MB; a returning player's zone at most 1.4 MB, with
  townsfolk streaming in after Begin. On a throttled 10 Mbps / 4x-CPU profile a zone is interactive in 2.0 to
  2.5 s, and the Academy, the slowest, in about 3.1 s (a repeat visit, from the service worker's cache, in about
  1 s; `npm run perf` measures it, and the numbers move with the machine: see `ai/next_8.md`). Quality tiers + dynamic
  resolution keep integrated GPUs and entry-level phones happy.

### Rebuilding assets

```bash
# headless (developed with Blender 5.2 LTS); or run one build_*.py at a time
blender -b -P tools/blender/build_all.py
blender -b -P tools/blender/build_kit.py         # just the Academy's building kit
blender -b -P tools/blender/build_zones.py       # the train, the station and the Academy
blender -b -P tools/blender/build_market.py      # just the night market (kit + zone)
blender -b -P tools/blender/build_quiet.py       # just the Quiet District (kit + zone)
blender -b -P tools/blender/build_heart.py       # the Old Quarter and the square (Chapters 4 and 5)
blender -b -P tools/blender/build_sulk.py        # the Great Sulk
blender -b -P tools/blender/build_creatures2.py  # free roam's three Grumblings
npm run assets       # meshopt-compress assets-src/export/*.glb into public/assets/models/
npm run assets -- heart sulk                     # ...or only the ones named
```

### Fork it!

Snuggle Sorcery is free software and meant to be remixed. It is licensed under the
[GNU General Public License v3](LICENSE) (GPL-3.0-only): you can use, change and share it, and if you
publish a fork, it stays under the same licence with its source available. A few starting points:

- **Add a Grumbling:** model it in `tools/blender/build_creatures.py`, describe it in `src/content/species.js`,
  give it a tantrum in `src/actors/grumbling.js` (`BEHAVIOURS`), and place a `GRUMB_<species>` marker in a zone.
  Or keep it out of the first load, as free roam's three are: model it in `build_creatures2.py`, and describe it
  and register its behaviour in [`src/content/species2.js`](src/content/species2.js).
- **Add a catch:** a line in [`src/content/catches.js`](src/content/catches.js): a fish (its size range, how
  hard it tugs, and four numbers and two colours for its shape) and its id in a spot's `fish`, or a lost thing
  with the person it belongs to. `npm run e2e -- fishing- lost-return` checks the spots and the owners.
- **Add a worry:** a line in [`src/content/worries.js`](src/content/worries.js): a place, a kind of Grumbling, a
  spot, who pinned it up and what they say afterwards. `npm run e2e -- worries-` checks that every spot is on a
  floor the guide can reach.
- **Write a scene:** story scripts are plain async functions (`src/story/*.js`) using `talk()`, `objective()`,
  `shot()` and waits on state such as `await soothed(grumbling)` (never on a one-shot event: players get
  ahead of the script).
- **Build a new area:** add a zone function to `tools/blender/build_zones.py` and a matching module in
  `src/world/zones/`. In the module: its paths as a small graph (`NODES`, `EDGES`, then `new Routes` and
  `startGuide`), its signs (`PLACES`, `FINGERS`, `addSigns`), and for open land its play rectangle (`z.edge`,
  the inside of the invisible walls) with `addForest` and `addFlowers`. Story objectives name where they are:
  `objective(text, target)`. New tree groups go in with `grove()`, which fails the build if one comes within
  2.5 m of a path or a marker. `npm run e2e -- routes- signs- forest- edge-` checks all of it.

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
