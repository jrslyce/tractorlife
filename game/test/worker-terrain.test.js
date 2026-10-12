import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function workerModule() {
  let source = fs.readFileSync(path.resolve(__dirname, '../../worker.js'), 'utf8');
  source = source.replace("'./game/js/items.js'", JSON.stringify(new URL('../js/items.js', import.meta.url).href));
  source = source.replace("'./game/js/farmer-identity.js'", JSON.stringify(new URL('../js/farmer-identity.js', import.meta.url).href));
  source = source.replace("'./game/js/farm-generation.js'", JSON.stringify(new URL('../js/farm-generation.js', import.meta.url).href));
  source = source.replace('export class NameGameSaves', 'class GameSaves')
    .replace('export class NameFarmerList', 'class FarmerList')
    .replace('export class SharedWorld', 'class SharedWorld')
    .replace('export class RealtimeRoom', 'class RealtimeRoom')
    .replace('export default {', 'const worker = {') + '\nexport { GameSaves, FarmerList, worker };';
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

function memoryStorage() {
  const values = new Map();
  return { values, get: async k => values.get(k), put: async (k, v) => {
    if (typeof k === 'object') for (const [key, value] of Object.entries(k)) values.set(key, value);
    else values.set(k, v);
  }, transaction: async fn => fn(this) };
}

test('terrain edit validates bounds, revision and inventory; repeats are idempotent', async () => {
  const { GameSaves } = await workerModule();
  const storage = memoryStorage();
  storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ v: 3, inventory: { selectedSlot: 0, slots: [
    { itemId: 'dirt', qty: 2 }, null, null, null, null, null, null, null, null
  ] } }));
  const saves = new GameSaves({ storage }, {});
  const post = body => saves.fetch(new Request('https://saves/terrain-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const op = { operationId: 'operation_123', action: 'place', material: 'dirt', x: 109, y: 0, z: 0, expectedRevision: 0, farmSlot: 0 };
  const first = await (await post(op)).json();
  assert.equal(first.ok, true);
  assert.equal(first.revision, 1);
  assert.equal(first.inventory.slots[0].qty, 1);
  assert.deepEqual(await (await post(op)).json(), first);
  assert.equal((await post({ ...op, material: 'stone' })).status, 409); // ID cannot be reused for another operation.
  assert.equal((await post({ ...op, operationId: 'operation_456', expectedRevision: 0 })).status, 409);
  assert.equal((await post({ ...op, x: -11 })).status, 400);
});

test('authoritative hill layers match client topology and survive break/place reload', async () => {
  const { GameSaves } = await workerModule();
  const storage = memoryStorage(); storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ inventory: { selectedSlot: 0, slots: [
    { itemId: 'dirt', qty: 2 }, null, null, null, null, null, null, null, null
  ] } }));
  const saves = new GameSaves({ storage }, {});
  const post = body => saves.fetch(new Request('https://saves/terrain-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const common = { farmSlot: 0, x: 116, z: -22, y: 1, toolId: '', expectedRevision: 0 };
  const broken = await (await post({ ...common, action: 'break', operationId: 'hill_break_01' })).json();
  assert.equal(broken.ok, true); // Grass at the hilltop is local height +2.
  assert.equal(broken.inventory.slots[0].qty, 3);
  const reloaded = JSON.parse(await storage.get('state'));
  assert.equal(reloaded.terrainEdits['116,1,-22'].material, 'air');
  const placed = await (await post({ ...common, action: 'place', material: 'dirt', y: 1,
    expectedRevision: 1, operationId: 'hill_place_01' })).json();
  assert.equal(placed.ok, true); // The cell is now empty and attached to the dirt layer below.
  assert.equal(JSON.parse(await storage.get('state')).terrainEdits['116,1,-22'].material, 'dirt');
  const impossible = await post({ ...common, action: 'break', y: 16, expectedRevision: 2, operationId: 'air_break_01' });
  assert.equal((await impossible.json()).error, 'empty cell');
  const reserved = await post({ ...common, x: 116, z: -40, y: -1, action: 'break', expectedRevision: 2, operationId: 'reserved_plot_1' });
  assert.equal(reserved.status, 200); // Ground under expansion fields is now editable.
});

test('ordinary save cannot overwrite canonical terrain', async () => {
  const { GameSaves } = await workerModule();
  const storage = memoryStorage(); storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ terrainRevision: 7, terrainEdits: { a: { material: 'stone' } }, money: 1 }));
  const saves = new GameSaves({ storage }, {});
  await saves.fetch(new Request('https://saves/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: { terrainRevision: 0, terrainEdits: {}, money: 9 } }) }));
  const state = JSON.parse(await storage.get('state'));
  assert.equal(state.terrainRevision, 7);
  assert.deepEqual(state.terrainEdits, { a: { material: 'stone' } });
});

