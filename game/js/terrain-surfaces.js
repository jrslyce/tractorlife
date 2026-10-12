import * as THREE from 'three';

// Two channels: rendered voxel chunks replace the flat ground; excavated
// columns cut holes through field slabs, roads and pads (including instancing).
export class TerrainSurfaces {
  constructor(terrain) {
    this.terrain = terrain;
    this.data = new Uint8Array(terrain.width * terrain.depth * 4);
    this.texture = new THREE.DataTexture(this.data, terrain.width, terrain.depth);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.bounds = new THREE.Vector4(terrain.originX, terrain.originZ, terrain.width, terrain.depth);
    this.materials = new WeakSet();
    this.refresh();
  }
  index(x, z) {
    const t = this.terrain;
    if (x < t.originX || x >= t.originX + t.width || z < t.originZ || z >= t.originZ + t.depth) return -1;
    return ((z - t.originZ) * t.width + x - t.originX) * 4;
  }
  refresh() {
    this.data.fill(0);
    for (const [key] of this.terrain._changes) {
      const [x,,z] = key.split(',').map(Number);
      this.updateColumn(x, z);
    }
    this.texture.needsUpdate = true;
  }
  updateColumn(x, z) {
    const i = this.index(x, z);
    if (i >= 0) this.data[i + 1] = this.terrain.isSolid(x, -1, z) || this.terrain.isSolid(x, 0, z) ? 0 : 255;
    this.texture.needsUpdate = true;
  }
  chunk(cx, cz, rendered) {
    const t = this.terrain;
    for (let x = t.originX + cx*t.chunkSize; x < t.originX + (cx+1)*t.chunkSize; x++)
      for (let z = t.originZ + cz*t.chunkSize; z < t.originZ + (cz+1)*t.chunkSize; z++) {
        const i = this.index(x,z);
        if (i >= 0) this.data[i] = rendered ? 255 : 0;
      }
    this.texture.needsUpdate = true;
  }
  ignoresHit(hit) {
    const type = hit.object.userData.terrainSurface;
    if (!type) return false;
    const i = this.index(Math.round(hit.point.x), Math.round(hit.point.z));
    return i >= 0 && this.data[i + (type === 'ground' ? 0 : 1)] > 0;
  }
  attach(mesh, type = 'overlay') {
    mesh.userData.terrainSurface = type;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!mat || this.materials.has(mat)) continue;
      this.materials.add(mat);
      const previous = mat.onBeforeCompile;
      mat.onBeforeCompile = shader => {
        previous?.call(mat, shader);
        shader.uniforms.uDigMask = { value: this.texture };
        shader.uniforms.uDigBounds = { value: this.bounds };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDigPosition;');
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 digPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          digPosition = instanceMatrix * digPosition;
          #endif
          vDigPosition = (modelMatrix * digPosition).xyz;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDigPosition;\nuniform sampler2D uDigMask;\nuniform vec4 uDigBounds;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          vec2 digCell = floor(vDigPosition.xz + 0.5) - uDigBounds.xy;
          if (all(greaterThanEqual(digCell, vec2(0.0))) && all(lessThan(digCell, uDigBounds.zw))) {
            vec4 digMask = texture2D(uDigMask, (digCell + 0.5) / uDigBounds.zw);
            if (digMask.${type === 'ground' ? 'r' : 'g'} > 0.5) discard;
          }`);
      };
      mat.customProgramCacheKey = () => 'world-dig-mask-' + type;
      mat.needsUpdate = true;
    }
  }
}
