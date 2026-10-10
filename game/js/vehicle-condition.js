/**
 * Pure vehicle wear and breakdown logic. Time values are seconds; usage values
 * are relative rates (1 = ordinary use). It deliberately has no physics or UI
 * dependencies, so transform-driven vehicles can apply getState().speedMultiplier.
 */

const DEFAULT_CONFIG = {
  wearPerHour: { tire: 0.002, engine: 0.001 },
  failureHazardPerHour: { flatTire: 0.00002, engineSmoke: 0.00001, engineFailure: 0.000002 },
  failureWearThreshold: { flatTire: 0.65, engineSmoke: 0.7, engineFailure: 0.9 },
  speedMultipliers: { flatTire: 0.5, engineSmoke: 0.65, engineFailure: 0 },
};

const FAILURE_PART = { flat_tire: 'tire', engine_smoke: 'engine', engine_failure: 'engine' };
const RESOURCE_COST = {
  flat_tire: { spareTire: 1 },
  engine_smoke: { repairKit: 1 },
  engine_failure: { repairKit: 1, fuel: 1 },
};

function mergeConfig(config = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_CONFIG).map(([key, defaults]) => [
    key, { ...defaults, ...(config[key] || {}) },
  ]));
}

export class VehicleCondition {
  constructor(options = {}) {
    this.config = mergeConfig(options.config);
    this.randomState = (Number(options.seed ?? 1) >>> 0) || 1;
    this.state = {
      type: options.type || 'tractor',
      wear: { tire: 0, engine: 0, ...(options.wear || {}) },
      breakdown: null,
      operatingHours: 0,
    };
    // Exponential hazard thresholds make random breakdown timing independent
    // of how an elapsed interval is divided into frames.
    this.hazard = {
      flatTire: this._exponentialThreshold(),
      engineSmoke: this._exponentialThreshold(),
      engineFailure: this._exponentialThreshold(),
    };
  }

  _random() {
    // Mulberry32: small, deterministic PRNG suitable for simulation, not security.
    this.randomState = (this.randomState + 0x6D2B79F5) >>> 0;
    let t = this.randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  _exponentialThreshold() { return -Math.log(Math.max(Number.EPSILON, 1 - this._random())); }

  update(dt, usage = {}, environment = {}) {
    const seconds = Math.max(0, Number(dt) || 0);
    if (!seconds) return this.getState();
    const hours = seconds / 3600;
    const work = Math.max(0, Number(usage.work ?? usage.load ?? 1));
    const drive = Math.max(0, Number(usage.driving ?? usage.drive ?? 1));
    const roughness = Math.max(0, Number(environment.roughness ?? environment.terrain ?? 1));
    const heat = Math.max(0, Number(environment.heat ?? 1));
    this.state.operatingHours += hours * Math.max(work, drive);
    this.state.wear.tire = Math.min(1, this.state.wear.tire + hours * this.config.wearPerHour.tire * drive * roughness);
    this.state.wear.engine = Math.min(1, this.state.wear.engine + hours * this.config.wearPerHour.engine * Math.max(work, drive) * heat);

    if (!this.state.breakdown) {
      const hazards = {
        flatTire: hours * drive * roughness * this.config.failureHazardPerHour.flatTire * this._wearFactor('tire', this.config.failureWearThreshold.flatTire),
        engineSmoke: hours * Math.max(work, drive) * heat * this.config.failureHazardPerHour.engineSmoke * this._wearFactor('engine', this.config.failureWearThreshold.engineSmoke),
        engineFailure: hours * Math.max(work, drive) * heat * this.config.failureHazardPerHour.engineFailure * this._wearFactor('engine', this.config.failureWearThreshold.engineFailure),
      };
      for (const [kind, exposure] of Object.entries(hazards)) {
        this.hazard[kind] -= exposure;
        if (this.hazard[kind] <= 0) {
          this.triggerBreakdown(kind.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
          break;
        }
      }
    }
    return this.getState();
  }

  _wearFactor(part, threshold) {
    const wear = this.state.wear[part];
    return wear < threshold ? 0 : Math.max(0, (wear - threshold) / Math.max(0.01, 1 - threshold));
  }

  triggerBreakdown(type = 'engine_failure') {
    const aliases = { flat: 'flat_tire', tire: 'flat_tire', smoke: 'engine_smoke', engine: 'engine_failure' };
    const kind = aliases[type] || type;
    if (!RESOURCE_COST[kind]) throw new RangeError(`Unknown breakdown type: ${type}`);
    if (!this.state.breakdown) this.state.breakdown = { type: kind, part: FAILURE_PART[kind], sinceHours: this.state.operatingHours };
    return this.getState();
  }

  /** Atomically consume the required resources and repair the active breakdown. */
  repair(part, resources = {}) {
    const breakdown = this.state.breakdown;
    if (!breakdown || (part !== breakdown.part && part !== breakdown.type)) return false;
    const cost = RESOURCE_COST[breakdown.type];
    if (Object.entries(cost).some(([name, amount]) => Number(resources[name] || 0) < amount)) return false;
    for (const [name, amount] of Object.entries(cost)) resources[name] -= amount;
    this.state.wear[breakdown.part] = Math.min(this.state.wear[breakdown.part], 0.35);
    this.state.breakdown = null;
    this.hazard[breakdown.type.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = this._exponentialThreshold();
    return true;
  }

  getState() {
    const breakdown = this.state.breakdown;
    return {
      ...this.state,
      wear: { ...this.state.wear },
      breakdown: breakdown ? { ...breakdown } : null,
      speedMultiplier: breakdown ? this.config.speedMultipliers[breakdown.type.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] : 1,
    };
  }

  serialize() {
    return { version: 1, config: this.config, state: this.getState(), randomState: this.randomState, hazard: { ...this.hazard } };
  }

  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.state || !snapshot.hazard) throw new TypeError('Invalid vehicle condition snapshot');
    this.config = mergeConfig(snapshot.config);
    this.state = {
      type: snapshot.state.type || 'tractor',
      wear: { tire: 0, engine: 0, ...snapshot.state.wear },
      breakdown: snapshot.state.breakdown ? { ...snapshot.state.breakdown } : null,
      operatingHours: Math.max(0, Number(snapshot.state.operatingHours) || 0),
    };
    this.randomState = (Number(snapshot.randomState) >>> 0) || 1;
    this.hazard = { ...snapshot.hazard };
    return this;
  }
}

export default VehicleCondition;
