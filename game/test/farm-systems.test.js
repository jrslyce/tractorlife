import test from 'node:test';
import assert from 'node:assert/strict';
import { FarmSystems } from '../js/farm-systems.js';

test('river crossing lanes block unsafe banks but open route alternatives', () => {
  const farm = new FarmSystems({ farmSlot: 0 });
  const blocked = farm.isMovementBlocked({ x: 90, z: -60 }, { x: 90, z: -63 }, 'foot', 0.35);
  assert.equal(blocked, true);
  assert.equal(farm.isMovementBlocked({ x: -12, z: -60 }, { x: -12, z: -63 }, 'tractor', 0.35), false);
  assert.equal(farm.isMovementBlocked({ x: -12, z: -60 }, { x: -12, z: -63 }, 'tractor', 0.95), true);
  assert.equal(farm.isMovementBlocked({ x: 12, z: -60 }, { x: 12, z: -63 }, 'tractor', 0.95), false);
});

test('woodland blockers stop vehicles and a fallen branch can puncture a tire', () => {
  const farm = new FarmSystems({ farmSlot: 0 });
  const tractor = farm.setVehicleCondition('tractor');
  farm.woodland.debris.push({ id: 999, x: 70, z: 55, kind: 'branch', radius: 0.35 });
  assert.equal(farm.isMovementBlocked({ x: 70, z: 52 }, { x: 70, z: 55 }, 'tractor', 0.35), true);
  assert.equal(tractor.getState().breakdown.type, 'flat_tire');
});

test('systems state round-trips per farm including vehicles and job board', () => {
  const farm = new FarmSystems({ farmSlot: 3 });
  farm.setVehicleCondition('tractor').triggerBreakdown('engine_smoke');
  farm.woodland.debris.push({ id: 100, x: 600, z: 55, kind: 'branch', radius: 0.35 });
  farm.requests.update(0, { day: 0, branches: 1 });
  const saved = farm.serialize();
  const restored = new FarmSystems({ farmSlot: 3 });
  assert.equal(restored.restore(saved), true);
  assert.equal(restored.getVehicleCondition('tractor').getState().breakdown.type, 'engine_smoke');
  assert.equal(restored.woodland.debris.length, 1);
  assert.deepEqual(restored.getRequests(), farm.getRequests());
  assert.equal(restored.restore({ version: 0 }), false);
});

test('new farms and pre-breeding starter saves can reach a healthy matching pair', () => {
  const farm = new FarmSystems({ farmSlot: 0 });
  const feedAndWater = stock => {
    for (const animal of stock.animals) {
      stock.interact('feed', animal.id, { feed: 1 });
      stock.interact('water', animal.id, { water: 1 });
    }
    assert.equal(stock.getBreedCandidate(), 1);
  };
  feedAndWater(farm.livestock);
  const legacy = farm.serialize();
  legacy.livestock.version = 1;
  legacy.livestock.animals = legacy.livestock.animals.slice(0, 2);
  const restored = new FarmSystems({ farmSlot: 0 });
  assert.equal(restored.restore(legacy), true);
  assert.equal(restored.livestock.animals.length, 3);
  feedAndWater(restored.livestock);
  const migrated = restored.serialize();
  assert.equal(restored.restore(migrated), true);
  assert.equal(restored.livestock.animals.length, 3);
});
