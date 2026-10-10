import test from 'node:test';
import assert from 'node:assert/strict';
import { RiverCrossings } from '../js/river-crossings.js';

test('ford closes during high water while bridge and ferry remain available', () => {
  const river = new RiverCrossings({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } });
  const ford = river.crossings.find(c => c.type === 'ford');
  const bridge = river.crossings.find(c => c.type === 'bridge');
  assert.equal(ford.type, 'ford');
  assert.equal(river.isPassable(ford.x, ford.z, 'foot', 0.9), false);
  assert.equal(river.isPassable(bridge.x, bridge.z, 'tractor', 0.9), true);
  assert.equal(river.isPassable(0, 0, 'foot', 0.9), true);
  assert.equal(river.isPassable(ford.x, ford.z, 'foot', 0.2), true);
});

test('bridge damage blocks heavy vehicles, repair costs are atomic', () => {
  const river = new RiverCrossings();
  const bridge = river.crossings.find(c => c.type === 'bridge');
  river.damageBridge(0.8);
  assert.equal(river.isPassable(bridge.x, bridge.z, 'tractor', 0), false);
  const poor = { wood: 1 };
  assert.equal(river.repairBridge(poor).reason, 'insufficient-resources');
  assert.deepEqual(poor, { wood: 1 });
  const supplies = { wood: 2 };
  assert.equal(river.repairBridge(supplies).success, true);
  assert.equal(supplies.wood, 0);
});

test('serialize and restore preserve crossing state and nearest query', () => {
  const river = new RiverCrossings({ riverX: 3 });
  river.damageBridge(0.5);
  const restored = new RiverCrossings();
  assert.equal(restored.restore(river.serialize()), true);
  assert.deepEqual(restored.serialize(), river.serialize());
  assert.equal(restored.nearestCrossing(3, 0).type, 'ferry');
});

test('bridge construction can restore a fully destroyed bridge', () => {
  const river = new RiverCrossings();
  river.damageBridge(1);
  const resources = { wood: 8, stone: 4 };
  assert.equal(river.buildBridge(resources).success, true);
  assert.deepEqual(resources, { wood: 0, stone: 0 });
  assert.equal(river.isPassable(river.crossings.find(c => c.type === 'bridge').x, river.crossings.find(c => c.type === 'bridge').z, 'wagon', 1), true);
});
