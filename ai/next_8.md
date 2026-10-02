# Next 8: what was built for plan 8, and what comes next

Summary of the implementation of `ai/plan_8.md` (answering `ai/prompt_8.md`), in one go, with every open
question on its default:
- thread fishing is the mini-game
- all ten milestones, in order
- all the story additions in §14
- three new species, so the Sprite Book has eleven entries
- Pip wears the cardigan from the Epilogue on
- fishing opens in the Epilogue
- a free-roam day is three worries, or going to bed
- the big scenes are full dialogue (and can be skipped); everything said while walking is a bubble

The story is complete: a fresh game now runs from the train to THE END, and carries on in free roam.
Nothing is committed.

## What was built

### M0: Room, and a baseline
- **The shaders' new parts** (`render/materials.js`, `render/water.js`): colour pockets also clear the fog
  (`uFogClear`), and a Domain of Comfort (`uDomain`: two sets of scenery in one place, compiled only for the
  zone that has one).
- **A check that the main bundle stays one file** (`tools/budget.mjs`). A late script that imports shared
  modules the wrong way makes the bundler split it; it happened three times on the way.
- **`GPU=1 npm run e2e`** runs the tests on the machine's GPU. The fog chapters' long tests need it (below).

### M1: Chapter 4's pieces, on the greybox (`?zone=test&fog`)
- **The sigh** (`systems/sigh.js`): a front that rolls up the street at 8 m/s. Bean's ears go up and the screen's
  edge greys before it arrives. Behind something solid, or in a warm spot, it passes over. Caught in the open:
  one Calm, and a slow walk for 2.5 s. Calm comes back only in a warm spot. Out of Calm she rests and gets up at
  the last warm spot: no game over.
- **Bean, awake** (`systems/bean.js`): out of the hood with his eyes open and his ears up, talking in bubbles.
  His circle of colour is one of the zone's pockets, and its size is her Calm (9 m at four, 3 m at one).
- **Stitch** (`systems/stitch.js`): take a loose end, walk it where it belongs, hum it there. A stitch lights its
  stretch of street, brings its colour back and is shelter from a sigh. It costs 10 Cozy Energy; with none it
  takes twice the beats.
- **The deep fog** (`systems/fog.js`): you see about 8 m. Up to six pockets go to the shaders each frame.

### M2: The Old Quarter and the square (`heart.glb`, `world/zones/heart.js`)
- **One new zone,** built by `tools/blender/build_heart.py`: the gateway, the back garden, Laundry Alley, the
  pump yard, Lantern-makers' Row, the Arcade, the Persimmon Courtyard, Thread Street, the crossroads and the old
  square with its fountain, street oven and six lantern posts. Grandmother's Kitchen stands in the same place as
  the square, as the Domain's own set.
- **Routes, signs and "things to do here"** as in the other zones.
- **The Quiet District has three states** (`world/zones/quiet.js`): grey with pockets (Chapter 3), under the
  fog (Chapters 4 and 5), and in full colour (the Epilogue and after).

### M3: Chapter 4, Bean's Secret (`story/chapter4.js`)
- The white morning at the Academy with Master Fang gone, her note, the ferry into the fog, checking on the
  neighbours behind their doors, the longest sigh in the square, and Pip alone in the Old Quarter with Bean.
- The sleepers of Laundry Alley, the one grey Grumbling in the gap, the Arcade's doorways, the Persimmon
  Courtyard and **Bean's secret, told as a memory you walk through**, then Thread Street's three stitches, and
  her friends stitched back at the crossroads.
- Three checkpoints (the row, the courtyard, the crossroads).

### M4 and M5: Chapter 5, the Great Sulk (`story/chapter5.js`, `systems/sulk.js`, `sulk.glb`)
- **The Great Sulk:** 9 m tall, breathing, with heavy lids, eyes that follow Pip, tears, and seven patches that
  warm into colour as each feeling is comforted. It heaves when it sighs, and falls asleep at the end.
