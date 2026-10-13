# Playtest 9: the whole game, played like a person

Answers the "as you play, improve bits and pieces that are confusing" part of `ai/prompt_9.md`: what the
autoplayer's playthrough of the whole game (Prologue to free roam) found, what was fixed, and what wasn't. The
recordings and how they were made are in `ai/videos_9.md` and `ai/next_9.md`.

Every fix makes the game clearer or more forgiving: none makes it harder, and none skips anything (plan 9 §3.2).
Each has an end-to-end test that fails without it (`tools/e2e/tests9.mjs`, unless noted).

## 1. The run

The whole game, played from a fresh save to the autoplayer's own ending in free roam, recorded in four takes
(one save carried from each to the next), with keyboard and mouse only, at 1920×1080 and 60 fps. The takes
are in `tools/playtest/out/takes/` (git-ignored); the videos cut from them are in `ai/videos_9.md`.

| | Take 1 | Take 2 | Take 3 | Take 4 |
|---|---|---|---|---|
| Covers | Prologue, Chapters 1 and 2 | Chapter 3 | Chapter 4 | Chapter 5, the Epilogue, free roam |
| Video parts | Part 1 | Part 2 | Part 3 | Parts 4 and 5 |
| Length | 19:26 | 12:16 | 14:36 | 40:09 (23:21 + 16:48) |
| Reading dialogue | 52% | 73% | 43% | 45% |
| Free play | 42% | 20% | 54% | 43% |
| Picture (new frames a second: median, worst 1%) | 60, 56 | 60, 56 | 60, 56 | 60, 54 |
| Lost, stuck, checkpoints | 0 | 0 | 0 | one "nothing to do" between two cards (cut from the video; the autoplayer's mistake, fixed); one 45 s wander in the Old Quarter on the way to the square in free roam |
| The game's guide stepped in | 0 | 0 | 0 | once (Chapter 5's oven, fixed since: #5 in §3) |
| Out of Calm | 0 | 0 | 0 | 0 |
| Wrong Charm Sprite guesses | 0 | 1 | 0 | 0 |
| Camera twitches, per 5 min (target 1) | 4.6 | 2.2 | 0.7 | 8.6 |
| Walked into a wall, per 2 min (target 1) | 4.8 | 4.4 | 4.9 | 4.6 |
| Page errors | 0 | 0 | 0 | 0 |

**Why four takes, not five:** Take 4 was meant to stop at the "Lantern Bay" card that ends the Epilogue, but
its stop words were the card's subtitle, which the autoplayer doesn't keep, so it played on into free roam until
its own ending (the Everyone Blanket). That is what Part 5 was going to record anyway, from the same save, so
Part 5 is cut from the rest of Take 4.

**What it did on the way:** baked in Chapter 1 and the three-tier cake in Chapter 5, floated lanterns (but
roasted no chestnuts: it never stopped at the cart), restored all six memories in the Quiet District, soothed six
worries from the board in free roam, met the first-years' train and showed them round, caught a Fog Mullet off
the Quiet District's jetty, and gave a tart to someone who had skipped breakfast.

## 2. Bugs found and fixed

| # | Bug | Found by | Cause | Fix | Test |
|---|---|---|---|---|---|
| 1 | **Going back to a place a second time in one sitting, it had no walls, no jetty and no pier floors.** In free roam, Captain Honk's way to the Quiet District landed Pip on a ferry jetty that wasn't there: she sank, splashed, was put back, and sank again, every 2 s, for good. The story's ferry trips (Chapters 1, 4 and 5) go back to places too | The free-roam runs: 58 splashes in a row at the jetty | A loaded model is cached for the next visit, and the first visit took its `COL_` colliders out of it. The next visit built the place from what was left: the ground, and nothing else (576 of 8,608 collision triangles gone in the Quiet District) | Each visit builds from its own copy of the cached model (`src/world/zone.js`) | `zone-revisit-colliders` |
| 2 | **Sighs kept rolling up the street during Bean's secret**, the golden memory you walk with: four in 45 s, each sending you off to shelter and away from the memory | Chapter 4 runs | `Sighs.enabled` didn't check whether a memory was playing, although the code meant none to come then | No sighs while a memory plays | `ch4-memory-quiet` |
| 3 | **A blank objective in Chapter 5**, between the kitchen scene and lighting the stove, for as long as the stove stayed unlit | A Chapter 5 run: "(no objective)" for 12 s, then lost | Phase 4's half-way state (`ch5_kitchen` 0.5) was used as an index into the list of objectives | Rounded down | `ch5-kitchen-objective` |
| 4 | **The fingerpost at the foot of the Arcade pointed "Persimmon Courtyard" back down the street** | Chapter 4 runs: it followed the arm and walked away from the courtyard | A fingerpost's arm points at the nearest point of the route to the place, and here that was behind the post | An arm points along the route from where the post stands on it (`signsFor`) | `ch4-landmarks` |

## 3. Made clearer, or more forgiving

| # | What confused a player | What the runs showed | Now | Test |
|---|---|---|---|---|
| 1 | Chapter 4: "Bean wants to show you something: **north**, up the Arcade". There's no compass on screen | It looked round for 50 s, then the game's guide stepped in (58 m) | "…up the Arcade, toward the **Persimmon Courtyard**", the name on the fingerpost at the foot of the Arcade. The sigh tip says what you see and hear (Bean's ears go up, the screen's edge greys), not where a sigh comes from | `ch4-landmarks` |
| 2 | Chapter 4: "Find a way back to Sunny and Bo", lost in the Old Quarter. The objective names no way, and there's only one | 153–177 s in all five runs, the guide in one | "…: **through Laundry Alley**" (signposted at the garden's way out), then in the Pump Yard "…: **along Lantern-makers' Row**" (the next board) | `ch4-wayback-landmark` |
| 3 | Epilogue: "Walk back through the Quiet District". Chapter 4 drops you into the Old Quarter through the fog, so you never saw its way out, and no sign named it | The guide stepped in (21 m); the autoplayer took the Persimmon Courtyard's gate for it | A "To the Quiet District" board at the gateway, and that arm on both fingerposts | `signs-heart` |
| 4 | Chapter 5: "Check on Bo" / "Check on Sunny" (a friend who sat down in the fog, 43 m away) and "Stand by Bo while Captain Honk listens" (Bo walks off across the square into the fog) | 40 s of looking before the guide showed | The guide shows at once for these (`objective(…, { now: true })`) | `ch5-checkon-guide`, `ch5-bo-guide` |
| 5 | Chapter 5: "There's an oven, look, over there!", and the camera came back facing away from it (148°), with the fog closing in and Sunny walking off into it | The guide stepped in after 40 s (the Part 4 take, and a development run) | She looks where Sunny points, and the guide shows at once | `ch5-oven-guide` |
| 6 | Chapter 5: after the kitchen scene you could be facing away from the kitchen, and the stove isn't visible through the fog from the lantern posts | The guide stepped in (36 m) | She faces the kitchen when the scene hands back | `ch5-kitchen-facing` |
| 7 | Chapter 4: in the Arcade a sigh comes every ~9 s | Out of Calm in the Arcade in two of six runs (three times in one, carrying a thread back); getting up sends you back to the last warm spot | Every ~11 s: still one sigh per doorway, with time to reach it | (timing) |
| 8 | Free roam: the worry "a little pom-pom is hanging about **the alley**". No sign says alley | It searched round the jetty for a minute | "…the alley **by the Thread Shop**" (whose board is at the alley's end) | (text) |

## 4. What the autoplayer got wrong (not the game)

Most of the playtest's time went here: a stall is only a finding about the game once the autoplayer is ruled out.
The fixes are in `tools/playtest` (none in the game):
- **The pier at the night market** (Chapter 2) stalled every run. The sparrows sit on a perch at the very end,
  which its eyes took for a wall across the pier; with the exact spot walled off, the route went round the end
  of the pier over the water. Routes now end anywhere within a metre of where it's going. (Before that: the eyes
  didn't see water over the pier's low railing, and the "Lantern Pier" sign's post closed the pier's entrance on
  its map.)
