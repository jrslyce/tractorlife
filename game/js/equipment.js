// game/js/equipment.js — voxel farm implements.
// Local origin (0,0,0) = attach point placed on a tractor mount.
// Forward = +X (tractor's forward); ground = local y = −1.
// Rear tools extend toward −X, the harvester toward +X.
import * as THREE from 'three';

const COL = {
  metal: '#5a5a62',
  dark: '#33333a',
  rust: '#b5651d',
  yellow: '#e8c34a',
  silver: '#c9ccd2',
  red: '#c0392b',
  white: '#eef4f7',
  blue: '#3f7dbc'
};

export const TOOL_ORDER = ['plow', 'planter', 'sprayer', 'harvester'];

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

class Builder {
  constructor() { this.map = new Map(); }
  set(x, y, z, c) { this.map.set(x + ',' + y + ',' + z, c); }
  box(x0, x1, y0, y1, z0, z1, c) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) this.set(x, y, z, c);
  }
  build() {
    const group = new THREE.Group();
    const buckets = new Map();
    this.map.forEach(function (c, k) {
      if (!buckets.has(c)) buckets.set(c, []);
      const p = k.split(',');
      buckets.get(c).push([Number(p[0]), Number(p[1]), Number(p[2])]);
    });
    buckets.forEach(function (cells, color) {
      const mat = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.8, metalness: 0.08
      });
      const mesh = new THREE.InstancedMesh(BOX, mat, cells.length);
      for (let i = 0; i < cells.length; i++) {
        _dummy.position.set(cells[i][0], cells[i][1], cells[i][2]);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }
}

function buildPlow() {
  const b = new Builder();
  b.box(-3, -1, 0, 0, 0, 0, COL.metal);          // drawbar back from mount
  b.box(-4, -4, 0, 0, -2, 2, COL.metal);         // crossbar
  [-2, 0, 2].forEach(function (z) {
    b.set(-4, -1, z, COL.metal);                 // shank down to ground
    b.set(-5, -1, z, COL.rust);                  // share point (cuts soil)
    b.set(-5, 0, z, COL.rust);                   // moldboard
  });
  const g = b.build();
  g.userData = { type: 'plow', effect: 'till', width: 4, mount: 'rear' };
  return g;
}

function buildPlanter() {
  const b = new Builder();
  b.box(-3, -1, 0, 0, 0, 0, COL.metal);          // drawbar
  b.box(-4, -4, -1, 0, -2, 2, COL.metal);        // frame
  b.box(-5, -3, 1, 2, -1, 1, COL.yellow);        // seed hopper
  b.box(-5, -3, 2, 2, 0, 0, COL.dark);           // lid stripe (overwrites top)
  [-1, 0, 1].forEach(function (z) {
    b.set(-5, 0, z, COL.metal);                  // seed tubes
    b.set(-5, -1, z, COL.metal);                 // shoes at ground
  });
  b.box(-4, -4, 0, 0, -3, -3, COL.metal);        // marker arms
  b.box(-4, -4, 0, 0, 3, 3, COL.metal);
  b.set(-4, -1, -3, COL.dark);
  b.set(-4, -1, 3, COL.dark);
  const g = b.build();
  g.userData = { type: 'planter', effect: 'plant', width: 4, mount: 'rear' };
  return g;
}

function buildSprayer() {
  const b = new Builder();
  b.box(-3, -1, 0, 0, 0, 0, COL.metal);          // drawbar
  for (let z = -4; z <= 4; z++) b.set(-6, 0, z, COL.metal);   // booms FIRST
  for (let z = -4; z <= 4; z += 2) b.set(-6, -1, z, COL.dark); // nozzles
  b.set(-5, -1, -3, COL.metal);                  // boom braces
  b.set(-5, -1, 3, COL.metal);
  b.box(-6, -3, 1, 3, -1, 1, COL.white);         // tank (sits on boom row)
  b.box(-6, -3, 2, 2, 0, 0, COL.blue);           // stripe
  const g = b.build();
  g.userData = { type: 'sprayer', effect: 'spray', width: 8, mount: 'rear' };
  return g;
}

function buildHarvester() {
  const b = new Builder();
  b.box(0, 3, -1, 1, -1, 1, COL.red);            // feeder housing
  b.box(1, 3, 2, 2, -1, 1, COL.red);             // thresher top
  b.box(4, 4, 0, 0, -1, 1, COL.red);             // bridge to header
  b.box(5, 5, -1, 1, -2, 2, COL.yellow);         // header crossbar
  for (let z = -2; z <= 2; z++) b.set(6, -1, z, COL.silver);   // cutting teeth
  b.box(5, 6, -1, -1, -3, -3, COL.yellow);       // side dividers
  b.box(5, 6, -1, -1, 3, 3, COL.yellow);
  b.box(5, 5, 1, 1, -2, 2, COL.red);             // intake reel (overwrites top)
  b.set(5, 1, -3, COL.dark);
  b.set(5, 1, 3, COL.dark);
  const g = b.build();
  g.userData = { type: 'harvester', effect: 'harvest', width: 5, mount: 'front' };
  return g;
}

export function buildTool(type) {
  switch (type) {
    case 'plow': return buildPlow();
    case 'planter': return buildPlanter();
    case 'sprayer': return buildSprayer();
    case 'harvester': return buildHarvester();
    default: return null;
  }
}