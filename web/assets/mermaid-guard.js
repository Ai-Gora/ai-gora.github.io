// Mermaid sources stay self-contained (STYLE V8): no config, HTML, images, links or URLs.
// Shared by the style check (Node) and diagram.js (browser); no DOM access.
// Browsers read "\" as "/" and drop tabs/newlines inside URLs, so URL checks run on a copy with those
// (and other control/zero-width characters) removed, lowercased; spaces stay, because a URL can't contain one.
// Ordinary labels ("Data: 3", "Call centre", "A // B") pass; the page's Content-Security-Policy is the backstop.

// A URL payload starts right after the scheme or "//": not a space and not the end of a label.
const PAYLOAD = String.raw`(?=[^\s"'\])|}\]])`;
const RAW = [
  [/\\/, 'backslashes are not allowed'],
  [/<\/?[a-z!?][^>]*>/i, 'HTML is not allowed'],
  [/["']?\bimg["']?\s*:/i, 'img: shapes are not allowed'],
  [/(^|[;}])[^\S\n]*(?:click|call|href)\b/im, 'click/href statements are not allowed (diagrams are not interactive)'],
];
const SQUASHED = [ // all whitespace removed
  [/%%\{/, 'init directive %%{...}%% is not allowed'],
  [/#lt;|&lt;|#60;|&#0*60;|&#x0*3c;/, 'HTML is not allowed'],
  [/&#|#\d+;|#x[0-9a-f]+;/, 'numeric character codes (#nn; / &#nn;) are not allowed'],
  [/url\(/, 'url() is not allowed'],
];
const URLISH = [ // tabs, newlines and control characters removed, spaces kept
  [new RegExp(`https?:${PAYLOAD}|(?:^|[^a-z0-9._~-])//(?=[^\\s/"'\\])|}\\]])|(?:^|[^a-z0-9._~-])///`), 'external URLs are not allowed'],
  [new RegExp(`\\b(?:data|javascript|vbscript|blob|file):${PAYLOAD}`), 'data:/javascript: URLs are not allowed'],
];

/* eslint-disable no-control-regex */
const HIDDEN = /[\t\n\r\v\f\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]+/g;
/* eslint-enable no-control-regex */
const urlish = (s) => s.replace(HIDDEN, '').toLowerCase();
const squash = (s) => urlish(s).replace(/\s+/g, '');

/** Reasons the Mermaid source is unsafe to render; [] when it is fine. */
export function mermaidProblems(src) {
  const text = String(src ?? '');
  const flat = squash(text);
  const near = urlish(text);
  const out = [];
  const first = text.replace(/^\ufeff/, '').split(/\r?\n/).find((l) => l.trim());
  if (first && /^\s*-{3,}\s*$/.test(first)) out.push('--- config block is not allowed');
  for (const [re, reason] of RAW) if (re.test(text) && !out.includes(reason)) out.push(reason);
  for (const [re, reason] of SQUASHED) if (re.test(flat) && !out.includes(reason)) out.push(reason);
  for (const [re, reason] of URLISH) if (re.test(near) && !out.includes(reason)) out.push(reason);
  return out;
}

// Config keys a diagram may never override (Mermaid's defaults plus styling/sanitiser/label settings).
export const MERMAID_SECURE = ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'themeCSS', 'themeVariables', 'dompurifyConfig', 'htmlLabels', 'flowchart'];
