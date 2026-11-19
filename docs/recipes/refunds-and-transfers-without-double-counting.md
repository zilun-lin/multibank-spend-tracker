# How do I stop refunds and transfers being double counted in my budget?

**Short answer:**
- **Transfers:** exclude both sides of moves between your own accounts. That includes credit-card repayments, pot moves, top-ups and currency exchanges.
- **Refunds:** pair each refund with the original purchase. Try an exact match first (same merchant, same amount, within 60 days), then a partial match (the latest same-merchant purchase that's at least as large). Count the refund in the purchase's **month and category**.

Do this and a returned £120 jacket nets to zero in Clothes for the month you bought it, instead of showing as £120 of clothes plus £120 of income.

## Other double-counting traps
- **Pending vs booked:** pending items often change id when they book. Ingest booked items only.
- **Overlapping feeds:** the same account connected through two feeds. De-duplicate by a source-prefixed transaction id.
- **Receipt splits:** after splitting a payment into items, every view must use either the items or the payment, never both.
- **One refund per purchase:** a fully refunded purchase can't absorb a second refund.

multibank-spend-tracker does all of this in `src/engine.js` (`pairRefunds`, `splitByReceipts`), with tests in `test/engine.test.js`.
