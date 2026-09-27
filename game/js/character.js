// game/js/character.js — voxel human character for Tractor Farm.
// Parts are built around an inner _body group whose origin sits 0.8 above the
// ground (the shoes reach down to y = -0.8), so group.position.y = 0 puts the
// shoes exactly on the ground plane.
// Uses the same InstancedMesh bucketing pattern as equipment.js / tractor.js.
import * as THREE from 'three';

const COL = {
  skin: '#f4c28a',
  shirt: '#2f6fb5',
  pants: '#33333a',
  shoes: '#1e1e22'
};

const WALK_SPEED = 3.5; // radians per second for limb swing
const IDLE_SPEED = 1.2; // radians per second for idle sway / breath

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

// ---------------------------------------------------------------- Builder
// Mirrors equipment.js Builder: set(x,y,z,color) and box(x0,x1,y0,y1,z0,z1,color).
class Builder {
  constructor() {
    this.map = new Map();
  }
  set(x, y, z, c) {
    this.map.set(x + ',' + y + ',' + z, c);
  }
  box(x0, x1, y0, y1, z0, z1, c) {
    for (var x = x0; x <= x1; x++)
      for (var y = y0; y <= y1; y++)
        for (var z = z0; z <= z1; z++)
          this.set(x, y, z, c);
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
      var mat = new THREE.MeshStandardMaterial({
        color: color,
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
}

// ---------------------------------------------------------------- helpers
// Create a sub-group with a single voxel, positioned and scaled.
// For non-integer dimensions we place one voxel at (0,0,0) and
// apply scale so the mesh spans the desired world-space box.
function makePart(w, h, d, x, y, z, color) {
  var b = new Builder();
  b.set(0, 0, 0, color);
  var g = b.build();
  g.position.set(x, y, z);
  g.scale.set(w, h, d);
  return g;
}

// ---------------------------------------------------------------- Character class
export class Character {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'character';
    this._walking = false;
    this._jumping = false;
    this._time = 0;

    // Inner body group: parts are authored around y = 0 with the shoes reaching
    // down to y = -0.8, so lift the whole body 0.8 to rest the shoes on y = 0.
    this._body = new THREE.Group();
    this._body.position.y = 0.8;
    this.group.add(this._body);

    // ---- Head (skin) ----
    var head = makePart(1, 1, 1, 0, 1.5, 0, COL.skin);
    this._body.add(head);

    // ---- Torso (shirt) ----
    var torso = makePart(1, 1.5, 0.6, 0, 0.75, 0, COL.shirt);
    this._torso = torso;
    this._body.add(torso);

    // ---- Left arm (skin) ----
    var leftArm = makePart(0.4, 1.2, 0.4, -0.7, 0.6, 0, COL.skin);
    this._leftArm = leftArm;
    this._body.add(leftArm);

    // ---- Right arm (skin) ----
    var rightArm = makePart(0.4, 1.2, 0.4, 0.7, 0.6, 0, COL.skin);
    this._rightArm = rightArm;
    this._body.add(rightArm);

    // ---- Left leg (pants) ----
    var leftLeg = makePart(0.4, 1.2, 0.4, -0.25, -0.1, 0, COL.pants);
    this._leftLeg = leftLeg;
    this._body.add(leftLeg);

    // ---- Right leg (pants) ----
    var rightLeg = makePart(0.4, 1.2, 0.4, 0.25, -0.1, 0, COL.pants);
    this._rightLeg = rightLeg;
    this._body.add(rightLeg);

    // ---- Left shoe (tire) ----
    var leftShoe = makePart(0.4, 0.3, 0.5, -0.25, -0.65, 0.05, COL.shoes);
    this._leftShoe = leftShoe;
    this._body.add(leftShoe);

    // ---- Right shoe (tire) ----
    var rightShoe = makePart(0.4, 0.3, 0.5, 0.25, -0.65, 0.05, COL.shoes);
    this._rightShoe = rightShoe;
    this._body.add(rightShoe);
  }

  // ---- Public API ----

  getPosition() {
    return this.group.position;
  }

  getRotation() {
    return this.group.rotation.y;
  }

  setRotation(y) {
    this.group.rotation.y = y;
  }

  setWalking(walking) {
    this._walking = walking;
  }

  setJumping(jumping) {
    this._jumping = jumping;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  // ---- Animation update (called each frame) ----
  update(dt) {
    this._time += dt;
    var t = this._time;

    // ---- Idle animation ----
    if (!this._walking && !this._jumping) {
      // Arms sway slightly
      this._leftArm.rotation.z = Math.sin(t * IDLE_SPEED) * 0.1;
      this._rightArm.rotation.z = -Math.sin(t * IDLE_SPEED) * 0.1;
      // Torso breathes
      this._torso.scale.y = 0.98 + 0.02 * Math.sin(t * IDLE_SPEED * 0.5);
      // Legs and shoes stay neutral
      this._leftLeg.rotation.z = 0;
      this._rightLeg.rotation.z = 0;
      this._leftShoe.rotation.z = 0;
      this._rightShoe.rotation.z = 0;
      return;
    }

    // ---- Walk animation ----
    if (this._walking) {
      var angle = t * WALK_SPEED;
      var legAngle = Math.sin(angle) * 0.5;
      var armAngle = -Math.sin(angle) * 0.5; // opposite to legs

      this._leftLeg.rotation.z = legAngle;
      this._rightLeg.rotation.z = -legAngle;
      this._leftShoe.rotation.z = legAngle;
      this._rightShoe.rotation.z = -legAngle;

      this._leftArm.rotation.z = armAngle;
      this._rightArm.rotation.z = -armAngle;

      // Subtle body bob
      this._torso.position.y = 0.75 + Math.abs(Math.sin(angle)) * 0.03;
      return;
    }

    // ---- Jump animation ----
    if (this._jumping) {
      // Legs tuck slightly
      this._leftLeg.rotation.z = -0.3;
      this._rightLeg.rotation.z = -0.3;
      this._leftShoe.rotation.z = -0.3;
      this._rightShoe.rotation.z = -0.3;
      // Arms raise slightly
      this._leftArm.rotation.z = -0.2;
      this._rightArm.rotation.z = 0.2;
      return;
    }
  }
}
