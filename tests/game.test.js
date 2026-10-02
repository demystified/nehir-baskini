"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { RR, makeGame, step, clearEnemies, spawn } = require("./helpers.js");

const CFG = RR.CONFIG;

// Put the plane at a given x (sprite left edge) and let the camera sit where we want.
function place(game, x, cameraY) {
  game.cameraY = cameraY;
  game.player.x = x;
  game.player.y = cameraY + CFG.PLAYER_BOTTOM_MARGIN;
  game.ensureSections();
}

function recordDeaths(game) {
  const deaths = [];
  game.die = function (reason) {
    deaths.push(reason);
  };
  return deaths;
}

test("player: steering speed, banking frames and scroll easing", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  const x0 = game.player.x;
  input.down("left", "k");
  step(game, input, 6);
  assert.ok(Math.abs(game.player.x - (x0 - 0.7 * 10 * 1)) < 1e-9 || game.player.x < x0);
  assert.equal(game.player.frame, 1);
  input.up("left", "k");
  input.down("right", "k");
  step(game, input, 6);
  assert.equal(game.player.frame, 2);
  input.up("right", "k");
  step(game, input, 1);
  assert.equal(game.player.frame, 0);

  // speed: eases (not snaps) toward fast, then slow, then normal
  input.down("up", "k");
  step(game, input, 3);
  assert.ok(game.player.speed > 60 && game.player.speed < 110, "easing, got " + game.player.speed);
  step(game, input, 60);
  assert.equal(game.player.speed, CFG.SCROLL_FAST);
  input.up("up", "k");
  input.down("down", "k");
  step(game, input, 120);
  assert.equal(game.player.speed, CFG.SCROLL_SLOW);
  input.up("down", "k");
  step(game, input, 120);
  assert.equal(game.player.speed, CFG.SCROLL_NORMAL);
  input.down("up", "k");
  input.down("down", "k");
  step(game, input, 120);
  assert.equal(game.player.speed, CFG.SCROLL_NORMAL, "up+down cancel out");
});

test("scroll advances the camera by speed * dt", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  step(game, input, 60); // 1 s at 60 px/s
  assert.ok(Math.abs(game.cameraY - 60) < 1e-6, "camera " + game.cameraY);
});

test("touching the bank is deadly (and only the bank)", () => {
  const { game, input } = makeGame();
  const deaths = recordDeaths(game);
  clearEnemies(game);
  step(game, input, 30);
  assert.deepEqual(deaths, []);
  input.down("left", "k");
  step(game, input, 120);
  assert.ok(deaths.length > 0);
  assert.equal(deaths[0], "bank");
});

test("missile: only one at a time, auto-fires again once the last is gone", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  let spawned = 0;
  const realFire = game.fireMissile.bind(game);
  game.fireMissile = function () {
    assert.equal(game.missile, null, "fired while a missile was still in flight");
    spawned++;
    realFire();
  };
  input.down("fire", "k");
  step(game, input, 120);
  assert.ok(spawned >= 3, "auto-fire should keep firing, got " + spawned);
  // not holding fire: no new missile once the last one is gone
  input.up("fire", "k");
  step(game, input, 60);
  assert.equal(game.missile, null);
  const count = spawned;
  step(game, input, 30);
  assert.equal(spawned, count);
});

test("missile: 1x6, rises 260 px/s on the screen regardless of scroll speed", () => {
  for (const key of [null, "up", "down"]) {
    const { game, input } = makeGame();
    recordDeaths(game);
    clearEnemies(game);
    if (key) input.down(key, "k");
    step(game, input, 30); // let the scroll speed settle
    input.down("fire", "k");
    step(game, input, 1);
    const m = game.missile;
    assert.ok(m);
    assert.equal(m.w, 1);
    assert.equal(m.h, 6);
    const screenTip = () => game.screenY(m.tipY());
    const y0 = m.tipY() - game.cameraY;
    step(game, input, 6);
    const y1 = m.tipY() - game.cameraY;
    assert.ok(Math.abs(y1 - y0 - (260 * 6) / 60) < 0.5, `screen climb ${y1 - y0} (key ${key})`);
    assert.ok(typeof screenTip() === "number");
    // it is centred on the plane's nose
    assert.equal(m.x, game.player.drawX() + 4);
  }
});

test("missile: leaves the top of the screen and disappears", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  input.down("fire", "k");
  step(game, input, 1);
  input.up("fire", "k");
  assert.ok(game.missile);
  step(game, input, 80);
  assert.equal(game.missile, null);
});