- **Five phases,** each saved:
  1. the biggest cake (Sunny's kitchen game, in the street, with gusts)
  2. six feelings, and the reply that listens (grey Grumblings you kept company answer with Bo)
  3. every Charm Sprite you have, at its own lantern post, and six patches to stitch
  4. Master Fang's Domain: light the fire, stir the pot, ring the bell, and the guests come in
  5. Pip's own: the Everyone Blanket, sewn on the lullaby's sixteen beats from all her Cozy Energy
- **What your save changes:** who answers, how many sprites fly in, who sits at the table (4, 6 or 9 by tier),
  and how many of the quilt's patches are your own (78 on a bare save, 188 on a complete one).

### M6: Thread fishing (`systems/fishing.js`, `content/catches.js`, `procgen/fish.js`)
- **One button.** Hold Hum to send the thread out and let go; hum on the beat to call the nearest glimmer;
  press at the bite; hold to wind in and ease off while it tugs. Too tight for too long and it gets away, and
  nothing is lost.
- **Six spots:** the Academy's pond bridge, the station's shore, the market's sea wall, the district's jetty and
  canal bridge, and the old fountain (coins and lost things only).
- **In the water:** 14 fish made in code (logged with your biggest, then let go), 10 lost things that each
  belong to someone, the Great Sulk's little reminders, wishes in the fountain, and the Bottled-Up.
- **Bait** (a tart or chestnuts) brings bigger and rarer things. **Uncle Ming** at the station asks for one
  thing at a time: six written requests that improve the thread (longer, calmer, luckier), then requests
  without end.
- **The Harbour Book,** a page of the Sprite Book.
- On screen it is five draw calls: the thread, the float, the glimmers, a ring, and the catch.

### M7: The Epilogue (`story/epilogue.js`)
- **Dawn in the square:** the sky goes from grey to gold behind the talking, the Great Sulk comes apart into a
  cloud of little reminders (800, 2,000 or 4,000 points, one draw call) that stream north, the kitchen fades and
  its table stays, the blanket folds.
- **The walk back:** colour returns as one pocket that only grows; lanterns relight, shutters lift and every
  shop and house opens just ahead of you. Breakfast in the lane with the neighbours, who say more if you
  checked on them.
- **The jetty:** Uncle Ming teaches fishing on three reminders. The third is Pip's own.
- **Mistbloom:** bunting, the cardigan (a second model of Pip, `xiaopei_cardigan.glb`, worn from then on), the
  speeches, Bo's four sentences, Bean's "Five more minutes."
- **THE END and the credits:** what you did, and the fork link.

### M8: Free-roam Lantern Bay (`story/freeroam.js`)
- **Every place in its after-state,** and reachable from every other: Bo at the gate (the Quiet District, the
  night market, the station), the ferryman, the market's stairs, the hill path, the walk to the Old Quarter.
- **The worry board** (`systems/worries.js`, `content/worries.js`): 24 worries across the five places and all
  nine kinds. Three a day. The guide points to the nearest. A soothed worry is crossed out, earns a patch, and
  its person says thank you.
- **Three new species** (`content/species2.js`, `creatures2.glb`): the First-Day Jitters, the Bottled-Up and
  the Unsent Letter, each soothed its own way, each with an ability (Brave, Float, Deliver).
- **Welcoming the first-years** (`story/firstyears.js`), on the second day: Sunny's sign, the train, three
  first-years with the Jitters, the walk up the hill, the tour, the bench.
- **The Everyone Blanket** hangs over the old square and grows with your patches. The fountain runs.
- **The Sprite Book:** eleven entries, the Harbour Book, a Lantern Bay page, and a gold border when it is full.

### M9: The rest
- **Five music tracks** (`content/music.js`): `fog`, `bean`, `sulk` (a voice joins with each phase),
  `blanket`, `morning`.
- **README:** the two chapters, Stitch, fishing, free roam, and how to add a catch or a worry.

## Measured

**Load size** (`npm run budget`, before Begin). Everything after Chapter 3 loads after Begin:

| | Before (`next_7`) | Now | Budget |
|---|---|---|---|
| First visit (train), JS | 237.1 KB | 238.3 KB | 240 KB |
| Returning, station, JS | 244.9 KB | 246.2 KB | 280 KB |
| Returning, Academy, JS | 260.5 KB | 262.7 KB | 280 KB |
| Returning, market, JS | 249.5 KB | 250.8 KB | 280 KB |
| Returning, Quiet District, JS | 252.5 KB | 256.0 KB | 280 KB |
| Returning, the Old Quarter, JS | | 254.9 KB | 280 KB |
| First visit, models | 544 KB | 547.8 KB | 700 KB |
| Returning, the Old Quarter, models (Chapter 5) | | 925 KB | 1,250 KB |

| Model | Before | Now | Limit |
|---|---|---|---|
| `heart.glb` (new) | | 181.8 KB, 14.5k triangles | 200 KB |
| `sulk.glb` (new) | | 51.0 KB, 1.9k triangles | 60 KB |
| `creatures2.glb` (new, after Begin) | | 36.4 KB, 1.4k triangles | 45 KB |
| `xiaopei_cardigan.glb` (new) | | 129.6 KB | 130 KB |
| `creatures.glb` | 104.9 KB | 108.8 KB | 110 KB |
| `quiet_kit.glb` (open shops and houses) | 80.9 KB | 136.6 KB | 150 KB |
| `anim_humanoid.glb` | 74.8 KB | 74.8 KB (no new clips) | 85 KB |
| `quiet.glb` | 145.2 KB | 145.2 KB (not rebuilt) | 200 KB |

- **After the Epilogue** a returning player downloads less: the cardigan model replaces Pip's, the old square
  has no Great Sulk, and the district doesn't preload Sunny and Bo (595 to 1,135 KB of models, by zone).

**Time to interaction** (`npm run perf`, median of 5, must-pass profile: 10 Mbps, 60 ms, 4x CPU):

| Zone | `next_7`'s table | The untouched build, today | Now, today |
|---|---|---|---|
| Train | 1.56 s | 2.02 s | 2.01 s |
| Station | 1.92 s | 2.46 s | 2.49 s |
| Academy | 2.35 s | **3.10 s** | **3.11 s** |
| Market | 1.82 s | 2.42 s | 2.39 s |
| Quiet District | 1.77 s | 2.40 s | 2.45 s |
| The Old Quarter (Chapter 5) | | | 2.43 s |
| Repeat visit | 0.55 s | 1.01 s | 1.03 s |

- **This work did not change the load time:** the build from before it measures the same on the same machine
  on the same day (the middle column).
- **But the machine measures about 0.5 s slower than it did for `next_7`,** on identical code, and that puts the
  Academy over the tool's 3.0 s line, so **`npm run perf` exits with a failure today.** I don't know what changed
  (Chrome is 154; the GPU is reported as Intel HD 630 through Mesa). 3.1 s is inside the spec's 4 s maximum and
  outside its "2 to 3 s".

**Frame cost** (the low tier, from the tests' logs):

| View | Draw calls | Triangles |
|---|---|---|
| Chapter 5, every sprite in the square (the busiest) | 83 to 88 | 74k to 82k |
| The old square after the story (canopy, table, fountain) | 53 | 54k |
| The Quiet District after the story (every shop open) | 52 | 77k |
| Plan's limit for the new zone | 100 | 150k |

- **In software rendering** (the tests' default) a frame costs 6 to 9% more than before in the old zones
  (station 141 to 154 ms, Academy 122 to 130 ms): the shared shaders test for pockets and the fog's clearing
  in every material now. On the GPU the tests run at the 60 fps cap either way, which says nothing about a phone.

**Tests:** 111, of which 48 are new.
- `GPU=1 npm run e2e`: **all 111 pass** (36 minutes).
- `npm run e2e` (software rendering, the default): the first complete run passed **99 of 111** in 95 minutes.
  - The 12 that failed all waited by the clock: a walk timed in milliseconds, or a short timeout. In software
    rendering the game draws a few frames a second and a slow frame counts as 1/20 s, so game time runs well
    behind the clock.
  - 4 of the 12 fail the same way on the untouched build on this machine today (`restart-to-train`,
    `restart-url`, `chapter1-full`, `lesson-stand`); `next_7` had all 63 passing, so the machine is slower in
    this mode too.
  - The test runner now counts game time for timed walks (`h.walk`, `h.gwait`) and waits four times as long in
    software mode. With that, **each of the 12 passes when run again** in software rendering (`chapter4-full`
    in 11 minutes, `chapter5-full` in 10, `epilogue-full` in 5).
  - I did not repeat the complete 95-minute software run after that change; the complete GPU run was repeated.

| Area | New tests |
|---|---|
| The sigh, Bean, Stitch | `fog-sigh`, `bean-awake`, `fog-stitch` |
| The zones | `routes-heart`, `signs-heart`, `floor-heart-fog`, `floor-free-` (five), `quiet-fog`, `quiet-after`, `domain-edge` |
| Chapters 4 and 5 | `chapter4-full`, `sulk-phase1` to `5`, `finale-bare`, `finale-full`, `chapter5-full` |
| The Epilogue | `epilogue-full` (with two reloads on the way) |
| Fishing | `fishing-spots`, `fishing-catch`, `fishing-escape`, `fishing-lure`, `fishing-log`, `fishing-touch-` (both phone sizes), `lost-return` |
| Free roam | `freeroam-travel`, `freeroam-canopy`, `worries-` (five zones), `worries-day`, `worries-newday`, `species-letter`, `species-bottled`, `firstyears-full`, `book-complete` |
| Saves and phones | `old-saves`, `touch-hit8-` (both phone sizes) |

- `species-jitters` is part of `worries-day`.
- Changed: `chapter3-full` and `story-stand` (the chapter now ends at the gate the next morning), the `edge-`
  tests (they watch the distance to the wall, so they no longer wait for ever at a high frame rate), and the
  clock-based waits in `restart-`, `look-no-drift` and `dialogue-skip`.

**The autoplayer** (no recording: see below):
- **A full run from a fresh game** (`npm run playtest`, on the final code) plays the Prologue and Chapters 1 to
  3 and stops at "Chapter 3 complete": 23:07, with no confusion, no stalls, no checkpoint and no page errors
  (Prologue 3:00, Chapter 1 6:01, Chapter 2 4:37, Chapter 3 9:24; 60% of it reading, as before).
- `npm run playtest -- --from free --minutes 8` played a whole free-roam day from what is on screen: it read
  the worry board, soothed the Soggy Cloud at the kitchen (26 s), read the board again, stood with the student
  and soothed the First-Day Jitters, caught two fish at the pond bridge (about 20 s a catch), asked Bo for the
  Quiet District, soothed the third worry there, came home on the ferry on day 2 and took Sunny's sign.
- In that run it needed the checkpoint once (walking back to the board), and then had no rule for "meet the
  train at the station". That rule is written now, and has not been run.

## Deviations from the plan (and why)

- **The autoplayer does not play Chapters 4 and 5, and there is no recording.** The plan promised new goals
  (shelter from a sigh, stitch) and an uncut recording from a fresh game to THE END, reviewed for stalls,
  reading share and loudness.
  - What it has: the new starting points (`--from ch4`, `fog`, `heart`, `ch5`, `epilogue`, `free`), the fishing
    panel, the worry board and the catch card, and rules for the Epilogue's and free roam's objectives.
  - What I ran: a free-roam day (above). The Epilogue's rules and the first-years' rules are written and have
    not been run.
  - `ffmpeg` is not installed on this machine, so nothing could be recorded or measured for loudness.
- **The mix was neither measured nor listened to.** The five new tracks and the fog's, the square's and the
  morning's ambience use the levels of the tracks that were there, and are not levelled against `next_7`'s
  −20 LUFS. "Fishing: the place's
  music, thinned out" was not done: the music only steps back while she hums, as everywhere.
- **Bean rides on top of Pip's head,** not her shoulder: her head is wider than her shoulders, and he was hidden
  behind her cheek from the front.
- **No new animation clips.** Casting uses the throw, tucking in uses the pat, and a friend caught by a sigh
  uses the out-of-Calm sit. `anim_humanoid.glb` is unchanged.
- **The cardigan is the same Pip, repainted** (`char_xiaopei_cardigan.py`): her jacket becomes Master Fang's
  orange knit with ribbed cuffs, buttons and deep pockets. The model's shape is the same, so the swap at the
  ceremony is one texture.
- **The Quiet District's own model was not rebuilt.** Its three states are in code. Its kit gained open versions
  of the three shopfronts and the two house fronts (136.6 KB; the plan guessed 110).
- **Open shops are unmanned.** "Every shop open with someone in it" is every shop and house open, lit and
  stocked, with the four neighbours who were always there.
- **The Old Quarter stays shuttered after the story.** Only the square changes (the table, the fountain, the
  blanket). The worry notes there are pinned to doors, since nobody lives there yet.
- **`heart.glb` is 181.8 KB** (the plan said 180 or less; the limit is 200). The fountain was rebuilt as a
  real basin for the fishing, and the table became a mesh of its own so it can stay.
- **No `systems/domain.js`:** the Domain is a uniform in `render/materials.js` and its story in `chapter5.js`.
- **One sparrow worry, not several:** the flocks need the market's seats, so only the toy stall's is on the list.
- **Fishing was tuned at its six spots,** not on the greybox first.
- **A catch takes about 20 seconds** for a player who knows it (the autoplayer's pace), at the short end of the
  plan's 20 to 40.
- **The first-years are three of the same model,** at three sizes.
- **Two things beyond the plan:** the dialogue box sits lower on a short phone screen (three long replies at
  the largest text ran off the top), and an early press of "Pack up" after a catch is remembered.

## Known issues / limitations

- **`npm run perf` fails on the Academy today** (3.1 s against 3.0 s), with or without this work (above).
- **The tests are slow without a GPU:** 95 minutes for a complete run in software rendering (the Old Quarter
  draws a few frames a second there), 36 with `GPU=1`.
- **First-visit JS is at 238.3 of 240 KB.** Anything new before Begin has to make room first.
- **`xiaopei_cardigan.glb` is at 129.6 of 130 KB,** and `market_kit.glb` still at 149.8 of 150.
- **Frame rate on the spec's hardware is unmeasured,** as before. The fog's shader work (up to six pockets a
  pixel) is the new risk on an entry-level phone; the software-rendering numbers above are the only hint.
- **Whether the ending lands** is yours to judge. So is the fishing's feel on a phone.
- **A free-roam day has no clock.** Sleeping at the dormitory door throws away the day's unsoothed worries.
- **Old saves:** the new keys (`fish`, `lost`, `line`, `reminders`, `patches`, `day`, `worries`) are added
  when first needed. The save's version is still 2.
- **The service worker now caches 2.5 MB of models** (four more than before).

## What to work on next (suggested order)

1. **Play it,** from a save at the end of Chapter 3 (or from the train). On a phone: the frame rate in the fog
   and in the square, the Domain's edge, and whether Hum alone is comfortable for fishing.
2. **Commit** (each milestone above is a sensible commit if you want them separate), **then deploy.**
3. **Look at the Academy's load time** on your own machine first. If it really is over 3 s: build the flowers
   and the far crowns after Begin (`next_7`'s item 5).
4. **Teach the autoplayer the fog:** a "shelter" goal (it can see the warm spots and hear Bean) and a "stitch"
   goal. Then, with `ffmpeg` installed, the uncut recording to THE END, and from it the reading share and the
   loudness of the new chapters.
5. **Level the mix** of the five new tracks against −20 LUFS.
6. **People in the open shops,** and the Old Quarter coming back to life street by street: it could be what the
   patches on the Everyone Blanket pay for.
7. **More worries and catches:** both are lists (`content/worries.js`, `content/catches.js`).
8. **The other two mini-games** from the plan's first question (sprite tag, the quilt puzzle), if fishing isn't
   enough.
