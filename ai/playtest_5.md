# Playtest 5: a new player's playthrough

Answers the "Gameplay" part of `ai/prompt_5.md`: the autoplayer's run, the bugs it found (all fixed), and
suggestions to make the game more fun. The autoplayer and the recording are described in `ai/next_5.md` and
in the README ("Autoplayer").

## 1. The run

Each recorded run goes from the loading screen to the "Chapter 4: Bean's Secret — coming soon" card, uncut, in
real time, with keyboard and mouse only. Both recordings are git-ignored:
- **The final recording:** `tools/playtest/out/2026-09-30-16-34/playthrough.mp4` (201 MB).
- **The first one** ("before"): `tools/playtest/out/2026-09-30-15-34/playthrough.mp4` (238 MB).

Each folder also has:
- `summary.md` and `log.jsonl`: what it did and thought, second by second
- `thoughts.srt`: the thoughts, also in the MP4 as a subtitle track, off by default
- `review.md` and `review/`: contact sheets, frames at every logged event, and the sound and picture checks

| | First recording | Final recording |
|---|---|---|
| Length | 28:04 | 24:01 |
| Prologue (train and station) | 2:52 | 2:58 |
| Chapter 1 (Mistbloom Academy) | 6:03 | 6:31 |
| Chapter 2 (the night market) | 7:12 | 4:48 |
| Chapter 3 (the Quiet District) | 11:42 | 9:30 |
| Reading dialogue | 55% (14:30, 214 lines, 14,000 characters) | 61% (14:17, 210 lines, 13,800 characters) |
| Free play | 38% | 32% |
| Cutscenes, mini-games, sitting | 7% | 7% |
| Out of Calm | 0 | 0 |
| Checkpoints used | 2, both the autoplayer's fault (fixed; see §4) | 0 |
| Wrong Charm Sprite guesses | 1 (the kitchen door: it tried the Lost Sock first) | 1 (the kitchen door again) |
| Page errors | 0 | 0 |

