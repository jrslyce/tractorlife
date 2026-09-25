// game/js/field.js — voxel farm field: tile grid, growth timing, implement effects.
// 1 world unit = 1 voxel. Ground plane at y = 0. ES module, Three.js (importmap 0.160.0).
import * as THREE from 'three';

export const TileState = {
  UNTILLED: 'untilled',
  TILLED: 'tilled',
  PLANTED: 'planted',
  GROWING: 'growing',
  SPRAYED: 'sprayed',
  READY: 'ready',
  HARVESTED: 'harvested',
};

// --- tuning ---
const GROW_SPROUT_S = 5; // PLANTED -> GROWING
const RIPEN_S = 6; // SPRAYED -> READY (only reachable after spray)
const HARVEST_MONEY = 10; // per READY tile harvested
const TILE_H = 0.16; // tile box height (flat voxel slab)
const BLOCKS = 2; // crop overlay blocks per tile (InstancedMesh slots)
const EPS = 1e-4; // bar-edge tolerance so grid-aligned bars hit exactly one row

// --- palette ---
const TILE_COLORS = {
  [TileState.UNTILLED]: '#7a5a3a',
  [TileState.TILLED]: '#5a3f28',
  [TileState.PLANTED]: '#6b4a2e',
  [TileState.GROWING]: '#4e9e3f',
  [TileState.SPRAYED]: '#3f8f7a',
  [TileState.READY]: '#e0b83a',
  [TileState.HARVESTED]: '#8a7a5a',
};

// Crop voxel blocks: [offsetX, y, offsetZ, sizeX, sizeY, sizeZ, color]
// y is absolute (tiles top out around y = 0.16). All boxes — no smooth spheres.
const CROP_BLOCKS = {
  [TileState.UNTILLED]: [],
  [TileState.TILLED]: [],
  [TileState.PLANTED]: [
    [0, 0.27, 0, 0.26, 0.22, 0.26, '#8fe06a'], // tiny sprout
    [0.16, 0.32, 0.1, 0.16, 0.14, 0.16, '#6fbf4e'], // side leaf
  ],
  [TileState.GROWING]: [
    [0, 0.46, 0, 0.32, 0.6, 0.32, '#3b7a30'], // green stalk
    [0.2, 0.62, 0, 0.2, 0.2, 0.2, '#57a544'], // leaf
  ],
  [TileState.SPRAYED]: [
    [0, 0.46, 0, 0.32, 0.6, 0.32, '#2f7a6a'], // teal-tinted stalk
    [0.2, 0.62, 0, 0.2, 0.2, 0.2, '#48a692'],
  ],
  [TileState.READY]: [
    [0, 0.61, 0, 0.32, 0.9, 0.32, '#b8902a'], // tall golden stalk
    [0, 1.18, 0, 0.46, 0.46, 0.46, '#f2d24a'], // golden crop head
  ],
  [TileState.HARVESTED]: [
    [0, 0.22, 0, 0.5, 0.12, 0.5, '#b8a878'], // stubble
  ],
};

