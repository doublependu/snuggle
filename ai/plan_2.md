# Plan 2: Playtest fixes, the GPL licence, and Chapter 2 (The Night Market Mix-Up)

Answers `ai/prompt_2.md`. Builds on `ai/plan_0.md`, `ai/next_0.md` and `ai/plan_1.md`. There is no `next_1.md`: the plan 1 character pass landed in commit `19c10db`, but its hand-off step (M8) didn't. §7 picks up the pieces that matter here.

## 0. Short answer

Four parts, in this order:

1. **Fix everything from the playtests (M1).** I found causes in the code for all of them. Two are confirmed by a test (§1). Every fix gets a regression test that runs in a headless browser, with touch emulation for the phone bugs.
2. **Licence (M2).** Three places still say MIT. There's also a bigger question: every shipped character model is built from `ref/hero_male.glb`, which isn't in git and has no recorded licence. I need your answer on where it came from (§3.3).
3. **Groundwork for Chapter 2 (M3).** From `next_0.md`: friends who follow you around, heads that turn to look, cheap night lighting, loading NPCs progressively, and load budgets for every zone.
4. **Chapter 2: The Night Market Mix-Up (M4–M7).** The next story item in `next_0.md`: a night market zone, the Wistful Sparrow flocks, soothing combos with Tangtang and Wei Bao, two market mini-games, sparrow sprites that guide lost children, and the lights going out across the harbour.

## 1. What went wrong (diagnosis)

### 1.1 Stuck on the train (PC)
- **Cause: the train script only listens for events after it reaches that step.**
  - `src/story/prologue.js:41` waits with `G.events.once('noticed', …)` and `:65` with `once('soothed', …)`. Each listener is only attached when the script gets to that line.
  - The cloud is active from the start, though. Its **Notice** prompt appears within 3.2 m, and humming at it notices it automatically (`grumbling.js:66`).
  - Humming reaches 7.5 m, and the cloud is about 8 m from the spawn point. So holding E (the loading screen suggests it) while walking toward it during "Stretch your legs" wraps it early.
  - If the player notices or soothes the cloud before the script expects it, the event fires with no listener. The script then waits forever, and the train never arrives.
- **Also making it worse:**
  - The cloud's drift ignores walls, so it can float outside the carriage where the thread has no line of sight.
  - Tantrums keep going during dialogue, so Calm drains while you read.

### 1.2 Phone: 📖, Ⅱ, the pause menu and dialogue choices can't be tapped
**Confirmed.** I tested headless Chrome with touch emulation at 844×390. At the centre of 📖, Ⅱ and every pause-menu button (Resume, Sprite Book, Settings, Controls, Start over), `document.elementFromPoint` returns the camera **look zone**, not the button.

- **Cause:** `createTouch()` appends the touch layer last inside `#ui` (`touch.js:8`, after `UI` and `Menus` in `main.js:60-62`). No layer has a `z-index`, so the look zone paints on top of everything. It covers the right 55% of the screen at full height with `pointer-events: auto` (`ui.css:90`).
- **Consequences:**
  - The top buttons do nothing.
  - The game pauses itself when you switch apps or lock the screen (`main.js:209`). After that, the pause menu can't be dismissed, and reloading is the only way out.
  - Dialogue choices can't be tapped. A tap on the look zone counts as "confirm", so on touch the first choice is always picked without you noticing.

### 1.3 Phone: "Resume" reloads the game → two clouds → stuck again
- **Why it looks like a reload.** Nothing in Resume reloads the page. Given §1.2, the page was reloaded some other way. Either you had to reload it, or the browser did: mobile browsers, iOS Safari especially, discard background tabs and reload them when you come back. A lost WebGL context (not handled today) is the other candidate. Either way, **the game has to survive a reload at any moment**, and today it doesn't:
  1. **The train scene restarts.** The save says `zone: 'train'`, and `prologueTrain` is only set at the very end of that scene. So the scene starts over and the cloud spawns again, even though the save already has `sprites.cloud = 1`.
  2. **You get two clouds.** `SpriteFollowers.rebuild()` makes one follower per species. Soothing the respawned cloud calls `Collection.add` (count becomes 2), and `SpriteFollowers.add` spawns a second follower without checking whether that species is already there (`sprites.js:36`).
  3. **Stuck again.** On the replay you knew what to do and reached the cloud early, which is the §1.1 bug.
