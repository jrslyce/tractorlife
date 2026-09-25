// game/js/input.js
// Keyboard + touch input for Voxel Tractor. No dependencies.
// Written conservatively (no optional chaining) for older iPad Safari.

export var hasTouch = (function () {
  if (typeof window === 'undefined') return false;
  var nav = window.navigator;
  if (nav && (nav.maxTouchPoints > 0 || nav.msMaxTouchPoints > 0)) return true;
  return 'ontouchstart' in window;
})();

var ACCEL = 3;      // units/s ramp toward a held target
var DECAY = 4;      // units/s ramp back to 0 when released
var MAX_DT = 0.1;   // clamp huge frame gaps (tab switches)
var JOY_R = 54;     // knob travel radius in px
var DEAD = 0.12;    // joystick deadzone
var TAP_MS = 350;   // double-tap zoom window
var TAP_PX = 40;    // double-tap max distance
var BTN_GUARD = 700; // ignore mouse click shortly after touchend on a button

// one-shot key actions
var ACTIONS = {
  KeyE: 'cycleTool',
  KeyC: 'cycleColor',
  KeyQ: 'detach'
};

var BUTTONS = [
  { action: 'cycleTool',  emoji: '\u{1F69C}', label: 'Tool' },   // tractor
  { action: 'cycleColor', emoji: '\u{1F3A8}', label: 'Color' },  // palette
  { action: 'detach',     emoji: '\u{1F50C}', label: 'Detach' }  // plug
];

var CSS = [
  'html, body { touch-action: manipulation; -webkit-user-select: none; user-select: none;',
  '  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;',
  '  overscroll-behavior: none; }',
  '#vt-joy { position: fixed; z-index: 40; display: none; width: 136px; height: 136px;',
  '  margin: -68px 0 0 -68px; border-radius: 50%; pointer-events: none;',
  '  border: 3px solid rgba(255,255,255,.75); background: rgba(255,255,255,.16); }',
  '#vt-joy-knob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px;',
  '  margin: -29px 0 0 -29px; border-radius: 50%; background: rgba(255,255,255,.8);',
  '  border: 2px solid rgba(0,0,0,.15); }',
  '#vt-buttons { position: fixed; right: 14px; z-index: 41; display: -webkit-flex;',
  '  display: flex; -webkit-flex-direction: column; flex-direction: column;',
  '  bottom: 18px; bottom: calc(18px + env(safe-area-inset-bottom)); }',
  '#vt-buttons button { -webkit-appearance: none; appearance: none; display: block;',
  '  min-width: 76px; min-height: 76px; padding: 8px 10px; margin-top: 12px;',
  '  border-radius: 18px; border: 3px solid #2f4d1f; background: #fffbe8; color: #233018;',
  '  font: 600 15px/1.15 system-ui, -apple-system, sans-serif; text-align: center;',
  '  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;',
  '  -webkit-user-select: none; user-select: none; box-shadow: 0 3px 0 rgba(0,0,0,.25); }',
  '#vt-buttons button:first-child { margin-top: 0; }',
  '#vt-buttons button.vt-active { background: #ffe066; transform: translateY(2px);',
  '  box-shadow: 0 1px 0 rgba(0,0,0,.25); }',
  '#vt-buttons .vt-ico { display: block; font-size: 30px; line-height: 1.1; }',
  '#vt-buttons .vt-lbl { display: block; font-size: 14px; margin-top: 2px; }'
].join('\n');

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function approach(cur, target, dt) {
  if (target === 0) {
    if (cur === 0) return 0;
    var step = DECAY * dt;
    if (Math.abs(cur) <= step) return 0;
    return cur - (cur > 0 ? step : -step);
  }
  var diff = target - cur;
  var move = ACCEL * dt;
  if (Math.abs(diff) <= move) return target;
  return cur + (diff > 0 ? move : -move);
}

function isInteractive(el) {
  while (el && el.nodeType === 1) {
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
        (el.getAttribute && el.getAttribute('data-action') !== null)) return true;
    el = el.parentNode;
  }
  return false;
}

function keyName(e) {
  if (e.code) return e.code;
  var k = e.key;
  if (k === ' ') return 'Space';
  if (k === 'ArrowUp') return 'ArrowUp';
  if (k === 'ArrowDown') return 'ArrowDown';
  if (k === 'ArrowLeft') return 'ArrowLeft';
  if (k === 'ArrowRight') return 'ArrowRight';
  if (k && k.length === 1) return 'Key' + k.toUpperCase();
  return k || '';
}

export class Input {
  constructor(target) {
    if (!target) target = window;
    this._target = target;
    this._listeners = [];
    this._pending = [];
    this._held = {};
    this._keyDrive = 0;
    this._keyTurn = 0;
    this._joyDrive = 0;
    this._joyTurn = 0;
    this._drive = 0;
    this._turn = 0;
    this._brake = false;
    this._joyId = null;      // active joystick touch identifier
    this._joyX = 0;          // origin of joystick in client px
    this._joyY = 0;
    this._lastTapT = 0;
    this._lastTapX = 0;
    this._lastTapY = 0;
    this._lastBtnTouch = 0;
    this._disposed = false;

    this._installStyle();
    this._installKeys();
    this._installGestures();
    this._installJoystick();
    this._installButtons();
  }

