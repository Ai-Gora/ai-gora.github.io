import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, buildOutputs, SITE_URL } from '../scripts/lib.js';
import { buildSite, renderInline, renderBlocks, esc, mermaidAcc, fmtDate } from '../scripts/site.js';
import { STRINGS, t, tn } from '../web/assets/i18n.js';
import { questionState } from '../web/assets/quiz-check.js';
import { lessonPath, expandTopics, pathLanguages } from '../web/assets/lesson-path.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { content } = loadContent(REPO);
const data = buildOutputs(content);
const site = buildSite(content, data);
const graph = JSON.parse(data['data/graph.json']);
const topics = JSON.parse(data['data/topics.json']);
// bela-krajina-dialects has no prerequisite in the sample content; add one synthetically so the lesson-path tests keep a prerequisite edge.
const pcontent = loadContent(REPO).content;
pcontent.bySlug.get('bela-krajina-dialects').fm.prerequisites = ['printing-press'];
const pdata = buildOutputs(pcontent);
const psite = buildSite(pcontent, pdata);
const pgraph = JSON.parse(pdata['data/graph.json']);

test('site emits article, quiz, path, search and home pages plus assets', () => {
  for (const f of ['index.html', 'search.html', 'paths/index.html', 'quiz/index.html', 'a/photosynthesis.html', 'a/printing-press.html', 'a/bela-krajina-dialects.html', 'quiz/photosynthesis.html', 'paths/linguistics.html', 'paths/science.html', 'assets/style.css', 'assets/search.js', 'assets/quiz.js', 'assets/paths.js', 'assets/lesson-path.js']) assert.ok(f in site, `missing ${f}`);
  for (const f of Object.keys(site)) assert.ok(!(f in data), `site must not overwrite data file ${f}`);
});

test('article page: anchors, wikilinks, citations, sources, backlinks, JSON-LD, lang', () => {
  const html = site['a/bela-krajina-dialects.html'];
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h2 id="north">North Bela Krajina dialect<\/h2>/);
  assert.match(html, /<a href="\.\.\/a\/printing-press\.html#effects">effects of printing<\/a>/);
  assert.match(html, /<a href="#source-3" aria-label="Source 3">\[3\]<\/a>/);
  assert.match(html, /<li id="source-3" value="3"><a href="https:\/\/en\.wikipedia\.org\/wiki\/Slovene_dialects">/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.ok(!html.includes('Read first'), 'sample article has no prerequisite');
  assert.match(psite['a/bela-krajina-dialects.html'], /Read first[\s\S]*printing-press\.html/);
  assert.match(html, /href="\.\.\/quiz\/bela-krajina-dialects\.html"/);
  assert.match(site['a/printing-press.html'], /What links here<\/h2><ul>.*bela-krajina-dialects\.html.*photosynthesis\.html/);
  assert.ok(!/<script(?! type="(module|application\/ld\+json)")/.test(html), 'only module and JSON-LD scripts');
});

test('article page: language switcher links translations', () => {
  const en = site['a/bela-krajina-dialects.html'];
  assert.ok(en.includes('<nav class="langs" aria-label="Languages">'), 'en page has a language nav');
  assert.ok(en.includes('<span aria-current="true" lang="en">English</span>'), 'current language first');
  assert.ok(en.includes('<a href="belokranjska-narecja.html" hreflang="sl" lang="sl" rel="alternate">Slovenščina</a>'), 'links to the translation');
  assert.ok(en.includes('href="belokranjska-narecja.html" hreflang="sl"'), 'nav switcher stays relative');
  assert.ok(en.includes(`<link rel="alternate" hreflang="sl" href="${SITE_URL}/a/belokranjska-narecja.html">`), 'head advertises the translation absolutely');
  assert.ok(en.includes(`<link rel="alternate" hreflang="en" href="${SITE_URL}/a/bela-krajina-dialects.html">`), 'head advertises itself absolutely');

  const sl = site['a/belokranjska-narecja.html'];
  assert.ok(sl.includes('<html lang="sl">'), 'sl page declares its language');
  assert.ok(sl.includes('<a href="bela-krajina-dialects.html" hreflang="en" lang="en" rel="alternate">English</a>'), 'links back to the en article');

  assert.ok(!site['a/photosynthesis.html'].includes('class="langs"'), 'no language nav without translations');
  assert.ok(site['a/photosynthesis.html'].includes(`<link rel="canonical" href="${SITE_URL}/a/photosynthesis.html">`), 'article declares its canonical URL');
});

