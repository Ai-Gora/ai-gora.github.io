import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLicense, checkMediaDir, checkAccessibility, sentenceWarnings } from '../scripts/style.js';
import { buildCharts, renderChart, safeDataPath } from '../scripts/charts.js';
import { loadContent } from '../scripts/lib.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aigora-style-'));
const write = (root, rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const SIDE = (license) => `file: a.png\ntitle: Leaf\nauthor: J. Novak\nsource_url: https://commons.wikimedia.org/wiki/File:Leaf.png\nlicense: ${license}\n`;
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

test('allowed licences pass', () => {
  for (const l of ['CC-BY-SA-4.0', 'CC-BY-4.0', 'CC-BY-SA-3.0', 'CC0-1.0', 'PD', 'NASA']) {
    assert.deepEqual(checkLicense({ title: 't', author: 'a', source_url: 'https://x', license: l }), [], l);
  }
});

test('NC, ND and Unsplash/Pexels/Pixabay are blocked', () => {
  for (const l of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-SA-4.0', 'Unsplash', 'Pexels License', 'pixabay']) {
    const e = checkLicense({ title: 't', author: 'a', source_url: 'https://x', license: l });
    assert.match(e.join('\n'), /is not allowed/, l);
  }
});

test('unknown licence and missing TASL fields fail', () => {
  assert.match(checkLicense({ title: 't', author: 'a', source: 's', license: 'All rights reserved' }).join(), /not on the allowed list/);
  const e = checkLicense({ author: 'a', license: 'CC0-1.0' });
  assert.ok(e.some((x) => /'title'/.test(x)));
  assert.ok(e.some((x) => /'source_url'/.test(x)));
});

test('checkMediaDir: missing sidecar, good sidecar, bad licence, generated chart', () => {
  const r = tmp();
  write(r, 'media/leaf/a.png', 'x');
  assert.match(checkMediaDir(r).join(), /media\/leaf\/a\.png: image has no licence sidecar a\.png\.license\.yaml/);
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC-BY-SA-4.0'));
  assert.deepEqual(checkMediaDir(r), []);
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC-BY-NC-4.0'));
  assert.match(checkMediaDir(r).join(), /a\.png\.license\.yaml: licence CC-BY-NC-4.0 is not allowed/);
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC0-1.0'));
  write(r, 'media/leaf/c/chart.svg', '<svg/>');
  write(r, 'media/leaf/c/chart.vl.json', '{}');
  write(r, 'media/leaf/c/data.csv', 'a\n1\n');
  assert.deepEqual(checkMediaDir(r), []);
  write(r, 'media/leaf/other.svg', '<svg/>');
  assert.match(checkMediaDir(r).join(), /other\.svg: image has no licence sidecar/);
});

test('images need alt text of 125 characters or fewer', () => {
  assert.deepEqual(checkAccessibility('![Leaf cross-section showing chloroplasts](a.png)'), []);
  assert.match(checkAccessibility('Text ![](a.png)').join(), /image a\.png has no alt text/);
  assert.match(checkAccessibility(`![${'x'.repeat(126)}](a.png)`).join(), /126 characters, max 125/);
  assert.deepEqual(checkAccessibility('```md\n![](ignored.png)\n```'), []);
});

test('mermaid needs accTitle and accDescr', () => {
  const ok = '```mermaid\nflowchart LR\n  accTitle: Review flow\n  accDescr: Draft goes to review.\n  A --> B\n```';
  assert.deepEqual(checkAccessibility(ok), []);
  assert.deepEqual(checkAccessibility(ok.replace('accDescr: Draft goes to review.', 'accDescr {\n Draft goes to review.\n }')), []);
  assert.deepEqual(checkAccessibility(ok.replace(/ {2}accDescr.*\n/, '')), ['line 1: mermaid diagram 1 has no accDescr (STYLE V2)']);
  assert.deepEqual(checkAccessibility(`${ok}\n\n${ok.replace(/ {2}accTitle.*\n/, '')}`), ['line 8: mermaid diagram 2 has no accTitle (STYLE V2)']);
});

test('sentence-length warnings: >25 words warns, code and short sentences do not', () => {
  const body = `Short sentence here.\n\n${words(30)}. Another short one.\n\n\`\`\`\n${words(40)}.\n\`\`\`\n\n- ${words(26)}[^1]\n- ${words(5)}`;
  const w = sentenceWarnings(body);
  assert.deepEqual(w.map((x) => [x.line, x.words]), [[3, 30], [9, 26]]);
  assert.deepEqual(sentenceWarnings(`${words(25)}.`), []);
  assert.deepEqual(sentenceWarnings(`[[a-b|${words(19)}]] and [[c]] [t](https://x/y) ${words(3)}.`), []);
});

test('sentence-length warnings never fail the build', () => {
  const r = tmp();
  for (const d of ['articles', 'quizzes', 'topics', 'media']) fs.cpSync(path.join(REPO, d), path.join(r, d), { recursive: true });
  const f = path.join(r, 'articles/science/photosynthesis.md');
  const t = fs.readFileSync(f, 'utf8');
  const n = t.replace('Plants take in carbon dioxide and water.[^1]', `Plants take in carbon dioxide and water and ${words(30)}.[^1]`);
  assert.notEqual(n, t, 'fixture edit must apply');
  fs.writeFileSync(f, n);
  const res = spawnSync(process.execPath, [path.join(REPO, 'scripts/build.js'), '--root', r, '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /style warning\(s\) \(not failing\)/);
  assert.match(res.stderr, /photosynthesis\.md: line \d+: sentence has 3\d words/);
});

const SPEC = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', data: { url: 'data.csv' }, mark: 'bar', encoding: { x: { field: 'year', type: 'ordinal' }, y: { field: 'n', type: 'quantitative' } } };

test('Vega-Lite charts render to SVG; stale, missing and unsafe charts fail', async () => {
  const r = tmp();
  write(r, 'media/demo/c/data.csv', 'year,n\n2020,3\n2021,5\n');
  write(r, 'media/demo/c/chart.vl.json', JSON.stringify(SPEC));
  write(r, 'media/demo/c/README.md', 'Source: test data.\n');
  let res = await buildCharts(r);
  assert.match(res.errors.join(), /chart\.svg missing/);
  res = await buildCharts(r, { write: true });
  assert.deepEqual(res.errors, []);
  assert.match(res.outputs['media/demo/c/chart.svg'], /^<svg[\s\S]*<\/svg>\n$/);
  assert.deepEqual((await buildCharts(r)).errors, []);
  write(r, 'media/demo/c/data.csv', 'year,n\n2020,3\n2021,9\n');
  assert.match((await buildCharts(r)).errors.join(), /chart\.svg is out of date/);
  fs.rmSync(path.join(r, 'media/demo/c/README.md'));
  assert.match((await buildCharts(r)).errors.join(), /chart needs README\.md/);
  write(r, 'media/demo/c/chart.vl.json', JSON.stringify({ ...SPEC, data: { url: '../../../../etc/passwd' } }));
  assert.match((await buildCharts(r)).errors.join(), /must be a regular file inside the chart folder/);
});

test('every non-chart media file needs a sidecar, not only images', () => {
  const r = tmp();
  write(r, 'media/leaf/notes.pdf', 'x');
  write(r, 'media/leaf/clip.mp4', 'x');
  write(r, 'media/.gitkeep', '');
  const e = checkMediaDir(r);
  assert.match(e.join(), /notes\.pdf: media file has no licence sidecar notes\.pdf\.license\.yaml/);
  assert.match(e.join(), /clip\.mp4: media file has no licence sidecar/);
  assert.equal(e.length, 2);
  write(r, 'media/leaf/notes.pdf.license.yaml', SIDE('CC-BY-4.0'));
  write(r, 'media/leaf/clip.mp4.license.yaml', SIDE('CC-BY-ND-4.0'));
  assert.deepEqual(checkMediaDir(r).length, 1);
  write(r, 'media/leaf/c/chart.vl.json', '{}');
  write(r, 'media/leaf/c/data.csv', 'a\n1\n');
  write(r, 'media/leaf/c/README.md', 'x');
  assert.equal(checkMediaDir(r).length, 1);
});

test('alt and Mermaid errors use file line numbers', () => {
  const r = tmp();
  for (const d of ['articles', 'quizzes', 'topics', 'media']) fs.cpSync(path.join(REPO, d), path.join(r, d), { recursive: true });
  const f = path.join(r, 'articles/science/photosynthesis.md');
  const t = fs.readFileSync(f, 'utf8');
  const n = t.replace('Plants take in carbon dioxide and water.[^1]', 'Plants take in carbon dioxide and water.[^1]\n\n![](leaf.png)\n\n```mermaid\nflowchart LR\n  A --> B\n```');
  assert.notEqual(n, t, 'fixture edit must apply');
  fs.writeFileSync(f, n);
  const lines = n.split('\n');
  const img = lines.indexOf('![](leaf.png)') + 1;
  const mm = lines.indexOf('```mermaid') + 1;
  const { errors } = loadContent(r);
  assert.ok(errors.includes(`articles/science/photosynthesis.md: line ${img}: image leaf.png has no alt text (STYLE V4)`), errors.join('\n'));
  assert.ok(errors.includes(`articles/science/photosynthesis.md: line ${mm}: mermaid diagram 1 has no accTitle (STYLE V2)`), errors.join('\n'));
});

const chartDir = (spec) => {
  const r = tmp();
  write(r, 'media/demo/c/data.csv', 'year,n,u\n2020,3,a.html\n2021,5,b.html\n');
  write(r, 'media/demo/c/README.md', 'Source: test data.\n');
  write(r, 'media/demo/c/chart.vl.json', JSON.stringify(spec));
  return { r, dir: path.join(r, 'media/demo/c') };
};

test('symlinked data files and symlinked folders are refused (check and load)', async () => {
  const secret = path.join(tmp(), 'secret.csv');
  fs.writeFileSync(secret, 'year,n\nSECRET,1\n');
  const { r, dir } = chartDir({ ...SPEC, data: { url: 'link.csv' } });
  fs.symlinkSync(secret, path.join(dir, 'link.csv'));
  assert.throws(() => safeDataPath(dir, 'link.csv'), /no symlinks/);
  fs.mkdirSync(path.join(dir, 'real'));
  fs.symlinkSync(path.dirname(secret), path.join(dir, 'sub'));
  assert.throws(() => safeDataPath(dir, 'sub/secret.csv'), /no symlinks/);
  for (const bad of ['/etc/hostname', 'file:///etc/hostname', 'https://example.com/x.csv', '../c/../../x.csv', '.', 'real']) assert.throws(() => safeDataPath(dir, bad), /no symlinks/, bad);
  assert.equal(safeDataPath(dir, 'data.csv'), path.join(fs.realpathSync(dir), 'data.csv'));
  const res = await buildCharts(r, { write: true });
  assert.match(res.errors.join(), /chart data url 'link\.csv' must be a regular file inside the chart folder/);
  assert.equal(Object.keys(res.outputs).length, 0);
});

test('SVG hrefs stay relative (no absolute build paths)', async () => {
  const { dir } = chartDir({ data: { values: [{ a: 1 }] }, mark: { type: 'image', width: 10, height: 10 }, encoding: { url: { value: 'pic.png' }, x: { field: 'a', type: 'quantitative' } } });
  const svg = await renderChart(dir);
  assert.match(svg, /href="pic\.png"/);
  assert.ok(!svg.includes(os.tmpdir()) && !svg.includes(dir));
});

test('href encoding channel renders without crashing', async () => {
  const { dir } = chartDir({ ...SPEC, encoding: { ...SPEC.encoding, href: { field: 'u' } } });
  const svg = await renderChart(dir);
  assert.match(svg, /^<svg/);
  assert.ok(!svg.includes(dir));
});

test('render errors are reported, not thrown uncaught', async () => {
  const { r } = chartDir({ mark: 'nonsense-mark', data: { values: [] } });
  const res = await buildCharts(r);
  assert.match(res.errors.join(), /chart render failed/);
});
