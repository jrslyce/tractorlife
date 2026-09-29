// game/js/main.js — Tractor Farm: playable integration layer.
// Multi-farm world: 10 farms (world.js/farm.js), a walkable voxel character
// (character.js) and three vehicles (tractor.js, combine.js, vehicle.js) with
// a walking/driving mode state machine.
// Imports: three (importmap 0.160.0), ./input.js, ./world.js, ./character.js,
// ./vehicle.js, ./tractor.js, ./combine.js, ./equipment.js, ./shop.js, ./net.js
import * as THREE from 'three';
import { Input } from './input.js';
import { buildTractor, applyLivery, LIVERY_NAMES } from './tractor.js';
import { buildCombine } from './combine.js';
import { buildTruck } from './vehicle.js';
import { Character } from './character.js';
import { World, WORLD_MIN_X, WORLD_MAX_X, SHOP_X, SHOP_Z } from './world.js';
import { FARM_SPACING } from './farm.js';
import { buildEnvironment } from './environment.js';
import { Climate } from './climate.js';
import { FarmSystems } from './farm-systems.js';
import { Shop } from './shop.js';
import { ShopUI } from './shopui.js';
import { Builder } from './build.js';
import { RealtimeClient } from './realtime.js';
import { ITEM_BY_ID, packSize } from './items.js';
import { Inventory } from './inventory.js';
import { Wagon, WagonPanel, CargoHold, TRUCK_BED_SLOTS } from './wagon.js';
import { PerformanceBudget } from './performance.js';
import { steeringYawDelta } from './vehicle-physics.js';
import { TOOL_ORDER, COMBINE_HEAD_ORDER, buildTool, buildCombineHead } from './equipment.js';
import { login, restoreRememberedSession, rememberedEmail, hasRememberedEmail, forgetRememberedCredentials, startAutosave, fetchFarmers, fetchFarmState, fetchSharedWorld, placeSharedRoad, sendGift } from './net.js';

// per-vehicle scale; wheel roll radius and tool width read from this table
const VEHICLE_SCALES = { tractor: 0.5, combine: 0.5, truck: 0.5 };
// cycle order for the Machine button: tractor -> combine -> truck -> tractor
const MACHINES = ['tractor', 'combine', 'truck'];

// world bounds: x from world.js (farm 0's west fence to the last farm's east
// fence), z from the farms' north edge down past the shop (z up to ~80)
const WORLD_MIN_Z = -78;
const WORLD_MAX_Z = 80;

function clampX(x) { return x < WORLD_MIN_X ? WORLD_MIN_X : (x > WORLD_MAX_X ? WORLD_MAX_X : x); }
function clampZ(z) { return z < WORLD_MIN_Z ? WORLD_MIN_Z : (z > WORLD_MAX_Z ? WORLD_MAX_Z : z); }

const perfNavigator = {
  saveData: navigator.connection && navigator.connection.saveData,
  deviceMemory: navigator.deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency,
  userAgent: navigator.userAgent,
  reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
};
const performanceBudget = new PerformanceBudget(perfNavigator, innerWidth, innerHeight);
const perfProfile = performanceBudget.profile;

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
// far distance reaches the next farms (180 units apart) so neighbours show.
// Keep it under world.js CULL_DISTANCE (440) so farms are fogged out before
// they are culled; the shop (~70 units south of spawn) is well inside it.
scene.fog = new THREE.Fog(0x87ceeb, perfProfile.constrained ? 115 : 130, perfProfile.fogFar);

// far plane reaches across the whole map so the shop beacon is always visible
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, perfProfile.maxView);
scene.add(camera); // include camera-mounted first-person arm/item in the scene graph

const renderer = new THREE.WebGLRenderer({
  antialias: !perfProfile.constrained,
  powerPreference: 'low-power',
  precision: perfProfile.constrained ? 'mediump' : 'highp',
  alpha: false,
  stencil: false
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(performanceBudget.pixelRatio);
renderer.shadowMap.enabled = perfProfile.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
function applyPixelRatio(ratio) {
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight, false);
}

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x668855, 0.9));

const SUN_OFFSET = new THREE.Vector3(14, 26, 10); // follows whatever is driven
const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
sun.position.copy(SUN_OFFSET);
sun.castShadow = perfProfile.shadows;
if (perfProfile.shadows) sun.shadow.mapSize.set(perfProfile.shadowMapSize, perfProfile.shadowMapSize);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------- ground
// covers every farm + shop area with ~90 units of margin on every side
const GROUND_W = WORLD_MAX_X - WORLD_MIN_X + 180;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_W, 400),
  new THREE.MeshStandardMaterial({ color: '#5aa02c', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set((WORLD_MIN_X + WORLD_MAX_X) / 2, 0, -20);
ground.receiveShadow = true;
scene.add(ground);

// --- M1: E-W road strip along farms' south edge ---
// Road runs the full width of the world at z ≈ 29-41 (south of the farms)
var ROAD_LEN = WORLD_MAX_X - WORLD_MIN_X + 20;
var roadMat = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.95 });
var roadGeo = new THREE.BoxGeometry(ROAD_LEN, 0.05, 12);
var road = new THREE.Mesh(roadGeo, roadMat);
road.position.set((WORLD_MIN_X + WORLD_MAX_X) / 2, 0.025, 35);
road.receiveShadow = true;
scene.add(road);

// Road center line dashes
var dashMat = new THREE.MeshStandardMaterial({ color: '#e6c34a', roughness: 0.9 });
for (var di = 0; di < ROAD_LEN / 10; di++) {
  var dash = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.3), dashMat);
  dash.position.set(-10 + di * 10, 0.03, 35);
  scene.add(dash);
}

// decorative crop rows (south of farm 0, cheap boxes)
const rowMat = new THREE.MeshStandardMaterial({ color: '#3f7d1f', roughness: 1 });
const rowGeo = new THREE.BoxGeometry(1, 0.5, 6);
for (let i = 0; i < 8; i++) {
  const row = new THREE.Mesh(rowGeo, rowMat);
  row.position.set(-14 + i * 3, 0.25, 31);
  row.castShadow = row.receiveShadow = true;
  scene.add(row);
}

// hay bales along the lane edges
const hayMat = new THREE.MeshStandardMaterial({ color: '#e6c34a', roughness: 0.9 });
const strawMat = new THREE.MeshStandardMaterial({ color: '#c8a33a', roughness: 1 });
function hayBale(x, y, z, rot) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.6), hayMat);
  b.position.set(x, y, z);
  b.rotation.y = rot || 0;
  b.castShadow = b.receiveShadow = true;
  scene.add(b);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.65, 1.65), strawMat);
  band.position.set(x, y, z);
  band.rotation.y = rot || 0;
  band.castShadow = true;
  scene.add(band);
}
hayBale(-8, 0.8, -17.4, 0.3);
hayBale(-5.4, 0.8, -17.8, -0.5);
hayBale(-6.7, 2.5, -17.5, 0.15); // stacked
hayBale(57, 0.8, -13, 0.7);

// ---------------------------------------------------------------- world (10 farms)
// All field work / stats / serialize / restore go through world.getFarms().
const world = new World(scene, '');
const farms = world.getFarms();
const farmFields = farms.map(function (farm) { return farm.getFields(); });
const environment = buildEnvironment(scene, {
  minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: WORLD_MAX_Z
});
const climate = new Climate({ seed: 0x41f29a7 });
let climateState = climate.getState();
let farmPrompt = null;
function handleFarmEvent(event) {
  if (event.type === 'vehicle-breakdown') {
    showToast('🔧 ' + event.vehicleType + ' trouble: ' + event.breakdown.type.replaceAll('_', ' ') + ' — get out and press G nearby to repair.');
  } else if (event.type === 'animal-escaped') {
    showToast('🐄 An animal escaped! Find it by the farm and press G to herd it back.');
  } else if (event.type === 'crop-nibbled') {
    showToast('🐿️ Wildlife nibbled some orchard fruit. A healthy woodland attracts visitors.');
  } else if (event.type === 'contract-completed') {
    showToast('📬 Farm request completed — collect your reward!');
  }
}
let farmSystems = new FarmSystems({
  scene: scene, THREE: THREE, farmSlot: world.getAssignedSlot(),
  onEvent: handleFarmEvent
});
for (const machine of MACHINES) farmSystems.setVehicleCondition(machine);
const inventory = new Inventory();
inventory.install(document.body);
window.vtInventory = inventory;

// ---------------------------------------------------------------- M1: Shop
// South of the road in the middle of the map (SHOP_X/SHOP_Z from world.js).
var shop = new Shop(scene, SHOP_X, SHOP_Z);

// Shop beacon: a tall striped mast with a glowing lantern, drawn without fog
// so it shows over the horizon from every farm (camera far plane is 700).
(function buildShopBeacon() {
  const beacon = new THREE.Group();
  const pole = new THREE.MeshStandardMaterial({ color: '#f5f0e0', roughness: 0.6, fog: false });
  const stripe = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.6, fog: false });
  for (let i = 0; i < 12; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), i % 2 ? stripe : pole);
    seg.position.y = 1.5 + i * 3;
    beacon.add(seg);
  }
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4),
    new THREE.MeshBasicMaterial({ color: '#ffe066', fog: false }));
  lantern.position.y = 38;
  beacon.add(lantern);
  beacon.position.set(SHOP_X + 13.5, 0, SHOP_Z + 4);
  scene.add(beacon);
})();

// HUD arrow: always points from the player toward the shop door, with the
// distance, so the shop is easy to find from any farm.
const shopPointer = document.createElement('div');
shopPointer.id = 'shop-pointer';
shopPointer.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:31;' +
  'display:none;align-items:center;gap:6px;padding:4px 12px;border:3px solid #2f4d1f;border-radius:999px;' +
  'background:rgba(255,251,232,.94);color:#233018;font:700 15px system-ui,-apple-system,sans-serif;' +
  'pointer-events:none;box-shadow:0 2px 0 rgba(0,0,0,.2);white-space:nowrap;';
shopPointer.innerHTML = '<span>🏪 Shop</span><span id="shop-arrow" style="display:inline-block;font-size:20px;line-height:1">⬆</span><span id="shop-dist"></span>';
document.body.appendChild(shopPointer);
const shopArrow = shopPointer.querySelector('#shop-arrow');
const shopDist = shopPointer.querySelector('#shop-dist');
const camDir = new THREE.Vector3();
let shopPointerSig = '';

// ---------------------------------------------------------------- vehicles
const tractor = buildTractor('red');
const combine = buildCombine('green');
const truck = buildTruck();
const vehicles = { tractor: tractor, combine: combine, truck: truck };
for (let vi = 0; vi < MACHINES.length; vi++) {
  const vk = MACHINES[vi];
  const vs = VEHICLE_SCALES[vk];
  vehicles[vk].scale.set(vs, vs, vs);
  scene.add(vehicles[vk]);
}

// ---------------------------------------------------------------- wagon
// Hitches to the truck's rear bumper (truck model x = -10, scale 0.5).
const wagon = new Wagon(scene);
const TRUCK_HITCH = new THREE.Vector3(-11, 0, 0); // truck model space
const hitchWorld = new THREE.Vector3();
const shopDoor = new THREE.Vector3(SHOP_X + 6, 0, SHOP_Z - 2);
const grainBinPoint = shop.getGrainBinPosition();
const WAGON_SHOP_RANGE = 30; // park the wagon this close to the shop door to load purchases
const WAGON_GRAIN_RANGE = 15;
const truckBed = new CargoHold(TRUCK_BED_SLOTS, 'Truck Bed', '🚚');
const wagonPanel = new WagonPanel(wagon, inventory, function () { lastSig = ''; });
const TRUCK_SHOP_RANGE = 30;
const TAP_REACH = 10; // world units: how close you must be to use a tapped wagon/truck bed

function truckHitchPoint() {
  truck.updateMatrixWorld();
  return truck.localToWorld(hitchWorld.copy(TRUCK_HITCH));
}

function wagonAtShop() {
  return wagon.distanceTo(shopDoor.x, shopDoor.z) <= WAGON_SHOP_RANGE;
}

function truckAtShop() {
  return Math.hypot(truck.position.x - shopDoor.x, truck.position.z - shopDoor.z) <= TRUCK_SHOP_RANGE;
}

function wagonAtGrainBin() {
  return wagon.distanceTo(grainBinPoint.x, grainBinPoint.z) <= WAGON_GRAIN_RANGE;
}

function hasSaleableWagonCargo() {
  return wagon.hasAny(function (id) { return /^harvest_(corn|wheat|sunflower|pumpkin|peas)$/.test(id); });
}

