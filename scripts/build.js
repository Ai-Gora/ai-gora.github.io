#!/usr/bin/env node
// Usage: node scripts/build.js [--check] [--root <dir>] [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { loadContent, buildOutputs } from './lib.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(opt('--root', path.join(path.dirname(new URL(import.meta.url).pathname), '..')));
const outDir = path.resolve(root, opt('--out', 'dist'));
const check = args.includes('--check');

const { errors, content } = loadContent(root);
if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ valid: ${content.articles.length} articles, ${content.quizzes.length} quizzes, ${content.topics.size} topics`);
if (check) process.exit(0);

const files = buildOutputs(content);
fs.rmSync(outDir, { recursive: true, force: true });
for (const [rel, data] of Object.entries(files)) {
  const p = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
console.log(`✓ built ${Object.keys(files).length} files into ${path.relative(process.cwd(), outDir) || outDir}/`);
