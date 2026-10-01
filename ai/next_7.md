# Next 7: what was built for plan 7, and what comes next

Summary of the implementation of `ai/plan_7.md` (answering `ai/prompt_7.md`), with your three changes:
- the dialogue is not trimmed
- a long conversation can be skipped to its end
- W walks and Shift + W runs, so there is no "hold C"

Everything else is on the plan's defaults. Nothing is committed.

## What was built

### M0: Room in the budget
- **The menus load after Begin** (`ui/menus.js`: pause, settings, the Sprite Book, the bug report).
  - First-visit JS went from 238.4 to 235.1 KB; it is 237.1 KB with everything below in.
  - A press before they arrive waits for them.
  - The menus import nothing: what they need is handed to them, like the key-rebinding panel. A lazy chunk that imports shared modules made the bundler split the main bundle into three files.
- **`market-guide`** passes: it now hops along the market's routes. Its straight-line hops sometimes landed Pip inside a stall's counter, which the floor check reported. The floor there is fine.

### M1: The three issues
- **Rain on the train:**
  - The cloud has its own rain sound, which follows it and stops when it's soothed.
  - The rain outside is duller and quieter, and eases to a drizzle once the cloud is asleep (the streaks thin too).
  - At the station a light drizzle falls, and clears with its sound once Sunny has said hello.
- **The library:**
  - The balcony is a real floor with railings on every open side, and the upper room is solid.
  - The stairs start on the ground behind the building and end on a landing joined to the balcony.
  - The roof skirt that covered the balcony is gone: it is a wooden deck now.
  - The Homework's nook under the stairs is still there, and the maple moved clear.
- **The pond:**
  - The prompt has a verb ("Look at the lotus buds"), and reaches 4.2 m, so it shows from the shore.
  - Without the helper, Pip's line is followed by "(Ask your Soggy Cloud to water them?)". Yes equips it and waters.
  - The buds are closed, drooping buds with a leaf on the water.
  - A kerb runs along the rim stones, open at the buds and at the stream's outlet.
  - The splash tip names the bridge first.
  - No fishing.

### M2: Signs, place names and the guide
- **Name boards** (`src/world/signs.js`), one mesh and one canvas texture per zone:
  - **Station:** "Lantern Bay" on the station's board, "Mistbloom Academy" by the gate.
  - **Academy:** Lesson Pavilion, Great Hall, Library, Kitchen, Dormitories, Old Pagoda, Laundry Yard, Practice Field, Harbour Overlook, Lotus Pond.
  - **Night market:** the stalls' own boards (Lanterns, Toys, Jasmine Tea, Sweets, Fish Balls), Dumplings, Lantern Pier, Stairs to the Academy, and "Mistbloom Academy" lit on the arch.
  - **Quiet District:** Ferry, and the Noticeboard, Post Office, Sweet Shop, Teahouse and Thread Shop, faded until their memory is restored.
- **Fingerposts:** five at the Academy, five up the station's hill, two at the market. Each arm points along the first leg of its route.
- **The place's name on screen** as you come within 9 m, once a minute per place at most.
- **The guide** (`src/systems/wayfinder.js`):
  - Every objective has a target, and every zone a small graph of path points.
  - After 40 s of free play without getting 3 m nearer, your Charm Sprite flies ahead along the route, and an arrow with the distance shows under the objective.
  - Settings > Direction hints: After a while, Always, Off.
  - It waits while you lead a lost child (the sparrow guides then).

### M3: The forest and the map's edge
- **The edge lifts are gone** from the station and the Academy (`build_zones.py`); the station's track runs on both ways.
- **The woods** (`src/procgen/forest.js`), generated when the zone loads:
  - a skirt of ground that continues the authored terrain's edge, with its colours
  - whole trees and a thicket of bushes just outside the walls
  - cheap crowns further out
- **Mist by distance from the map,** not from the camera, so the grounds stay clear. The sea is left out of it.
- **The invisible walls** are where they were. Pushing against one says once: "The woods are too thick to walk through."
- **Inside the map:**
  - wildflowers on grass only (`src/procgen/flowers.js`)
  - five new groves, and more trees in three old ones
  - the low tier plants 60% of the trees (40% before)
