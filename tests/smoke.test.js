"use strict";
// Headless smoke tests: load the game modules in Node (no browser), generate lots of
// terrain, and run thousands of simulation steps - an autopilot, then random button
// mashing in every state - checking that nothing throws and the invariants hold. A
// stub canvas lets the rendering code run too.

const test = require("node:test");
const assert = require("node:assert/strict");

// A canvas 2D context that accepts anything, so the drawing code can run without a browser.
function stubContext() {
  const calls = { drawImage: 0, fillRect: 0 };
  const ctx = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "__calls") return calls;
        if (prop in target) return target[prop];
        return (...args) => {
          if (prop in calls) calls[prop]++;
          return undefined;
        };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
  return ctx;
}

globalThis.document = {
  createElement() {
    return { width: 0, height: 0, getContext: () => stubContext() };
  },
};

const { RR, makeGame, step } = require("./helpers.js");
require("../js/sprites.js");
require("../js/hud.js");
const { makeAutopilot } = require("./autopilot.js");

RR.Sprites.init();
const CFG = RR.CONFIG;
const S = RR.Game.STATES;

test("generates sections 0-99 without throwing, deterministically", () => {
  for (let i = 0; i < 100; i++) {
    const a = RR.River.generateSection(i);
    const b = RR.River.generateSection(i);
    assert.deepEqual(a, b);
    assert.equal(a.segments.length, CFG.SEGMENTS_PER_SECTION + 1);
    // every segment has water, and every object is inside the section
    for (const spans of a.spans) assert.ok(spans.length >= 1);
    for (const o of a.objects) assert.ok(o.y >= 0 && o.y < CFG.SECTION_H);
  }
});

test("sprites, HUD and every screen render without throwing", () => {
  const { game, input } = makeGame({ title: true });
  const ctx = stubContext();
  const draw = () => game.render(ctx);
  draw(); // title
  input.tap("start");
  step(game, input, 1);
  draw(); // ready
  game.time = 0.3;
  draw();
  input.tap("fire");
  step(game, input, 30);
  draw(); // playing
  game.fuel = 0.1;
  draw(); // low fuel needle (both blink phases)
  game.time += 0.13;
  draw();
  input.tap("pause");
  step(game, input, 1);
  assert.equal(game.state, S.PAUSED);
  draw();
  input.tap("pause");
  step(game, input, 1);
  game.input.touchUi = true; // touch variants of the prompts
  draw();
  game.die("test");
  draw(); // dying: explosion + flash
  step(game, input, 30);
  draw();
  game.scoring.reserves = 0;
  step(game, input, 40);
  assert.equal(game.state, S.GAMEOVER);
  draw();
  step(game, input, 70);
  draw();
  assert.ok(ctx.__calls.drawImage > 0 && ctx.__calls.fillRect > 0, "something was drawn");
});

test("every sprite canvas exists after init", () => {
  for (const name of Object.keys(RR.Sprites.DEFS)) {
    const c = RR.Sprites.get(name);
    assert.ok(c, name);
    assert.equal(c.width, RR.Sprites.DEFS[name].rows[0].length);
    assert.equal(c.height, RR.Sprites.DEFS[name].rows.length);
  }
});

// Checks that must hold after every single step, whatever the player does.
function checkInvariants(game, label) {
  assert.ok(Object.values(S).includes(game.state), label + ": state " + game.state);
  assert.ok(game.fuel >= 0 && game.fuel <= 1, label + ": fuel " + game.fuel);
  assert.ok(game.scoring.reserves >= 0 && game.scoring.reserves <= CFG.MAX_RESERVES, label + ": reserves " + game.scoring.reserves);
  assert.ok(game.scoring.score >= 0);
  assert.ok(game.player.x >= 0 && game.player.x <= CFG.VIEW_W - CFG.PLAYER_W, label + ": player x " + game.player.x);
  assert.ok(game.sections.length >= 1 && game.sections.length <= 3, label + ": sections loaded " + game.sections.length);
  assert.ok(game.entities.length < 250, label + ": entities " + game.entities.length);
  assert.ok(game.explosions.length < 60, label + ": explosions " + game.explosions.length);
  assert.ok(game.missile === null || (typeof game.missile.y === "number" && !Number.isNaN(game.missile.y)));
  assert.ok(Number.isFinite(game.cameraY) && game.cameraY >= 0);
  assert.ok(game.checkpoint >= 0);
  if (game.state === S.PLAYING) {
    assert.ok(Math.abs(game.player.y - (game.cameraY + CFG.PLAYER_BOTTOM_MARGIN)) < 1e-6, label + ": player/camera out of step");
    assert.ok(game.player.speed >= CFG.SCROLL_SLOW - 1e-9 && game.player.speed <= CFG.SCROLL_FAST + 1e-9);
  }
}

