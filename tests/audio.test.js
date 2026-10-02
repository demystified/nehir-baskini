"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { RR, makeGame, step, clearEnemies, spawn } = require("./helpers.js");

const CFG = RR.CONFIG;
const A = CFG.AUDIO;

// ---- Game -> audio wiring (with a spy instead of real audio) ---------------------

function spyAudio() {
  const calls = [];
  const spy = {
    calls,
    updates: [],
    shot: () => calls.push(["shot"]),
    explosion: (big) => calls.push(["explosion", !!big]),
    extraLife: () => calls.push(["extraLife"]),
    ding: () => calls.push(["ding"]),
    toggleMute: () => calls.push(["toggleMute"]),
    update: (info) => spy.updates.push(Object.assign({}, info)),
    count: (name) => calls.filter((c) => c[0] === name).length,
  };
  return spy;
}

function place(game, x, cameraY) {
  game.cameraY = cameraY;
  game.player.x = x;
  game.player.y = cameraY + CFG.PLAYER_BOTTOM_MARGIN;
  game.ensureSections();
}

test("holding fire plays one 'shot' per missile, not a wall of noise", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ audio });
  clearEnemies(game);
  game.die = () => {};
  let missiles = 0;
  const realFire = game.fireMissile.bind(game);
  game.fireMissile = () => {
    missiles++;
    realFire();
  };
  input.down("fire", "k");
  step(game, input, 240);
  assert.equal(audio.count("shot"), missiles);
  assert.ok(missiles >= 4 && missiles <= 12, "missiles " + missiles);
  // one missile in flight at a time means at most one shot sound per flight time (~0.7 s)
  assert.ok(audio.count("shot") <= 240 / 60 / 0.4);
});

test("kills play an explosion; the player's death plays the big one, once", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ audio });
  clearEnemies(game);
  place(game, 76, 100);
  game.player.speed = 0;
  spawn(game, "tanker", 70, 100 + 24 + 10 + 30);
  input.down("fire", "k");
  for (let i = 0; i < 40; i++) {
    game.player.speed = 0;
    step(game, input, 1);
  }
  input.up("fire", "k");
  assert.deepEqual(audio.calls.filter((c) => c[0] === "explosion"), [["explosion", false]]);
  spawn(game, "heli", game.player.drawX(), game.player.y); // ram it
  step(game, input, 1);
  assert.equal(game.state, "DYING");
  assert.deepEqual(audio.calls.filter((c) => c[0] === "explosion"), [["explosion", false], ["explosion", true]]);
});

test("extra life jingle on crossing 10,000", () => {
  const audio = spyAudio();
  const { game, scoring } = makeGame({ audio });
  scoring.add(9900);
  game.award("tanker");
  game.award("tanker");
  game.award("tanker");
  game.award("tanker");
  assert.equal(audio.count("extraLife"), 1);
  game.award("bridge");
  assert.equal(audio.count("extraLife"), 1);
});

test("'ding' once when the tank becomes full while refuelling", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ audio });
  clearEnemies(game);
  place(game, 76, 100);
  game.fuel = 0.9;
  spawn(game, "depot", 76, 100 + 24 - 5);
  for (let i = 0; i < 180; i++) {
    game.player.speed = 0;
    step(game, input, 1);
  }
  assert.equal(audio.count("ding"), 1);
});

test("continuous sounds follow the state: engine only while PLAYING", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ title: true, audio });
  step(game, input, 3);
  assert.ok(audio.updates.length === 3 && audio.updates.every((u) => u.playing === false), "title");
  input.tap("start");
  step(game, input, 3);
  assert.equal(game.state, "READY");
  assert.equal(audio.updates[audio.updates.length - 1].playing, false);
  input.tap("fire");
  step(game, input, 2);
  assert.equal(game.state, "PLAYING");
  assert.equal(audio.updates[audio.updates.length - 1].playing, true);
  input.tap("pause");
  step(game, input, 2);
  assert.equal(audio.updates[audio.updates.length - 1].playing, false, "paused: silent");
  input.tap("pause");
  step(game, input, 2);
  assert.equal(audio.updates[audio.updates.length - 1].playing, true);
  game.die("test");
  step(game, input, 2);
  assert.equal(audio.updates[audio.updates.length - 1].playing, false, "dying: silent");
});

