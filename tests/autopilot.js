"use strict";
// A simple autopilot used by the smoke test (and handy for tuning). Each step it plans a
// path a second or so ahead: for short time slices it works out which x positions are
// safe (inside the water, clear of where every enemy will be), which of them the plane
// can actually reach given its steering speed, and heads for the reachable spot closest
// to what it wants (a fuel depot when the tank is low, a ship to shoot, otherwise where
// it already is). It always holds fire, except when that would destroy a depot it needs,
// and slows down over depots. It plays through the real Game object with a fake input.

const { RR } = require("./helpers.js");

const CFG = RR.CONFIG;
const Col = RR.Collision;

const HB_W = CFG.PLAYER_HIT_W;
const MAX_X = CFG.VIEW_W - HB_W;

// Intervals are inclusive [lo, hi] lists of allowed hitbox-left positions.
function intersect(a, b) {
  const out = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi >= lo) out.push([lo, hi]);
    }
  }
  return out;
}

function subtract(list, from, to) {
  const out = [];
  for (const [lo, hi] of list) {
    if (to <= lo || from >= hi) {
      out.push([lo, hi]);
      continue;
    }
    if (from > lo) out.push([lo, from]);
    if (to < hi) out.push([to, hi]);
  }
  return out;
}

// Grow every interval by `by` on both sides (merging overlaps), clipped to the screen.
function expand(list, by) {
  const grown = list.map(([lo, hi]) => [Math.max(0, lo - by), Math.min(MAX_X, hi + by)]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of grown) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

function nearestIn(list, x) {
  let best = null;
  let bestD = Infinity;
  for (const [lo, hi] of list) {
    const c = Math.max(lo, Math.min(hi, x));
    const d = Math.abs(c - x);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function makeAutopilot(options) {
  const opt = Object.assign(
    { slices: 20, dt: 0.1, reach: 0.7, wallMargin: 2, enemyPad: 2, seekBelow: 0.7, hunt: true, deadband: 0.05, speedPlay: true },
    options
  );

  function steer(game, input) {
    const p = game.player;
    const hb = p.hitbox();
    const sections = game.sections;
    const top = hb.y + hb.h;

    // --- what do we want? -------------------------------------------------------------
    const wantFuel = game.fuel < opt.seekBelow || (game.fuel < 0.9 && p.speed < CFG.SCROLL_NORMAL);
    let depot = null;
    if (wantFuel) {
      for (const e of game.entities) {
        if (!e.alive || e.type !== "depot") continue;
        if (e.y + e.h < hb.y || e.y - top > 170) continue;
        if (!depot || e.y < depot.y) depot = e;
      }
    }
    let hunt = null;
    if (opt.hunt && !game.missile && !depot) {
      for (const e of game.entities) {
        if (!e.alive || (e.type !== "tanker" && e.type !== "heli")) continue;
        const dy = e.y - top;
        if (dy < 10 || dy > 130) continue;
        if (!hunt || e.y < hunt.y) hunt = e;
      }
    }
    let pref = hb.x;
    if (depot) pref = depot.x + depot.w / 2 - HB_W / 2;
    else if (hunt) {
      const lead = hunt.active ? (hunt.dir * hunt.speed * (hunt.y - top)) / 260 : 0;
      pref = hunt.x + lead + hunt.w / 2 - HB_W / 2;
    }

    // --- planning, for a given constant scroll speed -----------------------------------------
    const missile = game.missile;

    function planFor(speed) {
      // enemies that matter, with a position-over-time model
      const threats = [];
      for (const e of game.entities) {
        if (!e.alive || e.type === "depot" || e.type === "bridge") continue;
        if (e.y + e.h < hb.y - 2 || e.y > top + speed * opt.dt * opt.slices + 4) continue;
        if (e === hunt && e.y - top > 28) continue; // we are going to shoot it
        if (missile && e.y + e.h > missile.y) {
          const mx = missile.x + 0.5;
          if (mx > e.x - 1 && mx < e.x + e.w + 1) continue; // the missile in flight will get it
        }
        let tAct = 0;
        if (e.type === "jet") {
          if (!e.active) tAct = Math.max(0, (e.y - game.cameraY - CFG.JET_TRIGGER_DIST) / speed);
        } else if (e.mover && !e.active) {
          tAct = Math.max(0, (e.y - p.y - CFG.MOVER_TRIGGER_DIST) / speed);
        }
        const moving = e.type === "jet" || e.mover;
        threats.push({
          e: e,
          pad: e.type === "jet" ? 4 : opt.enemyPad,
          pos: (t) => (moving ? e.x + e.dir * e.speed * Math.max(0, t - tAct) : e.x),
        });
      }

      // per-slice safe positions (independent of where we are)...
      const allowedBySlice = [null];
      for (let j = 1; j <= opt.slices; j++) {
        const t0 = (j - 1) * opt.dt;
        const t1 = j * opt.dt;
        const yLo = hb.y + speed * t0;
        const yHi = hb.y + speed * t1 + hb.h;
        let allowed = [[0, MAX_X]];
        for (let s = Math.floor(yLo / CFG.SEGMENT_H); s <= Math.floor((yHi - 1e-6) / CFG.SEGMENT_H); s++) {
          const spans = Col.spansAtWorld(sections, s * CFG.SEGMENT_H + CFG.SEGMENT_H / 2);
          const row = spans
            .filter(([x0, x1]) => x1 - x0 >= HB_W + 2 * opt.wallMargin)
            .map(([x0, x1]) => [x0 + opt.wallMargin, x1 - HB_W - opt.wallMargin]);
          allowed = intersect(allowed, row);
          if (!allowed.length) break;
        }
        for (const th of threats) {
          const e = th.e;
          if (e.y + e.h <= yLo - 1 || e.y >= yHi + 1) continue;
          const xa = th.pos(t0);
          const xb = th.pos(t1);
          allowed = subtract(allowed, Math.min(xa, xb) - HB_W - th.pad, Math.max(xa, xb) + e.w + th.pad);
          if (!allowed.length) break;
        }
        allowedBySlice.push(allowed);
      }

      // ...then what we can reach, with some slack in the steering speed (and, if that
      // leaves us boxed in, with all of it).
      function reach(reachFactor) {
        const lat = CFG.PLAYER_SPEED_X * opt.dt * reachFactor;
        const reachable = [[[hb.x, hb.x]]];
        let deepest = 0;
        for (let j = 1; j <= opt.slices; j++) {
          const next = intersect(expand(reachable[j - 1], lat), allowedBySlice[j]);
          if (!next.length) break;
          reachable.push(next);
          deepest = j;
        }
        return { reachable: reachable, deepest: deepest, lat: lat };
      }
      let result = reach(opt.reach);
      if (result.deepest < opt.slices) {
        const full = reach(1);
        if (full.deepest > result.deepest) result = full;
      }
      result.allowedBySlice = allowedBySlice;
      result.speed = speed;
      return result;
    }

    // Normal speed unless speeding up or slowing down gets us further (a jet can often
    // only be dodged by changing the timing).
    let best = planFor(CFG.SCROLL_NORMAL);
    if (opt.speedPlay && best.deepest < opt.slices) {
      for (const sp of [CFG.SCROLL_FAST, CFG.SCROLL_SLOW]) {
        const alt = planFor(sp);
        if (alt.deepest > best.deepest + 1) best = alt;
      }
    }
    const reachable = best.reachable;
    const deepest = best.deepest;
    const lateral = best.lat;
    const allowedBySlice = best.allowedBySlice;

    // --- choose the end point, then walk back to the first step ------------------------------
    const xStar = nearestIn(reachable[deepest], pref);
    let firstTarget = hb.x;
    if (deepest >= 1) {
      let back = [[xStar, xStar]];
      for (let j = deepest - 1; j >= 1; j--) back = intersect(reachable[j], expand(back, lateral));
      firstTarget = nearestIn(back, xStar);
    } else if (allowedBySlice[1].length) {
      firstTarget = nearestIn(allowedBySlice[1], hb.x); // boxed in: make for the nearest safe spot
    }
    steer.last = { deepest: deepest, target: firstTarget, xStar: xStar, pref: pref, hbx: hb.x, depot: !!depot, speed: best.speed };

    // --- inputs ------------------------------------------------------------------------------------
    input.releaseAll();
    if (firstTarget - hb.x > opt.deadband) input.down("right", "bot");
    else if (hb.x - firstTarget > opt.deadband) input.down("left", "bot");

    if (best.speed === CFG.SCROLL_FAST) input.down("up", "bot");
    else if (best.speed === CFG.SCROLL_SLOW) input.down("down", "bot");

    // slow down over (and just before) a depot we are using
    if (depot && wantFuel) {
      const overlapAhead = depot.y - top < 14 && depot.y + depot.h > hb.y - 2;
      if (overlapAhead && game.fuel < 0.95) input.down("down", "bot");
    }

    // fire, unless the shot would destroy a depot we want
    let fire = true;
    if (wantFuel && depot) {
      const mx = hb.x + HB_W / 2;
      if (mx > depot.x - 2 && mx < depot.x + depot.w + 2) fire = false;
    }
    if (fire) input.down("fire", "bot");
  }
  return steer;
}

module.exports = { makeAutopilot };
