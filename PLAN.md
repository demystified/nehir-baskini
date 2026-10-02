# River Raid Remake — Implementation Plan

> **For the implementing agent:** Work through the tasks **in order**. Each task ends with a
> **Verify** step and a **Commit** step — do both before moving on. If a Verify step fails, fix it
> before continuing. Do not skip ahead, and do not add features that aren't in this plan.

## Goal

A browser remake of Activision's *River Raid* (Carol Shaw, Atari 2600, 1982). It should play like
the original: a vertically scrolling river, fuel management, bridges as checkpoints, and the same
enemy types and scoring. It should look and sound "faithful retro": chunky Atari-style pixels, a
limited palette, and simple synthesized sound effects.

**Originality rule (important):** recreate the *rules and feel*, never the original's assets.
Do **not** copy, trace, or transcribe the original ROM, code, sprite bitmaps, or audio. Design all
pixel art yourself (simple, readable shapes are fine) and synthesize all sound with Web Audio.
The title text lives in one constant (`CONFIG.TITLE`) so it is easy to rename.

## Tech constraints

- Plain HTML5 Canvas + vanilla JavaScript. **No frameworks, no bundler, no npm dependencies.**
- Use **classic `<script>` tags** (not ES modules), so the game also works when `index.html` is
  opened directly from disk. Every JS file attaches its exports to a shared namespace:
  `globalThis.RR = globalThis.RR || {};` then e.g. `RR.Rng = ...`.
- **Pure-logic modules** (`config`, `rng`, `river`, `collision`, `scoring`) must not touch
  `window`, `document`, or `canvas` when they load, so Node can `require()` them in tests.
- Tests use Node's built-in runner: `node --test tests/`. No test libraries.
- Rendering: draw to an offscreen canvas at the **logical resolution**, then scale it onto the
  visible canvas with `imageSmoothingEnabled = false` (crisp pixels). Use the largest integer scale
  that fits the window, and fall back to a fractional fit if even 2× doesn't fit.
- Game loop: `requestAnimationFrame` with a **fixed 1/60 s update step** (accumulator) and
  frame-time clamped to 0.25 s. Pause automatically when the tab is hidden.

## File layout

```
river-raid/
  index.html
  css/style.css
  js/config.js      constants: sizes, speeds, palette, scores, tuning
  js/rng.js         16-bit Galois LFSR, deterministic
  js/river.js       section generator (terrain + object placement), water-span queries
  js/collision.js   AABB overlap, "is box fully over water" checks
  js/scoring.js     score / extra-life / high-score logic
  js/sprites.js     pixel-art definitions + pre-rendered sprite canvases
  js/audio.js       Web Audio synth effects
  js/input.js       keyboard + touch input state
  js/entities.js    player, missile, enemies, depots, bridge, explosions
  js/hud.js         bottom status bar: score, fuel gauge, lives, bridge counter
  js/game.js        game state machine, update + render orchestration
  js/main.js        bootstraps canvas, scaling, loop
  tests/rng.test.js, tests/river.test.js, tests/collision.test.js, tests/scoring.test.js
  .claude/launch.json
  README.md
```

Script load order in `index.html`: config, rng, river, collision, scoring, sprites, audio,
input, entities, hud, game, main.

## Game specification (source of truth)

### Screen & coordinates
- Logical resolution **160 × 232**: playfield 160 × 192 on top, HUD 160 × 40 below.
- World Y increases **upward** (distance travelled). `cameraY` = world Y at the bottom edge of the
  playfield. Screen y = `192 - (worldY - cameraY)`.
- The player is drawn at a fixed screen position, its bottom edge 24 px above the playfield bottom.
  The camera moves; the player only moves horizontally.

### Player
- Sprite about 9 × 10 px, your own jet design. Has 3 frames: level, banking left, banking right.
- Horizontal speed 70 px/s.
- Scroll speed: **normal 60 px/s**, holding Up = **fast 110**, holding Down = **slow 30**. Ease
  toward the target speed at about 200 px/s² so it doesn't snap.
- Dies when any part of its hitbox (sprite inset 1 px) is outside water, or when it touches an
  enemy, a fuel depot's hit area does **not** kill (it refuels), the bridge, or a jet.

