import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldInteraction } from '../js/world-interaction.js';

const tree = { kind: 'tree', id: 'grove-1', revision: 0, material: 'wood' };
function harness(overrides = {}, commit = () => ({ ok: true })) {
  const calls = [];
  const controller = new WorldInteraction((target, rule) => {
    calls.push({ target, rule });
    return commit(target, rule);
  });
  const input = { target: { ...tree }, toolId: 'axe', slot: 0, held: true, ...overrides };
  const step = (count = 1, dt = 0.1) => {
    let state;
    for (let i = 0; i < count; i++) state = controller.update(dt, input);
    return state;
  };
  return { controller, input, calls, step };
}

test('holding commits one exact tree reward and cannot repeat until a new hold', () => {
  const { input, calls, step } = harness();
  assert.equal(step().progress, 0);
  assert.ok(step(10).progress > 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(step(5).result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rule.quantity, 3);
  assert.equal(calls[0].target.id, tree.id);
  step(100);
  assert.equal(calls.length, 1);
  input.held = false;
  assert.equal(step().progress, 0);
  input.held = true;
  step(16);
  assert.equal(calls.length, 2);
});

test('release, lost target, disabled interaction, and explicit cancel discard progress', () => {
  for (const stop of [
    h => { h.input.held = false; },
    h => { h.input.target = null; },
    h => { h.input.enabled = false; },
    h => { h.controller.cancel(); }
  ]) {
    const h = harness();
    assert.ok(h.step(12).progress > 0);
    stop(h);
    assert.equal(h.step().progress, 0);
    Object.assign(h.input, { held: true, enabled: true, target: { ...tree } });
    h.step(4);
    assert.equal(h.calls.length, 0);
    h.step(20);
    assert.equal(h.calls.length, 1);
  }
});

test('slot, tool, mode, target identity and revision changes restart timing', () => {
  for (const change of [
    h => { h.input.slot = 1; },
    h => { h.input.toolId = 'pickaxe'; },
    h => { h.input.mode = 'build'; },
    h => { h.input.target = { ...tree, id: 'grove-2' }; },
    h => { h.input.target = { ...tree, revision: 1 }; },
    h => { h.input.target = { ...tree, kind: 'block' }; }
  ]) {
    const h = harness();
    h.step(12);
    change(h);
    assert.equal(h.step().progress, 0);
    h.step(4);
    assert.equal(h.calls.length, 0);
    h.step(60);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].target, h.input.target);
  }
});

test('invalid tool or material cannot progress or commit', () => {
  for (const target of [
    { kind: 'block', id: 1, material: 'stone' },
    { kind: 'block', id: 1, material: 'metal' }
  ]) {
    const h = harness({ target, toolId: 'axe' });
    assert.equal(h.step(100).progress, 0);
    assert.equal(h.calls.length, 0);
  }
});

test('frame time is capped and invalid or negative times never advance progress', () => {
  const h = harness();
  h.step();
  assert.ok(Math.abs(h.step(1, 30).progress - 0.1 / 1.5) < 1e-12);
  const elapsed = h.controller.elapsed;
  for (const dt of [-1, NaN, Infinity, undefined, '0.1']) {
    h.controller.update(dt, h.input);
    assert.equal(h.controller.elapsed, elapsed);
  }
  assert.equal(h.calls.length, 0);
});

test('a rejected commit is reported once without retrying while held', () => {
  const h = harness({}, () => ({ ok: false, error: 'inventory full' }));
  h.step();
  const result = h.step(15).result;
  assert.deepEqual(result, { ok: false, error: 'inventory full' });
  h.step(60);
  assert.equal(h.calls.length, 1);
});

test('fresh target descriptors with unchanged identity keep progress', () => {
  const h = harness();
  h.step();
  for (let i = 0; i < 15; i++) {
    h.input.target = { ...tree, point: { x: i, y: 1, z: 0 } };
    h.step();
  }
  assert.equal(h.calls.length, 1);
});
