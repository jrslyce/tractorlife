/** Pure bounded voxel state. Coordinates are cell centers on X/Z and cell bottoms on Y. */
export const TERRAIN_VERSION = 1;
export const TERRAIN_GENERATION_VERSION = 2;
export const TERRAIN_MATERIALS = Object.freeze(['grass', 'dirt', 'stone', 'wood', 'air']);
const MATERIAL_SET = new Set(TERRAIN_MATERIALS);
const MAX_CELLS = 1_000_000;
const MAX_CHANGES = 200_000;
const MAX_COORD = 1_000_000;
const FACES = Object.freeze([
  Object.freeze({ name: 'east', x: 1, y: 0, z: 0 }), Object.freeze({ name: 'west', x: -1, y: 0, z: 0 }),
  Object.freeze({ name: 'up', x: 0, y: 1, z: 0 }), Object.freeze({ name: 'down', x: 0, y: -1, z: 0 }),
  Object.freeze({ name: 'south', x: 0, y: 0, z: 1 }), Object.freeze({ name: 'north', x: 0, y: 0, z: -1 }),
]);

function integer(value, name) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_COORD) throw new TypeError(`Invalid ${name}`);
  return value;
}
function key(x, y, z) { return `${x},${y},${z}`; }
// Small, walkable relief inside the canonical farm-yard footprint. Keep this
// integer-only function in sync with worker.js: terrainHeight.
function terrainHeight(x, z, width, depth) {
  if (width !== 38 || depth !== 78) return 0;
  // Keep the first, farmer-purchased crop expansion pad (local Z 0..22)
  // level. The clearable ridge/mounds begin south of that reserve.
  const hills = [[8, 31, 2], [27, 33, 1], [11, 59, 2]];
  let height = 0;
  for (const [cx, cz, peak] of hills) {
    const d = Math.abs(x - cx) + Math.abs(z - cz);
    if (d <= 2) height = Math.max(height, peak);
    else if (d <= 5) height = Math.max(height, 1);
  }
  const valley = Math.abs(x - 19) + Math.abs(z - 39);
  if (valley <= 4) height = -1;
  return height;
}
function parseCellKey(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  if (parts.length !== 3 || parts.some(part => !/^-?(0|[1-9]\d*)$/.test(part))) return null;
  const coords = parts.map(Number);
  return coords.every(Number.isSafeInteger) && coords.every(n => Math.abs(n) <= MAX_COORD) ? coords : null;
}

export const TERRAIN_LIMITS = Object.freeze({ maxCells: MAX_CELLS, maxChanges: MAX_CHANGES, maxCoordinate: MAX_COORD });

export class Terrain {
  constructor({ originX = 0, originZ = 0, width = 32, depth = 32, surfaceY = 0, minY = -8, maxY = 16, chunkSize = 16, seed = 1, editable = true, edgeMargin = 0, changes } = {}) {
    for (const [value, name] of [[originX, 'originX'], [originZ, 'originZ'], [surfaceY, 'surfaceY'], [minY, 'minY'], [maxY, 'maxY'], [chunkSize, 'chunkSize'], [seed, 'seed']]) integer(value, name);
    if (!Number.isSafeInteger(width) || width < 1 || width > MAX_CELLS || !Number.isSafeInteger(depth) || depth < 1 || depth > MAX_CELLS || width * depth > MAX_CELLS) throw new RangeError('Invalid terrain dimensions');
    if (minY >= surfaceY || maxY < surfaceY || maxY - minY > MAX_CELLS || chunkSize < 1 || chunkSize > 256) throw new RangeError('Invalid terrain bounds');
    if (typeof editable !== 'boolean' || !Number.isSafeInteger(edgeMargin) || edgeMargin < 0 || edgeMargin * 2 >= width || edgeMargin * 2 >= depth) throw new TypeError('Invalid editable flag or edge margin');
    this.originX = originX; this.originZ = originZ; this.width = width; this.depth = depth;
    this.surfaceY = surfaceY; this.minY = minY; this.maxY = maxY; this.chunkSize = chunkSize; this.seed = seed; this.editable = editable; this.edgeMargin = edgeMargin;
    this._changes = new Map();
    this._dirtyChunks = new Set();
    if (changes !== undefined) this._loadChanges(changes);
  }

