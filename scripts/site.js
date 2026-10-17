// Aigora static site: content -> HTML pages + assets. No framework, no runtime deps.
// Reading articles and lesson paths needs no JS; search and quizzes are progressive enhancement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME, SITE_URL, safeJson, jsonLd } from './lib.js';
import { lessonPath, pathLanguages } from '../web/assets/lesson-path.js';
import { t, tn } from '../web/assets/i18n.js';

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'assets');
const MERMAID_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'mermaid');

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const LANG_NAMES = { en: 'English', sl: 'Slovenščina' };
const langName = (l) => LANG_NAMES[l] || l;
const safeUrl = (u) => (/^(https?:\/\/|mailto:|#|\.{0,2}\/|[a-z0-9-]+\.html)/i.test(u) && !/^\s*javascript:/i.test(u) ? u : '#');
const NUL = String.fromCharCode(0);

/** Inline Markdown: code, wikilinks, links, bold, italics, [^n] citations. Input is raw text; output is safe HTML. */
export function renderInline(text, ctx) {
  return text.split(/(`[^`\n]+`)/).map((part, i) => {
    if (i % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
    let s = esc(part).replaceAll(NUL, ''); // NUL is reserved for tag placeholders below
    // Images first (before wikilinks), so alt text stays plain: [[slug|text]] in alt becomes its text.
    // Only repo media (STYLE V4/L5), rewritten against the page base; anything else is dropped.
    s = s.replace(/!\[((?:\[\[[^\]]*\]\]|[^\]])*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
      const plain = alt.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_w, slug, txt) => (txt || slug).trim());
      const ok = /^media\/[A-Za-z0-9._/-]+\.(png|jpe?g|webp|gif)$/i.test(src) && !src.split('/').includes('..');
      return ok ? `<img src="${ctx.base}${src}" alt="${plain}" loading="lazy">` : '';
    });
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
    s = s.replace(/\[\^(\d+)\]/g, (_m, n) => `<sup class="cite"><a href="#source-${n}" aria-label="${esc(t(ctx.lang, 'sourceN', { n }))}">[${n}]</a></sup>`);
    return s;
  }).join('');
}

/** accTitle and accDescr (one line, or an `accDescr { ... }` block) from Mermaid source lines. */
export function mermaidAcc(lines) {
  let title = '';
  let descr = '';
  for (let i = 0; i < lines.length; i++) {
    const tm = /^\s*accTitle\s*:\s*(.*)$/.exec(lines[i]);
    if (tm) title = tm[1].trim();
    const dm = /^\s*accDescr\s*:\s*(.*)$/.exec(lines[i]);
    if (dm) descr = dm[1].trim();
    if (/^\s*accDescr\s*\{/.test(lines[i])) {
      const buf = [lines[i].replace(/^\s*accDescr\s*\{/, '')];
      while (!buf[buf.length - 1].includes('}') && i + 1 < lines.length) buf.push(lines[++i]);
      descr = buf.join(' ').replace(/\}.*$/, '').replace(/\s+/g, ' ').trim();
    }
  }
  return { title, descr };
}

// Mermaid: without JS the reader gets the source plus the accTitle/accDescr text; diagram.js renders the SVG.
function mermaidBlock(lines, ctx) {
  const { title, descr } = mermaidAcc(lines);
  const caption = title || descr ? `<figcaption><strong>${esc(t(ctx.lang, 'diagram'))}${title ? `: ${esc(title)}` : ''}.</strong>${descr ? ` ${esc(descr)}` : ''}</figcaption>` : '';
  return `<figure class="diagram"><pre class="mermaid" data-mermaid><code>${esc(lines.join('\n'))}</code></pre>${caption}</figure>`;
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const TABLE_SEP = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Block Markdown subset: paragraphs, lists, blockquotes, fenced code (Mermaid kept as text), pipe tables, <details> blocks, images. Headings are handled per section. */
export function renderBlocks(text, ctx) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const lang = line.replace(/^```\s*/, '').trim();
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(lang === 'mermaid' ? mermaidBlock(buf, ctx) : `<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const det = /^<details><summary>(.+)<\/summary>\s*$/.exec(line.trim());
    if (det) {
      const buf = []; i++;
      while (i < lines.length && lines[i].trim() !== '</details>') buf.push(lines[i++]);
      i++;
      out.push(`<details><summary>${renderInline(det[1], ctx)}</summary>${renderBlocks(buf.join('\n'), ctx)}</details>`);
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${renderInline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
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
    const buf = [lines[i++].trim()]; // always consume the first line, so a stray pipe row cannot stall the loop
    while (i < lines.length && lines[i].trim() && !/^(```|>|\s*([-*]|\d+\.)\s+)/.test(lines[i]) && !isTableRow(lines[i]) && !/^<details>/.test(lines[i].trim())) buf.push(lines[i++].trim());
    out.push(`<p>${renderInline(buf.join(' '), ctx)}</p>`);
  }
  return out.join('\n');
}

