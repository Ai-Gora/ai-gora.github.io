import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkGlossaryPairs, strictGlossary } from '../scripts/glossary.js';

function tmp(en, sl) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gloss-'));
  fs.mkdirSync(path.join(d, 'glossary'));
  if (en !== undefined) fs.writeFileSync(path.join(d, 'glossary/terms.en.yaml'), en);
  if (sl !== undefined) fs.writeFileSync(path.join(d, 'glossary/terms.sl.yaml'), sl);
  return d;
}
const EN = '- term: municipality\n  lang_pairs: {sl: občina}\n';
const SL = '- term: občina\n  lang_pairs: {en: municipality}\n';

test('glossary: pairs that resolve both ways pass', () => {
  assert.deepEqual(checkGlossaryPairs(tmp(EN, SL)), []);
});

test('glossary: a pair naming a missing term is reported', () => {
  const p = checkGlossaryPairs(tmp(EN + '- term: NUTS\n  lang_pairs: {sl: NUTS (x)}\n', SL));
  assert.equal(p.length, 1);
  assert.match(p[0], /terms\.en\.yaml: 'NUTS' -> sl 'NUTS \(x\)', but .*terms\.sl\.yaml has no such term/);
});

test('glossary: a pair that does not point back is reported, in both directions', () => {
  const p = checkGlossaryPairs(tmp(EN + '- term: commune\n  lang_pairs: {sl: občina}\n', SL));
  assert.equal(p.length, 1);
  assert.match(p[0], /'commune' -> sl 'občina', but that entry points back to 'municipality'/);
  const q = checkGlossaryPairs(tmp(EN, SL + '- term: preprosti jezik\n  lang_pairs: {en: plain language}\n'));
  assert.match(q.join('\n'), /terms\.sl\.yaml: 'preprosti jezik' -> en 'plain language'/);
});

test('glossary: an entry without lang_pairs is reported; missing files are skipped', () => {
  assert.match(checkGlossaryPairs(tmp(EN + '- term: x\n', SL)).join(), /'x' has no lang_pairs\.sl/);
  assert.deepEqual(checkGlossaryPairs(tmp(EN)), []);
});

test('glossary: strict mode comes from --strict-glossary or AIGORA_STRICT_GLOSSARY=1', () => {
  assert.equal(strictGlossary([], {}), false);
  assert.equal(strictGlossary(['--strict-glossary'], {}), true);
  assert.equal(strictGlossary([], { AIGORA_STRICT_GLOSSARY: '1' }), true);
});

test('glossary: build --check warns by default and fails with --strict-glossary', () => {
  const root = tmp(EN + '- term: NUTS\n  lang_pairs: {sl: NUTS (x)}\n', SL);
  const build = path.resolve('scripts/build.js');
  const warn = spawnSync(process.execPath, [build, '--check', '--root', root], { encoding: 'utf8' });
  assert.equal(warn.status, 0, warn.stderr);
  assert.match(warn.stderr, /'NUTS'.*STYLE W8/);
  const strict = spawnSync(process.execPath, [build, '--check', '--root', root, '--strict-glossary'], { encoding: 'utf8' });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /validation error.*\n.*'NUTS'/);
});
