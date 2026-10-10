// Persistent player-selected destination over deterministic exploration sites.
const finite = value => typeof value === 'number' && Number.isFinite(value);

export class WorldMap {
  constructor(locations = []) {
    this.locations = locations.filter(location => location && typeof location.id === 'string' &&
      finite(location.x) && finite(location.z)).map(location => ({ id: location.id, name: String(location.name || location.id),
      type: String(location.type || 'landmark'), x: location.x, z: location.z }));
    this.waypointId = null;
  }

  setWaypoint(id) {
    if (id === null) { this.waypointId = null; return true; }
    if (!this.locations.some(location => location.id === id)) return false;
    this.waypointId = id;
    return true;
  }

  getWaypoint() {
    const location = this.locations.find(item => item.id === this.waypointId);
    return location ? { ...location } : null;
  }

  route(position) {
    const waypoint = this.getWaypoint();
    if (!waypoint || !position || !finite(position.x) || !finite(position.z)) return null;
    const dx = waypoint.x - position.x, dz = waypoint.z - position.z;
    return { ...waypoint, distance: Math.hypot(dx, dz), bearing: Math.atan2(dx, dz) };
  }

  serialize() { return { version: 1, waypointId: this.waypointId }; }

  restore(data) {
    if (!data || data.version !== 1 ||
        (data.waypointId !== null && typeof data.waypointId !== 'string')) return false;
    if (data.waypointId !== null && !this.locations.some(location => location.id === data.waypointId)) return false;
    this.waypointId = data.waypointId;
    return true;
  }
}