- **Places it had been told about but couldn't see:** "up the lane" is onward, away from the jetty; a fingerpost's
  arm is followed onward, not taken for the place; a landmark it was told to pass that it can't reach is given up
  after 6 s.
- **Walking:** ledges a step high, sidestepping into corners, a straight line into the pond (18 splashes in a
  row), hurrying to shelter when a sigh is close, remembering which spots sheltered it.
- **People:** talking to the wrong one of two people side by side, accepting the ferryman's offer to go home,
  finding someone by how they look before it knows their name.
- **Up and down:** its map of a place is flat, so a platform and the track bed beside it, or a bridge's deck and
  the water under it, are the same squares to it. Free roam's "cloud over the platform bench" at the station
  had it on the grass below the platform's edge, then off the platform's far side onto the track (it now goes
  up the steps first, and sees a step down it couldn't climb back up). Coming at the pond bridge's fishing spot
  from the side, it waded underneath instead of walking onto the deck. Neither is in the recorded takes.
- **How it looked on video:** camera twitches came from small corrections back and forth (a turn back the other
  way within 1.2 s now waits) and from a steering point that flipped from side to side in tight spots (it's now
  held for a second).

## 5. Suggestions (not done)

| # | Suggestion | Why (what the runs showed) | Effort |
|---|---|---|---|
| 1 | **Fewer sighs while you carry a thread** in Chapter 4, or a longer warning | Chapter 4 had 21 sighs in 15 minutes; a sigh that catches you makes the thread slip, and Thread Street is narrow and cluttered | Small |
| 2 | **Every worry note names a signed landmark** | Notes say "the alley", "the platform bench", "the laundry yard": fine when there's a sign, a search when there isn't (#7 above was one) | Small |
| 3 | **A test that travels everywhere twice** | The revisit bug (#1 above) only shows on a second visit, which only free roam does a lot of | Small |
| 4 | **The fishing spot by the pond bridge** is at the edge of deep water | Two of the last three free-roam runs fell in twice on the way to it (the game's tip then says to take the bridge) | Small (Blender) |

## 6. What this playtest can't tell

- **Touch and gamepad:** the autoplayer uses a keyboard and mouse.
- **Frame rate on the spec's hardware:** the recordings ran on a desktop GPU.
- **Whether it's moving or funny:** that needs people.
