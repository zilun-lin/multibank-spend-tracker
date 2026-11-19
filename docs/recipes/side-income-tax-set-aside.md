# How much of my side income or freelance money can I actually spend after tax?

**Short answer:** any income that isn't taxed at source needs a slice set aside: freelance or sole-trader invoices, marketplace payouts, tutoring, rental income, or income taxed in two countries. Work it out as `(income − allowable expenses) × your effective marginal rate`, then budget from what's left. multibank-spend-tracker does this automatically:

```json
"tax": {
  "yearStart": "04-06",
  "setAside": [
    { "name": "Freelance (self-employed)", "categories": ["Side income"],
      "expenseCategories": ["Business costs"], "rate": 0.28 }
  ]
}
```

- The dashboard shows **spendable income**: what came in, minus what was set aside for tax. The "money in vs out" line, and the day your savings go negative, use the spendable figure.
- `node src/cli.js explain` adds a line like: "4,522 gross, 196 set aside for tax, 4,326 actually spendable. Tax pot owed so far this tax year: 986."
- `taxReserve()` gives year-to-date figures from your tax-year start (06 April in the UK, 01 January in most of Europe). That's the amount to keep in a separate pot for your tax bill.

**Choosing `rate`.** Use your own effective marginal rate on that income: income tax plus any social contributions, for example in the UK income tax plus Class 4 National Insurance for the self-employed. If the income is also taxed in another country with credit relief, the combined effective rate is roughly the higher of the two rates. Rates and allowances change, so check your tax authority's current figures. This is arithmetic, not tax advice.

Works the same for any country: set `yearStart`, the rate, and which categories count as income and as allowable expenses.
