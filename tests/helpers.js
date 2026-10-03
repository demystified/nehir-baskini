"use strict";
// Shared setup for headless tests: loads the pure game modules (no DOM) in the same
// order as index.html, and offers a few helpers for driving the game by hand.

const path = require("node:path");

const MODULES = ["config", "rng", "river", "collision", "scoring", "settings", "input", "entities", "game"];
for (const m of MODULES) require(path.join("..", "js", m + ".js"));

const RR = globalThis.RR;

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

// A game wired to a fresh input state and an in-memory score store. By default it is
// put straight into PLAYING at section 0; pass { title: true } to leave it on the title
// screen, or { ready: true } to stop at READY.
function makeGame(opts) {
  opts = opts || {};
  const input = new RR.InputState();
  const storage = opts.storage || memoryStorage();
  const scoring = new RR.Scoring({ storage });
  const settings = new RR.Settings({ storage });
  const game = new RR.Game({ input, scoring, settings, audio: opts.audio || null });
  if (!opts.title) {
    game.newGame();
    if (!opts.ready) game.beginPlay();
  }
  return { game, input, scoring, settings, storage };
}

// Advance the game by n fixed steps, clearing one-frame "pressed" flags like main.js.
function step(game, input, n) {
  const dt = RR.CONFIG.FIXED_DT;
  for (let i = 0; i < n; i++) {
    game.update(dt);
    input.endFrame();
  }
}

// Remove every generated enemy (keeps the bridge entities), so a test can place its own.
function clearEnemies(game) {
  game.entities = game.entities.filter((e) => e.type === "bridge");
}

function spawn(game, type, x, y, extra) {
  const dims = { tanker: [16, 6], heli: [10, 8], depot: [8, 22], jet: [12, 7] }[type];
  const e = RR.Entities.createEnemy(
    Object.assign({ type, x, y: 0, w: dims[0], h: dims[1], dir: 1, mover: false, speed: 0 }, extra || {}),
    0,
    0
  );
  e.y = y; // absolute world y
  game.entities.push(e);
  return e;
}

module.exports = { RR, makeGame, step, clearEnemies, spawn, memoryStorage };
