import test from 'node:test';
import assert from 'node:assert/strict';
import { Achievements } from '../js/achievements.js';

test('achievement progress unlocks milestones once and serializes safely', () => {
  const achievements = new Achievements();
  const first = achievements.update({ harvested: 1, discoveries: 3, animals: 4, fertility: 85 });
  assert.deepEqual(first.map(item => item.id), ['first-harvest', 'world-walker', 'good-neighbors', 'soil-steward']);
  assert.deepEqual(achievements.update({ harvested: 100, discoveries: 3, animals: 4, fertility: 85 }).map(x => x.id), ['seasoned-farmer']);
  assert.deepEqual(achievements.update({ harvested: 100, discoveries: 4, animals: 5, fertility: 90 }), []);
  const restored = new Achievements();
  assert.equal(restored.restore(achievements.serialize()), true);
  assert.deepEqual(restored.list(), achievements.list());
});

test('malformed restores fail and unknown achievement IDs are ignored', () => {
  const achievements = new Achievements();
  assert.equal(achievements.restore({ version: 2, unlocked: [] }), false);
  assert.equal(achievements.restore({ version: 1, unlocked: ['future-id', 'first-harvest', 4] }), true);
  assert.equal(achievements.list().find(item => item.id === 'first-harvest').unlocked, true);
  assert.equal(achievements.list().filter(item => item.unlocked).length, 1);
});
