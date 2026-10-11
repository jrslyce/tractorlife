import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildEnvironment } from '../js/environment.js';

test('environment trees are spatially batched and far-away batches stop rendering', () => {
  const scene = new THREE.Scene();
  const environment = buildEnvironment(scene, { cheapMaterials: true });
  const trees = scene.getObjectByName('world-environment').children.filter(mesh => mesh.isInstancedMesh);
  assert.ok(trees.length > 5);
  environment.updateCulling(0, 0, 270);
  assert.ok(trees.some(mesh => mesh.visible));
  assert.ok(trees.some(mesh => !mesh.visible));
  assert.ok(trees.every(mesh => mesh.material.isMeshLambertMaterial));
  environment.updateCulling(1700, 0, 270);
  assert.ok(trees.filter(mesh => mesh.visible).every(mesh => mesh.boundingSphere.center.x > 1100));
  environment.dispose();
  assert.equal(scene.children.length, 0);
});
