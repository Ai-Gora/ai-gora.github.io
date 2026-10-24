// STYLE W8: every EN<->SL glossary pair must resolve in both directions. An EN term's lang_pairs.sl must name an
// SL entry whose lang_pairs.en points back to that EN term, and the reverse. Problems are WARNINGS for now (a few
// entries are being fixed); run the build with --strict-glossary, or set AIGORA_STRICT_GLOSSARY=1, to make them errors.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const LANGS = ['en', 'sl'];

function load(root, lang, problems) {
  const rel = `glossary/terms.${lang}.yaml`;
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) return null;
  let list;
  try { list = yaml.load(fs.readFileSync(f, 'utf8'), { schema: yaml.JSON_SCHEMA }); } catch (e) { problems.push(`${rel}: YAML parse error: ${e.reason || e.message}`); return null; }
  if (!Array.isArray(list)) { problems.push(`${rel}: not a list of terms`); return null; }
  return { rel, list: list.filter((t) => t && typeof t.term === 'string') };
}

/** Returns problem strings (empty when every pair resolves both ways). */
export function checkGlossaryPairs(root) {
  const problems = [];
  const g = Object.fromEntries(LANGS.map((l) => [l, load(root, l, problems)]));
  if (!g.en || !g.sl) return problems;
  const index = Object.fromEntries(LANGS.map((l) => [l, new Map(g[l].list.map((t) => [t.term, t]))]));
  for (const [from, to] of [['en', 'sl'], ['sl', 'en']]) {
    for (const t of g[from].list) {
      const target = t.lang_pairs && t.lang_pairs[to];
      if (typeof target !== 'string' || !target.trim()) { problems.push(`${g[from].rel}: '${t.term}' has no lang_pairs.${to}`); continue; }
      const other = index[to].get(target);
      if (!other) { problems.push(`${g[from].rel}: '${t.term}' -> ${to} '${target}', but ${g[to].rel} has no such term`); continue; }
      const back = other.lang_pairs && other.lang_pairs[from];
      if (back !== t.term) problems.push(`${g[from].rel}: '${t.term}' -> ${to} '${target}', but that entry points back to ${back ? `'${back}'` : 'nothing'}`);
    }
  }
  return problems;
}

export const strictGlossary = (args = process.argv.slice(2), env = process.env) => args.includes('--strict-glossary') || env.AIGORA_STRICT_GLOSSARY === '1';
