// Chunked, exposed-face presentation for the bounded voxel terrain.
// No Three.js import is intentional: pass the application's THREE namespace.
//
// State adapter contract: getCell(x,y,z) returns null/false/"air" for empty,
// or a material id / { material, solid? } for a solid cell. isSolid is preferred
// when supplied. Coordinates are absolute integer grid coordinates, with
// the bounded volume beginning at originX/originZ. Cells occupy [x-.5,x+.5] and
// [y,y+1]. Optional getChunkKeys() returns "cx,cz" keys; optional
// getChangedChunkKeys() returns and clears those keys (or may be non-clearing).

const FACES = [
  { n: [1, 0, 0], v: [[.5, 0, -.5], [.5, 1, -.5], [.5, 1, .5], [.5, 0, .5]] },
  { n: [-1, 0, 0], v: [[-.5, 0, .5], [-.5, 1, .5], [-.5, 1, -.5], [-.5, 0, -.5]] },
  { n: [0, 1, 0], v: [[-.5, 1, -.5], [-.5, 1, .5], [.5, 1, .5], [.5, 1, -.5]] },
  { n: [0, -1, 0], v: [[-.5, 0, .5], [-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5]] },
  { n: [0, 0, 1], v: [[.5, 0, .5], [.5, 1, .5], [-.5, 1, .5], [-.5, 0, .5]] },
  { n: [0, 0, -1], v: [[-.5, 0, -.5], [-.5, 1, -.5], [.5, 1, -.5], [.5, 0, -.5]] },
];
const AIR = new Set([null, undefined, false, '', 'air']);
const DEFAULT_COLORS = { dirt: 0x806044, grass: 0x668b43, stone: 0x858585, wood: 0x81552f };

