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
  [/(^|[;}])[^\S\n]*(?:click|call|href|callback|links?)\b/im, 'click/href statements are not allowed (diagrams are not interactive)'],
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
  [/\bdata:\s*[a-z]+\/[a-z0-9.+-]+[;,]/, 'data:/javascript: URLs are not allowed'], // "data: image/png;base64,…"
];

// Shape data (A@{ ... }) is YAML, where anchors/aliases (&k, *k), complex keys (? k), tags (!t) and literal
// blocks can rebuild a key or a URL the line-based rules never see. So each @{ block runs stricter checks,
// on its raw text and on a copy with all whitespace removed (a URL split over lines joins up there).
// Like Mermaid's lexer, a block ends at the first "}" outside double quotes (single quotes are not special there);
// an unclosed block runs to the end of the source. As a backstop, the word img anywhere after the first @{ is rejected.
const SHAPE_RAW = [
  [/\bimg\b/i, 'img: shapes are not allowed'],
  [/(^|[\s:,[{-])[&*][^\s,\]}]/, 'YAML anchors, aliases, tags and complex keys are not allowed in shape data'],
  [/(^|[\s:,[{-])![^\s=]/, 'YAML anchors, aliases, tags and complex keys are not allowed in shape data'],
  [/(^|[\n,{])[^\S\n]*\?(\s|$)/, 'YAML anchors, aliases, tags and complex keys are not allowed in shape data'],
];
const SHAPE_SQUASHED = [
  [/\/\/|https?:\/|(?:^|[^a-z0-9])(?:javascript|vbscript|blob|file):/, 'external URLs are not allowed'],
  [/data:[a-z]+\//, 'data:/javascript: URLs are not allowed'],
];
export function shapeBlocks(text) {
  const out = [];
  const re = /@\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    let q = '';
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === q) q = ''; } else if (c === '"') q = c; else if (c === '}') break;
    }
    out.push(text.slice(m.index + m[0].length, i));
    re.lastIndex = Math.max(re.lastIndex, i);
  }
  return out;
}

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
  if (/@\s*\{[\s\S]*\bimg\b/i.test(text) && !out.includes('img: shapes are not allowed')) out.push('img: shapes are not allowed');
  for (const block of shapeBlocks(text)) {
    for (const [re, reason] of SHAPE_RAW) if (re.test(block) && !out.includes(reason)) out.push(reason);
    for (const [re, reason] of SHAPE_SQUASHED) if (re.test(squash(block)) && !out.includes(reason)) out.push(reason);
  }
  return out;
}

// Config keys a diagram may never override (Mermaid's defaults plus styling/sanitiser/label settings).
export const MERMAID_SECURE = ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'themeCSS', 'themeVariables', 'dompurifyConfig', 'htmlLabels', 'flowchart'];
