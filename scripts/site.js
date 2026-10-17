// Aigora static site: content -> HTML pages + assets. No framework, no runtime deps.
// Reading articles and lesson paths needs no JS; search and quizzes are progressive enhancement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME, safeJson, jsonLd } from './lib.js';
import { lessonPath } from '../web/assets/lesson-path.js';

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'assets');

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u) => (/^(https?:\/\/|mailto:|#|\.{0,2}\/|[a-z0-9-]+\.html)/i.test(u) && !/^\s*javascript:/i.test(u) ? u : '#');
const NUL = String.fromCharCode(0);

/** Inline Markdown: code, wikilinks, links, bold, italics, [^n] citations. Input is raw text; output is safe HTML. */
export function renderInline(text, ctx) {
  return text.split(/(`[^`\n]+`)/).map((part, i) => {
    if (i % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
    let s = esc(part).replaceAll(NUL, ''); // NUL is reserved for tag placeholders below
    s = s.replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_m, slug, anchor, txt) => {
      slug = slug.trim();
      const title = ctx.titleOf(slug);
      const href = `${ctx.base}a/${slug}.html${anchor ? `#${anchor.trim()}` : ''}`;
      return `<a href="${href}">${txt ? txt.trim() : esc(title || slug)}</a>`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, txt, url) => `<a href="${safeUrl(url)}">${txt}</a>`);
    const tags = [];
    s = s.replace(/<[^>]+>/g, (tag) => `${NUL}${tags.push(tag) - 1}${NUL}`);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(new RegExp(`(^|[\\s(]|${NUL})\\*([^*\\s][^*]*)\\*`, 'g'), '$1<em>$2</em>');
    s = s.replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (_m, n) => tags[n]);
    s = s.replace(/\[\^(\d+)\]/g, (_m, n) => `<sup class="cite"><a href="#source-${n}" aria-label="Source ${n}">[${n}]</a></sup>`);
    return s;
  }).join('');
}

/** Block Markdown subset: paragraphs, lists, blockquotes, fenced code. Headings are handled per section. */
export function renderBlocks(text, ctx) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    const list = /^\s*([-*]|\d+\.)\s+/.exec(line);
    if (list) {
      const tag = /\d/.test(list[1]) ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push(`<${tag}>${items.map((t) => `<li>${renderInline(t, ctx)}</li>`).join('')}</${tag}>`); continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(buf.join('\n'), ctx)}</blockquote>`); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(```|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) buf.push(lines[i++].trim());
    out.push(`<p>${renderInline(buf.join(' '), ctx)}</p>`);
  }
  return out.join('\n');
}

const NAV = [['index.html', 'Home'], ['search.html', 'Search'], ['paths/index.html', 'Lesson paths'], ['quiz/index.html', 'Quizzes']];

function page({ title, base, lang = 'en', current, body, head = '', scripts = [], description = '' }) {
  const nav = NAV.map(([href, label]) => `<li><a href="${base}${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${title === SITE_NAME ? '' : ` · ${SITE_NAME}`}</title>
${description ? `<meta name="description" content="${esc(description)}">\n` : ''}<link rel="icon" href="data:,">
<link rel="stylesheet" href="${base}assets/style.css">
${head}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
<a class="brand" href="${base}index.html">${SITE_NAME}</a>
<nav aria-label="Site"><ul>${nav}</ul></nav>
<form class="quick-search" role="search" aria-label="Site search" action="${base}search.html" method="get">
<label for="site-q" class="visually-hidden">Search articles</label>
<input id="site-q" name="q" type="search" placeholder="Search" autocomplete="off">
<button type="submit">Search</button>
</form>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site">
<p>Content: <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Code: MIT. <a href="${base}llms.txt">llms.txt</a> · <a href="${base}data/graph.json">graph.json</a> · <a href="https://github.com/Ai-Gora/ai-gora.github.io">Source on GitHub</a></p>
</footer>
${scripts.map((s) => `<script type="module" src="${base}assets/${s}"></script>`).join('\n')}
</body>
</html>
`;
}

const levelLabel = (l) => ({ intro: 'Intro', core: 'Core', deep: 'Deep' }[l] || l);
const answerText = (q) => {
  if (q.type === 'single') return q.options[q.answer];
  if (q.type === 'multi') return q.answer.map((i) => q.options[i]).join(', ');
  if (q.type === 'true_false') return q.answer ? 'True' : 'False';
  return Array.isArray(q.answer) ? q.answer.join(', ') : String(q.answer);
};

function articlePage(a, ctx) {
  const { fm } = a;
  const c = { ...ctx, base: '../' };
  const secs = a.sections;
  const lead = secs[0].heading ? '' : renderBlocks(secs[0].text, c);
  const toc = secs.filter((s) => s.level === 2 && s.anchor).map((s) => `<li><a href="#${s.anchor}">${renderInline(s.heading, c)}</a></li>`).join('');
  const sources = `<ol class="sources">${fm.sources.map((s) => `<li id="source-${s.id}" value="${s.id}"><a href="${esc(safeUrl(s.url))}">${esc(s.title)}</a>${s.accessed ? ` <span class="muted">(accessed <time datetime="${esc(s.accessed)}">${esc(s.accessed)}</time>)</span>` : ''}</li>`).join('')}</ol>`;
  const body = secs.filter((s) => s.heading).map((s) => {
    const h = `<h${s.level}${s.anchor ? ` id="${s.anchor}"` : ''}>${renderInline(s.heading, c)}</h${s.level}>`;
    return `${h}\n${s.anchor === 'sources' ? sources : renderBlocks(s.text, c)}`;
  }).join('\n');
  const topicLinks = fm.topics.map((t) => `<a href="../paths/${t}.html">${esc(ctx.topicTitle(t))}</a>`).join(', ');
  const back = ctx.backlinks[fm.slug] || [];
  const prereq = (fm.prerequisites || []).map((p) => `<li><a href="${p}.html">${esc(ctx.titleOf(p))}</a></li>`).join('');
  const quiz = ctx.quizSlugs.has(fm.slug);
  const draft = fm.status === 'draft' ? '<p class="notice" role="note"><strong>Draft:</strong> this article has not been reviewed yet.</p>' : '';
  const stale = fm.status === 'stale' ? '<p class="notice" role="note"><strong>Stale:</strong> this article is due for review and may be out of date.</p>' : '';
  const html = `<article class="article">
<header>
<p class="kicker">${esc(levelLabel(fm.level))} · ${topicLinks}</p>
<h1>${esc(fm.title)}</h1>
<p class="summary"><strong>In short:</strong> ${esc(fm.summary.trim())}</p>
${draft}${stale}<dl class="meta">
<div><dt>Status</dt><dd>${esc(fm.status)}</dd></div>
<div><dt>Confidence</dt><dd>${esc(fm.confidence)}</dd></div>
<div><dt>Updated</dt><dd><time datetime="${esc(fm.updated)}">${esc(fm.updated)}</time></dd></div>
<div><dt>Review after</dt><dd><time datetime="${esc(fm.review_after)}">${esc(fm.review_after)}</time></dd></div>
<div><dt>Authors</dt><dd>${fm.authors.map(esc).join(', ')}${fm.ai_assisted ? ' (AI-assisted)' : ''}</dd></div>
</dl>
</header>
${prereq ? `<aside class="box" aria-labelledby="prereq-h"><h2 id="prereq-h" class="box-h">Read first</h2><ul>${prereq}</ul></aside>` : ''}
${toc ? `<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h" class="box-h">Contents</h2><ol>${toc}</ol></nav>` : ''}
${lead}
${body}
<footer class="article-foot">
${quiz ? `<p><a class="button" href="../quiz/${fm.slug}.html">Take the quiz on ${esc(fm.title)}</a></p>` : ''}
<section aria-labelledby="back-h"><h2 id="back-h">What links here</h2>${back.length ? `<ul>${back.map((b) => `<li><a href="${b.slug}.html">${esc(b.title)}</a></li>`).join('')}</ul>` : '<p class="muted">No other articles link here yet.</p>'}</section>
<p class="muted">ID <code>${esc(fm.id)}</code> · Licence ${esc(fm.license)} · <a href="${fm.slug}.md">Markdown source</a> · <a href="${fm.slug}.json">JSON</a> · <a href="https://github.com/Ai-Gora/ai-gora.github.io/commits/main/${esc(path.relative(ctx.root, a.file).split(path.sep).join('/'))}">History</a></p>
</footer>
</article>`;
  return page({ title: fm.title, base: '../', lang: fm.lang, body: html, description: fm.summary.trim(), head: `<script type="application/ld+json">\n${safeJson(jsonLd(a))}</script>\n` });
}

function questionHtml(q, slug, ctx) {
  const name = `${slug}-${q.id}`;
  let control;
  if (q.type === 'single' || q.type === 'multi' || q.type === 'true_false') {
    const opts = q.type === 'true_false' ? ['True', 'False'] : q.options;
    const kind = q.type === 'multi' ? 'checkbox' : 'radio';
    control = `<ul class="options">${opts.map((o, i) => `<li><input type="${kind}" id="${name}-${i}" name="${name}" value="${q.type === 'true_false' ? String(i === 0) : i}"> <label for="${name}-${i}">${esc(o)}</label></li>`).join('')}</ul>`;
  } else {
    const hint = q.type === 'order' && q.options ? `<p class="muted" id="${name}-hint">Put these in order, separated by commas: ${q.options.map(esc).join(', ')}</p>` : '';
    control = `${hint}<label for="${name}-in">Your answer</label> <input type="text" id="${name}-in" name="${name}"${hint ? ` aria-describedby="${name}-hint"` : ''}>`;
  }
  const [rslug, anchor] = q.ref.split('#');
  return `<fieldset class="question" data-qid="${q.id}">
<legend>${esc(q.prompt)}</legend>
${control}
<p class="feedback" data-feedback hidden></p>
<details><summary>Show answer</summary><p><strong>Answer:</strong> ${esc(answerText(q))}</p>${q.explain ? `<p>${esc(q.explain)}</p>` : ''}<p><a href="../a/${rslug}.html#${anchor}">Read: ${esc(ctx.titleOf(rslug))}, ${esc(ctx.headingOf(rslug, anchor))}</a></p></details>
</fieldset>`;
}

function quizPage(q, ctx) {
  const a = ctx.bySlug.get(q.slug);
  const body = `<h1>Quiz: ${esc(a.fm.title)}</h1>
<p>Questions about <a href="../a/${q.slug}.html">${esc(a.fm.title)}</a>. Each answer links back to the section it comes from.</p>
<form id="quiz" class="quiz" data-src="../data/quizzes/${q.slug}.json" data-slug="${q.slug}" novalidate>
${q.questions.map((qu) => questionHtml(qu, q.slug, ctx)).join('\n')}
<div class="quiz-actions" data-js hidden><button type="submit">Check answers</button> <button type="reset">Start again</button></div>
<p id="quiz-status" class="status" role="status" aria-live="polite"></p>
</form>
<noscript><p class="muted">Use “Show answer” under each question to check yourself.</p></noscript>`;
  return page({ title: `Quiz: ${a.fm.title}`, base: '../', lang: a.fm.lang, current: 'quiz/index.html', body, scripts: ['quiz.js'] });
}

function pathList(steps, ctx, base) {
  if (!steps.length) return '<p>No articles for this interest yet.</p>';
  return `<ol class="path">${steps.map((s) => {
    const a = ctx.bySlug.get(s.slug);
    const secs = a.sections.filter((x) => x.level === 2 && x.anchor && !['key-claims', 'sources'].includes(x.anchor));
    return `<li class="step">
<h3><a href="${base}a/${s.slug}.html">${esc(s.title)}</a></h3>
<p class="muted">${esc(levelLabel(s.level))}${s.reason === 'prerequisite' ? ' · prerequisite' : ''}</p>
<p>${esc(a.fm.summary.trim())}</p>
${secs.length ? `<details><summary>Sections</summary><ul>${secs.map((x) => `<li><a href="${base}a/${s.slug}.html#${x.anchor}">${esc(x.heading)}</a></li>`).join('')}</ul></details>` : ''}
${s.quizzes.length ? `<p><a href="${base}quiz/${s.slug}.html">Quiz (${s.quizzes.length} question${s.quizzes.length === 1 ? '' : 's'})</a> <span class="progress" data-progress="${s.slug}"></span></p>` : ''}
</li>`;
  }).join('\n')}</ol>`;
}

/** Pure: content + graph/topics data -> { relativePath: string } of HTML pages and assets. */
export function buildSite(content, data) {
  const graph = JSON.parse(data['data/graph.json']);
  const topicsData = JSON.parse(data['data/topics.json']);
  const backlinks = JSON.parse(data['data/backlinks.json']);
  const sorted = [...content.articles].sort((x, y) => x.fm.slug.localeCompare(y.fm.slug));
  const ctx = {
    root: content.root,
    bySlug: content.bySlug,
    backlinks,
    quizSlugs: new Set(content.quizzes.map((q) => q.slug)),
    titleOf: (s) => content.bySlug.get(s)?.fm.title || s,
    headingOf: (s, an) => content.bySlug.get(s)?.sections.find((x) => x.anchor === an)?.heading || an,
    topicTitle: (t) => content.topics.get(t)?.title || t,
  };
  // Guard: a page path written twice (e.g. a topic or slug named 'index') is a build error, never a silent overwrite.
  const out = new Proxy({}, { set(t, k, v) { if (Object.hasOwn(t, k)) throw new Error(`duplicate output path: ${String(k)}`); t[k] = v; return true; } });
  for (const a of sorted) out[`a/${a.fm.slug}.html`] = articlePage(a, ctx);
  for (const q of content.quizzes) out[`quiz/${q.slug}.html`] = quizPage(q, ctx);

  const articleItem = (a, base) => `<li><a href="${base}a/${a.fm.slug}.html">${esc(a.fm.title)}</a> <span class="muted">· ${esc(levelLabel(a.fm.level))}</span><br><span class="desc">${esc(a.fm.summary.trim().split('\n')[0])}</span></li>`;
  const usedTopics = topicsData.filter((t) => lessonPath(graph, topicsData, [t.id]).length);

  out['index.html'] = page({ title: SITE_NAME, base: '', current: 'index.html', description: 'A free, open-source, permanent library readable by humans and machines.', body: `<h1>${SITE_NAME}</h1>
<p class="summary">A free, open-source, permanent library that humans and machines can both read. Every article states its sources, its confidence and when it should be reviewed.</p>
<h2>Start a lesson path</h2>
<p>Pick an interest and get an ordered reading list. <a href="paths/index.html">All lesson paths</a></p>
<ul class="chips">${usedTopics.map((t) => `<li><a href="paths/${t.id}.html">${esc(t.title)}</a></li>`).join('')}</ul>
<h2>All articles</h2>
<ul class="list">${sorted.map((a) => articleItem(a, '')).join('')}</ul>` });

  out['search.html'] = page({ title: 'Search', base: '', current: 'search.html', scripts: ['search.js'], body: `<h1>Search</h1>
<form id="search" role="search" aria-label="Article search" action="search.html" method="get">
<label for="q">Search articles and sections</label>
<div class="row"><input id="q" name="q" type="search" autocomplete="off" aria-describedby="search-help"><button type="submit">Search</button></div>
<p id="search-help" class="muted">Matches titles, section headings and text.</p>
</form>
<p id="search-status" class="status" role="status" aria-live="polite"></p>
<ol id="results" class="list results" hidden></ol>
<noscript><p class="notice">Search needs JavaScript. Browse every article and section below instead.</p></noscript>
<section id="browse" aria-labelledby="browse-h">
<h2 id="browse-h">Browse all articles</h2>
<ul class="list">${sorted.map((a) => `<li><a href="a/${a.fm.slug}.html">${esc(a.fm.title)}</a><ul>${a.sections.filter((s) => s.level === 2 && s.anchor && !['key-claims', 'sources'].includes(s.anchor)).map((s) => `<li><a href="a/${a.fm.slug}.html#${s.anchor}">${esc(s.heading)}</a></li>`).join('')}</ul></li>`).join('')}</ul>
</section>` });

  out['quiz/index.html'] = page({ title: 'Quizzes', base: '../', current: 'quiz/index.html', scripts: ['paths.js'], body: `<h1>Quizzes</h1>
<ul class="list">${content.quizzes.slice().sort((x, y) => x.slug.localeCompare(y.slug)).map((q) => `<li><a href="${q.slug}.html">${esc(ctx.titleOf(q.slug))}</a> <span class="muted">· ${q.questions.length} question${q.questions.length === 1 ? '' : 's'}</span> <span class="progress" data-progress="${q.slug}"></span></li>`).join('')}</ul>` });

  out['paths/index.html'] = page({ title: 'Lesson paths', base: '../', current: 'paths/index.html', scripts: ['paths.js'], body: `<h1>Lesson paths</h1>
<p>Choose an interest to get an ordered reading list. Prerequisites come first, then articles from intro to deep.</p>
<ul class="list">${usedTopics.map((t) => `<li><a href="${t.id}.html">${esc(t.title)}</a> <span class="muted">· ${lessonPath(graph, topicsData, [t.id]).length} articles</span><br><span class="desc">${esc(t.description)}</span></li>`).join('')}</ul>
<form id="path-builder" data-js hidden>
<fieldset><legend>Combine interests</legend>
<ul class="options">${usedTopics.map((t) => `<li><input type="checkbox" id="i-${t.id}" name="interest" value="${t.id}"> <label for="i-${t.id}">${esc(t.title)}</label></li>`).join('')}</ul>
</fieldset>
<button type="submit">Build my path</button>
</form>
<section id="custom-path" aria-live="polite"></section>` });

  for (const t of usedTopics) {
    const steps = lessonPath(graph, topicsData, [t.id]);
    const related = (t.related || []).filter((r) => usedTopics.some((u) => u.id === r));
    out[`paths/${t.id}.html`] = page({ title: `Lesson path: ${t.title}`, base: '../', current: 'paths/index.html', scripts: ['paths.js'], body: `<h1>Lesson path: ${esc(t.title)}</h1>
<p>${esc(t.description)}</p>
<h2>Reading order</h2>
${pathList(steps, ctx, '../')}
${related.length ? `<h2>Related interests</h2><ul class="chips">${related.map((r) => `<li><a href="${r}.html">${esc(ctx.topicTitle(r))}</a></li>`).join('')}</ul>` : ''}` });
  }

  for (const f of fs.readdirSync(ASSET_DIR).sort()) out[`assets/${f}`] = fs.readFileSync(path.join(ASSET_DIR, f), 'utf8');
  out['.nojekyll'] = '';
  return { ...out };
}
