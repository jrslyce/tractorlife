import test from 'node:test';
import assert from 'node:assert/strict';
import { advancedSystemsEnabled, normalizeFarmExperience } from '../js/farm-experience.js';

test('legacy and unknown farm modes preserve full behavior; simple mode is explicit', () => {
  for (const value of [undefined, null, '', 'beginner', 'hard']) {
    assert.equal(normalizeFarmExperience(value), 'full');
    assert.equal(advancedSystemsEnabled(value), true);
  }
  assert.equal(normalizeFarmExperience('simple'), 'simple');
  assert.equal(advancedSystemsEnabled('simple'), false);
});
