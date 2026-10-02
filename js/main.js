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

  function drawFrame() {
    bctx.fillStyle = CFG.COLORS.water;
    bctx.fillRect(0, 0, CFG.VIEW_W, CFG.PLAY_H);
    bctx.fillStyle = CFG.COLORS.hud;
    bctx.fillRect(0, CFG.PLAY_H, CFG.VIEW_W, CFG.HUD_H);
  }

  // Largest integer scale that fits the window; fractional fit if even 2x doesn't fit.
  function computeScale(availW, availH) {
    var fit = Math.min(availW / CFG.VIEW_W, availH / CFG.VIEW_H);
    var whole = Math.floor(fit);
    return whole >= 2 ? whole : fit;
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

  RR.Main = { computeScale: computeScale };

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  drawFrame();
  resize();
})();
