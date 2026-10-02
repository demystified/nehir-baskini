"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/config.js");
require("../js/sprites.js");
const { Sprites, CONFIG } = globalThis.RR;

test("every sprite is a rectangle and only uses palette characters", () => {
  for (const [name, def] of Object.entries(Sprites.DEFS)) {
    const w = def.rows[0].length;
    for (const row of def.rows) {
      assert.equal(row.length, w, `${name}: ragged row "${row}"`);
      for (const ch of row) {
        if (ch !== ".") assert.ok(def.palette[ch], `${name}: character '${ch}' has no colour`);
      }
    }
  }
});

test("sprite sizes match the config", () => {
  const size = (n) => [Sprites.DEFS[n].rows[0].length, Sprites.DEFS[n].rows.length];
  for (const n of ["player_0", "player_1", "player_2"]) assert.deepEqual(size(n), [CONFIG.PLAYER_W, CONFIG.PLAYER_H]);
  for (const n of ["tanker_r", "tanker_l"]) assert.deepEqual(size(n), [CONFIG.TANKER_W, CONFIG.TANKER_H]);
  for (const n of ["heli_r_0", "heli_r_1", "heli_l_0", "heli_l_1"]) assert.deepEqual(size(n), [CONFIG.HELI_W, CONFIG.HELI_H]);
  for (const n of ["jet_r", "jet_l"]) assert.deepEqual(size(n), [CONFIG.JET_W, CONFIG.JET_H]);
  assert.deepEqual(size("depot"), [CONFIG.DEPOT_W, CONFIG.DEPOT_H]);
  assert.deepEqual(size("house"), [CONFIG.HOUSE_W, CONFIG.HOUSE_H]);
});

test("facing sprites are exact mirrors", () => {
  assert.deepEqual(Sprites.DEFS.tanker_l.rows, Sprites.mirrorRows(Sprites.DEFS.tanker_r.rows));
  assert.deepEqual(Sprites.DEFS.jet_l.rows, Sprites.mirrorRows(Sprites.DEFS.jet_r.rows));
  assert.deepEqual(Sprites.DEFS.player_2.rows, Sprites.mirrorRows(Sprites.DEFS.player_1.rows));
});

test("the player sprite is symmetric when level, and not when banking", () => {
  const lvl = Sprites.DEFS.player_0.rows;
  assert.deepEqual(lvl, Sprites.mirrorRows(lvl));
  assert.notDeepEqual(Sprites.DEFS.player_1.rows, Sprites.mirrorRows(Sprites.DEFS.player_1.rows));
});

test("font: 5 rows per glyph, consistent width, covers 0-9 A-Z and the half sign", () => {
  const need = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ½-.:!?/'+()=,";
  for (const ch of need) {
    const g = Sprites.GLYPH_ROWS[ch];
    assert.ok(g, `missing glyph '${ch}'`);
    assert.equal(g.length, Sprites.GLYPH_H);
    for (const row of g) {
      assert.equal(row.length, g[0].length);
      assert.match(row, /^[#.]+$/);
    }
  }
});

test("text width accounts for spacing and scale", () => {
  assert.equal(Sprites.textWidth("", 1), 0);
  assert.equal(Sprites.textWidth("A", 1), 3);
  assert.equal(Sprites.textWidth("AB", 1), 7);
  assert.equal(Sprites.textWidth("AB", 2), 14);
});
