import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/wagon.js', import.meta.url), 'utf8');

test('cargo panel declares modal semantics, labelled regions, live feedback and named slots', () => {
  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="wagon-panel-title"/);
  assert.match(source, /data-row="hotbar" aria-labelledby="wagon-hotbar-label"/);
  assert.match(source, /data-row="wagon" aria-labelledby="wagon-hold-label"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /b\.setAttribute\('aria-label', b\.title\)/);
  assert.match(source, /b\.setAttribute\('aria-label', 'Empty slot'\)/);
});

test('cargo controls meet 48px minimum and implement focus containment and Escape', () => {
  assert.match(source, /\.wp-slot \{[^}]*width: 52px; height: 52px/s);
  assert.match(source, /\.wp-close \{[^}]*min-height: 48px/s);
  assert.match(source, /e\.key === 'Tab'/);
  assert.match(source, /e\.key === 'Escape'/);
  assert.match(source, /this\._root\.querySelector\('\.wp-close'\)\.focus\(\)/);
  assert.match(source, /this\._returnFocus\.focus\(\)/);
});

test('opening and closing preserves the prior gameplay lock', () => {
  assert.match(source, /this\._previousLock = window\.VT_LOCKED/);
  assert.match(source, /window\.VT_LOCKED = true/);
  assert.match(source, /window\.VT_LOCKED = this\._previousLock/);
  assert.match(source, /if \(this\._open\) return/);
});
