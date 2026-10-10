import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ITEM_BY_ID } from '../js/items.js';
import { getBreakRule } from '../js/resource-rules.js';

// Run the actual inventory logic without a WebGL renderer or browser importmap.
const source = await readFile(new URL('../js/inventory.js', import.meta.url), 'utf8');
const { Inventory } = await import('data:text/javascript;base64,' + Buffer.from(
  source.replace("import * as THREE from 'three';", 'const THREE = {};')
    .replace("'./items.js'", JSON.stringify(new URL('../js/items.js', import.meta.url).href))
).toString('base64'));

test('collection rejects invalid items and quantities without changing slots', () => {
  const inventory = new Inventory();
  const original = inventory.serialize();
  for (const id of ['missing', 'toString', '__proto__', '']) {
    assert.equal(inventory.addItem(id, 1).ok, false);
    assert.equal(inventory.canAdd(id), false);
  }
  for (const qty of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(inventory.addItem('wood', qty).ok, false);
    assert.equal(inventory.canAdd('wood', qty), false);
  }
  assert.deepEqual(inventory.serialize(), original);
});

test('full hotbar accepts existing materials but rejects a new resource atomically', () => {
  const inventory = new Inventory();
  const ids = ['wood', 'stone', 'axe', 'shovel', 'pickaxe', 'corn_seeds', 'wheat_seeds', 'gravel', 'brick'];
  for (const id of ids) assert.equal(inventory.addItem(id, 1).ok, true);
  assert.equal(inventory.canAdd('wood', 3), true);
  assert.equal(inventory.addItem('wood', 3).ok, true);
  assert.equal(inventory.getCount('wood'), 4);
  const original = inventory.serialize();
  assert.equal(inventory.canAdd('dirt'), false);
  assert.deepEqual(inventory.addItem('dirt', 1), { ok: false, error: 'inventory full' });
  assert.deepEqual(inventory.serialize(), original);
});

test('collection refreshes a selected empty slot and buy remains compatible', () => {
  const inventory = new Inventory();
  inventory.selectSlot(0);
  let refreshes = 0;
  inventory._updateHeldItem = () => refreshes++;
  assert.equal(inventory.addItem('wood', 3).ok, true);
  assert.equal(refreshes, 1);
  assert.equal(inventory.getSelectedItem().itemId, 'wood');
  assert.equal(inventory.buy('wood', '2').ok, true);
  assert.equal(inventory.getCount('wood'), 5);
  inventory.useOne();
  assert.equal(inventory.getCount('wood'), 4);
  const restored = new Inventory();
  restored.restore(inventory.serialize());
  assert.deepEqual(restored.serialize(), inventory.serialize());
});

test('stack overflow rejects without mutation even with free hotbar slots', () => {
  const inventory = new Inventory();
  inventory.addItem('wood', Number.MAX_SAFE_INTEGER);
  assert.equal(inventory.canAdd('wood', 1), false);
  assert.equal(inventory.addItem('wood', 1).ok, false);
  assert.equal(inventory.getCount('wood'), Number.MAX_SAFE_INTEGER);
});

test('restoring missing or empty icons derives catalog icons for collected items and tools', () => {
  const inventory = new Inventory();
  inventory.restore({ selectedSlot: 0, slots: [
    { itemId: 'axe', qty: 1, emoji: '' },
    { itemId: 'shovel', qty: 1 },
    { itemId: 'pickaxe', qty: 1, emoji: null },
    { itemId: 'dirt', qty: 2 },
    { itemId: 'wood', qty: 3, emoji: 'custom' }
  ] });
  for (let i = 0; i < 4; i++) {
    const slot = inventory.getSlot(i);
    assert.equal(slot.emoji, ITEM_BY_ID[slot.itemId].emoji);
  }
  assert.equal(inventory.getSlot(4).emoji, 'custom');
  assert.equal(inventory.getSelectedItem().emoji, '🪓');
});

test('inventory restore rejects malformed stacks atomically and clears omitted legacy slots', () => {
  const inventory = new Inventory();
  inventory.buy('wood', 3);
  inventory.buy('stone', 2);
  const before = inventory.serialize();
  for (const bad of [
    { slots: [{ itemId: 'wood', qty: -1 }] },
    { slots: [{ itemId: 'wood', qty: 1.5 }] },
    { slots: [{ itemId: '__proto__', qty: 1 }] },
    { slots: [], selectedSlot: 1.5 },
    { slots: new Array(10).fill(null) }
  ]) {
    assert.equal(inventory.restore(bad), false);
    assert.deepEqual(inventory.serialize(), before);
  }
  assert.equal(inventory.restore({ slots: [{ itemId: 'wood', qty: 1 }], selectedSlot: 0 }), true);
  assert.equal(inventory.getCount('wood'), 1);
  assert.equal(inventory.getSlot(1), null);
});

test('resource rules give exact drops and tool timing without consuming tools', () => {
  assert.deepEqual(getBreakRule('wood', null, 'tree'), {
    duration: 5, itemId: 'wood', quantity: 3, label: 'Punch tree'
  });
  assert.equal(getBreakRule('wood', 'axe', 'tree').duration, 1.5);
  assert.equal(getBreakRule('wood', 'axe', 'block').quantity, 1);
  assert.equal(getBreakRule('wood', 'shovel', 'block').duration, 5);
  assert.equal(getBreakRule('dirt', null, 'block').duration, 1);
  assert.equal(getBreakRule('dirt', 'shovel', 'block').duration, 0.35);
  for (const tool of [null, 'axe', 'shovel']) assert.equal(getBreakRule('stone', tool, 'block'), null);
  assert.deepEqual(getBreakRule('stone', 'pickaxe', 'block'), {
    duration: 2, itemId: 'stone', quantity: 1, label: 'Mine stone'
  });
  assert.equal(getBreakRule('metal', 'pickaxe', 'block'), null);
  assert.equal(getBreakRule('dirt', 'axe', 'tree'), null);
  for (const id of ['axe', 'shovel', 'pickaxe']) {
    assert.equal(ITEM_BY_ID[id].reusable, true);
    assert.ok(ITEM_BY_ID[id].price > 0);
  }
  assert.ok(ITEM_BY_ID.dirt);
});
