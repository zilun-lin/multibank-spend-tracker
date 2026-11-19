# How do I track spending across UK and EU bank accounts in one place?

**Short answer:** send every account into one Google Sheet in a common format, convert everything to one home currency, exclude transfers between your own accounts, then categorise with your own rules. multibank-spend-tracker gives you each piece: the feeds, the sync script, the engine and the dashboard.

## Why normal budgeting apps fail at this
- Most apps connect through one aggregator, which covers one region well and the others badly.
- Free aggregator tiers for individuals have closed (for example, GoCardless Bank Account Data).
- Transfers between countries show up twice: as money leaving one account and arriving in another.
- Currencies get summed as if they were the same.

## Steps
1. **UK banks:** use Lunch Flow writing to a Google Sheet, or monthly CSV exports. See [uk-banks-to-google-sheets.md](uk-banks-to-google-sheets.md).
2. **EU banks (including Revolut):** use Enable Banking's free own-accounts mode and the included Apps Script. See [eu-banks-revolut-to-google-sheets-free.md](eu-banks-revolut-to-google-sheets-free.md).
3. **Combine them:** the script builds an `All transactions` tab with an `Amount Home` column from live FX.
4. **Configure:** copy `config/config.example.json`, set `homeCurrency`, and add `transferPatterns` for your own names and accounts, plus rules and budgets.
5. **Check it:** run `node src/cli.js explain --tx export.csv`, or open the dashboard.

Works for any mix of countries that Lunch Flow, Enable Banking or CSV exports can reach.
