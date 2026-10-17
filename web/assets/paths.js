// Lesson-path enhancements: quiz progress from localStorage, and combining several interests.
import { lessonPath } from './lesson-path.js';
import { pathProgress } from './path-progress.js';

const score = (slug) => { try { return JSON.parse(localStorage.getItem(`aigora:quiz:${slug}`) || 'null'); } catch { return null; } };

for (const el of document.querySelectorAll('[data-progress]')) {
  try {
    const p = JSON.parse(localStorage.getItem(`aigora:quiz:${el.dataset.progress}`) || 'null');
    if (p) el.textContent = `· your score ${p.right}/${p.total}`;
  } catch { /* storage unavailable */ }
}

// Growing stem: fill the path line up to the last finished step, mark steps done, offer "Continue".
for (const ol of document.querySelectorAll('ol.path')) {
  const out = ol.previousElementSibling;
  if (!out || !out.matches('[data-path-progress]')) continue;
  const steps = [...ol.querySelectorAll(':scope > li.step')];
  const slugs = steps.map((li) => li.dataset.slug);
  const p = pathProgress(slugs, Object.fromEntries(slugs.map((s) => [s, score(s)])));
  steps.forEach((li, i) => {
    if (!p.done[i] || li.classList.contains('done')) return;
    li.classList.add('done');
    const h = li.querySelector('h3');
    if (h) h.append(Object.assign(document.createElement('span'), { className: 'visually-hidden', textContent: ' (done)' }));
  });
  requestAnimationFrame(() => ol.style.setProperty('--grown', String(p.grown)));
  if (!p.count) continue;
  out.textContent = `${p.count} of ${p.total} steps done`;
  const link = p.next === -1 ? null : steps[p.next].querySelector('h3 a');
  if (link) out.append(' ', Object.assign(document.createElement('a'), { className: 'button action', href: link.getAttribute('href'), textContent: `Continue: ${link.textContent}` }));
  out.hidden = false;
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
