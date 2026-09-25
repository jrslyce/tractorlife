// game/js/tractor.js — voxel tractor with swappable liveries.
// Model grid matches voxel-tractor.html; final positions get XSHIFT/YSHIFT so
// wheels rest exactly on y=0 and the grille/rear faces land on the mount
// points at x = ±7.
import * as THREE from 'three';

const XSHIFT = -1.5;
const YSHIFT = 0.5;

// colors shared by every livery (roles: tire/metal/dark/light/tail)
const SHARED = {
  tire: '#1e1e22',
  metal: '#5a5a62',
  dark: '#33333a',
  light: '#ffd94a',
  tail: '#ff6b35'
};

export const LIVERIES = {
  red:    { body: '#c0392b', accent: '#8e2a1f', hub: '#f2c14e', seat: '#2f3b4a' },
  green:  { body: '#2f7d32', accent: '#1e5c24', hub: '#ffd94a', seat: '#2b2b2b' },
  orange: { body: '#e07b21', accent: '#b35c12', hub: '#3a3a40', seat: '#2f3b4a' },
  blue:   { body: '#2f6fb5', accent: '#1f4f85', hub: '#eceff3', seat: '#2f3b4a' },
  yellow: { body: '#e8b830', accent: '#b8901a', hub: '#4a4a50', seat: '#33333a' }
};

export const LIVERY_NAMES = ['red', 'green', 'orange', 'blue', 'yellow'];

function colorOf(role, livery) {
  return Object.prototype.hasOwnProperty.call(livery, role) ? livery[role] : SHARED[role];
}

function gkey(x, y, z) { return x + ',' + y + ',' + z; }

// wheel voxels (original grid coords); marks cells as claimed
function addWheelCells(cx, cy, r, z0, z1, out, claimed) {
  for (let z = z0; z <= z1; z++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const d = dx * dx + dy * dy;
        if (d > r * r) continue;
        const inner = Math.max(0.5, (r - 1) * (r - 1));
        const x = cx + dx, y = cy + dy;
        claimed.add(gkey(x, y, z));
        out.push({ x: x, y: y, z: z, role: d <= inner ? 'hub' : 'tire' });
      }
    }
  }
}

// static voxels: skip wheel-owned cells; later writes overwrite earlier ones
function fill(map, claimed, x0, x1, y0, y1, z0, z1, role) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const k = gkey(x, y, z);
        if (claimed.has(k)) continue;
        map.set(k, role);
      }
}