function sellWagonCrops() {
  if (!wagonAtGrainBin()) { showToast('Drive the loaded wagon onto the grain-bin drop-off apron first.'); return false; }
  const values = { harvest_corn: 7, harvest_wheat: 4, harvest_sunflower: 10, harvest_pumpkin: 18, harvest_peas: 2 };
  let totalQty = 0, totalValue = 0;
  for (let i = 0; i < wagon.cargo.length; i++) {
    const stack = wagon.cargo[i];
    if (!stack || !values[stack.itemId]) continue;
    totalQty += stack.qty;
    totalValue += stack.qty * values[stack.itemId];
    wagon.cargo[i] = null;
  }
  if (!totalQty) { showToast('The wagon has no crops to sell.'); return false; }
  money += totalValue;
  lastSig = '';
  showToast('🌾 Grain delivered: sold ' + totalQty + ' crop units for $' + totalValue + '!');
  updateHUD();
  return true;
}

// The cargo hold the walking player can reach right now (wagon first).
function reachableHold() {
  if (mode !== 'walking') return null;
  const x = character.group.position.x, z = character.group.position.z;
  if (wagon.isNear(x, z)) return wagon;
  if (distanceToVehicle(truck, x, z) <= ENTER_DIST + 1.5) return truckBed;
  return null;
}

// Tap / click the wagon or the truck to open its bed. Runs in the capture
// phase on the canvas so a tap on a vehicle never also places a block.
const tapRay = new THREE.Raycaster();
const tapPointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundHit = new THREE.Vector3();
let tapTarget = null;
let tapStart = null;

function holdUnderPointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  tapPointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  tapRay.setFromCamera(tapPointer, camera);
  const hits = tapRay.intersectObjects([wagon.group, truck], true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o) {
    if (o === wagon.group) return wagon;
    if (o === truck) return truckBed;
    o = o.parent;
  }
  return null;
}

renderer.domElement.addEventListener('pointerdown', function (e) {
  tapTarget = null;
  if (window.VT_LOCKED !== false || mode !== 'walking' || buildMode || (e.button !== undefined && e.button !== 0)) return;
  const hold = holdUnderPointer(e);
  if (!hold) {
    // Pumpkins and peas are hand-harvested: tap a ready tile while standing
    // nearby. Other crops remain combine-only.
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    tapPointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    tapRay.setFromCamera(tapPointer, camera);
    if (!tapRay.ray.intersectPlane(groundPlane, groundHit)) return;
    const px = character.group.position.x, pz = character.group.position.z;
    if (Math.hypot(px - groundHit.x, pz - groundHit.z) > 5) return;
    const slot = world.getFarmAtPosition(groundHit.x, groundHit.z);
    if (slot < 0 || slot !== world.getAssignedSlot()) return;
    const fields = world.getFarms()[slot].getFields();
    for (let i = 0; i < fields.length; i++) {
      if (!fields[i].isInside(groundHit.x, groundHit.z)) continue;
      const tile = fields[i].worldToTile(groundHit.x, groundHit.z);
      if (tile && inventory.canAdd('harvest_' + (tile.cropType === 'peas' ? 'peas' : tile.cropType))) {
        // continue into the harvest transaction below
      } else if (tile && (tile.cropType === 'pumpkin' || tile.cropType === 'peas') && tile.state === 'ready') {
        e.stopImmediatePropagation();
        showToast('Your inventory is full — make room before picking.');
        return;
      }
      const crop = fields[i].harvestAt(groundHit.x, groundHit.z);
      if (!crop) return;
      const added = inventory.buy(crop.itemId, 1);
      if (!added.ok) {
        e.stopImmediatePropagation();
        showToast('Your inventory is full — make room before picking.');
        return;
      }
      lastSig = '';
      showToast(crop.itemId === 'harvest_pumpkin' ? '🎃 Pumpkin picked — sell it at the shop or place it in Build mode!' : '🟢 Peas picked — sell them at the shop!');
      e.stopImmediatePropagation();
      updateHUD();
      return;
    }
    return;
  }
  tapTarget = hold;
  tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  e.stopImmediatePropagation(); // don't let the builder place an item on the vehicle
}, true);

addEventListener('pointerup', function (e) {
  const hold = tapTarget;
  tapTarget = null;
  if (!hold || !tapStart) return;
  const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
  if (moved > 20 || performance.now() - tapStart.t > 800) return; // a drag, not a tap
  if (window.VT_LOCKED !== false || mode !== 'walking') return;
  const x = character.group.position.x, z = character.group.position.z;
  const dist = hold === wagon ? wagon.distanceTo(x, z) : distanceToVehicle(truck, x, z);
  if (dist > TAP_REACH) {
    showToast('Walk up to the ' + (hold === wagon ? 'wagon' : 'truck') + ' to open its bed');
    return;
  }
  wagonPanel.open(hold);
});

function toggleHitch() {
  if (wagon.hitched) {
    wagon.hitched = false;
    showToast('🛒 Wagon unhitched');
  } else {
    const hp = truckHitchPoint();
    if (!wagon.canHitchAt(hp.x, hp.z)) {
      showToast('Back the truck up to the wagon’s red hitch, then press F (Tool)');
      return;
    }
    wagon.hitched = true;
    showToast('🛒 Wagon hitched — let’s go!');
  }
  lastSig = '';
}

function stepWagon() {
  if (!wagon.hitched) return;
  const hp = truckHitchPoint();
  wagon.follow(hp.x, hp.z);
}

// ---------------------------------------------------------------- character
const character = new Character();
scene.add(character.group);
inventory.setCharacter(character);

// ---------------------------------------------------------------- input
const input = new Input();
input.setWalkingMode(true); // mode starts as walking (reset again on login)
input.setShopNear(false);
input.setWagonNear(false);

const firstPersonArm = new THREE.Group();
const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.62, 0.3), new THREE.MeshStandardMaterial({ color: '#2f6fb5', roughness: 0.85 }));
sleeve.position.set(0.42, -0.48, -0.72);
const hand = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.24, 0.25), new THREE.MeshStandardMaterial({ color: '#f4c28a', roughness: 0.9 }));
hand.position.set(0.42, -0.16, -0.72);
firstPersonArm.add(sleeve, hand);
firstPersonArm.visible = false;
camera.add(firstPersonArm);
inventory.setFirstPersonArm(firstPersonArm);

// ---------------------------------------------------------------- state
let mode = 'walking'; // 'walking' | 'driving'
let buildMode = false;
let vehicleType = 'tractor'; // the active (last driven) machine
let vehicle = tractor;
const vehicleColors = { tractor: 'red', combine: 'green', truck: 'gray' };
const toolSelections = { tractor: -1, combine: 0, truck: -1 };

// M1: shop proximity flag
let shopNearShown = false;
let wagonNearShown = false;
// '' | 'plant' | 'spray': the attached implement has no supplies loaded
let outOfSupply = '';
let seasonBlocked = false;
let winterBlockedToast = false;

let theta = 0; // vehicle rotation.y; forward = (cos θ, 0, −sin θ)
let speed = 0;
let velY = 0; // character vertical velocity
let onGround = true;

// M4: placement controller activates once M3 exposes the game inventory.
var builder = null;
if (window.vtInventory) {
  builder = new Builder({
    scene: scene,
    camera: camera,
    canvas: renderer.domElement,
    world: world,
    inventory: window.vtInventory,
    getAssignedSlot: function () { return world.getAssignedSlot(); },
    getWalking: function () { return mode === 'walking' && !shopUI.isOpen() && window.VT_LOCKED === false; },
    getBuildMode: function () { return buildMode; },
    onPlaced: function (entry) {
      if (entry.id === 'asphalt' || entry.id === 'gravel' || entry.id === 'brick') {
        placeSharedRoad(entry);
      }
      if (realtime) realtime.sendBuild(entry);
    }
  });
}

// ---------------------------------------------------------------- tools
let currentTool = -1; // index into the active vehicle's attachment list; -1 = detached
let toolGroup = null;

const TOOL_INFO = {
  plow: { emoji: '⛏️', name: 'Plow' },
  planter: { emoji: '🌱', name: 'Planter' },
  sprayer: { emoji: '🫧', name: 'Sprayer' },
  harvester: { emoji: '🌾', name: 'Harvester' },
  corn: { emoji: '🌽', name: 'Corn Head' },
  soybean: { emoji: '🌱', name: 'Soybean Head' },
};

function attachmentTypes() {
  // the truck has no mounts, so nothing can ever attach to it
  if (vehicleType === 'truck') return [];
  return vehicleType === 'combine' ? COMBINE_HEAD_ORDER : TOOL_ORDER;
}

// dispose materials only — geometry (BOX) is shared between tool builds
function disposeGroup(obj) {
  obj.traverse(function (n) {
    if (n.material) {
      if (Array.isArray(n.material)) n.material.forEach(function (m) { m.dispose(); });
      else n.material.dispose();
    }
  });
}

function detachTool() {
  if (toolGroup) {
    vehicle.remove(toolGroup);
    disposeGroup(toolGroup);
    toolGroup = null;
  }
  currentTool = -1;
  toolSelections[vehicleType] = -1;
}

function attachTool(idx) {
  if (!vehicle.userData.mounts) return; // truck: no mounts, nothing to attach to
  detachTool();
  const types = attachmentTypes();
  const type = types[idx];
  if (vehicleType === 'combine') toolGroup = buildCombineHead(type);
  else toolGroup = buildTool(type);
  if (!toolGroup) return;
  vehicle.add(toolGroup);
  const mountKey = toolGroup.userData.mount === 'front' ? 'front' : 'rear';
  toolGroup.position.copy(vehicle.userData.mounts[mountKey]);
  toolGroup.rotation.set(0, 0, 0);
  currentTool = idx;
  toolSelections[vehicleType] = idx;
}

// ---------------------------------------------------------------- livery
let currentColor = vehicleColors[vehicleType] || LIVERY_NAMES[0] || 'red';

function cycleColor() {
  if (vehicleType === 'truck') return; // the truck has no liveries
  const i = LIVERY_NAMES.indexOf(currentColor);
  currentColor = LIVERY_NAMES[(i + 1) % LIVERY_NAMES.length] || LIVERY_NAMES[0];
  vehicleColors[vehicleType] = currentColor;
  applyLivery(vehicle, currentColor);
}

function typeOfVehicle(v) {
  for (let i = 0; i < MACHINES.length; i++) {
    if (vehicles[MACHINES[i]] === v) return MACHINES[i];
  }
  return null;
}

// Swap the driven machine for another one *in place*: the machine you switch
// into appears where you are parked, the previous one takes its parking spot
// (keeps every vehicle at a distinct position — nothing overlaps).
function selectMachine(type) {
  if (MACHINES.indexOf(type) === -1) return;
  if (type === vehicleType) return;
  const previous = vehicle;
  const previousTool = currentTool;
  detachTool();
  toolSelections[vehicleType] = previousTool;
  vehicleType = type;
  vehicle = vehicles[type];

  const px = previous.position.x;
  const pz = previous.position.z;
  const pr = previous.rotation.y;
  previous.position.copy(vehicle.position);
  previous.rotation.y = vehicle.rotation.y;
  vehicle.position.set(px, 0, pz);
  vehicle.rotation.y = pr;

  theta = vehicle.rotation.y;
  vehicle.visible = true;
  previous.visible = true; // parked vehicles stay visible while walking
  currentColor = vehicleColors[vehicleType] || LIVERY_NAMES[0];
  applyLivery(vehicle, currentColor);
  speed = 0;
  lastSig = '';
  snapCamera();
}

function switchMachine() {
  const previousType = vehicleType;
  const previousTool = currentTool;
  let idx = MACHINES.indexOf(vehicleType);
  if (idx < 0) idx = 0;
  const nextType = MACHINES[(idx + 1) % MACHINES.length];
  selectMachine(nextType);
  toolSelections[previousType] = previousTool;
  let selected = toolSelections[nextType];
  if (nextType === 'combine' && (typeof selected !== 'number' || selected < 0)) selected = 0;
  if (typeof selected === 'number' && selected >= 0) attachTool(selected);
}

// ---------------------------------------------------------------- HUD
const COLOR_NAMES = {
  red: '🔴 Red', green: '🟢 Green', orange: '🟠 Orange',
  blue: '🔵 Blue', yellow: '🟡 Yellow', gray: '⚪ Gray',
};
const MACHINE_NAMES = { tractor: 'Tractor', combine: 'Combine', truck: 'Truck' };
const MACHINE_ICONS = { tractor: '🚜', combine: '🌾', truck: '🚚' };
const MACHINE_LABELS = { tractor: '🚜 Tractor', combine: '🌾 Combine', truck: '🚚 Truck' };

const hudStyle = document.createElement('style');
hudStyle.textContent = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 30;
  font-family: system-ui, -apple-system, sans-serif; color:#f5f5e8; }
#hud .card { position: absolute; max-width: 42%; box-sizing: border-box;
  background:rgba(19,27,21,.88); border:2px solid #a9ca72;
  border-radius:8px; padding:8px 11px; color:#f5f5e8;
  box-shadow:3px 3px 0 rgba(0,0,0,.55); -webkit-user-select:none; user-select:none; }
#hud-top-left { left:max(10px,env(safe-area-inset-left)); top:max(10px,env(safe-area-inset-top));
  font-size:13px; line-height:1.35; min-width:150px; }
