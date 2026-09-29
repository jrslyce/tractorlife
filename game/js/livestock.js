// Rendering-free livestock simulation. Time and daily care are measured in seconds.
const DEFAULTS = {
  dayLength: 120, initialAnimals: [{ id: 1, kind: 'cow' }],
  feedCost: { feed: 1 }, waterCost: { water: 1 }, fenceRepairCost: { wood: 2 }, herdCost: {},
  fenceRepairAmount: 0.35, feedWelfare: 0.12, waterWelfare: 0.12,
  neglectPenalty: 0.18, welfareRecovery: 0.04, escapeBaseChance: 0.001,
  fenceEscapeChance: 0.025, stormEscapeChance: 0.04, producePerCare: 1
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const copy = v => JSON.parse(JSON.stringify(v));

export class Livestock {
  constructor({ seed = 1, config = {}, animals, fenceCondition = 1 } = {}) {
    this.seed = Number(seed) >>> 0;
    this.config = { ...DEFAULTS, ...copy(config) };
    this.config.feedCost = { ...DEFAULTS.feedCost, ...(config.feedCost || {}) };
    this.config.waterCost = { ...DEFAULTS.waterCost, ...(config.waterCost || {}) };
    this.config.fenceRepairCost = { ...DEFAULTS.fenceRepairCost, ...(config.fenceRepairCost || {}) };
    this.time = 0; this.day = 0; this.dayTime = 0;
    this.fenceCondition = clamp(num(fenceCondition, 1), 0, 1);
    this.animals = copy(animals ?? this.config.initialAnimals).map((a, i) => ({
      id: a.id ?? i + 1, kind: a.kind || 'cow', welfare: clamp(num(a.welfare, 1), 0, 1),
      fed: !!a.fed, watered: !!a.watered, escaped: !!a.escaped,
      feedToday: !!a.feedToday, waterToday: !!a.waterToday
    }));
    this.events = []; this.jobs = [];
  }

  _random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  update(dt, weather = 'clear') {
    this.events = []; this.jobs = [];
    const type = typeof weather === 'string' ? weather : (weather.weather || weather.type || 'clear');
    if (!Number.isFinite(dt) || dt <= 0) return this.getStatus();
    this.time += dt;
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(remaining, this.config.dayLength - this.dayTime);
      this.dayTime += step; remaining -= step;
      if (this.dayTime >= this.config.dayLength) this._finishDay(type);
    }
    return this.getStatus();
  }
  _finishDay(weather) {
    this.day++; this.dayTime = 0;
    for (const animal of this.animals) {
      if (!animal.escaped) {
        if (!animal.feedToday || !animal.waterToday) {
          animal.welfare = clamp(animal.welfare - this.config.neglectPenalty, 0, 1);
          this.events.push({ type: 'care-missed', animalId: animal.id, day: this.day });
        } else animal.welfare = clamp(animal.welfare + this.config.welfareRecovery, 0, 1);
        // A single seeded roll per animal/day keeps outcomes reproducible across saves.
        const storm = weather === 'storm' || weather === 'thunderstorm';
        const chance = this.config.escapeBaseChance + (1 - this.fenceCondition) * this.config.fenceEscapeChance + (storm ? this.config.stormEscapeChance : 0);
        if (this._random() < chance) {
          animal.escaped = true;
          this.events.push({ type: 'animal-escaped', animalId: animal.id, day: this.day });
        }
      }
      animal.feedToday = false; animal.waterToday = false; animal.fed = false; animal.watered = false;
    }
    this._refreshJobs();
  }
  _refreshJobs() {
    this.jobs = [];
    for (const a of this.animals) {
      if (a.escaped) this.jobs.push({ action: 'herd', animalId: a.id, priority: 'urgent' });
      else {
        if (!a.feedToday) this.jobs.push({ action: 'feed', animalId: a.id, priority: 'normal' });
        if (!a.waterToday) this.jobs.push({ action: 'water', animalId: a.id, priority: 'normal' });
      }
    }
    if (this.fenceCondition < 1) this.jobs.push({ action: 'repair-fence', priority: this.fenceCondition < 0.35 ? 'urgent' : 'normal' });
  }
  interact(action, animalId, resources = {}) {
    if (animalId && typeof animalId === 'object' && arguments.length < 3) { resources = animalId; animalId = undefined; }
    const fail = reason => ({ success: false, reason, costs: {}, rewards: {}, events: [] });
    const a = this.animals.find(x => x.id === animalId) || (Number.isInteger(animalId) ? this.animals[animalId] : null);
    let costs = {}, rewards = {};
    if (action === 'feed' || action === 'water' || action === 'herd') {
      if (!a) return fail('animal-not-found');
      if (action === 'herd' && !a.escaped) return fail('animal-not-escaped');
      if (action !== 'herd' && a.escaped) return fail('animal-escaped');
      if (action === 'feed') { if (a.feedToday) return fail('already-fed'); costs = this.config.feedCost; rewards = { produce: Math.max(0, Math.floor(this.config.producePerCare * a.welfare)) }; }
      if (action === 'water') { if (a.waterToday) return fail('already-watered'); costs = this.config.waterCost; }
    } else if (action === 'repair-fence') {
      if (this.fenceCondition >= 1) return fail('fence-intact'); costs = this.config.fenceRepairCost;
    } else return fail('unknown-action');
    costs = copy(costs); rewards = copy(rewards);
    for (const [k, n] of Object.entries(costs)) if (num(resources[k]) < n) return fail('insufficient-resources');
    for (const [k, n] of Object.entries(costs)) resources[k] = num(resources[k]) - n;
    for (const [k, n] of Object.entries(rewards)) resources[k] = num(resources[k]) + n;
    if (action === 'feed') { a.feedToday = a.fed = true; a.welfare = clamp(a.welfare + this.config.feedWelfare, 0, 1); }
    if (action === 'water') { a.waterToday = a.watered = true; a.welfare = clamp(a.welfare + this.config.waterWelfare, 0, 1); }
    if (action === 'herd') { a.escaped = false; a.welfare = clamp(a.welfare - 0.05, 0, 1); }
    if (action === 'repair-fence') this.fenceCondition = clamp(this.fenceCondition + this.config.fenceRepairAmount, 0, 1);
    const event = { type: action, ...(a ? { animalId: a.id } : {}) };
    this.events.push(event); this._refreshJobs();
    return { success: true, costs, rewards, events: [copy(event)] };
  }
  queryEscaped() { return copy(this.animals.filter(a => a.escaped)); }
  queryCareNeeds() { return copy(this.animals.filter(a => !a.escaped && (!a.feedToday || !a.waterToday)).map(a => ({ animalId: a.id, feed: !a.feedToday, water: !a.waterToday }))); }
  getStatus() { this._refreshJobs(); return { time: this.time, day: this.day, dayTime: this.dayTime, fenceCondition: this.fenceCondition, animals: copy(this.animals), escaped: this.queryEscaped(), careNeeds: this.queryCareNeeds(), jobs: copy(this.jobs), events: copy(this.events) }; }
  query() { return this.getStatus(); }
  serialize() { return { version: 1, seed: this.seed, config: copy(this.config), time: this.time, day: this.day, dayTime: this.dayTime, fenceCondition: this.fenceCondition, animals: copy(this.animals), events: copy(this.events) }; }
  restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.animals)) return false;
    const restored = new Livestock({ seed: data.seed, config: data.config, animals: data.animals, fenceCondition: data.fenceCondition });
    this.seed = restored.seed; this.config = restored.config; this.animals = restored.animals;
    this.time = Math.max(0, num(data.time)); this.day = Math.max(0, num(data.day));
    this.dayTime = clamp(num(data.dayTime), 0, Math.max(0, this.config.dayLength)); this.fenceCondition = restored.fenceCondition;
    this.events = copy(data.events || []); this._refreshJobs(); return true;
  }
}
