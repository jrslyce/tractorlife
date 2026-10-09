import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GRAIN_VALUES, quoteGrain, acceptGrainSale, transferBinToWagon } from '../js/grain-commerce.js';
import { ITEM_BY_ID } from '../js/items.js';

// Exercise real Field gameplay methods without allocating a WebGL scene.
const source = await readFile(new URL('../js/field.js', import.meta.url), 'utf8');
const { Field, TileState } = await import('data:text/javascript;base64,' +
  Buffer.from(source.replace("import * as THREE from 'three';", 'const THREE = {};')).toString('base64'));
function readyField(crop = 'generic', count = 4) {
  const field = Object.create(Field.prototype);
  Object.assign(field, { count, tile: 2, _tx: new Array(count).fill(0),
    _tz: Array.from({ length: count }, (_, i) => i * 2),
    _states: new Array(count).fill(TileState.READY), _cropTypes: new Array(count).fill(crop),
    _timers: new Array(count).fill(0), _fertilized: new Array(count).fill(0), _timedCount: 0,
    _tally: { harvested: 0 }, _refresh() {} });
  return field;
}
function hold(cargo = new Array(12).fill(null)) {
  return { cargo, add(itemId, qty) {
    const stack = this.cargo.find(s => s && s.itemId === itemId);
    if (stack) { stack.qty += qty; return { ok: true }; }
    const i = this.cargo.indexOf(null);
    if (i < 0) return { ok: false };
    this.cargo[i] = { itemId, qty };
    return { ok: true };
  } };
}

test('legacy/default ready crops fill the bin instead of paying instant money', () => {
  const field = readyField();
  const result = field.applyEffect(0, 0, 20, 'harvest', 0, 'generic', 200);
  assert.deepEqual(result, { affected: 4, money: 0, produce: { harvest_grain: 4 } });
  assert.equal(field.applyEffect(0, 0, 20, 'harvest', 0).affected, 0);
});

test('all machine crops yield saleable items and hand crops are left alone', () => {
  for (const crop of ['corn', 'wheat', 'sunflower']) {
    const result = readyField(crop).applyEffect(0, 0, 20, 'harvest', 0);
    assert.equal(result.produce['harvest_' + crop], 4);
    assert.equal(result.money, 0);
  }
  for (const crop of ['pumpkin', 'peas']) {
    assert.equal(readyField(crop).applyEffect(0, 0, 20, 'harvest', 0).affected, 0);
  }
});

test('full bin leaves ready crops standing and remaining capacity limits work', () => {
  const field = readyField('corn');
  assert.equal(field.applyEffect(0, 0, 20, 'harvest', 0, 'generic', 0).affected, 0);
  assert.equal(field.applyEffect(0, 0, 20, 'harvest', 0, 'generic', 1).affected, 1);
  assert.equal(field._states.filter(s => s === TileState.READY).length, 3);
});

test('implements without consumable supplies still work with an omitted limit', () => {
  const field = readyField();
  field._states.fill(TileState.UNTILLED);
  field._tally.tilled = 0;
  assert.equal(field.applyEffect(0, 0, 20, 'till', 0, 'generic', undefined).affected, 4);
  assert.equal(field._tally.tilled, 4);
});

test('harvest → bin → wagon → accepted sale pays once and leaves supplies intact', () => {
  const bin = readyField().applyEffect(0, 0, 20, 'harvest', 0).produce;
  const wagon = hold();
  wagon.add('corn_seeds', 20);
  assert.deepEqual(transferBinToWagon(bin, wagon), { ok: true, quantity: 4 });
  assert.deepEqual(bin, {});
  const quote = quoteGrain(wagon.cargo, ITEM_BY_ID);
  assert.equal(quote.value, 40);
  let money = 100;
  // Preview/cancel does not consume cargo or change the balance.
  assert.equal(wagon.cargo[1].qty, 4);
  const result = acceptGrainSale(wagon, quote, ITEM_BY_ID, true);
  money += result.value;
  assert.equal(money, 140);
  assert.deepEqual(wagon.cargo[0], { itemId: 'corn_seeds', qty: 20 });
  assert.equal(wagon.cargo[1], null);
  assert.equal(acceptGrainSale(wagon, quote, ITEM_BY_ID, true).ok, false);
});

test('mixed harvest gets itemized store prices; stale or remote offers cannot sell', () => {
  const wagon = hold(Object.keys(GRAIN_VALUES).map(itemId => ({ itemId, qty: 2 })));
  const quote = quoteGrain(wagon.cargo, ITEM_BY_ID);
  assert.equal(quote.quantity, 12);
  assert.equal(quote.value, 102);
  assert.equal(acceptGrainSale(wagon, quote, ITEM_BY_ID, false).ok, false);
  wagon.cargo[0].qty++;
  assert.equal(acceptGrainSale(wagon, quote, ITEM_BY_ID, true).ok, false);
  assert.equal(wagon.cargo[0].qty, 3);
});

test('full wagon cannot lose/duplicate a mixed bin; existing grain stacks can merge', () => {
  const wagon = hold([{ itemId: 'corn_seeds', qty: 10 }]);
  const bin = { harvest_grain: 5, harvest_corn: 8 };
  assert.equal(transferBinToWagon(bin, wagon).ok, false);
  assert.deepEqual(bin, { harvest_grain: 5, harvest_corn: 8 });
  const grainWagon = hold([{ itemId: 'harvest_grain', qty: 10 }]);
  const grainBin = { harvest_grain: 5 };
  assert.equal(transferBinToWagon(grainBin, grainWagon).ok, true);
  assert.equal(grainWagon.cargo[0].qty, 15);
  assert.equal(transferBinToWagon(grainBin, grainWagon).quantity, 0);
});
