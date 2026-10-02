"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/config.js");
require("../js/rng.js");
require("../js/river.js");
const { River, CONFIG } = globalThis.RR;

const SECTIONS = 100; // checked sections: 0..99
const N = CONFIG.SEGMENTS_PER_SECTION;
const CX = CONFIG.CENTER_X;

function all(count = SECTIONS) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(River.generateSection(i));
  return out;
}

function overlap(a, b) {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
}

function channels(seg) {
  return River.spansOfSegment(seg);
}

test("sectionSeed is deterministic, non-zero, 16-bit and well spread", () => {
  const seeds = new Set();
  for (let i = 0; i < SECTIONS; i++) {
    const s = River.sectionSeed(i);
    assert.equal(s, River.sectionSeed(i));
    assert.ok(s >= 1 && s <= 0xffff);
    seeds.add(s);
  }
  assert.ok(seeds.size >= SECTIONS - 5, "only " + seeds.size + " distinct seeds");
});

test("the same index generates deep-equal output twice", () => {
  for (let i = 0; i < SECTIONS; i++) {
    assert.deepEqual(River.generateSection(i), River.generateSection(i));
  }
});

test("different sections differ", () => {
  const a = River.generateSection(3);
  const b = River.generateSection(4);
  assert.notDeepEqual(a.segments, b.segments);
});

test("section shape: 32 segments + bridge segment, 528 px", () => {
  assert.equal(CONFIG.SECTION_H, 528);
  for (const s of all()) {
    assert.equal(s.segments.length, N + 1);
    assert.equal(s.spans.length, N + 1);
    assert.deepEqual(s.bridge, { y: N * 16, h: 16, x0: 56, x1: 104 });
  }
});

test("halves and islands: legal ranges, edges snapped to the stepped grid", () => {
  for (const s of all()) {
    for (const seg of s.segments) {
      assert.ok(seg.half >= CONFIG.HALF_MIN && seg.half <= CONFIG.HALF_MAX || seg.half === CONFIG.BRIDGE_HALF);
      assert.ok(Number.isInteger(seg.half) && Number.isInteger(seg.island));
      assert.equal(seg.half % CONFIG.HALF_QUANT, 0);
      assert.equal(seg.island % CONFIG.HALF_QUANT, 0);
      assert.ok(seg.island === 0 || seg.island >= CONFIG.ISLAND_MIN);
    }
  }
});

test("sections 0-49: every channel is at least MIN_CHANNEL wide", () => {
  for (const s of all(50)) {
    s.segments.forEach((seg, k) => {
      for (const [x0, x1] of channels(seg)) {
        assert.ok(x1 - x0 >= CONFIG.MIN_CHANNEL, `section ${s.index} segment ${k}: channel ${x1 - x0}`);
      }
    });
  }
});

test("sections 0-49: |delta half| <= 16 between neighbours (also across sections)", () => {
  const secs = all(50);
  for (const s of secs) {
    for (let k = 1; k < s.segments.length; k++) {
      const d = Math.abs(s.segments[k].half - s.segments[k - 1].half);
      assert.ok(d <= CONFIG.MAX_HALF_STEP, `section ${s.index} segment ${k}: delta ${d}`);
    }
  }
  for (let i = 1; i < secs.length; i++) {
    const d = Math.abs(secs[i].segments[0].half - secs[i - 1].segments[N].half);
    assert.ok(d <= CONFIG.MAX_HALF_STEP, `section boundary ${i}: delta ${d}`);
  }
});

test("sections 0-49: no dead ends (channels overlap >= MIN_CHANNEL with their neighbours)", () => {
  const secs = all(50);
  // flatten, including the seam between sections
  const segs = [];
  for (const s of secs) for (const seg of s.segments) segs.push([s.index, seg]);
  for (let k = 1; k < segs.length; k++) {
    const prev = channels(segs[k - 1][1]);
    const cur = channels(segs[k][1]);
    // weak form from the spec: some pair overlaps by MIN_CHANNEL
    let any = false;
    for (const a of prev) for (const b of cur) if (overlap(a, b) >= CONFIG.MIN_CHANNEL) any = true;
    assert.ok(any, `section ${segs[k][0]}: no overlapping channels at flat segment ${k}`);
    // strong form: no channel is a dead end in either direction
    for (const a of prev) {
      assert.ok(cur.some((b) => overlap(a, b) >= CONFIG.MIN_CHANNEL), `dead end going up at flat segment ${k}`);
    }
    for (const b of cur) {
      assert.ok(prev.some((a) => overlap(a, b) >= CONFIG.MIN_CHANNEL), `dead end coming down at flat segment ${k}`);
    }
  }
});

