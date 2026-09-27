// game/js/main.js — Tractor Farm: playable integration layer.
// Imports: three (importmap 0.160.0), ./field.js, ./input.js, ./tractor.js, ./equipment.js
import * as THREE from 'three';
import { Field } from './field.js';
import { Input } from './input.js';
import { buildTractor, applyLivery, LIVERY_NAMES } from './tractor.js';
import { buildCombine } from './combine.js';
import { TOOL_ORDER, COMBINE_HEAD_ORDER, buildTool, buildCombineHead } from './equipment.js';
import { login, rememberedEmail, startAutosave } from './net.js';

const VEHICLE_SCALE = 0.5;

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 110, 300);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x668855, 0.9));

const SUN_OFFSET = new THREE.Vector3(14, 26, 10); // follows the tractor
const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
sun.position.copy(SUN_OFFSET);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
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
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.MeshStandardMaterial({ color: '#5aa02c', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// decorative crop rows (south of the farm, cheap boxes)
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

// ---------------------------------------------------------------- fields (2x2, lanes between)
// Each 44x36 tiles with 10-unit lanes: vertical lane x 51.5..61.5,
// horizontal lane z -18.5..-8.5.
const FIELD_DEFS = [
  { originX: 8,  originZ: -54, cols: 44, rows: 36, tile: 1 }, // north-west
  { originX: 62, originZ: -54, cols: 44, rows: 36, tile: 1 }, // north-east
  { originX: 8,  originZ: -8,  cols: 44, rows: 36, tile: 1 }, // south-west
  { originX: 62, originZ: -8,  cols: 44, rows: 36, tile: 1 }, // south-east
];
const fields = FIELD_DEFS.map(function (d) { return new Field(scene, d); });

function aggregateStats() {
  const t = { tilled: 0, planted: 0, sprayed: 0, harvested: 0 };
  for (let i = 0; i < fields.length; i++) {
    const s = fields[i].stats;
    t.tilled += s.tilled;
    t.planted += s.planted;
    t.sprayed += s.sprayed;
    t.harvested += s.harvested;
  }
  return t;
}

// ---------------------------------------------------------------- tractor
const tractor = buildTractor('red');
tractor.scale.set(VEHICLE_SCALE, VEHICLE_SCALE, VEHICLE_SCALE);
tractor.position.set(-6, 0, -13); // west end of the middle lane, facing the farm
tractor.rotation.y = 0; // facing +X
scene.add(tractor);

const combine = buildCombine('green');
combine.scale.set(VEHICLE_SCALE, VEHICLE_SCALE, VEHICLE_SCALE);
combine.position.copy(tractor.position);
combine.rotation.y = 0;
combine.visible = false;
scene.add(combine);

let vehicleType = 'tractor';
let vehicle = tractor;
const vehicleColors = { tractor: 'red', combine: 'green' };
const toolSelections = { tractor: -1, combine: 0 };

// ---------------------------------------------------------------- input
const input = new Input();

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
  detachTool();
  const types = attachmentTypes();
  const type = types[idx];
  toolGroup = vehicleType === 'combine' ? buildCombineHead(type) : buildTool(type);
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
  const i = LIVERY_NAMES.indexOf(currentColor);
  currentColor = LIVERY_NAMES[(i + 1) % LIVERY_NAMES.length] || LIVERY_NAMES[0];
  vehicleColors[vehicleType] = currentColor;
  applyLivery(vehicle, currentColor);
}

function selectMachine(type) {
  if (type !== 'tractor' && type !== 'combine') return;
  if (type === vehicleType) return;
  const previous = vehicle;
  detachTool();
  vehicleType = type;
  vehicle = type === 'combine' ? combine : tractor;
  vehicle.position.copy(previous.position);
  vehicle.rotation.y = theta;
  vehicle.visible = true;
  previous.visible = false;
  currentColor = vehicleColors[vehicleType];
  applyLivery(vehicle, currentColor);
  speed = 0;
  lastSig = '';
  const chase = vehicleType === 'combine' ? 24 : 20;
  const height = vehicleType === 'combine' ? 15 : 12;
  camPos.set(vehicle.position.x - Math.cos(theta) * chase, height,
    vehicle.position.z + Math.sin(theta) * chase);
}

function switchMachine() {
  const previousType = vehicleType;
  const previousTool = currentTool;
  const nextType = vehicleType === 'tractor' ? 'combine' : 'tractor';
  selectMachine(nextType);
  toolSelections[previousType] = previousTool;
  let selected = toolSelections[nextType];
  if (nextType === 'combine' && selected < 0) selected = 0;
  if (selected >= 0) attachTool(selected);
}

// ---------------------------------------------------------------- HUD
const COLOR_NAMES = {
  red: '🔴 Red', green: '🟢 Green', orange: '🟠 Orange',
  blue: '🔵 Blue', yellow: '🟡 Yellow',
};

const hudStyle = document.createElement('style');
hudStyle.textContent = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 30;
  font-family: system-ui, -apple-system, sans-serif; }