test('inline renderer escapes HTML and neutralises javascript: links', () => {
  const ctx = { base: '../', titleOf: (s) => s };
  assert.equal(renderInline('<b>x</b>', ctx), '&lt;b&gt;x&lt;/b&gt;');
  assert.match(renderInline('[click](javascript:alert(1))', ctx), /href="#"/);
  assert.equal(renderInline('`a<b`', ctx), '<code>a&lt;b</code>');
  assert.equal(esc('"&\''), '&quot;&amp;&#39;');
});

test('inline renderer keeps emphasis out of link hrefs', () => {
  const html = renderInline('[x](https://e.org/a*b*c) and *em*', { base: '../', titleOf: (s) => s });
  assert.ok(html.includes('href="https://e.org/a*b*c"'));
  assert.ok(html.includes('<em>em</em>'));
});

test('inline renderer spans emphasis across links and wikilinks', () => {
  const ctx = { base: '../', titleOf: (s) => s };
  const bold = renderInline('**a [l](https://u.org) b**', ctx);
  assert.ok(bold.includes('<strong>a <a href="https://u.org">l</a> b</strong>'));
  assert.ok(!bold.includes('*'));
  assert.match(renderInline('*see [[photosynthesis]] now*', ctx), /<em>see <a href="\.\.\/a\/photosynthesis\.html">photosynthesis<\/a> now<\/em>/);
  assert.ok(renderInline('*[[photosynthesis]]*', ctx).startsWith('<em><a '));
  const mixed = renderInline('[x](https://e.org/a*b*c) and *em*', ctx);
  assert.ok(mixed.includes('href="https://e.org/a*b*c"'));
  assert.ok(mixed.includes('<em>em</em>'));
  assert.equal(renderInline('2 * 3 * 4', ctx), '2 * 3 * 4');
});

test('quiz page works without JS: labelled inputs and a Show answer disclosure', () => {
  const html = site['quiz/printing-press.html'];
  assert.match(html, /<legend>Gutenberg developed/);
  assert.match(html, /<input type="radio" id="printing-press-q1-0" name="printing-press-q1" value="true"> <label for="printing-press-q1-0">True<\/label>/);
  assert.match(html, /<details><summary>Show answer<\/summary><p><strong>Answer:<\/strong> True<\/p>/);
  assert.match(html, /data-src="\.\.\/data\/quizzes\/printing-press\.json"/);
  assert.match(html, /class="quiz-actions" data-js hidden/);
});

test('lesson path: interests include sub-topics and prerequisites come first', () => {
  assert.deepEqual([...expandTopics(topics, ['science'])].sort(), ['biology', 'science']);
  const ling = lessonPath(pgraph, topics, ['linguistics']);
  assert.deepEqual(ling.map((s) => [s.slug, s.reason]), [['printing-press', 'prerequisite'], ['bela-krajina-dialects', 'interest'], ['belokranjska-narecja', 'interest']]);
  const mixed = lessonPath(pgraph, topics, ['slovenia', 'biology']).map((s) => s.slug);
  assert.ok(mixed.indexOf('printing-press') < mixed.indexOf('bela-krajina-dialects'));
  assert.deepEqual(lessonPath(graph, topics, ['nothing']), []);
  assert.match(psite['paths/linguistics.html'], /<ol class="path">[\s\S]*printing-press[\s\S]*bela-krajina-dialects/);
  assert.deepEqual(lessonPath(graph, topics, ['linguistics'], { lang: 'en' }).map((s) => s.slug), ['bela-krajina-dialects'], 'no prerequisite in the sample content');
});

