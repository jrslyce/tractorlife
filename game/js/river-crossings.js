// Lightweight river crossing rules and an optional Three.js scene builder.
// Bounds are world-space { minX, maxX, minZ, maxZ }; the river runs along Z.
const DEFAULTS = {
  fordHighWater: 0.72,
  fordWidth: 3.2,
  bridgeWidth: 4.2,
  ferryWidth: 3.6,
  bridgeHealth: 1,
  damagedBelow: 0.35,
  bridgeRepairAmount: 0.4,
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const copy = value => JSON.parse(JSON.stringify(value));

export class RiverCrossings {
  constructor({ bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, riverX, config = {}, bridgeHealth, ferry = true } = {}) {
    this.bounds = { ...bounds };
    this.riverX = Number.isFinite(riverX) ? riverX : (bounds.minX + bounds.maxX) / 2;
    this.config = { ...DEFAULTS, ...config };
    const midZ = (bounds.minZ + bounds.maxZ) / 2;
    const spanZ = bounds.maxZ - bounds.minZ;
    this.crossings = [
      { id: 'ford', type: 'ford', x: this.riverX, z: midZ - spanZ * 0.2, width: this.config.fordWidth },
      { id: 'bridge', type: 'bridge', x: this.riverX, z: midZ + spanZ * 0.2, width: this.config.bridgeWidth, health: clamp(Number.isFinite(bridgeHealth) ? bridgeHealth : this.config.bridgeHealth, 0, 1) },
      ...(ferry ? [{ id: 'ferry', type: 'ferry', x: this.riverX, z: midZ, width: this.config.ferryWidth }] : []),
    ];
  }

  _open(crossing, vehicleType, riverLevel) {
    const vehicle = String(vehicleType || 'foot').toLowerCase();
    const heavy = ['tractor', 'combine', 'truck', 'heavy', 'wagon'].includes(vehicle);
    if (crossing.type === 'ford') return Number(riverLevel) < this.config.fordHighWater && (!heavy || Number(riverLevel) < this.config.fordHighWater * 0.8);
    if (crossing.type === 'bridge') return crossing.health > this.config.damagedBelow && (!heavy || crossing.health >= 0.5);
    return true; // Ferry is an alternate route independent of ford water level.
  }

  // Checks whether a vehicle at x,z is inside a crossing lane and that crossing is open.
  isPassable(x, z, vehicleType = 'foot', riverLevel = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return this.crossings.some(c => Math.abs(x - c.x) <= c.width / 2 && Math.abs(z - c.z) <= 2.5 && this._open(c, vehicleType, riverLevel));
  }

  nearestCrossing(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const nearest = this.crossings.map(c => ({ crossing: c, distance: Math.hypot(x - c.x, z - c.z) })).sort((a, b) => a.distance - b.distance)[0];
    return nearest ? { ...copy(nearest.crossing), distance: nearest.distance } : null;
  }

  // Construction/repair actions charge resources atomically when supplied.
  buildBridge(resources = {}, cost = { wood: 8, stone: 4 }) {
    const bridge = this.crossings.find(c => c.type === 'bridge');
    if (!bridge) return { success: false, reason: 'bridge-not-found' };
    if (bridge.health > 0) return { success: false, reason: 'already-built' };
    if (!this._canPay(resources, cost)) return { success: false, reason: 'insufficient-resources', costs: copy(cost) };
    this._charge(resources, cost); bridge.health = 1;
    return { success: true, costs: copy(cost), health: bridge.health };
  }
  repairBridge(resources = {}, cost = { wood: 2 }, amount = this.config.bridgeRepairAmount) {
    const bridge = this.crossings.find(c => c.type === 'bridge');
    if (!bridge) return { success: false, reason: 'bridge-not-found' };
    if (bridge.health >= 1) return { success: false, reason: 'bridge-intact' };
    if (!this._canPay(resources, cost)) return { success: false, reason: 'insufficient-resources', costs: copy(cost) };
    this._charge(resources, cost); bridge.health = clamp(bridge.health + amount, 0, 1);
    return { success: true, costs: copy(cost), health: bridge.health };
  }
  damageBridge(amount) {
    const bridge = this.crossings.find(c => c.type === 'bridge');
    if (!bridge) return 0;
    bridge.health = clamp(bridge.health - Math.max(0, Number(amount) || 0), 0, 1);
    return bridge.health;
  }
  _canPay(resources, cost) { return Object.entries(cost).every(([key, n]) => (Number(resources[key]) || 0) >= n); }
  _charge(resources, cost) { for (const [key, n] of Object.entries(cost)) resources[key] = (Number(resources[key]) || 0) - n; }

  serialize() { return { version: 1, bounds: copy(this.bounds), riverX: this.riverX, config: copy(this.config), crossings: copy(this.crossings) }; }
  restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.crossings)) return false;
    this.bounds = copy(data.bounds); this.riverX = data.riverX; this.config = { ...DEFAULTS, ...copy(data.config || {}) }; this.crossings = copy(data.crossings);
    return this.crossings.every(c => ['ford', 'bridge', 'ferry'].includes(c.type) && Number.isFinite(c.x) && Number.isFinite(c.z));
  }
}

// Optional rendering: pass the project's THREE namespace, avoiding a hard
// dependency in the pure rules/tests. Geometry is deliberately low-detail.
export function buildRiverCrossings({ scene, THREE, bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, riverX, config, state } = {}) {
  if (!scene || !THREE) throw new TypeError('buildRiverCrossings requires scene and THREE');
  const system = new RiverCrossings({ bounds, riverX, config });
  if (state) system.restore(state);
  const midZ = (bounds.minZ + bounds.maxZ) / 2;
  const length = bounds.maxZ - bounds.minZ;
  const addBox = (w, h, d, x, y, z, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  };
  // A shallow tinted water ribbon through the center of the bounds.
  addBox(5, 0.08, length, system.riverX, 0.04, midZ, 0x4c9eb0);
  const meshes = {};
  for (const c of system.crossings) {
    if (c.type === 'ford') {
      addBox(c.width, 0.14, 5, c.x, 0.12, c.z, 0xb9a77b);
      addBox(c.width + 1, 0.04, 0.5, c.x, 0.13, c.z - 2.8, 0x8b7954);
      addBox(c.width + 1, 0.04, 0.5, c.x, 0.13, c.z + 2.8, 0x8b7954);
    } else if (c.type === 'bridge') {
      meshes.bridge = addBox(c.width, 0.45, 6, c.x, 0.45, c.z, 0x806044);
      addBox(0.18, 0.45, 6, c.x - c.width / 2 + 0.12, 0.78, c.z, 0x594331);
      addBox(0.18, 0.45, 6, c.x + c.width / 2 - 0.12, 0.78, c.z, 0x594331);
    } else {
      addBox(c.width, 0.22, 3.2, c.x, 0.2, c.z, 0x9a7755);
      addBox(0.35, 0.22, 1.5, c.x - c.width * 0.27, 0.42, c.z, 0x664a37);
      addBox(0.35, 0.22, 1.5, c.x + c.width * 0.27, 0.42, c.z, 0x664a37);
    }
  }
  return { system, meshes, update() { const b = system.crossings.find(c => c.type === 'bridge'); if (meshes.bridge && b) meshes.bridge.material.color.setHex(b.health > system.config.damagedBelow ? 0x806044 : 0x613b32); }, dispose() { for (const mesh of scene.children.filter(o => Object.values(meshes).includes(o))) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } } };
}
