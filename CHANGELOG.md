# Changelog

## 0.4.0 — 2026-11-19

- **Money owed to you** (`config.owed`, `owedReport()`, `cli.js owed`, MCP `spend_owed`, dashboard tile and table): time-bound and standing rules, pre-trip bookings marked "ask", a shared tracker's "paid by" column for shared costs, your statuses by transaction ID, loans, and repayments valued at the rate they actually converted (first in, first out). Owed payments leave budgets but stay in cash flow.
- **Statement backfill** (`src/import.js`): CSV/TSV/".xls" exports in several languages, decimal commas, Latin-1, dedupe against the feed, and optional feed-compatible IDs rebuilt from the bank's running entry number.
- Recipes: money owed to you; backfill from a bank statement export. Skills and the daily pipeline updated for both.
- Sample data covers a family visit, wedding deposits with a shared payer tracker, and a loan repaid by cash deposits.

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
