# Next 5: what was built for plan 5, and what comes next

Summary of the implementation of `ai/plan_5.md` (answering `ai/prompt_5.md`), with every open question on its
default:
- the names in the plan's table
- the story document renamed too
- 1280×720, 30 fps, with sound, at the game's automatic quality
- a final recording after the fixes
- keyboard and mouse for the autoplayer
- bugs (and bug-like friction) fixed, design suggestions only written down

The playtest findings and suggestions are in `ai/playtest_5.md`.

## What was built

### M1: Stuck in the ground after the lesson (the prompt's issue)
- **The cause** (reproduced in headless Chrome before the fix):
  - After the lesson Pip stood up at the seat marker's height, which is ground level, inside the pavilion's 0.45 m platform.
  - The capsule push-out then pushed her further down, because it only looks at the ends of the capsule's centre line.
  - The platform's walls held her in from the inside.
  - The end of Chapter 3 (Master Fang's story, same bench) had the same bug.
- **The fix:**
  - `Player.teleport()` and `stand()` land on the floor under the point (`Collision.floorY`); sitting keeps its exact pose.
  - `collideCapsule` pushes a capsule up when its centre line passes through a floor.
  - NPCs are placed with `NPC.place()`, on the floor, using the zone's own collision (it may still be loading).
- **A dev-only floor check** (`src/dev/floorcheck.js`, not in production builds): twice a second it warns `[floor]` if Pip or a standing NPC is inside a floor, and the e2e harness fails on it. It found:
  - Master Fang's feet in the pavilion steps
  - two sleepy sprites buried in a dorm's porch
  - Bo standing inside the overlook bench at the end of Chapter 1 (he now sits on it)
  - Chapter 3's cast placed against the previous zone's collision
- **Front steps you couldn't walk up** (found by the new `lesson-stand` test, which walks up to the lesson):
  - `build_kit.py`'s `base_platform` tilted the collision ramp the wrong way. That made a knee-high wall at the foot of the steps of the pavilion, every hall (the kitchen too), the library and the pagoda. You had to jump.
  - Fixed in `build_kit.py`. Blender wasn't running, so the exported `kit.glb` was patched to match: each ramp box mirrored through its centre, winding flipped back.
  - Only `kit.glb` changed: 293.9 → 294.4 KB.
- **Tests** (all new):
  - `lesson-stand`, `story-stand`, `floor-pushout`
  - `steps-academy`: every building with steps
  - `floor-*`: 7 zones and story states
  - `chapter1-full` and `chapter3-full` now walk after each scene

### M2: Names that are easy to say in English
- **The new names:** Xiao Pei → **Pip**, Lin Tangtang → **Sunny Lin**, Wei Bao → **Bo**, Doudou → **Bean**, Qiuyue → **Autumn** (Master Fang's given name), Little Bo → **Little Sam**.
- **Only the display names changed:** 178 replacements across the game text, comments, the README, `ai/snuggle_sorcery_story.md`, the Blender scripts' docstrings and the tests.
- **Ids, model files and saves are unchanged** (`xiaopei`, `tangtang`, `weibao`, `doudou`, `fang`), so existing saves work.
- **README:** a new "Characters" section: name, who, technique, id and script.

### M3: The autoplayer (`tools/playtest/`, `npm run playtest`)
- **What it can see:**
  - `eyes.js` is the only part that touches the game. It reports what's on screen:
    - the UI
    - things in view, not behind walls and big enough to notice, each described by how it looks, never by id
    - distance to walls across the view, and where there's water or a drop ahead
    - its own movement, the camera, and the lullaby's beat
  - It never reports story flags, markers, triggers or anything out of sight.
- **How it acts:** `hands.js` uses real keyboard and mouse input. The camera turns with a right-button drag.
- **How it decides:**
  - `brain.js` runs the loop and holds the memory: names learned from dialogue, places seen, directions heard, wrong guesses.
  - It reads dialogue at 20 characters a second and answers choices.
  - It handles menus and mini-games (cooking, chestnuts, lanterns) and sitting with a flock (asking Bo which free thing they love, with a snack first for a team-up).
  - A watchdog (stuck, confused, and the in-game "Stuck? Back to last checkpoint") keeps it moving.
  - `playbook.js` turns each objective and tip into a goal (`goals.js`).
- **How it finds its way:** `nav.js` builds a map from what it has seen and bumped into (walls, water, drops), runs A* over it, and steers locally along the clearest direction.
- **Like a player, it:**
  - looks round in a new place
  - follows directions given in dialogue ("through the moon gate")
  - asks whoever is at a place when it doesn't know a name yet
  - walks round a place when nothing happens
  - learns from a splash
  - picks up candies (jumping for high ones)
  - tries interesting prompts once
  - reads the Sprite Book to reason which Charm Sprite remembers a clue
- **A start-up check fails the run** if the decision code ever reaches into the game.
- **Development saves:** `--from station|ch1|lesson|ch2|market|ch3|quiet|dusk`. The recorded run always starts fresh.

### M4: The recording (`--record`)
- **The picture:** Chrome's screencast, the latest frame written at a steady 30 fps into ffmpeg (H.264, CRF 24).
- **The sound:**
  - Captured inside the page: `AudioNode.connect` is wrapped so whatever goes to the speakers also goes to a `MediaStreamAudioDestinationNode`, which `MediaRecorder` streams to Node.
  - A checkpoint reload makes a new audio context, so each segment is its own file, mixed in at its offset.
  - Chrome runs with `--mute-audio`.
- **Headless on the GPU** (`--use-angle=vulkan`, the RTX 3060).
- **In the MP4:** chapter markers from the chapter cards, and the thoughts as a subtitle track (off by default).
- **Retries:** a failed run starts again from scratch, and the file lands in the output folder only when a run is complete.
- **Review without watching** (`review.mjs`):
  - contact sheets
  - frames at every logged event
  - ffmpeg's freeze, black, silence and loudness measurements, per chapter, with and without dialogue

### M5: What the runs found (all fixed, each with a test where one fits)
- **Keyboard players scared the shy Grumblings.** A keyboard has no walk key (holding W is a 3.2 m/s run), and sparrows and grey Grumblings startled at anything over 2.6 m/s. Now only sprinting does (`Player.rushing`). Test: `shy-walk`.
- **Esc couldn't close the pause menu**, and closing the last menu with a key threw an error in `Menus.update`. Test: `menus-keyboard`.
- **At the station, Sunny stopped at the top of the path without a word.** She now says the Academy is just ahead, and the objective changes.
- **"Meet everyone at the dumpling stall" only triggered in front of the stall.** The radius is now 4.2 m, which includes its sides.

### M6: The final recording
- **The file:** `tools/playtest/out/2026-09-30-16-34/playthrough.mp4` (201 MB, git-ignored).
- **Clean:** a fresh game to the "coming soon" card in 24:01, with no stalls, no checkpoints and no page errors.
- **Kept alongside:**
  - the first recording (`tools/playtest/out/2026-09-30-15-34/`, 28:04, two checkpoints from the autoplayer's own mistakes)
  - each folder's `summary.md`, `log.jsonl`, `thoughts.srt` and review

## Measured

**The final recording:**

| | |
|---|---|
| Length | 24:01, one file, 1280×720, 30 fps, with sound |
| Chapters | Prologue 2:58, Chapter 1 6:31, Chapter 2 4:48, Chapter 3 9:30 |
| Time spent | Reading dialogue 61% (210 lines), free play 32%, cutscenes 5%, sitting and mini-games 2% |
| Checkpoints | 0, and 0 stuck or confused (first recording: 2) |
| Page errors | 0 |
| Loudness | −27.7 LUFS integrated, 22 LU range, true peak −5.5 dBFS; 2–6 dB quieter under dialogue |

**Load size** (`npm run budget`, before Begin):
- **First-visit JS:** 238.3 of 240 KB (+0.2 KB: the floor lookup, the push-up, `NPC.place`).
- **Models:** `kit.glb` +0.5 KB.
- Every zone is within budget.

**Time to interaction** (`npm run perf`, median of 5, must-pass profile):

| Zone | Time |
|---|---|
| Train | 1.53 s |
| Station | 1.84 s |
| Academy | 2.19 s |
| Market | 1.73 s |
| Quiet District | 1.74 s |
| Repeat visit (service worker) | 0.65 s |

All unchanged.

**Tests:** `npm run e2e`, all 40 pass. That's the 27 from before plus `lesson-stand`, `story-stand`, `shy-walk`, `menus-keyboard`, `steps-academy`, `floor-pushout` and 7 `floor-*`.

## Deviations from the plan (and why)
- **Most bugs were fixed before the first full recording.** The autoplayer found them chapter by chapter while it was being built, so the "before" recording already includes those fixes.
  - The first full recording is kept as the "before".
  - Its two checkpoints were the autoplayer's own mistakes (fixed).
  - The evidence for the earlier bugs is in the development runs' logs and frames, and in the tests.
- **No hand-played first look through the Playwright MCP.** The autoplayer's frames (a screenshot every few seconds while developing) did that job.
- **The eyes are a little more generous than "pixels only".** They report walls ahead and water as distances, and the lullaby's beat as a phase: what a player sees and hears. This is documented in `eyes.js`.
- **`kit.glb` was patched with a script, not re-exported from Blender** (Blender wasn't running). `build_kit.py` has the fix, so the next Blender export gives the same collision.
- **Suggestions are ranked in `ai/playtest_5.md`,** not listed here.

## Known issues / limitations
- **The autoplayer is built for this story.** A new chapter needs its objectives in `playbook.js` (usually one line each) and any new mechanic as a goal.
- **Recording needs ffmpeg and a GPU Chrome** to be smooth. With `--swiftshader` it plays at ~15 fps.
- **The recording is ~1 GB an hour at CRF 24.** The 28-minute run is 238 MB.
- **Still unmeasured:** fps on the spec's target hardware, and your iPhone retest. Deploying (`npm run deploy`) makes both easy.
- **`market_kit.glb` is at 149.8 of 150 KB, and first-visit JS at 238.3 of 240 KB.**

## What to work on next (suggested order)
1. **Watch the recording** (the subtitles show what the autoplayer was thinking), and pick from the suggestions in `ai/playtest_5.md`. My top three:
   - less reading and more doing
   - give soothing some stakes
   - make "Everyone Together" a boost instead of an instant win
2. **Deploy** and play on your phone (the plan 2 retest, and the sound levels: the recording measured −28 LUFS, which is quiet).
3. **Chapter 4: Bean's Secret.** Add its objectives to the autoplayer's playbook as you go, so every chapter gets an uncut playthrough.
4. **Budget headroom** (from `next_4.md`): move the Sprite Book, the bug report UI and the cooking mini-game into lazy chunks.
