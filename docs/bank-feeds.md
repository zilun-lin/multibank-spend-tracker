# Getting transactions from banks in several countries, cheaply

This is the hard part. It's also why this project exists. Prices and availability below were checked in November 2026 and change often, so check them again before you rely on them.

## Why it's painful

- **Free aggregator APIs for individuals have mostly gone.** GoCardless Bank Account Data (formerly Nordigen) closed to new sign-ups. Salt Edge expects a legal entity. Plaid's self-serve trial is US/Canada only. TrueLayer, Tink and Yapily are sales-led for live access.
- **UK open banking serves licensed firms.** Chase UK, Amex UK, Capital One UK and most high-street banks publish APIs only for FCA-registered AISPs. Registering yourself costs thousands a year.
- **App-only banks have nothing to scrape.** Chase UK, for example, has no web banking. Its open-banking connection has been flaky through some aggregators, and statements are an in-app export.
- **Each feed has its own format and currency.** You end up with three spreadsheets that don't add up, transfers between your own accounts counted twice, and EUR rent mixed in with GBP spending.

## The pattern that works: two feeds into one Sheet, then one engine

```
UK banks ──► Lunch Flow (paid, low cost) ──► Google Sheet  "Transactions"  ┐
EU banks ──► Enable Banking (free, own accts) ──► Apps Script ──► "Bank feed" ┤──► "All transactions" ──► engine ──► dashboard / agent answers
Starling ──► personal access token (free) ──► Apps Script ──► "Bank feed"     ┘
Receipts ──► Gmail (schema.org Order markup) ──► scheduled AI job ──► "Receipt items"
```

### 1. UK accounts through Lunch Flow

[Lunch Flow](https://www.lunchflow.app) is a small paid bridge that connects to UK and EU banks through regulated aggregators. It writes to a Google Sheet, and to Actual Budget, Lunch Money and others. At the time of writing it cost about £50 a year.

How it gets around the UK problems:
- **You don't need to be licensed.** Lunch Flow holds the regulated connection, and you only receive the data.
- **It covers the awkward banks.** For example, it covers Chase UK (including separate pots) and Amex UK, two of the banks most often missing from free routes.
- **The rows already land in a Sheet.** Lunch Flow writes `Home`, `Accounts` and `Transactions` tabs in a stable column order. `bank_sync.gs` never writes to those tabs. It only reads them into `All transactions`.
- **It handles re-consent prompts** when a bank's 90 or 180-day consent expires. You just reconnect when it emails you.

Tips:
- Leave Lunch Flow's tabs alone and treat them as read-only. Put your own formulas and notes on other tabs.
- When a connection is flaky (Chase can go stale for days), the dashboard shows the latest date per account. That way a gap looks like a gap, not like a frugal week.

### 2. EU/EEA accounts through Enable Banking's free "restricted" mode

[Enable Banking](https://enablebanking.com) lets you register your own application. You link your own accounts in a restricted production mode at no cost. It reaches 2,500+ banks across the EEA, including Revolut (which has no personal API of its own), N26, Wise, and German, Dutch, Spanish, French and Italian high-street banks.

How it gets around the EU problems:
- **No company or licence needed** for your own accounts.
- **It's serverless.** `connectors/apps-script/bank_sync.gs` signs the RS256 JWT inside Google Apps Script, so nothing runs on your laptop and there's no server to host.
- **Consent expiry is tracked.** Each account's `validUntil` sits in `EB_ACCOUNTS`. The script warns on the status tab, and emails you, 21 days before it lapses.
- **Late bookings are caught.** Every run re-reads the last 14 days and de-duplicates by transaction id.
- **FX is built in.** Every row gets an `Amount Home` value from a live `GOOGLEFINANCE` rate, so EUR, PLN or USD accounts add up next to GBP.

To link a bank, run `connectors/enable-banking/link.py` once per bank. It prints the account uids to paste into Script Properties.

Caveat: Enable Banking's commercial pricing changed in 2026, and the free mode could be narrowed. If it goes, Lunch Flow also covers many EU banks.

### 3. Starling: free personal token

Starling issues read-only personal access tokens. Put the token in `STARLING_TOKEN` and `bank_sync.gs` pulls the account too.

### 4. Gaps: CSV exports and phone-side capture

- **CSV/PDF exports.** Any bank's export can be dropped into the dashboard or `cli.js`. The parser maps common column names (`Date`, `Amount`, `Payee`, `Details`, and so on), and an agent can turn a PDF statement into the canonical CSV.
- **Apple Pay taps (iOS 17+).** A Shortcuts "Transaction" automation can post each tap to the Sheet or to an email with a fixed subject line. It's near-real-time but misses direct debits.
- **Android.** Notification-listener apps can log bank push notifications to a Sheet.

### Route comparison

| Route | Cost (Nov 2026) | Covers | Automation | Risk |
|---|---|---|---|---|
| Lunch Flow → Sheet | ~£50/yr | Most UK + EU banks incl. Chase UK, Amex UK | Daily, unattended | Regulated aggregator |
| Enable Banking restricted mode + `bank_sync.gs` | £0 | EEA banks incl. Revolut | Daily, unattended | Keep the PEM private; consents need renewing |
| Starling token + `bank_sync.gs` | £0 | Starling | Daily, unattended | Use a read-only token |
| Monthly CSV export | £0 | Anything | Manual, ~10 min/month | None |
| iOS Wallet Shortcut | £0 | Apple Pay taps | Real time, partial | Protect the web-app URL with a secret |
| Snoop, PocketSmith, Moneyhub etc. | £40–£100/yr | UK (varies) | Daily | Their exports are often limited |

## Receipts: getting line items, not just "AMAZON £96.47"

Bank feeds tell you who you paid, not what you bought. Most retailers send order confirmations with schema.org `Order` / `Invoice` markup; this is what Gmail uses to put them in the *Purchases* category. A scheduled AI job does the following:
1. Lists payments of £15 or more from the last 10 days that have no receipt yet.
2. Searches Gmail (`category:purchases`, merchant, date ±3 days, amount) for the receipt.
3. Writes one row per item to `Receipt items`. The engine then splits the payment into item rows scaled to the exact bank amount.

The prompt is in [`agents/receipt-enrichment.md`](../agents/receipt-enrichment.md). For a second mailbox, such as a joint account, add a Gmail filter there that forwards purchase emails to the mailbox the agent reads. Most AI Gmail connectors attach to one account.
