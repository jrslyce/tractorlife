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

test('blocked bridge and vehicle repairs explain missing supplies in player language', () => {
  const farm = new FarmSystems({ farmSlot: 0 });
  const bridge = farm.interact({ x: 0, z: -59 }, 'foot', {});
  assert.equal(bridge.reason, 'insufficient-resources');
  assert.deepEqual(bridge.costs, { wood: 8, stone: 4 });
  assert.match(bridge.message, /8 wood and 4 stone/i);
  assert.match(bridge.message, /shop/i);

  farm.setVehicleCondition('tractor').triggerBreakdown('engine_failure');
  farm.setVehiclePosition('tractor', { x: 0, y: 0, z: -66 });
  const repair = farm.interact({ x: 0, z: -66 }, 'foot', {});
  assert.equal(repair.reason, 'insufficient-resources');
  assert.match(repair.message, /repair kit and 1 fuel/i);
});

test('Simple Farm pauses advanced simulation without losing state or recovery actions', () => {
  const emitted = [];
  const farm = new FarmSystems({ farmSlot: 0, onEvent: event => emitted.push(event) });
  farm.setVehicleCondition('tractor').triggerBreakdown('engine_smoke');
  farm.setVehiclePosition('tractor', { x: 0, y: 0, z: -66 });
  const before = farm.serialize();
  farm.setAdvancedSystemsEnabled(false);
  farm.update(86400, { day: 40, weather: 'storm' }, { tractor: { driving: 1, work: 1 } });
  assert.deepEqual(farm.serialize(), before);
  assert.deepEqual(emitted, []);
  assert.equal(farm.getPrompt({ x: -4, z: -28 }, 'foot'), null);
  assert.equal(farm.interact({ x: -4, z: -28 }, 'foot', {}).reason, 'systems-paused');
  assert.deepEqual(farm.getHarvestTargets(), []);

  const repairPrompt = farm.getPrompt({ x: 0, z: -66 }, 'foot');
  assert.equal(repairPrompt.action, 'repair-vehicle');
  const repair = farm.interact({ x: 0, z: -66 }, 'foot', { repairKit: 1 });
  assert.equal(repair.success, true);
  assert.equal(farm.getVehicleCondition('tractor').getState().breakdown, null);
  assert.deepEqual(farm.requests.serialize(), before.requests);
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
