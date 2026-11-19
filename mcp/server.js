#!/usr/bin/env node
/*
 * Minimal MCP server (stdio, JSON-RPC 2.0, no dependencies) exposing the
 * spend-tracker engine as tools any MCP client can call: Claude Desktop,
 * Claude Code, ChatGPT desktop/connectors that support local MCP, Cursor, etc.
 *
 * Config (Claude Desktop example):
 *   "mcpServers": { "spend-tracker": {
 *       "command": "node",
 *       "args": ["/path/to/multibank-spend-tracker/mcp/server.js"],
 *       "env": { "SPEND_TX": "/path/to/transactions.csv",
 *                "SPEND_RECEIPTS": "/path/to/receipt-items.csv",
 *                "SPEND_CONFIG": "/path/to/config.json" } } }
 *
 * Every tool also accepts tx / receipts / config paths as arguments.
 * Read-only: nothing here can move money or write files.
 */
const fs = require('fs');
const path = require('path');
const E = require('../src/engine');

const pathArgs = {
  tx: { type: 'string', description: 'Path to transactions CSV (defaults to $SPEND_TX)' },
  receipts: { type: 'string', description: 'Path to receipt items CSV (defaults to $SPEND_RECEIPTS)' },
  config: { type: 'string', description: 'Path to config.json (defaults to $SPEND_CONFIG or the example config)' },
  periods: { type: 'string', description: 'Path to bill periods CSV: Transaction ID, Period start, Period end, Source (defaults to $SPEND_PERIODS)' },
  date: { type: 'string', description: 'As-of date YYYY-MM-DD (defaults to the latest transaction date)' },
};
const TOOLS = [
  { name: 'spend_explain', description: 'Plain-language answer to "why am I over or under budget this month?": spend so far, projected month end with range, categories over budget, drivers vs last month, kind of spending, largest items, when savings go negative.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_summary', description: 'Structured JSON month summary: budgets (monthly and yearly pots), forecast, cash flow, spend by category and nature, drivers, top items, uncategorised count.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_check_purchase', description: 'Personal-CFO check: can I afford this purchase? Returns verdict yes / yes-with-tradeoff / wait / no with reasons, policy questions and numbers (allowance left, yearly pot accrued, month-end projection and savings after).', inputSchema: { type: 'object', properties: Object.assign({ amount: { type: 'number' }, category: { type: 'string' }, merchant: { type: 'string' }, description: { type: 'string' } }, pathArgs), required: ['amount'] } },
  { name: 'spend_anomalies', description: 'Fraud and anomaly watch over the last 60 days: first-time merchants with large charges, duplicate charges, card-testing patterns (tiny then bigger charge), spend on normally quiet accounts, risky merchant types (resale tickets, gift cards, crypto, money transfer, betting), unusual currency, subscription price rises. Returns flags with severity and reasons.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_periodic', description: 'Yearly or quarterly charges (ground rent, insurance, annual subscriptions) that should be spread across months, with evidence and a ready-made amortise rule. Payments to a payee seen only once need confirmation from an email/invoice period or the user.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_tax', description: 'Tax set-aside on income not taxed at source (side income, freelance/sole trader, rental): gross, allowable expenses, taxable, reserve and spendable, year to date and last 31 days.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_recurring', description: 'Detected recurring charges (subscriptions, bills) with typical amount and day of month.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_uncategorised', description: 'Merchants no categorisation rule matched, most frequent first, to help write new rules.', inputSchema: { type: 'object', properties: pathArgs } },
  { name: 'spend_ledger', description: 'Enriched ledger rows (category, nature, counted, refund links, why) for a month, as JSON. Use month YYYY-MM.', inputSchema: { type: 'object', properties: Object.assign({ month: { type: 'string' } }, pathArgs) } },
];

function load(a) {
  const txPath = a.tx || process.env.SPEND_TX;
  if (!txPath) throw new Error('No transactions file: pass tx or set SPEND_TX.');
  const cfgPath = a.config || process.env.SPEND_CONFIG || path.join(__dirname, '../config/config.example.json');
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tx = E.normaliseRows(E.parseCSV(fs.readFileSync(txPath, 'utf8')), config);
  const rp = a.receipts || process.env.SPEND_RECEIPTS;
  const receipts = rp && fs.existsSync(rp) ? E.parseCSV(fs.readFileSync(rp, 'utf8')) : [];
  const pp = a.periods || process.env.SPEND_PERIODS;
  const periods = pp && fs.existsSync(pp) ? E.parseCSV(fs.readFileSync(pp, 'utf8')) : [];
  const asOf = a.date || tx.map(t => t.date).sort().pop();
  return { config, ledger: E.enrich(tx, receipts, config, periods), asOf };
}

function call(name, a) {
  const { config, ledger, asOf } = load(a || {});
  switch (name) {
    case 'spend_explain': return E.explain(E.summarise(ledger, config, asOf));
    case 'spend_summary': return E.summarise(ledger, config, asOf);
    case 'spend_check_purchase': return E.checkPurchase(ledger, config, { amount: a.amount, category: a.category, merchant: a.merchant, description: a.description, date: asOf });
    case 'spend_anomalies': return E.anomalies(ledger, config, asOf);
    case 'spend_periodic': return E.detectPeriodic(ledger, config);
    case 'spend_tax': return E.taxReserve(ledger, config, asOf);
    case 'spend_recurring': return E.recurring(ledger, config);
    case 'spend_uncategorised': {
      const n = {};
      ledger.filter(r => r.category === 'Uncategorised').forEach(r => { const k = E.merchantKey(r.merchant || r.description); n[k] = n[k] || { merchant: k, count: 0, total: 0 }; n[k].count++; n[k].total = Math.round((n[k].total + r.spend) * 100) / 100; });
      return Object.values(n).sort((x, y) => y.count - x.count);
    }
    case 'spend_ledger': { const m = a.month || E.monthOf(asOf); return ledger.filter(r => r.month === m); }
    default: throw new Error('Unknown tool ' + name);
  }
}

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
let buf = '';
process.stdin.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    if (req.id === undefined) continue; // notification
    try {
      if (req.method === 'initialize') send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: (req.params && req.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'multibank-spend-tracker', version: '0.3.0' } } });
      else if (req.method === 'tools/list') send({ jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } });
      else if (req.method === 'tools/call') {
        const out = call(req.params.name, req.params.arguments);
        send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] } });
      } else if (req.method === 'ping') send({ jsonrpc: '2.0', id: req.id, result: {} });
      else send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } });
    } catch (e) {
      if (req.method === 'tools/call') send({ jsonrpc: '2.0', id: req.id, result: { isError: true, content: [{ type: 'text', text: String(e.message || e) }] } });
      else send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: String(e.message || e) } });
    }
  }
});
