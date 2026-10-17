// Mermaid sources stay self-contained (STYLE V8): no config, HTML, images, links or URLs.
// Shared by the style check (Node) and diagram.js (browser); no DOM access.
// Browsers read "\" as "/" and drop tabs/newlines inside URLs, so the URL checks run on a
// "squashed" copy: whitespace, control and zero-width characters removed, lowercased.

const RAW = [
  [/\\/, 'backslashes are not allowed'],
  [/<\/?[a-z!?][^>]*>/i, 'HTML is not allowed'],
  [/\bimg\s*:/i, 'img: shapes are not allowed'],
  [/\b(?:click|href|call)\b/i, 'click/href statements are not allowed (diagrams are not interactive)'],
];
const SQUASHED = [
  [/%%\{/, 'init directive %%{...}%% is not allowed'],
  [/#lt;|&lt;|#60;|&#0*60;|&#x0*3c;/, 'HTML is not allowed'],
  [/&#|#\d+;|#x[0-9a-f]+;/, 'numeric character codes (#nn; / &#nn;) are not allowed'],
  [/url\(/, 'url() is not allowed'],
  [/https?:|\/\//, 'external URLs are not allowed'],
  [/(?:data|javascript|vbscript|blob|file):/, 'data:/javascript: URLs are not allowed'],
];

// eslint-disable-next-line no-control-regex
const squash = (s) => s.replace(/[\s\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]+/g, '').toLowerCase();

/** Reasons the Mermaid source is unsafe to render; [] when it is fine. */
export function mermaidProblems(src) {
  const text = String(src ?? '');
  const flat = squash(text);
  const out = [];
  const first = text.replace(/^\ufeff/, '').split(/\r?\n/).find((l) => l.trim());
  if (first && /^\s*-{3,}\s*$/.test(first)) out.push('--- config block is not allowed');
  for (const [re, reason] of RAW) if (re.test(text) && !out.includes(reason)) out.push(reason);
  for (const [re, reason] of SQUASHED) if (re.test(flat) && !out.includes(reason)) out.push(reason);
  return out;
}

// Config keys a diagram may never override (Mermaid's defaults plus styling/sanitiser/label settings).
export const MERMAID_SECURE = ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'themeCSS', 'themeVariables', 'dompurifyConfig', 'htmlLabels', 'flowchart'];
