// Placement controller for farm structures, decor, and public road tiles.
// The caller supplies the game camera, world, and inventory so this module
// stays independent of the main integration layer.
import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';

var ROAD_IDS = { asphalt: true, gravel: true, brick: true };
var BLOCK_IDS = { wood: true, roof_shingles: true, fence_kit: true, window_glass: true, door: true };
var DECOR_IDS = { lamp_light: true, hay_bale: true, scarecrow: true, pumpkin_pile: true, corn_shocks: true, string_lights: true, mailbox: true, harvest_pumpkin: true };
var HEIGHTS = { harvest_pumpkin: 0.84, lamp_light: 2.4, hay_bale: 0.7, pumpkin_pile: 0.7, mailbox: 1.2, scarecrow: 1.7, corn_shocks: 1.7 };
var COLORS = {
  asphalt: '#333536', gravel: '#85827a', brick: '#9a4f3f', wood: '#81552f',
  roof_shingles: '#8c4638', fence_kit: '#9a8058', window_glass: '#8bd2e8', door: '#754a2b',
  lamp_light: '#f5d86b', hay_bale: '#d8b84d', scarecrow: '#86593b', pumpkin_pile: '#e87925',
  corn_shocks: '#c69f32', string_lights: '#f2cc58', mailbox: '#b94738'
};

function isPlaceable(item) {
  return !!item && !!(ROAD_IDS[item.id] || BLOCK_IDS[item.id] || DECOR_IDS[item.id] ||
    /^(corn|wheat|pumpkin|sunflower|pea)_seeds$/.test(item.id) || item.id === 'fertilizer');
}

function voxelKey(x, y, z) { return x + ',' + y + ',' + z; }

