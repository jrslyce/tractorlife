import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTileValues, decodeTileValues } from '../js/field-save.js';
import { makeField, TileState } from './helpers/field.js';

test('tile packing is lossless for repeated, varied, and legacy tile values', () => {
  for (const input of [new Array(1584).fill(72), new Array(1584).fill('wheat'), '0'.repeat(1584), [0, 1, 2, 3], [0.01, 4.3, 0, 0]]) {
    const packed = JSON.parse(JSON.stringify(encodeTileValues(input)));
    const decoded = decodeTileValues(packed, input.length);
    assert.deepEqual(Array.from(decoded), Array.from(input));
    assert.ok(JSON.stringify(packed).length <= JSON.stringify(input).length);
    assert.deepEqual(decodeTileValues(input, input.length), input);
  }
});

test('malformed packed runs cannot allocate beyond the field or partially restore states', () => {
  for (const runs of [[999999999, 0], [0, 0], [-1, 0], [3.5, 0], [8, 0], [9], [9, {}], [9, Infinity]]) {
    assert.equal(decodeTileValues({ rle: 1, length: 9, runs }, 9), null);
  }
  assert.equal(decodeTileValues({ rle: 1, length: 999999999, runs: [999999999, 0] }, 9), null);
  const field = makeField();
  assert.equal(field.restore({ states: { rle: 1, length: 9, runs: [10, 0] } }), false);
  assert.equal(field._states[0], TileState.PLANTED);
});

test('field saves round-trip crop, timer, fertilizer, soil and rotation state, including legacy shapes', () => {
  const original = makeField('wheat', TileState.GROWING, 1584, 44);
  original._timers.fill(3.25);
  original._fertilized.fill(1);
  original._lastCropTypes.fill('corn');
  original._rotated.fill(1);
  original._soilFertility.fill(61);
  original._cropTypes[12] = 'peas';
  original._states[15] = TileState.HARVESTED;
  const saved = JSON.parse(JSON.stringify(original.serialize()));
  for (const data of [saved, Object.fromEntries(Object.entries(saved).map(([key, value]) =>
    [key, value && value.rle === 1 ? decodeTileValues(value, original.count) : value]))]) {
    const restored = makeField('generic', TileState.UNTILLED, 1584, 44);
    assert.equal(restored.restore(data), true);
    for (const key of ['_states', '_timers', '_cropTypes', '_fertilized', '_soilFertility', '_lastCropTypes', '_rotated']) {
      assert.deepEqual(restored[key], original[key], key);
    }
  }
});

test('forty-field snapshots stay below the existing Worker limit for new and planted farms', () => {
  for (const state of [TileState.UNTILLED, TileState.GROWING]) {
    const field = makeField('wheat', state, 1584, 44);
    field._timers.fill(state === TileState.GROWING ? 21.25 : 0);
    const fields = Array.from({ length: 4 }, () => field.serialize());
    const snapshot = { v: 3, world: { v: 1, assignedSlot: 0, farms: Array.from({ length: 10 }, (_, farmSlot) => ({ farmSlot, fields })) } };
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 524288 / 4);
  }
});
