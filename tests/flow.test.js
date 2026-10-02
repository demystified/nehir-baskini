"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { RR, makeGame, step, clearEnemies, spawn, memoryStorage } = require("./helpers.js");

const CFG = RR.CONFIG;
const S = RR.Game.STATES;
const SECOND = 60;

// Kill the player right now by ramming a tanker placed on top of the plane.
function killByTanker(game, input) {
  spawn(game, "tanker", game.player.drawX(), game.player.y);
  step(game, input, 1);
}

// Skip through the DYING explosion.
function finishDying(game, input) {
  step(game, input, Math.ceil(CFG.DYING_TIME * SECOND) + 2);
}

function place(game, x, cameraY) {
  game.cameraY = cameraY;
  game.player.x = x;
  game.player.y = cameraY + CFG.PLAYER_BOTTOM_MARGIN;
  game.ensureSections();
}

test("starts on the title screen; the river scrolls slowly as a demo with no enemies", () => {
  const { game, input } = makeGame({ title: true });
  assert.equal(game.state, S.TITLE);
  assert.equal(game.entities.length, 0);
  const cam0 = game.cameraY;
  step(game, input, SECOND);
  assert.ok(Math.abs(game.cameraY - cam0 - CFG.TITLE_SCROLL) < 1e-6);
  assert.equal(game.entities.length, 0, "no enemies appear, even across section boundaries");
  step(game, input, SECOND * 20);
  assert.equal(game.entities.length, 0);
  assert.equal(game.state, S.TITLE);
});

test("title: Enter/Space (start) begins a new game at section 0, in READY", () => {
  const { game, input, scoring } = makeGame({ title: true });
  input.tap("start");
  step(game, input, 1);
  assert.equal(game.state, S.READY);
  assert.equal(game.cameraY, 0);
  assert.equal(game.currentSection(), 0);
  assert.equal(game.fuel, 1);
  assert.equal(scoring.reserves, 3);
  assert.equal(scoring.score, 0);
  assert.ok(game.entities.some((e) => e.type === "tanker"), "section 0 has its tankers");
});

test("title: other keys do nothing", () => {
  const { game, input } = makeGame({ title: true });
  input.tap("fire");
  input.tap("left");
  input.tap("pause");
  step(game, input, 5);
  assert.equal(game.state, S.TITLE);
});

test("READY: river frozen, plane waits; any input starts play", () => {
  for (const action of ["left", "right", "up", "down", "fire", "start"]) {
    const { game, input } = makeGame({ ready: true });
    assert.equal(game.state, S.READY);
    step(game, input, SECOND);
    assert.equal(game.cameraY, 0, "frozen");
    assert.equal(game.fuel, 1, "no fuel burnt while waiting");
    assert.equal(game.state, S.READY);
    input.tap(action);
    step(game, input, 1);
    assert.equal(game.state, S.PLAYING, action);
  }
});

test("READY: a key still held from before must be released and pressed again", () => {
  const { game, input } = makeGame({ title: true });
  input.down("fire", "Space");
  input.down("start", "Space"); // the Space key does both
  step(game, input, 1);
  assert.equal(game.state, S.READY);
  step(game, input, 30);
  assert.equal(game.state, S.READY, "still holding Space from the title screen");
  input.up("fire", "Space");
  input.up("start", "Space");
  step(game, input, 5);
  assert.equal(game.state, S.READY);
  input.down("left", "ArrowLeft");
  step(game, input, 1);
  assert.equal(game.state, S.PLAYING);
});

test("PLAYING <-> PAUSED with P: everything freezes; resume continues", () => {
  const { game, input } = makeGame();
  clearEnemies(game);
  step(game, input, 30);
  const cam = game.cameraY;
  const fuel = game.fuel;
  input.tap("pause");
  step(game, input, 1);
  assert.equal(game.state, S.PAUSED);
  input.down("left", "k"); // steering while paused does nothing
  const x = game.player.x;
  step(game, input, 120);
  input.up("left", "k");
  assert.equal(game.cameraY, cam);
  assert.equal(game.fuel, fuel);
  assert.equal(game.player.x, x);
  input.tap("pause");
  step(game, input, 1);
  assert.equal(game.state, S.PLAYING);
  step(game, input, 30);
  assert.ok(game.cameraY > cam);
});