test("low-fuel alarm flag: only below 25% and only while playing; not while refuelling a full tank", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ audio });
  clearEnemies(game);
  game.player.speed = 0;
  game.fuel = 0.5;
  step(game, input, 1);
  assert.equal(audio.updates.at(-1).lowFuel, false);
  game.fuel = 0.2;
  game.player.speed = 0;
  step(game, input, 1);
  assert.equal(audio.updates.at(-1).lowFuel, true);
  assert.ok(Math.abs(audio.updates.at(-1).fuel - 0.2) < 0.01);
  input.tap("pause");
  step(game, input, 1);
  assert.equal(audio.updates.at(-1).lowFuel, false, "alarm off while paused");
});

test("refuel beeps are requested while overlapping a depot, with the fuel level", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ audio });
  clearEnemies(game);
  place(game, 76, 100);
  game.fuel = 0.4;
  spawn(game, "depot", 76, 100 + 24 - 5);
  game.player.speed = 0;
  step(game, input, 3);
  const u = audio.updates.at(-1);
  assert.equal(u.refueling, true);
  assert.ok(u.fuel > 0.4);
  game.player.x = 120;
  game.player.speed = 0;
  step(game, input, 3);
  assert.equal(audio.updates.at(-1).refueling, false);
});

test("M toggles mute once per press, in any state", () => {
  const audio = spyAudio();
  const { game, input } = makeGame({ title: true, audio });
  input.tap("mute");
  step(game, input, 3);
  assert.equal(audio.count("toggleMute"), 1);
  input.down("mute", "KeyM");
  step(game, input, 10);
  input.up("mute", "KeyM");
  assert.equal(audio.count("toggleMute"), 2, "holding the key doesn't repeat");
});

test("the game works with no audio at all", () => {
  const { game, input } = makeGame({ audio: null });
  input.down("fire", "k");
  step(game, input, 200);
  assert.ok(game.state);
});

// ---- audio.js itself, against a fake Web Audio ----------------------------------------

function fakeWebAudio() {
  const log = { contexts: 0, oscillators: [], gains: [], bursts: 0, filters: [], resumeCalls: 0 };
  class Param {
    constructor(owner, name, value) {
      this.owner = owner;
      this.name = name;
      this.value = value || 0;
      this.events = [];
    }
    setValueAtTime(v, t) {
      this.events.push(["set", v, t]);
      this.value = v;
    }
    linearRampToValueAtTime(v, t) {
      this.events.push(["lin", v, t]);
    }
    exponentialRampToValueAtTime(v, t) {
      assert.ok(v > 0, "exponential ramps must target a positive value");
      this.events.push(["exp", v, t]);
    }
    setTargetAtTime(v, t, tau) {
      this.events.push(["target", v, t, tau]);
      this.value = v;
    }
  }
  class Node {
    constructor(kind) {
      this.kind = kind;
      this.connections = [];
      this.gain = new Param(this, "gain", 1);
      this.frequency = new Param(this, "frequency", 440);
      this.detune = new Param(this, "detune", 0);
      this.Q = new Param(this, "Q", 1);
      this.started = null;
      this.stopped = null;
    }
    connect(n) {
      this.connections.push(n);
      return n;
    }
    start(t, offset) {
      this.started = [t, offset];
    }
    stop(t) {
      this.stopped = t;
      if (this.kind === "bufferSource" && this.onended) setTimeout(() => this.onended(), 0);
    }
  }
  class FakeContext {
    constructor() {
      log.contexts++;
      this.currentTime = 10;
      this.sampleRate = 8000;
      this.state = "suspended";
      this.destination = new Node("destination");
      FakeContext.last = this;
    }
    resume() {
      log.resumeCalls++;
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      const n = new Node("gain");
      log.gains.push(n);
      return n;
    }
    createOscillator() {
      const n = new Node("oscillator");
      log.oscillators.push(n);
      return n;
    }
    createBiquadFilter() {
      const n = new Node("filter");
      log.filters.push(n);
      return n;
    }
    createBufferSource() {
      log.bursts++;
      return new Node("bufferSource");
    }
    createBuffer(ch, len) {
      return { length: len, getChannelData: () => new Float32Array(len) };
    }
  }
  return { FakeContext, log };
}