#hud-top-left b { color:#ffe36b; font-size:19px; font-variant-numeric:tabular-nums; }
#hud-top-left div:nth-child(2) { color:#b9e27e; font-weight:800; text-transform:uppercase; font-size:11px; letter-spacing:.06em; }
#hud-top-right { right:max(10px,env(safe-area-inset-right)); top:max(10px,env(safe-area-inset-top));
  display:grid; grid-template-columns:repeat(2,minmax(74px,auto)); gap:3px 10px;
  font-size:12px; line-height:1.35; text-align:left; max-width:48%; }
#hud-top-right b { color:#ffe36b; font-variant-numeric:tabular-nums; }
#hud #hud-hint { position:absolute; left:max(12px,env(safe-area-inset-left)); bottom:calc(16px + env(safe-area-inset-bottom));
  width:max-content; max-width:min(360px,calc(100vw - 24px));
  font-size:11px; line-height:1.3; font-weight:700; text-align:left; color:#fffbe8; padding:6px 9px; }
body.vt-driving #hud #hud-hint { bottom:calc(clamp(126px,22vw,176px) + 40px + env(safe-area-inset-bottom)); }
#build-reticle { display:none; position:absolute; left:50%; top:50%; width:18px; height:18px;
  transform:translate(-50%,-50%); filter:drop-shadow(1px 1px 1px #101710); }
#build-reticle:before,#build-reticle:after { content:""; position:absolute; background:#fffbe8; border:1px solid #19241b; }
#build-reticle:before { left:8px;top:0;width:2px;height:18px; } #build-reticle:after { top:8px;left:0;width:18px;height:2px; }
body.vt-build-mode #build-reticle { display:block; }
.sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px;
  border: 1px solid rgba(0,0,0,.35); vertical-align: -1px; margin-right: 4px; }
.leg { white-space: nowrap; }
@media(max-width:640px){#hud-top-left{min-width:0;max-width:43%;font-size:11px;padding:6px 8px}
  #hud-top-left b{font-size:16px}#hud-top-right{max-width:48%;grid-template-columns:repeat(2,minmax(52px,auto));font-size:10px;padding:6px 8px}
  #hud #hud-hint{max-width:min(280px,calc(100vw - 24px));font-size:10px;padding:5px 8px}
  body.vt-driving #hud #hud-hint{bottom:calc(clamp(126px,25vw,150px) + 30px + env(safe-area-inset-bottom))}}
@media(max-height:520px){#hud #hud-hint{max-width:min(320px,calc(42vw - 12px));bottom:calc(14px + env(safe-area-inset-bottom))}
  body.vt-driving #hud #hud-hint{bottom:calc(220px + env(safe-area-inset-bottom))}}
`;
document.head.appendChild(hudStyle);

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <div class="card" id="hud-top-left"></div>
  <div class="card" id="hud-top-right"></div>
  <div class="card" id="hud-hint"></div>
  <div id="build-reticle" aria-hidden="true"></div>
`;
document.body.appendChild(hud);
const hudLeft = document.getElementById('hud-top-left');
const hudRight = document.getElementById('hud-top-right');
const hudHint = document.getElementById('hud-hint');

const toast = document.createElement('div');
toast.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:90;' +
  'display:none;max-width:90vw;padding:10px 15px;border:2px solid #b9e27e;border-radius:8px;' +
  'background:rgba(19,27,21,.96);color:#f7f6e9;font:750 15px system-ui,-apple-system,sans-serif;' +
  'box-shadow:3px 3px 0 rgba(0,0,0,.5);text-align:center;pointer-events:none;';
document.body.appendChild(toast);
let toastTimer = null;
let appliedGiftIds = [];
function showToast(text) {
  toast.textContent = text;
  toast.style.display = 'block';
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.style.display = 'none'; toastTimer = null; }, 4200);
}

let money = 0;
let lastSig = '';
const FARM_RESOURCE_ITEMS = {
  wood: 'wood', stone: 'stone', metal: 'metal', feed: 'animal_feed', water: 'water_jug', fuel: 'fuel_can',
  spareTire: 'spare_tire', repairKit: 'repair_kit', cleanup_kit: 'cleanup_kit',
  sapling: 'sapling', toolUse: 'tool_use', firewood: 'firewood', fruit: 'fruit',
  fish: 'fish', animal_produce: 'animal_produce', produce: 'animal_produce'
};
function getFarmResourceBag() {
  const bag = {};
  Object.keys(FARM_RESOURCE_ITEMS).forEach(function (key) {
    bag[key] = inventory.getCount(FARM_RESOURCE_ITEMS[key]);
  });
  return bag;
}
function applyFarmResourceBag(before, after) {
  Object.keys(FARM_RESOURCE_ITEMS).forEach(function (key) {
    const itemId = FARM_RESOURCE_ITEMS[key];
    const delta = (Number(after[key]) || 0) - (Number(before[key]) || 0);
    if (delta < 0) inventory.consumeItem(itemId, -delta);
    else if (delta > 0 && !inventory.buy(itemId, delta).ok) {
      // Full hotbars still receive the value of gathered/cared-for goods.
      const values = { firewood: 3, fruit: 6, fish: 8, animal_produce: 5 };
      money += delta * (values[key] || 1);
      showToast('🎒 Hotbar full — converted the extra ' + key + ' into farm earnings.');
    }
  });
  inventory.updateDOM();
}
window.vtPurchaseItem = function (item, qty, balance) {
  if (!item || !Number.isInteger(qty) || qty < 1 || money < item.price * qty) return { ok: false, error: 'Not enough money.' };
  const units = qty * packSize(item);
  if (['animal_feed', 'water_jug', 'fuel_can', 'spare_tire', 'repair_kit', 'cleanup_kit', 'sapling', 'stone', 'metal', 'tool_use'].indexOf(item.id) !== -1) {
    return inventory.buy(item.id, units);
  }
  // Wagon parked at the shop: purchases go straight onto it for the trip home.
  if (wagonAtShop()) {
    const loaded = wagon.add(item.id, units);
    if (loaded.ok) {
      showToast('🛒 ' + item.name + ' loaded onto your wagon');
      return loaded;
    }
  }
  if (truckAtShop()) {
    const loaded = truckBed.add(item.id, units);
    if (loaded.ok) {
      showToast('🚚 ' + item.name + ' loaded into your truck bed');
      return loaded;
    }
  }
  return inventory.buy(item.id, units);
};

const shopUI = new ShopUI({
  getMoney: function () { return money; },
  getProduce: function () {
  const goods = [
      ['harvest_pumpkin', 'Pumpkins', '🎃', 18],
      ['harvest_peas', 'Peas', '🟢', 2],
      ['harvest_corn', 'Corn', '🌽', 7],
      ['harvest_wheat', 'Wheat', '🌾', 4],
      ['harvest_sunflower', 'Sunflower heads', '🌻', 10],
      ['firewood', 'Firewood', '🪵', 3],
      ['fruit', 'Orchard fruit', '🍎', 6],
      ['fish', 'River fish', '🐟', 8],
      ['animal_produce', 'Farm produce', '🥚', 5]
    ];
    return goods.filter(function (g) { return inventory.getCount(g[0]) > 0; }).map(function (g) {
      return { id: g[0], name: g[1], emoji: g[2], value: g[3], qty: inventory.getCount(g[0]) };
    });
  },
  onSell: function (itemId, qty, unitValue) {
    const sold = inventory.consumeItem(itemId, qty);
    if (sold !== qty) return { ok: false, error: 'Your harvest changed. Please try again.' };
    money += sold * unitValue;
    lastSig = '';
    updateHUD();
    return { ok: true };
  },
  onPurchase: function (item, qty) {
    // M3 owns the inventory; use its integration hook when present.
    if (typeof window.vtPurchaseItem !== 'function') {
      return { ok: false, error: 'Your inventory is not ready yet.' };
    }
    var result = window.vtPurchaseItem(item, qty, money);
    if (!result || result.ok === false) return result || { ok: false, error: 'Purchase failed.' };
    money -= item.price * qty;
    lastSig = '';
    updateHUD();
    return { ok: true };
  },
  onGift: function (item, qty, recipient) {
    return sendGift(recipient, item.id, qty).then(function (result) {
      if (result && result.ok) {
        money = Math.max(0, money - item.price * qty);
        lastSig = '';
        updateHUD();
        shopUI.refreshBalance();
      }
      return result;
    });
  }
});

// own-farm stats: that is the farm the player actually controls
function ownFarmStats() {
  const farms = world.getFarms();
  const slot = world.getAssignedSlot();
  const farm = (slot >= 0 && slot < farms.length) ? farms[slot] : null;
  if (farm) return farm.getStats();
  return { tilled: 0, planted: 0, sprayed: 0, harvested: 0 };
}

// slot of the farm under whatever is currently controlled
function currentFarmSlot() {
  const x = mode === 'driving' ? vehicle.position.x : character.group.position.x;
  const z = mode === 'driving' ? vehicle.position.z : character.group.position.z;
  return world.getFarmAtPosition(x, z);
}

function farmLabel(slot) {
  if (slot < 0) return '🛣️ The Road';
  if (slot === world.getAssignedSlot()) return '🏡 Your Farm';
  const em = slotToEmail[slot];
  if (em) return '🤝 ' + em + '’s Farm';
  return '🌳 Farm ' + (slot + 1);
}

function updateHUD() {
  const s = ownFarmStats();
  climateState = climate.getState();
  const farmStatus = farmSystems.getStatus();
  const breakdowns = Object.keys(farmStatus.vehicles).filter(function (type) { return !!farmStatus.vehicles[type].breakdown; });
  const types = attachmentTypes();
  const type = currentTool >= 0 ? types[currentTool] : null;
  const info = type ? TOOL_INFO[type] : null;
  const near = mode === 'walking' ? nearestVehicleInfo() : null;
  const farmSlot = currentFarmSlot();
  const label = farmLabel(farmSlot);
  const modeLine = mode === 'driving'
    ? MACHINE_ICONS[vehicleType] + ' Driving ' + MACHINE_NAMES[vehicleType]
    : (buildMode ? '🧱 First-person Build' : '🚶 Walking');
  const nearName = near ? MACHINE_NAMES[near.type] : '';
  // rebuild only when something actually changed
  const sig = vehicleType + '|' + money + '|' + currentTool + '|' + currentColor + '|' +
    s.tilled + '|' + s.planted + '|' + s.sprayed + '|' + s.harvested + '|' +
    climateState.day + '|' + climateState.season + '|' + climateState.weather + '|' +
    (farmPrompt ? farmPrompt.action + ':' + farmPrompt.target : '') + '|' +
    farmStatus.livestock.day + '|' + farmStatus.livestock.escaped.length + '|' +
    farmStatus.livestock.careNeeds.length + '|' + farmStatus.requests.length + '|' +
    breakdowns.join(',') + '|' +
    Math.round(farmStatus.water.riverLevel * 10) + '|' + Math.round(farmStatus.water.pollution * 10) + '|' +
    mode + '|' + buildMode + '|' + farmSlot + '|' + label + '|' + nearName + '|' + outOfSupply + '|' + seasonBlocked + '|' +
    wagon.hitched + '|' + wagonNearShown + '|' + (shopNearShown && (wagonAtShop() || truckAtShop()));
  if (sig === lastSig) return;
  lastSig = sig;

  let left =
    '<div>💰 <b>$' + money + '</b></div>' +
    '<div>' + modeLine + '</div>' +
    '<div>' + label + '</div>' +
    '<div>' + MACHINE_LABELS[vehicleType] + '</div>' +
    '<div>' + (info ? info.emoji + ' ' + info.name : 'No attachment') + '</div>' +
    '<div>🎨 ' + (COLOR_NAMES[currentColor] || currentColor) + '</div>';
  if (near) {
    left += '<div style="margin-top:4px;font-weight:700;color:#1c3b12">Press E — hop in the ' +
      nearName + '</div>';
  }
  hudLeft.innerHTML = left;

  hudRight.innerHTML =
    '<div>📅 <b>Day ' + climateState.day + ' · ' + climateState.season + '</b></div>' +
    '<div>🌤️ <b>' + climateState.weather + '</b></div>' +
    '<div>🌳 Trees <b>' + farmStatus.woodland.trees.length + '</b></div>' +
    '<div>🐄 Animals <b>' + farmStatus.livestock.animals.length + '</b></div>' +
    '<div>🌊 River <b>' + Math.round(farmStatus.water.riverLevel * 100) + '%</b></div>' +
    '<div>📬 Requests <b>' + farmStatus.requests.length + '</b></div>' +
    '<div>🔧 Repairs <b>' + breakdowns.length + '</b></div>' +
    '<div>🐟 Fish <b>' + Math.round(farmStatus.water.fishPopulation) + '</b></div>' +
    '<div>🟫 Soil <b>' + s.tilled + '</b></div>' +
    '<div>🌱 Crops <b>' + s.planted + '</b></div>' +
    '<div>🫧 Fed <b>' + s.sprayed + '</b></div>' +
    '<div>🌾 Picked <b>' + s.harvested + '</b></div>' +
    (mode === 'driving' && vehicleType === 'combine' ?
      '<div>🛢️ Combine bin: <b>' + combineBinCount() + '/' + COMBINE_BIN_CAPACITY + '</b>' +
      '<div style="height:10px;margin:3px 0 6px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.55);border-radius:5px;overflow:hidden">' +
      '<div style="height:100%;width:' + Math.min(100, combineBinCount() * 100 / COMBINE_BIN_CAPACITY) + '%;background:#e5b83e"></div></div></div>' : '');

  let hint;
  if (mode === 'walking') {
    hint = buildMode
      ? 'BUILD MODE · Select wood or a pumpkin on your hotbar, aim, then tap to place. Tap Exit Build to leave.'
      : 'Walk with the left stick. Tap Enter by a vehicle, Interact near farm tasks, or Shop to trade.';
  } else if (vehicleType === 'truck') {
    hint = wagon.hitched
      ? '🛒 Wagon hitched — park by the shop to load purchases · tap Unhitch'
      : 'Select R · REVERSE, hold GAS back to the wagon’s red hitch, then tap Hitch';
  } else if (vehicleType === 'combine') {
    if (currentTool < 0) hint = 'Tap Attach to fit a corn or soybean head';
    else if (s.harvested === 0) hint = 'Drive the ' + info.name + ' across golden, ready crops to harvest';
    else hint = 'Harvest with the ' + info.name + ' · tap Next tool to switch heads';
    hint += ' · tap Machine to switch vehicles';
    if (combineBinCount() >= COMBINE_BIN_CAPACITY) hint = 'Combine bin full — park beside the wagon and tap Unload at the side auger.';
  } else if (s.tilled === 0) {
    hint = 'Tap Attach to fit the PLOW — drive into any field';
  } else if (s.planted === 0) {
    hint = 'Tap Next tool for the PLANTER — drive over tilled soil';
  } else if (s.sprayed === 0 || s.sprayed < s.planted) {
    hint = 'Crops are green — tap Next tool to attach the SPRAYER';
  } else if (s.harvested === 0) {
    hint = 'Golden crops! Tap Next tool for the HARVESTER to collect them';
  } else {
    hint = 'Great farming! Keep going 💰';
  }
  if (mode === 'driving' && vehicleType === 'tractor') hint += ' · tap Machine to switch vehicles';
  if (outOfSupply === 'plant') {
    hint = 'The planter is empty — buy seeds at the 🏪 Shop (follow the arrow at the top)';
  } else if (outOfSupply === 'spray') {
    hint = 'The sprayer is empty — buy Crop Spray at the 🏪 Shop (follow the arrow at the top)';
  } else if (seasonBlocked) {
    hint = '❄️ The ground is resting for winter — plant again when spring arrives.';
  }
  if (wagonNearShown) {
    const hold = reachableHold();
    hint = hold === wagon
      ? 'Tap the wagon to load or unload supplies'
      : 'Tap the truck bed to load or unload supplies · tap Enter to drive';
  }
  if (mode === 'walking' && shop.isNear(character.group.position.x, character.group.position.z)) {
    hint = wagonAtShop() || truckAtShop()
      ? 'Tap Shop — purchases load onto your ' + (wagonAtShop() ? 'wagon' : 'truck')
      : 'Tap Shop to trade with the shopkeeper';
  }
  if (wagonAtGrainBin() && hasSaleableWagonCargo()) {
    hint = '🌾 Grain depot: tap Sell crops to unload the wagon and collect payment.';
  }
  if (farmPrompt && mode === 'walking' && !shopUI.isOpen()) {
    hint = 'Tap Interact · ' + farmPrompt.label + (farmPrompt.kind === 'crossing' ? ' (cross the river here)' : '');
  }
  hudHint.textContent = hint;
}

