# Next 9: what was built for plan 9, and what comes next

Summary of the implementation of `ai/plan_9.md` (answering `ai/prompt_9.md`), with your two changes to the plan
(the game is at sn0.maize.live; the playthrough in parts of about 20 minutes) and every open question on its
default. The autoplayer now plays the whole game, from the train to its own ending in free roam, like a person;
the recordings of it are cut into the four videos; and what confused it about the game is fixed. Nothing is
committed, uploaded or posted.

- **The videos** are in `tools/video/out/` (git-ignored). Their titles, descriptions, chapters and the X post are
  in `ai/videos_9.md`.
- **The playtest** (what confused a player, what was fixed, what wasn't) is `ai/playtest_9.md`.

## What was built

### M1 and M2: the autoplayer plays the whole game, like a person (`tools/playtest`)
- **The rest of the game:** sheltering from sighs (behind walls, in warm light, back to a spot that sheltered it
  before, hurrying when one is close), Stitch (loose ends to the glow with the same picture), Chapter 5's five
  phases, the Epilogue, and free roam: the worry board and its worries (pom-poms led to their company), fishing,
  the first-years' train and tour, travel with Captain Honk, and its own ending, looking up at the Everyone
  Blanket.
- **Still only what's on screen,** with real keyboard and mouse input. The start-up check still fails a run whose
  decision code reaches into the game. The eyes (`eyes.js`) learned the fog, warm light, a sigh coming,
  fingerposts and signs, golden memory figures, the guide's arrow, step-ups and step-downs, and water over a
  railing.
- **Finding the way** (`nav.js`): a grid map from what it has seen, A* over it, with unknown ground costing more
  than known, routes that end within a metre of what it's going to (it's often on something), a steering point
  held for a second in tight spots, retracing its own trail when it keeps bumping, and following the game's
  guide when it shows and nothing is working.
- **How it looks** (`hands.js`, `brain.js`): eased camera turns at ≤110°/s, a small turn back the other way
  within 1.2 s waits (no twitching), walking near people, running only on long clear stretches. Each run's
  summary measures it (`## How it looked`).
- **A memory across takes:** `--save-in`/`--save-out` carry the game's save, and a `.mind.json` beside it carries
  what it knows (names, places to see, lessons). `--from` starting points are in `tools/playtest/saves.mjs`
  (`free2`: day 2 of free roam).

### M3: what confused a player, fixed in the game
Twelve fixes (four bugs, eight things made clearer or more forgiving), each with an e2e test where it fits
(`tools/e2e/tests9.mjs`): see `ai/playtest_9.md` §2–3. The biggest is a bug: **a place visited twice in one
sitting had no colliders** (walls, the ferry jetty, piers) the second time, so free roam's trip to the Quiet
District sank Pip into the harbour for good (`src/world/zone.js`: each visit builds from a copy of the cached
model).

### M4: recording
- **1920×1080 at 60 fps,** with the game's sound (`--record --fps 60`). The page is 1920×1080 at a pixel ratio of 1
  (the screencast captures CSS pixels), with the reading text at 1.5× (`--text`) so it reads as at 1280×720.
- **Clean takes:** a take with a checkpoint, a stall, confusion or a page error is recorded again (`--retries`),
  unless `--accept-dirty`.
- **`--portrait`** (1080×1920) for the Short.

### M5: footage beyond the playthrough (`tools/video`)
- **`shots.mjs` + `shots.json`:** 18 scenery shots, the camera on a path, the HUD hidden, no sound (`--stills` to
  compose them).
- **`music.mjs`:** the score, track by track (12 tracks of 150 s), levelled to −18 LUFS (`--level`).
- **`cards.mjs`:** title, spoiler, chapter, caption, end and thumbnail cards, in the game's own style.

### M6: the videos
- **`edit.mjs`:** an edit list (JSON) in, an MP4 out: cards, clips, captions, music, two-pass loudness to −14
  LUFS, chapters in the file and as a YouTube list, a thumbnail and a description.
- **`parts.mjs`:** the full playthrough's edit list, from the takes' own logs (where each chapter starts, where
  the loading screen ends).
