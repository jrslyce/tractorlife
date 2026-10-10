import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSION_COST, expansionCenter, expansionPlotOccupied, expansionPurchaseState } from '../js/farm-expansion.js';

test('expansion plot is fixed inside each assigned farm footprint', () => {
  assert.deepEqual(expansionCenter(0), { x: 127.5, z: -42.5 });
  assert.deepEqual(expansionCenter(9), { x: 1747.5, z: -42.5 });
  assert.equal(expansionCenter(10), null);
});

test('structures overlapping the marked expansion area block purchase', () => {
  assert.equal(expansionPlotOccupied([{ x: 127.5, z: -42.5 }], 0), true);
  assert.equal(expansionPlotOccupied([{ x: 30, z: -42.5 }], 0), false);
  assert.equal(expansionPlotOccupied([{ x: 307.5, z: -42.5 }], 1), true);
});

test('expansion charges once and reports clear purchase failures', () => {
  assert.equal(EXPANSION_COST, 250);
  assert.deepEqual(expansionPurchaseState({ expanded: false, balance: 500, occupied: false }),
    { ok: true, cost: 250, balance: 250 });
  assert.equal(expansionPurchaseState({ expanded: true, balance: 500, occupied: false }).reason, 'already-expanded');
  assert.equal(expansionPurchaseState({ expanded: false, balance: 500, occupied: true }).reason, 'occupied');
  assert.equal(expansionPurchaseState({ expanded: false, balance: 249, occupied: false }).reason, 'insufficient-funds');
});
