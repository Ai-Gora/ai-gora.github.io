// Quiz checking from data/quizzes/<slug>.json. Without JS each question has a "Show answer" disclosure.
import { questionState } from './quiz-check.js';
import { t } from './i18n.js';

const form = document.getElementById('quiz');

if (form) {
  for (const el of form.querySelectorAll('[data-js]')) el.hidden = false;
  const status = document.getElementById('quiz-status');
  const lang = form.dataset.lang || document.documentElement.lang || 'en';
  let quiz;
  const load = async () => (quiz ||= await fetch(form.dataset.src).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    let data;
    try { data = await load(); } catch { status.textContent = t(lang, 'loadAnswersFailed'); return; }
    let right = 0;
    for (const q of data.questions) {
      const fs = form.querySelector(`[data-qid="${q.id}"]`);
      if (!fs) continue;
      const values = [...fs.querySelectorAll('input')].filter((i) => (i.type === 'radio' || i.type === 'checkbox' ? i.checked : i.value.trim())).map((i) => i.value);
      const st = questionState(q, values, lang);
      if (st.ok) right++;
      const fb = fs.querySelector('[data-feedback]');
      fb.hidden = false;
      fs.dataset.state = st.cls;
      fb.className = 'feedback';
      void fb.offsetWidth; // restart the CSS "settle" animation on every check
      fb.className = `feedback ${st.cls}`;
      fb.textContent = st.text;
      fs.querySelector('details').open = st.open;
    }
    status.textContent = t(lang, 'score', { right, total: data.questions.length });
    try { localStorage.setItem(`aigora:quiz:${form.dataset.slug}`, JSON.stringify({ right, total: data.questions.length, at: new Date().toISOString() })); } catch { /* storage unavailable */ }
  });

  form.addEventListener('reset', () => {
    for (const fb of form.querySelectorAll('[data-feedback]')) fb.hidden = true;
    for (const d of form.querySelectorAll('details')) d.open = false;
    for (const fs of form.querySelectorAll('[data-qid]')) delete fs.dataset.state;
    status.textContent = '';
  });
}
