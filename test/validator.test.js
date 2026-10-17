import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, buildOutputs, mergeOutputs, mediaOutputs, resolveOutDir } from '../scripts/lib.js';

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

test('missing Sources section fails', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('## Sources {#sources}\n', '')));
  hasError(errors, /missing '## Sources \{#sources\}' section/);
});

test('multi answer with duplicate indexes fails', () => {
  const { errors } = fixture((d) => edit(d, 'quizzes/photosynthesis.yaml', (t) => t.replace('type: single', 'type: multi').replace('answer: 0', 'answer: [0, 0]')));
  hasError(errors, /q1: multi answer indexes must be unique/);
});

test('unknown topic fails', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('topics: [biology, science]', 'topics: [biology, astrology]')));
  hasError(errors, /unknown topic 'astrology'/);
});

test('media without licence sidecar fails', () => {
  const { errors } = fixture((d) => { fs.mkdirSync(path.join(d, 'media/photosynthesis'), { recursive: true }); fs.writeFileSync(path.join(d, 'media/photosynthesis/leaf.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); });
  hasError(errors, /image has no licence sidecar leaf.png.license.yaml/);
});

test('build outputs follow the data contract', () => {
  const { content } = fixture();
  const out = buildOutputs(content);
  for (const f of ['llms.txt', 'llms-full.txt', 'data/graph.json', 'data/backlinks.json', 'data/search-index.json', 'data/articles.json', 'data/topics.json', 'data/quizzes/index.json', 'data/manifest.json', 'a/photosynthesis.jsonld']) assert.ok(out[f], `missing ${f}`);
  const graph = JSON.parse(out['data/graph.json']);
  assert.equal(graph.nodes.length, content.articles.length);
  const back = JSON.parse(out['data/backlinks.json']);
  assert.deepEqual(back['printing-press'].map((b) => b.slug).sort(), ['bela-krajina-dialects', 'photosynthesis']);
  const ld = JSON.parse(out['a/photosynthesis.jsonld']);
  assert.equal(ld.license, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.match(out['llms.txt'], /^# Aigora\n\n> /);
  assert.match(out['llms.txt'], /## Optional/);
});

test('search-index entries expose authors and ai_assisted metadata', () => {
  const { content } = fixture();
  const index = JSON.parse(buildOutputs(content)['data/search-index.json']);
  assert.ok(index.length > 0);
  for (const e of index) {
    assert.ok(Array.isArray(e.authors), `authors must be an array for ${e.id}`);
    assert.equal(typeof e.ai_assisted, 'boolean', `ai_assisted must be a boolean for ${e.id}`);
  }
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigora-out-'));
  for (const d of ['articles', 'quizzes', 'topics', 'media']) fs.cpSync(path.join(REPO, d), path.join(tmpDir, d), { recursive: true });
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/build.js'), '--root', tmpDir, '--out', '.'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing --out/);
  assert.ok(fs.existsSync(path.join(tmpDir, 'articles')));
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

test('translation that does not link back fails', () => {
  const { errors } = fixture((d) => edit(d, 'articles/linguistics/belokranjska-narecja.md', (t) => t.replace('translations: {en: aig-000003}\n', '')));
  hasError(errors, /bela-krajina-dialects\.md: translation sl: 'aig-000006' does not link back/);
});

test('mergeOutputs rejects duplicate output paths and merges distinct maps', () => {
  assert.throws(() => mergeOutputs({ 'x.html': 'a' }, { 'x.html': 'b' }), /duplicate output path: x\.html/);
  assert.deepEqual(mergeOutputs({ 'a.html': '1' }, { 'b.html': '2' }), { 'a.html': '1', 'b.html': '2' });
});

test("topic id 'index' is reserved", () => {
  const { errors } = fixture((d) => fs.writeFileSync(path.join(d, 'topics/index.yaml'), 'id: index\ntitle: Index\ndescription: x\nparent: null\nrelated: []\n'));
  hasError(errors, /topic id 'index' is reserved/);
});

test("article slug 'index' is reserved", () => {
  const { errors } = fixture((d) => {
    fs.renameSync(path.join(d, 'articles/science/photosynthesis.md'), path.join(d, 'articles/science/index.md'));
    edit(d, 'articles/science/index.md', (t) => t.replace('slug: photosynthesis', 'slug: index'));
  });
  hasError(errors, /slug 'index' is reserved/);
});

test('citation inside a ### subsection counts for its ## section', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => { const n = t.replace(
    'Photosynthesis produces the oxygen in the atmosphere.[^3]\nPrinted botany texts spread this knowledge after the [[printing-press|printing press]].',
    'Photosynthesis produces the oxygen in the atmosphere.\nPrinted botany texts spread this knowledge after the [[printing-press|printing press]].\n\n### Detail {#detail}\n\nMost oxygen is made by phytoplankton in the ocean.[^1]'
  ); assert.notEqual(n, t, 'fixture edit must apply'); return n; }));
  assert.deepEqual(errors, []);
});

test('### subsection citation does not count for the next ## section', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t
    .replace('Plants take in carbon dioxide and water.[^1]', 'Plants take in carbon dioxide and water.')
    .replace('They release oxygen as a by-product.[^1]', 'They release oxygen as a by-product.')
    .replace('The overall equation is 6 CO2 + 6 H2O + light → C6H12O6 + 6 O2.[^2]', 'The overall equation is 6 CO2 + 6 H2O + light → C6H12O6 + 6 O2.\n\n### Detail {#detail}\n\nThe equation balances atoms on both sides.[^2]')
    .replace('In plants, photosynthesis takes place in chloroplasts.[^2]', 'In plants, photosynthesis takes place in chloroplasts.')
    .replace('Chloroplasts contain the green pigment chlorophyll.[^2]', 'Chloroplasts contain the green pigment chlorophyll.')));
  hasError(errors, /section '#chloroplasts' has no citation/);
  assert.ok(!errors.some((e) => e.includes("section '#inputs-outputs' has no citation")));
});

test('article JSON output escapes < and keeps jsonld.headline', () => {
  const { content } = fixture((d) => edit(d, PHOTO, (t) => t.replace('title: Photosynthesis', 'title: "Photo</script>"')));
  const out = buildOutputs(content)['a/photosynthesis.json'];
  assert.ok(!out.includes('<'));
  assert.equal(JSON.parse(out).jsonld.headline, 'Photo</script>');
});

test('a ## Quiz section that points to the quiz file needs no citation (STYLE S2)', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('## Sources {#sources}', '## Quiz {#quiz}\n\nThe quiz for this article is in `quizzes/photosynthesis.yaml`.\nThe site shows it on the quiz page for this article.\n\n## Sources {#sources}')));
  assert.deepEqual(errors, []);
});

