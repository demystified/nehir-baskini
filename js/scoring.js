(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;

  // localStorage can throw (privacy modes, file:// quirks) or be missing entirely,
  // so every access is wrapped; the game simply works without it.
  function defaultStorage() {
    try {
      return globalThis.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  // Score, reserve jets (extra lives) and the persistent high score.
  // `opts.storage` may be any { getItem, setItem } object (or null for none).
  function Scoring(opts) {
    opts = opts || {};
    this.storage = opts.storage !== undefined ? opts.storage : defaultStorage();
    this.highScore = this.loadHigh();
    this.reset();
  }

  // Start a fresh game: score 0, 3 reserves, first bonus at 10,000.
  Scoring.prototype.reset = function () {
    this.score = 0;
    this.reserves = CFG.START_RESERVES;
    this.nextBonus = CFG.EXTRA_LIFE_EVERY;
  };

  // Add points. Returns how many extra lives were earned by crossing 10,000-point
  // thresholds (several at once are possible); reserves never exceed the cap, and a
  // threshold crossed while at the cap is simply used up.
  Scoring.prototype.add = function (points) {
    this.score += points;
    var earned = 0;
    while (this.score >= this.nextBonus) {
      this.nextBonus += CFG.EXTRA_LIFE_EVERY;
      if (this.reserves < CFG.MAX_RESERVES) {
        this.reserves++;
        earned++;
      }
    }
    return earned;
  };

  // Use up one reserve jet. Returns false if there are none left.
  Scoring.prototype.useReserve = function () {
    if (this.reserves <= 0) return false;
    this.reserves--;
    return true;
  };

  Scoring.prototype.loadHigh = function () {
    try {
      if (!this.storage) return 0;
      var v = parseInt(this.storage.getItem(CFG.HIGHSCORE_KEY), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  };

  // Called at game over: keep and persist the score if it beats the record.
  // Returns true when a new record was set.
  Scoring.prototype.commitHigh = function () {
    if (this.score <= this.highScore) return false;
    this.highScore = this.score;
    try {
      if (this.storage) this.storage.setItem(CFG.HIGHSCORE_KEY, String(this.highScore));
    } catch (e) {
      /* no persistence available: the record lives for this session only */
    }
    return true;
  };

  RR.Scoring = Scoring;
})();
