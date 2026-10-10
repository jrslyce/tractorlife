import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTerrainEdit, fetchTerrainState } from '../js/net.js';

const edit = { action: 'place', x: 110, y: 1, z: 2, material: 'dirt', expectedRevision: 3 };

test('terrain edit sends authenticated same-origin POST and reports canonical acceptance', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    const body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, edit: { ...body, material: 'dirt', revision: 4 }, revision: 4, inventory: { slots: [] } }) };
  };
  try {
    const result = await sendTerrainEdit(edit, { mode: 'online' });
    assert.equal(request.url, '/api/terrain/edit');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['Content-Type'], 'application/json');
    assert.match(JSON.parse(request.options.body).operationId, /^[A-Za-z0-9_-]{8,80}$/);
    assert.deepEqual(JSON.parse(request.options.body), { ...edit, operationId: JSON.parse(request.options.body).operationId });
    assert.equal(result.ok, true);
    assert.equal(result.accepted, true);
    assert.equal(result.revision, 4);
    assert.deepEqual(result.inventory, { slots: [] });
  } finally { globalThis.fetch = originalFetch; }
});

test('terrain edit distinguishes offline sessions and transport failures from acceptance', async () => {
  assert.deepEqual(await sendTerrainEdit(edit, { mode: 'offline' }), {
    ok: false, offline: true, error: 'Terrain edits require an online session.'
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const result = await sendTerrainEdit(edit, { mode: 'online' });
    assert.equal(result.ok, false);
    assert.equal(result.offline, true);
    assert.equal(result.accepted, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('terrain edit parses server rejection and rejects malformed success payloads', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: 'stale revision', revision: 5 }) });
  try {
    const rejected = await sendTerrainEdit({ ...edit, operationId: 'operation_123' }, { mode: 'online' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.offline, false);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.error, 'stale revision');
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const malformed = await sendTerrainEdit(edit, { mode: 'online' });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.accepted, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('terrain state recovery is online-only and validates the authoritative response', async () => {
  assert.equal(await fetchTerrainState({ mode: 'offline' }), null);
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, terrain: null, terrainEdits: {}, terrainRevision: 4, inventory: { slots: [] } }) };
  };
  try {
    const state = await fetchTerrainState({ mode: 'online' });
    assert.equal(request.url, '/api/terrain/state');
    assert.equal(request.options.method, 'GET');
    assert.equal(state.terrainRevision, 4);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, terrainEdits: [], terrainRevision: 'bad' }) });
    assert.equal(await fetchTerrainState({ mode: 'online' }), null);
  } finally { globalThis.fetch = originalFetch; }
});
