# Plan 5: Unstuck after the lesson, names that are easy to say, and a new player's playthrough

Answers `ai/prompt_5.md`. Builds on `ai/next_4.md`.

## 0. Short answer

- **Xiao Pei stuck in the ground after the lesson (M1, §1): it's a bug, not part of the story.** I reproduced it in headless Chrome.
  - After the lesson, the script stands her up at the height of the seat's marker. That marker is at ground level, but the pavilion floor is 0.45 m higher.
  - So she lands inside the pavilion's stone platform, sunk to the waist. Its walls hold her in from the inside, and jumping doesn't help.
  - Chapter 3's ending (Master Fang's story on the same bench) uses the same line, so it has the same bug.
  - **The fix:**
    - Standing up and teleports land on the floor under the point.
    - The collision lifts a character whose feet are under a floor, instead of pushing her further down.
    - A dev-only check reports any placement that isn't on the floor. Run on every zone, it already found three more misplaced spots (§1.4).
- **Names (M2, §2):** display names that read the way they sound. I propose:
  - Xiao Pei → **Pip**
  - Lin Tangtang → **Sunny Lin**
  - Wei Bao → **Bo**
  - Doudou → **Bean**
  - Master Fang stays; her given name Qiuyue → **Autumn**

  Internal ids stay the same, so saves, models and tests keep working. The names are your call (§11, question 1).
- **A new player's playthrough (M3–M6, §3–§6):**
  - **M3, an autoplayer** (`npm run playtest`):
    - It plays in real time with real keyboard and mouse input.
    - It decides only from what is on screen: the objective, the dialogue, the prompts, and what it can see in the 3D view.
    - No teleports, no story flags, no calling game functions.
    - It logs what it was thinking and where it got confused.
  - **M4, one uncut video** from the loading screen to the "Chapter 4 … coming soon" card:
    - It includes the game's sound, chapter markers and the autoplayer's thoughts as a subtitle track.
    - It renders on this PC's RTX 3060. I checked that headless Chrome can use it.
  - **M5, review and fixes:**
    - I go through the log and frames pulled from the video, and fix the bugs I find, each with a test.
    - I write `ai/playtest_5.md`, with a friction log and suggestions for making the game more fun. Suggestions are only written down.
  - **M6:** the recording again, after the fixes.

## 1. M1: Stuck in the ground after the lesson

### 1.1 What goes wrong
- **The line** is `src/story/chapter1.js:174`: `p.stand(seat.position.clone().add(new Vector3(0, 0, 1.6)))`.
- **`POINT_lessonseat` is at ground level.**
  - `build_zones.py:474` puts it at height 0 with `seat=0.89`, which is the pavilion's 0.45 m platform plus the 0.44 m bench.
  - Sitting down adds the seat height, so the lesson looks right.
  - Standing up doesn't: `stand(pos)` teleports to `pos` exactly as given, at y 0.
- **She lands 0.45 m below the pavilion floor**, inside the platform's collision box (`base_platform`, 4.6 × 4.6 × 0.45 m).
- **Why the collision doesn't push her out** (`world/collision.js:139`):
  - The push-out uses the closest points between the capsule's centre line and each triangle.
  - three-mesh-bvh's `closestPointToSegment` only tests the line's two ends and the triangle's edges. It never notices that the line passes right through the floor.
  - With her feet under the floor, the closest point on the floor's top face is above her lowest point, so the floor pushes her *down*.
  - Meanwhile the terrain at y 0 holds her up, and the platform's side walls push her back in from the inside.
  - So she walks around inside the platform, sunk to the waist.
- **Reproduced** in headless Chrome with a save at the Academy after the welcome: walk to the pavilion, skip through the lesson.

  | Check | Result |
  |---|---|
  | Right after the lesson | Her feet are at y 0.00, the floor under her is at 0.45, and the game thinks she's on the ground |
  | Hold W for 2 s | She stops at z −11.94: the platform's inside wall (−11.7, less her 0.24 m radius) |
  | Hold S, A, D | Same, trapped |
  | Jump | She lands back at y 0 |
  | Screenshot | Sunk to the waist in the pavilion floor |

  The repro scripts are in the session scratchpad, not the repo.