### Missile
- Only **one missile on screen at a time**. Holding Fire auto-fires as soon as the previous one is
  gone.
- 1 × 6 px, speed 260 px/s upward on screen (on top of the scroll).
- Disappears when it leaves the top of the screen, when it hits a bank (its tip is outside water),
  or when it hits something.
- **Guided mode** (toggle with **G**, shown in the HUD as "G"): the missile's x follows the
  player's x, like the original's difficulty switch B. Off by default.

### River generation (deterministic, LFSR-driven)
- The river is built from **segments 16 px tall**. A **section** is 32 segments plus a final
  **bridge segment**, so each section is 33 × 16 = 528 px long.
- The river is **mirror-symmetric** around x = 80. Each segment has:
  - `half` = half-width of the water (from center to bank), between **20 and 72**.
  - `island` = island half-width (0 means no island). When > 0, the water is two channels:
    `[80-half, 80-island]` and `[80+island, 80+half]`.
- Constraints:
  - Every channel must be at least **MIN_CHANNEL = 22 px** wide.
  - `half` changes by at most **16 px** between neighboring segments.
  - An island can only appear or disappear where the neighboring segment's water fully covers the
    area the plane needs to pass, i.e. the generator must never create a dead end. Simple rule:
    the open channels of segment k and k+1 must overlap horizontally by at least MIN_CHANNEL.
  - The first 2 segments and the last 2 segments of every section have no island and are
    approaching **BRIDGE_HALF = 24**. The bridge segment itself has `half = 24`, no island.
  - Edges are **stepped** (constant within a segment), like the Atari original.
- `RR.River.sectionSeed(index)` returns a 16-bit seed for section *index*, derived from a fixed
  master seed. The same section always generates the same terrain and objects, so respawning
  rebuilds the identical section with fresh enemies.
- **Section 0 is hand-tuned and easy**: wide, gentle river, no islands, a few stationary tankers,
  one fuel depot near the start and one in the middle.
- Water-span query: `RR.River.spansAt(section, localY)` returns an array of `[x0, x1]` spans. This
  is used for rendering, collision, and placing objects.

### Objects (placed by the generator, per segment, skipping the first 2 segments of each section)
For each segment, roll once using the section's RNG. Difficulty `d = min(sectionIndex, 12) / 12`.

| Roll result  | Chance                        | Notes |
|--------------|-------------------------------|-------|
| nothing      | the remainder                 | |
| tanker (ship)| 24%                           | about 16 × 6 px, placed in water |
| helicopter   | 20%                           | about 10 × 8 px, 2-frame rotor animation |
| fuel depot   | `18% - 10%·d` (18% down to 8%)| about 8 × 22 px, labelled F-U-E-L vertically |
| jet          | `0` in section 0, then `6% + 6%·d` | flies across the **whole screen**, ignoring terrain |

- Tankers, helicopters, and depots are placed fully inside one water span with a 2 px margin and
  must not overlap each other.
- Tankers and helicopters are created with a `mover` flag, true with probability
  `0.35 + 0.5·d`. Movers sit still until the player is within **80 px vertically**, then move
  horizontally at `22 + 28·d` px/s and reverse when they would leave water.
- Jets start just off-screen (randomly left or right) and fly across at `80 + 40·d` px/s once their
  world Y enters the visible area. They are removed once they're off the other side.
