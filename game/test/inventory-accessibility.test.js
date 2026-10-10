import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/inventory.js', import.meta.url), 'utf8');

test('hotbar targets remain at least 48px with focus and larger-control affordances', () => {
  assert.match(source, /width:clamp\(48px,/);
  assert.match(source, /height:clamp\(48px,/);
  assert.match(source, /#vt-hotbar button:focus-visible/);
  assert.match(source, /html\[data-larger-controls="true"\] #vt-hotbar button\{min-width:56px;min-height:56px\}/);
});

test('hotbar slot names describe contents and quantity, including empty slots', () => {
  assert.match(source, /btn\.setAttribute\('aria-label', btn\.title\)/);
  assert.match(source, /btn\.title = 'Empty slot ' \+ \(i \+ 1\)/);
});
