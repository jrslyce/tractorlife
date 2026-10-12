import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFarmTerrain } from '../js/terrain-runtime.js';
import { TerrainSurfaces } from '../js/terrain-surfaces.js';
import { createStreamingTerrain } from '../js/streaming-terrain.js';
import { moveCharacter } from '../js/terrain-physics.js';
import { Farm } from '../js/farm.js';

test('excavated field/road overlays no longer seal the hole, and filling restores them',()=>{
  const terrain=createFarmTerrain(0), surfaces=new TerrainSurfaces(terrain);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,0.1,1),new THREE.MeshBasicMaterial());
  surfaces.attach(mesh);
  const hit={object:mesh,point:new THREE.Vector3(20,0.1,35)};
  assert.equal(surfaces.ignoresHit(hit),false);
  terrain.breakCell(20,-1,35); surfaces.updateColumn(20,35);
  assert.equal(surfaces.ignoresHit(hit),true);
  const movement=moveCharacter({terrain,position:{x:20,y:0,z:35},velocity:{x:0,y:-5,z:0},deltaTime:0.3});
  assert.equal(movement.position.y,-1);
  terrain.placeCell(20,-1,35,'dirt'); surfaces.updateColumn(20,35);
  assert.equal(surfaces.ignoresHit(hit),false);
});

test('world rendering stays bounded while traveling and rebuilds saved holes on return',()=>{
  const terrain=createFarmTerrain(0), scene=new THREE.Scene(), surfaces=new TerrainSurfaces(terrain);
  const renderer=createStreamingTerrain(THREE,scene,terrain,surfaces);
  terrain.breakCell(0,-1,0);
  renderer.focus(0,0); renderer.flush(100);
  assert.ok(renderer.chunks.size<=25);
  const oldKeys=[...renderer.chunks.keys()];
  renderer.focus(1770,70); renderer.flush(100);
  assert.ok(renderer.chunks.size<=25);
  assert.ok(oldKeys.every(k=>!renderer.chunks.has(k)));
  renderer.focus(0,0); renderer.flush(100);
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObjects(scene.children)[0].point.y,-1);
  renderer.dispose(); assert.equal(scene.children.length,0);
});

test('expansion fields created after startup or during restore receive excavation shaders', () => {
  for (const restore of [false, true]) {
    const scene = new THREE.Scene(), terrain = createFarmTerrain(0);
    const surfaces = new TerrainSurfaces(terrain), farm = new Farm(scene, 0);
    farm.setTerrainSurfaces(surfaces);
    if (restore) farm.restore({ expansion: true, fields: [] });
    else farm.expand();
    for (const mesh of [farm._expansionField._tileMesh, farm._expansionField._cropMesh, farm._expansionField._underMesh]) {
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>' };
      mesh.material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.uDigMask?.value, surfaces.texture);
      assert.match(shader.fragmentShader, /digMask\.g > 0\.5/);
    }
  }
});