function updateShopPointer() {
  const visible = window.VT_LOCKED === false && !shopUI.isOpen();
  shopPointer.style.display = visible ? 'flex' : 'none';
  if (!visible) return;
  const px = mode === 'driving' ? vehicle.position.x : character.group.position.x;
  const pz = mode === 'driving' ? vehicle.position.z : character.group.position.z;
  const dx = shopDoor.x - px;
  const dz = shopDoor.z - pz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  camera.getWorldDirection(camDir);
  const fl = Math.sqrt(camDir.x * camDir.x + camDir.z * camDir.z) || 1;
  const fx = camDir.x / fl, fz = camDir.z / fl;
  // screen-right on the ground is (−fz, fx); angle is clockwise from "ahead"
  const deg = Math.round(Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz) * 180 / Math.PI / 5) * 5;
  const text = dist < 14 ? 'is right here!' : Math.round(dist) + ' m';
  const sig = deg + '|' + text;
  if (sig === shopPointerSig) return;
  shopPointerSig = sig;
  shopArrow.style.transform = 'rotate(' + deg + 'deg)';
  shopArrow.style.visibility = dist < 14 ? 'hidden' : 'visible';
  shopDist.textContent = text;
}

// ---------------------------------------------------------------- fps
// Frames-per-second readout in the top-right corner (above the stats card),
// averaged over half-second windows.
const fpsBadge = document.createElement('div');
fpsBadge.id = 'fps';
fpsBadge.style.cssText = 'position:fixed;right:10px;top:10px;z-index:31;pointer-events:none;' +
  'padding:2px 8px;border:2px solid #2f4d1f;border-radius:8px;background:rgba(255,251,232,.9);' +
  'color:#233018;font:700 13px ui-monospace,Menlo,monospace;';
fpsBadge.textContent = '-- FPS';
document.body.appendChild(fpsBadge);
let fpsFrames = 0;
let fpsSince = performance.now();

function updateFps(now) {
  fpsFrames++;
  const elapsed = now - fpsSince;
  if (elapsed < 500) return;
  fpsBadge.textContent = Math.round(fpsFrames * 1000 / elapsed) + ' FPS';
  fpsFrames = 0;
  fpsSince = now;
}

// ---------------------------------------------------------------- physics
const MAX_FWD = 9;
const MAX_REV = 4;
const TRUCK_MAX_FWD = 23.4;
const COMBINE_BIN_CAPACITY = 200;
let combineBin = {};
function combineBinCount() {
  return Object.keys(combineBin).reduce(function (total, id) { return total + combineBin[id]; }, 0);
}
const ACCEL_RATE = 6;
const BRAKE_RATE = 10;
const STEER_RATE = 1.6;

// character tuning
const CHAR_SPEED = 4.5; // units/s at full stick
const CHAR_TURN_RATE = 2.6; // rad/s at full stick
const GRAVITY = -18; // units/s²
const JUMP_V = 6.5; // jump impulse, units/s

const fwd = new THREE.Vector3();
const tmpLocal = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();

function stepPhysics(dt) {
  if (mode !== 'driving') return;
  const drive = input.drive;
  // the truck is the fast road machine for hauling the wagon to the shop
  const maxForward = vehicleType === 'combine' ? 5.5 : (vehicleType === 'truck' ? TRUCK_MAX_FWD : MAX_FWD);
  const maxReverse = vehicleType === 'combine' ? 2.5 : MAX_REV;
  const condition = farmSystems.getVehicleCondition(vehicleType);
  const conditionState = condition ? condition.getState() : null;
  const machineLimit = conditionState ? conditionState.speedMultiplier : 1;
  const target = drive > 0 ? drive * maxForward * machineLimit : drive * maxReverse * machineLimit;
  const stopping = input.brake || drive === 0;
  const rate = stopping ? BRAKE_RATE : ACCEL_RATE;
  const diff = target - speed;
  const step = rate * dt;
  speed = Math.abs(diff) <= step ? target : speed + (diff > 0 ? step : -step);

  // steering only bites while rolling; reversing flips the turn direction
  const steeringRate = vehicleType === 'combine' ? 0.95 : STEER_RATE;
  // A positive input.turn is right; with +X as vehicle forward, rightward yaw
  // is negative around Three.js' Y axis. Keep the same mapping for the truck.
  theta += steeringYawDelta(input.turn, steeringRate, speed, dt);
  vehicle.rotation.y = theta;

  const steeringPivots = vehicle.userData.steeringPivots || [];
  for (let i = 0; i < steeringPivots.length; i++) {
    // Visual wheel angle follows the same right-positive convention as yaw.
    steeringPivots[i].rotation.y = -input.turn * 0.42 * (speed < 0 ? -1 : 1);
  }

  const cs = Math.cos(theta), sn = Math.sin(theta);
  const previous = { x: vehicle.position.x, z: vehicle.position.z };
  const next = {
    x: clampX(vehicle.position.x + cs * speed * dt),
    z: clampZ(vehicle.position.z - sn * speed * dt)
  };
  if (farmSystems.isMovementBlocked(previous, next, vehicleType, farmSystems.water.riverLevel)) {
    speed = 0;
  } else {
    vehicle.position.x = next.x;
    vehicle.position.z = next.z;
  }

  // Wheel radii are in model units and scaled with the active machine.
  const scale = VEHICLE_SCALES[vehicleType];
  const wheels = vehicle.userData.wheels || [];
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    const r = (w.radius || 1) * scale;
    w.pivot.rotation.z -= (speed / r) * dt;
  }
}

function tryJump() {
  if (mode !== 'walking' || !onGround) return;
  velY = JUMP_V;
  onGround = false;
}

function stepCharacter(dt) {
  if (mode === 'walking') {
    // turn (rotation.y; model faces +Z, so facing = (sin a, 0, cos a))
    const a = character.group.rotation.y - input.charTurn * CHAR_TURN_RATE * dt;
    character.group.rotation.y = a;

    // drive along the facing
    const mv = input.charDrive * CHAR_SPEED;
    const p = character.group.position;
    const previous = { x: p.x, z: p.z };
    const next = { x: clampX(p.x + Math.sin(a) * mv * dt), z: clampZ(p.z + Math.cos(a) * mv * dt) };
    if (!farmSystems.isMovementBlocked(previous, next, 'foot', farmSystems.water.riverLevel)) {
      p.x = next.x;
      p.z = next.z;
    }

    // one-shot jump from Space or the mobile Jump button
    if (input.charJump) tryJump();
    input.clearJump();

    // gravity
    velY += GRAVITY * dt;
    p.y += velY * dt;
    if (p.y <= 0) {
      p.y = 0;
      velY = 0;
      onGround = true;
    } else {
      onGround = false;
    }

    character.setWalking(Math.abs(input.charDrive) > 0.08);
    character.setJumping(!onGround && velY > 0);
  } else {
    character.setWalking(false);
    character.setJumping(false);
    input.clearJump(); // eat stray jumps so they don't fire on exit
  }
  character.update(dt);
}

// ---------------------------------------------------------------- enter/exit
const ENTER_DIST = 3; // world units from a vehicle's hull
// approximate half-extents of each vehicle (already scaled)
const VEHICLE_HALF = {
  tractor: { x: 4.5, z: 2.6 },
  combine: { x: 5, z: 3.9 },
  truck: { x: 5.3, z: 2.8 }, // model spans x ±10, z ±5.5 at scale 0.5
};

function distanceToVehicle(v, x, z) {
  const type = typeOfVehicle(v);
  const h = VEHICLE_HALF[type];
  if (!h) return 1e9;
  const dx = x - v.position.x;
  const dz = z - v.position.z;
  const c = Math.cos(v.rotation.y);
  const s = Math.sin(v.rotation.y);
  const lx = dx * c - dz * s; // into vehicle-local space
  const lz = dx * s + dz * c;
  let ox = Math.abs(lx) - h.x;
  let oz = Math.abs(lz) - h.z;
  if (ox < 0) ox = 0;
  if (oz < 0) oz = 0;
  return Math.sqrt(ox * ox + oz * oz);
}

function nearestVehicleInfo() {
  if (mode !== 'walking') return null;
  const px = character.group.position.x;
  const pz = character.group.position.z;
  let best = null;
  for (let i = 0; i < MACHINES.length; i++) {
    const k = MACHINES[i];
    const d = distanceToVehicle(vehicles[k], px, pz);
    if (d <= ENTER_DIST && (!best || d < best.dist)) {
      best = { vehicle: vehicles[k], type: k, dist: d };
    }
  }
  return best;
}

function enterVehicle(target) {
  setBuildMode(false);
  const type = typeOfVehicle(target);
  if (!type) return;
  if (type !== vehicleType) {
    const previousTool = currentTool;
    detachTool(); // remember + remove the old machine's implement
    toolSelections[vehicleType] = previousTool;
    vehicleType = type;
    vehicle = target;
    currentColor = vehicleColors[vehicleType] || LIVERY_NAMES[0];
    applyLivery(vehicle, currentColor);
    // equip the machine's remembered implement (combine defaults to a head)
    let selected = toolSelections[vehicleType];
    if (vehicleType === 'combine' && (typeof selected !== 'number' || selected < 0)) selected = 0;
    if (typeof selected === 'number' && selected >= 0 && vehicle.userData.mounts) attachTool(selected);
  }
  theta = vehicle.rotation.y;
  speed = 0;
  character.setVisible(false); // hidden while driving
  input.setWalkingMode(false);
  mode = 'driving';
  input.setDrivingMode(true);
  lastSig = '';
}

