import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathProgress } from '../web/assets/path-progress.js';

test('pathProgress: no scores', () => {
  assert.deepEqual(pathProgress(['a', 'b']), { done: [false, false], count: 0, total: 2, grown: 0, next: 0 });
});
test('pathProgress: stem grows to the last done step; next is the first not done', () => {
  const p = pathProgress(['a', 'b', 'c'], { b: { right: 3, total: 3 } });
  assert.deepEqual(p.done, [false, true, false]);
  assert.equal(p.count, 1); assert.equal(p.grown, 2 / 3); assert.equal(p.next, 0);
});
test('pathProgress: all done', () => {
  const p = pathProgress(['a', 'b'], { a: { right: 1, total: 1 }, b: { right: 2, total: 2 } });
  assert.equal(p.next, -1); assert.equal(p.grown, 1);
});
test('pathProgress: half right counts, below half and empty quizzes do not', () => {
  assert.deepEqual(pathProgress(['a', 'b', 'c'], { a: { right: 1, total: 2 }, b: { right: 1, total: 3 }, c: { right: 0, total: 0 } }).done, [true, false, false]);
});
test('pathProgress: empty path', () => {
  assert.deepEqual(pathProgress([]), { done: [], count: 0, total: 0, grown: 0, next: -1 });
});
