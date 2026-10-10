import test from 'node:test';
import assert from 'node:assert/strict';
import { makeField, TileState, grow } from './helpers/field.js';
import { WEEDS, BUGS } from '../js/crop-problems.js';

test('all crops naturally mature without spray or fertilizer', () => {
  for (const crop of ['generic', 'corn', 'wheat', 'sunflower', 'pumpkin', 'peas']) {
    const field = makeField(crop);
    grow(field, 25);
    assert.ok(field._states.every(s => s === TileState.READY), crop);
    assert.equal(field._timedCount, 0);
    assert.equal(field.stats.sprayed, 0);
    assert.ok(field._fertilized.every(n => n === 0));
  }
});

test('growing stage stays timed, including old saves that were waiting for spray', () => {
  const field = makeField('wheat');
  grow(field, 5);
  assert.equal(field._states[0], TileState.GROWING);
  assert.equal(field._timedCount, 9);
  const save = field.serialize();
  delete save.problems;
  const restored = makeField();
  restored.restore(save);
  assert.equal(restored._timedCount, 9);
  assert.equal(restored.hasHarvestComing(), true);
  grow(restored, 5);
  assert.equal(restored._states[0], TileState.READY);
  const legacySprayed = makeField('wheat', TileState.SPRAYED);
  grow(legacySprayed, 5);
  assert.equal(legacySprayed._states[0], TileState.READY);
});

test('fertilizer is a boost, not a requirement', () => {
  const untreated = makeField();
  const fertilized = makeField();
  fertilized._fertilized.fill(1);
  grow(untreated, 6);
  grow(fertilized, 6);
  assert.equal(untreated._states[0], TileState.GROWING);
  assert.equal(fertilized._states[0], TileState.READY);
  grow(untreated, 4);
  assert.equal(untreated._states[0], TileState.READY);
});

test('weeds and bugs slow growth without blocking untreated harvest', () => {
  const healthy = makeField();
  const affected = makeField();
  for (let i = 0; i < affected.count; i++) {
    affected._problems.infest(i, WEEDS);
    affected._problems.infest(i, BUGS);
  }
  grow(healthy, 10);
  grow(affected, 10);
  assert.equal(healthy._states[0], TileState.READY);
  assert.notEqual(affected._states[0], TileState.READY);
  grow(affected, 15);
  assert.ok(affected._states.every(s => s === TileState.READY));
  assert.equal(affected.applyEffect(1, 1, 4, 'harvest', 0).produce.harvest_wheat, 3);
  assert.equal(affected._problems.flags[4], 0);
});

test('spray treats only affected tiles and never resets growth or ripe crops', () => {
  const field = makeField('wheat', TileState.GROWING);
  field._timers.fill(3);
  assert.equal(field.applyEffect(1, 1, 4, 'spray', 0, 'generic', 200).affected, 0);
  field._problems.infest(4, BUGS);
  field._problems.infest(4, WEEDS);
  assert.equal(field.applyEffect(1, 1, 4, 'spray', 0, 'generic', 200).affected, 1);
  assert.equal(field._timers[4], 3);
  assert.equal(field._states[4], TileState.GROWING);
  assert.equal(field._timedCount, 9);
  assert.equal(field._problems.flags[4], 0);
  assert.equal(field._problems.protection[4], 45);
  grow(field, 2);
  assert.equal(field._states[4], TileState.READY);
  field._problems.protection[4] = 0;
  field._problems.infest(4, BUGS);
  assert.equal(field.applyEffect(1, 1, 4, 'spray', 0, 'generic', 1).affected, 1);
  assert.equal(field._states[4], TileState.READY);
  assert.equal(field._timedCount, 0);
});

test('tilling and flood damage remove old problems and adjust growing timers', () => {
  const field = makeField('wheat', TileState.GROWING);
  field._problems.infest(0, BUGS);
  assert.equal(field.damageCrops(1), 1);
  assert.equal(field._timedCount, 8);
  assert.equal(field._problems.flags[0], 0);
  assert.equal(field._states[0], TileState.TILLED);
});

test('crop save round trip preserves infestations, protection, and future growth', () => {
  const original = makeField();
  original._problems.infest(4, BUGS);
  original._problems.infest(5, WEEDS);
  original._problems.spray(5);
  grow(original, 2);
  const restored = makeField();
  assert.equal(restored.restore(original.serialize()), true);
  assert.deepEqual(restored._problems.serialize(), original._problems.serialize());
  grow(original, 20);
  grow(restored, 20);
  assert.deepEqual(restored.serialize(), original.serialize());
});