export class Builder {
  constructor(options) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.world = options.world;
    this.inventory = options.inventory;
    this.getAssignedSlot = options.getAssignedSlot;
    this.getWalking = options.getWalking;
    this.getPlayerPosition = options.getPlayerPosition || function () { return null; };
    this.getPlayerObject = options.getPlayerObject || function () { return null; };
    this.isPlacementBlocked = options.isPlacementBlocked || function () { return false; };
    this.onRemoved = options.onRemoved || function () {};
    this._nextHarvestId = 1;
    this._externalInput = false;
    this.getBuildMode = options.getBuildMode || function () { return false; };
    this.onPlaced = options.onPlaced || function () {};
    this.raycaster = new THREE.Raycaster();
    this._placementRay = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._target = new THREE.Vector3();
    this._enabled = true;
    this._placed = [];
    this._occupied = {};
    this._ghost = null;
    this._ghostItem = '';
    this._colorChoices = ['#d84d58', '#4d8dd8', '#72a34b', '#e0b83a', '#aa72c9'];
    this._colorIndex = 0;
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerdown', this._onClick);
  }

  setEnabled(enabled) {
    this._enabled = !!enabled;
    if (this._ghost) this._ghost.visible = this._enabled && isPlaceable(this._item());
  }

  setExternalInput(enabled) {
    this._externalInput = !!enabled;
    this.canvas.removeEventListener('pointerdown', this._onClick);
    if (!this._externalInput) this.canvas.addEventListener('pointerdown', this._onClick);
  }

  aimFromEvent(e) { this._onMove(e); }
  placeFromEvent(e) { return !!this._place(e); }

  getHarvestTargets() {
    return this._placed.filter((entry) => entry.id === 'wood' && !entry.remote &&
      this.world.getFarmAtPosition(entry.x, entry.z) === this.getAssignedSlot()).map((entry) => {
      var mesh = this._occupied[voxelKey(entry.x, entry.y || 0, entry.z)];
      if (!mesh) return null;
      return { id: mesh.userData.harvestId, kind: 'block', material: 'wood', mesh: mesh,
        x: entry.x, y: (entry.y || 0) + 0.5, z: entry.z };
    }).filter(Boolean);
  }

  harvestBlock(id, inventory = this.inventory) {
    var target = this.getHarvestTargets().find((entry) => entry.id === id);
    if (!target) return { ok: false, error: 'Target changed' };
    if (!this._withinReach(target.x, target.y, target.z)) return { ok: false, error: 'Out of reach' };
    if (!inventory.canAdd('wood', 1)) return { ok: false, error: 'Inventory full' };
    // addItem commits synchronously or rejects without mutation. Keep the world
    // intact on rejection, and remove the target before another action can run.
    var result = inventory.addItem('wood', 1);
    if (!result || !result.ok) return result || { ok: false, error: 'Inventory full' };
    var key = voxelKey(target.x, target.y - 0.5, target.z);
    var index = this._placed.findIndex((entry) => entry.id === 'wood' && !entry.remote &&
      voxelKey(entry.x, entry.y || 0, entry.z) === key);
    var removed = this._placed.splice(index, 1)[0];
    delete this._occupied[key];
    this.scene.remove(target.mesh);
    target.mesh.geometry.dispose();
    target.mesh.material.dispose();
    this.onRemoved(removed);
    return { ok: true, itemId: 'wood', quantity: 1 };
  }

  _withinReach(x, y, z) {
    var player = this.getPlayerPosition();
    return !player || Math.hypot(x - player.x, y - (player.y || 0), z - player.z) <= 4;
  }

  _placementOccluded(p) {
    var player = this.getPlayerPosition();
    if (!player) return false;
    var eye = new THREE.Vector3(player.x, (player.y || 0) + 1.4, player.z);
    var direction = new THREE.Vector3(p.x, p.y + 0.5, p.z).sub(eye);
    var distance = direction.length();
    if (distance < 0.001) return false;
    this._placementRay.set(eye, direction.normalize());
    this._placementRay.far = distance - 0.02;
    var character = this.getPlayerObject();
    return this._placementRay.intersectObjects(this.scene.children, true).some((hit) => {
      if (hit.distance >= distance - 0.02) return false;
      for (var object = hit.object; object; object = object.parent) {
        if (!object.visible || object === character || object === this.camera || object === this._ghost ||
          (object.userData && object.userData.interactionIgnore)) return false;
      }
      return true;
    });
  }

  _placementAllowed(item, p) {
    if (!this._canPlace(item, p.x, p.z) || this._occupied[voxelKey(p.x, p.y, p.z)]) return false;
    // Preserve the established field/road workflows; physical structures use
    // character reach and solid-volume overlap instead of camera distance.
    if (!BLOCK_IDS[item.id] && !DECOR_IDS[item.id]) return true;
    var height = HEIGHTS[item.id] || 1;
    if (!this._withinReach(p.x, p.y + height / 2, p.z)) return false;
    var player = this.getPlayerPosition();
    if (player && Math.abs(p.x - player.x) < 0.8 && Math.abs(p.z - player.z) < 0.8 &&
      p.y < (player.y || 0) + 1.8 && p.y + height > (player.y || 0)) return false;
    var blocked = Object.keys(this._occupied).some((key) => {
      var other = this._occupied[key];
      var otherHeight = other.userData.placeHeight || 1;
      return Math.abs(other.position.x - p.x) < 1 && Math.abs(other.position.z - p.z) < 1 &&
        p.y < other.position.y + otherHeight / 2 && p.y + height > other.position.y - otherHeight / 2;
    });
    if (item.id === 'wood' && this._placementOccluded(p)) return false;
    return !blocked && !this.isPlacementBlocked({ x: p.x, y: p.y, z: p.z, width: 1, height: height, depth: 1 }, item);
  }

  _item() {
    var selected = this.inventory.getSelectedItem();
    return selected ? ITEM_BY_ID[selected.itemId] : null;
  }

  _rayFromEvent(e) {
    var rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    if (this.getBuildMode()) this.pointer.set(0, 0);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.getBuildMode()) return true;
    return this.raycaster.ray.intersectPlane(this.ground, this._target) !== null;
  }

  _cellPosition() {
    return { x: Math.floor(this._target.x + 0.5), y: 0, z: Math.floor(this._target.z + 0.5) };
  }

  _placementCell() {
    var p = this._cellPosition();
    if (!this.getBuildMode()) return p;
    var objects = Object.keys(this._occupied).map((key) => this._occupied[key]);
    var hits = objects.length ? this.raycaster.intersectObjects(objects, false) : [];
    if (hits.length) {
      var hit = hits[0];
      var normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      p.x = Math.round(hit.object.position.x + normal.x);
      p.y = Math.max(0, Math.round(hit.object.position.y - (hit.object.userData.placeHeight || 1) / 2 + normal.y));
      p.z = Math.round(hit.object.position.z + normal.z);
      if (p.y > 64) return null;
      if (!this.getPlayerPosition() && this.camera.position.distanceTo(hit.point) > 7) return null;
      return p;
    }
    if (!this.raycaster.ray.intersectPlane(this.ground, this._target)) return null;
    p = this._cellPosition();
    if (!this.getPlayerPosition() && Math.hypot(p.x - this.camera.position.x, p.z - this.camera.position.z) > 12) return null;
    return p;
  }

  _canPlace(item, x, z) {
    if (!item) return false;
    var slot = this.world.getFarmAtPosition(x, z);
    if (ROAD_IDS[item.id]) return slot < 0;
    if (/^(corn|wheat|pumpkin|sunflower|pea)_seeds$/.test(item.id) || item.id === 'fertilizer') {
      if (slot !== this.getAssignedSlot()) return false;
      var field = this._fieldAt(slot, x, z);
      var tile = field && field.worldToTile(x, z);
      if (!tile) return false;
      if (item.id === 'fertilizer') return tile.state === 'planted' || tile.state === 'growing' || tile.state === 'sprayed';
      return tile.state === 'tilled';
    }
    return slot === this.getAssignedSlot() && (BLOCK_IDS[item.id] || DECOR_IDS[item.id]);
  }

  _fieldAt(slot, x, z) {
    var farm = this.world.getFarms()[slot];
    if (!farm) return null;
    var fields = farm.getFields();
    for (var i = 0; i < fields.length; i++) if (fields[i].isInside(x, z)) return fields[i];
    return null;
  }

  _makeMesh(item) {
    var geometry;
    var height = 1;
    var color = COLORS[item.id] || '#b49a63';
    if (item.id === 'harvest_pumpkin') {
      geometry = new THREE.SphereGeometry(0.42, 10, 8); height = 0.84; color = '#e87925';
    } else if (ROAD_IDS[item.id]) {
      geometry = new THREE.BoxGeometry(1, 0.08, 1);
    } else if (item.id === 'lamp_light') {
      geometry = new THREE.BoxGeometry(0.25, 2.4, 0.25); height = 2.4;
    } else if (item.id === 'hay_bale' || item.id === 'pumpkin_pile') {
      geometry = new THREE.BoxGeometry(0.9, 0.7, 0.9); height = 0.7;
    } else if (item.id === 'mailbox') {
      geometry = new THREE.BoxGeometry(0.55, 1.2, 0.45); height = 1.2;
    } else if (item.id === 'scarecrow' || item.id === 'corn_shocks') {
      geometry = new THREE.BoxGeometry(0.7, 1.7, 0.35); height = 1.7;
    } else if (item.id === 'string_lights') {
      geometry = new THREE.BoxGeometry(1, 0.15, 0.15);
    } else {
      geometry = new THREE.BoxGeometry(1, 1, 1);
    }
    var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, transparent: false });
    var mesh = new THREE.Mesh(geometry, mat);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.itemId = item.id;
    if (item.id === 'wood') mesh.userData.harvestId = 'block:' + this._nextHarvestId++;
    mesh.userData.placeHeight = height;
    if (item.id === 'lamp_light') {
      var lamp = new THREE.PointLight('#ffe6a0', 0.6, 12);
      lamp.position.y = 2.2;
      mesh.add(lamp);
    }
    return mesh;
  }

  _ensureGhost(item) {
    if (this._ghost && this._ghostItem === item.id) return;
    if (this._ghost) {
      this.scene.remove(this._ghost);
      this._ghost.geometry.dispose();
      this._ghost.material.dispose();
    }
    this._ghost = this._makeMesh(item);
    this._ghost.material = this._ghost.material.clone();
    this._ghost.userData.interactionIgnore = true;
    this._ghost.material.transparent = true;
    this._ghost.material.opacity = 0.45;
    this._ghostItem = item.id;
    this.scene.add(this._ghost);
  }

  _onMove(e) {
    var item = this._item();
    if (!this._enabled || !this.getWalking() || !isPlaceable(item) || !this._rayFromEvent(e)) {
      if (this._ghost) this._ghost.visible = false;
      return;
    }
    this._ensureGhost(item);
    var p = this._placementCell();
    if (!p) { if (this._ghost) this._ghost.visible = false; return; }
    var allowed = this._placementAllowed(item, p);
    this._ghost.position.set(p.x, p.y + (this._ghost.userData.placeHeight || 1) / 2 + 0.04, p.z);
    this._ghost.visible = true;
    this._ghost.material.color.set(allowed ? COLORS[item.id] || '#b49a63' : '#d24a43');
  }

  _onClick(e) {
    if (!this._externalInput) return this._place(e);
  }

  _place(e) {
    if (!this._enabled || !this.getWalking() || e.button !== 0) return false;
    var item = this._item();
    if (!isPlaceable(item)) return false;
    if (!this._rayFromEvent(e)) return;
    var p = this._placementCell();
    if (!p) return;
    if (!this._placementAllowed(item, p)) return false;
    var key = voxelKey(p.x, p.y, p.z);
    if (this._occupied[key]) return;
    var selected = this.inventory.getSelectedItem();
    if (!selected || selected.itemId !== item.id || selected.qty < 1) return;
    if (item.id === 'fertilizer' || /_seeds$/.test(item.id)) {
      var slot = this.world.getFarmAtPosition(p.x, p.z);
      var field = this._fieldAt(slot, p.x, p.z);
      var cropType = item.id.slice(0, -6);
      if (cropType === 'pea') cropType = 'peas';
      var success = item.id === 'fertilizer'
        ? field && field.fertilizeAt(p.x, p.z)
        : field && field.plantAt(p.x, p.z, cropType);
      if (!success) return;
      this.inventory.useOne();
      this.inventory.updateDOM();
      this.onPlaced({ id: item.id, x: p.x, z: p.z, farmSlot: slot });
      return true;
    }
    var mesh = this._makeMesh(item);
    mesh.position.y = p.y + mesh.userData.placeHeight / 2;
    mesh.position.x = p.x;
    mesh.position.z = p.z;
    this.scene.add(mesh);
    this._occupied[key] = mesh;
    var entry = { id: item.id, x: p.x, y: p.y, z: p.z, color: COLORS[item.id] || '#b49a63' };
    this._placed.push(entry);
    this.inventory.useOne();
    this.inventory.updateDOM();
    this.onPlaced(entry);
    return true;
  }

  cyclePaint() {
    this._colorIndex = (this._colorIndex + 1) % this._colorChoices.length;
    return this._colorChoices[this._colorIndex];
  }

  paintAt(x, z) {
    var key = voxelKey(Math.round(x), 0, Math.round(z));
    var mesh = this._occupied[key];
    if (!mesh || !this.inventory.getSelectedItem() || this.inventory.getSelectedItem().itemId !== 'paint') return false;
    var color = this.cyclePaint();
    mesh.material.color.set(color);
    return true;
  }

  serialize() { return this._placed.slice(); }

  serializeLocal() {
    return this._placed.filter(function (entry) {
      return !ROAD_IDS[entry.id] && !entry.remote;
    });
  }

  restore(entries, allowForeign) {
    if (!Array.isArray(entries)) return false;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var item = entry && ITEM_BY_ID[entry.id];
      if (!item || !isFinite(entry.x) || !isFinite(entry.z)) continue;
      var p = { x: Math.round(entry.x), y: Math.max(0, Math.round(entry.y || 0)), z: Math.round(entry.z) };
      var key = voxelKey(p.x, p.y, p.z);
      if ((!allowForeign && !this._canPlace(item, p.x, p.z)) || this._occupied[key]) continue;
      var mesh = this._makeMesh(item);
      mesh.position.y = p.y + mesh.userData.placeHeight / 2;
      mesh.position.x = p.x;
      mesh.position.z = p.z;
      if (entry.color && mesh.material.color) mesh.material.color.set(entry.color);
      this.scene.add(mesh);
      this._occupied[key] = mesh;
      this._placed.push({ id: item.id, x: p.x, y: p.y, z: p.z, color: entry.color || COLORS[item.id], remote: !!allowForeign });
    }
    return true;
  }

  dispose() {
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerdown', this._onClick);
    if (this._ghost) {
      this.scene.remove(this._ghost);
      this._ghost.geometry.dispose();
      this._ghost.material.dispose();
      this._ghost = null;
    }
  }
}
