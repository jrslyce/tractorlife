import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../js/input.js';

test('modal lock clears held throttle, steering, and queued gameplay actions', () => {
  globalThis.window = { VT_LOCKED: true };
  try {
    const input = Object.create(Input.prototype);
    Object.assign(input, { _held: { ArrowUp: true }, _pending: ['sellGrain'],
      _joyDrive: 1, _joyTurn: 1, _drive: 1, _turn: 1, _charDrive: 1, _charTurn: 1,
      _brake: true, _charJump: true, _clearVehicleControls() { this._pedalDrive = this._wheelTurn = 0; } });
    input.update(0.1);
    assert.deepEqual(input._held, {});
    assert.deepEqual(input._pending, []);
    assert.equal(input._drive, 0);
    assert.equal(input._keyDrive, 0);
    assert.equal(input._joyDrive, 0);
    window.VT_LOCKED = false;
    input.update(0.1);
    assert.equal(input._drive, 0);
  } finally { delete globalThis.window; }
});

test('joystick steering changes vehicle turn while pedals still own throttle', () => {
  globalThis.window = { VT_LOCKED: false };
  globalThis.document = { documentElement: { dataset: { steering: 'joystick' } } };
  try {
    const input = Object.create(Input.prototype);
    Object.assign(input, { _walkingMode: false, _drivingMode: true, _held: {}, _keyDrive: 0, _keyTurn: 0,
      _joyDrive: 1, _joyTurn: 1, _pedalDrive: 0, _pedalBrake: false, _wheelTurn: -1, _drive: 0, _turn: 0 });
    input.update(0.1);
    assert.equal(input._drive, 0);
    assert.ok(input._turn > 0);
    document.documentElement.dataset.steering = 'wheel';
    input.update(0.1);
    assert.equal(input._turn, 0);
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('menu actions enter the same guarded input queue as touch controls', () => {
  globalThis.window = { VT_LOCKED: false };
  try {
    const input = Object.create(Input.prototype);
    input._pending = [];
    input.queueAction('cycleColor');
    assert.equal(input.takeAction(), 'cycleColor');
    input.queueAction('arbitraryAction');
    window.VT_LOCKED = true;
    input.queueAction('toggleBuildMode');
    assert.equal(input.takeAction(), null);
  } finally { delete globalThis.window; }
});
