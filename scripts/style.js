// STYLE.md checks: media licences (L1, L2, L5), accessibility (V2, V4, V8), sentence length (W2, warnings only).
import fs from 'node:fs';
import { mermaidProblems } from '../web/assets/mermaid-guard.js';
import path from 'node:path';
import yaml from 'js-yaml';

/** The only file types published from media/ (STYLE V7). SVG is never published: convert it to a raster. */
export const IMAGE_EXT = ['.webp', '.png', '.jpg', '.jpeg', '.gif'];
const MAGIC = {
  '.png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.webp': (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  '.gif': (b) => b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)),
};
MAGIC['.jpeg'] = MAGIC['.jpg'];

/** Problem string if a published media file's type is not allowed or its magic bytes do not match its extension, else null. */
export function mediaTypeProblem(f, buf = null) {
  const ext = path.extname(f).toLowerCase();
  if (!IMAGE_EXT.includes(ext)) return `file type ${ext || '(none)'} is not published (allowed: ${IMAGE_EXT.join(', ')}; SVG must be converted to a raster, STYLE V7)`;
  const b = buf || fs.readFileSync(f);
  if (!MAGIC[ext](b)) return `content does not match its ${ext} extension (magic bytes)`;
  return null;
}
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

/**
 * A media entry must be a regular file (not a symlink) whose real path stays inside media/.
 * Returns a problem string or null. Used by checkMediaDir and by the build copy step.
 */
export function mediaPathProblem(root, f) {
  const media = path.join(root, 'media');
  let st;
  try { st = fs.lstatSync(f); } catch (e) { return `cannot be read (${e.code || e.message})`; }
  if (st.isSymbolicLink()) return 'is a symlink (media files must be regular files)';
  if (!st.isFile()) return 'is not a regular file';
  try {
    if (fs.lstatSync(media).isSymbolicLink()) return 'is inside a symlinked media/ folder';
    const r = path.relative(fs.realpathSync(media), fs.realpathSync(f));
    if (!r || r.startsWith('..') || path.isAbsolute(r)) return 'resolves outside media/';
  } catch (e) { return `cannot be resolved (${e.code || e.message})`; }
  return null;
}

export function checkMediaDir(root) {
  const errs = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const files = walk(path.join(root, 'media'));
  const unsafe = new Set();
  for (const f of files) {
    const problem = mediaPathProblem(root, f);
    if (problem) { errs.push(`${rel(f)}: ${problem}`); unsafe.add(f); }
  }
  for (const f of files) {
    if (unsafe.has(f)) continue;
    const name = path.basename(f);
    if (name === '.gitkeep') continue;
    if (name.endsWith('.license.yaml')) {
      if (!files.includes(f.slice(0, -'.license.yaml'.length))) errs.push(`${rel(f)}: sidecar for a file that does not exist`);
      continue;
    }
    const typeProblem = mediaTypeProblem(f);
    if (typeProblem) { errs.push(`${rel(f)}: ${typeProblem}`); continue; }
    const side = `${f}.license.yaml`;
    if (unsafe.has(side)) continue;
    if (!fs.existsSync(side)) { errs.push(`${rel(f)}: image has no licence sidecar ${path.basename(side)}`); continue; }
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
      for (const reason of mermaidProblems(b.lines.map((l) => l.text).join('\n'))) errs.push(`${at}mermaid diagram ${mermaid}: ${reason} (STYLE V8)`);
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
