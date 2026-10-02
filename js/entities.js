(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;

  function approach(value, target, maxDelta) {
    if (value < target) return Math.min(target, value + maxDelta);
    if (value > target) return Math.max(target, value - maxDelta);
    return value;
  }

  // ---- Player ---------------------------------------------------------------------------
  // x is the left edge of the sprite, y the bottom edge (world space, y up). The
  // camera moves; the player only steers sideways, and `speed` is the scroll speed.

  function Player() {
    this.reset();
  }

  Player.prototype.reset = function () {
    this.x = CFG.CENTER_X - CFG.PLAYER_W / 2;
    this.y = 0; // set by the game from the camera
    this.speed = CFG.SCROLL_NORMAL;
    this.frame = 0; // 0 level, 1 banking left, 2 banking right
  };

  Player.prototype.update = function (dt, input) {
    var dir = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
    this.x += dir * CFG.PLAYER_SPEED_X * dt;
    this.x = Math.max(0, Math.min(CFG.VIEW_W - CFG.PLAYER_W, this.x));
    this.frame = dir < 0 ? 1 : dir > 0 ? 2 : 0;

    var up = input.held("up");
    var down = input.held("down");
    var target = up && !down ? CFG.SCROLL_FAST : down && !up ? CFG.SCROLL_SLOW : CFG.SCROLL_NORMAL;
    this.speed = approach(this.speed, target, CFG.SCROLL_ACCEL * dt);
  };

  // Sprite left edge as drawn (whole pixels); collision uses the same position.
  Player.prototype.drawX = function () {
    return Math.round(this.x);
  };

  Player.prototype.centerX = function () {
    return this.drawX() + CFG.PLAYER_W / 2;
  };

  // Hitbox: the sprite inset by PLAYER_HIT_INSET on every side.
  Player.prototype.hitbox = function () {
    return {
      x: this.drawX() + CFG.PLAYER_HIT_INSET,
      y: this.y + CFG.PLAYER_HIT_INSET,
      w: CFG.PLAYER_HIT_W,
      h: CFG.PLAYER_HIT_H,
    };
  };

  // ---- Missile --------------------------------------------------------------------------
  // World space, like everything else. It moves MISSILE_SPEED relative to the screen,
  // i.e. the scroll speed plus MISSILE_SPEED relative to the world.

  function Missile(x, y) {
    this.x = x; // left edge (1 px wide)
    this.y = y; // bottom edge
    this.w = CFG.MISSILE_W;
    this.h = CFG.MISSILE_H;
  }

  Missile.prototype.tipX = function () {
    return this.x + this.w / 2;
  };

  Missile.prototype.tipY = function () {
    return this.y + this.h;
  };

  // ---- Enemies, depots and the bridge ------------------------------------------------
  // Plain objects: { type, x, y, w, h, dir, mover, speed, active, alive, frame, anim,
  // section }. x/y/w/h are a world-space box, so they work directly with aabbOverlap.

  var HITTABLE = { tanker: true, heli: true, depot: true, jet: true, bridge: true };

  function createEnemy(obj, base, sectionIndex) {
    return {
      type: obj.type,
      x: obj.x,
      y: base + obj.y,
      w: obj.w,
      h: obj.h,
      dir: obj.dir,
      mover: obj.mover,
      speed: obj.speed,
      active: false, // movers: woken up; jets: started their run
      alive: true,
      frame: 0,
      anim: 0,
      section: sectionIndex,
    };
  }

  function createBridge(section, base, sectionIndex) {
    return {
      type: "bridge",
      x: section.bridge.x0,
      y: base + section.bridge.y + CFG.BRIDGE_DECK_Y,
      w: section.bridge.x1 - section.bridge.x0,
      h: CFG.BRIDGE_DECK_H,
      dir: 0,
      mover: false,
      speed: 0,
      active: false,
      alive: true,
      frame: 0,
      anim: 0,
      section: sectionIndex,
    };
  }

  // The enemies of one section (as created when it loads), plus its bridge.
  function spawnSection(entry) {
    var list = [];
    var objs = entry.section.objects;
    for (var i = 0; i < objs.length; i++) list.push(createEnemy(objs[i], entry.base, entry.index));
    list.push(createBridge(entry.section, entry.base, entry.index));
    return list;
  }

  // world: { cameraY, playerY, sections } (sections as for RR.Collision).
  function updateEnemy(e, dt, world) {
    if (!e.alive) return;
    if (e.type === "tanker" || e.type === "heli") {
      if (e.mover && !e.active && Math.abs(e.y - world.playerY) <= CFG.MOVER_TRIGGER_DIST) e.active = true;
      if (e.active) {
        var nx = e.x + e.dir * e.speed * dt;
        var box = { x: nx, y: e.y, w: e.w, h: e.h };
        if (RR.Collision.boxOverWater(world.sections, box)) e.x = nx;
        else e.dir = -e.dir; // would leave the water: turn around
      }
      if (e.type === "heli") {
        e.anim += dt;
        e.frame = Math.floor(e.anim * CFG.HELI_ROTOR_FPS) % 2;
      }
    } else if (e.type === "jet") {
      if (!e.active && e.y - world.cameraY <= CFG.JET_TRIGGER_DIST) e.active = true;
      if (e.active) {
        e.x += e.dir * e.speed * dt;
        if (e.dir > 0 ? e.x > CFG.VIEW_W : e.x + e.w < 0) e.alive = false; // off the other side
      }
    }
  }

  // ---- Explosions -------------------------------------------------------------------------
  // Centred on (cx, cy) in world space. `scale` is for the big player explosion.

  function createExplosion(cx, cy, duration, scale) {
    return { cx: cx, cy: cy, t: 0, duration: duration, scale: scale || 1 };
  }

  function explosionFrame(ex) {
    return Math.min(2, Math.floor((ex.t / ex.duration) * 3));
  }

  RR.Entities = {
    approach: approach,
    Player: Player,
    Missile: Missile,
    HITTABLE: HITTABLE,
    createEnemy: createEnemy,
    createBridge: createBridge,
    spawnSection: spawnSection,
    updateEnemy: updateEnemy,
    createExplosion: createExplosion,
    explosionFrame: explosionFrame,
  };
})();
