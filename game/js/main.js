// game/js/main.js — Tractor Farm: playable integration layer.
// Imports: three (importmap 0.160.0), ./field.js, ./input.js, ./tractor.js, ./equipment.js
import * as THREE from 'three';
import { Field } from './field.js';
import { Input } from './input.js';
import { buildTractor, applyLivery, LIVERY_NAMES } from './tractor.js';
import { TOOL_ORDER, buildTool } from './equipment.js';
import { login, rememberedEmail, startAutosave } from './net.js';

const TRACTOR_SCALE = 0.5; // tractor spans 6.5 world units (was 13)

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
tractor.scale.set(TRACTOR_SCALE, TRACTOR_SCALE, TRACTOR_SCALE);
tractor.position.set(-6, 0, -13); // west end of the middle lane, facing the farm
tractor.rotation.y = 0; // facing +X
scene.add(tractor);

// ---------------------------------------------------------------- input
const input = new Input();

// ---------------------------------------------------------------- tools
let currentTool = -1; // index into TOOL_ORDER; -1 = detached
let toolGroup = null;

const TOOL_INFO = {
  plow: { emoji: '⛏️', name: 'Plow' },
  planter: { emoji: '🌱', name: 'Planter' },
  sprayer: { emoji: '🫧', name: 'Sprayer' },
  harvester: { emoji: '🌾', name: 'Harvester' },
};

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
    tractor.remove(toolGroup);
    disposeGroup(toolGroup);
    toolGroup = null;
  }
  currentTool = -1;
}

function attachTool(idx) {
  detachTool();
  const type = TOOL_ORDER[idx];
  toolGroup = buildTool(type);
  if (!toolGroup) return;
  tractor.add(toolGroup);
  const mountKey = toolGroup.userData.mount === 'front' ? 'front' : 'rear';
  toolGroup.position.copy(tractor.userData.mounts[mountKey]);
  toolGroup.rotation.set(0, 0, 0);
  currentTool = idx;
}

// ---------------------------------------------------------------- livery
let currentColor = LIVERY_NAMES[0] || 'red';

function cycleColor() {
  const i = LIVERY_NAMES.indexOf(currentColor);
  currentColor = LIVERY_NAMES[(i + 1) % LIVERY_NAMES.length] || LIVERY_NAMES[0];
  applyLivery(tractor, currentColor);
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
  const type = currentTool >= 0 ? TOOL_ORDER[currentTool] : null;
  const info = type ? TOOL_INFO[type] : null;
  // rebuild only when something actually changed
  const sig = money + '|' + currentTool + '|' + currentColor + '|' +
    s.tilled + '|' + s.planted + '|' + s.sprayed + '|' + s.harvested;
  if (sig === lastSig) return;
  lastSig = sig;

  hudLeft.innerHTML =
    '<div>💰 <b>$' + money + '</b></div>' +
    '<div>🚜 ' + (info ? info.emoji + ' ' + info.name : 'None') + '</div>' +
    '<div>🎨 ' + (COLOR_NAMES[currentColor] || currentColor) + '</div>';

  hudRight.innerHTML =
    '<div>🟫 Tilled: <b>' + s.tilled + '</b></div>' +
    '<div>🌱 Planted: <b>' + s.planted + '</b></div>' +
    '<div>🫧 Sprayed: <b>' + s.sprayed + '</b></div>' +
    '<div>🌾 Harvested: <b>' + s.harvested + '</b></div>' +
    '<div style="margin-top:4px">' + legendHTML + '</div>';

  let hint;
  if (s.tilled === 0) {
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
  const target = drive > 0 ? drive * MAX_FWD : drive * MAX_REV;
  const stopping = input.brake || drive === 0;
  const rate = stopping ? BRAKE_RATE : ACCEL_RATE;
  const diff = target - speed;
  const step = rate * dt;
  speed = Math.abs(diff) <= step ? target : speed + (diff > 0 ? step : -step);

  // steering only bites while rolling; reversing flips the turn direction
  const steer = input.turn * STEER_RATE * Math.min(1, Math.abs(speed) / 2) * (speed < 0 ? -1 : 1);
  theta -= steer * dt;
  tractor.rotation.y = theta;

  const cs = Math.cos(theta), sn = Math.sin(theta);
  tractor.position.x += cs * speed * dt;
  tractor.position.z += -sn * speed * dt;
  tractor.position.x = Math.max(-16, Math.min(112, tractor.position.x));
  tractor.position.z = Math.max(-60, Math.min(34, tractor.position.z));

  // wheels — pivot radius is in tractor-local units, so scale by TRACTOR_SCALE
  const wheels = tractor.userData.wheels || [];
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    const r = (w.radius || 1) * TRACTOR_SCALE;
    w.pivot.rotation.z -= (speed / r) * dt;
  }
}

