// Quiz checking from data/quizzes/<slug>.json. Without JS each question has a "Show answer" disclosure.
const form = document.getElementById('quiz');

const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function isCorrect(q, values) {
  if (q.type === 'single') return values.length === 1 && Number(values[0]) === q.answer;
  if (q.type === 'multi') return values.map(Number).sort().join() === [...q.answer].sort().join();
  if (q.type === 'true_false') return values.length === 1 && values[0] === String(q.answer);
  const given = values[0] || '';
  if (Array.isArray(q.answer)) return given.split(/[,;]/).map(norm).join('|') === q.answer.map(norm).join('|');
  return norm(given) === norm(q.answer);
}

if (form) {
  for (const el of form.querySelectorAll('[data-js]')) el.hidden = false;
  const status = document.getElementById('quiz-status');
  let quiz;
  const load = async () => (quiz ||= await fetch(form.dataset.src).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    let data;
    try { data = await load(); } catch { status.textContent = 'Could not load the answers. Use “Show answer” instead.'; return; }
    let right = 0;
    for (const q of data.questions) {
      const fs = form.querySelector(`[data-qid="${q.id}"]`);
      if (!fs) continue;
      const values = [...fs.querySelectorAll('input')].filter((i) => (i.type === 'radio' || i.type === 'checkbox' ? i.checked : i.value.trim())).map((i) => i.value);
      const ok = isCorrect(q, values);
      if (ok) right++;
      const fb = fs.querySelector('[data-feedback]');
      fb.hidden = false;
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.textContent = ok ? '✓ Correct.' : values.length ? '✗ Not quite. See the answer below.' : '✗ Not answered. See the answer below.';
      if (!ok) fs.querySelector('details').open = true;
    }
    status.textContent = `You got ${right} of ${data.questions.length} right.`;
    try { localStorage.setItem(`aigora:quiz:${form.dataset.slug}`, JSON.stringify({ right, total: data.questions.length, at: new Date().toISOString() })); } catch { /* storage unavailable */ }
  });

  form.addEventListener('reset', () => {
    for (const fb of form.querySelectorAll('[data-feedback]')) fb.hidden = true;
    for (const d of form.querySelectorAll('details')) d.open = false;
    status.textContent = '';
  });
}
