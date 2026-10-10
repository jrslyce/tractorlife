import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceProfile, PerformanceBudget } from '../js/performance.js';
import { steeringYawDelta } from '../js/vehicle-physics.js';

test('low-memory, low-core and data-saver devices get constrained settings', function () {
  const lowMemory = deviceProfile({ deviceMemory: 2, hardwareConcurrency: 8 }, 1200);
  const lowCore = deviceProfile({ hardwareConcurrency: 2 }, 1200);
  const saver = deviceProfile({ connection: { saveData: true }, saveData: true }, 1200);
  assert.equal(lowMemory.constrained, true);
  assert.equal(lowCore.targetFps, 30);
  assert.equal(saver.shadows, false);
  assert.equal(lowMemory.maxView, 950);
});

test('desktop profile retains higher quality within a conservative DPR cap', function () {
  const profile = deviceProfile({ hardwareConcurrency: 8, deviceMemory: 8 }, 1440);
  assert.equal(profile.constrained, false);
  assert.equal(profile.shadows, true);
  assert.equal(profile.maxDpr, 1.5);
  assert.equal(profile.poseInterval, 125);
});

test('frame pacing skips work until the target interval elapses', function () {
  const budget = new PerformanceBudget({ saveData: true }, 390, 844);
  assert.equal(budget.shouldRender(1000), true);
  assert.equal(budget.shouldRender(1010), false);
  assert.equal(budget.shouldRender(1034), true);
});

test('slow frame streak steps render resolution down and fast recovery restores it', function () {
  globalThis.devicePixelRatio = 1;
  const budget = new PerformanceBudget({ saveData: true }, 390, 844);
  let applied = [];
  for (let i = 0; i < 8; i++) budget.observeFrame(80, i * 40, function (ratio) { applied.push(ratio); });
  assert.equal(budget.pixelRatio, 0.8);
  assert.deepEqual(applied, [0.8]);
  budget.observeFrame(5, 13000, function (ratio) { applied.push(ratio); });
  budget.observeFrame(5, 25001, function (ratio) { applied.push(ratio); });
  assert.equal(budget.pixelRatio, 1);
  assert.deepEqual(applied, [0.8, 1]);
  delete globalThis.devicePixelRatio;
});

test('labels, HUD and lighting cadence are independently throttled', function () {
  const budget = new PerformanceBudget({ hardwareConcurrency: 8 }, 1200, 800);
  assert.equal(budget.shouldUpdateHud(101), true);
  assert.equal(budget.shouldUpdateHud(150), false);
  assert.equal(budget.shouldUpdateLabels(101), true);
  assert.equal(budget.shouldUpdateSun(67), true);
});

test('positive steering input turns right in forward travel and reverses while backing up', function () {
  assert.ok(steeringYawDelta(1, 1.6, 2, 0.1) < 0, 'right should decrease yaw from +X toward +Z');
  assert.ok(steeringYawDelta(-1, 1.6, 2, 0.1) > 0, 'left should increase yaw from +X toward -Z');
  assert.ok(steeringYawDelta(1, 1.6, -2, 0.1) > 0, 'reverse steering should invert yaw');
  assert.equal(steeringYawDelta(1, 1.6, 0, 0.1), 0, 'stationary steering should have no yaw');
});
