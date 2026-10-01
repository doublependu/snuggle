# Plan 7: Three fixes, signs and a guide, a forest round the map, and the playtest's quick wins

Answers `ai/prompt_7.md`. Builds on `ai/next_6.md` and `ai/playtest_5.md`. Nothing here is built yet.

## 0. Short answer

**The three issues**
- **Rain on the train (§2.1): you're right, it shouldn't sound like that.**
  - The rain you hear is the weather outside the windows, not the cloud. The cloud itself only makes a few drip sounds.
  - So the sound is the same before and after you soothe it, while the story says "The cloud stops raining."
  - **The fix:** the cloud gets its own rain sound, which stops when it's soothed. The rain outside becomes duller and quieter, and eases to a drizzle once the cloud is asleep.
  - **A second bug, at the station:** a drizzle sound starts there and never stops until the Academy, under a sunny sky with no drops. It gets drops, and both fade out.
- **The staircase (§2.2): it's the library, and it's a bug.** I reproduced it.
  - The balcony has no collision at all. Walking up, Pip reaches 3.1 m, walks off the top step and drops to the ground.
  - The balcony is meant to be reached: a lemon candy floats over it, and a student tells you to go up there.
  - **The fix:** the balcony becomes a real floor with railings, the stairs end on it, and the foot of the stairs starts on the ground (today it's a knee-high ledge).
- **Fishing (§2.3): there is no fishing, and it isn't a task.**
  - My guess at what looked like it: the five "thirsty lotus buds" stand in the water on thin stalks, like fishing floats, and their prompt has no verb ("Thirsty lotus buds").
  - The real puzzle: with the Soggy Cloud as your helper, it waters them, and they bloom into pads you can hop across to the island's candy.
  - **The fix:** make that puzzle clear, and offer to equip the cloud on the spot. Tell me if you saw something else (§10, question 1).

**The features**
- **Signs (§3.1–3.3):** a name board on every building, fingerposts where the paths fork, and the place's name on screen as you arrive.
- **A guide (§3.4):** after 40 s without progress, your Charm Sprite flies ahead along the path, and the objective shows an arrow and a distance. It follows the paths (over the bridge, not through the pond).
- **A forest (§4):** the station and the Academy are the two zones with open land. Both are bowl-shaped slabs today: the ground rises 6–18 m at the edges, with nothing behind it.
  - The edges go flat, and the ground carries on into a forest generated in JS (no download).
  - The forest fades into mist with distance from the map, so the grounds themselves stay clear.
  - The invisible walls stay where they are, now behind a thicket.
  - Inside the map: flowers, more trees, and more of both on phones (the low tier draws only 40% of the trees today).

**From the playtest (§5):** the quick wins, 8 of the 11 suggestions in whole or in part. Three bigger ones wait for Chapter 4.

**Costs**
- **First-visit JS is at 238.4 of 240 KB**, so the menus move into a lazy chunk first (§1). The target after this plan is 238 KB or less.
- **Models:** `kit.glb`, `station.glb` and `academy.glb` are rebuilt in Blender (it's running: 5.2 LTS, connected). About the same sizes.
- **Load time:** unchanged within noise. The forest, signs and routes are generated in a few milliseconds.

## 1. M0: Room in the budget, and a green test suite

- **Menus into a lazy chunk.** `ui/menus.js` (pause, settings, the Sprite Book, the bug report) is in the entry chunk but only needed after Begin.
  - It loads right after Begin, like the music does. A press before it arrives waits for it.
  - `applyTextSize` moves to `ui/ui.js`, because it runs at boot.
  - I expect about 4 KB back. If it's less than 3 KB, the Sprite Book's thumbnails go the same way.
- **`market-guide`** (failing on `HEAD`, from `next_6.md`): the dev floor check reports Pip 0.12 m under the floor at (13.7, 2.5). That's at the south fish stall, where one of the test's 3 m teleport hops lands.
  - I walk there with real keys. If she can sink in by walking, the stall's collision is fixed; if only the hop does it, the test's route is.
- **The README's deploy URL** says `snuggle-sorcery.…`; the Worker is named `snuggle`.

## 2. M1: The three issues

### 2.1 Rain that doesn't stop
- **What's there:**
  - `core/audio.js:21`: the train's ambience has `rain: 0.7`, its loudest bed. `world/zones/train.js:22` draws the streaks outside both window rows.
  - The cloud has no rain sound of its own, only `drip` one-shots (`actors/grumbling.js:259`, `:287`).
  - Nothing changes the rain bed when the cloud is soothed.
  - `story/prologue.js:139` sets a 0.25 rain bed at the station ("The rain softens to a drizzle"). Nothing turns it off, and the station has no rain to see.
- **The fix:**
  - **The cloud's own rain:** a close, bright patter that follows it. Soft while it drizzles on shoes, full in its tantrum, quieter with distance, and gone the moment it's soothed.
  - **The rain outside:** heard through the carriage, so duller (a low-pass instead of today's hiss) and about 6 dB quieter. The two no longer sound alike.
  - **After the cloud is asleep:** the outside rain eases to a drizzle over a few seconds, and the streaks thin. A reload after that starts at the drizzle.
  - **At the station:** a light drizzle you can see, which fades out with its sound by the end of Sunny's greeting. A return visit has neither.
- **Test `train-rain`:** the beds' levels (recorded even without sound): no patter before the cloud is pointed out, patter while it rains, none after; the outside rain lower after than before; no rain bed at the station once Sunny has finished.

### 2.2 The library's staircase
- **Reproduced** in headless Chrome, at the Academy after the lesson, walking with real keys:

  | Check | Result |
  |---|---|
  | Up the stairs from the building's platform | She climbs to 3.08 m, walks off the top and lands on the ground in front of the library |
  | Straight at the foot of the stairs from the ground | She stops: the ramp starts as a 0.38 m ledge |
  | The floor up there (collision, probed every 0.5 m) | Only the top of the ground-floor box: 7 × 5 m at 3.4 m. It stops 1.0 m short of the top step and 0.25 m to its side |
  | The balcony you see | A deck 8.2 × 6.2 m at 3.6 m. No collision. Nor has the upper room or the railing |

- **Why it matters:** candy 6 floats over the front balcony, and the student with the books says "the view from the library balcony is lovely. There might even be a candy up there" (`academy.js:225`).
- **Also there:** a maple's crown hangs over the staircase and hides it (`SCATTER_maple_lib`).
- **The fix** (`tools/blender/build_kit.py`, `library`; numbers tuned on review renders):
  - **The deck is a floor:** a collision box under the deck you see, top at 3.6 m.
  - **The stairs end on it:** they rise to the deck's height and stop at a small landing joined to the deck's south-east corner.
  - **The foot is on the ground,** behind the building's platform, so you can walk on from either.
  - **Railings:** on the deck's open sides (drawn on the east and west too, where there are none today) and on the stairs' outer side. You can't fall off by accident.
  - **The upper room** is solid.
  - **The nook under the stairs stays,** for the Homework Grumbling.
  - **The maple** moves clear of the stairs.
- **Tests:**
  - `library-balcony`: from the ground, up the stairs with real keys, onto the deck, along the front rail to the candy (collected), and back down. Her height never drops while she's on the deck.
  - `chapter1-full` already soothes the Homework under the stairs; it must still pass.
- **No other building has outside stairs** (I searched the three build scripts). The market's stairs to the Academy work.

### 2.3 The pond
- **What the pond has:** the lotus buds (prompt "Thirsty lotus buds"), the island with a candy, and the tip after you fall in: "The pond is deep! Maybe the lotus buds could help you cross."
- **Nothing says fish** in the game's text. The only fisher is a townsperson at the station.
- **The fix:**
  - **A prompt with a verb:** "Look at the lotus buds", and "Water the lotus buds" with the cloud equipped.
  - **Equip on the spot** (playtest #5): without the helper, Pip's line is followed by "Ask your Soggy Cloud to water them?" Yes equips it and waters. Today it's a toast pointing to the Sprite Book.
  - **Buds that look like buds:** bigger, drooping, each with a leaf on the water.
  - **The splash tip names the bridge first:** "The pond is deep! The bridge is just to the south. The lotus buds might get you to the island."
  - **Rim stones you can't slip between** where the path runs beside the pond (playtest #7). The side with the buds stays open.
  - **A "Lotus Pond" sign** (§3).
- **A fishing mini-game** would be new content. It isn't in this plan (§10, question 1).

## 3. M2: Signs, place names and a guide

### 3.1 Name boards
- **Every building and named place gets its name:**

  | Zone | Signs |
  |---|---|
  | Station | "Lantern Bay" on the station's board (blank today), the stalls, "Mistbloom Academy" on the gate at the top |
  | Academy | Mistbloom Academy (gate), Lesson Pavilion, Great Hall, Library, Kitchen, Dormitories, Old Pagoda, Laundry Yard (moon gate), Practice Field, Harbour Overlook, Lotus Pond |
  | Night market | each stall (Lanterns, Toys, Jasmine Tea, Sweets, Fish Balls, Dumplings, Roast Chestnuts), Lantern Pier, and "Mistbloom Academy ↑" lit on the arch over the stairs home (blank today; playtest #7) |
  | Quiet District | Ferry, and the six memory places. Faded until their memory is restored, then lit |

- **How:** `src/world/signs.js`, loaded with the zones that use it.
  - All of a zone's texts are drawn into one canvas (no download), on one merged mesh: 1–2 draw calls a zone.
  - Dark teal boards with gold letters, like the station's board, and a picture beside the name (📚, 🍳).
  - Positions come from the kit placement markers plus a door offset for each piece. No Blender change.
- **Sunny's welcome sign** at the station moves onto the same code.

### 3.2 Fingerposts
- **Where paths fork:** the station plaza and each bend of the hill path; the Academy's courtyard, the bridge and the dormitory fork; the market's harbour wall, where Chapter 2 ends out of sight of the stairs; the Quiet District's square.
- **Each arm** names a place and points along the path to it. The direction comes from the routes (§3.4), so the signs and the guide always agree.

### 3.3 The place's name on screen
- **Letters on a board are small on a phone:** 0.28 m letters are about 10 px tall from 20 m away on a screen 720 px high.
- So as you come within about 9 m of a named place, its name shows under the objective for 2.5 s ("📚 Library"). Once a minute per place at most.

### 3.4 The guide
- **Objectives get a target.** `objective(text, target)`: a marker, an NPC, a Grumbling, or the nearest of several ("the Lost Sock and the Homework").
  - The objective texts don't change, so the autoplayer's playbook still matches.
- **Routes:** a small graph of path points for each zone (25 or fewer), in the zone's module.
  - The Academy's follows the paths `build_zones.py` already draws: the main axis, the kitchen, the dormitories, the moon gate, the bridge to the library, the practice field, the pagoda, the overlook.
  - The guide takes the shortest way along it to the target. A straight line would point through the pond.
- **"No progress":**
  - A timer runs while there's a target and Pip is free to move (not in dialogue, a cutscene, a menu, a mini-game, sitting or humming).
  - It starts again when the objective changes, or when the way left along the route gets 3 m shorter than it has ever been.
  - **At 40 s the guide starts,** and stays until that objective is done.
- **What you see:**
  - **In the world:** your lead Charm Sprite (the helper if one is equipped) flies from Pip toward the next path point, leaving sparkles, and comes back. This is what the Sparrow's Guide does for lost children (`systems/guide.js`), made general.
  - **On the objective:** an arrow that points the way relative to the camera, and the distance. For phones, where the sprite is often off screen.
  - Bean stays asleep: his first words are Chapter 1's ending.
- **A setting:** Direction hints: **After a while** / Always / Off.
- **The train** has no guide: it's one carriage, and there's no sprite yet.
- **Tests:**
  - `routes-<zone>`: every edge can be walked: a floor all along it, no step over 0.35 m, no water, nothing in the way at knee and chest height.
  - `guide-library`: stand in the courtyard for 45 s with the Homework objective. The arrow shows, and the first leg points to the bridge, not across the pond.
  - `guide-off`: with the setting Off, nothing shows.
- **The autoplayer** reads signs it's close enough to read (`eyes.js`), and logs when the guide appears.

## 4. M3: The forest and the map's edge

### 4.1 What's there today
Measured and screenshotted in this session with a throwaway script (in the session scratchpad, not the repo).
- **Both outdoor zones are slabs with raised edges:**

  | | Station | Academy |
  |---|---|---|
  | Ground mesh | 86 × 91 m | 112 × 120 m |
  | The edge lift | west 5.6 m and east 8.4 m, starting within 3 m of the wall | up to 18 m on three sides |
  | Behind it | the sea to the west, east and south; the rails end at the slab's edge | nothing |
  | Trees, high / low tier | 58 / 23 | 85 / 33 |
  | Fog | from 45 m, full at 208 m (91 m on low) | from 50 m, full at 208 m (91 m on low) |

- **From the west end of the platform** the lift is a bare wall of earth a few metres away, with the rails running into it. That's what you saw.
- **Fog exists**, but it starts beyond most of the map, so it hides nothing.
- **Invisible walls exist** on every side of both zones.
- **The night market and the Quiet District** are streets between buildings and water: no forest there (§4.8).

### 4.2 Flat edges (Blender, `build_zones.py`)
- **The edge lifts go** from both height functions. The ground keeps its natural shape to the edge of the mesh: flat by the shore, the hill at the station, the cliff south of the Academy.
- **The station's track** runs on into the mist both ways.

### 4.3 The ground beyond (`src/procgen/forest.js`, generated)
- **A skirt** of coarse ground round the land sides, as far as the mist needs (55–85 m, §4.7).
  - At the seam it takes the authored ground's height, and it tucks 8 cm under the authored edge, so there's no crack.
  - Further out it rolls gently (about ±2 m). No rise toward the edge.
  - Along the coast it carries the shore and the cliff outward, so the waterline continues.
- **It uses the terrain's material and colours,** so no new shader is compiled.
- **No collision:** nobody can get there.

### 4.4 The forest
- **Two bands:**
  - **Near (0–14 m beyond the wall):** whole trees from the species the game has, mixed for each zone (broadleaf and maple at the station, pine and broadleaf at the Academy), with bushes between.
  - **Far (14 m to the mist):** crowns only, 20 triangles each. The trunks would be hidden by the near band anyway.
- **Clumps and clearings** from a noise field, so it doesn't look sown in rows. The same seed gives the same forest every visit.
- **Kept clear:** the track, the path beyond the Academy gate, the water.
- **Drawn in sectors** (west, north, east), so the half behind the camera is skipped.
- **No trunk colliders,** and no sway on the far band.

### 4.5 The invisible wall
- **The walls stay where they are.** Saves, NPC paths and tests depend on them.
- **A thicket along each wall:** bushes and trunks shoulder to shoulder just outside, so the stop looks like woods too thick to enter.
- **One line when you push against it:** "The woods are too thick to walk through." Once a visit.
- **Each zone's module states its play rectangle.** The forest, the mist and that line all use it. Test `edge-<zone>` walks into every side and checks she stops within 0.5 m of it.

### 4.6 Mist
- **By distance from the map, not from the camera:** it starts 8 m beyond the wall and is full where the forest ends. The grounds stay as clear as today, so landmarks still help you find your way.
- **Low mist between the trunks** as well.
- **How:** the Quiet District's fog wall and height fog are already in every material's shader. This adds a box-distance term to that code, off in the other zones.
- **The camera-distance fog** stays as it is.
- **Above the mist:** the sky's limestone peaks, as now.

### 4.7 By tier

| Each zone, added | Low (phones) | Medium | High |
|---|---|---|---|
| Forest and mist reach | 55 m | 70 m | 85 m |
| Whole trees | about 100 | about 190 | about 270 |
| Crowns | about 300 | about 600 | about 900 |
| Triangles | 22k or fewer | 38k or fewer | 55k or fewer |
| Draw calls | 8 or fewer | 12 or fewer | 14 or fewer |

- **For scale,** measured today: the station draws 57k triangles in 35 calls on low and 116k in 48 on high; the Academy 87k in 100 and 128k in 121.

### 4.8 More plants inside the map
- **Flowers:** small clumps in drifts, on grass only: along the path edges, round the pond, in the practice field's corners.
  - One instanced mesh in five colours, 16 triangles a clump, no collision. About 180 clumps on low, 500 on high.
  - "Grass only" is read from the ground's own vertex colours, so paths, paving and the laundry yard stay bare without hand-placed areas.
- **More trees:**
  - **New groups** in the bare parts: behind the dormitories, round the practice field, between the pond and the east wall, blossom trees along the main axis, the station's plaza edges.
  - They're scatter areas in `build_zones.py`. The build fails if an area is within 2.5 m of a path or a marker.
  - **The low tier's tree share goes from 40% to 60%.** The extra trees stand where medium and high already have them, so those spots are already tested.
- **The night market's ends:** the promenade's floor just stops at both ends, with the sea beyond (screenshot). Each end gets a shopfront from the market's kit, placed in JS. No forest and no re-export.

## 5. M4: From the playtest

| # | Suggestion | This plan |
|---|---|---|
| 1 | Less reading, more doing | **Partly.** A text speed setting (Normal, Fast, Instant). Friends' comments after a soothe, a flock or a memory become speech bubbles while you keep walking. A light trim: short consecutive lines merged, repeats cut. Every changed line is listed in `next_7.md` |
| 2 | Stakes for soothing | Later, with Chapter 4: it changes the core mechanic |
| 3 | "Everyone Together" as a boost | **Yes.** Five seconds at triple speed, and every sparrow shows its favourite. No instant win |
| 4 | A purpose for Cozy Energy | Later: Chapter 4 promises the Lullaby Thread upgrade |
| 5 | Say where optional things are | **Yes.** "Things to do here" in the pause menu (candies 3/10, sprites tucked in, notes, lost children). The helper offered on the spot at the lotus buds, the notes and the lost children |
| 6 | Directions after a while | **Yes** (§3.4) |
| 7 | The pond and the stairs home | **Yes** (§2.3, §3.1, §3.2) |
| 8 | Mix up the memory scenes | Later |
| 9 | Louder, tighter mix | **Yes.** About 6 dB up with a limiter on the master, and the zones levelled: the Academy is 10 dB under the train today |
| 10 | Friends who react | **A little:** six to eight bubbles (a grey, a candy, a splash), with #1's bubbles |
| 11 | A walk key | **Yes: hold C,** remappable, in the Controls table. Not Ctrl or Alt: Ctrl+W closes the tab, and Alt+Left goes back a page |
| | Two camera shots | **Yes.** The first lesson frames Pip. Chapter 3's ending cuts to a close shot of Pip and Bean |

- **Targets,** measured on a new recording (`npm run playtest -- --record`):
  - reading under 50% of the run (61% now)
  - −20 ± 2 LUFS overall (−27.7 now), each chapter within 4 dB of the others, true peak under −1 dBFS

## 6. Budgets

- **JS before Begin:**

  | | Now | After |
  |---|---|---|
  | First visit (train) | 238.4 of 240 KB | 238 KB or less: about −4 KB (§1), about +2 KB (rain, mist, the walk key, text speed, the arrow, the limiter) |
  | Returning, station | 238.2 of 280 KB | about +5 KB (forest, signs, routes and guide) |
  | Returning, Academy | 253.0 of 280 KB | about +6 KB |
  | Returning, market / Quiet District | 246.3 / 249.4 of 280 KB | about +3 KB each |

- **Models:** `kit.glb` +2 KB or so (the library's rails and landing). `station.glb` and `academy.glb` about the same (the same grids, plus scatter markers and a longer track). The Academy is at 1144.6 of 1250 KB.
- **Time to interaction** (`npm run perf`): every zone within 0.1 s of `next_6.md`'s table. The forest, signs and routes are built in the zone's `create()`: a few milliseconds, no new shader programs.
- **Frame cost:** the table in §4.7, checked by a test.
- **If the first-visit JS still doesn't fit:** the guide's arrow and the text speed setting move into the menus chunk.

## 7. Tests and verification

- **New e2e tests:** `train-rain`, `library-balcony`, `routes-<zone>` (4), `guide-library`, `guide-off`, `edge-<zone>` (2), and:
  - `forest-<zone>` (2): no forest tree inside the play rectangle; the seam within 0.15 m of the authored ground; nothing within 15 m outside the wall more than 2 m above the ground at the wall (no bowl); triangles and draw calls within §4.7 on low and high.
  - `signs-<zone>` (4): every building has a board, none inside a wall, and each fingerpost arm points along its route's first leg.
  - `walk-key`, `text-speed`, and `menus-lazy`: pause pressed in the first frame after Begin still opens the menu.
- **Existing tests:** all 43 pass, `market-guide` included.
- **Screenshots for review** at the same viewpoints as this session's: the platform's west end, the plaza looking east and north, the Academy's three walls and the courtyard, the library, the pond, both ends of the market. Before and after, on low and high.
- **Blender review renders** of the library before export.
- **The autoplayer:** a whole run, then the recording and its review (§5's targets).
- **`npm run budget`, `npm run perf`, `npm run cf:check`.**
- **Not measurable here:** frame rate on the spec's hardware. The low tier's numbers in §4.7 are the guard; your phone is the check.

## 8. Files

- **New:**
  - `src/procgen/forest.js`: the skirt, the forest, the thicket
  - `src/procgen/flowers.js`
  - `src/world/signs.js`
  - `src/systems/wayfinder.js`: routes, the timer, the guide sprite
  - `ai/next_7.md`, at the end
- **Changed, M0:** `src/main.js`, `src/ui/menus.js`, `src/ui/ui.js`, `tools/e2e/tests.mjs`, `README.md`
- **Changed, M1:**
  - `src/core/audio.js`, `src/actors/grumbling.js`, `src/world/zones/train.js`, `src/world/zones/station.js`, `src/story/prologue.js`
  - `tools/blender/build_kit.py`, then `kit.glb`
  - `src/world/zones/academy.js`, `src/procgen/props.js`, `src/systems/collection.js`
- **Changed, M2:** `src/story/helpers.js`, the four chapter scripts (targets), the four zone modules (signs and routes), `src/ui/ui.js`, `src/ui/ui.css`, `src/systems/guide.js`, `tools/playtest/eyes.js`
- **Changed, M3:** `tools/blender/build_zones.py`, then `station.glb` and `academy.glb`; `src/render/materials.js` (the mist), `src/world/zone.js`, `src/core/quality.js`, the station, Academy and market modules
- **Changed, M4:** `src/core/input.js`, `src/actors/player.js`, `src/systems/perch.js`, `src/story/*`, `src/ui/menus.js`, `src/core/save.js` (two new settings, with defaults for old saves)
- **`README.md`:** signs, routes and the play rectangle under "Build a new area"; the walk key.
- **No new dependencies.**

## 9. Order of work

1. **M0:** the lazy menus and `market-guide`. Everything after needs the room and a green suite.
2. **M1:** the three issues. The library goes first, because `kit.glb` is rebuilt once.
3. **M3:** the forest. It rebuilds `station.glb` and `academy.glb`, which M2's signs and routes then sit on.
4. **M2:** signs and the guide.
5. **M4:** the playtest's items, then the recording.
6. **`next_7.md`,** with the changed dialogue lines and the measurements.

## 10. Open questions (defaults in bold; I'll go ahead with them unless you say otherwise)

1. **Fishing:** **no fishing; the lotus puzzle is made clear (§2.3).** If you saw something else at the pond, tell me what. A fishing mini-game could be its own plan.
2. **The playtest's items:** **the "This plan" column in §5.** Say if you want #2, #4 or #8 now, or anything dropped.
3. **The dialogue trim:** **done, with every changed line listed for you.** Or only the text speed and the bubbles.
4. **The guide:** **after 40 s, the sprite and the arrow, with a setting.** Or sooner, or only one of the two.
5. **The forest:** **the station and the Academy, with the market's ends closed by shopfronts.**
6. **The walk key:** **hold C.**

## 11. Out of scope

- Chapter 4
- Playtest suggestions #2, #4 and #8
- A fishing mini-game
- A map screen
- Deploying (you do that)

## 12. Decisions after review (yours, before implementation)

- **The dialogue is not trimmed** (question 3). The text speed setting and the walking bubbles stay.
- **Added: skip to the end of a long conversation.**
- **W walks, Shift + W runs** (question 6). No "hold C": with a walk on W, a separate walk key has no job.
- **Everything else:** on the defaults. What was built is in `ai/next_7.md`.
