// Generates examples/sample-transactions.csv and examples/sample-receipt-items.csv.
// All merchants, people and amounts are invented.
const fs = require('fs');
const path = require('path');
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const rows = [['Transaction ID', 'Date', 'Account', 'Amount', 'Currency', 'Merchant', 'Description', 'Source']];
let n = 0; const id = p => `${p}-${String(++n).padStart(5, '0')}`;
const add = (d, acc, amt, cur, m, desc, src) => rows.push([id(src.slice(0, 2).toUpperCase()), d, acc, amt.toFixed(2), cur, m, desc || '', src]);
const start = new Date(Date.UTC(2026, 6, 1)), end = new Date(Date.UTC(2026, 10, 19));
for (let t = start; t <= end; t = new Date(t.getTime() + 86400000)) {
  const d = t.toISOString().slice(0, 10), day = t.getUTCDate(), wd = t.getUTCDay();
  if (day === 28) add(d, 'UK Current', 3800, 'GBP', 'ACME PAYROLL', 'Salary', 'Lunch Flow');
  if (day === 1) add(d, 'UK Current', -1450, 'GBP', 'NORTHERN BUILDING SOCIETY', 'Mortgage', 'Lunch Flow');
  if (day === 3) add(d, 'UK Current', -62.5, 'GBP', 'OCTOPUS ENERGY', 'DD', 'Lunch Flow');
  if (day === 5) add(d, 'UK Current', -28, 'GBP', 'COMMUNITY FIBRE', 'DD', 'Lunch Flow');
  if (day === 9 && d < '2026-11-01') add(d, 'UK Credit Card', -10.99, 'GBP', 'NETFLIX.COM', '', 'Lunch Flow');
  if (day === 12) add(d, 'EU Current', -9.99, 'EUR', 'SPOTIFY', '', 'Enable Banking');
  if (day === 20) add(d, 'UK Current', 650 + Math.round(rnd() * 500), 'GBP', 'STRIPE PAYOUT', 'Freelance invoice', 'Lunch Flow');
  if (day === 2) add(d, 'UK Credit Card', -20.99, 'GBP', 'ADOBE SYSTEMS', 'Creative Cloud', 'Lunch Flow');
  if (day === 15) add(d, 'UK Current', -400, 'GBP', 'TO SAVINGS', 'Standing order', 'Lunch Flow');
  if (wd === 6) add(d, 'UK Credit Card', -(45 + rnd() * 50), 'GBP', pick(['TESCO STORES', 'SAINSBURYS', 'LIDL GB']), '', 'Lunch Flow');
  if (rnd() < 0.5) add(d, 'UK Current', -(2.8 + rnd() * 6), 'GBP', 'TFL TRAVEL CH', '', 'Lunch Flow');
  if (rnd() < 0.35) add(d, 'Multi-currency', -(3 + rnd() * 30), 'GBP', pick(['PRET A MANGER', 'LOCAL CAFE', 'CORNER BAKERY', 'PIZZA PLACE']), '', 'Enable Banking');
  if (rnd() < 0.08) add(d, 'UK Credit Card', -(12 + rnd() * 80), 'GBP', 'AMAZON.CO.UK*AB12C', '', 'Lunch Flow');
  if (rnd() < 0.05) add(d, 'EU Current', -(20 + rnd() * 60), 'EUR', pick(['REWE', 'EDEKA']), '', 'Enable Banking');
  if (rnd() < 0.04) add(d, 'UK Credit Card', -(25 + rnd() * 120), 'GBP', pick(['IKEA LTD', 'B&Q', 'SCREWFIX']), '', 'Lunch Flow');
  if (rnd() < 0.02) add(d, 'Multi-currency', -(40 + rnd() * 200), 'GBP', pick(['UNIQLO', 'ARKET', 'COS STORES']), '', 'Enable Banking');
}
// Lumpy and edge cases
add('2026-09-25', 'UK Current', -360.00, 'GBP', 'GREENFIELD ESTATES', 'Ground rent 2026-27', 'Lunch Flow');      // yearly, spread
add('2025-11-03', 'UK Credit Card', -264.00, 'GBP', 'ANNUAL HOME INSURANCE CO', 'Renewal', 'Lunch Flow');
add('2026-11-02', 'UK Credit Card', -276.00, 'GBP', 'ANNUAL HOME INSURANCE CO', 'Renewal', 'Lunch Flow');
add('2026-09-14', 'UK Credit Card', -389.99, 'GBP', 'CURRYS', 'Washing machine', 'Lunch Flow');
add('2026-10-02', 'UK Credit Card', -142.0, 'GBP', 'RYANAIR', 'Flights', 'Lunch Flow');
add('2026-11-04', 'UK Credit Card', -120.0, 'GBP', 'ZARA UK', '', 'Lunch Flow');
add('2026-11-11', 'UK Credit Card', 120.0, 'GBP', 'ZARA UK', 'Refund', 'Lunch Flow');          // full refund
add('2026-11-06', 'UK Credit Card', -96.47, 'GBP', 'AMAZON.CO.UK*ZZ99', '', 'Lunch Flow');
add('2026-11-16', 'UK Credit Card', 24.99, 'GBP', 'AMAZON.CO.UK*ZZ99', 'Refund', 'Lunch Flow'); // partial refund
add('2026-11-10', 'UK Current', -350, 'GBP', 'TO JANE DOE', 'Transfer', 'Lunch Flow');         // own transfer
add('2026-11-13', 'UK Credit Card', -78.0, 'GBP', 'MYSTERY SHOP 42', '', 'Lunch Flow');         // uncategorised
add('2026-11-17', 'UK Credit Card', -1.00, 'GBP', 'SHOPXYZ ONLINE', '', 'Lunch Flow');           // card test
add('2026-11-17', 'UK Credit Card', -289.00, 'GBP', 'SHOPXYZ ONLINE', '', 'Lunch Flow');         // then a big one
add('2026-11-15', 'UK Credit Card', -64.00, 'GBP', 'PIZZA PLACE', 'dup', 'Lunch Flow');
add('2026-11-15', 'UK Credit Card', -64.00, 'GBP', 'PIZZA PLACE', 'dup', 'Lunch Flow');           // double charge
add('2026-11-12', 'EU Current', -145.00, 'EUR', 'VIAGOGO', 'Tickets', 'Enable Banking');           // risky merchant, quiet account
add('2026-11-09', 'UK Credit Card', -13.99, 'GBP', 'NETFLIX.COM', 'price up', 'Lunch Flow');      // price creep (replaces usual)
// Money owed to you: a parents' visit (15-19 Oct), wedding deposits, a loan repaid in cash
add('2026-10-06', 'Multi-currency', -186.0, 'GBP', 'BOOKING.COM', 'Hotel for parents visit', 'Enable Banking');   // booked before the window: ask
add('2026-10-17', 'UK Credit Card', -112.0, 'GBP', 'RIVERSIDE RESTAURANT', 'Family dinner', 'Lunch Flow');
add('2026-09-05', 'UK Current', -600.0, 'GBP', 'PHOTOGRAPHY STUDIO', 'Wedding deposit', 'Lunch Flow');           // tracker: paid by Me
add('2026-09-06', 'UK Current', -1500.0, 'GBP', 'COUNTRY MARQUEE HIRE', 'Wedding deposit', 'Lunch Flow');        // tracker: paid by someone else
add('2026-10-15', 'UK Current', -250.0, 'GBP', 'BLOOMS FLORIST', 'Wedding flowers deposit', 'Lunch Flow');      // not in tracker: ask
add('2026-09-14', 'EU Current', 2000.0, 'EUR', 'CASH DEPOSIT', 'Repayment', 'Enable Banking');
add('2026-09-16', 'EU Current', -2000.0, 'EUR', 'EXCHANGED TO GBP', '', 'Enable Banking');
add('2026-10-07', 'EU Current', 1500.0, 'EUR', 'CASH DEPOSIT', 'Repayment', 'Enable Banking');
add('2026-10-15', 'EU Current', -1500.0, 'EUR', 'EXCHANGED TO GBP', '', 'Enable Banking');
const out = rows.map(r => r.map(c => /[",]/.test(c) ? `"${c}"` : c).join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(__dirname, 'sample-transactions.csv'), out);

const amzId = rows.find(r => r[6] === '' && r[5] === 'AMAZON.CO.UK*ZZ99' && r[3] === '-96.47')[0];
const items = [['Transaction ID', 'Date', 'Merchant', 'Payment', 'Item', 'Qty', 'Price', 'Category', 'Nature', 'Source'],
  [amzId, '2026-11-06', 'Amazon', '96.47', 'Cordless drill', '1', '64.99', 'Home & DIY', 'Home investment', 'email receipt'],
  [amzId, '2026-11-06', 'Amazon', '96.47', 'Phone case', '1', '24.99', 'Tech', '', 'email receipt'],
  [amzId, '2026-11-06', 'Amazon', '96.47', 'Batteries AA x8', '1', '6.49', 'Shopping', '', 'email receipt']];
fs.writeFileSync(path.join(__dirname, 'sample-receipt-items.csv'), items.map(r => r.join(',')).join('\n') + '\n');
console.log(`wrote ${rows.length - 1} transactions, ${items.length - 1} receipt items`);
