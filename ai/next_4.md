# Next 4: what was built for plan 4, and what comes next

Summary of the implementation of `ai/plan_4.md` (answering `ai/prompt_4.md`), with every open question on its
default: Workers static assets, the free `workers.dev` URL, embedding allowed, the whole plan (M1–M9), the last
memory keeps "Qiuyue" and "five more minutes", Start again keeps your settings, synthesized music, and wrangler
as a pinned devDependency.

## What was built

### M1: "Start again from the train" (the prompt's issue)
- **The cause** (confirmed in headless Chrome before the fix):
  - The button cleared the save and reloaded.
  - The unload autosave from plan 2 (`visibilitychange` and `pagehide`) then wrote the old progress straight back.
  - A reload landed in the zone you were in.
- **The fix:**
  - `resetSave()` writes a fresh save that keeps your settings, then locks saving until the page is gone.
  - The reload drops `?zone=` and `?spawn=`. "Back to last checkpoint" and the context-loss reload do the same.
  - The browser's `confirm()` box is replaced by an in-game panel (Cancel is focused first), which works with touch and gamepad.
  - The button now reads "Start again from the train".
- **Tests:**
  - `restart-to-train` and `restart-url` (with `?zone=academy&spawn=…` in the URL).
  - The confirm buttons are part of `touch-hit-*`.
  - The e2e harness seeds its save once per tab (`sessionStorage`), so reload tests see the game's own save.

### M2: Cloudflare (wrangler)
- **The Worker:** `wrangler.jsonc` is an assets-only Worker serving `dist/`, so every request is a free static-asset request. A missing file is a real 404.
- **Caching** (`public/_headers`):
  - Everything under `/assets/` is cached for a year.
  - `index.html`, `sw.js` and the licence file revalidate.
  - `nosniff` and a referrer policy are set everywhere. There's no frame-blocking header.
  - `public/.assetsignore` keeps Vite's manifest from being uploaded.
- **Model revisions:** the build hashes every `.glb`, and each model URL carries it (`xiaopei.glb?v=…`), in the `index.html` preload map, in `loadGLB`, and so on. Dev builds keep plain URLs.
- **Scripts:**
  - `npm run deploy`: build, budget, then `wrangler deploy`.
  - `npm run cf:dev`: the real asset server locally.
  - `npm run cf:check [url]` (`tools/deploy-check.mjs`), which checks:
    - status, types and caching
    - revisions
    - that build-only files return 404
    - bytes on the wire
    - the service worker, in a real browser
- **Perf against any URL:** `URL=… npm run perf`.
- **README:** a "Deploy" section.
- **I have not deployed.** It needs your account: `npx wrangler login` once, then `npm run deploy`.

### M3–M5: Chapter 3, The Quiet District
- **The way in:**
  - After Chapter 2 the objective is "Walk home: up the stairs to the Academy".
  - The stairs lead to the grey morning, with the "Chapter 3" card and "The next morning…".
  - Existing saves that are already back at the Academy start there.
- **The grey morning** (`story/chapter3.js`):
  - Three grey Grumblings drift across the courtyard, and the courtyard sprites huddle.
  - Humming is refused, and Tangtang's tart is ignored.
  - Wei Bao's Echo Friend: *"Nobody remembers us. So we're going to where nobody remembers anything."*
  - Master Fang goes very still, and the greys drift out through the gate.
  - Wei Bao at the gate now offers the Quiet District and the night market.
- **The district** (`tools/blender/build_quiet.py` → `quiet.glb` and `quiet_kit.glb`; `world/zones/quiet.js`):
  - The places: the ferry jetty, the plaza with the noticeboard, the shuttered lane over a canal bridge, the thread-shop alley with its red-thread trail, the square with the banyan, the well and the teahouse, the fog street, and the kitchen door by the fog wall.
  - Across the water, the night market is still lit.
  - The kit: three tong-lau shopfronts (roll-down shutters, faded signboards, balconies with laundry), two house fronts, dead lanterns and strings, benches, stools, crates and planters.
- **The look** (`render/materials.js`):
  - The zone's scenery greys out (`uFade` finally wired) except inside up to eight pockets of colour.
  - A height fog is thicker near the ground and thickens toward the fog wall.
  - Glows (the red thread, lit windows) stay warm.
  - Characters and Charm Sprites keep their colour.
  - The water uses the same grey-out and fog.
  - `setGreyOut` resets on every zone change.
