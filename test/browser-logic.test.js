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
    entry('assisted', { anchor: null, title: 'A study', text: 'no acronym here', ai_assisted: true }),
    entry('manual', { anchor: null, title: 'Another study', text: 'no acronym here', ai_assisted: false }),
  ]);
  assert.deepEqual(search(index, 'AI').map((e) => e.slug), ['assisted']);
});

test('search: authors are searchable (grokarmy)', () => {
  const index = prepareIndex([entry('a', { anchor: null, title: 'Unrelated', authors: ['GrokArmy'] })]);
  assert.deepEqual(search(index, 'grokarmy').map((e) => e.slug), ['a']);
});

test('search: short 2-character terms match (eu in title)', () => {
  const index = prepareIndex([entry('a', { title: 'EU divisions' })]);
  assert.deepEqual(search(index, 'eu').map((e) => e.slug), ['a']);
});

test('search: text hit ranks above metadata-only hit', () => {
  const index = prepareIndex([
    entry('meta', { anchor: null, title: 'Author index', authors: ['EU'] }),
    entry('text', { anchor: null, title: 'Treaty', text: 'the eu was founded' }),
  ]);
  assert.deepEqual(search(index, 'eu').map((e) => e.slug), ['text', 'meta']);
});

test('search: metadata attaches only to the anchor-null (#top) entry', () => {
  const index = prepareIndex([
    entry('a', { anchor: null, title: 'Intro', authors: ['grokarmy'], ai_assisted: true }),
    entry('a', { anchor: 'x', title: 'Section X', authors: ['grokarmy'], ai_assisted: true }),
    entry('a', { anchor: 'y', title: 'Section Y', authors: ['grokarmy'], ai_assisted: true }),
  ]);
  assert.deepEqual(search(index, 'AI').map((e) => e.anchor), [null]);
  assert.deepEqual(search(index, 'grokarmy').map((e) => e.anchor), [null]);
});

test('search: ai matches every article with a #top metadata entry', () => {
  const index = prepareIndex([
    entry('a', { anchor: null, ai_assisted: true }),
    entry('b', { anchor: null, ai_assisted: true }),
  ]);
  assert.equal(search(index, 'ai').length, 2);
});

test('search: body-text prefix hit beats a metadata hit', () => {
  const index = prepareIndex([
    entry('A', { title: 'Alpha', anchor: null, ai_assisted: true }),
    entry('B', { title: 'Beta', anchor: null, text: 'aims and goals' }),
  ]);
  assert.deepEqual(search(index, 'ai').map((e) => e.slug), ['B', 'A']);
});

test('search: metadata is exact-only (grok does not match grokarmy)', () => {
  const index = prepareIndex([entry('a', { anchor: null, authors: ['grokarmy'] })]);
  assert.deepEqual(search(index, 'grok'), []);
});

test('search: one-letter query exact-matches but never prefix-matches', () => {
  const index = prepareIndex([
    entry('prefix', { title: 'EU energy' }),
    entry('exact', { title: 'e' }),
  ]);
  assert.deepEqual(search(index, 'e').map((e) => e.slug), ['exact']);
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

test('search: opts.lang keeps only matching entries; empty or missing lang keeps all', () => {
  const index = prepareIndex([
    entry('en', { title: 'A study', lang: 'en' }),
    entry('sl', { title: 'A study', lang: 'sl' }),
  ]);
  assert.deepEqual(search(index, 'study', { lang: 'sl' }).map((e) => e.slug), ['sl']);
  assert.equal(search(index, 'study', {}).length, 2);
  assert.equal(search(index, 'study', { lang: '' }).length, 2);
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

const metlikaFixture = () => prepareIndex([
  entry('m', { anchor: null, title: 'Bela Krajina', ai_assisted: true, text: 'intro' }),
  entry('m', { anchor: 'south', title: 'Bela Krajina', heading: 'South', text: 'around metlika the dialect' }),
  entry('x', { anchor: null, title: 'Other', ai_assisted: true }),
]);

test('search: multi-word query borrows #top metadata for a body section (ai metlika)', () => {
  assert.deepEqual(search(metlikaFixture(), 'ai metlika').map((e) => [e.slug, e.anchor]), [['m', 'south']]);
});

test('search: borrowed match returns one entry per article', () => {
  const index = prepareIndex([
    entry('m', { anchor: null, title: 'T', ai_assisted: true }),
    entry('m', { anchor: 'a', title: 'T', text: 'metlika one' }),
    entry('m', { anchor: 'b', title: 'T', text: 'metlika two' }),
  ]);
  assert.equal(search(index, 'ai metlika').length, 1);
});

test('search: single-word metadata query still hits only #top entries', () => {
  assert.deepEqual(search(metlikaFixture(), 'ai').map((e) => e.anchor), [null, null]);
});

test('search: borrowing never crosses articles', () => {
  const index = prepareIndex([
    entry('a', { anchor: null, title: 'A', ai_assisted: false }),
    entry('a', { anchor: 's', title: 'A', text: 'metlika' }),
    entry('b', { anchor: null, title: 'B', ai_assisted: true }),
  ]);
  assert.deepEqual(search(index, 'ai metlika'), []);
});

test('search: borrowing respects opts.lang', () => {
  assert.deepEqual(search(metlikaFixture(), 'ai metlika', { lang: 'sl' }), []);
});
