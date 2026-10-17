import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect, questionState } from '../web/assets/quiz-check.js';
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

test('questionState: correct single is ok, closed, correct text', () => {
  const q = { type: 'single', answer: 1 };
  assert.deepEqual(questionState(q, ['1']), { ok: true, cls: 'ok', open: false, text: '✓ Correct.' });
});

test('questionState: wrong answer is bad and open', () => {
  const st = questionState({ type: 'single', answer: 1 }, ['0']);
  assert.equal(st.ok, false);
  assert.equal(st.cls, 'bad');
  assert.equal(st.open, true);
  assert.ok(st.text.startsWith('✗ Not quite'));
});

test('questionState: unanswered is bad and open', () => {
  const st = questionState({ type: 'single', answer: 1 }, []);
  assert.equal(st.ok, false);
  assert.equal(st.cls, 'bad');
  assert.equal(st.open, true);
  assert.ok(st.text.startsWith('✗ Not answered'));
});

test('questionState: fresh state, no memory between calls', () => {
  const q = { type: 'single', answer: 1 };
  assert.equal(questionState(q, ['0']).open, true);
  assert.equal(questionState(q, ['1']).open, false);
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

test('search: AI matches ai_assisted true and not ai_assisted false', () => {
  const index = prepareIndex([
    entry('assisted', { title: 'A study', text: 'no acronym here', ai_assisted: true }),
    entry('manual', { title: 'Another study', text: 'no acronym here', ai_assisted: false }),
  ]);
  assert.deepEqual(search(index, 'AI').map((e) => e.slug), ['assisted']);
});

test('search: authors are searchable (grokarmy)', () => {
  const index = prepareIndex([entry('a', { title: 'Unrelated', authors: ['GrokArmy'] })]);
  assert.deepEqual(search(index, 'grokarmy').map((e) => e.slug), ['a']);
});

test('search: short 2-character terms match (eu in title)', () => {
  const index = prepareIndex([entry('a', { title: 'EU divisions' })]);
  assert.deepEqual(search(index, 'eu').map((e) => e.slug), ['a']);
});

test('search: text hit ranks above metadata-only hit', () => {
  const index = prepareIndex([
    entry('meta', { title: 'Author index', authors: ['EU'] }),
    entry('text', { title: 'Treaty', text: 'the eu was founded' }),
  ]);
  assert.deepEqual(search(index, 'eu').map((e) => e.slug), ['text', 'meta']);
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
