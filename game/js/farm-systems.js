import { Woodland } from './woodland.js';
import { WaterSystem } from './water-system.js';
import { Livestock } from './livestock.js';
import { VehicleCondition } from './vehicle-condition.js';
import { RiverCrossings } from './river-crossings.js';
import { FarmRequests } from './farm-requests.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const weatherOf = state => typeof state === 'string' ? state : state?.weather || state?.type || 'clear';

/** Farm-local simulation facade. Simulation coordinates and saved state are world-space. */
export class FarmSystems {
  constructor({ scene, THREE, farmSlot = 0, onEvent } = {}) {
    this.scene = scene; this.THREE = THREE; this.farmSlot = Math.max(0, Number(farmSlot) || 0);
    this.originX = this.farmSlot * 180; this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    const seed = 0x51f15e + this.farmSlot * 7919;
    this.woodland = new Woodland({ seed, config: { initialTrees: 5, initialOrchards: 3 } });
    // Keep woodland in the accessible corridor between the road and river.
    for (const group of [this.woodland.trees, this.woodland.orchards]) for (const item of group) {
      // Activity grove sits in the south woodland strip, clear of fields and road.
      item.x += this.originX + 62; item.z = 51 + (item.z + 3) * 0.45;
    }
    this.water = new WaterSystem({ seed, config: {
      evaporationPerSecond: 0.0014, rainRechargePerSecond: 0.004,
      floodLevel: 0.62, erosionLevel: 0.54
    }, fields: [
      { id: 0, elevation: 0.36, water: 0.5 }, { id: 1, elevation: 0.4, water: 0.5 },
      { id: 2, elevation: 0.46, water: 0.5 }, { id: 3, elevation: 0.5, water: 0.5 }
    ] });
    this.livestock = new Livestock({ seed, config: { initialAnimals: [{ id: 1, kind: 'cow' }, { id: 2, kind: 'chicken' }] } });
    // Existing rules are used for bridge durability and serialization; lane geometry is map-oriented here.
    this.crossings = new RiverCrossings({ bounds: { minX: this.originX - 90, maxX: this.originX + 90, minZ: -78, maxZ: 80 }, riverX: this.originX, config: { fordWidth: 5, bridgeWidth: 6, ferryWidth: 5 } });
    this.crossings.crossings[0].x = this.originX - 12; this.crossings.crossings[0].z = -66;
    this.crossings.crossings[1].x = this.originX; this.crossings.crossings[1].z = -66;
    this.crossings.crossings[2].x = this.originX + 12; this.crossings.crossings[2].z = -66;
    // The bridge is intentionally destroyed initially and can be built via its prompt.
    this.crossings.crossings[1].health = 0;
    this.vehicles = {};
    this.vehiclePositions = {};
    this.requests = FarmRequests({ seed }); this._day = 0; this._visuals = [];
    this._buildVisuals();
  }

