import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, buildOutputs, resolveOutDir } from '../scripts/lib.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  hasError(errors, /Key claims bullet has no citation: "Photosynthesis releases oxygen."/);
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

test('one uncited Key claims bullet fails even if another is cited', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('- It happens in chloroplasts in plants.[^2]', '- It happens in chloroplasts in plants.')));
  hasError(errors, /Key claims bullet has no citation: "It happens in chloroplasts in plants."/);
});

test('claim section without citation fails; Sources section is exempt', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('Chloroplasts contain the green pigment chlorophyll.[^2]', 'Chloroplasts contain chlorophyll.').replace('In plants, photosynthesis takes place in chloroplasts.[^2]', 'In plants, photosynthesis takes place in chloroplasts.')));
  hasError(errors, /section '#chloroplasts' has no citation/);
  assert.ok(!errors.some((e) => /#sources/.test(e)));
});

test('--out guard refuses root, parent and outside paths', () => {
  for (const bad of ['.', '..', '/tmp/x', '../elsewhere', 'dist/../..']) assert.throws(() => resolveOutDir(REPO, bad), /refusing --out/, bad);
  assert.equal(resolveOutDir(REPO, 'dist'), path.join(fs.realpathSync(REPO), 'dist'));
});

test('build.js exits non-zero on --out . and leaves the repo intact', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/build.js'), '--out', '.'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing --out/);
  assert.ok(fs.existsSync(path.join(REPO, 'package.json')));
});

test('JSON-LD escapes < as \\u003c', () => {
  const { content } = fixture((d) => edit(d, PHOTO, (t) => t.replace('title: Photosynthesis', 'title: "Photo</script><b>"')));
  const out = buildOutputs(content);
  assert.ok(!out['a/photosynthesis.jsonld'].includes('<'));
  assert.match(out['a/photosynthesis.jsonld'], /Photo\\u003c\/script>\\u003cb>/);
  assert.equal(JSON.parse(out['a/photosynthesis.jsonld']).headline, 'Photo</script><b>');
});

test('translation pointing at missing id fails', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('lang: en', 'lang: en\ntranslations: {sl: aig-999999}')));
  hasError(errors, /translation sl: 'aig-999999' does not exist/);
});

test('translation pointing at existing id with wrong lang fails', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('lang: en', 'lang: en\ntranslations: {sl: aig-000002}')));
  hasError(errors, /translation sl: 'aig-000002' has lang 'en'/);
});