function loadAudio(storage) {
  const fake = fakeWebAudio();
  globalThis.AudioContext = fake.FakeContext;
  if (storage === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  const file = path.join(__dirname, "..", "js", "audio.js");
  delete require.cache[require.resolve(file)];
  require(file);
  return { audio: globalThis.RR.Audio, fake };
}

function memStorage(initial) {
  const data = Object.assign({}, initial);
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)) };
}

test("audio.js: silent no-ops before the first user gesture, nothing is created", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.shot();
  audio.explosion(false);
  audio.extraLife();
  audio.ding();
  audio.update({ playing: true, speed: 60, refueling: true, fuel: 0.5, lowFuel: true });
  assert.equal(fake.log.contexts, 0);
  assert.equal(audio.isReady(), false);
});

test("audio.js: unlock creates the context once and resumes it", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  audio.unlock();
  assert.equal(fake.log.contexts, 1);
  assert.ok(fake.log.resumeCalls >= 1);
  assert.equal(audio.isReady(), true);
  assert.equal(fake.log.oscillators.length, 2, "engine: saw + square");
});

test("audio.js: engine pitch rises with scroll speed (55 -> 110 Hz) and is silent unless playing", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  const [saw] = fake.log.oscillators;
  const lastTarget = (param) => param.events.filter((e) => e[0] === "target").at(-1);
  audio.update({ playing: true, speed: CFG.SCROLL_SLOW, refueling: false, fuel: 1, lowFuel: false });
  assert.equal(lastTarget(saw.frequency)[1], A.ENGINE_HZ_MIN);
  audio.update({ playing: true, speed: CFG.SCROLL_FAST, refueling: false, fuel: 1, lowFuel: false });
  assert.equal(lastTarget(saw.frequency)[1], A.ENGINE_HZ_MAX);
  audio.update({ playing: true, speed: CFG.SCROLL_NORMAL, refueling: false, fuel: 1, lowFuel: false });
  const normal = lastTarget(saw.frequency)[1];
  assert.ok(normal > 55 && normal < 110);
  const engineGain = fake.log.gains.find((g) => g.gain.events.some((e) => e[0] === "target"));
  assert.equal(engineGain.gain.events.at(-1)[1], A.ENGINE_GAIN);
  audio.update({ playing: false, speed: 60, refueling: false, fuel: 1, lowFuel: false });
  assert.equal(engineGain.gain.events.at(-1)[1], 0);
  assert.ok(A.ENGINE_GAIN <= 0.1, "the hum stays quiet");
});

test("audio.js: shot is a short descending square blip, rate limited", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  const before = fake.log.oscillators.length;
  audio.shot();
  audio.shot(); // same instant: ignored
  assert.equal(fake.log.oscillators.length - before, 1);
  const osc = fake.log.oscillators.at(-1);
  assert.equal(osc.type, "square");
  const exp = osc.frequency.events.find((e) => e[0] === "exp");
  assert.equal(exp[1], A.SHOT_HZ_END);
  assert.ok(exp[1] < A.SHOT_HZ_START);
  assert.ok(osc.stopped - osc.started[0] < 0.25, "short");
  fake.FakeContext.last.currentTime += 1;
  audio.shot();
  assert.equal(fake.log.oscillators.length - before, 2);
});

test("audio.js: explosion = filtered noise burst with a falling low-pass; voices are capped", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  const filtersBefore = fake.log.filters.length;
  audio.explosion(false);
  const filter = fake.log.filters[filtersBefore];
  const sweep = filter.frequency.events;
  assert.equal(sweep[0][1], A.EXPLOSION_LP_START);
  assert.equal(sweep[1][1], A.EXPLOSION_LP_END);
  assert.ok(Math.abs(sweep[1][2] - sweep[0][2] - A.EXPLOSION_TIME) < 1e-9, "about 0.6 s");
  for (let i = 0; i < 20; i++) audio.explosion(false);
  assert.equal(fake.log.bursts, A.EXPLOSION_MAX_VOICES, "no pile-up of simultaneous bursts");
});

test("audio.js: extra life is a rising four-note arpeggio", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  const before = fake.log.oscillators.length;
  audio.extraLife();
  const notes = fake.log.oscillators.slice(before);
  assert.equal(notes.length, 4);
  const hz = notes.map((o) => o.frequency.events[0][1]);
  assert.deepEqual(hz, [...hz].sort((a, b) => a - b));
  const starts = notes.map((o) => o.started[0]);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.ok(starts[1] > starts[0]);
});

