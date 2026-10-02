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

  RR.InputState = InputState;
  RR.Input = new InputState();
  RR.Input.ACTIONS = ACTIONS;
  RR.Input.KEY_MAP = KEY_MAP;
})();
