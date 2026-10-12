// World-wide terrain, saved with the farmer's existing terrain revision/inventory transaction.
import { Terrain, TERRAIN_VERSION, TERRAIN_GENERATION_VERSION } from './terrain.js';

export const WORLD_TERRAIN_BOUNDS = Object.freeze({ originX: -10, originZ: -78, width: 1791, depth: 159,
  surfaceY: 0, minY: -8, maxY: 16, chunkSize: 16, editable: true, edgeMargin: 0 });

export function createFarmTerrain(slot) {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > 9) return null;
  return new Terrain(WORLD_TERRAIN_BOUNDS);
}
export function validFarmTerrainCell(terrain, slot, x, y, z) {
  return Number.isSafeInteger(slot) && slot >= 0 && slot <= 9 && !!terrain && terrain.isEditable(x, y, z);
}
export function restoreFarmTerrain(data, slot) {
  const terrain = createFarmTerrain(slot);
  if (!terrain || !data || data.version !== TERRAIN_VERSION ||
      ![1, 2, TERRAIN_GENERATION_VERSION].includes(data.generationVersion) ||
      !data.bounds || !Array.isArray(data.changes) || data.changes.length > 200000) return null;
  const b = data.bounds;
  const legacy = b.originX === slot * 180 + 108 && b.originZ === -53 && b.width === 38 && b.depth === 78;
  const current = b.originX === -10 && b.originZ === -78 && b.width === 1791 && b.depth === 159;
  if ((!legacy && !current) || b.minY !== -8 || b.maxY !== 16) return null;
  for (const row of data.changes) {
    if (!Array.isArray(row) || row.length !== 4 || !row.slice(0, 3).every(Number.isSafeInteger) ||
        !terrain.isEditable(row[0], row[1], row[2]) || !['air','grass','dirt','stone','wood'].includes(row[3])) return null;
    if (legacy && (row[0] < b.originX || row[0] >= b.originX + b.width || row[2] < -53 || row[2] > 24)) return null;
    terrain.applyAuthoritativeCell(...row);
  }
  return terrain;
}
export function restoreAuthoritativeFarmTerrain(serialized, canonicalEdits, slot) {
  const terrain = restoreFarmTerrain(serialized, slot) || createFarmTerrain(slot);
  if (!terrain) return null;
  if (canonicalEdits && typeof canonicalEdits === 'object' && !Array.isArray(canonicalEdits)) {
    for (const [key, entry] of Object.entries(canonicalEdits)) {
      const coords = key.split(',').map(Number);
      const material = typeof entry === 'string' ? entry : entry && entry.material;
      if (coords.length === 3 && coords.every(Number.isSafeInteger) && terrain.isEditable(...coords))
        terrain.applyAuthoritativeCell(...coords, material);
    }
  }
  terrain.getChangedChunkKeys();
  return terrain;
}