test('article images must be existing media/ files', () => {
  const { errors } = fixture((d) => edit(d, PHOTO, (t) => t.replace('## Sources {#sources}', '![Leaf](media/photosynthesis/leaf.png)\n![Remote](https://example.com/x.png)\n\n## Sources {#sources}')));
  hasError(errors, /image media\/photosynthesis\/leaf\.png does not exist/);
  hasError(errors, /image https:\/\/example\.com\/x\.png must be a media\/ path/);
});

test('committed raster media are copied to the site; sidecars are not published', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigora-media-'));
  fs.mkdirSync(path.join(dir, 'media/a'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'media/a/photo.webp'), Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]));
  fs.writeFileSync(path.join(dir, 'media/a/photo.webp.license.yaml'), 'file: photo.webp\n');
  const out = mediaOutputs(dir);
  assert.deepEqual(Object.keys(out), ['media/a/photo.webp']);
  assert.ok(Buffer.isBuffer(out['media/a/photo.webp']));
});


test('only a real Quiz pointer is exempt from citations (review #9.3)', () => {
  const add = (sec) => (d) => edit(d, PHOTO, (t) => { const n = t.replace('## Sources {#sources}', `${sec}\n\n## Sources {#sources}`); assert.notEqual(n, t); return n; });
  hasError(fixture(add('## Fun facts {#quiz}\n\nPlants are green.')).errors, /section '#quiz' is not a valid quiz pointer: heading must be exactly 'Quiz'/);
  const ptr = '## Quiz {#quiz}\n\nThe quiz for this article is in `quizzes/photosynthesis.yaml`.';
  hasError(fixture(add(`${ptr}\n\n### More {#more}\n\nUncited claim.`)).errors, /not a valid quiz pointer: it must not have subsections/);
  hasError(fixture((d) => { add(ptr)(d); fs.rmSync(path.join(d, 'quizzes/photosynthesis.yaml')); }).errors, /quizzes\/photosynthesis\.yaml does not exist/);
  const sl = 'articles/geography/upravna-delitev-drzav-eu.md';
  hasError(fixture((d) => edit(d, sl, (t) => t.replace('## Kviz {#quiz}', '## Quiz {#quiz}'))).errors, /upravna-delitev-drzav-eu\.md: section '#quiz' is not a valid quiz pointer: heading must be exactly 'Kviz'/);
});

test('the Quiz section body is a fixed form: pointer line, optional fixed phrase, blank lines (review #9 round 2)', () => {
  const add = (sec) => (d) => edit(d, PHOTO, (t) => { const n = t.replace('## Sources {#sources}', `${sec}\n\n## Sources {#sources}`); assert.notEqual(n, t); return n; });
  const ptr = 'The quiz for this article is in `quizzes/photosynthesis.yaml`.';
  assert.deepEqual(fixture(add(`## Quiz {#quiz}\n\n${ptr}`)).errors, [], 'pointer line alone is fine');
  hasError(fixture(add(`## Quiz {#quiz}\n\n${ptr}\nPlants make 90% of all oxygen.`)).errors, /only the fixed quiz lines are allowed, found: "Plants make 90% of all oxygen\."/);
  hasError(fixture(add('## Quiz {#quiz}\n\nThe site shows it on the quiz page for this article.')).errors, /it must contain the line: The quiz for this article is in `quizzes\/photosynthesis\.yaml`\./);
  hasError(fixture(add('## Quiz {#quiz}\n\nThe quiz for this article is in `quizzes/printing-press.yaml`.')).errors, /it must contain the line/);
  hasError(fixture(add(`## Quiz {#quiz}\n\n${ptr}\n\n- Light is needed.`)).errors, /found: "- Light is needed\."/);
  const sl = 'articles/geography/upravna-delitev-drzav-eu.md';
  hasError(fixture((d) => edit(d, sl, (t) => t.replace('Spletno mesto ga prikaže na strani s kvizom za ta članek.', 'Slovenija ima 300 občin.'))).errors, /upravna-delitev-drzav-eu\.md: .*found: "Slovenija ima 300 občin\."/);
});
