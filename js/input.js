(function () {
  "use strict";
  globalThis.RR = globalThis.RR || {};

  // Actions (not raw keys) are what the game asks about.
  var ACTIONS = ["left", "right", "up", "down", "fire", "start", "pause", "mute", "guided"];

  // Keyboard layout: event.code -> actions it triggers.
  var KEY_MAP = {
    ArrowLeft: ["left"],
    KeyA: ["left"],
    ArrowRight: ["right"],
    KeyD: ["right"],
    ArrowUp: ["up"],
    KeyW: ["up"],
    ArrowDown: ["down"],
    KeyS: ["down"],
    Space: ["fire", "start"],
    Enter: ["start"],
    NumpadEnter: ["start"],
    KeyP: ["pause"],
    KeyM: ["mute"],
    KeyG: ["guided"],
  };

  // Keys whose default browser behaviour (scrolling, button activation) we suppress.
  var PREVENT_DEFAULT = {
    ArrowLeft: true,
    ArrowRight: true,
    ArrowUp: true,
    ArrowDown: true,
    Space: true,
  };

  // Held / pressed-this-frame state, independent of the DOM so it can be driven
  // from tests. Several sources (keys, touches) can hold the same action at once.
  function InputState() {
    this.sources = {}; // action -> { sourceId: true }
    this.pressedNow = {}; // action -> true until endFrame()
    this.anyGesture = false;
  }

  InputState.prototype.down = function (action, source) {
    var set = this.sources[action] || (this.sources[action] = {});
    set[source] = true;
    this.pressedNow[action] = true;
    this.anyGesture = true;
  };

  InputState.prototype.up = function (action, source) {
    var set = this.sources[action];
    if (set) delete set[source];
  };

  // A one-shot press with no hold (a tap on the screen).
  InputState.prototype.tap = function (action) {
    this.pressedNow[action] = true;
    this.anyGesture = true;
  };

  InputState.prototype.held = function (action) {
    var set = this.sources[action];
    if (!set) return false;
    for (var k in set) return true;
    return false;
  };

  InputState.prototype.pressed = function (action) {
    return !!this.pressedNow[action];
  };

  // True if any steering/fire/start action is held or was just pressed.
  InputState.prototype.anyActive = function (list) {
    for (var i = 0; i < list.length; i++) {
      if (this.held(list[i]) || this.pressed(list[i])) return true;
    }
    return false;
  };

  InputState.prototype.endFrame = function () {
    this.pressedNow = {};
  };

  InputState.prototype.releaseAll = function () {
    this.sources = {};
  };

  // ---- Keyboard ------------------------------------------------------------------------

  InputState.prototype.attachKeyboard = function (win, onGesture) {
    var self = this;
    win.addEventListener("keydown", function (e) {
      var actions = KEY_MAP[e.code];
      if (!actions) return;
      if (PREVENT_DEFAULT[e.code]) e.preventDefault();
      if (e.repeat) return;
      if (onGesture) onGesture();
      for (var i = 0; i < actions.length; i++) self.down(actions[i], e.code);
    });
    win.addEventListener("keyup", function (e) {
      var actions = KEY_MAP[e.code];
      if (!actions) return;
      if (PREVENT_DEFAULT[e.code]) e.preventDefault();
      for (var i = 0; i < actions.length; i++) self.up(actions[i], e.code);
    });
    win.addEventListener("blur", function () {
      self.releaseAll();
    });
  };

  // ---- Touch -----------------------------------------------------------------------------
  // A d-pad on the left (a virtual stick: left/right/up/down from where the finger is) and
  // a FIRE button on the right. Pointer events, one per finger, so steering and firing
  // work at the same time. The overlay only shows on touch devices.

  var PAD_DEAD_ZONE = 0.22; // fraction of the pad's radius

  InputState.prototype.attachTouch = function (win, doc) {
    var self = this;
    this.touchUi = false;

    var root = doc.createElement("div");
    root.className = "touch";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="touch-pad"><i class="arrow up"></i><i class="arrow down"></i>' +
      '<i class="arrow left"></i><i class="arrow right"></i></div>' +
      '<div class="touch-fire"><span>FIRE</span></div>';
    doc.body.appendChild(root);
    var pad = root.querySelector(".touch-pad");
    var fire = root.querySelector(".touch-fire");
    var arrows = {
      up: pad.querySelector(".up"),
      down: pad.querySelector(".down"),
      left: pad.querySelector(".left"),
      right: pad.querySelector(".right"),
    };
    var DIRS = ["left", "right", "up", "down"];

    function show() {
      if (self.touchUi) return;
      self.touchUi = true;
      doc.documentElement.classList.add("touch-ui");
      if (self.onTouchUi) self.onTouchUi();
    }

    // pointerId -> directions that finger currently holds on the pad
    var padHeld = {};

    function padDirs(e) {
      var r = pad.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      return { left: dx < -PAD_DEAD_ZONE, right: dx > PAD_DEAD_ZONE, up: dy < -PAD_DEAD_ZONE, down: dy > PAD_DEAD_ZONE };
    }

    function paintPad() {
      for (var i = 0; i < DIRS.length; i++) {
        arrows[DIRS[i]].classList.toggle("on", self.held(DIRS[i]));
      }
    }

    function setPad(id, dirs) {
      var prev = padHeld[id] || {};
      for (var i = 0; i < DIRS.length; i++) {
        var d = DIRS[i];
        if (dirs[d] && !prev[d]) self.down(d, "pad" + id);
        else if (!dirs[d] && prev[d]) self.up(d, "pad" + id);
      }
      padHeld[id] = dirs;
      paintPad();
    }

    function releasePad(id) {
      setPad(id, {});
      delete padHeld[id];
    }

    pad.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      show();
      try {
        pad.setPointerCapture(e.pointerId);
      } catch (err) {
        /* not fatal */
      }
      self.tap("start"); // any touch also confirms (title, pause, game over)
      setPad(e.pointerId, padDirs(e));
    });
    pad.addEventListener("pointermove", function (e) {
      if (padHeld[e.pointerId]) setPad(e.pointerId, padDirs(e));
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) {
      pad.addEventListener(type, function (e) {
        if (padHeld[e.pointerId]) releasePad(e.pointerId);
      });
    });

    var fireIds = {};
    fire.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      show();
      try {
        fire.setPointerCapture(e.pointerId);
      } catch (err) {
        /* not fatal */
      }
      fireIds[e.pointerId] = true;
      self.tap("start");
      self.down("fire", "fire" + e.pointerId);
      fire.classList.add("on");
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) {
      fire.addEventListener(type, function (e) {
        if (!fireIds[e.pointerId]) return;
        delete fireIds[e.pointerId];
        self.up("fire", "fire" + e.pointerId);
        if (!Object.keys(fireIds).length) fire.classList.remove("on");
      });
    });

    root.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });

    // Let go of everything if the page loses focus mid-touch.
    var releaseAll = function () {
      Object.keys(padHeld).forEach(releasePad);
      Object.keys(fireIds).forEach(function (id) {
        self.up("fire", "fire" + id);
      });
      fireIds = {};
      fire.classList.remove("on");
    };
    win.addEventListener("blur", releaseAll);
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) releaseAll();
    });

    // Show the controls on touch-first devices right away, and on anything else the
    // moment a finger touches the screen.
    try {
      if (win.matchMedia && win.matchMedia("(pointer: coarse)").matches) show();
    } catch (err) {
      /* matchMedia unavailable: wait for a touch */
    }
    win.addEventListener("touchstart", show, { passive: true });
    return root;
  };

  RR.InputState = InputState;
  RR.Input = new InputState();
  RR.Input.ACTIONS = ACTIONS;
  RR.Input.KEY_MAP = KEY_MAP;
})();
