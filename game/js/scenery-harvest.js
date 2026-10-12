import * as THREE from 'three';

// Stable IDs attach to individual instances, not entire rendering batches.
// A tree's trunk and crown share an ID; each fence post/rail is separate.
export class SceneryHarvest {
  constructor(scene) {
    this.entries = new Map();
    this.removed = new Set();
    scene.traverse(mesh => {
      const parts = mesh.userData.harvestParts;
      if (!parts) return;
      for (let i = 0; i < parts.length; i++) {
        const spec = parts[i];
        if (!spec) continue;
        let entry = this.entries.get(spec.id);
        if (!entry) this.entries.set(spec.id, entry = { ...spec, kind: 'scenery', material: 'wood', revision: 0, parts: [] });
        const matrix = new THREE.Matrix4();
        if (mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix);
        entry.parts.push({ mesh, index: mesh.isInstancedMesh ? i : null, matrix });
      }
    });
  }
  targetFromHit(hit) {
    const spec = hit.object.userData.harvestParts?.[hit.instanceId ?? 0];
    const entry = spec && this.entries.get(spec.id);
    if (!entry || this.removed.has(entry.id)) return null;
    const box = new THREE.Box3();
    for (const part of entry.parts) {
      part.mesh.geometry.computeBoundingBox();
      const matrix = part.mesh.matrixWorld.clone().multiply(part.matrix);
      box.union(part.mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
    return { ...entry, mesh: hit.object, point: hit.point, bounds: box };
  }
  setRemoved(id, removed) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (removed) this.removed.add(id); else this.removed.delete(id);
    for (const part of entry.parts) {
      if (part.index === null) part.mesh.visible = !removed;
      else {
        part.mesh.setMatrixAt(part.index, removed ? new THREE.Matrix4().makeScale(0,0,0) : part.matrix);
        part.mesh.instanceMatrix.needsUpdate = true;
        // Keep the original conservative bounds; culling must not resurrect instances.
      }
    }
  }
  harvest(id, inventory) {
    const entry = this.entries.get(id);
    if (!entry || this.removed.has(id)) return { ok: false, error: 'Target changed.' };
    const quantity = entry.quantity || 1;
    if (!inventory.canAdd('wood', quantity)) return { ok: false, error: 'Inventory full.' };
    const result = inventory.addItem('wood', quantity);
    if (!result?.ok) return result;
    this.setRemoved(id, true);
    return { ok: true, itemId: 'wood', quantity };
  }
  serialize() { return [...this.removed].sort(); }
  restore(ids) {
    for (const id of [...this.removed]) this.setRemoved(id, false);
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') this.setRemoved(id, true);
  }
}
