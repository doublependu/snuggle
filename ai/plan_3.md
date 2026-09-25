# Plan 3: Heads that spin and heads that fold away

Answers `ai/prompt_3.md`. Builds on `ai/plan_2.md` and `ai/next_2.md`.

## 0. Short answer

- **Neither issue is part of the story.** Nothing in `snuggle_sorcery_story.md` has a head spinning or coming off, and Tangtang is a bubbly baker. Both are bugs, so both get fixed.
- **One bug causes both.** It is in the head look-at added in plan 2 (M3, `Humanoid.updateLook`):
  - The look-at adds a small turn to the neck every frame.
  - Nothing ever takes that turn off again, because no animation clip moves the neck, so the turns pile up.
  - On Xiao Pei this is a steady spin.
  - On Tangtang, who is taller and looks down at Xiao Pei, the neck bends forward until her head is folded into her chest, and it stays there.
- **The fix is about 10 lines in `src/actors/humanoid.js`:** undo last frame's look turn before the animation mixer runs. No model rebuild, no change to load size.
- **Regression checks:**
  - A new e2e test that reproduces both bugs.
  - A "heads upright" check added to the existing story tests.
  - Screenshots from plan 2's tests already showed the bug, but nothing asserted on poses.
- **Nothing else is in this plan.** The prompt has no feature list. The "what to work on next" list in `next_2.md` stays as it is.

## 1. What went wrong (diagnosis)

### 1.1 How the look-at works today
- Each frame, `Humanoid.update` runs `mixer.update()`, then `updateLook()` (`humanoid.js:229-230`).
- `updateLook` turns the `neck` (35%) and `head` (65%) toward `lookTarget`. It does this by multiplying the extra turn onto whatever each bone already holds (`humanoid.js:266`).
- That only works if the mixer has just rewritten both bones with the clip pose. Often it hasn't.

### 1.2 Why the turns pile up
- **The mixer skips unchanged bones.** three.js only writes a bone when its blended value differs from the last frame's (`node_modules/three/src/animation/PropertyMixer.js:231-237`, "value has changed -> update scene graph").
- **No clip animates `neck`.** I checked all 16 clips in `anim_humanoid.glb`.
  - `retarget()` gives the neck a one-key constant track (`humanoid.js:68-71`), so its value never changes.
  - After the first frame, the mixer never writes the neck again, and each frame's look turn is multiplied onto the previous one.
- **`head` has the same problem at times.**
  - Most clips animate it, so it is usually rewritten every frame.
  - It still drifts during `land`, which has no head track, and whenever a clip holds a still pose.
- **Ending the look doesn't undo it.** When the look fades out, `updateLook` just stops adding (`lookW < 0.01` returns early), so the neck stays wherever it ended up.

### 1.3 Issue 1: Xiao Pei's head spins
- During dialogue, Xiao Pei looks at the speaker (`player.js:209-211`), but her body doesn't turn toward them. So the angle to Tangtang is the same every frame, and her neck gets the same turn added every frame.
- **Measured** (headless Chrome, Academy kitchen): Xiao Pei stood 1.4 m to Tangtang's side, with a Tangtang line open. Her neck went through a full turn about every 1.3 s.
- It happens with any speaker. Tangtang just has the most lines.

### 1.4 Issue 2: Tangtang's head "chopped off"
- NPCs turn their bodies to face Xiao Pei (`npc.js` `turnTo`), so the sideways part of the turn fades out. The up-down part doesn't:
  - Tangtang is 1.35 m tall and Xiao Pei is 1.15 m, so Tangtang looks down at her.
  - Each frame's downward nod is added to the last, and her neck keeps bending forward.
  - It stops only when her head joint has dropped to Xiao Pei's eye level.
- **Measured** in the kitchen with Xiao Pei standing in front of her: the neck bent 64° after 3.6 s, 113° after 12 s, and settled at about 123°. From the kitchen doorway, her beret sits at chest height, below the table top.
- **Why it looks permanent:**
  - Nothing resets the neck (§1.2).
  - While she follows you in Chapter 2, she is always within 4.5 m, so the look is always on.
- **I ruled out the model.**
  - In `?viewer` with no look-at, her head looks right from the front, three-quarter, side and back, in the bind pose, idle, walk and talk.
  - Each character is a single skinned mesh, so no separate head mesh can be culled away.

### 1.5 It affects everyone, and plan 2's screenshots show it
- `tools/e2e/out/chapter2-hook.png`: Xiao Pei's head lies on its side while she speaks.
- `followers.png` and `market-flock.png`: Tangtang's and Wei Bao's heads are tilted right over.
- Master Fang and the townsfolk run the same code, so they are affected too.
- The tests passed because none of them checks a pose.

## 2. The fix (`src/actors/humanoid.js`)