function exitVehicle() {
  // A direct stop makes EXIT dependable on touch screens: players should
  // never be trapped because they tapped the control before fully braking.
  speed = 0;
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  // Step-out candidates around the hull, nearest first: right-hand
  // perpendicular, left-hand perpendicular, ahead, behind — then the same
  // four with progressively larger radii. Each is clamped to world bounds,
  // and we take the first that lands clearly OUTSIDE the vehicle's hull
  // (VEHICLE_HALF + 0.5 clearance). Near a world edge the clamp can cancel
  // a small offset, so we never assume the first candidate works.
  const dirs = [
    [sn, cs],   // right-hand perpendicular (old default)
    [-sn, -cs], // left-hand perpendicular
    [cs, -sn],  // ahead along heading
    [-cs, sn],  // behind along heading
  ];
  const baseR = [2.5, 2.5, 3, 3];
  const scales = [1, 1.6, 2.2, 3];
  let best = null;
  let bestClear = -1;
  let chosen = null;
  for (let si = 0; si < scales.length && chosen === null; si++) {
    for (let di = 0; di < dirs.length; di++) {
      const r = baseR[di] * scales[si];
      const ex = clampX(vehicle.position.x + dirs[di][0] * r);
      const ez = clampZ(vehicle.position.z + dirs[di][1] * r);
      const clear = distanceToVehicle(vehicle, ex, ez);
      if (clear > bestClear) { // least-bad fallback if nothing works
        bestClear = clear;
        best = [ex, ez, dirs[di]];
      }
      if (clear >= 0.5) { // outside the hull with ~0.5 units of clearance
        chosen = [ex, ez, dirs[di]];
        break;
      }
    }
  }
  const spot = chosen || best; // fall back to the least-bad candidate
  const ex = spot[0];
  const ez = spot[1];
  const dx = spot[2][0];
  const dz = spot[2][1];
  character.group.position.set(ex, 0, ez);
  // face the way we stepped: away from / alongside the vehicle, never into it
  character.group.rotation.y = Math.atan2(dx, dz);
  velY = 0;
  onGround = true;
  character.setVisible(true);
  input.setWalkingMode(true);
  mode = 'walking';
  input.setDrivingMode(false);
  speed = 0; // the vehicle stays exactly where it is
  lastSig = '';
}

function handleEnterExit() {
  if (mode === 'driving') {
    exitVehicle();
  } else {
    if (shop.isNear(character.group.position.x, character.group.position.z)) {
      shopUI.setRecipients(farmerRoster, session ? session.email : '');
      shopUI.open();
      return;
    }
    const near = nearestVehicleInfo();
    if (near) enterVehicle(near.vehicle);
  }
}

// ---------------------------------------------------------------- field work
// field.applyEffect heading: along = dx·cos(h)+dz·sin(h) with dx = tile.x − x,
// so forward in (x,z) = (cos h, sin h). Tractor forward = (cos θ, −sin θ),
// therefore h = −θ. Width is world units; implements share the machine scale.
function hasSupplyFor(effect) {
  if (effect === 'plant') return inventory.findSlot(function (id) { return /_seeds$/.test(id); }) >= 0;
  if (effect === 'spray') return inventory.findSlot(function (id) { return id === 'crop_spray'; }) >= 0;
  return true;
}

function canPlantCrop(cropType, season) {
  const crop = cropType === 'generic' ? 'wheat' : cropType;
  const seasons = { corn: ['summer', 'spring'], wheat: ['spring', 'autumn'], sunflower: ['summer', 'spring'], pumpkin: ['summer', 'spring'], peas: ['spring', 'autumn'] };
  return !seasons[crop] || seasons[crop].indexOf(season) !== -1;
}

let cropTickElapsed = 0;
let floodStressElapsed = [0, 0, 0, 0];
function stepFieldWork(dt) {
  const toolEffect = mode === 'driving' && toolGroup ? toolGroup.userData.effect : '';
  outOfSupply = hasSupplyFor(toolEffect) ? '' : toolEffect;
  seasonBlocked = false;
  // work only counts while driving, and only over fields on your own farm
  if (mode === 'driving' && toolGroup && Math.abs(speed) > 0.4) {
    const mountKey = toolGroup.userData.mount === 'front' ? 'front' : 'rear';
    const mount = vehicle.userData.mounts[mountKey];
    const offset = typeof toolGroup.userData.workOffset === 'number'
      ? toolGroup.userData.workOffset
      : (toolGroup.userData.mount === 'front' ? 2 : -2);
    tmpLocal.copy(mount);
    tmpLocal.x += offset;
    vehicle.updateMatrixWorld();
    vehicle.localToWorld(tmpLocal);
    const slot = world.getFarmAtPosition(tmpLocal.x, tmpLocal.z);
    if (slot >= 0 && slot === world.getAssignedSlot()) {
      const width = toolGroup.userData.width * VEHICLE_SCALES[vehicleType];
      const farmFields = world.getFarms()[slot].getFields();
      const effect = toolGroup.userData.effect;
      // The planter and sprayer run on supplies bought at the shop: seeds
      // (the selected bag first, else any bag in the hotbar) and crop spray.
      // One unit works one tile; with none loaded the implement does nothing.
      let cropType = 'generic';
      let supplySlot = -1;
      let supplyLimit = 0;
      if (effect === 'plant') {
        supplySlot = inventory.findSlot(function (id) { return /_seeds$/.test(id); });
        if (supplySlot >= 0) {
          cropType = inventory.getSlot(supplySlot).itemId.slice(0, -6);
          if (cropType === 'pea') cropType = 'peas';
        }
      } else if (effect === 'spray') {
        supplySlot = inventory.findSlot(function (id) { return id === 'crop_spray'; });
      }
      const needsSupply = effect === 'plant' || effect === 'spray';
      if (effect === 'plant' && !canPlantCrop(cropType, climateState.season)) {
        seasonBlocked = true;
        if (!winterBlockedToast) {
          showToast('🌱 ' + cropType + ' is out of season. Try again in spring or summer.');
          winterBlockedToast = true;
        }
      } else winterBlockedToast = false;
      if (needsSupply && supplySlot >= 0) supplyLimit = inventory.getSlot(supplySlot).qty;
      if (effect === 'harvest') supplyLimit = Math.max(0, COMBINE_BIN_CAPACITY - combineBinCount());
      if ((!needsSupply || supplySlot >= 0) && !seasonBlocked) {
        if (effect !== 'harvest' || supplyLimit > 0) {
        for (let i = 0; i < farmFields.length; i++) {
          if (farmFields[i].isInside(tmpLocal.x, tmpLocal.z)) {
            const res = farmFields[i].applyEffect(
              tmpLocal.x, tmpLocal.z, width, effect, -theta, cropType, supplyLimit
            );
            if (res.money) money += res.money;
            if (needsSupply && res.affected > 0) inventory.useFromSlot(supplySlot, res.affected);
            if (res.produce) {
              Object.keys(res.produce).forEach(function (id) {
                combineBin[id] = (combineBin[id] || 0) + res.produce[id];
              });
            }
            break;
          }
        }
        }
      }
    }
  }
  // Crop stages are visually coarse. Accumulate time and tick the cached field
  // list at 4 Hz instead of scanning every tile in all farms every render.
  cropTickElapsed += dt;
  if (cropTickElapsed >= 0.25) {
    const cropDt = Math.min(cropTickElapsed, 1);
    cropTickElapsed = 0;
    const ownedSlot = world.getAssignedSlot();
    const waterFields = farmSystems.water.fields;
    for (let i = 0; i < farmFields.length; i++) {
      for (let j = 0; j < farmFields[i].length; j++) {
        let growthRate = 1;
        const seasonalRate = { spring: 1, summer: 1.1, autumn: 0.85, winter: 0.3 }[climateState.season] || 1;
        growthRate *= seasonalRate;
        if (i === ownedSlot && waterFields[j]) {
          const waterField = waterFields[j];
          if (climateState.weather === 'drought' && waterField.water < 0.3) growthRate = 0.35;
          if (waterField.flooded) {
            growthRate = 0.15;
            floodStressElapsed[j] += cropDt;
            if (floodStressElapsed[j] >= 12) {
              const damaged = farmFields[i][j].damageCrops(1);
              floodStressElapsed[j] %= 12;
              if (damaged) showToast('🌊 Floodwater ruined a crop tile. Reinforce the riverbank or wait for the level to fall.');
            }
          } else if (climateState.weather === 'frost') {
            floodStressElapsed[j] += cropDt;
            if (floodStressElapsed[j] >= 24) {
              const damaged = farmFields[i][j].damageCrops(1);
              floodStressElapsed[j] %= 24;
              if (damaged) showToast('❄️ Frost damaged a crop. Wait for milder weather or plant in season.');
            }
          } else floodStressElapsed[j] = 0;
        }
        farmFields[i][j].update(cropDt, { growthRate: growthRate });
      }
    }
  }
}

function unloadCombineIntoWagon() {
  if (mode !== 'driving' || vehicleType !== 'combine') return;
  const auger = vehicle.localToWorld(new THREE.Vector3(-1.5, 0, 3.5));
  if (wagon.distanceTo(auger.x, auger.z) > 5) {
    showToast('Move the wagon beside the combine’s side auger to unload.');
    return;
  }
  const total = combineBinCount();
  if (!total) { showToast('The combine bin is empty.'); return; }
  const missingSlots = Object.keys(combineBin).filter(function (id) {
    return !wagon.cargo.some(function (stack) { return stack && stack.itemId === id; });
  }).length;
  const freeSlots = wagon.cargo.filter(function (stack) { return !stack; }).length;
  if (missingSlots > freeSlots) { showToast('The wagon has no room for this harvest.'); return; }
  for (const id of Object.keys(combineBin)) {
    const result = wagon.add(id, combineBin[id]);
    if (!result.ok) {
      showToast(result.error || 'The wagon is full.');
      return;
    }
  }
  combineBin = {};
  showToast('🌾 Unloaded ' + total + ' units from the side auger into the wagon.');
  lastSig = '';
  updateHUD();
}

function applyRequestRewards(result) {
  if (!result || !result.success) return;
  money += Number(result.money) || 0;
  const resources = result.resources || {};
  Object.keys(resources).forEach(function (key) {
    const itemId = FARM_RESOURCE_ITEMS[key] || key;
    const qty = Math.floor(Number(resources[key]) || 0);
    if (qty > 0 && !inventory.buy(itemId, qty).ok) money += qty;
  });
  if (result.results && result.results.length) {
    const names = result.results.map(function (entry) { return entry.request.crop || entry.request.type; }).join(', ');
    showToast('📬 Contract complete! Earned $' + result.money + (names ? ' · ' + names : ''));
  }
  lastSig = '';
  updateHUD();
}

function requestDeliveryInventory() {
  function cargoCount(hold, itemId) {
    return hold.cargo.reduce(function (total, stack) { return total + (stack && stack.itemId === itemId ? stack.qty : 0); }, 0);
  }
  return {
    getCount: function (itemId) {
      return inventory.getCount(itemId) + cargoCount(wagon, itemId) + cargoCount(truckBed, itemId);
    },
    consumeItem: function (itemId, quantity) {
      let remaining = quantity;
      const fromInventory = Math.min(remaining, inventory.getCount(itemId));
      if (fromInventory) { inventory.consumeItem(itemId, fromInventory); remaining -= fromInventory; }
      for (const hold of [wagon, truckBed]) {
        for (let i = 0; i < hold.cargo.length && remaining > 0; i++) {
          const stack = hold.cargo[i];
          if (!stack || stack.itemId !== itemId) continue;
          const take = Math.min(remaining, stack.qty);
          stack.qty -= take; remaining -= take;
          if (stack.qty <= 0) hold.cargo[i] = null;
        }
      }
      return quantity - remaining;
    }
  };
}

function interactWithFarm() {
  if (mode !== 'walking' || buildMode || shopUI.isOpen()) return;
  const position = { x: character.group.position.x, z: character.group.position.z };
  if (shop.isNear(position.x, position.z)) {
    const delivery = farmSystems.completeDeliveries(requestDeliveryInventory());
    if (delivery.success) { applyRequestRewards(delivery); return; }
    const requests = farmSystems.getRequests();
    if (requests.length) {
      showToast('📬 Farm requests: ' + requests.map(function (r) {
        return r.type === 'deliver' ? r.quantity + ' ' + r.crop : r.type.replaceAll('-', ' ');
      }).join(' · ') + '.');
    } else showToast('📬 No open contracts today. Check back tomorrow.');
    return;
  }
  const before = getFarmResourceBag();
  const bag = Object.assign({}, before);
  const result = farmSystems.interact(position, 'foot', bag);
  if (result && result.success) {
    applyFarmResourceBag(before, bag);
    money += Number(result.rewards && result.rewards.money) || 0;
    showToast(result.message || 'Farm task complete.');
  } else {
    showToast(result && result.message ? result.message : 'Nothing to interact with nearby.');
  }
  lastSig = '';
  updateHUD();
}

