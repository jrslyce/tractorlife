// Pure woodland simulation. Positions/radii are world units; dt and all growth
// timers are seconds. Resources are integer-like counts stored on the caller's
// object. No rendering or Three.js state is used here.

const DEFAULTS = {
  initialTrees: 8,
  initialOrchards: 3,
  growthSeconds: 120,
  saplingSeconds: 90,
  fruitSeconds: 180,
  wildlifeDeclinePerTree: 0.035,
  wildlifeRecoveryPerSecond: 0.0002,
  initialWildlife: 1,
  maxWildlife: 1,
  stormDebrisChance: 0.65,
  stormDebrisPerSecond: 0.08,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }

export class Woodland {
  constructor({ seed = 1, config = {}, trees, orchards, saplings, debris, wildlife } = {}) {
    this.config = { ...DEFAULTS, ...config };
    this.seed = (Number(seed) >>> 0) || 1;
    this.time = 0;
    this._nextId = 1;
    this.events = [];
    this.trees = trees ? copy(trees) : [];
    this.saplings = saplings ? copy(saplings) : [];
    this.orchards = orchards ? copy(orchards) : [];
    this.debris = debris ? copy(debris) : [];
    for (const collection of [this.trees, this.saplings, this.orchards, this.debris]) {
      for (const item of collection) this._nextId = Math.max(this._nextId, (Number(item.id) || 0) + 1);
    }
    if (!trees && !saplings && !orchards && !debris) this._populate();
    this.wildlife = wildlife == null ? this.config.initialWildlife : clamp(Number(wildlife) || 0, 0, this.config.maxWildlife);
  }