- **Why no test caught it:** `chapter1-full` teleports her straight to the next mission after the lesson, so she never tries to walk off. That is also the case for M3: a player who never teleports.
- **The same bug in Chapter 3:** `chapter3.js:433`, at the end of Master Fang's story, uses the same line on the same bench. I found this by reading the code; M1's tests cover it.

### 1.2 The fix
- **Standing up and teleports land on the floor** (`actors/player.js`).
  - `teleport()` casts a ray down from 1 m above the point. That's lower than her height, so it never hits a roof.
  - She's put on the first floor it finds between 1 m above and 0.3 m below the point.
  - `stand()` without a position already steps 0.35 m in front of the seat, and now lands on the floor too.
  - The lesson and Chapter 3 keep their spot (1.6 m in front of the bench, facing Master Fang). It's now on the pavilion floor.
- **A floor pushes up, not down** (`world/collision.js`).
  - Only when the capsule's centre line really passes through an up-facing triangle: the capsule is pushed up to stand on it.
  - Elsewhere the push-out is unchanged, with one extra line-against-triangle test per touching triangle.
  - Any future "feet under the floor" (a script, a very long frame, a bad marker) fixes itself in one frame.
- **Characters and props placed by scripts stand on the floor:**
  - NPCs placed standing at zone load, and by the story's `placeCast()` in every chapter (seated NPCs are already right).
  - The sleepy sprites by the dorms.
- **A dev-only check:**
  - A teleport or placement that had to move more than 5 cm to reach the floor logs `[floor] <what> at <where>: 0.45 m below the floor`.
  - The e2e harness fails on these warnings, as it does on console errors. The check isn't in production builds.

### 1.3 Tests (`tools/e2e/`)
| Test | What it does | Pass when |
|---|---|---|
| `lesson-stand` | An Academy save after the welcome. Walk to the pavilion with real keys, skip through the lesson, then hold S | Right after the lesson her feet are on the floor (0.45 ± 0.03 m). After 2 s she's off the pavilion, on the courtyard (y ≈ 0), more than 2 m away |
| `story-stand` | The same for the end of Chapter 3's story | Same |
| `floor-pushout` | Put her 0.45 m under the pavilion floor directly (no teleport) | One frame later she's on the floor |
| `markers-on-floor` | For every zone: every spawn, NPC and point marker used for standing, compared with the floor under it | None more than 5 cm off (seat markers are checked with their seat height) |
| `chapter1-full`, `chapter3-full` (existing) | After each story scene, walk for 1 s with real keys before any teleport | She moved more than 0.5 m |

### 1.4 The same check on every zone, now
I compared every spawn, NPC and point marker with the floor under it, in all five zones. Besides the lesson seat:

| Marker | Where | Off by | What it looks like | After M1 |
|---|---|---|---|---|
| `POINT_fang_lesson` | Academy | 0.19 m | Master Fang stands with her feet in the pavilion's front steps, during the lesson and for the rest of Chapter 1 | On the steps |
| `POINT_sleepy_1`, `_2` | Academy | 0.55 m | The sleepy sprites by the dorms (a Cozy Energy kind act) are inside the dorm's stone porch. From a step away only a sliver shows (screenshot) | On the porch |
| `SPAWN_hill` | Station | 0.15 m | Harmless: the collision already lifts the player out of shallow ones | On the floor |
| `POINT_path_2` | Station | 0.08 m | Harmless | On the floor |
| `NPC_kid3` | Market | 0.05 m | Harmless | On the floor |

- The seated NPCs (Wei Bao, the classmate, the musician, a train passenger) show up in the raw comparison too, but they are right. Their markers are on the ground, and the seat height is added when they sit.
- The Quiet District has none.

## 2. M2: Names that are easy to say in English

### 2.1 Proposed names
Lantern Bay feels like Hong Kong, where most people have an English given name and a Chinese surname, so the mix is realistic. Where I could, a new name keeps the old one's meaning or sound.

