import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HarvestControls } from '../js/harvest-controls.js';
import { WorldInteraction } from '../js/world-interaction.js';

function setup() {
  const controls = Object.create(HarvestControls.prototype);
  const scene = new THREE.Scene();
  const character = { group: new THREE.Group() };
  scene.add(character.group);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 4.7, -8.5);
  camera.lookAt(0, 1.94, 3.5);
  camera.updateMatrixWorld();
  const tree = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial());
  tree.position.set(0, 1.5, 2);
  tree.userData.harvestTreeId = 'tree-1';
  scene.add(tree);
  scene.updateMatrixWorld(true);
  Object.assign(controls, {
    scene, character, camera, ray: new THREE.Raycaster(), pointer: new THREE.Vector2(),
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) },
    controlAim: true, touch: false, lastPointer: { clientX: 1, clientY: 1 },
    getBuildMode: () => false,
    getFarmSystems: () => ({ getHarvestTargets: () => [{ kind: 'tree', material: 'wood', id: 'tree-1', revision: 0 }] }),
    builder: { getHarvestTargets: () => [] },
  });
  return { controls, scene, tree };
}

test('on-screen gathering targets the nearby facing tree, not the last desktop mouse position', () => {
  const { controls } = setup();
  assert.equal(controls.resolveTarget().id, 'tree-1');
  controls.controlAim = false;
  assert.equal(controls.resolveTarget(), null);
  controls.touch = true;
  assert.equal(controls.resolveTarget().id, 'tree-1');
});

test('facing gathering respects reach, orientation, and intervening solid objects', () => {
  const { controls, scene, tree } = setup();
  controls.character.group.rotation.y = Math.PI;
  assert.equal(controls.resolveTarget(), null);
  controls.character.group.rotation.y = 0;
  tree.position.z = 8;
  scene.updateMatrixWorld(true);
  assert.equal(controls.resolveTarget(), null);
  tree.position.z = 2;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 0.2), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1, 1);
  scene.add(wall);
  scene.updateMatrixWorld(true);
  assert.equal(controls.resolveTarget(), null);
});

test('on-screen gathering can dig reachable editable ground, but cannot remotely mine terrain', () => {
  const { controls, scene, tree } = setup();
  scene.remove(tree);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 8), new THREE.MeshBasicMaterial());
  ground.position.y = -0.5;
  ground.userData.terrainChunk = true;
  scene.add(ground);
  scene.updateMatrixWorld(true);
  controls.terrain = { minY: -3, getCell: () => 'grass' };
  controls.terrainRenderer = { mapHit: () => ({ x: 0, y: -1, z: 2, normal: { x: 0, y: 1, z: 0 } }) };
  controls.getTerrainRevision = () => 3;
  const target = controls.resolveTarget();
  assert.equal(target.kind, 'terrain');
  assert.equal(target.material, 'grass');
  assert.equal(controls.targetFromHit({ object: ground, point: new THREE.Vector3(0, 0, 20) }), null);
  let commits = 0;
  controls.inventory = { getSelectedItem: () => null };
  controls.onTerrainAction = action => { assert.equal(action, 'break'); commits++; return { ok: true }; };
  const controller = new WorldInteraction(value => controls.commit(value));
  for (let i = 0; i < 15; i++) controller.update(0.1, { target, held: true });
  assert.equal(commits, 1);
});

test('direct desktop canvas targeting still follows actual pointer coordinates', () => {
  const { controls, tree } = setup();
  const point = tree.position.clone().project(controls.camera);
  const event = { clientX: (point.x + 1) * 400, clientY: (1 - point.y) * 400 };
  assert.equal(controls.resolveTarget(event).id, 'tree-1');
});