test("tab hidden auto-pauses a running game, and only a running game", () => {
  const { game, input } = makeGame();
  game.autoPause();
  assert.equal(game.state, S.PAUSED);
  game.autoPause();
  assert.equal(game.state, S.PAUSED);
  const t = makeGame({ title: true });
  t.game.autoPause();
  assert.equal(t.game.state, S.TITLE);
  const r = makeGame({ ready: true });
  r.game.autoPause();
  assert.equal(r.game.state, S.READY);
  assert.ok(input);
});

test("death: DYING for ~1 s with the world frozen, then READY at the start of the section", () => {
  const { game, input, scoring } = makeGame();
  clearEnemies(game);
  step(game, input, 90);
  const hit = spawn(game, "tanker", game.player.drawX(), game.player.y);
  step(game, input, 1);
  assert.equal(game.state, S.DYING);
  assert.equal(game.dyingReason, "tanker");
  assert.equal(hit.alive, false);
  assert.ok(game.flashTime > 0, "screen flash");
  assert.ok(game.explosions.some((e) => e.scale === 2), "big plane explosion");
  const cam = game.cameraY;
  input.down("up", "k"); // controls are dead while exploding
  step(game, input, 30);
  input.up("up", "k");
  assert.equal(game.cameraY, cam);
  assert.equal(game.state, S.DYING);
  step(game, input, SECOND); // total > 1 s
  assert.equal(game.state, S.READY);
  assert.equal(scoring.reserves, 2);
  assert.equal(game.cameraY, 0, "back at the start of section 0");
  assert.equal(game.fuel, 1);
  assert.equal(game.player.x, CFG.CENTER_X - CFG.PLAYER_W / 2);
  assert.equal(game.player.speed, CFG.SCROLL_NORMAL);
  assert.equal(game.missile, null);
  assert.equal(game.explosions.length, 0);
});

test("death takes the configured time (about a second)", () => {
  const { game, input } = makeGame();
  clearEnemies(game);
  killByTanker(game, input);
  assert.equal(game.state, S.DYING);
  step(game, input, Math.floor(CFG.DYING_TIME * SECOND) - 3);
  assert.equal(game.state, S.DYING);
  step(game, input, 6);
  assert.equal(game.state, S.READY);
});

test("respawn rebuilds the section with fresh enemies and a fresh depot", () => {
  const { game, input } = makeGame();
  const before = game.entities.filter((e) => e.type === "depot").length;
  assert.ok(before >= 1);
  // shoot a tanker/depot, burn fuel, then die
  for (const e of game.entities) if (e.type === "depot") e.alive = false;
  game.fuel = 0.3;
  killByTanker(game, input);
  finishDying(game, input);
  assert.equal(game.state, S.READY);
  assert.equal(game.entities.filter((e) => e.type === "depot").length, before, "depots are back");
  assert.equal(game.fuel, 1);
  assert.deepEqual(
    game.entities.filter((e) => e.alive && e.type !== "bridge").map((e) => [e.type, e.x, e.y]),
    RR.River.generateSection(0).objects.map((o) => [o.type, o.x, o.y]),
    "the identical section 0 objects"
  );
});

test("checkpoint: dying before the bridge restarts the same section; after destroying it, the next", () => {
  const { game, input } = makeGame();
  assert.equal(game.checkpoint, 0);
  // fly a little, die: back to section 0
  clearEnemies(game);
  step(game, input, 60);
  killByTanker(game, input);
  finishDying(game, input);
  assert.equal(game.cameraY, 0);
  assert.equal(game.checkpoint, 0);
  game.beginPlay();
  // blow up bridge 0, then die before crossing it: respawn at the start of section 1
  const bridge = game.entities.find((e) => e.type === "bridge");
  place(game, 76, 512 - 150);
  input.down("fire", "k");
  let n = 0;
  while (bridge.alive && n++ < 200) step(game, input, 1);
  input.up("fire", "k");
  assert.equal(bridge.alive, false);
  assert.equal(game.checkpoint, 1);
  killByTanker(game, input);
  finishDying(game, input);
  assert.equal(game.state, S.READY);
  assert.equal(game.cameraY, 528, "start of section 1");
  assert.equal(game.currentSection(), 1);
  assert.equal(game.hudModel().bridge, 2);
  assert.equal(game.fuel, 1);
  assert.ok(game.entities.some((e) => e.type === "bridge" && e.section === 1 && e.alive));
  assert.equal(game.entities.some((e) => e.section === 0), false, "section 0 is not loaded any more");
});

