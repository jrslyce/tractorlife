import test from 'node:test';
import assert from 'node:assert/strict';
import { Livestock } from '../js/livestock.js';

test('daily care has explicit transactional costs, rewards, and welfare', () => {
  const stock = new Livestock({ config: { dayLength: 10, initialAnimals: [{ id: 'bessie' }] } });
  const resources = { feed: 1, water: 1 };
  assert.equal(stock.interact('feed', 'bessie', resources).success, true);
  assert.equal(resources.produce, 1);
  assert.equal(stock.interact('water', 'bessie', resources).success, true);
  assert.deepEqual(stock.queryCareNeeds(), []);
  stock.update(10);
  assert.equal(stock.day, 1);
  assert.equal(stock.animals[0].welfare, 1);
});

test('missed daily care reduces welfare and exposes care jobs', () => {
  const stock = new Livestock({ config: { dayLength: 5, initialAnimals: [{ id: 2 }], escapeBaseChance: 0 } });
  stock.update(5, 'clear');
  assert.ok(Math.abs(stock.animals[0].welfare - 0.82) < 1e-9);
  assert.deepEqual(stock.queryCareNeeds(), [{ animalId: 2, feed: true, water: true }]);
  assert.equal(stock.jobs.length, 2);
});

test('low fences and storms can deterministically cause escapes; herd and repair resolve jobs', () => {
  const stock = new Livestock({ seed: 9, fenceCondition: 0, config: { dayLength: 1, escapeBaseChance: 1, initialAnimals: [{ id: 'cow' }] } });
  stock.update(1, 'storm');
  assert.equal(stock.queryEscaped()[0].id, 'cow');
  const resources = { wood: 2 };
  assert.equal(stock.interact('herd', 'cow', resources).success, true);
  assert.equal(stock.queryEscaped().length, 0);
  assert.equal(stock.interact('repair-fence', resources).success, true);
  assert.ok(stock.fenceCondition > 0);
});

test('serialize and restore preserve deterministic future state', () => {
  const a = new Livestock({ seed: 42, config: { dayLength: 7 }, animals: [{ id: 4 }] });
  a.update(3, 'clear');
  const b = new Livestock();
  assert.equal(b.restore(a.serialize()), true);
  assert.deepEqual(b.getStatus(), a.getStatus());
  assert.deepEqual(b.update(10, 'storm'), a.update(10, 'storm'));
});

test('failed interactions do not mutate resources or animals', () => {
  const stock = new Livestock({ animals: [{ id: 1 }] });
  const resources = { feed: 0 };
  const before = stock.serialize();
  assert.equal(stock.interact('feed', 1, resources).success, false);
  assert.deepEqual(stock.serialize(), before);
  assert.deepEqual(resources, { feed: 0 });
});