// ---------------------------------------------------------------- field work
// field.applyEffect heading: along = dx·cos(h)+dz·sin(h) with dx = tile.x − x,
// so forward in (x,z) = (cos h, sin h). Tractor forward = (cos θ, −sin θ),
// therefore h = −θ. Width is world units; tools are scaled with the tractor.
function stepFieldWork(dt) {
  if (toolGroup && Math.abs(speed) > 0.4) {
    const mountKey = toolGroup.userData.mount === 'front' ? 'front' : 'rear';
    const mount = tractor.userData.mounts[mountKey];
    // sit the working band under the tool body: rear tools trail −X, harvester leads +X
    const offset = toolGroup.userData.mount === 'front' ? 2 : -2;
    tmpLocal.copy(mount);
    tmpLocal.x += offset;
    tractor.updateMatrixWorld();
    tractor.localToWorld(tmpLocal);
    const width = toolGroup.userData.width * TRACTOR_SCALE;
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
      const next = currentTool + 1 >= TOOL_ORDER.length ? 0 : currentTool + 1;
      attachTool(next);
    } else if (a === 'detach') {
      detachTool();
    } else if (a === 'cycleColor') {
      cycleColor();
    }
  }
  updateHUD();
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const cs = Math.cos(theta), sn = Math.sin(theta);
  fwd.set(cs, 0, -sn);
  // high chase cam: desired = pos − forward*20 + up*12
  const dx = tractor.position.x - fwd.x * 20;
  const dy = 12;
  const dz = tractor.position.z - fwd.z * 20;
  const t = 1 - Math.exp(-4 * dt);
  camPos.x += (dx - camPos.x) * t;
  camPos.y += (dy - camPos.y) * t;
  camPos.z += (dz - camPos.z) * t;
  camera.position.copy(camPos);
  lookAt.set(
    tractor.position.x + fwd.x * 8,
    1.5,
    tractor.position.z + fwd.z * 8
  );
  camera.lookAt(lookAt);
}

function updateSun() {
  sun.position.set(
    tractor.position.x + SUN_OFFSET.x,
    SUN_OFFSET.y,
    tractor.position.z + SUN_OFFSET.z
  );
  sun.target.position.copy(tractor.position);
  sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------- save/restore
let session = null;

function snapshot() {
  const fd = [];
  for (let i = 0; i < fields.length; i++) fd.push(fields[i].serialize());
  return {
    v: 1,
    money: Math.max(0, Math.floor(money)),
    tool: currentTool,
    color: currentColor,
    tx: tractor.position.x,
    tz: tractor.position.z,
    theta: theta,
    fields: fd,
  };
}

function applyState(s) {
  if (!s || typeof s !== 'object') return false;

  if (typeof s.money === 'number' && isFinite(s.money)) {
    money = Math.max(0, Math.floor(s.money));
  }

  if (typeof s.tx === 'number' && isFinite(s.tx)) {
    tractor.position.x = Math.max(-16, Math.min(112, s.tx));
  }
  if (typeof s.tz === 'number' && isFinite(s.tz)) {
    tractor.position.z = Math.max(-60, Math.min(34, s.tz));
  }
  if (typeof s.theta === 'number' && isFinite(s.theta)) theta = s.theta;
  tractor.rotation.y = theta;
  speed = 0;

  if (typeof s.color === 'string' && LIVERY_NAMES.indexOf(s.color) !== -1) {
    currentColor = s.color;
    applyLivery(tractor, currentColor);
  }

  if (typeof s.tool === 'number' && isFinite(s.tool)) {
    const t = Math.round(s.tool);
    if (t >= 0 && t < TOOL_ORDER.length) attachTool(t);
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
  camPos.set(tractor.position.x - cs * 20, 12, tractor.position.z + sn * 20);

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