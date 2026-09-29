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

// save format: tile states travel as ints 0..6
export const STATE_NAMES = [
  TileState.UNTILLED, TileState.TILLED, TileState.PLANTED,
  TileState.GROWING, TileState.SPRAYED, TileState.READY, TileState.HARVESTED,
];
export const STATE_CODES = {};
for (let si = 0; si < STATE_NAMES.length; si++) STATE_CODES[STATE_NAMES[si]] = si;

export const CROP_TYPES = ['generic', 'corn', 'wheat', 'pumpkin', 'sunflower', 'peas'];
export const CROP_VALUES = { generic: 10, peas: 2, wheat: 4, corn: 7, sunflower: 10, pumpkin: 18 };
const CROP_CODES = {};
for (let ci = 0; ci < CROP_TYPES.length; ci++) CROP_CODES[CROP_TYPES[ci]] = ci;
const GROW_SECONDS = { generic: 5, peas: 4, wheat: 5, corn: 8, sunflower: 8, pumpkin: 12 };
const RIPEN_SECONDS = { generic: 6, peas: 4, wheat: 5, corn: 7, sunflower: 8, pumpkin: 10 };

// --- tuning ---
const GROW_SPROUT_S = 5; // PLANTED -> GROWING
const RIPEN_S = 6; // SPRAYED -> READY (only reachable after spray)
const HARVEST_MONEY = 10; // per READY tile harvested
const TILE_H = 0.16; // tile box height (flat voxel slab)
const BLOCKS = 4; // crop overlay voxels per tile (InstancedMesh slots)
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

