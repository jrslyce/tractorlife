import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('login has explicit accessible names and status feedback, and browser zoom is allowed', () => {
  assert.match(html, /aria-label="Email address"/);
  assert.match(html, /aria-label="Secret code"/);
  assert.match(html, /id="login-msg" role="status" aria-live="polite"/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  assert.match(html, /canvas \{ display: block; touch-action: pinch-zoom; \}/);
});

test('new players can choose guided, Simple Farm, or Full Farm before entering the world', () => {
  assert.match(main, /id="onboarding-start"/);
  assert.match(main, /id="onboarding-focused"/);
  assert.match(main, /id="onboarding-explore"/);
  assert.match(main, /Simple Farm pauses optional advanced systems/);
  assert.match(main, /Full Farm · all systems/);
  assert.match(main, /experienceMode: farmExperience/);
  assert.match(main, /farmExperience = normalizeFarmExperience\(s\.experienceMode\)/);
});

test('tutorial continues only after completing matching in-game actions', () => {
  assert.match(main, /state\.actionComplete \? '' : ' disabled'/);
  assert.match(main, /function recordTutorialAction\(action\)/);
  for (const action of ['enter-tractor', 'attach-plow', 'equip-planter', 'till-field', 'plant-field']) {
    assert.ok(main.includes("recordTutorialAction('" + action + "')"), 'missing tutorial action hook: ' + action);
  }
});
