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
  for (let i = 0; i < 420; i++) budget.observeFrame(5, 320 + i * (1000 / 30), function (ratio) { applied.push(ratio); });
  assert.equal(budget.pixelRatio, 1);
  assert.deepEqual(applied, [0.8, 1]);
  delete globalThis.devicePixelRatio;
});

test('landscape and desktop-identifying iPads conservatively select low graphics', () => {
  assert.equal(deviceProfile({ userAgent: 'iPad', hardwareConcurrency: 8 }, 1024).shadows, false);
  assert.equal(deviceProfile({ platform: 'MacIntel', maxTouchPoints: 5, hardwareConcurrency: 8 }, 1024).targetFps, 30);
  assert.equal(deviceProfile({ deviceMemory: 4, hardwareConcurrency: 8 }, 1440).cheapMaterials, true);
});

test('explicit presets override hardware hints without changing gameplay', () => {
  const nav = { deviceMemory: 2, hardwareConcurrency: 2 };
  assert.equal(deviceProfile(nav, 1024, 'high').shadows, true);
  assert.equal(deviceProfile({}, 1440, 'balanced').targetFps, 30);
  assert.equal(deviceProfile({}, 1440, 'balanced').shadows, false);
  assert.equal(deviceProfile({}, 1440, 'low').antialias, false);
});

test('pixel budgets cap large screens and recalculate after resize', () => {
  globalThis.devicePixelRatio = 2;
  const budget = new PerformanceBudget({}, 3840, 2160, 'low');
  assert.ok(3840 * 2160 * budget.pixelRatio ** 2 <= 1000001);
  const renderer = { setPixelRatio(ratio) { this.ratio = ratio; }, setSize() {} };
  budget.setSize(renderer, 1024, 768);
  assert.equal(renderer.ratio, 1);
  delete globalThis.devicePixelRatio;
});

test('GPU-like missed frame targets reduce quality even with cheap CPU submission', () => {
  const budget = new PerformanceBudget({}, 1024, 768, 'low');
  for (let i = 0; i < 10; i++) budget.observeFrame(2, 1000 + i * 50);
  assert.equal(budget.pixelRatio, 0.8);
  budget.resetTiming();
  budget.observeFrame(2, 90000);
  assert.equal(budget.pixelRatio, 0.8);
});

test('30 FPS pacing retains its remainder under mildly uneven RAF intervals', () => {
  const budget = new PerformanceBudget({}, 1024, 768, 'low');
  let rendered = 0;
  for (let i = 0; i < 600; i++) if (budget.shouldRender(1000 + i * 16.5)) rendered++;
  assert.ok(rendered >= 295 && rendered <= 300, String(rendered));
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