**What it did on the way:**
- It talked to 14–18 people it walked past.
- It read a note (and was told it needed the Homework's Read), and floated lanterns. In the first run it also
  roasted chestnuts.
- It baked twice perfectly and once well, and picked up 3 lemon candies (of 10).
- It never guided a lost child home, watered the lotus buds or tucked in a sleepy sprite: each needs a helper
  equipped in the Sprite Book, and it never did that.
- The three sparrow flocks took 20–45 s each.

**Sound** (`review.mjs`: ffmpeg's loudness measurement of the final recording, at the game's default volume):
- **Quiet overall:** −27.7 LUFS integrated, where games and videos usually sit around −16 to −20. The loudness
  range is wide (22 LU), and the true peak is −5.5 dBFS (no clipping).
- **By chapter** (mean level): the train −28 dB, the Academy −38 dB, the market −34 dB, the Quiet District −37 dB.
- **Ducking works:** each place is 2–6 dB quieter while someone talks.
- **No dead air:** never silent for 8 s or more, the picture never stood still for 20 s, and no black stretches.
- **Sync:** sound and picture share one clock (both timed from the first frame). The two dialogue blips loud
  enough to find start within about 0.1 s of the logged key press. Most blips are too quiet under the music to
  measure, so that's a spot check, not a proof.

## 2. Bugs found and fixed

| # | Bug | Found by | Cause | Fix | Test |
|---|---|---|---|---|---|
| 1 | **After the first lesson Pip was stuck in the ground** (the prompt's issue), and after Master Fang's story in Chapter 3 | Reproduced by hand, then the autoplayer | She stood up at the seat marker's height (ground level), inside the pavilion's 0.45 m stone platform. The collision pushed a capsule whose feet were under a floor further down, and the platform's walls held her in | Standing up and teleports land on the floor; a floor the capsule's centre line passes through pushes up | `lesson-stand`, `story-stand`, `floor-pushout` |
| 2 | **You couldn't walk up any front steps**: the pavilion, every hall (the kitchen too), the library, the pagoda | The `lesson-stand` test, walking up to the lesson | The steps' collision ramps in `build_kit.py` (`base_platform`) tilted the wrong way: a knee-high wall at the foot of the steps. You had to jump | Ramp tilt fixed in `build_kit.py`; the exported `kit.glb` patched to match (Blender wasn't running) | `steps-academy` |
| 3 | **People and props inside the floor or furniture**: Master Fang's feet in the pavilion steps; two of the three sleepy sprites buried in a dorm's porch (only a sliver showed); Bo standing inside the overlook bench at the end of Chapter 1; in Chapter 3, Master Fang placed against the previous zone's collision | A new dev-only floor check (`src/dev/floorcheck.js`) and an audit of every zone | Story and zone placements used marker heights as they were (ground level) | NPCs are placed on the floor (`NPC.place`), with the zone's own collision; the sleepy sprites sit on the porch; Bo sits on the bench | `floor-*` (7 zones and story states) |
| 4 | **Sparrows scattered and grey Grumblings slid away from keyboard players** walking up gently, as the tips ask | Writing the autoplayer: a keyboard has no walk key | Anything over 2.6 m/s startled them, and holding W is a 3.2 m/s run | Only sprinting startles them (`Player.rushing`) | `shy-walk` |
| 5 | **Esc couldn't close the pause menu**, and closing any last menu with a key (Tab for the Sprite Book) threw an error | The autoplayer, closing the Sprite Book with Tab | The main loop consumed Esc before the menu saw it; `Menus.update` read the menu stack after it was emptied | Esc goes to the open menu; `update` stops when the last menu closed | `menus-keyboard` |
| 6 | **At the station, Sunny stops at the top of the path** while the objective still says to follow her | The autoplayer stood beside her, waiting | Nothing happened at the end of her path | She says the Academy is just ahead, and the objective becomes "Walk up the hill to Mistbloom Academy" | (in the full run) |
| 7 | **"Meet everyone at the dumpling stall" only triggered in front of the stall** | The autoplayer arrived at its side, and nothing happened | A 3.2 m radius around a spot in front of the stall | 4.2 m, which includes its sides | (in the full run) |

## 3. Friction (not bugs)

- **Finding your way.** Directions are said once in dialogue ("through the moon gate to the south-west",
  "across the little bridge to the east"), and the objective line doesn't repeat them. The autoplayer only
  managed because it remembered them.
- **The pond.** On the way to the library it's easy to slip into the pond at the rim stones. The autoplayer
  splashed back twice in its practice runs. The splash tip ("Maybe the lotus buds could help you cross") points
  to a puzzle that needs a helper you probably haven't equipped, not to the bridge.
- **The stairs home from the market** are tucked between shopfronts at the far end. From the harbour wall,
  where Chapter 2 ends, you can't see them. The autoplayer only found them because it had looked round on
  arrival.
- **Helpers.** Equipping a Charm Sprite is only in the Sprite Book. The lost children, the notes, the lotus buds
  and the hidden candies all quietly need one, and the autoplayer never equipped any. A player who doesn't read
  every toast won't either.
- **Keyboard movement.** Holding W always runs. Precise movement (lining up with a stool, staying close to a
  grey Grumbling) means tapping.
- **Two camera shots miss their subject** (from the recording's frames):
  - In the first lesson, Pip is at the very edge of the frame.
  - At the end of Chapter 3, "Bean is awake again, very quiet, looking at Master Fang" is shot from outside the
    pavilion, where Bean (in Pip's hood, on the back bench) can't be seen. A close shot of Pip would carry that
    moment.

## 4. What the autoplayer got wrong (not the game)

Both checkpoints in the first recording were the autoplayer's own mistakes, fixed before the final recording:
- **The market stairs:** it looked round on arriving at the market while the arrival cutscene still held the
  camera, so it never saw the stairs behind it.
- **The grey Grumbling:** one grey had already warmed up to Pip during the memory scenes; the autoplayer then
  hummed at the *nearest* grey (not that one), which refused. Now it goes to the warm one.

## 5. Suggestions to make it more fun

Ranked by how much I think each would help, with a rough effort. Nothing here is built; each is a proposal.

| # | Suggestion | Why (what the run showed) | Effort | Load cost |
|---|---|---|---|---|
| 1 | **Less reading, more doing.** Merge short consecutive lines. Let friends' comments play as bubbles while you keep moving (after a flock, after a memory, "Did you know…"). Add a text-speed setting and "skip scene" for replays | 55–61% of a first playthrough is reading, even at a brisk 20 characters a second: 13,800 characters in a 24-minute run | Medium | ~0 |
| 2 | **Give soothing some stakes.** Later Grumblings could get a second tantrum phase. A streak of ♪ Perfect notes could earn a visible flourish that calms faster. Show what each tantrum means before it lands | Calm never ran out in any run; every Grumbling was soothed on the first try, in 10–40 s | Medium | Small |
| 3 | **Make "Everyone Together" a big boost, not an instant win** (e.g. triple speed for five seconds, and every sparrow shows its favourite) | With a snack and 20 Cozy Energy, a whole flock is soothed at once (`g.wrap(1)`), so the chapter's idea, finding the free good thing each sparrow loves, never has to be worked out. The three flocks took 20–45 s each, most of it walking there | Small | 0 |
| 4 | **Give Cozy Energy a purpose.** It caps at 100, and its only use is Bo's Echo Friend (20). Let it charge something that matters: the Lullaby Thread upgrade Chapter 4 promises, a Domain of Comfort meter, decorations for a dorm room, treats to share | By Chapter 3 the bar sits full, so kind acts stop counting | Medium | Small |
| 5 | **Say where optional things are.** A "Things to do here" list in the pause menu (chestnuts, lanterns, lost children, candies found 3/10). When you're at something a helper could solve, offer to equip it there ("Equip the Soggy Cloud to water these?") | The autoplayer, curious by design, still missed the lost children, the lotus buds and the sleepy sprites, and read notes it couldn't read | Small–medium | ~1 KB |
| 6 | **Help with directions after a while.** After ~45 s without progress on an objective, the equipped sprite could fly a few metres the right way (the Sparrow's Guide already does this for lost children), or the objective chip could show the direction from the dialogue | Directions are said once, then gone; the market stairs are out of sight | Small | ~0.5 KB |
| 7 | **The pond and the stairs home.** Rim stones that you can't slip between where the path goes round the pond, and a splash tip that mentions the bridge first. A lit sign or lanterns at the stairs home, or the friends walking you there | Both cost the autoplayer minutes; both are level details | Small (Blender) | 0 |
| 8 | **Mix up the memory scenes.** All six follow the same pattern: glow, clue, pick a sprite, scene. The red-thread memory could be a short walk following the thread, and the teahouse could have you pull the chairs out | Chapter 3 is the longest chapter (9.5–12 min), and most of it is this loop | Medium | Small |
| 9 | **Louder, and a tighter mix.** Raise the master level by 6–8 dB, with a gentle compressor on the music bus | −27.7 LUFS is quiet next to other games and videos; the Academy averages −38 dB | Small | 0 |
| 10 | **Friends who react.** Sunny and Bo follow you in the market and the district but only talk in scripted moments; a few context lines (seeing a grey, a candy, falling in the pond) would make them feel present | Talking to them repeats three lines each | Small | ~1 KB |
| 11 | **A walk key** (hold Ctrl or Alt), shown in the Controls table | Holding W always runs | Small | ~0 |

**What works well** (keep): the train tutorial teaches noticing, humming and dodging in under a minute; the
memory scenes with golden figures are the most striking moments in the game; keeping a grey company (sit on a
bench, wait) reads clearly once you've been told; baking and roasting chestnuts are quick and cheerful; every
chapter introduces one new idea.

## 6. What this playtest can't tell

- **Touch and gamepad:** the autoplayer only uses keyboard and mouse.
- **Frame rate on the spec's hardware:** the recording ran on an RTX 3060.
- **Readability on a phone:** the recording is 1280×720.
- **Whether it's moving or funny:** that needs people. The measurements above (dialogue share, times, loudness)
  are a starting point for that playtest, not a replacement.
