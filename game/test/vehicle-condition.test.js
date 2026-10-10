import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleCondition } from '../js/vehicle-condition.js';

test('wear accumulates in elapsed time and responds to usage and environment', () => {
  const condition = new VehicleCondition({ config: { wearPerHour: { tire: 0.1, engine: 0.2 } } });
  const state = condition.update(1800, { driving: 2, work: 1 }, { roughness: 2, heat: 1.5 });
  assert.equal(state.wear.tire, 0.2);
  assert.ok(Math.abs(state.wear.engine - 0.3) < 1e-12);
  assert.equal(state.operatingHours, 1);
});

test('equivalent elapsed time has equivalent wear independent of frame size', () => {
  const options = { seed: 7, config: { wearPerHour: { tire: 0.03, engine: 0.04 } } };
  const one = new VehicleCondition(options);
  const many = new VehicleCondition(options);
  one.update(3600, { driving: 1, work: 1 });
  for (let i = 0; i < 60; i++) many.update(60, { driving: 1, work: 1 });
  assert.ok(Math.abs(one.getState().wear.tire - many.getState().wear.tire) < 1e-12);
  assert.ok(Math.abs(one.getState().wear.engine - many.getState().wear.engine) < 1e-12);
});

test('scripted breakdowns are persistent, change speed, and enforce repair resources', () => {
  const condition = new VehicleCondition();
  condition.triggerBreakdown('flat_tire');
  assert.equal(condition.getState().breakdown.type, 'flat_tire');
  assert.equal(condition.getState().speedMultiplier, 0.5);
  const missing = { spareTire: 0 };
  assert.equal(condition.repair('tire', missing), false);
  assert.equal(condition.getState().breakdown.type, 'flat_tire');
  const resources = { spareTire: 1 };
  assert.equal(condition.repair('tire', resources), true);
  assert.deepEqual(resources, { spareTire: 0 });
  assert.equal(condition.getState().breakdown, null);
  assert.equal(condition.getState().speedMultiplier, 1);
});

test('smoke and engine failure require repair kit, engine failure also consumes fuel', () => {
  const condition = new VehicleCondition();
  condition.triggerBreakdown('engine_smoke');
  assert.equal(condition.getState().speedMultiplier, 0.65);
  assert.equal(condition.repair('engine', { repairKit: 1 }), true);
  condition.triggerBreakdown('engine_failure');
  assert.equal(condition.getState().speedMultiplier, 0);
  const resources = { repairKit: 1, fuel: 0 };
  assert.equal(condition.repair('engine', resources), false);
  assert.deepEqual(resources, { repairKit: 1, fuel: 0 });
  resources.fuel = 1;
  assert.equal(condition.repair('engine', resources), true);
  assert.deepEqual(resources, { repairKit: 0, fuel: 0 });
});

test('serialization restores deterministic state and future breakdown behavior', () => {
  const original = new VehicleCondition({ seed: 234, config: { failureHazardPerHour: { flatTire: 0.5 } } });
  original.update(1000, { driving: 3 }, { roughness: 2 });
  const restored = new VehicleCondition().restore(original.serialize());
  assert.deepEqual(restored.getState(), original.getState());
  assert.deepEqual(restored.update(3600, { driving: 3 }, { roughness: 2 }), original.update(3600, { driving: 3 }, { roughness: 2 }));
});

test('automatic failures remain rare below wear thresholds', () => {
  const condition = new VehicleCondition({ seed: 12 });
  condition.update(24 * 3600, { driving: 1, work: 1 });
  assert.equal(condition.getState().breakdown, null);
});
