// Renders Mermaid diagrams with the self-hosted build (assets/vendor/mermaid.min.js). Loaded only on pages with a diagram.
// Without JS (or if rendering fails) the page keeps the source block and the accTitle/accDescr caption.
import { mermaidProblems, MERMAID_SECURE } from './mermaid-guard.js';

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
        pre.before(div);
        pre.hidden = true;
      } catch (e) { console.warn('diagram not rendered', e); }
    }
  } catch (e) { console.warn(e.message); }
}
