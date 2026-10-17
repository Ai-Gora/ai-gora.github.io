# Aigora

A free, open-source, permanent library that humans and machines can both read.
No chat, no LLM, no server, zero budget: articles are Markdown files in Git, and a
small Node build turns them into static data (graph, search index, quizzes,
`llms.txt`, JSON-LD) that any static host can serve.

## Quick start

```sh
nvm use          # Node 22 LTS (.nvmrc)
npm ci
npm run validate # schema, wikilink, citation, quiz-anchor and media-licence checks
npm test         # validator tests (incl. failing cases)
npm run lint     # eslint
npm run build    # writes dist/
```

## Repo layout

```
articles/<category>/<slug>.md   one article per file, canonical source
quizzes/<slug>.yaml             questions tied to article anchors
topics/<topic>.yaml             categories: description, parent, related
media/<slug>/...                images, each with a <file>.license.yaml sidecar
schema/                         JSON Schemas: article frontmatter, quiz, topic, media licence
scripts/                        build.js (CLI) + lib.js (validation and data) + site.js (HTML)
web/assets/                     CSS and progressive-enhancement JS copied to dist/assets/
test/                           node:test suite
dist/                           generated output (gitignored)
tasks/lessons.md                mistakes hit, one per line
LICENSE (code, MIT)  LICENSE-CONTENT (CC BY-SA 4.0)  CONTRIBUTING.md
```

## Article format

Markdown with YAML frontmatter validated by [`schema/article.schema.json`](schema/article.schema.json).
See [`articles/linguistics/bela-krajina-dialects.md`](articles/linguistics/bela-krajina-dialects.md) for a full example and
[CONTRIBUTING.md](CONTRIBUTING.md) for the rules (stable `id`, `{#anchor}` on every `##` section,
`[[slug]]` / `[[slug#anchor|text]]` wikilinks, `[^n]` citations matching `sources[].id`,
a cited `## Key claims {#key-claims}` section).

## dist/ data contract

This is the interface the UI (and any machine reader) builds on. All JSON is UTF-8, pretty-printed, sorted by slug.
Paths are relative to the site root.

| File | Shape |
|---|---|
| `data/manifest.json` | `{ name, version: 1, articles, quizzes, topics, files: string[] }` |
| `data/articles.json` | `[{ id, slug, title, summary, category, topics[], level, lang, status, confidence, updated, review_after, md, json }]` |
| `data/topics.json` | `[{ id, title, description, parent: string\|null, related[], articles: slug[] }]` |
| `data/backlinks.json` | `{ [slug]: [{ slug, id, title }] }` ("What links here"; every article has a key) |
| `data/graph.json` | `{ nodes: [{ id, slug, title, topics[], level, lang, translations: { [lang]: slug }, links: slug[], prerequisites: slug[], quizzes: "slug/qN"[], sections: anchor[] }], edges: [{ from, to, anchor\|null, type: "link"\|"prerequisite" }] }` |
| `data/search-index.json` | `[{ id: "slug#anchor", article, slug, anchor\|null, title, heading\|null, topics[], authors[], ai_assisted, level, lang, updated, license, text }]`, one chunk per section, plain text. Load into a client-side engine (Lunr, MiniSearch, Pagefind) in the browser. |
| `data/quizzes/index.json` | `[{ slug, article, questions: number, file }]` |
| `data/quizzes/<slug>.json` | `{ article, slug, questions: [{ id, type, prompt, options?, answer, explain?, ref: "slug#anchor", difficulty?, tags? }] }` |
| `a/<slug>.md` | raw article source (frontmatter + body) |
| `a/<slug>.json` | `{ frontmatter, category, sections: [{ anchor, heading, level }], links: [{ slug, anchor, text }], backlinks, quiz: path\|null, jsonld }` |
| `a/<slug>.jsonld` | schema.org `Article` + `LearningResource` with `license`, `dateModified`, `citation`, `about` (`<` escaped as `\u003c`, safe to embed in `<script type="application/ld+json">`) |
| `llms.txt` | [llmstxt.org](https://llmstxt.org/) index: H1, blockquote, one H2 per primary topic, `## Optional` |
| `llms-full.txt` | all articles concatenated, each prefixed `<!-- id slug -->` |

Quiz answers: `single` → option index; `multi` → index list; `true_false` → boolean; `order`/`fill` → free-form, checked by the UI.

## Site UI (HTML)

`npm run build` also writes a static, mobile-first site on top of the data above (`scripts/site.js`, assets in `web/assets/`, no framework, no runtime deps):

| Page | What it is | Without JS |
|---|---|---|
| `index.html` | home: lesson-path interests and all articles | fully works |
| `a/<slug>.html` | article: summary, metadata, contents, sections with `{#anchor}` ids, wikilinks, `[^n]` citations linked to the source list, prerequisites, "What links here", quiz link, embedded JSON-LD | fully works |
| `paths/index.html`, `paths/<topic>.html` | interest-based lesson paths from `graph.json` + `topics.json` (sub-topics and prerequisites included, prerequisites first, then intro → core → deep) | fully works; JS adds "combine interests" and quiz scores |
| `search.html` | client-side search over `data/search-index.json` (accent-insensitive prefix match, `?q=`) | lists every article and section to browse |
| `quiz/index.html`, `quiz/<slug>.html` | quizzes; JS checks answers against `data/quizzes/<slug>.json` and keeps scores in `localStorage` | "Show answer" disclosure per question |

The path ordering lives in `web/assets/lesson-path.js` and is shared by the build and the browser. HTML pages and assets are not listed in `data/manifest.json`, which stays the data contract.

## Deploying to GitHub Pages (disabled)

`.github/workflows/pages.yml` is manual-only (`workflow_dispatch`) and its job is gated with `if: false`, so it never deploys. To enable:

1. Repo Settings → Pages → Source: **GitHub Actions**.
2. In `pages.yml`, delete the `if: false` line (optionally add `push: branches: [main]` under `on:`).
3. Merge, then run the workflow from the Actions tab.

## License

Code: MIT ([LICENSE](LICENSE)). Content: CC BY-SA 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)). Media: per-file sidecar.
