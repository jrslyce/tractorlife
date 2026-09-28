// Placement controller for farm structures, decor, and public road tiles.
// The caller supplies the game camera, world, and inventory so this module
// stays independent of the main integration layer.
import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';

var ROAD_IDS = { asphalt: true, gravel: true, brick: true };
var BLOCK_IDS = { wood: true, roof_shingles: true, fence_kit: true, window_glass: true, door: true };
var DECOR_IDS = { lamp_light: true, hay_bale: true, scarecrow: true, pumpkin_pile: true, corn_shocks: true, string_lights: true, mailbox: true };
var COLORS = {
  asphalt: '#333536', gravel: '#85827a', brick: '#9a4f3f', wood: '#81552f',
  roof_shingles: '#8c4638', fence_kit: '#9a8058', window_glass: '#8bd2e8', door: '#754a2b',
  lamp_light: '#f5d86b', hay_bale: '#d8b84d', scarecrow: '#86593b', pumpkin_pile: '#e87925',
  corn_shocks: '#c69f32', string_lights: '#f2cc58', mailbox: '#b94738'
};

function cellKey(x, z) { return x + ',' + z; }

export class Builder {
  constructor(options) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.world = options.world;
    this.inventory = options.inventory;
    this.getAssignedSlot = options.getAssignedSlot;
    this.getWalking = options.getWalking;
    this.onPlaced = options.onPlaced || function () {};
    this.raycaster = new THREE.Raycaster();
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
    if (this._ghost) this._ghost.visible = this._enabled && !!this.inventory.getSelectedItem();
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
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, this._target) !== null;
  }

  _cellPosition() {
    return { x: Math.floor(this._target.x + 0.5), z: Math.floor(this._target.z + 0.5) };
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
    if (ROAD_IDS[item.id]) {
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
    this._ghost.material.transparent = true;
    this._ghost.material.opacity = 0.45;
    this._ghostItem = item.id;
    this.scene.add(this._ghost);
  }

  _onMove(e) {
    var item = this._item();
    if (!this._enabled || !this.getWalking() || !item || !this._rayFromEvent(e)) {
      if (this._ghost) this._ghost.visible = false;
      return;
    }
    this._ensureGhost(item);
    var p = this._cellPosition();
    var allowed = this._canPlace(item, p.x, p.z);
    this._ghost.position.set(p.x, this._ghost.geometry.parameters.height / 2 + 0.04, p.z);
    this._ghost.visible = true;
    this._ghost.material.color.set(allowed ? COLORS[item.id] || '#b49a63' : '#d24a43');
  }

  _onClick(e) {
    if (!this._enabled || !this.getWalking() || e.button !== 0) return;
    var item = this._item();
    if (!item || !(ROAD_IDS[item.id] || BLOCK_IDS[item.id] || DECOR_IDS[item.id] || /^(corn|wheat|pumpkin|sunflower|pea)_seeds$/.test(item.id) || item.id === 'fertilizer')) return;
    if (!this._rayFromEvent(e)) return;
    var p = this._cellPosition();
    if (!this._canPlace(item, p.x, p.z)) return;
    var key = cellKey(p.x, p.z);
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
      return;
    }
    var mesh = this._makeMesh(item);
    mesh.position.x = p.x;
    mesh.position.z = p.z;
    this.scene.add(mesh);
    this._occupied[key] = mesh;
    var entry = { id: item.id, x: p.x, z: p.z, color: COLORS[item.id] || '#b49a63' };
    this._placed.push(entry);
    this.inventory.useOne();
    this.inventory.updateDOM();
    this.onPlaced(entry);
  }

  cyclePaint() {
    this._colorIndex = (this._colorIndex + 1) % this._colorChoices.length;
    return this._colorChoices[this._colorIndex];
  }

  paintAt(x, z) {
    var key = cellKey(Math.round(x), Math.round(z));
    var mesh = this._occupied[key];
    if (!mesh || !this.inventory.getSelectedItem() || this.inventory.getSelectedItem().itemId !== 'paint') return false;
    var color = this.cyclePaint();
    mesh.material.color.set(color);
    return true;
  }

  serialize() { return this._placed.slice(); }

  restore(entries) {
    if (!Array.isArray(entries)) return false;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var item = entry && ITEM_BY_ID[entry.id];
      if (!item || !isFinite(entry.x) || !isFinite(entry.z)) continue;
      var p = { x: Math.round(entry.x), z: Math.round(entry.z) };
      if (!this._canPlace(item, p.x, p.z) || this._occupied[cellKey(p.x, p.z)]) continue;
      var mesh = this._makeMesh(item);
      mesh.position.x = p.x;
      mesh.position.z = p.z;
      if (entry.color && mesh.material.color) mesh.material.color.set(entry.color);
      this.scene.add(mesh);
      this._occupied[cellKey(p.x, p.z)] = mesh;
      this._placed.push({ id: item.id, x: p.x, z: p.z, color: entry.color || COLORS[item.id] });
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
