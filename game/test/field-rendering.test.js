import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Field, TileState } from '../js/field.js';

function field(options = {}) {
  return new Field(new THREE.Scene(), { cols: 4, rows: 3, ...options });
}
function refresh(f, i, state, crop = 'corn') {
  f._states[i] = state; f._cropTypes[i] = crop; f._refresh(i);
}
function checkPacking(f) {
  const seen = new Set();
  for (let owner = 0; owner < f.count; owner++) {
    for (const index of f._indicesOf[owner] || []) {
      assert.equal(f._instanceOwners[index], owner);
      assert.ok(index < f._cropMesh.count);
      assert.equal(seen.has(index), false);
      seen.add(index);
      const matrix = new THREE.Matrix4(); f._cropMesh.getMatrixAt(index, matrix);
      assert.ok(Math.abs(matrix.elements[12] - f._tx[owner]) <= 0.4);
      assert.ok(Math.abs(matrix.elements[14] - f._tz[owner]) <= 0.4);
    }
  }
  assert.equal(seen.size, f._cropMesh.count);
}

test('crop boxes are densely packed, shrink to stubble, and disappear after tilling', () => {
  const f = field();
  assert.equal(f._cropMesh.count, 0);
  for (let i = 0; i < f.count; i++) refresh(f, i, TileState.READY);
  assert.equal(f._cropMesh.count, f.count * 4);
  for (const i of [4, 0, 11, 3, 8, 2, 1, 10, 6, 9, 5, 7]) {
    refresh(f, i, TileState.HARVESTED); checkPacking(f);
  }
  assert.equal(f._cropMesh.count, f.count); // preserve visible harvested stubble
  for (let i = 0; i < f.count; i++) { refresh(f, i, TileState.TILLED); checkPacking(f); }
  assert.equal(f._cropMesh.count, 0);
  for (let i = 0; i < f.count; i++) refresh(f, i, TileState.GROWING, 'wheat');
  assert.equal(f._cropMesh.count, f.count * 3);
  checkPacking(f);
});

test('empty crop buffers start small, grow safely, and survive restore', () => {
  const f = field({ cols: 44, rows: 36 });
  assert.equal(f._cropMesh.instanceMatrix.count, 32);
  let disposals = 0; f._cropMesh.addEventListener('dispose', () => disposals++);
  for (let i = 0; i < f.count; i++) refresh(f, i, TileState.READY);
  assert.ok(disposals > 0);
  assert.equal(f._cropMesh.count, f.count * 4);
  checkPacking(f);
  const restored = field({ cols: 44, rows: 36 });
  assert.equal(restored.restore(f.serialize()), true);
  assert.equal(restored._cropMesh.count, f._cropMesh.count);
  checkPacking(restored);
});

test('low quality uses flat soil and Lambert lighting but preserves state and crop silhouettes', () => {
  const low = field({ cheapMaterials: true }); const high = field();
  assert.equal(low._tileMesh.geometry.index.count, 6);
  assert.equal(high._tileMesh.geometry.index.count, 36);
  assert.ok(low._cropMesh.material.isMeshLambertMaterial);
  for (let i = 0; i < low.count; i++) refresh(high, i, TileState.READY, 'pumpkin');
  low.restore(high.serialize());
  assert.deepEqual(low.serialize(), high.serialize());
  assert.equal(low._cropMesh.count, high._cropMesh.count);
});

test('fixed culling bounds contain every crop at field edges after growth', () => {
  const f = field({ originX: 180, originZ: -54 });
  assert.equal(f._tileMesh.frustumCulled, true);
  assert.equal(f._cropMesh.frustumCulled, true);
  for (const i of [0, f.count - 1]) {
    refresh(f, i, TileState.READY, 'sunflower');
    assert.ok(f._cropMesh.boundingSphere.containsPoint(new THREE.Vector3(f._tx[i] + 0.5, 2.2, f._tz[i] + 0.5)));
  }
});

test('implement grid broad phase matches a full scan for rotated bars and limited supplies', () => {
  for (let scenario = 0; scenario < 40; scenario++) {
    const f = field({ cols: 44, rows: 36, originX: 180, originZ: -54 });
    const x = 178 + (scenario * 13.73) % 49;
    const z = -56 + (scenario * 7.31) % 41;
    const width = 1 + scenario % 9;
    const heading = scenario * 0.37;
    const limit = scenario % 7;
    const expected = [];
    for (let i = 0; i < f.count; i++) {
      const dx = f._tx[i] - x, dz = f._tz[i] - z;
      if (Math.abs(dx * Math.cos(heading) + dz * Math.sin(heading)) <= 0.5001 &&
          Math.abs(-dx * Math.sin(heading) + dz * Math.cos(heading)) <= width / 2 + 0.0001) expected.push(i);
    }
    f.applyEffect(x, z, width, 'till', heading, 'wheat', limit);
    assert.deepEqual(f._states.flatMap((state, i) => state === TileState.TILLED ? [i] : []), expected.slice(0, limit));
  }
});