test("autopilot: a few thousand steps of real play (flying, shooting, bridges, fuel, deaths)", () => {
  const { game, input, scoring } = makeGame({ title: true });
  const pilot = makeAutopilot({});
  const ctx = stubContext();
  input.tap("start");
  step(game, input, 1);
  let maxSection = 0;
  let deaths = 0;
  let last = game.state;
  for (let n = 0; n < 9000 && game.state !== S.GAMEOVER; n++) {
    pilot(game, input);
    step(game, input, 1);
    checkInvariants(game, "autopilot step " + n);
    if (n % 97 === 0) game.render(ctx);
    if (game.state === S.DYING && last === S.PLAYING) deaths++;
    last = game.state;
    maxSection = Math.max(maxSection, game.currentSection());
  }
  assert.ok(maxSection >= 2, "the autopilot should get past at least two bridges, got to section " + maxSection);
  assert.ok(scoring.score >= 500, "score " + scoring.score);
  assert.ok(game.checkpoint >= 2);
});

test("autopilot over bare terrain: sections 0-39 are all passable (no dead ends in practice)", () => {
  for (let i = 0; i < 40; i++) {
    const { game, input } = makeGame();
    game.spawnEnemies = false;
    game.startSection(i);
    game.beginPlay();
    game.player.x = 70;
    const base = i * CFG.SECTION_H;
    game.entities = [RR.Entities.createBridge(game.sectionByIndex[i].section, base, i)];
    const pilot = makeAutopilot({ hunt: false });
    let n = 0;
    while (game.state === S.PLAYING && game.player.y < base + CFG.SECTION_H + 30 && n < 3600) {
      pilot(game, input);
      step(game, input, 1);
      n++;
    }
    assert.equal(game.state, S.PLAYING, `section ${i}: ${game.dyingReason} at y=${(game.player.y - base).toFixed(0)}`);
  }
});

test("random button mashing in every state for 40,000 steps: nothing throws, invariants hold", () => {
  const { game, input } = makeGame({ title: true });
  const rng = new RR.Rng(0xbeef);
  const ctx = stubContext();
  const actions = ["left", "right", "up", "down", "fire", "start", "pause", "mute", "guided"];
  const seen = new Set();
  for (let n = 0; n < 40000; n++) {
    // flip a random button now and then
    if (rng.chance(0.08)) {
      const a = rng.pick(actions);
      if (input.held(a)) input.up(a, "fuzz");
      else input.down(a, "fuzz");
    }
    if (rng.chance(0.02)) input.tap(rng.pick(actions));
    if (rng.chance(0.002)) game.autoPause();
    if (rng.chance(0.0005)) {
      // sometimes cheat so the late-game states are exercised too
      game.fuel = rng.float();
      game.scoring.add(rng.int(0, 15000));
    }
    step(game, input, 1);
    seen.add(game.state);
    checkInvariants(game, "fuzz step " + n);
    if (n % 53 === 0) game.render(ctx);
  }
  for (const state of Object.values(S)) assert.ok(seen.has(state), "never reached " + state);
});

test("the checkpoint is always the first section whose bridge is not yet destroyed", () => {
  // play with the autopilot, and after every bridge kill check the bookkeeping
  const { game, input } = makeGame();
  const pilot = makeAutopilot({});
  let lastCheckpoint = 0;
  for (let n = 0; n < 12000 && game.state !== S.GAMEOVER; n++) {
    pilot(game, input);
    step(game, input, 1);
    assert.ok(game.checkpoint >= lastCheckpoint, "checkpoint went backwards");
    assert.ok(game.checkpoint - lastCheckpoint <= 1, "checkpoint jumped");
    lastCheckpoint = game.checkpoint;
    // can never be more than one section ahead of the plane: you must destroy a bridge to cross it
    assert.ok(game.checkpoint <= game.currentSection() + 1, `checkpoint ${game.checkpoint} vs section ${game.currentSection()}`);
    if (game.state === S.READY) assert.equal(game.currentSection(), game.checkpoint, "respawned at the wrong section");
  }
  assert.ok(lastCheckpoint >= 1);
});
