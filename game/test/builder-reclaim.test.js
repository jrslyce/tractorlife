import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/build.js', import.meta.url), 'utf8');
const { Builder } = await import('data:text/javascript;base64,' + Buffer.from(source
  .replace("import * as THREE from 'three';", `const THREE = { Vector3: class { constructor(x,y,z) { Object.assign(this,{x,y,z}); } sub(v) { this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; } length() { return Math.hypot(this.x,this.y,this.z); } normalize() { const n=this.length(); this.x/=n; this.y/=n; this.z/=n; return this; } } };`)
  .replace("'./items.js'", JSON.stringify(new URL('../js/items.js', import.meta.url).href))).toString('base64'));

function fixture() {
  const builder = Object.create(Builder.prototype);
  const mesh = { userData: { harvestId: 'block:1', placeHeight: 1 }, position: { x: 2, y: 0.5, z: 0 },
    geometry: { dispose() {} }, material: { dispose() {} } };
  const inventory = { count: 0, canAdd() { return true; }, addItem(id, qty) { this.count += qty; return { ok: true }; } };
  Object.assign(builder, { inventory, _placed: [{ id: 'wood', x: 2, y: 0, z: 0 }], _occupied: { '2,0,0': mesh },
    _enabled: true, getWalking: () => true, getPlayerPosition: () => ({ x: 0, y: 0, z: 0 }),
    getPlayerObject: () => null, _placementRay: { set() {}, intersectObjects: () => [] },
    world: { getFarmAtPosition: () => 0 }, getAssignedSlot: () => 0, isPlacementBlocked: () => false,
    scene: { remove() {} }, onRemoved() {} });
  return { builder, inventory, mesh };
}

test('wood reclaim commits one reward, frees placement occupancy, and rejects repeats', () => {
  const { builder, inventory } = fixture();
  const target = builder.getHarvestTargets()[0];
  assert.equal(target.kind, 'block');
  assert.equal(target.y, 0.5);
  assert.equal(builder.harvestBlock(target.id).ok, true);
  assert.equal(inventory.count, 1);
  assert.deepEqual(builder.serializeLocal(), []);
  assert.deepEqual(builder._occupied, {});
  assert.equal(builder.harvestBlock(target.id).ok, false);
  assert.equal(inventory.count, 1);
});

test('full inventory and rejected inventory commit preserve block and save state', () => {
  const { builder, inventory } = fixture();
  inventory.canAdd = () => false;
  assert.equal(builder.harvestBlock('block:1').ok, false);
  assert.equal(builder.getHarvestTargets().length, 1);
  inventory.canAdd = () => true;
  inventory.addItem = () => ({ ok: false, error: 'Inventory full' });
  assert.equal(builder.harvestBlock('block:1').ok, false);
  assert.equal(builder.serializeLocal().length, 1);
  assert.equal(inventory.count, 0);
});

test('foreign, remote, and nonwood structures never become refund targets', () => {
  const { builder } = fixture();
  builder._placed[0].remote = true;
  assert.deepEqual(builder.getHarvestTargets(), []);
  builder._placed[0].remote = false;
  builder._placed[0].id = 'hay_bale';
  assert.deepEqual(builder.getHarvestTargets(), []);
  builder._placed[0].id = 'wood';
  builder.getAssignedSlot = () => 1;
  assert.deepEqual(builder.getHarvestTargets(), []);
});

test('character reach, body, occupied volumes, and external blockers reject placement', () => {
  const { builder } = fixture();
  const wood = { id: 'wood' };
  assert.equal(builder._placementAllowed(wood, { x: 3, y: 0, z: 0 }), true);
  assert.equal(builder._placementAllowed(wood, { x: 4, y: 0, z: 0 }), false);
  assert.equal(builder._placementAllowed(wood, { x: 0, y: 0, z: 0 }), false);
  assert.equal(builder._placementAllowed(wood, { x: 2, y: 0, z: 0 }), false);
  builder._occupied['2,0,0'].userData.placeHeight = 3;
  builder._occupied['2,0,0'].position.y = 1.5;
  assert.equal(builder._placementAllowed(wood, { x: 2, y: 1, z: 0 }), false);
  builder.isPlacementBlocked = () => true;
  assert.equal(builder._placementAllowed(wood, { x: 3, y: 0, z: 0 }), false);
});

test('stale target identity and moving out of reach do not award wood', () => {
  const { builder, inventory, mesh } = fixture();
  mesh.userData.harvestId = 'block:2';
  assert.equal(builder.harvestBlock('block:1').ok, false);
  builder.getPlayerPosition = () => ({ x: -10, y: 0, z: 0 });
  assert.equal(builder.harvestBlock('block:2').ok, false);
  assert.equal(inventory.count, 0);
});

