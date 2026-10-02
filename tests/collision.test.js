"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/config.js");
require("../js/rng.js");
require("../js/river.js");
require("../js/collision.js");
const { Collision, River, CONFIG } = globalThis.RR;

// A hand-made section: every segment is a plain river of the given half-width, except
// segment `islandAt` which has an island of half-width `island`.
function fakeSection(index, half, islandAt, island) {
  const segments = [];
  for (let k = 0; k <= CONFIG.SEGMENTS_PER_SECTION; k++) {
    segments.push({ half, island: k === islandAt ? island : 0 });
  }
  return { index, segments, spans: segments.map(River.spansOfSegment), objects: [], houses: [] };
}

function entry(section) {
  return { section, base: section.index * CONFIG.SECTION_H };
}

test("aabbOverlap: overlap, containment, separation, and touching edges", () => {
  const a = { x: 10, y: 10, w: 10, h: 10 };
  assert.equal(Collision.aabbOverlap(a, { x: 15, y: 15, w: 10, h: 10 }), true);
  assert.equal(Collision.aabbOverlap(a, { x: 12, y: 12, w: 2, h: 2 }), true, "contained");
  assert.equal(Collision.aabbOverlap(a, { x: 12, y: 12, w: 2, h: 2 }), Collision.aabbOverlap({ x: 12, y: 12, w: 2, h: 2 }, a));
  assert.equal(Collision.aabbOverlap(a, { x: 21, y: 10, w: 5, h: 5 }), false, "right of");
  assert.equal(Collision.aabbOverlap(a, { x: 0, y: 0, w: 9, h: 9 }), false, "below-left");
  assert.equal(Collision.aabbOverlap(a, { x: 20, y: 10, w: 5, h: 5 }), false, "touching edge is not overlap");
  assert.equal(Collision.aabbOverlap(a, { x: 10, y: 20, w: 5, h: 5 }), false, "touching top is not overlap");
  assert.equal(Collision.aabbOverlap(a, { x: 19, y: 19, w: 5, h: 5 }), true, "corner overlap");
});

test("boxOverWater: inside, bank on either side, exactly touching the bank", () => {
  const e = entry(fakeSection(0, 40, -1, 0)); // water x 40..120
  const sections = [e];
  assert.equal(Collision.boxOverWater(sections, { x: 76, y: 100, w: 7, h: 8 }), true);
  assert.equal(Collision.boxOverWater(sections, { x: 40, y: 100, w: 7, h: 8 }), true, "flush against left bank");
  assert.equal(Collision.boxOverWater(sections, { x: 113, y: 100, w: 7, h: 8 }), true, "flush against right bank");
  assert.equal(Collision.boxOverWater(sections, { x: 39.5, y: 100, w: 7, h: 8 }), false, "left bank");
  assert.equal(Collision.boxOverWater(sections, { x: 113.5, y: 100, w: 7, h: 8 }), false, "right bank");
});

test("boxOverWater: every single corner and edge matters", () => {
  // narrow neck above, wide river below: only one corner pokes into land
  const wide = fakeSection(0, 60, -1, 0);
  wide.segments[3] = { half: 30, island: 0 };
  wide.spans[3] = River.spansOfSegment(wide.segments[3]);
  const sections = [entry(wide)];
  const segTop = 3 * 16;
  // box straddling the boundary between segment 2 (wide) and segment 3 (narrow)
  assert.equal(Collision.boxOverWater(sections, { x: 76, y: segTop - 4, w: 8, h: 8 }), true);
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop - 4, w: 8, h: 8 }), false, "upper-left corner in the bank");
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop - 12, w: 8, h: 8 }), true, "fully below the neck is fine");
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop + 16 + 2, w: 8, h: 8 }), true, "wide segment above the neck");
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop + 16 - 4, w: 8, h: 8 }), false, "straddling the neck and the wide segment above");
  // box fully inside the narrow segment but one px too far left
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop + 4, w: 8, h: 8 }), false);
  assert.equal(Collision.boxOverWater(sections, { x: 50, y: segTop + 4, w: 8, h: 8 }), true);
  // box top exactly at the segment boundary does not touch the next segment
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop - 8, w: 8, h: 8 }), true);
  assert.equal(Collision.boxOverWater(sections, { x: 49, y: segTop - 7.9, w: 8, h: 8 }), false);
});

