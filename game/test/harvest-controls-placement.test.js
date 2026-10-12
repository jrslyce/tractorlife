import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HarvestControls } from '../js/harvest-controls.js';
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
});


test('explicit mode survives mouse movement and routes the shared action exclusively', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousListener = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
  function element() {
    return { style: {}, handlers: {}, append() {}, addEventListener(name, fn) { this.handlers[name] = fn; },
      setAttribute() {}, setPointerCapture() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; } };
  }
  globalThis.document = { createElement: element, body: element(), head: element(), addEventListener() {} };
  globalThis.addEventListener = () => {};
  try {
    let building = false, places = 0, punches = 0;
    const canvas = element();
    const controls = new HarvestControls({ scene: new THREE.Scene(), canvas,
      getBuildMode: () => building, onBuildModeChange: value => { building = value; },
      isEnabled: () => true, inventory: { getSelectedItem: () => ({ itemId: 'dirt' }) } });
    controls.resolveTarget = () => ({ kind: 'terrain', material: 'dirt' });
    controls.placeFromEvent = () => { places++; };
    controls.start = () => { punches++; controls.held = true; };
    const event = { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 200,
      preventDefault() {}, stopPropagation() {} };
    controls.modeButton.handlers.click(event);
    canvas.handlers.pointermove(event);
    assert.equal(building, true);
    controls.breakButton.handlers.pointerdown(event);
    canvas.handlers.pointerdown({ ...event, button: 2 });
    assert.equal(places, 1);
    assert.equal(punches, 0);
    assert.equal(controls.held, false);
    controls.modeButton.handlers.click(event);
    canvas.handlers.pointermove(event);
    controls.breakButton.handlers.pointerdown(event);
    assert.equal(building, false);
    assert.equal(punches, 1);
    assert.equal(places, 1);
    controls.modeButton.handlers.click(event);
    assert.equal(controls.held, false, 'switching modes cancels an active punch');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
    if (previousListener) Object.defineProperty(globalThis, 'addEventListener', previousListener); else delete globalThis.addEventListener;
  }
});
