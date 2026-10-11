import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleFuel, FUEL_CAPACITY, FUEL_PER_CAN, FUEL_PER_DRIVING_SECOND } from '../js/vehicle-fuel.js';

test('fuel is consumed only by valid held throttle and is independent per machine', () => {
  const tanks = new VehicleFuel();
  assert.equal(tanks.consume('tractor', 10, 0.5), FUEL_CAPACITY - 5 * FUEL_PER_DRIVING_SECOND);
  assert.equal(tanks.level('combine'), FUEL_CAPACITY);
  assert.equal(tanks.consume('tractor', -1, 1), tanks.level('tractor'));
  tanks.consume('truck', 10000, 1);
  assert.equal(tanks.level('truck'), 0);
  assert.equal(tanks.consume('truck', 1, 1), 0);
});

test('a can refills a partial tank without overfilling and state restores atomically', () => {
  const tanks = new VehicleFuel();
  assert.equal(tanks.refill('tractor'), false);
  tanks.consume('tractor', 1000, 1);
  assert.equal(tanks.refill('tractor'), true);
  assert.equal(tanks.level('tractor'), Math.min(FUEL_CAPACITY, FUEL_CAPACITY - 1000 * FUEL_PER_DRIVING_SECOND + FUEL_PER_CAN));
  const saved = tanks.serialize();
  const restored = new VehicleFuel();
  assert.equal(restored.restore(saved), true);
  assert.equal(restored.level('tractor'), tanks.level('tractor'));
  assert.equal(restored.restore({ version: 1, tanks: { tractor: -1, combine: 100, truck: 100 } }), false);
  assert.deepEqual(restored.serialize(), saved);
});
