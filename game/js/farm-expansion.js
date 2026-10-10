export const EXPANSION_COST = 250;
export const EXPANSION_DEF = Object.freeze({ originX: 113, originZ: -54, cols: 30, rows: 24, tile: 1 });

export function expansionCenter(farmSlot) {
  if (!Number.isSafeInteger(farmSlot) || farmSlot < 0 || farmSlot > 9) return null;
  return { x: farmSlot * 180 + EXPANSION_DEF.originX + (EXPANSION_DEF.cols - 1) / 2,
    z: EXPANSION_DEF.originZ + (EXPANSION_DEF.rows - 1) / 2 };
}

export function expansionPlotOccupied(entries, farmSlot) {
  const center = expansionCenter(farmSlot);
  if (!center || !Array.isArray(entries)) return false;
  const minX = center.x - EXPANSION_DEF.cols / 2 - 4;
  const maxX = center.x + EXPANSION_DEF.cols / 2 + 4;
  const minZ = center.z - EXPANSION_DEF.rows / 2 - 4;
  const maxZ = center.z + EXPANSION_DEF.rows / 2 + 4;
  return entries.some(entry => entry && Number.isFinite(entry.x) && Number.isFinite(entry.z) &&
    entry.x >= minX && entry.x <= maxX && entry.z >= minZ && entry.z <= maxZ);
}

export function expansionPurchaseState({ expanded, balance, occupied }) {
  if (expanded) return { ok: false, reason: 'already-expanded' };
  if (occupied) return { ok: false, reason: 'occupied' };
  if (!Number.isFinite(balance) || balance < EXPANSION_COST) return { ok: false, reason: 'insufficient-funds' };
  return { ok: true, cost: EXPANSION_COST, balance: Math.floor(balance) - EXPANSION_COST };
}
