import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Input } from '../js/input.js';

test('held touch brake prevents gas from accelerating', () => {
  globalThis.window = { VT_LOCKED: false };
  try {
    const input = Object.create(Input.prototype);
    Object.assign(input, { _walkingMode: false, _drivingMode: true, _keyDrive: 0,
      _pedalDrive: 1, _pedalBrake: true, _wheelTurn: 0, _drive: 0, _turn: 0 });
    input.update(0.1);
    assert.equal(input._drive, 0);
    input._pedalBrake = false;
    input.update(0.1);
    assert.ok(input._drive > 0);
  } finally { delete globalThis.window; }
});

test('joystick drag suppression is limited to world clicks', () => {
  const input = Object.create(Input.prototype);
  input._suppressWorldClickUntil = Date.now() + 500;
  const worldTarget = { closest: () => null };
  const buttonTarget = { closest: selector => selector.includes('#vt-buttons') ? {} : null };
  assert.equal(input._shouldSuppressWorldClick(worldTarget), true);
  assert.equal(input._shouldSuppressWorldClick(buttonTarget), false);
  input._suppressWorldClickUntil = Date.now() - 1;
  assert.equal(input._shouldSuppressWorldClick(worldTarget), false);
});

test('touch control CSS keeps action targets at least 48px and exposes focus rings', () => {
  const source = readFileSync(new URL('../js/input.js', import.meta.url), 'utf8');
  const buttonRules = source.match(/#vt-buttons(?:\.vt-driving)? button \{[^}]*\}/g) || [];
  assert.ok(buttonRules.length > 0);
  for (const rule of buttonRules) {
    for (const match of rule.matchAll(/min-(?:width|height):\s*(\d+)px/g)) {
      assert.ok(Number(match[1]) >= 48, `${match[0]} in ${rule}`);
    }
  }
  assert.match(source, /button:focus-visible/);
  assert.match(source, /outline:3px solid #fff/);
  assert.match(source, /max-height:calc\(100vh[^']*safe-area-inset/);
});

test('updating a touch action also updates its accessible name', () => {
  const button = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) { return selector === '.vt-ico' ? this.icon : this.label; },
    icon: { textContent: '' }, label: { textContent: '' } };
  const input = Object.create(Input.prototype);
  input._btnByAction = { enterVehicle: button };
  input._setButtonLabel('enterVehicle', '🚪', 'Exit');
  assert.equal(button.attributes['aria-label'], 'Exit');
  assert.equal(button.label.textContent, 'Exit');
});

test('Simple Farm disables build mode button and rejects reopening it', () => {
  const input = Object.create(Input.prototype);
  const visible = {}, labels = {};
  input._drivingMode = false;
  input._buildMode = true;
  input._setButtonVisible = (action, value) => { visible[action] = value; };
  input._setButtonLabel = (action, _emoji, label) => { labels[action] = label; };
  input.setAdvancedSystemsEnabled(false);
  assert.equal(input._buildMode, false);
  assert.equal(visible.toggleBuildMode, false);
  input.setBuildMode(true);
  assert.equal(input._buildMode, false);
  input.setAdvancedSystemsEnabled(true);
  assert.equal(visible.toggleBuildMode, true);
});