// Distinct voxel silhouettes. Entries follow the same [dx,y,dz,sx,sy,sz,color]
// layout as the generic stage palette above.
const TYPE_BLOCKS = {
  generic: CROP_BLOCKS,
  corn: {
    PLANTED: [[0, 0.3, 0, 0.22, 0.25, 0.22, '#75b84b']],
    GROWING: [[0, 0.65, 0, 0.22, 1.05, 0.22, '#4f8d32'], [-0.22, 0.75, 0, 0.38, 0.16, 0.16, '#66a940'], [0.22, 0.42, 0, 0.36, 0.15, 0.14, '#43802c']],
    SPRAYED: [[0, 0.65, 0, 0.22, 1.05, 0.22, '#428044'], [-0.22, 0.75, 0, 0.38, 0.16, 0.16, '#57a54a'], [0.22, 0.42, 0, 0.36, 0.15, 0.14, '#39763c']],
    READY: [[0, 0.85, 0, 0.24, 1.55, 0.24, '#548334'], [-0.22, 0.78, 0, 0.38, 0.18, 0.16, '#6b9e3c'], [0.18, 0.92, 0, 0.22, 0.45, 0.24, '#e1bd42'], [0, 1.72, 0, 0.45, 0.22, 0.45, '#9c7130']]
  },
  wheat: {
    PLANTED: [[0, 0.28, 0, 0.2, 0.2, 0.2, '#85bd54']],
    GROWING: [[-0.18, 0.5, 0, 0.15, 0.72, 0.15, '#75a741'], [0.05, 0.55, 0.08, 0.15, 0.82, 0.15, '#86ad42'], [0.22, 0.45, -0.1, 0.15, 0.65, 0.15, '#69963a']],
    SPRAYED: [[-0.18, 0.5, 0, 0.15, 0.72, 0.15, '#729a4a'], [0.05, 0.55, 0.08, 0.15, 0.82, 0.15, '#83a34b'], [0.22, 0.45, -0.1, 0.15, 0.65, 0.15, '#63884a']],
    READY: [[-0.2, 0.7, 0, 0.15, 1.15, 0.15, '#b69737'], [0.02, 0.75, 0.08, 0.15, 1.25, 0.15, '#d1b448'], [0.23, 0.65, -0.1, 0.15, 1.05, 0.15, '#b28e32'], [0.05, 1.42, 0.08, 0.25, 0.25, 0.25, '#efd16a']]
  },
  pumpkin: {
    PLANTED: [[0, 0.28, 0, 0.22, 0.18, 0.22, '#5caa3e']],
    GROWING: [[0, 0.34, 0, 0.56, 0.35, 0.56, '#70a646'], [0.2, 0.34, 0.1, 0.18, 0.15, 0.18, '#85b452']],
    SPRAYED: [[0, 0.36, 0, 0.62, 0.4, 0.62, '#779e43'], [0.2, 0.38, 0.1, 0.18, 0.15, 0.18, '#95ba55']],
    READY: [[0, 0.43, 0, 0.72, 0.66, 0.72, '#e77825'], [-0.18, 0.42, 0, 0.18, 0.55, 0.55, '#f18a2c'], [0.18, 0.42, 0, 0.18, 0.55, 0.55, '#c95c1e'], [0, 0.83, 0, 0.15, 0.2, 0.15, '#477b35']]
  },
  sunflower: {
    PLANTED: [[0, 0.3, 0, 0.2, 0.23, 0.2, '#78b74b']],
    GROWING: [[0, 0.6, 0, 0.2, 0.95, 0.2, '#4d8b35'], [0.2, 0.7, 0, 0.38, 0.16, 0.18, '#78b64a'], [-0.2, 0.48, 0, 0.38, 0.16, 0.18, '#68a63f']],
    SPRAYED: [[0, 0.6, 0, 0.2, 0.95, 0.2, '#478647'], [0.2, 0.7, 0, 0.38, 0.16, 0.18, '#72aa4b'], [-0.2, 0.48, 0, 0.38, 0.16, 0.18, '#5f9845']],
    READY: [[0, 0.85, 0, 0.2, 1.5, 0.2, '#47813a'], [0, 1.68, 0, 0.72, 0.2, 0.72, '#efc930'], [0, 1.68, 0, 0.38, 0.25, 0.38, '#704d28'], [0.2, 1.68, 0, 0.18, 0.4, 0.18, '#f6dc54']]
  },
  peas: {
    PLANTED: [[0, 0.28, 0, 0.22, 0.2, 0.22, '#83bd4c']],
    GROWING: [[0, 0.38, 0, 0.6, 0.4, 0.58, '#579442'], [0.18, 0.44, 0.12, 0.24, 0.2, 0.24, '#76ac4d']],
    SPRAYED: [[0, 0.4, 0, 0.64, 0.42, 0.62, '#4e8745'], [0.18, 0.48, 0.12, 0.25, 0.2, 0.25, '#6da34d']],
    READY: [[0, 0.42, 0, 0.68, 0.48, 0.68, '#4c8d42'], [-0.2, 0.55, 0.15, 0.22, 0.17, 0.16, '#b3cf58'], [0.17, 0.55, -0.12, 0.22, 0.17, 0.16, '#bad85c'], [0.05, 0.55, 0.2, 0.22, 0.17, 0.16, '#a9c94e']]
  }
};

function stateStage(state) {
  if (state === TileState.PLANTED) return 'PLANTED';
  if (state === TileState.GROWING) return 'GROWING';
  if (state === TileState.SPRAYED) return 'SPRAYED';
  if (state === TileState.READY) return 'READY';
  return '';
}

