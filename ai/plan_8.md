# Plan 8: Chapter 4 (Bean's Secret), Chapter 5 (The Great Sulk), the Epilogue, free-roam Lantern Bay, and a mini-game that keeps going

Answers `ai/prompt_8.md`. Builds on `ai/next_7.md`, `ai/playtest_5.md`, the outline in `ai/plan_0.md` §7 and `ai/snuggle_sorcery_story.md`. Nothing here is built yet.

## 0. Short answer

**What gets built**
- **Chapter 4: Bean's Secret (§3).** The fog covers the whole Quiet District overnight. Pip loses her friends in it and ends up alone beyond the fog wall, in a new area: the Old Quarter.
  - **Hiding and comforting:** the Great Sulk's sighs roll down the streets. You shelter from them, tiptoe past sleeping grey Grumblings, and keep the lonely ones company.
  - **Bean is awake:** he rides on her shoulder, talks, and carries a small circle of colour with him.
  - **The secret,** told as a memory you walk through.
  - **The Lullaby Thread's upgrade, a new verb: Stitch.** Take a loose end, walk it to where it belongs, and stitch it there. Pip stitches her way back to Sunny and Bo.
- **Chapter 5: The Great Sulk (§5).** The five phases from the story, each one a mechanic from an earlier chapter, bigger:
  1. Sunny's cake (Chapter 1's kitchen)
  2. Bo and Captain Honk listening (Chapters 2 and 3)
  3. every Charm Sprite you collected coming back (Stitch, at scale)
  4. Master Fang's Domain, Grandmother's Kitchen (a new shader effect)
  5. Pip's Domain, the Everyone Blanket: a quilt made of patches from your own save
- **Epilogue: Morning in Lantern Bay (§7).** The fog lifts, thousands of little sprites fly home across the harbour, the district comes back in colour, breakfast in the street, the cardigan, the speeches, "Five more minutes", THE END and credits.
- **Free-roam Lantern Bay (§8).** Every place in its "after" state, with travel between all of them:
  - a worry board with new Grumblings every day, without end
  - three new species, so the Sprite Book goes from 7 to 11 entries
  - welcoming next year's first-years at the station, with Pip holding the sign this time
- **The mini-game: thread fishing (§6).** You were looking for fishing at the pond in prompt 7, and Lantern Bay is a harbour.
  - Six spots across the city. Cast the Lullaby Thread, lure on the beat, and reel the way you soothe (hold, ease off when it tugs).
  - Catches: 14 fish (let go again), 10 lost things that each belong to someone in town, the Sulk's little reminders that fell in the water, and one rare Grumbling.
  - The Epilogue teaches it, and it carries on in free roam with a log, records and a fisherman's requests.
  - Two alternatives are in §15, question 1.

**Size**
- **Play time:** about 27 more minutes of story (Chapter 4 about 9, Chapter 5 about 11, the Epilogue about 7). The story so far is 22:48 in the autoplayer's run. Free roam is open-ended.
- **A new zone** (the Old Quarter and the square at its heart), four new models and four rebuilt ones, sixteen new source files and three new Blender scripts (§12).
- **This is roughly three Chapter 3s.** It's planned as ten milestones (§13), each ending with green tests so you can commit after any of them.

**The care (§1):** every new part gets what Chapters 1–3 have: its own tests, signs, routes for the guide, "things to do here", camera shots, friends' remarks, music, phone-size checks, a load-time check, and a place in the autoplayer's uncut recording.

