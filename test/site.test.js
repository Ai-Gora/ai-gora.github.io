import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, buildOutputs } from '../scripts/lib.js';
import { buildSite, renderInline, esc } from '../scripts/site.js';
import { lessonPath, expandTopics } from '../web/assets/lesson-path.js';

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
  assert.match(html, /<h2 id="metlika">Metlika dialect<\/h2>/);
  assert.match(html, /<a href="\.\.\/a\/printing-press\.html#effects">effects of printing<\/a>/);
  assert.match(html, /<a href="#source-3" aria-label="Source 3">\[3\]<\/a>/);
  assert.match(html, /<li id="source-3" value="3"><a href="https:\/\/www\.britannica\.com\/biography\/Primoz-Trubar">/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /Read first[\s\S]*printing-press\.html/);
  assert.match(html, /href="\.\.\/quiz\/bela-krajina-dialects\.html"/);
  assert.match(site['a/printing-press.html'], /What links here<\/h2><ul>.*bela-krajina-dialects\.html.*photosynthesis\.html/);
  assert.ok(!/<script(?! type="(module|application\/ld\+json)")/.test(html), 'only module and JSON-LD scripts');
});

test('inline renderer escapes HTML and neutralises javascript: links', () => {
  const ctx = { base: '../', titleOf: (s) => s };
  assert.equal(renderInline('<b>x</b>', ctx), '&lt;b&gt;x&lt;/b&gt;');
  assert.match(renderInline('[click](javascript:alert(1))', ctx), /href="#"/);
  assert.equal(renderInline('`a<b`', ctx), '<code>a&lt;b</code>');
  assert.equal(esc('"&\''), '&quot;&amp;&#39;');
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
  assert.deepEqual(ling.map((s) => [s.slug, s.reason]), [['printing-press', 'prerequisite'], ['bela-krajina-dialects', 'interest']]);
  const mixed = lessonPath(graph, topics, ['slovenia', 'biology']).map((s) => s.slug);
  assert.ok(mixed.indexOf('printing-press') < mixed.indexOf('bela-krajina-dialects'));
  assert.deepEqual(lessonPath(graph, topics, ['nothing']), []);
  assert.match(site['paths/linguistics.html'], /<ol class="path">[\s\S]*printing-press[\s\S]*bela-krajina-dialects/);
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
