# Aigora style guide

How to write, structure and illustrate Aigora articles so both people and machines can read them. The rules are numbered so reviews can cite them, for example "W3".

> **Credit.** The writing rules are inspired by the approach of *ASD-STE100 Simplified Technical English* (ASD, Issue 9, 2025), but they are Aigora's own original wording. Aigora is not affiliated with or endorsed by ASD, and Aigora articles do not claim STE compliance. "ASD-STE100" is a registered trademark of ASD. Get the official standard at <https://www.asd-ste100.org/STE_downloads.html>.
> Also drawn on: EU *How to write clearly / Pišimo jasno*, Slovenian government web-writing guidelines (NIO), W3C WAI and WCAG 2.2, and Creative Commons attribution practice.

## Writing (W)

1. **Answer first.** Open with the answer in two to four sentences, then explain.
2. **Sentence length.** Keep explanatory sentences to 25 words or fewer, aiming for an average under 20. Keep numbered steps to 20 words or fewer. Split long sentences instead of adding commas.
3. **One idea per sentence, one topic per paragraph.** Paragraphs have six sentences at most. Prefer three or four.
4. **Active voice.** Name who does what. Use the passive only when the actor is unknown or doesn't matter.
5. **Plain verbs.** Write "measure" rather than "carry out a measurement". Avoid phrasal verbs when a single verb exists, for example "remove" rather than "take out".
6. **Steps.** Write steps as commands, one action per step. State a condition before the action: "If X, do Y."
7. **One word, one meaning.** Use each term with one meaning only, and use one term per concept. Don't swap in synonyms for variety.
8. **Aigora word list.** Preferred and banned terms live in `glossary/terms.<lang>.yaml`: `term`, `meaning`, `use_instead_of`, `lang_pairs`, `source`. Add a term the first time you need it. CI warns when an article uses a banned synonym, and when an EN↔SL `lang_pairs` link does not resolve in both directions (an error once `--strict-glossary` is on). Start small with real terms from real articles; don't build a dictionary up front.
9. **Technical terms.** Allowed, but define each one in plain words the first time it appears. Keep noun stacks to three words at most: write "dialect boundary map", not "regional dialect boundary map data".
10. **No filler.** Cut hedges, hype, idioms, jokes and rhetorical questions. Keep the tone neutral.
11. **Numbers and units.**
    - Use digits for 10 and above and for all measurements, with SI units and a space: `5 km`, `20 °C`.
    - Write dates as ISO `2026-10-17` in data. In prose, write "17 October 2026" (en) or "17. oktober 2026" (sl).
    - Give ranges with an en dash: `18–20`.
    - Always give the unit and the period: "per year", "as of 2026".
12. **Claims and sources.**
    - Every factual claim needs a footnote `[^n]` that points to `sources` in the frontmatter.
    - Keep observation separate from interpretation, and mark your own reasoning "(inferred)".
    - Never invent a figure, quote or source.
    - Quote sparingly, in quotation marks, and only from sources whose terms allow it.
13. **Punctuation.** Avoid semicolons; use two sentences or a list instead. Use parentheses only for short asides.
14. **Lists.** Use a vertical list for three or more parallel items, or for any complex sequence. Use numbered lists only when order matters.
15. **Slovenian (sl).**
    - Same rules W1–W14. Aim for an average of 18–20 words per sentence, with 25 at most.
    - Avoid officialese (*uradniško izrazje*), calques and needless loanwords. Prefer verbs to verbal nouns: "preverite", not "izvedite preverjanje".
    - Check spelling and usage against Fran (fran.si) and the *Pravopis*. Keep English–Slovenian term pairs in the word list.
    - Use *preprosti jezik* for "plain language" and *lahki jezik* for "easy language" (ZRC SAZU usage).

## Structure (S)

1. **Frontmatter.** Every article starts with the YAML frontmatter defined in `schema/article.schema.json`: `id`, `title`, `slug`, `summary`, `topics`, `level`, `lang`, `status`, `confidence`, `updated`, `review_after`, `authors`, `ai_assisted`, `sources`, `license`, `derived_from`. Quote any value that contains a colon.
2. **Section order.**
   1. `## Answer`
   2. `## Key insights` (five at most)
   3. topic sections
   4. `## Key claims` (one claim per line, each with a footnote)
   5. `## Quiz` (`## Kviz` in Slovenian): only the fixed pointer line to `quizzes/<slug>.yaml`, optionally followed by the fixed site phrase. The quiz itself lives in the YAML file. CI rejects any other text in this section.
   6. `## Open questions`
   7. `## Sources`
3. **Headings.** Use short noun phrases in sentence case, without numbering or end punctuation. Don't skip heading levels.
4. **Anchors.** Every H2/H3 that a quiz or link may target gets a stable `{#kebab-anchor}`. Never rename an anchor without leaving the old one in place, because quizzes and links depend on it.
5. **Links.** Link to other articles with `[[slug]]` or `[[slug#anchor|text]]`. Link external sources only through footnotes.
6. **Length.** If an article grows past about 1,500 words, split it into linked articles.

## Visuals (V)

1. **Prefer text-based visuals.** Use Mermaid for flows, sequences, timelines and hierarchies. Use a table when the data fits in one.
2. **Mermaid accessibility.** Every Mermaid block has `accTitle:` (one line) and `accDescr:` (one line, or a `{ ... }` block). Also state the diagram's main point in the text around it.
   ```mermaid
   flowchart LR
     accTitle: Article review flow
     accDescr: A draft goes to review, then to published. A failed review returns it to draft.
     Draft --> Review -->|pass| Published
     Review -->|fail| Draft
   ```