- **Save versions.** `loadSave()` throws away any save whose version doesn't match (`save.js:26`). Any save change must add a migration, not bump the version.

### 1.4 Phone: a touch gesture zoomed into a corner
- **How zoom is blocked today.** `maximum-scale=1` in the viewport meta, and `touch-action: none` on `html, body` only.
  - iOS Safari ignores `maximum-scale` (an accessibility decision since iOS 10).
  - Android Chrome honours it, unless the phone has "Force enable zoom" turned on.
- **Likely trigger.** A double tap on the look zone (tapping quickly through dialogue), or a pinch with one finger on the stick and one on the look zone.
- **Why you couldn't get back.** Once zoomed in, every touch goes to the game, so there is no gesture left to zoom out.
- I can harden this (§2.4), but I can't prove it's fixed without your phone and browser (§10, question 1).

### 1.5 Seated legs inside the seat
- **The bench and the marker** (`tools/blender/build_zones.py:135-140`).
  - The train cushion is 0.5 m deep, and its top is 0.50 m high.
  - The seat marker sits **0.35 m behind the cushion's front edge** (`bx + face*0.1`).
- **The pose and the leg.** The `sit` clip swings the thigh 88° forward. Chibi thighs are about 0.48 × hip height, roughly 0.2 m for Xiao Pei.
- **Result.** The knees end up about 0.15 m inside the cushion, and the shins hang down through the bench base. This affects Xiao Pei and all six passengers.
- **Why the code doesn't catch it.** `Player.sitOn` and `NPC.sitOn` only correct height (`clipHipsY('sit') - 0.11`), never depth.
- The academy lesson benches (Wei Bao, the classmate, Xiao Pei; `seat=0.89`) use the same marker convention. They get the same fix and check.

### 1.6 Licence
- **Still says MIT:**
  - `package.json` (`"license": "MIT"`) and the root entry of `package-lock.json`
  - `README.md:71` ("Snuggle Sorcery is MIT licensed")
  - the pause screen (`src/ui/menus.js:23`, "open source (MIT)")
- **Unknown base mesh.** Every character `.glb` in `public/assets/models/` is built by warping `ref/hero_male.glb` (`hero_base.py`, `kit.py`, every `char_*.py`). `ref/` is untracked, and the file has no author or licence metadata (checked: only `generator: Khronos glTF Blender I/O`). `hero_base.py:12` already warns that its licence must allow redistribution.
- **Plan 1 leftover.** `tools/blender/__pycache__/snuglib.cpython-313.pyc` is still tracked.

## 2. M1: Playtest fixes

### 2.1 Story steps that can't be skipped by playing ahead
- **Wait on state, not events.** Add helpers in `story/helpers.js`: `noticed(g)` = `until(() => g.noticed)` and `soothed(g)` = `until(() => g.state === 'gone')`. Each resolves immediately if the thing already happened.
  - Replace both `once` calls in the prologue with them.
  - Add a test that fails the build if a story script uses `G.events.once` on a Grumbling event.
- **The cloud stays asleep until the story needs it.** It spawns with `enabled: false`: it drizzles on shoes but can't be noticed or wrapped. It's enabled when "Find out why everyone's shoes are wet" appears. This uses the existing `Grumbling.enabled` flag.
- **Checkpoints in the train scene.** It becomes a short list of steps: intro → wander → notice → soothe → lap scene → arrival. On load, each step is skipped if its result is already saved (§2.2). A reload mid-scene resumes at the lap scene (the Doudou reveal) instead of starting over.
- **No tantrums while you read.** When `G.frozen` is set (dialogue, cutscenes), a Grumbling runs only its idle behaviour. It doesn't rain, throw, dart or sigh at you.
- **The cloud stays in the carriage.** Grumblings accept `opts.bounds`, a box read from a new `AREA_<id>` marker (scale = half extents, like `TRIGGER_`). The cloud's drift target is clamped to it, so it stays in line of sight.

### 2.2 Saves that survive a reload at any moment
- **One record per encounter.** When a Grumbling pops, write `save.soothed['<zone>:<id>'] = true`.
  - `Zone.grumblingAt` doesn't spawn soothed ones. The academy's per-species `…Done` flags keep working.
  - `Collection.add(id, from, key)` does nothing if `key` was already counted. This also makes Doudou joining safe to repeat.
