import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../js/terrain.js';
import { moveCharacter } from '../js/terrain-physics.js';

const terrain = changes => new Terrain({ originX: -4, originZ: -4, width: 9, depth: 9, minY: -4, surfaceY: -3, maxY: 8, changes });
const move = (t, position, velocity, deltaTime, options) => moveCharacter({ terrain: t, position, velocity, deltaTime, ...options });

test('cell boundaries are respected and exact edge contact is not penetration', () => {
  const t = terrain([[[1, 0, 0], 'wood']]);
  const result = move(t, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1, { halfWidth: 0.25, height: 1 });
  assert.ok(Math.abs(result.position.x - 0.25) < 1e-7);
  assert.equal(result.velocity.x, 0);
  assert.equal(result.collisions.x, true);
});

test('falling lands on a cell top and reports support while stationary', () => {
  const t = terrain([[[0, 0, 0], 'wood']]);
  const landed = move(t, { x: 0, y: 3, z: 0 }, { x: 0, y: -4, z: 0 }, 1, { halfWidth: 0.2, height: 1.6 });
  assert.deepEqual(landed.position, { x: 0, y: 1, z: 0 });
  assert.equal(landed.velocity.y, 0);
  assert.equal(landed.onGround, true);
  assert.equal(move(t, landed.position, landed.velocity, 0, { halfWidth: 0.2, height: 1.6 }).onGround, true);
});

test('axis-separated motion slides along a wall and blocks upward motion at a ceiling', () => {
  const t = terrain([[[1, 1, 0], 'wood'], [[0, 3, 0], 'wood']]);
  const result = move(t, { x: 0, y: 1, z: 0 }, { x: 2, y: 3, z: 0 }, 1, { halfWidth: 0.2, height: 1 });
  assert.ok(result.position.x <= 0.31);
  assert.equal(result.velocity.x, 0);
  assert.equal(result.collisions.x, true);
  assert.equal(result.velocity.y, 0);
  assert.equal(result.collisions.y, true);
});