| Now | Proposed | Why | Also possible |
|---|---|---|---|
| Xiao Pei | **Pip** | "Xiao" means little, and a pip is a small seed. English readers can't guess that "x" sounds like "sh". | Mei (but her aunt is Auntie Mei), Lulu |
| Lin Tangtang | **Sunny Lin** ("Sunny") | Bubbly and loud, and a common Hong Kong English name. Her name means sugar, but I avoided "Candy": the lemon candies are a collectible, and "find every candy" would get confusing. | Tammy, Honey |
| Wei Bao | **Bo** | 寶 is "Bo" in Cantonese, so the sound stays. | Benny, Milo |
| Doudou | **Bean** | 豆豆 means little bean. Also, "Doudou" reads as "doo-doo" in English. | Bun, Mochi |
| Master Fang, given name Qiuyue | **Master Fang**, given name **Autumn** | "Fang" is already easy. Qiuyue (秋月) means autumn moon. Her grandmother's line becomes "Autumn! Your tea is ready." | Luna |
| Little Bo (a lost child at the market) | **Little Sam** | "Bo" would clash | |
| Captain Honk, Auntie Mei, Mrs Lau, Lantern Bay, Mistbloom | unchanged | Already easy | |

I checked the new names against the game's text. None of them clash with an existing word ("Kit" and "Moon" would have).

### 2.2 How
- **Only the display names change.** The ids stay `xiaopei`, `tangtang`, `weibao`, `fang` and `doudou`. They are in:
  - saves: flags like `weibaoFriend`, and `doudou` in the Sprite Book
  - model files (`xiaopei.glb`) and the Blender scripts
  - tests

  Renaming them would need a save migration and rebuilt models, for no change anyone would see.
- **Where the names are:**
  - the speaker labels (`SPEAKERS` in `ui/ui.js`)
  - dialogue, objectives, toasts and hints in `story/*.js`, `systems/*.js` and `content/*.js`, including Doudou's Sprite Book entry
  - Captain Honk's capitals ("THE BOY IS WEI BAO" → "THE BOY IS BO")
  - code comments that name a character in prose
  - `README.md`
  - `ai/snuggle_sorcery_story.md`, which the README links as the story

  That's about 90 in `src/`, plus the capitals. The older plans and summaries in `ai/` stay as written.
- **README:** the "Characters" section left over from plan 1 M8. For each character: name, technique, id and model file, so forks can find their way.
- **Tests:** the e2e checks that match on names (`/Wei Bao/`) are updated.
- **Done when** a case-insensitive search for the old names in `src/`, `index.html` and the README finds only ids.

## 3. M3: The autoplayer, a new player

### 3.1 What "a new player's perspective" means here
- **Input:** only real input events through Playwright, the way a person at a PC plays.
  - Keyboard and mouse only.
  - No teleports, no calling game functions, no speeding up time.
  - Everything happens in real time.
