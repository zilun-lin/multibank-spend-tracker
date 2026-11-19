# Configuration

Everything that's specific to you is in `config/config.json`. Copy it from `config.example.json`. All patterns are case-insensitive regular expressions tested against `MERCHANT DESCRIPTION`.

| Key | Meaning |
|---|---|
| `homeCurrency` | Currency all totals are shown in. |
| `fx` | Fallback rates to the home currency (`{"EUR": 0.85}`), used when a row has no `Amount Home`. |
| `transferPatterns` | Moves between your own accounts. Excluded from everything. |
| `income` | `[{category, pattern, account?, currency?}]`. Credits that are income. |
| `rules` | `[{category, pattern, account?, sign?: "in"/"out", currency?}]`. **The first match wins.** Put specific rules (a named landlord) above general ones (`RENT`). |
| `overrides` | `{transactionId: category}` for one-off corrections. |
| `notCounted` | Categories excluded from the budget and forecast, such as mortgage, rent and tax. They still show in the ledger. |
| `budgets` | Monthly budget per category. |
| `annualPots` | `{category: {amount, start}}`. A yearly allowance accruing daily from `start`. Use it for lumpy spend (clothes, flights home, gifts). These categories are left out of the monthly pace and forecast. |
| `nature` | Ordered rules tagging each row as a kind of spending: `{nature, categories?, minAmount?, pattern?, noItem?}`. Receipt items can set the nature directly. |
| `refunds` | `windowDays` (default 60) and a `pattern` for credits that are refunds even when no purchase is found. |
| `recurring` | `minMonths`, `maxCv` (amount stability) and `excludeCategories`. |
| `forecast` | `lookbackDays`, `lumpyThreshold` (purchases at or above this amount are spread as a monthly mean, not as weekday patterns), and `band` (z-score; 1.28 ≈ 80%). |
| `amortise` | `[{pattern, category?, account?, months}]`. Spread yearly or quarterly bills (ground rent, insurance) over `months`. Bill periods in a `Periods` tab or CSV (`--periods`) take precedence. Use `cli.js periodic` for suggestions. |
| `tax` | `{yearStart: "MM-DD", setAside: [{name, categories, expenseCategories?, rate}]}`. Tax to set aside on income not taxed at source. See below. |
| `otherIncome` | `[{name, monthlyGross, taxRate}]` for regular income that doesn't appear in any feed. |
| `fraud` | `largeAmount`, `newMerchantMin`, `allowMerchants`, `dismissed`, `quietAccounts`, `riskyPatterns`, `weights`. Tunes the anomaly watch. |
| `policy` | `{rules: [...]}`. Personal spending rules for the purchase check (see the personal-cfo skill). |
| `dataUrl`, `receiptsUrl` | Optional CSV URLs the dashboard fetches at view time. |

## Tax set-aside: what you can actually spend

Income that isn't taxed at source needs part of it set aside. That covers freelance and sole-trader invoices, side hustles, marketplace payouts, tutoring, rental income, and income taxed in two countries. For each entry in `tax.setAside`:

```
taxable  = income in `categories` − spending in `expenseCategories` (floored at 0)
reserve  = taxable × rate
spendable = income − expenses − reserve
```

These figures are computed for the trailing 31 days, which feed the cash flow and the "savings go negative" day, and year to date from `yearStart`, which is your tax pot. Pick `rate` as your effective marginal rate on that income: income tax plus social contributions. For income taxed in two countries with credit relief, the effective rate is roughly the higher of the two. Check your tax authority's current rates. This is arithmetic, not tax advice.

## Writing good rules quickly

```bash
node src/cli.js uncategorised --tx export.csv --config config/config.json
```

Work down the list. Twenty rules usually cover 90% of spend. Use `\b` word boundaries for short tokens (`\bTFL\b`, so that "NETFLIX" doesn't match).

## Money owed to you (`owed`)

Payments you make for other people are receivables, not spending. See [the recipe](recipes/money-owed-to-you.md) for the full walk-through.

| Key | Meaning |
|---|---|
| `me` | Your name as it appears in a shared tracker's "paid by" column (default `Me`). |
| `category` | Category given to owed payments (default `Paid for others (owed)`); they are not counted in budgets. |
| `rules[]` | First match wins. `from`/`to` (+`graceDays`, default 1) for a window; `prebookDays` + `prebookCategories` mark earlier bookings as **ask**; `until` + `pattern`/`categories` for standing rules; `ids` for agreed one-offs; `excludePattern`, `account`, `share` (default 1), `status` (default `owed`), `payerCheck`. |
| `payers[]` | `{ pattern | id, payer }` from a shared tracker. With `payerCheck`, only payments you made are owed; others are **not owed**; missing → **ask**. Also loadable with `cli.js owed --payers file.csv`. |
| `statuses` | `{ transactionId: "owed" | "ask" | "not owed" }`. Always wins. |
| `loans[]` | `{ name, date, amount }` in home currency. |
| `repayments` | `{ pattern, account?, from?, appliesTo? }` credits that are repayments (not income). |
| `conversions` | `{ pattern?, account?, list? }` how foreign repayments became home currency; valued first in, first out. `list` items: `{ date, foreign, home }`. |
