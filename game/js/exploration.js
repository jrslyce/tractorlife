// Deterministic, renderer- and browser-independent world exploration.
// Inventory rewards use Inventory.addItem(itemId, qty); failed additions leave
// a cache undiscovered so it can be collected after making room.
const VERSION = 1;
const MAX_LOCATIONS = 128;
const MAX_SEED = 0xffffffff;
const DEFAULT_RADIUS = 18;
const DEFINITIONS = [
  { id: 'old-quarry', name: 'Old Quarry', type: 'landmark', x: 240, z: 59, radius: 22, goal: 'find the old quarry' },
  { id: 'north-ridge', name: 'North Ridge', type: 'landmark', x: 1440, z: 58, radius: 24, goal: 'scout the ridge' },
  { id: 'supply-cache-west', name: 'Hidden Supply Cache', type: 'cache', x: 28, z: 58, radius: 14, reward: { itemId: 'water_jug', qty: 2 } },
  { id: 'supply-cache-east', name: 'Hidden Supply Cache', type: 'cache', x: 980, z: 60, radius: 14, reward: { itemId: 'fuel_can', qty: 1 } },
  { id: 'supply-cache-south', name: 'Hidden Supply Cache', type: 'cache', x: 1680, z: 58, radius: 14, reward: { itemId: 'repair_kit', qty: 1 } },
];

const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function Exploration({ seed = 1, discoveryRadius = DEFAULT_RADIUS } = {}) {
  const normalizedSeed = Number(seed);
  const worldSeed = Number.isSafeInteger(normalizedSeed) && normalizedSeed >= 0 && normalizedSeed <= MAX_SEED ? normalizedSeed : 1;
  const radius = finite(discoveryRadius) ? Math.max(1, Math.min(100, discoveryRadius)) : DEFAULT_RADIUS;
  // Seed shifts locations deterministically without relying on runtime RNG.
  const shiftX = ((Math.imul(worldSeed ^ 0x9e3779b9, 1664525) >>> 0) % 17) - 8;
  const shiftZ = ((Math.imul(worldSeed ^ 0x85ebca6b, 22695477) >>> 0) % 17) - 8;
  const locations = DEFINITIONS.map((entry, index) => ({
    ...entry,
    x: entry.x + (index === 0 || index === 2 ? shiftX : -shiftX),
    z: entry.z + (index % 2 ? shiftZ : -shiftZ),
  }));
  const discovered = new Set();

  function list() { return clone(locations.map(({ id, name, type, x, z, radius: r, goal }) => ({ id, name, type, x, z, radius: r || radius, goal: goal || null, discovered: discovered.has(id) }))); }

  // Returns newly discovered events. Cache rewards are marked only after a
  // successful addItem call; landmarks are one-time discoveries automatically.
  function update(x, z, inventory) {
    if (!finite(x) || !finite(z)) return [];
    const events = [];
    for (const location of locations) {
      if (discovered.has(location.id)) continue;
      const reach = location.radius || radius;
      const dx = x - location.x, dz = z - location.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      let reward = null;
      if (location.type === 'cache') {
        if (!inventory || typeof inventory.addItem !== 'function') continue;
        const result = inventory.addItem(location.reward.itemId, location.reward.qty);
        if (!result || result.ok !== true) continue;
        reward = { ...location.reward };
      }
      discovered.add(location.id);
      events.push({ id: location.id, name: location.name, type: location.type, goal: location.goal || null, reward });
    }
    return clone(events);
  }

  function serialize() { return { version: VERSION, seed: worldSeed, discovered: Array.from(discovered).sort() }; }
  function restore(data) {
    if (!data || data.version !== VERSION || data.seed !== worldSeed || !Array.isArray(data.discovered) || data.discovered.length > MAX_LOCATIONS) return false;
    const validIds = new Set(locations.map(item => item.id));
    const next = new Set();
    for (const id of data.discovered) {
      if (typeof id !== 'string' || !validIds.has(id) || next.has(id)) return false;
      next.add(id);
    }
    discovered.clear();
    for (const id of next) discovered.add(id);
    return true;
  }

  return { list, update, serialize, restore };
}

export default Exploration;