test("sections 0-49: first 2 and last 2 segments have no island and funnel to the bridge", () => {
  for (const s of all(50)) {
    for (const k of [0, 1, N - 2, N - 1, N]) assert.equal(s.segments[k].island, 0, `section ${s.index} segment ${k}`);
    assert.equal(s.segments[N].half, CONFIG.BRIDGE_HALF);
    // approaching the bridge half-width from outside
    assert.ok(s.segments[N - 1].half > CONFIG.BRIDGE_HALF && s.segments[N - 1].half <= CONFIG.BRIDGE_HALF + 16);
    assert.ok(s.segments[N - 2].half >= s.segments[N - 1].half);
    assert.ok(s.segments[0].half > CONFIG.BRIDGE_HALF && s.segments[0].half <= CONFIG.BRIDGE_HALF + 16);
    assert.ok(s.segments[1].half >= s.segments[0].half);
  }
});

test("the generator really produces variety: narrow necks, wide reaches, islands", () => {
  const secs = all(50);
  let islandSections = 0;
  let minHalf = 999;
  let maxHalf = 0;
  for (const s of secs) {
    if (s.index > 0 && s.segments.some((g) => g.island > 0)) islandSections++;
    for (let k = 2; k < N - 2; k++) {
      minHalf = Math.min(minHalf, s.segments[k].half);
      maxHalf = Math.max(maxHalf, s.segments[k].half);
    }
  }
  assert.ok(islandSections >= 20, "island sections: " + islandSections);
  assert.ok(minHalf <= 28, "narrowest half " + minHalf);
  assert.ok(maxHalf >= 68, "widest half " + maxHalf);
});

function rowsTouched(o) {
  const rows = [];
  const first = Math.floor(o.y / 16);
  const last = Math.floor((o.y + o.h - 1e-9) / 16);
  for (let r = first; r <= last; r++) rows.push(r);
  return rows;
}

function insideWater(section, o) {
  return rowsTouched(o).every((r) =>
    section.spans[r].some(([x0, x1]) => o.x - CONFIG.OBJECT_MARGIN >= x0 && o.x + o.w + CONFIG.OBJECT_MARGIN <= x1)
  );
}

test("sections 0-49: tankers, helicopters and depots lie fully inside water (with margin), none overlap", () => {
  let counted = 0;
  for (const s of all(50)) {
    const solid = s.objects.filter((o) => o.type !== "jet");
    for (const o of solid) {
      counted++;
      assert.ok(["tanker", "heli", "depot"].includes(o.type));
      assert.ok(o.y >= 0 && o.y + o.h <= N * 16, `section ${s.index}: ${o.type} y-range ${o.y}..${o.y + o.h}`);
      assert.ok(insideWater(s, o), `section ${s.index}: ${o.type} at ${o.x},${o.y} not inside water`);
    }
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i];
        const b = solid[j];
        const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!hit, `section ${s.index}: ${a.type} overlaps ${b.type}`);
      }
    }
  }
  assert.ok(counted > 100);
});

test("objects obey the table: skip first 2 segments, sizes, mover flags, jets off-screen", () => {
  let movers = 0;
  let ships = 0;
  let jets = 0;
  for (const s of all(50)) {
    for (const o of s.objects) {
      if (o.type !== "jet") assert.ok(o.y >= CONFIG.OBJECT_SKIP_SEGMENTS * 16, `section ${s.index}: ${o.type} in a skipped segment`);
      const dims = { tanker: [16, 6], heli: [10, 8], depot: [8, 22], jet: [CONFIG.JET_W, CONFIG.JET_H] }[o.type];
      assert.deepEqual([o.w, o.h], dims);
      if (o.type === "tanker" || o.type === "heli") {
        ships++;
        if (o.mover) {
          movers++;
          assert.ok(o.speed > 0);
          assert.ok(o.dir === 1 || o.dir === -1);
        }
      } else {
        assert.equal(o.mover, false);
      }
      if (o.type === "jet") {
        jets++;
        assert.ok(o.dir === 1 || o.dir === -1);
        assert.ok(o.dir === 1 ? o.x + o.w <= 0 : o.x >= CONFIG.VIEW_W, "jet starts just off-screen");
        assert.ok(o.speed >= CONFIG.JET_SPEED && o.speed <= CONFIG.JET_SPEED + CONFIG.JET_SPEED_RISE);
      }
    }
  }
  assert.ok(jets > 5);
  assert.ok(movers > 0 && movers < ships, `movers ${movers} of ${ships}`);
});