  // ---- public API -------------------------------------------------------

  get drive() { return this._drive; }   // -1..1  forward positive
  get turn() { return this._turn; }     // -1..1  right positive
  get brake() { return this._brake; }
  get keyActions() { return this._pending.slice(); }

  // pop the oldest queued one-shot action ('cycleTool'|'cycleColor'|'detach') or null
  takeAction() {
    if (this._pending.length === 0) return null;
    return this._pending.shift();
  }

  update(dt) {
    if (typeof dt !== 'number' || !(dt > 0)) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;
    var td = clamp(this._keyDrive + this._joyDrive, -1, 1);
    var tt = clamp(this._keyTurn + this._joyTurn, -1, 1);
    this._drive = approach(this._drive, td, dt);
    this._turn = approach(this._turn, tt, dt);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (var i = 0; i < this._listeners.length; i++) {
      var l = this._listeners[i];
      try { l.node.removeEventListener(l.type, l.fn, l.opts); } catch (e) { /* ignore */ }
    }
    this._listeners.length = 0;
    if (this._style && this._style.parentNode) this._style.parentNode.removeChild(this._style);
    if (this._btnWrap && this._btnWrap.parentNode) this._btnWrap.parentNode.removeChild(this._btnWrap);
    if (this._joy && this._joy.parentNode) this._joy.parentNode.removeChild(this._joy);
    this._style = null; this._btnWrap = null; this._joy = null; this._knob = null;
    this._held = {};
    this._pending.length = 0;
    this._keyDrive = this._keyTurn = this._joyDrive = this._joyTurn = 0;
    this._drive = this._turn = 0;
    this._brake = false;
    this._joyId = null;
  }

  // ---- internals --------------------------------------------------------

  _listen(node, type, fn, opts) {
    if (!node) return;
    node.addEventListener(type, fn, opts);
    this._listeners.push({ node: node, type: type, fn: fn, opts: opts });
  }

  _installStyle() {
    this._style = document.createElement('style');
    this._style.id = 'vt-input-style';
    this._style.type = 'text/css';
    this._style.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(this._style);
  }

  _installKeys() {
    var self = this;
    this._onKeyDown = function (e) {
      var code = keyName(e);
      self._held[code] = true;
      self._syncKeyAxes();
      if (code === 'Space') self._brake = true;
      var action = ACTIONS[code];
      if (action && !e.repeat) self._pending.push(action);
      if (action || code === 'Space' || code.indexOf('Arrow') === 0) {
        if (e.cancelable) e.preventDefault();
      }
    };
    this._onKeyUp = function (e) {
      var code = keyName(e);
      delete self._held[code];
      self._syncKeyAxes();
      if (code === 'Space') self._brake = false;
    };
    this._onBlur = function () {
      self._held = {};
      self._syncKeyAxes();
      self._brake = false;
    };
    this._listen(this._target, 'keydown', this._onKeyDown, false);
    this._listen(this._target, 'keyup', this._onKeyUp, false);
    this._listen(this._target, 'blur', this._onBlur, false);
  }

  _syncKeyAxes() {
    var h = this._held;
    var fwd = (h.KeyW || h.ArrowUp) ? 1 : 0;
    var back = (h.KeyS || h.ArrowDown) ? 1 : 0;
    var left = (h.KeyA || h.ArrowLeft) ? 1 : 0;
    var right = (h.KeyD || h.ArrowRight) ? 1 : 0;
    this._keyDrive = clamp(fwd - back, -1, 1);
    this._keyTurn = clamp(right - left, -1, 1);
  }

  _installGestures() {
    var self = this;
    var stop = function (e) { if (e.cancelable) e.preventDefault(); };
    this._listen(this._target, 'gesturestart', stop, { passive: false });
    this._listen(this._target, 'gesturechange', stop, { passive: false });
    this._listen(this._target, 'gestureend', stop, { passive: false });

    // block pull-to-refresh / scrolling (page never scrolls anyway)
    this._onTouchMove = function (e) { if (e.cancelable) e.preventDefault(); };
    this._listen(document, 'touchmove', this._onTouchMove, { passive: false });

    // block double-tap zoom unless tapping a control
    this._onTouchStartZoom = function (e) {
      if (e.touches && e.touches.length > 1) { stop(e); return; }
      if (isInteractive(e.target)) { self._lastTapT = 0; return; }
      var now = Date.now();
      var ct = e.changedTouches ? e.changedTouches[0] : null;
      var x = ct ? ct.clientX : 0, y = ct ? ct.clientY : 0;
      var dx = x - self._lastTapX, dy = y - self._lastTapY;
      if (self._lastTapT && now - self._lastTapT < TAP_MS &&
          dx * dx + dy * dy < TAP_PX * TAP_PX) {
        stop(e);
        self._lastTapT = 0;
      } else {
        self._lastTapT = now;
        self._lastTapX = x;
        self._lastTapY = y;
      }
    };
    this._listen(document, 'touchstart', this._onTouchStartZoom, { passive: false });
    this._listen(document, 'dblclick', stop, { passive: false });
    this._listen(document, 'contextmenu', stop, { passive: false });
  }

