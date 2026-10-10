import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeField } from './helpers/field.js';

const source = await readFile(new URL('../js/crop-problem-visuals.js', import.meta.url), 'utf8');
const stub = `const vector = () => ({ x:0, y:0, z:0, set(x,y,z) {this.x=x;this.y=y;this.z=z;} });
const THREE = {
  BoxGeometry: class {}, MeshStandardMaterial: class {}, MeshBasicMaterial: class {}, DynamicDrawUsage: 1,
  InstancedMesh: class { constructor(g,m,capacity) { this.capacity=capacity;this.instanceMatrix={setUsage(){}};this.matrices=[]; } setMatrixAt(i,m) { this.matrices[i]=m; } },
  Object3D: class { constructor() {this.position=vector();this.rotation=vector();this.scale=vector();} updateMatrix() {this.matrix=JSON.stringify([this.position,this.rotation,this.scale]);} }
};`;
const { CropProblemVisuals } = await import('data:text/javascript;base64,' + Buffer.from(source
  .replace("import * as THREE from 'three';", stub)
  .replace("'./crop-problems.js'", JSON.stringify(new URL('../js/crop-problems.js', import.meta.url).href))).toString('base64'));

test('weed and swarm rendering has bounded counts, animates, and clears after treatment', () => {
  const scene = { meshes: [], add(mesh) { this.meshes.push(mesh); } };
  const visual = new CropProblemVisuals(scene);
  const field = makeField('wheat', 'growing', 400, 20);
  field._problems.flags.fill(3);
  visual.update(0.5, [field], { x: 10, z: 10 });
  assert.equal(scene.meshes.length, 3);
  assert.deepEqual(visual.counts, { weeds: 96, bugs: 32 });
  assert.equal(visual.weeds.count, 288);
  assert.equal(visual.bodies.count, 96);
  assert.equal(visual.wings.count, 192);
  const firstBug = visual.bodies.matrices[0];
  visual.update(0.1, [field], { x: 10, z: 10 });
  assert.notEqual(visual.bodies.matrices[0], firstBug);
  field._problems.flags.fill(0);
  visual.update(0.5, [field], { x: 10, z: 10 });
  assert.deepEqual(visual.counts, { weeds: 0, bugs: 0 });
  assert.equal(visual.weeds.count + visual.bodies.count + visual.wings.count, 0);
});

test('no swarms are rendered at healthy or distant crops, or before login', () => {
  const visual = new CropProblemVisuals({ add() {} });
  const field = makeField();
  visual.update(0.5, [field], { x: 0, z: 0 });
  assert.equal(visual.bodies.count, 0);
  field._problems.flags.fill(3);
  visual.update(0.5, [field], { x: 1000, z: 1000 });
  assert.equal(visual.bodies.count, 0);
  visual.update(0.5, [field], { x: 0, z: 0 }, false);
  assert.equal(visual.bodies.visible, false);
});
