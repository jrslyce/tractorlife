import { getBreakRule } from './resource-rules.js';

const PLACEABLE_MATERIALS = new Set(['dirt', 'stone', 'wood']);

/** Commit terrain edits and their inventory delta together on the local client. */
export class TerrainActions {
  constructor({ terrain, inventory }) {
    if (!terrain || !inventory) throw new TypeError('Terrain and inventory are required');
    this.terrain = terrain;
    this.inventory = inventory;
  }

  breakCell(x, y, z, toolId = '') {
    const material = this.terrain.getCell(x, y, z);
    if (!material) return { ok: false, error: 'Target changed.' };
    const rule = getBreakRule(material === 'grass' ? 'dirt' : material, toolId, 'terrain');
    if (!rule) return { ok: false, error: material === 'stone' ? 'A pickaxe is required.' : 'This material cannot be gathered by hand.' };
    if (!this.inventory.canAdd(rule.itemId, rule.quantity)) return { ok: false, error: 'Inventory full.' };
    const result = this.terrain.breakCell(x, y, z, material);
    if (!result.success) return { ok: false, error: 'Target changed.' };
    // canAdd and addItem are synchronous; no user event can interleave this commit.
    const added = this.inventory.addItem(rule.itemId, rule.quantity);
    if (!added?.ok) throw new Error('Inventory changed during terrain break transaction');
    return { ok: true, material, itemId: rule.itemId, quantity: rule.quantity, duration: rule.duration };
  }

  placeCell(x, y, z, material) {
    if (!PLACEABLE_MATERIALS.has(material)) return { ok: false, error: 'Invalid building material.' };
    if (this.inventory.getCount(material) < 1) return { ok: false, error: `No ${material} available.` };
    const placed = this.terrain.placeCell(x, y, z, material);
    if (!placed.success) return { ok: false, error: placed.reason };
    if (this.inventory.consumeItem(material, 1) !== 1) {
      // Consumption can only fail if inventory mutates reentrantly; fail loudly
      // rather than silently leaving a free placed cell behind.
      throw new Error('Inventory changed during terrain placement transaction');
    }
    return { ok: true, material, quantity: 1 };
  }
}

export default TerrainActions;
