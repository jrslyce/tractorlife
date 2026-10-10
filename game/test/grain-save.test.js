import test from 'node:test';
import assert from 'node:assert/strict';
import { tickSave } from '../js/net.js';

test('confirmed sale snapshot immediately saves balance and consumed cargo together', async () => {
  const storage = new Map();
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.localStorage = { setItem(key, value) { storage.set(key, value); } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/save');
    payload = JSON.parse(options.body);
    return { ok: true };
  };
  try {
    const state = { money: 2100, combineBin: {}, wagon: { cargo: [null] } };
    tickSave(() => ({ email: 'grain-qa@example.test', mode: 'online' }), () => state);
    assert.deepEqual(JSON.parse(storage.get('vt-offline:grain-qa@example.test')), state);
    assert.deepEqual(payload.state, state);
    await Promise.resolve();
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.localStorage;
  }
});