#hud .card { position: absolute; max-width: 42%; box-sizing: border-box;
  background: rgba(255, 251, 232, .92); border: 3px solid #2f4d1f;
  border-radius: 16px; padding: 8px 10px; color: #233018;
  box-shadow: 0 3px 0 rgba(0,0,0,.2); -webkit-user-select: none; user-select: none; }
#hud-top-left { left: 10px; top: 10px; font-size: 15px; line-height: 1.45; }
#hud-top-left b { font-size: 17px; }
#hud-top-right { right: 10px; top: 10px; font-size: 13px; line-height: 1.5;
  text-align: left; max-width: 45%; }
#hud-hint { position: absolute; left: 10px;
  bottom: 10px; bottom: calc(10px + env(safe-area-inset-bottom));
  max-width: 45%; font-size: 14px; font-weight: 600; color: #1c3b12; }
.sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px;
  border: 1px solid rgba(0,0,0,.35); vertical-align: -1px; margin-right: 4px; }
.leg { white-space: nowrap; }
`;
document.head.appendChild(hudStyle);

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <div class="card" id="hud-top-left"></div>
  <div class="card" id="hud-top-right"></div>
  <div class="card" id="hud-hint"></div>
`;
document.body.appendChild(hud);
const hudLeft = document.getElementById('hud-top-left');
const hudRight = document.getElementById('hud-top-right');
const hudHint = document.getElementById('hud-hint');

const LEGEND = [
  ['🟫', '#7a5a3a', 'untilled'],
  ['⬛', '#5a3f28', 'tilled'],
  ['🌱', '#6b4a2e', 'planted'],
  ['🌿', '#4e9e3f', 'growing'],
  ['🫧', '#3f8f7a', 'sprayed'],
  ['🌾', '#e0b83a', 'ready'],
  ['📦', '#8a7a5a', 'harvested'],
];
const legendHTML = LEGEND.map(
  function (e) { return '<div class="leg"><span class="sw" style="background:' + e[1] + '"></span>' + e[0] + '</div>'; }
).join('');

let money = 0;
let lastSig = '';

function updateHUD() {
  const s = aggregateStats();
  const types = attachmentTypes();
  const type = currentTool >= 0 ? types[currentTool] : null;
  const info = type ? TOOL_INFO[type] : null;
  // rebuild only when something actually changed
  const sig = vehicleType + '|' + money + '|' + currentTool + '|' + currentColor + '|' +
    s.tilled + '|' + s.planted + '|' + s.sprayed + '|' + s.harvested;
  if (sig === lastSig) return;
  lastSig = sig;

  hudLeft.innerHTML =
    '<div>💰 <b>$' + money + '</b></div>' +
    '<div>' + (vehicleType === 'combine' ? '🌾 Combine' : '🚜 Tractor') + '</div>' +
    '<div>' + (info ? info.emoji + ' ' + info.name : 'No attachment') + '</div>' +
    '<div>🎨 ' + (COLOR_NAMES[currentColor] || currentColor) + '</div>';

  hudRight.innerHTML =
    '<div>🟫 Tilled: <b>' + s.tilled + '</b></div>' +
    '<div>🌱 Planted: <b>' + s.planted + '</b></div>' +
    '<div>🫧 Sprayed: <b>' + s.sprayed + '</b></div>' +
    '<div>🌾 Harvested: <b>' + s.harvested + '</b></div>' +
    '<div style="margin-top:4px">' + legendHTML + '</div>';

  let hint;
  if (vehicleType === 'combine') {
    if (currentTool < 0) hint = 'Press E or Tool to fit a corn or soybean head';
    else if (s.harvested === 0) hint = 'Drive the ' + info.name + ' across golden, ready crops to harvest';
    else hint = 'Harvest ready crops with the ' + info.name + ' — press E to switch heads';
    hint += ' · M or Machine switches vehicles';
  } else if (s.tilled === 0) {
    hint = 'Tap 🚜 (or press E) to attach the PLOW — drive into any field';
  } else if (s.planted === 0) {
    hint = 'Now the PLANTER — drive over tilled soil';
  } else if (s.sprayed === 0 || s.sprayed < s.planted) {
    hint = 'Crops are green — attach the SPRAYER';
  } else if (s.harvested === 0) {
    hint = 'Golden crops! Attach the HARVESTER to collect ($10 per tile)';
  } else {
    hint = 'Great farming! Keep going 💰';
  }
  if (vehicleType === 'tractor') hint += ' · M or Machine switches vehicles';
  hudHint.textContent = hint;
}
updateHUD();

