// Bounded voxel weeds and animated insect swarms: three draw calls at most.
import * as THREE from 'three';
import { WEEDS, BUGS } from './crop-problems.js';

const MAX_WEED_TILES = 96;
const MAX_BUG_TILES = 32;
const BUGS_PER_TILE = 3;
const VIEW_RADIUS = 120;

export class CropProblemVisuals {
  constructor(scene) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.weeds = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#38792d', roughness: 1 }), MAX_WEED_TILES * 3);
    this.bodies = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: '#352212' }), MAX_BUG_TILES * BUGS_PER_TILE);
    this.wings = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: '#f5d36a' }), MAX_BUG_TILES * BUGS_PER_TILE * 2);
    for (const mesh of [this.weeds, this.bodies, this.wings]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this._dummy = new THREE.Object3D();
    this._patches = [];
    this._elapsed = 0;
    this._scanElapsed = 1;
    this.counts = { weeds: 0, bugs: 0 };
  }

  update(dt, fields, position, enabled = true) {
    for (const mesh of [this.weeds, this.bodies, this.wings]) mesh.visible = enabled;
    if (!enabled) return;
    this._elapsed += dt;
    this._scanElapsed += dt;
    if (this._scanElapsed >= 0.5) {
      this._scanElapsed = 0;
      this._sync(fields, position);
    }
    const dummy = this._dummy;
    const time = this._elapsed;
    for (let p = 0; p < this._patches.length; p++) {
      const patch = this._patches[p];
      for (let b = 0; b < BUGS_PER_TILE; b++) {
        const index = p * BUGS_PER_TILE + b;
        const phase = time * (1.6 + b * 0.2) + p * 2.1 + b * 2.094;
        const x = patch.x + Math.cos(phase) * (0.55 + b * 0.15);
        const z = patch.z + Math.sin(phase) * (0.55 + b * 0.15);
        const y = 2 + Math.sin(phase * 1.7) * 0.3;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, -phase, 0);
        dummy.scale.set(0.2, 0.14, 0.27);
        dummy.updateMatrix();
        this.bodies.setMatrixAt(index, dummy.matrix);
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? -1 : 1;
          dummy.position.set(x + sign * 0.15, y + 0.04, z);
          dummy.rotation.set(0, -phase, sign * Math.sin(time * 32 + b) * 0.6);
          dummy.scale.set(0.26, 0.035, 0.2);
          dummy.updateMatrix();
          this.wings.setMatrixAt(index * 2 + side, dummy.matrix);
        }
      }
    }
    if (this.bodies.count) {
      this.bodies.instanceMatrix.needsUpdate = true;
      this.wings.instanceMatrix.needsUpdate = true;
    }
  }

  _sync(fields, position) {
    const candidates = [];
    for (const field of fields) {
      if (!field._problems) continue;
      for (let i = 0; i < field.count; i++) {
        const flag = field._problems.flags[i];
        if (!flag) continue;
        const x = field._tx[i], z = field._tz[i];
        const distance = (x - position.x) ** 2 + (z - position.z) ** 2;
        if (distance < VIEW_RADIUS * VIEW_RADIUS) candidates.push({ x, z, flag, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    this._patches.length = 0;
    let weedTiles = 0;
    const dummy = this._dummy;
    for (const patch of candidates) {
      if ((patch.flag & BUGS) && this._patches.length < MAX_BUG_TILES) this._patches.push(patch);
      if (!(patch.flag & WEEDS) || weedTiles >= MAX_WEED_TILES) continue;
      for (let blade = 0; blade < 3; blade++) {
        dummy.position.set(patch.x + (blade - 1) * 0.17, 0.65, patch.z + 0.26);
        dummy.rotation.set(0, blade * 1.05, (blade - 1) * 0.35);
        dummy.scale.set(0.1, 1.1 + blade * 0.08, 0.24);
        dummy.updateMatrix();
        this.weeds.setMatrixAt(weedTiles * 3 + blade, dummy.matrix);
      }
      weedTiles++;
    }
    this.weeds.count = weedTiles * 3;
    this.bodies.count = this._patches.length * BUGS_PER_TILE;
    this.wings.count = this.bodies.count * 2;
    this.weeds.instanceMatrix.needsUpdate = true;
    this.counts = { weeds: weedTiles, bugs: this._patches.length };
  }
}
