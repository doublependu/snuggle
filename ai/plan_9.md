# Plan 9: An autoplayer that plays the whole game like a person, four videos from it, and fixes for what confuses a player

Answers `ai/prompt_9.md`. Builds on `ai/next_8.md`, and on `ai/plan_5.md` / `ai/next_5.md` (the autoplayer and the first recording). Nothing here is built yet.

## 0. Short answer

- **The autoplayer learns the rest of the game (M2, §2).** Today it stops at "Chapter 3 complete", because it can't take shelter from a sigh or stitch. It gets the eyes and goals for:
  - Chapter 4: the fog, the sighs, Bean's warnings, Stitch
  - Chapter 5: the five phases of the Great Sulk
  - the Epilogue
  - free roam: the worry board, fishing, lost things, bed, and the first-years
  
  It still decides only from what is on screen, with real keyboard and mouse input.
- **It plays like a person you'd want to watch (M1, §1).**
  - Smooth, unhurried camera turns.
  - It walks near people and runs only on long, open stretches. No twitching, no bumping along walls.
  - It reads at a pace a viewer can follow and pauses before it picks a choice.
  - It plays the mini-games well but not perfectly.
  
  Each of these is measured on every run, so "looks human" is a number and not my impression.
- **What confuses a player gets fixed in the game (M3, §3).** This is the prompt's "improve bits and pieces".
  - **The rule:** a fix may only make things clearer or more forgiving. It never adds a timer, a fail state or a harder check.
  - **When the autoplayer can't work something out from the screen, that is a finding about the game.** I fix the game, and don't hand the autoplayer the answer.
  - Each fix gets a test where it fits. The list goes in `ai/playtest_9.md`, as in `playtest_5.md`.
- **Recordings at YouTube quality (M4, §4).**
  - 1920×1080 with the game's sound, on this PC's RTX 3050. I checked that headless Chrome uses it.
  - The whole game is recorded as one continuing save, in chapter-sized takes joined at the chapter cards. A take is recorded again until it's clean.
  - The Short gets its own takes, recorded in portrait.
- **Trailer material (M5, §5).**
  - Scenery shots on scripted camera paths with the HUD hidden.
  - Close-ups of the gameplay, set up again from saves.
  - The game's own score, recorded on its own (it's synthesized, so no copyright claims).
  - Title cards in the game's own card style.
- **The four videos (M6, §6),** cut by a small ffmpeg tool from edit lists kept as JSON, so a re-cut means editing numbers:

  | # | Video | Format | Length |
  |---|---|---|---|
  | 1 | **Full playthrough for YouTube**, with a spoiler warning first | 16:9, 1080p | about 75–90 min: the train to THE END, then the bonus (free roam) |
  | 2 | **Trailer for YouTube** | 16:9, 1080p | 4:00–5:00 |
  | 3 | **YouTube Short** | 9:16, 1080×1920 | 45–60 s |
  | 4 | **Video for X** | 16:9, 1080p, with captions burned in (X plays muted) | 45–60 s |

  Each video gets a thumbnail where the platform takes one, and a draft title, description (with YouTube chapters) and post text in `ai/videos_9.md`.
- **I don't upload or post anything.** The files and the text are ready for you to do that.

## 1. M1: Playing like a person

### 1.1 What stays from plan 5
- **What it uses:** real keyboard and mouse input only. No teleports, no game functions, no speeding up time.
- **What it decides from:** only what `eyes.js` reports. That is the UI, plus things in view described by how they look.
- **The start-up check** still fails a run if the decision code reaches into the game.

### 1.2 How it looks on video
The plan 5 recording was readable, but parts of it looked like a bot. These changes are in `hands.js` and `brain.js`.

