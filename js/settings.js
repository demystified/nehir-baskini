(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;

  // localStorage can throw (privacy modes, file:// quirks) or be missing entirely,
  // so every access is wrapped; the game simply works with the defaults.
  function defaultStorage() {
    try {
      return globalThis.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  var DEFAULTS = {
    guided: false, // missiles follow the plane sideways
    fireSide: "left", // which side the on-screen FIRE button sits on
  };

  // Player preferences shown on the SETTINGS screen. Sound lives in RR.Audio (it has its
  // own saved mute flag); everything else is kept here as one JSON value.
  // `opts.storage` may be any { getItem, setItem } object (or null for none).
  function Settings(opts) {
    opts = opts || {};
    this.storage = opts.storage !== undefined ? opts.storage : defaultStorage();
    this.guided = DEFAULTS.guided;
    this.fireSide = DEFAULTS.fireSide;
    this.load();
  }

  Settings.DEFAULTS = DEFAULTS;

  Settings.prototype.load = function () {
    var saved = null;
    try {
      var raw = this.storage && this.storage.getItem(CFG.SETTINGS_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch (e) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return;
    if (typeof saved.guided === "boolean") this.guided = saved.guided;
    if (saved.fireSide === "left" || saved.fireSide === "right") this.fireSide = saved.fireSide;
  };

  Settings.prototype.save = function () {
    try {
      if (this.storage) this.storage.setItem(CFG.SETTINGS_KEY, JSON.stringify({ guided: this.guided, fireSide: this.fireSide }));
    } catch (e) {
      /* not fatal: the setting just won't survive a reload */
    }
  };

  RR.Settings = Settings;
})();
