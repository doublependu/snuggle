# Next 6: what was built for plan 6, and what comes next

Summary of the implementation of `ai/plan_6.md` (answering `ai/prompt_6.md`), with every decision on its default:
- `+` for uncommitted changes, counting untracked files
- bottom-left on touch screens
- shown on the loading screen too
- `v.dev` on the dev server, `v.????` for a build that doesn't know its commit

## What was built

### The label (`index.html`)
- **`<div id="ver">`**, after the loading screen, with its CSS in the page's own `<style>`:
  - 10 px monospace, half opacity, `pointer-events: none`, inside the safe area
  - **on the loading screen:** dark ink, above it (z-index 51)
  - **in the game:** cream with a dark shadow, under the whole UI (z-index 19; `#ui` is 20)
  - **corner:** bottom-right, and bottom-left on touch screens (`body.touch`), where the Hum button takes the bottom-right
- **The source says `v.dev`.** That's what the dev server and the e2e tests show.

### The version (`vite.config.js`, plugin `snuggle-version`, production builds only)
- **In order:**
  1. `WORKERS_CI_COMMIT_SHA` (Cloudflare Workers Builds)
  2. `git rev-parse HEAD`, plus `+` when `git status --porcelain` lists anything
  3. `v.????`
- **Always exactly 4 characters.** The hash is sliced, because git's `--short=4` can print more.
- **The build fails** if `index.html` loses the `v.dev` marker (like the model revisions' marker).
- **Checked:**

  | Case | Shows |
  |---|---|
  | This tree with changes | `v.9305+` |
  | A clean clone | `v.9305` |
  | `WORKERS_CI_COMMIT_SHA=abcdef…` | `v.abcd` |
  | No git | `v.????` |

### The bug report
- A `version:` line, second, read from `#ver`.

### Checks
- **e2e `version-corner-desktop`, `-portrait`, `-landscape`:**
  - on the loading screen: the label says `v.dev`, shows, takes no taps, and is above the loading screen
  - after Begin, with the helper, objective, a dialogue and every touch button (Act, Assist) showing: it's under the UI, in its corner, and overlaps none of them
- **e2e `bug-report`:** also checks for `version: v.dev`.
- **`npm run cf:check`:**
  - a problem if the site has no version, or a different one from your local `dist/`
  - otherwise prints it, with "(built with uncommitted changes)" for a `+`
- **README:** a "Version" bullet in "Deploy".

## Measured
- **`npm run budget`:** first-visit JS 238.3 → 238.4 of 240 KB (the bug report's line). Everything within budget.
- **`npm run cf:check`:** all good; `✓ version v.9305+ (built with uncommitted changes)`.
- **`npm run e2e`:** 42 of 43 pass, including the 3 new `version-corner-*` tests.
  - **`market-guide` fails, and was already failing on `HEAD` (`93053dd`) without this change** (checked twice on a clean clone).
  - The dev floor check reports `[floor] xiaopei in market is 0.12 m under the floor at 13.7, 2.5`.
  - The test moves Pip to the lost child's parent in 3 m `teleport` hops, and one hop lands her inside a floor there. `ai/next_5.md` reported every test passing, so this is either a hop that only sometimes lands on that spot, or a real low floor at that point. Not investigated.
- **`npm run perf`** (median of 5, must-pass profile), unchanged within run-to-run noise:

  | Zone | Before (`next_5`) | Now |
  |---|---|---|
  | Train | 1.53 s | 1.58 s |
  | Station | 1.84 s | 1.79 s |
  | Academy | 2.19 s | 2.16 s |
  | Market | 1.73 s | 1.72 s |
  | Quiet District | 1.74 s | 1.74 s |
  | Repeat visit | 0.65 s | 0.65 s |

## Deviations from the plan
- None.

## Known issues / limitations
- **Notes in `ai/` that aren't committed yet add the `+`,** like any untracked file. Commit first, then deploy, and the label is exact.
- **A deploy without git** (from a zip) shows `v.????`, and `cf:check` reports it as a problem.
- **The README's deploy URL still says `snuggle-sorcery.<your-subdomain>.workers.dev`.** `wrangler.jsonc` now names the Worker `snuggle` (your commit `09dabb3`), so the URL is `snuggle.<your-subdomain>.workers.dev`.

## What to work on next (suggested order)
1. **Commit, then deploy,** and check the corner says the commit you deployed (`npm run cf:check -- <your URL>` checks it too).
2. **`market-guide`:** find out whether Pip can really sink into the floor at (13.7, 2.5) in the market by walking there, or only by the test's teleport hops. Fix the floor or the test.
3. **From `ai/next_5.md`:** pick from the playtest suggestions in `ai/playtest_5.md`, play on your phone (the plan 2 retest and the sound levels), then Chapter 4.
4. **Budget headroom:** first-visit JS is at 238.4 of 240 KB. Moving the Sprite Book, the bug report UI and the cooking mini-game into lazy chunks (from `ai/next_4.md`) would give room again.