- **What it may know, because it's on screen:**
  - **The UI:** the objective banner, dialogue (speaker, text, choices), the interaction prompt, toasts, hints, chapter cards, the HUD (Cozy Energy, candies, Calm), menus, the Sprite Book, and the pause menu's Controls table.
  - **What it can see in the 3D view** (§3.2).
  - **Its own movement,** and a memory of where it saw things (a player's sense of place).
- **What it may not know:** the save, story flags, markers, triggers, colliders, anything off screen or behind a wall, and the source code.
- **This is enforced by how the code is split:**
  - The decision code never gets the Playwright `page`, only `eyes.look()` and `hands`.
  - On start-up, a check fails the run if the decision code mentions `__G` or `evaluate`.

### 3.2 Eyes (`tools/playtest/eyes.js`, injected into the page)
- **Why not pixels:** the 3D view isn't in the DOM, and understanding it from pixels alone would be a research project.
- **What they report instead:** the eyes run in the dev build and report only what is visible on screen at that moment, the way a person describing the frame would. Something counts as visible when it is:
  - inside the view
  - not hidden behind a wall (a line-of-sight ray from the camera)
  - at least about 10 px tall on screen
- **For each thing they see:**
  - where it is on screen, and how big (roughly how far)
  - **what it looks like, never its id:** "an old lady in a cardigan", "a boy with a goose puppet", "a little grey rain cloud", "a faint glow", "a wrapped yellow candy", "a round moon gate", "a bridge", "stairs going up". The labels live in one table, which I check against screenshots.
  - what can be seen about it: talking (the mouth moves), wrapped in yarn, grey, asleep
- **Names come from dialogue,** not from the eyes. When a speaker label appears and one visible character is talking, the autoplayer ties that name to that look.
- **Positions:** its own position and facing are allowed. Other things' positions are stored only once they've been seen.

### 3.3 Hands (`tools/playtest/hands.js`)
- **Keys:** WASD, Shift, Space, E (held to hum), F, Q, Tab, Esc and the number keys.
- **Camera:** the mouse moves until the target is in the middle of the screen, using the eyes' screen position.
  - Pointer lock may not work in headless Chrome.
  - If it doesn't, right-button drag already turns the camera without capturing the mouse (`core/input.js`).
- **At a person's pace:**
  - it reacts after 150–300 ms
  - it reads each dialogue line: until the typewriter finishes, plus 0.8 s, plus about 15 characters a second
- **Keyboard and mouse only,** because that's the main way to play on a PC. Touch and gamepad are left out (§11, question 5).

### 3.4 Brain (`tools/playtest/brain.js` and `playbook.js`)
- **The loop:** about 10 times a second, it looks, decides and acts.
- **Always:**
  - It reads the dialogue.
  - It answers choices like a friendly first-timer, taking the eager option, and logs the choice.
  - It follows hints.
- **The objective drives it.** The objective's text becomes a goal, using rules written from the game's own words. For example:
  - "Meet X in the Y": go to the Y, find the person called X (or the one who fits what the dialogue said about them), and talk.
  - "Attend … at the pavilion": go to the pavilion.
  - "Soothe the Lost Sock (laundry yard)": follow Master Fang's directions ("through the moon gate to the south-west"), find the creature, Notice it, and hum.
- **The game's own hints and tutorials teach it the mechanics,** one skill each:
  - soothing: Notice, hold Hum, re-press on the ring's pulse, and step aside when a tantrum's rain or paper balls come at it
  - the Assist
  - baking to the beat
  - roasting chestnuts
  - floating lanterns
  - guiding lost children home
  - sitting with a flock and pointing out a free good thing
  - keeping a grey Grumbling company
  - choosing which Charm Sprite remembers: read the clue; if the guess is wrong, try another, and log it
  - checking on the neighbours
- **Getting about:**
  - It walks toward the target with the camera on it, and sprints on long stretches.
  - If it isn't getting closer for 1.5 s, it sidesteps, jumps, or backs off and goes round.
  - It finds a way out of a zone from what the objective or dialogue says: the stairs, the ferry, the gate.
- **Exploring:** when the target isn't in sight, it turns right round first, then visits landmarks it hasn't been to yet, nearest first.
- **When it's lost:**
  - After 90 s without progress, it logs **confused** and what it was looking for.
  - Then it uses the pause menu's "Stuck? Back to last checkpoint", as a player would.
  - After 5 minutes on the same goal, the run fails with a report.
- **Optional things:** it picks up what it sees near its path (lemon candies, sleepy sprites, notes) if that's less than a 10 m detour. It doesn't hunt for every collectible.

### 3.5 The log (`tools/playtest/out/<run>/log.jsonl`)
- **What it records:**
  - every change it saw
  - every decision, with its reason ("the objective says the laundry yard is through the moon gate, and there's a moon gate on the left")
  - every input
- **Events:** new objectives, dialogue lines, confusions, retries, getting stuck, checkpoints used, running out of Calm, wrong guesses, page errors, and the frame rate (from `requestAnimationFrame`).
- **A summary at the end** (`summary.md`):
  - time per chapter and per objective
  - the share of time in dialogue, in cutscenes and in free play
  - the longest stretch without progress
  - counts of confusions, checkpoints used, times out of Calm and wrong memory guesses
  - page errors

### 3.6 How I build it
1. **My own first look.** Before writing the playbook, I play the train, the station and the arrival at the Academy myself through the Playwright MCP, from screenshots and key presses only. I write down what I understood and where I hesitated. That feeds the playbook and M5's findings.
2. **Chapter by chapter.** I develop it with starting saves for each chapter. They're only for development; the recorded run starts from a fresh game.
3. **Dry runs.** Each chapter runs in its own browser tab, in parallel, until it passes three times in a row. Then a whole dry run without recording.

## 4. M4: The uncut recording

- **Command:** `npm run playtest -- --record`.
- **Browser:**
  - Headless Chrome on the RTX 3060 (`--use-angle=vulkan`). I checked that its WebGL reports the NVIDIA card. With the software renderer the e2e tests use, the game runs at about 15 fps.
  - 1280×720, a fresh profile (no save, empty cache), on the dev server. The eyes need the dev build, and it's the same game; its first load is just slower.
  - The game's graphics quality is left on automatic (§11, question 3).
- **Picture:**
  - Chrome's screencast (CDP `Page.startScreencast`) captures the whole page, including the UI.
  - A frame pump writes the latest frame at a steady 30 fps into ffmpeg, which makes an H.264 MP4 (about 1 GB an hour).
- **Sound:**
  - The game's sound is captured inside the page. An init script also sends whatever goes to the speakers into a `MediaStreamAudioDestinationNode`, which `MediaRecorder` records (Opus) and streams to Node.
  - Chrome runs with `--mute-audio`, so nothing plays on your speakers for an hour.
  - The sound is combined with the picture at the end, lined up by both start times.
  - If the capture turns out silent while muted, I'll send the sound to a silent virtual output instead.
- **Also in the file:**
  - chapter markers (Prologue, Chapter 1, 2 and 3, taken from the chapter cards), so you can skip ahead without anything being cut
  - the autoplayer's thoughts as a subtitle track, off by default
- **Start and end:** it starts at page load (the loading screen and Begin), and ends 10 s after the "Chapter 4 … coming soon" card.
- **Uncut:**
  - One browser session makes one file.
  - If the run fails, the whole recording starts over, automatically, up to 3 times.
  - A file only lands in the output folder when a run is complete.
- **Length:** about 45–75 minutes. The dialogue alone is about 13,000 characters, which is about 15 minutes of reading.
- **Output:** `tools/playtest/out/<date>/`, which is already git-ignored:
  - `playthrough.mp4`
  - `log.jsonl`
  - `thoughts.srt`
  - `summary.md`

## 5. M5: Review, fixes and suggestions

### 5.1 Going through the run
- **The log and the summary.**
- **Frames.** I can't watch a video, but I can look at its frames:
  - contact sheets: a frame every 5 s, 30 to a sheet (about 25 sheets an hour)
  - full frames at every logged event (a confusion, getting stuck, an error, a chapter card), and 2 s either side
- **ffmpeg checks on the picture:**
  - `freezedetect`: the picture not changing for more than 20 s outside dialogue, which means stuck or bored
  - `blackdetect`: black frames
- **Sound:**
  - `silencedetect` for long silences
  - loudness per section (`ebur128`) and peaks: is the music under the dialogue, are the ambience beds too loud, does anything clip
  - `next_4.md` said the mix needs ears. This is measurement, not listening, but it catches the obvious.

### 5.2 What gets fixed
- **Bugs:** stuck spots, softlocks, collisions, clipping, wrong text, errors, broken prompts. Each is fixed with its cause found, and gets an e2e test where it can be tested.
- **Friction that's really a bug:** an objective pointing to the wrong place, a prompt that never appears, a hint naming the wrong key. Fixed the same way.
- **Bigger design changes:** only written down (§5.3).

### 5.3 `ai/playtest_5.md`
- **The run:** its length, time per chapter, and the metrics from §3.5.
- **Friction log:** each entry has the video time, what happened, why it was confusing, and a suggestion.
- **Bugs:** found, cause, fix and test.
- **Suggestions to make it more fun,** ranked by impact and effort, each with its load-budget cost. What I'll look at:
  - the first ten minutes: how soon you're playing, and what you understand
  - finding your way: objectives, landmarks, directions
  - pacing: dialogue against play (measured), and the longest stretch without something new
  - soothing: variety, challenge, feedback, the tantrums
  - rewards: what Cozy Energy, tarts, candies and the Sprite Book give you
  - how the mini-games feel
  - camera and controls
  - the story beats, and how present the friends are
  - sound

## 6. M6: The final recording
- After the fixes:
  - the whole e2e suite
  - `npm run budget` and `npm run perf`
  - then the recording again, as `playthrough-final.mp4`
- The first recording is kept, as the "before".

## 7. Budgets and risks
- **The game's load size:**
  - M1 adds about 0.3 KB (gzipped) to the main bundle. The first-visit JS has 1.9 KB left (238.1 of 240 KB).
  - The new names make the text a little shorter.
  - Nothing from `tools/playtest/` ships.
  - If the budget is exceeded, the bug-report UI moves into a lazy chunk (`next_4.md` item 3).
- **Load times** are unchanged.
- **Risks:**
  - **The autoplayer is the biggest and least predictable piece.** Finding a way through gates, over bridges and up stairs without a navigation mesh is the hard part.
    - It uses landmarks as waypoints, sidesteps and the in-game checkpoint.
    - Anywhere it can't manage from what's on screen is a finding in itself. I'll report it rather than hide it with a cheat.
  - **An hour-long uncut run can fail late.** Mitigations: chapter dry runs first, and automatic retries.
  - **The video shows the dev build.** It's the same game, with a slower first load.
  - **The RTX 3060 isn't the spec's target hardware.** The video's smoothness says nothing about phones, but the frame rate is logged anyway.
  - **The collision change could change how movement feels.** `feel-stride`, `followers-academy` and every chapter test must still pass.

## 8. Files
- **New:**
  - `tools/playtest/play.mjs`: the runner (browser, dev server, the loop, retries)
  - `tools/playtest/eyes.js`: in the page
  - `tools/playtest/hands.js`
  - `tools/playtest/brain.js` and `playbook.js`
  - `tools/playtest/record.mjs`: screencast to ffmpeg, the sound capture, chapter markers and subtitles
  - `tools/playtest/review.mjs`: frames, contact sheets, and the freeze, silence and loudness reports
  - `ai/playtest_5.md`
- **Changed, M1:**
  - `src/actors/player.js`, `src/world/collision.js`
  - `src/story/chapter1.js`, `src/story/chapter3.js`
  - NPC placement in `src/world/zone.js`, and the sleepy sprites in `src/world/zones/academy.js`
  - `tools/e2e/run.mjs`: `[floor]` warnings fail a test
  - `tools/e2e/tests.mjs`: the new tests
- **Changed, M2:**
  - `src/ui/ui.js`, `src/story/*`, `src/systems/*`, `src/content/*`
  - `README.md`, `ai/snuggle_sorcery_story.md`
  - `tools/e2e/tests.mjs`
- **`package.json`:** a `playtest` script.
- **No new npm dependencies.** `playwright-core` is already there, and ffmpeg is a system tool that's installed on this machine.

## 9. Verification
- **M1:**
  - The repro now shows her on the floor, and she walks off the pavilion.
  - The new tests pass, and `markers-on-floor` is clean in every zone.
  - Screenshots after the lesson and after Chapter 3's story.
- **M2:** the search for the old names finds only ids, the e2e tests pass, and a screenshot shows the dialogue with the new names.
- **M3:** the autoplayer finishes each chapter from its starting save three times in a row, then a whole dry run.
- **M4:**
  - The MP4 plays from start to end, and its length matches the log.
  - No frames are missing.
  - Sound and picture are within 0.1 s of each other at the end, checked on an event you can both see and hear (the train door, or the first hum).
- **M5 and M6:** all e2e tests pass (the 27 from before plus the new ones), along with `npm run budget` and `npm run perf`.

## 10. Out of scope
- Building the gameplay suggestions (they're only written down)
- Chapter 4
- Playthroughs with touch or a gamepad
- Deploying (it needs your account)

## 11. Open questions (defaults in bold; I'll go ahead with the defaults unless you say otherwise)
1. **Names:** **the table in §2.1**, or your own.
2. **Also rename in `ai/snuggle_sorcery_story.md`?** **Yes.** The README links to it as the story.
3. **Video:** **1280×720, 30 fps, with sound, on the game's automatic quality on this PC (the high tier on the RTX 3060).** Or the low tier, to show what an entry-level phone sees.
4. **Record again after the fixes?** **Yes, and keep both.**
5. **The autoplayer's controls:** **keyboard and mouse**, or gamepad or touch.
6. **What gets fixed:** **bugs, and friction that's really a bug. Design suggestions are only written down.**
