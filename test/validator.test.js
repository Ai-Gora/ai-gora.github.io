import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContent, buildOutputs } from '../scripts/lib.js';

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

// Copy the real content into a temp dir, apply a mutation, validate.
function fixture(mutate = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigora-'));
  for (const d of ['articles', 'quizzes', 'topics', 'media']) fs.cpSync(path.join(REPO, d), path.join(dir, d), { recursive: true });
  mutate(dir);
  return loadContent(dir);
}
const edit = (dir, rel, fn) => { const p = path.join(dir, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
const PHOTO = 'articles/science/photosynthesis.md';
const hasError = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected error matching ${re}, got:\n${errors.join('\n')}`);

test('sample content is valid', () => {
  const { errors } = fixture();
  assert.deepEqual(errors, []);
});

test('missing frontmatter is reported', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace(/^---[\s\S]*?\n---\n/, '')));
  hasError(errors, /photosynthesis\.md: missing YAML frontmatter/);
});

test('schema violation: bad level and missing id', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('level: intro', 'level: expert').replace('id: aig-000001\n', '')));
  hasError(errors, /frontmatter schema: \/level must be equal to one of the allowed values/);
  hasError(errors, /must have required property 'id'/);
});

test('unknown frontmatter key is rejected', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('level: intro', 'level: intro\nmood: happy')));
  hasError(errors, /must NOT have additional properties 'mood'/);
});

test('broken wikilink slug and anchor', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('[[printing-press|printing press]]', '[[no-such-page]] and [[printing-press#nope]]')));
  hasError(errors, /broken wikilink \[\[no-such-page\]\]/);
  hasError(errors, /anchor '#nope' not found in printing-press/);
});

test('citation to unknown source and uncited source', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replaceAll('[^2]', '[^9]')));
  hasError(errors, /citation \[\^9\] has no matching source id 9/);
  hasError(errors, /source 2 is never cited/);
});

test('key claims without citation fails', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('- Photosynthesis releases oxygen.[^1]\n- It happens in chloroplasts in plants.[^2]', '- Photosynthesis releases oxygen.')));
  hasError(errors, /Key claims section has no citation/);
});

test('quiz ref to missing anchor fails', () => {
  const { errors } = fixture((d) => edit(d, 'quizzes/photosynthesis.yaml', (t) => t.replace('photosynthesis#inputs-outputs', 'photosynthesis#missing')));
  hasError(errors, /ref 'photosynthesis#missing' does not point to an existing article anchor/);
});

test('quiz answer out of range fails', () => {
  const { errors } = fixture((d) => edit(d, 'quizzes/photosynthesis.yaml', (t) => t.replace('answer: 0', 'answer: 7')));
  hasError(errors, /q1: answer must be an option index/);
});

test('unknown topic fails', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('topics: [biology, science]', 'topics: [biology, astrology]')));
  hasError(errors, /unknown topic 'astrology'/);
});

test('media without licence sidecar fails', () => {
  const { errors } = fixture((d) => { fs.mkdirSync(path.join(d, 'media/photosynthesis'), { recursive: true }); fs.writeFileSync(path.join(d, 'media/photosynthesis/leaf.png'), 'x'); });
  hasError(errors, /media file has no licence sidecar/);
});

test('build outputs follow the data contract', () => {
  const { content } = fixture();
  const out = buildOutputs(content);
  for (const f of ['llms.txt', 'llms-full.txt', 'data/graph.json', 'data/backlinks.json', 'data/search-index.json', 'data/articles.json', 'data/topics.json', 'data/quizzes/index.json', 'data/manifest.json', 'a/photosynthesis.jsonld']) assert.ok(out[f], `missing ${f}`);
  const graph = JSON.parse(out['data/graph.json']);
  assert.equal(graph.nodes.length, 3);
  const back = JSON.parse(out['data/backlinks.json']);
  assert.deepEqual(back['printing-press'].map((b) => b.slug).sort(), ['bela-krajina-dialects', 'photosynthesis']);
  const ld = JSON.parse(out['a/photosynthesis.jsonld']);
  assert.equal(ld.license, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.match(out['llms.txt'], /^# Aigora\n\n> /);
  assert.match(out['llms.txt'], /## Optional/);
});