  _buildVisuals() {
    if (!this.scene || !this.THREE) return;
    const T = this.THREE;
    const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); this.scene.add(m); this._visuals.push(m); return m; };
    this._shared = { trunk: new T.CylinderGeometry(0.18, 0.24, 1.5, 6), crown: new T.IcosahedronGeometry(0.8, 0), branch: new T.BoxGeometry(0.8, 0.12, 0.18), animal: new T.SphereGeometry(0.42, 8, 6), smoke: new T.SphereGeometry(0.38, 7, 5), channel: new T.BoxGeometry(0.3,0.07,22), pump: new T.BoxGeometry(1.2,1.4,1.2), fence: new T.BoxGeometry(2,0.5,0.18), foliage: new T.MeshLambertMaterial({ color: 0x477544 }), bark: new T.MeshLambertMaterial({ color: 0x765239 }), branchMat: new T.MeshLambertMaterial({ color: 0x6d5035 }), animalMat: new T.MeshLambertMaterial({ color: 0xe8dfc9 }), smokeMat: new T.MeshBasicMaterial({ color: 0x555650, transparent: true, opacity: 0.52, depthWrite: false }), channelMat: new T.MeshLambertMaterial({color:0x438eaa}), pumpMat: new T.MeshLambertMaterial({color:0x9a5940}), fenceMat: new T.MeshLambertMaterial({color:0xa94b39}) };
    this._props = [];
    this._smoke = {};
    for (const type of ['tractor', 'combine', 'truck']) {
      const puffs = [];
      for (let i = 0; i < 3; i++) {
        const puff = add(this._shared.smoke, this._shared.smokeMat, this.originX, -10, -66);
        puff.visible = false; puff.scale.setScalar(0.45 + i * 0.2); puffs.push(puff);
      }
      this._smoke[type] = puffs;
    }
    this._crossingMeshes = {};
    for (const c of this.crossings.crossings) {
      const color = c.type === 'ford' ? 0xb5a27a : c.type === 'bridge' ? 0x806044 : 0x9a7755;
      const mesh = add(new T.BoxGeometry(c.width, 0.24, 7), new T.MeshLambertMaterial({ color }), c.x, 0.18, c.z);
      if (c.type === 'bridge') this._crossingMeshes.bridge = mesh;
    }
    this._syncVisuals(true);
  }

  _syncVisuals(force = false) {
    if (!this.scene || !this.THREE || !this._shared) return;
    const signature = JSON.stringify([this.woodland.trees.map(t => [t.id,t.stage]), this.woodland.saplings.map(t => t.id), this.woodland.orchards.map(o => [o.id,o.fruit]), this.woodland.debris.map(d => d.id), this.livestock.animals.map(a => [a.id,a.escaped]), this.water.channel, this.water.pump, this.livestock.fenceCondition < 0.99]);
    if (!force && signature === this._visualSignature) return;
    this._visualSignature = signature;
    for (const mesh of this._props) this.scene.remove(mesh);
    this._props = [];
    const T = this.THREE, s = this._shared;
    const harvestableTrees = new Set(this.woodland.trees.filter(tree => tree.stage === 'mature' || tree.stage === 'young'));
    const draw = (items, geo, mat, scale, cap = Infinity) => {
      for (const item of items.slice(0, cap)) {
        const m = new T.Mesh(geo, mat);
        m.position.set(item.x, scale.y / 2, item.z); m.scale.set(scale.x,scale.y,scale.z);
        if (harvestableTrees.has(item)) m.userData.harvestTreeId = item.id;
        this.scene.add(m); this._props.push(m);
      }
    };
    const liveTrees = this.woodland.trees.filter(t => t.stage !== 'stump').concat(this.woodland.orchards);
    draw(liveTrees.concat(this.woodland.saplings), s.trunk, s.bark, {x:1,y:1.6,z:1}, 32);
    draw(liveTrees, s.crown, s.foliage, {x:1.2,y:1,z:1.2}, 32);
    draw(this.woodland.trees.filter(t => t.stage === 'stump'), s.trunk, s.bark, {x:1,y:.35,z:1}, 32);
    draw(this.woodland.debris, s.branch, s.branchMat, {x:1,y:1,z:1}, 32);
    draw(this.livestock.animals.map(a => ({x:this.originX-3+(a.id-1)*2,z:a.escaped?-20:-30})), s.animal, s.animalMat, {x:1,y:.8,z:1.3}, 12);
    if (this.water.channel) draw([{x:this.originX + 30,z:-46},{x:this.originX + 84,z:-46}], s.channel, s.channelMat, {x:1,y:1,z:1}, 2);
    if (this.water.pump) draw([{x:this.originX + 4,z:-59}], s.pump, s.pumpMat, {x:1,y:1,z:1}, 1);
    if (this.livestock.fenceCondition < 0.99) draw([{x:this.originX + 4,z:-24}], s.fence, s.fenceMat, {x:1,y:1,z:1}, 1);
  }

  update(dt, climateState = {}, usageByVehicle = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return this.getStatus();
    const weather = weatherOf(climateState), events = [];
    const send = (source, list) => { for (const event of list || []) { const e = { ...event, source }; events.push(e); this.onEvent(e); } };
    send('woodland', this.woodland.update(dt, weather));
    const waterState = this.water.update(dt, climateState); send('water', waterState.events);
    const livestockState = this.livestock.update(dt, weather); send('livestock', livestockState.events);
    if (weather === 'storm' || weather === 'thunderstorm') {
      this.crossings.damageBridge(dt * 0.00015);
      this.livestock.fenceCondition = Math.max(0, this.livestock.fenceCondition - dt * 0.00002);
    }
    for (const [type, condition] of Object.entries(this.vehicles)) {
      const before = condition.getState().breakdown;
      const usage = usageByVehicle[type] || {};
      const after = condition.update(dt, { driving: Number.isFinite(usage.driving) ? usage.driving : 1, work: Number.isFinite(usage.work) ? usage.work : 1 }, { roughness: Number.isFinite(usage.roughness) ? usage.roughness : 1, heat: Number.isFinite(usage.heat) ? usage.heat : 1 }).breakdown;
      if (!before && after) { const e = { type: 'vehicle-breakdown', vehicleType: condition.getState().type, breakdown: after }; events.push(e); this.onEvent(e); }
      const position = this.vehiclePositions[type];
      if (condition.getState().breakdown && condition.getState().breakdown.type.indexOf('engine_') === 0 && position && Math.abs(position.z + 66) < 16) {
        this.water.addPollution(dt * 0.0005);
      }
      const puffs = this._smoke[type] || [];
      const smoking = !!(condition.getState().breakdown && condition.getState().breakdown.type.indexOf('engine_') === 0);
      for (let i = 0; i < puffs.length; i++) {
        puffs[i].visible = smoking && !!position;
        if (position) {
          puffs[i].position.set(position.x + 1.5 + Math.sin(this.water.time + i) * 0.18, (position.y || 0) + 2.3 + i * 0.75, position.z);
          puffs[i].material.opacity = 0.5 - i * 0.09;
        }
      }
    }
    // Contracts follow the player-facing calendar (day 1 is the first day),
    // while livestock keeps its own elapsed-care day counter starting at zero.
    this._day = Number.isFinite(climateState.day) ? Math.floor(climateState.day) : livestockState.day;
    const bridgeMesh = this._crossingMeshes && this._crossingMeshes.bridge;
    if (bridgeMesh) {
      const bridge = this.crossings.crossings.find(c => c.type === 'bridge');
      bridgeMesh.material.color.setHex(bridge && bridge.health > this.crossings.config.damagedBelow ? 0x806044 : 0x593b32);
    }
    this.requests.update(dt, { day: this._day, branches: this.woodland.debris.length, breakdowns: Object.values(this.vehicles).filter(v => v.getState().breakdown).length, animals: livestockState.careNeeds.length, repairs: waterState.bankHealth < 1 || livestockState.fenceCondition < 1 ? 1 : 0 });
    this._syncVisuals();
    return this.getStatus();
  }

  _targets() {
    const out = [];
    for (const d of this.woodland.debris) out.push({ kind: 'branch', id: d.id, x: d.x, z: d.z, action: 'clear-branch' });
    for (const o of this.woodland.orchards) out.push({ kind: 'orchard', id: o.id, x: o.x, z: o.z, action: o.fruit ? 'harvest' : o.pruned ? 'water' : 'prune' });
    for (const a of this.livestock.animals) {
      const action = a.escaped ? 'herd' : !a.feedToday ? 'feed' : !a.waterToday ? 'water' : '';
      if (action) out.push({ kind: a.escaped ? 'escaped-animal' : 'animal', id: a.id, x: this.originX - 4 + (a.id - 1) * 2, z: a.escaped ? -20 : -28, action });
    }
    const breedingTarget = typeof this.livestock.getBreedCandidate === 'function'
      ? this.livestock.getBreedCandidate() : null;
    if (breedingTarget !== null) out.push({ kind: 'animal', id: breedingTarget,
      x: this.originX - 4 + (breedingTarget - 1) * 2, z: -28, action: 'breed' });
    for (const tree of this.woodland.trees) out.push({ kind: tree.stage === 'stump' ? 'stump' : 'tree', id: tree.id, x: tree.x, z: tree.z, action: tree.stage === 'stump' ? 'clear-stump' : 'fell' });
    for (const spot of [{ x: this.originX + 55, z: 54 }, { x: this.originX + 82, z: 61 }, { x: this.originX + 110, z: 53 }]) {
      out.push({ kind: 'sapling-spot', id: spot, x: spot.x, z: spot.z, action: 'plant' });
    }
    for (const c of this.crossings.crossings) out.push({ kind: 'crossing', id: c.type, x: c.x, z: -59, action: c.type === 'bridge' && c.health < 1 ? (c.health <= 0 ? 'build-bridge' : 'repair-bridge') : 'cross' });
    for (const [type, v] of Object.entries(this.vehicles)) if (v.getState().breakdown && this.vehiclePositions[type]) out.push({ kind: 'vehicle', id: type, ...this.vehiclePositions[type], action: 'repair-vehicle' });
    const bank = { x:this.originX, z:-59 };
    const waterActions = ['fish'];
    if (this.water.pollution > 0.02) waterActions.push('clean-river');
    if (!this.water.channel) waterActions.push('build-channel');
    if (!this.water.pump) waterActions.push('build-pump');
    else if (this.water.pumpFuel <= 0) waterActions.push('fuel-pump');
    if ((this.water.channel || this.water.pump) && !this.water.sprinkler) waterActions.push('build-sprinkler');
    if (this.water.bankHealth < 0.99) waterActions.push('repair-bank');
    waterActions.forEach((action, i) => out.push({ kind:'riverbank', id:action, x:bank.x + (i - (waterActions.length - 1) / 2) * 2.2, z:bank.z, action }));
    if (this.water.channel || this.water.pump) {
      const positions = [[this.originX + 30, -36], [this.originX + 84, -36], [this.originX + 30, 10], [this.originX + 84, 10]];
      for (let i = 0; i < positions.length; i++) if (this.water.fields[i].water < 0.95) {
        out.push({ kind:'field', id:i, x:positions[i][0], z:positions[i][1], action:'irrigate' });
      }
    }
    if (this.livestock.fenceCondition < 0.99) out.push({kind:'fence',id:'fence',x:this.originX+4,z:-24,action:'repair-fence'});
    return out;
  }
  getPrompt(position, vehicleType) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    const limit = vehicleType && vehicleType !== 'foot' ? 9 : 5;
    const target = this._targets().map(t => ({ ...t, distance: dist(position, t) })).filter(t => t.distance < limit && (t.kind !== 'crossing' || t.action !== 'cross')).sort((a, b) => a.distance - b.distance)[0];
    return target ? { action: target.action, target: target.id, kind: target.kind, distance: target.distance, label: target.kind === 'tree' ? 'hold Chop to collect wood' : target.action.replaceAll('-', ' ') } : null;
  }

  getHarvestTargets() { return this.woodland.getHarvestTargets(); }

  harvestTree(id, inventory, expectedRevision) {
    const result = this.woodland.harvestTree(id, inventory, expectedRevision);
    if (result.success) {
      for (const event of result.events) this.onEvent({ ...event, source: 'woodland' });
      this._syncVisuals();
    }
    return result;
  }

  interact(position, vehicleType = 'foot', resourceBag = {}) {
    const prompt = this.getPrompt(position, vehicleType);
    if (!prompt) return { success: false, reason: 'no-nearby-target', costs: {}, rewards: {}, events: [], message: 'Nothing nearby to interact with.' };
    if (prompt.kind === 'tree' || prompt.action === 'fell' || prompt.action === 'clear-tree') {
      return { success: false, reason: 'hold-chop-required', costs: {}, rewards: {}, events: [], target: prompt.target, message: 'Hold Chop while facing the tree to collect wood.' };
    }
    let result;
    if (prompt.kind === 'branch') result = this.woodland.interact('clear-branch', prompt.target, resourceBag);
    else if (prompt.kind === 'orchard' || prompt.kind === 'tree' || prompt.kind === 'stump') result = this.woodland.interact(prompt.action, prompt.target, resourceBag);
    else if (prompt.kind === 'sapling-spot') result = this.woodland.interact('plant', prompt.target, resourceBag);
    else if (prompt.kind === 'animal' || prompt.kind === 'escaped-animal') result = this.livestock.interact(prompt.action, prompt.target, resourceBag);
    else if (prompt.kind === 'fence') result = this.livestock.interact(prompt.action, undefined, resourceBag);
    else if (prompt.kind === 'vehicle') { const v = this.vehicles[prompt.target], b = v?.getState().breakdown; const success = !!b && v.repair(b.part, resourceBag); result = { success, reason: success ? 'repaired' : 'insufficient-resources', costs: {}, rewards: {}, events: success ? [{ type: 'vehicle-repaired', vehicleType: prompt.target }] : [] }; }
    else if (prompt.kind === 'crossing' && prompt.target === 'bridge') result = this.crossings.crossings.find(c => c.type === 'bridge').health <= 0 ? this.crossings.buildBridge(resourceBag) : this.crossings.repairBridge(resourceBag);
    else if (prompt.kind === 'crossing') result = { success: true, reason:'route-available', costs:{}, rewards:{}, events:[], message:'Cross at this lane to reach the other riverbank.' };
    else if (prompt.kind === 'field') result = this.water.interact('irrigate', prompt.target, resourceBag);
    else if (prompt.kind === 'riverbank') result = this.water.interact(prompt.action, undefined, resourceBag);
    const events = result.events || [];
    for (const event of events) this.onEvent({ ...event, source: prompt.kind });
    this._syncVisuals();
    const output = { ...result, message: result.message || (result.success ? `${prompt.action.replaceAll('-', ' ')} complete.` : `${prompt.action.replaceAll('-', ' ')} failed: ${result.reason}.`), target: prompt.target };
    if (result.success) {
      const requestType = prompt.kind === 'branch' ? 'clear-branch'
        : prompt.kind === 'vehicle' ? 'repair-breakdown'
        : prompt.kind === 'animal' || prompt.kind === 'escaped-animal' ? 'animal-care'
            : prompt.kind === 'riverbank' || prompt.kind === 'crossing' || prompt.kind === 'fence' ? 'farm-repair' : null;
      const req = requestType && this.requests.list().find(item => item.type === requestType && item.status === 'active');
      if (req) {
        const key = requestType === 'clear-branch' ? 'branchesCleared' : requestType === 'repair-breakdown' ? 'breakdownsRepaired' : requestType === 'animal-care' ? 'animalsCaredFor' : 'repairsCompleted';
        const completion = this.requests.complete(req.id, { [key]: 1 });
        if (completion.success) {
          const reward = completion.reward || {};
          output.request = completion.request;
          output.requestReward = reward;
          output.rewards = { ...(output.rewards || {}), money: (Number(output.rewards?.money) || 0) + (Number(reward.money) || 0) };
          for (const [name, amount] of Object.entries(reward.resources || {})) {
            output.rewards[name] = (Number(output.rewards[name]) || 0) + (Number(amount) || 0);
            resourceBag[name] = (Number(resourceBag[name]) || 0) + (Number(amount) || 0);
          }
          const event = { type: 'contract-completed', request: completion.request, reward };
          output.events = [...(output.events || []), event]; this.onEvent(event);
        }
      }
    }
    return output;
  }

  getRequests() { return this.requests.list(); }

  completeDeliveries(inventoryLike) {
    const results = [];
    let money = 0;
    const resources = {};
    const countFor = itemId => {
      if (inventoryLike && typeof inventoryLike.getCount === 'function') return Number(inventoryLike.getCount(itemId)) || 0;
      if (Array.isArray(inventoryLike)) return inventoryLike.reduce((n, item) => n + (item && (item.itemId === itemId || item.id === itemId) ? Number(item.qty || item.count || 0) : 0), 0);
      return Number(inventoryLike?.[itemId]) || 0;
    };
    // Validate all active delivery quantities before consuming any inventory.
    const deliveries = this.requests.list().filter(request => request.type === 'deliver' && request.status === 'active');
    const remaining = new Map();
    for (const request of deliveries) if (!remaining.has(request.itemId)) remaining.set(request.itemId, countFor(request.itemId));
    for (const request of deliveries) {
      if ((remaining.get(request.itemId) || 0) < request.quantity) continue;
      // Re-check before consuming to avoid partial/double consumption through unusual inventory adapters.
      if (countFor(request.itemId) < request.quantity) continue;
      const completion = this.requests.complete(request.id, {
        inventory: { [request.itemId]: request.quantity },
        consume: true,
        consumeItem: (id, qty) => {
          if (inventoryLike && typeof inventoryLike.consumeItem === 'function') inventoryLike.consumeItem(id, qty);
          else if (inventoryLike && !Array.isArray(inventoryLike)) inventoryLike[id] = Math.max(0, (Number(inventoryLike[id]) || 0) - qty);
        },
      });
      if (!completion.success) continue;
      remaining.set(request.itemId, (remaining.get(request.itemId) || 0) - request.quantity);
      const reward = completion.reward || {};
      money += Number(reward.money) || 0;
      for (const [name, amount] of Object.entries(reward.resources || {})) resources[name] = (resources[name] || 0) + (Number(amount) || 0);
      const event = { type: 'contract-completed', request: completion.request, reward };
      this.onEvent(event);
      results.push({ success: true, request: completion.request, reward });
    }
    return { success: results.length > 0, money, resources, results };
  }

  isMovementBlocked(from, to, vehicleType = 'foot', riverLevel = this.water.riverLevel) {
    if (!from || !to || !Number.isFinite(from.z) || !Number.isFinite(to.z)) return false;
    const bodyRadius = vehicleType === 'foot' ? 0.42 : 2.2;
    // Two broad-phase samples also catch the truck's fastest capped 0.1 s step.
    const obstacles = this.woodland.queryObstacles(to.x, to.z, bodyRadius)
      .concat(this.woodland.queryObstacles((from.x + to.x) * 0.5, (from.z + to.z) * 0.5, bodyRadius));
    if (obstacles.length) {
      if (vehicleType !== 'foot' && obstacles.some(item => item.kind === 'branch')) {
        const condition = this.vehicles[vehicleType];
        if (condition && !condition.getState().breakdown) {
          const state = condition.triggerBreakdown('flat_tire');
          this.onEvent({ type: 'vehicle-breakdown', vehicleType, breakdown: state.breakdown, cause: 'fallen-branch' });
        }
      }
      return true;
    }
    const band = z => Math.abs(z + 66) < 3.5;
    if (!band(from.z) && !band(to.z)) return false;
    // Movement parallel to the same bank does not enter the river.
    if (band(from.z) && band(to.z) && Math.sign(from.z + 66) === Math.sign(to.z + 66)) return false;
    const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x);
    return !this.crossings.crossings.some(c => maxX >= c.x - c.width / 2 && minX <= c.x + c.width / 2 && this.isCrossingOpen(c.type, vehicleType, riverLevel));
  }
  isCrossingOpen(type, vehicleType = 'foot', riverLevel = this.water.riverLevel) {
    const c = this.crossings.crossings.find(item => item.type === type);
    if (!c) return false;
    const heavy = ['tractor','combine','truck','wagon'].includes(String(vehicleType).toLowerCase());
    return type === 'ferry' || (type === 'bridge' && c.health > this.crossings.config.damagedBelow && (!heavy || c.health >= .5)) || (type === 'ford' && riverLevel < this.crossings.config.fordHighWater && (!heavy || riverLevel < this.crossings.config.fordHighWater * .8));
  }
   setVehiclePosition(type, position) { if (type && position && Number.isFinite(position.x) && Number.isFinite(position.z)) this.vehiclePositions[type] = {x:position.x,y:Number.isFinite(position.y)?position.y:0,z:position.z}; }
  setVehicleCondition(type, serialized) {
    if (!type) return null;
    const key = String(type), vehicle = new VehicleCondition({
      type: key, seed: 0xabc + this.farmSlot * 997 + key.length,
      config: {
        wearPerHour: { tire: 0.9, engine: 0.55 },
        failureHazardPerHour: { flatTire: 8, engineSmoke: 4, engineFailure: 0.1 },
        failureWearThreshold: { flatTire: 0.18, engineSmoke: 0.28, engineFailure: 0.9 }
      }
    });
    if (serialized) vehicle.restore(serialized);
    this.vehicles[key] = vehicle; return vehicle;
  }
  getVehicleCondition(type) { return this.vehicles[type] || null; }
  getStatus() { return { farmSlot: this.farmSlot, woodland: this.woodland.serialize(), water: this.water.getStatus(), livestock: this.livestock.getStatus(), crossings: this.crossings.serialize(), vehicles: Object.fromEntries(Object.entries(this.vehicles).map(([k,v]) => [k,v.getState()])), requests: this.requests.list(), diagnostics: { targetCount: this._targets().length, riverBounds: [-69.5, -62.5], crossingLanes: this.crossings.crossings.map(c => ({ id:c.id, x:c.x, z:c.z, type:c.type, health:c.health, openFoot:this.isCrossingOpen(c.type), openHeavy:this.isCrossingOpen(c.type,'tractor') })) } }; }
  serialize() { return { version: 1, farmSlot: this.farmSlot, woodland: this.woodland.serialize(), water: this.water.serialize(), livestock: this.livestock.serialize(), crossings: this.crossings.serialize(), vehicles: Object.fromEntries(Object.entries(this.vehicles).map(([k,v]) => [k,v.serialize()])), vehiclePositions: this.vehiclePositions, requests: this.requests.serialize() }; }
  restore(data) {
    if (!data || data.version !== 1) return false;
    const ok = this.woodland.restore(data.woodland) && this.water.restore(data.water) && this.livestock.restore(data.livestock) && this.crossings.restore(data.crossings) && this.requests.restore(data.requests);
    if (!ok) return false;
    this.vehicles = {}; this.vehiclePositions = data.vehiclePositions || {}; for (const [type, state] of Object.entries(data.vehicles || {})) this.setVehicleCondition(type, state);
    this._syncVisuals(true);
    this._day = Number.isFinite(data.requests?.day) ? data.requests.day : this.livestock.day; return true;
  }
  dispose() {
    if (this.scene) for (const mesh of [...this._visuals, ...(this._props || [])]) this.scene.remove(mesh);
    for (const mesh of this._visuals) { mesh.geometry?.dispose?.(); mesh.material?.dispose?.(); }
    if (this._shared) { for (const value of Object.values(this._shared)) value.dispose?.(); }
    this._visuals = []; this._props = [];
  }
}
