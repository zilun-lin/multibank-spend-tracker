/**
 * bank_sync.gs — free daily bank sync into a Google Sheet.
 *
 * Pulls booked transactions from:
 *   - Enable Banking (EU/EEA open banking, incl. Revolut, N26, Wise, most EU high-street banks)
 *     using your own application in "restricted" mode, which is free for your own accounts.
 *   - Starling (UK) personal access token, free.
 * and appends them, de-duplicated, to a "Bank feed" tab in the canonical format the
 * engine reads. It never touches tabs written by other feeds (e.g. Lunch Flow), and an
 * "All transactions" tab stacks every feed into one view.
 *
 * SETUP (once)
 *   1. Sheet > Extensions > Apps Script. Paste this file. Save.
 *   2. Project Settings > Script Properties:
 *        EB_APP_ID       your Enable Banking application id
 *        EB_PRIVATE_KEY  contents of the .pem you generated (BEGIN/END lines included)
 *        EB_ACCOUNTS     JSON list from the consent step, e.g.
 *                        [{"name":"EU Current","uid":"<account uid>","currency":"EUR","validUntil":"2027-05-01"}]
 *        STARLING_TOKEN  (optional) Starling personal access token
 *        HOME_CURRENCY   (optional) default GBP
 *   3. Run `setup` once and approve. It syncs, then schedules a daily run at ~06:00.
 *
 * SECURITY: keys live only in Script Properties (never in the sheet, the repo, or chat
 * with an AI). Tokens are minted per run and expire after an hour.
 */

const EB_API = 'https://api.enablebanking.com';
const FEED_TAB = 'Bank feed';
const ALL_TAB = 'All transactions';
const STATUS_TAB = 'Sync status';
const OTHER_FEED_TAB = 'Transactions';      // e.g. Lunch Flow's tab; set '' if you have none
const HEADERS = ['Account', 'Date', 'Amount', 'Currency', 'Merchant', 'Description', 'Transaction ID', 'Amount Home', 'Source'];
const FIRST_RUN_DAYS = 89;                   // PSD2 banks usually allow ~90 days without re-auth
const DAILY_LOOKBACK_DAYS = 14;              // re-read recent days: late-booking items appear

function setup() {
  ensureTabs_();
  syncAll();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncAll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyDays(1).atHour(6).create();
}

function syncAll() {
  ensureTabs_();
  const props = PropertiesService.getScriptProperties();
  const home = props.getProperty('HOME_CURRENCY') || 'GBP';
  const sheet = SpreadsheetApp.getActive().getSheetByName(FEED_TAB);
  const data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues() : [];
  const existing = new Set(data.map(r => String(r[6])));
  const seen = new Set(data.map(r => String(r[0])));      // account names that already have rows
  // Per-account window: a newly linked account gets the full first-run history even when
  // other accounts are already in the tab (a global check would give it only the daily lookback).
  const sinceFor = name => isoDate_(daysAgo_(seen.has(name) ? DAILY_LOOKBACK_DAYS : FIRST_RUN_DAYS));
  const since = sinceFor('Starling');
  const status = [], warnings = [], newRows = [];
  const add = row => { if (!existing.has(row[6])) { existing.add(row[6]); newRows.push(row); return 1; } return 0; };

  const accounts = JSON.parse(props.getProperty('EB_ACCOUNTS') || '[]');
  if (accounts.length) {
    let token = null;
    try { token = ebToken_(); } catch (e) { warnings.push('Enable Banking key problem: ' + e.message); }
    if (token) accounts.forEach(acc => {
      if (acc.validUntil) {
        const left = Math.floor((new Date(acc.validUntil) - new Date()) / 86400000);
        if (left < 21) warnings.push(acc.name + ' consent expires in ' + left + ' days — re-authorise it.');
      }
      try {
        const txs = ebTransactions_(acc.uid, sinceFor(acc.name), token);
        let added = 0;
        txs.forEach(t => { if (!t.status || t.status === 'BOOK') added += add(ebRow_(t, acc, home)); });
        status.push([acc.name, 'OK', txs.length + ' fetched, ' + added + ' new', ebBalance_(acc.uid, token)]);
      } catch (e) { status.push([acc.name, 'ERROR', e.message.slice(0, 300), '']); warnings.push(acc.name + ': ' + e.message.slice(0, 200)); }
    });
  }

  const st = props.getProperty('STARLING_TOKEN');
  if (st) {
    try {
      const res = starlingRows_(st, since, home); let added = 0;
      res.rows.forEach(r => added += add(r));
      status.push(['Starling', 'OK', res.rows.length + ' fetched, ' + added + ' new', res.balance]);
    } catch (e) { status.push(['Starling', 'ERROR', e.message.slice(0, 300), '']); warnings.push('Starling: ' + e.message.slice(0, 200)); }
  }

  if (newRows.length) {
    const start = sheet.getLastRow() + 1;
    sheet.getRange(start, 2, newRows.length, 1).setNumberFormat('@');
    sheet.getRange(start, 1, newRows.length, HEADERS.length).setValues(newRows);
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).sort({ column: 2, ascending: false });
  }
  writeStatus_(status, warnings, newRows.length);
  if (warnings.length) notify_(warnings);
}

