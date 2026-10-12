import { createTerrainRenderer } from './terrain-renderer.js';

// Render only nearby chunks. Collision and saved edits still cover the whole
// map, and the existing ground covers every chunk until its mesh is ready.
export function createStreamingTerrain(THREE, scene, terrain, surfaces) {
  const renderer = createTerrainRenderer(THREE, scene, terrain, { deferred: true, colors: { grass: 0x5aa02c },
    materialFactory: color => new THREE.MeshStandardMaterial({ color, roughness: 1 }) });
  let center = '';
  const wanted = new Set();
  const queue = new Set();
  function focus(x, z) {
    const cx = Math.floor((x-terrain.originX)/terrain.chunkSize), cz = Math.floor((z-terrain.originZ)/terrain.chunkSize);
    const key = `${cx},${cz}`;
    if (key === center) return;
    center = key;
    wanted.clear();
    // Nearest first keeps the player's feet/target available before distant scenery.
    for (let radius = 0; radius <= 2; radius++) for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (Math.max(Math.abs(dx),Math.abs(dz)) !== radius) continue;
      const a = cx+dx, b = cz+dz;
      if (a < 0 || b < 0 || a*terrain.chunkSize >= terrain.width || b*terrain.chunkSize >= terrain.depth) continue;
      const k = `${a},${b}`;
      wanted.add(k);
      if (!renderer.chunks.has(k)) queue.add(k);
    }
    for (const k of renderer.chunks.keys()) if (!wanted.has(k)) {
      renderer.disposeChunk(k);
      surfaces.chunk(...k.split(',').map(Number), false);
    }
    for (const k of queue) if (!wanted.has(k)) queue.delete(k);
  }
  function update() {
    for (const k of terrain.getChangedChunkKeys()) if (wanted.has(k)) queue.add(k);
  }
  function flush(limit = 1) {
    let n = 0;
    for (const k of queue) {
      queue.delete(k);
      renderer.rebuildChunk(...k.split(',').map(Number));
      surfaces.chunk(...k.split(',').map(Number), true);
      if (++n >= limit) break;
    }
  }
  function rebuildAll() {
    for (const k of wanted) queue.add(k);
  }
  function dispose() {
    for (const k of renderer.chunks.keys()) surfaces.chunk(...k.split(',').map(Number), false);
    renderer.dispose(); queue.clear();
  }
  return { focus, update, flush, rebuildAll, dispose, mapHit: renderer.mapHit, chunks: renderer.chunks };
}
