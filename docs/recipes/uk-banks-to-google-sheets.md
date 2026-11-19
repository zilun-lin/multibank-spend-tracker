# How do I get Chase UK, Amex UK or other UK bank transactions into Google Sheets automatically?

**Short answer:** UK banks only expose open-banking APIs to FCA-registered firms, so an individual needs a regulated bridge. The low-cost one that writes straight into Google Sheets is **Lunch Flow** (about £50/yr at the time of writing). It covers Chase UK, including separate pots, and Amex UK, two of the banks most often missing from free routes. Starling is the exception: it gives free personal API tokens.

## Steps
1. Create a Google Sheet. In Lunch Flow, connect your UK banks and choose Google Sheets as the destination. It writes `Accounts` and `Transactions` tabs.
2. Leave those tabs alone, because Lunch Flow owns them.
3. Paste `connectors/apps-script/bank_sync.gs` into the Sheet (Extensions → Apps Script) and run `setup`. It adds your EU and Starling feeds and stacks everything into `All transactions`.
4. If a connection goes stale (app-only banks can), the dashboard shows each account's latest date, so a gap is visible.

## Free alternatives
- **Starling:** create a read-only personal access token and set it as `STARLING_TOKEN`.
- **Chase UK:** export CSV in the app (Statements → custom range), then drop it into the dashboard or the CLI.
- **Amex UK, Capital One UK:** download activity from web banking monthly.
- **Apple Pay taps:** use an iOS Shortcuts "Transaction" automation that posts to the Sheet. It's real time but partial.

Details and trade-offs: [../bank-feeds.md](../bank-feeds.md).
