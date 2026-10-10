import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGameAction, formatGameReason } from '../js/game-messages.js';

test('common internal actions become player-facing language', () => {
  assert.equal(formatGameAction('clear-branch'), 'clear fallen branches');
  assert.equal(formatGameAction('repair-breakdown'), 'repair the vehicle');
  assert.equal(formatGameAction('build-channel'), 'build an irrigation channel');
  assert.equal(formatGameAction('animal-care'), 'care for an animal');
});

test('common result reasons use concise player-facing messages', () => {
  assert.equal(formatGameReason('insufficient-resources'), 'You do not have the supplies needed for that.');
  assert.equal(formatGameReason('insufficient-crops'), 'You do not have enough crops to deliver.');
  assert.equal(formatGameReason('branches-cleared'), 'Branches cleared!');
  assert.equal(formatGameReason('no-water-system'), 'Build a channel or pump before irrigating.');
});

test('unknown actions and reasons degrade safely without exposing keys', () => {
  assert.equal(formatGameAction('mystery-task'), 'mystery task');
  assert.equal(formatGameAction(null), 'continue');
  assert.equal(formatGameReason('unexpected-error_code', 'clear-branch'), 'Could not clear fallen branches: unexpected error_code.');
  assert.equal(formatGameReason(null), 'That action could not be completed. Please try again.');
});

test('resource failures explain an amount and a practical source when costs are known', () => {
  assert.equal(formatGameReason('insufficient-resources', 'build-bridge', { wood: 8, stone: 4 }),
    'You need 8 wood and 4 stone. Buy wood at the shop or collect branches.');
});
