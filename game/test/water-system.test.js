import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterSystem } from '../js/water-system.js';

test('river responds to rain and drought weather gradually', () => {
  const water = new WaterSystem({ config: { riverResponsePerSecond: 1 } });
  const start = water.riverLevel;
  water.update(1, { weather: 'storm' });
  assert.ok(water.riverLevel > start);
  const high = water.riverLevel;
  water.update(1, { weather: 'drought' });
  assert.ok(water.riverLevel < high);
});

test('channel and fueled pump irrigate fields and fuel is consumed explicitly', () => {
  const water = new WaterSystem({ fields: [{ id: 'north', elevation: 0.2 }], config: { pumpFuelPerSecond: 1, pumpWaterPerSecond: 0.1, channelWaterPerSecond: 0.1 } });
  const resources = { wood: 8, metal: 2, fuel: 2, water: 1 };
  assert.equal(water.interact('build-channel', resources).success, true);
  assert.equal(water.interact('build-pump', resources).success, true);
  assert.equal(water.interact('fuel-pump', resources).success, true);
  const before = water.getField('north').water;
  water.update(1, 'clear');
  assert.ok(water.pumpFuel < 10);
  assert.ok(water.getField('north').water > before);
  assert.equal(water.interact('irrigate', 'north', resources).success, true);
  assert.ok(water.getField('north').boost > 0);
  assert.equal(resources.water, 0);
});

test('bank erodes in high water and repair restores health with a cost', () => {
  const water = new WaterSystem({ riverLevel: 0.9, config: { erosionPerSecond: 0.2 } });
  water.update(2, 'storm');
  assert.ok(water.bankHealth < 1);
  const resources = { stone: 2 };
  assert.equal(water.interact('repair-bank', resources).success, true);
  assert.ok(water.bankHealth > 0.8);
  assert.equal(resources.stone, 0);
});

test('pollution harms fish, cleanup improves health, and fishing yields resources', () => {
  const water = new WaterSystem({ fishHealth: 0.8 });
  water.addPollution(0.8);
  water.update(60, 'clear');
  assert.ok(water.fishHealth < 0.8);
  const resources = { cleanup_kit: 1 };
  assert.equal(water.interact('clean-river', resources).success, true);
  assert.ok(water.pollution < 0.8);
  const result = water.interact('fish', resources);
  assert.equal(result.success, true);
  assert.ok(resources.fish >= 0);
});

test('serialize and restore preserve future deterministic simulation state', () => {
  const original = new WaterSystem({ seed: 42, fields: [{ id: 3, elevation: 0.3 }] });
  original.addPollution(0.4);
  original.update(5, { weather: 'rain' });
  const restored = new WaterSystem();
  assert.equal(restored.restore(original.serialize()), true);
  assert.deepEqual(restored.getStatus(), original.getStatus());
  assert.deepEqual(restored.update(7, { weather: 'storm' }), original.update(7, { weather: 'storm' }));
});

test('failed resource transaction does not mutate simulation state', () => {
  const water = new WaterSystem({ fields: [{ id: 1 }] });
  const before = water.getField(1);
  const result = water.interact('irrigate', 1, { water: 0 });
  assert.equal(result.success, false);
  assert.deepEqual(water.getField(1), before);
});
