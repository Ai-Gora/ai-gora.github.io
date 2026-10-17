# Contributing to Aigora

Everything happens through pull requests. Git history is the revision history; discussion of an article lives in a GitHub Issue or Discussion titled with its slug.

## Add an article

1. Create `articles/<category>/<slug>.md`. File name = `slug`.
2. Pick the next free `id` (`aig-NNNNNN`). Never change an `id`, even on rename.
3. Fill the frontmatter (see `schema/article.schema.json`). Every `topics` entry needs a `topics/<topic>.yaml`.
4. Body order: short answer, `##` sections each with a stable `{#anchor}`, `## Key claims {#key-claims}`, `## Sources {#sources}`.
5. Writing rules: one claim per sentence, values with units, observation separate from interpretation.
6. Cite with `[^n]` where `n` is a `sources[].id`. Every source must be cited; Key claims must cite.
7. Link with `[[slug]]`, `[[slug#anchor]]` or `[[slug#anchor|text]]`. Links are checked at build time.
8. Adapted Wikipedia text: add `derived_from: [{url, revision}]`, keep CC BY-SA attribution. Do not copy Wikimedia branding.
9. Set `ai_assisted: true` if any AI drafted text. AI output is a draft until a human reviews it (`status: reviewed`).

## Add a quiz

`quizzes/<slug>.yaml`, `article: <id>`, each question `ref: slug#anchor` pointing at an existing anchor. See `schema/quiz.schema.json`.

## Media

Put files under `media/<slug>/` and add `<file>.license.yaml` with `file, license, author, source`.

## Before opening a PR

```sh
npm ci && npm run lint && npm run validate && npm test && npm run build
```

CI runs the same on every PR. Keep dependencies few and boring.
