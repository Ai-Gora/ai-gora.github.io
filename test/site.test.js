import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, buildOutputs } from '../scripts/lib.js';
import { buildSite, renderInline, esc } from '../scripts/site.js';
import { lessonPath, expandTopics, pathLanguages } from '../web/assets/lesson-path.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { content } = loadContent(REPO);
const data = buildOutputs(content);
const site = buildSite(content, data);
const graph = JSON.parse(data['data/graph.json']);
const topics = JSON.parse(data['data/topics.json']);

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
  assert.match(html, /Read first[\s\S]*printing-press\.html/);
  assert.match(html, /href="\.\.\/quiz\/bela-krajina-dialects\.html"/);
  assert.match(site['a/printing-press.html'], /What links here<\/h2><ul>.*bela-krajina-dialects\.html.*photosynthesis\.html/);
  assert.ok(!/<script(?! type="(module|application\/ld\+json)")/.test(html), 'only module and JSON-LD scripts');
});

test('article page: language switcher links translations', () => {
  const en = site['a/bela-krajina-dialects.html'];
  assert.ok(en.includes('<nav class="langs" aria-label="Languages">'), 'en page has a language nav');
  assert.ok(en.includes('<span aria-current="true" lang="en">English</span>'), 'current language first');
  assert.ok(en.includes('<a href="belokranjska-narecja.html" hreflang="sl" lang="sl" rel="alternate">Slovenščina</a>'), 'links to the translation');
  assert.ok(en.includes('<link rel="alternate" hreflang="sl" href="belokranjska-narecja.html">'), 'head advertises the translation');
  assert.ok(en.includes('<link rel="alternate" hreflang="en" href="bela-krajina-dialects.html">'), 'head advertises itself');

  const sl = site['a/belokranjska-narecja.html'];
  assert.ok(sl.includes('<html lang="sl">'), 'sl page declares its language');
  assert.ok(sl.includes('<a href="bela-krajina-dialects.html" hreflang="en" lang="en" rel="alternate">English</a>'), 'links back to the en article');

  assert.ok(!site['a/photosynthesis.html'].includes('class="langs"'), 'no language nav without translations');
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
  const ling = lessonPath(graph, topics, ['linguistics']);
  assert.deepEqual(ling.map((s) => [s.slug, s.reason]), [['printing-press', 'prerequisite'], ['bela-krajina-dialects', 'interest'], ['belokranjska-narecja', 'interest']]);
  const mixed = lessonPath(graph, topics, ['slovenia', 'biology']).map((s) => s.slug);
  assert.ok(mixed.indexOf('printing-press') < mixed.indexOf('bela-krajina-dialects'));
  assert.deepEqual(lessonPath(graph, topics, ['nothing']), []);
  assert.match(site['paths/linguistics.html'], /<ol class="path">[\s\S]*printing-press[\s\S]*bela-krajina-dialects/);
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

  assert.deepEqual(lessonPath(graph, topics, ['linguistics'], { lang: 'en' }).map((s) => [s.slug, s.reason]), [['printing-press', 'prerequisite'], ['bela-krajina-dialects', 'interest']]);

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
  assert.ok(site['paths/linguistics.html'].includes('Intro · English'), 'meta line names the step language');
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

test('buildSite throws instead of overwriting a page (topic id "index" bypassing validation)', () => {
  const rename = (json) => JSON.stringify(JSON.parse(json), (k, v) => (v === 'linguistics' ? 'index' : v));
  const forged = { ...data, 'data/topics.json': rename(data['data/topics.json']), 'data/graph.json': rename(data['data/graph.json']) };
  assert.throws(() => buildSite(content, forged), /duplicate output path: paths\/index\.html/);
});
