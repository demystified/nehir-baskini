# River Raid

A browser remake of the classic vertically scrolling river shooter: fly up an endless river,
shoot ships, helicopters and jets, blow up the bridges, and watch your fuel. Chunky Atari-style
pixels, a limited palette and simple synthesized sound effects.

Plain HTML5 canvas and vanilla JavaScript. No frameworks, no bundler, no npm dependencies.

## How to play

Open `index.html` in a browser (it works straight from disk), or serve the folder and open
<http://localhost:8000>:

```sh
python3 -m http.server 8000
```

Press **Enter** or **Space** (or tap the screen) on the title screen, then press fire or move to
take off.

### The rules

- The river scrolls by itself; you only steer sideways. Touching a bank or an island destroys
  your plane. So does touching a ship, a helicopter, a jet, or an unbroken bridge.
- You have **one missile at a time**. Hold fire and it launches again as soon as the last one is
  gone. It stops at the banks.
- **Fuel** drains at a constant rate (a full tank lasts 32 seconds). Fly over a fuel depot to
  refill: the slower you pass over it, the more you get. Shooting a depot destroys it. At empty,
  the plane crashes.
- **Bridges** block the river and mark the end of each section. Destroy one to pass; it also sets
  your checkpoint, so after a crash you restart from the beginning of the section beyond it.
- You start with **3 reserve jets** and get another at every **10,000 points** (up to 9).
- Movers (ships and helicopters that patrol sideways) wake up as you approach. Jets cross the
  whole screen, ignoring the terrain, so watch the edges.

### Controls

| Action              | Keys                         |
|---------------------|------------------------------|
| Steer               | Left / Right arrows, or A / D |
| Faster / slower     | Up / Down arrows, or W / S    |
| Fire                | Space (hold for auto-fire)    |
| Start / confirm     | Enter or Space                |
| Pause               | P (also happens when the tab is hidden) |
| Mute                | M                             |
| Guided missiles     | G (the missile follows your plane sideways) |

On touch devices, semi-transparent on-screen controls appear: a pad on the left (steer, faster,
slower) and a FIRE button on the right. Tap anywhere on the title / pause / game-over screens to
continue.

### Scoring

| Target       | Points |
|--------------|--------|
| Tanker       | 30     |
| Helicopter   | 60     |
| Fuel depot   | 80     |
| Jet          | 100    |
| Bridge       | 500    |

The high score is kept in `localStorage` and shown on the title and game-over screens.

## Tests

The game logic is kept separate from rendering, so it runs under Node with its built-in test
runner (no dependencies). From the project folder:

```sh
node --test tests/
```

`tests/index.js` is a tiny shim that makes the bare-directory form work on recent Node versions
(which otherwise treat `tests/` as a module path); it runs every `*.test.js` in its own
process. `node --test` and `node --test tests/*.test.js` work too.

The suite covers the RNG, the river generator (no dead ends, ever), collision, scoring, the game
state machine (lives, checkpoints, fuel, high score), the audio wiring, and headless smoke tests
in which an autopilot plays thousands of steps and random button mashing runs through every state.

## Project layout

```
index.html          page: one <canvas>, scripts loaded as classic <script> tags (global RR namespace)
css/style.css       full-viewport layout, pixelated canvas, touch controls
js/config.js        every tunable number: sizes, speeds, fuel, scores, probabilities, palette
js/rng.js           16-bit Galois LFSR, deterministic
js/river.js         section generator: terrain, objects, houses, water-span queries
js/collision.js     AABB overlap and "is this box over water"
js/scoring.js       score, extra lives, high score
js/sprites.js       pixel-art definitions, pre-rendered sprite canvases, 3x5 pixel font
js/audio.js         Web Audio synthesis (no audio files)
js/input.js         keyboard and touch input state
js/entities.js      player, missile, enemies, depots, bridge, explosions
js/hud.js           bottom status bar
js/game.js          state machine, update and render orchestration
js/main.js          canvas setup, integer scaling, fixed-timestep loop
tests/              node:test suites (plus an autopilot used by the smoke tests)
```

Rendering draws to a 160 x 232 offscreen canvas and scales it up with smoothing disabled, using
the largest integer scale that fits the window. The simulation runs on a fixed 1/60 s step.

The river is generated deterministically from a master seed: section *n* always has the same
terrain and objects, and respawning rebuilds the identical section with fresh enemies.

## Credits

An homage to *River Raid* by Carol Shaw / Activision (1982). All code, art and sound in this
project are original: only the rules and the feel are recreated, none of the original's assets.
The title lives in one constant, `CONFIG.TITLE`, if you want to rename it.
