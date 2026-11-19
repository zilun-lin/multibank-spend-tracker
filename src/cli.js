#!/usr/bin/env node
/*
 * Command line for humans and agents.
 *
 *   node src/cli.js explain   --tx tx.csv [--receipts items.csv] [--config config.json] [--date 2026-11-19]
 *   node src/cli.js summary   ...   -> JSON month summary (budgets, forecast, cashflow, drivers, top items)
 *   node src/cli.js ledger    ...   -> enriched ledger as CSV (category, nature, counted, refund links)
 *   node src/cli.js recurring ...   -> detected recurring charges as JSON
 *   node src/cli.js uncategorised ... -> merchants with no rule, most frequent first (to write new rules)
 *   node src/cli.js periodic ...   -> yearly/quarterly charges to spread (suggested amortise rules)
 *   node src/cli.js anomalies ...  -> fraud watch: possible fraud, duplicates, card testing, price creep (JSON)
 *   node src/cli.js owed ...       -> money owed to you: items, repayments (realised FX), outstanding per rule/loan
 *   node src/import.js --file export.xls --account X ...  -> backfill from a bank statement export (see src/import.js)
 *   node src/cli.js check --amount 180 [--category X | --merchant Y] ... -> can I buy this? (verdict + reasons)
 */
const fs = require('fs');
const path = require('path');
const E = require('./engine');

const args = process.argv.slice(2);
const cmd = args[0] || 'explain';
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };

const cfgPath = opt('config') || (fs.existsSync('config/config.json') ? 'config/config.json' : path.join(__dirname, '../config/config.example.json'));
const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const txPath = opt('tx');
if (!txPath) { console.error('Need --tx <transactions.csv>. See README.'); process.exit(1); }
const tx = E.normaliseRows(E.parseCSV(fs.readFileSync(txPath, 'utf8')), config);
if (opt('payers')) { config.owed = config.owed || {}; config.owed.payers = (config.owed.payers || []).concat(E.parseCSV(fs.readFileSync(opt('payers'), 'utf8')).map(r => ({ pattern: r.pattern || r.Pattern || r.Supplier, payer: r.payer || r.Payer || r['Paid by'] }))); }
const periods = opt('periods') ? E.parseCSV(fs.readFileSync(opt('periods'), 'utf8')) : [];
const receipts = opt('receipts') ? E.parseCSV(fs.readFileSync(opt('receipts'), 'utf8')) : [];
const asOf = opt('date') || (tx.length ? tx.map(t => t.date).sort().pop() : new Date().toISOString().slice(0, 10));
const ledger = E.enrich(tx, receipts, config, periods);

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

switch (cmd) {
  case 'summary': console.log(JSON.stringify(E.summarise(ledger, config, asOf), null, 2)); break;
  case 'explain': console.log(E.explain(E.summarise(ledger, config, asOf))); break;
  case 'recurring': console.log(JSON.stringify(E.recurring(ledger, config), null, 2)); break;
  case 'ledger': {
    const cols = ['id', 'date', 'effDate', 'account', 'merchant', 'description', 'item', 'amount', 'currency', 'amountHome', 'category', 'nature', 'counted', 'pot', 'why'];
    console.log(cols.join(','));
    ledger.forEach(r => console.log(cols.map(c => csvCell(r[c])).join(',')));
    break;
  }
  case 'uncategorised': {
    const n = {};
    ledger.filter(r => r.category === 'Uncategorised').forEach(r => { const k = E.merchantKey(r.merchant || r.description); n[k] = n[k] || { merchant: k, count: 0, total: 0 }; n[k].count++; n[k].total += r.spend; });
    console.log(JSON.stringify(Object.values(n).sort((a, b) => b.count - a.count), null, 2));
    break;
  }
  case 'periodic': console.log(JSON.stringify(E.detectPeriodic(ledger, config), null, 2)); break;
  case 'anomalies': console.log(JSON.stringify(E.anomalies(ledger, config, asOf), null, 2)); break;
  case 'owed': console.log(JSON.stringify(E.owedReport(ledger, config), null, 2)); break;
  case 'check': console.log(JSON.stringify(E.checkPurchase(ledger, config, { amount: opt('amount'), category: opt('category'), merchant: opt('merchant'), description: opt('description'), date: opt('date') }), null, 2)); break;
  default: console.error('Unknown command ' + cmd); process.exit(1);
}
