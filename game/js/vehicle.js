// game/js/vehicle.js — voxel pickup truck.
// Local origin (0,0,0) = ground level, centered under the vehicle.
// Forward = +X (truck's front faces +X): hood/bumper at +X, bed at -X.
import * as THREE from 'three';

const COL = {
  metal: '#949ba2',   // body paint — silver-grey (plan)
  dark: '#383d43',    // rocker band, fender flares, bed caps, trim
  bed: '#2a2e33',     // bed interior (floor + walls shadow)
  tire: '#1e1e22',
  hub: '#c9ccd2',
  light: '#ffd94a',   // headlights (same lamp as the tractor)
  amber: '#ff9d2e',   // indicators + rear amber segment
  tail: '#ff6b35',    // taillights (same lamp as the tractor)
  glass: '#d9f0fd',   // windshield / windows
  grille: '#1b1e21',  // front grille
  chrome: '#cdd3d9'   // bumpers + grille bar
};

// Voxels are centred on their cell, so lift everything half a cell: the
// wheel cells (y=0..4) then span y 0..5 and rest exactly on the ground.
const YSHIFT = 0.5;

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

function matFor(color) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: color === COL.glass ? 0.3 : 0.78,
    metalness: (color === COL.chrome || color === COL.hub) ? 0.25 : 0.06
  });
}

// ---- Builder: voxel map -> InstancedMesh buckets ----
// Keys are hex strings (direct material colors). Cells claimed by the
// wheels are skipped so body and wheel never z-fight.

