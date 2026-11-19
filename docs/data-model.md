# Data model

## Transactions (canonical)

| Column | Notes |
|---|---|
| `Transaction ID` | Stable and unique. Feeds prefix their own (`EB-`, `ST-`). Used for de-duplication, overrides and receipts. |
| `Date` | `YYYY-MM-DD`, booking date. |
| `Account` | Your label for the account. |
| `Amount` | Signed, in the account's currency. Negative is money out. |
| `Currency` | ISO code. |
| `Merchant` | Counterparty name. |
| `Description` | Reference or remittance text. |
| `Amount Home` | Optional, signed, in the home currency. If it's missing, `fx` in the config is used. |
| `Source` | Which feed the row came from. |

Common alternative headers (`Payee`, `Details`, `Booking date`, `Amount GBP`, …) are mapped automatically.

## Receipt items

`Transaction ID | Date | Merchant | Payment | Item | Qty | Price | Category | Match | Source | Checked | Nature`

## Enriched ledger (engine output)

Each row gains `kind` (spend/income/transfer/other-in), `category`, `why` (which rule matched), `counted`, `effDate` and `month` (refunds move to the purchase's month), `refund` (`{of, full}`), `nature`, `pot` (monthly/annual), and, for receipt items, `parent` and `item`.
