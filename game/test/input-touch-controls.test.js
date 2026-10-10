import test from 'node:test';
import assert from 'node:assert/strict';
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
