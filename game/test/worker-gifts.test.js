import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSaves, SharedWorld, RealtimeRoom } from '../../worker.js';
import { ITEMS } from '../js/items.js';

function fixture(initial) {
  const values = new Map([['state', JSON.stringify(initial)]]);
  const storage = { get: async key => values.get(key), put: async (key, value) => {
    if (typeof key === 'object') for (const [k, v] of Object.entries(key)) values.set(k, v);
    else values.set(key, value);
  } };
  storage.transaction = fn => fn(storage);
  const saves = new GameSaves({ storage }, {});
  return { storage, load: () => JSON.parse(values.get('state')),
    post: (path, body) => saves.fetch(new Request('https://saves/' + path, {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }
    })) };
}
const emptyInventory = () => ({ v: 1, selectedSlot: -1, slots: new Array(9).fill(null) });

test('stale autosaves cannot undo a gift payment, and refunds remain idempotent', async () => {
  const f = fixture({ money: 100, inventory: emptyInventory() });
  const gift = { requestId: 'gift_payment_1', from: 'a@example.com', to: 'b@example.com', itemId: 'wood', qty: 2 };
  assert.equal((await f.post('gift-debit', gift)).status, 200);
  assert.equal((await f.post('gift-debit', gift)).status, 200);
  assert.equal(f.load().money, 76);
  assert.equal((await f.post('save', { state: { money: 100, inventory: emptyInventory() } })).status, 200);
  assert.equal(f.load().money, 76);
  assert.equal((await f.post('save', { state: { money: 76, giftBalanceAdjustment: -24, inventory: emptyInventory() } })).status, 200);
  assert.equal(f.load().money, 76);
  await f.post('gift-refund', gift);
  await f.post('gift-refund', gift);
  assert.equal(f.load().money, 100);
  await f.post('save', { state: { money: 76, giftBalanceAdjustment: -24 } });
  assert.equal(f.load().money, 100);
});

test('an unobserved received gift survives stale autosaves and is not duplicated after consumption', async () => {
  const f = fixture({ money: 20, inventory: emptyInventory() });
  const gift = { requestId: 'gift_credit_1', from: 'a@example.com', itemId: 'corn_seeds', qty: 2 };
  await f.post('gift-credit', gift);
  await f.post('gift-credit', gift);
  assert.equal(f.load().inventory.slots[0].qty, 200);
  await f.post('save', { state: { money: 20, inventory: emptyInventory() } });
  assert.equal(f.load().inventory.slots[0].qty, 200);
  assert.deepEqual(f.load().appliedGiftIds, [gift.requestId]);
  const observed = f.load();
  observed.inventory.slots[0] = null; // Player used all the seeds.
  await f.post('save', { state: observed });
  assert.equal(f.load().inventory.slots[0], null);
});

test('gift catalog rejects inherited object keys without mutating saves', async () => {
  const f = fixture({ money: 100, inventory: emptyInventory() });
  const before = f.load();
  for (const itemId of ['__proto__', 'constructor', 'toString']) {
    const body = { requestId: 'invalid_gift_1', from: 'a@example.com', to: 'b@example.com', qty: 1, itemId };
    assert.equal((await f.post('gift-debit', body)).status, 400);
    assert.equal((await f.post('gift-credit', body)).status, 400);
  }
  assert.deepEqual(f.load(), before);
});

test('every purchasable shop item can be gifted with the catalog price and pack size', async () => {
  for (const item of ITEMS.filter(item => item.available !== false && item.price > 0)) {
    const f = fixture({ money: 1000, inventory: emptyInventory() });
    const body = { requestId: 'catalog_gift_1', from: 'a@example.com', to: 'b@example.com', qty: 1, itemId: item.id };
    assert.equal((await f.post('gift-debit', body)).status, 200, item.id);
    assert.equal(f.load().money, 1000 - item.price);
    assert.equal((await f.post('gift-credit', body)).status, 200, item.id);
    assert.equal(f.load().inventory.slots[0].qty, item.pack || 1);
  }
});

test('a full stale inventory cannot silently discard a committed gift', async () => {
  const f = fixture({ money: 0, inventory: emptyInventory() });
  await f.post('gift-credit', { requestId: 'gift_full_123', from: 'a@example.com', itemId: 'wood', qty: 1 });
  const before = f.load();
  const slots = Array.from({ length: 9 }, (_, i) => ({ itemId: 'other_' + i, qty: 1 }));
  assert.equal((await f.post('save', { state: { money: 0, inventory: { slots } } })).status, 409);
  assert.deepEqual(f.load(), before);
});

test('shared roads reject farm land and out-of-world coordinates', async () => {
  const f = fixture({});
  const world = new SharedWorld({ storage: f.storage }, {});
  const post = tile => world.fetch(new Request('https://world/place', { method: 'POST', body: JSON.stringify(tile) }));
  assert.equal((await post({ id: 'asphalt', x: 10, z: 0 })).status, 403);
  assert.equal((await post({ id: 'asphalt', x: 2000, z: 35 })).status, 400);
  assert.equal((await post({ id: 'asphalt', x: 10, z: 35 })).status, 200);
  assert.equal((await post({ id: 'asphalt', x: 10, z: 35 })).status, 200);
  assert.equal((await (await world.fetch(new Request('https://world/read'))).json()).roads.length, 1);
});

test('realtime room preserves authenticated identity and independently throttles pose/build', () => {
  const messages = [];
  let attachment = { email: 'owner@example.com' };
  const socket = { deserializeAttachment: () => attachment, serializeAttachment: data => { attachment = data; } };
  const room = new RealtimeRoom({ getWebSockets: () => [{ send: raw => messages.push(JSON.parse(raw)) }] }, {});
  room.webSocketMessage(socket, JSON.stringify({ type: 'pose', email: 'spoof@example.com', pose: { x: 1, z: 35, theta: 0, mode: 'walking', machine: null } }));
  room.webSocketMessage(socket, JSON.stringify({ type: 'build', entry: { id: 'asphalt', x: 1, z: 35 } }));
  assert.deepEqual(messages.map(msg => msg.type), ['pose', 'build']);
  assert.ok(messages.every(msg => msg.email === 'owner@example.com'));
  attachment.lastBuildAt = 0;
  room.webSocketMessage(socket, JSON.stringify({ type: 'build', entry: { id: 'wood', x: 1, z: 0 } }));
  assert.equal(messages.length, 2); // owner's hashed slot is not slot zero.
});
