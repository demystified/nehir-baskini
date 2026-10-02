(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var C = CFG.COLORS;
  var River = RR.River;

  var W = CFG.VIEW_W;
  var PLAY_H = CFG.PLAY_H;
  var SEG = CFG.SEGMENT_H;
  var N = CFG.SEGMENTS_PER_SECTION; // index of the bridge segment

  // The segment that sits below segment 0 of every section: the previous bridge.
  var BRIDGE_SEG = { half: CFG.BRIDGE_HALF, island: 0 };

  // ---- Land helpers (rendering) ----------------------------------------------------

  // The land (everything that is not water) of one segment as [x0, x1] ranges.
  function landOf(seg) {
    var left = CFG.CENTER_X - seg.half;
    var right = CFG.CENTER_X + seg.half;
    var land = [[0, left]];
    if (seg.island > 0) land.push([CFG.CENTER_X - seg.island, CFG.CENTER_X + seg.island]);
    land.push([right, W]);
    return land;
  }

  // Ranges of `a` that are not covered by `b` (both sorted, non-overlapping).
  function subtractRanges(a, b) {
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var x0 = a[i][0];
      var x1 = a[i][1];
      for (var j = 0; j < b.length && x0 < x1; j++) {
        if (b[j][1] <= x0 || b[j][0] >= x1) continue;
        if (b[j][0] > x0) out.push([x0, b[j][0]]);
        x0 = Math.max(x0, b[j][1]);
      }
      if (x0 < x1) out.push([x0, x1]);
    }
    return out;
  }

  // ---- Game ---------------------------------------------------------------------------------

  function Game() {
    this.cameraY = 0; // world y at the bottom edge of the playfield
    this.sections = []; // loaded sections: { index, section, base }
    this.sectionByIndex = {};
    this.time = 0;
    this.ensureSections();
  }

  // Screen y (rounded, so adjacent segments never leave a seam) of a world y.
  Game.prototype.screenY = function (worldY) {
    return Math.round(PLAY_H - (worldY - this.cameraY));
  };

  // Keep exactly the sections that touch the visible area (plus a margin) loaded.
  Game.prototype.ensureSections = function () {
    var lo = Math.max(0, River.sectionAt(this.cameraY - CFG.UNLOAD_MARGIN));
    var hi = River.sectionAt(this.cameraY + PLAY_H + CFG.LOAD_MARGIN);
    var kept = [];
    var map = {};
    var i;
    for (i = 0; i < this.sections.length; i++) {
      var s = this.sections[i];
      if (s.index >= lo && s.index <= hi) {
        kept.push(s);
        map[s.index] = s;
      }
    }
    for (i = lo; i <= hi; i++) {
      if (!map[i]) {
        var entry = { index: i, section: River.generateSection(i), base: River.sectionBase(i) };
        kept.push(entry);
        map[i] = entry;
      }
    }
    kept.sort(function (a, b) {
      return a.index - b.index;
    });
    this.sections = kept;
    this.sectionByIndex = map;
  };

  Game.prototype.update = function (dt) {
    this.time += dt;
    // Temporary (Task 3): auto-scroll so the river can be inspected.
    this.cameraY += CFG.SCROLL_NORMAL * dt;
    this.ensureSections();
  };

  // ---- Rendering ----------------------------------------------------------------------------

  Game.prototype.segmentOf = function (sectionIndex, k) {
    if (k < 0) {
      // below segment 0 is the previous section's bridge segment
      return sectionIndex > 0 ? BRIDGE_SEG : null;
    }
    if (k > N) {
      var next = this.sectionByIndex[sectionIndex + 1];
      return next ? next.section.segments[0] : null;
    }
    return this.sectionByIndex[sectionIndex].section.segments[k];
  };

  Game.prototype.renderSegment = function (ctx, entry, k) {
    var base = entry.base;
    var yBot = this.screenY(base + k * SEG);
    var yTop = this.screenY(base + (k + 1) * SEG);
    var h = yBot - yTop;
    if (h <= 0) return;
    var seg = entry.section.segments[k];
    var land = landOf(seg);
    var i;

    ctx.fillStyle = C.bank;
    for (i = 0; i < land.length; i++) ctx.fillRect(land[i][0], yTop, land[i][1] - land[i][0], h);

    // 1 px darker edge wherever land meets water: sideways...
    ctx.fillStyle = C.bankEdge;
    for (i = 0; i < land.length; i++) {
      if (land[i][0] > 0) ctx.fillRect(land[i][0], yTop, 1, h);
      if (land[i][1] < W) ctx.fillRect(land[i][1] - 1, yTop, 1, h);
    }
    // ...and along the steps between segments of different width.
    var above = this.segmentOf(entry.index, k + 1);
    var below = this.segmentOf(entry.index, k - 1);
    var r;
    if (above) {
      r = subtractRanges(land, landOf(above));
      for (i = 0; i < r.length; i++) ctx.fillRect(r[i][0], yTop, r[i][1] - r[i][0], 1);
    }
    if (below) {
      r = subtractRanges(land, landOf(below));
      for (i = 0; i < r.length; i++) ctx.fillRect(r[i][0], yBot - 1, r[i][1] - r[i][0], 1);
    }
  };

  // Road across both banks, plus the bridge deck over the water while it stands.
  Game.prototype.renderBridge = function (ctx, entry, alive) {
    var y0 = entry.base + entry.section.bridge.y;
    var bx0 = entry.section.bridge.x0;
    var bx1 = entry.section.bridge.x1;
    var deckTop = this.screenY(y0 + 14);
    var deckBot = this.screenY(y0 + 2);
    var roadTop = this.screenY(y0 + 12);
    var roadBot = this.screenY(y0 + 4);
    var lineY = this.screenY(y0 + 8);
    var x;

    // road on the banks
    ctx.fillStyle = C.road;
    ctx.fillRect(0, roadTop, bx0, roadBot - roadTop);
    ctx.fillRect(bx1, roadTop, W - bx1, roadBot - roadTop);

    if (alive) {
      ctx.fillStyle = C.bridge;
      ctx.fillRect(bx0, deckTop, bx1 - bx0, deckBot - deckTop);
      ctx.fillStyle = C.bridgeDark;
      ctx.fillRect(bx0, deckTop, bx1 - bx0, 1);
      ctx.fillRect(bx0, deckBot - 1, bx1 - bx0, 1);
      ctx.fillStyle = C.road;
      ctx.fillRect(bx0, roadTop, bx1 - bx0, roadBot - roadTop);
    } else {
      // broken stumps at both banks
      ctx.fillStyle = C.bridgeDark;
      ctx.fillRect(bx0, deckTop, 3, deckBot - deckTop);
      ctx.fillRect(bx1 - 3, deckTop, 3, deckBot - deckTop);
    }

    // dashed yellow centre line, along the whole road
    ctx.fillStyle = C.roadLine;
    for (x = 2; x < W; x += 8) {
      if (!alive && x + 4 > bx0 && x < bx1) continue;
      ctx.fillRect(x, lineY, 4, 1);
    }
  };

  Game.prototype.renderTerrain = function (ctx) {
    ctx.fillStyle = C.water;
    ctx.fillRect(0, 0, W, PLAY_H);

    var top = this.cameraY + PLAY_H;
    var houseSprite = RR.Sprites && RR.Sprites.get("house");
    for (var s = 0; s < this.sections.length; s++) {
      var entry = this.sections[s];
      var k;
      for (k = 0; k <= N; k++) {
        var segBottom = entry.base + k * SEG;
        if (segBottom + SEG <= this.cameraY || segBottom >= top) continue;
        this.renderSegment(ctx, entry, k);
      }
      var bridgeBottom = entry.base + entry.section.bridge.y;
      if (bridgeBottom + SEG > this.cameraY && bridgeBottom < top) {
        this.renderBridge(ctx, entry, entry.bridgeAlive !== false);
      }
      if (houseSprite) {
        var houses = entry.section.houses;
        for (var i = 0; i < houses.length; i++) {
          var hs = houses[i];
          var wy = entry.base + hs.y;
          if (wy + hs.h <= this.cameraY || wy >= top) continue;
          ctx.drawImage(houseSprite, hs.x, this.screenY(wy + hs.h));
        }
      }
    }
  };

  Game.prototype.render = function (ctx) {
    this.renderTerrain(ctx);
    ctx.fillStyle = C.hud;
    ctx.fillRect(0, PLAY_H, W, CFG.HUD_H);
  };

  RR.Game = Game;
})();
