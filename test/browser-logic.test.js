import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect } from '../web/assets/quiz-check.js';
import { search, prepareIndex, snippet } from '../web/assets/search-core.js';

test('isCorrect single: right index, wrong index, two values', () => {
  const q = { type: 'single', answer: 1 };
  assert.equal(isCorrect(q, ['1']), true);
  assert.equal(isCorrect(q, ['0']), false);
  assert.equal(isCorrect(q, ['1', '0']), false);
});

test('isCorrect multi: same set in any order, missing one, extra one', () => {
  const q = { type: 'multi', answer: [1, 3] };
  assert.equal(isCorrect(q, ['3', '1']), true);
  assert.equal(isCorrect(q, ['1']), false);
  assert.equal(isCorrect(q, ['1', '3', '5']), false);
});

test('isCorrect true_false: string values against boolean answer', () => {
  assert.equal(isCorrect({ type: 'true_false', answer: true }, ['true']), true);
  assert.equal(isCorrect({ type: 'true_false', answer: true }, ['false']), false);
  assert.equal(isCorrect({ type: 'true_false', answer: false }, ['false']), true);
  assert.equal(isCorrect({ type: 'true_false', answer: false }, [true]), false);
});

test('isCorrect order: comma separated, odd spacing and case; wrong order fails', () => {
  const q = { type: 'order', answer: ['alpha', 'beta', 'gamma'] };
  assert.equal(isCorrect(q, ['Alpha,  beta ,GAMMA']), true);
  assert.equal(isCorrect(q, ['beta, alpha, gamma']), false);
});

test('isCorrect fill: accent and case insensitive; wrong and empty fail', () => {
  const q = { type: 'fill', answer: 'Črnomelj' };
  assert.equal(isCorrect(q, ['crnomelj']), true);
  assert.equal(isCorrect(q, ['  ČRNOMELJ ']), true);
  assert.equal(isCorrect(q, ['metlika']), false);
  assert.equal(isCorrect(q, ['']), false);
});

const entry = (slug, extra) => ({ slug, title: '', heading: '', text: '', topics: [], ...extra });

test('search: empty query returns []', () => {
  const index = prepareIndex([entry('a', { title: 'Photosynthesis' })]);
  assert.deepEqual(search(index, ''), []);
  assert.deepEqual(search(index, '   '), []);
});

test('search: every token must match', () => {
  const index = prepareIndex([entry('a', { title: 'Photosynthesis' })]);
  assert.equal(search(index, 'photosynthesis').length, 1);
  assert.equal(search(index, 'photosynthesis missing').length, 0);
});

test('search: prefix match works', () => {
  const index = prepareIndex([entry('a', { title: 'Photosynthesis' })]);
  assert.deepEqual(search(index, 'photos').map((e) => e.slug), ['a']);
});

test('search: accent-insensitive (crnomelj matches Črnomelj)', () => {
  const index = prepareIndex([entry('a', { title: 'Črnomelj' })]);
  assert.deepEqual(search(index, 'crnomelj').map((e) => e.slug), ['a']);
});

test('search: title hit ranks above text-only hit', () => {
  const index = prepareIndex([
    entry('text', { title: 'Other', text: 'photosynthesis happens here' }),
    entry('title', { title: 'Photosynthesis' }),
  ]);
  assert.deepEqual(search(index, 'photosynthesis').map((e) => e.slug), ['title', 'text']);
});

test('search: exact word ranks above prefix-only', () => {
  const index = prepareIndex([
    entry('prefix', { title: 'Category' }),
    entry('exact', { title: 'Cat' }),
  ]);
  assert.deepEqual(search(index, 'cat').map((e) => e.slug), ['exact', 'prefix']);
});

test('search: prepareIndex gives same result as raw entries', () => {
  const raw = [
    entry('a', { title: 'Photosynthesis', heading: 'Chloroplasts', text: 'green plants', topics: ['biology'] }),
    entry('b', { title: 'Printing press', text: 'Photosynthesis is unrelated', topics: ['history'] }),
  ];
  const query = 'photosynthesis';
  assert.deepEqual(search(prepareIndex(raw), query).map((e) => e.slug), search(raw, query).map((e) => e.slug));
});

test('snippet returns a window around the first matching token', () => {
  const text = 'x'.repeat(100) + ' chlorophyl ' + 'y'.repeat(200);
  const s = snippet(text, 'chlorophyl');
  assert.ok(s.includes('chlorophyl'));
});
