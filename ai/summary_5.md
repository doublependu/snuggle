All of plan 5 is implemented. The final uncut recording plays from a fresh game to the "Chapter 4 … coming soon" card with no stalls, and all 40 e2e tests pass. Nothing is committed.

**Watch this first:** `tools/playtest/out/2026-09-30-16-34/playthrough.mp4` (24 min, 1280×720, 30 fps, with sound, chapter markers). Turn on its subtitle track to see what the autoplayer was thinking. The first recording is kept next to it as the "before" (28 min). It needed the in-game "Stuck? Back to last checkpoint" twice, both times through the autoplayer's own mistakes, since fixed. Both are git-ignored.

**The issue (stuck in the ground after the lesson):**
- **Cause:** she stood up at the seat marker's height, which is ground level, so she ended up inside the pavilion's stone platform. The collision then pushed her down instead of up, and the platform's walls held her in. The end of Chapter 3 (Master Fang's story, same bench) had the same bug.
- **Fix:** standing up and teleports now land on the floor, and a floor always pushes her up.
- **A related bug turned up:** the collision ramps over the front steps of every hall, the library, the pagoda and the pavilion were tilted the wrong way. You could only jump up. `build_kit.py` is fixed; Blender wasn't running, so I patched `kit.glb` with a script to match.
- **A new floor check** (dev builds only) found more:
  - Master Fang's feet were in the pavilion steps.
  - Two sleepy sprites were buried in a dorm porch.
  - Bo stood inside the overlook bench; he now sits on it.

**Names:** Pip, Sunny Lin, Bo, Bean, and Master Fang's given name Autumn. Internal ids are unchanged, so existing saves work. The README has a new Characters section.

**Autoplayer:** `npm run playtest`, add `--record` to record.
- It plays in real time with keyboard and mouse, deciding only from what's on screen. It reads the objective, tips and dialogue, follows directions it hears, learns names, and reasons which Charm Sprite remembers a clue.
- `tools/playtest/eyes.js` is the only part that touches the game. The eyes also report distances to walls and the music's beat, which is a little beyond "pixels only".
- `review.mjs` checks a recording without watching it: contact sheets, frames at each logged event, and freeze and loudness measurements.

**Bugs the runs found (all fixed):**
- On a keyboard you can't walk slowly, so sparrows and grey Grumblings fled when you walked up gently. Now only sprinting scares them.
- Esc couldn't close the pause menu, and closing the last open menu with a key (Esc or Tab) threw an error.
- Sunny stops at the top of the station path without a word while the objective still says follow her. She now says the Academy is just ahead.
- The dumpling-stall meeting only triggered in front of the stall; its sides count now.

**What the recording showed:**
- **Dialogue:** 61% of a first playthrough is reading.
- **No pressure:** Calm never ran out.
- **"Everyone Together" is an instant win:** that team-up soothes a whole flock at once, so you never work out which free thing each sparrow loves.
- **Cozy Energy caps at 100:** its only use is Bo's Echo Friend.
- **The sound is quiet:** −27.7 LUFS overall, where games usually sit around −16 to −20.

`ai/playtest_5.md` has the full friction log and eleven ranked suggestions. They're written down only, none built.

**Numbers:** the first-visit JS is 238.3 of 240 KB (+0.2 KB), and the load times are unchanged (1.5–2.2 s on the throttled profile).

**Changes from the plan:**
- Most bugs were fixed during the chapter-by-chapter development runs, so even the first full recording already includes those fixes. The development runs are deleted; their findings are written up with causes and tests.
- I skipped the hand-played first look through the Playwright MCP; the autoplayer's frames covered it.
- Sound and picture sync is only spot-checked: the two dialogue blips I could find line up within about 0.1 s.

What was built and what's next is in `ai/next_5.md`.