test('server awards dirt for grass, allows punching stone, and checks placement support', async () => {
  const { GameSaves } = await workerModule();
  const storage = memoryStorage(); storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ inventory: { selectedSlot: 0, slots: [
    { itemId: 'pickaxe', qty: 1 }, { itemId: 'dirt', qty: 1 }, null, null, null, null, null, null, null
  ] } }));
  const saves = new GameSaves({ storage }, {});
  const post = body => saves.fetch(new Request('https://saves/terrain-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const common = { farmSlot: 0, expectedRevision: 0 };
  const grass = await (await post({ ...common, operationId: 'break_grass_1', action: 'break', x: 109, y: -1, z: -52 })).json();
  assert.equal(grass.edit.material, 'air');
  assert.equal(grass.inventory.slots[1].itemId, 'dirt');
  assert.equal(grass.inventory.slots[1].qty, 2);
  assert.equal((await post({ ...common, expectedRevision: 1, operationId: 'break_stone_1', action: 'break', x: 109, y: -6, z: -52 })).status, 200);
  const placedResponse = await post({ ...common, expectedRevision: 2, operationId: 'place_float_1', action: 'place', material: 'dirt', x: 109, y: 2, z: -52 });
  assert.equal((await placedResponse.json()).error, 'not attached');
});

test('terrain operation ledger has a bounded lifetime', async () => {
  const { GameSaves } = await workerModule();
  const storage = memoryStorage(); storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ terrainRevision: 10000, terrainOperationCount: 10000,
    inventory: { selectedSlot: 0, slots: [{ itemId: 'dirt', qty: 1 }, null, null, null, null, null, null, null, null] } }));
  const saves = new GameSaves({ storage }, {});
  const response = await saves.fetch(new Request('https://saves/terrain-edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    operationId: 'ledger_full_1', action: 'place', material: 'dirt', x: 109, y: 0, z: 0, expectedRevision: 10000, farmSlot: 0
  }) }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'terrain operation limit reached');
});

test('authenticated Worker route derives the owner and broadcasts only a committed edit', async () => {
  const { GameSaves, worker, FarmerList } = await workerModule();
  const storage = memoryStorage(); storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ v: 3, inventory: { selectedSlot: 0, slots: [
    { itemId: 'dirt', qty: 2 }, null, null, null, null, null, null, null, null
  ] } }));
  const saveDO = new GameSaves({ storage }, {});
  const farmerStorage = memoryStorage(); farmerStorage.transaction = fn => fn(farmerStorage);
  farmerStorage.list = async () => new Map(farmerStorage.values);
  const farmerDO = new FarmerList({ storage: farmerStorage }, {});
  const broadcasts = [];
  const asRequest = (request, init) => request instanceof Request ? request : new Request(request, init);
  const env = {
    AUTH_CODE: 'demo-code', SESSION_SECRET: 'terrain-test-secret-which-is-long-enough',
    SAVES: { idFromName: name => name, get: () => ({ fetch: (request, init) => saveDO.fetch(asRequest(request, init)) }) },
    FARMERS: { idFromName: () => 'farmers', get: () => ({ fetch: (request, init) => farmerDO.fetch(asRequest(request, init)) }) },
    REALTIME: { idFromName: () => 'map-room', get: () => ({ fetch: async (request, init) => { broadcasts.push(await asRequest(request, init).json()); return new Response(JSON.stringify({ ok: true })); } }) },
  };
  const login = await worker.fetch(new Request('https://game.test/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', code: 'demo-code', remember: true }) }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const unauthorized = await worker.fetch(new Request('https://game.test/api/terrain/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }), env);
  assert.equal(unauthorized.status, 401);
  const response = await worker.fetch(new Request('https://game.test/api/terrain/edit', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({
    operationId: 'route_place_1', action: 'place', material: 'dirt', x: 469, y: 0, z: 0, expectedRevision: 0
  }) }), env);
  assert.equal(response.status, 200);
  const accepted = await response.json();
  assert.equal(accepted.ok, true);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].type, 'terrain-edit');
  assert.equal(broadcasts[0].email, 'owner@example.com');
  assert.deepEqual(broadcasts[0].edit, accepted.edit);
});

test('server and client agree on editable ground throughout the world and preserve collected wood', async () => {
  const { GameSaves } = await workerModule();
  const { createFarmTerrain } = await import('../js/terrain-runtime.js');
  const terrain = createFarmTerrain(0);
  const storage = memoryStorage(); storage.transaction = fn => fn(storage);
  await storage.put('state', JSON.stringify({ harvestedScenery: ['tree:0','fence:0:rail:0'], inventory: {
    selectedSlot:0, slots:[{itemId:'wood',qty:4},null,null,null,null,null,null,null,null]
  } }));
  const saves = new GameSaves({storage},{});
  const points = [[-10,-78],[1780,80],[8,-54],[0,35],[900,-66],[1000,50],[116,-40]];
  let revision = 0;
  for (const [x,z] of points) {
    assert.equal(terrain.getCell(x,-1,z),'grass');
    const response = await saves.fetch(new Request('https://saves/terrain-edit', {method:'POST',body:JSON.stringify({
      farmSlot:0,operationId:'world_dig_'+revision,expectedRevision:revision,action:'break',x,y:-1,z
    })}));
    const result=await response.json();
    assert.equal(result.ok,true,JSON.stringify(result)); revision++;
    assert.equal(result.inventory.slots[0].qty,4);
    assert.equal(result.inventory.slots[1].qty,revision);
  }
  const saved=JSON.parse(await storage.get('state'));
  assert.equal(Object.keys(saved.terrainEdits).length,points.length);
  assert.deepEqual(saved.harvestedScenery,['tree:0','fence:0:rail:0']);
});
