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

  function Game(opts) {
    opts = opts || {};
    this.input = opts.input || RR.Input;
    this.scoring = opts.scoring || new RR.Scoring();
    this.player = new RR.Entities.Player();
    this.cameraY = 0; // world y at the bottom edge of the playfield
    this.sections = []; // loaded sections: { index, section, base, bridgeAlive }
    this.sectionByIndex = {};
    this.entities = []; // enemies, depots and bridges (alive or just destroyed)
    this.explosions = [];
    this.missile = null; // at most one at a time
    this.guided = false;
    this.spawnEnemies = true;
    this.time = 0;
    this.checkpoint = 0; // section index to respawn at
    this.fuel = CFG.FUEL_START; // 0..1
    this.refueling = false; // overlapping a depot this step
    this.startSection(0);
  }

  // (Re)build the world at the start of a section: fresh terrain and enemies from the
  // section's seed, camera at the section start, plane centred.
  Game.prototype.startSection = function (index) {
    this.sections = [];
    this.sectionByIndex = {};
    this.entities = [];
    this.explosions = [];
    this.missile = null;
    this.fuel = CFG.FUEL_START;
    this.refueling = false;
    this.cameraY = River.sectionBase(index);
    this.player.reset();
    this.player.y = this.cameraY + CFG.PLAYER_BOTTOM_MARGIN;
    this.ensureSections();
  };

  // Index of the section the plane is currently in.
  Game.prototype.currentSection = function () {
    return River.sectionAt(this.player.y);
  };

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
        var entry = { index: i, section: River.generateSection(i), base: River.sectionBase(i), bridgeAlive: true };
        kept.push(entry);
        map[i] = entry;
        if (this.spawnEnemies) this.entities.push.apply(this.entities, RR.Entities.spawnSection(entry));
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
    if (this.input.pressed("guided")) this.guided = !this.guided;
    this.updatePlaying(dt);
  };

  Game.prototype.updatePlaying = function (dt) {
    var player = this.player;
    var input = this.input;

    player.update(dt, input);
    this.cameraY += player.speed * dt;
    player.y = this.cameraY + CFG.PLAYER_BOTTOM_MARGIN;
    this.ensureSections();

    var world = { cameraY: this.cameraY, playerY: player.y, sections: this.sections };
    var i;
    for (i = 0; i < this.entities.length; i++) RR.Entities.updateEnemy(this.entities[i], dt, world);

    if (!this.missile && input.held("fire")) this.fireMissile();
    if (this.missile) this.updateMissile(dt);
    this.updateExplosions(dt);

    if (this.checkPlayerCollisions()) return;
    if (this.updateFuel(dt)) return;
    this.cleanup();
  };

  // Constant drain (whatever the speed), plus a refill while over a depot. Running dry
  // is fatal. Returns true if the player died.
  Game.prototype.updateFuel = function (dt) {
    var before = this.fuel;
    this.fuel -= CFG.FUEL_DRAIN * dt;
    if (this.refueling) this.fuel += CFG.FUEL_REFILL * dt;
    this.fuel = Math.max(0, Math.min(1, this.fuel));
    if (this.refueling && before < 1 && this.fuel >= 1) this.onTankFull();
    if (this.fuel <= 0) {
      this.die("fuel");
      return true;
    }
    return false;
  };

  Game.prototype.isLowFuel = function () {
    return this.fuel < CFG.FUEL_LOW;
  };

  Game.prototype.onTankFull = function () {};

  Game.prototype.fireMissile = function () {
    var p = this.player;
    this.missile = new RR.Entities.Missile(p.drawX() + Math.floor(CFG.PLAYER_W / 2), p.y + CFG.PLAYER_H);
  };

  // Move the missile and resolve what it hits first along its path this step: a
  // target, the bank (tip outside water), or the top of the screen.
  Game.prototype.updateMissile = function (dt) {
    var m = this.missile;
    var oldBottom = m.y;
    var oldTip = m.tipY();
    m.y += (CFG.MISSILE_SPEED + this.player.speed) * dt;
    if (this.guided) m.x = this.player.drawX() + Math.floor(CFG.PLAYER_W / 2);
    var newTip = m.tipY();

    if (m.y >= this.cameraY + PLAY_H) {
      this.missile = null; // left the top of the screen
      return;
    }

    // First point along the path where the tip is not over water.
    var bankY = Infinity;
    var steps = Math.max(1, Math.ceil((newTip - oldTip) / CFG.MISSILE_SWEEP_STEP));
    for (var i = 0; i <= steps; i++) {
      var y = oldTip + ((newTip - oldTip) * i) / steps;
      if (!RR.Collision.pointInWater(this.sections, m.tipX(), y)) {
        bankY = y;
        break;
      }
    }

    // Nearest target the swept box touches.
    var swept = { x: m.x, y: oldBottom, w: m.w, h: newTip - oldBottom };
    var target = null;
    var targetY = Infinity;
    for (var j = 0; j < this.entities.length; j++) {
      var e = this.entities[j];
      if (!e.alive || !RR.Entities.HITTABLE[e.type]) continue;
      if (!RR.Collision.aabbOverlap(swept, e)) continue;
      var contact = Math.max(oldTip, e.y);
      if (contact < targetY) {
        targetY = contact;
        target = e;
      }
    }

    if (target && targetY <= bankY) {
      this.missile = null;
      this.destroyEntity(target);
    } else if (bankY < Infinity) {
      this.missile = null; // hit the bank
    }
  };

  // A target shot down by the missile: points, explosion, and bridge consequences.
  Game.prototype.destroyEntity = function (e) {
    e.alive = false;
    this.explodeAt(e.x + e.w / 2, e.y + e.h / 2);
    if (e.type === "bridge") {
      var entry = this.sectionByIndex[e.section];
      if (entry) entry.bridgeAlive = false;
      this.checkpoint = Math.max(this.checkpoint, e.section + 1);
      for (var i = 1; i < CFG.BRIDGE_EXPLOSIONS; i++) {
        var fx = e.x + (e.w * i) / CFG.BRIDGE_EXPLOSIONS;
        this.explodeAt(fx, e.y + e.h / 2, i * 0.08);
      }
    }
    this.award(e.type);
  };

  Game.prototype.explodeAt = function (cx, cy, delay) {
    var ex = RR.Entities.createExplosion(cx, cy, CFG.EXPLOSION_TIME, 1);
    ex.t = -(delay || 0); // negative time = waiting to start
    this.explosions.push(ex);
  };

  Game.prototype.award = function (type) {
    var earned = this.scoring.add(CFG.SCORE[type]);
    return earned;
  };

  Game.prototype.updateExplosions = function (dt) {
    var keep = [];
    for (var i = 0; i < this.explosions.length; i++) {
      var ex = this.explosions[i];
      ex.t += dt;
      if (ex.t < ex.duration) keep.push(ex);
    }
    this.explosions = keep;
  };

  // Terrain, enemies, the bridge; also refuelling at depots (Task 6). Returns true if
  // the player died.
  Game.prototype.checkPlayerCollisions = function () {
    var hb = this.player.hitbox();
    this.refueling = false;
    if (!RR.Collision.boxOverWater(this.sections, hb)) {
      this.die("bank");
      return true;
    }
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (!e.alive || !RR.Collision.aabbOverlap(hb, e)) continue;
      if (e.type === "depot") {
        this.refueling = true; // flying over a depot refuels; it is not an obstacle
        continue;
      }
      if (e.type !== "bridge") {
        e.alive = false;
        this.explodeAt(e.x + e.w / 2, e.y + e.h / 2);
      }
      this.die(e.type);
      return true;
    }
    return false;
  };

  // Placeholder (Task 5): log it and start the section over. Task 7 replaces this
  // with the DYING state and lives.
  Game.prototype.die = function (reason) {
    console.log("death: " + reason + " in section " + this.currentSection());
    this.startSection(this.currentSection());
  };

  // Drop what has scrolled out of view or been destroyed.
  Game.prototype.cleanup = function () {
    var limit = this.cameraY - CFG.UNLOAD_MARGIN;
    var keep = [];
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (e.alive && e.y + e.h > limit) keep.push(e);
    }
    this.entities = keep;
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
    var deckTop = this.screenY(y0 + CFG.BRIDGE_DECK_Y + CFG.BRIDGE_DECK_H);
    var deckBot = this.screenY(y0 + CFG.BRIDGE_DECK_Y);
    var roadTop = this.screenY(y0 + CFG.BRIDGE_ROAD_Y + CFG.BRIDGE_ROAD_H);
    var roadBot = this.screenY(y0 + CFG.BRIDGE_ROAD_Y);
    var lineY = this.screenY(y0 + CFG.BRIDGE_ROAD_Y + CFG.BRIDGE_ROAD_H / 2);
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

  Game.prototype.renderEntity = function (ctx, e) {
    var name;
    if (e.type === "tanker") name = "tanker_" + (e.dir < 0 ? "l" : "r");
    else if (e.type === "heli") name = "heli_" + (e.dir < 0 ? "l" : "r") + "_" + e.frame;
    else if (e.type === "jet") name = "jet_" + (e.dir < 0 ? "l" : "r");
    else if (e.type === "depot") name = "depot";
    else return; // the bridge is part of the terrain
    ctx.drawImage(RR.Sprites.get(name), Math.round(e.x), this.screenY(e.y + e.h));
  };

  Game.prototype.renderEntities = function (ctx) {
    var top = this.cameraY + PLAY_H;
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (!e.alive || e.y + e.h <= this.cameraY || e.y >= top) continue;
      this.renderEntity(ctx, e);
    }
  };

  Game.prototype.renderPlayer = function (ctx) {
    var sprite = RR.Sprites.get("player_" + this.player.frame);
    var y = this.screenY(this.player.y + CFG.PLAYER_H);
    ctx.drawImage(sprite, this.player.drawX(), y);
  };

  Game.prototype.renderMissile = function (ctx) {
    var m = this.missile;
    if (!m) return;
    ctx.fillStyle = C.white;
    ctx.fillRect(m.x, this.screenY(m.tipY()), m.w, m.h);
  };

  Game.prototype.renderExplosions = function (ctx) {
    for (var i = 0; i < this.explosions.length; i++) {
      var ex = this.explosions[i];
      if (ex.t < 0) continue;
      var sprite = RR.Sprites.get("explosion_" + RR.Entities.explosionFrame(ex));
      var size = sprite.width * ex.scale;
      ctx.drawImage(sprite, Math.round(ex.cx - size / 2), Math.round(this.screenY(ex.cy) - size / 2), size, size);
    }
  };

  Game.prototype.render = function (ctx) {
    this.renderTerrain(ctx);
    this.renderEntities(ctx);
    this.renderMissile(ctx);
    this.renderPlayer(ctx);
    this.renderExplosions(ctx);
    RR.Hud.draw(ctx, this.hudModel());
  };

  Game.prototype.hudModel = function () {
    return {
      score: this.scoring.score,
      fuel: this.fuel,
      reserves: this.scoring.reserves,
      bridge: this.currentSection() + 1,
      guided: this.guided,
      time: this.time,
    };
  };

  RR.Game = Game;
})();
