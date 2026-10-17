# Lessons

One line per mistake hit while building Aigora, so it is not repeated.

- js-yaml's default schema turns `2026-10-17` into a Date object, which fails JSON Schema `format: date`; load YAML with `JSON_SCHEMA` so dates stay strings.
- `node --test test/` (directory arg) fails on Node 22; use plain `node --test`, which finds `test/*.test.js`.
