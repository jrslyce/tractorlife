import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainRenderer } from '../js/terrain-renderer.js';

class BufferGeometry {
  attributes = {};
  disposed = false;
  setAttribute(name, attribute) { this.attributes[name] = attribute; }
  computeVertexNormals() { this.normalsComputed = true; }
  dispose() { this.disposed = true; }
}
class Float32BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
}
class MeshLambertMaterial {
  constructor(options) { this.options = options; }
  dispose() { this.disposed = true; }
}
class Mesh {
  constructor(geometry, material) { Object.assign(this, { geometry, material }); }
}
const THREE = { BufferGeometry, Float32BufferAttribute, MeshLambertMaterial, Mesh };

function makeTerrain({ cells = {}, width = 4, depth = 2, chunkSize = 2, originX = 0, originZ = 0 } = {}) {
  const changed = [];
  return {
    minY: -1, maxY: 0, width, depth, chunkSize, originX, originZ,
    getCell(x, y, z) { return cells[`${x},${y},${z}`] ?? null; },
    getChunkKeys() { return ['0,0', '1,0']; },
    getChangedChunkKeys() { return changed.splice(0); },
    markChanged(...keys) { changed.push(...keys); },
  };
}
function makeScene() {
  const children = new Set();
  return { children, add(mesh) { children.add(mesh); }, remove(mesh) { children.delete(mesh); } };
}

test('builds only exposed faces, grouped by material, with cell-space geometry', () => {
  const terrain = makeTerrain({ cells: { '0,-1,0': 'grass', '1,-1,0': 'grass', '3,0,1': 'stone' } });
  const scene = makeScene();
  const renderer = createTerrainRenderer(THREE, scene, terrain);
  renderer.rebuildChunk(0, 0);
  assert.equal(scene.children.size, 1);
  const [mesh] = scene.children;
  const positions = mesh.geometry.attributes.position.array;
  // Two adjacent blocks have 10 exposed faces, each triangulated into 6 vertices.
  assert.equal(positions.length, 10 * 6 * 3);
  assert.equal(mesh.material.options.color, 0x668b43);
  assert.equal(mesh.geometry.normalsComputed, true);
  assert.deepEqual(mesh.userData.terrainChunk, { cx: 0, cz: 0 });
  assert.ok(positions.includes(-0.5));
  assert.ok(positions.includes(1.5));
});

test('dirty updates rebuild only named chunks and dispose replaced geometry', () => {
  const terrain = makeTerrain({ cells: { '0,-1,0': 'dirt', '2,-1,0': 'stone' } });
  const scene = makeScene();
  const renderer = createTerrainRenderer(THREE, scene, terrain);
  renderer.rebuildAll();
  const oldChunk0 = renderer.chunks.get('0,0')[0];
  const oldChunk1 = renderer.chunks.get('1,0')[0];
  terrain.markChanged('0,0');
  renderer.update();
  assert.equal(oldChunk0.geometry.disposed, true);
  assert.equal(scene.children.has(oldChunk0), false);
  assert.equal(oldChunk1.geometry.disposed, false);
  assert.equal(scene.children.has(oldChunk1), true);
  const latest = renderer.chunks.get('0,0')[0];
  renderer.dispose();
  assert.equal(latest.geometry.disposed, true);
  assert.equal(oldChunk1.geometry.disposed, true);
  assert.equal(latest.material.disposed, true);
  assert.equal(scene.children.size, 0);
});

test('updateAfterEdit rebuilds across chunk edges, including negative coordinates', () => {
  const terrain = makeTerrain({ width: 4, depth: 1, chunkSize: 2, originX: -2 });
  const scene = makeScene();
  const renderer = createTerrainRenderer(THREE, scene, terrain);
  renderer.rebuildChunk(0, 0);
  renderer.rebuildChunk(1, 0);
  // x=-1 is the final cell in chunk 0; the adjacent chunk must be refreshed too.
  renderer.updateAfterEdit(-1, -1, 0);
  assert.equal(renderer.chunks.has('0,0'), true);
  assert.equal(renderer.chunks.has('1,0'), true);
});

test('mapHit resolves signed face normals to the correct cell, including negative positions', () => {
  const renderer = createTerrainRenderer(THREE, makeScene(), makeTerrain());
  assert.deepEqual(renderer.mapHit({ point: { x: -1.5, y: 0, z: -2 }, face: { normal: { x: 1, y: 0, z: 0 } } }),
    { x: -2, y: 0, z: -2, normal: { x: 1, y: 0, z: 0 }, face: { x: 1, y: 0, z: 0 } });
  assert.deepEqual(renderer.mapHit({ point: { x: 2, y: -0.5, z: 2.5 }, normal: { x: 0, y: 0, z: -1 } }),
    { x: 2, y: -1, z: 3, normal: { x: 0, y: 0, z: -1 }, face: { x: 0, y: 0, z: -1 } });
  assert.equal(renderer.mapHit({ point: { x: 0, y: 0, z: 0 } }), null);
});
