const VEHICLES = new Set(['tractor', 'combine', 'truck']);
const UPGRADES = Object.freeze({
  engine: { name: 'Engine tuning', costs: [650, 1100], speedPerLevel: 0.08 },
  tires: { name: 'All-terrain tires', costs: [450, 800], steeringPerLevel: 0.12 }
});

export class VehicleUpgrades {
  constructor() { this.levels = Object.fromEntries([...VEHICLES].map(type => [type, { engine: 0, tires: 0 }])); }

  getLevel(vehicle, upgrade) {
    return VEHICLES.has(vehicle) && UPGRADES[upgrade] ? this.levels[vehicle][upgrade] : 0;
  }

  quote(vehicle, upgrade) {
    const definition = UPGRADES[upgrade];
    if (!VEHICLES.has(vehicle) || !definition) return null;
    const level = this.levels[vehicle][upgrade];
    return { vehicle, upgrade, name: definition.name, level, maxLevel: definition.costs.length,
      cost: definition.costs[level] ?? null };
  }

  buy(vehicle, upgrade, money) {
    const definition = UPGRADES[upgrade];
    if (!VEHICLES.has(vehicle) || !definition) return { ok: false, reason: 'invalid-upgrade' };
    const level = this.levels[vehicle][upgrade];
    if (level >= definition.costs.length) return { ok: false, reason: 'max-level' };
    const cost = definition.costs[level];
    if (!Number.isFinite(money) || money < cost) return { ok: false, reason: 'insufficient-funds', cost };
    this.levels[vehicle][upgrade]++;
    return { ok: true, cost, money: money - cost, level: level + 1, vehicle, upgrade };
  }

  effects(vehicle) {
    const levels = VEHICLES.has(vehicle) ? this.levels[vehicle] : { engine: 0, tires: 0 };
    return { speedMultiplier: 1 + levels.engine * UPGRADES.engine.speedPerLevel,
      steeringMultiplier: 1 + levels.tires * UPGRADES.tires.steeringPerLevel };
  }

  serialize() { return { version: 1, levels: JSON.parse(JSON.stringify(this.levels)) }; }

  restore(data) {
    if (!data || data.version !== 1 || !data.levels || typeof data.levels !== 'object') return false;
    const next = Object.fromEntries([...VEHICLES].map(type => [type, { engine: 0, tires: 0 }]));
    for (const vehicle of VEHICLES) for (const upgrade of Object.keys(UPGRADES)) {
      const value = data.levels[vehicle]?.[upgrade];
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > UPGRADES[upgrade].costs.length)) return false;
      next[vehicle][upgrade] = value || 0;
    }
    this.levels = next;
    return true;
  }
}