// ---------------------------------------------------------------- actions
function drainActions() {
  let a;
  while ((a = input.takeAction()) !== null) {
    if (a === 'enterVehicle') {
      handleEnterExit();
    } else if (a === 'sellGrain') {
      sellWagonCrops();
    } else if (a === 'farmInteract') {
      interactWithFarm();
    } else if (a === 'toggleBuildMode' && mode === 'walking') {
      setBuildMode(!buildMode);
    } else if (a === 'jump') {
      tryJump();
    } else if (a === 'toggleTool' && mode === 'driving') {
      if (vehicleType === 'truck') {
        toggleHitch();
      } else {
        const types = attachmentTypes();
        if (types.length) {
          const next = currentTool < 0
            ? (toolSelections[vehicleType] >= 0 ? toolSelections[vehicleType] : 0)
            : (currentTool + 1) % types.length;
          attachTool(next);
        }
      }
    } else if (a === 'cycleTool' && mode === 'driving' && vehicleType === 'truck') {
      toggleHitch(); // the truck's only "tool" is the wagon hitch
    } else if (a === 'detach' && mode === 'driving' && vehicleType === 'truck') {
      if (wagon.hitched) toggleHitch();
    } else if (a === 'openWagon') {
      const hold = reachableHold();
      if (hold) wagonPanel.open(hold);
    } else if (a === 'unloadCombine') {
      unloadCombineIntoWagon();
    } else if (a === 'cycleTool') {
      const types = attachmentTypes();
      if (types.length > 0) {
        const next = currentTool + 1 >= types.length ? 0 : currentTool + 1;
        attachTool(next);
      }
    } else if (a === 'detach') {
      detachTool();
    } else if (a === 'cycleColor') {
      cycleColor();
    } else if (a === 'cycleMachine') {
      if (mode === 'driving') switchMachine();
    } else if (a === 'talkShop') {
      if (mode === 'walking' && shop.isNear(character.group.position.x, character.group.position.z)) {
        shopUI.setRecipients(farmerRoster, session ? session.email : '');
        shopUI.open();
      }
    } else if (typeof a === 'string' && a.indexOf('hotbar:') === 0) {
      inventory.selectSlot(Number(a.slice(7)));
      inventory.updateDOM();
    }
  }
  updateHUD();
}

function setBuildMode(active) {
  buildMode = !!active && mode === 'walking';
  firstPersonArm.visible = buildMode;
  character.setVisible(!buildMode);
  document.body.classList.toggle('vt-build-mode', buildMode);
  inventory.setFirstPerson(buildMode);
  input.setBuildMode(buildMode);
  if (buildMode) showToast('🧱 Build mode: select an item in your hotbar, aim, then tap to place.');
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  let dx, dy, dz, lax, laz, lookY;
  if (buildMode && mode === 'walking') {
    const a = character.group.rotation.y;
    const fx = Math.sin(a), fz = Math.cos(a);
    dx = character.group.position.x;
    dy = 1.55;
    dz = character.group.position.z;
    lax = dx + fx * 8;
    laz = dz + fz * 8;
    lookY = 1.15;
    camPos.set(dx, dy, dz);
    camera.position.copy(camPos);
    lookAt.set(lax, lookY, laz);
    camera.lookAt(lookAt);
    return;
  } else if (mode === 'driving') {
    const cs = Math.cos(theta), sn = Math.sin(theta);
    fwd.set(cs, 0, -sn);
    // The truck gets a closer chase so it fills the frame like the tractor.
    const chase = vehicleType === 'combine' ? 24 : (vehicleType === 'truck' ? 15 : 20);
    const height = vehicleType === 'combine' ? 15 : (vehicleType === 'truck' ? 9 : 12);
    const lookAhead = vehicleType === 'combine' ? 17 : (vehicleType === 'truck' ? 7 : 8);
    // Keep the large combine header in view from the high chase camera.
    dx = vehicle.position.x - fwd.x * chase;
    dy = height;
    dz = vehicle.position.z - fwd.z * chase;
    lax = vehicle.position.x + fwd.x * lookAhead;
    laz = vehicle.position.z + fwd.z * lookAhead;
    lookY = vehicleType === 'combine' ? 2.5 : (vehicleType === 'truck' ? 2 : 1.5);
  } else {
    // Walking chase camera. Sitting back 8.5 shrinks the avatar enough that
    // its feet clear the short-viewport touch-button row, while aiming at
    // y=1.94 keeps the y=6 farm-label anchors in frame — aiming steeper
    // pushed the labels off the top edge, shallower buried the character
    // behind the buttons.
    const a = character.group.rotation.y;
    fwd.set(Math.sin(a), 0, Math.cos(a));
    dx = character.group.position.x - fwd.x * 8.5;
    dy = 4.7;
    dz = character.group.position.z - fwd.z * 8.5;
    lax = character.group.position.x + fwd.x * 3.5;
    laz = character.group.position.z + fwd.z * 3.5;
    lookY = 1.94;
  }
  // exponential smoothing doubles as the smooth walking <-> driving transition
  const t = 1 - Math.exp(-4 * dt);
  camPos.x += (dx - camPos.x) * t;
  camPos.y += (dy - camPos.y) * t;
  camPos.z += (dz - camPos.z) * t;
  camera.position.copy(camPos);
  lookAt.set(lax, lookY, laz);
  camera.lookAt(lookAt);
}

// hard-snap behind the controlled entity (login restore / spawn only)
function snapCamera() {
  if (mode === 'driving') {
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const chase = vehicleType === 'combine' ? 24 : (vehicleType === 'truck' ? 15 : 20);
    const height = vehicleType === 'combine' ? 15 : (vehicleType === 'truck' ? 9 : 12);
    camPos.set(vehicle.position.x - cs * chase, height, vehicle.position.z + sn * chase);
  } else {
    const a = character.group.rotation.y;
    camPos.set(
      character.group.position.x - Math.sin(a) * 8.5,
      4.7,
      character.group.position.z - Math.cos(a) * 8.5
    );
  }
}

function updateSun() {
  const tx = mode === 'driving' ? vehicle.position.x : character.group.position.x;
  const tz = mode === 'driving' ? vehicle.position.z : character.group.position.z;
  sun.position.set(tx + SUN_OFFSET.x, SUN_OFFSET.y, tz + SUN_OFFSET.z);
  sun.target.position.set(tx, 0, tz);
  sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------- spawn
// Park the fleet in the lane ahead (east) of the spawn point, in a line:
// tractor first, then truck, then combine. They sit AHEAD of the character
// because the walking camera starts 8.5 units behind it — parking anything
// back there drops the camera on top of a parked vehicle.
function resetToSpawn() {
  const farms = world.getFarms();
  const slot = world.getAssignedSlot();
  const farm = (slot >= 0 && slot < farms.length) ? farms[slot] : farms[0];
  const sp = farm.getSpawnPoint();

  detachTool(); // while `vehicle` still points at the machine holding the tool
  vehicleType = 'tractor';
  vehicle = tractor;
  theta = 0;
  speed = 0;
  toolSelections.tractor = -1;
  toolSelections.combine = 0;
  toolSelections.truck = -1;
  currentColor = vehicleColors.tractor;
  applyLivery(tractor, currentColor);

  // Staggered line down the lane: tractor (nearest, prompts the entry hint),
  // truck, then combine. Rotated to face down the lane (+X).
  tractor.position.set(sp.x + 7, 0, sp.z - 1);
  tractor.rotation.y = 0;
  truck.position.set(sp.x + 30, 0, sp.z - 1);
  truck.rotation.y = 0;
  // the wagon starts hitched behind the truck
  const hp = truckHitchPoint();
  wagon.snapBehind(hp.x, hp.z, 0);
  wagon.hitched = true;
  combine.position.set(sp.x + 52, 0, sp.z - 1);
  combine.rotation.y = 0;
  vehicles.tractor.visible = true;
  vehicles.combine.visible = true;
  vehicles.truck.visible = true;

  mode = 'walking';
  input.setWalkingMode(true);
  character.group.position.set(sp.x, 0, sp.z);
  character.group.rotation.y = Math.PI / 2; // face east, down the lane
  character.setVisible(true);
  velY = 0;
  onGround = true;

  snapCamera();
  lastSig = '';
}

// ---------------------------------------------------------------- save/restore
// Save layout 2 = farms 180 apart with an east build yard. Older saves were
// made with farms 140 apart, so world-space positions must be shifted.
const FARM_LAYOUT = 2;
const OLD_FARM_SPACING = 140;
const STARTER_MONEY = 100; // a brand-new farm can afford its first seeds and spray
let session = null;
let sharedWorldTimer = null;
let realtime = null;

function snapshot() {
  return {
    v: 3,
    layout: FARM_LAYOUT,
    machine: vehicleType,
    money: Math.max(0, Math.floor(money)),
    tool: currentTool,
    color: currentColor,
    mode: mode,
    tx: vehicle.position.x,
    tz: vehicle.position.z,
    theta: theta,
    cx: character.group.position.x,
    cy: character.group.position.y,
    cz: character.group.position.z,
    ctheta: character.group.rotation.y,
    world: world.serialize(),
    structures: builder ? builder.serializeLocal() : [],
    inventory: inventory.serialize(),
    wagon: wagon.serialize(),
    combineBin: combineBin,
    truckBed: truckBed.serializeCargo(),
    climate: climate.serialize(),
    farmSystems: farmSystems.serialize(),
    appliedGiftIds: appliedGiftIds.slice(-100),
  };
}

// Accepts the v2/v3 shape ({world: …}) and the legacy v1 shape (flat `fields`
// array of 4 Field serialisations, no `world` key, always driving).
function applyState(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.climate) {
    try { climate.restore(s.climate); } catch (err) { /* ignore invalid legacy climate state */ }
    climateState = climate.getState();
  }
  if (s.farmSystems && s.farmSystems.farmSlot === world.getAssignedSlot()) {
    farmSystems.restore(s.farmSystems);
  }
  if (s.inventory && typeof s.inventory === 'object') inventory.restore(s.inventory);
  combineBin = {};
  if (s.combineBin && typeof s.combineBin === 'object') {
    Object.keys(s.combineBin).forEach(function (id) {
      if (/^harvest_(corn|wheat|sunflower)$/.test(id) && Number.isFinite(s.combineBin[id])) {
        combineBin[id] = Math.max(0, Math.min(COMBINE_BIN_CAPACITY, Math.floor(s.combineBin[id])));
      }
    });
    while (combineBinCount() > COMBINE_BIN_CAPACITY) {
      const id = Object.keys(combineBin).pop();
      combineBin[id] -= combineBinCount() - COMBINE_BIN_CAPACITY;
      if (combineBin[id] <= 0) delete combineBin[id];
    }
  }
  if (Array.isArray(s.giftInbox)) {
    var seenGifts = [];
    try {
      var localSeenGifts = JSON.parse(localStorage.getItem('vt-seen-gifts:' + (session ? session.email : '')) || '[]');
      if (Array.isArray(localSeenGifts)) seenGifts = localSeenGifts;
    } catch (err) { /* local storage is optional */ }
    appliedGiftIds = Array.isArray(s.appliedGiftIds) ? s.appliedGiftIds.slice(-100) : [];
    for (var gi = 0; gi < s.giftInbox.length; gi++) {
      var gift = s.giftInbox[gi];
      if (!gift || !gift.requestId || appliedGiftIds.indexOf(gift.requestId) !== -1) continue;
      var giftInfo = ITEM_BY_ID[gift.itemId];
      if (giftInfo) {
        var grant = inventory.buy(gift.itemId, gift.qty * packSize(giftInfo));
        if (grant.ok) {
          if (seenGifts.indexOf(gift.requestId) === -1) showToast('🎁 ' + gift.from + ' sent you ' + (gift.qty > 1 ? gift.qty + ' × ' : '') + giftInfo.name + '!');
          seenGifts.push(gift.requestId);
          appliedGiftIds.push(gift.requestId);
        } else {
          showToast('🎁 Make room in your inventory for a gift from ' + gift.from + '.');
        }
      }
    }
    appliedGiftIds = appliedGiftIds.slice(-100);
    try { localStorage.setItem('vt-seen-gifts:' + (session ? session.email : ''), JSON.stringify(appliedGiftIds)); }
    catch (err2) { /* storage may be unavailable */ }
  }
  // Pre-layout-2 saves: structures move with their farm (+40 per slot), and
  // saved vehicle/character positions are dropped so everyone starts at the
  // new spawn lane instead of in the wrong place.
  const oldLayout = s.layout !== FARM_LAYOUT;
  let structures = Array.isArray(s.structures) ? s.structures : [];
  if (oldLayout) {
    const shift = world.getAssignedSlot() * (FARM_SPACING - OLD_FARM_SPACING);
    structures = structures.map(function (e) {
      return e && typeof e === 'object' ? Object.assign({}, e, { x: e.x + shift }) : e;
    });
  }
  if (builder) builder.restore(structures);
  const legacy = s.v !== 2 && Array.isArray(s.fields);

  // --- machine ---
  const machine = MACHINES.indexOf(s.machine) !== -1 ? s.machine : 'tractor';
  const previousTool = currentTool;
  detachTool();
  toolSelections[vehicleType] = previousTool;
  vehicleType = machine;
  vehicle = vehicles[machine];
  currentColor = vehicleColors[vehicleType] || LIVERY_NAMES[0];

  // --- money ---
  if (typeof s.money === 'number' && isFinite(s.money)) {
    money = Math.max(0, Math.floor(s.money));
  }

  // --- fields ---
  if (s.world && typeof s.world === 'object') {
    world.restore(s.world);
  } else if (legacy) {
    // v1 saves only knew the player's own 4 fields
    const farms = world.getFarms();
    const slot = world.getAssignedSlot();
    const own = (slot >= 0 && slot < farms.length) ? farms[slot] : farms[0];
    const ownFields = own.getFields();
    for (let i = 0; i < ownFields.length && i < s.fields.length; i++) {
      ownFields[i].restore(s.fields[i]);
    }
  }

  // --- active vehicle pose ---
  if (oldLayout) { s = Object.assign({}, s, { tx: NaN, tz: NaN, cx: NaN, cz: NaN, cy: 0, mode: 'walking' }); }
  if (typeof s.tx === 'number' && isFinite(s.tx)) vehicle.position.x = clampX(s.tx);
  if (typeof s.tz === 'number' && isFinite(s.tz)) vehicle.position.z = clampZ(s.tz);
  vehicle.position.y = 0;
  if (typeof s.theta === 'number' && isFinite(s.theta)) theta = s.theta;
  else theta = vehicle.rotation.y;
  vehicle.rotation.y = theta;
  speed = 0;

  // --- character pose ---
  if (typeof s.cx === 'number' && isFinite(s.cx)) character.group.position.x = clampX(s.cx);
  if (typeof s.cz === 'number' && isFinite(s.cz)) character.group.position.z = clampZ(s.cz);
  if (typeof s.cy === 'number' && isFinite(s.cy) && s.cy > 0) {
    character.group.position.y = Math.min(s.cy, 60);
  } else {
    character.group.position.y = 0;
  }
  if (typeof s.ctheta === 'number' && isFinite(s.ctheta)) character.group.rotation.y = s.ctheta;
  velY = 0;
  onGround = character.group.position.y <= 0.001;

  // --- mode ---
  if (s.mode === 'driving' || s.mode === 'walking') mode = s.mode;
  else if (legacy) mode = 'driving'; // old saves were always driving
  else mode = 'walking';
  character.setVisible(mode === 'walking');
  input.setWalkingMode(mode === 'walking');

  // --- livery ---
  if (typeof s.color === 'string' && LIVERY_NAMES.indexOf(s.color) !== -1) {
    currentColor = s.color;
    vehicleColors[vehicleType] = currentColor;
  }
  applyLivery(vehicle, currentColor);

  // --- implement ---
  if (typeof s.tool === 'number' && isFinite(s.tool)) {
    const t = Math.round(s.tool);
    if (t >= 0 && t < attachmentTypes().length && vehicle.userData.mounts) attachTool(t);
    else detachTool();
  } else {
    detachTool();
  }

  // --- wagon (hitched wagons re-seat behind wherever the truck is) ---
  if (!oldLayout && s.wagon) wagon.restore(s.wagon);
  truckBed.restoreCargo(s.truckBed);
  if (wagon.hitched) {
    const hp = truckHitchPoint();
    wagon.snapBehind(hp.x, hp.z, truck.rotation.y);
  }

  // snap the chase cam behind the restored pose (no cross-map swoop)
  snapCamera();

  lastSig = '';
  updateHUD();
  return true;
}

