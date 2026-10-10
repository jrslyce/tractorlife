import test from 'node:test';
import assert from 'node:assert/strict';
import { cropGrade, cropGrowthFactor, harvestSoil, plantRotation, SOIL_START } from '../js/soil-health.js';
import { makeField, TileState } from './helpers/field.js';

test('soil health rewards crop rotation and pea legumes without making depleted fields inert', () => {
  assert.equal(plantRotation('corn', 'wheat'), true);
  assert.equal(plantRotation('corn', 'corn'), false);
  assert.ok(cropGrowthFactor(0) > 0);
  assert.ok(cropGrowthFactor(80, true) > cropGrowthFactor(80, false));
  assert.equal(harvestSoil(80, 'wheat'), 71);
  assert.equal(harvestSoil(80, 'peas'), 84);
});

test('crop quality is deterministic and responds to soil, rotation, and pests', () => {
  assert.equal(cropGrade({ fertility: 90, cropType: 'wheat' }), 'premium');
  assert.equal(cropGrade({ fertility: 72, cropType: 'corn', previousCrop: 'wheat' }), 'premium');
  assert.equal(cropGrade({ fertility: 70, cropType: 'corn', pests: 1 }), 'standard');
  assert.equal(cropGrade({ fertility: 20, cropType: 'corn' }), 'low');
});

test('field rotations, fertility and premium harvest yield survive save restore', () => {
  const field = makeField('corn', TileState.READY, 1, 1);
  field._soilFertility[0] = 95;
  const first = field.applyEffect(0, 0, 1, 'harvest', 0, 'corn');
  assert.equal(first.produce.harvest_corn, 2);
  assert.deepEqual(first.quality, { premium: 1, standard: 0, low: 0 });
  assert.equal(field._soilFertility[0], 86);
  const saved = field.serialize();
  const restored = makeField('wheat', TileState.TILLED, 1, 1);
  assert.equal(restored.restore(saved), true);
  assert.equal(restored._lastCropTypes[0], 'corn');
  assert.equal(restored._soilFertility[0], 86);
  restored._states[0] = TileState.TILLED;
  const planted = restored.applyEffect(0, 0, 1, 'plant', 0, 'wheat');
  assert.equal(planted.affected, 1);
  assert.equal(restored._rotated[0], 1);
  assert.equal(restored._soilFertility[0], 86);
  assert.equal(SOIL_START, 72);
});

test('premium combine crops remain standing when their bonus exceeds remaining bin capacity', () => {
  const field = makeField('corn', TileState.READY, 1, 1);
  field._soilFertility[0] = 95;
  const before = field.serialize();
  assert.equal(field.applyEffect(0, 0, 1, 'harvest', 0, 'corn', 1, 1).affected, 0);
  assert.deepEqual(field.serialize(), before);
  assert.equal(field.applyEffect(0, 0, 1, 'harvest', 0, 'corn', 2, 2).produceCount, 2);
});

test('premium hand-picked crops check capacity for the whole yield before mutation', () => {
  const field = makeField('pumpkin', TileState.READY, 1, 1);
  field._soilFertility[0] = 95;
  const before = field.serialize();
  assert.equal(field.harvestAt(0, 0, (id, qty) => qty <= 1), null);
  assert.deepEqual(field.serialize(), before);
  assert.equal(field.harvestAt(0, 0, (id, qty) => qty <= 2).quantity, 2);
});
