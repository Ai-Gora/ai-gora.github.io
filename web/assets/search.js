// Client-side search over data/search-index.json. Progressive enhancement: without JS the page lists every article.
const form = document.getElementById('search');
const input = document.getElementById('q');
const status = document.getElementById('search-status');
const results = document.getElementById('results');
const browse = document.getElementById('browse');

export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

export function search(index, query) {
  const qs = tokens(query);
  if (!qs.length) return [];
  const hits = [];
  for (const e of index) {
    const fields = [[tokens(e.title), 3], [tokens(e.heading), 2], [tokens(e.text), 1], [e.topics.flatMap(tokens), 1]];
    let score = 0;
    let all = true;
    for (const q of qs) {
      let best = 0;
      for (const [words, w] of fields) for (const word of words) if (word.startsWith(q)) best = Math.max(best, word === q ? w * 2 : w);
      if (!best) { all = false; break; }
      score += best;
    }
    if (all) hits.push({ e, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title)).map((h) => h.e);
}

function snippet(text, query) {
  const n = norm(text);
  const q = tokens(query)[0] || '';
  const i = Math.max(0, n.indexOf(q) - 60);
  return (i ? '…' : '') + text.slice(i, i + 180) + (i + 180 < text.length ? '…' : '');
}

let indexPromise;
const loadIndex = () => (indexPromise ||= fetch('data/search-index.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));

async function run(query, push) {
  if (push) history.replaceState(null, '', query ? `?q=${encodeURIComponent(query)}` : location.pathname);
  results.replaceChildren();
  if (!query.trim()) { results.hidden = true; browse.hidden = false; status.textContent = ''; return; }
  let index;
  try { index = await loadIndex(); } catch { status.textContent = 'Search index could not be loaded. Browse the articles below.'; return; }
  const hits = search(index, query).slice(0, 30);
  status.textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} for “${query}”.`;
  for (const h of hits) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `a/${h.slug}.html${h.anchor ? `#${h.anchor}` : ''}`;
    a.textContent = h.heading ? `${h.title}: ${h.heading}` : h.title;
    const p = document.createElement('span');
    p.className = 'desc';
    p.textContent = snippet(h.text, query);
    li.append(a, document.createElement('br'), p);
    results.append(li);
  }
  results.hidden = !hits.length;
  browse.hidden = hits.length > 0;
}

if (form) {
  const initial = new URLSearchParams(location.search).get('q') || '';
  input.value = initial;
  if (initial) run(initial, false);
  form.addEventListener('submit', (ev) => { ev.preventDefault(); run(input.value, true); });
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value, true), 200); });
}
