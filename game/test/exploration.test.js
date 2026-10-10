import test from 'node:test';
import assert from 'node:assert/strict';
import { Exploration } from '../js/exploration.js';

test('landmarks and cache locations are deterministic for a seed', () => {
  const a = Exploration({ seed: 42 }), b = Exploration({ seed: 42 });
  assert.deepEqual(a.list(), b.list());
  assert.ok(a.list().some(item => item.goal === 'find the old quarry'));
  assert.ok(a.list().some(item => item.goal === 'scout the ridge'));
  for (const item of a.list()) {
    assert.ok(item.x >= -10 && item.x <= 1780);
    assert.ok(item.z >= -78 && item.z <= 80);
  }
});

test('distance discovery emits landmark once and collects cache through inventory semantics', () => {
  const explorer = Exploration({ seed: 7 });
  const inventory = { rewards: [], addItem(itemId, qty) { this.rewards.push({ itemId, qty }); return { ok: true }; } };
  const quarry = explorer.list().find(item => item.id === 'old-quarry');
  assert.deepEqual(explorer.update(quarry.x + quarry.radius + 1, quarry.z, inventory), []);
  assert.equal(explorer.update(quarry.x, quarry.z, inventory)[0].goal, 'find the old quarry');
  assert.deepEqual(explorer.update(quarry.x, quarry.z, inventory), []);
  const cache = explorer.list().find(item => item.type === 'cache');
  inventory.addItem = () => ({ ok: false, error: 'inventory full' });
  assert.deepEqual(explorer.update(cache.x, cache.z, inventory), []);
  inventory.addItem = (itemId, qty) => { inventory.rewards.push({ itemId, qty }); return { ok: true }; };
  const cacheEvent = explorer.update(cache.x, cache.z, inventory)[0];
  assert.ok(cacheEvent.reward.qty > 0);
  assert.deepEqual(inventory.rewards.at(-1), cacheEvent.reward);
});

test('state safely round-trips and malformed restores do not partially mutate', () => {
  const original = Exploration({ seed: 12 }), location = original.list()[0];
  original.update(location.x, location.z, { addItem: () => ({ ok: true }) });
  const saved = original.serialize(), restored = Exploration({ seed: 12 });
  assert.equal(restored.restore(saved), true);
  assert.deepEqual(restored.list(), original.list());
  assert.equal(restored.restore({ ...saved, discovered: ['old-quarry', 'bogus'] }), false);
  assert.deepEqual(restored.list(), original.list());
  assert.equal(Exploration({ seed: 13 }).restore(saved), false);
  assert.equal(restored.update(NaN, 0, {}).length, 0);
});