test("checkpoint keeps moving forward bridge by bridge, never backwards", () => {
  const { game, input } = makeGame();
  game.die = () => {}; // the test teleports the plane over islands; ignore those deaths
  for (let i = 0; i < 4; i++) {
    const sectionStart = i * CFG.SECTION_H;
    place(game, 76, sectionStart + 512 - 150);
    clearEnemies(game);
    const bridge = game.entities.find((e) => e.type === "bridge" && e.section === i);
    assert.ok(bridge, "bridge " + i + " loaded");
    input.down("fire", "k");
    let n = 0;
    while (bridge.alive && n++ < 200) {
      game.fuel = 1;
      step(game, input, 1);
    }
    input.up("fire", "k");
    assert.equal(game.checkpoint, i + 1);
  }
  // destroying an older bridge can never lower the checkpoint
  game.destroyEntity({ type: "bridge", section: 0, x: 56, y: 0, w: 48, h: 12, alive: true });
  assert.equal(game.checkpoint, 4);
});

test("reserves: three respawns, then GAME OVER on the fourth death", () => {
  const { game, input, scoring } = makeGame();
  assert.equal(scoring.reserves, 3);
  const expected = [2, 1, 0];
  for (const left of expected) {
    clearEnemies(game);
    killByTanker(game, input);
    assert.equal(game.state, S.DYING);
    finishDying(game, input);
    assert.equal(game.state, S.READY, "respawned with " + left + " left");
    assert.equal(scoring.reserves, left);
    input.tap("fire");
    step(game, input, 1);
    assert.equal(game.state, S.PLAYING);
  }
  clearEnemies(game);
  killByTanker(game, input);
  assert.equal(game.state, S.DYING);
  finishDying(game, input);
  assert.equal(game.state, S.GAMEOVER);
  assert.equal(scoring.reserves, 0);
});

test("GAME OVER: high score saved, Enter returns to TITLE only after the delay", () => {
  const storage = memoryStorage();
  const { game, input, scoring } = makeGame({ storage });
  scoring.reserves = 0;
  scoring.add(1230);
  assert.equal(scoring.highScore, 0);
  clearEnemies(game);
  killByTanker(game, input);
  finishDying(game, input);
  assert.equal(game.state, S.GAMEOVER);
  assert.equal(game.newRecord, true);
  assert.equal(scoring.highScore, 1230);
  assert.equal(storage.data[CFG.HIGHSCORE_KEY], "1230");
  // a held-down Enter / mashing right after dying must not skip the screen
  input.tap("start");
  step(game, input, 5);
  assert.equal(game.state, S.GAMEOVER);
  step(game, input, SECOND);
  input.tap("start");
  step(game, input, 1);
  assert.equal(game.state, S.TITLE);
  assert.equal(scoring.score, 0, "score reset for the next game");
  assert.equal(scoring.highScore, 1230, "high score kept");
  // survives a "reload": a fresh Scoring on the same storage sees it
  assert.equal(new RR.Scoring({ storage }).highScore, 1230);
});

test("GAME OVER with a lower score keeps the old record and no 'new record' flag", () => {
  const storage = memoryStorage({ [CFG.HIGHSCORE_KEY]: "5000" });
  const { game, input, scoring } = makeGame({ storage });
  assert.equal(scoring.highScore, 5000);
  scoring.reserves = 0;
  scoring.add(900);
  clearEnemies(game);
  killByTanker(game, input);
  finishDying(game, input);
  assert.equal(game.state, S.GAMEOVER);
  assert.equal(game.newRecord, false);
  assert.equal(scoring.highScore, 5000);
  assert.equal(storage.data[CFG.HIGHSCORE_KEY], "5000");
});

