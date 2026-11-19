# How do I track money family or friends owe me, without it counting as my spending?

**Short answer:** treat what you pay on someone else's behalf as a **receivable**, not an expense. Write a few rough rules ("everything during my parents' visit, 15–19 Oct", "wedding payments I make myself", "the £5,000 loan"), let the engine mark matching payments as owed, and record repayments when they arrive, valued at the rate they actually converted at. Owed payments drop out of your budgets but stay in cash flow, so your spending numbers are true and you can see what's still outstanding.

## Why this matters

Hosting a family visit, paying a wedding deposit for the family, or lending a relative money makes your month look like a spending spree. It isn't: the money is coming back. If you count it as spending, the budget is wrong now; if you simply delete it, you lose track of what you're owed. The accounting answer is the one companies use: Dr *Receivable* / Cr *Bank* when you pay, and Dr *Bank* / Cr *Receivable* when you're repaid.

## The rules (`config.owed`)

```json
"owed": {
  "me": "Me",
  "rules": [
    { "name": "Parents' visit", "from": "2026-10-15", "to": "2026-10-19", "graceDays": 1,
      "prebookDays": 14, "prebookCategories": ["Travel & trips"],
      "categories": ["Eating out", "Travel & trips", "Transport", "Leisure"], "excludePattern": "BAKERY" },
    { "name": "Wedding", "until": "2027-06-12", "pattern": "WEDDING|MARQUEE|PHOTOGRAPHY STUDIO|FLORIST", "payerCheck": true },
    { "name": "Agreed one-offs", "ids": ["<transaction id>"] }
  ],
  "payers":   [ { "pattern": "MARQUEE", "payer": "Partner's parent" }, { "pattern": "PHOTOGRAPHY STUDIO", "payer": "Me" } ],
  "statuses": { "<transaction id>": "not owed" },
  "loans":    [ { "name": "Loan", "date": "2026-08-03", "amount": 5000 } ],
  "repayments":  { "pattern": "CASH DEPOSIT", "account": "EU Current", "from": "2026-08-03", "appliesTo": "Loan" },
  "conversions": { "pattern": "EXCHANGED TO GBP" }
}
```

- **Time-bound rules** (`from`/`to`) cover a visit or trip. Card payments can post a day late, so `graceDays` (default 1) extends the window. Hotels and flights are often booked before the visit starts; payments in `prebookCategories` within `prebookDays` before `from` are marked **ask**, not owed, so you confirm them once.
- **Standing rules** (`until` + `pattern` or `categories`) cover something ongoing, like a wedding. Open-ended rules must say what they cover; a rule that would match everything is ignored.
- **Who paid.** For shared costs, the bank feed can't tell you whose money it was. With `payerCheck`, a payment counts as owed only if a shared tracker (a wedding or trip spreadsheet's "paid by" column) says you paid. Someone else → **not owed**; not in the tracker → **ask**. Load the tracker with `--payers payers.csv` (columns `pattern,payer`) or put rows in `owed.payers`.
- **Your decisions win.** `statuses` by transaction ID overrides any rule, so "no, only the flights are owed" sticks.
- **Loans** are owed amounts with no card payment behind them.

## Repayments that arrive indirectly

Family rarely repay by neat bank transfer. A common path: cash handed over → deposited into a foreign account → moved to a multi-currency account → converted → into your main account. Count the repayment **once, at the point it enters** (the cash deposit), and ignore the later hops, which are transfers between your own accounts.

The deposit is in a foreign currency, so what you actually got back is what it converted to. `owedReport` values each deposit **first in, first out** against later conversions (`conversions.pattern`, or an explicit `conversions.list` of `{date, foreign, home}` when you know the realised amounts from a statement). Anything not converted yet uses today's rate and is marked provisional.

Don't let a rule mistake your own money for a repayment: transfers you make from your own savings or rent income into the same account are not repayments. Keep the repayment pattern narrow (the bank's wording for a cash deposit, say), and check the first few by hand.

## Use it

```bash
node src/cli.js owed --tx feed.csv [--payers wedding-payers.csv]
```

Returns every owed item with its rule and status, every repayment with its realised value, and per rule: owed, to confirm, repaid, outstanding. The dashboard shows an "Owed to you" tile and table; the MCP tool is `spend_owed`; the `finance-assistant` skill answers "how much does my family still owe me?".

## Pitfalls

- **Gifts aren't repayments.** Money someone gives you towards an event isn't them repaying you; leave it out of the repayment pattern.
- **Fees count.** A bank fee on a payment you made for someone is part of what they owe; a rule that matches the payment's description usually catches its fee line too, if the fee has the same reference.
- **Re-check after people correct you.** The first pass of any rule is a draft. Put corrections in `statuses`, not in ever-more-complicated patterns.
