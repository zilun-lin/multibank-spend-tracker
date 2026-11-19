# How do I connect Revolut or other EU banks to Google Sheets for free?

**Short answer:** register your own application with **Enable Banking** and use its free *restricted* production mode, which covers your own accounts only. Then run the included **Google Apps Script** (`connectors/apps-script/bank_sync.gs`). It signs the JWT, pulls booked transactions daily, de-duplicates them, converts the currency and writes them to your Sheet. There's no server and no cost.

Revolut has no personal-account API (its API is for Business accounts), so a PSD2 aggregator is the route. Enable Banking reaches 2,500+ EEA banks.

## Steps
1. Create an Enable Banking account and an application. Generate a key pair and keep the `.pem` file private.
2. Link each bank once: `python connectors/enable-banking/link.py --app-id … --key private.pem --redirect https://example.com/cb --country PT --bank Revolut`. Approve in your bank, then paste back the redirect URL. It prints the account uids.
3. In your Sheet, open Extensions → Apps Script and paste `bank_sync.gs`. In Script Properties set `EB_APP_ID`, `EB_PRIVATE_KEY` and `EB_ACCOUNTS` (the JSON printed in step 2).
4. Run `setup`. It does a first sync of 89 days, then runs daily at about 06:00, re-reading 14 days to catch late bookings.
5. Consents last about 90–180 days. The `Sync status` tab and an email warn you 21 days before one expires.

Caveat: Enable Banking changed its commercial pricing in 2026, and the free mode could be narrowed in future.