  _loadChanges(changes) {
    const entries = changes instanceof Map ? [...changes] : Array.isArray(changes) ? changes : null;
    if (!entries || entries.length > MAX_CHANGES) throw new TypeError('Invalid terrain changes');
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('Invalid terrain change');
      const coords = Array.isArray(entry[0]) ? entry[0] : parseCellKey(entry[0]);
      if (!coords || coords.length !== 3 || !coords.every(Number.isSafeInteger) || !MATERIAL_SET.has(entry[1]) || !this._inBounds(...coords)) throw new TypeError('Invalid terrain change');
      const cellKey = key(...coords);
      if (this._changes.has(cellKey)) throw new TypeError('Duplicate terrain change');
      this._changes.set(cellKey, entry[1]);
    }
  }
  _inBounds(x, y, z) { return Number.isSafeInteger(x) && Number.isSafeInteger(y) && Number.isSafeInteger(z) && x >= this.originX && x < this.originX + this.width && z >= this.originZ && z < this.originZ + this.depth && y >= this.minY && y <= this.maxY; }
  _base(x, y, z) {
    const relief = this.originZ === -53 && this.surfaceY === 0 && this.minY === -8
      ? terrainHeight(x - this.originX, z - this.originZ, this.width, this.depth) : 0;
    const top = this.surfaceY + relief;
    if (y >= top) return null;
    if (y <= this.minY + 2) return 'stone';
    if (y === top - 1) return 'grass';
    return 'dirt';
  }
  getCell(x, y, z) {
    if (!this._inBounds(x, y, z)) return null;
    const k = key(x, y, z);
    if (this._changes.has(k)) return this._changes.get(k) === 'air' ? null : this._changes.get(k);
    return this._base(x, y, z);
  }
  isSolid(x, y, z) { return this.getCell(x, y, z) !== null; }
  isEditable(x, y, z) { return this.editable && this._inBounds(x, y, z) && y > this.minY &&
    x >= this.originX + this.edgeMargin && x < this.originX + this.width - this.edgeMargin &&
    z >= this.originZ + this.edgeMargin && z < this.originZ + this.depth - this.edgeMargin &&
    !(this.originZ === -53 && this.width === 38 && this.depth === 78 &&
      x >= this.originX + 5 && x <= this.originX + 34 && z >= this.originZ && z <= this.originZ + 22); }
  _markCellChanged(x, z) {
    const cx = Math.floor((x - this.originX) / this.chunkSize);
    const cz = Math.floor((z - this.originZ) / this.chunkSize);
    this._dirtyChunks.add(`${cx},${cz}`);
    const lx = x - this.originX - cx * this.chunkSize;
    const lz = z - this.originZ - cz * this.chunkSize;
    if (lx === 0) this._dirtyChunks.add(`${cx - 1},${cz}`);
    if (lx === this.chunkSize - 1) this._dirtyChunks.add(`${cx + 1},${cz}`);
    if (lz === 0) this._dirtyChunks.add(`${cx},${cz - 1}`);
    if (lz === this.chunkSize - 1) this._dirtyChunks.add(`${cx},${cz + 1}`);
  }
  getChunkKeys() {
    const keys = [];
    for (let cx = 0; cx < Math.ceil(this.width / this.chunkSize); cx++) {
      for (let cz = 0; cz < Math.ceil(this.depth / this.chunkSize); cz++) keys.push(`${cx},${cz}`);
    }
    return keys;
  }
  getChangedChunkKeys() {
    const keys = [...this._dirtyChunks];
    this._dirtyChunks.clear();
    return keys;
  }
  breakCell(x, y, z, expectedMaterial) {
    const material = this.getCell(x, y, z);
    if (!this.isEditable(x, y, z) || material === null || (expectedMaterial !== undefined && material !== expectedMaterial)) return { success: false, material: material ?? null };
    this._changes.set(key(x, y, z), 'air');
    this._markCellChanged(x, z);
    return { success: true, material, drop: material === 'grass' ? 'dirt' : material };
  }
  placeCell(x, y, z, material) {
    if (!MATERIAL_SET.has(material) || material === 'air') return { success: false, reason: 'invalid-material' };
    if (!this.isEditable(x, y, z)) return { success: false, reason: 'out-of-bounds' };
    if (this.getCell(x, y, z) !== null) return { success: false, reason: 'occupied' };
    const attached = FACES.some(face => this.isSolid(x + face.x, y + face.y, z + face.z));
    if (!attached) return { success: false, reason: 'not-attached' };
    this._changes.set(key(x, y, z), material);
    this._markCellChanged(x, z);
    return { success: true, material };
  }
  applyAuthoritativeCell(x, y, z, material) {
    if (!MATERIAL_SET.has(material) || !this._inBounds(x, y, z) || y <= this.minY) return { success: false, reason: 'out-of-bounds' };
    const cellKey = key(x, y, z);
    if (material === this._base(x, y, z)) this._changes.delete(cellKey);
    else this._changes.set(cellKey, material);
    this._markCellChanged(x, z);
    return { success: true, material: material === 'air' ? null : material };
  }
  chunkKey(x, z) {
    integer(x, 'x'); integer(z, 'z');
    return `${Math.floor((x - this.originX) / this.chunkSize)},${Math.floor((z - this.originZ) / this.chunkSize)}`;
  }
  getExposedFaces(x, y, z) {
    if (!this.isSolid(x, y, z)) return [];
    return FACES.filter(face => !this.isSolid(x + face.x, y + face.y, z + face.z)).map(face => face.name);
  }
  serialize() {
    return { version: TERRAIN_VERSION, generationVersion: TERRAIN_GENERATION_VERSION,
      bounds: { originX: this.originX, originZ: this.originZ, width: this.width, depth: this.depth, surfaceY: this.surfaceY, minY: this.minY, maxY: this.maxY, chunkSize: this.chunkSize, seed: this.seed, editable: this.editable, edgeMargin: this.edgeMargin },
      changes: [...this._changes].map(([cell, material]) => [...parseCellKey(cell), material]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) };
  }
  static restore(data, defaults = {}) {
    if (!data || typeof data !== 'object' || data.version !== TERRAIN_VERSION || data.generationVersion !== TERRAIN_GENERATION_VERSION || !data.bounds || !Array.isArray(data.changes)) throw new TypeError('Invalid terrain save');
    const terrain = new Terrain({ ...defaults, ...data.bounds });
    terrain._loadChanges(data.changes.map(row => Array.isArray(row) && row.length === 4 ? [[row[0], row[1], row[2]], row[3]] : row));
    return terrain;
  }
}
