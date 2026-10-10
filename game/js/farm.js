// game/js/farm.js — multi-farm layout generator with fences, house/barn pads.
// ES module, Three.js (importmap 0.160.0). Imports Field from './field.js'.
import * as THREE from 'three';
import { Field } from './field.js';
import { EXPANSION_COST, EXPANSION_DEF, expansionCenter } from './farm-expansion.js';

// ---------------------------------------------------------------- constants
// Farms sit FARM_SPACING apart along X. Each one is the west pad strip, the
// four fields, then an empty YARD_WIDTH strip on the east side for building.
export const FARM_SPACING = 180;
export const NUM_FARMS = 10;
const YARD_WIDTH = 44; // east build yard (local x 105.5..149.5)
const FIELD_ORIGIN_X = 8;
const FIELD_ORIGIN_Z = -54;
const FIELD_COLS = 44;
const FIELD_ROWS = 36;
const FIELD_TILE = 1;
const FENCE_POST_SPACING = 4;
const FENCE_HEIGHT = 3;
const FENCE_POST_WIDTH = 0.3;
const FENCE_RAIL_HEIGHT = 0.2;
const HOUSE_PAD_SIZE = 10;
const BARN_PAD_SIZE = 12;
// The fence runs WEST_MARGIN units west of the field origin, so the west
// strip is wide enough for BOTH pads (house 10x10, barn 12x12) stacked
// north-to-south, clear of the fields (tiles start at x 7.5) and of each
// other. Local pad corners (relative to the farm slot origin):
const WEST_MARGIN = 14;       // west fence at local x -6
const HOUSE_PAD_LOCAL_X = -4; // spans x -4..6
const HOUSE_PAD_LOCAL_Z = -46; // spans z -46..-36
const BARN_PAD_LOCAL_X = -6;  // spans x -6..6
const BARN_PAD_LOCAL_Z = -34; // spans z -34..-22

