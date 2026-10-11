// A small per-machine fuel tank. Older saves start with full tanks.
export const FUEL_CAPACITY = 100;
export const FUEL_PER_CAN = 25;
export const FUEL_PER_DRIVING_SECOND = 0.08;
const MACHINES = ['tractor', 'combine', 'truck'];

export class VehicleFuel {
  constructor() { this.tanks = Object.fromEntries(MACHINES.map(machine => [machine, FUEL_CAPACITY])); }

  level(machine) { return this.tanks[machine] ?? FUEL_CAPACITY; }

  consume(machine, seconds, throttle) {
    if (!MACHINES.includes(machine) || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(throttle)) return this.level(machine);
    this.tanks[machine] = Math.max(0, this.level(machine) - Math.min(1, Math.abs(throttle)) * seconds * FUEL_PER_DRIVING_SECOND);
    return this.level(machine);
  }

  refill(machine) {
    if (!MACHINES.includes(machine) || this.level(machine) >= FUEL_CAPACITY) return false;
    this.tanks[machine] = Math.min(FUEL_CAPACITY, this.level(machine) + FUEL_PER_CAN);
    return true;
  }

  serialize() { return { version: 1, tanks: { ...this.tanks } }; }

  restore(data) {
    if (!data || data.version !== 1 || !data.tanks || typeof data.tanks !== 'object') return false;
    if (MACHINES.some(machine => !Number.isFinite(data.tanks[machine]) || data.tanks[machine] < 0 || data.tanks[machine] > FUEL_CAPACITY)) return false;
    this.tanks = Object.fromEntries(MACHINES.map(machine => [machine, data.tanks[machine]]));
    return true;
  }
}