test('graph nodes expose lang and translation slugs', () => {
  for (const n of graph.nodes) {
    assert.equal(typeof n.lang, 'string');
    assert.equal(typeof n.translations, 'object');
  }
  const en = graph.nodes.find((n) => n.slug === 'bela-krajina-dialects');
  assert.equal(en.lang, 'en');
  assert.equal(en.translations.sl, 'belokranjska-narecja');
});

test('lesson path filters by language and swaps translated prerequisites', () => {
  const sl = lessonPath(graph, topics, ['linguistics'], { lang: 'sl' });
  const slugs = sl.map((s) => s.slug);
  assert.ok(slugs.includes('belokranjska-narecja'));
  assert.ok(!slugs.includes('bela-krajina-dialects'));
  for (const s of sl.filter((x) => x.reason === 'interest')) assert.equal(s.lang, 'sl');

  assert.deepEqual(lessonPath(pgraph, topics, ['linguistics'], { lang: 'en' }).map((s) => [s.slug, s.reason]), [['printing-press', 'prerequisite'], ['bela-krajina-dialects', 'interest']]);

  const both = lessonPath(graph, topics, ['linguistics']).map((s) => s.slug);
  assert.ok(both.includes('bela-krajina-dialects') && both.includes('belokranjska-narecja'));

  assert.deepEqual(pathLanguages(graph), ['en', 'sl']);
});

test('site builds a no-JS language filter and per-language lesson path pages', () => {
  for (const f of ['paths/sl/index.html', 'paths/en/index.html', 'paths/sl/linguistics.html', 'paths/en/linguistics.html']) assert.ok(f in site, `missing ${f}`);

  assert.ok(site['paths/sl/linguistics.html'].includes('belokranjska-narecja.html'), 'sl path links the sl article');
  assert.ok(!site['paths/sl/linguistics.html'].includes('a/bela-krajina-dialects.html'), 'sl path does not link the en article');
  assert.ok(site['paths/en/linguistics.html'].includes('bela-krajina-dialects.html'), 'en path links the en article');
  assert.ok(!site['paths/en/linguistics.html'].includes('belokranjska-narecja'), 'en path does not link the sl article');

  const index = site['paths/index.html'];
  assert.ok(index.includes('<nav class="lang-filter" aria-label="Language">'), 'index has a language filter nav');
  assert.ok(index.includes('sl/index.html'), 'index links the sl variant');
  assert.ok(index.includes('<label for="path-lang">'), 'index offers a language select');

  assert.ok(site['paths/sl/index.html'].includes('<a href="index.html" aria-current="page" lang="sl">Slovenščina</a>'), 'sl index marks Slovenščina current');
  assert.ok(site['paths/linguistics.html'].includes('<a href="linguistics.html" aria-current="page">All languages</a>'), 'all-languages path marks All languages current');
  assert.ok(site['paths/linguistics.html'].includes('<h3 lang="en">'), 'steps declare their language');
  assert.ok(psite['paths/linguistics.html'].includes('Intro · English'), 'meta line names the step language');
});

test('lesson path replaces a foreign prerequisite with its existing translation', () => {
  const g = { nodes: [
    { slug: 'a-sl', id: 'a-sl', title: 'A sl', topics: ['other'], level: 'intro', lang: 'sl', prerequisites: [], sections: [], quizzes: [] },
    { slug: 'a-en', id: 'a-en', title: 'A en', topics: ['other'], level: 'intro', lang: 'en', translations: { sl: 'a-sl' }, prerequisites: [], sections: [], quizzes: [] },
    { slug: 'b-sl', id: 'b-sl', title: 'B sl', topics: ['t'], level: 'intro', lang: 'sl', prerequisites: ['a-en'], sections: [], quizzes: [] },
  ], edges: [] };
  assert.deepEqual(lessonPath(g, [{ id: 't', parent: null }], ['t'], { lang: 'sl' }).map((s) => [s.slug, s.reason]), [['a-sl', 'prerequisite'], ['b-sl', 'interest']]);
});

