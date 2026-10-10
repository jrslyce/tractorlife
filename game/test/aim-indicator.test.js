import test from 'node:test';
import assert from 'node:assert/strict';
import { aimIndicatorState } from '../js/aim-indicator.js';

test('aim indicator follows enabled game state and reports valid targets', () => {
  assert.deepEqual(aimIndicatorState({ enabled: true, buildMode: false, touch: false, target: { kind: 'terrain' } }),
    { visible: true, centered: false, valid: true });
  assert.deepEqual(aimIndicatorState({ enabled: false, buildMode: true, touch: false, target: null }),
    { visible: false, centered: true, valid: false });
});

test('touch and build aiming use the centered reticle position', () => {
  assert.equal(aimIndicatorState({ enabled: true, buildMode: false, touch: true, target: null }).centered, true);
  assert.equal(aimIndicatorState({ enabled: true, buildMode: true, touch: false, target: null }).centered, true);
});