| Habit | Now | After |
|---|---|---|
| **Turning the camera** | A drag of up to 500 px at once (`hands.turn`): the view snaps | Turning speed is limited, and each turn eases in and out. A small dead zone stops it re-aiming at a target that is nearly centred |
| **Looking round** | A fast 360° spin on arrival in every new place | A slow pan of about 6 s, only when the target isn't in sight or it's lost |
| **Walking** | Speed is chosen per tick, and the side keys flip back and forth | Walks within 8 m of people and on short hops; runs only on long, clear stretches. A turn must last a moment before the keys change. It stops 1.5–2 m from whoever it's walking up to, without bumping into them |
| **Reading** | 20 characters a second + 0.35 s (`brain.js:627`) | 17 characters a second + 1.0 s, about a subtitle's pace. Never before the typewriter finishes. Never "Skip conversation" in a recorded run |
| **Choices** | Picked at once | 1.5–2.5 s, as if reading the options |
| **Timing in mini-games** (baking, the blanket's lullaby, fishing bites) | Exactly on the beat | Off by a little (±40 ms or so), so most notes are Perfect, some only Good, and an occasional miss |
| **Arriving** | Already turning away | A beat of standing still, then the camera settles on who or what it came for |

**Measured on every run** (in `summary.md`, from the log; `review.mjs` adds a frame count):

| Measure | Target |
|---|---|
| Camera turning speed | 95% of the time under 120°/s, never over 240°/s outside a look-round |
| Twitches (steering reversed within a second) | at most 1 per 5 minutes |
| Bumps into walls in free play | at most 1 per 2 minutes |
| Standing still outside dialogue, cutscenes and mini-games | never more than 8 s, unless it's waiting for a sigh to pass or a train to arrive |
| Unique frames per second in the video (§4.1) | at least 28 at 30 fps |

### 1.3 It only knows what the screen said
- **The audit:** every rule in `playbook.js` gets a comment quoting the text it relies on (an objective, a tip or a dialogue line).
- **Where a rule knows something the game never said,** either:
  - the game is unclear, and M3 fixes the game; or
  - the rule was my shortcut, and it goes.
- **An example to check:** free roam's rule "There is a board by the gate with notes on it". As far as I can see, the only on-screen source is one of Master Fang's rotating lines (`freeroam.js:160`).

### 1.4 What it does along the way
- It plays like an **engaged first-timer.** It talks to people it passes, does the kind acts and optional things it comes across, equips a helper when the game offers one, and opens the Sprite Book when a new sprite arrives (once or twice, not every time).
- It doesn't hunt for every lemon candy.
- **Why this matters for the video:** Chapter 5 is shaped by the save (`next_8.md`: who answers, how many sprites fly in, who sits at the table). A friendly player gets the fuller finale, which is the one worth showing.

## 2. M2: The rest of the game

### 2.1 New things the eyes see (`eyes.js`)
Each one is described by how it looks, as now, and the labels are checked against screenshots.

| Where | What a player sees or hears | Reported as |
|---|---|---|
| **The fog** (Chapters 4–5) | About 8 m of sight, further inside colour | Things beyond the fog's reach **are not reported**, unless they glow (lit lanterns, a warm porch light, loose ends). I'll calibrate this on screenshots. Today the eyes would see through the fog |
| **A sigh coming** | Bean's ears go up, the edge of the screen greys, then a grey front rolls up the street | Bean's ears, the grey edge, the front and its direction once it's in view (as you'd hear where a sound comes from) |
| **Shelter** | Warm lights, solid walls | Warm spots (a circle of colour, a porch lantern), and which way walls are (it already has wall distances) |
| **Stitch** | A loose thread end, where it belongs, the thread in her hand | "a loose glowing thread end", the place it belongs as it looks (a bell, a letterbox, a lantern), and "holding a thread" |
| **The Great Sulk** | Its size, its eyes, its patches grey or in colour, the lantern posts, the cake, the guests | Each phase's pieces: "a grey patch on the big sulking shape", "a lantern post with a sprite at it", "a stove", "a big pot", "a dinner bell" |
| **The Epilogue** | The breakfast table, the jetty, the fisherman, the ceremony | As named things |
| **Free roam** | The first-years, the dormitory door, a lost thing's owner, a sprite who can Deliver | As named things |

