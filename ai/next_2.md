# Next 2: what was built for plan 2, and what comes next

Summary of the implementation of `ai/plan_2.md` (answering `ai/prompt_2.md`), with your answers applied:
iPhone Safari for the zoom and reload work, the base mesh is CC0, the licence is **GPL-3.0-only**, and all of
Chapter 2 is in. There was no `next_1.md`, so the first section also records where plan 1 ended.

## Where plan 1 ended (commit `19c10db`)
- **Done:**
  - All seven characters rebuilt on the plan 1 pipeline: a CC0 base-mesh body, sculpted heads, hair and clothes, and painted faces that blink and change expression.
  - Small atlases, and the `?viewer` page.
- **Not done:**
  - The faceted rebuild of the chapter 0–1 Grumblings (plan 1 M7). Only the new sparrow uses the faceted style.
  - A README "Characters" section. The README now has a short paragraph on the pipeline.

## What was built

### M1: Playtest fixes
Every fix has an e2e test (`npm run e2e`, `tools/e2e/`).

- **Stuck on the train.**
  - **Cause:** the story waited for one-shot events (`G.events.once('noticed' / 'soothed')`), and players could notice or soothe the cloud before the script got there.
  - **Waits:** stories now wait on state with `noticed(g)` and `soothed(g)` in `story/helpers.js`.
  - **The cloud:** it stays dormant until the script points it out, stays inside the carriage (`AREA_cloud`), and throws no tantrums while dialogue is open.
  - **Checkpoints:** the train scene resumes where it left off (intro, cloud, lap scene).
  - **Tests:** `train-normal`, `train-rush` (the cloud is soothed before the script asks) and `train-reload`.
- **Saves survive a reload.**
  - Saves are now version 2, and **v1 saves are migrated** (`core/save.js`), not wiped. Your "×2 cloud" save gets capped at 1.
  - Each one-off encounter is recorded (`save.soothed['<zone>:<id>']`), so soothed Grumblings never respawn or count twice, and followers are one per species.
  - The game saves when the tab is hidden or closed.
  - WebGL context loss is handled: it pauses, waits for the context to come back, and falls back to a reload to the checkpoint.
  - **Tests:** `train-reload` and `save-migrate-v1`.
- **The pause menu** gains **Stuck? Back to last checkpoint** and **Copy bug report**. The report holds the device, GPU, quality tier, fps, zone and position, the last 20 errors and the save (test: `bug-report`).
- **Touch buttons that didn't work.** Every UI layer now has an explicit `z-index` (`ui.css`), so the camera-drag area no longer covers 📖, Ⅱ, the menus or dialogue choices. Menus switch to two columns on short screens (a phone held sideways). **Tests:** `touch-hit-portrait`, `touch-hit-landscape` and `touch-auto-pause-resume`.
- **Zoom on iPhone** (`ui/zoomlock.js`):
  - cancels WebKit pinch gestures, double-tap and multi-finger moves
  - sets `touch-action: none` on every layer
  - shows a **Reset zoom** chip if the page still ends up zoomed
- **Sitting.**
  - Seat markers now mark the seat's front edge.
  - Each character's knee reach is measured from the `sit` clip (`Humanoid.sitPose`), so the knees rest 3 cm past the edge.
  - Train benches are chibi-sized: 0.30 m deep and 0.40 m high.
  - **Tests:** `seats-train` and `seats-academy` (they also write side-view screenshots).

### M2: Licence
- **Metadata and text:**
  - `package.json` and the lockfile are `GPL-3.0-only`.
  - The README has a licence and credits section, and the "Fork it!" text is rewritten.
  - The pause screen links the GPL.
- **SPDX lines:** every source file starts with `SPDX-License-Identifier: GPL-3.0-only`.
- **Bundled licences:** `npm run build` writes `dist/third-party-licenses.md` for three.js and three-mesh-bvh.
- **Base mesh:** now in the repo at `tools/blender/base/hero_male.glb`, with a README noting CC0. The character scripts point there, so forks can rebuild the characters. Your copy in `ref/` is untouched.

### M3: Groundwork
- **Friends who follow you** (`actors/follower.js`): walk beside Xiao Pei, slide along walls, and teleport back out of view if they fall far behind. A friend right beside her no longer steals the Interact prompt (a new `priority` on interactables). Test: `followers-academy`.
- **Head look-at** (`Humanoid.updateLook`): NPCs look at Xiao Pei when she's near or talking to them. She looks at the Grumbling she's soothing, or at whoever is speaking.
- **Night lighting: the lamp map** (`render/lamps.js`).
  - Lantern light is painted into a small texture laid over the zone from above, and every lit material and the water add it with one texture fetch.
  - A hundred lanterns cost the same as one, and they light kit instances, characters and the water alike, with no popping.
  - There's a night sky (stars and a moon disc), and blob shadows appear wherever there is no shadow map (the low tier, and night).
  - To try it: `?zone=test&night`.
