// Client-side search over data/search-index.json. Progressive enhancement: without JS the page lists every article.
import { prepareIndex, search, snippet } from './search-core.js';

const form = document.getElementById('search');
const input = document.getElementById('q');
const select = document.getElementById('search-lang');
const status = document.getElementById('search-status');
const results = document.getElementById('results');
const browse = document.getElementById('browse');

let indexPromise;
const loadIndex = () => (indexPromise ||= fetch('data/search-index.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((json) => prepareIndex(json)));

async function run(query, push) {
  const lang = select ? select.value : '';
  if (push) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (lang) params.set('lang', lang);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }
  results.replaceChildren();
  if (!query.trim()) { results.hidden = true; browse.hidden = false; status.textContent = ''; return; }
  let index;
  try { index = await loadIndex(); } catch { status.textContent = 'Search index could not be loaded. Browse the articles below.'; return; }
  const hits = search(index, query, { lang }).slice(0, 30);
  const langLabel = lang && select ? ` in ${select.options[select.selectedIndex].text}` : '';
  status.textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} for “${query}”${langLabel}.`;
  for (const h of hits) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `a/${h.slug}.html${h.anchor ? `#${h.anchor}` : ''}`;
    a.lang = h.lang;
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
  const params = new URLSearchParams(location.search);
  const initial = params.get('q') || '';
  input.value = initial;
  const initialLang = params.get('lang') || '';
  if (select && [...select.options].some((o) => o.value === initialLang)) select.value = initialLang;
  if (initial) run(initial, false);
  form.addEventListener('submit', (ev) => { ev.preventDefault(); run(input.value, true); });
  if (select) select.addEventListener('change', () => run(input.value, true));
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value, true), 200); });
}