test("boxOverWater: islands block, and the channel either side is fine", () => {
  const e = entry(fakeSection(0, 60, 2, 12)); // island x 68..92 in segment 2
  const sections = [e];
  const y = 2 * 16 + 4;
  assert.equal(Collision.boxOverWater(sections, { x: 76, y: y, w: 8, h: 8 }), false, "on the island");
  assert.equal(Collision.boxOverWater(sections, { x: 62, y: y, w: 8, h: 8 }), false, "overlapping the island's edge");
  assert.equal(Collision.boxOverWater(sections, { x: 60, y: y, w: 8, h: 8 }), true, "left channel");
  assert.equal(Collision.boxOverWater(sections, { x: 92, y: y, w: 8, h: 8 }), true, "right channel");
  assert.equal(Collision.boxOverWater(sections, { x: 76, y: 1 * 16 + 2, w: 8, h: 8 }), true, "segment below the island");
});

test("boxOverWater: spans section boundaries, and unloaded world is not water", () => {
  const a = fakeSection(0, 50, -1, 0);
  const b = fakeSection(1, 30, -1, 0); // narrower, starts at world y 528
  const both = [entry(a), entry(b)];
  assert.equal(Collision.boxOverWater(both, { x: 76, y: 528 - 4, w: 8, h: 8 }), true);
  assert.equal(Collision.boxOverWater(both, { x: 35, y: 528 - 4, w: 8, h: 8 }), false, "fits section 0, not section 1");
  assert.equal(Collision.boxOverWater(both, { x: 35, y: 528 - 12, w: 8, h: 8 }), true);
  assert.equal(Collision.boxOverWater([entry(a)], { x: 76, y: 528 - 4, w: 8, h: 8 }), false, "next section not loaded");
  assert.equal(Collision.boxOverWater([entry(a)], { x: 76, y: -4, w: 8, h: 8 }), false, "below the world");
  // a single entry (not an array) is accepted
  assert.equal(Collision.boxOverWater(entry(a), { x: 76, y: 10, w: 8, h: 8 }), true);
});

test("boxOverWater: a tall box (depot) must fit in every segment it crosses", () => {
  const s = fakeSection(0, 50, -1, 0);
  s.segments[5] = { half: 24, island: 0 };
  s.spans[5] = River.spansOfSegment(s.segments[5]);
  const sections = [entry(s)];
  assert.equal(Collision.boxOverWater(sections, { x: 40, y: 4 * 16 + 2, w: 8, h: 22 }), false, "crosses into the narrow segment 5");
  assert.equal(Collision.boxOverWater(sections, { x: 60, y: 4 * 16 + 2, w: 8, h: 22 }), true);
});

test("pointInWater and spansAtWorld", () => {
  const s = fakeSection(0, 40, 1, 10);
  const sections = [entry(s)];
  assert.equal(Collision.pointInWater(sections, 80, 8), true);
  assert.equal(Collision.pointInWater(sections, 80, 16 + 8), false, "island");
  assert.equal(Collision.pointInWater(sections, 50, 16 + 8), true);
  assert.equal(Collision.pointInWater(sections, 39.9, 8), false);
  assert.equal(Collision.pointInWater(sections, 120, 8), false, "right edge is land");
  assert.deepEqual(Collision.spansAtWorld(sections, 100000), []);
});

test("real generated terrain: the river's centre line is always water", () => {
  const sections = [];
  for (let i = 0; i < 5; i++) sections.push(entry(River.generateSection(i)));
  // sample the middle of every channel of every segment
  for (const e of sections) {
    e.section.spans.forEach((spans, k) => {
      for (const [x0, x1] of spans) {
        const box = { x: (x0 + x1) / 2 - 3, y: e.base + k * 16 + 4, w: 6, h: 8 };
        assert.equal(Collision.boxOverWater(sections, box), true, `section ${e.section.index} segment ${k}`);
      }
    });
  }
});
