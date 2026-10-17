export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

// tokens() keeps every non-empty run of [a-z0-9], so there is no minimum token
// length: 2-character terms such as 'ai' and 'eu' are indexed and match.
const fieldsOf = (e) => [
  [tokens(e.title), 3],
  [tokens(e.heading), 2],
  [tokens(e.text), 1],
  [e.topics.flatMap(tokens), 1],
  [[...tokens((e.authors || []).join(' ')), ...(e.ai_assisted === true ? ['ai', 'assisted'] : [])], 0.5], // metadata ranks below any content hit
];

export function prepareIndex(index) {
  return index.map((e) => ({ ...e, fields: fieldsOf(e) }));
}

export function search(prepared, query, opts = {}) {
  const qs = tokens(query);
  if (!qs.length) return [];
  const lang = typeof opts.lang === 'string' ? opts.lang : '';
  const hits = [];
  for (const e of prepared) {
    if (lang && e.lang !== lang) continue;
    const fields = e.fields || fieldsOf(e);
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

export function snippet(text, query) {
  const n = norm(text);
  const q = tokens(query)[0] || '';
  const i = Math.max(0, n.indexOf(q) - 60);
  return (i ? '…' : '') + text.slice(i, i + 180) + (i + 180 < text.length ? '…' : '');
}
