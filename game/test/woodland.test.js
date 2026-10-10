import test from 'node:test';
import assert from 'node:assert/strict';
import { Woodland } from '../js/woodland.js';

function empty(options = {}) {
  return new Woodland({ seed: 7, config: { initialTrees: 0, initialOrchards: 0, stormDebrisPerSecond: 1, ...options.config }, ...options });
}

test('seeded woodland growth is deterministic and saplings become blockers', () => {
  const first = new Woodland({ seed: 42 });
  const second = new Woodland({ seed: 42 });
  assert.deepEqual(first.serialize(), second.serialize());
  const wood = empty({ config: { saplingSeconds: 5, growthSeconds: 10 } });
  const resources = { sapling: 1 };
  const planted = wood.interact('plant', { x: 3, z: 4 }, resources);
  assert.equal(planted.success, true);
  assert.equal(resources.sapling, 0);
  wood.update(5);
  assert.equal(wood.trees.some(t => t.id === planted.target.id), true);
  assert.equal(wood.queryObstacles(3, 4).length, 1);
});

test('storm creates fallen branches which clear into firewood', () => {
  const wood = empty();
  const events = wood.update(2, 'storm');
  assert.ok(events.some(e => e.type === 'branch-fallen'));
  const branch = wood.debris[0];
  assert.equal(wood.queryObstacles(branch.x, branch.z).some(o => o.kind === 'branch'), true);
  const resources = {};
  assert.equal(wood.interact('clear-branch', branch.id, resources).success, true);
  assert.equal(resources.firewood, 1);
  assert.equal(wood.debris.length, 1);
});

test('orchard water/prune/harvest apply costs and rewards transactionally', () => {
  const wood = empty({ config: { fruitSeconds: 10 } });
  const orchard = { id: 1, x: 0, z: 0, age: 0, watered: false, pruned: false, fruit: false, radius: 0.7 };
  wood.orchards.push(orchard);
  const none = {};
  assert.equal(wood.interact('water', 1, none).success, false);
  assert.deepEqual(none, {});
  const supplies = { water: 1, toolUse: 1 };
  assert.equal(wood.interact('water', 1, supplies).success, true);
  assert.equal(supplies.water, 0);
  assert.equal(wood.interact('prune', 1, supplies).success, true);
  assert.equal(supplies.toolUse, 0);
  wood.update(10);
  assert.equal(orchard.fruit, true);
  const harvest = wood.interact('harvest', 1, supplies);
  assert.equal(harvest.success, true);
  assert.equal(supplies.fruit, 1);
});

test('trees and stumps are queryable circular blockers; clearing trees reduces wildlife', () => {
  const wood = empty({ config: { wildlifeDeclinePerTree: 0.2 } });
  wood.trees.push({ id: 21, x: 5, z: -2, stage: 'mature', radius: 1 });
  const before = wood.queryWildlife().population;
  assert.equal(wood.queryObstacles(6.5, -2).length, 0);
  assert.equal(wood.queryObstacles(5.5, -2, 0.6).length, 1);
  assert.equal(wood.interact('clear-tree', 21).success, true);
  assert.ok(wood.queryWildlife().population < before);
  assert.equal(wood.queryObstacles(5, -2)[0].kind, 'stump');
  const restored = new Woodland();
  assert.equal(restored.restore(wood.serialize()), true);
  assert.deepEqual(restored.serialize(), wood.serialize());
});

test('wildlife nibbles ripe fruit and deterministic events can be queried', () => {
  const wood = empty({ config: { initialWildlife: 1, maxWildlife: 1 } });
  wood.orchards.push({ id: 4, x: 0, z: 0, age: 0, fruit: true, radius: 0.7 });
  wood._random = () => 0; // force the stochastic event without coupling to RNG internals
  const events = wood.update(120);
  assert.ok(events.some(e => e.type === 'crop-nibbled'));
  assert.equal(wood.getCropNibbleEvents().length, 1);
});