- **Houses** (decoration only, can't be shot or collided with): 30% chance per segment on a bank
  that is at least 20 px wide; left or right side chosen by RNG.

### Fuel
- Fuel ranges from 0 to 1. It drains at a **constant 1/32 per second**, regardless of speed (as
  in the original manual).
- While the player overlaps a depot: +**0.30 per second**. Flying slowly over a depot therefore
  gives more fuel, which is a key part of the original's strategy.
- Below 25%: low-fuel alarm sound plus the gauge needle blinking. At 0: the plane crashes.
- Shooting a depot destroys it for points (so you trade fuel for score).

### Bridge, sections, lives
- The bridge is drawn across the bridge segment's water, with a gray road (yellow center line)
  continuing across both banks. Only the bridge part (over the water) is a hit target and an
  obstacle.
- Destroying the bridge gives **500** points and sets the checkpoint to the next section. Flying
  into an intact bridge kills the player.
- The HUD shows the number of the current bridge (section index + 1).
- The player starts with **3 reserve jets**, and gets **+1 every 10,000 points**, up to a maximum
  of **9 reserves**.
- On death: explosion (about 1 s), then if there are reserves, respawn at the **start of the
  checkpoint section**: rebuild it from its seed, refill fuel, center the plane, and enter the
  READY state. Otherwise, GAME OVER.

### Scoring
Tanker **30**, Helicopter **60**, Fuel depot **80**, Jet **100**, Bridge **500**.
The high score is kept in `localStorage` (wrap every access in try/catch; work without it).

### Game states
`TITLE` → (Enter/Space/tap) → `READY` (plane visible, river frozen, "PRESS FIRE OR MOVE")
→ any input → `PLAYING` ⇄ `PAUSED` (P key / tab hidden) → on death `DYING`
→ `READY` (respawn) or `GAMEOVER` (shows score and high score, Enter → `TITLE`).
- The TITLE screen shows the title, a short controls list, and the high score. Behind it, the
  river scrolls slowly as a demo with no enemies.

### Controls
| Action           | Keys                         |
|------------------|------------------------------|
| Steer            | ← → or A D                   |
| Accelerate / brake | ↑ ↓ or W S                 |
| Fire             | Space (hold for auto-fire)   |
| Start / confirm  | Enter or Space               |
| Pause            | P                            |
| Mute             | M                            |
| Guided missiles  | G                            |

On touch devices, show semi-transparent on-screen buttons: a left/right/up/down pad on the left
and a FIRE button on the right. Use `pointer` events and handle multi-touch.

### Audio (Web Audio, all synthesized, created on first user input)
- Engine: continuous low square/sawtooth hum, pitch rising with scroll speed (about 55 → 110 Hz),
  quiet.
- Shot: short descending square blip.
- Explosion: white-noise burst through a falling low-pass filter, about 0.6 s.
- Refuel: repeating short beeps whose pitch rises with fuel level. A distinct high "ding" when the
  tank is full.
- Low fuel: two-tone alarm while below 25% (not while refuelling).
- Extra life: quick rising 4-note arpeggio.
- Master gain node with mute (M). Remember the mute setting in `localStorage` (try/catch).

### Palette (`CONFIG.COLORS`, Atari-flavoured; adjust only if contrast is poor)
water `#2d50c8`, bank `#5c9a34`, bankEdge `#4a7f2a`, road `#6e6e6e`, roadLine `#e8c840`,
bridge `#b07a2a`, hud `#8e8e8e`, hudText `#f0e060`, player `#e8d84a`, tanker hull `#202020`
with deck `#c8c8c8` and stripe `#b03030`, heli `#1e6e3a` with rotor `#d0d0d0`, jet `#5a5a90`,
depot `#c03030` with letters `#f0f0f0`, house walls `#d8d0b0` and roof `#a03020`, explosion
`#f0a020` / `#f0e040` / `#ffffff`.

---

## Tasks

### Task 0 — Project skeleton
1. `git init`, add `.gitignore` (`.DS_Store`, `node_modules/`).
2. Create every file in the layout as a stub, so each JS file at least creates `RR`.
3. `index.html`: a single `<canvas id="screen">`, black page background, centered canvas, and all
   scripts in the load order above. `css/style.css`: full-viewport, no scrollbars,
   `touch-action: none` on the canvas, `image-rendering: pixelated`.
4. `main.js`: create the 160 × 232 offscreen buffer, fill it with the water color, and draw the HUD
   rectangle in gray. Scale it to the window (integer scale where possible) and redo the scaling on
   resize.
5. `.claude/launch.json`:
   ```json
   {"version":"0.0.1","configurations":[{"name":"river-raid","runtimeExecutable":"python3","runtimeArgs":["-m","http.server","8000"],"port":8000}]}
   ```
- **Verify:** `python3 -m http.server 8000` serves the page. It shows a crisp blue rectangle with a
  gray band at the bottom, and it rescales when the window is resized. No console errors.
- **Commit:** `chore: project skeleton`

### Task 1 — Config + deterministic RNG
1. `config.js`: put every number from the Game specification into `RR.CONFIG` (sizes, speeds,
   fuel rates, scores, probabilities, palette, `TITLE: "RIVER RAID"`, `MASTER_SEED: 0xA5C3`).
   No magic numbers elsewhere.
2. `rng.js`: `RR.Rng` class with a 16-bit Galois LFSR (taps `0xB400`, the seed must not be 0).
   Methods: `next()` returns 1..65535, `float()` returns [0,1), `int(min, max)` inclusive,
   `chance(p)`, `pick(array)`, and `state` get/set.
3. `tests/rng.test.js`: the same seed gives the same first 1,000 values; the sequence never yields
   0; `int` stays within bounds; a seed of 0 is coerced to a non-zero value.
- **Verify:** `node --test tests/` passes.
- **Commit:** `feat: config and deterministic LFSR rng`

### Task 2 — River generator
1. `river.js`: `RR.River.sectionSeed(i)`, `RR.River.generateSection(i)` returns
   `{ index, segments:[{half, island}], objects:[{type, x, y, w, h, mover, dir}], houses:[...],
   bridge:{y, x0, x1} }`, where object `y` is local to the section (0 = section start, increasing
   upward). Also `RR.River.spansAt(section, localY)`.
2. Implement all the constraints and the object table from the spec. Section 0 is hand-tuned (it
   can still use the RNG for small variation).
3. `tests/river.test.js`:
   - The same index gives deep-equal output, generated twice.
   - For sections 0–49: every segment's channels are ≥ MIN_CHANNEL; `|Δhalf| ≤ 16`; consecutive
     segments have overlapping passable channels ≥ MIN_CHANNEL (no dead ends); the first 2 and last
     2 segments have no island; the bridge segment has `half === BRIDGE_HALF`.
   - Every tanker, helicopter, and depot lies fully within a water span at its y-range, and none
     overlap.
   - Section 0 has no jets and no islands.
   - Depots across sections 30–49 are fewer than across sections 1–20.
- **Verify:** `node --test tests/` passes.
- **Commit:** `feat: deterministic river section generator`

### Task 3 — Terrain rendering + scrolling camera
1. `sprites.js`: a helper that turns a string-array pixel map plus a char→color map into a cached
   offscreen canvas. Design original sprites now for: player (3 frames), tanker (facing left and
   right), helicopter (2 rotor frames × 2 facings), jet (2 facings), fuel depot, house, and
   explosion (3 frames).
2. `game.js`: keep a list of loaded sections (the current one and the next) and place them in world
   space. Draw only the segments that are on screen: banks as rects, a 1 px darker edge on the
   banks, islands, houses, and the road + bridge on bridge segments.
3. As a temporary step, auto-scroll the camera at 60 px/s so you can see the river go by. Load the
   next section when needed, and drop sections once they are fully below the screen.
- **Verify:** in the browser, the river scrolls smoothly and endlessly. Islands, narrowings, and
  bridges appear, and each bridge sits in a narrow neck with a road across the banks. There is no
  flicker and no seam at section boundaries.
- **Commit:** `feat: terrain rendering and scrolling`

### Task 4 — Input, player, bank collision
1. `input.js`: `RR.Input` tracks held keys and keys pressed this frame (`pressed(action)` and
   `held(action)` on actions, not raw keys). Call `preventDefault` for the arrow keys and Space.
2. `collision.js`: `aabbOverlap(a, b)`, and `boxOverWater(section(s), box)`, which samples the
   box's corners and edge midpoints against `spansAt`. Add `tests/collision.test.js`.
3. `entities.js`: the player with steering, speed easing (Up/Down), and banking frames. Replace the
   auto-scroll with the player's speed.
4. Bank collision triggers a placeholder death that logs to the console and resets to the section
   start.
- **Verify:** tests pass. In the browser, you can steer, speed up, and slow down, and touching a
  bank or island kills you.
- **Commit:** `feat: player movement and terrain collision`

### Task 5 — Enemies, missiles, scoring
1. Spawn entities from section `objects` when a section loads. Implement tanker and helicopter
   behavior (idle → mover activation → bounce off banks and islands), rotor animation, jets
   crossing the screen, and stationary depots.
2. The missile, following the spec rules (single missile, auto-fire, stops at banks, guided
   mode G).
3. `scoring.js`: `RR.Scoring` handles the score, an `add(points)` that returns any extra lives
   earned (cap 9 reserves), and high-score load/save. Add `tests/scoring.test.js` covering the
   10,000-point thresholds (including jumping over two thresholds at once) and the cap.
4. A missile hitting something gives points and spawns an explosion. The player touching a tanker,
   helicopter, jet, or the intact bridge dies.
- **Verify:** tests pass. In the browser, shooting each enemy type adds the right points, movers
  start moving as you approach, jets cross the screen, and the bridge can be destroyed (+500).
- **Commit:** `feat: enemies, missiles and scoring`

### Task 6 — Fuel + HUD
1. Fuel drain and refuel as specified. Running out of fuel means death.
2. `hud.js`: on the gray band, show the score (yellow digits, top center); the fuel gauge
   (rectangle with E, ½, F tick marks and a moving needle that blinks below 25%); reserve jets
   (small plane icon + count); the bridge number; and a small "G" when guided mode is on. Use a
   tiny built-in pixel font: define 3×5 or 4×6 glyphs for 0–9, A–Z, and ½ in `sprites.js`. Don't
   rely on system fonts.
- **Verify:** fuel visibly drains; hovering slowly over a depot refills it faster than flying
  quickly over it; at empty the plane crashes; all HUD elements are readable at 2× scale.
- **Commit:** `feat: fuel system and HUD`

### Task 7 — Game flow: states, lives, checkpoints, high score
1. Implement the full state machine from the spec: TITLE (with demo scroll), READY, PLAYING,
   PAUSED, DYING, GAMEOVER.
2. Lives and extra lives; the checkpoint moves forward when a bridge is destroyed; respawning
   rebuilds the checkpoint section from its seed with fresh enemies.
3. High score is saved on game over and shown on the TITLE and GAMEOVER screens.
- **Verify:** play a full game. Dying respawns you at the right section with full fuel; destroying
  a bridge then dying respawns you at the next section; losing the last jet shows GAME OVER;
  Enter goes back to TITLE; the high score persists after a page reload; P pauses and switching
  tabs auto-pauses.
- **Commit:** `feat: game states, lives, checkpoints, high score`

### Task 8 — Audio
1. `audio.js`: every effect in the Audio spec. Create the AudioContext lazily on the first key or
   pointer event. Add mute (M) with the setting saved.
2. Hook the sounds into the gameplay events. The engine hum is only on during PLAYING.
- **Verify:** every sound plays at the right moment, nothing clicks or stacks up badly (for
  example, holding fire doesn't produce a wall of noise), mute works, and the browser console
  shows no AudioContext warnings after the first input.
- **Commit:** `feat: synthesized audio`

### Task 9 — Touch controls + polish
1. On-screen touch controls (only when `matchMedia('(pointer: coarse)')` matches or a touch event
   is seen). Tap to start or confirm.
2. Polish: explosion animation frames, a brief screen flash when the player explodes, the blinking
   low-fuel needle, the READY / PAUSED / GAME OVER text using the pixel font, and the plane
   flickering in READY.
3. A tuning pass: play sections 0–5 and adjust only `CONFIG` values, so section 0 is easy, fuel is
   tight but fair, and difficulty ramps noticeably by section 5.
- **Verify:** it's playable in a mobile viewport (375 × 812) with touch buttons; desktop shows no
  touch buttons; there is no horizontal scroll or page bounce on mobile.
- **Commit:** `feat: touch controls and polish`

### Task 10 — README + final check
1. `README.md`: how to play (open `index.html`, or run `python3 -m http.server 8000`), controls,
   scoring table, how to run the tests, and a credits/originality note ("an homage to River Raid
   by Carol Shaw / Activision, 1982; all code, art and sound are original").
2. Final run: `node --test tests/` passes; no console errors during a 3-minute play session;
   every item in the Game specification works.
- **Commit:** `docs: README`

## Report back
When finished, reply with: the tasks completed, test results (paste the summary line), any spec
items you could not implement or deviated from and why, and any `CONFIG` values you tuned.
