// STYLE.md checks: media licences (L1, L2, L5), accessibility (V2, V4), sentence length (W2, warnings only).
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export const IMAGE_EXT = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
const ALLOWED = [/^CC0(-1\.0)?$/, /^(PD|PDM|PUBLIC-DOMAIN)$/, /^NASA$/, /^CC-BY(-\d\.\d)?$/, /^CC-BY-SA(-\d\.\d)?$/];

export function checkLicense(s) {
  const errs = [];
  if (!s || typeof s !== 'object') return ['sidecar is not a YAML mapping'];
  const str = (k) => typeof s[k] === 'string' && s[k].trim() !== '';
  for (const k of ['title', 'author', 'license']) if (!str(k)) errs.push(`missing TASL field '${k}'`);
  if (!str('source_url') && !str('source')) errs.push("missing TASL field 'source_url' (or 'source')");
  if (str('license')) {
    const lic = s.license.trim().toUpperCase();
    const tokens = lic.split(/[-\s_]+/);
    if (tokens.includes('NC') || tokens.includes('ND')) errs.push(`licence ${s.license} is not allowed (NC/ND licences are blocked, STYLE L2)`);
    else if (/UNSPLASH|PEXELS|PIXABAY/.test(lic)) errs.push(`licence ${s.license} is not allowed (non-CC "free" licences are blocked, STYLE L2)`);
    else if (!ALLOWED.some((re) => re.test(lic))) errs.push(`licence ${s.license} is not on the allowed list (CC0/PD, CC BY, CC BY-SA, NASA)`);
  }
  return errs;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  }).sort();
}

/** Data urls a Vega-Lite spec loads: every `data: { url }` (top level, layers, lookups). */
export function specDataUrls(spec) {
  const urls = [];
  (function find(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'data' && v && typeof v === 'object' && typeof v.url === 'string') urls.push(v.url);
      find(v);
    }
  })(spec);
  return urls;
}

/**
 * Chart folders are credited in their README.md (STYLE V3), but only these files are exempt from sidecars:
 * chart.vl.json, chart.svg, README.md and the in-folder data files the spec references. Anything else (a photo) needs one.
 */
function chartExemptFiles(files) {
  const exempt = new Set();
  for (const spec of files.filter((f) => path.basename(f) === 'chart.vl.json')) {
    const dir = path.dirname(spec);
    for (const n of ['chart.vl.json', 'chart.svg', 'README.md']) exempt.add(path.join(dir, n));
    let urls = [];
    try { urls = specDataUrls(JSON.parse(fs.readFileSync(spec, 'utf8'))); } catch { /* invalid spec: reported by the chart build */ }
    for (const u of urls) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('/') || u.startsWith('\\')) continue;
      const p = path.resolve(dir, u);
      const r = path.relative(dir, p);
      if (r && !r.startsWith('..') && !path.isAbsolute(r)) exempt.add(p);
    }
  }
  return exempt;
}

export function checkMediaDir(root) {
  const errs = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const files = walk(path.join(root, 'media'));
  const exempt = chartExemptFiles(files);
  for (const f of files) {
    const name = path.basename(f);
    if (name.endsWith('.license.yaml') || name === '.gitkeep') continue;
    if (exempt.has(f)) continue;
    const side = `${f}.license.yaml`;
    const kind = IMAGE_EXT.includes(path.extname(f).toLowerCase()) ? 'image' : 'media file';
    if (!fs.existsSync(side)) { errs.push(`${rel(f)}: ${kind} has no licence sidecar ${path.basename(side)}`); continue; }
    let s;
    try { s = yaml.load(fs.readFileSync(side, 'utf8'), { schema: yaml.JSON_SCHEMA }); } catch (e) { errs.push(`${rel(side)}: YAML parse error: ${e.reason || e.message}`); continue; }
    for (const e of checkLicense(s)) errs.push(`${rel(side)}: ${e}`);
  }
  return errs;
}

// Split body into [{ fence: lang|null, lines: [{n, text}] }] runs.
function blocks(body) {
  const out = [];
  let cur = { fence: null, lines: [] };
  body.split(/\r?\n/).forEach((text, i) => {
    const m = /^\s*(```|~~~)\s*([\w-]*)/.exec(text);
    if (m && cur.fence === null) { out.push(cur); cur = { fence: m[2] || 'text', start: i + 1, lines: [] }; return; }
    if (m && cur.fence !== null) { out.push(cur); cur = { fence: null, lines: [] }; return; }
    cur.lines.push({ n: i + 1, text });
  });
  out.push(cur);
  return out;
}

/** `offset` = number of file lines before the body (frontmatter), so errors use file line numbers. */
export function checkAccessibility(body, offset = 0) {
  const errs = [];
  let mermaid = 0;
  for (const b of blocks(body)) {
    if (b.fence === 'mermaid') {
      mermaid++;
      const at = `line ${b.start + offset}: `;
      if (!b.lines.some((l) => /^\s*accTitle\s*:/.test(l.text))) errs.push(`${at}mermaid diagram ${mermaid} has no accTitle (STYLE V2)`);
      if (!b.lines.some((l) => /^\s*accDescr\s*(:|\{)/.test(l.text))) errs.push(`${at}mermaid diagram ${mermaid} has no accDescr (STYLE V2)`);
    } else if (b.fence === null) {
      for (const l of b.lines) for (const m of l.text.matchAll(/!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g)) {
        if (!m[1].trim()) errs.push(`line ${l.n + offset}: image ${m[2]} has no alt text (STYLE V4)`);
        else if (m[1].length > 125) errs.push(`line ${l.n + offset}: image ${m[2]} alt text is ${m[1].length} characters, max 125 (STYLE V4)`);
      }
    }
  }
  return errs;
}

const strip = (t) => t
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[\^\d+\]/g, '')
  .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\{#[a-z0-9-]+\}/g, '')
  .replace(/[*_`]/g, '');

export function sentenceWarnings(body, max = 25) {
  const paras = [];
  let cur = null;
  const flush = () => { if (cur) paras.push(cur); cur = null; };
  for (const b of blocks(body)) {
    if (b.fence !== null) { flush(); continue; }
    for (const { n, text } of b.lines) {
      let t = text.replace(/^\s*>\s?/, '');
      if (!t.trim() || /^\s*#/.test(t) || /^\s*\|/.test(t) || /^\s*(<[^>]+>\s*)+$/.test(t)) { flush(); continue; }
      const li = /^\s*([-*]|\d+\.)\s+/.exec(t);
      if (li) { flush(); t = t.slice(li[0].length); }
      if (!cur) cur = { line: n, text: '' };
      cur.text += ` ${t}`;
    }
    flush();
  }
  flush();
  const out = [];
  for (const p of paras) {
    for (const s of strip(p.text).split(/(?<=[.!?])\s+/)) {
      const words = s.trim().split(/\s+/).filter(Boolean);
      if (words.length > max) out.push({ line: p.line, words: words.length, text: s.trim() });
    }
  }
  return out;
}
