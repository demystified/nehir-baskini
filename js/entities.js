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

  RR.Entities = {
    approach: approach,
    Player: Player,
  };
})();
