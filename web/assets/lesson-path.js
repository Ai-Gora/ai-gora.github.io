// Interest-based lesson path over data/graph.json. Pure; shared by the build (Node) and the browser.
export const LEVELS = ['intro', 'core', 'deep'];

/** Topic ids plus all their descendant topics (via topics[].parent). */
export function expandTopics(topics, interests) {
  const want = new Set(interests);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of topics) if (t.parent && want.has(t.parent) && !want.has(t.id)) { want.add(t.id); grew = true; }
  }
  return want;
}

/**
 * Ordered lesson path for the chosen interests.
 * Articles tagged with an interest (or a sub-topic) are included, plus their prerequisites (recursively).
 * Order: prerequisites first (topological), ties broken by level (intro, core, deep) then title.
 * With opts.lang, only nodes in that language are interest candidates, and prerequisites are
 * swapped for an existing translation in that language when one is available.
 * Returns [{ slug, id, title, level, topics, sections, quizzes, reason: 'interest' | 'prerequisite', lang }].
 */
export function lessonPath(graph, topics, interests, opts = {}) {
  const want = expandTopics(topics, interests);
  const bySlug = new Map(graph.nodes.map((n) => [n.slug, n]));
  const lang = opts.lang;
  const resolvePrereq = (p) => {
    if (!lang) return p;
    const pn = bySlug.get(p);
    if (!pn || pn.lang === lang) return p;
    const t = pn.translations?.[lang];
    return t && bySlug.has(t) ? t : p;
  };
  const reason = new Map();
  for (const n of graph.nodes) if ((!lang || n.lang === lang) && n.topics.some((t) => want.has(t))) reason.set(n.slug, 'interest');
  const stack = [...reason.keys()];
  while (stack.length) {
    const n = bySlug.get(stack.pop());
    for (const p of n?.prerequisites || []) { const r = resolvePrereq(p); if (bySlug.has(r) && !reason.has(r)) { reason.set(r, 'prerequisite'); stack.push(r); } }
  }
  const rank = (n) => [LEVELS.indexOf(n.level), n.title.toLowerCase()];
  const cmp = (a, b) => { const [la, ta] = rank(a); const [lb, tb] = rank(b); return la - lb || (ta < tb ? -1 : ta > tb ? 1 : 0); };
  const pending = new Map([...reason.keys()].map((s) => [s, new Set((bySlug.get(s).prerequisites || []).map(resolvePrereq).filter((p) => reason.has(p)))]));
  const out = [];
  while (pending.size) {
    let ready = [...pending.keys()].filter((s) => pending.get(s).size === 0).map((s) => bySlug.get(s));
    if (!ready.length) ready = [...pending.keys()].map((s) => bySlug.get(s)); // cycle: fall back to level/title order
    ready.sort(cmp);
    const next = ready[0];
    pending.delete(next.slug);
    for (const deps of pending.values()) deps.delete(next.slug);
    out.push({ slug: next.slug, id: next.id, title: next.title, level: next.level, topics: next.topics, sections: next.sections, quizzes: next.quizzes, reason: reason.get(next.slug), lang: next.lang });
  }
  return out;
}

/** Sorted unique list of the languages present in the graph. */
export function pathLanguages(graph) {
  return [...new Set(graph.nodes.map((n) => n.lang))].sort();
}
