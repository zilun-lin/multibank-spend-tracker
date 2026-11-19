const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../src/engine');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/config.example.json'), 'utf8'));
const tx = E.normaliseRows(E.parseCSV(fs.readFileSync(path.join(__dirname, '../examples/sample-transactions.csv'), 'utf8')), config);
const receipts = E.parseCSV(fs.readFileSync(path.join(__dirname, '../examples/sample-receipt-items.csv'), 'utf8'));
const ledger = E.enrich(tx, receipts, config);
const asOf = '2026-11-19';

test('multi-currency rows are converted to home currency', () => {
  const eur = tx.find(t => t.currency === 'EUR' && t.amount < 0);
  assert.ok(Math.abs(eur.amountHome - eur.amount * 0.85) < 0.01);
});

test('transfers and salary are not counted as spending', () => {
  assert.ok(ledger.filter(r => /TO SAVINGS|JANE DOE/.test(r.merchant)).every(r => r.kind === 'transfer' && !r.counted));
  assert.ok(ledger.filter(r => r.merchant === 'ACME PAYROLL').every(r => r.kind === 'income' && !r.counted));
});

test('a full refund nets to zero in the purchase month', () => {
  const zara = ledger.filter(r => r.merchant === 'ZARA UK');
  assert.strictEqual(zara.length, 2);
  assert.ok(Math.abs(zara.reduce((s, r) => s + r.spend, 0)) < 0.01);
  assert.ok(zara.every(r => r.month === '2026-11' && r.category === 'Clothes & personal care'));
});

test('a partial refund is netted, not double counted, and takes the biggest receipt item category', () => {
  const ref = ledger.find(r => r.merchant === 'AMAZON.CO.UK*ZZ99' && r.amountHome > 0);
  assert.strictEqual(ref.refund.full, false);
  assert.strictEqual(ref.category, 'Home & DIY');
});

test('receipt items split a payment and sum to the bank amount', () => {
  const items = ledger.filter(r => r.parent && r.merchant === 'AMAZON.CO.UK*ZZ99');
  assert.strictEqual(items.length, 3);
  assert.ok(Math.abs(items.reduce((s, r) => s + r.spend, 0) - 96.47) < 0.02);
  assert.strictEqual(items.find(r => r.item === 'Cordless drill').nature, 'Home investment');
});

test('recurring detection finds subscriptions but not a frequently visited cafe', () => {
  const rec = E.recurring(ledger, config).map(r => r.merchant);
  assert.ok(rec.some(m => m.includes('NETFLIX')));
  assert.ok(!rec.some(m => m.includes('CAFE') || m.includes('BAKERY')));
});

test('annual pots accrue daily instead of a monthly cap', () => {
  const b = E.budgetStatus(ledger, config, asOf).find(x => x.category === 'Travel & trips');
  assert.strictEqual(b.type, 'annual');
  assert.ok(b.accrued > 2500 && b.accrued < 3000);
});

test('forecast band brackets the projection and is above month-to-date', () => {
  const f = E.forecast(ledger, config, asOf);
  assert.ok(f.low <= f.projected && f.projected <= f.high);
  assert.ok(f.projected >= f.mtd);
});

test('summary and explanation are produced', () => {
  const s = E.summarise(ledger, config, asOf);
  assert.ok(s.uncategorised >= 1);
  const txt = E.explain(s);
  assert.match(txt, /monthly budget/);
});

test('purchase check: small grocery shop fits, big clothes buy waits', () => {
  const g = E.checkPurchase(ledger, config, { amount: 30, category: 'Groceries', date: asOf });
  assert.ok(g.numbers.allowanceLeftAfter >= 0);
  const c = E.checkPurchase(ledger, config, { amount: 900, merchant: 'ARKET', date: asOf });
  assert.strictEqual(c.numbers.category, 'Clothes & personal care');
  assert.ok(['wait', 'no'].includes(c.verdict));
  assert.ok(c.reasons.some(r => /48h/.test(r)));
});

