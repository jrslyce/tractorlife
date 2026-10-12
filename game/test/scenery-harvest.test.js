import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SceneryHarvest } from '../js/scenery-harvest.js';
import { buildEnvironment } from '../js/environment.js';
import { Farm } from '../js/farm.js';

function inventory(full=false) { return { count:0, canAdd:()=>!full, addItem(id,n) { this.count += n; return {ok:true}; } }; }
function instanceVisible(part) { const m=new THREE.Matrix4(); part.mesh.getMatrixAt(part.index,m); return m.elements[0]!==0 || m.elements[5]!==0; }

test('decorative tree harvest removes both trunk and canopy, awards once and restores by stable ID', () => {
  const scene=new THREE.Scene(); buildEnvironment(scene);
  const harvest=new SceneryHarvest(scene), inv=inventory();
  const tree=[...harvest.entries.values()].find(e=>e.label==='tree');
  assert.equal(tree.parts.length,2);
  assert.equal(harvest.harvest(tree.id,inv).ok,true);
  assert.equal(inv.count,3);
  assert.ok(tree.parts.every(p=>!instanceVisible(p)));
  assert.equal(harvest.harvest(tree.id,inv).ok,false);
  const saved=harvest.serialize(); harvest.restore([]);
  assert.ok(tree.parts.every(instanceVisible));
  harvest.restore(saved); assert.ok(tree.parts.every(p=>!instanceVisible(p)));
});

test('fence IDs do not alias neighboring farms and breaking one rail preserves other sections', () => {
  const scene=new THREE.Scene(); new Farm(scene,0); new Farm(scene,1);
  const harvest=new SceneryHarvest(scene), inv=inventory();
  const rails=[...harvest.entries.values()].filter(e=>e.label==='fence rail');
  assert.ok(rails.length>16);
  assert.ok(rails.every(e=>e.parts.length===1));
  assert.equal(harvest.harvest(rails[0].id,inventory(true)).ok,false);
  assert.ok(instanceVisible(rails[0].parts[0]));
  assert.equal(harvest.harvest(rails[0].id,inv).ok,true);
  assert.equal(inv.count,1);
  assert.ok(!instanceVisible(rails[0].parts[0]));
  assert.ok(rails.slice(1).every(e=>instanceVisible(e.parts[0])));
});
