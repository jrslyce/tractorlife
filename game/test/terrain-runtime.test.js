import test from 'node:test';
import assert from 'node:assert/strict';
import { createFarmTerrain, validFarmTerrainCell, restoreFarmTerrain, restoreAuthoritativeFarmTerrain } from '../js/terrain-runtime.js';

test('farm terrain uses the fixed slot bounds and rejects neighbors', () => {
  const terrain = createFarmTerrain(2);
  assert.deepEqual([terrain.originX, terrain.originZ, terrain.width, terrain.depth, terrain.minY, terrain.maxY], [468, -53, 38, 78, -8, 16]);
  assert.equal(validFarmTerrainCell(terrain, 2, 469, -7, -52), true);
  assert.equal(validFarmTerrainCell(terrain, 2, 467, -7, -53), false);
  assert.equal(validFarmTerrainCell(terrain, 2, 468, -7, -52), false);
  assert.equal(validFarmTerrainCell(terrain, 2, 473, -1, -40), false); // reserved expansion plot
  assert.equal(validFarmTerrainCell(terrain, 2, 504, -7, 23), true);
  assert.equal(validFarmTerrainCell(terrain, 2, 505, -7, 25), false);
  assert.equal(validFarmTerrainCell(terrain, 1, 468, -7, 0), false);
});

test('terrain restore is shape-validated against the owning slot', () => {
  const terrain = createFarmTerrain(3);
  terrain.breakCell(649, -1, 0);
  assert.equal(restoreFarmTerrain(terrain.serialize(), 3).getCell(649, -1, 0), null);
  assert.equal(restoreFarmTerrain(terrain.serialize(), 2), null);
  assert.equal(restoreFarmTerrain({ version: 999 }, 3), null);
});

test('flat generation saves migrate sparse edits onto the new relief safely', () => {
  const terrain = createFarmTerrain(1);
  terrain.breakCell(290, -1, -52);
  const oldSave = terrain.serialize();
  oldSave.generationVersion = 1;
  const restored = restoreFarmTerrain(oldSave, 1);
  assert.ok(restored);
  assert.equal(restored.getCell(290, -1, -52), null);
  assert.equal(restored.getCell(296, 1, -22), 'grass'); // untouched base now follows the new hill generation
});

test('server edit overlay wins over stale local terrain and ignores out-of-region cells', () => {
  const terrain = createFarmTerrain(1);
  terrain.breakCell(289, -1, 0);
  const restored = restoreAuthoritativeFarmTerrain(terrain.serialize(), {
    '289,-1,0': { material: 'stone', revision: 1 },
    '288,-1,0': { material: 'stone', revision: 2 },
  }, 1);
  assert.equal(restored.getCell(289, -1, 0), 'stone');
  assert.equal(restored.getCell(288, -1, 0), 'grass'); // protected perimeter remains intact
});
