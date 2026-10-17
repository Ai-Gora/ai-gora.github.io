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
 * Returns [{ slug, id, title, level, topics, sections, quizzes, reason: 'interest' | 'prerequisite' }].
 */
export function lessonPath(graph, topics, interests) {
  const want = expandTopics(topics, interests);
  const bySlug = new Map(graph.nodes.map((n) => [n.slug, n]));
  const reason = new Map();
  for (const n of graph.nodes) if (n.topics.some((t) => want.has(t))) reason.set(n.slug, 'interest');
  const stack = [...reason.keys()];
  while (stack.length) {
    const n = bySlug.get(stack.pop());
    for (const p of n?.prerequisites || []) if (bySlug.has(p) && !reason.has(p)) { reason.set(p, 'prerequisite'); stack.push(p); }
  }
  const rank = (n) => [LEVELS.indexOf(n.level), n.title.toLowerCase()];
  const cmp = (a, b) => { const [la, ta] = rank(a); const [lb, tb] = rank(b); return la - lb || (ta < tb ? -1 : ta > tb ? 1 : 0); };
  const pending = new Map([...reason.keys()].map((s) => [s, new Set((bySlug.get(s).prerequisites || []).filter((p) => reason.has(p)))]));
  const out = [];
  while (pending.size) {
    let ready = [...pending.keys()].filter((s) => pending.get(s).size === 0).map((s) => bySlug.get(s));
    if (!ready.length) ready = [...pending.keys()].map((s) => bySlug.get(s)); // cycle: fall back to level/title order
    ready.sort(cmp);
    const next = ready[0];
    pending.delete(next.slug);
    for (const deps of pending.values()) deps.delete(next.slug);
    out.push({ slug: next.slug, id: next.id, title: next.title, level: next.level, topics: next.topics, sections: next.sections, quizzes: next.quizzes, reason: reason.get(next.slug) });
  }
  return out;
}