**The playtest's three open items land here,** as `next_7.md` suggested:
- **Stakes for soothing (#2):** Calm matters in the fog. It is also how far Bean's colour reaches.
- **A purpose for Cozy Energy (#4):** it powers the Stitch, and Pip's Domain at the end.
- **More varied memory scenes (#8):** Bean's memory is one you walk through.

**Costs (§10)**
- **First-visit JS is at 237.1 of 240 KB.** Everything new loads after Begin or with the new zone. The target is 238.5 KB or less.
- **Load time:** the new zone within 3 s on the must-pass profile (I expect about 1.9 s). The other zones within 0.1 s of `next_7.md`.

**Checked in this session**
- **Blender is connected** (5.2 LTS, add-on 1.8), so the models can be built.
- **`node_modules` isn't installed in this checkout,** so I couldn't run the build. The numbers above are `next_7.md`'s. M0 measures them again before anything changes.
- **`ref/` isn't in this checkout.** The Great Sulk and the kitchen are designed from the story's words and the game's existing style. If you have pictures for them, put them in `ref/`.
- **There is no way from the Academy down to the station** today (only up). Free roam adds it.

**Yours to decide (§15):** the mini-game (question 1), whether I go through all ten milestones or stop after Chapter 4 for you to play (question 2), and the small things I add to the story (§14).

## 1. The bar: what "the same care" means

What each chapter so far has, and what each new part gets. A part isn't done until its row is.

| | Chapters 1–3 today | Chapter 4, Chapter 5, the Epilogue, free roam |
|---|---|---|
| A new idea to play with | one per chapter (dodging, sitting with a flock, keeping company) | Chapter 4: hiding from the sigh, Stitch. Chapter 5: Domains. Free roam: fishing |
| Resumes after a reload | every step waits on saved state | the same, plus a checkpoint for each finale phase |
| A whole-chapter test | `chapter1-full`, `chapter2-full`, `chapter3-full` | `chapter4-full`, `chapter5-full`, `epilogue-full`, `firstyears-full` |
| Signs, routes, the guide | every zone | the new zone, and every new objective has a target |
| "Things to do here" | every zone | the new zone, and new rows in the old ones |
| Nobody inside a floor or wall | the dev floor check, `floor-*` | new story states added to `floor-*` |
| Phone sizes | `touch-hit-*` at 390×844 and 844×390, text at 150% | every new button and panel added |
| Friends who react | passing remarks in each zone | the same, and Bean's remarks through Chapter 4 |
| Camera shots that show their subject | checked on recorded frames | the same check on the new recording |
| Music and ambience | a track and a mix per place | five new tracks, four new mixes (§9) |
| Load time and size | `npm run budget`, `npm run perf` per zone | the new zone added to both |
| Frame cost on phones | triangles and draw calls measured on the low tier | the same, at the finale's busiest moment |
| The autoplayer | plays it uncut, recorded and reviewed | new rules and goals, a new recording to THE END |
| Old saves | still load | a save from today's build starts Chapter 4 (`old-saves`) |
| Written up | README, `next_N.md` | README, `next_8.md` |

## 2. M0: Room, and a baseline

- **Install and measure:** `npm install`, then `npm run budget`, `npm run perf` and `npm run e2e` (63 tests) on `HEAD`, so every later number has a "before".
- **The new story scripts load after Begin.** Today a zone's chunk carries its chapters' scripts (the Academy's chunk has Chapters 1 and 3), and the Academy is at 260.5 of 280 KB. The new scripts are only needed once you press Begin.
  - `main.js` loads them the way it loads the zones and the music.
  - What a zone needs while it loads stays with the zone: the objective's text, and where everyone stands.
  - The scripts of Chapters 1 to 3 stay where they are. They work, and they fit.
  - **Proved first:** a build with one empty new script, checking the main bundle is still one file. `next_4.md` found two import shapes that split it. If this one does too, the scripts get what they need handed in, like the menus.
- **If the first-visit JS needs more room:** the friend assists (`systems/assists.js`, no use on the train) move out to after Begin.
- **A shared helper:** `tween()` moves from `systems/memories.js` to `story/helpers.js`.
- **The "coming soon" card goes** (`story/chapter3.js:447`). Chapter 3 ends on its own card, then "Sleep well. Tomorrow, the neighbours."

## 3. Chapter 4: Bean's Secret

### 3.1 Flow (`src/story/chapter4.js`)
0. **Handing over from Chapter 3.** Loading a save with `ch3Done` at the Academy shows "The next morning…" and the Chapter 4 card. The saves people have today need nothing else.
1. **A white morning (Academy).** From the gate, the far shore is gone: only fog.
   - Master Fang left before dawn. Her note is pinned to the pavilion, with three lemon candies: *"Gone to wake an old kitchen. Check on the neighbours. Do NOT go past the fog wall. — F."*
   - Bo is at the gate. The ferry.
2. **The district under the fog** (the Quiet District, a new state of the same zone).
   - You see about 8 m. The fog is thick everywhere except where Chapter 3 left something:
     - **Every memory you restored is still a pocket of colour** and clear air.
     - **Every neighbour you checked on has a lamp in the window:** a small warm spot.
   - The friends walk in close together. Honk: *"CAPTAIN HONK WOULD LIKE TO HOLD YOUR HAND."*
   - **The first sigh** rolls up the lane (§3.2). Sunny teaches by doing: *"Behind the letterbox! Quick!"*
   - The neighbours talk through their doors. The grey Grumblings are all gone, toward the heart.
3. **Separated.** At the square a long sigh catches Sunny and Bo in the open.
   - They slow, sit down, and go a little grey. Sunny: *"I'm fine, really. You go on."* (the Great Sulk's own words, from Chapter 3).
   - Pip turns to help. The fog closes. When it thins she is alone, the fog wall is behind her, and the streets are ones she doesn't know.
4. **The Old Quarter, alone** (the new zone, §4). Five stretches:

   | Stretch | What you do | What it teaches |
   |---|---|---|
   | The back garden | Bean climbs out of the hood: *"Don't run. Running makes it worse."* The first sigh you face alone, from behind the garden wall | Sheltering. Bean's circle of colour |
   | Laundry alley | Grey Grumblings asleep under the sheets. Walk past (run, and one wakes and sighs) | Walking softly (the walk and run keys from plan 7) |
   | The long arcade | A straight street the sighs roll down, with a doorway every 8 m. A grey sits in the one gap: keep it company and it moves aside | Timing, and comfort as the way forward |
   | The persimmon courtyard | Behind Grandmother's kitchen. Bean's secret (§3.4), then the upgrade | The story's turn |
   | Stitching street | Three loose ends to stitch home. Each lights its stretch of street for good | Stitch |

5. **Following the thread.** The Lullaby Thread, "brighter than ever", runs off down the street toward her friends. You follow it.
6. **Stitching them back.** Sunny and Bo sit apart at a crossroads, grey, each saying they're fine.
   - Take the thread to Sunny, then to Bo, through one last sigh (hold on to it), then stitch.
   - Colour comes back into both. Bo speaks first, without Honk: *"…you came back."*
   - The Chapter 4 card. Ahead, the fog glows faintly around something very large.
- **Flags:** `ch4_start`, `ch4_ferry`, `ch4_lost`, `ch4_garden`, `ch4_secret`, `ch4_thread`, `ch4Done`, and `stitch_<id>`. All additive: the save's version stays 2.

### 3.2 The sigh
- **What it is:** a wide, slow front of grey that comes from the heart about every 16 s (9 s in the arcade).
- **You're warned:** a low moan three seconds ahead, the fog brightening that way, Bean's ears going up, and a soft edge on the screen.
- **Caught in the open:** Pip slows to a shuffle for 2.5 s and loses one Calm. A thread she's carrying slips out of her hand.
- **Sheltered:** nothing happens. Sheltered means something solid stands between you and where the sigh comes from (a wall, a doorway, a cart), or you're in a warm spot.
- **Out of Calm:** she sits down. Bean: *"Five more minutes. I'll keep watch."* She gets up at the last warm spot with full Calm. Nothing is lost, and there's no game over.
- **Never during a scene,** and never in the first 4 s after one.
- **Reduce motion** (the setting): no camera shake, and the front fades in instead of rolling.

### 3.3 Bean, awake
- **On her shoulder,** with open round eyes and ears that move. `creatures.glb` gets those parts (he has only slit eyes today).
- **His circle of colour:** one of the eight colour pockets the shaders already have, moving with Pip. Colour, and now clear air too.
  - **Its size is your Calm:** 9 m at full Calm, 3 m at one. This is the stake the playtest asked for: lose Calm and you see less.
- **He talks as you walk:** bubbles, not dialogue boxes, except in the secret's scene. He names what's ahead, counts down a sigh once, and is funny about dumplings.
- **He replaces the guide's sprite** in this chapter: he points the way.

### 3.4 The secret, as a memory you walk through
- **The place:** the courtyard behind the kitchen whose door you found in Chapter 3, under a bare persimmon tree.
- **How it plays:** the golden figures from Chapter 3's memories, but you aren't held in place. You walk among them while Bean tells it.
  - Fifty years ago: the fog over the roofs, a small girl at the kitchen table, her grandmother at the stove.
  - The girl walks out into the fog with a pocketful of lemon candies and a red thread. Follow her across the courtyard.
  - The fog curls round her like something enormous being hugged. One small piece doesn't let go.
- **The lines are the story's:** he was a "five more minutes" feeling from a little girl who didn't want to leave her grandmother's kitchen. The girl was Master Fang. He has slept in sorcerers' pockets and hoods ever since, waiting for someone who could finish what she started.
- **Then:** *"You don't just soothe feelings. You stitch them back to people. That's what your thread does."*

### 3.5 Stitch (the Lullaby Thread's upgrade)
- **A loose end:** a frayed, glowing end of thread hanging in the air, with a small picture of what it is (a doorbell, a letter, a birthday lantern).
- **Take it** (Interact). The thread runs from Pip's hand to it. It reaches 25 m.
- **Walk it to where it belongs:** that place glows the same colour, and the guide's arrow points to it.
- **Stitch:** hold Hum for four beats. Presses on the beat make it quicker, as in soothing.
- **What a stitch leaves:** a golden thread between the two, for good. It lights its stretch of street (the lamp map), brings its colour back (a pocket), and is a shelter from sighs.
- **Cozy Energy powers it:** a stitch spends 10. With none left it still works, in eight beats instead of four. So you can never be stuck, and kind acts now buy something.
- **The thread itself:** golden from now on, and it reaches 10 m instead of 7.5 m when you soothe.
- **Where else it's used:** Chapter 5's phases 3 and 5, and in free roam for lost things and one new species.

## 4. The new zone: the Old Quarter and the Heart

### 4.1 `tools/blender/build_heart.py` → `heart.glb`
- **About 56 × 96 m,** south of the fog wall. It uses the Quiet District's kit (`quiet_kit.glb`), so a returning player has that already.
- **The Old Quarter** (Chapter 4): the back garden, laundry alley, the arcade with its doorways, the persimmon courtyard, stitching street, the crossroads.
- **The Heart** (Chapter 5): a square about 32 m across where four streets meet.
  - An old street oven, a dry fountain, stone lantern posts (somewhere to shelter).
  - The Great Sulk fills its south side.
- **The kitchen set,** for Master Fang's Domain: floorboards, a stove with great pots, a long table with benches, shelves, a lamp-lit window. It's in the same file, drawn only inside the Domain (§5.4).
- **Markers:** the usual kinds, plus `POINT_loose_<id>` and `POINT_anchor_<id>` (Stitch), `AREA_warm_<n>` (warm spots), `GRUMB_heavy_<n>` (the sleepers), `POINT_sigh` (where sighs come from), `SEAT_table_<n>`.
- **In the zone's module** (`src/world/zones/heart.js`): its path graph, name boards (Laundry Alley, the Arcade, Persimmon Courtyard, the Old Square), "things to do here" (four extra loose ends, three sleepers to keep company, an old note), the lamp map, the fog.

### 4.2 The Quiet District, rebuilt (`build_quiet.py`)
- **The fog wall becomes a gateway.** Its collision comes out of the model. Until Chapter 4's separation, the trigger that turns you back today ("Not yet") is what stops you. After it, the trigger leads into the new zone.
- **New markers:** the way through, the breakfast table's places, two fishing spots, the noticeboard's worry board.
- **`quiet_kit.glb`:** an open version of each shopfront (shutter up, a lit window, goods on the counter), a long table, bowls, bunting. About +30 KB, on 81 of 150 KB.
- **Three states of the one zone:** grey with pockets (Chapter 3, as now), deep fog (Chapter 4), full colour (after the Epilogue).

### 4.3 The fog's look
- **Deep fog:** the height fog and the scene fog pulled in to about 8 m. Two additions to the shared fog code: a colour pocket also clears the fog inside it, and the sigh is a moving term along one direction. A few instructions per pixel, off in the other zones.
- **No new passes.** The front you see is one large transparent mesh, like the grey Grumblings' sigh ring.

## 5. Chapter 5: The Great Sulk

### 5.1 The Great Sulk (`sulk.glb`, built by `tools/blender/build_sulk.py`)
- **The grey Grumbling's design at the size of a building:** a blanket-lump about 9 m tall and 14 m wide, the hem pooled on the ground, two enormous tearful eyes in the blanket's opening.
- **Seven patches** on the blanket, separate pieces that can warm into colour: one for each kind of Charm Sprite, and one for Bean.
- **Alive in code:** it breathes, its lids droop and lift, tears well up and fall, the hem ripples, its eyes follow Pip slowly.
- **It never attacks.** It sighs (§3.2, from close by now, in rings), and the sighs soften phase by phase.
- **Colour seeps back** as the phases pass, the way the small grey ones warm up.
- **Budget:** 5,000 triangles and 60 KB at most. Loaded with the zone.

### 5.2 Checking on your friends
- A sigh that catches Sunny, Bo or (later) Fang in the open sits them down: *"I'm fine, really."*
- A friend who is down stops helping: Sunny stops baking, Bo stops listening.
- **Walk over and stay beside them for two seconds** and they get up.
- This runs through phases 1 to 3. It's Master Fang's line made into play: loneliness comes back when people stop checking on each other.

### 5.3 The five phases
Each ends in a saved checkpoint (`ch5_p1` … `ch5_p5`).

| # | The story | What you do | Where it comes from |
|---|---|---|---|
| 1 | Sunny bakes the biggest cake anyone has ever seen, and the smell cuts through the fog | Three tiers at the street oven: her kitchen game three times, faster each tier, with a gust across the meter when the Sulk sighs. The better you bake, the wider the smell's circle of colour (10 to 16 m). The fog in the square lifts, and you see all of the Sulk for the first time | Chapter 1 |
| 2 | Bo lets the Sulk speak through Captain Honk, and answers each feeling | Stay beside Bo, so he keeps his nerve. Honk says six forgotten feelings, the same six the grey Grumblings carried. For each, pick the reply that listens out of three ("I hear you. That sounds really hard."), not the one that fixes or brushes off. A wrong one earns a sigh and another go | Chapters 2 and 3 |
| 3 | Every Charm Sprite you befriended returns | They all fly in, as many as your save holds, and gather by kind at the lantern posts. Each patch on the Sulk dangles a loose end: stitch it to the sprites born from that feeling, and they swarm the patch into colour | Chapter 4's Stitch |
| 4 | Master Fang opens Grandmother's Kitchen | She arrives. The Domain opens round her, and three things grow it across the square: light the stove (hum four beats), stir the great pot (eight beats), ring the dinner bell. Guests come in and sit. Inside the Domain a sigh is only steam | The beat games |
| 5 | Pip unfolds the Everyone Blanket | Bean: *"Don't soothe it. Stitch it."* All your Cozy Energy pours into the thread. Sixteen beats, the whole lullaby: each press throws a stitch to someone and sews a patch. The quilt drapes over the Sulk. Then walk up and tuck it in | The Prologue's first hum, and tucking in the sleepy sprites |

- **Phase 5 can't be failed,** like the first hum on the train. Presses on the beat sew golden patches.
- **And under the blanket, in the warm kitchen, it falls asleep.** One enormous "z z z". The music stops for a moment.

### 5.4 What your own save changes ("every relationship and Charm Sprite collected")
- **Grey Grumblings you kept company in Chapter 3** (up to six): each answers one of phase 2's feelings together with Bo, so there's one fewer to answer.
- **Your sprites:** phase 3 shows all of them (12 sparrows is a flock). A kind you have more of stitches in fewer beats.
- **Neighbours you checked on, children you brought home, classmates you helped, the musician you listened to:** they're the guests at the table in phase 4.
- **Lemon candies you found:** Fang hands round that many.
- **Memories you restored:** each is a patch on the quilt. So is each kind of sprite, each neighbour and each kind act.
- **A bare save still finishes.** There's always one sprite of each of the first five kinds, and Pip, the friends and Fang are four guests.

### 5.5 The Domains (the new rendering)
- **Grandmother's Kitchen:** a circle that grows from Master Fang. Inside it the street isn't drawn and the kitchen is. Its edge is a line of glowing stitches.
  - **How:** one more uniform in the shared materials (a centre and a radius) and a side for each material (street or kitchen). Pixels on the wrong side are discarded.
  - **Cost:** one distance per pixel while a Domain is open, nothing otherwise. No extra passes and no new shader programs.
  - **Collision** follows it: the table and stove become solid as the edge passes them.
- **The Everyone Blanket:** a quilt made in code, about 40 × 40 patches in the cloth material the game already has (its stitched grid is the game's signature look).
  - Each patch takes the colour of something from your save (§5.4).
  - It unfolds from Pip's hands and settles over the Sulk's shape. The seams glow as they're sewn.
- **People at the table:** by tier, 4, 6 or 9 guests seated and still (their animation is paused once they sit), with a bowl and steam at every other place. Plan 0's limit of six characters animating at once holds.

## 6. The mini-game: thread fishing

### 6.1 Why this one
- **You looked for it** (prompt 7, issue 3), and plan 7 answered "a fishing mini-game could be its own plan."
- **Lantern Bay is water everywhere:** the Academy's pond, the station's shore, the market's pier, the district's jetty and canal. So fishing gives every place a reason to go back.
- **It comes out of the ending:** some of the Great Sulk's little reminders fall short into the harbour, and somebody has to fish them out.
- **It plays like soothing,** so it needs no new buttons: Hum does all of it, on keyboard, gamepad and touch.

### 6.2 One catch (20 to 40 seconds)
1. **Cast.** At a fishing spot, "Cast the thread". The camera looks over her shoulder at the water, where glimmers move under the surface (small, middling, large).
   - Hold Hum, and a marker slides out across the water. Let go to drop the float there. Nearer a glimmer is better.
2. **Lure.** Hum on the beat. Each note on the beat draws the glimmer closer. Notes off the beat make it shy.
3. **The bite.** The float dips, and the ring pulses. Press Hum.
4. **Reel.** Hold Hum to wind in. The catch tugs, and the thread tightens (a bar, and the thread itself going taut and bright).
   - Ease off while it tugs, hold when it rests. A press on the beat pulls extra, as in soothing.
   - Too tight for too long and it slips away with a splash: "It got away! It looked like…" Nothing is lost.
5. **The catch.** A card: what it is, how long, a line about it, and "New!" or "A record!"
- **Fish are let go again.** Pip says hello first.

### 6.3 What's in the water (`src/content/catches.js`)

| Kind | How many | What happens |
|---|---|---|
| Fish | 14 kinds, each at certain spots, each with a size range | Into the log, with your biggest. Then back in the water |
| Lost things | 10 (an umbrella, the other sock, a mahjong tile, a letter in a bottle, a toy boat, spectacles…) | Each belongs to someone in town. Bring it back: a few words, Cozy Energy, a patch for the quilt |
| Little reminders | no end of them | A piece of the Great Sulk that fell short. It reads its reminder ("Call your sister.") and flies off home across the bay. A few are always among the day's catches |
| A Grumbling | 1 new species, rare: Bottled-Up (§8.4) | Soothed on the line: reel it in without ever letting the thread go too tight |

- **The fish are made in code:** one paper-craft fish whose shape and colours come from a few numbers. Nothing to download.
- **The six spots:** the Academy's pond bridge, the station's shore, the market's sea wall, the district's jetty and canal bridge, and the old fountain in the square (lost things only, which is the joke).

### 6.4 What keeps it going
- **Reading the water:** a glimmer's size and how it moves hint at what it is.
- **Bait:** a tart or a bag of chestnuts on the thread brings bigger and rarer things. So Sunny's kitchen and the chestnut wok feed the fishing.
- **The Harbour Book,** a new page in the Sprite Book: every fish with your record, every lost thing and whose it was, and a count of reminders sent home.
- **Uncle Ming,** the fisherman who already stands at the station, asks for one thing at a time ("a carp from the pond, longer than my forearm").
  - The first six requests are written, and each improves your thread: a longer cast, a calmer line, a lucky float.
  - After those, requests are drawn from a pattern without end.
- **Records:** sizes are random within a range, so there's always a bigger one.

### 6.5 How it's built
- **`src/systems/fishing.js`,** loaded after Begin, only for a save that has reached the Epilogue.
- **On screen:** the thread (the ribbon the Lullaby Thread uses), a float, a shadow under the water, ripples, a splash. Six draw calls at most.
- **Over it:** the beat ring the lantern game has, a bar for the thread, the catch card.
- **For tests:** the water's contents come from a seed, so a test can ask for a known catch.

## 7. Epilogue: Morning in Lantern Bay (`src/story/epilogue.js`)

1. **Dawn in the square.**
   - The Great Sulk shrinks under the blanket into thousands of tiny glowing sprites, which rise and stream north over the roofs and across the harbour.
     - One cloud of points in one draw call: 800, 2,000 or 4,000 by tier.
   - The sky goes from grey to gold. The fog thins.
   - Master Fang, looking at the folded blanket: *"Fifty years. And you did it before breakfast."*
2. **Walking back through the district.** You have control. Colour returns to the streets as you walk.
   - Lanterns relight in a wave ahead of you. Shutters go up. People open doors.
   - **Breakfast in the street:** the long table, the barber, the noodle auntie with "a small pot, in case", old Lau and a mahjong friend he hasn't seen in years.
   - Sit down and eat. Each neighbour has something to say, and more if you checked on them in Chapter 3.
3. **At the jetty.** A few little reminders bob in the water, too waterlogged to fly. Uncle Ming, off the first ferry in fifty years: *"Nobody's fished this jetty since I was a boy."*
   - He teaches thread fishing (§6): fish out three. Each reads its reminder aloud and flies home.
4. **Mistbloom, that morning.** Bright, with bunting.
   - **The cardigan:** Master Fang gives Pip one like hers, "with extra-deep pockets, for Grumblings and sweets". Pip wears it from here on (a second model of her, built from the same script).
   - **Sunny** declares a week-long party. **Captain Honk** gives a speech.
   - **Bo** lowers the puppet and gives one too, in his own voice: his first whole sentences in the game.
   - **Bean** climbs into her hood, curls up: *"Five more minutes."*
5. **THE END,** then the credits:
   - what you did: sprites befriended, memories restored, neighbours checked on, candies found
   - who made it
   - the fork-me link (prompt 0 asked for it on the loading and pause screens; the ending is the third place it belongs)
6. *"…but new Grumblings are always being born."* Free roam begins.
- **Flags:** `ep_dawn`, `ep_breakfast`, `ep_fishing`, `ep_cardigan`, `epilogueDone`.

## 8. Free-roam Lantern Bay

### 8.1 Every place, afterwards

| Place | After the Epilogue |
|---|---|
| Station | Daytime, as now. Uncle Ming and a fishing spot. The first-years' train (§8.5). A way down from the Academy, which doesn't exist today |
| Academy | A bright morning, bunting for Sunny's party week, the courtyard sprites playing tag again. The worry board at the gate. A bed in the dormitories. Fishing from the pond's bridge |
| Night market | Still night (it's a night market). The lanterns across the bay are lit again, and the cold fog from Chapter 2's ending is gone. Fishing from the sea wall |
| Quiet District | Full colour, a morning sky, every lantern lit, every shop open with someone in it, name boards no longer faded. The breakfast table stays. Fishing from the jetty and the canal bridge |
| The Old Quarter and the square | No fog. The long table stayed in the square. The Everyone Blanket hangs over it between the roofs: its patches are your progress (§8.6) |

- **Travel:** Bo at the gate and the ferryman offer every place. The Old Quarter is a walk from the Quiet District.
- **Signs, routes and "things to do here"** for everything added.

### 8.2 The worry board ("new Grumblings are always being born")
- **Where:** a board at the Academy's gate, and the same notes on the Quiet District's noticeboard. In Chapter 3 that board said "check on your neighbours". Now the neighbours pin their own notes to it.
- **Three worries at a time,** each a line, a place and a person: *"Mrs Lau's umbrella blew into the canal, and there's a little cloud raining on her step. (Quiet District)"*
  - Drawn from about 24 written patterns, across all the places and all the species.
  - Each is a real Grumbling at a set spot, soothed the way its species is. The person thanks you after.
- **A new day:** when all three are soothed, or when you go to bed at the dormitories. Bean has a "five more minutes" for every morning.
  - No real-world clock: a day is three worries.
- **Rewards:** the sprite, Cozy Energy, a patch.
- **The guide points** to the nearest of the day's worries.

### 8.3 The Sprite Book, to its end
- **Eleven entries:** today's seven, the Great Sulk, and three new species.
- **"Lantern Bay" page:** everything there is to finish, place by place: sprites, memories, neighbours, candies, lost things returned, fish, patches.
- **Complete all eleven:** a last small scene with Bean, and a gold border on the book.

### 8.4 Three new species (`creatures2.glb`, loaded after Begin)

| Species | Its feeling | How it acts up | How it's soothed | Its sprite's ability |
|---|---|---|---|---|
| First-Day Jitters | "What if nobody likes me?" | A wobbly knot of paper butterflies that loops round its person. It bolts when you hum at it from far off | It only settles while its person has company: walk them somewhere friendly, then hum | Brave: sighs don't slow you |
| Bottled-Up | "I never said it out loud." | A corked bottle with a note inside. It lives in the water and tugs the thread | Caught by fishing, and soothed by reeling without ever pulling hard | Float: things bite sooner |
| Unsent Letter | "I wrote it, but I never sent it." | An envelope that swoops like a paper plane, and reseals itself when you hum | Stitch it to the person it was written to | Deliver: a lost thing points to its owner |

- **Each is modelled** in the paper-craft style, 800 triangles at most, with a moving part (the wings, the cork, the flap).
- **The Great Sulk's entry** has no helper ability: *"Asleep under the Everyone Blanket. Its thousands of little reminders went home."*

### 8.5 Welcoming the first-years (`src/story/firstyears.js`)
- **When:** the first new day after the Epilogue. Sunny hands Pip a sign: "WELCOME NEW STUDENTS (definitely)".
- **At the station:** the train pulls in. Three first-years step off, each with a cardboard suitcase and a First-Day Jitters.
  - **Pip is the one with the sign now.** The scene mirrors the Prologue.
- **Soothe each one's Jitters** (§8.4: with company first), then walk all three up the hill. They follow in a line, the way the lost children do.
- **A short tour:** the pavilion (Master Fang, a lemon candy each), the kitchen (Sunny, tarts), the courtyard (tag).
- **The last beat:** on the pavilion bench, one first-year's Jitters falls asleep in her lap. Pip: *"You're a sorcerer. Also, you have butterflies on you."*
- **Afterwards** the three are students at the Academy, with things to say.

### 8.6 The Everyone Blanket, still growing
- **Patches come from** worries soothed, lost things returned, reminders sent home, and new entries in either book.
- **You can see it** from under it in the square, and count it on the "Lantern Bay" page.
- **It has no end:** past 400 patches it gains a new border.

## 9. Sound and music
- **Five new tracks** (`src/content/music.js`), all variations on the lullaby like the seven there are:

  | Track | Where | What it is |
  |---|---|---|
  | `fog` | the fogged district, the Old Quarter | the Quiet District's fragments, slower, with long gaps |
  | `bean` | the secret | the lullaby on one soft plucked voice, as if half remembered |
  | `sulk` | Chapter 5 | a low drone under the lullaby in a minor key. One voice joins for each phase |
  | `blanket` | phase 5 | the whole lullaby, every voice, in the major |
  | `morning` | the Epilogue and free roam | the Academy's daytime tune, brighter, with bells |

- **Fishing:** the place's own music, thinned out, with water close by.
- **New sounds:** the sigh (a long low breath with wind under it), a stitch, the thread snapping taut, the dinner bell, a float's plop, a splash, the reel, a train's whistle.
- **Mixes** for the fogged district, the square, the Domain and the morning, levelled against `next_7.md`'s target (−20 ± 2 LUFS, each place within 4 dB of the others).

## 10. Budgets

- **JS before Begin:**

  | | Now (`next_7.md`) | After | Limit |
  |---|---|---|---|
  | First visit (train) | 237.1 KB | 238.5 KB or less | 240 KB |
  | Returning, station | 244.9 KB | about +2 KB | 280 KB |
  | Returning, Academy | 260.5 KB | about +3 KB (the after-state, the worry board, where Chapter 4's cast stands) | 280 KB |
  | Returning, market | 249.5 KB | about +1 KB | 280 KB |
  | Returning, Quiet District | 252.5 KB | about +4 KB (three states) | 280 KB |
  | Returning, the new zone | | about 255 KB | 280 KB |

  - **In the main bundle:** the Domain and the fog's additions to the shaders, Bean on her shoulder, the save's new defaults, the hooks for Stitch. About 1 KB.
  - **After Begin:** the story scripts, Stitch, fishing, the worry board, the new species' text.

- **Models:**

  | Model | Now | After | Limit |
  |---|---|---|---|
  | `heart.glb` (new) | | 180 KB or less, 60k triangles | 200 KB |
  | `sulk.glb` (new) | | 60 KB or less, 5k triangles | 60 KB |
  | `creatures2.glb` (new, after Begin) | | 45 KB or less | 45 KB |
  | `xiaopei_cardigan.glb` (new, in place of `xiaopei.glb` after the Epilogue) | | 130 KB or less | 130 KB |
  | `creatures.glb` (Bean's eyes and ears) | 104.9 KB | 108 KB or less | 110 KB |
  | `anim_humanoid.glb` (three clips: a hug, a cast, sitting curled up) | 74.8 KB | about 83 KB | 85 KB (new) |
  | `quiet.glb` | 145.2 KB | about 155 KB | 200 KB |
  | `quiet_kit.glb` | 80.9 KB | about 110 KB | 150 KB |
  | `market_kit.glb` | 149.8 KB | untouched (it's at its limit) | 150 KB |

  - **First visit:** about +11 KB of models (`creatures.glb`, `anim_humanoid.glb`), on 544 of 700 KB.
  - **A returning player in the new zone:** about 1,040 KB of models, on a 1,250 KB limit.

- **Time to interaction:** the new zone at 3 s or less on the must-pass profile. The others within 0.1 s of `next_7.md`'s table.
- **Frame cost, low tier:** the new zone at 100 draw calls and 150k triangles or less at its busiest (phase 3, every sprite in the square, and phase 5).
- **If something doesn't fit,** I stop and show you the options, as before. I won't raise a limit quietly.

## 11. Tests and verification

- **New e2e tests** (the 63 there are must still pass; `chapter3-full`'s ending changes):

  | Area | Tests |
  |---|---|
  | The sigh and Bean | `fog-sigh` (in the open, behind a wall, in a warm spot, out of Calm), `bean-awake` (on her shoulder, the circle follows Calm) |
  | Stitch | `fog-stitch` (take, carry, stitch; it's still there after a reload; a sigh makes her drop it; with no Cozy Energy it still works) |
  | The zones | `routes-heart`, `signs-heart`, `floor-heart`, `quiet-fog` (pockets and lit windows hold; the wall opens only in Chapter 4), `quiet-after` |
  | Chapter 4 | `chapter4-full`: from a `ch3Done` save to `ch4Done`, reloading at three checkpoints |
  | Chapter 5 | `sulk-phase1` … `sulk-phase5` from their checkpoints, `chapter5-full`, `finale-bare` and `finale-full` (a bare save and a complete one both finish, and differ as §5.4 says), `domain-edge` (the kitchen inside, the street outside, in a screenshot's pixels) |
  | Epilogue | `epilogue-full` to `epilogueDone` and the credits |
  | Fishing | `fishing-catch`, `fishing-escape`, `fishing-lure`, `fishing-log`, `lost-return`, `fishing-touch` at both phone sizes |
  | Free roam | `freeroam-travel` (every place from every other), `worries-<zone>` (every spot on a floor and on a route), `worries-day`, `species-jitters`, `species-bottled`, `species-letter`, `book-complete`, `firstyears-full` |
  | Saves | `old-saves`: a save made by today's build in each zone loads, and a `ch3Done` one starts Chapter 4 |
  | Phones | `touch-hit-*` with the Stitch prompt, phase 2's replies at 150% text, the fishing bar and the catch card |

- **On the greybox first** (`?zone=test&fog`): the sigh, Bean's circle, Stitch and the Domain are tuned there before the zone exists, as the sparrows and the grey Grumblings were.
- **Blender review renders** of the Great Sulk, the kitchen set, the three species, the open shopfronts and Pip's cardigan before export.
- **Screenshots** at 390×844 and 1280×720, low and high tier: each stretch of the Old Quarter, each phase, the Domain's edge, the blanket, the district before and after.
- **The autoplayer:**
  - New rules for every new objective, and four new goals: shelter from a sigh, stitch, choose a reply, fish.
  - New starting points: `--from ch4`, `fog`, `heart`, `ch5`, `epilogue`, `free`.
  - **A new uncut recording, from a fresh game to THE END** (about 50 minutes), reviewed the same way: stalls, confusion, reading share, loudness by chapter, the camera shots' frames.
  - I expect a lower reading share than the 61% of Chapters 1–3: most of Chapter 4 is walking with Bean's bubbles.
- **`npm run budget`, `npm run perf`** (with the new zone), **`npm run cf:check`.**
- **Not measurable here:** frame rate on the spec's hardware, and whether the ending lands. The low tier's counts are the guard for the first, and you are the check for both.

## 12. Files

- **New:**
  - `src/story/chapter4.js`, `chapter5.js`, `epilogue.js`, `firstyears.js`
  - `src/world/zones/heart.js`
  - `src/systems/sigh.js`, `stitch.js`, `sulk.js`, `domain.js`, `fishing.js`, `worries.js`
  - `src/content/catches.js`, `worries.js`, `species2.js`
  - `src/procgen/quilt.js`, `fish.js`
  - `tools/blender/build_heart.py`, `build_sulk.py`, `build_creatures2.py`
  - `ai/next_8.md`, at the end
- **Changed:**
  - **Core:** `src/main.js`, `src/core/save.js`, `src/core/audio.js`, `index.html` (the preload map: the new zone, the cardigan)
  - **Rendering:** `src/render/materials.js`, `src/render/vfx.js`
  - **Actors and systems:** `src/actors/player.js`, `creatures.js`, `grumbling.js`, `src/systems/soothe.js`, `collection.js`, `greys.js`, `memories.js`, `wayfinder.js`, `cooking.js`
  - **Story and zones:** `src/story/chapter3.js`, `chapter1.js` (the gate's travel), `helpers.js`, every zone module (its after-state, worry spots, fishing spots)
  - **UI:** `src/ui/menus.js` (the Harbour Book, the "Lantern Bay" page, credits), `ui.js`, `ui.css`
  - **Content:** `src/content/music.js`, `species.js`
  - **Blender:** `build_quiet.py`, `build_creatures.py`, `build_anims.py`, `char_xiaopei.py`, `build_all.py`
  - **Tooling:** `tools/budget.mjs`, `tools/perf/load-test.mjs`, `tools/e2e/tests.mjs`, `tools/playtest/{playbook,goals,brain,eyes,play}`
  - **`README.md`:** Playing (the two chapters, Stitch, fishing, free roam), "This build", and under "Fork it": add a catch, add a worry.
- **No new dependencies.**

## 13. Order of work

Each milestone ends with the tests green and the budgets checked: a point where you can commit.

| # | Milestone | Ends with |
|---|---|---|
| M0 | Room and a baseline (§2) | the same game, measured |
| M1 | Chapter 4's pieces on the greybox: the sigh, Bean awake, Stitch, the deep fog. `creatures.glb` and `anim_humanoid.glb` rebuilt once | `fog-sigh`, `bean-awake`, `fog-stitch` |
| M2 | The new zone and the rebuilt Quiet District (§4) | `routes-heart`, `signs-heart`, `floor-heart`, the zone in `budget` and `perf` |
| M3 | Chapter 4, start to end | `chapter4-full`, `old-saves`. **A good place for you to play** |
| M4 | The Great Sulk, and phases 1 to 3 | `sulk-phase1` to `3` |
| M5 | The Domains, and phases 4 and 5 | `chapter5-full`, `finale-bare`, `finale-full` |
| M6 | Thread fishing, complete, on the greybox and at its six spots | the `fishing-*` tests |
| M7 | The Epilogue | `epilogue-full`. **The story is complete here** |
| M8 | Free roam: the after-states and travel, the worry board, the three species, the first-years, the two book pages | the free-roam tests |
| M9 | The mix, the autoplayer's recording and its review, fixes from it, the README, `next_8.md` | the recording, and everything in §11 |

- **Fishing comes before the Epilogue** because the Epilogue teaches it.
- **Each chapter's music comes with its chapter.** M9 levels all of it.

## 14. What I add to the story

The story document gives each chapter a paragraph or two. To make them playable I add these. Say if any should go.

- **The fog covers the whole district overnight,** and that is how Pip gets lost (the story says only that it "grows so thick").
- **Master Fang is away in Chapter 4,** "waking an old kitchen". It explains why she isn't there, and sets up her arrival in Chapter 5.
- **Sunny and Bo say "I'm fine, really" under the sigh.** The story gives the sigh that effect on "everyone who hears it".
- **The Old Quarter and its places** (the back garden, laundry alley, the arcade, the persimmon courtyard).
- **Loose ends and stitching** as what the thread's upgrade does in your hands.
- **Phase 2's replies.** The story has Bo's one line; the others are written to match it.
- **The guests at the table** are the people you were kind to.
- **The table stays in the square,** and the Everyone Blanket hangs over it.
- **Uncle Ming,** a name for the fisherman who is already at the station.
- **Three species:** First-Day Jitters, Bottled-Up, the Unsent Letter.
- **The first-years' scene** mirrors the Prologue. The story asks for the welcome, not its shape.

## 15. Open questions (defaults in bold; I'll go ahead with them unless you say otherwise)

1. **The mini-game:** **thread fishing (§6).** Or one of these:
   - **Sprite tag** in the Academy's courtyard, where the sprites already play it: you run, dodge and tag, in rounds that get faster. Smaller to build, and only at the Academy.
   - **A quilt puzzle:** fit patches into the Everyone Blanket, a block-fitting puzzle with no end. Suits a phone very well, but it's a flat panel, not in the world.
2. **How far in one go:** **all ten milestones, in order.** Or stop after M3 (Chapter 4) so you can play it before the finale is built on it.
3. **The additions in §14:** **all of them.**
4. **New species:** **three, for eleven entries.** Or none, and the book ends at eight with the Great Sulk.
5. **The cardigan:** **Pip wears it from the Epilogue on.** Or only in that scene.
6. **Fishing opens** **in the Epilogue.** Or as soon as Chapter 1's pond, without the reminders until the ending.
7. **A day in free roam** is **three worries, or going to bed.** No real-world clock.
8. **Dialogue:** as you decided for plan 7, nothing is trimmed. For the new chapters: **the big scenes are full dialogue (and can be skipped); everything said while walking is a bubble.**

## 16. Out of scope

- Committing and deploying (you do those)
- A map screen
- A day and night cycle in each place
- Gamepad rumble, voices, recorded music
- More than eleven species
- Frame rate measured on the spec's hardware (your phone is the check)