- **The night market's two ends** are closed by three shopfronts each.

### M4: From the playtest
- **Walk and run:** on a keyboard the move keys walk (1.45 m/s, the walk animation) and Shift runs. Sticks are unchanged.
- **Slopes:** Pip follows the ground, so her pace up steps is the same as on the flat.
  - Before, a constant downward push left a walk only 0.3 m/s of climb on a 30° ramp.
  - She no longer creeps downhill while standing still on stairs.
- **Skip a long conversation:** tap Skip, or hold the key that advances for 0.8 s. It shows when at least two more lines follow, and stops at a question.
- **Text speed:** Normal, Fast, All at once.
- **Comments as bubbles:** what Pip and the others say after a soothe, a flock, a memory or a grey Grumbling shows over their heads while you walk on. No line was removed.
- **Friends in passing:** seven short remarks (a scattered flock, a reunion, a floated lantern, a splash, a grey that turns away, a neighbour).
- **"Everyone Together"** is a boost: for five seconds every sparrow shows its favourite and calms three times as fast to it. It no longer soothes the flock at once.
- **"Things to do here"** in the pause menu, per zone.
- **The helper offered on the spot** at the lotus buds, the old notes and the lost children.
- **Louder:** the master is up with a limiter after it, the music bus is up, and the train's beds are down.
- **Three camera shots:** the lesson (Pip in frame), Chapter 3's ending (close on Pip and Bean), and Chapter 1's ending at the overlook (a lamp post stood in front of the camera).

### Also fixed on the way
- **The helper's portrait was blank** at the start of a session with a helper equipped (it was drawn before the first frame). It is drawn again a moment later.
- **On a phone held upright,** the objective, the toasts and the helper's chip overlapped. They are one column now, and the helper is a portrait only.

## Measured

**Load size** (`npm run budget`, before Begin):

| | Before | Now | Budget |
|---|---|---|---|
| First visit (train), JS | 238.4 KB | 237.1 KB | 240 KB |
| Returning, station, JS | 238.2 KB | 244.9 KB | 280 KB |
| Returning, Academy, JS | 253.0 KB | 260.5 KB | 280 KB |
| Returning, market, JS | 246.3 KB | 249.5 KB | 280 KB |
| Returning, Quiet District, JS | 249.4 KB | 252.5 KB | 280 KB |
| `kit.glb` | 294.4 KB | 297.9 KB | |
| `academy.glb` | 170.7 KB | 153.7 KB | |
| `station.glb` | 148.0 KB | 149.4 KB | |

**Time to interaction** (`npm run perf`, median of 5, must-pass profile):

| Zone | Before (`next_6`) | Now |
|---|---|---|
| Train | 1.58 s | 1.56 s |
| Station | 1.79 s | 1.92 s |
| Academy | 2.16 s | 2.35 s |
| Market | 1.72 s | 1.82 s |
| Quiet District | 1.74 s | 1.77 s |
| Repeat visit | 0.65 s | 0.55 s |

- Generating the forest, the flowers, the routes and the signs takes 50–105 ms at the Academy under the 4x CPU throttle.

**The forest** (station / Academy):

| | Low | Medium | High |
|---|---|---|---|
| Reach beyond the wall | 55 m | 70 m | 85 m |
| Trees and bushes | 123 / 190 | 242 / 362 | 309 / 427 |
| Far crowns | 234 / 146 | 418 / 278 | 617 / 406 |
| Triangles | 17.9k / 18.0k | 34.1k / 33.0k | 45.6k / 39.8k |
| Draw calls | 6 | 12 | 12 |
| Flower clumps | 141 / 174 | 260 / 322 | 420 / 520 |

- The Academy's courtyard view on the low tier: 87k triangles in 100 calls before, 109k in 105 now.