// Seeds now cost money, so a farm with no cash, no seeds and nothing growing
// could never earn again. Top it back up to the price of a seed bag + spray.
function rescueStuckFarm() {
  const RESCUE = 40;
  if (money >= RESCUE) return;
  const isSupply = function (id) { return /_seeds$/.test(id) || id === 'crop_spray'; };
  if (inventory.findSlot(isSupply) >= 0) return;
  if (wagon.hasAny(isSupply) || truckBed.hasAny(isSupply)) return;
  const farms = world.getFarms();
  const own = farms[world.getAssignedSlot()];
  if (own && own.getFields().some(function (f) { return f.hasHarvestComing(); })) return;
  money = RESCUE;
  showToast('🤝 The farm co-op topped you up to $' + RESCUE + ' for seeds and spray');
}

// ---------------------------------------------------------------- farmers
const FARMER_POLL_MS = 15000;
let slotToEmail = {}; // { farmSlot: email } excluding the player's own email
let farmerRoster = []; // [{slot, email}] in list order — drives the characters
let farmersTimer = null;

function refreshFarmers() {
  if (!session || session.mode !== 'online') return;
  const own = session.email ? String(session.email).toLowerCase() : '';
  fetchFarmers().then(function (list) {
    const arr = Array.isArray(list) ? list : [];
    const map = {};
    const roster = [];
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      if (!f || typeof f.farmSlot !== 'number' || !isFinite(f.farmSlot)) continue;
      const em = f.email ? String(f.email) : '';
      if (!em || em.toLowerCase() === own) continue;
      const sl = Math.floor(f.farmSlot);
      if (sl < 0 || sl > 9) continue;
      if (map[sl]) continue; // hash collision: the first farmer keeps the slot
      map[sl] = em;
      roster.push({ slot: sl, email: em });
    }
    slotToEmail = map;
    farmerRoster = roster;
    if (shopUI) shopUI.setRecipients(farmerRoster, own);
    refreshFarmLabels(); // label text changes only when the list changes
    reconcileFarmerCharacters();
    lastSig = ''; // farm label may have changed
    updateHUD();
  });
}

function startFarmerPolling() {
  if (farmersTimer !== null) {
    clearInterval(farmersTimer);
    farmersTimer = null;
  }
  if (!session || session.mode !== 'online') return;
  refreshFarmers(); // online only; fetchFarmers resolves [] on any failure
  farmersTimer = setInterval(refreshFarmers, FARMER_POLL_MS);
}

// ---------------------------------------------------------------- farm labels
// One DOM element per farm, created once and repositioned every frame by
// projecting a world anchor (the farm's spawn point raised to y = 6) through
// the camera. Text is rewritten only by refreshFarmLabels() — i.e. when the
// farmer list (or our own assigned slot) changes — never per frame.
const labelLayer = document.createElement('div');
labelLayer.id = 'farm-labels';
document.body.appendChild(labelLayer);

const farmLabels = [];
(function buildFarmLabels() {
  const farms = world.getFarms();
  for (let i = 0; i < farms.length; i++) {
    const sp = farms[i].getSpawnPoint();
    const el = document.createElement('div');
    el.className = 'farm-label';
    labelLayer.appendChild(el);
    farmLabels.push({ el: el, ax: sp.x, ay: 6, az: sp.z, shown: false, text: '' });
  }
})();

function labelName(slot) {
  if (slot === world.getAssignedSlot()) return '🏡 Your Farm';
  const em = slotToEmail[slot];
  if (em) return '🤝 ' + em + "'s Farm";
  return '🌾 Farm ' + (slot + 1); // 1-based, like the HUD's farm line
}

function refreshFarmLabels() {
  for (let i = 0; i < farmLabels.length; i++) {
    const t = labelName(i);
    if (farmLabels[i].text !== t) {
      farmLabels[i].text = t;
      farmLabels[i].el.textContent = t;
    }
  }
}

const _labelPt = new THREE.Vector3();
const _labelView = new THREE.Matrix4();

function updateFarmLabels() {
  camera.updateMatrixWorld();
  _labelView.copy(camera.matrixWorld).invert();
  const farms = world.getFarms();
  const w = innerWidth;
  const h = innerHeight;
  for (let i = 0; i < farmLabels.length; i++) {
    const L = farmLabels[i];
    let show = mode === 'driving' && !farms[i]._culled;
    L.ndc = '';
    L.reason = mode !== 'driving' ? 'not-driving' : (show ? '' : 'culled');
    if (show) {
      const dx = vehicle.position.x - L.ax;
      const dz = vehicle.position.z - L.az;
      if (dx * dx + dz * dz > 72 * 72) { show = false; L.reason = 'not-driving-by'; }
    }
    if (show) {
      _labelPt.set(L.ax, L.ay, L.az).applyMatrix4(_labelView);
      if (_labelPt.z >= 0) {
        show = false; L.reason = 'behind'; // view space looks down -Z
      } else {
        _labelPt.applyMatrix4(camera.projectionMatrix);
        if (_labelPt.x < -1 || _labelPt.x > 1 || _labelPt.y < -1 || _labelPt.y > 1) {
          show = false; L.reason = 'off'; // off-screen
        } else {
          const px = Math.round((_labelPt.x * 0.5 + 0.5) * w);
          const py = Math.round((-_labelPt.y * 0.5 + 0.5) * h);
          L.ndc = Math.round(_labelPt.x * 100) / 100 + ',' + Math.round(_labelPt.y * 100) / 100;
          L.el.style.transform = 'translate(-50%,-100%) translate(' + px + 'px,' + py + 'px)';
        }
      }
    }
    if (show !== L.shown) {
      L.shown = show;
      L.el.style.display = show ? 'block' : 'none';
    }
  }
}

// -------------------------------------------------------- remote farmers (5.2)
// One static idle Character per occupied foreign slot, standing on that farm's
// spawn point. Reconciled against farmerRoster whenever the list arrives:
// added on join, removed (geometry materials disposed) on part, never
// duplicated. Hash collisions: only the FIRST farmer per slot is rendered.
const farmerChars = {}; // farmSlot -> Character
const remoteTargets = {}; // farmSlot -> most recent realtime pose
const remoteVehicles = {}; // simple voxel machine proxy while a farmer drives

function makeRemoteVehicle() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 2), new THREE.MeshStandardMaterial({ color: '#b94335', roughness: 0.8 }));
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.5), new THREE.MeshStandardMaterial({ color: '#d9e2dd', roughness: 0.5 }));
  cab.position.set(-0.1, 2, 0);
  group.add(cab);
  const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.45, 6);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#242322', roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(i < 2 ? -1.1 : 1.1, 0.55, i % 2 ? -0.95 : 0.95);
    wheel.castShadow = true;
    group.add(wheel);
  }
  group.visible = false;
  scene.add(group);
  return group;
}

function acceptRealtimeMessage(msg) {
  if (msg && msg.type === 'gift' && session && String(msg.to).toLowerCase() === String(session.email).toLowerCase()) {
    var giftItem = ITEM_BY_ID[msg.itemId];
    if (giftItem) {
      var grantResult = { ok: true };
      if (!msg.requestId || appliedGiftIds.indexOf(msg.requestId) === -1) grantResult = inventory.buy(msg.itemId, msg.qty * packSize(giftItem));
      if (grantResult.ok && msg.requestId && appliedGiftIds.indexOf(msg.requestId) === -1) appliedGiftIds.push(msg.requestId);
      appliedGiftIds = appliedGiftIds.slice(-100);
      try { localStorage.setItem('vt-seen-gifts:' + session.email, JSON.stringify(appliedGiftIds)); } catch (err) { /* ignore */ }
      inventory.updateDOM();
      showToast(grantResult.ok
        ? '🎁 ' + msg.from + ' sent you ' + (msg.qty > 1 ? msg.qty + ' × ' : '') + giftItem.name + '!'
        : '🎁 Make room in your inventory for a gift from ' + msg.from + '.');
    }
    return;
  }
  if (!msg || !msg.email) return;
  const own = session && session.email ? String(session.email).toLowerCase() : '';
  if (String(msg.email).toLowerCase() === own) return;
  let slot = -1;
  for (let i = 0; i < farmerRoster.length; i++) {
    if (String(farmerRoster[i].email).toLowerCase() === String(msg.email).toLowerCase()) {
      slot = farmerRoster[i].slot;
      break;
    }
  }
  if (slot < 0 || slot === world.getAssignedSlot()) return;
  if (msg.type === 'pose' && msg.pose) {
    remoteTargets[slot] = {
      x: msg.pose.x, z: msg.pose.z, theta: msg.pose.theta,
      mode: msg.pose.mode, machine: msg.pose.machine
    };
  } else if (msg.type === 'leave') {
    delete remoteTargets[slot];
  } else if (msg.type === 'build' && builder && msg.entry) {
    builder.restore([msg.entry], true);
  }
}

