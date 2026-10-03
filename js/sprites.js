(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var C = CFG.COLORS;

  // All art below is original: small hand-drawn pixel maps. '.' is transparent;
  // every other character is looked up in the sprite's palette.

  function mirrorRows(rows) {
    return rows.map(function (r) {
      return r.split("").reverse().join("");
    });
  }

  // ---- Player jet (9 x 10): level, banking left, banking right ----------------
  var PLAYER_PAL = { y: C.player, d: C.playerDark };
  var PLAYER_LEVEL = [
    "....y....",
    "....y....",
    "...yyy...",
    "...ydy...",
    "..yyyyy..",
    ".yyyyyyy.",
    "yyyyyyyyy",
    "yy.yyy.yy",
    "y..yyy..y",
    "...y.y...",
  ];
  var PLAYER_LEFT = [
    "....y....",
    "....y....",
    "...yyy...",
    "...ydy...",
    "...yyyy..",
    "..yyyyyy.",
    "..yyyyyyy",
    "..yy.yyyy",
    "..y..yy.y",
    "....y.y..",
  ];
  var PLAYER_RIGHT = mirrorRows(PLAYER_LEFT);

  // ---- Tanker (16 x 6), bow to the right; the left-facing one is mirrored ------
  var TANKER_PAL = { h: C.tankerHull, d: C.tankerDeck, s: C.tankerStripe };
  var TANKER_R = [
    "..dd............",
    "..dd.....d......",
    "dddddddddddddd..",
    "hhhhhhhhhhhhhhh.",
    "hsssssssssssshh.",
    ".hhhhhhhhhhhhh..",
  ];

  // ---- Helicopter (10 x 8), nose to the right; two rotor frames ------------------
  var HELI_PAL = { g: C.heli, k: C.heliDark, r: C.heliRotor };
  var HELI_BODY = [
    "....kk....",
    "g..ggggg..",
    "gggggggrrg",
    "...ggggggg",
    "...gggggg.",
    "...k....k.",
    "..kkkkkkk.",
  ];
  var HELI_R0 = ["rrrrrrrrrr"].concat(HELI_BODY);
  var HELI_R1 = ["..rrrrrr.."].concat(HELI_BODY);

  // ---- Enemy jet (12 x 7), nose to the right ------------------------------------------
  var JET_PAL = { j: C.jet, d: C.jetDark };
  var JET_R = [
    "..jj........",
    "...jj.......",
    "j...jjj.....",
    "jjjjjjjjdjjj",
    "j...jjj.....",
    "...jj.......",
    "..jj........",
  ];

  // ---- Fuel depot (8 x 22): red tank with F-U-E-L stacked vertically ------------------
  var DEPOT_PAL = { d: C.depot, D: "#8a2020", w: C.depotLetters };
  var DEPOT = [
    ".dddddD.",
    "ddddddDD",
    "ddwwwdDD", // F
    "ddwdddDD",
    "ddwwddDD",
    "ddwdddDD",
    "ddddddDD",
    "ddwdwdDD", // U
    "ddwdwdDD",
    "ddwdwdDD",
    "ddwwwdDD",
    "ddddddDD",
    "ddwwwdDD", // E
    "ddwwddDD",
    "ddwwddDD",
    "ddwwwdDD",
    "ddddddDD",
    "ddwdddDD", // L
    "ddwdddDD",
    "ddwdddDD",
    "ddwwwdDD",
    ".dddddD.",
  ];

  // ---- House (8 x 6), decoration only ----------------------------------------------------
  var HOUSE_PAL = { w: C.houseWall, r: C.houseRoof, k: "#4a3a2a" };
  var HOUSE = [
    "...rr...",
    "..rrrr..",
    ".rrrrrr.",
    "rrrrrrrr",
    "wkwwwwkw",
    "wwwkkwww",
  ];

  // ---- Explosion (12 x 12), three frames ---------------------------------------------------
  var EXP_PAL = { o: C.explosionOrange, y: C.explosionYellow, w: C.explosionWhite };
  var EXPLOSION = [
    [
      "............",
      "............",
      "............",
      "............",
      "....oyyo....",
      "...oyyyyo...",
      "...oyyyyo...",
      "....oyyo....",
      "............",
      "............",
      "............",
      "............",
    ],
    [
      "o....oo....o",
      ".o..oyyo..o.",
      "..oooyyooo..",
      "..oyyyyyyo..",
      ".ooyywwyyoo.",
      "oyyywwwwyyyo",
      "oyyywwwwyyyo",
      ".ooyywwyyoo.",
      "..oyyyyyyo..",
      "..oooyyooo..",
      ".o..oyyo..o.",
      "o....oo....o",
    ],
    [
      "o..........o",
      "............",
      "..o......o..",
      "....o..o....",
      "...o.yy.o...",
      "....yoyy....",
      "....yyoy....",
      "...o.yy.o...",
      "....o..o....",
      "..o......o..",
      "............",
      "o..........o",
    ],
  ];

  // ---- Reserve-jet icon for the HUD (7 x 6) -------------------------------------------------
  var LIFE_PAL = { y: C.player };
  var LIFE = [
    "...y...",
    "...y...",
    "..yyy..",
    ".yyyyy.",
    "yyyyyyy",
    "y..y..y",
  ];

  var DEFS = {
    player_0: { rows: PLAYER_LEVEL, palette: PLAYER_PAL },
    player_1: { rows: PLAYER_LEFT, palette: PLAYER_PAL },
    player_2: { rows: PLAYER_RIGHT, palette: PLAYER_PAL },
    tanker_r: { rows: TANKER_R, palette: TANKER_PAL },
    tanker_l: { rows: mirrorRows(TANKER_R), palette: TANKER_PAL },
    heli_r_0: { rows: HELI_R0, palette: HELI_PAL },
    heli_r_1: { rows: HELI_R1, palette: HELI_PAL },
    heli_l_0: { rows: mirrorRows(HELI_R0), palette: HELI_PAL },
    heli_l_1: { rows: mirrorRows(HELI_R1), palette: HELI_PAL },
    jet_r: { rows: JET_R, palette: JET_PAL },
    jet_l: { rows: mirrorRows(JET_R), palette: JET_PAL },
    depot: { rows: DEPOT, palette: DEPOT_PAL },
    house: { rows: HOUSE, palette: HOUSE_PAL },
    explosion_0: { rows: EXPLOSION[0], palette: EXP_PAL },
    explosion_1: { rows: EXPLOSION[1], palette: EXP_PAL },
    explosion_2: { rows: EXPLOSION[2], palette: EXP_PAL },
    life: { rows: LIFE, palette: LIFE_PAL },
  };

  // ---- Pixel font: 3 x 5 glyphs (plus an 11-wide half sign) ----------------------------------
  var GLYPH_ROWS = {
    "0": ["###", "#.#", "#.#", "#.#", "###"],
    "1": [".#.", "##.", ".#.", ".#.", "###"],
    "2": ["###", "..#", "###", "#..", "###"],
    "3": ["###", "..#", "###", "..#", "###"],
    "4": ["#.#", "#.#", "###", "..#", "..#"],
    "5": ["###", "#..", "###", "..#", "###"],
    "6": ["###", "#..", "###", "#.#", "###"],
    "7": ["###", "..#", "..#", ".#.", ".#."],
    "8": ["###", "#.#", "###", "#.#", "###"],
    "9": ["###", "#.#", "###", "..#", "###"],
    A: [".#.", "#.#", "###", "#.#", "#.#"],
    B: ["##.", "#.#", "##.", "#.#", "##."],
    C: ["###", "#..", "#..", "#..", "###"],
    D: ["##.", "#.#", "#.#", "#.#", "##."],
    E: ["###", "#..", "##.", "#..", "###"],
    F: ["###", "#..", "##.", "#..", "#.."],
    G: ["###", "#..", "#.#", "#.#", "###"],
    H: ["#.#", "#.#", "###", "#.#", "#.#"],
    I: ["###", ".#.", ".#.", ".#.", "###"],
    J: ["..#", "..#", "..#", "#.#", "###"],
    K: ["#.#", "#.#", "##.", "#.#", "#.#"],
    L: ["#..", "#..", "#..", "#..", "###"],
    M: ["#.#", "###", "###", "#.#", "#.#"],
    N: ["##.", "#.#", "#.#", "#.#", "#.#"],
    O: ["###", "#.#", "#.#", "#.#", "###"],
    P: ["###", "#.#", "###", "#..", "#.."],
    Q: ["###", "#.#", "#.#", "###", "..#"],
    R: ["##.", "#.#", "##.", "#.#", "#.#"],
    S: ["###", "#..", "###", "..#", "###"],
    T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#.#", "#.#", "#.#", "#.#", "###"],
    V: ["#.#", "#.#", "#.#", "#.#", ".#."],
    W: ["#.#", "#.#", "###", "###", "#.#"],
    X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
    Z: ["###", "..#", ".#.", "#..", "###"],
    " ": ["...", "...", "...", "...", "..."],
    "-": ["...", "...", "###", "...", "..."],
    ".": ["...", "...", "...", "...", ".#."],
    ":": ["...", ".#.", "...", ".#.", "..."],
    "!": [".#.", ".#.", ".#.", "...", ".#."],
    "?": ["###", "..#", ".#.", "...", ".#."],
    "/": ["..#", "..#", ".#.", "#..", "#.."],
    "'": [".#.", ".#.", "...", "...", "..."],
    "+": ["...", ".#.", "###", ".#.", "..."],
    "(": [".#.", "#..", "#..", "#..", ".#."],
    ")": [".#.", "..#", "..#", "..#", ".#."],
    "=": ["...", "###", "...", "###", "..."],
    ",": ["...", "...", "...", ".#.", "#.."],
  };

  // The half sign (U+00BD) is composed from "1", "/" and "2" (11 px wide).
  (function () {
    var parts = ["1", "/", "2"];
    var rows = [];
    for (var r = 0; r < 5; r++) {
      rows.push(
        parts
          .map(function (p) {
            return GLYPH_ROWS[p][r];
          })
          .join(".")
      );
    }
    GLYPH_ROWS["\u00bd"] = rows;
  })();

  // Turkish letters: a base letter plus a mark row above or below, making a 7-row glyph
  // that drawText lifts by one row so the base letter stays on the line.
  (function () {
    var MARKS = {
      "\u0130": { base: "I", above: ".#." }, // \u0130
      "\u00d6": { base: "O", above: "#.#" }, // \u00d6
      "\u00dc": { base: "U", above: "#.#" }, // \u00dc
      "\u011e": { base: "G", above: "###" }, // \u011e
      "\u015e": { base: "S", below: ".#." }, // \u015e
      "\u00c7": { base: "C", below: ".#." }, // \u00c7
    };
    for (var ch in MARKS) {
      var m = MARKS[ch];
      GLYPH_ROWS[ch] = [m.above || "..."].concat(GLYPH_ROWS[m.base], [m.below || "..."]);
    }
  })();

  var GLYPH_H = 5;
  var GLYPH_SPACING = 1;

  function glyphWidth(ch) {
    var g = GLYPH_ROWS[ch] || GLYPH_ROWS["?"];
    return g[0].length;
  }

  function textWidth(text, scale) {
    scale = scale || 1;
    var w = 0;
    for (var i = 0; i < text.length; i++) w += glyphWidth(text.charAt(i)) + GLYPH_SPACING;
    return Math.max(0, w - GLYPH_SPACING) * scale;
  }

  // ---- Canvas side (browser only; nothing above touches the DOM) ---------------------------

  var canvases = {};
  var glyphCache = {}; // color -> char -> canvas

  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // Turn a string-array pixel map plus a char -> color map into a cached canvas.
  function build(rows, palette) {
    var h = rows.length;
    var w = rows[0].length;
    var c = makeCanvas(w, h);
    var g = c.getContext("2d");
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = rows[y].charAt(x);
        if (ch === ".") continue;
        g.fillStyle = palette[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function init() {
    canvases = {};
    glyphCache = {};
    for (var name in DEFS) canvases[name] = build(DEFS[name].rows, DEFS[name].palette);
  }

  function get(name) {
    return canvases[name];
  }

  function glyphCanvas(ch, color) {
    var byColor = glyphCache[color] || (glyphCache[color] = {});
    var cached = byColor[ch];
    if (cached) return cached;
    var rows = GLYPH_ROWS[ch] || GLYPH_ROWS["?"];
    var pal = { "#": color };
    byColor[ch] = build(rows, pal);
    return byColor[ch];
  }

  // Draw text (A-Z, 0-9, İ Ö Ü Ğ Ş Ç and a few symbols; lower case is upper-cased) at integer scale.
  function drawText(ctx, text, x, y, color, scale) {
    scale = scale || 1;
    text = String(text).toUpperCase();
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var cv = glyphCanvas(ch, color);
      var lift = cv.height > GLYPH_H ? scale : 0; // 7-row Turkish glyphs start one row higher
      ctx.drawImage(cv, cx, y - lift, cv.width * scale, cv.height * scale);
      cx += (glyphWidth(ch) + GLYPH_SPACING) * scale;
    }
    return cx - x;
  }

  function drawTextCentered(ctx, text, centerX, y, color, scale) {
    var w = textWidth(String(text).toUpperCase(), scale);
    return drawText(ctx, text, Math.round(centerX - w / 2), y, color, scale);
  }

  function drawTextRight(ctx, text, rightX, y, color, scale) {
    var w = textWidth(String(text).toUpperCase(), scale);
    return drawText(ctx, text, Math.round(rightX - w), y, color, scale);
  }

  RR.Sprites = {
    DEFS: DEFS,
    GLYPH_ROWS: GLYPH_ROWS,
    GLYPH_H: GLYPH_H,
    GLYPH_SPACING: GLYPH_SPACING,
    mirrorRows: mirrorRows,
    glyphWidth: glyphWidth,
    textWidth: textWidth,
    init: init,
    get: get,
    build: build,
    drawText: drawText,
    drawTextCentered: drawTextCentered,
    drawTextRight: drawTextRight,
  };
})();