function solidAt(terrain, x, y, z) {
  if (y < terrain.minY || y > terrain.maxY) return false;
  if (typeof terrain.isSolid === 'function') return !!terrain.isSolid(x, y, z);
  const c = terrain.getCell(x, y, z);
  return !AIR.has(c) && !(c && typeof c === 'object' && c.solid === false);
}
function cellMaterial(value) {
  if (value && typeof value === 'object') return value.material || value.type || 'dirt';
  return typeof value === 'string' && value !== 'air' ? value : 'dirt';
}
function parseKey(key) {
  if (Array.isArray(key)) return [Number(key[0]), Number(key[1])];
  const m = String(key).match(/(-?\d+)\s*[,/:]\s*(-?\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function createTerrainRenderer(THREE, scene, terrain, options = {}) {
  if (!THREE || !scene || !terrain || typeof terrain.getCell !== 'function')
    throw new TypeError('THREE, scene, and terrain.getCell are required');
  const size = Math.max(1, Math.floor(terrain.chunkSize || options.chunkSize || 16));
  const ox = Number(terrain.originX) || 0, oz = Number(terrain.originZ) || 0;
  const materials = new Map();
  const chunks = new Map();
  const maxFaces = Math.max(6, options.maxFaces || 100000);

  function getMaterial(id) {
    if (!materials.has(id)) {
      const color = options.colors?.[id] ?? DEFAULT_COLORS[id] ?? options.defaultColor ?? 0x8b7653;
      materials.set(id, new THREE.MeshLambertMaterial({ color, flatShading: true }));
    }
    return materials.get(id);
  }
  function disposeChunk(key) {
    const meshes = chunks.get(key) || [];
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.geometry?.dispose?.();
    }
    chunks.delete(key);
  }
  function rebuildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    disposeChunk(key);
    const buckets = new Map();
    const minX = ox + cx * size, minZ = oz + cz * size;
    const minY = Number.isFinite(terrain.minY) ? terrain.minY : 0;
    const maxY = Number.isFinite(terrain.maxY) ? terrain.maxY : 0;
    let faceCount = 0;
    outer: for (let x = minX; x < minX + size; x++) {
      for (let z = minZ; z < minZ + size; z++) {
        for (let y = minY; y <= maxY; y++) {
          const cell = terrain.getCell(x, y, z);
          if (!solidAt(terrain, x, y, z)) continue;
          const materialId = cellMaterial(cell);
          let positions = buckets.get(materialId);
          if (!positions) buckets.set(materialId, positions = []);
          for (const face of FACES) {
            if (solidAt(terrain, x + face.n[0], y + face.n[1], z + face.n[2])) continue;
            const verts = face.v;
            for (const i of [0, 1, 2, 0, 2, 3]) {
              positions.push(x);
              positions.push(y + verts[i][1], z + verts[i][2]);
              // X face vertex is in local cell space; include its offset.
              positions[positions.length - 3] += verts[i][0];
            }
            if (++faceCount >= maxFaces) break;
          }
          if (faceCount >= maxFaces) break outer;
        }
      }
    }
    const meshes = [];
    for (const [materialId, values] of buckets) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
      geometry.computeVertexNormals?.();
      const mesh = new THREE.Mesh(geometry, getMaterial(materialId));
      mesh.userData ||= {};
      mesh.userData.terrainChunk = { cx, cz };
      scene.add(mesh);
      meshes.push(mesh);
    }
    chunks.set(key, meshes);
    return meshes;
  }
  function rebuildAll() {
    for (const key of [...chunks.keys()]) disposeChunk(key);
    if (typeof terrain.getChunkKeys === 'function') {
      for (const k of terrain.getChunkKeys() || []) {
        const coords = parseKey(k);
        if (coords) rebuildChunk(...coords);
      }
    } else {
      const width = Math.max(0, terrain.width || 0), depth = Math.max(0, terrain.depth || 0);
      for (let cx = 0; cx < Math.ceil(width / size); cx++)
        for (let cz = 0; cz < Math.ceil(depth / size); cz++) rebuildChunk(cx, cz);
    }
  }
  function updateAfterEdit(x, y, z) {
    const cx = Math.floor((x - ox) / size), cz = Math.floor((z - oz) / size);
    rebuildChunk(cx, cz);
    // Rebuild touching chunks too when the edited cell lies on a chunk edge.
    const lx = (((x - ox) % size) + size) % size, lz = (((z - oz) % size) + size) % size;
    if (lx === 0) rebuildChunk(cx - 1, cz);
    if (lx === size - 1) rebuildChunk(cx + 1, cz);
    if (lz === 0) rebuildChunk(cx, cz - 1);
    if (lz === size - 1) rebuildChunk(cx, cz + 1);
  }
  function update() {
    if (typeof terrain.getChangedChunkKeys !== 'function') return;
    for (const key of terrain.getChangedChunkKeys() || []) {
      const coords = parseKey(key);
      if (coords) rebuildChunk(...coords);
    }
  }
  function mapHit(hit) {
    if (!hit?.point) return null;
    let normal = hit.face?.normal || hit.normal;
    if (!normal) return null;
    const components = [normal.x, normal.y, normal.z];
    let axis = 0;
    if (Math.abs(components[1]) > Math.abs(components[axis])) axis = 1;
    if (Math.abs(components[2]) > Math.abs(components[axis])) axis = 2;
    const n = [0, 0, 0]; n[axis] = Math.sign(components[axis]) || 1;
    // Surface point is shifted inward by half a cell along its normal, then
    // rounded to the nearest grid center; this is stable at edges/corners.
    const p = hit.point;
    const cell = [Math.round(p.x - n[0] * .5), Math.floor(p.y - n[1] * .5), Math.round(p.z - n[2] * .5)];
    return { x: cell[0], y: cell[1], z: cell[2], normal: { x: n[0], y: n[1], z: n[2] }, face: { x: n[0], y: n[1], z: n[2] } };
  }
  function dispose() {
    for (const key of [...chunks.keys()]) disposeChunk(key);
    for (const material of materials.values()) material.dispose?.();
    materials.clear();
  }
  return { rebuildChunk, rebuildAll, updateAfterEdit, update, mapHit, dispose, get chunks() { return chunks; } };
}

export default createTerrainRenderer;