const NAV = [['index.html', 'navHome'], ['search.html', 'navSearch'], ['paths/index.html', 'navPaths'], ['quiz/index.html', 'navQuizzes']];

// Pages that run Mermaid only load same-origin resources, so a gap in the source guard still can't fetch anything outside.
// img-src allows data: only for the page's blank favicon (<link rel="icon" href="data:,">); data: never makes a request, and the guard rejects data: in diagram sources.
// Inline JSON-LD (type application/ld+json) is a data block, not executed, so script-src 'self' doesn't affect it.
export const DIAGRAM_CSP = "default-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'";

function page({ title, base, lang = 'en', current, body, head = '', scripts = [], description = '', csp = '' }) {
  const L = (k) => esc(t(lang, k));
  const nav = NAV.map(([href, key]) => `<li><a href="${base}${href}"${current === href ? ' aria-current="page"' : ''}>${L(key)}</a></li>`).join('');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
${csp ? `<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">\n` : ''}<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${title === SITE_NAME ? '' : ` · ${SITE_NAME}`}</title>
${description ? `<meta name="description" content="${esc(description)}">\n` : ''}<link rel="icon" href="data:,">
<link rel="stylesheet" href="${base}assets/style.css">
${head}</head>
<body>
<a class="skip" href="#main">${L('skip')}</a>
<header class="site">
<a class="brand" href="${base}index.html">${SITE_NAME}</a>
<nav aria-label="${L('navSite')}"><ul>${nav}</ul></nav>
<form class="quick-search" role="search" aria-label="${L('siteSearch')}" action="${base}search.html" method="get">
<label for="site-q" class="visually-hidden">${L('searchArticles')}</label>
<input id="site-q" name="q" type="search" placeholder="${L('searchPlaceholder')}" autocomplete="off">
<button type="submit">${L('searchButton')}</button>
</form>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site">
<p>${L('footerContent')}: <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. ${L('footerCode')}: MIT. <a href="${base}llms.txt">llms.txt</a> · <a href="${base}data/graph.json">graph.json</a> · <a href="https://github.com/Ai-Gora/ai-gora.github.io">${L('footerSource')}</a></p>
</footer>
${scripts.map((s) => `<script type="module" src="${base}assets/${s}"></script>`).join('\n')}
</body>
</html>
`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-17' -> '17 Oct 2026' (en) or '17. 10. 2026' (sl). String parsing only, so no timezone shifts. */
export const fmtDate = (iso, lang = 'en') => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m || !MONTHS[m[2] - 1]) return String(iso);
  return lang === 'sl' ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : `${Number(m[3])} ${MONTHS[m[2] - 1]} ${m[1]}`;
};
const timeTag = (iso, lang = 'en') => `<time datetime="${esc(iso)}">${esc(fmtDate(iso, lang))}</time>`;

const levelLabel = (l, lang = 'en') => t(lang, `level_${l}`);
const answerText = (q, lang = 'en') => {
  if (q.type === 'single') return q.options[q.answer];
  if (q.type === 'multi') return q.answer.map((i) => q.options[i]).join(', ');
  if (q.type === 'true_false') return t(lang, q.answer ? 'true' : 'false');
  return Array.isArray(q.answer) ? q.answer.join(', ') : String(q.answer);
};

/** A topic's title or description as HTML for a page in `lang`: its i18n text, else the English text (lang="en" on non-English pages). */
export function topicText(topic, lang, field = 'title') {
  const local = topic?.i18n?.[lang]?.[field];
  if (local) return esc(local);
  const en = topic?.[field] ?? '';
  return lang === 'en' ? esc(en) : `<span lang="en">${esc(en)}</span>`;
}

function articlePage(a, ctx) {
  const { fm } = a;
  const lang = fm.lang;
  const L = (k, v) => esc(t(lang, k, v));
  const c = { ...ctx, base: '../', lang };
  const secs = a.sections;
  const lead = secs[0].heading ? '' : renderBlocks(secs[0].text, c);
  const toc = secs.filter((s) => s.level === 2 && s.anchor).map((s) => `<li><a href="#${s.anchor}">${renderInline(s.heading, c)}</a></li>`).join('');
  const sources = `<ol class="sources">${fm.sources.map((s) => `<li id="source-${s.id}" value="${s.id}"><a href="${esc(safeUrl(s.url))}">${esc(s.title)}</a>${s.accessed ? ` <span class="muted">(${L('accessed')} <time datetime="${esc(s.accessed)}">${esc(s.accessed)}</time>)</span>` : ''}</li>`).join('')}</ol>`;
  const body = secs.filter((s) => s.heading).map((s) => {
    const h = `<h${s.level}${s.anchor ? ` id="${s.anchor}"` : ''}>${renderInline(s.heading, c)}</h${s.level}>`;
    return `${h}\n${s.anchor === 'sources' ? sources : renderBlocks(s.text, c)}`;
  }).join('\n');
  const topicLinks = fm.topics.map((tid) => `<a href="../${ctx.topicHref(tid, lang)}">${topicText(ctx.topics.get(tid) ?? { title: tid }, lang)}</a>`).join(', ');
  const back = ctx.backlinks[fm.slug] || [];
  const prereq = (fm.prerequisites || []).map((p) => `<li><a href="${p}.html">${esc(ctx.titleOf(p))}</a></li>`).join('');
  const quiz = ctx.quizSlugs.has(fm.slug);
  const draft = fm.status === 'draft' ? `<p class="notice" role="note"><strong>${L('draftLabel')}</strong> ${L('draftText')}</p>` : '';
  const stale = fm.status === 'stale' ? `<p class="notice" role="note"><strong>${L('staleLabel')}</strong> ${L('staleText')}</p>` : '';
  const due = fm.status !== 'stale' && ctx.today > fm.review_after ? `<p class="notice due" role="note"><strong>${L('dueLabel')}</strong> ${esc(t(lang, 'dueText', { date: '\u0000' })).replace('\u0000', timeTag(fm.review_after, lang))}</p>` : '';
  const langs = [{ lang: fm.lang, slug: fm.slug, current: true }];
  for (const [l, id] of Object.entries(fm.translations || {})) {
    if (l === fm.lang) continue;
    const t = ctx.byId.get(id);
    if (t) langs.push({ lang: l, slug: t.fm.slug, current: false });
  }
  const translated = langs.length > 1;
  const langNav = translated ? `<nav class="langs" aria-label="${L('languages')}"><ul>${langs.map((x) => (x.current ? `<li><span aria-current="true" lang="${esc(x.lang)}">${esc(langName(x.lang))}</span></li>` : `<li><a href="${esc(x.slug)}.html" hreflang="${esc(x.lang)}" lang="${esc(x.lang)}" rel="alternate">${esc(langName(x.lang))}</a></li>`)).join('')}</ul></nav>\n` : '';
  const canonical = `<link rel="canonical" href="${esc(`${SITE_URL}/a/${fm.slug}.html`)}">\n`;
  const altLinks = translated ? langs.map((x) => `<link rel="alternate" hreflang="${esc(x.lang)}" href="${esc(`${SITE_URL}/a/${x.slug}.html`)}">\n`).join('') : '';
  const html = `<article class="article">
<header>
<p class="kicker">${esc(levelLabel(fm.level, lang))} · ${topicLinks}</p>
<h1>${esc(fm.title)}</h1>
${langNav}<p class="summary"><strong>${L('inShort')}</strong> ${esc(fm.summary.trim())}</p>
${draft}${stale}${due}<dl class="meta living" aria-label="${L('articleStatus')}">
<div><dt>${L('metaChecked')}</dt><dd>${timeTag(fm.updated, lang)}</dd></div>
<div><dt>${L('metaNextReview')}</dt><dd>${timeTag(fm.review_after, lang)}</dd></div>
<div><dt>${L('metaConfidence')}</dt><dd>${L(`confidence_${fm.confidence}`)}</dd></div>
<div><dt>${L('metaStatus')}</dt><dd>${L(`status_${fm.status}`)}</dd></div>
<div><dt>${L('metaAuthors')}</dt><dd>${fm.authors.map(esc).join(', ')}${fm.ai_assisted ? ` · ${L('aiAssistedShort')}` : ''}</dd></div>
</dl>
</header>
${prereq ? `<aside class="box" aria-labelledby="prereq-h"><h2 id="prereq-h" class="box-h">${L('readFirst')}</h2><ul>${prereq}</ul></aside>` : ''}
${toc ? `<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h" class="box-h">${L('contents')}</h2><ol>${toc}</ol></nav>` : ''}
${lead}
${body}
<footer class="article-foot">
${quiz ? `<p><a class="button" href="../quiz/${fm.slug}.html">${L('takeQuiz', { title: fm.title })}</a></p>` : ''}
<section aria-labelledby="back-h"><h2 id="back-h">${L('whatLinksHere')}</h2>${back.length ? `<ul>${back.map((b) => `<li><a href="${b.slug}.html">${esc(b.title)}</a></li>`).join('')}</ul>` : `<p class="muted">${L('noBacklinks')}</p>`}</section>
<p class="muted">ID <code>${esc(fm.id)}</code> · ${L('licence')} ${esc(fm.license)} · <a href="${fm.slug}.md">${L('markdownSource')}</a> · <a href="${fm.slug}.json">JSON</a> · <a href="https://github.com/Ai-Gora/ai-gora.github.io/commits/main/${esc(path.relative(ctx.root, a.file).split(path.sep).join('/'))}">${L('history')}</a></p>
</footer>
</article>`;
  return page({ title: fm.title, base: '../', lang: fm.lang, ...(html.includes('data-mermaid') ? { scripts: ['diagram.js'], csp: DIAGRAM_CSP } : {}), body: html, description: fm.summary.trim(), head: `${canonical}${altLinks}<script type="application/ld+json">\n${safeJson(jsonLd(a))}</script>\n` });
}

function questionHtml(q, slug, ctx, lang = 'en') {
  const L = (k) => esc(t(lang, k));
  const name = `${slug}-${q.id}`;
  let control;
  if (q.type === 'single' || q.type === 'multi' || q.type === 'true_false') {
    const opts = q.type === 'true_false' ? [t(lang, 'true'), t(lang, 'false')] : q.options;
    const kind = q.type === 'multi' ? 'checkbox' : 'radio';
    control = `<ul class="options">${opts.map((o, i) => `<li><input type="${kind}" id="${name}-${i}" name="${name}" value="${q.type === 'true_false' ? String(i === 0) : i}"> <label for="${name}-${i}">${esc(o)}</label></li>`).join('')}</ul>`;
  } else {
    const hint = q.type === 'order' && q.options ? `<p class="muted" id="${name}-hint">${L('orderHint')} ${q.options.map(esc).join(', ')}</p>` : '';
    control = `${hint}<label for="${name}-in">${L('yourAnswer')}</label> <input type="text" id="${name}-in" name="${name}"${hint ? ` aria-describedby="${name}-hint"` : ''}>`;
  }
  const [rslug, anchor] = q.ref.split('#');
  return `<fieldset class="question" data-qid="${q.id}">
<legend>${esc(q.prompt)}</legend>
${control}
<p class="feedback" data-feedback hidden></p>
<details><summary>${L('showAnswer')}</summary><p><strong>${L('answer')}</strong> ${esc(answerText(q, lang))}</p>${q.explain ? `<p>${esc(q.explain)}</p>` : ''}<p><a href="../a/${rslug}.html#${anchor}">${L('read')} ${esc(ctx.titleOf(rslug))}, ${esc(ctx.headingOf(rslug, anchor))}</a></p></details>
</fieldset>`;
}

function quizPage(q, ctx) {
  const a = ctx.bySlug.get(q.slug);
  const lang = a.fm.lang;
  const L = (k) => esc(t(lang, k));
  const [introA, introB] = t(lang, 'quizIntro').split('{link}');
  const body = `<h1>${esc(t(lang, 'quizTitle', { title: a.fm.title }))}</h1>
<p>${esc(introA)}<a href="../a/${q.slug}.html">${esc(a.fm.title)}</a>${esc(introB ?? '')}</p>
<form id="quiz" class="quiz" data-lang="${esc(lang)}" data-src="../data/quizzes/${q.slug}.json" data-slug="${q.slug}" novalidate>
${q.questions.map((qu) => questionHtml(qu, q.slug, ctx, lang)).join('\n')}
<div class="quiz-actions" data-js hidden><button type="submit">${L('checkAnswers')}</button> <button type="reset">${L('startAgain')}</button></div>
<p id="quiz-status" class="status" role="status" aria-live="polite"></p>
</form>
<noscript><p class="muted">${L('quizNoscript')}</p></noscript>`;
  return page({ title: t(lang, 'quizTitle', { title: a.fm.title }), base: '../', lang, current: 'quiz/index.html', body, scripts: ['quiz.js'] });
}

function pathList(steps, ctx, base, lang = 'en') {
  const L = (k) => esc(t(lang, k));
  if (!steps.length) return `<p>${L('noPathArticles')}</p>`;
  return `<p class="path-progress" data-path-progress hidden></p>\n<ol class="path">${steps.map((s) => {
    const a = ctx.bySlug.get(s.slug);
    const secs = a.sections.filter((x) => x.level === 2 && x.anchor && !['key-claims', 'sources'].includes(x.anchor));
    return `<li class="step" data-slug="${esc(s.slug)}">
<h3 lang="${esc(s.lang)}"><a href="${base}a/${s.slug}.html">${esc(s.title)}</a></h3>
<p class="muted">${esc(levelLabel(s.level, lang))} · ${esc(langName(s.lang))}${s.reason === 'prerequisite' ? ` · ${L('prerequisite')}` : ''}</p>
<p>${esc(a.fm.summary.trim())}</p>
${secs.length ? `<details><summary>${L('sections')}</summary><ul>${secs.map((x) => `<li><a href="${base}a/${s.slug}.html#${x.anchor}">${esc(x.heading)}</a></li>`).join('')}</ul></details>` : ''}
${s.quizzes.length ? `<p><a href="${base}quiz/${s.slug}.html">${L('quiz')} (${esc(tn(lang, 'questions', s.quizzes.length))})</a> <span class="progress" data-progress="${s.slug}"></span></p>` : ''}
</li>`;
  }).join('\n')}</ol>`;
}

/** Pure: content + graph/topics data -> { relativePath: string } of HTML pages and assets. */
export function buildSite(content, data, opts = {}) {
  const graph = JSON.parse(data['data/graph.json']);
  const topicsData = JSON.parse(data['data/topics.json']);
  const backlinks = JSON.parse(data['data/backlinks.json']);
  const langs = pathLanguages(graph);
  const sorted = [...content.articles].sort((x, y) => x.fm.slug.localeCompare(y.fm.slug));
  const ctx = {
    root: content.root,
    today: opts.today || new Date().toISOString().slice(0, 10),
    bySlug: content.bySlug,
    byId: content.byId,
    backlinks,
    quizSlugs: new Set(content.quizzes.map((q) => q.slug)),
    titleOf: (s) => content.bySlug.get(s)?.fm.title || s,
    headingOf: (s, an) => content.bySlug.get(s)?.sections.find((x) => x.anchor === an)?.heading || an,
    topics: content.topics,
    topicTitle: (t) => content.topics.get(t)?.title || t,
    // Non-English articles link to their language's lesson path when it exists.
    topicHref: (tid, lang) => (lang !== 'en' && langs.includes(lang) && lessonPath(graph, topicsData, [tid], { lang }).length ? `paths/${lang}/${tid}.html` : `paths/${tid}.html`),
  };
  // Guard: a page path written twice (e.g. a topic or slug named 'index') is a build error, never a silent overwrite.
  const out = new Proxy({}, { set(t, k, v) { if (Object.hasOwn(t, k)) throw new Error(`duplicate output path: ${String(k)}`); t[k] = v; return true; } });
  for (const a of sorted) out[`a/${a.fm.slug}.html`] = articlePage(a, ctx);
  for (const q of content.quizzes) out[`quiz/${q.slug}.html`] = quizPage(q, ctx);

  const articleItem = (a, base) => `<li><a href="${base}a/${a.fm.slug}.html" lang="${esc(a.fm.lang)}">${esc(a.fm.title)}</a> <span class="muted">· ${esc(levelLabel(a.fm.level))} · ${esc(langName(a.fm.lang))}</span><br><span class="desc" lang="${esc(a.fm.lang)}">${esc(a.fm.summary.trim().split('\n')[0])}</span></li>`;
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
<div class="row"><span class="field"><input id="q" name="q" type="search" autocomplete="off" placeholder=" " aria-describedby="search-help"><span class="caret" aria-hidden="true"></span></span><button type="submit">Search</button></div>
<p><label for="search-lang">Language</label> <select id="search-lang" name="lang"><option value="">All languages</option>${langs.map((c) => `<option value="${esc(c)}">${esc(langName(c))}</option>`).join('')}</select></p>
<p id="search-help" class="muted">Matches titles, section headings and text.</p>
</form>
<p id="search-status" class="status" role="status" aria-live="polite"></p>
<ol id="results" class="list results" hidden></ol>
<noscript><p class="notice">Search needs JavaScript. Browse every article and section below instead.</p></noscript>
<section id="browse" aria-labelledby="browse-h">
<h2 id="browse-h">Browse all articles</h2>
${langs.map((code) => `<h3 lang="${esc(code)}">${esc(langName(code))}</h3>
<ul class="list">${sorted.filter((a) => a.fm.lang === code).map((a) => `<li lang="${esc(code)}"><a href="a/${a.fm.slug}.html">${esc(a.fm.title)}</a><ul>${a.sections.filter((s) => s.level === 2 && s.anchor && !['key-claims', 'sources'].includes(s.anchor)).map((s) => `<li><a href="a/${a.fm.slug}.html#${s.anchor}">${esc(s.heading)}</a></li>`).join('')}</ul></li>`).join('')}</ul>`).join('\n')}
</section>` });

  out['quiz/index.html'] = page({ title: 'Quizzes', base: '../', current: 'quiz/index.html', scripts: ['paths.js'], body: `<h1>Quizzes</h1>
<ul class="list">${content.quizzes.slice().sort((x, y) => x.slug.localeCompare(y.slug)).map((q) => `<li><a href="${q.slug}.html">${esc(ctx.titleOf(q.slug))}</a> <span class="muted">· ${q.questions.length} question${q.questions.length === 1 ? '' : 's'}</span> <span class="progress" data-progress="${q.slug}"></span></li>`).join('')}</ul>` });

  const pathIntro = 'Choose an interest to get an ordered reading list. Prerequisites come first, then articles from intro to deep.';
  const langFilterNav = (currentLang, hrefFor, lang = 'en') => {
    const item = (code) => {
      const href = hrefFor(code);
      if (href === null) return '';
      const current = code === currentLang ? ' aria-current="page"' : '';
      const langAttr = code ? ` lang="${esc(code)}"` : '';
      return `<li><a href="${esc(href)}"${current}${langAttr}>${esc(code ? langName(code) : t(lang, 'allLanguages'))}</a></li>`;
    };
    return `<nav class="lang-filter" aria-label="${esc(t(lang, 'language'))}"><ul>${[null, ...langs].map(item).join('')}</ul></nav>`;
  };

  out['paths/index.html'] = page({ title: 'Lesson paths', base: '../', current: 'paths/index.html', scripts: ['paths.js'], body: `<h1>Lesson paths</h1>
${langFilterNav(null, (code) => (code ? `${code}/index.html` : 'index.html'))}
<p>${pathIntro}</p>
<ul class="list">${usedTopics.map((t) => `<li><a href="${t.id}.html">${esc(t.title)}</a> <span class="muted">· ${lessonPath(graph, topicsData, [t.id]).length} articles</span><br><span class="desc">${esc(t.description)}</span></li>`).join('')}</ul>
<form id="path-builder" data-js hidden>
<fieldset><legend>Combine interests</legend>
<ul class="options">${usedTopics.map((t) => `<li><input type="checkbox" id="i-${t.id}" name="interest" value="${t.id}"> <label for="i-${t.id}">${esc(t.title)}</label></li>`).join('')}</ul>
</fieldset>
<p><label for="path-lang">Language</label> <select id="path-lang" name="lang"><option value="">All languages</option>${langs.map((c) => `<option value="${esc(c)}">${esc(langName(c))}</option>`).join('')}</select></p>
<button type="submit">Build my path</button>
</form>
<section id="custom-path" aria-live="polite"></section>` });

  for (const t of usedTopics) {
    const steps = lessonPath(graph, topicsData, [t.id]);
    const related = (t.related || []).filter((r) => usedTopics.some((u) => u.id === r));
    const langHref = (code) => (!code ? `${t.id}.html` : (lessonPath(graph, topicsData, [t.id], { lang: code }).length ? `${code}/${t.id}.html` : null));
    out[`paths/${t.id}.html`] = page({ title: `Lesson path: ${t.title}`, base: '../', current: 'paths/index.html', scripts: ['paths.js'], body: `<h1>Lesson path: ${esc(t.title)}</h1>
${langFilterNav(null, langHref)}
<p>${esc(t.description)}</p>
<h2>Reading order</h2>
${pathList(steps, ctx, '../')}
${related.length ? `<h2>Related interests</h2><ul class="chips">${related.map((r) => `<li><a href="${r}.html">${esc(ctx.topicTitle(r))}</a></li>`).join('')}</ul>` : ''}` });
  }

  for (const code of langs) {
    const codeTopics = usedTopics.filter((t) => lessonPath(graph, topicsData, [t.id], { lang: code }).length);
    const indexHref = (c) => (!c ? '../index.html' : c === code ? 'index.html' : `../${c}/index.html`);
    const pathsTitle = `${t(code, 'pathsTitle')} (${langName(code)})`;
    out[`paths/${code}/index.html`] = page({ title: pathsTitle, base: '../../', lang: code, current: 'paths/index.html', scripts: ['paths.js'], body: `<h1>${esc(pathsTitle)}</h1>
${langFilterNav(code, indexHref, code)}
<p>${esc(t(code, 'pathsIntro'))}</p>
<ul class="list">${codeTopics.map((tp) => `<li><a href="${tp.id}.html">${topicText(tp, code)}</a> <span class="muted">· ${esc(tn(code, 'articles', lessonPath(graph, topicsData, [tp.id], { lang: code }).length))}</span><br><span class="desc">${topicText(tp, code, 'description')}</span></li>`).join('')}</ul>` });
    for (const tp of codeTopics) {
      const topicHref = (c) => (!c ? `../${tp.id}.html` : c === code ? `${tp.id}.html` : (lessonPath(graph, topicsData, [tp.id], { lang: c }).length ? `../${c}/${tp.id}.html` : null));
      const [ptA, ptB] = t(code, 'pathTitle').split('{title}');
      out[`paths/${code}/${tp.id}.html`] = page({ title: `${t(code, 'pathTitle', { title: tp.i18n?.[code]?.title || tp.title })} (${langName(code)})`, base: '../../', lang: code, current: 'paths/index.html', scripts: ['paths.js'], body: `<h1>${esc(ptA)}${topicText(tp, code)}${esc(ptB ?? '')} (${esc(langName(code))})</h1>
${langFilterNav(code, topicHref, code)}
<p>${topicText(tp, code, 'description')}</p>
<h2>${esc(t(code, 'readingOrder'))}</h2>
${pathList(lessonPath(graph, topicsData, [tp.id], { lang: code }), ctx, '../../', code)}` });
    }
  }

  for (const f of fs.readdirSync(ASSET_DIR).sort()) out[`assets/${f}`] = fs.readFileSync(path.join(ASSET_DIR, f), 'utf8');
  // Self-hosted Mermaid (no CDN); diagram.js loads it only on pages that contain a diagram.
  out['assets/vendor/mermaid.min.js'] = fs.readFileSync(path.join(MERMAID_DIR, 'dist', 'mermaid.min.js'), 'utf8');
  out['assets/vendor/mermaid.LICENSE.txt'] = fs.readFileSync(path.join(MERMAID_DIR, 'LICENSE'), 'utf8');
  out['.nojekyll'] = '';
  return { ...out };
}
