import test from 'node:test';
import assert from 'node:assert/strict';
import { createFarmTerrain, validFarmTerrainCell, restoreFarmTerrain, restoreAuthoritativeFarmTerrain } from '../js/terrain-runtime.js';

test('ground is editable at fields, road, river banks, other farms and all map edges', () => {
  const terrain = createFarmTerrain(2);
  for (const [x,z] of [[-10,-78],[1780,80],[0,0],[8,-54],[899,35],[473,-40],[1750,70]]) {
    assert.equal(validFarmTerrainCell(terrain, 2, x, -1, z), true);
    assert.equal(terrain.breakCell(x,-1,z).success, true);
  }
  for (const [x,y,z] of [[-11,-1,0],[1781,-1,0],[0,-1,-79],[0,-1,81],[0,-8,0],[0,17,0]])
    assert.equal(validFarmTerrainCell(terrain, 2, x,y,z), false);
});

test('world save restores edits across regions and rejects malformed bounds', () => {
  const terrain = createFarmTerrain(3);
  for (const x of [0,649,1780]) terrain.breakCell(x,-1,0);
  const restored = restoreFarmTerrain(terrain.serialize(),3);
  for (const x of [0,649,1780]) assert.equal(restored.getCell(x,-1,0),null);
  const bad = terrain.serialize(); bad.bounds.width++;
  assert.equal(restoreFarmTerrain(bad,3),null);
});

test('old yard saves migrate without losing digs or changing existing hills', () => {
  const legacy = { version:1, generationVersion:2, bounds:{ originX:288,originZ:-53,width:38,depth:78,minY:-8,maxY:16 }, changes:[[290,-1,-52,'air']] };
  for (const generationVersion of [1,2]) {
    const restored = restoreFarmTerrain({...legacy,generationVersion},1);
    assert.equal(restored.getCell(290,-1,-52),null);
    assert.equal(restored.getCell(296,1,-22),'grass');
    assert.equal(restored.isEditable(8,-1,-54),true);
  }
  assert.equal(restoreFarmTerrain(legacy,2),null);
});

test('canonical edits override snapshots across the map and reject out-of-world cells', () => {
  const terrain = createFarmTerrain(1);
  terrain.breakCell(289,-1,0);
  const restored = restoreAuthoritativeFarmTerrain(terrain.serialize(), {
    '289,-1,0': {material:'stone'}, '0,-1,0':{material:'air'}, '1781,-1,0':{material:'stone'},
  },1);
  assert.equal(restored.getCell(289,-1,0),'stone');
  assert.equal(restored.getCell(0,-1,0),null);
  assert.equal(restored.getCell(1781,-1,0),null);
  assert.equal(restored.serialize().changes.length,2);
});