3. **Charts come from data in the repo.** Store each chart's sources in `charts/<slug>/<chart>/`:
   - `data.csv` (or `.json`)
   - `chart.vl.json`, a Vega-Lite spec that points to the data with `url`
   - `README.md` with a data source citation and a long description

   `npm run charts` renders the spec and writes the published raster `media/<slug>/<chart>.png`, its sidecar, and `render.json` (hashes). CI fails if the PNG is out of date with the spec and data, was edited by hand, or differs from a fresh render with the pinned fonts in `fonts/`. Chart data must be data files (CSV, TSV, JSON, TopoJSON, GeoJSON); chart images must be PNG, JPEG or GIF files in the chart folder. Don't use hand-edited charts or screenshots of charts.
4. **Alt text, required.** Every image has alt text that gives its *purpose* in 125 characters or fewer. Decorative images use empty alt (`![]()`) and are rare.
5. **Long description for complex images.** Charts, diagrams, maps and annotated photos also need a long description that gives the essential information, as a list or a table of the key values. Put it in the chart `README.md`, or directly after the image under `<details><summary>Description</summary>`.
6. **Captions.** Put a caption under each figure in the form `*Figure n. What it shows, and the key takeaway. Source/credit.*` The caption must not simply repeat the alt text.
7. **Formats.** Publish rasters only: WebP, PNG or JPEG (GIF is accepted), with the long edge at 1600 px or less for photos. Never publish SVG: SVG can carry scripts and external references, so convert it to a raster at a size where labels stay legible. Use Mermaid for diagrams. Avoid text inside photos.
8. **Mermaid stays self-contained.** Diagrams are static and load nothing: no `%%{init}%%` directives or `---` config blocks, no HTML or numeric character codes (`#60;`, `&#60;`), no `img:` shapes (also as a quoted `"img":` key), no `click`/`href`/`call`/`callback`/`link`/`links` statements (diagrams are not interactive), no `url()`, no URLs (`https:…`, `//host`, `data:…`, `javascript:…`) and no backslashes. URL checks ignore tabs, line breaks and case. Shape data (`A@{ ... }`) is plain keys and values only: no YAML anchors, aliases, tags or complex keys (`&k`, `*k`, `!t`, `? k`), and no `//` or URL even split over lines; once a diagram uses shape data, the word `img` may not appear anywhere after it. Ordinary words in labels are fine (`Data: 3 rows`, `Call centre`, `A // B`). Write `Issue #12`, not `Issue #12;` (Mermaid decodes `#12;` as a character code, so it is rejected). Put links in the text next to the diagram.

## Images & licensing (L)

1. **Allowed:**
   - Your own work, released CC BY-SA 4.0
   - CC0 and public domain
   - CC BY (any version)
   - CC BY-SA (any version)
   - NASA media, used factually, with no logos and no third-party-marked images
2. **Not allowed:**
   - NC and ND licences of any kind
   - The Unsplash, Pexels or Pixabay licences, or other non-CC "free" licences
   - "Found on Google" images, screenshots of copyrighted works, logos and trademarks used as decoration
   - AI-generated images that imitate a living artist or a real person
3. **Verify at source.** Openverse and other search engines are only for finding images. Check the licence on the file's own page, for example the Wikimedia Commons description page, and record that URL.
4. **Attribution (TASL)** goes in the caption or credit line: *"Title" by Author, Source, Licence*, with links, plus "cropped" or "modified" if you changed it. Example: *"Metlika castle" by J. Novak, Wikimedia Commons, CC BY-SA 4.0, cropped.* For NASA, write *"Credit: NASA"*.
5. **Sidecar file.** Every media file has `media/<slug>/<file>.license.yaml`:
   ```yaml
   file: metlika-castle.webp
   title: Metlika castle
   author: J. Novak
   source_url: https://commons.wikimedia.org/wiki/File:...
   license: CC-BY-SA-4.0          # SPDX id
   license_url: https://creativecommons.org/licenses/by-sa/4.0/
   modified: "cropped, resized"   # or "no"
   retrieved: 2026-10-17
   ai_generated: false
   ```
   CI fails if a media file has no sidecar, or if the sidecar's licence isn't on the allowed list.
6. **ShareAlike.** An unmodified image placed in an article keeps its own licence; the article is a collection. If you annotate, crop creatively or remix an image, the result is an adaptation: release it CC BY-SA 4.0 and keep the original's attribution and licence in the sidecar.
7. **People and places.** Get consent, or use a public-interest context, for identifiable people. Note any personality-rights issues in the sidecar.

## Checklist (before you open a PR)

- [ ] The frontmatter validates, `updated` is today, and `review_after` is set.
- [ ] The article opens with the answer, and paragraphs have six sentences or fewer.
- [ ] Sentences are 25 words or fewer (20 for steps) and in active voice.
- [ ] Terms are consistent with `glossary/`, and new terms have been added.
- [ ] Every claim has a footnote, every source is cited, and inferences are marked.
- [ ] Anchors are stable, and quiz `ref`s resolve.
- [ ] Mermaid blocks have `accTitle` and `accDescr`, and charts are rebuilt from data.
- [ ] Every image has alt text, complex images have long descriptions, and figures have captions.
- [ ] Every media file has a `.license.yaml` with an allowed licence and full TASL credit.
- [ ] No text copied from ASD-STE100 or other non-open sources.

---
*This style guide is licensed CC BY-SA 4.0. Code samples in it are licensed under the repository's code licence.*