// soil under the tile grid (gap colour): darker than every TILE_COLORS entry
// so the 0.06 grid gaps read as shadowed soil, never as grass.
const SOIL_UNDER = '#4a3a26';

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
    this._cropTypes = new Array(count).fill('generic');
    this._fertilized = new Uint8Array(count);
    this._timers = new Float32Array(count); // seconds in current timed state
    this._timedCount = 0;
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

    // --- soil underlay: one flat slab under the whole tile grid ---
    // The tiles are scaled to 0.94 so the grid has gaps; without this slab the
    // bright green ground plane shows through as stray green lines. Sits at
    // y = 0.005, well below the 0.16-tall tile slabs, so the gaps read as dark
    // soil instead — the grid itself looks unchanged.
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(cols * tile, 0.01, rows * tile),
      new THREE.MeshStandardMaterial({ color: SOIL_UNDER, roughness: 1, metalness: 0 })
    );
    under.position.set(
      originX + (cols - 1) * tile / 2,
      0.005,
      originZ + (rows - 1) * tile / 2
    );
    under.castShadow = false;
    under.receiveShadow = true;
    scene.add(under);
    this._underMesh = under;

    // --- crop overlays: one InstancedMesh, BLOCKS slots per planted tile ---
    // Slots are handed out only to tiles that currently show a crop, and the
    // draw count tracks the high-water mark, so an empty field draws nothing.
    // Reserving BLOCKS slots for every tile of all 40 fields meant ~250k
    // always-drawn boxes (plus the shadow pass), which stalled the renderer.
    const cropGeo = new THREE.BoxGeometry(1, 1, 1);
    const cropMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const crops = new THREE.InstancedMesh(cropGeo, cropMat, count * BLOCKS);
    crops.setColorAt(0, col('#4e9e3f')); // allocate instanceColor up front
    crops.count = 0;
    this._slotOf = new Int32Array(count).fill(-1); // tile -> crop slot, -1 = none
    this._freeSlots = [];
    this._slotHigh = 0; // slots handed out so far (draw count = high * BLOCKS)
    crops.castShadow = crops.receiveShadow = true;
    crops.frustumCulled = false;
    scene.add(crops);
    this._cropMesh = crops;
  }

  // ---------- growth timing ----------
  // PLANTED --(5s)--> GROWING --(spray applied)--> SPRAYED --(6s)--> READY
  // Unsrayed GROWING tiles never become READY: the kid must drive back and spray.
  update(dt, conditions = {}) {
    if (!(dt > 0) || this._timedCount === 0) return;
    const growthRate = Number.isFinite(conditions.growthRate) ? Math.max(0, conditions.growthRate) : 1;
    if (growthRate === 0) return;
    const { PLANTED, GROWING, SPRAYED } = TileState;
    const states = this._states;
    const timers = this._timers;
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      if (s === PLANTED) {
        timers[i] += dt * growthRate;
        var type = this._cropTypes[i] || 'generic';
        var growTime = GROW_SECONDS[type] || GROW_SPROUT_S;
        if (this._fertilized[i]) growTime *= 0.6;
        if (timers[i] >= growTime) {
          states[i] = GROWING;
          timers[i] = 0;
          this._timedCount--;
          this._refresh(i);
        }
      } else if (s === SPRAYED) {
        timers[i] += dt * growthRate;
        var ripenTime = RIPEN_SECONDS[this._cropTypes[i]] || RIPEN_S;
        if (this._fertilized[i]) ripenTime *= 0.6;
        if (timers[i] >= ripenTime) {
          states[i] = TileState.READY;
          timers[i] = 0;
          this._timedCount--;
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
  applyEffect(worldX, worldZ, width, effect, headingRad, cropType, maxAffected) {
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
      if (maxAffected > 0 && out.affected >= maxAffected) break;
      const dx = this._tx[i] - worldX;
      const dz = this._tz[i] - worldZ;
      const along = dx * cos + dz * sin; // heading axis (bar depth)
      const side = -dx * sin + dz * cos; // perpendicular axis (bar width)
      if (Math.abs(side) > halfW + EPS || Math.abs(along) > halfD + EPS) continue;

      const st = this._states[i];
      if (key === 'harvest' && (this._cropTypes[i] === 'pumpkin' || this._cropTypes[i] === 'peas')) continue;
      const next = legal(st);
      if (next === null) continue; // illegal on this tile → skipped

      const wasTimed = st === TileState.PLANTED || st === TileState.SPRAYED;
      const becomesTimed = next === TileState.PLANTED || next === TileState.SPRAYED;
      this._timedCount += Number(becomesTimed) - Number(wasTimed);

      this._states[i] = next;
      if (key === 'plant') {
        this._cropTypes[i] = CROP_CODES[cropType] !== undefined ? cropType : 'generic';
        this._fertilized[i] = 0;
      }
      this._timers[i] = 0;
      this._refresh(i);
      out.affected++;
      if (next === TILLED) this._tally.tilled++;
      else if (next === PLANTED) this._tally.planted++;
      else if (next === SPRAYED) this._tally.sprayed++;
      else if (next === HARVEST_MONEY_STATE) {
        this._tally.harvested++;
        out.money += CROP_VALUES[this._cropTypes[i]] || HARVEST_MONEY;
        const produceId = {
          corn: 'harvest_corn', wheat: 'harvest_wheat', sunflower: 'harvest_sunflower',
          pumpkin: 'harvest_pumpkin', peas: 'harvest_peas'
        }[this._cropTypes[i]];
        if (produceId) {
          if (!out.produce) out.produce = {};
          out.produce[produceId] = (out.produce[produceId] || 0) + 1;
        }
        this._fertilized[i] = 0;
      }
    }
    return out;
  }

  harvestAt(worldX, worldZ) {
    const tile = this.worldToTile(worldX, worldZ);
    if (!tile || tile.state !== TileState.READY) return null;
    const productId = tile.cropType === 'pumpkin' ? 'harvest_pumpkin' :
      (tile.cropType === 'peas' ? 'harvest_peas' : null);
    if (!productId) return null;
    const index = tile.row * this.cols + tile.col;
    this._states[index] = TileState.HARVESTED;
    this._timers[index] = 0;
    this._fertilized[index] = 0;
    this._tally.harvested++;
    this._refresh(index);
    return { itemId: productId, value: CROP_VALUES[tile.cropType] || 0 };
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
      cropType: this._cropTypes[row * this.cols + col],
    };
  }

  // Will this field pay out without buying anything? (sprayed crops ripen
  // on their own; ready crops just need harvesting)
  hasHarvestComing() {
    const { SPRAYED, READY } = TileState;
    for (let i = 0; i < this.count; i++) {
      const st = this._states[i];
      if (st === SPRAYED || st === READY) return true;
    }
    return false;
  }

  plantAt(worldX, worldZ, cropType) {
    var tile = this.worldToTile(worldX, worldZ);
    if (!tile || tile.state !== TileState.TILLED) return false;
    var index = tile.row * this.cols + tile.col;
    this._cropTypes[index] = CROP_CODES[cropType] !== undefined ? cropType : 'generic';
    this._states[index] = TileState.PLANTED;
    this._timers[index] = 0;
    this._timedCount++;
    this._tally.planted++;
    this._refresh(index);
    return true;
  }

  fertilizeAt(worldX, worldZ) {
    var tile = this.worldToTile(worldX, worldZ);
    if (!tile || (tile.state !== TileState.PLANTED && tile.state !== TileState.GROWING && tile.state !== TileState.SPRAYED)) return false;
    var index = tile.row * this.cols + tile.col;
    if (this._fertilized[index]) return false;
    this._fertilized[index] = 1;
    return true;
  }

  // Flooding can ruin a small, deterministic sample of growing tiles. The
  // cursor keeps repeated damage calls allocation-free and avoids random saves.
  damageCrops(amount = 1) {
    let remaining = Math.max(0, Math.floor(Number(amount) || 0));
    if (!remaining) return 0;
    if (!Number.isInteger(this._damageCursor)) this._damageCursor = 0;
    let damaged = 0, scanned = 0;
    while (remaining > 0 && scanned < this.count) {
      const i = this._damageCursor % this.count;
      this._damageCursor = (this._damageCursor + 1) % this.count;
      scanned++;
      const state = this._states[i];
      if (state !== TileState.PLANTED && state !== TileState.GROWING && state !== TileState.SPRAYED && state !== TileState.READY) continue;
      if (state === TileState.PLANTED || state === TileState.SPRAYED) this._timedCount = Math.max(0, this._timedCount - 1);
      this._states[i] = TileState.TILLED;
      this._timers[i] = 0;
      this._fertilized[i] = 0;
      this._refresh(i);
      damaged++;
      remaining--;
    }
    return damaged;
  }

  // ---------- persistence ----------
  serialize() {
    const states = new Array(this.count);
    const timers = new Array(this.count);
    // one base-36 char / one '0'|'1' per tile: plain arrays pushed the
    // 10-farm save past the Worker's 512 KiB state limit
    let cropTypes = '';
    let fertilized = '';
    for (let i = 0; i < this.count; i++) {
      states[i] = STATE_CODES[this._states[i]] || 0;
      timers[i] = Math.round(this._timers[i] * 100) / 100;
      cropTypes += (CROP_CODES[this._cropTypes[i]] || 0).toString(36);
      fertilized += this._fertilized[i] ? '1' : '0';
    }
    return {
      states: states,
      timers: timers,
      cropTypes: cropTypes,
      fertilized: fertilized,
      tilled: this._tally.tilled,
      planted: this._tally.planted,
      sprayed: this._tally.sprayed,
      harvested: this._tally.harvested,
    };
  }

  restore(d) {
    if (!d || !d.states || d.states.length !== this.count) return false;
    for (let i = 0; i < this.count; i++) {
      const code = d.states[i];
      this._states[i] =
        typeof code === 'number' && code >= 0 && code <= 6
          ? STATE_NAMES[code]
          : TileState.UNTILLED;
      const t = d.timers ? d.timers[i] : 0;
      this._timers[i] = typeof t === 'number' && isFinite(t) && t > 0 ? t : 0;
      const cropCode = typeof d.cropTypes === 'string'
        ? parseInt(d.cropTypes.charAt(i), 36)
        : (d.cropTypes && d.cropTypes[i]);
      this._cropTypes[i] = typeof cropCode === 'number' && cropCode >= 0 && cropCode < CROP_TYPES.length
        ? CROP_TYPES[cropCode] : 'generic';
      this._fertilized[i] = typeof d.fertilized === 'string'
        ? (d.fertilized.charAt(i) === '1' ? 1 : 0)
        : (d.fertilized && d.fertilized[i] ? 1 : 0);
    }
    this._timedCount = 0;
    for (let i = 0; i < this.count; i++) {
      if (this._states[i] === TileState.PLANTED || this._states[i] === TileState.SPRAYED) this._timedCount++;
    }
    const keys = ['tilled', 'planted', 'sprayed', 'harvested'];
    for (let k = 0; k < keys.length; k++) {
      const v = d[keys[k]];
      this._tally[keys[k]] =
        typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    }
    for (let i = 0; i < this.count; i++) this._refresh(i);
    return true;
  }

  // ---------- internals ----------
  _refresh(i) {
    const st = this._states[i];
    const tmp = new THREE.Color(TILE_COLORS[st]);
    if (st === TileState.UNTILLED) tmp.multiplyScalar(this._jitter[i]); // clumpy
    this._tileMesh.setColorAt(i, tmp);
    this._tileMesh.instanceColor.needsUpdate = true;

    const stage = stateStage(st);
    const crop = this._cropTypes[i] || 'generic';
    const blocks = stage ? ((TYPE_BLOCKS[crop] && TYPE_BLOCKS[crop][stage]) || CROP_BLOCKS[st]) : CROP_BLOCKS[st];
    let slot = this._slotOf[i];
    if (!blocks || blocks.length === 0) {
      if (slot < 0) return;
      this._slotOf[i] = -1;
      this._freeSlots.push(slot);
    } else if (slot < 0) {
      slot = this._freeSlots.length ? this._freeSlots.pop() : this._slotHigh++;
      this._slotOf[i] = slot;
      this._cropMesh.count = this._slotHigh * BLOCKS;
    }
    const cx = this._tx[i];
    const cz = this._tz[i];
    for (let b = 0; b < BLOCKS; b++) {
      const idx = slot * BLOCKS + b;
      const def = this._slotOf[i] >= 0 ? blocks[b] : null;
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
