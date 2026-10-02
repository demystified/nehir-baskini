(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  // Every tunable number in the game lives here. Units: pixels at the logical
  // resolution (160 x 232), seconds, and pixels/second unless noted otherwise.
  var CONFIG = {
    TITLE: "RIVER RAID",
    MASTER_SEED: 0xa5c3,
    SECTION_SEED_SALT: 21, // mixed into every section seed (picked so the depot trend is representative)

    // ---- Screen & loop ------------------------------------------------------
    VIEW_W: 160,
    VIEW_H: 232,
    PLAY_H: 192, // playfield height (top part of the screen)
    HUD_H: 40, // status bar height (bottom part of the screen)
    MIN_INTEGER_SCALE: 2, // below this, fall back to a fractional fit
    FIXED_DT: 1 / 60,
    MAX_FRAME_TIME: 0.25,

    // ---- Player ---------------------------------------------------------------
    PLAYER_W: 9,
    PLAYER_H: 10,
    PLAYER_HIT_INSET: 1, // hitbox = sprite inset by this many px on every side
    PLAYER_BOTTOM_MARGIN: 24, // player's bottom edge above the playfield bottom
    PLAYER_SPEED_X: 70,
    SCROLL_NORMAL: 60,
    SCROLL_FAST: 110,
    SCROLL_SLOW: 30,
    SCROLL_ACCEL: 200, // px/s^2 easing of the scroll speed

    // ---- Missile -------------------------------------------------------------
    MISSILE_W: 1,
    MISSILE_H: 6,
    MISSILE_SPEED: 260, // on screen, on top of the scroll
    MISSILE_SWEEP_STEP: 2, // px between terrain samples along a missile's path

    // ---- River geometry -----------------------------------------------------
    CENTER_X: 80, // the river is mirror-symmetric around this x
    SEGMENT_H: 16,
    SEGMENTS_PER_SECTION: 32, // plus one bridge segment on top
    HALF_MIN: 20,
    HALF_MAX: 72,
    MIN_CHANNEL: 22,
    MAX_HALF_STEP: 16, // max change of `half` between neighbouring segments
    BRIDGE_HALF: 24,
    TAPER_SEGMENTS: 2, // first/last N segments: no island, funnel toward the bridge
    HALF_QUANT: 4, // water edges snap to a multiple of this many px
    ISLAND_SKIP_SEGMENTS: 5, // no islands in the first N segments: a respawned plane needs room to react
    ISLAND_MIN: 4, // smallest island half-width
    ISLAND_MAX_STEP: 8, // max change of the island half-width between segments
    ISLAND_MAX_HALF: 24, // widest island half-width
    ISLAND_CHANCE_START: 0.05, // chance (per segment, no island yet) of starting one
    ISLAND_CHANCE_DIFFICULTY: 0.13, // added at full difficulty
    ISLAND_CONTINUE: 0.76, // chance an existing island carries on into the next segment
    // Wide-river bias: the "target" half-width is picked from this fraction of the
    // legal range upward at difficulty 0, and from the whole range at difficulty 1.
    TARGET_FLOOR_EASY: 0.55,
    TARGET_HOLD_MAX: 3, // hold a reached target for 0..N segments
    TARGET_STEP_MIN: 4,
    TARGET_STEP_MAX: 16,
    DIFFICULTY_SECTIONS: 8, // d = min(section, this) / this (the spec's 12, tuned down so the ramp shows by section 5)

    // Section 0 is hand-tuned: wide, gentle, no islands.
    SECTION0_HALF_MIN: 52,
    SECTION0_HALF_MAX: 72,
    SECTION0_STEP_MAX: 8,
    SECTION0_TANKER_SEGMENTS: [8, 12, 21, 26], // stationary tankers
    SECTION0_DEPOT_SEGMENTS: [4, 16], // fuel depots (near the start, and the middle)

    // ---- Objects ---------------------------------------------------------------
    OBJECT_SKIP_SEGMENTS: 2, // no objects in the first N segments of a section
    OBJECT_MARGIN: 2, // gap between an object and the water's edge
    OBJECT_GAP: 2, // minimum gap between two objects
    OBJECT_MIN_FREE: 12, // a tanker/heli always leaves a gap this wide on one side
    MOVER_MIN_ROOM: 8, // extra room needed for an object to be a mover
    TANKER_CHANCE: 0.24,
    HELI_CHANCE: 0.2,
    DEPOT_CHANCE: 0.18,
    DEPOT_CHANCE_DROP: 0.1, // depot chance falls by this much at full difficulty
    JET_CHANCE: 0.06,
    JET_CHANCE_RISE: 0.06, // jet chance rises by this much at full difficulty
    TANKER_W: 16,
    TANKER_H: 6,
    HELI_W: 10,
    HELI_H: 8,
    DEPOT_W: 8,
    DEPOT_H: 22,
    JET_W: 12,
    JET_H: 7,
    HOUSE_W: 8,
    HOUSE_H: 6,
    HOUSE_CHANCE: 0.3,
    HOUSE_MIN_BANK: 20,
    HOUSE_MARGIN: 2,
    MOVER_CHANCE: 0.35,
    MOVER_CHANCE_RISE: 0.5,
    MOVER_TRIGGER_DIST: 80, // a mover wakes when the player is this close (vertically)
    MOVER_SPEED: 22,
    MOVER_SPEED_RISE: 28,
    JET_SPEED: 80,
    JET_SPEED_RISE: 40,
    JET_TRIGGER_DIST: 100, // a jet starts its run when this far above the camera bottom
    JET_START_GAP: 2, // how far off-screen a jet waits
    HELI_ROTOR_FPS: 16,
    BRIDGE_DECK_Y: 2, // the bridge deck occupies rows 2..14 of its 16 px segment
    BRIDGE_DECK_H: 12,
    BRIDGE_ROAD_Y: 4, // road surface rows (on the deck and across the banks)
    BRIDGE_ROAD_H: 8,

    // ---- Fuel ------------------------------------------------------------------
    FUEL_DRAIN: 1 / 32, // per second, constant
    FUEL_REFILL: 0.3, // per second while overlapping a depot
    FUEL_LOW: 0.25,
    FUEL_START: 1,

    // ---- Scoring & lives -----------------------------------------------------
    SCORE: { tanker: 30, heli: 60, depot: 80, jet: 100, bridge: 500 },
    EXTRA_LIFE_EVERY: 10000,
    START_RESERVES: 3,
    MAX_RESERVES: 9,
    HIGHSCORE_KEY: "riverRaid.highScore",
    MUTE_KEY: "riverRaid.muted",

    // ---- Timing --------------------------------------------------------------------
    DYING_TIME: 1.0, // explosion before respawn / game over
    EXPLOSION_TIME: 0.45, // enemy explosion lifetime
    BRIDGE_EXPLOSIONS: 3,
    GAMEOVER_DELAY: 1.0, // ignore confirm presses for this long after GAME OVER
    READY_ARM_TIME: 0.25,
    TITLE_SCROLL: 30, // demo scroll speed on the title screen
    TITLE_DEMO_SECTION: 2, // the title screen's demo river starts here
    FLASH_TIME: 0.18, // white screen flash when the player explodes
    UNLOAD_MARGIN: 48, // keep sections/entities this far below the camera
    LOAD_MARGIN: 32, // load sections this far above the visible area

    // ---- RNG ---------------------------------------------------------------------
    RNG_TAPS: 0xb400, // 16-bit Galois LFSR, maximal length
    RNG_FALLBACK_SEED: 0xace1, // used when a seed would be 0
    RNG_SHIFTS_PER_OUTPUT: 16, // shifts per next(), so consecutive outputs are unrelated

    // ---- Audio (all synthesized with Web Audio) --------------------------------
    AUDIO: {
      MASTER_GAIN: 0.8,
      ENGINE_HZ_MIN: 55, // at the slowest scroll speed
      ENGINE_HZ_MAX: 110, // at the fastest
      ENGINE_GAIN: 0.09, // quiet hum
      ENGINE_SMOOTH: 0.06, // time constant (s) for gain/pitch changes: no clicks
      SHOT_HZ_START: 900,
      SHOT_HZ_END: 180,
      SHOT_TIME: 0.13,
      SHOT_GAIN: 0.2,
      SHOT_MIN_GAP: 0.05,
      EXPLOSION_TIME: 0.6,
      EXPLOSION_BIG_TIME: 1.0, // the player's plane
      EXPLOSION_GAIN: 0.5,
      EXPLOSION_LP_START: 3200, // low-pass sweeps down from here...
      EXPLOSION_LP_END: 90, // ...to here
      EXPLOSION_MAX_VOICES: 4,
      REFUEL_HZ_MIN: 300, // beep pitch at an empty tank...
      REFUEL_HZ_MAX: 1000, // ...rising to a full one
      REFUEL_BEEP_TIME: 0.045,
      REFUEL_BEEP_GAP: 0.09,
      REFUEL_GAIN: 0.15,
      DING_HZ: 1760,
      DING_TIME: 0.7,
      DING_GAIN: 0.25,
      ALARM_HZ_A: 880,
      ALARM_HZ_B: 620,
      ALARM_TONE_TIME: 0.12,
      ALARM_GAP: 0.28,
      ALARM_GAIN: 0.13,
      EXTRA_LIFE_NOTES: [523.25, 659.25, 783.99, 1046.5], // C5 E5 G5 C6
      EXTRA_LIFE_NOTE_TIME: 0.09,
      EXTRA_LIFE_GAIN: 0.2,
    },

    // ---- Palette (Atari-flavoured) --------------------------------------------
    COLORS: {
      water: "#2d50c8",
      bank: "#5c9a34",
      bankEdge: "#4a7f2a",
      road: "#6e6e6e",
      roadLine: "#e8c840",
      bridge: "#b07a2a",
      bridgeDark: "#7a521a",
      hud: "#8e8e8e",
      hudDark: "#2a2a2a",
      hudText: "#f0e060",
      hudLight: "#c8c8c8",
      needle: "#f04030",
      player: "#e8d84a",
      playerDark: "#b08a20",
      tankerHull: "#202020",
      tankerDeck: "#c8c8c8",
      tankerStripe: "#b03030",
      heli: "#1e6e3a",
      heliDark: "#124a26",
      heliRotor: "#d0d0d0",
      jet: "#9a9ad8", // spec says #5a5a90, which is too dim against water
      jetDark: "#505098",
      depot: "#c03030",
      depotLetters: "#f0f0f0",
      houseWall: "#d8d0b0",
      houseRoof: "#a03020",
      explosionOrange: "#f0a020",
      explosionYellow: "#f0e040",
      explosionWhite: "#ffffff",
      white: "#ffffff",
      black: "#000000",
    },
  };

  CONFIG.SECTION_SEGMENTS = CONFIG.SEGMENTS_PER_SECTION + 1; // 32 + bridge
  CONFIG.SECTION_H = CONFIG.SECTION_SEGMENTS * CONFIG.SEGMENT_H; // 528
  CONFIG.PLAYER_HIT_W = CONFIG.PLAYER_W - 2 * CONFIG.PLAYER_HIT_INSET;
  CONFIG.PLAYER_HIT_H = CONFIG.PLAYER_H - 2 * CONFIG.PLAYER_HIT_INSET;

  RR.CONFIG = CONFIG;
})();
