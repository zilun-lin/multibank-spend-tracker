# Changelog

## 0.3.0 — 2026-11-19

- Fix: an account linked after others gets its full ~90-day first-run history (the check was global, so a new account only got the 14-day daily lookback).
- Fraud watch: `anomalies()` / `cli.js anomalies` / MCP `spend_anomalies`, a dashboard "Check these" section, the `fraud-watch` skill and the `agents/fraud-watch.md` daily job.
- Tax set-aside on income not taxed at source (`config.tax`): spendable income, year-to-date tax pot, any tax year.
- Amortisation of yearly and quarterly bills (`config.amortise`, a `Periods` tab with bill periods from emails), `cli.js periodic` suggestions with evidence levels.
- Examples now use a UK + German setup; DE rule pack replaces PT.
- Build fix: `$&` in the engine no longer corrupts the inlined dashboard.

## 0.2.0 — 2026-11-19
- MCP server (`mcp/server.js`): explain, summary, check_purchase, recurring, uncategorised, ledger.
- Personal-CFO purchase check (`cli.js check`) with user-written policy rules.
- Skills: finance-assistant, personal-cfo, finance-dashboard-design.
- Question-shaped recipes in `docs/recipes/`, comparison with alternatives, llms.txt and llms-full.txt.
- Country rule packs (UK, PT) and CI.

## 0.1.0 — 2026-11-19
- Engine, CLI, dashboard, Apps Script bank sync (Enable Banking + Starling), Enable Banking link helper, receipt-enrichment agent prompt.
