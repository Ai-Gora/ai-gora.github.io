// Quiz checking from data/quizzes/<slug>.json. Without JS each question has a "Show answer" disclosure.
import { questionState } from './quiz-check.js';

const form = document.getElementById('quiz');

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
      const st = questionState(q, values);
      if (st.ok) right++;
      const fb = fs.querySelector('[data-feedback]');
      fb.hidden = false;
      fb.className = `feedback ${st.cls}`;
      fb.textContent = st.text;
      fs.querySelector('details').open = st.open;
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