test('lesson path tolerates prerequisite cycles', () => {
  const g = { nodes: [
    { slug: 'a', id: 'a', title: 'A', topics: ['t'], level: 'intro', prerequisites: ['b'], sections: [], quizzes: [] },
    { slug: 'b', id: 'b', title: 'B', topics: ['t'], level: 'intro', prerequisites: ['a'], sections: [], quizzes: [] },
  ], edges: [] };
  assert.deepEqual(lessonPath(g, [{ id: 't', parent: null }], ['t']).map((s) => s.slug), ['a', 'b']);
});

test('search page has a no-JS browse fallback and a labelled search field', async () => {
  const html = site['search.html'];
  assert.match(html, /<label for="q">/);
  assert.match(html, /<noscript>/);
  assert.match(html, /id="browse"[\s\S]*a\/photosynthesis\.html#chloroplasts/);
});

test('search page has a language filter and browse grouped by language', () => {
  const html = site['search.html'];
  assert.ok(html.includes('<label for="search-lang">Language</label>'), 'search has a language label');
  assert.ok(html.includes('<option value="sl">Slovenščina</option>'), 'search offers the sl option');
  assert.ok(html.includes('<h3 lang="sl">Slovenščina</h3>'), 'browse groups by language');
  assert.ok(site['index.html'].includes('lang="sl"'), 'home lists articles with their language');
});

test('buildSite throws instead of overwriting a page (topic id "index" bypassing validation)', () => {
  const rename = (json) => JSON.stringify(JSON.parse(json), (k, v) => (v === 'linguistics' ? 'index' : v));
  const forged = { ...data, 'data/topics.json': rename(data['data/topics.json']), 'data/graph.json': rename(data['data/graph.json']) };
  assert.throws(() => buildSite(content, forged), /duplicate output path: paths\/index\.html/);
});

test('renderer: media images, pipe tables, details and mermaid blocks', () => {
  const ctx = { base: '../', titleOf: (s) => s };
  assert.equal(renderInline('![Planes of the body](media/a/planes.webp)', ctx), '<img src="../media/a/planes.webp" alt="Planes of the body" loading="lazy">');
  assert.equal(renderInline('![x](media/a/planes.svg)', ctx), '', 'SVG is never published');
  assert.equal(renderInline('![x](https://evil.example/x.png)', ctx), '', 'remote images are dropped');
  assert.equal(renderInline('![x](media/../secret.png)', ctx), '', 'path traversal is dropped');
  assert.ok(!renderInline('![a" onerror="x](media/a/b.png)', ctx).includes('" onerror'), 'alt text is escaped');
  const table = renderBlocks('| Country | Units |\n|---|---:|\n| Slovenia | 212 [^1] |\n| *Austria* | 9 |', ctx);
  assert.match(table, /^<div class="table-wrap"><table><thead><tr><th scope="col">Country<\/th><th scope="col">Units<\/th><\/tr><\/thead><tbody><tr><td>Slovenia<\/td><td>212/);
  assert.match(table, /<td><em>Austria<\/em><\/td><td>9<\/td><\/tr><\/tbody><\/table><\/div>$/);
  assert.equal(renderBlocks('| not | a table |', ctx), '<p>| not | a table |</p>', 'a pipe row without a separator stays a paragraph');
  assert.equal(renderBlocks('<details><summary>Description</summary>\n\n- one\n- two\n</details>', ctx), '<details><summary>Description</summary><ul><li>one</li><li>two</li></ul></details>');
  assert.equal(renderBlocks('```mermaid\nflowchart LR\n  A --> B\n```', ctx), '<figure class="diagram"><pre class="mermaid" data-mermaid><code>flowchart LR\n  A --&gt; B</code></pre></figure>');
});

test('a wikilink in image alt text stays plain text (review #9.4)', () => {
  const ctx = { base: '../', titleOf: (s) => s };
  assert.equal(renderInline('![Map of [[bela-krajina-dialects|Bela Krajina]] and [[photosynthesis]]](media/a/map.png)', ctx), '<img src="../media/a/map.png" alt="Map of Bela Krajina and photosynthesis" loading="lazy">');
  assert.ok(!renderInline('![x [[a#b|c]]](media/a/m.png) and [[d]]', ctx).includes('alt="x <a'), 'no <a> inside alt');
  assert.match(renderInline('![x](media/a/m.png) see [[d]]', ctx), /alt="x" loading="lazy"> see <a href="\.\.\/a\/d\.html">d<\/a>/);
});

test('mermaid: accTitle/accDescr (line and block) become the no-JS caption; source is kept and escaped', () => {
  assert.deepEqual(mermaidAcc(['flowchart LR', '  accTitle: Review flow', '  accDescr: Draft goes to review.']), { title: 'Review flow', descr: 'Draft goes to review.' });
  assert.deepEqual(mermaidAcc(['flowchart LR', '  accTitle: T', '  accDescr {', '    Line one.', '    Line two.', '  }', '  A --> B']), { title: 'T', descr: 'Line one. Line two.' });
  const html = renderBlocks('```mermaid\nflowchart LR\n  accTitle: A <b>\n  accDescr: Goes to B.\n  A --> B\n```', { base: '../', titleOf: (x) => x, lang: 'sl' });
  assert.match(html, /^<figure class="diagram"><pre class="mermaid" data-mermaid><code>flowchart LR\n {2}accTitle: A &lt;b&gt;\n {2}accDescr: Goes to B\.\n {2}A --&gt; B<\/code><\/pre>/);
  assert.match(html, /<figcaption><strong>Diagram: A &lt;b&gt;\.<\/strong> Goes to B\.<\/figcaption><\/figure>$/);
});

test('mermaid: self-hosted build is emitted and loaded only on pages with a diagram', () => {
  assert.ok(site['assets/vendor/mermaid.min.js'].length > 100000, 'vendored mermaid');
  assert.ok(site['assets/vendor/mermaid.LICENSE.txt'].includes('MIT'));
  assert.match(site['assets/diagram.js'], /vendor\/mermaid\.min\.js/);
  const withDiagram = site['a/belokranjska-narecja.html'];
  assert.match(withDiagram, /<script type="module" src="\.\.\/assets\/diagram\.js"><\/script>/);
  assert.match(withDiagram, /<pre class="mermaid" data-mermaid>[\s\S]*accTitle: Dolenjska narečna skupina[\s\S]*<figcaption><strong>Diagram: Dolenjska narečna skupina\.<\/strong> Na karti/);
  assert.ok(!site['a/photosynthesis.html'].includes('diagram.js'), 'no loader without a diagram');
  for (const [f, html] of Object.entries(site)) if (f.endsWith('.html')) assert.ok(!/cdn|jsdelivr|unpkg/i.test(html.match(/<script[^>]*>/g)?.join('') || ''), `${f}: no CDN script`);
});

test('i18n: en and sl tables have the same keys; Slovenian plurals; fallback to English', () => {
  assert.deepEqual(Object.keys(STRINGS.sl).sort(), Object.keys(STRINGS.en).sort());
  assert.deepEqual([1, 2, 3, 4, 5, 101].map((n) => tn('sl', 'articles', n)), ['1 članek', '2 članka', '3 članki', '4 članki', '5 člankov', '101 članek']);
  assert.equal(tn('en', 'questions', 1), '1 question');
  assert.equal(t('de', 'checkAnswers'), 'Check answers');
  assert.equal(t('sl', 'score', { right: 1, total: 2 }), 'Pravilni odgovori: 1 od 2.');
  assert.equal(questionState({ type: 'single', answer: 0 }, ['0'], 'sl').text, '✓ Pravilno.');
  assert.equal(questionState({ type: 'single', answer: 0 }, ['1'], 'sl').text, '✗ Ni pravilno. Odgovor je spodaj.');
  assert.equal(questionState({ type: 'single', answer: 0 }, [], 'sl').text, '✗ Brez odgovora. Odgovor je spodaj.');
  assert.equal(questionState({ type: 'single', answer: 0 }, ['0']).text, '✓ Correct.');
});

test('SL quiz page is fully Slovenian, with and without JS', () => {
  const html = site['quiz/belokranjska-narecja.html'];
  for (const s of ['<html lang="sl">', 'data-lang="sl"', '>Preveri odgovore<', '>Začni znova<', '<summary>Pokaži odgovor</summary>', '<strong>Odgovor:</strong>', '>Domov<', '>Preskoči na vsebino<', 'Kviz: ', 'Pod vsakim vprašanjem']) assert.ok(html.includes(s), s);
  for (const s of ['>Check answers<', '>Show answer<', '>Home<', 'Skip to content', 'Source on GitHub', 'Questions about']) assert.ok(!html.includes(s), s);
  const tf = Object.entries(site).filter(([f, h]) => f.startsWith('quiz/') && h.includes('<html lang="sl">') && h.includes('value="true"'));
  for (const [, h] of tf) assert.ok(h.includes('>Drži</label>') && h.includes('>Ne drži</label>'), 'SL true/false labels');
  assert.match(site['quiz/photosynthesis.html'], />Check answers<.*>Start again</);
});

test('SL article and path chrome; English pages unchanged; English topic text marked lang="en"', () => {
  const sl = site['a/belokranjska-narecja.html'];
  for (const s of ['<strong>Na kratko:</strong>', '<dt>Avtorji</dt>', '<dt>Stanje</dt>', 'aria-label="Vir 1"', '>Povezave na ta članek<', '· Licenca CC-BY-SA-4.0', '<span lang="en">']) assert.ok(sl.includes(s), s);
  assert.ok(!sl.includes('In short:') && !sl.includes('<header class="site" lang="en">'));
  const en = site['a/bela-krajina-dialects.html'];
  for (const s of ['<strong>In short:</strong>', 'Skip to content', 'aria-label="Source 1"', '>What links here<']) assert.ok(en.includes(s), s);
  const p = site['paths/sl/index.html'];
  assert.match(p, /<html lang="sl">/);
  assert.match(p, /<h1>Učne poti \(Slovenščina\)<\/h1>/);
  assert.match(p, /<a href="[a-z-]+\.html"><span lang="en">/);
  assert.match(p, /· \d+ člank/);
  assert.match(site['paths/sl/linguistics.html'], /<h2>Vrstni red branja<\/h2>/);
  assert.match(site['paths/en/index.html'], /<html lang="en">[\s\S]*<h1>Lesson paths \(English\)<\/h1>/);
});

test('diagram.js is chosen from the rendered HTML, so a fence written "``` mermaid" still loads it', () => {
  const c = loadContent(REPO).content;
  const a = c.bySlug.get('photosynthesis');
  const extra = '\n\n``` mermaid\nflowchart LR\n  accTitle: T\n  accDescr: D.\n  A --> B\n```\n';
  a.body += extra;
  a.sections.find((x) => x.anchor && x.anchor !== 'sources').text += extra; // Sources is rendered from frontmatter
  const s2 = buildSite(c, buildOutputs(c));
  assert.match(s2['a/photosynthesis.html'], /data-mermaid/);
  assert.match(s2['a/photosynthesis.html'], /assets\/diagram\.js/);
  assert.ok(!site['a/photosynthesis.html'].includes('diagram.js'));
});

test('pages with a diagram send a same-origin Content-Security-Policy first in <head>; others do not', () => {
  const withDiagram = Object.entries(site).filter(([f, h]) => f.endsWith('.html') && h.includes('assets/diagram.js'));
  assert.ok(withDiagram.length >= 6);
  for (const [f, h] of withDiagram) {
    const head = h.slice(h.indexOf('<head>'), h.indexOf('</head>'));
    assert.match(head, /^<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; img-src &#39;self&#39; data:; connect-src &#39;self&#39;; font-src &#39;self&#39;; style-src &#39;self&#39; &#39;unsafe-inline&#39;; script-src &#39;self&#39;; object-src &#39;none&#39;; base-uri &#39;none&#39;">\n/, f);
  }
  for (const [f, h] of Object.entries(site)) if (f.endsWith('.html') && !h.includes('assets/diagram.js')) assert.ok(!h.includes('Content-Security-Policy'), f);
});

test('fmtDate formats ISO dates without timezone shifts', () => {
  assert.equal(fmtDate('2026-10-17'), '17 Oct 2026');
  assert.equal(fmtDate('2027-01-05'), '5 Jan 2027');
  assert.equal(fmtDate('2026-13-01'), '2026-13-01');
  assert.equal(fmtDate('soon'), 'soon');
  assert.equal(fmtDate('2026-10-17', 'sl'), '17. 10. 2026');
});

test('living-document strip and Review due are localised on SL pages', () => {
  const sl = buildSite(content, data, { today: '2099-01-01' })['a/belokranjska-narecja.html'];
  assert.ok(sl.includes(`<dl class="meta living" aria-label="${t('sl', 'articleStatus')}">`));
  assert.ok(sl.includes(`<dt>${t('sl', 'metaChecked')}</dt>`) && sl.includes(`<dt>${t('sl', 'metaNextReview')}</dt>`));
  assert.ok(sl.includes(`<strong>${t('sl', 'dueLabel')}</strong> ta članek`));
  assert.match(sl, /<time datetime="\d{4}-\d{2}-\d{2}">\d{1,2}\. \d{1,2}\. \d{4}<\/time>/);
  assert.ok(!sl.includes('Review due') && !sl.includes('Next review'));
  for (const k of ['articleStatus', 'metaChecked', 'metaNextReview', 'aiAssistedShort', 'dueLabel', 'dueText', 'stepsDone', 'continueTo', 'stepDone']) assert.ok(STRINGS.sl[k] && STRINGS.en[k], k);
  assert.equal(t('sl', 'stepsDone', { count: 1, total: 3 }), 'Opravljeni koraki: 1 od 3');
});

test('article page: living-document strip and Review due notice', () => {
  const a = content.bySlug.get('bela-krajina-dialects').fm;
  const html = site['a/bela-krajina-dialects.html'];
  assert.ok(html.includes('<dl class="meta living" aria-label="Article status">'));
  assert.ok(html.includes(`<dt>Checked</dt><dd><time datetime="${a.updated}">${fmtDate(a.updated)}</time>`));
  assert.ok(html.includes(`<dt>Next review</dt><dd><time datetime="${a.review_after}">`));
  assert.equal(html.includes('· AI-assisted'), a.ai_assisted === true);
  assert.ok(buildSite(content, data, { today: '2099-01-01' })['a/bela-krajina-dialects.html'].includes('class="notice due"'));
  assert.ok(!buildSite(content, data, { today: '2000-01-01' })['a/bela-krajina-dialects.html'].includes('class="notice due"'));
});

test('lesson path and search carry the enhancement hooks', () => {
  assert.ok(site['paths/linguistics.html'].includes('<p class="path-progress" data-path-progress hidden></p>\n<ol class="path">'));
  assert.ok(site['paths/linguistics.html'].includes('class="step" data-slug="'));
  assert.ok(site['search.html'].includes('placeholder=" "'));
  assert.ok(site['search.html'].includes('<span class="caret" aria-hidden="true"></span>'));
});