test('MCP server lists tools and answers a call', async () => {
  const { spawn } = require('child_process');
  const p = spawn(process.execPath, [path.join(__dirname, '../mcp/server.js')], { env: Object.assign({}, process.env, { SPEND_TX: path.join(__dirname, '../examples/sample-transactions.csv') }) });
  let out = '';
  p.stdout.on('data', d => out += d);
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'spend_check_purchase', arguments: { amount: 40, category: 'Groceries' } } },
  ];
  p.stdin.write(msgs.map(m => JSON.stringify(m)).join('\n') + '\n');
  await new Promise(r => setTimeout(r, 700)); p.kill();
  const res = out.trim().split('\n').map(l => JSON.parse(l));
  assert.ok(res.find(r => r.id === 2).result.tools.length >= 5);
  assert.match(res.find(r => r.id === 3).result.content[0].text, /verdict/);
});

test('fraud watch flags card testing, duplicates, risky merchants and price creep', () => {
  const f = E.anomalies(ledger, config, asOf);
  const by = m => f.find(x => x.merchant === m);
  assert.ok(by('SHOPXYZ ONLINE').signals.includes('cardTesting'));
  assert.strictEqual(by('SHOPXYZ ONLINE').severity, 'high');
  assert.ok(by('PIZZA PLACE').signals.includes('duplicate'));
  assert.ok(by('VIAGOGO').signals.includes('risky'));
  assert.ok(by('NETFLIX.COM').signals.includes('priceCreep'));
  assert.ok(!f.some(x => /\bTFL\b/.test(x.merchant)), 'transit should not be flagged');
  const dismissed = E.anomalies(ledger, Object.assign({}, config, { fraud: { dismissed: [by('VIAGOGO').id] } }), asOf);
  assert.ok(!dismissed.some(x => x.merchant === 'VIAGOGO'));
});

test('tax set-aside: side income minus business costs, reserved at the user rate', () => {
  const t = E.taxReserve(ledger, config, asOf);
  assert.strictEqual(t.yearStart, '2026-04-06');
  const e = t.ytd[0];
  assert.ok(e.gross > 0 && e.expenses > 0);
  assert.ok(Math.abs(e.reserve - (e.gross - e.expenses) * 0.28) < 0.05);
  const cf = E.cashflow(ledger, config, asOf);
  assert.ok(cf.taxSetAside > 0 && Math.abs(cf.grossIncome - cf.taxSetAside - cf.income) < 0.02);
});

test('yearly charges are spread across 12 months instead of hitting one month', () => {
  const rows = ledger.filter(r => r.merchant === 'GREENFIELD ESTATES' );
  const alloc = rows.filter(r => r.alloc);
  assert.strictEqual(alloc.length, 12);
  assert.ok(Math.abs(alloc.reduce((s, r) => s + r.spend, 0) - 360) < 0.05);
  assert.ok(rows.find(r => !r.alloc).counted === false, 'original payment must not also count');
  const det = E.detectPeriodic(ledger, config);
  assert.ok(det.some(d => d.merchant.startsWith('ANNUAL HOME INSUR') && d.months === 12));
});

test('an explicit bill period from an email beats rules and spreads over its own months', () => {
  const tx2 = tx.concat([{ id: 'X-1', date: '2026-10-05', account: 'UK Current', amount: -480, currency: 'GBP', merchant: 'TO RIVERSIDE MANAGEMENT LIMITED', description: '', amountHome: -480, source: 't' }]);
  const det = E.detectPeriodic(E.enrich(tx2, [], config), config);
  assert.ok(det.some(d => d.merchant.includes('RIVERSIDE') && d.needsEvidence));
  const L2 = E.enrich(tx2, [], config, [{ 'Transaction ID': 'X-1', 'Period start': '2026-07-01', 'Period end': '2027-06-30', Source: 'email' }]);
  const alloc = L2.filter(r => r.parent === 'X-1' && r.alloc);
  assert.strictEqual(alloc.length, 12);
  assert.strictEqual(alloc.map(r => r.month).sort()[0], '2026-07');
  assert.strictEqual(L2.find(r => r.id === 'X-1').amortised.source, 'email');
});
