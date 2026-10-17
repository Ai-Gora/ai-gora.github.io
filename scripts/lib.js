// Aigora core: load, validate and build the static data layer.
// Pure Node + js-yaml + ajv. No network, no server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { checkMediaDir, checkAccessibility, sentenceWarnings } from './style.js';

const SCHEMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema');
export const SITE_NAME = 'Aigora';
export const SITE_URL = 'https://ai-gora.github.io';

const loadYaml = (text) => yaml.load(text, { schema: yaml.JSON_SCHEMA });

function makeValidators() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'));
  return {
    article: ajv.compile(read('article.schema.json')),
    quiz: ajv.compile(read('quiz.schema.json')),
    topic: ajv.compile(read('topic.schema.json')),
  };
}

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out.sort();
}

const fmtAjv = (errs) => errs.map((e) => `${e.instancePath || '(root)'} ${e.message}${e.params?.additionalProperty ? ` '${e.params.additionalProperty}'` : ''}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);

export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { fm: m[1], body: m[2] };
}

// Headings "## Title {#anchor}" -> sections with body text.
export function parseSections(body) {
  const sections = [];
  let cur = { anchor: '', heading: '', level: 0, lines: [] };
  for (const line of body.split(/\r?\n/)) {
    const h = /^(#{2,6})\s+(.*?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/.exec(line);
    if (h) {
      sections.push(cur);
      cur = { anchor: h[3] || '', heading: h[2], level: h[1].length, lines: [] };
    } else cur.lines.push(line);
  }
  sections.push(cur);
  return sections.map((s) => ({ anchor: s.anchor, heading: s.heading, level: s.level, text: s.lines.join('\n').trim() }));
}

const WIKILINK = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const CITE = /\[\^(\d+)\]/g;

export function extractWikilinks(text) {
  return [...text.matchAll(WIKILINK)].map((m) => ({ slug: m[1].trim(), anchor: m[2]?.trim() || null, text: m[3]?.trim() || null }));
}
export const extractCitations = (text) => [...text.matchAll(CITE)].map((m) => Number(m[1]));

/** Load and validate a content tree. Returns { errors: string[], content }. */
export function loadContent(root) {
  const v = makeValidators();
  const errors = [];
  const err = (file, msg) => errors.push(`${path.relative(root, file) || file}: ${msg}`);

  const topics = new Map();
  for (const f of walk(path.join(root, 'topics'), '.yaml')) {
    let t;
    try { t = loadYaml(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `YAML parse error: ${e.reason || e.message}`); continue; }
    if (t?.id === 'index') { err(f, "topic id 'index' is reserved"); continue; }
    if (!v.topic(t)) { fmtAjv(v.topic.errors).forEach((m) => err(f, `topic schema: ${m}`)); continue; }
    if (path.basename(f, '.yaml') !== t.id) err(f, `topic id '${t.id}' must match file name`);
    topics.set(t.id, { ...t, file: f });
  }
  for (const t of topics.values()) {
    if (t.parent && !topics.has(t.parent)) err(t.file, `unknown parent topic '${t.parent}'`);
    for (const r of t.related || []) if (!topics.has(r)) err(t.file, `unknown related topic '${r}'`);
  }

  const articles = [];
  const bySlug = new Map();
  const byId = new Map();
  for (const f of walk(path.join(root, 'articles'), '.md')) {
    const raw = fs.readFileSync(f, 'utf8');
    const parts = splitFrontmatter(raw);
    if (!parts) { err(f, 'missing YAML frontmatter (file must start with ---)'); continue; }
    let fm;
    try { fm = loadYaml(parts.fm); } catch (e) { err(f, `frontmatter YAML parse error: ${e.reason || e.message}`); continue; }
    if (fm?.slug === 'index') { err(f, "slug 'index' is reserved"); continue; }
    if (!v.article(fm)) { fmtAjv(v.article.errors).forEach((m) => err(f, `frontmatter schema: ${m}`)); continue; }
    if (path.basename(f, '.md') !== fm.slug) err(f, `slug '${fm.slug}' must match file name`);
    if (bySlug.has(fm.slug)) err(f, `duplicate slug '${fm.slug}'`);
    if (byId.has(fm.id)) err(f, `duplicate id '${fm.id}'`);
    if (fm.review_after < fm.updated) err(f, 'review_after is before updated');
    for (const t of fm.topics) if (!topics.has(t)) err(f, `unknown topic '${t}' (add topics/${t}.yaml)`);
    const a = { fm, body: parts.body, raw, file: f, category: path.basename(path.dirname(f)), sections: parseSections(parts.body) };
    articles.push(a); bySlug.set(fm.slug, a); byId.set(fm.id, a);
  }

  for (const a of articles) {
    const anchors = a.sections.map((s) => s.anchor).filter(Boolean);
    const dup = anchors.filter((x, i) => anchors.indexOf(x) !== i);
    if (dup.length) err(a.file, `duplicate anchors: ${[...new Set(dup)].join(', ')}`);
    for (const s of a.sections) if (s.level === 2 && !s.anchor) err(a.file, `section '${s.heading}' has no {#anchor}`);

    // Wikilinks
    a.links = [];
    for (const l of extractWikilinks(a.body)) {
      const target = bySlug.get(l.slug);
      if (!target) { err(a.file, `broken wikilink [[${l.slug}${l.anchor ? '#' + l.anchor : ''}]]: no article with slug '${l.slug}'`); continue; }
      if (l.anchor && !target.sections.some((s) => s.anchor === l.anchor)) { err(a.file, `broken wikilink [[${l.slug}#${l.anchor}]]: anchor '#${l.anchor}' not found in ${l.slug}`); continue; }
      a.links.push(l);
    }
    for (const p of a.fm.prerequisites || []) if (!bySlug.has(p)) err(a.file, `unknown prerequisite '${p}'`);
    for (const [lang, tid] of Object.entries(a.fm.translations || {})) {
      const t = byId.get(tid);
      if (!t) err(a.file, `translation ${lang}: '${tid}' does not exist`);
      else if (t.fm.lang !== lang) err(a.file, `translation ${lang}: '${tid}' has lang '${t.fm.lang}'`);
      else if ((t.fm.translations || {})[a.fm.lang] !== a.fm.id) err(a.file, `translation ${lang}: '${tid}' does not link back (add translations: {${a.fm.lang}: ${a.fm.id}} to ${t.fm.slug})`);
    }

    // Citations
    const ids = new Set(a.fm.sources.map((s) => s.id));
    if (ids.size !== a.fm.sources.length) err(a.file, 'duplicate source ids');
    const cited = new Set(extractCitations(a.body));
    for (const c of cited) if (!ids.has(c)) err(a.file, `citation [^${c}] has no matching source id ${c} in frontmatter`);
    for (const id of ids) if (!cited.has(id)) err(a.file, `source ${id} is never cited in the body`);
    const kc = a.sections.find((s) => s.anchor === 'key-claims');
    if (!kc) err(a.file, "missing '## Key claims {#key-claims}' section");
    if (!a.sections.some((s) => s.anchor === 'sources')) err(a.file, "missing '## Sources {#sources}' section");
    if (kc) {
      const bullets = kc.text.split(/\r?\n/).filter((l) => /^\s*[-*]\s+/.test(l));
      if (!bullets.length) err(a.file, 'Key claims section has no bullet claims');
      for (const b of bullets) if (!extractCitations(b).length) err(a.file, `Key claims bullet has no citation: "${b.replace(/^\s*[-*]\s+/, '').trim()}"`);
    }
    for (const s of a.sections) {
      if (s.level !== 2 || s.anchor === 'sources' || s.anchor === 'key-claims') continue;
      if (!extractCitations(s.text).length) err(a.file, `section '#${s.anchor || s.heading}' has no citation (every claim section needs a source)`);
    }
  }

  const quizzes = [];
  for (const f of walk(path.join(root, 'quizzes'), '.yaml')) {
    let q;
    try { q = loadYaml(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `YAML parse error: ${e.reason || e.message}`); continue; }
    if (!v.quiz(q)) { fmtAjv(v.quiz.errors).forEach((m) => err(f, `quiz schema: ${m}`)); continue; }
    const a = byId.get(q.article);
    if (!a) { err(f, `quiz article '${q.article}' does not exist`); continue; }
    if (path.basename(f, '.yaml') !== a.fm.slug) err(f, `quiz file name must be '${a.fm.slug}.yaml'`);
    const qids = new Set();
    for (const qu of q.questions) {
      if (qids.has(qu.id)) err(f, `duplicate question id '${qu.id}'`);
      qids.add(qu.id);
      const [slug, anchor] = qu.ref.split('#');
      const t = bySlug.get(slug);
      if (!t || !t.sections.some((s) => s.anchor === anchor)) err(f, `${qu.id}: ref '${qu.ref}' does not point to an existing article anchor`);
      if (['single', 'multi', 'order'].includes(qu.type) && !qu.options) err(f, `${qu.id}: type '${qu.type}' needs options`);
      if (qu.type === 'single' && !(Number.isInteger(qu.answer) && qu.answer >= 0 && qu.answer < (qu.options || []).length)) err(f, `${qu.id}: answer must be an option index`);
      if (qu.type === 'true_false' && typeof qu.answer !== 'boolean') err(f, `${qu.id}: true_false answer must be true or false`);
      if (qu.type === 'multi' && !(Array.isArray(qu.answer) && qu.answer.every((i) => Number.isInteger(i) && i >= 0 && i < (qu.options || []).length))) err(f, `${qu.id}: multi answer must be a list of option indexes`);
      if (qu.type === 'multi' && Array.isArray(qu.answer) && new Set(qu.answer).size !== qu.answer.length) err(f, `${qu.id}: multi answer indexes must be unique`);
    }
    quizzes.push({ ...q, slug: a.fm.slug, file: f });
  }

  // STYLE L1/L2/L5: image sidecars with TASL fields and an allowed licence.
  for (const e of checkMediaDir(root)) errors.push(e);
  // STYLE V2/V4 errors and W2 sentence-length warnings, per article.
  const warnings = [];
  for (const a of articles) {
    for (const e of checkAccessibility(a.body)) err(a.file, e);
    for (const w of sentenceWarnings(a.body)) warnings.push(`${path.relative(root, a.file)}: body line ${w.line}: sentence has ${w.words} words (max 25, STYLE W2): "${w.text.length > 80 ? w.text.slice(0, 77) + '...' : w.text}"`);
  }

  return { errors, warnings, content: { root, topics, articles, bySlug, byId, quizzes } };
}