test("mover share rises with difficulty", () => {
  const share = (from, to) => {
    let m = 0;
    let n = 0;
    for (let i = from; i <= to; i++) {
      for (const o of River.generateSection(i).objects) {
        if (o.type === "tanker" || o.type === "heli") {
          n++;
          if (o.mover) m++;
        }
      }
    }
    return m / n;
  };
  assert.ok(share(30, 80) > share(1, 3) + 0.15);
});

test("section 0 is hand-tuned: no jets, no islands, no helicopters, stationary tankers, two depots", () => {
  const s = River.generateSection(0);
  assert.ok(s.segments.every((g) => g.island === 0));
  assert.equal(s.objects.filter((o) => o.type === "jet").length, 0);
  assert.equal(s.objects.filter((o) => o.type === "heli").length, 0);
  const tankers = s.objects.filter((o) => o.type === "tanker");
  assert.ok(tankers.length >= 3);
  assert.ok(tankers.every((t) => !t.mover));
  const depots = s.objects.filter((o) => o.type === "depot");
  assert.equal(depots.length, 2);
  const ys = depots.map((o) => o.y).sort((a, b) => a - b);
  assert.ok(ys[0] < 6 * 16, "first depot near the start");
  assert.ok(ys[1] > 12 * 16 && ys[1] < 20 * 16, "second depot in the middle");
  // wide and gentle
  for (let k = 3; k < N - 5; k++) assert.ok(s.segments[k].half >= 52, "section 0 segment " + k);
  for (let k = 2; k < N - 2; k++) assert.ok(Math.abs(s.segments[k].half - s.segments[k - 1].half) <= 8);
});

test("depots across sections 30-49 are fewer than across sections 1-20", () => {
  const count = (from, to) => {
    let n = 0;
    for (let i = from; i <= to; i++) n += River.generateSection(i).objects.filter((o) => o.type === "depot").length;
    return n;
  };
  const early = count(1, 20);
  const late = count(30, 49);
  assert.ok(late < early, `late ${late} vs early ${early}`);
});

test("houses sit on banks at least 20 px wide, clear of the water", () => {
  let houses = 0;
  for (const s of all(30)) {
    for (const h of s.houses) {
      houses++;
      const k = Math.floor(h.y / 16);
      assert.ok(k >= 0 && k < N);
      assert.equal(Math.floor((h.y + h.h - 1) / 16), k, "house stays within its segment");
      const half = s.segments[k].half;
      assert.ok(CX - half >= CONFIG.HOUSE_MIN_BANK);
      if (h.side === "left") assert.ok(h.x >= 0 && h.x + h.w <= CX - half);
      else assert.ok(h.x >= CX + half && h.x + h.w <= CONFIG.VIEW_W);
    }
  }
  assert.ok(houses > 20);
});

test("spansAt returns the segment's water, mirror-symmetric, and [] outside the section", () => {
  const s = River.generateSection(5);
  for (let k = 0; k <= N; k++) {
    const spans = River.spansAt(s, k * 16 + 7);
    assert.deepEqual(spans, s.spans[k]);
    // mirror symmetry around x = 80
    const mirrored = spans.map(([a, b]) => [2 * CX - b, 2 * CX - a]).reverse();
    assert.deepEqual(mirrored, spans);
    // constant within a segment (stepped edges)
    assert.deepEqual(River.spansAt(s, k * 16), spans);
    assert.deepEqual(River.spansAt(s, k * 16 + 15.99), spans);
  }
  assert.deepEqual(River.spansAt(s, -1), []);
  assert.deepEqual(River.spansAt(s, CONFIG.SECTION_H), []);
  assert.deepEqual(River.spansAt(s, N * 16 + 3), [[56, 104]]);
});

test("section helpers", () => {
  assert.equal(River.sectionBase(3), 3 * 528);
  assert.equal(River.sectionAt(0), 0);
  assert.equal(River.sectionAt(527.9), 0);
  assert.equal(River.sectionAt(528), 1);
  assert.equal(River.difficulty(0), 0);
  assert.equal(River.difficulty(6), 0.5);
  assert.equal(River.difficulty(12), 1);
  assert.equal(River.difficulty(500), 1);
});
