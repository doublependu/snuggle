# Plan 6: The game's version in a corner

Answers `ai/prompt_6.md`. Builds on `ai/next_5.md`.

## 0. Short answer

- **What it shows:** `v.` + the first 4 characters of the commit the build came from, e.g. **`v.9305`**.
  - **`v.9305+`** when the build had uncommitted changes, so it isn't exactly that commit (§2.2).
  - **`v.dev`** on the dev server (`npm run dev`, the e2e tests).
- **Where:** a small, faint label in the corner nothing else uses (§1):
  - bottom-right with a keyboard and mouse
  - bottom-left on touch screens, where the Hum button takes the bottom-right
  - on the loading screen too, so a page that fails to load still says which build it is
- **The bug report** gets a `version:` line, so every report says which build it came from (§3).
- **How:** the build writes the version into `index.html` (like the model revisions today). No JS on the first load, about 0.2 KB of HTML.
- **Checks:** a new e2e test for the label's place, the bug-report test checks the line, and `npm run cf:check` checks that the site serves the version you built (§4).

## 1. Where it goes

### 1.1 What's in each corner today (`src/ui/ui.css`)

| Corner | Keyboard and mouse | Touch screen |
|---|---|---|
| Top-left | Cozy Energy, chips | same |
| Top-right | Sprite Book, Pause | same |
| Bottom-left | the helper (and `?debug`'s panel) | the stick area: invisible until a thumb lands; the helper and debug panel move to the top |
| Bottom-right | **nothing** | Hum (92 px) and Jump |

- **Bottom-right on touch is too tight.** On an iPhone held sideways, the safe-area insets (about 47 px at the side, 21 px at the bottom) put a label right under the Hum button.
- **Bottom-left on touch is empty to the eye.** The stick only appears where the thumb lands, and the label doesn't take taps.
- So the label moves with the input device, the way the helper does (`body.touch`, set by `main.js` from `core/input.js`).

### 1.2 How it looks
- 10 px monospace, half opacity, a few pixels in from the corner, inside the safe area (`env(safe-area-inset-*)`).
- Cream with a dark shadow over the game, so it reads over the bright Academy and the night market alike. Dark ink on the cream loading screen.
- `pointer-events: none`: it never takes a click or a tap.

### 1.3 Layering
- **On the loading screen:** above it (z-index 51; `#loading` is 50).
- **In the game:** under the whole UI (z-index 19; `#ui` is 20). The HUD, dialogue, menus, fades and chapter cards all cover it.
  - The menus' see-through backdrop dims it, the fade to black hides it, and nothing in the game ever sits under it.
- One CSS rule switches between the two: `#loading.gone ~ #ver`.

## 2. Where the version comes from

### 2.1 Built into `index.html`
- `index.html` gets `<div id="ver">v.dev</div>`, after `#loading`, with its CSS in the page's own `<style>`.
- A new plugin in `vite.config.js` (`snuggle-version`, production builds only) replaces `v.dev` with the real version, and fails the build if the marker isn't there (like the model revisions' `var rev = {};`).
- **The cost:**
  - No JS before Begin (first-visit JS is at 238.3 of 240 KB).
  - About 0.2 KB more `index.html` after gzip.
  - The bug report's line adds a few bytes to the entry chunk.
- **A new deploy shows up on the next load.** The page is network-first, including with the service worker. A player offline on a cached build sees that build's version, which is right.

### 2.2 Which commit
In order:
1. **`WORKERS_CI_COMMIT_SHA`:** set by Cloudflare Workers Builds when it builds a pushed commit (deploy on every push, README "Deploy").
2. **`git rev-parse HEAD`:** a local `npm run deploy`, `npm run build`, `cf:dev`.
   - **Uncommitted changes add `+`:** `git status --porcelain` lists anything (git-ignored files like `dist/` and `node_modules/` aren't listed).
   - You commit yourself, so a deploy before the commit would otherwise label code with a commit it isn't in.
   - Untracked files count too (a new model or module would ship). Notes left in `ai/` before a commit would also add the `+`.
3. **`v.????`:** a build with neither, e.g. from a downloaded zip. It doesn't know its commit, and says so.

### 2.3 Four characters
- `git rev-parse --short=4 HEAD` can print more than 4 when 4 is ambiguous. The plugin slices the full hash to exactly 4.
- There are 65,536 values. Two of 300 commits share a prefix about half the time. A label only needs matching to a commit (`git log --oneline | grep ^9305`), and the date settles a clash.

## 3. The bug report
- `bugReport()` (`src/ui/menus.js`) gets a second line: `version: v.9305`, read from `#ver`.

## 4. Checks
- **e2e `version-corner`** (desktop 1280×720, phone portrait and landscape):
  - on the loading screen, the label shows `v.dev`, sits inside the viewport and is above `#loading`
  - after Begin, it's inside the viewport and doesn't overlap any HUD or touch control (`.hud-tl`, `.objective`, `.hud-tr`, `.helper`, `.tbtn`)
  - it's bottom-right with a keyboard and mouse, bottom-left on touch
- **e2e `bug-report`:** also checks for `version: v.dev`.
- **The touch-hit tests** already check that every HUD and menu button gets its tap. They must still pass.
- **`npm run cf:check`** (`tools/deploy-check.mjs`):
  - a problem if the served page has no version, or a different one from your local `dist/` (deployed a different build?)
  - prints the version, with a note when it has a `+`
- **A build check by hand:** `npm run build` with a clean tree shows `v.<4 hex>`; with a changed file it shows the `+`.
- **`npm run budget` and `npm run perf`:** still within budget, and time to interaction unchanged.

## 5. Files
- `index.html`: the `#ver` element and its CSS
- `vite.config.js`: the `snuggle-version` plugin
- `src/ui/menus.js`: the bug report's `version:` line
- `tools/e2e/tests.mjs`: `version-corner`, and `bug-report` updated
- `tools/deploy-check.mjs`: the version check
- `README.md`: one line in "Deploy" on what the label means

## 6. Decisions on a default (say if you want them different)
1. `+` for uncommitted changes, counting untracked files.
2. Bottom-left on touch screens.
3. Shown on the loading screen too.
4. `v.dev` on the dev server, `v.????` for a build that doesn't know its commit.