test('external input ownership prevents canvas dispatch while explicit placement remains available', () => {
  const { builder } = fixture();
  const listeners = new Set();
  builder.canvas = { addEventListener(type, fn) { listeners.add(fn); }, removeEventListener(type, fn) { listeners.delete(fn); } };
  let calls = 0;
  builder._place = () => { calls++; return true; };
  builder.setExternalInput(true);
  builder._onClick({ button: 0 });
  assert.equal(calls, 0);
  assert.equal(builder.placeFromEvent({ button: 0 }), true);
  assert.equal(calls, 1);
  builder.setExternalInput(false);
  builder._onClick({ button: 0 });
  assert.equal(calls, 2);
});

test('placement consumes one wood only on success; occupied and distant clicks consume none', () => {
  const { builder, inventory } = fixture();
  let quantity = 3;
  Object.assign(inventory, { getSelectedItem: () => ({ itemId: 'wood', qty: quantity }),
    useOne() { quantity--; }, updateDOM() {} });
  let cell = { x: 3, y: 0, z: 0 };
  Object.assign(builder, { _rayFromEvent: () => true, _placementCell: () => cell,
    _makeMesh: () => ({ position: {}, userData: { placeHeight: 1 } }),
    scene: { add() {} }, onPlaced() {} });
  assert.equal(builder.placeFromEvent({ button: 0 }), true);
  assert.equal(quantity, 2);
  assert.equal(builder.serializeLocal().length, 2);
  assert.equal(builder.placeFromEvent({ button: 0 }), false);
  assert.equal(quantity, 2);
  cell = { x: 20, y: 0, z: 0 };
  assert.equal(builder.placeFromEvent({ button: 0 }), false);
  assert.equal(quantity, 2);
});

test('legacy entries without y restore locally and remote copies cannot be reclaimed', () => {
  const { builder } = fixture();
  builder._placed = [];
  builder._occupied = {};
  let id = 0;
  builder._makeMesh = () => ({ position: {}, userData: { placeHeight: 1, harvestId: 'restored:' + ++id },
    material: { color: { set() {} } } });
  builder.scene = { add() {} };
  assert.equal(builder.restore([{ id: 'wood', x: 2, z: 0, color: '#fff' }]), true);
  assert.equal(builder.serializeLocal()[0].y, 0);
  assert.equal(builder.getHarvestTargets().length, 1);
  assert.equal(builder.restore([{ id: 'wood', x: 3, z: 0 }], true), true);
  assert.equal(builder.serialize().length, 2);
  assert.equal(builder.serializeLocal().length, 1);
  assert.equal(builder.getHarvestTargets().length, 1);
});

test('wood placement rejects intervening visible world geometry and permits distant geometry', () => {
  const { builder } = fixture();
  const tree = { visible: true, userData: {} };
  builder._placementRay.intersectObjects = () => [{ distance: 1, object: tree }];
  assert.equal(builder._placementAllowed({ id: 'wood' }, { x: 3, y: 0, z: 0 }), false);
  builder._placementRay.intersectObjects = () => [{ distance: 10, object: tree }];
  assert.equal(builder._placementAllowed({ id: 'wood' }, { x: 3, y: 0, z: 0 }), true);
});

test('placement occlusion ignores player, camera attachments, preview and invisible/ignored ancestors', () => {
  const { builder } = fixture();
  const player = { visible: true, userData: {} };
  builder.getPlayerObject = () => player;
  builder.camera = { visible: true, userData: {} };
  builder._ghost = { visible: true, userData: {} };
  const parents = [player, builder.camera, builder._ghost,
    { visible: false, userData: {} }, { visible: true, userData: { interactionIgnore: true } }];
  builder._placementRay.intersectObjects = () => parents.map(parent => ({ distance: 0.5,
    object: { visible: true, userData: {}, parent } }));
  assert.equal(builder._placementAllowed({ id: 'wood' }, { x: 3, y: 0, z: 0 }), true);
});

test('live occlusion does not reject restore of a previously saved wood block', () => {
  const { builder } = fixture();
  builder._placed = [];
  builder._occupied = {};
  builder._placementOccluded = () => { throw new Error('Restore must not use current player sight'); };
  builder._makeMesh = () => ({ position: {}, userData: { placeHeight: 1 }, material: { color: { set() {} } } });
  builder.scene = { add() {} };
  assert.equal(builder.restore([{ id: 'wood', x: 3, z: 0 }]), true);
  assert.equal(builder.serializeLocal().length, 1);
});

test('selecting a tool hides an existing placement ghost without allocating another', () => {
  const { builder } = fixture();
  builder._ghost = { visible: true };
  builder._ensureGhost = () => { throw new Error('Tools cannot create placement ghosts'); };
  builder._rayFromEvent = () => { throw new Error('Tools do not aim placement rays'); };
  for (const id of ['axe', 'shovel', 'pickaxe', 'paint']) {
    builder._item = () => ({ id });
    builder._ghost.visible = true;
    builder.aimFromEvent({ clientX: 0, clientY: 0 });
    assert.equal(builder._ghost.visible, false, id);
    builder.setEnabled(true);
    assert.equal(builder._ghost.visible, false, id + ' after enabling');
    assert.equal(builder.placeFromEvent({ button: 0 }), false, id + ' placement');
  }
});
