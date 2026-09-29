// Deterministic calendar and weather state for game simulation.
// Time units: update(dt) and dayDuration are in in-game simulation seconds.

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const WEATHER_TYPES = ['clear', 'rain', 'drought', 'frost', 'wind', 'storm'];

function hashSeed(seed, day) {
  // Mix the configured seed with the absolute day so weather does not depend
  // on frame rate, update chunk sizes, or how many previous days were visited.
  let value = (Number(seed) >>> 0) ^ Math.imul(day >>> 0, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value = (value ^ (value >>> 15)) >>> 0;
  return value / 4294967296;
}

function weatherFor(seed, day, season) {
  const roll = hashSeed(seed, day);
  // Weights are intentionally gentle: frequent clear days, occasional useful
  // rain, and rare disruptive conditions. Frost is most likely in winter.
  const weights = {
    spring: [0.48, 0.24, 0.02, 0.04, 0.14, 0.08],
    summer: [0.52, 0.12, 0.12, 0, 0.16, 0.08],
    autumn: [0.46, 0.23, 0.03, 0.08, 0.13, 0.07],
    winter: [0.42, 0.12, 0, 0.24, 0.14, 0.08]
  }[season];
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return WEATHER_TYPES[i];
  }
  return 'clear';
}

/**
 * Seeded calendar/weather model. Defaults: one game day per 120 simulation
 * seconds and 30 days per season. A game year has four seasons (120 days).
 */
export class Climate {
  constructor(options = {}) {
    this.dayDuration = positive(options.dayDuration, 120);
    this.daysPerSeason = Math.max(1, Math.floor(positive(options.daysPerSeason, 30)));
    this.seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 1;
    this.elapsed = 0;
    this.day = 1;
    this.weather = weatherFor(this.seed, this.day, this._seasonForDay(this.day));
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this.getState();
    this.elapsed += dt;
    const nextDay = Math.floor(this.elapsed / this.dayDuration) + 1;
    if (nextDay !== this.day) {
      this.day = nextDay;
      this.weather = weatherFor(this.seed, this.day, this._seasonForDay(this.day));
    }
    return this.getState();
  }

  _seasonForDay(day) {
    const yearLength = this.daysPerSeason * SEASONS.length;
    return SEASONS[Math.floor((day - 1) % yearLength / this.daysPerSeason)];
  }

  getState() {
    const dayInYear = (this.day - 1) % (this.daysPerSeason * SEASONS.length);
    const seasonDay = dayInYear % this.daysPerSeason + 1;
    return {
      day: this.day,
      dayProgress: (this.elapsed % this.dayDuration) / this.dayDuration,
      season: this._seasonForDay(this.day),
      seasonDay,
      year: Math.floor((this.day - 1) / (this.daysPerSeason * SEASONS.length)) + 1,
      weather: this.weather,
      // Additive river level offset in normalized units (0 is normal).
      riverLevelModifier: Climate.riverModifier(this.weather)
    };
  }

  serialize() {
    return {
      version: 1,
      seed: this.seed,
      dayDuration: this.dayDuration,
      daysPerSeason: this.daysPerSeason,
      elapsed: this.elapsed
    };
  }

  restore(data) {
    if (!data || typeof data !== 'object' || !Number.isFinite(data.elapsed) || data.elapsed < 0) {
      throw new TypeError('Climate.restore expects serialized climate data');
    }
    if (Number.isFinite(data.seed)) this.seed = data.seed >>> 0;
    if (Number.isFinite(data.dayDuration) && data.dayDuration > 0) this.dayDuration = data.dayDuration;
    if (Number.isFinite(data.daysPerSeason) && data.daysPerSeason > 0) {
      this.daysPerSeason = Math.max(1, Math.floor(data.daysPerSeason));
    }
    this.elapsed = data.elapsed;
    this.day = Math.floor(this.elapsed / this.dayDuration) + 1;
    this.weather = weatherFor(this.seed, this.day, this._seasonForDay(this.day));
    return this.getState();
  }

  /** Additive normalized river level offset for the current weather. */
  static riverModifier(weather) {
    return ({ clear: 0, rain: 0.15, drought: -0.2, frost: -0.05, wind: 0, storm: 0.35 })[weather] ?? 0;
  }

  /** Force a known weather for scripted events/tests; unknown types are rejected. */
  setWeather(weather) {
    if (!WEATHER_TYPES.includes(weather)) throw new RangeError(`Unknown weather: ${weather}`);
    this.weather = weather;
    return this.getState();
  }
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
