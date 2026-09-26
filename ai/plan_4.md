# Plan 4: Start over, Cloudflare, Chapter 3 (The Quiet District), and the rest of `next_3.md`

Answers `ai/prompt_4.md`. Builds on `ai/plan_2.md`, `ai/next_2.md` and `ai/next_3.md`.

## 0. Short answer

- **Yes, "Start over" should go back to the train**, to the very start of the Prologue. Its own confirm box promises that ("Start the story over from the train?"). It doesn't, because of a bug that plan 2 introduced:
  - The button clears the save, then reloads.
  - While the page unloads, plan 2's autosave (`visibilitychange` and `pagehide`) writes the old progress straight back.
  - I reproduced it in headless Chrome: a save in the Academy, then **Start over** and OK, and the reload opens in the Academy again.
  - The fix and its tests are M1 (§1).
- **Cloudflare (M2, §2):**
  - An assets-only Worker (`wrangler.jsonc` serving `dist/`). No server code, so every request is a static-asset request, which Cloudflare doesn't charge for.
  - Long-lived caching for everything with a hash or revision in its URL. Models get a revision so they can be cached too.
  - A `_headers` file, and `npm run deploy`.
  - A check script that tests headers, types and load time against `wrangler dev` locally, or against the live URL.
  - **I won't run the deploy myself.** It publishes under your account, so you run `npx wrangler login` once and then `npm run deploy`.
  - A real URL also makes your iPhone retest (`next_3.md` item 1) much easier.
- **Chapter 3: The Quiet District (M3–M5, §3–§4):**
  - **Opening:** a grey morning at the Academy. Honk's *"Nobody remembers us"*, and Master Fang goes very still.
  - **The district:** a ferry to a new zone, grey and foggy.
  - **Grey Grumblings** that don't want hugs: you keep them company first.
  - **Investigation through Charm Sprite memories:** each sprite you've collected remembers something in the district, and each memory brings a pocket of colour back.
  - **Ending:** Master Fang's story of the fog that evening.
- **The rest of `next_3.md`, after Chapter 3:**
  - **M6:** the faceted rebuild of the chapter 0–1 Grumblings (plan 1 M7).
  - **M7, feel:**
    - walk speed matched to the animation
    - footsteps and dust on real foot plants
    - turning in place
    - Xiao Pei turning to face whoever talks to her
  - **M8, audio:** composed music (synthesized, lazy-loaded) and a per-zone ambience mix.
  - **M9, nice-to-haves:** a service worker, remappable controls, a text-size option, and the musician's erhu.
- **Budgets:**
  - **Every zone's load time before Begin stays within the spec.** New code and music load after Begin, or in the new zone's chunk.
  - **The first-visit JS is the tight one:** 233 of 240 KB is used (§8).

## 1. M1: "Start over" that really starts over

### 1.1 What goes wrong
- **The button** (`src/ui/menus.js:151-156`): `confirm()`, then `clearSave()`, then `location.reload()`.
- **The unload autosave** (`src/main.js:226-231`, added in plan 2 §2.2 so a discarded phone tab resumes where it was): on the way out, `visibilitychange → hidden` and `pagehide` both run `writeSave(G.save)`.
  - `G.save` still holds the old progress in memory, so it goes straight back into localStorage.
  - The reload then loads it: same zone, same spawn, same flags.
- **Confirmed in headless Chrome.** With a save in the Academy (Chapter 1 done), **Start over** then OK reloads into the Academy, and the stored save still says `zone: 'academy'`.
  - My first try at the repro failed the same way: the page I seeded from wrote its own save back over my seed on unload.
  - The repro script is in the session scratchpad, not the repo.
- **It's a regression.** "Start over" worked until commit `4a38634` added the autosave. No test covered it.
- **Three smaller problems with the same button:**
  - **URL parameters survive the reload.** `?zone=` and `?spawn=` override the save (`main.js:100,108`), so a bookmarked `?zone=academy` restarts in the Academy even when the save is empty. "Stuck? Back to last checkpoint" (`menus.js:139-143`) has the same problem.
  - **The browser's `confirm()` box:**
    - It can't be answered with a gamepad.
    - It can drop a phone out of fullscreen.
    - In an iframe without `allow-modals`, which is how many game portals embed games, it returns "cancel" without showing anything, so the button silently does nothing.
  - **Settings are wiped too:** volume, graphics, camera and hum toggle.

### 1.2 The fix
- **`save.js`: `resetSave()`.**
  - It builds a fresh `defaultSave()` that keeps the old `settings`, writes it, and swaps it into `G.save`.
  - It then **locks saving until the page is gone**: `writeSave` does nothing, so no unload handler or late story `await` can write old progress back.
