/** Character collision against Terrain's unit voxel cells. Position.y is the feet height. */
const EPSILON = 1e-9;

function solid(terrain, x, y, z) {
  return terrain.isSolid ? terrain.isSolid(x, y, z) : terrain.getCell(x, y, z) !== null;
}

function overlapsXZ(terrain, x, z, halfWidth, y0, y1) {
  const minX = Math.ceil(x - halfWidth - 0.5 - EPSILON);
  const maxX = Math.floor(x + halfWidth + 0.5 + EPSILON);
  const minZ = Math.ceil(z - halfWidth - 0.5 - EPSILON);
  const maxZ = Math.floor(z + halfWidth + 0.5 + EPSILON);
  const minY = Math.floor(y0 + EPSILON);
  const maxY = Math.ceil(y1 - EPSILON) - 1;
  for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cy = minY; cy <= maxY; cy++) if (solid(terrain, cx, cy, cz)) return true;
  }
  return false;
}

function supported(terrain, x, feetY, z, halfWidth) {
  const cellY = Math.ceil(feetY - 1 - EPSILON);
  if (Math.abs(feetY - (cellY + 1)) > 1e-7) return false;
  const minX = Math.ceil(x - halfWidth - 0.5 - EPSILON), maxX = Math.floor(x + halfWidth + 0.5 + EPSILON);
  const minZ = Math.ceil(z - halfWidth - 0.5 - EPSILON), maxZ = Math.floor(z + halfWidth + 0.5 + EPSILON);
  for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) if (solid(terrain, cx, cellY, cz)) return true;
  return false;
}

/**
 * Advance an axis-aligned character AABB. `deltaTime` is seconds; velocity is units/second.
 * Horizontal extents use a square `halfWidth`, and vertical extent is `height` above feet.
 * Returns fresh position/velocity objects and collision flags; does not mutate inputs/terrain.
 */
export function moveCharacter({ terrain, position, velocity, deltaTime, halfWidth = 0.3, height = 1.8 }) {
  if (!terrain || typeof terrain.getCell !== 'function' || !position || !velocity ||
      ![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z, deltaTime, halfWidth, height].every(Number.isFinite) ||
      deltaTime < 0 || halfWidth < 0 || height <= 0) throw new TypeError('Invalid character movement input');

  const p = { x: position.x, y: position.y, z: position.z };
  const v = { x: velocity.x, y: velocity.y, z: velocity.z };
  const collisions = { x: false, y: false, z: false };

  for (const axis of ['x', 'z']) {
    const target = p[axis] + v[axis] * deltaTime;
    if (target !== p[axis]) {
      // Sweep in small increments to prevent tunneling, then refine the first hit.
      const steps = Math.max(1, Math.ceil(Math.abs(target - p[axis]) / 0.25));
      let clear = 0, blocked = null;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const x = axis === 'x' ? p.x + (target - p.x) * t : p.x;
        const z = axis === 'z' ? p.z + (target - p.z) * t : p.z;
        if (overlapsXZ(terrain, x, z, halfWidth, p.y + EPSILON, p.y + height - EPSILON)) { blocked = t; break; }
        clear = t;
      }
      if (blocked !== null) {
      for (let i = 0; i < 40; i++) {
        const t = (clear + blocked) / 2;
        const x = axis === 'x' ? p.x + (target - p.x) * t : p.x;
        const z = axis === 'z' ? p.z + (target - p.z) * t : p.z;
        if (overlapsXZ(terrain, x, z, halfWidth, p.y + EPSILON, p.y + height - EPSILON)) blocked = t;
        else clear = t;
      }
      p[axis] += (target - p[axis]) * clear;
      v[axis] = 0;
      collisions[axis] = true;
      } else p[axis] = target;
    }
  }

  const targetY = p.y + v.y * deltaTime;
  if (targetY < p.y) {
    // Find the highest solid top crossed by the feet while descending.
    let landing = null;
    const low = Math.floor(targetY - 1), high = Math.floor(p.y + EPSILON);
    for (let cy = low; cy <= high; cy++) {
      if (Math.abs(p.y - (cy + 1)) <= EPSILON || targetY <= cy + 1 + EPSILON) {
        const minX = Math.ceil(p.x - halfWidth - 0.5 - EPSILON), maxX = Math.floor(p.x + halfWidth + 0.5 + EPSILON);
        const minZ = Math.ceil(p.z - halfWidth - 0.5 - EPSILON), maxZ = Math.floor(p.z + halfWidth + 0.5 + EPSILON);
        let hit = false;
        for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) if (solid(terrain, cx, cy, cz)) hit = true;
        if (hit && cy + 1 <= p.y + EPSILON && cy + 1 >= targetY - EPSILON) landing = Math.max(landing ?? -Infinity, cy + 1);
      }
    }
    if (landing !== null) { p.y = landing; v.y = 0; collisions.y = true; }
    else p.y = targetY;
  } else if (targetY > p.y) {
    // Find the first voxel underside crossed by the character's head.
    let ceiling = Infinity;
    const minX = Math.ceil(p.x - halfWidth - 0.5 - EPSILON), maxX = Math.floor(p.x + halfWidth + 0.5 + EPSILON);
    const minZ = Math.ceil(p.z - halfWidth - 0.5 - EPSILON), maxZ = Math.floor(p.z + halfWidth + 0.5 + EPSILON);
    const y0 = Math.floor(p.y + height), y1 = Math.floor(targetY + height);
    for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cy = y0; cy <= y1; cy++) if (solid(terrain, cx, cy, cz) && cy >= p.y + height - EPSILON && cy < ceiling) ceiling = cy;
    }
    if (Number.isFinite(ceiling)) {
      p.y = Math.min(targetY, ceiling - height);
      v.y = 0; collisions.y = true;
    } else p.y = targetY;
  }

  const onGround = v.y === 0 && (collisions.y || supported(terrain, p.x, p.y, p.z, halfWidth));
  return { position: p, velocity: v, onGround, collisions };
}

export const moveTerrainCharacter = moveCharacter;