test("missile: stops at a bank, doesn't pass through it", () => {
  const { game, input } = makeGame();
  const deaths = recordDeaths(game);
  clearEnemies(game);
  // near the top of section 0 the river funnels into the bridge neck; x = 50 is water at
  // the bottom but bank in the bridge segment (water 56..104)
  place(game, 50, 400);
  input.down("fire", "k");
  step(game, input, 1);
  input.up("fire", "k");
  assert.ok(game.missile, "missile in flight");
  let steps = 0;
  while (game.missile && steps < 200) {
    // keep the plane parked in the same place relative to the camera
    game.player.speed = 0;
    step(game, input, 1);
    steps++;
  }
  assert.equal(game.missile, null);
  assert.equal(game.scoring.score, 0, "nothing was hit");
  assert.deepEqual(deaths, []);
  const bridge = game.entities.find((e) => e.type === "bridge");
  assert.ok(bridge.alive, "the bridge is untouched");
  // with the camera frozen the missile needs to cover (512 - tip) px at 260 px/s: well before the top
  assert.ok(steps < 20, "stopped at the bank after " + steps + " steps");
});

test("shooting each enemy type scores the right points and explodes", () => {
  const table = [
    ["tanker", 30],
    ["heli", 60],
    ["depot", 80],
    ["jet", 100],
  ];
  for (const [type, points] of table) {
    const { game, input } = makeGame();
    recordDeaths(game);
    clearEnemies(game);
    place(game, 76, 100);
    game.player.speed = 0;
    const e = spawn(game, type, 76, 100 + 24 + 10 + 40);
    input.down("fire", "k");
    let n = 0;
    while (e.alive && n < 100) {
      game.player.speed = 0;
      step(game, input, 1);
      n++;
    }
    assert.equal(e.alive, false, type + " should be destroyed");
    assert.equal(game.scoring.score, points, type);
    assert.ok(game.explosions.length >= 1, type + " explodes");
    assert.equal(game.missile === null || game.missile.alive !== false, true);
  }
});

test("a missile that misses sideways does not hit", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  place(game, 60, 100);
  game.player.speed = 0;
  const e = spawn(game, "tanker", 76, 100 + 24 + 10 + 40); // x 76..92; missile at x=64
  input.down("fire", "k");
  step(game, input, 40);
  assert.equal(e.alive, true);
  assert.equal(game.scoring.score, 0);
});

test("the nearest of two stacked targets is hit first", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 100);
  game.player.speed = 0;
  const far = spawn(game, "heli", 75, 100 + 24 + 10 + 80);
  const near = spawn(game, "tanker", 70, 100 + 24 + 10 + 30);
  input.down("fire", "k");
  step(game, input, 1);
  input.up("fire", "k"); // a single shot
  for (let i = 0; i < 60; i++) {
    game.player.speed = 0;
    step(game, input, 1);
  }
  assert.equal(near.alive, false);
  assert.equal(far.alive, true, "the single missile was used up on the nearer one");
});

test("the bridge: shooting it gives 500 and moves the checkpoint on; it can then be crossed", () => {
  const { game, input } = makeGame();
  const deaths = recordDeaths(game);
  clearEnemies(game);
  const bridge = game.entities.find((e) => e.type === "bridge");
  place(game, 76, 512 - 150);
  input.down("fire", "k");
  let n = 0;
  while (bridge.alive && n < 200) {
    step(game, input, 1);
    n++;
  }
  assert.equal(bridge.alive, false);
  assert.equal(game.scoring.score, 500);
  assert.equal(game.checkpoint, 1);
  assert.equal(game.sectionByIndex[0].bridgeAlive, false);
  assert.ok(game.explosions.length >= 2, "bridge blows up in several places");
  input.up("fire", "k");
  // fly on through the wreck and into section 1 (before the first island there)
  let guard = 0;
  while (game.player.y < 528 + 8 && guard++ < 1000) step(game, input, 1);
  assert.deepEqual(deaths, []);
  assert.equal(game.currentSection(), 1);
  assert.equal(game.checkpoint, 1);
});

test("flying into an intact bridge kills the plane", () => {
  const { game, input } = makeGame();
  const deaths = recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 512 - 60);
  step(game, input, 120);
  assert.equal(deaths[0], "bridge");
  assert.equal(game.scoring.score, 0);
});

test("ramming a tanker, helicopter or jet kills the plane; a depot does not", () => {
  for (const [type, fatal] of [["tanker", true], ["heli", true], ["jet", true], ["depot", false]]) {
    const { game, input } = makeGame();
    const deaths = recordDeaths(game);
    clearEnemies(game);
    place(game, 76, 100);
    const e = spawn(game, type, 74, 100 + 24 + 10 + 20);
    step(game, input, 90);
    assert.equal(deaths.length > 0, fatal, type);
    if (fatal) assert.equal(deaths[0], type);
    else assert.equal(e.alive, true, "a depot is not destroyed by flying over it");
  }
});

