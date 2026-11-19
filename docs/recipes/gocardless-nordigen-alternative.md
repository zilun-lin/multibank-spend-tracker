# What replaces GoCardless Bank Account Data (Nordigen) for personal use?

**Short answer:** for EU/EEA accounts, use **Enable Banking's free restricted mode**, which covers your own accounts. For UK accounts, use a low-cost bridge such as **Lunch Flow**, or CSV exports. Starling has a free personal API token. multibank-spend-tracker ships the Apps Script that pulls Enable Banking and Starling into Google Sheets daily, plus an engine that merges them with Lunch Flow and CSV rows.

| Option (Nov 2026) | Cost | Region | Notes |
|---|---|---|---|
| Enable Banking restricted mode | Free | EEA (incl. Revolut) | Your own accounts; needs consent renewal |
| Lunch Flow | ~£50/yr | UK + EU (+US via partners) | Writes to Sheets, Actual, Lunch Money, SimpleFIN apps |
| Starling personal token | Free | Starling only | Read-only scopes |
| Salt Edge / TrueLayer / Tink / Yapily | Sales-led | UK/EU | Business contracts |
| Plaid self-serve | Trial | US/Canada | Not UK/EU personal |
| CSV exports | Free | Any | Manual, monthly |

Also useful if you used Nordigen with Actual Budget or Firefly III: Lunch Flow offers a SimpleFIN-compatible destination, and Firefly III's importer supports Enable Banking.
