# Next 3: what was built for plan 3, and what comes next

Summary of the implementation of `ai/plan_3.md` (answering `ai/prompt_3.md`). Neither issue was part of the
story, and both came from the same bug, so one fix covers them.

## What was built

### The fix (`src/actors/humanoid.js`)
- **The bug:** the head look-at (plan 2 M3) multiplied its turn onto the `neck` and `head` bones every frame.
  - It assumed the animation mixer had just reset them. But three.js only writes a bone whose clip value changed, and no clip animates the neck.
  - So each frame's turn was added to the last:
    - Xiao Pei's head **spun** while someone talked to her, since her body doesn't turn toward the speaker.
    - Tangtang, who is taller and looks down at Xiao Pei, had her neck **fold forward until her head sat in her chest**. It stayed there, because ending the look never undid it.
  - Every character was affected. Plan 2's own screenshots showed it (`chapter2-hook.png`, `followers.png`, `market-flock.png`).
- **The fix:** `updateLook` now saves each bone's clip pose and the turned pose it leaves. The new `unlook()` puts the clip pose back just before `mixer.update`, so the turn is applied to a clean pose once per frame.
  - A bone is only restored if it still holds exactly the turned pose. If something else has posed it since (the viewer's frame picker, `sitPose`, a bind-pose reset), that pose is kept.
  - Only on frames where the mixer runs (after the LOD skip), so distant characters don't flicker.
  - The look maths is unchanged: up to 60° sideways, split 35% neck and 65% head, and a nod of -16° to +13°.
- **Cost:** two quaternion copies per character per frame, and no allocations after the first look.

### Tests (`tools/e2e/`)
- **New helpers in `run.mjs`:**
  - `h.heads()` gives every visible character's neck turn away from its pose and head tilt from vertical.
  - `h.headsUpright(where)` asserts neck ≤ 25° and tilt ≤ 50°. Characters playing `overwhelmed` are skipped (that clip tilts the head 59°).
  - `h.watchHeads()` and `h.worstHeads()` record the worst values frame by frame.
- **Where the thresholds come from:** I measured every clip on every character in `?viewer`.
  - Head bones point straight up in the bind pose.
  - Clips tilt them at most 24° (`shy`), except `overwhelmed`.
  - The look-at turns the neck at most about 22°.
- **New test `look-no-drift`:**
  - **Talking:** Xiao Pei stands 1.4 m to Tangtang's side, turned 70° away, while Tangtang talks for 15 s. No neck may pass 25°, no head may tilt past 50°, and Xiao Pei's neck must turn at least 5° (proof she looked).
  - **Walking away:** within 1.5 s, both necks are back within 1° of their pose.
  - **Followers:** Tangtang and Wei Bao follow her for about 12 s under the same limits.
  - It writes `look-tangtang.png`.
- **"Heads upright" checks added to the story tests:**

  | Test | Checked |
  |---|---|
  | `train-reload` | while the auntie talks in the lap scene |
  | `followers-academy` | at the end |
  | `market-flock` | while sitting with the flock |
  | `chapter1-full` | after meeting Tangtang, after baking with her, and at the end |
  | `chapter2-full` | on the walk home (Xiao Pei's line) and at the end |

### Viewer
- A **look** checkbox (or `?viewer&look`) makes every character look at the orbit camera. It works on animated clips and on frozen frames.
- Checkboxes now show their starting state.
- The README's URL list mentions `&look`.

## Measured

**Before the fix, the new checks fail:**

| Test | Result on the old code |
|---|---|
| `look-no-drift` | Xiao Pei's neck spun through 180°. Tangtang's neck bent 143°, and her head tilted 112° from upright. |
| `market-flock` | Tangtang's neck 151°, Wei Bao's 87° |
| `train-reload` (lap scene) | Xiao Pei's and the auntie's necks both 172° |

**After the fix:**
- `npm run e2e`: all 20 tests pass (about 8 minutes).
- The regenerated `chapter2-hook.png`, `followers.png` and `market-flock.png` show every head upright.
- `look-tangtang.png` shows Tangtang looking at Xiao Pei after talking for 15 s, and Xiao Pei's head turned toward her and holding still.

**Load size** (`npm run budget`): unchanged. JS is 233 / 233 / 239 / 241 KB gzipped for train / station / academy / market, and a first visit is 740 KB in total.

**Time to interaction** (`npm run perf`, median of 5 runs): unchanged, within 0.1 s of `next_2.md`.

| Zone | Must-pass (target 3 s) | Goal (target 1 s) |
|---|---|---|
| Train | 1.47 s | 0.39 s |
| Station | 1.80 s | 0.45 s |
| Academy | 2.14 s | 0.53 s |
| Market | 1.69 s | 0.42 s |

## Deviations from the plan (and why)
- **The restore only happens if the bone still holds the turned pose.** The plan's version always restored. That would have undone a pose set outside `update()`, like the viewer's frame picker or a bind-pose reset.
- **The train check is in `train-reload`, not `train-normal`.** `train-reload` reaches the lap scene at a known point. The check waits for the auntie's line: the scene opens with narration, and with no speaker nothing drifts, so a check there passed on the old code too.
- **`chapter1-full` checks three times**, including right after baking with Tangtang in her kitchen (the prompt's issue 2).

## Known issues / limitations
- **Xiao Pei's body doesn't turn toward whoever is talking** (plan 3 open question, default "not now"). Her head turns up to 60°. If the speaker is behind her, she doesn't look round.
- **Still waiting on your iPhone retest** of the plan 2 fixes (zoom, the top buttons, reload mid-train).
- **fps is still unmeasured on real GPUs.** Headless tests use SwiftShader.

## What to work on next (suggested order)
1. **Your iPhone retest** of the plan 2 fixes. **Copy bug report** in the pause menu makes anything you find quick to turn into a fix with a test.
2. **Chapter 3: The Quiet District**:
   - the grey Grumblings
   - Honk's *"Nobody remembers us"*
   - Master Fang's story of the fog
   - the shuttered district with height fog and the `uFade` grey-out
   - Charm Sprite memories
   - the shuttered-shop kit
3. **Plan 1 M7:** the faceted rebuild of the chapter 0–1 Grumblings, with the sparrow as the template.
4. **Feel:**
   - turn in place
   - footstep dust
   - matching walk speed to the animation
   - optionally, Xiao Pei turning to face whoever is talking to her
5. **Audio:** composed music (lazy-loaded), and a per-zone ambience mix.
6. **Nice-to-haves:** a service worker for repeat visits, remappable controls, a text-size option, and an erhu prop for the musician.
