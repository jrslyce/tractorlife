// Deterministic, rendering-free river and irrigation simulation. dt is seconds.
const DEFAULTS = {
  baseRiverLevel: 0.35, minRiverLevel: 0, maxRiverLevel: 1,
  riverResponsePerSecond: 0.025, weatherLevel: { rain: 0.2, storm: 0.45, drought: -0.3, clear: 0, frost: -0.04, wind: 0 },
  evaporationPerSecond: 0.00008, rainRechargePerSecond: 0.00015,
  channelCost: { wood: 3 }, pumpCost: { wood: 5, metal: 2 },
  channelWaterPerSecond: 0.025, pumpWaterPerSecond: 0.06, pumpFuelPerSecond: 0.01,
  sprinklerCost: { wood: 4, metal: 2 }, sprinklerWaterPerSecond: 0.025,
  irrigationCost: { water: 1 }, irrigationBoost: 0.25,
  floodLevel: 0.72, floodDamagePerSecond: 0.025,
  erosionLevel: 0.62, erosionPerSecond: 0.008,
  bankRepairCost: { stone: 2 }, bankRepairAmount: 0.35,
  pollutionDecayPerSecond: 0.0002, pollutionPerFish: 0.08,
  cleaningCost: { cleanup_kit: 1 }, cleaningAmount: 0.3,
  fishBase: 5, fishRecoveryPerSecond: 0.002, fishPollutionPenalty: 0.8,
  fishingCost: {}, fishPerCatch: 1
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const copy = value => JSON.parse(JSON.stringify(value));
const number = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

export class WaterSystem {
  constructor({ seed = 1, config = {}, riverLevel, pollution = 0, bankHealth = 1, fishHealth = 1, fields = [] } = {}) {
    this.seed = Number(seed) >>> 0;
    this.config = { ...DEFAULTS, ...copy(config), weatherLevel: { ...DEFAULTS.weatherLevel, ...(config.weatherLevel || {}) } };
    this.time = 0;
    this.riverLevel = clamp(number(riverLevel, this.config.baseRiverLevel), this.config.minRiverLevel, this.config.maxRiverLevel);
    this.pollution = clamp(number(pollution), 0, 1);
    this.bankHealth = clamp(number(bankHealth, 1), 0, 1);
    this.fishHealth = clamp(number(fishHealth, 1), 0, 1);
    this.fields = fields.map((f, i) => ({ id: f.id ?? i, elevation: number(f.elevation), health: clamp(number(f.health, 1), 0, 1), water: clamp(number(f.water), 0, 1), boost: Math.max(0, number(f.boost)), flooded: !!f.flooded }));
    this.channel = false;
    this.pump = false;
    this.sprinkler = false;
    this.pumpFuel = 0;
    this.events = [];
  }

  update(dt, climateState = {}) {
    this.events = [];
    if (!Number.isFinite(dt) || dt <= 0) return this.getStatus();
    const weather = typeof climateState === 'string' ? climateState : (climateState.weather || climateState.type || 'clear');
    this.time += dt;
    const target = clamp(this.config.baseRiverLevel + number(climateState.riverLevelModifier, this.config.weatherLevel[weather] || 0), this.config.minRiverLevel, this.config.maxRiverLevel);
    const rate = this.config.riverResponsePerSecond * dt;
    this.riverLevel = clamp(this.riverLevel + clamp(target - this.riverLevel, -rate, rate), this.config.minRiverLevel, this.config.maxRiverLevel);
    this.pollution = clamp(this.pollution - this.config.pollutionDecayPerSecond * dt, 0, 1);
    if (weather === 'rain' || weather === 'storm' || weather === 'thunderstorm') {
      this.fields.forEach(f => { f.water = clamp(f.water + this.config.rainRechargePerSecond * dt * (weather === 'storm' || weather === 'thunderstorm' ? 2 : 1), 0, 1); });
    } else {
      this.fields.forEach(f => { f.water = clamp(f.water - this.config.evaporationPerSecond * dt, 0, 1); });
    }
    const pumping = this.pump && this.pumpFuel > 0;
    const pumpingSeconds = pumping ? (this.config.pumpFuelPerSecond > 0
      ? Math.min(dt, this.pumpFuel / this.config.pumpFuelPerSecond) : dt) : 0;
    const supply = this.channel ? this.config.channelWaterPerSecond : 0;
    if (pumping) {
      const used = Math.min(this.pumpFuel, this.config.pumpFuelPerSecond * dt);
      this.pumpFuel -= used;
    }
    const delivered = supply * dt + this.config.pumpWaterPerSecond * pumpingSeconds;
    if (delivered > 0) this.fields.forEach(f => { f.water = clamp(f.water + delivered, 0, 1); });
    if (this.sprinkler && (this.channel || pumping)) {
      const sprinklerWater = this.config.sprinklerWaterPerSecond * (this.channel ? dt : pumpingSeconds);
      this.fields.forEach(f => { f.water = clamp(f.water + sprinklerWater, 0, 1); });
    }
    this.fields.forEach(f => {
      f.flooded = this.riverLevel >= this.config.floodLevel && f.elevation <= this.riverLevel;
      if (f.flooded) {
        f.health = clamp(f.health - this.config.floodDamagePerSecond * dt, 0, 1);
        if (this.bankHealth < 0.5) f.health = clamp(f.health - this.config.floodDamagePerSecond * dt, 0, 1);
      }
    });
    if (this.riverLevel > this.config.erosionLevel) this.bankHealth = clamp(this.bankHealth - this.config.erosionPerSecond * dt * (1 + this.riverLevel - this.config.erosionLevel), 0, 1);
    this.fishHealth = clamp(this.fishHealth + this.config.fishRecoveryPerSecond * dt * (1 - this.pollution), 0, 1);
    if (this.pollution > 0) this.fishHealth = clamp(this.fishHealth - this.pollution * this.config.fishPollutionPenalty * dt * 0.001, 0, 1);
    return this.getStatus();
  }

  // interact(action, target?, resources?): validates all costs before mutation.
  interact(action, target, resources = {}) {
    if (target && typeof target === 'object' && !Array.isArray(target) && arguments.length < 3) { resources = target; target = undefined; }
    const fail = reason => ({ success: false, reason, costs: {}, rewards: {}, events: [] });
    const field = this.fields.find(f => f.id === target) || (Number.isInteger(target) ? this.fields[target] : null);
    let costs = {}, rewards = {}, event = action;
    if (action === 'build-channel') { if (this.channel) return fail('already-built'); costs = this.config.channelCost; }
    else if (action === 'build-pump') { if (this.pump) return fail('already-built'); costs = this.config.pumpCost; }
    else if (action === 'build-sprinkler') {
      if (this.sprinkler) return fail('already-built');
      if (!this.channel && !this.pump) return fail('no-water-system');
      costs = this.config.sprinklerCost;
    }
    else if (action === 'fuel-pump') { if (!this.pump) return fail('pump-not-built'); costs = { fuel: number(this.config.fuelCost, 1) }; }
    else if (action === 'irrigate') {
      if (!field) return fail('field-not-found');
      if (!this.channel && !(this.pump && this.pumpFuel > 0)) return fail('no-water-system');
      costs = this.config.irrigationCost;
    } else if (action === 'repair-bank' || action === 'reinforce-bank') {
      if (this.bankHealth >= 1) return fail('bank-intact'); costs = this.config.bankRepairCost;
    } else if (action === 'clean-river') {
      if (this.pollution <= 0) return fail('river-clean'); costs = this.config.cleaningCost;
    } else if (action === 'fish') {
      if (this.fishHealth <= 0.05) return fail('fish-unhealthy');
      costs = this.config.fishingCost; rewards = { fish: Math.max(0, Math.floor(this.config.fishPerCatch * this.fishHealth * (1 - this.pollution))) };
    } else return fail('unknown-action');
    costs = copy(costs || {}); rewards = copy(rewards || {});
    for (const [key, amount] of Object.entries(costs)) if (number(resources[key]) < amount) return fail('insufficient-resources');
    for (const [key, amount] of Object.entries(costs)) resources[key] = number(resources[key]) - amount;
    for (const [key, amount] of Object.entries(rewards)) resources[key] = number(resources[key]) + amount;
    if (action === 'build-channel') this.channel = true;
    if (action === 'build-pump') this.pump = true;
    if (action === 'build-sprinkler') this.sprinkler = true;
    if (action === 'fuel-pump') this.pumpFuel += number(this.config.fuelAdded, 10);
    if (action === 'irrigate') { field.water = clamp(field.water + this.config.irrigationBoost, 0, 1); field.boost += this.config.irrigationBoost; }
    if (action === 'repair-bank' || action === 'reinforce-bank') this.bankHealth = clamp(this.bankHealth + this.config.bankRepairAmount, 0, 1);
    if (action === 'clean-river') { this.pollution = clamp(this.pollution - this.config.cleaningAmount, 0, 1); this.fishHealth = clamp(this.fishHealth + this.config.cleaningAmount * 0.5, 0, 1); }
    if (action === 'fish') this.fishHealth = clamp(this.fishHealth - 0.015, 0, 1);
    const resultEvent = { type: event, ...(field ? { fieldId: field.id } : {}) };
    this.events.push(resultEvent);
    return { success: true, costs, rewards, events: [copy(resultEvent)] };
  }

  addPollution(amount) { this.pollution = clamp(this.pollution + Math.max(0, number(amount)), 0, 1); return this.pollution; }
  getField(id) { const f = this.fields.find(x => x.id === id); return f ? copy(f) : null; }
  getStatus() { return { time: this.time, riverLevel: this.riverLevel, pollution: this.pollution, bankHealth: this.bankHealth, fishHealth: this.fishHealth, fishPopulation: this.config.fishBase * this.fishHealth * (1 - this.pollution), channel: this.channel, pump: this.pump, pumpFuel: this.pumpFuel, sprinkler: this.sprinkler, fields: copy(this.fields), events: copy(this.events) }; }
  query() { return this.getStatus(); }
  serialize() { return { version: 1, seed: this.seed, config: copy(this.config), time: this.time, riverLevel: this.riverLevel, pollution: this.pollution, bankHealth: this.bankHealth, fishHealth: this.fishHealth, fields: copy(this.fields), channel: this.channel, pump: this.pump, pumpFuel: this.pumpFuel, sprinkler: this.sprinkler, events: copy(this.events) }; }
  restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.fields) || !Number.isFinite(data.riverLevel)) return false;
    this.seed = Number(data.seed) >>> 0; this.config = { ...DEFAULTS, ...copy(data.config || {}), weatherLevel: { ...DEFAULTS.weatherLevel, ...((data.config || {}).weatherLevel || {}) } };
    this.time = Math.max(0, number(data.time)); this.riverLevel = clamp(data.riverLevel, this.config.minRiverLevel, this.config.maxRiverLevel);
    this.pollution = clamp(number(data.pollution), 0, 1); this.bankHealth = clamp(number(data.bankHealth, 1), 0, 1); this.fishHealth = clamp(number(data.fishHealth, 1), 0, 1);
    this.fields = copy(data.fields); this.channel = !!data.channel; this.pump = !!data.pump; this.pumpFuel = Math.max(0, number(data.pumpFuel)); this.sprinkler = !!data.sprinkler; this.events = copy(data.events || []); return true;
  }
}
