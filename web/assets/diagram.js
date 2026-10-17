// Renders Mermaid diagrams with the self-hosted build (assets/vendor/mermaid.min.js). Loaded only on pages with a diagram.
// Without JS (or if rendering fails) the page keeps the source block and the accTitle/accDescr caption.
import { mermaidProblems, MERMAID_SECURE } from './mermaid-guard.js';
import { t } from './i18n.js';

// Mermaid's labels are 16px; never scale a diagram below 0.75 of its natural width, so labels stay >= 12px.
// Wider diagrams scroll inside a focusable region instead of shrinking (small screens).
const MIN_SCALE = 0.75;

const blocks = [...document.querySelectorAll('pre[data-mermaid]')];

const loadMermaid = () => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = new URL('vendor/mermaid.min.js', import.meta.url).href;
  s.onload = () => (window.mermaid ? resolve(window.mermaid) : reject(new Error('mermaid missing')));
  s.onerror = () => reject(new Error('mermaid failed to load'));
  document.head.append(s);
});

if (blocks.length) {
  try {
    const mermaid = await loadMermaid();
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', secure: MERMAID_SECURE, theme: dark ? 'dark' : 'default' });
    let n = 0;
    for (const pre of blocks) {
      const problems = mermaidProblems(pre.textContent);
      if (problems.length) { console.warn('diagram not rendered:', problems.join('; ')); continue; } // the build rejects these too; keep the source visible
      try {
        // accTitle/accDescr in the source become the SVG <title>/<desc> (aria-labelledby/-describedby).
        const { svg } = await mermaid.render(`aigora-diagram-${++n}`, pre.textContent);
        const div = document.createElement('div');
        div.className = 'diagram-render';
        div.innerHTML = svg; // produced by Mermaid with securityLevel 'strict' (sanitised labels, no scripts)
        const el = div.querySelector('svg');
        const width = el?.viewBox?.baseVal?.width;
        if (width) el.style.minWidth = `${Math.ceil(width * MIN_SCALE)}px`;
        div.tabIndex = 0; // keyboard users can scroll a wide diagram
        div.setAttribute('role', 'region');
        div.setAttribute('aria-label', el?.querySelector('title')?.textContent.trim() || t(document.documentElement.lang, 'diagram'));
        pre.before(div);
        pre.hidden = true;
      } catch (e) { console.warn('diagram not rendered', e); }
    }
  } catch (e) { console.warn(e.message); }
}