test("audio.js: refuel beeps repeat and rise in pitch with the fuel level; ding is high", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  const ctx = fake.FakeContext.last;
  const before = fake.log.oscillators.length;
  const info = (fuel) => ({ playing: true, speed: 60, refueling: true, fuel, lowFuel: false });
  audio.update(info(0.1));
  audio.update(info(0.1)); // same instant: no second beep yet
  assert.equal(fake.log.oscillators.length - before, 1);
  ctx.currentTime += A.REFUEL_BEEP_GAP + 0.001;
  audio.update(info(0.9));
  assert.equal(fake.log.oscillators.length - before, 2);
  const [low, high] = fake.log.oscillators.slice(before).map((o) => o.frequency.events[0][1]);
  assert.ok(high > low);
  assert.ok(low >= A.REFUEL_HZ_MIN && high <= A.REFUEL_HZ_MAX);
  const dingBefore = fake.log.oscillators.length;
  audio.ding();
  const dingHz = fake.log.oscillators[dingBefore].frequency.events[0][1];
  assert.ok(dingHz > A.REFUEL_HZ_MAX, "the ding is higher than any refuel beep");
});

test("audio.js: low-fuel alarm alternates two tones, and stays off while refuelling", () => {
  const { audio, fake } = loadAudio(memStorage());
  audio.unlock();
  const ctx = fake.FakeContext.last;
  const before = fake.log.oscillators.length;
  const low = { playing: true, speed: 60, refueling: false, fuel: 0.1, lowFuel: true };
  const hz = [];
  for (let i = 0; i < 4; i++) {
    audio.update(low);
    ctx.currentTime += A.ALARM_GAP + 0.001;
  }
  const tones = fake.log.oscillators.slice(before);
  assert.equal(tones.length, 4);
  tones.forEach((o) => hz.push(o.frequency.events[0][1]));
  assert.notEqual(hz[0], hz[1]);
  assert.equal(hz[0], hz[2]);
  assert.equal(hz[1], hz[3]);
  const n = fake.log.oscillators.length;
  audio.update(Object.assign({}, low, { refueling: true, fuel: 0.2 }));
  const added = fake.log.oscillators.slice(n);
  assert.equal(added.length, 1, "just the refuel beep, no alarm");
  assert.ok(added[0].frequency.events[0][1] <= A.REFUEL_HZ_MAX);
});

test("audio.js: mute silences the master gain and is remembered in localStorage", () => {
  const store = memStorage();
  const { audio, fake } = loadAudio(store);
  audio.unlock();
  const master = fake.log.gains.find((g) => g.connections.includes(fake.FakeContext.last.destination));
  assert.equal(master.gain.value, A.MASTER_GAIN);
  assert.equal(audio.isMuted(), false);
  assert.equal(audio.toggleMute(), true);
  assert.equal(master.gain.events.at(-1)[1], 0);
  assert.equal(store.data[CFG.MUTE_KEY], "1");
  assert.equal(audio.toggleMute(), false);
  assert.equal(master.gain.events.at(-1)[1], A.MASTER_GAIN);
  assert.equal(store.data[CFG.MUTE_KEY], "0");
  // a fresh page load with the setting stored starts muted
  audio.toggleMute();
  const again = loadAudio(store);
  assert.equal(again.audio.isMuted(), true);
  again.audio.unlock();
  const master2 = again.fake.log.gains.find((g) => g.connections.includes(again.fake.FakeContext.last.destination));
  assert.equal(master2.gain.value, 0);
});

test("audio.js: works without localStorage and without Web Audio", () => {
  const a = loadAudio(undefined);
  assert.equal(a.audio.isMuted(), false);
  assert.doesNotThrow(() => a.audio.toggleMute());
  const broken = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  const b = loadAudio(broken);
  assert.doesNotThrow(() => b.audio.toggleMute());
  delete globalThis.AudioContext;
  const file = path.join(__dirname, "..", "js", "audio.js");
  delete require.cache[require.resolve(file)];
  require(file);
  assert.doesNotThrow(() => globalThis.RR.Audio.unlock());
  assert.equal(globalThis.RR.Audio.isReady(), false);
  assert.doesNotThrow(() => globalThis.RR.Audio.shot());
  delete globalThis.localStorage;
});
