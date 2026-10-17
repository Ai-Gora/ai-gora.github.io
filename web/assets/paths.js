// Lesson-path enhancements: quiz progress from localStorage, and combining several interests.
import { lessonPath } from './lesson-path.js';

for (const el of document.querySelectorAll('[data-progress]')) {
  try {
    const p = JSON.parse(localStorage.getItem(`aigora:quiz:${el.dataset.progress}`) || 'null');
    if (p) el.textContent = `· your score ${p.right}/${p.total}`;
  } catch { /* storage unavailable */ }
}

const form = document.getElementById('path-builder');
const target = document.getElementById('custom-path');
if (form && target) {
  form.hidden = false;
  const langSelect = document.getElementById('path-lang');
  const langNames = {};
  if (langSelect) for (const o of langSelect.options) if (o.value) langNames[o.value] = o.textContent;
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const interests = [...form.querySelectorAll('input[name="interest"]:checked')].map((i) => i.value);
    const lang = langSelect ? langSelect.value : '';
    target.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = 'Your path';
    h.tabIndex = -1;
    target.append(h);
    if (!interests.length) { const p = document.createElement('p'); p.textContent = 'Choose at least one interest.'; target.append(p); h.focus(); return; }
    let graph, topics;
    try { [graph, topics] = await Promise.all([json('../data/graph.json'), json('../data/topics.json')]); } catch { const p = document.createElement('p'); p.textContent = 'Could not load the graph. Use the single-interest paths above.'; target.append(p); return; }
    const steps = lessonPath(graph, topics, interests, lang ? { lang } : {});
    const ol = document.createElement('ol');
    ol.className = 'path';
    for (const s of steps) {
      const li = document.createElement('li');
      li.className = 'step';
      const a = document.createElement('a');
      a.href = `../a/${s.slug}.html`;
      a.textContent = s.title;
      if (s.lang) a.lang = s.lang;
      const meta = document.createElement('span');
      meta.className = 'muted';
      meta.textContent = ` · ${s.level}${s.lang ? ` · ${langNames[s.lang] || s.lang}` : ''}${s.reason === 'prerequisite' ? ' · prerequisite' : ''}`;
      li.append(a, meta);
      if (s.quizzes.length) {
        const q = document.createElement('a');
        q.href = `../quiz/${s.slug}.html`;
        q.textContent = 'Quiz';
        li.append(' · ', q);
      }
      ol.append(li);
    }
    target.append(steps.length ? ol : Object.assign(document.createElement('p'), { textContent: 'No articles for these interests yet.' }));
    h.focus();
  });
}
