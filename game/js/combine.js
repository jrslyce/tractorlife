// Voxel combine harvester with large front drive wheels and rear steering.
import * as THREE from 'three';
import { LIVERIES } from './tractor.js';

const PALETTE = {
  body: '#3d812f',
  accent: '#2e6427',
  tire: '#1e1e22',
  hub: '#ffd94a',
  metal: '#777d82',
  dark: '#292d2e',
  red: '#ba3931',
  glass: '#83c9e8',
  light: '#ffe27a',
  silver: '#c9ccd2',
  black: '#17191b'
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

function key(x, y, z) { return x + ',' + y + ',' + z; }

function addCells(parent, buckets, livery) {
  buckets.forEach(function (cells, role) {
    let color = PALETTE[role];
    if (livery && Object.prototype.hasOwnProperty.call(livery, role)) color = livery[role];
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: role === 'glass' ? 0.28 : 0.75,
      metalness: role === 'metal' || role === 'silver' ? 0.18 : 0.03
    });
    material.userData.role = role;
    const mesh = new THREE.InstancedMesh(BOX, material, cells.length);
    for (let i = 0; i < cells.length; i++) {
      _dummy.position.set(cells[i][0], cells[i][1], cells[i][2]);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
}

export function buildCombine(liveryName) {
  const livery = LIVERIES[liveryName] ? LIVERIES[liveryName] : LIVERIES.green;
  const name = LIVERIES[liveryName] ? liveryName : 'green';
  const combine = new THREE.Group();
  combine.name = 'combine-harvester';

  const claimed = new Set();
  const frontWheelSets = [];
  const rearWheelSets = [];

  function collectWheel(cx, cy, radius, wheelOffset, cells) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const distance = dx * dx + dy * dy;
        if (distance > radius * radius) continue;
        const inner = Math.max(1, (radius - 1) * (radius - 1));
        for (let side = -1; side <= 1; side += 2) {
          for (let layer = -1; layer <= 1; layer++) {
            claimed.add(key(cx + dx, cy + dy, side * wheelOffset + layer));
          }
        }
        for (let layer = -1; layer <= 1; layer++) {
          cells.push([dx, dy, layer, distance <= inner ? 'hub' : 'tire']);
        }
      }
    }
  }

  collectWheel(3, 3, 3, 4.5, frontWheelSets);
  collectWheel(-8, 2, 2, 3.5, rearWheelSets);

  const voxels = new Map();
  function cell(x, y, z, role) {
    const k = key(x, y, z);
    if (!claimed.has(k)) voxels.set(k, role);
  }
  function box(x0, x1, y0, y1, z0, z1, role) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) cell(x, y, z, role);
  }

  // Long green chassis and the tall threshing body behind the cab.
  box(-9, 7, 2, 3, -3, 3, 'body');
  box(-10, -7, 4, 7, -3, 3, 'accent');            // rear engine housing
  box(-9, -6, 5, 6, -4, 4, 'body');               // side service panels
  box(-7, 1, 4, 7, -3, 3, 'body');                // threshing body
  box(-7, 0, 8, 10, -3, 3, 'body');               // grain tank
  box(-6, -1, 11, 11, -2, 2, 'accent');           // grain tank lid
  box(-6, -1, 12, 12, -1, 1, 'body');
  box(0, 2, 5, 8, -3, 3, 'body');                  // feederhouse shoulder
  box(1, 7, 4, 5, -3, 3, 'body');                  // forward chassis

  // Tall glass cab at the front gives the machine a distinct combine profile.
  box(2, 7, 9, 9, -3, 3, 'body');                 // cab roof
  box(2, 3, 5, 8, -3, -3, 'dark');                 // cab frame
  box(2, 3, 5, 8, 3, 3, 'dark');
  box(2, 6, 5, 8, -2, -2, 'glass');                // left side glazing
  box(2, 6, 5, 8, 2, 2, 'glass');                 // right side glazing
  box(7, 7, 5, 8, -2, 2, 'glass');                // broad windshield
  box(1, 1, 6, 8, -2, 2, 'body');                 // cab rear wall
  box(4, 5, 5, 6, -1, 1, 'dark');                 // operator seat
  box(5, 6, 7, 7, -1, -1, 'metal');               // steering column / wheel
  cell(6, 8, -1, 'dark');
  cell(7, 8, -1, 'dark');
  cell(6, 8, 0, 'dark');

  // A slim side unloading auger and downturned spout identify the machine.
  for (let z = 3; z <= 9; z++) cell(-3, 10, z, 'silver');
  box(-4, -3, 8, 10, 9, 9, 'metal');

  // Axles, lights, ladder, and body trim.
  box(-9, -9, 2, 5, -1, -1, 'metal');
  box(-9, -9, 2, 5, 1, 1, 'metal');
  cell(-10, 4, -2, 'light');
  cell(-10, 4, 2, 'light');
  cell(-10, 3, -2, 'red');
  cell(-10, 3, 2, 'red');
  box(-5, -5, 3, 7, 4, 4, 'metal');
  box(-6, -4, 3, 3, 4, 4, 'metal');
  box(-9, 1, 3, 3, -4, -4, 'accent');
  box(-9, 1, 3, 3, 4, 4, 'accent');

  const staticBuckets = new Map();
  voxels.forEach(function (role, encoded) {
    const parts = encoded.split(',');
    const x = Number(parts[0]), y = Number(parts[1]), z = Number(parts[2]);
    if (!staticBuckets.has(role)) staticBuckets.set(role, []);
    staticBuckets.get(role).push([x, y, z]);
  });
  addCells(combine, staticBuckets, livery);

  function makeAxle(cx, cy, radius, wheelOffset, cells, steerable) {
    const axle = new THREE.Group();
    axle.position.set(cx, cy, 0);
    for (let side = -1; side <= 1; side += 2) {
      const sidePivot = new THREE.Group();
      sidePivot.position.z = side * wheelOffset;
      const buckets = new Map();
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!buckets.has(c[3])) buckets.set(c[3], []);
        buckets.get(c[3]).push([c[0], c[1], c[2]]);
      }
      const spin = new THREE.Group();
      sidePivot.add(spin);
      addCells(spin, buckets, livery);
      combine.userData.wheels.push({ pivot: spin, radius: radius });
      axle.add(sidePivot);
    }
    combine.add(axle);
    if (steerable) combine.userData.steeringPivots.push(axle);
  }

  combine.userData = {
    mounts: { front: new THREE.Vector3(8, 2, 0), rear: new THREE.Vector3(-9, 1, 0) },
    wheels: [],
    steeringPivots: [],
    livery: name,
    machineType: 'combine'
  };
  makeAxle(3, 3, 3, 4.5, frontWheelSets, false);
  makeAxle(-8, 2, 2, 3.5, rearWheelSets, true);
  return combine;
}
