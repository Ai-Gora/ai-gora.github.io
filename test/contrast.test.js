// WCAG 2.x contrast over the design tokens in web/assets/style.css, light and dark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'assets', 'style.css'), 'utf8');

function tokensOf(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const light = tokensOf(CSS.match(/:root\s*\{([^}]*)\}/)[1]);
const dark = tokensOf(CSS.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]);

// [foreground, background, minimum]. Text 4.5:1; component edges and states 3:1 (SC 1.4.3, 1.4.11).
const PAIRS = [
  ['text', 'surface', 4.5], ['text', 'surface-raised', 4.5], ['text', 'surface-sunk', 4.5], ['text', 'mark', 4.5], ['text', 'notice', 4.5],
  ['text-muted', 'surface', 4.5], ['text-muted', 'surface-sunk', 4.5],
  ['link', 'surface', 4.5], ['link', 'surface-sunk', 4.5], ['link-visited', 'surface', 4.5],
  ['on-action', 'action', 4.5], ['surface', 'link', 4.5],
  ['success', 'surface', 4.5], ['error', 'surface', 4.5], ['surface', 'success', 4.5],
  ['action', 'surface', 3], ['focus', 'surface', 3], ['border', 'surface', 3], ['border', 'surface-raised', 3],
  // Merged from main/#12: diagram captions and scroll regions, Mermaid source blocks, table borders.
  ['text-muted', 'surface-raised', 4.5], ['focus', 'surface-sunk', 3], ['border', 'surface-sunk', 3], ['link', 'surface-raised', 4.5],
];

test('contrast test reads both token blocks', () => {
  for (const t of [light, dark]) for (const [f, b] of PAIRS) { assert.ok(t[f], `missing --${f}`); assert.ok(t[b], `missing --${b}`); }
});

test('ratio matches known WCAG values', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(ratio('#ffffff', '#C2410C').toFixed(2), '5.18');
});

for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`token contrast meets WCAG AA (${name})`, () => {
    for (const [f, b, min] of PAIRS) {
      const r = ratio(t[f], t[b]);
      assert.ok(r >= min, `${name}: --${f} on --${b} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}