test("movers sit still until the player is within 80 px, then patrol and bounce inside the water", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 100);
  const startY = 100 + 24 + 10 + 130;
  const e = spawn(game, "tanker", 70, startY, { mover: true, speed: 40, dir: 1 });
  const x0 = e.x;
  input.down("fire", "k"); // keep shots away from it: fire is fine, it's out of range
  input.up("fire", "k");
  let woke = -1;
  for (let i = 0; i < 400 && woke < 0; i++) {
    step(game, input, 1);
    if (e.active) woke = i;
    else assert.equal(e.x, x0, "still before waking");
  }
  assert.ok(woke > 0, "woke up");
  assert.ok(Math.abs(e.y - game.player.y) <= CFG.MOVER_TRIGGER_DIST + 1);
  // patrol for a while: stays within water and reverses at least once
  game.player.speed = 0;
  game.cameraY = e.y - 60;
  game.player.y = game.cameraY + CFG.PLAYER_BOTTOM_MARGIN;
  game.ensureSections();
  let reversals = 0;
  let lastDir = e.dir;
  for (let i = 0; i < 1200; i++) {
    game.player.speed = 0;
    // park the plane out of the tanker's way
    game.player.x = 76;
    game.player.y = e.y - 70;
    game.cameraY = game.player.y - CFG.PLAYER_BOTTOM_MARGIN;
    game.update(CFG.FIXED_DT);
    if (e.dir !== lastDir) {
      reversals++;
      lastDir = e.dir;
    }
    const box = { x: e.x, y: e.y, w: e.w, h: e.h };
    assert.ok(RR.Collision.boxOverWater(game.sections, box), "mover left the water at step " + i);
  }
  assert.ok(reversals >= 2, "reversals: " + reversals);
});

test("a jet waits off-screen, starts its run when in range, crosses the screen and is removed", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 100);
  game.player.speed = 0;
  const jet = spawn(game, "jet", -CFG.JET_W - 2, 100 + 150, { dir: 1, speed: 100 });
  step(game, input, 5);
  assert.equal(jet.active, false, "jet is still too far ahead");
  assert.equal(jet.x, -CFG.JET_W - 2);
  game.player.x = 76;
  let prev = jet.x;
  let steps = 0;
  while (jet.alive && steps < 400) {
    game.player.speed = 0;
    game.player.y = 100 + 150 - 60; // keep the plane well below the jet's row, in the water
    game.cameraY = game.player.y - CFG.PLAYER_BOTTOM_MARGIN;
    game.player.x = 76;
    game.update(CFG.FIXED_DT);
    if (jet.alive) assert.ok(jet.x >= prev, "moves only to the right");
    prev = jet.x;
    steps++;
  }
  assert.equal(jet.alive, false);
  const expected = ((CFG.VIEW_W + CFG.JET_W + 2) / 100) * 60;
  assert.ok(Math.abs(steps - expected) < 4, `crossing took ${steps} steps, expected ~${expected}`);
  game.update(CFG.FIXED_DT);
  assert.ok(!game.entities.includes(jet), "removed from the list");
});

test("a jet flying across the player's row kills it, even over a bank (ignores terrain)", () => {
  const { game, input } = makeGame();
  const deaths = recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 100);
  game.player.speed = 0;
  spawn(game, "jet", -CFG.JET_W - 2, 100 + 24 + 1, { dir: 1, speed: 120 });
  for (let i = 0; i < 90; i++) {
    game.player.speed = 0; // hold the plane in the jet's row
    step(game, input, 1);
  }
  assert.equal(deaths[0], "jet");
});

test("extra lives: crossing 10,000 points by shooting awards a reserve", () => {
  const { game, input, scoring } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  scoring.add(9980);
  assert.equal(scoring.reserves, 3);
  place(game, 76, 100);
  game.player.speed = 0;
  const e = spawn(game, "tanker", 70, 100 + 24 + 10 + 30);
  input.down("fire", "k");
  step(game, input, 40);
  assert.equal(e.alive, false);
  assert.equal(scoring.score, 10010);
  assert.equal(scoring.reserves, 4);
});

test("guided mode (G): the missile follows the plane sideways; unguided it flies straight", () => {
  for (const guided of [false, true]) {
    const { game, input } = makeGame();
    recordDeaths(game);
    clearEnemies(game);
    if (guided) {
      input.tap("guided");
      step(game, input, 1);
      assert.equal(game.guided, true);
    }
    place(game, 76, 100);
    game.player.speed = 0;
    input.down("fire", "k");
    step(game, input, 2);
    input.up("fire", "k");
    const mx = game.missile.x;
    input.down("right", "k");
    step(game, input, 3);
    input.up("right", "k");
    if (guided) assert.equal(game.missile.x, game.player.drawX() + 4);
    else assert.equal(game.missile.x, mx);
  }
  // pressing G again turns it off
  const { game, input } = makeGame();
  input.tap("guided");
  step(game, input, 1);
  input.tap("guided");
  step(game, input, 1);
  assert.equal(game.guided, false);
});

