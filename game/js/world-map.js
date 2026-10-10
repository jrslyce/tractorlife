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

  project(position, bounds, width, height, padding = 15) {
    return { x: padding + (position.x - bounds.minX) / (bounds.maxX - bounds.minX) * (width - 2 * padding),
      y: padding + (bounds.maxZ - position.z) / (bounds.maxZ - bounds.minZ) * (height - 2 * padding) };
  }

  pick(point, bounds, width, height, visibleIds, radius = 12) {
    const visible = new Set(visibleIds);
    const nearest = this.locations.filter(location => visible.has(location.id)).map(location => {
      const marker = this.project(location, bounds, width, height);
      return { location, distance: Math.hypot(marker.x - point.x, marker.y - point.y) };
    }).sort((a, b) => a.distance - b.distance)[0];
    return nearest && nearest.distance <= radius ? nearest.location.id : null;
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
