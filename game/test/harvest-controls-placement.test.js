import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('desktop and touch placement use corresponding pointer/center rays', () => {
  const source = readFileSync(new URL('../js/harvest-controls.js', import.meta.url), 'utf8');
  assert.match(source, /this\.resolveTarget\(e\)/);
  assert.match(source, /this\.touch \|\| !event && this\.getBuildMode\(\) \? this\.centerEvent\(\) : event \|\| this\.lastPointer/);
  assert.match(source, /this\.pointer\.set\(\(aim\.clientX - rect\.left\)/);
});

test('terrain blocks and regular buildables dispatch through their owning placement paths', () => {
  const source = readFileSync(new URL('../js/harvest-controls.js', import.meta.url), 'utf8');
  assert.match(source, /\['dirt', 'stone'\]\.includes\(selected\.itemId\)/);
  assert.match(source, /this\.onTerrainAction\('place', destination, selected\.itemId, selected\.itemId\)/);
  assert.match(source, /return this\.builder\.placeFromEvent\(event\)/);
  assert.match(source, /this\.placeButton\.addEventListener\('click'[\s\S]*this\.placeFromEvent\(this\.centerEvent\(\)\)/);
});