**The autoplayer's recorded run** (a fresh game to the "coming soon" card, with the new keys), in
`tools/playtest/out/2026-10-02-plan-7/playthrough.mp4` (203 MB, git-ignored):

| | `playtest_5` | Now |
|---|---|---|
| Length | 24:01 | 22:48 |
| Prologue / Chapter 1 / 2 / 3 | 2:58 / 6:31 / 4:48 / 9:30 | 2:58 / 5:59 / 4:34 / 9:02 |
| Reading dialogue | 14:17 (61%) | 13:22 (61%) |
| Free play | 32% | 31% |
| Confused, stuck, checkpoints | 0 | 0 |
| Loudness | −27.7 LUFS, 22 LU range | −20.0 LUFS, 12.8 LU range |
| True peak | −5.5 dBFS | −3.8 dBFS |
| Chapter means | −28 to −38 dB | −22.1 to −25.0 dB |

- **One fix to the autoplayer came out of it.** I had it read name boards as places, and it walked to the "Lesson Pavilion" board and waited there for the lesson. A board's words now go with the building it stands by (`eyes.js`).
- **Standing still in each zone** (22 s each, integrated loudness):

  | Zone | Before | Now |
  |---|---|---|
  | Train | −19.0 LUFS | −20.6 LUFS |
  | Station | −36.4 LUFS | −21.1 LUFS |
  | Academy | −37.4 LUFS | −22.0 LUFS |
  | Market | −35.0 LUFS | −22.8 LUFS |
  | Quiet District | −37.7 LUFS | −23.7 LUFS |

**Tests:** `npm run e2e`, all 63 pass. 20 are new:
- `train-rain`, `library-balcony`, `pond-rim`
- `forest-station`, `forest-academy`, `edge-station`, `edge-academy`
- `routes-` and `signs-` for the four zones
- `guide-library`, `guide-timer`
- `walk-run`, `dialogue-skip`, `menus-lazy`

## Deviations from the plan (and why)
- **Your three changes** (top of this file).
- **Reading share:** still 61%, not under 50%. The trim was the part that would have moved it. The bubbles took 55 s off the reading, and running took about as much off the play.
- **Load time:** the station and the Academy are slower than the plan's "within 0.1 s" (table above). Both are well inside the 3 s limit.
- **The walk is 1.45 m/s,** the fastest the walk animation looks right. The old W pace was 3.2 m/s.
- **The slope fix** wasn't in the plan. Walking up steps was unusable without it.
- **"Everyone Together"** triples only the favourite. Tripling everything still finished a flock in under 2 s.
- **Sunny's welcome sign** still has its own code.
- **No fingerpost in the Quiet District's square:** it is one lane, and the guide covers it.
- **The cloud's rain is heard from the start,** not only once the story points it out: it is visibly raining on shoes from the start.
- **`guide-off`** is part of `guide-library`.
- **The low tier's forest** draws without sectors (6 calls instead of 12), and all of it is always drawn.

## Known issues / limitations
- **The mix was measured, not listened to.** The train is still the loudest zone standing still.
- **Frame rate on the spec's hardware is unmeasured.** The low tier's triangle counts are the guard; your phone is the check.
- **Sign pictures are emoji** drawn by the device's own font, so they look different on each platform.
- **Bubbles can be missed.** A comment said while you run on is gone after a few seconds.
- **The guide follows the route graph.** A new area needs its path points, or the guide draws a straight line.
- **`market_kit.glb` is at 149.8 of 150 KB.**

## What to work on next (suggested order)
1. **Play it:** on a keyboard, the walk pace; on your phone, the mix, the frame rate with the forest, and whether the signs read at that size.
2. **Commit, then deploy,** and check the corner says the commit you deployed.
3. **The playtest's three bigger items,** with Chapter 4: stakes for soothing, a purpose for Cozy Energy, more varied memory scenes.
4. **Chapter 4: Bean's Secret.** Each new area needs its routes, signs and "things to do here" (README, "Build a new area").
5. **If load time matters more at the Academy:** build the flowers and the far crowns after Begin.