const FIELD_DEFS = [
  { originX: 8,  originZ: -54, cols: 44, rows: 36, tile: 1 }, // north-west
  { originX: 62, originZ: -54, cols: 44, rows: 36, tile: 1 }, // north-east
  { originX: 8,  originZ: -8,  cols: 44, rows: 36, tile: 1 }, // south-west
  { originX: 62, originZ: -8,  cols: 44, rows: 36, tile: 1 }, // south-east
];
// ---------------------------------------------------------------- helpers
var colorCache = new Map();
function col(hex) {
  var c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

// ---------------------------------------------------------------- Farm class
export class Farm {
  constructor(scene, farmSlot) {
    this._farmSlot = farmSlot;
    this._offsetX = farmSlot * FARM_SPACING;
    this._offsetZ = 0;

    // field boundaries (world-space): union of the four field rects, extended
    // west to the pad margin and east by the build yard, so the whole fenced
    // farm (pads + fields + yard) counts as "inside" for ownership checks.
    // Roads are the gap between one farm's east fence (offset + 149.5) and
    // the next farm's west fence (offset + 174) — ~24 units of tarmac.
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    for (var di = 0; di < FIELD_DEFS.length; di++) {
      var bdef = FIELD_DEFS[di];
      var fx0 = this._offsetX + bdef.originX - FIELD_TILE / 2;
      var fx1 = fx0 + bdef.cols * FIELD_TILE;
      var fz0 = this._offsetZ + bdef.originZ - FIELD_TILE / 2;
      var fz1 = fz0 + bdef.rows * FIELD_TILE;
      if (fx0 < minX) minX = fx0;
      if (fx1 > maxX) maxX = fx1;
      if (fz0 < minZ) minZ = fz0;
      if (fz1 > maxZ) maxZ = fz1;
    }
    // widen the union west so the fence encloses both pads (x -6..6 local)
    var westMarginX = this._offsetX + FIELD_ORIGIN_X - WEST_MARGIN;
    if (westMarginX < minX) minX = westMarginX;
    this._yardMinX = maxX;
    maxX += YARD_WIDTH;
    this._minX = minX;
    this._maxX = maxX;
    this._minZ = minZ;
    this._maxZ = maxZ;

    // every scene mesh this farm owns (fields, fence, pads) for culling
    this._cullables = [];
    this._culled = false;
    this._terrainCutoutMeshes = [];
    this._yardMesh = null;
    this._yardMaterial = null;

    // both pads live in the west margin strip, stacked north-to-south and
    // clear of the north-west field (tiles start at local x 7.5)
    this._housePadX = this._offsetX + HOUSE_PAD_LOCAL_X;
    this._housePadZ = HOUSE_PAD_LOCAL_Z;
    this._barnPadX = this._offsetX + BARN_PAD_LOCAL_X;
    this._barnPadZ = BARN_PAD_LOCAL_Z;

    // spawn point: on the road area (south of fields, between farms)
    this._spawnPoint = new THREE.Vector3(
      this._offsetX + FIELD_ORIGIN_X + FIELD_COLS * FIELD_TILE / 2,
      0,
      FIELD_ORIGIN_Z + FIELD_ROWS * FIELD_TILE + 6
    );

    // --- fields ---
    this._fields = [];
    this._expansionField = null;
    for (var fi = 0; fi < FIELD_DEFS.length; fi++) {
      var def = FIELD_DEFS[fi];
      var fd = {
        originX: def.originX + this._offsetX,
        originZ: def.originZ + this._offsetZ,
        cols: def.cols,
        rows: def.rows,
        tile: def.tile
      };
      this._fields.push(new Field(scene, fd));
    }
    this._scene = scene;

    // --- fence (InstancedMesh for posts + rails) ---
    this._buildFence(scene);

    // --- house / barn pads (flat ground markers) ---
    this._buildPads(scene);
    this._buildExpansionMarker(scene);
  }

  _buildExpansionMarker(scene) {
    const def = EXPANSION_DEF;
    const group = new THREE.Group();
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(def.cols, 0.04, def.rows)),
      new THREE.LineBasicMaterial({ color: '#d7ed86', transparent: true, opacity: 0.9 })
    );
    frame.position.y = 0.15;
    group.add(frame);
    group.position.set(this._offsetX + def.originX + (def.cols - 1) / 2, 0, def.originZ + (def.rows - 1) / 2);
    group.visible = !this._culled;
    scene.add(group);
    this._expansionMarker = group;
    this._cullables.push(group);
  }

  // ---------- fence ----------
  _buildFence(scene) {
    var minX = this._minX;
    var maxX = this._maxX;
    var minZ = this._minZ;
    var maxZ = this._maxZ;
    var postW = FENCE_POST_WIDTH;
    var postH = FENCE_HEIGHT;
    var railH = FENCE_RAIL_HEIGHT;
    var spacing = FENCE_POST_SPACING;

    // Collect post positions along all 4 edges
    var postPositions = [];
    var railData = []; // { x, z, length, axis }

    // Helper: collect positions along one axis
    function collectAlong(axis, start, end, fixed) {
      var p = start;
      while (p <= end + 0.001) {
        if (axis === 'x') {
          postPositions.push([p, 0, fixed]);
        } else {
          postPositions.push([fixed, 0, p]);
        }
        p += spacing;
      }
    }

    // Bottom edge (z = minZ)
    collectAlong('x', minX, maxX, minZ);
    // Top edge (z = maxZ)
    collectAlong('x', minX, maxX, maxZ);
    // Left edge (x = minX)
    collectAlong('z', minZ, maxZ, minX);
    // Right edge (x = maxX)
    collectAlong('z', minZ, maxZ, maxX);

    // Deduplicate corner posts (they appear in two edges)
    var postSet = new Set();
    var uniquePosts = [];
    for (var pi = 0; pi < postPositions.length; pi++) {
      var pp = postPositions[pi];
      var key = pp[0].toFixed(4) + ',' + pp[2].toFixed(4);
      if (!postSet.has(key)) {
        postSet.add(key);
        uniquePosts.push(pp);
      }
    }

    // Build post InstancedMesh
    var postGeo = new THREE.BoxGeometry(postW, postH, postW);
    var postMat = new THREE.MeshStandardMaterial({
      color: '#8a7a5a',
      roughness: 0.9,
      metalness: 0
    });
    var postMesh = new THREE.InstancedMesh(postGeo, postMat, uniquePosts.length);
    var dummy = new THREE.Object3D();
    for (var pi2 = 0; pi2 < uniquePosts.length; pi2++) {
      var pos = uniquePosts[pi2];
      dummy.position.set(pos[0], postH / 2, pos[2]);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      postMesh.setMatrixAt(pi2, dummy.matrix);
    }
    postMesh.instanceMatrix.needsUpdate = true;
    postMesh.castShadow = true;
    postMesh.receiveShadow = true;
    postMesh.frustumCulled = false;
    scene.add(postMesh);
    this._cullables.push(postMesh);

    // Build rails: top and middle horizontal bars along each edge
    var railGeo = new THREE.BoxGeometry(1, railH, railH);
    var railMat = new THREE.MeshStandardMaterial({
      color: '#8a7a5a',
      roughness: 0.9,
      metalness: 0
    });

    // Collect rail segments
    var railSegments = [];

    // Bottom edge (z = minZ): top rail
    railSegments.push({ x: minX, z: minZ, length: maxX - minX, axis: 'x', y: postH - railH / 2 });
    // Bottom edge (z = minZ): middle rail
    railSegments.push({ x: minX, z: minZ, length: maxX - minX, axis: 'x', y: postH / 2 });
    // Top edge (z = maxZ): top rail
    railSegments.push({ x: minX, z: maxZ, length: maxX - minX, axis: 'x', y: postH - railH / 2 });
    // Top edge (z = maxZ): middle rail
    railSegments.push({ x: minX, z: maxZ, length: maxX - minX, axis: 'x', y: postH / 2 });
    // Left edge (x = minX): top rail
    railSegments.push({ x: minX, z: minZ, length: maxZ - minZ, axis: 'z', y: postH - railH / 2 });
    // Left edge (x = minX): middle rail
    railSegments.push({ x: minX, z: minZ, length: maxZ - minZ, axis: 'z', y: postH / 2 });
    // Right edge (x = maxX): top rail
    railSegments.push({ x: maxX, z: minZ, length: maxZ - minZ, axis: 'z', y: postH - railH / 2 });
    // Right edge (x = maxX): middle rail
    railSegments.push({ x: maxX, z: minZ, length: maxZ - minZ, axis: 'z', y: postH / 2 });

    // Build rail InstancedMesh
    var railMesh = new THREE.InstancedMesh(railGeo, railMat, railSegments.length);
    for (var ri = 0; ri < railSegments.length; ri++) {
      var seg = railSegments[ri];
      if (seg.axis === 'x') {
        dummy.position.set(seg.x + seg.length / 2, seg.y, seg.z);
        dummy.scale.set(seg.length, 1, 1);
      } else {
        dummy.position.set(seg.x, seg.y, seg.z + seg.length / 2);
        dummy.scale.set(1, 1, seg.length);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      railMesh.setMatrixAt(ri, dummy.matrix);
    }
    railMesh.instanceMatrix.needsUpdate = true;
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    railMesh.frustumCulled = false;
    scene.add(railMesh);
    this._cullables.push(railMesh);
  }

  // ---------- pads ----------
  _buildPads(scene) {
    var padGeo = new THREE.BoxGeometry(1, 0.05, 1);
    var padMat = new THREE.MeshStandardMaterial({
      color: '#9a8a6a',
      roughness: 1,
      metalness: 0
    });

    // House pad
    var houseMesh = new THREE.Mesh(padGeo, padMat);
    houseMesh.position.set(
      this._housePadX + HOUSE_PAD_SIZE / 2,
      0.025,
      this._housePadZ + HOUSE_PAD_SIZE / 2
    );
    houseMesh.scale.set(HOUSE_PAD_SIZE, 1, HOUSE_PAD_SIZE);
    houseMesh.receiveShadow = true;
    scene.add(houseMesh);

    // Barn pad
    var barnMesh = new THREE.Mesh(padGeo, padMat);
    barnMesh.position.set(
      this._barnPadX + BARN_PAD_SIZE / 2,
      0.025,
      this._barnPadZ + BARN_PAD_SIZE / 2
    );
    barnMesh.scale.set(BARN_PAD_SIZE, 1, BARN_PAD_SIZE);
    barnMesh.receiveShadow = true;
    scene.add(barnMesh);

    this._cullables.push(houseMesh);
    this._cullables.push(barnMesh);

    // Build yard: packed-dirt strip east of the fields, kept empty so
    // players have room for barns, fences and decorations.
    var yardMaterial = new THREE.MeshStandardMaterial({
      color: '#a8b872', roughness: 1, metalness: 0
    });
    var yardMesh = new THREE.Mesh(padGeo, yardMaterial);
    var yardW = this._maxX - this._yardMinX;
    var yardD = this._maxZ - this._minZ;
    yardMesh.position.set(this._yardMinX + yardW / 2, 0.02, this._minZ + yardD / 2);
    yardMesh.scale.set(yardW - 1, 0.8, yardD - 1);
    yardMesh.receiveShadow = true;
    scene.add(yardMesh);
    this._cullables.push(yardMesh);
    this._yardMesh = yardMesh;
    this._yardMaterial = yardMaterial;
  }

  // Cut the active voxel patch out of the packed yard ground so the global
  // ground plane cannot visually seal excavations. Surrounding yard remains.
  setTerrainCutout(bounds) {
    const scene = this._yardMesh && this._yardMesh.parent;
    for (const mesh of this._terrainCutoutMeshes) {
      if (scene) scene.remove(mesh);
      const index = this._cullables.indexOf(mesh);
      if (index >= 0) this._cullables.splice(index, 1);
      mesh.geometry.dispose();
    }
    this._terrainCutoutMeshes = [];
    this._terrainCutout = !!bounds;
    if (!this._yardMesh) return;
    this._yardMesh.visible = !this._culled && !bounds;
    if (!bounds || !scene) return;

    const center = this._yardMesh.position;
    const width = this._yardMesh.scale.x, depth = this._yardMesh.scale.z;
    const x0 = center.x - width / 2, x1 = center.x + width / 2;
    const z0 = center.z - depth / 2, z1 = center.z + depth / 2;
    const hx0 = Math.max(x0, bounds.minX), hx1 = Math.min(x1, bounds.maxX);
    const hz0 = Math.max(z0, bounds.minZ), hz1 = Math.min(z1, bounds.maxZ);
    if (hx0 >= hx1 || hz0 >= hz1) return;
    const slabs = [
      [x0, z0, hx0 - x0, depth], [hx1, z0, x1 - hx1, depth],
      [hx0, z0, hx1 - hx0, hz0 - z0], [hx0, hz1, hx1 - hx0, z1 - hz1]
    ].filter(([, , w, d]) => w > 0.001 && d > 0.001);
    for (const [sx, sz, w, d] of slabs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), this._yardMaterial);
      mesh.position.set(sx + w / 2, 0.02, sz + d / 2);
      mesh.receiveShadow = true;
      scene.add(mesh);
      this._terrainCutoutMeshes.push(mesh);
      this._cullables.push(mesh);
    }
  }

  // ---------- culling ----------
  // Hide/show every mesh this farm owns (fields, fence, pads).
  setCulled(culled) {
    if (this._culled === culled) return;
    this._culled = culled;
    var visible = !culled;
    for (var i = 0; i < this._cullables.length; i++) {
      if (this._cullables[i] === this._yardMesh) this._cullables[i].visible = visible && !this._terrainCutout;
      else if (this._cullables[i] === this._expansionMarker) this._cullables[i].visible = visible && !this._expansionField;
      else this._cullables[i].visible = visible;
    }
    for (var f = 0; f < this._fields.length; f++) {
      this._fields[f]._tileMesh.visible = visible;
      this._fields[f]._cropMesh.visible = visible;
      this._fields[f]._underMesh.visible = visible;
    }
  }

  // ---------- queries ----------
  isInside(x, z) {
    return x >= this._minX && x <= this._maxX && z >= this._minZ && z <= this._maxZ;
  }

  // Squared distance from (x, z) to the farm's axis-aligned bounds
  // (_minX.._maxX, _minZ.._maxZ); 0 when the point is inside. Used for
  // culling so a farm is judged by its nearest edge, not its spawn point.
  distanceToSq(x, z) {
    var dx = 0;
    if (x < this._minX) dx = this._minX - x;
    else if (x > this._maxX) dx = x - this._maxX;
    var dz = 0;
    if (z < this._minZ) dz = this._minZ - z;
    else if (z > this._maxZ) dz = z - this._maxZ;
    return dx * dx + dz * dz;
  }

  getFarmSlot() {
    return this._farmSlot;
  }

  getSpawnPoint() {
    return this._spawnPoint;
  }

  getFields() {
    return this._fields;
  }

  getExpansionCost() { return EXPANSION_COST; }

  getExpansionCenter() {
    return expansionCenter(this._farmSlot);
  }

  expand() {
    if (this._expansionField) return false;
    const def = EXPANSION_DEF;
    this._expansionField = new Field(this._scene, {
      originX: def.originX + this._offsetX, originZ: def.originZ,
      cols: def.cols, rows: def.rows, tile: def.tile
    });
    this._fields.push(this._expansionField);
    if (this._expansionMarker) this._expansionMarker.visible = false;
    for (const mesh of [this._expansionField._tileMesh, this._expansionField._cropMesh, this._expansionField._underMesh]) {
      mesh.visible = !this._culled;
      this._cullables.push(mesh);
    }
    return true;
  }

  // ---------- persistence ----------
  serialize() {
    var fd = [];
    for (var i = 0; i < this._fields.length; i++) {
      fd.push(this._fields[i].serialize());
    }
    return {
      farmSlot: this._farmSlot,
      fields: fd,
      expansion: !!this._expansionField
    };
  }

  restore(d) {
    if (!d || !d.fields || !Array.isArray(d.fields)) return false;
    // Expansion is accepted only as its exact known, local plot. Never trust
    // serialized geometry, which could widen ownership into a neighbour.
    if (d.expansion === true && this._fields.length === FIELD_DEFS.length) this.expand();
    for (var i = 0; i < this._fields.length && i < d.fields.length; i++) {
      this._fields[i].restore(d.fields[i]);
    }
    return true;
  }

  getStats() {
    var t = { tilled: 0, planted: 0, sprayed: 0, harvested: 0, weeds: 0, bugs: 0, fertility: 0 };
    for (var i = 0; i < this._fields.length; i++) {
      var s = this._fields[i].stats;
      t.tilled += s.tilled;
      t.planted += s.planted;
      t.sprayed += s.sprayed;
      t.harvested += s.harvested;
      t.weeds += s.weeds;
      t.bugs += s.bugs;
      t.fertility += s.fertility;
    }
    t.fertility = Math.round(t.fertility / Math.max(1, this._fields.length));
    return t;
  }
}
