(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  var CFG = RR.CONFIG;
  var SEG = CFG.SEGMENT_H;
  var EPS = 1e-6;

  // Boxes are { x, y, w, h } in world space: x to the right, y upward from the
  // bottom edge of the box.
  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  // `sections` is a list of loaded sections, each { section, base } where base is the
  // world y of the section's start. A single entry is accepted too.
  function entryAt(sections, worldY) {
    if (!Array.isArray(sections)) sections = [sections];
    for (var i = 0; i < sections.length; i++) {
      var e = sections[i];
      if (worldY >= e.base && worldY < e.base + CFG.SECTION_H) return e;
    }
    return null;
  }

  // Water spans at a world y, or [] when that part of the world isn't loaded.
  function spansAtWorld(sections, worldY) {
    var e = entryAt(sections, worldY);
    return e ? RR.River.spansAt(e.section, worldY - e.base) : [];
  }

  function pointInWater(sections, x, worldY) {
    var spans = spansAtWorld(sections, worldY);
    for (var i = 0; i < spans.length; i++) {
      if (x >= spans[i][0] && x < spans[i][1]) return true;
    }
    return false;
  }

  // True when the whole box is over water. Terrain is constant within a 16 px
  // segment, so it is enough to test the box's left/right edges (and so its
  // corners and edge midpoints) once for every segment row the box touches.
  function boxOverWater(sections, box) {
    var first = Math.floor(box.y / SEG);
    var last = Math.floor((box.y + box.h - EPS) / SEG);
    for (var s = first; s <= last; s++) {
      var spans = spansAtWorld(sections, s * SEG + SEG / 2);
      var ok = false;
      for (var i = 0; i < spans.length; i++) {
        if (box.x >= spans[i][0] && box.x + box.w <= spans[i][1]) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  }

  RR.Collision = {
    aabbOverlap: aabbOverlap,
    entryAt: entryAt,
    spansAtWorld: spansAtWorld,
    pointInWater: pointInWater,
    boxOverWater: boxOverWater,
  };
})();