- **An in-game confirm panel** replaces `confirm()`:
  - *"Start the story again from the train? Your Sprite Book, Cozy Energy and story progress will be cleared. Your settings stay."*
  - Buttons: **Start again** and **Cancel**.
  - It works with touch, keyboard and gamepad like the other menus. Cancel is focused first.
- **Reload to a clean URL:** `location.replace()` with `zone` and `spawn` removed. `debug` and `quality` are kept. "Back to last checkpoint" does the same.
- **The button is renamed "Start again from the train"**, so it says what it does.

### 1.3 Tests (`tools/e2e/`)
- **Harness fix first.** `h.open` seeds the save from an init script, which runs again on every reload. It's guarded by `window.__seeded`, and that is a new variable after a reload. The guard moves to `sessionStorage`, so the seed happens once per tab and reload tests see the game's real save.
- **New tests:**

  | Test | What it does | Pass when |
  |---|---|---|
  | `restart-to-train` | Starts from a market save (Chapter 2 done, volume 0.3, low graphics), then **Start again** | After the reload: zone `train`, empty story, sprites and Book, and settings kept. **Begin** plays the train intro. |
  | `restart-url` | The same, opened with `?zone=academy&spawn=SPAWN_gate` | It still lands on the train |
  | `touch-hit-*` (existing) | Now also checks the confirm panel's buttons at 390×844 and 844×390 | Both buttons are on top |

## 2. M2: Deploying on Cloudflare with wrangler

### 2.1 Approach
- The game is already a static site: `npm run build` writes `dist/` with relative paths.
- **Default: an assets-only Worker** (Workers Static Assets), which Cloudflare now recommends for new sites. Pages also works with wrangler (`wrangler pages deploy dist`); see §12, question 1.
  - There's no Worker script, so every request is a static-asset request. Cloudflare's docs say those are *"free and unlimited"*.
  - **Limits** are 20,000 files and 25 MiB per file on the free plan. We ship about 30 files, and the largest is 0.86 MB.
- **Compression:** Cloudflare compresses JS and HTML (zstd, brotli or gzip). It doesn't compress `.glb` (`model/gltf-binary` isn't on its list).
  - That is exactly what `npm run budget` and `npm run perf` already assume (models uncompressed, like GitHub Pages), so the measured numbers carry over.
  - If you later add a custom domain, a Compression Rule for `.glb` could save a little more, since meshopt output compresses a bit further.

### 2.2 Files
- **`wrangler.jsonc`:**
  ```jsonc
  {
    "$schema": "./node_modules/wrangler/config-schema.json",
    "name": "snuggle-sorcery",
    "compatibility_date": "2026-09-26",
    "assets": { "directory": "./dist", "not_found_handling": "none" }
  }
  ```
  With `"none"`, a missing model returns a real 404, not `index.html` (which would fail later as a confusing GLB parse error).