function reconcileFarmerCharacters() {
  const farms = world.getFarms();
  const own = world.getAssignedSlot();
  const want = {};
  for (let i = 0; i < farmerRoster.length; i++) {
    const slot = farmerRoster[i].slot;
    if (slot === own) continue; // the local player is never mirrored
    if (want[slot]) continue; // first per slot wins (collision guard)
    want[slot] = true;
  }

  const have = Object.keys(farmerChars);
  for (let i = 0; i < have.length; i++) {
    if (want[have[i]]) continue;
    const gone = farmerChars[have[i]];
    scene.remove(gone.group);
    disposeGroup(gone.group); // materials only — BOX geometry is shared
    if (remoteVehicles[have[i]]) {
      scene.remove(remoteVehicles[have[i]]);
      disposeGroup(remoteVehicles[have[i]]);
      delete remoteVehicles[have[i]];
    }
    delete remoteTargets[have[i]];
    delete farmerChars[have[i]];
  }

  const keys = Object.keys(want);
  for (let i = 0; i < keys.length; i++) {
    if (farmerChars[keys[i]]) continue;
    const slot = Number(keys[i]);
    const farm = farms[slot];
    if (!farm) continue;
    const ch = new Character();
    const sp = farm.getSpawnPoint();
    ch.group.position.set(sp.x, 0, sp.z);
    ch.group.rotation.y = Math.PI / 2; // face east down the lane, like home
    ch.setVisible(true);
    scene.add(ch.group);
    farmerChars[keys[i]] = ch;
    remoteVehicles[keys[i]] = makeRemoteVehicle();
  }
}

// Idle pose every frame; visibility follows the owning farm's cull flag.
function updateFarmerCharacters(dt) {
  const farms = world.getFarms();
  const keys = Object.keys(farmerChars);
  for (let i = 0; i < keys.length; i++) {
    const ch = farmerChars[keys[i]];
    const farm = farms[Number(keys[i])];
    const culled = farm ? farm._culled : true;
    const target = remoteTargets[keys[i]];
    if (target) {
      const t = 1 - Math.exp(-12 * dt);
      ch.group.position.x += (target.x - ch.group.position.x) * t;
      ch.group.position.z += (target.z - ch.group.position.z) * t;
      let d = target.theta - ch.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ch.group.rotation.y += d * t;
    }
    const driving = !!(target && target.mode === 'driving');
    if (ch.group.visible !== (!culled && !driving)) ch.setVisible(!culled && !driving);
    const proxy = remoteVehicles[keys[i]];
    if (proxy) {
      proxy.visible = !culled && driving;
      if (target) {
        proxy.position.set(ch.group.position.x, 0, ch.group.position.z);
        proxy.rotation.y = target.theta;
      }
    }
    ch.update(dt);
  }
}

// --------------------------------------------------- cross-farm state (5.3)
// Arriving on a foreign farm fetches its owner's authoritative fields and
// restores them over our locally ticking copy. Never for our own slot, at
// most one request per slot per FARM_STATE_MIN_MS, and responses that land
// after we moved on are dropped. Failures are silent: local fields tick on.
const FARM_STATE_MIN_MS = 15000;
let farmStateLastAt = {}; // farmSlot -> performance.now() of the last request
let farmStateSeenSlot = -2; // last slot we stood on (edge-triggered)

function maybeFetchForeignState() {
  if (!session || session.mode !== 'online') return;
  const slot = currentFarmSlot();
  if (slot === farmStateSeenSlot) return; // only on entering a new farm
  farmStateSeenSlot = slot;
  if (slot < 0 || slot > 9) return;
  if (slot === world.getAssignedSlot()) return; // never your own farm
  const now = performance.now();
  const lastAt = farmStateLastAt[slot] || 0;
  if (now - lastAt < FARM_STATE_MIN_MS) return;
  farmStateLastAt[slot] = now;
  fetchFarmState(slot).then(function (data) {
    if (!data || !data.farm) return; // failure → keep the local fields
    if (slot === world.getAssignedSlot()) return; // never your own farm
    if (currentFarmSlot() !== slot) return; // moved on → drop the stale reply
    world.getFarms()[slot].restore(data.farm);
  });
}

// ---------------------------------------------------------------- login gate
function setupLogin() {
  const overlay = document.getElementById('login');
  const form = document.getElementById('login-form');
  const emailIn = document.getElementById('login-email');
  const codeIn = document.getElementById('login-code');
  const go = document.getElementById('login-go');
  const msg = document.getElementById('login-msg');
  const rememberCheck = document.getElementById('login-remember-check');
  if (!overlay || !form || !emailIn || !codeIn || !go || !msg) return;

  const remembered = rememberedEmail();
  if (remembered) emailIn.value = remembered;
  if (rememberCheck) {
    rememberCheck.addEventListener('change', function () {
      if (!rememberCheck.checked) forgetRememberedCredentials();
    });
  }

  function enterFarm(res) {
    session = { mode: res.mode, email: res.email };

    // farm slot: the server's value wins, otherwise hash locally (offline)
    if (res.email) world.setPlayerEmail(res.email);
    if (typeof res.farmSlot === 'number' && isFinite(res.farmSlot)) {
      world.setAssignedSlot(res.farmSlot);
    } else {
      world.setAssignedSlot(world.slotFromEmail(res.email || ''));
    }
    const slot = world.getAssignedSlot();

    farmSystems.dispose();
    farmSystems = new FarmSystems({ scene: scene, THREE: THREE, farmSlot: slot, onEvent: handleFarmEvent });
    for (const machine of MACHINES) farmSystems.setVehicleCondition(machine);

    resetToSpawn();
    money = 0;
    wagon.restoreCargo([]); // a fresh login never inherits the last player's cargo
    truckBed.restoreCargo([]);
    applyState(res.state);
    world.setAssignedSlot(slot); // resolved slot stays authoritative
    if (!res.state) {
      money = STARTER_MONEY; // brand-new farm
      showToast('🌱 Welcome, farmer! Here’s $' + STARTER_MONEY + ' — follow the 🏪 arrow to buy seeds and spray');
    } else {
      rescueStuckFarm();
    }
    refreshFarmLabels(); // "Your Farm" follows the resolved slot
    reconcileFarmerCharacters(); // never mirror a character onto our own slot

    codeIn.value = '';
    overlay.style.display = 'none';
    window.VT_LOCKED = false;
    lastSig = '';
    updateHUD();
    startFarmerPolling();
    if (realtime) {
      realtime.close();
      realtime = null;
    }
    if (session.mode === 'online') {
      realtime = new RealtimeClient(function () {
        if (mode === 'driving') {
          return { x: vehicle.position.x, z: vehicle.position.z, theta: theta, mode: 'driving', machine: vehicleType, color: currentColor };
        }
        return { x: character.group.position.x, z: character.group.position.z,
          theta: character.group.rotation.y, mode: 'walking', machine: null, color: '' };
      }, acceptRealtimeMessage, perfProfile.poseInterval);
      realtime.connect();
    }
    if (sharedWorldTimer !== null) {
      clearInterval(sharedWorldTimer);
      sharedWorldTimer = null;
    }
    if (builder && session.mode === 'online') {
      var syncRoads = function () {
        fetchSharedWorld().then(function (data) {
          if (data && Array.isArray(data.roads)) builder.restore(data.roads);
        });
      };
      syncRoads();
      sharedWorldTimer = setInterval(syncRoads, 15000);
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    go.disabled = true;
    msg.textContent = 'Loading the farm…';
    const remember = rememberCheck && rememberCheck.checked;
    login(emailIn.value, codeIn.value, remember)
      .then(function (res) {
        enterFarm(res);
      })
      .catch(function (err) {
        msg.textContent = err && err.message ? err.message : 'Try again';
        go.disabled = false;
      });
  });

  // Resume a cookie session without saving the passcode in browser storage.
  if (hasRememberedEmail() && rememberCheck && rememberCheck.checked) {
    go.disabled = true;
    msg.textContent = 'Loading the farm…';
    restoreRememberedSession(emailIn.value)
      .then(enterFarm)
      .catch(function (err) {
        msg.textContent = err && err.message === 'session-expired'
          ? 'Please enter the secret code to sign in again.'
          : 'Could not reconnect. Enter the code to try again or play offline.';
        go.disabled = false;
      });
  }
}

resetToSpawn(); // park everything behind the login overlay
input.setEnterVisible(false); // hidden until the player is near a vehicle
refreshFarmLabels(); // default "Farm N" / "Your Farm" names before login
updateHUD();
setupLogin();
startAutosave(
  function () {
    return session;
  },
  snapshot
);

// ---------------------------------------------------------------- loop
let last = performance.now();
let enterVisible = false;
renderer.setAnimationLoop(function () {
  const now = performance.now();
  if (document.hidden) {
    last = now;
    return;
  }
  if (!performanceBudget.shouldRender(now)) return;
  const frameStart = performance.now();
  updateFps(now);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.1) dt = 0.1;

  input.update(dt);
  drainActions();
  // Keep the driving overlay synchronized with the authoritative mode. This
  // also recovers its visibility if a browser/UI transition temporarily hides
  // the controls while changing between tractor, combine, and truck.
  input.setDrivingMode(mode === 'driving');
  climateState = climate.update(dt);
  const usageByVehicle = {};
  for (const machine of MACHINES) {
    const machineObject = vehicles[machine];
    farmSystems.setVehiclePosition(machine, machineObject.position);
    const condition = farmSystems.getVehicleCondition(machine);
    const flat = !!(condition && condition.getState().breakdown && condition.getState().breakdown.type === 'flat_tire');
    const wheels = machineObject.userData.wheels || [];
    for (let wi = 0; wi < wheels.length; wi++) wheels[wi].pivot.scale.y = flat ? 0.72 : 1;
    const activeMachine = mode === 'driving' && vehicleType === machine;
    usageByVehicle[machine] = {
      driving: activeMachine ? Math.min(1, Math.abs(speed) / (machine === 'truck' ? TRUCK_MAX_FWD : machine === 'combine' ? 5.5 : MAX_FWD)) : 0,
      work: activeMachine && toolGroup ? 1 : 0,
      roughness: 1,
      heat: activeMachine && Math.abs(speed) > 0.1 ? 1.1 : 1
    };
  }
  if (window.VT_LOCKED === false) farmSystems.update(dt, climateState, usageByVehicle);
  environment.update(dt, Object.assign({}, climateState, { riverLevel: farmSystems.water.riverLevel }));
  stepPhysics(dt);
  stepWagon();
  stepCharacter(dt);
  stepFieldWork(dt);
  maybeFetchForeignState();

  // mobile Enter button follows the entry prompt
  const wantEnter = mode === 'walking' && nearestVehicleInfo() !== null;
  if (wantEnter !== enterVisible) {
    enterVisible = wantEnter;
    input.setEnterVisible(wantEnter);
  }
  input.setToolControl(mode === 'driving' && (!!vehicle.userData.mounts || vehicleType === 'truck'),
    mode === 'driving' && (vehicleType === 'truck' ? wagon.hitched : currentTool >= 0),
    vehicleType === 'truck' ? (wagon.hitched ? 'Unhitch' : 'Hitch') : (currentTool >= 0 ? 'Next tool' : 'Attach'),
    vehicleType === 'truck');
  input.setUnloadVisible(mode === 'driving' && vehicleType === 'combine' && Object.keys(combineBin).length > 0);
  input.setSellGrainVisible(wagonAtGrainBin() && hasSaleableWagonCargo() &&
    (mode === 'driving' || reachableHold() === wagon));

  // M1: shop proximity check — show "Talk to shopkeeper" when near
  const shopNear = shop.isNear(character.group.position.x, character.group.position.z);
  farmPrompt = mode === 'walking' && !buildMode
    ? farmSystems.getPrompt({ x: character.group.position.x, z: character.group.position.z }, 'foot')
    : null;
  if (!farmPrompt && mode === 'walking' && shopNear) {
    farmPrompt = { kind: 'market', action: 'check requests', label: 'check farm requests' };
  }
  input.setInteractVisible(!!farmPrompt && mode === 'walking' && !shopUI.isOpen());
  if (mode === 'walking' && shopNear && !shopNearShown) {
    input.setShopNear(true);
    shopNearShown = true;
  } else if (!shopNear && shopNearShown) {
    input.setShopNear(false);
    shopNearShown = false;
  }
  if (shopNear) shop.facePlayer(character.group.position.x, character.group.position.z);

  const wagonNear = reachableHold() !== null;
  if (wagonNear !== wagonNearShown) {
    wagonNearShown = wagonNear;
    input.setWagonNear(wagonNear);
  }
  updateShopPointer();

  updateCamera(dt);
  world.updateCulling(camera.position.x, camera.position.z);
  updateFarmerCharacters(dt);
  if (performanceBudget.shouldUpdateSun(now)) updateSun();
  if (performanceBudget.shouldUpdateHud(now)) updateHUD();
  if (performanceBudget.shouldUpdateLabels(now)) updateFarmLabels();
  // the hotbar stays up while driving too, so you can see seeds/spray running low
  inventory.setVisible(window.VT_LOCKED === false && !wagonPanel.isOpen());
  renderer.render(scene, camera);
  performanceBudget.observeFrame(performance.now() - frameStart, now, applyPixelRatio);
});

addEventListener('resize', function () {
  camera.aspect = innerWidth / innerHeight;
  camera.far = perfProfile.maxView;
  camera.updateProjectionMatrix();
  performanceBudget.setSize(renderer, innerWidth, innerHeight);
});

document.addEventListener('visibilitychange', function () {
  last = performance.now();
});
