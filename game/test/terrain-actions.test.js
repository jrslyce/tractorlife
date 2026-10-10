import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../js/terrain.js';
import { TerrainActions } from '../js/terrain-actions.js';

function inventory(slots = {}) {
  const counts = { ...slots };
  return {
    canAdd(id, qty) { return (counts[id] || 0) + qty <= 99; },
    addItem(id, qty) { if (!this.canAdd(id, qty)) return { ok: false }; counts[id] = (counts[id] || 0) + qty; return { ok: true }; },
    getCount(id) { return counts[id] || 0; },
    consumeItem(id, qty) { const used = Math.min(counts[id] || 0, qty); counts[id] = (counts[id] || 0) - used; return used; },
    counts,
  };
}

test('break checks tool and full capacity before changing terrain', () => {
  const terrain = new Terrain();
  const inv = inventory();
  const actions = new TerrainActions({ terrain, inventory: inv });
  assert.equal(actions.breakCell(0, -1, 0, 'pickaxe').ok, true);
  assert.equal(inv.getCount('dirt'), 1);
  assert.equal(terrain.getCell(0, -1, 0), null);

  const full = inventory({ dirt: 99 });
  const fullTerrain = new Terrain();
  assert.deepEqual(new TerrainActions({ terrain: fullTerrain, inventory: full }).breakCell(0, -1, 0),
    { ok: false, error: 'Inventory full.' });
  assert.equal(fullTerrain.getCell(0, -1, 0), 'grass');
});

test('stone requires a pickaxe and successful placement consumes exactly one item', () => {
  const terrain = new Terrain();
  const inv = inventory({ stone: 1 });
  const actions = new TerrainActions({ terrain, inventory: inv });
  assert.match(actions.breakCell(0, -8, 0, '').error, /pickaxe/);
  assert.equal(terrain.getCell(0, -8, 0), 'stone');
  assert.equal(actions.placeCell(0, 1, 0, 'stone').ok, false); // unattached
  assert.equal(inv.getCount('stone'), 1);
  assert.equal(actions.breakCell(0, -1, 0, '').ok, true);
  assert.equal(actions.placeCell(0, -1, 0, 'stone').ok, true); // refill a dug surface cell
  assert.equal(inv.getCount('stone'), 0);
  assert.equal(terrain.getCell(0, -1, 0), 'stone');
});