// ---------------------------------------------------------------- physics
const MAX_FWD = 9;
const MAX_REV = 4;
const ACCEL_RATE = 6;
const BRAKE_RATE = 10;
const STEER_RATE = 1.6;

let theta = 0; // rotation.y; forward = (cos θ, 0, −sin θ)
let speed = 0;

const fwd = new THREE.Vector3();
const tmpLocal = new THREE.Vector3();
const camPos = new THREE.Vector3(-26, 12, -13); // start behind the spawn point
const lookAt = new THREE.Vector3();

function stepPhysics(dt) {
  const drive = input.drive;
  const maxForward = vehicleType === 'combine' ? 5.5 : MAX_FWD;
  const maxReverse = vehicleType === 'combine' ? 2.5 : MAX_REV;
  const target = drive > 0 ? drive * maxForward : drive * maxReverse;
  const stopping = input.brake || drive === 0;
  const rate = stopping ? BRAKE_RATE : ACCEL_RATE;
  const diff = target - speed;
  const step = rate * dt;
  speed = Math.abs(diff) <= step ? target : speed + (diff > 0 ? step : -step);

  // steering only bites while rolling; reversing flips the turn direction
  const steeringRate = vehicleType === 'combine' ? 0.95 : STEER_RATE;
  const steer = input.turn * steeringRate * Math.min(1, Math.abs(speed) / 2) * (speed < 0 ? -1 : 1);
  theta -= steer * dt;
  vehicle.rotation.y = theta;

  const steeringPivots = vehicle.userData.steeringPivots || [];
  for (let i = 0; i < steeringPivots.length; i++) {
    steeringPivots[i].rotation.y = input.turn * 0.42 * (speed < 0 ? -1 : 1);
  }

  const cs = Math.cos(theta), sn = Math.sin(theta);
  vehicle.position.x += cs * speed * dt;
  vehicle.position.z += -sn * speed * dt;
  vehicle.position.x = Math.max(-16, Math.min(112, vehicle.position.x));
  vehicle.position.z = Math.max(-60, Math.min(34, vehicle.position.z));

  // Wheel radii are in model units and scaled with the active machine.
  const wheels = vehicle.userData.wheels || [];
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    const r = (w.radius || 1) * VEHICLE_SCALE;
    w.pivot.rotation.z -= (speed / r) * dt;
  }
}

// ---------------------------------------------------------------- field work
// field.applyEffect heading: along = dx·cos(h)+dz·sin(h) with dx = tile.x − x,
// so forward in (x,z) = (cos h, sin h). Tractor forward = (cos θ, −sin θ),
// therefore h = −θ. Width is world units; implements share the machine scale.
function stepFieldWork(dt) {
  if (toolGroup && Math.abs(speed) > 0.4) {
    const mountKey = toolGroup.userData.mount === 'front' ? 'front' : 'rear';
    const mount = vehicle.userData.mounts[mountKey];
    const offset = typeof toolGroup.userData.workOffset === 'number'
      ? toolGroup.userData.workOffset
      : (toolGroup.userData.mount === 'front' ? 2 : -2);
    tmpLocal.copy(mount);
    tmpLocal.x += offset;
    vehicle.updateMatrixWorld();
    vehicle.localToWorld(tmpLocal);
    const width = toolGroup.userData.width * VEHICLE_SCALE;
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].isInside(tmpLocal.x, tmpLocal.z)) {
        const res = fields[i].applyEffect(
          tmpLocal.x, tmpLocal.z, width, toolGroup.userData.effect, -theta
        );
        if (res.money) money += res.money;
        break;
      }
    }
  }
  for (let i = 0; i < fields.length; i++) fields[i].update(dt);
}

// ---------------------------------------------------------------- actions
function drainActions() {
  let a;
  while ((a = input.takeAction()) !== null) {
    if (a === 'cycleTool') {
      const types = attachmentTypes();
      const next = currentTool + 1 >= types.length ? 0 : currentTool + 1;
      attachTool(next);
    } else if (a === 'detach') {
      detachTool();
    } else if (a === 'cycleColor') {
      cycleColor();
    } else if (a === 'cycleMachine') {
      switchMachine();
    }
  }
  updateHUD();
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const cs = Math.cos(theta), sn = Math.sin(theta);
  fwd.set(cs, 0, -sn);
  const chase = vehicleType === 'combine' ? 24 : 20;
  const height = vehicleType === 'combine' ? 15 : 12;
  const lookAhead = vehicleType === 'combine' ? 17 : 8;
  const dx = vehicle.position.x - fwd.x * chase;
  const dy = height;
  const dz = vehicle.position.z - fwd.z * chase;
  const t = 1 - Math.exp(-4 * dt);
  camPos.x += (dx - camPos.x) * t;
  camPos.y += (dy - camPos.y) * t;
  camPos.z += (dz - camPos.z) * t;
  camera.position.copy(camPos);
  lookAt.set(
    vehicle.position.x + fwd.x * lookAhead,
    vehicleType === 'combine' ? 2.5 : 1.5,
    vehicle.position.z + fwd.z * lookAhead
  );
  camera.lookAt(lookAt);
}

