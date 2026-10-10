import test from 'node:test';
import assert from 'node:assert/strict';
import { CropProblems, WEEDS, BUGS } from '../js/crop-problems.js';

const states = new Array(9).fill('growing');

test('bug patch can remain local, spread to a neighbor, or die out', () => {
  const local = new CropProblems(9, 3);
  local.infest(4, BUGS);
  local._random = () => 0.99;
  local.update(5, states);
  assert.equal(local.getStats().bugs, 1);

  const spreading = new CropProblems(9, 3);
  spreading.infest(4, BUGS);
  const rolls = [0.9, 0.01, 0]; // survive, spread, choose left neighbor
  spreading._random = () => rolls.length ? rolls.shift() : 0.99;
  spreading.update(5, states);
  assert.equal(spreading.getStats().bugs, 2);
  assert.equal(spreading.flags[3], BUGS);
  assert.equal(spreading.flags[2], 0); // no chain-spreading within the same tick

  const recovering = new CropProblems(9, 3);
  recovering.infest(4, BUGS);
  const recovery = [0.01];
  recovering._random = () => recovery.length ? recovery.shift() : 0.99;
  recovering.update(5, states);
  assert.equal(recovering.getStats().bugs, 0);
});

test('random weed/bug outbreaks only choose crop tiles and stay bounded', () => {
  const crops = new Array(100).fill('untilled');
  crops.fill('growing', 20, 50);
  const problems = new CropProblems(100, 10, 5);
  for (let i = 0; i < 200; i++) problems.update(5, crops);
  assert.ok(problems.flags.some(n => n > 0));
  assert.ok(problems.flags.every((flag, i) => !flag || crops[i] === 'growing'));
  assert.ok(problems.flags.filter(Boolean).length <= Math.ceil(30 * 0.12));
});

test('spray clears both problems, protects temporarily, and expires', () => {
  const problems = new CropProblems(9, 3);
  problems.infest(4, BUGS);
  problems.infest(4, WEEDS);
  assert.equal(problems.growthMultiplier(4), 0.45);
  assert.equal(problems.spray(4), true);
  assert.equal(problems.spray(4), false);
  assert.equal(problems.infest(4, BUGS), false);
  problems._random = () => 0.99;
  problems.update(40, states);
  assert.equal(problems.infest(4, BUGS), false);
  problems.update(5, states);
  assert.equal(problems.infest(4, BUGS), true);
});

test('seeded problem simulation is frame-independent and survives reload', () => {
  const a = new CropProblems(9, 3, 321);
  const b = new CropProblems(9, 3, 321);
  a.update(100, states);
  for (let i = 0; i < 400; i++) b.update(0.25, states);
  assert.deepEqual(a.serialize(), b.serialize());
  a.update(2.5, states);
  const restored = new CropProblems(9, 3, 321);
  restored.restore(a.serialize());
  a.update(50, states);
  restored.update(50, states);
  assert.deepEqual(a.serialize(), restored.serialize());
});

test('neighbors do not wrap rows and empty fields cannot develop pests', () => {
  const problems = new CropProblems(9, 3);
  assert.deepEqual(problems.neighbors(2), [1, 5]);
  problems.update(100, new Array(9).fill('tilled'));
  assert.deepEqual(problems.getStats(), { weeds: 0, bugs: 0 });
  problems.infest(4, BUGS);
  problems.update(5, new Array(9).fill('harvested'));
  assert.equal(problems.getStats().bugs, 0);
});

test('legacy or malformed problem saves restore safely and compactly', () => {
  const problems = new CropProblems(1600, 40);
  assert.ok(JSON.stringify(problems.serialize()).length < 100);
  problems.restore({ tiles: '-1,3,19;ffff,3,19;4,9,zz;5,2,zz', randomState: -1, elapsed: -10 });
  assert.equal(problems.flags[4], 0);
  assert.equal(problems.flags[5], BUGS);
  assert.equal(problems.protection[5], 45);
  assert.equal(problems.elapsed, 0);
  problems.restore(undefined);
  assert.deepEqual(problems.getStats(), { weeds: 0, bugs: 0 });
});
