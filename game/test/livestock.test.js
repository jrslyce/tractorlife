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

test('healthy same-species animals can breed once after daily care and offspring persists', () => {
  const stock = new Livestock({ animals: [
    { id: 1, kind: 'cow', welfare: 0.9, feedToday: true, waterToday: true },
    { id: 2, kind: 'cow', welfare: 0.85, feedToday: true, waterToday: true },
    { id: 3, kind: 'chicken', welfare: 1, feedToday: true, waterToday: true }
  ] });
  const resources = { feed: 3 };
  assert.equal(stock.getBreedCandidate(), 1);
  const result = stock.interact('breed', 1, resources);
  assert.equal(result.success, true);
  assert.equal(resources.feed, 0);
  assert.deepEqual(stock.animals[3], { id: 4, kind: 'cow', welfare: 0.8, fed: false, watered: false,
    escaped: false, feedToday: false, waterToday: false, bredDay: 0 });
  const restored = new Livestock();
  assert.equal(restored.restore(stock.serialize()), true);
  assert.deepEqual(restored.getStatus(), stock.getStatus());
  assert.equal(stock.interact('breed', 1, resources).success, false);
  resources.feed = 30;
  assert.equal(stock.interact('breed', 1, resources).reason, 'already-bred-today');
  assert.equal(restored.interact('breed', 2, resources).reason, 'already-bred-today');
  assert.equal(stock.getBreedCandidate(), null);
  stock.update(stock.config.dayLength);
  for (const id of [1, 2]) {
    stock.interact('feed', id, resources);
    stock.interact('water', id, { water: 1 });
  }
  assert.equal(stock.interact('breed', 1, resources).success, true);
});

test('breeding rejects mismatched or uncared animals and herd capacity atomically', () => {
  const pairs = new Livestock({ animals: [
    { id: 1, kind: 'cow', welfare: 1, feedToday: true, waterToday: true },
    { id: 2, kind: 'chicken', welfare: 1, feedToday: true, waterToday: true }
  ] });
  const resources = { feed: 10 };
  const before = pairs.serialize();
  assert.equal(pairs.interact('breed', 1, resources).reason, 'breeding-needs-healthy-cared-pair');
  assert.deepEqual(pairs.serialize(), before);
  assert.deepEqual(resources, { feed: 10 });
  const full = new Livestock({ config: { maxAnimals: 2 }, animals: [
    { id: 1, kind: 'cow', welfare: 1, feedToday: true, waterToday: true },
    { id: 2, kind: 'cow', welfare: 1, feedToday: true, waterToday: true }
  ] });
  assert.equal(full.interact('breed', 1, resources).reason, 'herd-at-capacity');
  assert.deepEqual(resources, { feed: 10 });
});
