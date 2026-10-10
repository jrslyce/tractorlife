import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain, TERRAIN_VERSION } from '../js/terrain.js';

test('deterministic base and soil/stone layers', () => {
  const a = new Terrain({ seed: 19 }), b = new Terrain({ seed: 19 });
  for (const y of [-8, -6, -5, -1, 0]) assert.equal(a.getCell(2, y, 3), b.getCell(2, y, 3));
  assert.equal(a.getCell(2, -8, 3), 'stone');
  assert.equal(a.getCell(2, -6, 3), 'stone');
  assert.equal(a.getCell(2, -5, 3), 'dirt');
  assert.equal(a.getCell(2, -1, 3), 'grass');
  assert.equal(a.getCell(2, 0, 3), null);
});

test('canonical yard has deterministic, editable hill and valley layers', () => {
  const t = new Terrain({ originX: 108, originZ: -53, width: 38, depth: 78, edgeMargin: 1 });
  // Hill at local (8,31): two blocks above the legacy surface, south of the expansion pad.
  assert.equal(t.getCell(116, 1, -22), 'grass');
  assert.equal(t.getCell(116, 0, -22), 'dirt');
  assert.equal(t.getCell(116, 2, -22), null);
  // Shallow valley at local (19,39): one block below the legacy surface.
  assert.equal(t.getCell(127, -2, -14), 'grass');
  assert.equal(t.getCell(127, -1, -14), null);
  assert.equal(t.breakCell(116, 1, -22).success, true);
  assert.equal(t.getCell(116, 1, -22), null);
  assert.equal(Terrain.restore(t.serialize()).getCell(116, 1, -22), null);
  // Existing owner perimeter remains protected, and edits cannot create terrain outside bounds.
  assert.equal(t.breakCell(108, -1, -40).success, false);
  assert.equal(t.placeCell(146, -1, -40, 'dirt').success, false);
  // Reserved future crop expansion plot stays level and is not editable terrain.
  assert.equal(t.isEditable(116, -1, -40), false);
  assert.equal(t.getCell(116, 1, -40), null);
});

test('break records explicit air and survives serialization', () => {
  const terrain = new Terrain();
  const result = terrain.breakCell(0, -1, 0, 'grass');
  assert.deepEqual(result, { success: true, material: 'grass', drop: 'dirt' });
  assert.equal(terrain.getCell(0, -1, 0), null);
  const saved = terrain.serialize();
  assert.equal(saved.version, TERRAIN_VERSION);
  assert.equal(Terrain.restore(saved).getCell(0, -1, 0), null);
});

test('break is atomic and place requires face attachment', () => {
  const terrain = new Terrain({ originX: 0, originZ: 0, width: 4, depth: 4 });
  assert.equal(terrain.breakCell(1, -1, 1, 'dirt').success, false);
  assert.equal(terrain.getCell(1, -1, 1), 'grass');
  terrain.breakCell(1, -1, 1);
  assert.deepEqual(terrain.placeCell(1, 0, 1, 'wood'), { success: false, reason: 'not-attached' });
  assert.equal(terrain.placeCell(1, -1, 1, 'dirt').success, true); // attached to the base below
  assert.equal(terrain.getCell(1, -1, 1), 'dirt');
});

test('boundaries, bottom protection and top limit', () => {
  const t = new Terrain({ originX: -2, originZ: -1, width: 3, depth: 2, minY: -4, surfaceY: 0, maxY: 3 });
  assert.equal(t.getCell(-3, -1, 0), null);
  assert.equal(t.getCell(-2, 4, 0), null);
  assert.equal(t.isEditable(-2, -4, 0), false);
  assert.equal(t.breakCell(-2, -4, 0).success, false);
  assert.equal(t.isEditable(-2, 3, 0), true);
  assert.equal(t.placeCell(-2, 3, 0, 'wood').success, false);
});

test('chunk keys handle edges and negative coordinates', () => {
  const t = new Terrain({ originX: -17, originZ: -17, width: 32, depth: 32, chunkSize: 16 });
  assert.equal(t.chunkKey(-17, -17), '0,0');
  assert.equal(t.chunkKey(-2, -2), '0,0');
  assert.equal(t.chunkKey(-1, -1), '1,1');
});

test('edits invalidate their chunk and neighbors only across chunk edges', () => {
  const t = new Terrain({ originX: -17, originZ: -17, width: 32, depth: 32, chunkSize: 16 });
  assert.equal(t.getChunkKeys().length, 4);
  assert.deepEqual(t.getChangedChunkKeys(), []);
  t.breakCell(-16, -1, -16);
  assert.deepEqual(t.getChangedChunkKeys(), ['0,0']);
  // x=-2 is the last cell of chunk 0; its exposed face affects chunk 1 too.
  t.breakCell(-2, -1, -3);
  assert.deepEqual(new Set(t.getChangedChunkKeys()), new Set(['0,0', '1,0']));
  assert.deepEqual(t.getChangedChunkKeys(), []);
});

test('restore rejects malformed or excessive state', () => {
  assert.throws(() => Terrain.restore({ version: 99, generationVersion: 1, bounds: {}, changes: [] }));
  const save = new Terrain().serialize();
  save.changes = [[999, -1, 0, 'air']];
  assert.throws(() => Terrain.restore(save));
  assert.throws(() => new Terrain({ width: 1001, depth: 1001 }));
  assert.throws(() => new Terrain({ changes: Array(200001).fill([[0, -1, 0], 'air']) }));
});
