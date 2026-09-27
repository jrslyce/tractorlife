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

const HEAD = {
  green: '#386a2b',
  greenLight: '#6e982d',
  yellow: '#e8c34a',
  yellowLight: '#f2d45b',
  reel: '#9b302b',
  black: '#252629',
  silver: '#c9ccd2',
  steel: '#7b8289'
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
  b.box(-4, -4, 0, 0, -6, 6, COL.metal);         // crossbar (6 rows)
  [-5, -3, -1, 1, 3, 5].forEach(function (z) {
    b.set(-4, -1, z, COL.metal);                 // shank down to ground
    b.set(-5, -1, z, COL.rust);                  // share point (cuts soil)
    b.set(-5, 0, z, COL.rust);                   // moldboard
  });
  const g = b.build();
  g.userData = { type: 'plow', effect: 'till', width: 12, mount: 'rear' };
  return g;
}

function buildPlanter() {
  const b = new Builder();
  b.box(-3, -1, 0, 0, 0, 0, COL.metal);          // drawbar
  b.box(-4, -4, -1, 0, -6, 6, COL.metal);        // frame (6 rows)
  b.box(-5, -3, 1, 2, -3, 3, COL.yellow);        // seed hopper
  b.box(-5, -3, 2, 2, -1, 1, COL.dark);          // lid stripe (overwrites top)
  [-5, -3, -1, 1, 3, 5].forEach(function (z) {
    b.set(-5, 0, z, COL.metal);                  // seed tubes
    b.set(-5, -1, z, COL.metal);                 // shoes at ground
  });
  b.set(-4, 0, -7, COL.metal);                   // marker arms
  b.set(-4, 0, 7, COL.metal);
  b.set(-4, -1, -7, COL.dark);
  b.set(-4, -1, 7, COL.dark);
  const g = b.build();
  g.userData = { type: 'planter', effect: 'plant', width: 12, mount: 'rear' };
  return g;
}

function buildSprayer() {
  const b = new Builder();
  b.box(-3, -1, 0, 0, 0, 0, COL.metal);          // drawbar
  for (let z = -6; z <= 6; z++) b.set(-6, 0, z, COL.metal);   // booms FIRST
  [-5, -3, -1, 1, 3, 5].forEach(function (z) {
    b.set(-6, -1, z, COL.dark);                  // nozzles (one per row)
  });
  b.set(-5, -1, -4, COL.metal);                  // boom braces
  b.set(-5, -1, 4, COL.metal);
  b.box(-6, -3, 1, 3, -2, 2, COL.white);         // tank (sits on boom row)
  b.box(-6, -3, 2, 2, 0, 0, COL.blue);           // stripe
  const g = b.build();
  g.userData = { type: 'sprayer', effect: 'spray', width: 12, mount: 'rear' };
  return g;
}

function buildHarvester() {
  const b = new Builder();
  b.box(0, 3, -1, 1, -1, 1, COL.red);            // feeder housing
  b.box(1, 3, 2, 2, -1, 1, COL.red);             // thresher top
  b.box(4, 4, 0, 0, -1, 1, COL.red);             // bridge to header
  b.box(5, 5, -1, 1, -6, 6, COL.yellow);         // header crossbar (6 rows)
  for (let z = -6; z <= 6; z++) b.set(6, -1, z, COL.silver);   // cutting teeth
  b.box(5, 6, -1, -1, -7, -7, COL.yellow);       // side dividers
  b.box(5, 6, -1, -1, 7, 7, COL.yellow);
  b.box(5, 5, 1, 1, -6, 6, COL.red);             // intake reel (overwrites top)
  b.set(5, 1, -7, COL.dark);
  b.set(5, 1, 7, COL.dark);
  const g = b.build();
  g.userData = { type: 'harvester', effect: 'harvest', width: 12, mount: 'front' };
  return g;
}

function buildCornHead() {
  const b = new Builder();
  b.box(-3, -1, -1, 0, -13, 13, HEAD.steel);
  b.box(0, 2, -1, 0, -12, 12, HEAD.yellow);
  b.box(2, 3, -1, -1, -13, 13, HEAD.black);
  b.box(0, 2, 1, 1, -12, 12, HEAD.yellowLight);
  for (let z = -12; z <= 12; z += 3) {
    b.box(2, 3, -1, -1, z - 1, z + 1, HEAD.yellow);
    b.box(3, 5, -1, -1, z, z, HEAD.yellowLight);
    b.box(1, 2, 0, 0, z, z, HEAD.green);
    b.set(0, 0, z - 1, HEAD.black);
    b.set(0, 0, z + 1, HEAD.black);
  }
  b.box(-1, 0, 0, 0, -13, -13, HEAD.yellow);
  b.box(-1, 0, 0, 0, 13, 13, HEAD.yellow);
  const g = b.build();
  g.userData = {
    type: 'cornHead', name: 'Corn Head', effect: 'harvest',
    width: 26, workOffset: 3, mount: 'front'
  };
  return g;
}

function buildSoybeanHead() {
  const b = new Builder();
  b.box(-3, -1, -1, 0, -14, 14, HEAD.steel);
  b.box(0, 2, -1, 0, -14, 14, HEAD.yellow);
  b.box(2, 3, -1, -1, -14, 14, HEAD.black);
  b.box(0, 2, 1, 1, -14, 14, HEAD.yellowLight);
  b.box(4, 4, 2, 2, -13, 13, HEAD.steel);
  for (let z = -12; z <= 12; z += 4) {
    b.box(3, 5, 2, 2, z, z, HEAD.reel);
    b.box(4, 4, 0, 3, z, z, HEAD.reel);
  }
  for (let z = -13; z <= 13; z++) b.set(3, -1, z, HEAD.silver);
  b.box(-1, 0, 0, 0, -14, -14, HEAD.yellow);
  b.box(-1, 0, 0, 0, 14, 14, HEAD.yellow);
  const g = b.build();
  g.userData = {
    type: 'soybeanHead', name: 'Soybean Head', effect: 'harvest',
    width: 28, workOffset: 3, mount: 'front'
  };
  return g;
}

export const COMBINE_HEAD_ORDER = ['corn', 'soybean'];

export function buildCombineHead(type) {
  if (type === 'corn') return buildCornHead();
  if (type === 'soybean') return buildSoybeanHead();
  return null;
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
