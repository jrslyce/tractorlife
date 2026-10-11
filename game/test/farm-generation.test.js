import test from 'node:test';
import assert from 'node:assert/strict';
import { FARM_GENERATION, OFFLINE_SAVE_PREFIX, prepareFarmStorage } from '../js/farm-generation.js';

test('farm reset removes prior saves and identity hints but preserves settings and shared roads', () => {
  const original = globalThis.localStorage;
  const values = new Map([
    ['vt-offline:old@example.com', '{"money":123}'],
    ['vt-offline:old-generation:jo', '{}'],
    ['vt-name', 'Old Farmer'], ['vt-email', 'old@example.com'], ['vt-code', 'obsolete'],
    ['vt-player-preferences', '{"graphicsQuality":"low"}'],
    ['vt-shared-road-queue', '[]'], ['unrelated', 'keep']
  ]);
  globalThis.localStorage = {
    get length() { return values.size; }, key: index => Array.from(values.keys())[index],
    getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)
  };
  try {
    prepareFarmStorage();
    assert.equal(values.get('vt-farm-generation'), FARM_GENERATION);
    for (const key of ['vt-offline:old@example.com', 'vt-offline:old-generation:jo', 'vt-name', 'vt-email', 'vt-code']) assert.equal(values.has(key), false);
    for (const key of ['vt-player-preferences', 'vt-shared-road-queue', 'unrelated']) assert.equal(values.has(key), true);
    values.set('vt-name', 'New Farmer'); values.set(OFFLINE_SAVE_PREFIX + 'new farmer', '{}');
    prepareFarmStorage();
    assert.equal(values.get('vt-name'), 'New Farmer');
    assert.equal(values.has(OFFLINE_SAVE_PREFIX + 'new farmer'), true);
  } finally { globalThis.localStorage = original; }
});
