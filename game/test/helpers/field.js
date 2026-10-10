import { readFile } from 'node:fs/promises';
import { CropProblems } from '../../js/crop-problems.js';

// Real simulation methods without a GPU or rendering allocation.
const source = await readFile(new URL('../../js/field.js', import.meta.url), 'utf8');
export const { Field, TileState } = await import('data:text/javascript;base64,' +
  Buffer.from(source.replace("import * as THREE from 'three';", 'const THREE = {};')
    .replace("'./crop-problems.js'", JSON.stringify(new URL('../../js/crop-problems.js', import.meta.url).href))).toString('base64'));

export function makeField(crop = 'wheat', state = TileState.PLANTED, count = 9, cols = 3) {
  const field = Object.create(Field.prototype);
  Object.assign(field, { count, cols, rows: Math.ceil(count / cols), tile: 1, originX: 0, originZ: 0,
    _states: new Array(count).fill(state), _cropTypes: new Array(count).fill(crop),
    _timers: new Float32Array(count), _fertilized: new Uint8Array(count),
    _tx: Array.from({ length: count }, (_, i) => i % cols),
    _tz: Array.from({ length: count }, (_, i) => Math.floor(i / cols)),
    _timedCount: state === TileState.READY ? 0 : count,
    _tally: { tilled: 0, planted: 0, sprayed: 0, harvested: 0 }, _refresh() {},
    _problems: new CropProblems(count, cols, 123) });
  return field;
}

export function grow(field, seconds) {
  for (let i = 0; i < seconds * 4; i++) field.update(0.25, { problems: false });
}
