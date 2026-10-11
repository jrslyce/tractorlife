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
  assert.deepEqual(data, { textScale: 'large', hudDetail: 'full', highContrast: 'true', largerControls: 'true', reducedMotion: 'true', wordsOnButtons: 'true', steering: 'wheel' });
  assert.equal(vars['--player-text-scale'], '1.12');
});

test('graphics quality is saved independently and old preferences remain compatible', () => {
  globalThis.localStorage = memoryStorage();
  setPreferences({ graphicsQuality: 'low', hudDetail: 'focused' });
  assert.equal(getPreferences().graphicsQuality, 'low');
  setPreferences({ graphicsQuality: 'invalid' });
  assert.equal(getPreferences().graphicsQuality, 'auto');
  globalThis.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, preferences: { highContrast: true } }));
  assert.equal(getPreferences().graphicsQuality, 'auto');
  assert.equal(getPreferences().highContrast, true);
  delete globalThis.localStorage;
});

test('steering and button words are saved as visual choices', () => {
  globalThis.localStorage = memoryStorage();
  assert.equal(setPreferences({ steering: 'joystick', wordsOnButtons: false }).steering, 'joystick');
  assert.equal(getPreferences().wordsOnButtons, false);
  assert.equal(setPreferences({ steering: 'invalid' }).steering, 'wheel');
  resetPreferences();
  assert.equal(getPreferences().wordsOnButtons, true);
  delete globalThis.localStorage;
});
