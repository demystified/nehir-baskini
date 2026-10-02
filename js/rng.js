(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;

  // Deterministic 16-bit Galois LFSR (taps 0xB400, period 65535). The state is
  // never 0. Each next() advances RNG_SHIFTS_PER_OUTPUT shifts so that
  // consecutive outputs are not just shifted copies of each other.
  function Rng(seed) {
    this._s = 1;
    this.state = seed === undefined ? CFG.RNG_FALLBACK_SEED : seed;
  }

  function coerce(v) {
    v = Math.floor(Number(v)) & 0xffff;
    return v === 0 ? CFG.RNG_FALLBACK_SEED : v;
  }

  Object.defineProperty(Rng.prototype, "state", {
    get: function () {
      return this._s;
    },
    set: function (v) {
      this._s = coerce(v);
    },
  });

  // One raw LFSR shift. Returns the new state (1..65535).
  Rng.prototype.step = function () {
    var s = this._s;
    var lsb = s & 1;
    s >>>= 1;
    if (lsb) s ^= CFG.RNG_TAPS;
    this._s = s;
    return s;
  };

  // Next value, 1..65535.
  Rng.prototype.next = function () {
    for (var i = 0; i < CFG.RNG_SHIFTS_PER_OUTPUT; i++) this.step();
    return this._s;
  };

  // Float in [0, 1).
  Rng.prototype.float = function () {
    return (this.next() - 1) / 65535;
  };

  // Integer in [min, max], both inclusive.
  Rng.prototype.int = function (min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  };

  // True with probability p.
  Rng.prototype.chance = function (p) {
    return this.float() < p;
  };

  Rng.prototype.pick = function (array) {
    return array[this.int(0, array.length - 1)];
  };

  RR.Rng = Rng;
})();
