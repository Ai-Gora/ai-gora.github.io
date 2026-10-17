import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLicense, checkMediaDir, checkAccessibility, sentenceWarnings } from '../scripts/style.js';
import { buildCharts as buildChartsRaw, renderChart as renderChartRaw, safeDataPath, sanitizeChartUrl } from '../scripts/charts.js';

// Regression guard: every SVG produced by any test in this file is checked for "javascript:" once all tests finish.
// aria-label attributes are excluded: Vega-Lite echoes data values (including the hostile ones fed in below) there as inert, escaped text.
const SVGS = [];
const renderChart = async (dir) => { const svg = await renderChartRaw(dir); SVGS.push(svg); return svg; };
const buildCharts = (...a) => buildChartsRaw(...a); // its renders go through renderChartRaw; the guard sees direct renderChart calls
const scriptable = (svg) => /javascript:/i.test(svg.replace(/aria-label="[^"]*"/g, ''));
after(() => {
  assert.ok(SVGS.length >= 8, `guard saw only ${SVGS.length} SVGs`);
  const bad = SVGS.filter(scriptable);
  assert.equal(bad.length, 0, `javascript: found in ${bad.length} generated SVG(s)`);
});
import { loadContent, mediaOutputs } from '../scripts/lib.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aigora-style-'));
const write = (root, rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
// Minimal valid file headers, so magic-byte checks pass.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
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

test('checkMediaDir: missing sidecar, good sidecar, bad licence, orphan sidecar', () => {
  const r = tmp();
  write(r, 'media/leaf/a.png', PNG);
  assert.match(checkMediaDir(r).join(), /media\/leaf\/a\.png: image has no licence sidecar a\.png\.license\.yaml/);
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC-BY-SA-4.0'));
  assert.deepEqual(checkMediaDir(r), []);
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC-BY-NC-4.0'));
  assert.match(checkMediaDir(r).join(), /a\.png\.license\.yaml: licence CC-BY-NC-4.0 is not allowed/);
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC0-1.0'));
  write(r, 'media/leaf/b.jpg', JPG); write(r, 'media/leaf/b.jpg.license.yaml', SIDE('CC0-1.0'));
  write(r, 'media/leaf/c.webp', WEBP); write(r, 'media/leaf/c.webp.license.yaml', SIDE('CC0-1.0'));
  assert.deepEqual(checkMediaDir(r), []);
  write(r, 'media/leaf/gone.png.license.yaml', SIDE('CC0-1.0'));
  assert.deepEqual(checkMediaDir(r), ['media/leaf/gone.png.license.yaml: sidecar for a file that does not exist']);
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

test('charts: sources in charts/, only a PNG is published; stale, hand-edited, missing and unsafe charts fail', async () => {
  const r = tmp();
  write(r, 'charts/demo/c/data.csv', 'year,n\n2020,3\n2021,5\n');
  write(r, 'charts/demo/c/chart.vl.json', JSON.stringify({ ...SPEC, title: 'Demo' }));
  write(r, 'charts/demo/c/README.md', 'Source: test data.\n');
  let res = await buildCharts(r);
  assert.match(res.errors.join(), /render\.json missing/);
  res = await buildCharts(r, { write: true });
  assert.deepEqual(res.errors, []);
  assert.equal(res.count, 1);
  const png = fs.readFileSync(path.join(r, 'media/demo/c.png'));
  assert.ok(png.subarray(1, 4).equals(Buffer.from('PNG')), 'a real PNG is written to media/<slug>/<chart>.png');
  assert.ok(!fs.existsSync(path.join(r, 'charts/demo/c/chart.svg')) && !fs.existsSync(path.join(r, 'media/demo/c.svg')), 'no SVG is written');
  assert.deepEqual(checkMediaDir(r), [], 'generated PNG and sidecar pass the media checks');
  assert.deepEqual(Object.keys(mediaOutputs(r)), ['media/demo/c.png']);
  assert.deepEqual((await buildCharts(r)).errors, []);
  write(r, 'charts/demo/c/data.csv', 'year,n\n2020,3\n2021,9\n');
  assert.match((await buildCharts(r)).errors.join(), /media\/demo\/c\.png is out of date/);
  await buildCharts(r, { write: true });
  write(r, 'media/demo/c.png', Buffer.concat([png, Buffer.from([0])]));
  assert.match((await buildCharts(r)).errors.join(), /does not match render\.json/);
  fs.rmSync(path.join(r, 'charts/demo/c/README.md'));
  assert.match((await buildCharts(r)).errors.join(), /chart needs README\.md/);
  write(r, 'charts/demo/c/chart.vl.json', JSON.stringify({ ...SPEC, data: { url: '../../../../etc/passwd' } }));
  assert.match((await buildCharts(r)).errors.join(), /must be a regular file inside the chart folder/);
  write(r, 'charts/Demo_x/c/chart.vl.json', JSON.stringify(SPEC));
  assert.match((await buildCharts(r)).errors.join(), /chart folders must be charts\/<slug>\/<chart>/);
});

test('only allowlisted raster types may live in media/ (STYLE V7)', () => {
  const r = tmp();
  write(r, 'media/leaf/notes.pdf', '%PDF-1.4');
  write(r, 'media/leaf/notes.pdf.license.yaml', SIDE('CC0-1.0'));
  write(r, 'media/leaf/clip.mp4', 'x');
  write(r, 'media/leaf/c/data.csv', 'a\n1\n');
  write(r, 'media/.gitkeep', '');
  const e = checkMediaDir(r);
  assert.match(e.join(), /notes\.pdf: file type \.pdf is not published/);
  assert.match(e.join(), /clip\.mp4: file type \.mp4 is not published/);
  assert.match(e.join(), /data\.csv: file type \.csv is not published/);
  assert.equal(e.length, 3);
  assert.throws(() => mediaOutputs(r), /file type \.(csv|mp4|pdf) is not published.*refusing to publish/);
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
  write(r, 'charts/demo/c/data.csv', 'year,n,u\n2020,3,a.html\n2021,5,b.html\n');
  write(r, 'charts/demo/c/README.md', 'Source: test data.\n');
  write(r, 'charts/demo/c/chart.vl.json', JSON.stringify(spec));
  return { r, dir: path.join(r, 'charts/demo/c') };
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
  assert.equal(res.count, 0);
  assert.ok(!fs.existsSync(path.join(r, 'media/demo/c.png')), 'nothing is published for a refused chart');
});

test('SVG hrefs stay relative (no absolute build paths)', async () => {
  const { dir } = chartDir({ data: { values: [{ a: 1 }] }, mark: { type: 'image', width: 10, height: 10 }, encoding: { url: { value: 'pic.png' }, x: { field: 'a', type: 'quantitative' } } });
  write(dir, 'pic.png', 'PNG');
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

const linkChart = (rows) => {
  const { r, dir } = chartDir({ data: { url: 'links.csv' }, mark: 'point', encoding: { x: { field: 'x', type: 'quantitative' }, href: { field: 'u' } } });
  write(dir, 'links.csv', `x,u\n${rows.map((u, i) => `${i},"${u.replace(/"/g, '""')}"`).join('\n')}\n`);
  return { r, dir };
};
const hrefs = (svg) => [...svg.matchAll(/xlink:href="([^"]*)"/g)].map((m) => m[1]);

test('chart links: javascript:, data:, http:, file:, protocol-relative and obfuscated URLs are dropped', async () => {
  const hostile = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'http://example.org/', 'file:///etc/passwd', '//evil.example/x', '\\\\evil.example\\x', 'vbscript:msgbox', 'https://user:pw@example.org/', 'missing.html', '../../outside.html'];
  const { dir } = linkChart(hostile);
  const svg = await renderChart(dir);
  const h = hrefs(svg);
  assert.equal(h.length, hostile.length);
  assert.ok(h.every((x) => x === ''), h.join(' | '));
  assert.ok(!scriptable(svg));
  assert.ok(!/evil\.example|example\.org|file:|data:text/.test(svg.replace(/aria-label="[^"]*"/g, '')));
});

test('chart links: https URLs and relative in-folder files are kept', async () => {
  const { dir } = linkChart(['https://example.org/a?b=1', 'data.csv']);
  const svg = await renderChart(dir);
  assert.deepEqual(hrefs(svg), ['https://example.org/a?b=1', 'data.csv']);
});

test('chart images: only relative, real, non-symlink in-folder files load', async () => {
  const img = (u) => ({ data: { values: [{ a: 1 }] }, mark: { type: 'image', width: 10, height: 10 }, encoding: { url: { value: u }, x: { field: 'a', type: 'quantitative' } } });
  const imageHref = async (u, setup = () => {}) => {
    const { dir } = chartDir(img(u));
    write(dir, 'pic.png', 'PNG');
    setup(dir);
    const svg = await renderChart(dir);
    return /<image[^>]*xlink:href="([^"]*)"/.exec(svg)[1];
  };
  assert.equal(await imageHref('pic.png'), 'pic.png');
  assert.equal(await imageHref('https://evil.example/p.png'), '');
  assert.equal(await imageHref('//evil.example/p.png'), '');
  assert.equal(await imageHref('data:image/png;base64,AAAA'), '');
  assert.equal(await imageHref('javascript:alert(1)'), '');
  assert.equal(await imageHref('missing.png'), '');
  assert.equal(await imageHref('link.png', (dir) => fs.symlinkSync(path.join(dir, 'pic.png'), path.join(dir, 'link.png'))), '');
});

test('sanitizeChartUrl unit cases', () => {
  const { dir } = chartDir(SPEC);
  write(dir, 'pic.png', 'PNG');
  assert.equal(sanitizeChartUrl(dir, 'https://example.org/', 'href'), 'https://example.org/');
  assert.equal(sanitizeChartUrl(dir, 'https://example.org/', 'image'), '');
  assert.equal(sanitizeChartUrl(dir, 'pic.png', 'image'), 'pic.png');
  assert.equal(sanitizeChartUrl(dir, 'pic.png', undefined), '');
  for (const bad of ['javascript:alert(1)', 'data:,x', 'http://example.org/', '//example.org/', 'file:///etc/passwd', 'https:\n//x', '\u0000javascript:x', '/etc/hostname', '']) {
    assert.equal(sanitizeChartUrl(dir, bad, 'href'), '', JSON.stringify(bad));
  }
});

test('guard detector catches javascript: outside aria-label', () => {
  assert.ok(scriptable('<a xlink:href="javascript:alert(1)">'));
  assert.ok(!scriptable('<path aria-label="u: javascript:alert(1)"/>'));
});

test('media symlinks are refused by checkMediaDir and by the build copy step (review #9.1)', () => {
  const r = tmp();
  const secret = path.join(tmp(), 'secret.png');
  fs.writeFileSync(secret, 'host file');
  fs.mkdirSync(path.join(r, 'media/leaf'), { recursive: true });
  fs.symlinkSync(secret, path.join(r, 'media/leaf/a.png'));
  write(r, 'media/leaf/a.png.license.yaml', SIDE('CC0-1.0'));
  assert.match(checkMediaDir(r).join(), /media\/leaf\/a\.png: is a symlink/);
  assert.throws(() => mediaOutputs(r), /media\/leaf\/a\.png: is a symlink.*refusing to publish/);
  // A symlinked folder inside media/ is refused too.
  const outside = tmp();
  fs.writeFileSync(path.join(outside, 'b.png'), 'host file');
  fs.symlinkSync(outside, path.join(r, 'media/dir'));
  assert.match(checkMediaDir(r).join(), /media\/dir: is a symlink/);
  // A symlinked media/ folder is refused.
  const r2 = tmp();
  fs.mkdirSync(path.join(outside, 'x'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'x/c.png'), 'host file');
  fs.writeFileSync(path.join(outside, 'x/c.png.license.yaml'), SIDE('CC0-1.0'));
  fs.symlinkSync(outside, path.join(r2, 'media'));
  assert.match(checkMediaDir(r2).join(), /symlinked media\/ folder/);
  assert.throws(() => mediaOutputs(r2), /refusing to publish/);
});

// Sentry's round-2 bypass samples for the old regex denylist. Any SVG is now refused, whatever it contains.
const BYPASSES = {
  'svg-ns-script': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg>',
  'attr-gt': '<svg xmlns="http://www.w3.org/2000/svg"><rect data-x=">" onload="alert(1)"/></svg>',
  'iframe': '<svg xmlns="http://www.w3.org/2000/svg"><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example/"/></svg>',
  'set-href': '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="http://evil.example/"/><text>x</text></a></svg>',
  'entity-url': '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(&#104;ttp://evil.example/p)"/></svg>',
  'css-escape': '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:url(\\68 ttp://evil.example/p)}</style><rect/></svg>',
  'plain': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
};
const utf16 = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);

test('any SVG in media/ is rejected, including the review bypasses and SVGs renamed to .png (review #9 round 2)', () => {
  const r = tmp();
  const files = [];
  for (const [n, svg] of Object.entries(BYPASSES)) {
    files.push([`media/x/${n}.svg`, svg], [`media/x/${n}.png`, svg]);
  }
  files.push(['media/x/utf16.svg', utf16(BYPASSES['svg-ns-script'])], ['media/x/utf16.png', utf16(BYPASSES['svg-ns-script'])]);
  for (const [f, data] of files) { write(r, f, data); write(r, `${f}.license.yaml`, SIDE('CC0-1.0')); }
  const errs = checkMediaDir(r);
  for (const [f] of files) {
    const re = f.endsWith('.svg') ? /file type \.svg is not published/ : /content does not match its \.png extension/;
    assert.ok(errs.some((e) => e.startsWith(`${f}: `) && re.test(e)), `${f} not rejected:\n${errs.join('\n')}`);
  }
  assert.equal(errs.length, files.length);
  // The build copy step refuses each one on its own.
  for (const [f, data] of files) {
    const one = tmp();
    write(one, f, data); write(one, `${f}.license.yaml`, SIDE('CC0-1.0'));
    assert.throws(() => mediaOutputs(one), /refusing to publish/, f);
  }
  assert.deepEqual(checkMediaDir(REPO), [], 'committed media are allowlisted rasters with matching magic bytes');
});

test('magic bytes must match the extension', () => {
  const r = tmp();
  const cases = [['a.png', JPG], ['b.jpg', PNG], ['c.webp', PNG], ['d.jpeg', WEBP], ['e.gif', PNG], ['f.png', Buffer.from('')]];
  for (const [n, data] of cases) { write(r, `media/m/${n}`, data); write(r, `media/m/${n}.license.yaml`, SIDE('CC0-1.0')); }
  const errs = checkMediaDir(r);
  for (const [n] of cases) assert.ok(errs.some((e) => e.startsWith(`media/m/${n}: content does not match`)), `${n}:\n${errs.join('\n')}`);
  write(r, 'media/m/a.png', PNG); write(r, 'media/m/b.jpg', JPG); write(r, 'media/m/c.webp', WEBP); write(r, 'media/m/d.jpeg', JPG);
  write(r, 'media/m/e.gif', Buffer.from('GIF89a\0\0')); write(r, 'media/m/f.png', PNG);
  assert.deepEqual(checkMediaDir(r), []);
});


// Review #10: Mermaid sources may not load external resources (img tags, themeCSS url(), links).
import { mermaidProblems, MERMAID_SECURE } from '../web/assets/mermaid-guard.js';

const mm = (...body) => `\`\`\`mermaid\n${body.join('\n')}\n\`\`\`\n`;
const SAFE = ['flowchart LR', '  accTitle: Review flow', '  accDescr: Draft goes to review.'];

test('mermaid: each external-resource pattern is rejected with a clear error', () => {
  const cases = [
    [[...SAFE, '%%{init: {"theme":"dark"}}%%', '  A --> B'], 'init directive %%{...}%% is not allowed'],
    [[...SAFE, '  %%{init: {"themeCSS": ".node{background:url(https://example.com/t.png)}"}}%%', '  A --> B'], 'init directive %%{...}%% is not allowed'],
    [['---', 'config:', '  theme: dark', '---', ...SAFE, '  A --> B'], '--- config block is not allowed'],
    [[...SAFE, '  A["<img src=x.png>"] --> B'], 'HTML is not allowed'],
    [[...SAFE, '  A["#60;img src=x.png#62;"] --> B'], 'HTML is not allowed'],
    [[...SAFE, '  A["&lt;b&gt;x"] --> B'], 'HTML is not allowed'],
    [[...SAFE, '  A --> B', '  style A fill:url(#x)'], 'url() is not allowed'],
    [[...SAFE, '  A["see https://example.com"] --> B'], 'external URLs are not allowed'],
    [[...SAFE, '  A["http://example.com"] --> B'], 'external URLs are not allowed'],
    [[...SAFE, '  A["//example.com/x"] --> B'], 'external URLs are not allowed'],
    [[...SAFE, '  A --> B', '  click A "https://example.com"'], 'external URLs are not allowed'],
  ];
  for (const [lines, reason] of cases) {
    const errs = checkAccessibility(mm(...lines));
    assert.ok(errs.includes(`line 1: mermaid diagram 1: ${reason} (STYLE V4)`), `${lines.join(' | ')}\n→ ${errs.join('\n')}`);
  }
  // The <img> payload from the review is caught twice over (tag and URL).
  assert.deepEqual(mermaidProblems('flowchart LR\n  A["<img src=https://example.com/track.png>"]'), ['HTML is not allowed', 'external URLs are not allowed']);
});

test('mermaid: safe diagrams pass, including arrows that contain < and >', () => {
  assert.deepEqual(mermaidProblems([...SAFE, '  A --> B', '  B <--> C', '  C -.-> D', '  D ==> E', '  E -->|yes| F'].join('\n')), []);
  assert.deepEqual(checkAccessibility(mm(...SAFE, '  A --> B')), []);
  for (const k of ['securityLevel', 'themeCSS', 'themeVariables', 'dompurifyConfig', 'htmlLabels', 'flowchart']) assert.ok(MERMAID_SECURE.includes(k), k);
});

test('mermaid: every diagram in the real articles still passes the checks', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, content } = loadContent(root);
  assert.deepEqual(errors.filter((e) => /mermaid/.test(e)), []);
  const withDiagrams = content.articles.filter((a) => a.body.includes('```mermaid'));
  assert.ok(withDiagrams.length >= 6, 'sample content has diagrams');
  for (const a of withDiagrams) assert.deepEqual(checkAccessibility(a.body).filter((e) => /mermaid/.test(e)), [], a.fm.slug);
});
