---
name: fraud-watch
description: Use when the user asks whether a charge looks fraudulent, wants to check for duplicate or unrecognised transactions, card-testing, subscription price rises, or wants a daily fraud/anomaly alert across their bank accounts; also what to do next if a charge is fraudulent.
---

# Fraud watch

Spot charges worth a human look before the dispute window closes, across every account the user has. You surface and explain the charge. **The user decides and acts.** You never contact the bank, freeze cards or dispute anything yourself.

## Run the check

```bash
node src/cli.js anomalies --tx tx.csv --receipts items.csv --config config.json   # or MCP tool spend_anomalies
```

Each flag has a `severity` (high/medium/low), `signals` and plain `reasons`:

| Signal | What it catches |
|---|---|
| `cardTesting` | A tiny charge (≤ about 2) followed within days by a bigger one at the same merchant. This is the classic stolen-card pattern. |
| `duplicate` | The same merchant and amount on the same or next day: a double charge, or a terminal that took payment twice |
| `risky` | Resale tickets, gift cards, crypto, money transfer or betting: merchant types used in scams and hard to reverse |
| `quietAccount` | Card spend on an account that normally only has transfers or direct debits |
| `newMerchantLarge` | The first payment to a merchant in a year, above a threshold |
| `large` | A single payment above the user's threshold that isn't a known bill |
| `unusualCurrency` | The first payment in a currency on that account |
| `priceCreep` | A subscription charging noticeably more than usual |

## How to present it

1. Lead with **high** flags. Give each one in a line: date, account, merchant, amount, and the reason in plain words.
2. Check before you alarm the user: look for a matching receipt in `Receipt items` or the mailbox, a refund that followed, or a known merchant alias (payment processors often show odd names such as `SQ *`, `SUMUP *`, `PAYPAL *`, or a parent company).
3. Ask: "Do you recognise these?" Offer to add recognised ones to `config.fraud.dismissed` (by id) or `allowMerchants`, so they don't come back.
4. Mention price rises once a month, not daily.

## If the user says a charge is fraud

Tell them the steps. Don't do them yourself:
1. **Freeze or lock the card** in the bank's app now. Most UK and EU apps can do this instantly.
2. **Report it to the bank** using the number on the back of the card or the in-app chat. Never use a number or link from an email or text message.
3. **Ask for a chargeback.** In the UK, card purchases from £100 to £30,000 on a credit card also have Section 75 protection. Disputes have time limits (often around 120 days), so don't wait.
4. **If they were tricked into paying** (authorised push payment fraud), tell the bank. UK banks must consider reimbursement in many cases.
5. **Report it to the national fraud service:** Action Fraud in England, Wales and Northern Ireland, Police Scotland in Scotland, or the local police elsewhere.
6. **Afterwards,** change passwords for the affected merchant or account, and watch for follow-up "bank" calls. Banks never ask you to move money to a "safe account".

Check current local rules if the user is outside the UK. This is general guidance, not legal advice.

## Scheduled use

Run daily after the bank sync (see `agents/fraud-watch.md`). Alert only on **new** high or medium flags, so the user never gets the same alert twice. Keep a `Flags` tab with columns: id, first seen, severity, status (new / recognised / reported).

## Never

Contact banks or merchants for the user, enter card details, click links in suspicious emails, or tell the user a charge is definitely fraud. You can say it *looks like* a pattern and explain why.