test("destroyed and off-screen entities are cleaned up (the list does not grow forever)", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  input.down("up", "k");
  let maxLen = 0;
  for (let i = 0; i < 3000; i++) {
    game.player.x = 76; // stay safe in the middle (enemies may still hit us; deaths are recorded only)
    step(game, input, 1);
    maxLen = Math.max(maxLen, game.entities.length);
  }
  assert.ok(maxLen < 120, "entities peaked at " + maxLen);
});

// ---- Fuel (Task 6) ---------------------------------------------------------------

test("fuel drains at a constant 1/32 per second, whatever the speed", () => {
  const results = {};
  for (const key of [null, "up", "down"]) {
    const { game, input } = makeGame();
    recordDeaths(game);
    clearEnemies(game);
    game.player.speed = { null: 60, up: 110, down: 30 }[key];
    if (key) input.down(key, "k");
    step(game, input, 60); // 1 s
    results[key] = game.fuel;
  }
  for (const key of Object.keys(results)) {
    assert.ok(Math.abs(results[key] - (1 - 1 / 32)) < 1e-9, `${key}: ${results[key]}`);
  }
});

test("a full tank lasts 32 seconds, then the plane crashes", () => {
  const { game, input } = makeGame();
  const deaths = recordDeaths(game);
  clearEnemies(game);
  // park over a wide stretch of river by holding the scroll at 0 (fuel still burns)
  let steps = 0;
  while (!deaths.length && steps < 3000) {
    game.player.speed = 0;
    game.player.x = 76;
    step(game, input, 1);
    steps++;
  }
  assert.equal(deaths[0], "fuel");
  assert.ok(Math.abs(steps - 32 * 60) <= 2, "ran dry after " + steps + " steps");
  assert.equal(game.fuel, 0);
});

test("low-fuel flag below 25%", () => {
  const { game } = makeGame();
  game.fuel = 0.26;
  assert.equal(game.isLowFuel(), false);
  game.fuel = 0.2499;
  assert.equal(game.isLowFuel(), true);
});

test("hovering over a depot refuels at 0.30/s (on top of the drain), and the depot survives", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 100);
  game.fuel = 0.4;
  const depot = spawn(game, "depot", 76, 100 + 24 - 5);
  for (let i = 0; i < 60; i++) {
    game.player.speed = 0;
    step(game, input, 1);
  }
  assert.ok(Math.abs(game.fuel - (0.4 + 0.3 - 1 / 32)) < 1e-6, "fuel " + game.fuel);
  assert.equal(depot.alive, true);
  assert.equal(game.refueling, true);
  game.player.x = 100; // slide off it
  for (let i = 0; i < 2; i++) {
    game.player.speed = 0;
    step(game, input, 1);
  }
  assert.equal(game.refueling, false);
});

test("flying slowly over a depot gives more fuel than flying fast", () => {
  const gain = {};
  for (const [name, key, speed] of [["slow", "down", 30], ["normal", null, 60], ["fast", "up", 110]]) {
    const { game, input } = makeGame();
    recordDeaths(game);
    clearEnemies(game);
    place(game, 76, 100);
    game.fuel = 0.3;
    spawn(game, "depot", 76, 100 + 24 + 10 + 20);
    if (key) input.down(key, "k");
    game.player.speed = speed;
    const before = game.fuel;
    for (let i = 0; i < 120; i++) step(game, input, 1);
    // add back the drain so that only the refuel remains
    gain[name] = game.fuel - before + (120 / 60) * (1 / 32);
  }
  assert.ok(gain.slow > gain.normal && gain.normal > gain.fast, JSON.stringify(gain));
  assert.ok(gain.slow > 0.25 && gain.slow < 0.32, "slow gain " + gain.slow);
  assert.ok(gain.fast > 0.05 && gain.fast < 0.12, "fast gain " + gain.fast);
});

test("the tank tops out at 1 and announces it once", () => {
  const { game, input } = makeGame();
  recordDeaths(game);
  clearEnemies(game);
  place(game, 76, 100);
  game.fuel = 0.95;
  spawn(game, "depot", 76, 100 + 24 - 5);
  let full = 0;
  game.onTankFull = () => full++;
  for (let i = 0; i < 120; i++) {
    game.player.speed = 0;
    step(game, input, 1);
    assert.ok(game.fuel <= 1);
  }
  assert.ok(game.fuel > 0.99);
  assert.equal(full, 1);
});
