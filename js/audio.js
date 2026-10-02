(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var A = CFG.AUDIO;

  // All sounds are synthesized here with Web Audio; there are no audio files. The
  // AudioContext is only created inside a user gesture (unlock), so the browser never
  // warns about autoplay. Until then every call is a silent no-op.

  var ctx = null;
  var master = null;
  var noise = null; // a second of white noise, reused by every explosion
  var engine = null; // { gain, osc }
  var muted = loadMuted();
  var activeBursts = 0;
  var lastShot = -1;
  var nextBeep = 0;
  var nextAlarm = 0;
  var alarmHigh = false;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function storage() {
    try {
      return globalThis.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function loadMuted() {
    try {
      var s = storage();
      return !!s && s.getItem(CFG.MUTE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function saveMuted() {
    try {
      var s = storage();
      if (s) s.setItem(CFG.MUTE_KEY, muted ? "1" : "0");
    } catch (e) {
      /* the setting just won't persist */
    }
  }

  function makeNoise() {
    var len = Math.floor(ctx.sampleRate * 1.3);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Low square/sawtooth hum, pitched by scroll speed. Runs silently until PLAYING.
  function buildEngine() {
    var gain = ctx.createGain();
    gain.gain.value = 0;
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    var saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = A.ENGINE_HZ_MIN;
    var sq = ctx.createOscillator();
    sq.type = "square";
    sq.frequency.value = A.ENGINE_HZ_MIN;
    sq.detune.value = 9; // slight beating makes it sound like an engine
    var sawGain = ctx.createGain();
    sawGain.gain.value = 0.7;
    var sqGain = ctx.createGain();
    sqGain.gain.value = 0.3;
    saw.connect(sawGain);
    sq.connect(sqGain);
    sawGain.connect(filter);
    sqGain.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    saw.start();
    sq.start();
    engine = { gain: gain, saw: saw, sq: sq };
  }

  function create() {
    var AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : A.MASTER_GAIN;
    master.connect(ctx.destination);
    noise = makeNoise();
    buildEngine();
  }

  // Call from a user gesture (key press, tap). Creates the context on first use and
  // resumes it if the browser suspended it.
  function unlock() {
    if (!ctx) create();
    if (ctx && ctx.state === "suspended" && ctx.resume) {
      try {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {
        /* still suspended: stay silent */
      }
    }
  }

  function ready() {
    return !!ctx && ctx.state === "running";
  }

  // One enveloped tone: starts and ends at silence, so it never clicks.
  function tone(type, hz0, hz1, dur, gain, when) {
    var t = when === undefined ? ctx.currentTime : when;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz0, t);
    if (hz1 !== hz0) osc.frequency.exponentialRampToValueAtTime(hz1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // Short descending square blip. Only one missile flies at a time, so this can never
  // pile up; a minimum gap guards against anything odd.
  function shot() {
    if (!ready()) return;
    var t = ctx.currentTime;
    if (t - lastShot < A.SHOT_MIN_GAP) return;
    lastShot = t;
    tone("square", A.SHOT_HZ_START, A.SHOT_HZ_END, A.SHOT_TIME, A.SHOT_GAIN);
  }

  // White noise through a falling low-pass. `big` is the player's plane.
  function explosion(big) {
    if (!ready() || activeBursts >= A.EXPLOSION_MAX_VOICES) return;
    var t = ctx.currentTime;
    var dur = big ? A.EXPLOSION_BIG_TIME : A.EXPLOSION_TIME;
    var src = ctx.createBufferSource();
    src.buffer = noise;
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(A.EXPLOSION_LP_START, t);
    filter.frequency.exponentialRampToValueAtTime(A.EXPLOSION_LP_END, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(A.EXPLOSION_GAIN * (big ? 1.2 : 1), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    activeBursts++;
    src.onended = function () {
      activeBursts = Math.max(0, activeBursts - 1);
    };
    src.start(t, Math.random() * 0.15);
    src.stop(t + dur + 0.05);
  }

  // Quick rising four-note arpeggio.
  function extraLife() {
    if (!ready()) return;
    var t = ctx.currentTime;
    var notes = A.EXTRA_LIFE_NOTES;
    for (var i = 0; i < notes.length; i++) {
      tone("square", notes[i], notes[i], A.EXTRA_LIFE_NOTE_TIME * 1.4, A.EXTRA_LIFE_GAIN, t + i * A.EXTRA_LIFE_NOTE_TIME);
    }
  }

  // High "ding" when the tank is full.
  function ding() {
    if (!ready()) return;
    tone("sine", A.DING_HZ, A.DING_HZ, A.DING_TIME, A.DING_GAIN);
    tone("sine", A.DING_HZ * 1.5, A.DING_HZ * 1.5, A.DING_TIME * 0.6, A.DING_GAIN * 0.5);
  }

  // Called every update with the state of the game:
  // { playing, speed, refueling, fuel, lowFuel }. Drives the continuous sounds.
  function update(info) {
    if (!ready()) return;
    var t = ctx.currentTime;

    // engine: only while PLAYING, pitch follows the scroll speed
    var k = clamp((info.speed - CFG.SCROLL_SLOW) / (CFG.SCROLL_FAST - CFG.SCROLL_SLOW), 0, 1);
    var hz = A.ENGINE_HZ_MIN + k * (A.ENGINE_HZ_MAX - A.ENGINE_HZ_MIN);
    engine.gain.gain.setTargetAtTime(info.playing ? A.ENGINE_GAIN : 0, t, A.ENGINE_SMOOTH);
    engine.saw.frequency.setTargetAtTime(hz, t, A.ENGINE_SMOOTH);
    engine.sq.frequency.setTargetAtTime(hz, t, A.ENGINE_SMOOTH);

    // refuelling: repeating beeps, pitch rising with the fuel level
    if (info.refueling) {
      if (t >= nextBeep) {
        var f = A.REFUEL_HZ_MIN + clamp(info.fuel, 0, 1) * (A.REFUEL_HZ_MAX - A.REFUEL_HZ_MIN);
        tone("square", f, f, A.REFUEL_BEEP_TIME, A.REFUEL_GAIN);
        nextBeep = t + A.REFUEL_BEEP_GAP;
      }
    } else {
      nextBeep = 0;
    }

    // low fuel: two-tone alarm (not while refuelling)
    if (info.lowFuel && !info.refueling) {
      if (t >= nextAlarm) {
        var a = alarmHigh ? A.ALARM_HZ_A : A.ALARM_HZ_B;
        tone("square", a, a, A.ALARM_TONE_TIME, A.ALARM_GAIN);
        alarmHigh = !alarmHigh;
        nextAlarm = t + A.ALARM_GAP;
      }
    } else {
      nextAlarm = 0;
      alarmHigh = false;
    }
  }

  function setMuted(value) {
    muted = !!value;
    saveMuted();
    if (master) master.gain.setTargetAtTime(muted ? 0 : A.MASTER_GAIN, ctx.currentTime, 0.015);
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  RR.Audio = {
    unlock: unlock,
    shot: shot,
    explosion: explosion,
    extraLife: extraLife,
    ding: ding,
    update: update,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: function () {
      return muted;
    },
    isReady: ready,
  };
})();