- **One follower per species.** `SpriteFollowers.add` skips a species that already has a follower, matching `rebuild()`. The Sprite Book still shows the count.
- **Save v2, with a migration.** Replace the version check that wipes saves with `migrate(v1 → v2)`.
  - Adds `soothed: {}`.
  - For the one-off story species (cloud, sock, homework, pom-pom, Doudou), caps `sprites[id]` at 1, which fixes your "×2 cloud" save.
  - Infers `soothed` entries from the existing flags (`sockDone`, …).
- **Autosave** on `visibilitychange → hidden` and `pagehide`, so a tab the browser discards comes back where you left it.
- **WebGL context loss:**
  - `webglcontextlost`: call `preventDefault`, pause, and show "Tap to continue".
  - `webglcontextrestored`: recompile and resume.
  - If it isn't restored within 3 s: save and reload, which now lands on the right checkpoint.
- **"Stuck? Return to last checkpoint"** in the pause menu. A cozy game should always have a way out, even if a future script bug slips through.
- **"Copy bug report"** in the pause menu. It puts this on the clipboard for you to paste to me:
  - the device, browser, GPU renderer string, quality tier, pixel ratio and average fps
  - the zone and position
  - the save JSON
  - the last 20 console errors

  It makes playtest reports from a phone much easier.

### 2.3 Touch UI layers
Explicit stacking order in `ui.css` (`z-index` per layer), lowest to highest:

1. world bubbles and floaties
2. touch controls (stick zone, look zone, touch buttons)
3. HUD, including 📖 and Ⅱ
4. prompt and soothing ring
5. dialogue and the cooking panel
6. menus
7. chapter card and fade

The look zone also starts below the HUD strip, so drags that start on the top buttons never become camera turns. Dialogue choices then get real taps, and a tap on the dialogue box itself still advances the text.

### 2.4 Zoom lock (phone)
- **Touch behaviour on every layer.** `touch-action: none` on the canvas, `#ui` and every touch layer. Menus get `touch-action: pan-y` so long panels can still scroll.
- **Block zoom gestures in JavaScript.** Cancel WebKit's `gesturestart` and `gesturechange`, and `dblclick`. A non-passive `touchmove` listener cancels moves with more than one finger, except inside a scrolling menu.
- **A way back.** If `visualViewport.scale > 1.01`, show a "Reset zoom" chip. Tapping it rewrites the viewport meta, which snaps iOS back. If a device ignores that, the chip tells you to pinch out, which now works because the game no longer eats the gesture while zoomed.

### 2.5 Sitting properly
- **New seat convention.** A seat marker marks the **centre of the seat's front edge**. `seat` is still the height of the seat top.
- **Placement per character.** `Humanoid.sitPose()` evaluates the first frame of the `sit` clip once per character and caches two numbers: the hips height (already there) and **how far the knee sits in front of the root**.
  - Both `sitOn`s place the root at `front − forward × (knee + 0.02)`, so the knees are just past the edge and the shins hang in front. Xiao Pei, Wei Bao, the townsfolk and any later character all fit, whatever their leg length.
  - Standing up moves her to a point in the aisle instead of inside the bench's collision box.
- **Chibi-sized train benches.**
  - Cushion depth 0.5 → about 0.38 m and seat height 0.50 → about 0.44 m. The backrest moves forward so backs touch it and feet hang close to the floor.
  - Markers are regenerated with `build_zones.py`, and the academy lesson benches get the same treatment.
- **Only if needed:** a small change to the `sit` clip, with the thighs at 80° and a slight lean back. That's only if the review shows jackets clipping through thighs.
- **Check.** Side-view screenshots of every seated character, in the viewer and in both zones.

### 2.6 M1 acceptance
- **Regression tests in `tools/e2e/`** (Playwright; see §8):
  - Rushing the cloud (humming at once, or noticing it early) still reaches the station.
  - A reload between the soothe and the arrival resumes at the lap scene, with `sprites.cloud === 1` and one follower.
  - At 390×844 and 844×390 with touch, every HUD, menu and choice button is the element on top at its centre.
  - An automatic pause, then tapping Resume, un-pauses the game.
- **Seating:** side views show knees at the seat edge and shins in front, for all 9 seated characters.
- **No regressions:** `npm run build && npm run budget && npm run perf` numbers are unchanged, since these fixes add no downloads.

## 3. M2: Licence