// ------------------------------------------------------------- Enable Banking
function ebToken_() {
  const p = PropertiesService.getScriptProperties();
  const appId = p.getProperty('EB_APP_ID'); let key = p.getProperty('EB_PRIVATE_KEY');
  if (!appId || !key) throw new Error('Set EB_APP_ID and EB_PRIVATE_KEY in Script Properties.');
  key = key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const b64 = s => Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
  const input = b64(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId })) + '.' +
    b64(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }));
  return input + '.' + Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(input, key)).replace(/=+$/, '');
}
function ebGet_(path, params, token) {
  const qs = Object.keys(params || {}).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const res = UrlFetchApp.fetch(EB_API + path + (qs ? '?' + qs : ''), { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 250));
  return JSON.parse(res.getContentText());
}
function ebTransactions_(uid, since, token) {
  let out = [], key = null, guard = 0;
  do {
    const params = { date_from: since }; if (key) params.continuation_key = key;
    const page = ebGet_('/accounts/' + uid + '/transactions', params, token);
    out = out.concat(page.transactions || []); key = page.continuation_key;
  } while (key && ++guard < 50);
  return out;
}
function ebBalance_(uid, token) {
  try { const b = (ebGet_('/accounts/' + uid + '/balances', {}, token).balances || [])[0]; return b ? b.balance_amount.amount + ' ' + b.balance_amount.currency : ''; } catch (e) { return ''; }
}
function ebRow_(t, acc, home) {
  const debit = t.credit_debit_indicator === 'DBIT';
  let amt = Math.abs(parseFloat((t.transaction_amount || {}).amount || 0)); if (debit) amt = -amt;
  const cur = (t.transaction_amount || {}).currency || acc.currency;
  const party = (debit ? t.creditor : t.debtor) || {};
  const remit = [].concat(t.remittance_information || []).filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim();
  const date = t.booking_date || t.value_date || t.transaction_date || '';
  const id = 'EB-' + (t.entry_reference || t.transaction_id || Utilities.base64Encode(acc.uid + date + amt + remit).slice(0, 24));
  return [acc.name, date, round2_(amt), cur, party.name || remit.split(' | ')[0] || '', remit, id, round2_(amt * fx_(cur, home)), 'Enable Banking'];
}

