import test from 'node:test';
import assert from 'node:assert/strict';
import { Climate } from '../js/climate.js';

test('forecast is deterministic, season-aware, bounded, and does not advance climate', () => {
  const climate = new Climate({ seed: 718, dayDuration: 10, daysPerSeason: 2 });
  const before = climate.serialize();
  const forecast = climate.getForecast(4);
  assert.equal(forecast.length, 4);
  assert.deepEqual(forecast, climate.getForecast(4));
  assert.deepEqual(climate.serialize(), before);
  assert.deepEqual(forecast.map(day => day.day), [2, 3, 4, 5]);
  assert.deepEqual(forecast.map(day => day.season), ['spring', 'summer', 'summer', 'autumn']);
  assert.ok(forecast.every(day => ['clear', 'rain', 'drought', 'frost', 'wind', 'storm'].includes(day.weather)));
  assert.equal(climate.getForecast(99).length, 7);
});

test('forecast follows restored seed and calendar position without trusting active overrides', () => {
  const climate = new Climate({ seed: 19, dayDuration: 5 });
  climate.setWeather('storm');
  const expected = climate.getForecast(2);
  const restored = new Climate();
  restored.restore(climate.serialize());
  assert.deepEqual(restored.getForecast(2), expected);
  assert.equal(climate.getState().weather, 'storm');
});