function updateSun() {
  sun.position.set(
    vehicle.position.x + SUN_OFFSET.x,
    SUN_OFFSET.y,
    vehicle.position.z + SUN_OFFSET.z
  );
  sun.target.position.copy(vehicle.position);
  sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------- save/restore
let session = null;

function snapshot() {
  const fd = [];
  for (let i = 0; i < fields.length; i++) fd.push(fields[i].serialize());
  return {
    v: 1,
    machine: vehicleType,
    money: Math.max(0, Math.floor(money)),
    tool: currentTool,
    color: currentColor,
    tx: vehicle.position.x,
    tz: vehicle.position.z,
    theta: theta,
    fields: fd,
  };
}

function applyState(s) {
  if (!s || typeof s !== 'object') return false;

  const savedMachine = s.machine === 'combine' ? 'combine' : 'tractor';
  if (savedMachine !== vehicleType) selectMachine(savedMachine);
  else detachTool();

  if (typeof s.money === 'number' && isFinite(s.money)) {
    money = Math.max(0, Math.floor(s.money));
  }

  if (typeof s.tx === 'number' && isFinite(s.tx)) {
    vehicle.position.x = Math.max(-16, Math.min(112, s.tx));
  }
  if (typeof s.tz === 'number' && isFinite(s.tz)) {
    vehicle.position.z = Math.max(-60, Math.min(34, s.tz));
  }
  if (typeof s.theta === 'number' && isFinite(s.theta)) theta = s.theta;
  vehicle.rotation.y = theta;
  speed = 0;

  if (typeof s.color === 'string' && LIVERY_NAMES.indexOf(s.color) !== -1) {
    currentColor = s.color;
    vehicleColors[vehicleType] = currentColor;
    applyLivery(vehicle, currentColor);
  }

  if (typeof s.tool === 'number' && isFinite(s.tool)) {
    const t = Math.round(s.tool);
    if (t >= 0 && t < attachmentTypes().length) attachTool(t);
    else detachTool();
  } else {
    detachTool();
  }

  if (Array.isArray(s.fields)) {
    for (let i = 0; i < fields.length && i < s.fields.length; i++) {
      fields[i].restore(s.fields[i]);
    }
  }

  // snap the chase cam behind the restored pose (no cross-map swoop)
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const chase = vehicleType === 'combine' ? 24 : 20;
  const height = vehicleType === 'combine' ? 15 : 12;
  camPos.set(vehicle.position.x - cs * chase, height, vehicle.position.z + sn * chase);

  lastSig = '';
  updateHUD();
  return true;
}

// ---------------------------------------------------------------- login gate
function setupLogin() {
  const overlay = document.getElementById('login');
  const form = document.getElementById('login-form');
  const emailIn = document.getElementById('login-email');
  const codeIn = document.getElementById('login-code');
  const go = document.getElementById('login-go');
  const msg = document.getElementById('login-msg');
  if (!overlay || !form || !emailIn || !codeIn || !go || !msg) return;

  const remembered = rememberedEmail();
  if (remembered) emailIn.value = remembered;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    go.disabled = true;
    msg.textContent = 'Loading the farm\u2026';
    login(emailIn.value, codeIn.value)
      .then(function (res) {
        session = { mode: res.mode, email: res.email };
        try {
          localStorage.setItem('vt-email', res.email);
        } catch (err) {
          /* ignore */
        }
        applyState(res.state);
        overlay.style.display = 'none';
        window.VT_LOCKED = false;
        lastSig = '';
        updateHUD();
      })
      .catch(function (err) {
        msg.textContent = err && err.message ? err.message : 'Try again';
        go.disabled = false;
      });
  });
}

setupLogin();
startAutosave(
  function () {
    return session;
  },
  snapshot
);

// ---------------------------------------------------------------- loop
let last = performance.now();
renderer.setAnimationLoop(function () {
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.1) dt = 0.1;

  input.update(dt);
  drainActions();
  stepPhysics(dt);
  stepFieldWork(dt);
  updateSun();
  updateCamera(dt);
  updateHUD();
  renderer.render(scene, camera);
});

addEventListener('resize', function () {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
