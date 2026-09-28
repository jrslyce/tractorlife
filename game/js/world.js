// game/js/world.js — multi-farm world management with distance culling.
// ES module, Three.js (importmap 0.160.0). Imports Farm from './farm.js'.
import * as THREE from 'three';
import { Farm, FARM_SPACING, NUM_FARMS } from './farm.js';

// ---------------------------------------------------------------- constants
var CULL_DISTANCE = 440; // past fog far (430) so culled farms are fogged out

// World extent along X: farm 0's west fence to the last farm's east fence.
export const WORLD_MIN_X = -10;
export const WORLD_MAX_X = (NUM_FARMS - 1) * FARM_SPACING + 160;

// Shop: south of the E-W road, in the middle of the map so every farm can
// reach it. (x, z) is the building's north-west corner; see shop.js.
export const SHOP_X = Math.round(((NUM_FARMS - 1) * FARM_SPACING + 150) / 2) - 6;
export const SHOP_Z = 55;

// ---------------------------------------------------------------- World class
export class World {
  constructor(scene, playerEmail) {
    this._farms = [];
    this._playerEmail = playerEmail || '';
    this._assignedSlot = -1;

    // Assign this player to a farm slot based on email hash
    this._assignFarmSlot();

    // Create all farms
    for (var i = 0; i < NUM_FARMS; i++) {
      var farm = new Farm(scene, i);
      this._farms.push(farm);
    }
  }

  // Assign player to a farm slot deterministically from email
  _assignFarmSlot() {
    this._assignedSlot = this.slotFromEmail(this._playerEmail);
  }

  // Deterministic slot from an email. This MUST stay equivalent to
  // assignFarmSlot() in worker.js (djb2-style: hash = hash*31 + c, folded to
  // int32 every step, then |hash| % NUM_FARMS) — otherwise a player's farm
  // changes whenever they cross between online and offline mode.
  // Empty email falls back to slot 0.
  slotFromEmail(email) {
    var e = email || '';
    if (!e || e.length === 0) return 0;
    var hash = 0;
    for (var i = 0; i < e.length; i++) {
      hash = ((hash << 5) - hash) + e.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash) % NUM_FARMS;
  }

  // Re-assign the player when a new email logs in
  setPlayerEmail(email) {
    this._playerEmail = email || '';
    this._assignFarmSlot();
  }

  // Force a specific slot (e.g. the one the server returned on login).
  // Invalid values are ignored so the slot can never fall out of range.
  setAssignedSlot(slot) {
    if (typeof slot !== 'number' || !isFinite(slot)) return;
    var s = Math.floor(slot);
    if (s < 0 || s >= NUM_FARMS) return;
    this._assignedSlot = s;
  }

  // Get the farm at a given world position
  getFarmAtPosition(x, z) {
    for (var i = 0; i < this._farms.length; i++) {
      if (this._farms[i].isInside(x, z)) {
        return this._farms[i].getFarmSlot();
      }
    }
    return -1;
  }

  // Check if position is on the player's own farm
  isOwnFarm(farmSlot) {
    return farmSlot === this._assignedSlot;
  }

  // Cull distant farms for performance. Distance is measured to the farm's
  // nearest edge (not its spawn point), and the threshold sits beyond the
  // fog's far distance so a culled farm is already invisible anyway.
  updateCulling(playerX, playerZ) {
    var cullSq = CULL_DISTANCE * CULL_DISTANCE;
    for (var i = 0; i < this._farms.length; i++) {
      var farm = this._farms[i];
      farm.setCulled(farm.distanceToSq(playerX, playerZ) >= cullSq);
    }
  }

  // Get all farms
  getFarms() {
    return this._farms;
  }

  // Get this player's assigned farm slot
  getAssignedSlot() {
    return this._assignedSlot;
  }

  // Serialize all farm states
  serialize() {
    var farms = [];
    for (var i = 0; i < this._farms.length; i++) {
      farms.push(this._farms[i].serialize());
    }
    return {
      v: 1,
      assignedSlot: this._assignedSlot,
      farms: farms
    };
  }

  // Restore all farm states
  restore(d) {
    if (!d || !d.farms || !Array.isArray(d.farms)) return false;
    if (typeof d.assignedSlot === 'number' && isFinite(d.assignedSlot)) {
      this._assignedSlot = Math.max(0, Math.min(NUM_FARMS - 1, d.assignedSlot));
    }
    for (var i = 0; i < this._farms.length && i < d.farms.length; i++) {
      this._farms[i].restore(d.farms[i]);
    }
    return true;
  }
}