- **Zone-scoped event listeners** (`Zone.on`), so the Academy's listeners no longer stack up on every visit.
- **Townsfolk stream in after Begin** (`populateNPCs(..., { essential })`, `Zone.whenNPC`). Returning to the Academy downloads **1.10 MB** of models before Begin, down from 1.31 MB.
- **Per-zone budgets and load times:** `npm run budget` and `npm run perf` now cover every zone, for a returning player as well as a first visit.

### M4–M7: Chapter 2, The Night Market Mix-Up
- **Getting there.** After Chapter 1, the Academy is at dusk and Wei Bao waits at the gate to take you to the market. The stairs at the market lead back up.
- **The market** (`tools/blender/build_market.py`, `world/zones/market.js`):
  - A lantern-lit harbour promenade: two rows of stalls (lantern, toy, tea, sweets, fish-ball, dumplings, a chestnut cart), shopfronts, strings of lanterns, the musician's stage, a pier with moored boats, and the stairs up to the Academy.
  - Across the water, the Quiet District: 64 lanterns that go out at the end of the chapter.
  - 97 lanterns in total feed the lamp map.
- **New creatures and characters:** the sparrow (wistful eyes, wings that flap) and a child townsperson (`folk_kid`).
- **New sounds** (all synthesized): crowd murmur, night insects, a wok sizzle, a bowed-string street musician whose volume depends on how far you are from the stage, and sparrow flutters and chirps.
- **Sparrow flocks** (`systems/perch.js`, the flock behaviour in `grumbling.js`):
  - Three flocks, of 3, 4 and 5 sparrows.
  - They peck at their stall and knock trinkets over. Running at them scatters them to the rooftops.
  - Humming alone calms them only partway (to 40%).
  - **Sit with them** and they perch around Xiao Pei. Pick a free good thing from a chip on screen (tap or click, keys 1–3, or the d-pad), then hold Hum: the thread fans out to every perched sparrow.
  - Each sparrow has a favourite good thing, which Echo Friend reveals.
  - **Combos:** Sweet Lullaby (a snack first), Echo Lullaby (Echo Friend first), and Everyone Together (both).
  - Assist now alternates: a snack (tart or chestnuts), then Echo Friend.
- **Side content:**
  - **Chestnut roasting** (`systems/chestnuts.js`): stir on the beat, pull each chestnut out when golden. Bags of chestnuts are a new snack.
  - **Floating lanterns** (`systems/lanterns.js`): release on the beat. The lanterns stay on the water, light it, and make "lanterns on the water" a stronger good thing.
  - **Three lost children** (`systems/guide.js`): with the sparrow's **Guide** ability equipped, a glowing sparrow leads the way and the child follows you to their family.
- **Story** (`story/chapter2.js`):
  - Arrival and emergency tarts.
  - The lantern-stall crash, and Wei Bao's Echo Friend: *"I want that. But I can't afford it."*
  - Xiao Pei remembers her mother pointing out the free good things.
  - The three flocks, then dumplings with everyone.
  - The walk home: the lanterns across the bay go out in a wave, the fog turns cold, and Doudou is wide awake. Then the "Chapter 3: The Quiet District" card.
  - Every step resumes correctly after a reload.
- **Tests:** `market-flock`, `market-combo`, `market-chestnuts`, `market-lanterns`, `market-guide`, `touch-market-perch` and `chapter2-full`, plus `chapter1-full` (the station and all of Chapter 1).

## Measured

**Load size** (`npm run budget`, bytes before Begin):

| Start | JS (gz) | Models | Total |
|---|---|---|---|
| First visit (train) | 233 KB | 504 KB | 740 KB |
| Returning, station | 233 KB | 832 KB | 1068 KB |
| Returning, Academy | 239 KB | 1104 KB | 1346 KB |
| Returning, market | 241 KB | 773 KB | 1018 KB |

**Time to interaction** (`npm run perf`, median of 5 runs, cold cache):