### 2.2 New goals (`goals.js`)
- **Shelter:**
  - On Bean's warning, go to the nearest warm spot, or put a wall between Pip and the direction the front comes from.
  - Wait there until it has passed, then carry on with the goal from before.
  - It learns from being caught, as it learned from a splash.
- **Stitch:** pick up a loose end, carry it to where it belongs (from the tip, the dialogue and what's lit), and hum.
- **Listen** (phase 2): pick the reply that listens. It goes by what Bo and Captain Honk said, not by the option's position. A wrong pick is logged.
- **Patch** (phase 3): which Charm Sprite was born from which feeling, worked out from the Sprite Book, like the memory guesses in Chapter 3.
- **Chores** (phase 4): light the stove, stir the pot and ring the bell. These are `Use` goals on the prompts.
- **The whole lullaby** (phase 5): hold Hum through the sixteen beats, pressing again on the pulses.
- **Tuck in.**
- **Free roam:**
  - **Bed:** "Turn in for the night", when the day's worries are done or there's nothing left here.
  - **Lost things:** take a lost thing back to its owner.
  - **The first-years:** the outing, start to end.
  - **Fishing:** a few catches at two spots, not every spot.

### 2.3 New rules (`playbook.js`)
- **One rule for every objective** in `chapter4.js`, `chapter5.js`, `epilogue.js`, `freeroam.js` and `firstyears.js` (about 30).
- **Where it stops:** at the end of the bonus (§6.1), not at "Chapter 3 complete" (`play.mjs`).

### 2.4 How it's developed
- **One part at a time,** from the existing starting points (`--from ch4`, `fog`, `heart`, `ch5`, `epilogue`, `free`).
- **Each part must pass three runs in a row** before the recorded run.
- **Two new options:**
  - `--save-out FILE` saves the game when a run stops.
  - `--save-in FILE` starts from that save.

  This chains the takes of §4.3, and lets me check that a chapter played on a real save behaves like the hand-written starting points.

## 3. M3: What confuses a player, fixed (alongside M2)

### 3.1 How confusion shows up
These are logged with their time, so the frames around them can be looked at:
- **The game's guide had to step in.** After 40 s without progress, the helper sprite flies ahead and an arrow appears (`wayfinder.js`). This is the clearest signal: the game itself decided the player was lost.
- **No progress on an objective for 45 s or more,** outside dialogue.
- **An objective no rule understands.** Either the autoplayer is missing a rule, or the objective is unclear; I judge which.
- **Wrong guesses** (a Charm Sprite, a reply, a patch), being caught by a sigh more than twice in a stretch, a dropped stitch, a fish lost three times.
- **Walking the wrong way:** more than 20 m away from where it ends up going.
- **The checkpoint button,** "stuck" or "confused".

### 3.2 What a fix may be
- **Allowed** (clearer or more forgiving):
  - an objective that names a landmark
  - a tip shown at the moment it's needed
  - a light or sign on the target
  - a camera shot that shows the thing being talked about
  - a prompt that reaches a little further
  - a bigger trigger
  - the guide stepping in sooner in the fog
- **Not allowed:** anything that makes progress harder. No new fail states, no timers, no stricter checks.
- **Bigger design changes** are written down in `ai/playtest_9.md`, not built.
- **Which side to fix:**
  - An autoplayer bug is fixed in the autoplayer.
  - Something a player couldn't know from the screen is fixed in the game, and the autoplayer isn't told the answer.
  - Each bug gets its cause found. Each fix gets an e2e test where it can be tested.

### 3.3 Spots to watch (from reading the code; the runs decide)
- **Compass directions with no compass on screen:**
  - "Bean wants to show you something: **north**, up the Arcade" (`chapter4.js:49`)
  - "A sigh is coming up from the **south**" (`chapter4.js:456`)
  
  A likely fix is a landmark ("past the lantern-makers"), and Bean's ears pointing the way the sigh comes from.
- **"Find a way back to Sunny and Bo"** (`chapter4.js:48`): the way is a grey Grumbling in a gap, which you keep company. Chapter 3 taught that, but the objective doesn't hint at it.
- **"Stitch the loose ends … back where they belong":** whether "where they belong" can be seen from the loose end.
- **"Check on the neighbours: up the lane, and stay in the colour":** whether "stay in the colour" means anything before the first sigh.
- **Phase 3, a patch to the sprite born from that feeling:** whether the Sprite Book gives enough to reason it out.
- **Free roam, "Lantern Bay, day 1 · worries soothed 0/3"** (`freeroam.js:61`): it doesn't say where the day's worries are written.
- **Free roam, going to bed:** whether a player finds "Turn in for the night" at the dormitory, and knows that's how the first-years' day comes.
- **The mix** of the five new tracks, which `next_8.md` says was never levelled. If a chapter measures more than 3 LU off Chapters 1–3, I level its track's gain in `content/music.js`. Otherwise the full video jumps in loudness at Chapter 4.

### 3.4 Output
- **`ai/playtest_9.md`:**
  - the run's numbers per chapter (time, reading share, guide steps, wrong guesses, sighs caught)
  - the friction log, each entry with its time in the video
  - what was fixed and its test
  - what is only suggested
- **Tests:** in `tools/e2e/`, next to the chapter's existing ones.

## 4. M4: Recording at YouTube quality

### 4.1 Picture
- **1920×1080:**
  - The viewport stays 1280×720 with a device scale factor of 1.5, so the UI lays out as it does now and renders crisply at 1.5×.
  - The high tier's pixel-ratio cap is 1.5 (`quality.js:9`), so the 3D view renders at full 1920×1080 too.
- **A dev-only `?capture` parameter:**
  - fixes the adaptive resolution scale at 1, so a busy moment doesn't go soft
  - allows a higher pixel ratio for the portrait takes (§4.4)
  - is behind `import.meta.env.DEV`, so it adds nothing to the production bundle
- **Encoding:**
  - While recording: near-lossless H.264 (CRF 16, `veryfast`).
  - The final videos are encoded once, from those files (§6).
- **Smoothness is measured first (M0):** two minutes at 1080p, counting unique frames (ffmpeg `mpdecimate`).
  - If 60 fps holds cleanly, the videos are 60 fps. Otherwise 30.
  - If even 30 doesn't hold at 1080p, the fallback is a headed Chrome window captured from the desktop. That takes over your screen for the length of a take, so I'd ask first.
- **No mouse cursor in the picture** (the screencast doesn't include one). The loading screen is trimmed (§6.1).

### 4.2 Sound
- **Capture as now:** the in-page tap, with Chrome muted, now at 48 kHz.
- **The game's mix is only changed by §3.3's levelling.**
- **Loudness is set per video:** −14 LUFS integrated, true peak at most −1 dBTP (ffmpeg `loudnorm`, two passes), which is where YouTube normalises. It's measured again after encoding.

### 4.3 The full playthrough: one save, chapter-sized takes
- **One continuing save.** Each take starts from the save the previous take ended with (`--save-in`/`--save-out`). So Chapter 5 sees exactly what this playthrough did, and nothing comes from a hand-written save.
- **The takes:**

  | Take | Covers |
  |---|---|
  | 1 | Prologue and Chapter 1 |
  | 2 | Chapter 2 |
  | 3 | Chapter 3 |
  | 4 | Chapter 4 |
  | 5 | Chapter 5 |
  | 6 | the Epilogue, THE END and the credits |
  | 7 | free roam (§6.1) |

- **Joins are through black at the chapter cards,** where the game already fades out. The next take's loading screen is trimmed.
- **A take is clean when** it has:
  - no page errors
  - no use of the checkpoint
  - no "stuck" or "confused"
  - no stretch of 20 s or more without progress outside dialogue
  - §1.2's targets met
  
  Being caught by a sigh now and then is fine: players are, and it shows the mechanic.
- **A take that isn't clean is recorded again,** automatically up to 3 times. After that I look at why.
- **Why takes rather than one uncut hour:**
  - A failure late in a 90-minute run costs the whole run.
  - A game fix in one chapter only needs that take again.
  
  Open question 2 offers the uncut version.
- **Each take also keeps:**
  - the log
  - the thoughts as subtitles
  - `summary.md`
  - the review (contact sheets, frames at events, freeze, black, silence and loudness checks), extended with §1.2's measures

### 4.4 Portrait takes for the Short
- **The game's own narrow layout:** a viewport of 432×768 at a scale of 2.5 (1080×1920), with `?capture` lifting the pixel-ratio cap.
- **No phone rotate warning:** the game shows it only for touch screens (`index.html:72`), and these takes use a mouse.
- **The keyboard hints are hidden** with CSS injected by the tool (a phone-shaped video saying "Hold E" would look odd). The Short's captions explain instead.
- **A few moments from saves:**
  - the rain cloud on the train
  - a Perfect hum wrapping a Grumbling in yarn
  - "Everyone Together" with the sparrows
  - Bean in the fog
  - a catch held up
- **Checked on the first frames** before going further: that the framing works in portrait (`main.js:211` widens the view).
- **If it doesn't work,** the fallback is a centre crop of the landscape footage. It's softer, but Pip is in the middle of a third-person view.

## 5. M5: Footage beyond the playthrough

### 5.1 Scenery shots (`tools/video/shots.mjs`, `shots.json`)
- **About 25 shots of 4–8 s each:**
  - the train in the rain
  - the Academy from the hill
  - the courtyard
  - the night market's lanterns
  - the Quiet District, grey and then in colour
  - the fog
  - the old square
  - the Great Sulk, glimpsed (not resolved)
  - the harbour at dawn
- **Each shot is data:**
  - a zone
  - a story state, so the place looks as it does at that point
  - a camera path of 2–3 keyframes relative to the zone's markers
  - a length
  - whether Pip is in frame, idling
- **This tool is a camera operator, not a player.** It may reach into the game (`__G`, the camera's `setShot`), and it lives apart from `tools/playtest` so the autoplayer's start-up check still holds.
- **The HUD is hidden** with injected CSS. The game itself doesn't change.

### 5.2 Gameplay close-ups, set up again
- The autoplayer, from saves, with `--until`, records the moments the trailer needs at their best:
  - a tantrum dodged
  - the beat ring and a Perfect
  - a Charm Sprite arriving
  - baking, chestnuts and lanterns
  - a golden memory
  - a stitch
  - a sigh passing over a shelter
  - a catch
- **The HUD is hidden or kept per clip,** whichever reads better. The soothing ring and the yarn are 3D, so they stay either way.

### 5.3 The score (`tools/video/music.mjs`)
- The music is synthesized (`core/music.js`), so each track can be recorded on its own:
  - a quiet scene, with the ambience and sound effects muted
  - `__G.music.play(id)`, for as many loops as needed
  - saved as WAV
- **Tracks:** `train`, `academy`, `market`, `quiet`, `fog`, `bean`, `sulk`, `blanket`, `morning`.
- **It's 84 bpm** (a bar is 2.857 s), so the trailer can cut on the bar lines.
- It's the game's own music, so **no copyright claims**.

### 5.4 Cards, captions and thumbnails (`tools/video/cards.html`, `cards.mjs`)
- **Rendered from HTML with Playwright,** at each video's size:
  - the same CSS as the game's own chapter cards and loading screen, so they match what's in the game
  - the same fonts (the system's, as the game uses)
- **What they are:**
  - the spoiler warning
  - the title
  - the trailer's text cards
  - end cards with the links
  - the Short's and X's captions (big, inside each platform's safe area)
  - two thumbnails, 1280×720: the full playthrough and the trailer

## 6. M6: The four videos (`tools/video/edit.mjs`, `tools/video/edits/*.json`)

**The edit tool:**
- **What an edit list holds:**
  - clips (source, in, out, crop and scale)
  - cards and captions with their times
  - music cues
  - how loud the game is against the music (it ducks under the music in the trailer)
  - fades
  - the loudness target
  - the encoding preset
- **What it does:** renders the list with ffmpeg, then writes the chapter list and the YouTube chapter timestamps from the final times.
- **Why a list:** a re-cut is an edit to a JSON file and a re-render.

### 6.1 The full playthrough (YouTube)
| Time | What |
|---|---|
| 0:00 | **Spoiler warning,** 7 s: "This video plays all of Snuggle Sorcery, from the first train ride to the ending, and the free roam after it. To play it yourself first: free, in your browser, at ‹link›." |
| ~0:07 | The title, then the loading screen and Begin, trimmed to a few seconds |
| | Takes 1–6: the Prologue to THE END and the credits, with the game's own chapter cards |
| | **The bonus,** take 7: the "Lantern Bay" card, then day 1. Read the worry board, soothe three worries (one across town), fish at two spots, take a lost thing home, look at the Sprite Book's last pages, and turn in for the night |
| | Day 2: Sunny's sign, the first-years' train, their Jitters, the walk up the hill, the tour, the bench |
| | A last look at the Everyone Blanket over the old square |
| end | **End card,** 20 s: room for YouTube's end screen, plus the links |

- **Chapters:**
  - inside the file
  - in the description as YouTube chapters: Spoiler warning, Prologue, Chapters 1–5, Epilogue, The End, Lantern Bay (free roam)
- **The autoplayer's thoughts** come as a separate `.srt`, which isn't uploaded by default. As captions they would confuse anyone relying on captions.
- **Length:** about 75–90 minutes.
  - Chapters 1–3 took 23 min at 20 characters a second.
  - Plan 8 estimates 27 more to THE END.
  - Add the slower reading and about 15–20 min of free roam.

### 6.2 The trailer (YouTube, 4:00–5:00)
A gameplay overview, cut to the score. The times below are approximate, and the cuts fall on bar lines.

| Time | Music | What |
|---|---|---|
| 0:00–0:25 | `train` | Rain on the train window. A little grey cloud, sulking and raining on everyone's shoes. Pip hums; the yarn wraps; the rain stops. **Title.** |
| 0:25–1:05 | `academy` | Lantern Bay and Mistbloom Academy, scenery. Cards: "Curses born from small worries come out fluffy." "You don't fight them. You soothe them." |
| 1:05–1:55 | `academy` → `market` | **How you play:** notice, hum, the beat ring, a Perfect, dodging a tantrum, the Charm Sprite it becomes, the Sprite Book, Sunny's tart and Bo's Echo Friend |
| 1:55–2:45 | `market` → `quiet` | **Friends and places:** baking, the night market's sparrows, chestnuts and lanterns, the grey Quiet District and its golden memories |
| 2:45–3:35 | `fog` → `bean` → `sulk` | **The turn:** the fog, a sigh rolling up the street, Bean awake, Stitch, and a glimpse of something very big and very sad. Its face, never what happens |
| 3:35–4:15 | `morning` | **And it carries on:** thread fishing, the worry board, the fountain |
| 4:15–4:45 | `blanket` | "Free to play in your browser. No install, no account." The link, "Open source", the channel |

- **Spoilers:** none from the ending, Bean's secret or the Epilogue's story. Free roam's fishing is shown without context (open question 3).

### 6.3 The Short (9:16, 45–60 s)
- **Built from the portrait takes (§4.4),** with one caption per beat.
- **0–2 s, the hook:** the rain cloud mid-tantrum, captioned "You don't fight curses here."
- **The middle:** "…you hum them to sleep." The yarn wraps, a Charm Sprite pops out, then sparrows, Bean, a catch.
- **The end:** "Free, in your browser" and the link card. The link also goes in the description.
- **Text stays inside the Shorts safe area:** clear of the bottom quarter, the right-hand buttons and the top bar.

### 6.4 The X video (16:9, 45–60 s; X's limit for a free account is 2:20)
- **X starts videos muted,** so the captions tell it all and the sound is a bonus.
- **First 3 s:** the most striking moment (the yarn wrap, or a golden memory). The end card has the link.
- **Encoding:** H.264 High, AAC, `+faststart`, well under 512 MB.
- **The same material as the trailer,** in a different order with its own captions.

### 6.5 The text (`ai/videos_9.md`)
- **For each video:** a title, a description, tags or hashtags, and the chapter list (the full video).
- **For X:** a post under 280 characters.
- **The links:** the game, GitHub, @RadWebGame on YouTube and X, and Maize.Live.
- **One line saying the playthrough was played by the game's own autoplayer** (open question 7).

## 7. Budgets and risks
- **The game's load size:**
  - Game fixes go in the chapters' and free roam's code, which loads after Begin.
  - First-visit JS is at 238.3 of 240 KB, so anything before Begin has to make room first.
  - `?capture` is dev-only (0 bytes in production).
  - Nothing in `tools/video` ships.
- **Load times** are unchanged. The Academy's 3.1 s on today's machine (`next_8.md`) is not in this plan's scope.
- **Risks:**
  - **The fog chapters are the hardest to play from the screen.** You see about 8 m, and the eyes must stop seeing through the fog. Bean's cues, the warm lights and the game's own guide are what a player has too.
    - Where that isn't enough, it's a finding for §3, not a reason to tell the autoplayer.
  - **The screencast's frame rate at 1080p** is the first thing measured (M0). The fallback is in §4.1.
  - **Taste:** the trailer, the Short and the X video are a first cut for you to watch. Re-cuts are cheap (§6).
  - **What the videos show:**
    - **The high tier on an RTX 3050.** An entry-level phone sees the low tier.
    - **The dev build** (the eyes need it). Its slower first load is trimmed, and otherwise it's the same game.
  - **Disk:**
    - About 6–10 GB an hour for the near-lossless recordings, so 20–30 GB with retries and the trailer footage.
    - The final full playthrough is 4–6 GB.
    - There's 230 GB free. Everything stays in git-ignored folders.
  - **`node_modules` isn't installed in this checkout.** M0 starts with `npm ci`.

## 8. Files
- **Changed:**
  - **The autoplayer:**
    - `tools/playtest/eyes.js`: the fog, sighs, shelter, Stitch, the Great Sulk's phases, the Epilogue, free roam
    - `hands.js`: eased turning, the timing jitter
    - `brain.js`: pace, walking, choices
    - `goals.js`: §2.2
    - `playbook.js`: §2.3 and §1.3's audit
    - `nav.js`
    - `play.mjs`: 1080p, `--portrait`, `--save-in`/`--save-out`, where it stops
    - `record.mjs`: 48 kHz, near-lossless, frame statistics
    - `review.mjs`: the human-look measures
    - `log.js`
  - **The game:**
    - `src/core/quality.js` and `src/main.js`: dev-only `?capture`
    - the fixes from §3, probably in `src/story/chapter4.js`, `chapter5.js`, `freeroam.js`, `src/systems/wayfinder.js` and `src/content/music.js`; the runs decide
  - **Tests:** `tools/e2e/` (a test per testable fix)
  - **Docs:**
    - `README.md`: the autoplayer now plays the whole game; recording options; a "Videos" section on how to re-cut
    - `.gitignore`: `tools/video/out/`
    - `package.json`: a `video` script
- **New:**
  - `tools/video/shots.mjs`, `shots.json`, `music.mjs`, `cards.html`, `cards.mjs`, `edit.mjs`
  - `tools/video/edits/full.json`, `trailer.json`, `short.json`, `x.json`
  - `ai/playtest_9.md` and `ai/videos_9.md`
  - `ai/next_9.md`, at the end
- **No new npm dependencies.**
  - ffmpeg 8.0.1 is installed.
  - Chrome's headless WebGL reports the RTX 3050 with the autoplayer's flags (checked).

## 9. Verification
- **The autoplayer:** each part passes three runs in a row from its starting point, then the full chain of takes.
  - The human-look measures (§1.2) are met on every take.
  - The playbook audit (§1.3) leaves no rule without its on-screen source.
- **Game fixes:**
  - each has its test
  - `GPU=1 npm run e2e` passes in full (111 tests plus the new ones)
  - `npm run budget` passes
  - `npm run perf` is no worse than `next_8.md`'s table
- **Every video, checked with ffprobe and ffmpeg:**
  - its size, frame rate, codecs and length (the trailer 4:00–5:00, the Short ≤ 60 s and 9:16, the X video ≤ 2:20 and ≤ 512 MB)
  - −14 ± 1 LUFS, true peak ≤ −1 dBTP
  - no black stretch I didn't put there
- **The full playthrough:**
  - all nine chapter cards in order
  - the description's chapter times within 1 s of the cards
  - the take joins land on black
  - no freeze of 20 s or more outside dialogue
- **I look at the frames** (contact sheets, every card and caption, each join) for anything cut off, misplaced or unreadable, including the Shorts safe area.
- **You watch them.** Whether they're good videos is your call, and the edit lists make changes quick.

## 10. Order of work

| # | Milestone | Ends with |
|---|---|---|
| M0 | `npm ci`, and a 2-minute 1080p capture to measure the frame rate | 30 or 60 fps decided |
| M1 | Playing like a person (§1) | Chapters 1–3 from a fresh game, meeting §1.2's targets |
| M2 + M3 | The rest of the game (§2), with the fixes as they turn up (§3) | each part passing three times; the fixes' tests; `ai/playtest_9.md` |
| M4 | The full chain of takes, and the portrait takes (§4) | clean takes, and their reviews |
| M5 | Scenery, close-ups, the score, cards (§5) | the footage |
| M6 | The four edits, the thumbnails and the text (§6) | the four files, checked as in §9, and `ai/videos_9.md` |
| M7 | Everything in §9, the README, `ai/next_9.md` | done |

**Where the files land** (git-ignored):
- the recordings: `tools/playtest/out/<run>/`
- the finished videos, thumbnails and cards: `tools/video/out/`

## 11. Out of scope
- **Uploading or posting.** It needs your accounts and it's public. The text is drafted for you.
- Voice-over and narration, subtitles in other languages, music beyond the game's own score.
- New game content, and design changes beyond §3.2 (written down only).
- The Academy's load time on this machine (`next_8.md`, item 3).
- Touch or gamepad play. The portrait takes use a mouse in a narrow window.

## 12. Open questions (defaults in bold; I'll go ahead with them unless you say otherwise)
1. **Where the full video starts and ends:**
   - **It starts at the Prologue** (the train), since that's where the game starts. I read "from chapter 1" as "from the beginning".
   - **"The bonus game" is free-roam Lantern Bay after the credits.** The video ends after day 1 and the first-years' day 2 (about 15–20 min of it).
   - Or: start at the "Chapter 1" card, or show more or less of free roam.
2. **The full video's cuts:** **chapter-sized takes from one continuing save, joined through black at the chapter cards**, or one uncut take of about 90 minutes.
3. **Trailer spoilers:** **light.**
   - It shows up to the fog, the sighs, Bean awake and a glimpse of the Great Sulk's face.
   - Nothing of the ending, Bean's secret or the Epilogue. Fishing appears without context.
   - Or: no Chapter 4–5 at all, or anything goes.
4. **The Short:** **recorded in portrait (1080×1920) with the game's narrow layout**, or cropped from the landscape footage (softer, less work).
5. **The X video:** **16:9, about a minute, captions burned in**, or square (1:1, bigger in the phone feed), or the Short reused.
6. **The link on the end cards and in the descriptions:** what is the game's public URL?
   - **Until you say, a placeholder,** plus the GitHub repo and @RadWebGame.
7. **Say that the playthrough was played by the game's own autoplayer:** **yes, one line in its description**, or no.
8. **Frame rate:** **30 fps, or 60 if M0 shows the capture holds 60 cleanly.**
9. **What changes in the game:** **anything that makes it clearer or more forgiving (§3.2). Bigger design changes are only written down.**
