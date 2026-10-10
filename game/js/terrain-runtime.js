// Runtime contract helpers kept independent of Three.js for browser-free tests.
import { Terrain, TERRAIN_VERSION, TERRAIN_GENERATION_VERSION } from './terrain.js';

export function createFarmTerrain(slot) {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > 9) return null;
  return new Terrain({ originX: slot * 180 + 108, originZ: -53, width: 38, depth: 78,
    surfaceY: 0, minY: -8, maxY: 16, chunkSize: 16, editable: true, edgeMargin: 1 });
}

export function validFarmTerrainCell(terrain, slot, x, y, z) {
  return !!terrain && terrain.editable && terrain.originX === slot * 180 + 108 &&
    x >= slot * 180 + 108 && x <= slot * 180 + 145 && z >= -53 && z <= 24 &&
    y >= -8 && y <= 16 && terrain.isEditable(x, y, z);
}

export function restoreFarmTerrain(data, slot) {
  const expected = createFarmTerrain(slot);
  if (!expected) return null;
  try {
    const terrain = Terrain.restore(data);
    if (terrain.originX !== expected.originX || terrain.originZ !== -53 ||
        terrain.width !== 38 || terrain.depth !== 78 || terrain.minY !== -8 || terrain.maxY !== 16 ||
        (terrain.edgeMargin !== 0 && terrain.edgeMargin !== 1)) return null;
    if (terrain.edgeMargin === 1) return terrain;
    const migrated = expected.serialize();
    migrated.changes = terrain.serialize().changes.filter(row => row[0] > expected.originX && row[0] < expected.originX + expected.width - 1 &&
      row[2] > expected.originZ && row[2] < expected.originZ + expected.depth - 1 && row[1] > expected.minY);
    return Terrain.restore(migrated);
  } catch (_) {
    // Generation 2 adds walkable relief. Preserve valid sparse edits from the
    // previous flat generation while all untouched cells adopt the new base.
    const bounds = data && data.bounds;
    if (!data || data.version !== TERRAIN_VERSION || data.generationVersion !== TERRAIN_GENERATION_VERSION - 1 ||
        !bounds || bounds.originX !== expected.originX || bounds.originZ !== -53 || bounds.width !== 38 ||
        bounds.depth !== 78 || bounds.minY !== -8 || bounds.maxY !== 16 || !Array.isArray(data.changes) || data.changes.length > 5000) return null;
    for (const row of data.changes) {
      if (!Array.isArray(row) || row.length !== 4 || !row.slice(0, 3).every(Number.isSafeInteger) ||
          !expected.isEditable(row[0], row[1], row[2]) || !['air', 'grass', 'dirt', 'stone', 'wood'].includes(row[3])) continue;
      expected.applyAuthoritativeCell(row[0], row[1], row[2], row[3]);
    }
    return expected;
  }
}

/** Apply the server's sparse authoritative map over the last serialized snapshot. */
export function restoreAuthoritativeFarmTerrain(data, canonicalEdits, slot) {
  const base = restoreFarmTerrain(data, slot) || createFarmTerrain(slot);
  if (!base) return null;
  if (!canonicalEdits || typeof canonicalEdits !== 'object' || Array.isArray(canonicalEdits)) return base;
  const changes = new Map((base.serialize().changes || []).map(row => [`${row[0]},${row[1]},${row[2]}`, row[3]]));
  const prefix = slot * 180 + 108;
  for (const [cell, entry] of Object.entries(canonicalEdits)) {
    const parts = cell.split(',').map(Number);
    const material = typeof entry === 'string' ? entry : entry && entry.material;
    if (parts.length !== 3 || !parts.every(Number.isSafeInteger) ||
        !base.isEditable(parts[0], parts[1], parts[2]) ||
        parts[0] < prefix || parts[0] > prefix + 37 || parts[1] < -8 || parts[1] > 16 ||
        parts[2] < -53 || parts[2] > 24 || !['air', 'grass', 'dirt', 'stone', 'wood'].includes(material)) continue;
    changes.set(cell, material);
  }
  try {
    const serialized = base.serialize();
    serialized.changes = [...changes].map(([key, material]) => [...key.split(',').map(Number), material]);
    return base.constructor.restore(serialized);
  } catch (_) { return null; }
}