const colorCache = new Map();
function col(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

export class Field {
  constructor(scene, { originX = 14, originZ = -16, cols = 32, rows = 32, tile = 1 } = {}) {
    this.originX = originX;
    this.originZ = originZ;
    this.cols = cols;
    this.rows = rows;
    this.tile = tile;

    const count = cols * rows;
    this.count = count;

    this._states = new Array(count).fill(TileState.UNTILLED);
    this._timers = new Float32Array(count); // seconds in current timed state
    this._jitter = new Float32Array(count); // untilled "clump" shade variation
    this._tx = new Float32Array(count); // tile world centers
    this._tz = new Float32Array(count);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        this._tx[i] = originX + c * tile;
        this._tz[i] = originZ + r * tile;
        this._jitter[i] = 0.86 + Math.random() * 0.28;
      }
    }

    this._tally = { tilled: 0, planted: 0, sprayed: 0, harvested: 0 };

    this._dummy = new THREE.Object3D();
    const tmp = new THREE.Color();

    // --- tile slab: one InstancedMesh, per-instance color (1 draw call) ---
    const tileGeo = new THREE.BoxGeometry(1, 1, 1);
    const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, count);
    for (let i = 0; i < count; i++) {
      this._dummy.position.set(this._tx[i], TILE_H / 2, this._tz[i]);
      this._dummy.scale.set(tile * 0.94, TILE_H, tile * 0.94); // grid gaps
      this._dummy.updateMatrix();
      tiles.setMatrixAt(i, this._dummy.matrix);
      tmp.set(TILE_COLORS[TileState.UNTILLED]).multiplyScalar(this._jitter[i]);
      tiles.setColorAt(i, tmp);
    }
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    tiles.castShadow = tiles.receiveShadow = true;
    tiles.frustumCulled = false;
    scene.add(tiles);
    this._tileMesh = tiles;

    // --- crop overlays: one InstancedMesh, BLOCKS slots per tile (1 draw call) ---
    const cropGeo = new THREE.BoxGeometry(1, 1, 1);
    const cropMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const crops = new THREE.InstancedMesh(cropGeo, cropMat, count * BLOCKS);
    for (let i = 0; i < count; i++) {
      for (let b = 0; b < BLOCKS; b++) {
        this._dummy.position.set(this._tx[i], 0, this._tz[i]);
        this._dummy.scale.set(0, 0, 0); // hidden until a crop appears
        this._dummy.updateMatrix();
        crops.setMatrixAt(i * BLOCKS + b, this._dummy.matrix);
        crops.setColorAt(i * BLOCKS + b, col('#4e9e3f'));
      }
    }
    crops.instanceMatrix.needsUpdate = true;
    if (crops.instanceColor) crops.instanceColor.needsUpdate = true;
    crops.castShadow = crops.receiveShadow = true;
    crops.frustumCulled = false;
    scene.add(crops);
    this._cropMesh = crops;
  }

  // ---------- growth timing ----------
  // PLANTED --(5s)--> GROWING --(spray applied)--> SPRAYED --(6s)--> READY
  // Unsrayed GROWING tiles never become READY: the kid must drive back and spray.
  update(dt) {
    if (!(dt > 0)) return;
    const { PLANTED, GROWING, SPRAYED } = TileState;
    const states = this._states;
    const timers = this._timers;
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      if (s === PLANTED) {
        timers[i] += dt;
        if (timers[i] >= GROW_SPROUT_S) {
          states[i] = GROWING;
          timers[i] = 0;
          this._refresh(i);
        }
      } else if (s === SPRAYED) {
        timers[i] += dt;
        if (timers[i] >= RIPEN_S) {
          states[i] = TileState.READY;
          timers[i] = 0;
          this._refresh(i);
        }
      } else if (s === GROWING) {
        timers[i] = 0; // waits forever for spray
      }
    }
  }

  // ---------- implement pass ----------
  // Working bar of `width` centered at (worldX, worldZ), perpendicular to heading
  // (0 = facing +X), one tile deep along the heading. Illegal tiles are skipped.
  applyEffect(worldX, worldZ, width, effect, headingRad) {
    const key = String(effect == null ? '' : effect).toLowerCase();
    const legal = EFFECTS[key];
    const out = { affected: 0, money: 0 };
    if (!legal) return out;

    const h = headingRad || 0;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const halfW = (width > 0 ? width : this.tile) / 2;
    const halfD = this.tile / 2;
    const { PLANTED, TILLED, GROWING, SPRAYED, READY } = TileState;

    for (let i = 0; i < this.count; i++) {
      const dx = this._tx[i] - worldX;
      const dz = this._tz[i] - worldZ;
      const along = dx * cos + dz * sin; // heading axis (bar depth)
      const side = -dx * sin + dz * cos; // perpendicular axis (bar width)
      if (Math.abs(side) > halfW + EPS || Math.abs(along) > halfD + EPS) continue;

      const st = this._states[i];
      const next = legal(st);
      if (next === null) continue; // illegal on this tile → skipped

      this._states[i] = next;
      this._timers[i] = 0;
      this._refresh(i);
      out.affected++;
      if (next === TILLED) this._tally.tilled++;
      else if (next === PLANTED) this._tally.planted++;
      else if (next === SPRAYED) this._tally.sprayed++;
      else if (next === HARVEST_MONEY_STATE) {
        this._tally.harvested++;
        out.money += HARVEST_MONEY;
      }
    }
    return out;
  }

  // ---------- queries ----------
  get stats() {
    return { ...this._tally };
  }

  isInside(x, z) {
    const u = (x - this.originX) / this.tile + 0.5;
    const v = (z - this.originZ) / this.tile + 0.5;
    return u >= 0 && u < this.cols && v >= 0 && v < this.rows;
  }

  worldToTile(x, z) {
    if (!this.isInside(x, z)) return null;
    const col = Math.floor((x - this.originX) / this.tile + 0.5);
    const row = Math.floor((z - this.originZ) / this.tile + 0.5);
    return {
      col,
      row,
      cx: this.originX + col * this.tile,
      cz: this.originZ + row * this.tile,
      state: this._states[row * this.cols + col],
    };
  }

  // ---------- internals ----------
  _refresh(i) {
    const st = this._states[i];
    const tmp = new THREE.Color(TILE_COLORS[st]);
    if (st === TileState.UNTILLED) tmp.multiplyScalar(this._jitter[i]); // clumpy
    this._tileMesh.setColorAt(i, tmp);
    this._tileMesh.instanceColor.needsUpdate = true;

    const blocks = CROP_BLOCKS[st];
    const cx = this._tx[i];
    const cz = this._tz[i];
    for (let b = 0; b < BLOCKS; b++) {
      const idx = i * BLOCKS + b;
      const def = blocks[b];
      if (def) {
        this._dummy.position.set(cx + def[0], def[1], cz + def[2]);
        this._dummy.scale.set(def[3], def[4], def[5]);
        this._cropMesh.setColorAt(idx, col(def[6]));
      } else {
        this._dummy.position.set(cx, 0, cz);
        this._dummy.scale.set(0, 0, 0); // hidden when not applicable
      }
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this._cropMesh.setMatrixAt(idx, this._dummy.matrix);
    }
    this._cropMesh.instanceMatrix.needsUpdate = true;
    if (this._cropMesh.instanceColor) this._cropMesh.instanceColor.needsUpdate = true;
  }
}

const HARVEST_MONEY_STATE = TileState.HARVESTED;

// Legal transition per effect; returns target state, or null to skip the tile.
const EFFECTS = {
  till: (s) =>
    s === TileState.UNTILLED || s === TileState.HARVESTED ? TileState.TILLED : null,
  plant: (s) => (s === TileState.TILLED ? TileState.PLANTED : null),
  spray: (s) =>
    s === TileState.GROWING || s === TileState.PLANTED ? TileState.SPRAYED : null,
  harvest: (s) => (s === TileState.READY ? TileState.HARVESTED : null),
};