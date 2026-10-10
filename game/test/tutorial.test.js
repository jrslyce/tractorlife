import test from 'node:test';
import assert from 'node:assert/strict';
import { Tutorial, TUTORIAL_STEPS } from '../js/tutorial.js';

test('tutorial is optional and advances in order through all steps', () => {
  const tutorial = new Tutorial();
  assert.equal(tutorial.getState().currentStep, null);
  assert.equal(tutorial.start().currentStep.id, 'move-to-tractor');
  const ids = [];
  while (tutorial.getState().currentStep) {
    ids.push(tutorial.getState().currentStep.id);
    tutorial.skipStep();
  }
  assert.deepEqual(ids, TUTORIAL_STEPS.map(step => step.id));
  assert.equal(tutorial.getState().completed, true);
  assert.equal(tutorial.getState().progress, 1);
});

test('first task follows the playable tractor farming loop and uses real controls', () => {
  assert.deepEqual(TUTORIAL_STEPS.map(step => step.id), [
    'move-to-tractor', 'attach-plow', 'plow-field', 'switch-to-planter', 'plant-field'
  ]);
  assert.deepEqual(TUTORIAL_STEPS.map(step => step.action), [
    'enter-tractor', 'attach-plow', 'till-field', 'equip-planter', 'plant-field'
  ]);
  assert.match(TUTORIAL_STEPS[0].text, /WASD|left stick/);
  assert.match(TUTORIAL_STEPS[0].text, /press E or tap Enter/);
  assert.match(TUTORIAL_STEPS[1].text, /tap Attach/);
  assert.match(TUTORIAL_STEPS[2].text, /plow attached/);
  assert.match(TUTORIAL_STEPS[3].text, /Next tool/);
  assert.match(TUTORIAL_STEPS[4].text, /planter/);
  assert.doesNotMatch(TUTORIAL_STEPS.map(step => step.text).join(' '), /press G|tap Interact|press T|tap Shop/);
});

test('pause blocks progress; resume and dismiss behave predictably', () => {
  const tutorial = new Tutorial();
  tutorial.start();
  assert.equal(tutorial.completeStep().currentStep.id, 'move-to-tractor', 'steps do not claim completion before the game action');
  tutorial.pause();
  assert.equal(tutorial.skipStep().currentStep.id, 'move-to-tractor');
  assert.equal(tutorial.resume().paused, false);
  assert.equal(tutorial.skipStep().currentStep.id, 'attach-plow');
  tutorial.dismiss();
  assert.equal(tutorial.getState().currentStep, null);
  assert.equal(tutorial.start().dismissed, true);
});

test('only the current step action unlocks Continue, while Skip remains available', () => {
  const tutorial = new Tutorial();
  tutorial.start();
  assert.equal(tutorial.recordAction('attach-plow'), false);
  assert.equal(tutorial.recordAction('enter-tractor'), true);
  assert.equal(tutorial.recordAction('enter-tractor'), false);
  assert.equal(tutorial.getState().actionComplete, true);
  tutorial.completeStep();
  assert.equal(tutorial.recordAction('enter-tractor'), false);
  assert.equal(tutorial.skipStep().currentStep.id, 'plow-field');
});

test('progress exports and restores, while malformed or old saves are harmless', () => {
  const original = new Tutorial();
  original.start();
  original.skipStep();
  original.pause();
  const saved = original.exportProgress();
  const restored = new Tutorial();
  assert.equal(restored.restoreProgress(saved), true);
  assert.deepEqual(restored.exportProgress(), saved);
  const before = restored.exportProgress();
  for (const bad of [null, {}, { version: 0 }, { ...saved, stepIndex: 99 }, { ...saved, paused: 'yes' },
    { ...saved, completed: true }, { ...saved, dismissed: true, paused: true }]) {
    assert.equal(restored.restoreProgress(bad), false);
    assert.deepEqual(restored.exportProgress(), before);
  }
});
