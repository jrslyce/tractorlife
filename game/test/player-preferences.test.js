import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreferences, setPreferences, resetPreferences, applyPreferences, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY } from '../js/player-preferences.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k), values };
}

test('missing, malformed, and unsupported storage safely use defaults', () => {
  globalThis.localStorage = memoryStorage({ [PREFERENCES_STORAGE_KEY]: '{bad' });
  assert.deepEqual(getPreferences(), DEFAULT_PREFERENCES);
  globalThis.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 900, preferences: { highContrast: true } }));
  assert.deepEqual(getPreferences(), DEFAULT_PREFERENCES);
  delete globalThis.localStorage;
  assert.deepEqual(getPreferences(), DEFAULT_PREFERENCES);
});

test('only normalized visual preferences are persisted and reset', () => {
  globalThis.localStorage = memoryStorage();
  const result = setPreferences({ textScale: 'larger', reducedMotion: true, hudDetail: 'focused', farmMode: 'hard' });
  assert.deepEqual(result, { ...DEFAULT_PREFERENCES, textScale: 'larger', hudDetail: 'focused', reducedMotion: true });
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(PREFERENCES_STORAGE_KEY)).preferences, result);
  assert.deepEqual(resetPreferences(), DEFAULT_PREFERENCES);
  assert.equal(globalThis.localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
  delete globalThis.localStorage;
});

test('apply exposes accessible visual state on document root', () => {
  const data = {}; const vars = {};
  const target = { dataset: data, style: { setProperty: (key, value) => vars[key] = value } };
  applyPreferences({ highContrast: true, largerControls: true, reducedMotion: true, textScale: 'large' }, target);
  assert.deepEqual(data, { textScale: 'large', hudDetail: 'full', highContrast: 'true', largerControls: 'true', reducedMotion: 'true' });
  assert.equal(vars['--player-text-scale'], '1.12');
});
