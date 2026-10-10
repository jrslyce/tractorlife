// Localized, seeded crop problems. Optional care slows growth; it never gates harvest.
export const WEEDS = 1;
export const BUGS = 2;
export const PROBLEM_TICK_SECONDS = 5;
export const SPRAY_PROTECTION_SECONDS = 45;
const CROP_STATES = new Set(['planted', 'growing', 'sprayed', 'ready']);

export class CropProblems {
  constructor(count, cols, seed = 1) {
    this.count = count;
    this.cols = cols;
    this.flags = new Uint8Array(count);
    this.protection = new Uint8Array(count);
    this.seed = (seed >>> 0) || 1;
    this.randomState = this.seed;
    this.elapsed = 0;
    this.revision = 0;
  }

  _random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  infest(index, kind) {
    if (!Number.isInteger(index) || index < 0 || index >= this.count ||
        (kind !== WEEDS && kind !== BUGS) || this.protection[index] > 0) return false;
    const next = this.flags[index] | kind;
    if (next === this.flags[index]) return false;
    this.flags[index] = next;
    this.revision++;
    return true;
  }

  clear(index) {
    if (this.flags[index]) this.revision++;
    this.flags[index] = 0;
    this.protection[index] = 0;
  }

  spray(index) {
    if (!this.flags[index]) return false;
    this.flags[index] = 0;
    this.protection[index] = SPRAY_PROTECTION_SECONDS;
    this.revision++;
    return true;
  }

  growthMultiplier(index) {
    // Even a tile with both problems continues to grow (at 45% of normal).
    return 1 - ((this.flags[index] & WEEDS) ? 0.25 : 0) - ((this.flags[index] & BUGS) ? 0.3 : 0);
  }

  neighbors(index) {
    const out = [];
    if (index % this.cols > 0) out.push(index - 1);
    if (index % this.cols < this.cols - 1 && index + 1 < this.count) out.push(index + 1);
    if (index >= this.cols) out.push(index - this.cols);
    if (index + this.cols < this.count) out.push(index + this.cols);
    return out;
  }

  update(dt, states) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    while (this.elapsed >= PROBLEM_TICK_SECONDS) {
      this.elapsed -= PROBLEM_TICK_SECONDS;
      this._tick(states);
    }
  }

  _tick(states) {
    const eligible = [];
    for (let i = 0; i < this.count; i++) {
      this.protection[i] = Math.max(0, this.protection[i] - PROBLEM_TICK_SECONDS);
      if (CROP_STATES.has(states[i])) eligible.push(i);
      else this.clear(i);
    }
    if (!eligible.length) return;
    // Snapshot prevents a single event propagating through an entire field.
    const before = this.flags.slice();
    let affected = before.reduce((total, flag) => total + Number(flag !== 0), 0);
    const limit = Math.max(2, Math.ceil(eligible.length * 0.12));
    const infect = (i, kind) => {
      if (!CROP_STATES.has(states[i]) || (!this.flags[i] && affected >= limit)) return;
      const wasEmpty = this.flags[i] === 0;
      if (this.infest(i, kind) && wasEmpty) affected++;
    };
    for (const i of eligible) {
      for (const kind of [WEEDS, BUGS]) {
        if (!(before[i] & kind)) continue;
        // Some bug patches die out naturally; others remain local or spread.
        if (this._random() < (kind === BUGS ? 0.08 : 0.015)) {
          this.flags[i] &= ~kind;
          if (!this.flags[i]) affected--;
          this.revision++;
        } else if (this._random() < (kind === BUGS ? 0.12 : 0.04)) {
          const neighbors = this.neighbors(i);
          if (neighbors.length) infect(neighbors[Math.floor(this._random() * neighbors.length)], kind);
        }
      }
    }
    for (const kind of [WEEDS, BUGS]) {
      if (this._random() >= (kind === WEEDS ? 0.25 : 0.15)) continue;
      const index = eligible[Math.floor(this._random() * eligible.length)];
      infect(index, kind);
      // A small patch, not a field-wide plague. Protected neighbors stay clean.
      for (const neighbor of this.neighbors(index)) {
        if (this._random() < 0.35) infect(neighbor, kind);
      }
    }
  }

  getStats() {
    let weeds = 0, bugs = 0;
    for (const flag of this.flags) {
      if (flag & WEEDS) weeds++;
      if (flag & BUGS) bugs++;
    }
    return { weeds, bugs };
  }

  serialize() {
    // Sparse base-36 records keep ten-farm snapshots below the save-size limit.
    const tiles = [];
    for (let i = 0; i < this.count; i++) {
      if (this.flags[i] || this.protection[i]) tiles.push(i.toString(36) + ',' + this.flags[i] + ',' + this.protection[i].toString(36));
    }
    return { tiles: tiles.join(';'), randomState: this.randomState, elapsed: this.elapsed };
  }

  restore(data) {
    this.flags.fill(0);
    this.protection.fill(0);
    this.randomState = this.seed;
    this.elapsed = 0;
    if (data && typeof data === 'object') {
      const tiles = typeof data.tiles === 'string' && data.tiles.length <= this.count * 12 ? data.tiles.split(';') : [];
      for (const record of tiles) {
        const [index, flag, protect] = record.split(',').map(n => parseInt(n, 36));
        if (!Number.isInteger(index) || index < 0 || index >= this.count) continue;
        if (Number.isInteger(flag) && flag >= 0 && flag <= 3) this.flags[index] = flag;
        if (Number.isFinite(protect)) this.protection[index] = Math.max(0, Math.min(SPRAY_PROTECTION_SECONDS, protect));
      }
      if (Number.isInteger(data.randomState) && data.randomState >= 0 && data.randomState <= 4294967295) this.randomState = data.randomState;
      if (Number.isFinite(data.elapsed)) this.elapsed = Math.max(0, Math.min(PROBLEM_TICK_SECONDS - 0.0001, data.elapsed));
    }
    this.revision++;
  }
}