### 2.1 Apply the look turn to a clean pose, once per frame
- **Save the clip pose.** In `updateLook`, before turning `neck` and `head`, copy each bone's quaternion (the pose the mixer left) into `this.lookBase[name]`, and set `this.lookApplied = true`.
- **Restore it.** In `update`, just before `mixer.update`, copy `lookBase` back into both bones if `lookApplied` is set, then clear the flag.
- **Result:** the mixer then either writes a new clip value or leaves the restored clip pose, and both are correct. The look turn goes on top once, never on top of itself.
- **Only on frames where the mixer runs.** The restore goes after the LOD skip (`if (this.lodFrame % every) return`), so distant characters keep their turned head between updates instead of flickering.
- **Fading out.** When the look fades (`lookW < 0.01`), the restore still runs, so the neck and head go back to the clip pose.
- **The look maths stays the same.** Up to 60° sideways, split 35% neck and 65% head, with a gentle nod of -16° to +13°.

### 2.2 Alternatives considered
- **Give every clip a moving neck track.** This changes the animation library, and `head` would still drift in `land` and in still poses.
- **Rebuild the neck from its rest pose every frame.** This would work for the neck, but the head carries clip motion, so it would need a different rule.
- **Restoring before the mixer** handles both bones the same way, and any bone the look-at touches later.

### 2.3 Cost
- Two quaternion copies per character per frame. No new objects per frame (the `lookBase` quaternions are allocated once).
- No asset, shader or load-time change. `npm run budget` and `npm run perf` should be unchanged.

## 3. Tests (`tools/e2e/`)

### 3.1 New test: `look-no-drift`
- **Setup:** the Academy kitchen, Xiao Pei 1.4 m to Tangtang's side and turned 70° away, with a Tangtang line open for 15 s. This setup reproduced both bugs in §1.
- **Checks**, sampled every 100 ms for Xiao Pei and every NPC in the zone:
  - **Neck stays within its limit.** The neck turns at most 25° from its rest pose. No clip moves the neck, so its rest pose is its clip pose. The look-at's own limit is about 22°.
  - **Head stays upright.** The head bone's up axis is within 50° of the character's up axis.
- **Then** close the line and walk Xiao Pei 8 m away. Within 1.5 s, every neck must be back within 1° of rest.
- **Followers:** the same checks for Tangtang and Wei Bao while they follow Xiao Pei (reusing the `followers-academy` walk).
- **Screenshot:** writes `look-tangtang.png`, Tangtang from the front, for eyeballing like the `seats-*.png` shots.
- **Fails first.** I'll run it on the current code to confirm it fails, then again with the fix to confirm it passes.

### 3.2 "Heads upright" on every story path
- Add a helper, `h.headsUpright()` in `run.mjs`. It asserts the head-up check for Xiao Pei and every NPC.
- Call it at the end of the tests where people talk: `train-normal`, `chapter1-full`, `followers-academy`, `market-flock` and `chapter2-full`.
- That covers the whole story so far with no new scenarios. It would have caught this bug in plan 2.

### 3.3 Viewer: a "look" toggle
- A **look** checkbox in `?viewer` makes every character look at the orbit camera.
- To check how the head turn reads on each character, orbit around them. This makes it easy to review future characters and rigs too.

## 4. Milestones
1. **M1: fix and tests.**
   - Write `look-no-drift` and confirm it fails on the current code.
   - Apply §2.1 and confirm it passes.
   - Add `headsUpright()` to the five story tests and the viewer toggle.
2. **M2: verify and hand off.**
   - Run the full `npm run e2e` (20 tests).
   - Recheck the regenerated `chapter2-hook.png`, `followers.png` and `market-flock.png` by eye.
   - Run `npm run budget` and `npm run perf` as a sanity check.
   - Write `ai/next_3.md`.

## 5. Files

| File | Change |
|---|---|
| `src/actors/humanoid.js` | Save the clip pose in `updateLook`; restore it before `mixer.update` in `update` |
| `tools/e2e/tests.mjs` | New `look-no-drift` test; `headsUpright()` calls in five story tests |
| `tools/e2e/run.mjs` | `headsUpright()` helper |
| `src/dev/viewer.js` | **look** checkbox (characters look at the camera) |
| `ai/next_3.md` | Summary and what's next |

## 6. Verification
- `npm run e2e`: all 20 tests pass, with `look-no-drift` failing before the fix and passing after.
- **By hand** in `npm run dev`:
  - `?zone=academy`: talk to Tangtang from the side and from behind her shoulder. Xiao Pei's head turns toward her and stays still, and Tangtang's head stays on straight.
  - Walk away: both heads come back to centre.
  - `?zone=market`: the same checks with Tangtang and Wei Bao following you.
- `npm run budget` and `npm run perf`: unchanged (no asset or loading change).

## 7. Out of scope (stays in `next_2.md`'s list)
- Your iPhone retest of the plan 2 fixes.
- Chapter 3 (The Quiet District), plan 1 M7 (faceted Grumblings), feel, audio, and the nice-to-haves.

## 8. Open question (default in bold; I'll go ahead with the default unless you say otherwise)
1. **Should Xiao Pei also turn her body toward whoever is talking?**
   - With the fix, her head turns up to 60° toward the speaker and stops there. If the speaker is behind her, she doesn't look round.
   - Turning her whole body when she's standing idle would read more naturally, but it changes how dialogue feels.
   - **Default: not in this plan.** It can join the "Feel" item in `next_2.md`.
