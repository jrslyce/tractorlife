import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker.js';
import { World } from '../js/world.js';
import { formatFarmerName, normalizeFarmerName } from '../js/farmer-identity.js';
import { login, rememberedName, hasRememberedName, restoreRememberedSession, forgetRememberedCredentials, tickSave } from '../js/net.js';

function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function environment() {
  const saves = new Map(), farmers = new Map();
  return {
    saves, farmers,
    AUTH_CODE: 'test-password', SESSION_SECRET: 'name-auth-test-signing-key-with-32-characters',
    SAVES: { idFromName: name => name, get: name => ({ fetch: async (url, options) => {
      if (url.endsWith('/save')) saves.set(name, JSON.parse(options.body).state);
      return new Response(JSON.stringify({ ok: true, state: saves.get(name) || null }));
    } }) },
    FARMERS: { idFromName: name => name, get: () => ({ fetch: async (url, options) => {
      if (options) { const farmer = JSON.parse(options.body); farmers.set(farmer.email, farmer); }
      return new Response(JSON.stringify({ ok: true, farmers: Array.from(farmers.values()) }));
    } }) },
  };
}
function request(path, body, cookie = '') {
  return new Request('https://game.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
}

test('name normalization is shared, Unicode-safe and stable without re-keying legacy email saves', () => {
  assert.equal(formatFarmerName('  Farmer   Jo '), 'Farmer Jo');
  assert.equal(normalizeFarmerName('  Farmer   Jo '), 'farmer jo');
  for (const input of ['José', 'İpek', "Jo O’Neil", 'Ｆａｒｍｅｒ Jo']) {
    const canonical = normalizeFarmerName(input);
    assert.ok(canonical);
    assert.equal(normalizeFarmerName(canonical), canonical);
  }
  assert.equal(normalizeFarmerName(' OWNER@Example.com '), 'owner@example.com');
  for (const input of ['', null, {}, 'a'.repeat(65), '<script>', 'a/b', 'a@', 'a\u0000b']) assert.equal(normalizeFarmerName(input), '');
});

test('Worker logs in with a name/password and uses the same identity for sessions, save and restore', async () => {
  const env = environment();
  const response = await worker.fetch(request('/api/login', { name: '  Farmer  Jo ', password: 'test-password', remember: true }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.name, 'Farmer Jo');
  assert.equal(result.email, 'farmer jo');
  assert.equal(result.farmSlot, World.prototype.slotFromEmail(result.email));
  assert.ok(env.farmers.has('farmer jo'));
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const state = { money: 123 };
  assert.equal((await worker.fetch(request('/api/save', { name: 'FARMER JO', state }, cookie), env)).status, 200);
  assert.deepEqual(env.saves.get('farmer jo'), state);
  const restored = await worker.fetch(request('/api/login', { name: 'farmer jo', remember: true }, cookie), env);
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).state, state);
  assert.equal((await worker.fetch(request('/api/save', { name: 'Other Farmer', state }, cookie), env)).status, 401);
  assert.equal((await worker.fetch(request('/api/login', { name: 'Other Farmer', remember: true }, cookie), env)).status, 401);
  assert.equal((await worker.fetch(request('/api/login', { name: 'Farmer Jo', remember: true }), env)).status, 401);
});

test('Worker rejects wrong/invalid passwords and invalid names; explicit password wins over legacy aliases', async () => {
  const env = environment();
  assert.equal((await worker.fetch(request('/api/login', { name: 'Jo', password: 'wrong' }), env)).status, 401);
  for (const password of ['', {}, null, 'a'.repeat(257)]) {
    assert.equal((await worker.fetch(request('/api/login', { name: 'Jo', password }), env)).status, 400);
  }
  assert.equal((await worker.fetch(request('/api/login', { name: '<Jo>', password: 'test-password' }), env)).status, 400);
  assert.equal((await worker.fetch(request('/api/login', { name: 'Jo', password: 'wrong', code: 'test-password' }), env)).status, 401);
  assert.equal((await worker.fetch(request('/api/login', { name: '', email: 'valid@example.com', password: 'test-password' }), env)).status, 400);
});