- **`public/_headers`** (Vite copies it into `dist/`; Cloudflare reads it and doesn't serve it):
  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /*
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
  ```
  - `index.html`, `sw.js` (M9) and `third-party-licenses.md` keep Cloudflare's default (`public, max-age=0, must-revalidate`, with an ETag). A new deploy is therefore picked up on the next load.
  - There's no frame-blocking header, so the game can still be embedded on sites like maize.live (§12, question 3).
- **`public/.assetsignore`:** `.vite`. Vite's build manifest is only for `npm run budget`, so it isn't uploaded. If Vite doesn't copy dotfiles from `public/`, a tiny build plugin writes the file instead.
- **Model revisions**, so models can be cached for a year too.
  - **The problem:** JS chunks already have content hashes in their names, but models in `public/assets/models/` don't. With long caching, a deploy that changes a model would keep serving the old one next to the new JS.
  - **The fix:** a small plugin in `vite.config.js` hashes each `.glb` at build time. Every model URL becomes `…/xiaopei.glb?v=<8 hex>`. That covers the preload map in `index.html`, `loadGLB` and `prefetch` in `core/assets.js`, and the viewer.
  - **Every model fetch goes through one URL helper**, so the preload and the fetch still match and nothing downloads twice.
  - **In dev**, the revision map is empty, so the URLs are unchanged.
- **`package.json`:**
  - `wrangler` as a pinned devDependency (4.141). It doesn't touch the game bundle.
  - Scripts:
    - `"deploy": "npm run build && npm run budget && wrangler deploy"`
    - `"cf:dev": "npm run build && wrangler dev"`: the real asset server and `_headers`, locally on :8787, with no account needed.
    - `"cf:check": "node tools/deploy-check.mjs"`
- **`.gitignore`:** `.wrangler/`.

### 2.3 Checks
- **`tools/deploy-check.mjs [url]`**, where the URL defaults to a `wrangler dev` it starts itself.
  - **Fetch:** it fetches `index.html`, follows the script and preload links, and requests every JS chunk and model with `Accept-Encoding: zstd, br, gzip`.
  - **Check:**
    - status 200
    - the right `content-type` (`text/javascript`, `model/gltf-binary`)
    - immutable caching on `/assets/*` and revalidation on HTML
    - `nosniff`
    - `/.vite/manifest.json` returns 404
    - every model URL carries its revision
  - **Report:** bytes on the wire, and the encoding used for each file.
- **`npm run perf` against any URL:** `URL=https://… npm run perf` skips the local server and throttles the real CDN with the same two profiles. This gives the load time from Cloudflare's edge, not from `localhost`.

### 2.4 What you do (the README gets a "Deploy" section)
1. `npm install`, then once: `! npx wrangler login` (it opens a browser).
2. `npm run deploy`. The first deploy prints `https://snuggle-sorcery.<your-subdomain>.workers.dev`.
3. Optional:
   - `npm run cf:check -- <that URL>` and `URL=<that URL> npm run perf`.
   - A custom domain: add a `routes` entry with `custom_domain: true`, or use the dashboard.
   - Auto-deploy on push: Workers Builds in the dashboard (build `npm run build`, deploy `npx wrangler deploy`), or a GitHub Action with an API token.

## 3. Chapter 3 design

### 3.1 Flow (`src/story/chapter3.js`)
0. **Handing over from Chapter 2.**
   - After the lights go out, the objective becomes *"Walk home: up the stairs to the Academy"* (they were walking home anyway).
   - Taking the stairs shows *"The next morning…"* and starts Chapter 3 at the Academy. It replaces the "Chapter 3: coming soon" card (`chapter2.js:232`).
   - **Existing saves:** one that is already back at the Academy after Chapter 2 starts the morning when it loads.
   - The market stays open from the gate.
1. **A grey morning (Academy).**
   - An overcast sky, and the courtyard sprites huddle together. Three grey Grumblings drift slowly across the courtyard toward the gate, heading downhill.
   - Xiao Pei hums at one. It turns away and sinks, and the thread slides off. Tangtang tosses a tart, and it doesn't even look.
   - Wei Bao uses Echo Friend, and Honk speaks in a tiny, sad voice: *"Nobody remembers us. So we're going to where nobody remembers anything."*
   - Master Fang, who has come up behind them, goes very still. The greys drift over the wall toward the harbour.
   - Fang: *"…Go and see where they gather, the three of you. Stay together, and be home before the lanterns are lit."*
2. **The ferry.**
   - Wei Bao at the gate now offers the Quiet District next to the night market.
   - A fade, then the ferry landing. On the first arrival, the chapter card appears.
3. **The Quiet District.**
   - Grey, foggy and shuttered. Across the water, the market's lanterns are the only colour, which reverses Chapter 2's view.
   - Tangtang: *"My grandma used to buy thread here. It was never quiet back then."* This line already exists in Chapter 2, so it pays off here.
   - The greys drift past toward the square.
4. **Investigation:** five Charm Sprite memories, in any order (§3.3).
5. **Grey Grumblings:** keep one company and soothe it (§3.2). Its sprite, **Recall**, opens the sixth memory.
6. **The last memory,** a kitchen door beside the fog wall. Then: *"It's getting dark. Master Fang said to be home before the lanterns are lit."* Back on the ferry.
7. **Fang's story (the Academy at dusk).**
   - The pavilion, the stove and tea. The friends tell her what they found, and her answers depend on which memories they saw.
   - She tells the story of the fog fifty years ago, using the lines from `snuggle_sorcery_story.md` and ending with *"It isn't a monster… loneliness always comes back when people stop checking on each other."*
   - The camera looks out over the harbour, where fog creeps over the far shore.
   - Doudou is awake in the hood, silent. Fang looks at him for a long moment and gives him a lemon candy.
   - Then two cards: "Chapter 3 complete: The Quiet District", and "Chapter 4: Doudou's Secret (coming soon)". Free roam follows.
- **Every step waits on state** (flags and positions), like Chapters 1 and 2, so a reload resumes at the right step.
- **New flags:** `ch3_start`, `ch3_greys`, `ch3_arrive`, `mem_<id>`, `ch3_return`, `ch3_story` and `ch3Done`. They're all additive, so saves need no version change.

### 3.2 Grey Grumblings: they don't want a hug, so keep them company first
- **Behaviour `heavy`** (registered by the Quiet District's chunk, not in the shared bundle):
  - **Drifting:** they drift slowly and low toward the district's heart (`AREA_heart`) and squash down when they stop.
  - **Humming too soon:** they turn away with a grey puff and a "…" bubble, and the thread slides off (no wrapping). The first time, a hint: *"They don't want a hug. Maybe just… stay with them?"*
  - **Running at them** makes them slide a few metres away. It's gentler than the sparrows scattering.
  - **Their sigh:** every 8 s or so, a slow grey ring spreads out. If it reaches her, Xiao Pei walks slowly for 2 s. This is a small taste of the Great Sulk's sigh, and nothing is lost.
- **Keeping them company:**
  - **How:** walk up (don't run) and stay within 2.5 m without humming, or sit on a nearby step or bench (`SEAT_`), which is 1.5 times faster.
  - **The company ring:** the soothing ring, in pale grey-blue, fills over about 8 s.
  - **What she sees:** the grey inches closer, looks up at her, and a little colour seeps back into it.
  - **Help:** friends standing nearby also count (×1.25). A grey near a restored memory needs half the time.
- **Then it's ready:**
  - *"…you're still here?"* It's noticed automatically, and humming wraps it normally.
  - Chapter 2's combos work here too.
  - With Echo Friend, Honk says the forgotten feeling it was born from. Each grey has its own:
    - a birthday nobody remembered
    - a letter nobody answered
    - "I'm fine, really"
    - a friend who moved away
    - a shop that closed
    - a phone call never made

    These are the pieces of the Great Sulk, planted early.
- **Six greys in the district, one required.**
  - They're batched into one draw call per part (`CreatureBatch`, as the sparrows were).
  - Each soothed grey becomes a **Grey Grumbling** sprite with the new ability **Recall**: *"Remembers forgotten things: finds memories hidden in the fog."* (`species.js:72-78` already has the stub.)
- **The Academy's three morning greys are scripted.** They can't be soothed and drift away. That's the story beat.
- **Model:** the grey is rebuilt now in the sparrow's faceted paper-craft style (`build_creatures.py:180-187`), because it's this chapter's star. The other four species follow in M6.
  - The new look: heavier and saggy, with drooping eyes and a hood-like fold.
  - **Colour comes back as it's soothed.** A `uColor` blend is driven by the company meter.

### 3.3 Charm Sprite memories (the investigation)
- **Memory spots.** Six faint glowing spots (`POINT_mem_<id>`). Interacting shows **Look closer**, and Xiao Pei describes a clue.
- **"Which Charm Sprite remembers this?"** A choice lists the sprites you have, up to six pill buttons, which fit in two rows at 844×390.
  - **The right sprite** flies from your followers to the spot, and the memory plays.
  - **A wrong one** gets a friendly line, like *"The Soggy Cloud rains on it a little. That didn't help."* There's no penalty.
  - This is the investigation puzzle: read the clue and pick the sprite. It needs no trip to the Sprite Book and works with touch, keyboard and gamepad.
  - **Every sprite is guaranteed.** The first five come from mandatory story steps (the Prologue, Chapter 1 and the Chapter 2 flocks). If a save is somehow missing one: *"Maybe a Charm Sprite you haven't met yet remembers this."*
- **A memory (about 20 to 30 s):**
  - **The scene:** the camera frames the spot, and a **pocket of colour** blooms around it.
  - **The figures:** translucent golden figures act out a moment. They are the townsfolk models, streamed after Begin, in one glowing "memory" material.
  - **The words:** lines play in a sepia "memory" style, with a fragment of the lullaby.
  - **Afterwards:** the pocket stays coloured, the nearest lanterns relight, and a shutter lifts a little.
  - **The reward:** +5 Cozy. The Sprite Book gets a small **Memories** strip with six slots.

| Spot | Clue | Sprite (ability) | The memory |
|---|---|---|---|
| Noticeboard by the ferry | faded writing | Unfinished Homework (Read) | A notice from fifty years ago, *"Fog advisory: stay indoors. Check on your neighbours."* Neighbours knock on doors with soup. |
| Post office letterbox | dripping with cold fog-water | Soggy Cloud (Umbrella) | Letters written and never answered; the postman with a full bag and nobody home. |
| Old sweet shop | a smell of lemons | Lost Sock (Sniff) | A lemon-candy wrapper. A girl in a too-big cardigan buys lemon candies "for later, for everyone". |
| Teahouse | an empty mahjong table, a lonely chair | Picked-Last Pom-pom (Cheer) | The teahouse full of laughter; then fewer chairs every year. |
| Thread shop (Tangtang's grandma's) | a crooked trail of red thread into an alley | Wistful Sparrow (Guide) | The shopkeeper ties a red thread on the girl's wrist: *"for tying things back together."* |
| A kitchen door by the fog wall | hidden in the fog until you have Recall | Grey Grumbling (Recall) | Lamplight and steam, and a grandmother's voice: *"Qiuyue! Five more minutes, then home."* *"Five more minutes, Grandma…"* Doudou wakes. Xiao Pei: *"Qiuyue… isn't that Master Fang's name?"* |

- **Foreshadowing:**
  - The lemon candies, the thread and the kitchen point at Chapters 4–5.
  - The thread memory sets up Doudou's *"you stitch them back to people"*.
  - The last memory hints strongly at who the girl was, but Chapter 4 still reveals Doudou's origin (§12, question 5).
- **Checking on the neighbours** (the chapter's theme, as optional kind acts):
  - Three residents still live there: the barber sweeping, an auntie at a half-open noodle shop, and an old man on his balcony.
  - Talking to them gives Cozy Energy and a line each. After the memories, their lines change.

### 3.4 The Quiet District zone (`tools/blender/build_quiet.py` → `quiet.glb` and `quiet_kit.glb`)
- **Layout** (about 70 × 50 m, across the bay from the market):
  - **South:** the ferry landing on the harbour wall, a moored sampan, and the noticeboard.
  - **The main lane north:** shuttered shopfronts on both sides:
    - the shops: the post office, sweet shop, thread shop, teahouse, barber, noodle shop and pharmacy
    - roll-down shutters and wooden shutter boards
    - faded signboards (colour blocks, no legible text)
    - tong-lau balconies with laundry poles, and dead lanterns strung across the lane
  - **A canal** with a stone bridge.
  - **The square:** an old banyan (procedural trees), a dry well, and steps and benches where the greys gather.
  - **The north end:** the **fog wall**, with a collider and `TRIGGER_fogwall` (*"It's too thick to go any further… not yet."*). The kitchen door is beside it. The Great Sulk will be beyond it in Chapter 5.
- **The kit** (instanced, one kit for this zone): shopfront variants, a balcony module, signboards, a dead lantern, a laundry pole, benches, steps, the well, a letterbox, a noticeboard, a mahjong table and chairs, and a thread-spool display.
  - `facade`, `boat`, `bollard`, `bench_m` and `lantern_post` from `build_market.py` are the starting point. They're copied into this kit so the zone needs only one kit download.
- **Markers:**
  - existing kinds: `SPAWN_ferry`, `NPC_`, `GRUMB_grey_n`, `SEAT_`, `LIGHT_`, `CAM_mem_<id>`, `WATER_harbour`, `WATER_canal`
  - new: `POINT_mem_<id>`, `AREA_heart` and `AREA_pocket_<id>` (colour-pocket centre and radius)
- **The look** (all shader work, with no extra passes and no stacked fog planes, as plan 0 asks):
  - **A `QUIET` environment:** an overcast late afternoon, grey-blue fog, low ambient light and a weak sun. There's no shadow map; blob shadows are used everywhere, which is also cheaper.
  - **Grey-out (`uFade`, declared in `materials.js:13` since plan 0 and finally wired):**
    - Non-skinned surfaces blend toward their grey value with a cool tint.
    - Characters are skinned, so they keep their colour. The friends are the colour in a grey world.
    - The water shader gets the same blend.
  - **Colour pockets:** up to 8 `vec4` spheres (the restored memories), with full colour inside and a soft edge that grows during a memory. It's one uniform array, and zones that don't use it pay nothing.
  - **Height fog:** the fog is thicker near the ground and thickens toward the fog wall.
    - Three's fog chunk is replaced with one that adds a height term (world height from the lamp map's existing `vLampWorld`) and a gradient to the north.
    - It costs a few instructions per pixel.
  - **Lanterns** start dark. Each memory relights its nearest `LIGHT_` group and re-bakes the lamp map, which is a small texture and takes about a millisecond.
  - **Grey motes** (the existing sparkles) drift toward the heart.
- **Travel:**
  - The Academy gate: Wei Bao offers the night market or the Quiet District.
  - The ferryman in the district offers the Academy or the night market.
- **Audio:**
  - a low wind, dripping, a distant foghorn and a far-off wind chime, with no crowd
  - the district's music (M8), and a short "memory" sting
- **Budgets** (added to `tools/budget.mjs`):

  | Item | Limit |
  |---|---|
  | `quiet.glb` | ≤ 200 KB, ≤ 60k triangles |
  | `quiet_kit.glb` | ≤ 150 KB, ≤ 30k triangles |
  | **Returning player entering the district** (Xiao Pei, animations, creatures, quiet, quiet kit, Tangtang, Wei Bao) | **≈ 0.86 MB of models** (the market's is 0.77 MB) |
  | Busiest view, low tier | ≤ 100 draw calls, ≤ 150k triangles |
  | Time to interaction | ≤ 3 s must-pass (expect about 1.8 s, like the market) |

  - The residents and the memory figures stream in after Begin.
  - The district is added to the `index.html` preload map, `npm run perf` and `?zone=quiet`.

### 3.5 The Academy in Chapter 3
- **Time of day follows the story.**
  - Today it's day before Chapter 1 ends and dusk after (`academy.js:31`).
  - It becomes: day, then dusk (Chapters 1 and 2), then a **grey morning** (Chapter 3 until you come home), then **dusk** (Fang's story and after).
- **`placeCast` for Chapter 3:**
  - In the morning: Fang in the courtyard and Wei Bao at the gate.
  - In the evening: everyone at the pavilion's stove, seated with plan 2's seating.
- `z.start` picks the chapter script from the flags. It is `chapter1` for Chapters 1 and 2, and it becomes `chapter3` after Chapter 2.

## 4. Chapter 3 milestones in detail

- **M3: groundwork, tuned in `?zone=test` first** (as the sparrows were):
  - the grey-out, colour pockets and height fog
  - the faceted grey, the `heavy` behaviour and the company ring
  - memory spots with the sprite choice, the memory player and the ghost material
  - **Draw calls and triangles** on the low tier are measured with `?debug`.
- **M4: the zone.** `build_quiet.py`, the kit, markers, ferry travel both ways, the ambience beds, and budgets.
- **M5: the story.**
  - `chapter3.js`, the Academy's morning and evening, the Chapter 2 hand-over, the Book's Memories strip, and the README.
  - A full play from the Prologue to the end of Chapter 3.

## 5. M6: Faceted Grumblings (plan 1 M7)
- **What:** rebuild the cloud, sock, homework and pom-pom in the sparrow's faceted paper-craft style (`ref/doudou_1.png`). The grey is done in M3.
- **Motion:** each gets simple motion in code, the way the sparrow's wings flap: the cloud's puffs breathe, the sock's toe wiggles, the homework's page corners flap, and the pom-pom's strands sway.
- **Same node names** (`<id>_body`, `<id>_eyes`, …), so behaviours, cocoons, sprite followers and Book portraits keep working. Each is checked in the `?viewer`, in its zone, and as a cocoon.
- **Budget:** ≤ 800 triangles each, and `creatures.glb` ≤ 110 KB (77 KB now).
  - It's on the first-visit path, so every extra KB counts: at most +33 KB, about 26 ms at 10 Mbps.
  - `npm run perf` must still show the train under 3 s.

## 6. M7: Feel
- **Real foot plants.** `Humanoid.footPlants()` samples the walk and run clips once per character (like `sitPose`).
  - It finds when each foot is planted, and how far the planted foot travels per cycle (the stride).
  - It's cached, so there's no per-frame cost.
- **Walk speed matches the animation.** Walk and run speed is set from the measured stride, instead of the guessed constants in `player.js:224-227`.
  - This covers Xiao Pei, the NPCs and the followers.
  - Test: `feel-stride` checks that a planted foot slides no more than 3 cm, at walking and running speed, for Xiao Pei and a following Tangtang.
- **Footsteps and dust on real plants.** The `step` sound and a small puff fire on each foot plant, replacing the fake `stepPhase` (`player.js:231-235`).
  - **Per zone:** dust on Academy paths, a little spray on wet market stones, mist in the Quiet District, and nothing inside the train.
  - **Bigger puffs** on landing.
  - **Cost:** the particle count scales with the quality tier.
- **Turning in place.** When she's standing and you push more than 100° away from where she faces, she pivots on the spot first, then walks.
  - It uses a new short `turn` clip (two shuffle steps, about +1 KB in `anim_humanoid.glb`).
  - Small direction changes still turn smoothly.
- **Facing whoever is talking** (plan 3's open question). In dialogue, if she's standing and the speaker is more than 60° off, she turns in place to face them. The head look-at does the rest.
  - Not while she's seated, humming, or posed by a cutscene.

## 7. M8 and M9: Audio and the nice-to-haves

### 7.1 Music (`src/core/music.js` and `src/content/music.js`, loaded after Begin)
- **A small step sequencer** on the same clock as the lullaby beat, so the soothing on-beat bonus still lines up.
- **Voices:** a plucked string (guzheng and pipa, Karplus–Strong), the existing bowed voice, a soft pad, a bell and a woodblock.
- **Scores**, written as note data, all variations on the mother's lullaby:

  | Where | The music |
  |---|---|
  | Train | A slow rainy-window lullaby |
  | Academy by day | A bright plucked melody with woodblock |
  | Dusk | Warmer and slower, with a bell |
  | Night market | Steps back near the stage (the musician is the music there), and light percussion elsewhere |
  | Quiet District | Sparse minor fragments that stop mid-phrase, as if forgotten. Each restored memory brings a voice back. |
  | Fang's story | A solo plucked lullaby |

  Plus short stings for memories, a soothed grey and chapter cards.
- **Size:** no audio files. It costs 0 bytes before Begin, and about 8 KB gzipped once loaded. It replaces today's background pad, and the existing Music slider controls it.

### 7.2 Ambience mix
- **An `AMBIENCE` table** gives each zone and mood its bed levels and music.
- **`G.audio.mix(id)`** crossfades over 2 s, and zones call it instead of setting beds by hand (e.g. `market.js:136-140`).
- **Ducking:** the music drops 6 dB under dialogue, and everything steps back while she hums.

### 7.3 Service worker (`sw.js`, written at build time)
- **When:** it's registered after Begin, once play has started, so it never competes with the first load. It's in production builds only; the e2e tests use the dev server.
- **What it caches:** in the background, the JS chunks and every model, by revision (§2.2). A returning player starts from the cache, even offline.
- **HTML is network-first,** so a new deploy is picked up on the next load. A new service worker takes over on the next visit, never mid-game.
- **Caches are named by build,** and old ones are deleted.
- **A kill switch:** deploying a `sw.js` that unregisters itself clears every player's.
- **Tests:**
  - On a production build under `wrangler dev`, a second visit fetches no models from the network, and an offline reload still reaches Begin.
  - `npm run perf` gets a "repeat visit" profile.

### 7.4 Remappable controls
- **In the Controls menu:**
  - Each keyboard action gets a **Change** button: press a key, Esc cancels, and a clash swaps the two bindings.
  - Gamepad buttons work the same way.
  - **Reset to defaults.**
- **Saved** in `settings.keys` and `settings.pad`. These are additive, so there's no save version change.
- The Controls table and the first-time hints (`HINTS` in `story/helpers.js`) show your bindings.
- **Touch is unchanged.**
- **The remap panel loads when you open it,** to protect the first-visit JS budget.

### 7.5 Text size
- **The setting:** "Text size" in Settings: 100 / 115 / 130 / 150 %. It sets a `--ui-scale` that applies to dialogue, choices, prompts, the objective, toasts and menus.
- **Test:** at 150 % and 844×390, `touch-hit-*` still finds every dialogue choice and menu button on top.

### 7.6 The musician's erhu
- **The prop:** a small erhu (sound box, neck, two pegs and a bow) in `market_kit`, about +3 KB.
- **The clip:** a new `erhu` upper-body clip in `build_anims.py`, with the left hand on the neck and the right arm bowing side to side.
- **Staging:**
  - She sits on a stool on the stage (`SEAT_musician`), with the erhu in her left hand and the bow in her right.
  - The ♪ notes and the bowed voice follow the bow strokes.
  - It replaces the `stir` stand-in.

## 8. Budgets and risks
- **Spec:** every zone's time to interaction stays at or below 3 s must-pass (goal 1 s). `npm run perf` covers all five zones, plus a repeat visit once the service worker is in.
- **The first-visit JS is the tight one: 233 of 240 KB.**
  - **Shared-bundle additions,** about 3 to 4 KB in total:
    - the grey-out and fog shader code
    - the save reset and confirm panel
    - the key-binding core
    - text size
    - foot plants
    - service-worker registration
    - the model revision map
  - **In lazy chunks:**
    - the Quiet District and Chapter 3 (including the `heavy` behaviour and memories)
    - the music engine and scores
    - the remap panel
  - **If it still doesn't fit,** I'll stop and show you the options rather than quietly raising the budget.
- **Low-end GPUs:**
  - **Pixel cost:** the grey-out, pockets and height fog add a few instructions per pixel and no passes. They're off (a uniform branch) in other zones.
  - **Draw calls:** the memory figures reuse streamed townsfolk models in one extra material, compiled after Begin so the first memory doesn't stutter.
  - **Measured headless:** draw calls and triangles. **Not measured:** fps on real GPUs (same as before).
- **Cache mistakes:** they're the main deploy risk, and the revisions plus `cf:check` guard against them. HTML always revalidates, so one deploy can fix any mistake.

## 9. Files
- **New:**
  - `src/story/chapter3.js` and `src/world/zones/quiet.js`
  - `src/systems/memories.js`
  - `src/core/music.js` and `src/content/music.js`
  - `tools/blender/build_quiet.py`
  - `tools/deploy-check.mjs`
  - `wrangler.jsonc`, `public/_headers`, `public/.assetsignore`
  - a build-generated `sw.js`
  - `ai/next_4.md`
- **Changed:**
  - **Core and saves:** `src/core/{save,assets,audio,input}.js`, `src/main.js`
  - **UI:** `src/ui/{menus,ui}.js`, `src/ui/ui.css`
  - **Rendering:** `src/render/{materials,water}.js`
  - **Actors:** `src/actors/{grumbling,humanoid,player,npc,follower,creatures}.js`
  - **Content and story:** `src/content/species.js`, `src/story/{chapter1,chapter2,helpers}.js`
  - **Zones:** `src/world/zones/{academy,market,test}.js`
  - **Page and config:** `index.html` (preload map with revisions), `vite.config.js` (revision plugin, service worker), `package.json`, `.gitignore`, `README.md`
  - **Tooling:** `tools/{budget,optimize}.mjs`, `tools/perf/load-test.mjs`, `tools/e2e/{run,tests}.mjs`
  - **Blender:** `tools/blender/{build_creatures,build_anims,build_market,build_zones}.py`
- **Regenerated:** `creatures.glb`, `anim_humanoid.glb`, `market_kit.glb`, `academy.glb` (the pavilion stove and seats), plus the new `quiet.glb` and `quiet_kit.glb`.

## 10. Verification
- **`npm run e2e`** (20 existing tests, updated where the story changed, plus new ones):
  - **Start over:** `restart-to-train`, `restart-url`.
  - **Chapter 3:**
    - `quiet-grey`: humming too soon is refused, keeping it company fills the ring, then it wraps into a Grey sprite.
    - `quiet-memory`: the right sprite plays the memory, a wrong one doesn't, and after a reload the pocket and lanterns are still restored.
    - `chapter3-full`: from a Chapter 2 save, the stairs, the morning, the ferry, six memories, home, Fang's story and `ch3Done`, with "heads upright" checks throughout.
    - `chapter2-full`: now ends by walking home into Chapter 3.
  - **Feel and settings:** `feel-stride`, `controls-remap` (rebind Hum and reload), and text size in `touch-hit-*`.
- **`npm run build && npm run budget && npm run perf`:** all five zones, the first visit unchanged or better, and the district within budget.
- **`npm run cf:check`:** against `wrangler dev` locally, and against your live URL once you've deployed. The service-worker repeat-visit check runs there too.
- **Screenshots:**
  - the district at 390×844 and 1280×720 on the low and high tiers, before and after memories
  - the faceted Grumblings in `?viewer`
  - the musician with her erhu
- **By hand, once deployed:** your iPhone retest of the plan 2 fixes, now on the real URL. **Copy bug report** still works there.

## 11. Out of scope
- **Chapters 4 and 5** (Doudou's secret, the Great Sulk and Domains of Comfort). The fog wall and the last memory set them up.
- **Deploying under your account**, a custom domain, and CI deploys. They're documented, and you run them.
- **fps on real GPUs**, which needs your devices.

## 12. Open questions (defaults in bold; I'll go ahead with the defaults unless you say otherwise)
1. **Cloudflare product:** **Workers static assets** (Cloudflare's recommendation for new sites; `wrangler deploy`), or Pages (`wrangler pages deploy dist`)?
2. **Address:** **the free `*.workers.dev` URL first**, or a custom domain now? If so, which hostname?
3. **Embedding:** should other sites (maize.live, game portals) be able to embed the game in an iframe? Default **yes** (no frame-blocking header).
4. **Scope:** **everything, in milestone order (M1 → M9)**, or stop after M5 (Start over, deploy and Chapter 3) and plan M6–M9 separately?
5. **Spoiler level in the last memory:** **keep "Qiuyue" and "five more minutes"** (a strong hint, but Chapter 4 still reveals Doudou's origin), or make it vaguer?
6. **Start over keeps your settings** (volume, graphics, controls): **yes**?
7. **Music:** **synthesized scores in code** (no downloads, GPL-clean, all variations on the lullaby), or recorded tracks, which would need audio files, a composer and a licence (about 1 to 2 MB each, loaded after Begin)?
8. **Wrangler as a pinned devDependency** (reproducible; large in `node_modules` because it bundles the local runtime, but nothing in the game bundle): **yes**, or `npx` on demand?