### 3.1 References
- **`package.json`:** `"license": "GPL-3.0-or-later"` (§10, question 2), then refresh the lock with `npm install --package-lock-only`.
- **README:**
  - Rewrite the "Fork it!" paragraph: Snuggle Sorcery is free software under the GPL v3, remixes are welcome, and forks you distribute stay under the same licence with their source available.
  - Add a short **Licence and credits** section: the GPL, bundled libraries (three.js and three-mesh-bvh, both MIT), audio that is all synthesized, and fonts that are system fonts only.
- **Pause screen:** "open source (GPL-3.0)", linking to `LICENSE` on GitHub.
- **Source headers:** a one-line `SPDX-License-Identifier: GPL-3.0-or-later` at the top of our own source files in `src/` and `tools/` (§10, question 4).
- **Not touched:** earlier `ai/` documents stay as they are, since they're a history of the project.

### 3.2 Notices for bundled libraries
Turn on Vite 8's `build.license`, so `dist/` ships `.vite/license.md` listing the licences of the bundled dependencies. The MIT licence requires its notice to travel with the code. The `npm run budget` check confirms the file exists.

### 3.3 The character base mesh (needs your answer)
**Why it matters.** The characters in `public/assets/models/` are derived from `ref/hero_male.glb`. Publishing them needs that file's licence to allow redistribution, and to be compatible with the GPL:

- **OK:** CC0, CC-BY or CC-BY-SA 4.0 (with credit).
- **Not OK:** a "non-commercial" or "no derivatives" licence, or a store's "personal use" licence.

Forks also can't rebuild the characters while the file stays outside git.

- **If the licence is compatible:** move the file to a tracked `assets-src/base/`, add its licence and a credit line, and point `hero_base.py` at it.
- **If it's unknown or incompatible:** swap it for a CC0 base mesh, or go back to plan 1's script-built bodies, and rebuild the character GLBs. That's roughly one character pass, done as its own plan; it doesn't block Chapter 2.

### 3.4 Housekeeping
- Add `__pycache__/` to `.gitignore`. You run `git rm --cached tools/blender/__pycache__/snuglib.cpython-313.pyc` when you commit.

## 4. M3: Groundwork for Chapter 2 (from `next_0.md`, items 1 and 3)

- **Friends who follow you** (`src/actors/follower.js`).
  - Tangtang and Wei Bao walk with Xiao Pei: seek with arrival, settle into slots beside and behind her, and use a ground check against the level geometry.
  - A friend who is more than 12 m away or stuck for 2 s teleports out of view.
  - They idle by stalls when she stops. Scripts can take them over.
- **Heads turn to look.** NPCs turn their head (and a little of the chest) toward the speaker or toward Xiao Pei, within limits. It runs after the animation mixer, so it works with every clip.
- **Zone-scoped event listeners.** `wireAcademy` adds `G.events.on(…)` listeners that are never removed. Once you can travel between academy and market, they would stack on every visit. `Zone.on()` subscriptions are removed automatically when the zone is disposed.
- **Night lighting that phones can afford.**
  - **Static geometry:** lantern light is baked into the zone's vertex colours in Blender, next to the existing AO bake (`bake_light` in `snuglib.py`). That costs nothing at runtime.
  - **Moving things** (characters, Grumblings, props): the `mixed` shader gets up to **4 warm point lights** as uniforms. Each frame the CPU picks the 4 `LIGHT_` markers nearest the player. It's per-vertex on the low tier and per-pixel on medium and high. Day zones pass 0 lights, so no extra shader program is needed.
  - **Lantern halos** come from the existing `Glows` points (one draw call). Reflections are stretched glow billboards on the water.
  - **Night sky:** stars (one `Points`), a moon sprite, and a night palette in `sky.js`.
  - **Shadows:** no sun shadow map at night. Blob shadows go under characters instead, which saves GPU work on phones.
- **Progressive NPC loading.** Before Begin is enabled, a zone waits only for the player, her friends and the zone itself. Vendors, townsfolk and children stream in afterwards. The spec allows progressive loading after first interaction. This also helps the academy.
- **Budgets for every zone entry.**
  - **The problem:** `budget.mjs` and `perf` only measure a first visit (the train). A returning player whose save is in the academy downloads about **1.25 MB** of models today (all eight characters plus the kit), and nobody has measured it.
  - **The fix:** both tools gain a profile per zone for a returning player (train, station, academy, market), each held to the same ≤ 3 s must-pass.
  - The preload map in `index.html` follows the new "wait only for essentials" rule.
