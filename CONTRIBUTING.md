# Contributing

Contributions that help someone else with the same banks are the most valuable:

- **Rule packs** for a country or bank: `config/rules/<country>.json`, an array of `{category, pattern}`. Use synthetic or public merchant names only.
- **CSV mappers** for a bank's export format: add header aliases in `normaliseRows`, plus a tiny synthetic fixture in `examples/`.
- **Connectors**: new Apps Script pulls (other free personal APIs), following `bank_sync.gs` (keys in Script Properties, booked-only, id prefix, de-duplication).
- **Agent recipes** for other platforms (Gemini, local agents) in `agents/`.

Rules:
1. Never commit real transactions, names, account ids or keys. Tests use generated data (`examples/make_sample.js`).
2. Keep `src/engine.js` dependency-free and covered by `npm test`.
3. Docs answer a question in the title (see `docs/recipes/`).