function cell(map, claimed, x, y, z, role) {
  fill(map, claimed, x, x, y, y, z, z, role);
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

function pushCell(buckets, role, x, y, z) {
  if (!buckets.has(role)) buckets.set(role, []);
  buckets.get(role).push([x, y, z]);
}

function buildMeshes(parent, buckets, livery) {
  buckets.forEach(function (cells, role) {
    const mat = new THREE.MeshStandardMaterial({
      color: colorOf(role, livery),
      roughness: 0.75,
      metalness: 0.05
    });
    mat.userData.role = role;              // applyLivery recolors by role
    const mesh = new THREE.InstancedMesh(BOX, mat, cells.length);
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

export function buildTractor(liveryName) {
  const name = LIVERIES[liveryName] ? liveryName : LIVERY_NAMES[0];
  const livery = LIVERIES[name];
  const group = new THREE.Group();
  group.name = 'tractor';

  // wheels first — they own their grid cells
  const claimed = new Set();
  const rearCells = [], frontCells = [];
  addWheelCells(-2, 3, 3, -5, -4, rearCells, claimed);
  addWheelCells(-2, 3, 3, 4, 5, rearCells, claimed);
  addWheelCells(6, 2, 2, -4, -3, frontCells, claimed);
  addWheelCells(6, 2, 2, 3, 4, frontCells, claimed);

  // ---- static body voxels ----
  const s = new Map();
  fill(s, claimed, -5, 8, 2, 3, -2, 2, 'body');        // frame
  fill(s, claimed, 4, 8, 4, 5, -1, 1, 'body');         // hood
  fill(s, claimed, 4, 8, 5, 5, 0, 0, 'accent');        // hood stripe
  fill(s, claimed, 8, 8, 3, 5, -1, 1, 'dark');         // grille
  cell(s, claimed, 8, 5, -1, 'light');                 // headlights (overwrite grille)
  cell(s, claimed, 8, 5, 1, 'light');
  fill(s, claimed, -5, 1, 4, 4, -2, 2, 'body');        // rear deck
  fill(s, claimed, -5, -1, 7, 7, -5, -3, 'body');      // rear fenders
  fill(s, claimed, -5, -1, 7, 7, 3, 5, 'body');
  fill(s, claimed, -5, -1, 5, 6, -4, -3, 'accent');    // fender skirts
  fill(s, claimed, -5, -1, 5, 6, 3, 4, 'accent');
  cell(s, claimed, -2, 3, -3, 'metal');                // rear axle stubs
  cell(s, claimed, -2, 3, 3, 'metal');
  fill(s, claimed, -3, -1, 5, 5, -1, 1, 'seat');       // seat base
  fill(s, claimed, -4, -4, 5, 7, -1, 1, 'seat');       // backrest
  fill(s, claimed, 1, 1, 4, 5, 0, 0, 'metal');         // steering column
  cell(s, claimed, 0, 6, 0, 'dark');                   // steering wheel
  cell(s, claimed, 1, 6, 0, 'dark');
  cell(s, claimed, 2, 6, 0, 'dark');
  cell(s, claimed, 1, 6, -1, 'dark');
  cell(s, claimed, 1, 6, 1, 'dark');
  fill(s, claimed, 4, 4, 6, 8, -1, -1, 'metal');       // exhaust stack
  cell(s, claimed, 4, 9, -1, 'dark');
  fill(s, claimed, -5, -5, 5, 9, -2, -2, 'metal');     // roll bar posts
  fill(s, claimed, -5, -5, 5, 9, 2, 2, 'metal');
  fill(s, claimed, -5, -5, 9, 9, -2, 2, 'metal');      // roll bar top
  cell(s, claimed, -6, 4, -1, 'tail');                 // taillights
  cell(s, claimed, -6, 4, 1, 'tail');
  cell(s, claimed, -6, 1, 0, 'metal');                 // hitch
  cell(s, claimed, -5, 1, 0, 'metal');
  cell(s, claimed, -4, 1, 0, 'metal');
  cell(s, claimed, 0, 5, -2, 'metal');                 // antenna
  cell(s, claimed, 0, 6, -2, 'metal');
  cell(s, claimed, 0, 7, -2, 'light');

  // static instanced meshes (grid → shifted model space)
  const staticBuckets = new Map();
  s.forEach(function (role, k) {
    const p = k.split(',');
    pushCell(staticBuckets, role,
      Number(p[0]) + XSHIFT, Number(p[1]) + YSHIFT, Number(p[2]));
  });
  buildMeshes(group, staticBuckets, livery);

  // wheel pivots (game spins pivot.rotation.z to roll)
  function makePivot(cx, cy, cells) {
    const pivot = new THREE.Group();
    pivot.position.set(cx + XSHIFT, cy + YSHIFT, 0);
    const buckets = new Map();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      pushCell(buckets, c.role, c.x - cx, c.y - cy, c.z);
    }
    buildMeshes(pivot, buckets, livery);
    group.add(pivot);
    return pivot;
  }
  const rearPivot = makePivot(-2, 3, rearCells);
  const frontPivot = makePivot(6, 2, frontCells);

  group.userData = {
    mounts: {
      rear: new THREE.Vector3(-7, 1, 0),
      front: new THREE.Vector3(7, 1, 0)
    },
    livery: name,
    wheels: [
      { pivot: rearPivot, radius: 3 },
      { pivot: frontPivot, radius: 2 }
    ]
  };
  return group;
}

export function applyLivery(group, liveryName) {
  const livery = LIVERIES[liveryName];
  if (!livery || !group) return;
  group.traverse(function (obj) {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (let i = 0; i < mats.length; i++) {
      const role = mats[i].userData ? mats[i].userData.role : null;
      if (role && Object.prototype.hasOwnProperty.call(livery, role)) {
        mats[i].color.set(livery[role]);
      }
    }
  });
  group.userData.livery = liveryName;
}