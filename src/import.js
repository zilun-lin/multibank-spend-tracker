#!/usr/bin/env node
/*
 * Backfill history from a bank's own statement export (CSV, TSV, or the
 * ".xls" files many European banks send that are really tab-separated text),
 * without creating duplicates of rows your live feed already has.
 *
 *   node src/import.js --file export.xls --account "DE Current" [--currency EUR]
 *        [--from 2026-08-21] [--to 2026-11-02] [--existing feed.csv]
 *        [--id-prefix EB-123456789] [--anchor "2026-11-18|SUPERMARKT|1042"]
 *        [--config config.json] > backfill.csv
 *
 * Output: the canonical columns (Account, Date, Amount, Currency, Merchant,
 * Description, Transaction ID, Amount <home>, Source) ready to append to the
 * feed tab.
 *
 * Duplicates. A live feed (Enable Banking, GoCardless, Plaid…) and a bank
 * export describe the same payments with different text, so matching on
 * description fails. Two defences:
 *   1. --id-prefix + --anchor: some aggregators build IDs from the account
 *      number, the booking date and the bank's running entry number. If yours
 *      does, give one row you can see in both (date|text in the export|entry
 *      number from its feed ID) and every export row gets the ID the feed would
 *      give it, so a later re-sync recognises it. Check the anchor against two
 *      or three overlapping rows before trusting it.
 *   2. --existing feed.csv: rows with the same account, amount and a booking
 *      date within 3 days of a feed row are dropped as already present.
 * Use --to to stop the backfill where the live feed's coverage begins.
 */
const fs = require('fs');
const path = require('path');
const E = require('./engine');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };

/** Decode as UTF-8, falling back to Latin-1 (common for bank exports). */
function decode(buf) {
  const utf = buf.toString('utf8');
  return utf.includes('�') ? buf.toString('latin1') : utf;
}

/** "1.234,56" or "1,234.56" or "-12,30" -> number. */
function parseAmount(s) {
  let t = String(s || '').trim().replace(/[€£$\s]/g, '');
  if (!t) return NaN;
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  return parseFloat(t);
}

/** dd/mm/yyyy, dd.mm.yyyy, yyyy-mm-dd -> yyyy-mm-dd */
function parseDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const HEADERS = {
  date: /^(booking date|data movimento|data mov|buchungstag|date|fecha|datum)/i,
  opDate: /^(value date|transaction date|data opera|data valor|wertstellung|valuta|fecha valor)/i,
  desc: /^(descri|description|verwendungszweck|concepto|details|payee|narrative|omschrijving)/i,
  amount: /^(amount|import|montante|betrag|valor|importe|bedrag)/i,
  debit: /^(debit|débito|soll|cargo|paid out)/i,
  credit: /^(credit|crédito|haben|abono|paid in)/i,
  currency: /^(currency|moeda|währung|divisa|moneda)/i,
};

function parseStatement(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const delim = (lines[0].match(/\t/g) || []).length ? '\t' : ((lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',');
  const head = lines[0].split(delim).map(h => h.replace(/^"|"$/g, '').trim());
  const col = {};
  head.forEach((h, i) => { for (const k of Object.keys(HEADERS)) if (col[k] == null && HEADERS[k].test(h)) { col[k] = i; break; } });
  if (col.date == null || col.desc == null || (col.amount == null && col.debit == null)) throw new Error('Could not find date / description / amount columns in: ' + head.join(' | '));
  return lines.slice(1).map((l, idx) => {
    const c = l.split(delim).map(x => x.replace(/^"|"$/g, ''));
    let amount = col.amount != null ? parseAmount(c[col.amount]) : (parseAmount(c[col.credit]) || 0) - (parseAmount(c[col.debit]) || 0);
    return { idx, date: parseDate(c[col.date]), opDate: col.opDate != null ? parseDate(c[col.opDate]) : '', desc: String(c[col.desc] || '').replace(/\s+/g, ' ').trim(), amount, currency: col.currency != null ? (c[col.currency] || '').trim() : '' };
  }).filter(r => r.date && !isNaN(r.amount));
}

function main() {
  const file = opt('file'); const account = opt('account');
  if (!file || !account) { console.error('Need --file <export> and --account <name>. See the header of this file.'); process.exit(1); }
  const root = path.join(__dirname, '..');
  const cfgPath = opt('config') || (fs.existsSync(path.join(root, 'config/config.json')) ? path.join(root, 'config/config.json') : path.join(root, 'config/config.example.json'));
  const cfg = E.withDefaults(JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
  let rows = parseStatement(decode(fs.readFileSync(file)));
  const currency = (opt('currency') || rows.find(r => r.currency)?.currency || cfg.homeCurrency).toUpperCase();

  // Sync-compatible IDs from a running entry number.
  const prefix = opt('id-prefix'); const anchor = opt('anchor');
  let seqOf = null;
  if (prefix && anchor) {
    const [aDate, aText, aSeq] = anchor.split('|');
    const ai = rows.findIndex(r => r.date === aDate && r.desc.toUpperCase().includes(aText.toUpperCase()));
    if (ai < 0) { console.error('Anchor row not found in export: ' + anchor); process.exit(1); }
    const ascending = rows.length < 2 || rows[0].date <= rows[rows.length - 1].date;
    seqOf = i => +aSeq + (ascending ? i - ai : ai - i);
  }

  const existing = opt('existing') ? E.normaliseRows(E.parseCSV(fs.readFileSync(opt('existing'), 'utf8')), cfg).filter(t => t.account === account) : [];
  const near = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000) <= 3;
  const from = opt('from'), to = opt('to');

  const out = [];
  rows.forEach((r, i) => {
    if (from && r.date < from) return; if (to && r.date > to) return;
    const id = seqOf ? `${prefix}${r.date.replace(/-/g, '')}${String(seqOf(i)).padStart(15, '0')}` : `import-${account.replace(/\W+/g, '')}-${r.date}-${i}`;
    if (existing.some(t => t.id === id || (Math.abs(t.amount - r.amount) < 0.005 && near(t.date, r.date)))) return;
    const home = currency === cfg.homeCurrency ? r.amount : (cfg.fx[currency] ? r.amount * cfg.fx[currency] : r.amount);
    const desc = r.desc + (r.opDate && r.opDate !== r.date ? ` (op. ${r.opDate})` : '');
    out.push([account, r.date, r.amount, currency, r.desc, desc, id, Math.round(home * 100) / 100, 'Statement export']);
  });
  const cell = v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  console.log(['Account', 'Date', 'Amount', 'Currency', 'Merchant', 'Description', 'Transaction ID', `Amount ${cfg.homeCurrency}`, 'Source'].join(','));
  out.reverse().forEach(r => console.log(r.map(cell).join(',')));
  console.error(`${out.length} rows${seqOf ? ' with sync-compatible IDs' : ''}; ${rows.length - out.length} skipped (outside range or already in the feed).`);
}

if (require.main === module) main();
module.exports = { parseStatement, parseAmount, parseDate, decode };
