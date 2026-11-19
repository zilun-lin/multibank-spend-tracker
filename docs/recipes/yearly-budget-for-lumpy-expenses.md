# How do I budget for lumpy expenses like clothes, flights or gifts?

**Short answer:** give lumpy categories a **yearly allowance that accrues daily**, not a monthly cap. Judge spending against what has built up so far: `accrued = yearly amount × days since start / 365`. If you start mid-year, set `start` to the day you began. It prorates automatically.

```json
"annualPots": {
  "Clothes & personal care": { "amount": 1200, "start": "2026-09-01" },
  "Travel & trips":          { "amount": 3000, "start": "2026-09-01" }
}
```

Why it works: a £300 coat in November wrecks a £100/month clothes budget, but it's fine against £1,200/year if you bought little else. The dashboard shows "spent X of Y built up". These categories are left out of the monthly pace and forecast, so one purchase doesn't make the whole month look like a crisis.

The personal-CFO check (`node src/cli.js check --amount 300 --category "Clothes & personal care"`) tells you how many days the pot needs to catch up.
