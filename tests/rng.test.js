"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/config.js");
require("../js/rng.js");
const { Rng, CONFIG } = globalThis.RR;

test("same seed gives the same first 1000 values", () => {
  const a = new Rng(0x1234);
  const b = new Rng(0x1234);
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test("different seeds give different sequences", () => {
  const a = new Rng(1);
  const b = new Rng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 5);
});

test("the sequence never yields 0 and stays within 1..65535", () => {
  const r = new Rng(0xbeef);
  for (let i = 0; i < 70000; i++) {
    const v = r.next();
    assert.ok(v >= 1 && v <= 65535, "value " + v);
  }
});

test("the raw LFSR has the full period of 65535 (taps are maximal)", () => {
  const r = new Rng(1);
  const seen = new Set();
  for (let i = 0; i < 65535; i++) seen.add(r.step());
  assert.equal(seen.size, 65535);
  assert.equal(r.state, 1, "returns to the seed after exactly one period");
});

test("next() also visits all 65535 states (16 shifts is coprime with the period)", () => {
  const r = new Rng(77);
  const seen = new Set();
  for (let i = 0; i < 65535; i++) seen.add(r.next());
  assert.equal(seen.size, 65535);
});

test("int stays within bounds, inclusive, and hits both ends", () => {
  const r = new Rng(99);
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 5000; i++) {
    const v = r.int(3, 7);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 3 && v <= 7);
    if (v === 3) sawMin = true;
    if (v === 7) sawMax = true;
  }
  assert.ok(sawMin && sawMax);
  assert.equal(r.int(5, 5), 5);
});

test("float is in [0, 1)", () => {
  const r = new Rng(4321);
  for (let i = 0; i < 70000; i++) {
    const f = r.float();
    assert.ok(f >= 0 && f < 1);
  }
});

test("a seed of 0 is coerced to a non-zero value", () => {
  const r = new Rng(0);
  assert.notEqual(r.state, 0);
  assert.notEqual(r.next(), 0);
  const s = new Rng(0x10000); // masks to 0 as well
  assert.notEqual(s.state, 0);
  const t = new Rng();
  assert.notEqual(t.state, 0);
  t.state = 0;
  assert.notEqual(t.state, 0);
});

test("state getter/setter round-trips and resumes the sequence", () => {
  const a = new Rng(555);
  a.next();
  a.next();
  const saved = a.state;
  const expected = [a.next(), a.next(), a.next()];
  const b = new Rng(1);
  b.state = saved;
  assert.deepEqual([b.next(), b.next(), b.next()], expected);
});

test("chance() follows the probability roughly, and pick() returns members", () => {
  const r = new Rng(2024);
  let hits = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) if (r.chance(0.25)) hits++;
  assert.ok(Math.abs(hits / n - 0.25) < 0.02, "got " + hits / n);
  assert.equal(r.chance(0), false);
  const arr = ["a", "b", "c"];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(r.pick(arr)));
});

test("consecutive floats are not trivially correlated", () => {
  // A single-shift LFSR makes float[n+1] ~ float[n]/2; make sure we avoided that.
  const r = new Rng(31337);
  let lowThenLow = 0;
  let low = 0;
  let prev = r.float();
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const f = r.float();
    if (prev < 0.5) {
      low++;
      if (f < 0.5) lowThenLow++;
    }
    prev = f;
  }
  assert.ok(Math.abs(lowThenLow / low - 0.5) < 0.05, "P(low|low) = " + lowThenLow / low);
});

test("config sanity", () => {
  assert.equal(CONFIG.SECTION_H, 528);
  assert.equal(CONFIG.TITLE, "RIVER RAID");
  assert.equal(CONFIG.MASTER_SEED, 0xa5c3);
});