  _random() {
    // Mulberry32: compact deterministic generator; its state is serializable.
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  _id() { return this._nextId++; }
  _populate() {
    for (let i = 0; i < this.config.initialTrees; i++) {
      const x = (i % 4) * 5 - 8;
      const z = Math.floor(i / 4) * 6 - 3;
      this.trees.push({ id: this._id(), x, z, age: this.config.growthSeconds * (1 + this._random()), stage: 'mature', radius: 0.8 });
    }
    for (let i = 0; i < this.config.initialOrchards; i++) {
      this.orchards.push({ id: this._id(), x: -6 + i * 6, z: 12, age: this.config.fruitSeconds, watered: false, pruned: false, fruit: true, radius: 0.7 });
    }
  }

  // Weather accepts a string or { type } object. Storms can add fallen branches.
  update(dt, weather = 'clear') {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    const kind = typeof weather === 'string' ? weather : (weather && weather.type) || 'clear';
    this.time += dt;
    this.events = [];
    for (const tree of this.trees) {
      if (tree.stage === 'mature') continue;
      tree.age = (tree.age || 0) + dt;
      if (tree.age >= this.config.growthSeconds) {
        tree.stage = 'mature'; tree.radius = 0.8;
        this.events.push({ type: 'tree-grown', id: tree.id });
      }
    }
    for (const sapling of [...this.saplings]) {
      sapling.age = (sapling.age || 0) + dt;
      if (sapling.age >= this.config.saplingSeconds) {
        this.saplings.splice(this.saplings.indexOf(sapling), 1);
        this.trees.push({ ...sapling, stage: 'young', age: 0, radius: 0.45 });
        this.events.push({ type: 'sapling-grown', id: sapling.id });
      }
    }
    for (const orchard of this.orchards) {
      if (!orchard.fruit) {
        orchard.age = (orchard.age || 0) + dt;
        if (orchard.age >= this.config.fruitSeconds) orchard.fruit = true;
      }
    }
    if (kind === 'storm' || kind === 'thunderstorm') {
      const expected = dt * this.config.stormDebrisPerSecond;
      const count = Math.floor(expected) + (this._random() < expected % 1 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        if (this.trees.length && this._random() > this.config.stormDebrisChance) continue;
        const tree = this.trees.length ? this.trees[Math.floor(this._random() * this.trees.length)] : { x: (this._random() - 0.5) * 30, z: (this._random() - 0.5) * 30 };
        const debris = { id: this._id(), x: tree.x + (this._random() - 0.5) * 2, z: tree.z + (this._random() - 0.5) * 2, kind: 'branch', radius: 0.35 };
        this.debris.push(debris); this.events.push({ type: 'branch-fallen', id: debris.id });
      }
    }
    this.wildlife = clamp(this.wildlife + this.config.wildlifeRecoveryPerSecond * dt, 0, this.config.maxWildlife);
    if (this.wildlife > 0 && this.orchards.some(o => o.fruit)) {
      const chance = Math.min(1, dt / 120 * this.wildlife);
      if (this._random() < chance) {
        const crop = this.orchards.find(o => o.fruit);
        crop.fruit = false; crop.age = 0;
        this.events.push({ type: 'crop-nibbled', id: crop.id, crop: 'fruit' });
      }
    }
    return copy(this.events);
  }

  // Actions: plant(x,z), water, prune, harvest, clear-branch, clear-stump,
  // clear-tree, and fell. Targets are IDs; plant takes targetId as {x,z}.
  // Resource costs/rewards are applied atomically only when the action succeeds.
  interact(action, targetId, resources = {}) {
    const fail = (reason, requiredCosts = {}) => ({ success: false, reason, costs: { ...requiredCosts }, events: [] });
    const find = list => list.find(item => item.id === targetId);
    const charge = costs => Object.entries(costs).every(([k, n]) => (Number(resources[k]) || 0) >= n);
    const apply = (costs, rewards = {}) => {
      for (const [k, n] of Object.entries(costs)) resources[k] = (Number(resources[k]) || 0) - n;
      for (const [k, n] of Object.entries(rewards)) resources[k] = (Number(resources[k]) || 0) + n;
    };
    let costs = {}, rewards = {}, event;
    if (action === 'plant') {
      if (!targetId || !Number.isFinite(targetId.x) || !Number.isFinite(targetId.z)) return fail('invalid-location');
      costs = { sapling: 1 };
      if (!charge(costs)) return fail('insufficient-resources', costs);
      const sapling = { id: this._id(), x: targetId.x, z: targetId.z, age: 0, radius: 0.3 };
      this.saplings.push(sapling); apply(costs); event = { type: 'sapling-planted', id: sapling.id };
      return { success: true, costs, rewards, target: copy(sapling), events: [event] };
    }
    let item;
    if (action === 'water' || action === 'prune' || action === 'harvest') item = find(this.orchards);
    else if (action === 'clear-branch') item = find(this.debris);
    else if (action === 'clear-stump' || action === 'clear-tree' || action === 'fell') item = find(this.trees);
    if (!item) return fail('target-not-found');
    if (action === 'water') {
      if (item.fruit) return fail('already-ripe'); costs = { water: 1 };
      item.age = Math.min(this.config.fruitSeconds, (item.age || 0) + this.config.fruitSeconds * 0.15);
    } else if (action === 'prune') {
      if (item.fruit) return fail('already-ripe');
      if (item.pruned) return fail('already-pruned');
      costs = { toolUse: 1 }; item.pruned = true; item.age += this.config.fruitSeconds * 0.25;
    } else if (action === 'harvest') {
      if (!item.fruit) return fail('not-ripe'); item.fruit = false; item.age = 0; item.pruned = false; rewards = { fruit: 1 };
    } else if (action === 'clear-branch') {
      costs = {}; rewards = { firewood: 1 }; this.debris.splice(this.debris.indexOf(item), 1);
    } else if (action === 'clear-stump' || action === 'clear-tree' || action === 'fell') {
      if (action === 'clear-stump' && item.stage !== 'stump') return fail('not-a-stump');
      costs = action === 'clear-stump' ? { toolUse: 1 } : {};
       if (!charge(costs)) return fail('insufficient-resources', costs);
      rewards = action === 'fell' || action === 'clear-tree' ? { firewood: 2 } : {};
      this.trees.splice(this.trees.indexOf(item), 1);
      if (action !== 'clear-stump') this.trees.push({ id: this._id(), x: item.x, z: item.z, stage: 'stump', radius: 0.55 });
      this.wildlife = clamp(this.wildlife - this.config.wildlifeDeclinePerTree, 0, this.config.maxWildlife);
    } else return fail('unknown-action');
    if (!charge(costs)) return fail('insufficient-resources', costs);
    apply(costs, rewards);
    event = { type: action, id: item.id };
    return { success: true, costs, rewards, events: [event] };
  }

  queryObstacles(x, z, radius = 0) {
    const blockers = [];
    for (const item of [...this.trees, ...this.saplings, ...this.debris]) {
      if (item.stage === 'stump' || item.stage === 'mature' || item.stage === 'young' || this.saplings.includes(item) || this.debris.includes(item)) {
        const r = (item.radius || 0.3) + Math.max(0, radius);
        if ((item.x - x) ** 2 + (item.z - z) ** 2 <= r * r) blockers.push({ id: item.id, kind: item.stage === 'stump' ? 'stump' : this.debris.includes(item) ? 'branch' : this.saplings.includes(item) ? 'sapling' : 'tree', x: item.x, z: item.z, radius: item.radius || 0.3 });
      }
    }
    return blockers;
  }
  queryWildlife() { return { population: this.wildlife, level: this.wildlife > 0.66 ? 'abundant' : this.wildlife > 0.25 ? 'present' : this.wildlife > 0 ? 'scarce' : 'absent' }; }
  getCropNibbleEvents() { return this.events.filter(e => e.type === 'crop-nibbled').map(copy); }

  // Stable simulation IDs let a held action revalidate its target at completion.
  getHarvestTargets() {
    return this.trees.filter(tree => tree.stage === 'mature' || tree.stage === 'young').map(tree => ({
      id: tree.id, x: tree.x, z: tree.z, kind: 'tree', material: 'wood',
      radius: tree.radius || (tree.stage === 'young' ? 0.45 : 0.8),
      stage: tree.stage, revision: tree.stage,
    }));
  }

  // The caller owns hold timing, reach, and farm permissions. Inventory.addItem
  // is an all-or-nothing synchronous insertion; never remove a tree on failure.
  harvestTree(id, inventory, expectedRevision) {
    const fail = (reason, message) => ({ success: false, reason, message, costs: {}, rewards: {}, events: [], target: id });
    const tree = this.trees.find(item => item.id === id && (item.stage === 'mature' || item.stage === 'young'));
    if (!tree) return fail('target-not-found', 'That tree is no longer available.');
    if (expectedRevision != null && tree.stage !== expectedRevision) return fail('target-changed', 'The tree changed. Start chopping again.');
    if (!inventory || typeof inventory.canAdd !== 'function' || typeof inventory.addItem !== 'function') {
      return fail('invalid-inventory', 'Inventory is unavailable.');
    }
    if (!inventory.canAdd('wood', 3)) return fail('inventory-full', 'Inventory full. Make room for wood first.');
    const added = inventory.addItem('wood', 3);
    if (!added?.ok) return fail('inventory-full', 'Inventory full. Make room for wood first.');
    this.trees.splice(this.trees.indexOf(tree), 1);
    const stump = { id: this._id(), x: tree.x, z: tree.z, stage: 'stump', radius: 0.55 };
    this.trees.push(stump);
    this.wildlife = clamp(this.wildlife - this.config.wildlifeDeclinePerTree, 0, this.config.maxWildlife);
    return { success: true, reason: 'harvested', message: 'Collected 3 wood.', costs: {}, rewards: { wood: 3 },
      events: [{ type: 'tree-harvested', id, stumpId: stump.id, material: 'wood', quantity: 3 }], target: id };
  }

  serialize() {
    return { version: 1, seed: this.seed >>> 0, time: this.time, nextId: this._nextId, config: copy(this.config), trees: copy(this.trees), saplings: copy(this.saplings), orchards: copy(this.orchards), debris: copy(this.debris), wildlife: this.wildlife, events: copy(this.events) };
  }
  restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.trees) || !Array.isArray(data.orchards)) return false;
    this.seed = data.seed >>> 0 || 1; this.time = Number(data.time) || 0; this._nextId = Number(data.nextId) || 1;
    this.config = { ...DEFAULTS, ...(data.config || {}) };
    this.trees = copy(data.trees); this.saplings = copy(data.saplings || []); this.orchards = copy(data.orchards); this.debris = copy(data.debris || []);
    this.wildlife = clamp(Number(data.wildlife) || 0, 0, this.config.maxWildlife); this.events = copy(data.events || []);
    return true;
  }
}