- **`moments.mjs`:** the trailer's, X video's and Short's edit lists: each moment is found in a take's log ("✨
  New Charm Sprite: Lost Sock", "Stitched.", a fishing mini-game), so a re-recorded take gives a new cut with no
  times typed in. Clips are whole bars of the score (84 bpm).

## Measured

**The game** (after this plan's changes):
- **`npm run perf`** passes everywhere, on this machine's integrated Intel GPU: time to interactive 1.40–2.15 s at
  10 Mbps with a 4× slower CPU (target 3 s; the Academy, which `next_8` had at 3.1 s, is 2.15 s), and 0.46–0.69 s
  at 50 Mbps (target 1 s).
- **`npm run budget`** passes: first-visit JavaScript 238.4 of 240 KB (+0.1 KB for this plan's fixes).
- **`GPU=1 npm run e2e`:** all 120 pass, 9 of them new (`tools/e2e/tests9.mjs`; each fails without its fix), and
  `signs-heart` covers the new "To the Quiet District" board.

**The takes:** see `ai/playtest_9.md` §1 (lengths, frame rate, reading share, how it looked).

**The videos** (`tools/video/out/`; loudness and true peak measured on the files):

| Video | Length | Size | Loudness | True peak | Chapters |
|---|---|---|---|---|---|
| Part 1: The Rainy Train and the Night Market | 19:52 | 884 MB | −14.3 LUFS | −1.2 dB | 4 |
| Part 2: The Quiet District | 12:42 | 320 MB | −14.3 | −1.5 | 8 |
| Part 3: Bean's Secret | 15:01 | 415 MB | −14.0 | −1.0 | 5 |
| Part 4: The Great Sulk, and Morning in Lantern Bay | 23:44 | 881 MB | −14.1 | −1.0 | 4 |
| Part 5: Lantern Bay, the bonus | 17:19 | 859 MB | −14.1 | −1.2 | 6 |
| Trailer | 4:25 | 220 MB | −14.0 | −1.5 | |
| X video | 0:54 | 51 MB | −13.9 | −2.6 | |
| Short (1080×1920) | 0:48 | 32 MB | −13.9 | −2.4 | |

All 60 fps, H.264 High with AAC at 48 kHz, `+faststart`. The playthrough comes to 88:38 in five parts. Rendering
took about 45 minutes for the parts (x264 `medium`) and 19 for the trailer (`slow`).

## Deviations from the plan (and why)

- **Five parts, not four.** Measured, Chapters 3 and 4 together come to about 29 minutes, so each is a part of
  its own: Prologue–Chapter 2, Chapter 3, Chapter 4, Chapter 5 and the Epilogue, free roam.
- **Four takes, not five.** Take 4 played on past the Epilogue's last card into free roam (its stop words were the
  card's subtitle, which the autoplayer doesn't keep), until the autoplayer's own ending. That was Part 5's
  content, from the same save, so Part 5 is cut from the rest of Take 4 (`parts.mjs` does this when given four
  takes).
- **Take 4 was kept with two marks against it:** in the 6 s between the "Chapter 5 complete" card and the
  Epilogue's, it had no objective and called that confusion (an autoplayer rule, fixed since; those 1.7 s are cut
  from Part 4), and in free roam it wandered the Old Quarter for 45 s on its way to the square (left in: a player
  coming back could too). Recording it again would have been another 40 minutes for the same footage.
- **No separate gameplay close-ups** (plan §5.2). The trailer, X video and Short take their gameplay from the
  playthrough's takes and the Short's portrait takes.
- **The portrait takes are 1080×1920 at a pixel ratio of 1,** not 432×768 at 2.5 (the screencast captures CSS
  pixels): the game lays itself out for a tall window, not a phone.
- **Camera twitches and wall bumps are above the plan's targets** (§1.2: at most 1 per 5 min, 1 per 2 min): 0.7–8.6
  and 4.4–4.9. Twitches came down from 12–54 with the fixes above; bumps didn't (low clutter its rays don't
  catch, and setting off from a shelter tucked against a wall).

## Known issues / limitations

- **The autoplayer's map is flat:** a platform and the track beside it, a bridge's deck and the water under it,
  are the same squares to it. Free roam's station worry and the pond bridge's fishing spot from the side still
  trip it (`ai/playtest_9.md` §4).
- **Part 4 shows the game's guide stepping in at Chapter 5's oven:** it was recorded before that fix (#5 in
  `ai/playtest_9.md` §3). The other fixes are in the videos.
- **The takes are 1.2–2.4 GB each** (near-lossless, for re-encoding); the finished videos are smaller.

## What to work on next (suggested order)

1. **Watch the videos,** then upload them and post (yours): the text is in `ai/videos_9.md`, with `[link]`
   placeholders for the playlist and the other parts.
2. **Commit** (the game's fixes, the tests, `tools/playtest`, `tools/video`, the `ai/` files are separate,
   sensible commits), **then deploy,** so the game the videos send people to has the fixes.
3. **Teach the autoplayer heights** (step-ups it can climb, platforms, bridges), so free roam's station and the
   bridge work from any side, and the bumps come down.
4. **The suggestions in `ai/playtest_9.md` §5,** smallest first: worry notes that name a signed landmark, a test
   that travels everywhere twice, fewer sighs while carrying a thread.
