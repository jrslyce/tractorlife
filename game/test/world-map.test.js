import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldMap } from '../js/world-map.js';

test('world map validates destinations and computes a bearing without mutating position', () => {
  const map = new WorldMap([{ id: 'ridge', name: 'North Ridge', x: 10, z: 20 },
    { id: 'bad', x: NaN, z: 0 }, null]);
  assert.equal(map.locations.length, 1);
  assert.equal(map.setWaypoint('missing'), false);
  assert.equal(map.setWaypoint('ridge'), true);
  assert.deepEqual(map.route({ x: 7, z: 16 }), {
    id: 'ridge', name: 'North Ridge', type: 'landmark', x: 10, z: 20,
    distance: 5, bearing: Math.atan2(3, 4)
  });
  assert.equal(map.route({ x: NaN, z: 0 }), null);
  assert.equal(map.setWaypoint(null), true);
  assert.equal(map.route({ x: 0, z: 0 }), null);
});

test('waypoint state round-trips and rejects unknown destinations atomically', () => {
  const map = new WorldMap([{ id: 'quarry', x: 1, z: 2 }]);
  map.setWaypoint('quarry');
  const saved = map.serialize();
  const restored = new WorldMap([{ id: 'quarry', x: 1, z: 2 }]);
  assert.equal(restored.restore(saved), true);
  assert.deepEqual(restored.serialize(), saved);
  assert.equal(restored.restore({ version: 1, waypointId: 'unrecognized' }), false);
  assert.deepEqual(restored.serialize(), saved);
});

test('map hit testing uses the exact padded marker projection, including world edges', () => {
  const map = new WorldMap([{ id: 'edge', x: -10, z: -78 }, { id: 'cache', x: 900, z: 40 }]);
  const bounds = { minX: -10, maxX: 1780, minZ: -78, maxZ: 80 };
  const marker = map.project(map.locations[0], bounds, 340, 180);
  assert.deepEqual(marker, { x: 15, y: 165 });
  assert.equal(map.pick(marker, bounds, 340, 180, ['edge']), 'edge');
  assert.equal(map.pick({ x: marker.x + 13, y: marker.y }, bounds, 340, 180, ['edge']), null);
  const cache = map.project(map.locations[1], bounds, 340, 180);
  assert.equal(map.pick(cache, bounds, 340, 180, ['edge']), null);
  assert.equal(map.pick(cache, bounds, 340, 180, ['edge', 'cache']), 'cache');
});
