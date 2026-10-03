"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { RR, makeGame, step, memoryStorage } = require("./helpers.js");

const CFG = RR.CONFIG;
const S = RR.Game.STATES;

// A stand-in for RR.Audio: only the mute switch matters here.
function fakeAudio() {
  let muted = false;
  return {
    isMuted: () => muted,
    toggleMute: () => (muted = !muted),
    update: () => {}, // engine hum / alarm, driven every frame
  };
}

function press(game, input, action) {
  input.tap(action);
  step(game, input, 1);
}

// Logical y of the middle of SETTINGS row i, for tapAt().
function rowY(game, id) {
  const i = game.settingsRows().findIndex((r) => r.id === id);
  return 50 + i * 16 + 2;
}

test("defaults: guided off, FIRE button on the left", () => {
  const s = new RR.Settings({ storage: memoryStorage() });
  assert.equal(s.guided, false);
  assert.equal(s.fireSide, "left");
});

test("settings survive a reload, and bad or missing storage falls back to the defaults", () => {
  const storage = memoryStorage();
  const a = new RR.Settings({ storage });
  a.guided = true;
  a.fireSide = "right";
  a.save();
  const b = new RR.Settings({ storage });
  assert.equal(b.guided, true);
  assert.equal(b.fireSide, "right");

  const junk = new RR.Settings({ storage: memoryStorage({ [CFG.SETTINGS_KEY]: "{not json" }) });
  assert.deepEqual([junk.guided, junk.fireSide], [false, "left"]);
  const wrong = new RR.Settings({ storage: memoryStorage({ [CFG.SETTINGS_KEY]: '{"guided":"yes","fireSide":"up"}' }) });
  assert.deepEqual([wrong.guided, wrong.fireSide], [false, "left"]);
  const none = new RR.Settings({ storage: null });
  none.save(); // must not throw
  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  const t = new RR.Settings({ storage: throwing });
  t.save();
  assert.equal(t.fireSide, "left");
});

test("O opens SETTINGS from the title screen, Esc or O closes it again", () => {
  const { game, input } = makeGame({ title: true });
  press(game, input, "settings");
  assert.equal(game.state, S.SETTINGS);
  press(game, input, "back");
  assert.equal(game.state, S.TITLE);
  press(game, input, "settings");
  press(game, input, "settings");
  assert.equal(game.state, S.TITLE);
});

test("Enter on SETTINGS changes the option instead of starting a game", () => {
  const { game, input } = makeGame({ title: true, audio: fakeAudio() });
  press(game, input, "settings");
  press(game, input, "down"); // GUIDED MISSILES
  press(game, input, "start");
  assert.equal(game.state, S.SETTINGS);
  assert.equal(game.guided, true);
  press(game, input, "right");
  assert.equal(game.guided, false);
});

test("up/down wrap around the rows; BACK returns to the title", () => {
  const { game, input } = makeGame({ title: true });
  press(game, input, "settings");
  const count = game.settingsRows().length;
  press(game, input, "up");
  assert.equal(game.settingsRow, count - 1);
  assert.equal(game.settingsRows()[game.settingsRow].id, "back");
  press(game, input, "start");
  assert.equal(game.state, S.TITLE);
  press(game, input, "settings");
  assert.equal(game.settingsRow, 0, "the highlight starts at the top each time");
});

test("each option toggles and is saved: sound, guided missiles, FIRE side", () => {
  const audio = fakeAudio();
  const { game, input, storage } = makeGame({ title: true, audio });
  const changes = [];
  game.onSettingsChange = (s) => changes.push(s.fireSide);
  press(game, input, "settings");

  game.tapAt(80, rowY(game, "sound"));
  assert.equal(audio.isMuted(), true);
  assert.equal(game.settingsRows()[0].value, "OFF");

  game.tapAt(80, rowY(game, "guided"));
  assert.equal(game.guided, true);
  assert.equal(game.hudModel().guided, true);

  game.tapAt(80, rowY(game, "fireSide"));
  assert.equal(game.settings.fireSide, "right");
  assert.equal(changes.at(-1), "right", "the page is told to move the FIRE button");

  const reloaded = new RR.Settings({ storage });
  assert.deepEqual([reloaded.guided, reloaded.fireSide], [true, "right"]);
  assert.equal(game.state, S.SETTINGS, "changing options stays on the screen");
});

test("the G key still toggles guided missiles, and that is saved too", () => {
  const { game, input, storage } = makeGame();
  press(game, input, "guided");
  assert.equal(game.guided, true);
  assert.equal(new RR.Settings({ storage }).guided, true);
  const again = makeGame({ title: true, storage });
  assert.equal(again.game.guided, true, "a new game starts with the saved choice");
});

test("taps: the gear opens SETTINGS; elsewhere on the title it falls through to start", () => {
  const { game, input } = makeGame({ title: true });
  assert.equal(game.tapAt(80, 150), false, "not the gear: the caller treats it as start");
  assert.equal(game.state, S.TITLE);
  assert.equal(game.tapAt(144, 17), true);
  assert.equal(game.state, S.SETTINGS);
  assert.equal(game.tapAt(80, 180), true, "empty space on SETTINGS is swallowed");
  assert.equal(game.state, S.SETTINGS);
  game.tapAt(80, rowY(game, "back"));
  assert.equal(game.state, S.TITLE);
  step(game, input, 1);
  assert.equal(game.state, S.TITLE, "BACK doesn't also start a game");
});

test("taps outside the menus are left to the caller", () => {
  const { game } = makeGame();
  assert.equal(game.state, S.PLAYING);
  assert.equal(game.tapAt(144, 17), false);
  assert.equal(game.state, S.PLAYING);
});
