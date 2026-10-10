import test from 'node:test';
import assert from 'node:assert/strict';
import { FarmRequests } from '../js/farm-requests.js';

test('seeded boards and day-boundary rerolls are deterministic', () => {
  const a = FarmRequests({ seed: 123, config: { requestsPerDay: 3 } });
  const b = FarmRequests({ seed: 123, config: { requestsPerDay: 3 } });
  assert.deepEqual(a.update(0, { day: 1, branches: 2, breakdowns: 1, animals: 1, repairs: 1 }), b.update(0, { day: 1, branches: 2, breakdowns: 1, animals: 1, repairs: 1 }));
  assert.deepEqual(a.update(0, { day: 2, animals: 1 }), b.update(0, { day: 2, animals: 1 }));
  assert.ok(a.list().length <= 3);
});

test('delivery checks existing harvested item ids and reports clear reasons', () => {
  const board = FarmRequests({ seed: 4, config: { requestsPerDay: 1 } });
  const [request] = board.update(0, { day: 0 });
  assert.equal(request.type, 'deliver');
  assert.deepEqual(board.complete(request.id, { inventory: { [request.itemId]: request.quantity - 1 } }).reason, 'insufficient-crops');
  const result = board.complete(request.id, { inventory: { [request.itemId]: request.quantity } });
  assert.equal(result.success, true);
  assert.equal(result.reason, 'delivered');
  assert.equal(result.reward.money, request.reward.money);
  assert.equal(board.complete(request.id).reason, 'request-not-found');
});

test('work contracts require explicit confirmation and return completion reasons', () => {
  const board = FarmRequests({ seed: 123, config: { requestsPerDay: 3 } });
  const requests = board.update(0, { day: 1, branches: 2, breakdowns: 1, animals: 1, repairs: 1 });
  for (const request of requests.filter(item => item.type !== 'deliver')) {
    const failure = board.complete(request.id, {});
    assert.equal(failure.success, false);
    const key = request.type === 'clear-branch' ? 'branchesCleared' : request.type === 'repair-breakdown' ? 'breakdownsRepaired' : request.type === 'animal-care' ? 'animalsCaredFor' : 'repairsCompleted';
    const success = board.complete(request.id, { [key]: request.quantity });
    assert.equal(success.success, true);
    assert.ok(success.reason);
  }
});

test('state round-trips including deterministic future offers', () => {
  const original = FarmRequests({ seed: 89, config: { requestsPerDay: 2 } });
  original.update(0, { day: 0 });
  const restored = FarmRequests();
  assert.equal(restored.restore(original.serialize()), true);
  assert.deepEqual(restored.update(0, { day: 1 }), original.update(0, { day: 1 }));
  assert.equal(restored.restore({}), false);
});
