(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var C = CFG.COLORS;
  var W = CFG.VIEW_W;
  var TOP = CFG.PLAY_H; // the status bar starts here

  // Layout inside the 160 x 40 status bar (y values relative to TOP).
  var L = {
    scorePanel: { x: 38, y: 2, w: 84, h: 12 },
    gauge: { x: 10, y: 17, w: 140, h: 14 },
    gaugeE: 20, // x of the E tick; F is GAUGE_SPAN pixels to the right
    gaugeSpan: 120,
    strip: { y: 32, h: 8 },
  };

  function rect(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, TOP + y, w, h);
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }

  function drawScore(ctx, model) {
    var p = L.scorePanel;
    rect(ctx, C.hudDark, p.x, p.y, p.w, p.h);
    RR.Sprites.drawTextCentered(ctx, String(model.score), p.x + p.w / 2, TOP + p.y + 1, C.hudText, 2);
  }

  // E ... 1/2 ... F, with a needle that blinks while the tank is nearly empty.
  function drawFuel(ctx, model) {
    var g = L.gauge;
    rect(ctx, C.hudDark, g.x, g.y, g.w, g.h);
    var e = L.gaugeE;
    var f = L.gaugeE + L.gaugeSpan;
    var mid = (e + f) / 2;
    var S = RR.Sprites;

    S.drawText(ctx, "E", e - 1, TOP + g.y + 2, C.hudLight, 1);
    S.drawText(ctx, "F", f - 1, TOP + g.y + 2, C.hudLight, 1);
    S.drawText(ctx, "½", mid - 5, TOP + g.y + 2, C.hudLight, 1);

    // tick marks: major at E, 1/2, F; minor at 1/4 and 3/4
    var i;
    for (i = 0; i <= 4; i++) {
      var x = e + (L.gaugeSpan * i) / 4;
      var major = i % 2 === 0;
      rect(ctx, C.hudLight, x, g.y + (major ? 8 : 10), 1, major ? 4 : 2);
    }

    var low = model.fuel < CFG.FUEL_LOW;
    var visible = !low || Math.floor(model.time * 4) % 2 === 0;
    if (visible) {
      var nx = Math.round(e + model.fuel * L.gaugeSpan);
      rect(ctx, C.needle, nx - 1, g.y + 6, 3, 7);
    }
  }

  function drawStrip(ctx, model) {
    var s = L.strip;
    rect(ctx, C.hudDark, 0, s.y, W, s.h);
    var S = RR.Sprites;
    var ty = TOP + s.y + 2;
    // reserve jets: icon + count
    ctx.drawImage(S.get("life"), 6, TOP + s.y + 1);
    S.drawText(ctx, String(model.reserves), 16, ty, C.hudText, 1);
    // guided missiles
    if (model.guided) S.drawTextCentered(ctx, "G", W / 2, ty, C.hudText, 1);
    // current bridge number
    S.drawTextRight(ctx, "BRIDGE " + pad(model.bridge, 2), W - 6, ty, C.hudText, 1);
  }

  // model: { score, fuel (0..1), reserves, bridge, guided, time (seconds) }
  function draw(ctx, model) {
    rect(ctx, C.hud, 0, 0, W, CFG.HUD_H);
    rect(ctx, C.hudLight, 0, 0, W, 1);
    drawScore(ctx, model);
    drawFuel(ctx, model);
    drawStrip(ctx, model);
  }

  RR.Hud = { draw: draw, LAYOUT: L };
})();
