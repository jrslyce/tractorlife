// Small persistent milestone system. Progress is derived from existing game state.
const DEFINITIONS = [
  { id: 'first-harvest', name: 'First Harvest', description: 'Harvest your first crop.', test: s => s.harvested >= 1 },
  { id: 'seasoned-farmer', name: 'Seasoned Farmer', description: 'Harvest 100 crops.', test: s => s.harvested >= 100 },
  { id: 'world-walker', name: 'World Walker', description: 'Discover three world sites.', test: s => s.discoveries >= 3 },
  { id: 'good-neighbors', name: 'Good Neighbors', description: 'Raise a herd of four animals.', test: s => s.animals >= 4 },
  { id: 'soil-steward', name: 'Soil Steward', description: 'Keep average soil fertility above 80%.', test: s => s.fertility >= 80 }
];

export class Achievements {
  constructor() { this.unlocked = new Set(); }

  update(progress = {}) {
    const stats = {
      harvested: Math.max(0, Number(progress.harvested) || 0),
      discoveries: Math.max(0, Number(progress.discoveries) || 0),
      animals: Math.max(0, Number(progress.animals) || 0),
      fertility: Math.max(0, Number(progress.fertility) || 0)
    };
    const earned = [];
    for (const definition of DEFINITIONS) {
      if (!this.unlocked.has(definition.id) && definition.test(stats)) {
        this.unlocked.add(definition.id);
        earned.push({ id: definition.id, name: definition.name, description: definition.description });
      }
    }
    return earned;
  }

  list() {
    return DEFINITIONS.map(({ id, name, description }) => ({ id, name, description, unlocked: this.unlocked.has(id) }));
  }

  serialize() { return { version: 1, unlocked: Array.from(this.unlocked) }; }

  restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.unlocked)) return false;
    const known = new Set(DEFINITIONS.map(definition => definition.id));
    this.unlocked = new Set(data.unlocked.filter(id => typeof id === 'string' && known.has(id)));
    return true;
  }
}
