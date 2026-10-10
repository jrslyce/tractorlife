import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleUpgrades } from '../js/vehicle-upgrades.js';

test('vehicle upgrades charge once per tier and apply only to the selected machine', () => {
  const upgrades = new VehicleUpgrades();
  assert.equal(upgrades.buy('tractor', 'engine', 100).reason, 'insufficient-funds');
  const first = upgrades.buy('tractor', 'engine', 700);
  assert.deepEqual(first, { ok: true, cost: 650, money: 50, level: 1, vehicle: 'tractor', upgrade: 'engine' });
  assert.deepEqual(upgrades.effects('tractor'), { speedMultiplier: 1.08, steeringMultiplier: 1 });
  assert.deepEqual(upgrades.effects('combine'), { speedMultiplier: 1, steeringMultiplier: 1 });
  assert.equal(upgrades.buy('tractor', 'engine', 1200).cost, 1100);
  assert.equal(upgrades.buy('tractor', 'engine', 1200).reason, 'max-level');
});

test('upgrade state round-trips and malformed state is rejected atomically', () => {
  const upgrades = new VehicleUpgrades();
  upgrades.buy('truck', 'tires', 500);
  const saved = upgrades.serialize();
  const restored = new VehicleUpgrades();
  assert.equal(restored.restore(saved), true);
  assert.deepEqual(restored.effects('truck'), { speedMultiplier: 1, steeringMultiplier: 1.12 });
  assert.equal(restored.restore({ version: 1, levels: { truck: { engine: 99 } } }), false);
  assert.deepEqual(restored.serialize(), saved);
});
