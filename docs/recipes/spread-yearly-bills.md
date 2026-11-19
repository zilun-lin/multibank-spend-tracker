# How do I spread yearly bills like ground rent, insurance or annual subscriptions across months?

**Short answer:** amortise them. Allocate each yearly payment as 1/12 per month, starting with the month you paid, so no single month looks terrible and the rest too good. In multibank-spend-tracker:

```json
"amortise": [
  { "pattern": "GROUND RENT|SERVICE CHARGE", "months": 12 },
  { "pattern": "INSURANCE|TV LICEN|VEHICLE TAX|AMAZON PRIME", "months": 12 },
  { "pattern": "WATER RATES", "months": 3 }
]
```

- **Find candidates automatically:** `node src/cli.js periodic --tx export.csv` lists merchants charged about once a year (330–400 days apart) or once a quarter, plus single payments that look like yearly bills. Each comes with a ready-made rule.
- **The original payment stays in the ledger,** marked "spread over 12 months", and stops counting itself. Monthly allocation rows carry the share into budgets, the forecast, cash flow and the monthly charts.
- **Fraud watch ignores amortised payments** as "first-time" or "large", because you've told it they're expected.

Use **yearly pots** (`annualPots`) instead when the spending is lumpy but *discretionary* (clothes, flights). Use **amortise** when it's a fixed bill you'll pay regardless.
