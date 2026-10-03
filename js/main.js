(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var canvas = document.getElementById("screen");
  var ctx = canvas.getContext("2d");

  // Offscreen buffer at the logical resolution; everything is drawn here first.
  var buffer = document.createElement("canvas");
  buffer.width = CFG.VIEW_W;
  buffer.height = CFG.VIEW_H;
  var bctx = buffer.getContext("2d");
  bctx.imageSmoothingEnabled = false;

  RR.Sprites.init();
  RR.Input.attachKeyboard(window);
  RR.Input.attachTouch(window, document);
  var game = new RR.Game({ input: RR.Input, audio: RR.Audio });

  // The AudioContext may only be created/resumed inside a user gesture. Key presses and
  // pointer releases (taps) both count, on desktop and on phones.
  function unlockAudio() {
    RR.Audio.unlock();
  }
  window.addEventListener("keydown", unlockAudio, true);
  window.addEventListener("pointerup", unlockAudio, true);
  window.addEventListener("touchend", unlockAudio, true);

  // Largest integer scale that fits the window; fractional fit if even 2x doesn't fit.
  function computeScale(availW, availH) {
    var fit = Math.min(availW / CFG.VIEW_W, availH / CFG.VIEW_H);
    var whole = Math.floor(fit);
    return whole >= CFG.MIN_INTEGER_SCALE ? whole : fit;
  }

  function present() {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  // Height kept free below the game for the on-screen pad and FIRE button.
  function touchReserve() {
    if (!RR.Input.touchUi) return 0;
    var pad = document.querySelector(".touch-pad");
    if (!pad) return 0;
    var r = pad.getBoundingClientRect();
    return window.innerHeight - r.top + 8;
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var availH = Math.max(1, window.innerHeight - touchReserve());
    // Work in device pixels so the integer scale is crisp on HiDPI screens too.
    var scale = computeScale(window.innerWidth * dpr, availH * dpr);
    var w = Math.max(1, Math.floor(CFG.VIEW_W * scale));
    var h = Math.max(1, Math.floor(CFG.VIEW_H * scale));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w / dpr + "px";
    canvas.style.height = h / dpr + "px";
    present();
  }

  // Fixed 1/60 s update step with an accumulator; frame time clamped to 0.25 s.
  var last = null;
  var acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (last === null) last = now;
    var elapsed = Math.min((now - last) / 1000, CFG.MAX_FRAME_TIME);
    last = now;
    acc += elapsed;
    while (acc >= CFG.FIXED_DT) {
      game.update(CFG.FIXED_DT);
      RR.Input.endFrame(); // "pressed" flags last for exactly one update
      acc -= CFG.FIXED_DT;
    }
    game.render(bctx);
    present();
  }

  RR.Main = { computeScale: computeScale, game: game };

  // Tapping (or clicking) the screen starts and confirms, like Enter, unless a menu
  // (the title's gear, a SETTINGS row) takes the tap.
  canvas.addEventListener("pointerdown", function (e) {
    var r = canvas.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width) * CFG.VIEW_W;
    var y = ((e.clientY - r.top) / r.height) * CFG.VIEW_H;
    if (!game.tapAt(x, y)) RR.Input.tap("start");
  });

  // Settings that change the page around the game: which side the FIRE button is on.
  function applySettings(settings) {
    document.documentElement.classList.toggle("fire-right", settings.fireSide === "right");
  }
  game.onSettingsChange = applySettings;
  applySettings(game.settings);

  // Pause automatically when the tab is hidden, and don't let the clock jump when it
  // comes back.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) game.autoPause();
    last = null;
  });

  // iOS Safari ignores the viewport's user-scalable=no, so block its zoom gestures here:
  // pinch (Safari's gesture events), double-tap, and a quick second tap anywhere.
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
    document.addEventListener(type, function (e) {
      e.preventDefault();
    }, { passive: false });
  });
  document.addEventListener("dblclick", function (e) {
    e.preventDefault();
  }, { passive: false });
  var lastTouchEnd = 0;
  document.addEventListener("touchend", function (e) {
    var now = Date.now();
    if (now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  window.addEventListener("resize", resize);
  RR.Input.onTouchUi = resize; // the pad appearing changes the room left for the game
  window.addEventListener("orientationchange", resize);
  resize();
  requestAnimationFrame(frame);
})();
