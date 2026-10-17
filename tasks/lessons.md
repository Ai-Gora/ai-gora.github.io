# Lessons

One line per mistake hit while building Aigora, so it is not repeated.

- js-yaml's default schema turns `2026-10-17` into a Date object, which fails JSON Schema `format: date`; load YAML with `JSON_SCHEMA` so dates stay strings.
- `node --test test/` (directory arg) fails on Node 22; use plain `node --test`, which finds `test/*.test.js`.
- `rmSync(out, {recursive, force})` on an unchecked `--out` can wipe the repo (`--out .`); always resolve and require the target strictly inside the repo root first.
- Every page has a header search form, so `button[type=submit]` matches the header button first; scope selectors and tests to the form (`#quiz button[type=submit]`).
- Validating names alone does not stop overwrites: a topic id `index` replaced `paths/index.html` inside the site builder, so output maps must refuse a path that is written twice (`mergeOutputs` and the guard in `buildSite`).
- Site/validator tests pin the sample articles (headings, source order, lesson-path lists, node counts); rewriting a sample article or adding one in the same topic means updating those assertions in the same PR.
- Applying bold/italics per text segment between tags (my #2 review fix) left literal `*` when emphasis wraps a link; swap tags for placeholders, apply emphasis across the whole string, then restore them.
- A score comment claimed metadata (weight 0.5) "ranks below any content hit", but exact matches score weight × 2, so 0.5 × 2 tied a text prefix hit (1); check the arithmetic against the max of each field, and put metadata on one entry per article, not every section.
- Vega swallows data-loader errors (renders an empty chart), so a custom loader's throw never surfaces; validate every spec `url` before rendering.
- OpenCode can exit or time out without writing files (glm and deepseek, twice each on the style task); check `git status` right after each run, not the agent's summary.
