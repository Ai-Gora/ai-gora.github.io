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
npm run build    # writes dist/ (copies only allowlisted raster media; never SVG)
npm run charts   # re-render charts/**/chart.vl.json to media/<slug>/<chart>.png + render.json after changing chart data or specs
```

## Repo layout

```
articles/<category>/<slug>.md   one article per file, canonical source
quizzes/<slug>.yaml             questions tied to article anchors
topics/<topic>.yaml             categories: description, parent, related, optional i18n (e.g. i18n.sl.title/description)
media/<slug>/...                published images only (webp, png, jpg/jpeg, gif; no SVG), each with a <file>.license.yaml sidecar
charts/<slug>/<chart>/          chart sources, not published: data.csv + chart.vl.json (Vega-Lite) + README.md + render.json (hashes)
schema/                         JSON Schemas: article frontmatter, quiz, topic, media licence
scripts/                        build.js (CLI) + lib.js (validation and data) + site.js (HTML)
web/assets/                     CSS and progressive-enhancement JS copied to dist/assets/
test/                           node:test suite
dist/                           generated output (gitignored)
tasks/lessons.md                mistakes hit, one per line
LICENSE (code, MIT)  LICENSE-CONTENT (CC BY-SA 4.0)  CONTRIBUTING.md  STYLE.md
```

## Article format

Writing, structure, visuals and image licensing follow the [style guide (STYLE.md)](STYLE.md).


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
| `data/topics.json` | `[{ id, title, description, i18n?: { [lang]: { title, description? } }, parent: string\|null, related[], articles: slug[] }]`; `i18n` is optional (English is `title`/`description`); pages in that language use it (article topic tags, `paths/<lang>/`) and fall back to English marked `lang="en"` |
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
| `a/<slug>.html` | article: EN/SL switcher from `translations` (plain links with `hreflang`/`lang`, plus `<link rel="alternate">`), summary, metadata, contents, sections with `{#anchor}` ids, wikilinks, `[^n]` citations linked to the source list, prerequisites, "What links here", quiz link, embedded JSON-LD | fully works |
| `paths/index.html`, `paths/<topic>.html`, `paths/<lang>/index.html`, `paths/<lang>/<topic>.html` | interest-based lesson paths from `graph.json` + `topics.json` (sub-topics and prerequisites included, prerequisites first, then intro → core → deep); per-language pages swap a prerequisite for its translation when one exists | fully works (language filter is plain links); JS adds "combine interests" with a language select, and quiz scores |
| `search.html` | client-side search over `data/search-index.json` (accent-insensitive prefix match, no minimum term length, metadata: topics, authors, AI-assisted; `?q=&lang=`) | lists every article and section, grouped by language |
| `quiz/index.html`, `quiz/<slug>.html` | quizzes; JS checks answers against `data/quizzes/<slug>.json` and keeps scores in `localStorage`. Each check sets every question fresh: correct closes its answer, wrong or unanswered opens it | "Show answer" disclosure per question |

UI strings live in `web/assets/i18n.js` (`en`, `sl`; same keys, Slovenian plurals), used at build time and by the quiz/paths scripts, picked by the page's `lang` (article/quiz language, `paths/<lang>/`). Mermaid blocks render client-side with the self-hosted `mermaid` package (copied to `assets/vendor/`, loaded by `assets/diagram.js` only on pages with a diagram; strict security level, dark theme in dark mode; a diagram never shrinks below 0.75 of its natural width, so 16px labels stay at least 12px, and a wider one scrolls inside a keyboard-focusable `role="region"` named by its `accTitle`); without JS the source and its `accTitle`/`accDescr` caption stay visible.

The path ordering lives in `web/assets/lesson-path.js` and is shared by the build and the browser. HTML pages and assets are not listed in `data/manifest.json`, which stays the data contract.

## Deploying to GitHub Pages (disabled)

`.github/workflows/pages.yml` is manual-only (`workflow_dispatch`) and its job is gated with `if: false`, so it never deploys. To enable:

1. Repo Settings → Pages → Source: **GitHub Actions**.
2. In `pages.yml`, delete the `if: false` line (optionally add `push: branches: [main]` under `on:`).
3. Merge, then run the workflow from the Actions tab.

## License

Code: MIT ([LICENSE](LICENSE)). Content: CC BY-SA 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)). Media: per-file sidecar.

## Style checks (STYLE.md)

`npm run validate` and CI enforce part of [STYLE.md](STYLE.md) (`scripts/style.js`, `scripts/charts.js`):

| Rule | Check | Result |
|---|---|---|
| L1, L2, L5, V7 | every file in `media/` is a regular file (no symlinks, real path inside `media/`) of an allowlisted type (`.webp`, `.png`, `.jpg`, `.jpeg`, `.gif`) whose magic bytes match its extension; SVG and any other type are errors, and the build copy step refuses them too. Every such file (except `.license.yaml` sidecars and `.gitkeep`) has `<file>.license.yaml` with `title`, `author`, `source_url` (or `source`), `license`; licence is CC0/PD, CC BY, CC BY-SA or NASA; NC, ND, Unsplash, Pexels, Pixabay are blocked | error |
| V2 | every Mermaid block has `accTitle:` and `accDescr` | error |
| V8 | Mermaid sources are self-contained: no `%%{` directives, `---` config, HTML or numeric character codes, `img:` (quoted or not), `click`/`href`/`call` statements (line start or after `;`), `url()`, URLs (`http(s):`, `//host`, `data:`/`javascript:` followed by a payload), backslashes (URL checks run with tabs, line breaks and control characters removed, case-insensitive; label words like `Data: 3` or `A // B` pass); `assets/diagram.js` skips such blocks too, and pages with a diagram send a Content-Security-Policy that only allows same-origin resources | error |
| V4 | every Markdown image has alt text of 125 characters or fewer | error |
| V3 | each `charts/<slug>/<chart>/chart.vl.json` renders server-side to an intermediate SVG (data `url`s must be regular files inside the chart folder: no symlinks, schemes or absolute paths), has a `README.md`, and `render.json` matches both the SVG render and the committed `media/<slug>/<chart>.png` (`npm run charts` rasterises with resvg and refreshes both; CI only compares hashes) | error |
| W2 | sentences over 25 words | warning only, never fails CI |

Chart sources live in `charts/`, outside `media/`, and are never published; the chart PNG gets a generated sidecar, and the chart `README.md` carries the data source and long description.
