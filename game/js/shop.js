// game/js/shop.js — shop building geometry and shopkeeper NPC.
// ES module, Three.js (importmap 0.160.0). Uses the same Builder/InstancedMesh
// pattern as character.js / equipment.js.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
var COL = {
  wall: '#d4c4a0',
  roof: '#8b4513',
  porch: '#a08060',
  door: '#5c3a1e',
  sign: '#2f4d1f',
  counter: '#6b4a2e',
  window: '#87ceeb',
  trim: '#f5f0e0',
  chimney: '#7a5a3a'
};

var colorCache = new Map();
function col(hex) {
  var c = colorCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); }
  return c;
}

// ---------------------------------------------------------------- Builder
// Mirrors character.js / equipment.js: set(x,y,z,color) and box(x0,x1,y0,y1,z0,z1,color).
var BOX = new THREE.BoxGeometry(1, 1, 1);
var _dummy = new THREE.Object3D();

function buildVoxelModel(spec) {
  // spec: { parts: [{x,y,z,w,h,d,color}, ...] }
  var map = new Map();
  for (var pi = 0; pi < spec.parts.length; pi++) {
    var p = spec.parts[pi];
    for (var x = p.x; x < p.x + p.w; x++)
      for (var y = p.y; y < p.y + p.h; y++)
        for (var z = p.z; z < p.z + p.d; z++)
          map.set(x + ',' + y + ',' + z, p.color);
  }
  var group = new THREE.Group();
  var buckets = new Map();
  map.forEach(function (c, k) {
    if (!buckets.has(c)) buckets.set(c, []);
    var coords = k.split(',');
    buckets.get(c).push([Number(coords[0]), Number(coords[1]), Number(coords[2])]);
  });
  buckets.forEach(function (cells, color) {
    var mat = new THREE.MeshStandardMaterial({
      color: col(color),
      roughness: 0.8,
      metalness: 0.08
    });
    var mesh = new THREE.InstancedMesh(BOX, mat, cells.length);
    for (var i = 0; i < cells.length; i++) {
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

// ---------------------------------------------------------------- Shop model
// East-west building, centered at origin (caller positions it).
// Dimensions: 12 wide (x), 8 deep (z), 6 tall (y).
function buildShop() {
  var parts = [];

  // --- Walls (hollow box, 1 unit thick) ---
  // South wall (z = 0)
  parts.push({ x: 0, y: 0, z: 0, w: 12, h: 6, d: 1, color: COL.wall });
  // North wall (z = 7)
  parts.push({ x: 0, y: 0, z: 7, w: 12, h: 6, d: 1, color: COL.wall });
  // East wall (x = 11, z 1-6)
  parts.push({ x: 11, y: 0, z: 1, w: 1, h: 6, d: 6, color: COL.wall });
  // West wall (x = 0, z 1-6)
  parts.push({ x: 0, y: 0, z: 1, w: 1, h: 6, d: 6, color: COL.wall });

  // --- Door (south wall, centered) ---
  // Door frame: x 5-7, y 0-4, z 0 (door opening)
  // Door panels
  parts.push({ x: 5, y: 0, z: 0, w: 1, h: 4, d: 1, color: COL.door });
  parts.push({ x: 6, y: 0, z: 0, w: 1, h: 4, d: 1, color: COL.door });
  // Door header
  parts.push({ x: 5, y: 4, z: 0, w: 3, h: 1, d: 1, color: COL.door });

  // --- Windows (two on south wall, one on each side wall) ---
  // South windows
  parts.push({ x: 2, y: 3, z: 0, w: 2, h: 2, d: 1, color: COL.window });
  parts.push({ x: 9, y: 3, z: 0, w: 2, h: 2, d: 1, color: COL.window });
  // Side windows
  parts.push({ x: 0, y: 3, z: 3, w: 1, h: 2, d: 1, color: COL.window });
  parts.push({ x: 11, y: 3, z: 3, w: 1, h: 2, d: 1, color: COL.window });

  // --- Floor ---
  parts.push({ x: 1, y: 0, z: 1, w: 10, h: 1, d: 7, color: COL.porch });

  // --- Counter (inside, north wall) ---
  parts.push({ x: 3, y: 1.5, z: 6, w: 6, h: 1.5, d: 1, color: COL.counter });

  // --- Roof (shingled, overhanging) ---
  // Main roof: 14 wide, 10 deep, 1 thick, at y = 6
  parts.push({ x: -1, y: 6, z: -1, w: 14, h: 1, d: 10, color: COL.roof });
  // Roof ridge
  parts.push({ x: 5, y: 7, z: 0, w: 2, h: 1, d: 8, color: COL.roof });

  // --- Porch (south of door) ---
  parts.push({ x: 4, y: 0, z: -1, w: 4, h: 1, d: 2, color: COL.porch });

  // --- Sign (above door) ---
  parts.push({ x: 4, y: 5, z: 0, w: 4, h: 1, d: 1, color: COL.sign });

  // --- Chimney (north wall, east side) ---
  parts.push({ x: 10, y: 7, z: 5, w: 2, h: 3, d: 1, color: COL.chimney });

  // --- Trim (white trim around windows/door) ---
  parts.push({ x: 1, y: 2, z: 0, w: 1, h: 1, d: 1, color: COL.trim }); // left of door
  parts.push({ x: 7, y: 2, z: 0, w: 1, h: 1, d: 1, color: COL.trim }); // right of door
  parts.push({ x: 1, y: 5, z: 0, w: 1, h: 1, d: 1, color: COL.trim }); // above door
  parts.push({ x: 1, y: 2, z: 0, w: 1, h: 1, d: 1, color: COL.trim }); // below door

  return buildVoxelModel({ parts: parts });
}

// ---------------------------------------------------------------- Shopkeeper NPC
// A Character-like voxel human with apron and hat, standing behind the counter.
function buildShopkeeper() {
  var parts = [];
  var apron = '#2f6fb5';
  var hat = '#5c3a1e';
  var skin = '#f4c28a';
  var pants = '#33333a';
  var shirt = '#ffffff';

  // Head
  parts.push({ x: 0, y: 1.5, z: 0, w: 1, h: 1, d: 1, color: skin });
  // Hat (slightly wider)
  parts.push({ x: -1, y: 2.5, z: 0, w: 3, h: 1, d: 1, color: hat });
  parts.push({ x: 0, y: 3, z: 0, w: 1, h: 1, d: 1, color: hat });
  // Torso (white shirt + blue apron)
  parts.push({ x: 0, y: 0.75, z: 0, w: 1, h: 1.5, d: 0.6, color: shirt });
  parts.push({ x: 0, y: 0.25, z: 0.1, w: 1, h: 0.5, d: 0.6, color: apron });
  // Arms
  parts.push({ x: -0.7, y: 0.6, z: 0, w: 0.4, h: 1.2, d: 0.4, color: skin });
  parts.push({ x: 0.7, y: 0.6, z: 0, w: 0.4, h: 1.2, d: 0.4, color: skin });
  // Legs
  parts.push({ x: -0.25, y: -0.1, z: 0, w: 0.4, h: 1.2, d: 0.4, color: pants });
  parts.push({ x: 0.25, y: -0.1, z: 0, w: 0.4, h: 1.2, d: 0.4, color: pants });
  // Shoes
  parts.push({ x: -0.25, y: -0.65, z: 0.05, w: 0.4, h: 0.3, d: 0.5, color: '#1e1e22' });
  parts.push({ x: 0.25, y: -0.65, z: 0.05, w: 0.4, h: 0.3, d: 0.5, color: '#1e1e22' });

  var group = buildVoxelModel({ parts: parts });
  group.name = 'shopkeeper';
  return group;
}

// ---------------------------------------------------------------- Shop class
export class Shop {
  constructor(scene, centerX, centerZ) {
    this._centerX = centerX;
    this._centerZ = centerZ;
    this._group = new THREE.Group();
    this._group.name = 'shop';

    // Build the shop building
    var shopModel = buildShop();
    shopModel.position.set(centerX, 0, centerZ);
    this._group.add(shopModel);

    // Grain depot on the east side of the shop: a concrete delivery apron,
    // two corrugated silos and a bright roof cap make the wagon drop-off easy
    // to spot from the road.
    this._grainBinPosition = new THREE.Vector3(centerX + 22, 0, centerZ + 5);
    var depot = new THREE.Group();
    depot.name = 'grain-bin-depot';
    depot.position.copy(this._grainBinPosition);
    var apron = new THREE.Mesh(new THREE.BoxGeometry(17, 0.18, 15),
      new THREE.MeshStandardMaterial({ color: '#88877f', roughness: 0.95 }));
    apron.position.set(0, 0.02, 0);
    apron.receiveShadow = true;
    depot.add(apron);
    var siloMat = new THREE.MeshStandardMaterial({ color: '#c4c6bd', roughness: 0.68, metalness: 0.35 });
    var roofMat = new THREE.MeshStandardMaterial({ color: '#b67b32', roughness: 0.7, metalness: 0.2 });
    [-4.3, 4.3].forEach(function (x) {
      var silo = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 8.4, 12, 1), siloMat);
      silo.position.set(x, 4.3, -1.2);
      silo.castShadow = true; silo.receiveShadow = true; depot.add(silo);
      var cap = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.25, 12), roofMat);
      cap.position.set(x, 9.1, -1.2);
      cap.castShadow = true; depot.add(cap);
      var band = new THREE.Mesh(new THREE.TorusGeometry(2, 0.07, 5, 16), roofMat);
      band.rotation.x = Math.PI / 2; band.position.set(x, 3.2, -1.2); depot.add(band);
    });
    var signPost = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.2, 0.28),
      new THREE.MeshStandardMaterial({ color: '#65482c', roughness: 0.9 }));
    signPost.position.set(0, 1.2, 6);
    depot.add(signPost);
    var signCanvas = document.createElement('canvas');
    signCanvas.width = 512; signCanvas.height = 128;
    var signContext = signCanvas.getContext('2d');
    signContext.fillStyle = '#315a29'; signContext.fillRect(0, 0, 512, 128);
    signContext.strokeStyle = '#e3c16d'; signContext.lineWidth = 10; signContext.strokeRect(7, 7, 498, 114);
    signContext.fillStyle = '#fffbe8'; signContext.font = 'bold 46px system-ui, sans-serif';
    signContext.textAlign = 'center'; signContext.textBaseline = 'middle'; signContext.fillText('GRAIN DROP-OFF', 256, 64);
    var sign = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.45, 0.22),
      new THREE.MeshStandardMaterial({ color: '#315a29', roughness: 0.8 }));
    sign.position.set(0, 2.5, 6);
    sign.castShadow = true; depot.add(sign);
    var signFace = new THREE.Mesh(new THREE.PlaneGeometry(5.15, 1.15), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(signCanvas), side: THREE.DoubleSide
    }));
    signFace.position.set(0, 2.5, 6.12); depot.add(signFace);
    signFace.rotation.y = Math.PI; // face the road/store approach
    this._group.add(depot);

    // Build the shopkeeper (behind the counter, inside north wall)
    var shopkeeper = buildShopkeeper();
    shopkeeper.position.set(centerX + 6, 0, centerZ + 5);
    shopkeeper.rotation.y = Math.PI; // face south (toward door)
    this._group.add(shopkeeper);
    this._shopkeeper = shopkeeper;

    // Proximity trigger zone (invisible, for dialogue detection)
    this._triggerRadius = 4;

    scene.add(this._group);
  }

  getPosition() {
    return new THREE.Vector3(this._centerX, 0, this._centerZ);
  }

  getGrainBinPosition() { return this._grainBinPosition.clone(); }

  getTriggerRadius() {
    return this._triggerRadius;
  }

  // Check if player is within trigger zone
  isNear(playerX, playerZ) {
    // Door is centered on the south wall at local x=6,z=0. Trigger just
    // outside it, not at the building origin (which is behind the west wall).
    var dx = playerX - (this._centerX + 6);
    var dz = playerZ - (this._centerZ - 2);
    return (dx * dx + dz * dz) <= (this._triggerRadius * this._triggerRadius);
  }

  // Get the shopkeeper mesh for animation
  getShopkeeper() {
    return this._shopkeeper;
  }

  // Face the shopkeeper toward the player
  facePlayer(playerX, playerZ) {
    var dx = playerX - (this._centerX + 6);
    var dz = playerZ - (this._centerZ + 5);
    var targetAngle = Math.atan2(dx, dz);
    // Smooth rotation toward target
    var current = this._shopkeeper.rotation.y;
    var diff = targetAngle - current;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._shopkeeper.rotation.y += diff * 0.1;
  }

  dispose() {
    this._group.traverse(function (n) {
      if (n.material) {
        if (Array.isArray(n.material)) n.material.forEach(function (m) { m.dispose(); });
        else n.material.dispose();
      }
    });
  }
}