  _installJoystick() {
    var self = this;
    this._joy = document.createElement('div');
    this._joy.id = 'vt-joy';
    this._knob = document.createElement('div');
    this._knob.id = 'vt-joy-knob';
    this._joy.appendChild(this._knob);
    document.body.appendChild(this._joy);

    this._onJoyStart = function (e) {
      if (self._joyId !== null) return;                 // one finger on the stick
      if (isInteractive(e.target)) return;              // buttons manage themselves
      var ct = e.changedTouches ? e.changedTouches[0] : null;
      // reserve the right 30% of the screen for the buttons
      var cx = ct ? ct.clientX : (typeof e.clientX === 'number' ? e.clientX : 0);
      var cy = ct ? ct.clientY : (typeof e.clientY === 'number' ? e.clientY : 0);
      if (cx > window.innerWidth * 0.7) return;
      self._joyId = ct ? ct.identifier : 'mouse';
      self._joyX = cx;
      self._joyY = cy;
      self._joy.style.left = cx + 'px';
      self._joy.style.top = cy + 'px';
      self._joy.style.display = 'block';
      self._knob.style.left = '50%';
      self._knob.style.top = '50%';
      if (e.cancelable) e.preventDefault();
    };

    this._onJoyMove = function (e) {
      if (self._joyId === null) return;
      var ct = null;
      if (e.touches) {
        for (var i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === self._joyId) { ct = e.touches[i]; break; }
        }
        if (!ct && e.changedTouches) {
          for (var j = 0; j < e.changedTouches.length; j++) {
            if (e.changedTouches[j].identifier === self._joyId) { ct = e.changedTouches[j]; break; }
          }
        }
      } else if (self._joyId === 'mouse') {
        ct = { clientX: e.clientX, clientY: e.clientY };
      }
      if (!ct) return;
      var dx = ct.clientX - self._joyX;
      var dy = ct.clientY - self._joyY;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
      // knob visual
      self._knob.style.left = (50 + dx / JOY_R * 50) + '%';
      self._knob.style.top = (50 + dy / JOY_R * 50) + '%';
      // axes: up = forward, right = right
      var drv = -dy / JOY_R;
      var trn = dx / JOY_R;
      if (Math.abs(drv) < DEAD) drv = 0;
      if (Math.abs(trn) < DEAD) trn = 0;
      self._joyDrive = drv;
      self._joyTurn = trn;
      if (e.cancelable) e.preventDefault();
    };

    this._onJoyEnd = function (e) {
      if (self._joyId === null) return;
      var ended = false;
      if (e.changedTouches) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === self._joyId) ended = true;
        }
      } else if (self._joyId === 'mouse') {
        ended = true;
      }
      if (!ended) return;
      self._joyId = null;
      self._joyDrive = 0;
      self._joyTurn = 0;
      self._joy.style.display = 'none';
    };

    this._listen(document, 'touchstart', this._onJoyStart, { passive: false });
    this._listen(document, 'touchmove', this._onJoyMove, { passive: false });
    this._listen(document, 'touchend', this._onJoyEnd, false);
    this._listen(document, 'touchcancel', this._onJoyEnd, false);
    // mouse fallback: left-drag acts as joystick on desktop
    this._listen(document, 'mousedown', this._onJoyStart, false);
    this._listen(document, 'mousemove', this._onJoyMove, false);
    this._listen(document, 'mouseup', this._onJoyEnd, false);
  }

  _installButtons() {
    var self = this;
    this._btnWrap = document.createElement('div');
    this._btnWrap.id = 'vt-buttons';
    this._btns = [];
    for (var i = 0; i < BUTTONS.length; i++) {
      (function (spec) {
        var b = document.createElement('button');
        b.setAttribute('data-action', spec.action);
        var ico = document.createElement('span');
        ico.className = 'vt-ico';
        ico.textContent = spec.emoji;
        var lbl = document.createElement('span');
        lbl.className = 'vt-lbl';
        lbl.textContent = spec.label;
        b.appendChild(ico);
        b.appendChild(lbl);

        var fire = function (e) {
          if (e && e.cancelable) e.preventDefault();
          self._pending.push(spec.action);
          b.classList.add('vt-active');
          setTimeout(function () { b.classList.remove('vt-active'); }, 120);
        };
        // touch: fire on touchend (suppress the ghost click that follows)
        self._listen(b, 'touchstart', function (e) {
          self._lastBtnTouch = Date.now();
          if (e.cancelable) e.preventDefault();
        }, { passive: false });
        self._listen(b, 'touchend', fire, false);
        // mouse/keyboard activation, guarded against post-touch ghost clicks
        self._listen(b, 'click', function (e) {
          if (Date.now() - self._lastBtnTouch < BTN_GUARD) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          fire(e);
        }, false);

        self._btnWrap.appendChild(b);
        self._btns.push(b);
      })(BUTTONS[i]);
    }
    document.body.appendChild(this._btnWrap);
  }
}