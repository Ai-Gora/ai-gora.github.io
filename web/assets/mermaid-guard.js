// Mermaid sources may not pull in anything from outside the repo (STYLE V4: media/ only).
// Shared by the style check (Node) and diagram.js (browser); no DOM access.

const RULES = [
  [/%%\{/, 'init directive %%{...}%% is not allowed'],
  [/<\/?[a-z][^>]*>|#60;|#lt;|&lt;|&#0*60;|&#x0*3c;/i, 'HTML is not allowed'],
  [/url\s*\(/i, 'url() is not allowed'],
  [/https?:\/\/|(^|[\s"'=(])\/\/\S/im, 'external URLs are not allowed'],
];

/** Reasons the Mermaid source is unsafe to render; [] when it is fine. */
export function mermaidProblems(src) {
  const text = String(src ?? '');
  const out = [];
  const first = text.split(/\r?\n/).find((l) => l.trim());
  if (first && first.trim() === '---') out.push('--- config block is not allowed');
  for (const [re, reason] of RULES) if (re.test(text)) out.push(reason);
  return out;
}

// Config keys a diagram may never override (Mermaid's defaults plus styling/sanitiser/label settings).
export const MERMAID_SECURE = ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'themeCSS', 'themeVariables', 'dompurifyConfig', 'htmlLabels', 'flowchart'];