// JSON safe to embed in <script type="application/ld+json">.
export const safeJson = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c') + '\n';

const absUrl = (p) => `${SITE_URL}/${p}`;

export function jsonLd(a) {
  const fm = a.fm;
  return {
    '@context': 'https://schema.org',
    '@type': ['Article', 'LearningResource'],
    '@id': absUrl(`a/${fm.slug}`),
    identifier: fm.id,
    headline: fm.title,
    name: fm.title,
    abstract: fm.summary.trim(),
    inLanguage: fm.lang,
    educationalLevel: fm.level,
    about: fm.topics.map((t) => ({ '@type': 'Thing', name: t })),
    author: fm.authors.map((n) => ({ '@type': 'Person', name: n })),
    dateModified: fm.updated,
    license: 'https://creativecommons.org/licenses/by-sa/4.0/',
    isAccessibleForFree: true,
    citation: fm.sources.map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url })),
    url: absUrl(`a/${fm.slug}`),
    encoding: { '@type': 'MediaObject', contentUrl: absUrl(`a/${fm.slug}.md`), encodingFormat: 'text/markdown' },
  };
}

/** Pure: content -> { relativePath: string } map of output files. */
export function buildOutputs(content) {
  const { articles, topics, quizzes } = content;
  const out = {};
  const put = (p, obj) => { out[p] = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) + '\n'; };
  const sorted = [...articles].sort((x, y) => x.fm.slug.localeCompare(y.fm.slug));
  const quizBySlug = new Map(quizzes.map((q) => [q.slug, q]));

  const backlinks = Object.fromEntries(sorted.map((a) => [a.fm.slug, []]));
  for (const a of sorted) for (const l of a.links) {
    if (l.slug !== a.fm.slug && !backlinks[l.slug].some((b) => b.slug === a.fm.slug)) backlinks[l.slug].push({ slug: a.fm.slug, id: a.fm.id, title: a.fm.title });
  }

  const sectionsOf = (a) => a.sections.filter((s) => s.anchor).map((s) => ({ anchor: s.anchor, heading: s.heading, level: s.level }));

  put('data/articles.json', sorted.map((a) => ({
    id: a.fm.id, slug: a.fm.slug, title: a.fm.title, summary: a.fm.summary.trim(), category: a.category,
    topics: a.fm.topics, level: a.fm.level, lang: a.fm.lang, status: a.fm.status, confidence: a.fm.confidence,
    updated: a.fm.updated, review_after: a.fm.review_after, md: `a/${a.fm.slug}.md`, json: `a/${a.fm.slug}.json`,
  })));
  put('data/topics.json', [...topics.values()].sort((x, y) => x.id.localeCompare(y.id)).map(({ id, title, description, parent, related }) => ({
    id, title, description, parent: parent || null, related: related || [],
    articles: sorted.filter((a) => a.fm.topics.includes(id)).map((a) => a.fm.slug),
  })));
  put('data/backlinks.json', backlinks);
  put('data/graph.json', {
    nodes: sorted.map((a) => ({
      id: a.fm.id, slug: a.fm.slug, title: a.fm.title, topics: a.fm.topics, level: a.fm.level,
      lang: a.fm.lang,
      translations: Object.fromEntries(Object.entries(a.fm.translations || {}).map(([lang, id]) => [lang, content.byId.get(id)?.fm.slug]).filter(([, slug]) => slug)),
      links: [...new Set(a.links.map((l) => l.slug))], prerequisites: a.fm.prerequisites || [],
      quizzes: (quizBySlug.get(a.fm.slug)?.questions || []).map((q) => `${a.fm.slug}/${q.id}`),
      sections: sectionsOf(a).map((s) => s.anchor),
    })),
    edges: [
      ...sorted.flatMap((a) => a.links.map((l) => ({ from: a.fm.slug, to: l.slug, anchor: l.anchor, type: 'link' }))),
      ...sorted.flatMap((a) => (a.fm.prerequisites || []).map((p) => ({ from: p, to: a.fm.slug, anchor: null, type: 'prerequisite' }))),
    ],
  });
  const plain = (t) => t.replace(WIKILINK, (_m, s, _a, txt) => txt || s).replace(CITE, '').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
  put('data/search-index.json', sorted.flatMap((a) => a.sections.filter((s) => s.text).map((s) => ({
    id: `${a.fm.slug}#${s.anchor || 'top'}`, article: a.fm.id, slug: a.fm.slug, anchor: s.anchor || null,
    title: a.fm.title, heading: s.heading || null, topics: a.fm.topics, authors: a.fm.authors, ai_assisted: a.fm.ai_assisted === true,
    level: a.fm.level, lang: a.fm.lang, updated: a.fm.updated, license: a.fm.license, text: plain(s.text),
  }))));
  put('data/quizzes/index.json', quizzes.map((q) => ({ slug: q.slug, article: q.article, questions: q.questions.length, file: `data/quizzes/${q.slug}.json` })).sort((x, y) => x.slug.localeCompare(y.slug)));
  for (const q of quizzes) put(`data/quizzes/${q.slug}.json`, { article: q.article, slug: q.slug, questions: q.questions });

  for (const a of sorted) {
    put(`a/${a.fm.slug}.md`, a.raw);
    put(`a/${a.fm.slug}.jsonld`, safeJson(jsonLd(a)));
    put(`a/${a.fm.slug}.json`, { frontmatter: a.fm, category: a.category, sections: sectionsOf(a), links: a.links, backlinks: backlinks[a.fm.slug], quiz: quizBySlug.has(a.fm.slug) ? `data/quizzes/${a.fm.slug}.json` : null, jsonld: jsonLd(a) });
  }

  const lines = [`# ${SITE_NAME}`, '', '> A free, open-source, permanent library readable by humans and machines. Articles are Markdown with YAML frontmatter, licensed CC BY-SA 4.0. Freshness is in each article\'s frontmatter (updated, review_after, status).', ''];
  for (const t of [...topics.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    const as = sorted.filter((a) => a.fm.topics[0] === t.id);
    if (!as.length) continue;
    lines.push(`## ${t.title}`, '');
    for (const a of as) lines.push(`- [${a.fm.title}](${absUrl(`a/${a.fm.slug}.md`)}): ${a.fm.summary.trim().split('\n')[0]}`);
    lines.push('');
  }
  lines.push('## Optional', '', `- [All articles, full text](${absUrl('llms-full.txt')}): every article concatenated`, `- [Knowledge graph](${absUrl('data/graph.json')}): articles, links, prerequisites, quizzes`, `- [Search index](${absUrl('data/search-index.json')}): section-level chunks`, '');
  put('llms.txt', lines.join('\n'));
  put('llms-full.txt', sorted.map((a) => `<!-- ${a.fm.id} ${a.fm.slug} -->\n${a.raw.trim()}\n`).join('\n'));
  put('data/manifest.json', { name: SITE_NAME, version: 1, articles: sorted.length, quizzes: quizzes.length, topics: topics.size, files: Object.keys(out).sort() });
  return out;
}

/** Merge maps of { relativePath: string } into one new object, rejecting duplicate paths. */
export function mergeOutputs(...maps) {
  const out = {};
  for (const map of maps) {
    for (const [rel, value] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(out, rel)) throw new Error(`duplicate output path: ${rel}`);
      out[rel] = value;
    }
  }
  return out;
}

/** Resolve --out safely: must be strictly inside root (never root itself or outside). */
export function resolveOutDir(root, out) {
  const r = fs.realpathSync(path.resolve(root));
  const o = path.resolve(r, out);
  const rel = path.relative(r, o);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`refusing --out '${out}': must resolve inside ${r} and not be the repo root`);
  // Also reject symlinked parents escaping the root.
  let p = o; while (!fs.existsSync(p)) p = path.dirname(p);
  const real = path.relative(r, fs.realpathSync(p));
  if (real.startsWith('..') || path.isAbsolute(real) || (!real && p === o)) throw new Error(`refusing --out '${out}': resolves outside ${r} or to the repo root`);
  return o;
}