- **Real-device pass.** I can't hold a phone, so this milestone adds the e2e suite at phone sizes and the bug-report button (§2.2). Tuning the tier thresholds waits for your reports.

## 5. Chapter 2 design

### 5.1 Flow (`src/story/chapter2.js`)
1. **Setup.** After `ch1Done`, the academy objective becomes "Meet your friends at the gate for the night market" (it's evening at the academy). Talking to Tangtang at the gate shows the chapter card, then `goto('market')`.
2. **Arrival.** The market is lanterns, steam and crowd noise. Tangtang heads for the dumpling stall, and Doudou wakes up for dumplings. Then a crash: sparrows knock over the lantern stall.
3. **Tutorial flock.**
   - Xiao Pei hums, and the sparrows scatter.
   - Wei Bao uses Echo Friend, and Honk speaks for them: "I WANT THAT. BUT I CAN'T AFFORD IT."
   - Xiao Pei: "Buying them things won't fix it… maybe we just sit with them."
   - She sits on a stool, the sparrows perch, she points out the smell of roasting chestnuts, and she hums. They fall asleep.
4. **Free play.**
   - Two more flocks, at the toy stall and on the pier.
   - Chestnut roasting and floating lanterns.
   - Once you have a sparrow sprite, lost children to guide home.
   - The objective lists what's left, like Chapter 1's.
5. **The hook.**
   - After the third flock, dumplings with everyone. Walking home along the promenade, the lanterns across the harbour go out one by one.
   - The fog turns cold, and the music pad drops to a minor key.
   - Tangtang: "Did… the lights just go out over there?" Wei Bao: "…that's the Quiet District."
   - Card: "Chapter 3: The Quiet District (coming soon)". Free roam continues. Stairs at the market entrance go back up to the academy.

### 5.2 Wistful Sparrow flocks: "sit with them and point out the free good things"
- **Flocks.** Three flocks of 3, 4 and 5 sparrows.
- **Tantrum (`flock`).**
  - They flit over a stall and peck goods, which tumble in simple animations with no physics.
  - If you **run** within 4 m, they scatter to the rooftops and drift back a few seconds later. Walking is fine.
  - Humming alone barely calms them (×0.15).
- **Sit with them.** A stool or bench near each stall offers **Sit with them**, which uses the §2.5 seating. While you sit, the sparrows hop down and perch around you, and each is noticed automatically. A thought bubble shows the thing it wants (a toy, a lantern, a snack).
- **Point out a free good thing.**
  - While seated, 2 or 3 good things nearby glow: the chestnut smoke, the lanterns on the water, the street musician's song, the moon over the bay, the dumpling steam.
  - Each shows as a world-anchored chip, like "🌰 Chestnut smell". **Tap or click a chip, or press 1–3 or the d-pad**, then hold Hum.
  - The Lullaby Thread runs from Xiao Pei to the good thing and fans out to every perched sparrow, wrapping them all together.
  - Each sparrow likes one good thing best. A match wraps it twice as fast, and a sparrow whose favourite isn't there still calms, just slowly.
  - This works with touch, mouse and gamepad, and needs no aiming.
- **Team-up combos** (your friends follow you; the assist is the existing Q / Y / Assist button). Using an assist and then humming within 2 s triggers a combo, shown as a banner:
  - **Sweet Lullaby** (Tangtang's tart): perched sparrows wrap ×1.5 for 4 s, and more sparrows hop down to perch.
  - **Echo Lullaby** (Wei Bao's Echo Friend): Honk says each sparrow's favourite good thing aloud, and the match bonus goes from ×2 to ×3 for 6 s.
  - **Everyone Together** (both within 4 s): all perched sparrows finish at once. It's a small preview of the Chapter 5 finale.
- **No fail state.** Standing up or running only makes them flutter off. They come back.
- **Result.** Each flock pops into sparrow Charm Sprites. The Book counts them, and one sparrow follows you.

### 5.3 Market mini-games
Both reuse the structure of `cooking.js` (a DOM panel plus a 3D prop), last 60–90 s, can't be lost, and give Cozy Energy.

- **Chestnut roasting** (with the chestnut vendor).
  - Five chestnuts slowly toast in a wok. Stir on the lullaby's beat to keep them even. Flip each one (tap its lane, or press 1–5) when it hits golden.
  - Reward: bags of chestnuts, a shareable snack that works like a tart (the assist cycles Tart / Chestnut / Echo).
- **Floating lanterns** (on the pier).
  - Launch 8 paper lanterns, each on a beat of the lullaby. Well-timed launches drift further, and together they form a constellation on the water.
  - The lanterns you launch make "lanterns on the water" a stronger good thing for the pier flock. The side activity feeds the main one.

### 5.4 Sparrow sprites as guides (side content)
- **The ability.** Sparrow gets a helper ability: **Guide** ("Leads the lost back to where they belong").
- **The children.** Three lost children (small townsfolk) cry in the market.
  - With Guide equipped, talking to one sends the sparrow flying ahead, leaving a trail of sparkles to their parent.
  - The child follows you, using the same follower code as your friends.
- **Reward:** Cozy Energy, plus a thank-you line per family.

### 5.5 Market zone and assets
- **`market.glb`** (`tools/blender/build_market.py`).
  - **Layout** (about 80 × 50 m): a promenade along the harbour with about 10 stalls, the pier, the musician's corner and the stairs up to the academy.
  - **Far shore:** the silhouette of the Quiet District, whose lanterns are instanced glows. They go out in a wave for the hook.
  - **Markers:**
    - existing kinds: `SPAWN_`, `NPC_`, `GRUMB_sparrow_n`, `CAM_`
    - new: `LIGHT_` (lanterns), `SEAT_` (stools, front-edge convention), `GOOD_` (good things) and `AREA_` (flock bounds)
- **`market_kit.glb`.** Stalls with awnings, counters, crates and hanging lanterns, plus a stool and a wok. It's separate from `kit.glb` (301 KB), so zones that don't need it don't download it.
- **Sparrow model** (`build_creatures.py`). A plump sphere-ish sparrow with enormous wistful eyes, in the faceted paper-craft style of `doudou_1.png`. The children are `<id>_body`, `<id>_eyes` and `<id>_wing_L/R`, and the wings flap in code, like the eyes blink. It's the first creature on plan 1's faceted look. Rebuilding the other Grumblings stays deferred (§9).
- **Children:** a small `folk_kid` variant from `char_folk.py`, with the child's proportions set in `humanoid_joints`.
- **Audio** (all synthesized, `core/audio.js`):
  - crowd murmur, wok sizzle, lapping water and night insects
  - the street musician: a bowed-string voice playing a variation of the lullaby, which is also the "musician's song" good thing
  - a cold wind bed for the hook
- **Budgets:**

  | Item | Limit |
  |---|---|
  | `market.glb` | ≤ 200 KB |
  | `market_kit.glb` | ≤ 130 KB |
  | `folk_kid` | ≤ 60 KB |
  | sparrow | ≤ 800 triangles |
  | **Market entry for a returning player** (Xiao Pei, animations, creatures, market, market kit, Tangtang, Wei Bao) | **≈ 830 KB** |
  | Busiest market view, low tier | ≤ 100 draw calls, ≤ 150k triangles |

  The market entry is about 0.7 s of transfer at 10 Mbps, within the ≤ 3 s must-pass. Vendors, children and the musician stream in after Begin.

## 6. Milestones

| # | Work | Accept |
|---|---|---|
| **M1** | Playtest fixes (§2) and the e2e harness | §2.6 |
| **M2** | Licence (§3) | No project reference to MIT remains. `npm pkg get license` shows the SPDX id. `dist/.vite/license.md` exists. The base-mesh answer is recorded, and actioned if it's a simple move. |
| **M3** | Chapter 2 groundwork (§4) | Friends follow through the academy without getting stuck (e2e walk-through). Night lighting in `?zone=test&night` holds the low-tier frame budget. Per-zone budget and perf profiles pass, with the academy's returning-player numbers recorded before and after. |
| **M4** | Market zone, kit, sparrow, `folk_kid`, audio (§5.5) | Zone loads from the academy gate and back. Budgets pass. Screenshots at 390×844 and 1280×720 on the low and high tiers. |
| **M5** | Sparrow flocks and team-up combos (§5.2), tuned in the test zone first | e2e: soothe a flock with scripted input, including one combo. Running scatters them and they return. |
| **M6** | Mini-games and lost children (§5.3–5.4) | Each is playable by keyboard, touch and gamepad, and can't be lost. The lanterns-to-pier-flock link works. |
| **M7** | Chapter 2 script, the hook, Sprite Book, README, `ai/next_2.md` | A full play from the Prologue to the end of Chapter 2 with no console errors, at phone size on the low tier. Every zone passes perf ≤ 3 s must-pass. `next_2.md` also covers what shipped from plan 1. |

There's no hard stop between milestones. After M2, please replay the prologue on your phone when you can. Your bug report (§2.2) feeds into M3's real-device tuning.

## 7. Files

- **New:**
  - `src/story/chapter2.js` and `src/world/zones/market.js`
  - `src/actors/follower.js`
  - `src/systems/{perch,chestnuts,lanterns}.js`
  - `tools/blender/build_market.py`
  - `tools/e2e/*.mjs` and an `npm run e2e` script
- **Changed:**
  - **Story:** `src/story/{prologue,chapter1,helpers}.js`
  - **Actors:** `src/actors/{grumbling,player,npc,humanoid,sprites}.js`
  - **Systems:** `src/systems/{soothe,collection,assists}.js`
  - **Core and zones:** `src/core/{save,audio}.js`, `src/main.js`, `src/world/zone.js`, `src/world/zones/academy.js`
  - **UI:** `src/ui/{ui,menus,touch}.js`, `src/ui/ui.css`
  - **Rendering:** `src/render/{materials,sky}.js`
  - **Content:** `src/content/species.js`
  - **Page and config:** `index.html` (viewport, preload map), `vite.config.js` (`build.license`)
  - **Tooling:** `tools/{budget,optimize}.mjs`, `tools/perf/load-test.mjs`
  - **Blender:** `tools/blender/{build_zones,build_creatures,char_folk,snuglib}.py`, plus `build_anims.py` only if §2.5's clip change is needed
  - **Project:** `package.json`, `package-lock.json`, `README.md`, `.gitignore`
- **Regenerated:**
  - `train.glb` and `academy.glb` (seats, `AREA_` markers, the academy gate)
  - `creatures.glb` (sparrow)
  - new: `market.glb`, `market_kit.glb` and `folk_kid.glb`

## 8. Verification

- **`npm run e2e`** (Playwright, headless Chrome, SwiftShader):
  - Keyboard profile at 1280×720, and touch profiles at 390×844 and 844×390.
  - The prologue with scripted inputs: the normal path, the rush path, and a reload mid-scene.
  - Hit tests for every button.
  - Pause and resume after `visibilitychange`.
  - A save migration from a v1 save with `cloud: 2`.
  - Seat screenshots.
  - Chapter 2 smoke tests (`?zone=market` with preset flags).
- **The usual tools:**
  - `npm run build && npm run budget && npm run perf`, now per zone.
  - The `?debug` overlay in the busiest academy and market views on the low tier.
  - The `?viewer` page for the sparrow and the seated poses.
- **Phone:** you, with the bug-report button. I'll also document the "remote debugging" steps (Chrome `chrome://inspect` for Android, Safari Web Inspector for iOS) in the README, in case you want to send console output.

## 9. Out of scope (for `next_2.md`)

- **From `next_0.md`:**
  - **Feel:** turning in place, footstep dust, matching walk speed to the animation.
  - **Art:** a finer path mask, and the Quiet District kit (Chapter 3).
  - **Audio:** composed music.
  - **Nice-to-haves:** service worker, water reflections on the high tier, remappable controls, a text-size option.
- **From plan 1:** the faceted rebuild of the existing Grumblings (M7), and a README "Characters" pipeline section (M8). Only the sparrow is built new here.
- **Replacing the base mesh**, if §3.3 requires it. That's its own plan.

## 10. Open questions (defaults in bold; implementation goes ahead with the defaults unless you say otherwise)

1. **Which phone and browser did you play on?** This matters most for the zoom and reload bugs. Default: **assume both iOS Safari and Android Chrome.** I'd harden for both and verify with emulation.
2. **Licence variant:** **`GPL-3.0-or-later`** (the notice the FSF recommends in the LICENSE text) or `GPL-3.0-only`.
3. **Where did `ref/hero_male.glb` come from, and under what licence?** Default: **leave the characters as they are until you answer.** Then either commit the file with credit (if compatible), or plan a replacement.
4. **SPDX one-line headers in our source files:** **yes**, or leave them out and rely on `LICENSE` and `package.json`.
5. **Chapter 2 scope:** **the full chapter** (3 flocks, 2 mini-games, 3 lost children, the hook), or a smaller slice (1 flock, chestnuts, the hook) to get back to real-device testing sooner.