- **Grey Grumblings** (`systems/greys.js`, a new faceted blanket-lump model):
  - **Won't be hugged:** humming is refused (no thread, trust drops). Running makes them slide away, and their sigh slows you.
  - **Keeping one company:** stay within 2.5 m (3.2 m seated) without humming, and a cool-blue company ring fills over about 8 s.
    - Sitting (seven benches), friends nearby, and a restored memory close by make it faster.
    - It inches closer, and colour tints back into it (per-instance colour in the batch).
  - **Then it's ready:** *"…you're still here?"*, it's noticed, and the thread wraps it.
  - **Team-ups:** the snack, Echo, and "Everyone Together" combos work on a ready grey.
  - **Echo Friend** tells each grey's forgotten feeling (a birthday, a letter, "I'm fine, really", …).
  - **The sprite:** **Recall**.
- **Charm Sprite memories** (`systems/memories.js`):
  - **Finding one:** a glowing spot, "Look closer", and a clue.
  - **Choosing:** "Which Charm Sprite remembers this?" with short sprite buttons. A wrong one gets a friendly line.
  - **The memory:**
    - The right sprite flies over, and a pocket of colour blooms.
    - Golden figures (the townsfolk models in one additive material) act it out in sepia "memory" dialogue.
    - Then its lanterns relight (lamp map and glows), and its shutter lifts.
    - The friends comment, still inside the scene.
    - Everything is saved and survives a reload.
  - **The six memories:**
    - the noticeboard (Homework)
    - the post office (Cloud)
    - the sweet shop (Sock)
    - the teahouse (Pom-pom)
    - the thread shop (Sparrow)
    - the kitchen door, which needs a grey sprite and all five others (Grey)
  - **The Sprite Book** gets a Memories strip.
- **Neighbours:** the barber, the noodle auntie and the old man. Checking on each gives Cozy Energy, and all three a bonus. Their lines change after three memories.
- **Travel:** the ferryman goes to the Academy or the night market. The fog wall turns you back ("Not yet").
- **That evening** at the Academy (dusk):
  - The friends sit on the lesson benches by a brazier (made in code), and Fang's story uses the lines from `snuggle_sorcery_story.md`.
  - The courtyard fills with a cold grey fog while she tells it.
  - Doudou is awake, and gets a lemon candy.
  - The cards "Chapter 3 complete" and "Chapter 4: Doudou's Secret (coming soon)", then free roam.
- **Tests:**
  - `quiet-grey`: refused humming, no Notice prompt, the company ring, ready, soothed, and the sprite follows.
  - `quiet-memory`: a wrong sprite, the right one, and the pocket, lanterns and shutter surviving a reload.
  - `chapter3-full`: from the market stairs to `ch3Done`, with heads-upright checks.
  - `chapter2-full` now ends on "Walk home".

### M6: Faceted Grumblings (plan 1 M7)
- **Rebuilt in the reference's crumpled-paper style** (`build_creatures.py`):
  - **Cloud:** sulky, with raindrops and paws; its side puffs breathe.
  - **Sock:** striped; its toe wiggles.
  - **Homework:** crumpled, with a red mark and a pencil; its page corner flaps.
  - **Pom-pom:** spiky, droopy-eyed and blushing; its tuft sways and perks up.
- **Motion:** `animateParts` drives the moving parts for Grumblings, sprite followers and the courtyard sprites.
- **Book portraits** are re-framed. 432–620 triangles each.

### M7: Feel
- **Stride matching:** `Humanoid.gait()` measures each character's walk and run once: how fast a planted foot moves back, and when each foot lands. Xiao Pei, NPCs walking somewhere, and friends following all play the clip at the speed that keeps the foot planted.
- **Walk or run:** the switch is per character, at 1.9× the natural walk speed.
- **Footsteps** fall on real foot plants, with a small puff per zone (dust at the Academy and station, a cool puff at the market, mist in the Quiet District) and a bigger one on landing.
- **Turning on the spot:** a new `turn` clip. From a standstill, pushing more than 100° away pivots first (0.34 s).
- **Facing the speaker:** in dialogue she turns to face whoever is talking, if they're more than 60° off.
- **Test:** `feel-stride`. It steps the player loop by hand at 1/480 s, because the headless 15 fps lands too few frames inside a footfall.

