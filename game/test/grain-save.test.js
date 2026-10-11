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
    assert.deepEqual(JSON.parse(storage.get('vt-offline:names-2026-10-11:grain-qa@example.test')), state);
    assert.deepEqual(payload.state, state);
    await Promise.resolve();
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.localStorage;
  }
});

test('offline save reports storage success or failure before a graphics reload', async () => {
  const originalStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = { setItem() {} };
    assert.equal(await tickSave(() => ({ email: 'offline-qa@example.test', mode: 'offline' }), () => ({ money: 100 })), true);
    globalThis.localStorage = { setItem() { throw new Error('quota'); } };
    assert.equal(await tickSave(() => ({ email: 'offline-qa@example.test', mode: 'offline' }), () => ({ money: 100 })), false);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
