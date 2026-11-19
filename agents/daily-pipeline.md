# Running it daily with an AI agent

This works with any assistant that can (a) run on a schedule, (b) read and write a Google Sheet or files, (c) optionally search your email, and (d) publish a page, artifact or canvas. That includes Claude (scheduled tasks, connectors, artifacts), ChatGPT (tasks, connectors, canvas), Gemini, or a self-hosted agent on cron with an MCP client. Nothing below depends on one vendor.

## The pipeline, with dependencies

```
06:00  bank_sync.gs (Apps Script trigger)     → writes "Bank feed", "Sync status"
06:xx  Lunch Flow (its own schedule)           → writes "Transactions"
07:15  AI job: receipt enrichment              → waits for fresh "Sync status", writes "Receipt items" + "Periods"
07:20  AI job: money owed                     → after receipts: marks new owed items from config.owed rules (ask when unsure), records new repayments; never changes a status the user set
07:30  AI job: fraud watch                     → after receipts (so receipts clear false alarms), writes "Flags", alerts on new high/medium
07:45  AI job (optional): rebuild + publish    → node src/build.js … → publish as artifact/canvas
any    You: "why am I over budget?"            → agent loads the skill, runs cli.js explain or reads the dashboard
```

Rules that keep it reliable:

1. **Gate on freshness.** Every AI job first reads `Sync status!B1` (last run). If that's older than 26 hours, the job doesn't write anything. It reports "bank sync stale" instead, so receipts are never matched against an incomplete ledger.
2. **One writer per tab.** Apps Script owns `Bank feed` and `Sync status`, Lunch Flow owns its tabs, and the receipt job owns `Receipt items`. The dashboard and the agent are read-only everywhere else. This prevents two jobs from overwriting each other.
3. **Idempotent writes.** Key everything by `Transaction ID`, and skip IDs that already exist. A job can then be re-run safely after a failure.
4. **Bounded runs.** Cap each run, for example at 40 payments, and backfill older periods over several days. That keeps runs inside the agent's time and tool budgets.
5. **Visible status.** Each job writes a single line it can read back: last run, rows written, errors. The dashboard shows it, so a silent failure looks like a failure, not like "you spent nothing".

## Two ways to keep the dashboard current

- **Live (recommended).** Build once with `node src/build.js --no-data` and set `config.dataUrl` to the Sheet's published-CSV URL (File → Share → Publish to web → CSV for the `All transactions` tab). The page fetches fresh data every time it's opened, so you never need to republish. If your platform's artifacts can call connectors directly (for example, Claude artifacts with a Google Sheets data source), point the page at the Sheet through the connector instead and skip publishing to the web.
- **Snapshot.** The daily job runs `node src/build.js --tx export.csv --receipts items.csv` and republishes the self-contained HTML. Use this when you don't want the Sheet published anywhere.

> Publishing a Sheet to the web makes it readable by anyone who has the URL. If that's not acceptable, use the connector route or snapshots.

## Prompt templates

Paste these into your agent's scheduled-task creator and edit the bracketed parts.

**Receipt enrichment + bill periods (daily):** see [`receipt-enrichment.md`](receipt-enrichment.md).

**Fraud watch (daily):** see [`fraud-watch.md`](fraud-watch.md).

## Backfill and history: why yearly bills get missed

A yearly charge can't be recognised from cadence until you have more than 12 months of history. Most people connect their feeds with only about 90 days of history (the PSD2 limit). So during the first year:
1. **Names** catch the obvious ones (`GROUND RENT`, `INSURANCE`, `TV LICENCE`).
2. **Documents** catch the rest. A bank transfer to `XYZ ESTATES LIMITED` says nothing, but the demand letter in the mailbox states the period. The receipt job's step 5b looks for it. Make sure its backfill window reaches back far enough (60–90 days on the first run) and that it doesn't skip transfers to companies, which a purchases-only search does.
3. **Ask.** Anything left over (`node src/cli.js periodic` lists it as `needsEvidence`) is asked once. The answer becomes an `amortise` rule, so it's never asked again.

Cadence (330–400 days apart) takes over automatically once there's a year of data.

**Weekly check-in (Mondays):**
```
Read [SHEET URL] tabs "All transactions" and "Receipt items" and my config at [config location].
Use the finance-assistant method (skills/finance-assistant/SKILL.md in github.com/<owner>/multibank-spend-tracker):
classify, pair refunds, split receipts, apply budgets and yearly pots, forecast month end.
Send me five lines: projected month end vs budget with range, the top 2 drivers vs last month,
any category over budget, any new recurring charge, and the number of uncategorised transactions
with a suggested rule for the most frequent one. Do not modify any data.
```

**On demand ("why am I over?"):** the agent loads [`skills/finance-assistant/SKILL.md`](../skills/finance-assistant/SKILL.md) and follows it.
