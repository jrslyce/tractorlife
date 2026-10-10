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