// ------------------------------------------------------------- Starling
function starlingRows_(token, since, home) {
  const get = path => {
    const res = UrlFetchApp.fetch('https://api.starlingbank.com' + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) throw new Error('HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    return JSON.parse(res.getContentText());
  };
  const rows = []; let balance = '';
  (get('/api/v2/accounts').accounts || []).forEach(a => {
    const feed = get('/api/v2/feed/account/' + a.accountUid + '/category/' + a.defaultCategory + '/transactions-between?minTransactionTimestamp=' +
      encodeURIComponent(since + 'T00:00:00.000Z') + '&maxTransactionTimestamp=' + encodeURIComponent(new Date().toISOString()));
    (feed.feedItems || []).forEach(f => {
      if (f.status && f.status !== 'SETTLED') return;
      const cur = f.amount.currency; let amt = f.amount.minorUnits / 100; if (f.direction === 'OUT') amt = -amt;
      rows.push(['Starling', String(f.transactionTime || '').slice(0, 10), round2_(amt), cur, f.counterPartyName || '', f.reference || f.spendingCategory || '', 'ST-' + f.feedItemUid, round2_(amt * fx_(cur, home)), 'Starling']);
    });
    try { const b = get('/api/v2/accounts/' + a.accountUid + '/balance'); balance = (b.effectiveBalance.minorUnits / 100).toFixed(2) + ' ' + b.effectiveBalance.currency; } catch (e) { /* ignore */ }
  });
  return { rows: rows, balance: balance };
}

// ------------------------------------------------------------- sheet
function ensureTabs_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(FEED_TAB)) { const s = ss.insertSheet(FEED_TAB); s.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold'); s.setFrozenRows(1); }
  if (!ss.getSheetByName(STATUS_TAB)) ss.insertSheet(STATUS_TAB);
  if (!ss.getSheetByName(ALL_TAB)) {
    const s = ss.insertSheet(ALL_TAB); s.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold'); s.setFrozenRows(1);
    const mine = "FILTER('" + FEED_TAB + "'!A2:I, LEN('" + FEED_TAB + "'!A2:A))";
    // Other feed assumed to have Account, Date, Amount, Currency, Merchant, Description, Transaction ID in A:G and be in home currency.
    const other = OTHER_FEED_TAB ? "FILTER({" + OTHER_FEED_TAB + "!A2:G, " + OTHER_FEED_TAB + "!C2:C, IF(LEN(" + OTHER_FEED_TAB + "!A2:A), \"Other feed\", \"\")}, LEN(" + OTHER_FEED_TAB + "!A2:A))" : '';
    s.getRange('A2').setFormula(other ? '=IFERROR(SORT(VSTACK(' + other + ', ' + mine + '), 2, FALSE), SORT(' + mine + ', 2, FALSE))' : '=SORT(' + mine + ', 2, FALSE)');
  }
}
function writeStatus_(status, warnings, added) {
  const st = SpreadsheetApp.getActive().getSheetByName(STATUS_TAB);
  st.getRange('A1:D80').clearContent();
  const rows = [['Last run', new Date().toISOString(), 'New rows', String(added)], ['', '', '', ''], ['Account', 'Status', 'Detail', 'Balance']].concat(status);
  if (warnings.length) rows.push(['', '', '', ''], ['WARNINGS', '', '', '']);
  warnings.forEach(w => rows.push(['', w, '', '']));
  st.getRange(1, 1, rows.length, 4).setValues(rows);
}
function notify_(warnings) {
  const p = PropertiesService.getScriptProperties(); const today = isoDate_(new Date());
  if (p.getProperty('LAST_ALERT') === today) return; p.setProperty('LAST_ALERT', today);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Bank sync needs attention', warnings.join('\n') + '\n\n' + SpreadsheetApp.getActive().getUrl());
}

// ------------------------------------------------------------- fx + utils
/** Live FX via GOOGLEFINANCE, cached per run. Falls back to 1 if unavailable. */
const FX_CACHE = {};
function fx_(from, to) {
  if (!from || from === to) return 1;
  const k = from + to; if (FX_CACHE[k]) return FX_CACHE[k];
  const st = SpreadsheetApp.getActive().getSheetByName(STATUS_TAB);
  const cell = st.getRange('F1'); cell.setFormula('=GOOGLEFINANCE("CURRENCY:' + k + '")'); SpreadsheetApp.flush();
  const v = cell.getValue(); cell.clearContent();
  return (FX_CACHE[k] = typeof v === 'number' && v > 0 ? v : 1);
}
function round2_(x) { return Math.round(x * 100) / 100; }
function daysAgo_(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function isoDate_(d) { return Utilities.formatDate(d, 'Etc/UTC', 'yyyy-MM-dd'); }
