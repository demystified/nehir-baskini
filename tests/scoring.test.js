"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/config.js");
require("../js/scoring.js");
const { Scoring, CONFIG } = globalThis.RR;

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

test("starts at 0 with 3 reserves", () => {
  const s = new Scoring({ storage: null });
  assert.equal(s.score, 0);
  assert.equal(s.reserves, 3);
});

test("points accumulate", () => {
  const s = new Scoring({ storage: null });
  assert.equal(s.add(30), 0);
  assert.equal(s.add(500), 0);
  assert.equal(s.score, 530);
});

test("a life is earned at 10,000, exactly once per threshold", () => {
  const s = new Scoring({ storage: null });
  assert.equal(s.add(9990), 0);
  assert.equal(s.reserves, 3);
  assert.equal(s.add(10), 1, "reaching exactly 10,000 counts");
  assert.equal(s.reserves, 4);
  assert.equal(s.add(5), 0, "no repeat for the same threshold");
  assert.equal(s.add(9995), 1, "20,000");
  assert.equal(s.reserves, 5);
});

test("jumping over two thresholds at once awards two lives", () => {
  const s = new Scoring({ storage: null });
  s.add(9000);
  assert.equal(s.add(11500), 2, "9,000 -> 20,500 crosses 10k and 20k");
  assert.equal(s.reserves, 5);
  assert.equal(s.add(30000), 3, "20,500 -> 50,500 crosses 30k, 40k, 50k");
  assert.equal(s.reserves, 8);
});

test("reserves are capped at 9, and the extra thresholds are not banked", () => {
  const s = new Scoring({ storage: null });
  s.reserves = 8;
  assert.equal(s.add(30000), 1, "only one of three lives fits");
  assert.equal(s.reserves, 9);
  assert.equal(s.add(10000), 0, "at the cap: nothing earned");
  assert.equal(s.reserves, 9);
  // lose some jets, then the next threshold awards again (earlier ones were used up)
  s.useReserve();
  s.useReserve();
  assert.equal(s.reserves, 7);
  assert.equal(s.add(5000), 0, "45,000 is still below 50,000");
  assert.equal(s.add(5000), 1, "50,000");
  assert.equal(s.reserves, 8);
});

test("useReserve stops at 0", () => {
  const s = new Scoring({ storage: null });
  assert.equal(s.useReserve(), true);
  assert.equal(s.useReserve(), true);
  assert.equal(s.useReserve(), true);
  assert.equal(s.reserves, 0);
  assert.equal(s.useReserve(), false);
  assert.equal(s.reserves, 0);
});

test("reset starts a new game but keeps the high score", () => {
  const store = memoryStorage();
  const s = new Scoring({ storage: store });
  s.add(12345);
  s.commitHigh();
  s.reset();
  assert.equal(s.score, 0);
  assert.equal(s.reserves, 3);
  assert.equal(s.highScore, 12345);
  assert.equal(s.add(10000), 1, "bonus threshold restarts at 10,000");
});

test("high score: saved only when beaten, loaded on the next run", () => {
  const store = memoryStorage();
  const a = new Scoring({ storage: store });
  assert.equal(a.highScore, 0);
  a.add(800);
  assert.equal(a.commitHigh(), true);
  assert.equal(store.data[CONFIG.HIGHSCORE_KEY], "800");
  a.reset();
  a.add(300);
  assert.equal(a.commitHigh(), false);
  assert.equal(store.data[CONFIG.HIGHSCORE_KEY], "800");
  const b = new Scoring({ storage: store });
  assert.equal(b.highScore, 800);
});

test("high score survives missing, broken or garbage storage", () => {
  assert.equal(new Scoring({ storage: null }).highScore, 0);
  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  const s = new Scoring({ storage: throwing });
  assert.equal(s.highScore, 0);
  s.add(100);
  assert.doesNotThrow(() => s.commitHigh());
  assert.equal(s.highScore, 100, "still tracked in memory");
  assert.equal(new Scoring({ storage: memoryStorage({ [CONFIG.HIGHSCORE_KEY]: "banana" }) }).highScore, 0);
  assert.equal(new Scoring({ storage: memoryStorage({ [CONFIG.HIGHSCORE_KEY]: "-5" }) }).highScore, 0);
});

test("loading the module and constructing without a storage argument never throws", () => {
  assert.doesNotThrow(() => new Scoring());
});

test("score table from the spec", () => {
  assert.deepEqual(CONFIG.SCORE, { tanker: 30, heli: 60, depot: 80, jet: 100, bridge: 500 });
});
