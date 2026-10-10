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
  KeyE: 'enterVehicle',
  KeyF: 'cycleTool',
  KeyM: 'cycleMachine',
  KeyC: 'cycleColor',
  KeyQ: 'detach',
  KeyT: 'talkShop', // M1: talk to shopkeeper
  KeyL: 'openWagon', // load / unload the wagon or truck bed
  KeyU: 'unloadCombine',
  KeyB: 'toggleBuildMode',
  KeyY: 'sellGrain',
  KeyG: 'farmInteract'
};

var BUTTONS = [
  { action: 'cycleMachine', emoji: '\u{1F69C}', label: 'Machine' }, // tractor / combine
  { action: 'toggleTool', emoji: '🔧', label: 'Attach' },
  { action: 'cycleColor', emoji: '\u{1F3A8}', label: 'Color' },  // palette
  { action: 'detach',     emoji: '\u{1F50C}', label: 'Detach' }, // plug
  { action: 'jump',       emoji: '\u{1F9BF}', label: 'Jump' },   // person jumping
  { action: 'enterVehicle', emoji: '\u{1F697}', label: 'Enter' }, // hop in/out
  { action: 'talkShop',   emoji: '\u{1F3EA}', label: 'Shop' },   // M1: talk to shopkeeper
  { action: 'openWagon',  emoji: '\u{1F6D2}', label: 'Cargo' },
  { action: 'unloadCombine', emoji: '🌾', label: 'Unload' },
  { action: 'toggleBuildMode', emoji: '🧱', label: 'Build' },
  { action: 'sellGrain', emoji: '🌾', label: 'Sell crops' },
  { action: 'farmInteract', emoji: '✋', label: 'Interact' }
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
  '#vt-buttons { position: fixed; right: 12px; z-index: 41; display: -webkit-flex;',
  '  display: flex; -webkit-flex-direction: column; flex-direction: column;',
   '  bottom: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); gap:7px;',
   '  max-height:calc(100vh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom));',
   '  overflow-y:auto; overscroll-behavior:contain; }',
  '#vt-buttons button { -webkit-appearance: none; appearance: none; display: block;',
  '  min-width: 58px; min-height: 58px; padding: 5px 7px; margin:0;',
  '  border-radius: 9px; border: 2px solid #b6d77a; background: rgba(21,31,23,.94); color: #f7f6e9;',
  '  font: 700 12px/1.1 system-ui, -apple-system, sans-serif; text-align: center;',
  '  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;',
   '  -webkit-user-select: none; user-select: none; box-shadow: 0 3px 0 #0c130d; }',
   '#vt-buttons button:focus-visible, #vt-vehicle-controls button:focus-visible, #vt-steering-wheel:focus-visible {',
   '  outline:3px solid #fff; outline-offset:3px; box-shadow:0 0 0 6px #315b9a; }',
  '#vt-buttons button.vt-active { background: #ffe36b; color:#233018; transform: translateY(2px);',
  '  box-shadow: 0 1px 0 #0c130d; }',
  '#vt-buttons .vt-ico { display: block; font-size: 23px; line-height: 1.1; }',
  '#vt-buttons .vt-lbl { display: block; font-size: 10px; margin-top: 2px; }',
  '#vt-buttons.vt-driving { left:50%; right:auto; top:calc(8px + env(safe-area-inset-top)); bottom:auto;',
  '  transform:translateX(-50%); flex-direction:row; gap:6px; }',
  '#vt-buttons.vt-driving button { min-width:56px; min-height:56px; width:62px; padding:4px;',
  '  margin:0; border-radius:14px; font-size:12px; }',
  '#vt-buttons.vt-driving .vt-ico { font-size:22px; } #vt-buttons.vt-driving .vt-lbl { font-size:10px; }',
  '#vt-vehicle-controls { position:fixed; inset:0; z-index:40; display:none; pointer-events:none;',
  '  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);',
  '  box-sizing:border-box; touch-action:none; }',
  '#vt-steering-wheel { position:absolute; left:max(22px,calc(22px + env(safe-area-inset-left)));',
  '  bottom:max(26px,calc(26px + env(safe-area-inset-bottom))); width:clamp(126px,22vw,176px); aspect-ratio:1;',
  '  border:11px solid #493d2a; border-radius:50%; box-sizing:border-box; pointer-events:auto; touch-action:none;',
  '  background:radial-gradient(circle,#776746 0 13%,#332a1d 14% 21%,transparent 22%),conic-gradient(#d8c392,#6f5d3e,#d8c392,#6f5d3e,#d8c392);',
  '  box-shadow:0 4px 0 rgba(0,0,0,.4),inset 0 0 0 4px #e4d6b6; transition:transform 70ms linear; }',
  '#vt-steering-wheel:before,#vt-steering-wheel:after { content:""; position:absolute; left:50%; top:50%;',
  '  width:7px; height:45%; border-radius:4px; background:#493d2a; transform:translate(-50%,-100%); transform-origin:50% 100%; }',
  '#vt-steering-wheel:after { transform:translate(-50%,0) rotate(90deg); transform-origin:50% 0; }',
  '#vt-pedals { position:absolute; right:max(18px,calc(18px + env(safe-area-inset-right)));',
  '  bottom:max(24px,calc(24px + env(safe-area-inset-bottom))); display:flex; align-items:flex-end; gap:12px; pointer-events:auto; }',
  '.vt-pedal { width:clamp(68px,10vw,90px); height:clamp(96px,18vh,140px); border:3px solid #29441d;',
  '  border-radius:16px; color:#203017; background:#fffbe8; box-shadow:0 4px 0 rgba(0,0,0,.32);',
  '  font:800 14px system-ui,sans-serif; touch-action:none; } #vt-gas { height:clamp(112px,22vh,166px); background:#e7ce72; }',
  '.vt-pedal.vt-active { transform:translateY(3px); box-shadow:0 1px 0 rgba(0,0,0,.3); }',
  '#vt-exit-vehicle { position:absolute; right:max(18px,calc(18px + env(safe-area-inset-right)));',
  '  bottom:calc(max(24px,env(safe-area-inset-bottom)) + clamp(180px,29vh,230px));',
  '  min-width:92px; min-height:52px; padding:8px 14px; border:2px solid #f3d98a; border-radius:14px;',
  '  color:#fff8e5; background:#70483b; box-shadow:0 4px 0 rgba(0,0,0,.35); font:900 14px system-ui,sans-serif;',
  '  pointer-events:auto; touch-action:manipulation; } #vt-exit-vehicle:active { transform:translateY(3px); box-shadow:0 1px 0 rgba(0,0,0,.35); }',
  '#vt-reverse { position:absolute; right:calc(max(18px,env(safe-area-inset-right)) + clamp(108px,14vw,132px));',
  '  bottom:calc(max(24px,env(safe-area-inset-bottom)) + clamp(180px,29vh,230px));',
  '  min-width:92px; min-height:52px; padding:8px 10px; border:2px solid #d7e4c3; border-radius:14px;',
  '  color:#f4f7eb; background:#394638; box-shadow:0 4px 0 rgba(0,0,0,.35); font:900 13px system-ui,sans-serif;',
  '  pointer-events:auto; touch-action:manipulation; } #vt-reverse.vt-active { color:#17220f; background:#b8d78a; transform:translateY(3px); box-shadow:0 1px 0 rgba(0,0,0,.35); }',
  'html[data-larger-controls="true"] #vt-buttons button { min-width:64px; min-height:64px; }',
  'html[data-larger-controls="true"] #vt-buttons.vt-driving button { min-width:64px; min-height:64px; }',
  'html[data-larger-controls="true"] .vt-pedal { min-width:76px; min-height:112px; }',
  'html[data-high-contrast="true"] #vt-buttons button,html[data-high-contrast="true"] .vt-pedal { border-width:3px; outline-color:#fff; }',
  'html[data-text-scale="large"] #vt-buttons .vt-lbl,html[data-text-scale="larger"] #vt-buttons .vt-lbl { font-size:12px; }',

  // --- short viewports ---------------------------------------------------
  // Keep action buttons compact on tablet and short landscape viewports.
  '@media (max-height: 780px) {',
   '  #vt-buttons button { min-width: 56px; min-height: 56px; padding: 4px 6px;',
  '    border-radius: 9px; font-size: 12px; }',
  '  #vt-buttons .vt-ico { font-size: 21px; }',
  '  #vt-buttons .vt-lbl { font-size: 9px; margin-top: 1px; }',
  '}',
  // Very short (landscape phone): one row docked to the bottom-right, so the
  // whole pad stays on screen and clear of the stats card and the hint card.
  '@media (max-height: 700px) {',
   '  #vt-buttons { right: 12px; left:auto; top:auto;',
  '    bottom: 10px; bottom: calc(10px + env(safe-area-inset-bottom));',
  '    -webkit-flex-direction: row; flex-direction: row;',
  '    -webkit-flex-wrap: wrap; flex-wrap: wrap;',
  '    -webkit-justify-content: flex-end; justify-content: flex-end;',
  '    -webkit-align-items: flex-end; align-items: flex-end; }',
   '  #vt-buttons { gap:5px; max-width:calc(100vw - 24px);',
   '    max-height:calc(100vh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }',
   '  #vt-buttons button { min-width:56px; min-height:56px; margin:0; }',
  '}',
  '@media (max-width:640px) {',
  '  #vt-buttons.vt-driving { max-width:calc(100vw - 16px); flex-wrap:wrap; justify-content:center; gap:4px; }',
   '  #vt-buttons.vt-driving button { min-width:56px; min-height:56px; width:58px; }',
   '  #vt-buttons.vt-driving .vt-ico { font-size:19px; } #vt-buttons.vt-driving .vt-lbl { font-size:10px; }',
  '  #vt-steering-wheel { width:clamp(112px,25vw,150px); bottom:max(18px,calc(18px + env(safe-area-inset-bottom))); }',
  '  #vt-pedals { gap:8px; bottom:max(18px,calc(18px + env(safe-area-inset-bottom))); }',
  '  .vt-pedal { width:clamp(62px,12vw,78px); height:clamp(86px,20vh,118px); } #vt-gas { height:clamp(104px,23vh,142px); }',
  '  #vt-exit-vehicle,#vt-reverse { bottom:calc(max(18px,env(safe-area-inset-bottom)) + clamp(158px,27vh,192px)); }',
  '  #vt-reverse { right:calc(max(18px,env(safe-area-inset-right)) + clamp(96px,25vw,112px)); min-width:82px; }',
  '}'
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

// login gate: anything other than an explicit false counts as locked (default-deny)
function locked() {
  return typeof window === 'undefined' || window.VT_LOCKED !== false;
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
    this._pedalDrive = 0;
    this._pedalBrake = false;
    this._reverseMode = false;
    this._wheelTurn = 0;
    this._drivingMode = false;
    this._buildMode = false;
    this._advancedSystemsEnabled = true;
    this._enterNear = false;
    this._shopNear = false;
    this._wagonNear = false;
    this._toolAvailable = false;
    this._toolAttached = false;
    this._unloadAvailable = false;
    this._sellGrainVisible = false;
    this._farmInteractVisible = false;
    this._charDrive = 0;
    this._charTurn = 0;
    this._charJump = false;
    this._walkingMode = true;
    this._joyId = null;      // active joystick touch identifier
    this._joyX = 0;          // origin of joystick in client px
    this._joyY = 0;
    this._joyMoved = false;
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
    this._installVehicleControls();
  }

  // ---- public API -------------------------------------------------------

  get drive() { return this._drive; }   // -1..1  forward positive
  get turn() { return this._turn; }     // -1..1  right positive
  get brake() { return this._brake || this._pedalBrake; }
  get keyActions() { return this._pending.slice(); }

  // character movement getters
  get charDrive() { return this._charDrive; }
  get charTurn() { return this._charTurn; }
  get charJump() { return this._charJump; }

  // pop the oldest queued one-shot action ('cycleTool'|'cycleColor'|'detach'|'jump'|'enterVehicle') or null
  takeAction() {
    if (this._pending.length === 0) return null;
    return this._pending.shift();
  }

  // walking/driving mode
  setWalkingMode(walking) { this._walkingMode = walking; }
  isWalkingMode() { return this._walkingMode; }

  setDrivingMode(driving) {
    driving = !!driving;
    var changed = this._drivingMode !== driving;
    this._drivingMode = driving;
    if (this._btnWrap) this._btnWrap.classList.toggle('vt-driving', this._drivingMode);
    if (document.body) document.body.classList.toggle('vt-driving', this._drivingMode);
    // Use one driving control layout for every machine and browser. Pointer
    // input works with touch or mouse, while the keyboard remains supported.
    if (this._vehicleControls) {
      this._vehicleControls.style.display = this._drivingMode ? 'block' : 'none';
      this._vehicleControls.style.visibility = this._drivingMode ? 'visible' : 'hidden';
    }
    if (changed && this._drivingMode) {
      this._joyDrive = 0;
      this._joyTurn = 0;
      if (this._joy) this._joy.style.display = 'none';
    } else if (changed) {
      this._clearVehicleControls();
    }
    this._setButtonLabel('enterVehicle', this._drivingMode ? '🚪' : '🚜', this._drivingMode ? 'Exit' : 'Enter');
    this._updateContextButtons();
  }

  setEnterVisible(visible) { this._enterNear = !!visible; this._updateContextButtons(); }
  setBuildMode(active) {
    this._buildMode = !!active && this._advancedSystemsEnabled;
    this._setButtonLabel('toggleBuildMode', '🧱', this._buildMode ? 'Exit Build' : 'Build');
    this._setButtonVisible('toggleBuildMode', !this._drivingMode && this._advancedSystemsEnabled);
  }
  setAdvancedSystemsEnabled(enabled) {
    this._advancedSystemsEnabled = enabled !== false;
    if (!this._advancedSystemsEnabled) this.setBuildMode(false);
    else this._setButtonVisible('toggleBuildMode', !this._drivingMode);
  }
  setToolControl(available, attached, contextLabel, isTruck) {
    this._toolAvailable = !!available;
    this._toolAttached = !!attached;
    this._truckMode = !!isTruck;
    this._setButtonLabel('toggleTool', '🔧', contextLabel || (this._toolAttached ? 'Detach' : 'Attach'));
    this._updateContextButtons();
  }
  setUnloadVisible(visible) { this._unloadAvailable = !!visible; this._updateContextButtons(); }
  setSellGrainVisible(visible) { this._sellGrainVisible = !!visible; this._updateContextButtons(); }
  setInteractVisible(visible) { this._farmInteractVisible = !!visible; this._updateContextButtons(); }

  _setButtonLabel(action, emoji, label) {
    var b = this._btnByAction && this._btnByAction[action];
    if (!b) return;
    var ico = b.querySelector('.vt-ico'), lbl = b.querySelector('.vt-lbl');
    if (ico) ico.textContent = emoji;
    if (lbl) lbl.textContent = label;
    b.setAttribute('aria-label', label);
  }
  _setButtonVisible(action, visible) {
    var b = this._btnByAction && this._btnByAction[action];
    if (b) b.style.display = visible ? 'block' : 'none';
  }
  _updateContextButtons() {
    this._setButtonVisible('enterVehicle', !this._drivingMode && this._enterNear);
    this._setButtonVisible('talkShop', !this._drivingMode && this._shopNear);
    this._setButtonVisible('openWagon', !this._drivingMode && this._wagonNear);
    this._setButtonVisible('toggleTool', this._drivingMode && this._toolAvailable);
    this._setButtonVisible('unloadCombine', this._drivingMode && this._unloadAvailable);
    this._setButtonVisible('sellGrain', this._sellGrainVisible);
    this._setButtonVisible('farmInteract', this._farmInteractVisible);
    this._setButtonVisible('cycleMachine', this._drivingMode);
    this._setButtonVisible('cycleColor', !this._truckMode);
    this._setButtonVisible('detach', this._drivingMode && this._toolAttached && !this._truckMode);
    this._setButtonVisible('jump', !this._drivingMode);
    this._setButtonVisible('toggleBuildMode', !this._drivingMode && this._advancedSystemsEnabled);
  }

  // caller consumes the one-shot jump flag, then clears it
  clearJump() { this._charJump = false; }

  // M1: show/hide the shop talk prompt (mobile Enter button repurposed)
  setShopNear(visible) {
    this._shopNear = !!visible; this._updateContextButtons();
  }

  // show/hide the Wagon button (only while standing next to the wagon)
  setWagonNear(visible) {
    this._wagonNear = !!visible; this._updateContextButtons();
  }

  update(dt) {
    if (locked()) {
      this._held = {};
      this._syncKeyAxes();
      this._clearVehicleControls();
      this._joyDrive = this._joyTurn = 0;
      this._drive = this._turn = this._charDrive = this._charTurn = 0;
      this._brake = this._charJump = false;
      this._pending.length = 0;
      return;
    }
    if (typeof dt !== 'number' || !(dt > 0)) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;

    if (this._walkingMode) {
      // character movement mode
      var td = clamp(this._keyDrive + this._joyDrive, -1, 1);
      var tt = clamp(this._keyTurn + this._joyTurn, -1, 1);
      this._charDrive = approach(this._charDrive, td, dt);
      this._charTurn = approach(this._charTurn, tt, dt);
    } else {
      // vehicle driving mode
      var pedalDrive = this._drivingMode ? this._pedalDrive : this._joyDrive;
      var vtd = this._pedalBrake ? 0 : clamp(this._keyDrive + pedalDrive, -1, 1);
      var vtt = clamp(this._keyTurn + (this._drivingMode ? this._wheelTurn : this._joyTurn), -1, 1);
      this._drive = approach(this._drive, vtd, dt);
      this._turn = approach(this._turn, vtt, dt);
    }
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
    if (this._vehicleControls && this._vehicleControls.parentNode) this._vehicleControls.parentNode.removeChild(this._vehicleControls);
    this._style = null; this._btnWrap = null; this._joy = null; this._knob = null; this._vehicleControls = null;
    this._held = {};
    this._pending.length = 0;
    this._keyDrive = this._keyTurn = this._joyDrive = this._joyTurn = 0;
    this._drive = this._turn = 0;
    this._brake = false;
    this._charDrive = this._charTurn = 0;
    this._charJump = false;
    this._walkingMode = true;
    this._joyId = null;
  }

  // ---- internals --------------------------------------------------------

  _listen(node, type, fn, opts) {
    if (!node) return;
    node.addEventListener(type, fn, opts);
    this._listeners.push({ node: node, type: type, fn: fn, opts: opts });
  }

  _shouldSuppressWorldClick(target) {
    return !!(this._suppressWorldClickUntil && Date.now() < this._suppressWorldClickUntil &&
      !(target && target.closest && target.closest('#vt-buttons, #vt-vehicle-controls, #shop-overlay, .grain-sale-overlay')));
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
      if (locked()) return;
      var tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      var code = keyName(e);
      self._held[code] = true;
      self._syncKeyAxes();
      if (code === 'Space') {
        if (self._walkingMode) {
          // jump trigger in walking mode (one-shot)
          if (!e.repeat) self._charJump = true;
        } else {
          // brake in driving mode
          self._brake = true;
        }
      }
      var action = ACTIONS[code];
      if (action && !e.repeat) self._pending.push(action);
      if (/^Digit[1-9]$/.test(code) && !e.repeat) self._pending.push('hotbar:' + (Number(code.slice(5)) - 1));
      if (action || /^Digit[1-9]$/.test(code) || code === 'Space' || code.indexOf('Arrow') === 0) {
        if (e.cancelable) e.preventDefault();
      }
    };
    this._onKeyUp = function (e) {
      // Releases must be honored even if a modal acquired focus while driving.
      var code = keyName(e);
      delete self._held[code];
      self._syncKeyAxes();
      if (code === 'Space') {
        if (self._walkingMode) {
        // jump flag is one-shot; the game consumes it and calls clearJump()
        } else {
          self._brake = false;
        }
      }
    };
    this._onBlur = function () {
      self._held = {};
      self._syncKeyAxes();
      self._brake = false;
      self._charJump = false;
      self._clearVehicleControls();
    };
    this._listen(this._target, 'keydown', this._onKeyDown, false);
    this._listen(this._target, 'keyup', this._onKeyUp, false);
    this._listen(this._target, 'blur', this._onBlur, false);
    this._listen(document, 'visibilitychange', function () {
      if (document.hidden) self._clearVehicleControls();
    }, false);
    // Mobile browsers often report the new viewport one frame after
    // orientationchange. Re-emit resize after that viewport settles so the
    // renderer can resize its canvas using current dimensions.
    this._listen(window, 'orientationchange', function () {
      setTimeout(function () {
        if (self._disposed || typeof window === 'undefined') return;
        var resize;
        try { resize = new Event('resize'); }
        catch (e) { resize = document.createEvent('Event'); resize.initEvent('resize', false, false); }
        window.dispatchEvent(resize);
      }, 120);
    }, false);
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
    this._onTouchMove = function (e) {
      // Modal lists need native one-finger scrolling; only the game surface
      // should suppress page gestures.
      if (e.target && e.target.closest && e.target.closest('#shop-overlay, .grain-sale-overlay')) return;
      if (e.cancelable) e.preventDefault();
    };
    this._listen(document, 'touchmove', this._onTouchMove, { passive: false });

    // block double-tap zoom unless tapping a control
    this._onTouchStartZoom = function (e) {
      if (e.target && e.target.closest && e.target.closest('#shop-overlay')) {
        self._lastTapT = 0; return;
      }
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
      if (locked()) return;                             // login gate
      if (e.target && e.target.closest && e.target.closest('#shop-overlay')) return;
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
      self._joyMoved = false;
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
      if (len > 12) self._joyMoved = true;
      if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
      // knob visual
      self._knob.style.left = (50 + dx / JOY_R * 50) + '%';
      self._knob.style.top = (50 + dy / JOY_R * 50) + '%';
      // axes: up = forward, right = right
      var drv = -dy / JOY_R;
      var trn = dx / JOY_R;
      if (Math.abs(drv) < DEAD) drv = 0;
      if (Math.abs(trn) < DEAD) trn = 0;
      // update() routes these into charDrive/charTurn while walking
      // and into drive/turn while driving.
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
      if (self._joyMoved) self._suppressWorldClickUntil = Date.now() + BTN_GUARD;
      self._joyMoved = false;
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
    this._onClickCapture = function (e) {
      if (self._shouldSuppressWorldClick(e.target)) {
        if (e.cancelable) e.preventDefault();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
    };
    this._listen(document, 'click', this._onClickCapture, true);
  }

  _installButtons() {
    var self = this;
    this._btnWrap = document.createElement('div');
    this._btnWrap.id = 'vt-buttons';
    this._btns = [];
    this._btnByAction = {};
    for (var i = 0; i < BUTTONS.length; i++) {
      (function (spec) {
        var b = document.createElement('button');
        b.setAttribute('data-action', spec.action);
        b.setAttribute('aria-label', spec.label);
        var ico = document.createElement('span');
        ico.className = 'vt-ico';
        ico.textContent = spec.emoji;
        var lbl = document.createElement('span');
        lbl.className = 'vt-lbl';
        lbl.textContent = spec.label;
        b.appendChild(ico);
        b.appendChild(lbl);

        var fire = function (e) {
          if (locked()) return;
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
        self._btnByAction[spec.action] = b;
      })(BUTTONS[i]);
    }
    document.body.appendChild(this._btnWrap);
    this._updateContextButtons();
  }

  _clearVehicleControls() {
    this._pedalDrive = 0;
    this._pedalBrake = false;
    this._reverseMode = false;
    this._wheelTurn = 0;
    if (this._activeWheelPointer !== undefined) this._activeWheelPointer = null;
    if (this._wheel) this._wheel.style.transform = 'rotate(0deg)';
    if (this._gas) this._gas.classList.remove('vt-active');
    if (this._brakePedal) this._brakePedal.classList.remove('vt-active');
    if (this._reverse) {
      this._reverse.classList.remove('vt-active');
      this._reverse.setAttribute('aria-pressed', 'false');
      this._reverse.setAttribute('aria-label', 'Switch to reverse gear');
      this._reverse.textContent = 'R · REVERSE';
    }
  }

  _installVehicleControls() {
    var self = this;
    var wrap = document.createElement('div');
    wrap.id = 'vt-vehicle-controls';
    var wheel = document.createElement('div');
    wheel.id = 'vt-steering-wheel';
    wheel.setAttribute('role', 'slider');
    wheel.setAttribute('aria-label', 'Steering wheel. Drag left or right to steer.');
    wheel.setAttribute('aria-valuemin', '-100');
    wheel.setAttribute('aria-valuemax', '100');
    var pedals = document.createElement('div');
    pedals.id = 'vt-pedals';
    var brake = document.createElement('button');
    brake.type = 'button'; brake.id = 'vt-brake'; brake.className = 'vt-pedal'; brake.textContent = 'BRAKE';
    var gas = document.createElement('button');
    gas.type = 'button'; gas.id = 'vt-gas'; gas.className = 'vt-pedal'; gas.textContent = 'GAS';
    var exit = document.createElement('button');
    exit.type = 'button'; exit.id = 'vt-exit-vehicle'; exit.textContent = '↗ EXIT';
    var reverse = document.createElement('button');
    reverse.type = 'button'; reverse.id = 'vt-reverse'; reverse.textContent = 'R · REVERSE';
    reverse.setAttribute('aria-label', 'Switch to reverse gear');
    reverse.setAttribute('aria-pressed', 'false');
    pedals.appendChild(brake); pedals.appendChild(gas);
    wrap.appendChild(wheel); wrap.appendChild(pedals); wrap.appendChild(exit); wrap.appendChild(reverse);
    var exitVehicle = function (e) {
      if (e && e.cancelable) e.preventDefault();
      if (locked()) return;
      self._pending.push('enterVehicle');
    };
    this._listen(exit, 'click', exitVehicle, false);
    document.body.appendChild(wrap);
    this._vehicleControls = wrap; this._wheel = wheel; this._gas = gas; this._brakePedal = brake; this._exitVehicle = exit; this._reverse = reverse;
    var toggleReverse = function (e) {
      if (e && e.cancelable) e.preventDefault();
      if (locked()) return;
      self._reverseMode = !self._reverseMode;
      reverse.classList.toggle('vt-active', self._reverseMode);
      reverse.setAttribute('aria-pressed', self._reverseMode ? 'true' : 'false');
      reverse.setAttribute('aria-label', self._reverseMode ? 'Switch to forward gear' : 'Switch to reverse gear');
      reverse.textContent = self._reverseMode ? 'D · FORWARD' : 'R · REVERSE';
      if (self._pedalDrive !== 0) self._pedalDrive = self._reverseMode ? -1 : 1;
    };
    // Touch press must not depend on a click: the document's gesture handling
    // can cancel a click when a finger moves slightly before lifting.
    this._listen(reverse, 'pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        self._lastReverseTouch = Date.now();
        toggleReverse(e);
      }
    }, false);
    this._listen(reverse, 'click', function (e) {
      if (e.detail !== 0 && Date.now() - self._lastReverseTouch < BTN_GUARD) return;
      toggleReverse(e);
    }, false);

    var lastWheelAngle = null;
    var wheelMove = function (e) {
      if (self._activeWheelPointer !== e.pointerId) return;
      var rect = wheel.getBoundingClientRect();
      var dx = e.clientX - (rect.left + rect.width / 2);
      var dy = e.clientY - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < rect.width * 0.18) return;
      var angle = Math.atan2(dy, dx);
      if (lastWheelAngle !== null) {
        var delta = angle - lastWheelAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        self._wheelTurn = clamp(self._wheelTurn + delta / 2.35, -1, 1);
      }
      lastWheelAngle = angle;
      wheel.setAttribute('aria-valuenow', String(Math.round(self._wheelTurn * 100)));
      wheel.style.transform = 'rotate(' + (self._wheelTurn * 145) + 'deg)';
      if (e.cancelable) e.preventDefault();
    };
    var wheelEnd = function (e) {
      if (self._activeWheelPointer !== e.pointerId) return;
      self._activeWheelPointer = null; lastWheelAngle = null; self._wheelTurn = 0; wheel.style.transform = 'rotate(0deg)';
      wheel.setAttribute('aria-valuenow', '0');
    };
    this._listen(wheel, 'pointerdown', function (e) {
      if (locked()) return;
      self._activeWheelPointer = e.pointerId;
      self._wheelTurn = 0; lastWheelAngle = null;
      if (wheel.setPointerCapture) wheel.setPointerCapture(e.pointerId);
      wheelMove(e);
    }, false);
    this._listen(wheel, 'pointermove', wheelMove, false);
    this._listen(wheel, 'pointerup', wheelEnd, false);
    this._listen(wheel, 'pointercancel', wheelEnd, false);
    this._listen(wheel, 'lostpointercapture', wheelEnd, false);

    var pedal = function (el, kind, down) {
      if (locked()) return;
      if (kind === 'gas') self._pedalDrive = down ? (self._reverseMode ? -1 : 1) : 0;
      else self._pedalBrake = down;
      el.classList.toggle('vt-active', down);
    };
    [[gas, 'gas'], [brake, 'brake']].forEach(function (pair) {
      var el = pair[0], kind = pair[1];
      self._listen(el, 'pointerdown', function (e) {
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
        pedal(el, kind, true); if (e.cancelable) e.preventDefault();
      }, false);
      var release = function () { pedal(el, kind, false); };
      self._listen(el, 'pointerup', release, false);
      self._listen(el, 'pointercancel', release, false);
      self._listen(el, 'lostpointercapture', release, false);
    });
  }
}
