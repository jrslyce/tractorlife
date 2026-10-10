import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const pointerBlock = main.match(/shopPointer\.style\.cssText = ([\s\S]*?);\nshopPointer\.innerHTML/);

test('shop pointer is centered below the Help/Settings toolbar on every viewport', () => {
  assert.ok(pointerBlock, 'shop pointer style block exists');
  const styles = [...pointerBlock[1].matchAll(/'([^']*)'/g)].map((match) => match[1]).join('');

  assert.match(styles, /left:50%/);
  assert.match(styles, /transform:translateX\(-50%\)/);
  assert.match(styles, /top:calc\(max\(10px,env\(safe-area-inset-top\)\) \+ 64px\)/);
  // Toolbar controls are 48px tall normally and 58px with larger controls;
  // the 64px offset leaves a gap below the latter, at all viewport widths.
  assert.match(main, /#hud-toolbar\s*\{[^}]*top:max\(10px,env\(safe-area-inset-top\)\)/);
  assert.match(main, /#hud-toolbar button\s*\{[^}]*min-height:48px/);
  assert.match(main, /html\[data-larger-controls="true"\] #hud-toolbar button\s*\{min-height:58px/);
});

test('shop pointer stays non-interactive and fits narrow mobile viewports', () => {
  assert.ok(pointerBlock, 'shop pointer style block exists');
  const styles = [...pointerBlock[1].matchAll(/'([^']*)'/g)].map((match) => match[1]).join('');

  assert.match(styles, /pointer-events:none/);
  assert.match(styles, /max-width:calc\(100vw - 16px\)/);
  assert.match(styles, /white-space:nowrap/);
});
