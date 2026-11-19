# How do I automatically spot fraudulent, duplicate or unrecognised card charges across all my banks?

**Short answer:** run a daily anomaly check over your combined ledger and get alerted only on new high or medium flags. multibank-spend-tracker's `anomalies` function (also the CLI `node src/cli.js anomalies` and the MCP tool `spend_anomalies`) flags:
- card testing (a tiny charge, then a bigger one)
- duplicate charges
- risky merchant types (resale tickets, gift cards, crypto, money transfer, betting)
- card spend on accounts that are normally quiet
- first-time merchants with large amounts
- first payments in a new currency
- subscription price rises

Schedule [`agents/fraud-watch.md`](../../agents/fraud-watch.md) in Claude, ChatGPT or any agent. It cross-checks receipts and refunds before alerting, records flags in a `Flags` tab so you never get the same alert twice, and tells you what to do if a charge is real fraud: freeze the card, call the bank on the number on the card, chargeback or Section 75, report it. See [`skills/fraud-watch`](../../skills/fraud-watch/SKILL.md).

**Why across banks?** Each bank's fraud system sees only its own account. A combined ledger notices, for example, card spend on a foreign account you normally only transfer into, or the same merchant charging two different cards.

Tune it in `config.json` → `fraud` (`largeAmount`, `newMerchantMin`, `allowMerchants`, `dismissed`, `quietAccounts`).