| Zone | Must-pass (10 Mbps, 60 ms, 4× CPU; target 3 s) | Goal (50 Mbps, 20 ms, 1× CPU; target 1 s) |
|---|---|---|
| Train | 1.54 s | 0.39 s |
| Station | 1.73 s | 0.46 s |
| Academy | 2.15 s | 0.55 s |
| Market | 1.71 s | 0.46 s |

**Frame cost on the low tier at 844×390:**

| View | Draw calls | Triangles |
|---|---|---|
| Busiest market view (west end, looking down the whole market) | 63 | 110k |
| Busiest Academy view (the gate) | 85 | 84k |

The market view was 106 draw calls before the 12 sparrows were batched into 4 (`CreatureBatch` in `actors/creatures.js`).

**Other checks:**
- **Models:** all within budget. Market zone 117 KB and 9.3k triangles; market kit 145 KB; sparrow and creatures 76 KB.
- **Tests:** `npm run e2e` runs 19 tests (about 7 minutes in headless Chrome with SwiftShader), and all pass.

## Deviations from the plan (and why)
- **Night lighting is a lamp map, not a vertex bake plus 4 uniform lights.** A vertex bake can't light instanced kit pieces (they share one geometry), and 4 moving lights pop in and out as you walk. The lamp map lights everything the same way for one texture fetch, with no extra shader program.
- **Base mesh in `tools/blender/base/`, not `assets-src/base/`.** `assets-src/` is gitignored.
- **Train benches are 0.30 m deep and 0.40 m high**, shallower than the planned 0.38 / 0.44. At 0.38 there was still a gap between backs and the backrest.
- **Budgets:**

  | Model | Planned | Actual | Why |
  |---|---|---|---|
  | `market_kit` | 130 KB | 145 KB | every stall's lanterns |
  | `folk_kid` | 60 KB | 64 KB | a full townsperson's detail |

  `folk_kid` streams in after Begin. Returning-player budgets are separate from the first visit, and `npm run perf` is their real gate.
- **Humming alone calms sparrows to 40% at most.** Without the cap, humming for about 20 s soothed a sparrow and skipped the chapter's mechanic.
- **Retargeting:** bones that no clip animates (neck, hood) now keep each character's own rest pose instead of the animation library's.
- **Travel to the market is through Wei Bao at the gate.** Tangtang stays in the kitchen so she can still bake, and meets the group at the market.
- **The musician has no instrument prop.** She "bows" with the `stir` upper-body clip, and ♪ notes float up.

## Known issues / limitations
- **Not yet tested on your iPhone.** Double-tap and pinch are blocked in several ways, but WebKit's behaviour can only be confirmed on the device. The same goes for the context-loss path when Safari discards a background tab. Please try the train (reload mid-scene too), the pause and book buttons, and sitting with a flock. If anything looks off, **Copy bug report** from the pause menu.
- **fps is unmeasured on real GPUs.** Headless tests use SwiftShader, so only draw calls and triangles are measured.
- **A tracked `.pyc`:** `tools/blender/__pycache__/snuglib.cpython-313.pyc` is still tracked and now shows as modified. Run `git rm --cached tools/blender/__pycache__/snuglib.cpython-313.pyc` when you commit (`__pycache__/` is already ignored).
- **On-screen overlap:**
  - On a phone, the first-time tip toast can overlap a good-thing chip for its 6 seconds.
  - The chestnut and lantern panels cover the lower middle of the screen.
- **Plan 1 characters:** some art quirks remain, like the townsfolk's leather bracers flaring out at the wrist, and the child inherits them.
- **The Quiet District is only a silhouette** across the water.

## What to work on next (suggested order)
1. **Your iPhone retest** of the plan 2 fixes. The bug report plus e2e tests make it quick to turn anything you find into a fix with a test.
2. **Chapter 3: The Quiet District.**
   - The grey Grumblings (heavy, and they don't want hugs).
   - Honk's *"Nobody remembers us"* line, and Master Fang's story of the fog.
   - Exploring the shuttered district with height fog and the `uFade` grey-out that `materials.js` already declares.
   - Charm Sprite memories as the investigation mechanic.
   - The shuttered-shop kit.
3. **Plan 1 M7:** the faceted rebuild of the cloud, sock, homework, pom-pom and grey Grumbling, using the sparrow as the template. Batch any Grumbling that shows up in groups.
4. **Feel:** turn in place, footstep dust, and matching walk speed to the animation.
5. **Audio:** composed music (lazy-loaded), and a per-zone ambience mix.
6. **Nice-to-haves:** a service worker for repeat visits, remappable controls, a text-size option, and an erhu prop for the musician.
