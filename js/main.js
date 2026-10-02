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
  var game = new RR.Game({ input: RR.Input });

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

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    // Work in device pixels so the integer scale is crisp on HiDPI screens too.
    var scale = computeScale(window.innerWidth * dpr, window.innerHeight * dpr);
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

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  resize();
  requestAnimationFrame(frame);
})();
