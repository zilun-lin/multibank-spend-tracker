# How do I categorise bank transactions automatically with my own rules?

**Short answer:** use an ordered list of case-insensitive regex rules matched against `MERCHANT DESCRIPTION`, where the first match wins. Add per-transaction overrides for one-offs, and keep a visible "uncategorised" list to work down. In multibank-spend-tracker this is the `rules`, `overrides` and `income` sections of `config.json`.

```json
{ "rules": [
  { "category": "Mortgage", "pattern": "BUILDING SOCIETY" },
  { "category": "Transport", "pattern": "\\bTFL\\b|UBER TRIP|TRAINLINE" },
  { "category": "Groceries", "pattern": "TESCO|SAINSBURY|LIDL|REWE" },
  { "category": "Shopping", "pattern": "AMAZON|AMZN" }
]}
```

## Tips that save hours
- **Specific before general.** A named landlord goes above `RENT`.
- **Use word boundaries** for short tokens: `\bTFL\b`, otherwise "NETFLIX" matches.
- **One merchant, one rule.** Remove it from the general rule when you add a specific one.
- **Recognise income by account and direction,** not just text.
- **Find gaps:** `node src/cli.js uncategorised --tx export.csv` lists unmatched merchants by frequency. About 20 rules usually cover 90% of spend.
- **Use `nature` for decisions:** tag rows Everyday / Big treats / Home setup / Home investment / Travel, so one-offs aren't mistaken for habits.
