export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

const fieldsOf = (e) => [[tokens(e.title), 3], [tokens(e.heading), 2], [tokens(e.text), 1], [e.topics.flatMap(tokens), 1]];

export function prepareIndex(index) {
  return index.map((e) => ({ ...e, fields: fieldsOf(e) }));
}

export function search(prepared, query) {
  const qs = tokens(query);
  if (!qs.length) return [];
  const hits = [];
  for (const e of prepared) {
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