test('legacy email login and cookie restore continue to load the original save key', async () => {
  const env = environment(); env.saves.set('owner@example.com', { money: 999 });
  const old = await worker.fetch(request('/api/login', { email: 'Owner@example.com', code: 'test-password', remember: true }), env);
  assert.equal(old.status, 200);
  const cookie = old.headers.get('set-cookie').split(';')[0];
  const newer = await worker.fetch(request('/api/login', { name: 'owner@example.com', remember: true }, cookie), env);
  assert.equal(newer.status, 200);
  assert.deepEqual((await newer.json()).state, { money: 999 });
});

test('client posts name/password, preserves name casing, and never stores the password', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const local = storage(); globalThis.localStorage = local;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, email: 'farmer jo', name: 'Farmer Jo', farmSlot: 2, state: null }));
  };
  try {
    const result = await login('  Farmer Jo ', 'test-password', true);
    assert.equal(result.email, 'farmer jo');
    assert.equal(result.name, 'Farmer Jo');
    assert.deepEqual(calls[0].body, { name: 'Farmer Jo', password: 'test-password', remember: true });
    assert.equal(rememberedName(), 'Farmer Jo');
    assert.equal(hasRememberedName(), true);
    assert.equal(JSON.stringify(Array.from(local.values)).includes('test-password'), false);
    await tickSave(() => result, () => ({ money: 9 }));
    assert.equal(calls.at(-1).body.name, 'farmer jo');
    assert.equal(local.values.has('vt-offline:farmer jo'), true);
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('client rejects definitive auth/input failures instead of entering offline mode', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  globalThis.localStorage = storage();
  try {
    for (const status of [400, 401, 403, 413, 429]) {
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(login('Farmer Jo', 'wrong', true));
    }
    assert.equal(hasRememberedName(), false);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await login('Farmer Jo', 'test-password', true)).mode, 'offline');
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('remembered email migrates safely to Name and forgetting removes both old and new identity hints', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const local = storage(); globalThis.localStorage = local;
  globalThis.fetch = async () => new Response('{}');
  try {
    local.setItem('vt-email', 'owner@example.com'); local.setItem('vt-code', 'legacy-secret');
    assert.equal(rememberedName(), 'owner@example.com');
    assert.equal(local.getItem('vt-name'), 'owner@example.com');
    assert.equal(local.getItem('vt-code'), null);
    assert.equal(local.getItem('vt-email'), null);
    await forgetRememberedCredentials();
    assert.equal(rememberedName(), '');
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('malformed or mismatched successful auth replies are not accepted as an online or offline identity', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  globalThis.localStorage = storage();
  try {
    for (const data of [{}, { ok: true, email: 'other farmer' }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(data));
      await assert.rejects(login('Farmer Jo', 'test-password', true));
    }
    globalThis.fetch = async () => new Response('not-json');
    await assert.rejects(login('Farmer Jo', 'test-password', true));
    assert.equal(hasRememberedName(), false);
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('switching farmers cancels stale remembered responses and does not resurrect the old name', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const local = storage(); globalThis.localStorage = local;
  let resolveLogin, started;
  const pending = new Promise(resolve => { started = resolve; });
  globalThis.fetch = (url) => {
    if (url === '/api/logout') return Promise.resolve(new Response('{}'));
    started(); return new Promise(resolve => { resolveLogin = resolve; });
  };
  try {
    const restore = restoreRememberedSession('Farmer Jo');
    const rejected = assert.rejects(restore, /login-cancelled/);
    await pending;
    await forgetRememberedCredentials();
    resolveLogin(new Response(JSON.stringify({ ok: true, email: 'farmer jo' })));
    await rejected;
    assert.equal(rememberedName(), '');
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});
