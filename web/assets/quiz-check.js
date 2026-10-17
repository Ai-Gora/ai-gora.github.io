export const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function isCorrect(q, values) {
  if (q.type === 'single') return values.length === 1 && Number(values[0]) === q.answer;
  if (q.type === 'multi') return values.map(Number).sort().join() === [...q.answer].sort().join();
  if (q.type === 'true_false') return values.length === 1 && values[0] === String(q.answer);
  const given = values[0] || '';
  if (Array.isArray(q.answer)) return given.split(/[,;]/).map(norm).join('|') === q.answer.map(norm).join('|');
  return norm(given) === norm(q.answer);
}
