(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var Rng = RR.Rng;

  var CX = CFG.CENTER_X;
  var Q = CFG.HALF_QUANT;
  var N = CFG.SEGMENTS_PER_SECTION; // 32 normal segments; index N is the bridge segment
  var T = CFG.TAPER_SEGMENTS;
  var SEG = CFG.SEGMENT_H;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function snapDown(v) {
    return Math.floor(v / Q) * Q;
  }

  // ---- Seeds & difficulty -------------------------------------------------------

  // 16-bit seed for a section, derived from the fixed master seed with an integer
  // hash, so neighbouring sections get unrelated seeds. Never 0.
  function sectionSeed(index) {
    var h = (Math.imul(index + 1, 0x9e3779b1) ^ CFG.MASTER_SEED ^ Math.imul(CFG.SECTION_SEED_SALT, 0x85ebca6b)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    var s = h & 0xffff;
    return s === 0 ? CFG.RNG_FALLBACK_SEED : s;
  }

  // 0 at section 0, rising to 1 at DIFFICULTY_SECTIONS and staying there.
  function difficulty(index) {
    return Math.min(index, CFG.DIFFICULTY_SECTIONS) / CFG.DIFFICULTY_SECTIONS;
  }

  function sectionBase(index) {
    return index * CFG.SECTION_H;
  }

  // Index of the section containing world-space y.
  function sectionAt(worldY) {
    return Math.floor(worldY / CFG.SECTION_H);
  }

  // ---- Water spans ------------------------------------------------------------------

  // Open water of one segment as [x0, x1] spans (one, or two around an island).
  function spansOfSegment(seg) {
    if (seg.island > 0) {
      return [
        [CX - seg.half, CX - seg.island],
        [CX + seg.island, CX + seg.half],
      ];
    }
    return [[CX - seg.half, CX + seg.half]];
  }

  // Water spans at a y local to the section (0 = section start, increasing upward).
  // Outside the section there is no known water, so the result is empty.
  function spansAt(section, localY) {
    if (localY < 0 || localY >= CFG.SECTION_H) return [];
    return section.spans[Math.floor(localY / SEG)];
  }

  // ---- Terrain ----------------------------------------------------------------------

  // Half-widths for the 32 normal segments: a funnel out of the previous bridge, a
  // random walk toward wandering target widths, and a funnel into this bridge.
  function generateHalves(rng, index, d) {
    var halves = new Array(N);
    var special = index === 0;
    var stepMax = special ? CFG.SECTION0_STEP_MAX : CFG.MAX_HALF_STEP;
    var bridge = CFG.BRIDGE_HALF;

    // Taper in (from the previous section's bridge) and out (toward this one).
    var tapIn0 = bridge + Q * rng.int(1, 3);
    var tapIn1 = Math.min(tapIn0 + Q * rng.int(1, 3), bridge + 6 * Q);
    var tapOut0 = bridge + Q * rng.int(1, 3);
    var tapOut1 = Math.min(tapOut0 + Q * rng.int(1, 3), bridge + 6 * Q);
    halves[0] = tapIn0;
    halves[1] = tapIn1;
    halves[N - 1] = tapOut0;
    halves[N - 2] = tapOut1;

    var floorFrac = special ? 0 : CFG.TARGET_FLOOR_EASY * (1 - d);
    var lo = special ? CFG.SECTION0_HALF_MIN : CFG.HALF_MIN;
    var hi = special ? CFG.SECTION0_HALF_MAX : CFG.HALF_MAX;
    lo = snapDown(lo + floorFrac * (hi - lo));
    lo = clamp(lo, CFG.HALF_MIN, hi);

    var exit = halves[N - T]; // first of the outgoing taper
    var h = halves[T - 1];
    var target = h;
    var hold = 0;
    for (var k = T; k < N - T; k++) {
      if (h === target) {
        if (hold > 0) {
          hold--;
        } else {
          target = snapDown(rng.int(lo, hi));
          hold = rng.int(0, CFG.TARGET_HOLD_MAX);
        }
      }
      var step = Q * rng.int(CFG.TARGET_STEP_MIN / Q, Math.min(stepMax, CFG.TARGET_STEP_MAX) / Q);
      var next = h + clamp(target - h, -step, step);
      // Stay within reach of the outgoing taper, so the funnel is always possible.
      var reach = stepMax * (N - T - k);
      next = clamp(next, exit - reach, exit + reach);
      next = clamp(next, CFG.HALF_MIN, CFG.HALF_MAX);
      halves[k] = next;
      h = next;
    }
    return halves;
  }

  // Island half-widths. An island at segment k never exceeds
  // min(half[k-1], half[k], half[k+1]) - MIN_CHANNEL, which guarantees that every
  // channel keeps >= MIN_CHANNEL of horizontal overlap with a channel in each
  // neighbouring segment (no dead ends, ever). Sizes change by at most
  // ISLAND_MAX_STEP per segment so islands grow and shrink like blobs.
  function generateIslands(rng, halves, d, allowed) {
    var islands = new Array(N);
    var k;
    for (k = 0; k < N; k++) islands[k] = 0;
    if (!allowed) return islands;

    // cap[k]: largest legal island at k (0 = none possible).
    var cap = new Array(N);
    var prevHalf = CFG.BRIDGE_HALF;
    for (k = 0; k < N; k++) {
      var nextHalf = k + 1 < N ? halves[k + 1] : CFG.BRIDGE_HALF;
      var c = Math.min(snapDown(Math.min(prevHalf, halves[k], nextHalf) - CFG.MIN_CHANNEL), CFG.ISLAND_MAX_HALF);
      cap[k] = c >= CFG.ISLAND_MIN && k >= CFG.ISLAND_SKIP_SEGMENTS && k < N - T ? c : 0;
      prevHalf = halves[k];
    }
    // Envelope: an island must be able to shrink to 0 within ISLAND_MAX_STEP per
    // segment wherever the cap forces a 0 (and at the section's ends).
    var env = new Array(N);
    var carry = 0;
    for (k = 0; k < N; k++) {
      carry = Math.min(cap[k], carry + CFG.ISLAND_MAX_STEP);
      env[k] = carry;
    }
    carry = 0;
    for (k = N - 1; k >= 0; k--) {
      carry = Math.min(env[k], carry + CFG.ISLAND_MAX_STEP);
      env[k] = carry;
    }

    var startP = CFG.ISLAND_CHANCE_START + CFG.ISLAND_CHANCE_DIFFICULTY * d;
    var cur = 0;
    var target = 0;
    for (k = CFG.ISLAND_SKIP_SEGMENTS; k < N - T; k++) {
      var room = env[k];
      if (cur === 0) {
        if (room >= CFG.ISLAND_MIN && rng.chance(startP)) {
          var biggest = Math.min(CFG.ISLAND_MAX_STEP, room);
          cur = Q * rng.int(CFG.ISLAND_MIN / Q, biggest / Q);
          target = Q * rng.int(CFG.ISLAND_MIN / Q, Math.max(CFG.ISLAND_MIN, snapDown(room)) / Q);
        }
      } else {
        if (!rng.chance(CFG.ISLAND_CONTINUE)) {
          target = 0;
        } else if (cur === target) {
          target = Q * rng.int(CFG.ISLAND_MIN / Q, Math.max(CFG.ISLAND_MIN, snapDown(room)) / Q);
        }
        var step = Q * rng.int(0, CFG.ISLAND_MAX_STEP / Q);
        var moved = cur + clamp(target - cur, -step, step);
        moved = Math.min(moved, room);
        cur = moved < CFG.ISLAND_MIN ? 0 : moved;
      }
      islands[k] = cur;
    }
    return islands;
  }

  // ---- Objects ----------------------------------------------------------------------

  function rectsTooClose(a, b) {
    var g = CFG.OBJECT_GAP;
    return a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
  }

  function generateObjects(rng, index, d, spans) {
    var objs = [];
    var M = CFG.OBJECT_MARGIN;

    function clear(o) {
      for (var i = 0; i < objs.length; i++) if (rectsTooClose(o, objs[i])) return false;
      return true;
    }

    function moverSpeed() {
      return CFG.MOVER_SPEED + CFG.MOVER_SPEED_RISE * d;
    }

    // Tanker or helicopter: inside one water span of segment k.
    function placeShip(type, k, w, h, moverP) {
      var candidates = [];
      for (var i = 0; i < spans[k].length; i++) {
        var s = spans[k][i];
        if (s[1] - s[0] >= w + CFG.OBJECT_MIN_FREE + M) candidates.push(s);
      }
      if (!candidates.length) return;
      var span = rng.pick(candidates);
      // Hug one bank, so a gap of at least OBJECT_MIN_FREE is left on the other side
      // for the plane to slip past (a ship dead centre in a narrow channel would
      // leave two gaps too small to use).
      var lo = span[0] + M;
      var hi = span[1] - M - w;
      var x = rng.chance(0.5)
        ? rng.int(lo, Math.min(hi, span[1] - w - CFG.OBJECT_MIN_FREE))
        : rng.int(Math.max(lo, span[0] + CFG.OBJECT_MIN_FREE), hi);
      var y = k * SEG + rng.int(1, SEG - h - 1);
      var wantsMover = rng.chance(moverP);
      var dir = rng.chance(0.5) ? 1 : -1;
      var roomy = span[1] - span[0] >= w + 2 * M + CFG.MOVER_MIN_ROOM;
      var mover = wantsMover && roomy;
      var o = {
        type: type,
        x: x,
        y: y,
        w: w,
        h: h,
        mover: mover,
        dir: dir,
        speed: mover ? moverSpeed() : 0,
      };
      if (clear(o)) objs.push(o);
    }

    // Depot: 22 px tall, so it straddles segments k and k+1 and must fit in both.
    function placeDepot(k) {
      if (k + 1 > N - 1) return;
      var w = CFG.DEPOT_W;
      var h = CFG.DEPOT_H;
      var candidates = [];
      for (var i = 0; i < spans[k].length; i++) {
        for (var j = 0; j < spans[k + 1].length; j++) {
          var a = spans[k][i];
          var b = spans[k + 1][j];
          var x0 = Math.max(a[0], b[0]);
          var x1 = Math.min(a[1], b[1]);
          if (x1 - x0 >= w + 2 * M) candidates.push([x0, x1]);
        }
      }
      if (!candidates.length) return;
      var span = rng.pick(candidates);
      var x = rng.int(span[0] + M, span[1] - M - w);
      var y = k * SEG + rng.int(0, 2 * SEG - h);
      var o = { type: "depot", x: x, y: y, w: w, h: h, mover: false, dir: 0, speed: 0 };
      if (clear(o)) objs.push(o);
    }

    // Jet: waits just off-screen on one side; flies across, ignoring terrain.
    function placeJet(k) {
      var dir = rng.chance(0.5) ? 1 : -1;
      var y = k * SEG + rng.int(0, SEG - CFG.JET_H);
      var x = dir > 0 ? -CFG.JET_W - CFG.JET_START_GAP : CFG.VIEW_W + CFG.JET_START_GAP;
      objs.push({
        type: "jet",
        x: x,
        y: y,
        w: CFG.JET_W,
        h: CFG.JET_H,
        mover: false,
        dir: dir,
        speed: CFG.JET_SPEED + CFG.JET_SPEED_RISE * d,
      });
    }

    var k;
    if (index === 0) {
      // Hand-tuned: fuel near the start and in the middle, a few stationary tankers.
      for (k = 0; k < CFG.SECTION0_DEPOT_SEGMENTS.length; k++) placeDepot(CFG.SECTION0_DEPOT_SEGMENTS[k]);
      for (k = 0; k < CFG.SECTION0_TANKER_SEGMENTS.length; k++) {
        placeShip("tanker", CFG.SECTION0_TANKER_SEGMENTS[k], CFG.TANKER_W, CFG.TANKER_H, 0);
      }
      return objs;
    }

    var pTanker = CFG.TANKER_CHANCE;
    var pHeli = CFG.HELI_CHANCE;
    var pDepot = CFG.DEPOT_CHANCE - CFG.DEPOT_CHANCE_DROP * d;
    var pJet = CFG.JET_CHANCE + CFG.JET_CHANCE_RISE * d;
    var moverP = CFG.MOVER_CHANCE + CFG.MOVER_CHANCE_RISE * d;
    for (k = CFG.OBJECT_SKIP_SEGMENTS; k < N; k++) {
      var roll = rng.float();
      if (roll < pTanker) {
        placeShip("tanker", k, CFG.TANKER_W, CFG.TANKER_H, moverP);
      } else if (roll < pTanker + pHeli) {
        placeShip("heli", k, CFG.HELI_W, CFG.HELI_H, moverP);
      } else if (roll < pTanker + pHeli + pDepot) {
        placeDepot(k);
      } else if (roll < pTanker + pHeli + pDepot + pJet) {
        placeJet(k);
      }
    }
    return objs;
  }

  // Decoration only: at most one house per segment, on a bank wide enough for it.
  function generateHouses(rng, halves) {
    var houses = [];
    for (var k = 0; k < N; k++) {
      var wants = rng.chance(CFG.HOUSE_CHANCE);
      var left = rng.chance(0.5);
      var yOff = rng.int(2, SEG - CFG.HOUSE_H - 2);
      var bank = CX - halves[k];
      if (!wants || bank < CFG.HOUSE_MIN_BANK) continue;
      var m = CFG.HOUSE_MARGIN;
      var x = left
        ? rng.int(m, bank - CFG.HOUSE_W - m)
        : rng.int(CX + halves[k] + m, CFG.VIEW_W - CFG.HOUSE_W - m);
      houses.push({ x: x, y: k * SEG + yOff, w: CFG.HOUSE_W, h: CFG.HOUSE_H, side: left ? "left" : "right" });
    }
    return houses;
  }

  // ---- Section ----------------------------------------------------------------------

  function generateSection(index) {
    var seed = sectionSeed(index);
    var rng = new Rng(seed);
    var houseRng = new Rng(seed ^ 0x5a5a);
    var d = difficulty(index);

    var halves = generateHalves(rng, index, d);
    var islands = generateIslands(rng, halves, d, index !== 0);

    var segments = [];
    for (var k = 0; k < N; k++) segments.push({ half: halves[k], island: islands[k] });
    segments.push({ half: CFG.BRIDGE_HALF, island: 0 }); // the bridge segment

    var spans = segments.map(spansOfSegment);
    var objects = generateObjects(rng, index, d, spans);
    var houses = generateHouses(houseRng, halves);

    return {
      index: index,
      seed: seed,
      segments: segments,
      spans: spans,
      objects: objects,
      houses: houses,
      bridge: {
        y: N * SEG,
        h: SEG,
        x0: CX - CFG.BRIDGE_HALF,
        x1: CX + CFG.BRIDGE_HALF,
      },
    };
  }

  RR.River = {
    sectionSeed: sectionSeed,
    difficulty: difficulty,
    sectionBase: sectionBase,
    sectionAt: sectionAt,
    spansOfSegment: spansOfSegment,
    spansAt: spansAt,
    generateSection: generateSection,
  };
})();
