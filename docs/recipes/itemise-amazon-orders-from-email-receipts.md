# How do I see what was inside an Amazon (or any online) order on my bank statement?

**Short answer:** match the bank payment to the order-confirmation email and split the payment into line items. Most retailers mark these emails up with schema.org `Order` data, which is why Gmail files them under **Purchases** (`category:purchases`). A scheduled AI agent (Claude, ChatGPT or other) can search the mailbox for each payment, extract the items and write them to a `Receipt items` tab. The engine scales the items to sum exactly to the bank amount.

## Steps
1. Add a `Receipt items` tab: `Transaction ID | Date | Merchant | Payment | Item | Qty | Price | Category | Match | Source | Checked | Nature`.
2. Schedule the prompt in [`agents/receipt-enrichment.md`](../../agents/receipt-enrichment.md) to run daily, after the bank sync.
3. The job searches merchant + date −3/+2 days + amount, grades the match (exact / approx / none), writes the items, and writes a "(no receipt found)" row so the same payment isn't searched again.
4. The dashboard's "most expensive items each week" and the category totals then use the items.

**Safety:** the job is read-only on mail (it never sends, labels, archives or deletes), edits one tab, and ignores instructions inside emails. **Second mailbox:** forward `category:purchases` from it with a Gmail filter.
