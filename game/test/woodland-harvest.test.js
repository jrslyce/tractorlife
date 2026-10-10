import test from 'node:test';
import assert from 'node:assert/strict';
import { FarmSystems } from '../js/farm-systems.js';

function inventory({ full = false, rejects = false } = {}) {
  return {
    wood: 0, calls: 0,
    canAdd(item, quantity) { assert.equal(item, 'wood'); assert.equal(quantity, 3); return !full; },
    addItem(item, quantity) {
      assert.equal(item, 'wood'); assert.equal(quantity, 3); this.calls++;
      if (rejects) return { ok: false };
      this.wood += quantity; return { ok: true };
    },
  };
}

test('harvest targets use world coordinates, stable IDs and exclude orchard, sapling and stump', () => {
  const farm = new FarmSystems({ farmSlot: 2 });
  farm.woodland.trees[0].stage = 'stump';
  farm.woodland.trees[1].stage = 'young';
  const targets = farm.getHarvestTargets();
  assert.equal(targets.length, 4);
  assert.ok(targets.every(t => t.x > 360 && t.kind === 'tree' && t.material === 'wood'));
  assert.deepEqual(farm.getHarvestTargets(), targets);
  targets[0].x = -100;
  assert.notEqual(farm.getHarvestTargets()[0].x, -100);
});

test('full inventory or rejected insertion leaves tree, wildlife and save state unchanged', () => {
  for (const options of [{ full: true }, { rejects: true }]) {
    const farm = new FarmSystems();
    const target = farm.getHarvestTargets()[0];
    const before = farm.serialize();
    const bag = inventory(options);
    const result = farm.harvestTree(target.id, bag);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'inventory-full');
    assert.deepEqual(farm.serialize(), before);
    assert.equal(bag.wood, 0);
    assert.equal(bag.calls, options.full ? 0 : 1);
  }
});

test('completed chop awards exactly three wood once and persists the existing stump lifecycle', () => {
  const emitted = [];
  const farm = new FarmSystems({ onEvent: event => emitted.push(event) });
  const target = farm.getHarvestTargets()[0];
  const bag = inventory();
  const before = farm.woodland.wildlife;
  const result = farm.harvestTree(target.id, bag, target.revision);
  assert.equal(result.success, true);
  assert.deepEqual(result.rewards, { wood: 3 });
  assert.equal(bag.wood, 3);
  assert.ok(farm.woodland.wildlife < before);
  assert.equal(emitted.length, 1);
  const stump = farm.woodland.trees.find(t => t.x === target.x && t.z === target.z);
  assert.equal(stump.stage, 'stump');
  assert.notEqual(stump.id, target.id);
  assert.equal(farm.harvestTree(target.id, bag).success, false);
  assert.equal(farm.harvestTree(stump.id, bag).success, false);
  assert.equal(bag.calls, 1);
  const restored = new FarmSystems();
  assert.equal(restored.restore(farm.serialize()), true);
  assert.deepEqual(restored.woodland.serialize(), farm.woodland.serialize());
  assert.equal(restored.woodland.interact('clear-stump', stump.id, { toolUse: 1 }).success, true);
});

test('young trees harvest; changed revision rejects; legacy farm action cannot bypass hold', () => {
  const farm = new FarmSystems();
  const tree = farm.woodland.trees[0];
  tree.stage = 'young';
  const bag = inventory();
  const before = farm.serialize();
  assert.equal(farm.harvestTree(tree.id, bag, 'mature').reason, 'target-changed');
  const oldAction = farm.interact(tree, 'foot', {});
  assert.equal(oldAction.success, false);
  assert.match(oldAction.message, /Hold Chop/);
  assert.deepEqual(farm.serialize(), before);
  assert.equal(farm.harvestTree(tree.id, bag, 'young').success, true);
  assert.equal(bag.wood, 3);
});

test('branches still give firewood and orchards still give fruit', () => {
  const farm = new FarmSystems();
  const resources = {};
  farm.woodland.debris.push({ id: 999, x: 1000, z: 1000, kind: 'branch' });
  assert.equal(farm.interact({ x: 1000, z: 1000 }, 'foot', resources).success, true);
  assert.equal(resources.firewood, 1);
  const orchard = farm.woodland.orchards[0];
  assert.equal(farm.interact(orchard, 'foot', resources).success, true);
  assert.equal(resources.fruit, 1);
});