### M8: Music and ambience
- **The music** (`core/music.js`, `content/music.js`):
  - A step sequencer on the lullaby's beat clock, with pluck, pad, bell, woodblock and the bowed erhu voice.
  - Seven tracks, all variations on the lullaby:
    - train
    - Academy by day
    - dusk
    - night market (it stays out of the musician's way)
    - the Quiet District (B minor fragments that stop mid-phrase; each memory brings a voice back)
    - the grey morning
    - Fang's story
  - It loads after Begin: 1.8 KB gzipped, no audio files.
- **Ambience:** `G.audio.mix(id)` gives each place its beds and track with crossfades, replacing the hand-set beds in every zone. The music ducks under dialogue and further while she hums.
- **Found on the way:** the market's `onExit` overwrote the perch system's cleanup (its chips element and key listener leaked on every visit since plan 2). Fixed.

### M9: Nice-to-haves
- **Service worker** (`tools/sw-template.js`, generated by `vite.config.js`):
  - Registered 5 s after Begin, in production only (`?nosw` skips it).
  - It precaches every chunk and every revisioned model.
  - The page is network-first; everything else is cache-first.
  - No `skipWaiting`, so an old tab keeps its build's chunks. Old caches are removed on activate.
- **Remappable controls:**
  - Keyboard keys and gamepad buttons can be changed (Controls > Change controls, `ui/remap.js`, loaded on demand). A clash swaps the two bindings.
  - Only the changes are saved. Esc and Enter stay fixed.
  - Hints, prompts and the Controls table show your bindings.
  - Test: `controls-remap`.
- **Text size:** Settings > Text size (100 / 115 / 130 / 150 %) scales the dialogue, choices, prompts, toasts and menus. `touch-hit-*` now runs at 150 %.
- **The musician's erhu:**
  - An erhu and bow in `market_kit` (not placed as kit pieces), and a new `erhu` clip.
  - The erhu rests on her lap, and the bow follows her right hand toward the strings.
  - The bowing is locked to the beat, with a ♪ at each change of stroke.

## Measured

**Load size** (`npm run budget`, before Begin):

| Start | JS (gz) | Models | Total | vs `next_3.md` |
|---|---|---|---|---|
| First visit (train) | 238.1 / 240 KB | 544 KB | 786 KB | +5 KB JS, +40 KB models |
| Returning, station | 237.9 KB | 872 KB | 1113 KB | |
| Returning, Academy | 252.8 KB | 1144 KB | 1401 KB | |
| Returning, market | 246.1 KB | 818 KB | 1068 KB | |
| Returning, Quiet District (new) | 249.2 KB | 778 KB | 1030 KB | |

- **Model sizes:**

  | Model | Size | Limit |
  |---|---|---|
  | `quiet.glb` | 145 KB | 200 KB |
  | `quiet_kit.glb` | 81 KB | 150 KB |
  | `creatures.glb` | 105 KB (was 78) | 110 KB |
  | `anim_humanoid.glb` | 75 KB (was 65; turn + erhu clips) | |
  | `market_kit.glb` | 149.8 KB | 150 KB |

**Time to interaction** (`npm run perf`, median of 5, cold cache):

| Zone | Must-pass (target 3 s) | Goal (target 1 s) |
|---|---|---|
| Train | 1.53 s | 0.40 s |
| Station | 1.87 s | 0.46 s |
| Academy | 2.24 s | 0.57 s |
| Market | 1.72 s | 0.47 s |
| Quiet District | 1.78 s | 0.47 s |
| **Repeat visit, service worker (train)** | **0.64 s** | |

The same build under `wrangler dev` (Cloudflare's asset server) measured the same as the local server: train 1.68 s, Academy 2.18 s in a single run.

**Quiet District frame cost, low tier:** 31–55 draw calls and at most 66k triangles in every spot I looked from. The limits are 100 and 150k.

**Foot slip** (how far a planted foot drifts, as a share of how far the body moves; `feel-stride` method):

| | Before | After |
|---|---|---|
| Walk (1.1 m/s) | 22.5 % | 1.2 % |
| Run (3.2 m/s) | 47 % | 13 % |
| Sprint (4.7 m/s) | 51 % | 22 % |
| A friend strolling (1.6 m/s) | not measured | 0.4 % |

**Tests:**
- `npm run e2e`: all 27 pass, about 10.5 minutes of tests in total.
- `npm run cf:check`: all good, including the service worker (34 files cached, a second visit takes all 7 models from the cache, and an offline reload reaches Begin).
- `?viewer` loads without errors.

## Deviations from the plan (and why)
- **The "Chapter 3" card is at the grey morning, not on the first ferry arrival.** The chapter starts at the Academy, so the card belongs there.
- **Fang's story uses the lesson benches and a brazier made in code.** `academy.glb` wasn't rebuilt; nothing there needed a new model.
- **A new Charm Sprite always joins the trail.** Only five sprites follow her. The sixth species (the grey) never appeared, so now the newest replaces the one that has followed longest (never the equipped helper).
- **The friends' comments on a memory play inside its scene.** Queued afterwards, they could pop up during the next memory (found by `chapter3-full`).
- **`anim_humanoid.glb` grew 10 KB, not about 1 KB.** The plan's +1 KB counted only the `turn` clip, and the `erhu` clip went into the same rebuild.
- **The sprint still slips about 22 %.** The run's timescale is capped at 3.4; faster looks frantic on chibi legs.
- **The walk-to-run switch is 1.9× the walk's natural speed, not 1.6×.** Scripts stroll at 1.6–2.2 m/s, which at 1.6× made friends jog.
- **The music has two extra tracks,** the grey morning and Fang's story.
- **Lazy chunks must not pull on the main bundle** (a Rolldown rule I ran into twice):
  - A dynamic import inside another lazy chunk (the test zone), or a lazy module that imports main-bundle modules from a static module's dynamic import (`remap.js`), split the main bundle into 2–3 files.
  - Now the test zone imports statically, and `remap.js` gets what it needs as arguments.
  - The budget stays one file.

## Known issues / limitations
- **Not deployed yet** (your account): `npx wrangler login`, then `npm run deploy`.
- **`npm install` warnings:** npm skipped the install scripts of `workerd` and `esbuild` (npm's allowScripts policy). `wrangler dev` works anyway. If it doesn't on another machine, `npm approve-scripts workerd esbuild`.
- **Budgets with little headroom:**
  - **First-visit JS:** 238.1 of 240 KB, so 1.9 KB left.
  - **`market_kit.glb`:** 149.8 of 150 KB.
  - The next plan should free some space before adding to the main bundle (§ next).
- **I can't hear the game.** Headless checks only prove the notes are scheduled on the beat. The mix levels (music against beds, the ducking) need your ears.
- **fps on real GPUs** is still unmeasured, and your iPhone retest of the plan 2 fixes is still pending. Both are easier once it's deployed.
- **The erhu is placed by eye.** From some angles the sound box hides between her knees.
- **The golden memory figures have no faces.** The painted atlas isn't used in the ghost material; I think it reads as "a memory".
- **Cloudflare headers:** a 404 under `/assets/` also gets the one-year `Cache-Control` (Cloudflare applies `_headers` to 404s). Harmless with revisioned URLs.
- **A tab left open across a deploy** before the service worker has installed may 404 on a lazy chunk, because Cloudflare keeps only the current version. After the first visit the service worker covers this.

## What to work on next (suggested order)
1. **Deploy and play on your phone:** the plan 2 retest, the Quiet District, and the music and ambience levels. **Copy bug report** still works there.
2. **Chapter 4: Doudou's Secret.** The solo stealth-and-comfort fog section beyond the fog wall, Doudou awake, the Lullaby Thread upgrade. The kitchen memory ("Qiuyue… five more minutes") has set it up.
3. **Budget headroom:** move the Sprite Book and bug report UI and the cooking mini-game out of the main bundle into lazy chunks, to free about 10 KB of first-visit JS.
4. **Remaining nice-to-haves:**
   - water reflections on the high tier
   - a README "Characters" section (plan 1 M8)
   - a left-handed touch layout