class Builder {
  constructor(claimed) {
    this.map = new Map();
    this.claimed = claimed || null;
  }
  set(x, y, z, c) {
    var k = x + ',' + y + ',' + z;
    if (this.claimed && this.claimed.has(k)) return; // wheel owns that cell
    this.map.set(k, c);
  }
  box(x0, x1, y0, y1, z0, z1, c) {
    for (var x = x0; x <= x1; x++)
      for (var y = y0; y <= y1; y++)
        for (var z = z0; z <= z1; z++) this.set(x, y, z, c);
  }
  build() {
    var group = new THREE.Group();
    var buckets = new Map();
    this.map.forEach(function (c, k) {
      if (!buckets.has(c)) buckets.set(c, []);
      var p = k.split(',');
      buckets.get(c).push([Number(p[0]), Number(p[1]), Number(p[2])]);
    });
    buckets.forEach(function (cells, color) {
      var mat = matFor(color);
      var mesh = new THREE.InstancedMesh(BOX, mat, cells.length);
      for (var i = 0; i < cells.length; i++) {
        _dummy.position.set(cells[i][0], cells[i][1] + YSHIFT, cells[i][2]);
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

// ---- Wheel voxel generation ----
// Marks every cell as claimed so the body fill skips the wheel disc.

function wheelCells(cx, cy, r, z0, z1, out, claimed) {
  for (var z = z0; z <= z1; z++) {
    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        var d = dx * dx + dy * dy;
        if (d > r * r) continue;
        var inner = Math.max(0.5, (r - 1) * (r - 1));
        var x = cx + dx, y = cy + dy;
        claimed.add(x + ',' + y + ',' + z);
        out.push({ x: x, y: y, z: z, role: d <= inner ? 'hub' : 'tire' });
      }
    }
  }
}

// Wheel cells grouped by ROLE ('hub'/'tire') → mesh materials from COL.
function wheelMeshes(cells, cx, cy, cz) {
  var g = new THREE.Group();
  var buckets = new Map();
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (!buckets.has(c.role)) buckets.set(c.role, []);
    buckets.get(c.role).push([c.x - cx, c.y - cy, c.z - cz]);
  }
  buckets.forEach(function (list, role) {
    var mat = matFor(COL[role]);
    var mesh = new THREE.InstancedMesh(BOX, mat, list.length);
    for (var i = 0; i < list.length; i++) {
      _dummy.position.set(list[i][0], list[i][1], list[i][2]);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  });
  return g;
}

// ---- Truck builder ----
//
// Layout (model cells, 1 cell = 1 model unit, scale applied by main.js):
//   x=-10 rear bumper | bed x=-9..-1 | cab x=0..4 | hood x=5..9 | x=10 front bumper
//   Two-tone body: silver sides over a dark rocker band, with dark fender
//   flares above each tyre. Bed: dark floor y=5, walls y=6..7, dark rail caps
//   y=8, open top. Cab: y=6..9 (roof one cell above the bed rails), glass
//   front/side/rear faces, beltline at y=7 level with the bed walls.
//   Front face: dark grille + chrome bar, stacked headlamp / indicator.
//   Wheels: r=2, front axle x=6, rear axle x=-6, z=±4..5 (1 cell proud).

export function buildTruck() {
  var group = new THREE.Group();
  group.name = 'truck';

  // ---- wheels first: they own their grid cells ----
  var claimed = new Set();
  var frontLeft = [], frontRight = [], rearLeft = [], rearRight = [];
  wheelCells(6, 2, 2, 4, 5, frontLeft, claimed);
  wheelCells(6, 2, 2, -5, -4, frontRight, claimed);
  wheelCells(-6, 2, 2, 4, 5, rearLeft, claimed);
  wheelCells(-6, 2, 2, -5, -4, rearRight, claimed);

  // ---- static body voxels ----

  var body = new Builder(claimed);

  // Main body slab (silver).
  body.box(-9, 9, 3, 5, -4, 4, COL.metal);

  // Dark rocker band along the bottom of the body (two-tone).
  body.box(-9, 9, 3, 3, -4, 4, COL.dark);

  // Fender flares: dark band above each tyre, outer faces only.
  body.box(4, 8, 5, 5, -4, -4, COL.dark);
  body.box(4, 8, 5, 5, 4, 4, COL.dark);
  body.box(-8, -4, 5, 5, -4, -4, COL.dark);
  body.box(-8, -4, 5, 5, 4, 4, COL.dark);

  // Bumpers (front + rear).
  body.box(10, 10, 2, 3, -4, 4, COL.chrome);
  body.box(-10, -10, 2, 3, -4, 4, COL.chrome);

  // Bed: dark floor (interior cells only — the outer skin stays body silver),
  // OPEN top, metal walls (sides / tailgate / front wall).
  body.box(-8, -2, 5, 5, -3, 3, COL.bed);     // floor
  body.box(-9, -1, 6, 7, -4, -4, COL.metal);   // left side
  body.box(-9, -1, 6, 7, 4, 4, COL.metal);     // right side
  body.box(-9, -9, 6, 7, -4, 4, COL.metal);    // tailgate
  body.box(-1, -1, 6, 7, -4, 4, COL.metal);    // bed front wall (behind cab)

  // Bed rails: dark caps along both sides and across the tailgate.
  body.box(-9, -1, 8, 8, -4, -4, COL.dark);    // left rail
  body.box(-9, -1, 8, 8, 4, 4, COL.dark);      // right rail
  body.box(-9, -9, 8, 8, -3, 3, COL.dark);     // rear rail

  // Cab: metal shell, 4 rows tall (roof y=9 sits above the bed rails).
  body.box(0, 4, 6, 9, -4, 4, COL.metal);
  body.box(4, 4, 6, 8, -3, 3, COL.glass);      // windshield (front face)
  body.box(1, 3, 7, 8, -4, -4, COL.glass);     // left side window
  body.box(1, 3, 7, 8, 4, 4, COL.glass);       // right side window
  body.box(0, 0, 7, 8, -3, 3, COL.glass);      // rear window

  // Side mirrors on the A-pillars.
  body.set(4, 7, -5, COL.dark);
  body.set(4, 7, 5, COL.dark);

  // Hood: beltline flush with the bed walls, one cell under the cab roof,
  // with a dark centre stripe down the crown (like the tractor's hood).
  body.box(5, 9, 6, 7, -4, 4, COL.metal);
  body.box(5, 9, 7, 7, 0, 0, COL.dark);

  // Front face: dark grille with a chrome bar, headlamp over indicator.
  body.box(9, 9, 3, 5, -3, 3, COL.grille);
  body.box(9, 9, 4, 4, -3, 3, COL.chrome);
  body.box(9, 9, 7, 7, -4, -3, COL.light);
  body.box(9, 9, 7, 7, 3, 4, COL.light);
  body.box(9, 9, 6, 6, -4, -3, COL.amber);
  body.box(9, 9, 6, 6, 3, 4, COL.amber);

  // Rear face: red lamp over an amber segment, tailgate handle between them.
  body.box(-9, -9, 6, 7, -4, -4, COL.tail);
  body.box(-9, -9, 6, 7, 4, 4, COL.tail);
  body.box(-9, -9, 5, 5, -4, -4, COL.amber);
  body.box(-9, -9, 5, 5, 4, 4, COL.amber);
  body.set(-9, 7, 0, COL.dark);

  group.add(body.build());

  // ---- wheel pivots ----

  var wheels = [];

  // Front axle steers (rotation.y); each wheel spins on its own pivot.
  var frontAxle = new THREE.Group();
  frontAxle.position.set(6, 2 + YSHIFT, 0);

  function addFrontWheel(side, cells) {
    var sideG = new THREE.Group();
    sideG.position.z = side * 4.5;
    var spin = new THREE.Group();
    spin.add(wheelMeshes(cells, 6, 2, side * 4.5));
    sideG.add(spin);
    frontAxle.add(sideG);
    wheels.push({ pivot: spin, radius: 2 });
  }
  addFrontWheel(1, frontLeft);
  addFrontWheel(-1, frontRight);
  group.add(frontAxle);

  function addRearWheel(side, cells) {
    var pivot = new THREE.Group();
    pivot.position.set(-6, 2 + YSHIFT, side * 4.5);
    pivot.add(wheelMeshes(cells, -6, 2, side * 4.5));
    group.add(pivot);
    wheels.push({ pivot: pivot, radius: 2 });
  }
  addRearWheel(1, rearLeft);
  addRearWheel(-1, rearRight);

  // ---- userData ----

  group.userData = {
    type: 'truck',
    width: 14,
    mount: 'rear',
    capacity: 10,
    steeringPivots: [frontAxle],
    wheels: wheels
  };

  return group;
}
