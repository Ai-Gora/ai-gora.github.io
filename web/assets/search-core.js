export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

// tokens() keeps every non-empty run of [a-z0-9]. Matching is exact or prefix:
// an exact match (word === q) scores weight * 2 and has no minimum length; a
// prefix match (word.startsWith(q) and word !== q) scores weight but only when
// the field allows it (not exactOnly) and the query word is at least 2
// characters long. The metadata field is exact-only, carries weight 0.25 and
// lives solely on an article's #top entry (anchor === null, else its first
// entry): it holds the author tokens plus 'ai'/'assisted' for ai_assisted
// articles, so it always ranks below any body-text prefix hit.
const fieldsOf = (e) => {
  const fields = [
    [tokens(e.title), 3, false],
    [tokens(e.heading), 2, false],
    [tokens(e.text), 1, false],
    [e.topics.flatMap(tokens), 1, false],
  ];
  if (e.meta) fields.push([[...tokens((e.authors || []).join(' ')), ...(e.ai_assisted === true ? ['ai', 'assisted'] : [])], 0.25, true]);
  return fields;
};

export function prepareIndex(index) {
  const chosen = new Map();
  index.forEach((e, i) => {
    const rec = chosen.get(e.slug);
    if (!rec) chosen.set(e.slug, { first: i, top: e.anchor === null ? i : -1 });
    else if (rec.top === -1 && e.anchor === null) rec.top = i;
  });
  return index.map((e, i) => {
    const rec = chosen.get(e.slug);
    const meta = i === (rec.top !== -1 ? rec.top : rec.first);
    return { ...e, meta, fields: fieldsOf({ ...e, meta }) };
  });
}

export function search(prepared, query, opts = {}) {
  const qs = tokens(query);
  if (!qs.length) return [];
  const entries = prepared.every((e) => Array.isArray(e.fields)) ? prepared : prepareIndex(prepared);
  const lang = typeof opts.lang === 'string' ? opts.lang : '';
  const hits = [];
  for (const e of entries) {
    if (lang && e.lang !== lang) continue;
    let score = 0;
    let all = true;
    for (const q of qs) {
      let best = 0;
      for (const [words, w, exactOnly] of e.fields) {
        for (const word of words) {
          if (word === q) best = Math.max(best, w * 2);
          else if (!exactOnly && q.length >= 2 && word.startsWith(q)) best = Math.max(best, w);
        }
      }
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
