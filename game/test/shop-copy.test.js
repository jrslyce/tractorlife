import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID } from '../js/items.js';

function description(id) {
  return ITEM_BY_ID[id].description;
}

test('seed descriptions explain pack size and how to plant', () => {
  for (const id of ['corn_seeds', 'wheat_seeds', 'pumpkin_seeds', 'sunflower_seeds', 'pea_seeds']) {
    assert.match(description(id), /100 seeds/i, id);
    assert.match(description(id), /load them into the planter/i, id);
    assert.match(description(id), /plant/i, id);
  }
});

test('fertilizer and spray are clearly optional and explain when to use them', () => {
  assert.match(description('fertilizer'), /optional/i);
  assert.match(description('fertilizer'), /growing crop tile/i);
  assert.match(description('fertilizer'), /grow without it/i);
  assert.match(description('crop_spray'), /optional/i);
  assert.match(description('crop_spray'), /weeds or bugs/i);
  assert.match(description('crop_spray'), /healthy crops do not need spray/i);
});

test('building materials say what they are used to build or repair', () => {
  assert.match(description('wood'), /building walls/i);
  assert.match(description('roof_shingles'), /roof/i);
  assert.match(description('fence_kit'), /build a fence/i);
  assert.match(description('window_glass'), /windows/i);
  assert.match(description('metal'), /required to build or repair a farm water pump/i);
});

test('repair and water supplies explain their use and requirements', () => {
  assert.match(description('water_jug'), /orchards, animals, or irrigation/i);
  assert.match(description('repair_kit'), /fix tractor engine smoke/i);
  assert.match(description('spare_tire'), /needed to replace a tractor tire/i);
  assert.match(description('fuel_can'), /repair serious tractor engine trouble/i);
});