test("a new game after GAME OVER starts clean: section 0, 3 reserves, checkpoint 0", () => {
  const { game, input, scoring } = makeGame();
  game.checkpoint = 3;
  scoring.reserves = 0;
  scoring.add(777);
  clearEnemies(game);
  killByTanker(game, input);
  finishDying(game, input);
  step(game, input, SECOND);
  input.tap("start");
  step(game, input, 1);
  assert.equal(game.state, S.TITLE);
  input.tap("start");
  step(game, input, 1);
  assert.equal(game.state, S.READY);
  assert.equal(game.checkpoint, 0);
  assert.equal(game.cameraY, 0);
  assert.equal(scoring.reserves, 3);
  assert.equal(scoring.score, 0);
  assert.equal(game.fuel, 1);
});

test("dying twice in one frame is ignored; die() only works while PLAYING", () => {
  const { game, input, scoring } = makeGame();
  clearEnemies(game);
  game.die("test");
  game.die("again");
  assert.equal(game.dyingReason, "test");
  assert.equal(game.explosions.filter((e) => e.scale === 2).length, 1);
  finishDying(game, input);
  assert.equal(scoring.reserves, 2, "only one reserve used");
  game.die("while ready");
  assert.equal(game.state, S.READY);
});

test("running out of fuel is a death like any other", () => {
  const { game, input, scoring } = makeGame();
  clearEnemies(game);
  game.fuel = 0.001;
  step(game, input, 10);
  assert.equal(game.state, S.DYING);
  assert.equal(game.dyingReason, "fuel");
  finishDying(game, input);
  assert.equal(game.state, S.READY);
  assert.equal(game.fuel, 1);
  assert.equal(scoring.reserves, 2);
});

test("bank death flows through the state machine too", () => {
  const { game, input } = makeGame();
  clearEnemies(game);
  input.down("left", "k");
  step(game, input, 120);
  input.up("left", "k");
  assert.equal(game.state === S.DYING || game.state === S.READY, true);
  assert.equal(game.dyingReason, "bank");
});

test("the world is frozen while dying: enemies do not move, score does not change", () => {
  const { game, input } = makeGame();
  clearEnemies(game);
  const mover = spawn(game, "tanker", 60, game.player.y + 40, { mover: true, speed: 40, dir: 1 });
  mover.active = true;
  game.die("test");
  const x = mover.x;
  step(game, input, 30);
  assert.equal(mover.x, x);
  assert.equal(game.scoring.score, 0);
});

test("extra life: reaching 10,000 mid-game adds a reserve, shown by the HUD model", () => {
  const { game, scoring } = makeGame();
  assert.equal(game.hudModel().reserves, 3);
  game.award("bridge");
  assert.equal(game.hudModel().reserves, 3);
  for (let i = 0; i < 19; i++) game.award("bridge");
  assert.equal(scoring.score, 10000);
  assert.equal(game.hudModel().reserves, 4);
  assert.equal(game.hudModel().score, 10000);
});

test("the extra-life cap: never more than 9 reserves, even across many thresholds", () => {
  const { game, scoring } = makeGame();
  for (let i = 0; i < 400; i++) game.award("bridge"); // 200,000 points = 20 thresholds
  assert.equal(scoring.score, 200000);
  assert.equal(scoring.reserves, 9);
});

test("guided mode toggles in any state and survives death", () => {
  const { game, input } = makeGame({ title: true });
  input.tap("guided");
  step(game, input, 1);
  assert.equal(game.guided, true);
  input.tap("start");
  step(game, input, 1);
  assert.equal(game.guided, true);
  assert.equal(game.hudModel().guided, true);
});

test("full round trip through every state", () => {
  const { game, input, scoring } = makeGame({ title: true });
  const seen = [game.state];
  const note = () => {
    if (seen[seen.length - 1] !== game.state) seen.push(game.state);
  };
  const run = (n) => {
    for (let i = 0; i < n; i++) {
      step(game, input, 1);
      note();
    }
  };
  input.tap("start");
  run(1);
  input.tap("fire");
  run(1);
  input.tap("pause");
  run(1);
  input.tap("pause");
  run(1);
  scoring.reserves = 0;
  clearEnemies(game);
  spawn(game, "heli", game.player.drawX(), game.player.y);
  run(1);
  run(SECOND + 5);
  run(SECOND);
  input.tap("start");
  run(1);
  assert.deepEqual(seen, [S.TITLE, S.READY, S.PLAYING, S.PAUSED, S.PLAYING, S.DYING, S.GAMEOVER, S.TITLE]);
});
