#!/usr/bin/env node
/*
 * Build a single self-contained dashboard HTML file with the engine, your
 * config and (optionally) your data embedded. This is what an agent publishes
 * as an artifact / canvas / hosted page after each scheduled sync.
 *
 *   node src/build.js --tx tx.csv [--receipts items.csv] [--config config.json] [--out dist/dashboard.html] [--no-data]
 *
 * --no-data embeds only engine + config; the page then loads config.dataUrl
 * (a Google Sheet published as CSV) at view time, so it never goes stale.
 */
const fs = require('fs');
const path = require('path');
const E = require('./engine');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const root = path.join(__dirname, '..');
const cfgPath = opt('config') || (fs.existsSync(path.join(root, 'config/config.json')) ? path.join(root, 'config/config.json') : path.join(root, 'config/config.example.json'));
const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const out = opt('out') || path.join(root, 'dist/dashboard.html');
let payload = null;
if (!args.includes('--no-data')) {
  if (!opt('tx')) { console.error('Need --tx, or pass --no-data with config.dataUrl set.'); process.exit(1); }
  payload = { config, transactions: E.parseCSV(fs.readFileSync(opt('tx'), 'utf8')), receipts: opt('receipts') ? E.parseCSV(fs.readFileSync(opt('receipts'), 'utf8')) : [] };
}
let html = fs.readFileSync(path.join(root, 'dashboard/index.html'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const inline = `<script>${safe(engine)}</script>\n<script>${payload ? 'window.__SPEND__=' + safe(JSON.stringify(payload)) + ';' : ''}window.__CONFIG__=${safe(JSON.stringify(config))};</script>`;
html = html.replace('<script src="../src/engine.js"></script>', () => inline); // function form: no $-pattern expansion
html = html.replace("try { state.config = await (await fetch('config.json')).json(); }", "if (window.__CONFIG__) state.config = window.__CONFIG__; else try { state.config = await (await fetch('config.json')).json(); }");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
