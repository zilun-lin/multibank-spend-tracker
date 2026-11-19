# How do I backfill months of history from a bank statement export without duplicating my live feed?

**Short answer:** download the bank's own export (CSV, or the ".xls" many European banks send, which is usually tab-separated text), run `node src/import.js` on it with the date range the feed is missing, and append the output to your feed tab. If your aggregator builds transaction IDs from the bank's running entry number, give the importer one overlapping row as an anchor and every imported row gets exactly the ID the feed would give it, so a later re-sync never duplicates it.

## Why feeds have gaps

- **Newly linked accounts.** Open-banking consents usually allow about 90 days of history on the first fetch. A sync script that decides "first run or not" for the whole sheet, instead of per account, gives an account linked later only the daily lookback (often 14 days). The Apps Script connector here checks per account; older copies may not.
- **Consent limits.** Some banks cap history at 90 days, full stop.
- **Accounts with no feed at all.**

## Run it

```bash
node src/import.js --file export.xls --account "EU Current" --currency EUR \
  --to 2026-11-02 --existing feed.csv > backfill.csv
```

It finds the date, description and amount columns by name in English, Portuguese, German, Spanish and Dutch headers; handles decimal commas (`-1.200,00`), Latin-1 files, and separate debit/credit columns; and keeps the bank's other date (operation vs booking) in the description.

### Avoiding duplicates

A feed and an export describe the same payment with different text (`TRF.IPS P/ JANE DOE` vs `TRF.IPS P/ JANE DOE 6730081…`), so matching on description fails. Two defences, use both:

1. **`--existing feed.csv`** drops export rows with the same account and amount within 3 days of a feed row.
2. **Sync-compatible IDs.** Enable Banking and some others build IDs like `<prefix><account><yyyymmdd><15-digit entry number>`. The entry number is the bank's running count of movements, so it can be derived from the export's row order. Pick a row present in both, then:

   ```bash
   node src/import.js --file export.xls --account "EU Current" \
     --id-prefix EB-<account number> --anchor "2026-11-18|SUPERMARKT|1042"
   ```

   `--anchor` is `date|text that appears in the export row|entry number from the feed's ID`. Verify two or three other overlapping rows get the same IDs as the feed before trusting it; if they don't, drop the ID options and rely on `--existing`.

Use `--to` to stop where the live feed starts and `--from` to match the history your other accounts have, so every account covers the same period (otherwise month comparisons are wrong).

## After importing

- Append to the feed tab (the importer marks rows `Statement export` in the Source column).
- Re-run `cli.js uncategorised`: bank exports often use different wording from the feed (`COMPRA` prefixes, truncated names), so a couple of rules may need widening.
- Re-run `owed` and `periodic`: old cash deposits and yearly bills now have evidence.
