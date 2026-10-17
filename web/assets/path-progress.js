// Pure lesson-path progress. A step is done when its quiz was checked with at least half the answers right.
export function pathProgress(slugs, scores = {}) {
  const done = slugs.map((s) => { const p = scores[s]; return Boolean(p && p.total > 0 && p.right * 2 >= p.total); });
  const last = done.lastIndexOf(true);
  return { done, count: done.filter(Boolean).length, total: slugs.length, grown: slugs.length ? (last + 1) / slugs.length : 0, next: done.indexOf(false) };
}
