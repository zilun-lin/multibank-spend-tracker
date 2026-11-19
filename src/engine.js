/*
 * multibank-spend-tracker engine
 *
 * Pure functions, no dependencies. Runs in the browser (window.SpendEngine)
 * and in Node (require('./engine')).
 *
 * Input:  transactions (canonical rows, any currency, any bank)
 *         receipt items (optional, line items matched to a transaction id)
 *         config (categories, rules, budgets, annual pots, FX, income)
 * Output: enriched ledger + month summary, budgets, forecast, cashflow,
 *         recurring charges, and plain-language drivers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpendEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ utils
  const DAY = 86400000;
  const round2 = x => Math.round(x * 100) / 100;
  const ymd = d => d.toISOString().slice(0, 10);
  const parseDate = s => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const monthOf = s => String(s).slice(0, 7);
  const daysInMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
  const addDays = (s, n) => ymd(new Date(parseDate(s).getTime() + n * DAY));
  const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / DAY);
  const sum = a => a.reduce((s, x) => s + x, 0);
  const mean = a => (a.length ? sum(a) / a.length : 0);
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };
  const re = p => (p instanceof RegExp ? p : new RegExp(p, 'i'));

  /** Normalise a merchant string into a stable key ("AMZN Mktp UK*2X4" -> "AMZN MKTP UK"). */
  function merchantKey(s) {
    return String(s || '').toUpperCase()
      .replace(/\*.*$/, '')
      .replace(/\b(LTD|LIMITED|PLC|UK|GB|LONDON|CARD PAYMENT TO|PAYMENT TO)\b/g, ' ')
      .replace(/[0-9#:/\\.-]+/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 24);
  }

  // ------------------------------------------------------------------ CSV
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(v => v !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell); if (row.some(v => v !== '')) rows.push(row);
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }

  /**
   * Map arbitrary column names onto the canonical row.
   * Canonical: id, date, account, amount, currency, merchant, description, amountHome, source
   */
  const ALIASES = {
    id: ['id', 'transaction id', 'transaction_id', 'txid', 'reference id'],
    date: ['date', 'booking date', 'booked', 'transaction date', 'posted'],
    account: ['account', 'account name', 'bank'],
    amount: ['amount', 'value'],
    currency: ['currency', 'ccy'],
    merchant: ['merchant', 'payee', 'counterparty', 'name'],
    description: ['description', 'details', 'reference', 'memo', 'narrative'],
    amountHome: ['amounthome', 'amount home', 'amount gbp', 'amount eur', 'amount usd', 'amount (home)'],
    source: ['source', 'feed'],
  };
  function normaliseRows(raw, config) {
    const cfg = withDefaults(config);
    return raw.map((r, i) => {
      const keys = Object.keys(r); const lower = keys.map(k => k.toLowerCase());
      const pick = f => { for (const a of ALIASES[f]) { const j = lower.indexOf(a); if (j >= 0) return r[keys[j]]; } return ''; };
      const amount = parseFloat(String(pick('amount')).replace(/[,£€$\s]/g, '')) || 0;
      const currency = (pick('currency') || cfg.homeCurrency).toUpperCase();
      const homeRaw = pick('amountHome');
      const amountHome = homeRaw !== '' && !isNaN(parseFloat(homeRaw)) ? parseFloat(homeRaw) : toHome(amount, currency, cfg);
      const date = String(pick('date')).slice(0, 10);
      return {
        id: pick('id') || `row-${i}-${date}-${amount}`,
        date, account: pick('account'), amount, currency,
        merchant: pick('merchant'), description: pick('description'),
        amountHome: round2(amountHome), source: pick('source'),
      };
    }).filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date));
  }

  function toHome(amount, currency, cfg) {
    if (!currency || currency === cfg.homeCurrency) return amount;
    const rate = (cfg.fx || {})[currency];
    return rate ? amount * rate : amount;
  }

  // ------------------------------------------------------------------ config
  const DEFAULTS = {
    homeCurrency: 'GBP',
    fx: {},
    transferPatterns: [],
    income: [],
    rules: [],
    overrides: {},
    notCounted: [],
    budgets: {},
    annualPots: {},
    nature: [],
    defaultNature: 'Everyday',
    refunds: { windowDays: 60, pattern: 'REFUND|RETURN|REVERSAL' },
    recurring: { minMonths: 3, maxCv: 0.25, excludeCategories: [] },
    forecast: { lookbackDays: 120, lumpyThreshold: 150, band: 1.28 },
    otherIncome: [],
    tax: { yearStart: '01-01', setAside: [] },
    amortise: [],
  };
  function withDefaults(config) {
    const c = Object.assign({}, DEFAULTS, config || {});
    c.refunds = Object.assign({}, DEFAULTS.refunds, (config || {}).refunds);
    c.recurring = Object.assign({}, DEFAULTS.recurring, (config || {}).recurring);
    c.forecast = Object.assign({}, DEFAULTS.forecast, (config || {}).forecast);
    c.tax = Object.assign({}, DEFAULTS.tax, (config || {}).tax);
    return c;
  }

  // ------------------------------------------------------------------ classify
  function textOf(t) { return `${t.merchant || ''} ${t.description || ''}`.toUpperCase(); }

  function matchRule(rule, t, text) {
    if (rule.account && !re(rule.account).test(t.account || '')) return false;
    if (rule.sign === 'in' && t.amountHome <= 0) return false;
    if (rule.sign === 'out' && t.amountHome >= 0) return false;
    if (rule.currency && rule.currency !== t.currency) return false;
    return rule.pattern ? re(rule.pattern).test(text) : true;
  }

  function classifyOne(t, cfg) {
    if (cfg.overrides[t.id]) return { category: cfg.overrides[t.id], kind: 'spend', why: 'override' };
    const text = textOf(t);
    if (cfg.transferPatterns.some(p => re(p).test(text))) return { category: 'Transfer', kind: 'transfer', why: 'transfer pattern' };
    for (const r of cfg.income) if (matchRule(Object.assign({ sign: 'in' }, r), t, text)) return { category: r.category, kind: 'income', why: 'income rule' };
    for (const r of cfg.rules) if (matchRule(r, t, text)) return { category: r.category, kind: 'spend', why: `rule /${r.pattern}/` };
    if (t.amountHome > 0) return { category: 'Money in', kind: 'other-in', why: 'unmatched credit' };
    return { category: 'Uncategorised', kind: 'spend', why: 'no rule matched' };
  }

  /**
   * Full enrichment: classify, pair refunds, split by receipts, attach nature,
   * decide whether each row counts toward the budget and which month it hits.
   */
  function enrich(transactions, receipts, config, periods) {
    const cfg = withDefaults(config);
    // Bill periods found in emails/documents: { transactionId, start, end } (YYYY-MM-DD).
    cfg._periods = {};
    (periods || []).forEach(p => { const id = p.transactionId || p['Transaction ID']; const st = p.start || p['Period start']; const en = p.end || p['Period end']; if (id && st && en) cfg._periods[id] = { start: st, end: en, source: p.source || p.Source || 'document' }; });
    const rows = transactions.map(t => {
      const c = classifyOne(t, cfg);
      return Object.assign({}, t, c, {
        spend: -t.amountHome,                 // positive = money spent
        effDate: t.date,
        counted: c.kind === 'spend' && !cfg.notCounted.includes(c.category),
        refund: null,
      });
    });
    pairRefunds(rows, cfg);
    const split = splitByReceipts(rows, receipts || [], cfg);
    split.forEach(r => { r.month = monthOf(r.effDate); r.nature = natureOf(r, cfg); r.pot = cfg.annualPots[r.category] ? 'annual' : 'monthly'; });
    const out = amortiseRows(split, cfg);
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }


  // ------------------------------------------------------------------ amortise yearly / quarterly charges
  /**
   * Periodic charges (ground rent, service charge, insurance, annual
   * subscriptions, TV licence, car tax…) paid once a year or quarter make one
   * month look terrible and the others too good. Rules in config.amortise:
   *   { pattern?, category?, account?, months: 12 }
   * spread each matching payment evenly over `months` months starting with the
   * month it was paid. The original row stays in the ledger (alloc parent,
   * counted:false); allocation rows (alloc:true) carry the monthly share and
   * are what budgets, summaries, forecasts and cash flow tally.
   */
  function amortiseRows(rows, cfg) {
    const P = cfg._periods || {};
    if ((!cfg.amortise || !cfg.amortise.length) && !Object.keys(P).length) return rows;
    const out = [];
    for (const r of rows) {
      const eligible = r.kind === 'spend' && r.amountHome < 0 && !r.parent;
      // Evidence order: an explicit bill period (from email/invoice) beats a config rule.
      const per = eligible && P[r.id];
      const rule = eligible && !per && (cfg.amortise || []).find(a => matchRule(a, r, textOf(r)) && (!a.category || a.category === r.category));
      if (!per && !rule) { out.push(r); continue; }
      let n = rule ? Math.max(1, rule.months || 12) : 0;
      let startMonth = r.month;
      if (per) {
        const [sy, sm] = per.start.split('-').map(Number), [ey, em] = per.end.split('-').map(Number);
        n = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
        startMonth = per.start.slice(0, 7);
      }
      const share = round2(r.spend / n); const last = round2(r.spend - share * (n - 1));
      out.push(Object.assign({}, r, { amortised: { months: n, start: startMonth, source: per ? per.source : 'rule' }, countedOriginal: r.counted, counted: false, why: r.why + `; spread over ${n} months` + (per ? ` (bill period ${per.start} to ${per.end})` : '') }));
      let [y, mo] = startMonth.split('-').map(Number);
      for (let k = 0; k < n; k++) {
        const m = `${y}-${String(mo).padStart(2, '0')}`;
        out.push(Object.assign({}, r, { id: `${r.id}~${k + 1}`, parent: r.id, alloc: true, month: m, effDate: m + '-01', spend: k === n - 1 ? last : share, amountHome: -(k === n - 1 ? last : share), item: `${n}-month share ${k + 1}/${n}` }));
        mo++; if (mo > 12) { mo = 1; y++; }
      }
    }
    return out;
  }

  /**
   * Suggest amortise rules: merchants charged roughly once a year (330–400 days
   * apart) or once a quarter (80–100 days), with similar amounts, or a single
   * payment matching typical yearly-bill words. Used during setup so the agent
   * can ask "spread these over 12 months?".
   */
  function detectPeriodic(ledger, config) {
    const groups = {};
    ledger.filter(r => r.kind === 'spend' && r.amountHome < 0 && !r.parent).forEach(r => { const k = merchantKey(r.merchant || r.description); (groups[k] = groups[k] || []).push(r); });
    const words = /GROUND RENT|SERVICE CHARGE|INSURANCE|INSURE|TV LICEN|VEHICLE TAX|DVLA|ANNUAL|YEARLY|MEMBERSHIP|AMAZON PRIME|DOMAIN|RENEWAL/;
    const out = [];
    for (const [k, rs] of Object.entries(groups)) {
      const d = rs.map(r => r.date).sort(); const amts = rs.map(r => r.spend);
      const gaps = d.slice(1).map((x, i) => diffDays(x, d[i]));
      const stable = sd(amts) / (mean(amts) || 1) <= 0.25;
      let months = null, why = '';
      if (gaps.length && stable && gaps.every(g => g >= 330 && g <= 400)) { months = 12; why = 'charged about once a year'; }
      else if (gaps.length && stable && gaps.every(g => g >= 80 && g <= 100)) { months = 3; why = 'charged about once a quarter'; }
      else if (rs.length <= 2 && words.test(textOf(rs[0])) && mean(amts) >= 30) { months = 12; why = 'looks like a yearly bill'; }
      if (!months && rs.length === 1 && mean(amts) >= (config && config.periodicMin || 150) && /^(TO |DD |DIRECT DEBIT|STANDING ORDER|BANK TRANSFER)|LTD|LIMITED|COMPANY|ESTATES|MANAGEMENT|COUNCIL|INSURANCE/.test(textOf(rs[0])) && !/AMAZON|EBAY|APPLE\.COM/.test(textOf(rs[0]))) { months = null; out.push({ merchant: k, category: rs[0].category, typical: round2(amts[0]), months: null, last: d[0], why: 'one payment to a company by transfer/debit — could be a yearly bill; confirm from an email/invoice period or ask the user', needsEvidence: true }); continue; }
      if (months) out.push({ merchant: k, category: rs[0].category, typical: round2(median(amts)), months, monthlyShare: round2(median(amts) / months), last: d[d.length - 1], why, rule: { pattern: k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), months } });
    }
    return out.sort((a, b) => b.typical - a.typical);
  }

  // ------------------------------------------------------------------ refunds
  /**
   * A credit that isn't income/transfer is treated as a refund if it matches the
   * refund pattern OR a prior purchase from the same merchant. It inherits the
   * purchase's category, counted flag and budget month, so it nets against the
   * original spend and is never double counted.
   *   1. exact: same merchant key, same amount, within windowDays  -> full refund
   *   2. partial: latest purchase from the same merchant >= refund amount
   */
  function pairRefunds(rows, cfg) {
    const used = new Set();
    const credits = rows.filter(r => r.amountHome > 0 && (r.kind === 'other-in' || r.kind === 'spend'));
    const debits = rows.filter(r => r.amountHome < 0 && r.kind === 'spend');
    for (const cr of credits) {
      const key = merchantKey(cr.merchant || cr.description);
      const cands = debits.filter(d => !used.has(d.id) && merchantKey(d.merchant || d.description) === key &&
        d.date <= cr.date && diffDays(cr.date, d.date) <= cfg.refunds.windowDays);
      let match = cands.find(d => Math.abs(d.amountHome + cr.amountHome) < 0.01);
      let full = !!match;
      // partial: prefer the same raw merchant string (order ids often survive), then the latest purchase
      const same = d => (d.merchant === cr.merchant ? 1 : 0);
      if (!match) match = cands.filter(d => -d.amountHome >= cr.amountHome).sort((a, b) => same(b) - same(a) || (a.date < b.date ? 1 : -1))[0];
      if (!match && !re(cfg.refunds.pattern).test(textOf(cr))) continue;
      if (match) {
        if (full) used.add(match.id);
        Object.assign(cr, { category: match.category, kind: 'spend', counted: match.counted, effDate: match.date, refund: { of: match.id, full }, why: full ? 'full refund' : 'partial refund' });
        match.refundedBy = (match.refundedBy || []).concat(cr.id);
        if (full) match.fullyRefunded = true;
      } else {
        Object.assign(cr, { category: 'Refunds (unmatched)', kind: 'other-in', counted: false, why: 'refund, no purchase found' });
      }
    }
  }

  // ------------------------------------------------------------------ receipts
  /**
   * Receipt items: { transactionId, item, qty, price, category?, nature? }.
   * Items for a transaction replace it with one row per item, scaled so they
   * sum exactly to the bank amount (delivery, discounts, FX absorbed).
   */
  function splitByReceipts(rows, receipts, cfg) {
    const byTx = {};
    receipts.forEach(r => { const id = r.transactionId || r['Transaction ID']; if (id) (byTx[id] = byTx[id] || []).push(r); });
    const out = [];
    for (const r of rows) {
      const items = byTx[r.id];
      if (!items || r.kind !== 'spend' || r.amountHome >= 0) {
        if (r.refund && !r.refund.full) {
          const parentItems = byTx[r.refund.of];
          if (parentItems) {
            const biggest = parentItems.reduce((a, b) => (num(b) > num(a) ? b : a));
            if (biggest.category || biggest.Category) r.category = biggest.category || biggest.Category;
            if (biggest.nature || biggest.Nature) r.itemNature = biggest.nature || biggest.Nature;
          }
        }
        out.push(r); continue;
      }
      const total = sum(items.map(num));
      const scale = total > 0 ? r.spend / total : 0;
      items.forEach((it, i) => {
        const cat = it.category || it.Category || r.category;
        out.push(Object.assign({}, r, {
          id: `${r.id}#${i + 1}`, parent: r.id,
          item: it.item || it.Item, itemNature: it.nature || it.Nature || '',
          category: cat, counted: r.kind === 'spend' && !cfg.notCounted.includes(cat),
          spend: round2(num(it) * scale), amountHome: -round2(num(it) * scale),
        }));
      });
    }
    return out;
  }
  function num(it) { const q = parseFloat(it.qty || it.Qty || 1) || 1; const p = parseFloat(it.price ?? it.Price ?? it['Price GBP'] ?? 0) || 0; return q * p; }

  // ------------------------------------------------------------------ nature
  /** Ordered rules: { nature, categories?, minAmount?, pattern?, itemPattern? }. First match wins. */
  function natureOf(r, cfg) {
    if (!r.counted) return '';
    if (r.itemNature) return r.itemNature;
    const text = textOf(r) + ' ' + String(r.item || '').toUpperCase();
    for (const n of cfg.nature) {
      if (n.categories && !n.categories.includes(r.category)) continue;
      if (n.minAmount && Math.abs(r.spend) < n.minAmount) continue;
      if (n.pattern && !re(n.pattern).test(text)) continue;
      if (n.noItem && r.item) continue;
      return n.nature;
    }
    return cfg.defaultNature;
  }

  // ------------------------------------------------------------------ budgets
  function budgetStatus(ledger, config, asOf) {
    const cfg = withDefaults(config);
    const m = monthOf(asOf);
    const counted = ledger.filter(r => r.counted);
    const out = [];
    for (const [cat, amt] of Object.entries(cfg.budgets)) {
      const spent = round2(sum(counted.filter(r => r.month === m && r.category === cat).map(r => r.spend)));
      out.push({ category: cat, type: 'monthly', budget: amt, spent, left: round2(amt - spent), over: spent > amt });
    }
    for (const [cat, pot] of Object.entries(cfg.annualPots)) {
      const start = pot.start; const days = Math.max(0, diffDays(asOf, start) + 1);
      const accrued = round2(pot.amount * days / 365);
      const spent = round2(sum(counted.filter(r => r.category === cat && r.effDate >= start && r.effDate <= asOf).map(r => r.spend)));
      out.push({ category: cat, type: 'annual', budget: pot.amount, accrued, spent, left: round2(accrued - spent), over: spent > accrued });
    }
    return out;
  }

  // ------------------------------------------------------------------ recurring
  /**
   * A merchant is recurring if it charged in >= minMonths distinct months,
   * the amounts are stable (coefficient of variation <= maxCv) and the median
   * gap is roughly monthly. Frequent-but-variable spend (a café you visit
   * weekly) fails the CV / gap tests, which is the usual false positive.
   */
  function recurring(ledger, config) {
    const cfg = withDefaults(config);
    const groups = {};
    ledger.filter(r => r.kind === 'spend' && r.spend > 0 && !r.parent && !cfg.recurring.excludeCategories.includes(r.category))
      .forEach(r => { const k = merchantKey(r.merchant || r.description); (groups[k] = groups[k] || []).push(r); });
    const out = [];
    for (const [k, rs] of Object.entries(groups)) {
      const months = new Set(rs.map(r => monthOf(r.date)));
      if (months.size < cfg.recurring.minMonths) continue;
      const amts = rs.map(r => r.spend); const cv = sd(amts) / (mean(amts) || 1);
      const dates = rs.map(r => r.date).sort();
      const gaps = dates.slice(1).map((d, i) => diffDays(d, dates[i]));
      const g = median(gaps);
      if (cv > cfg.recurring.maxCv || g < 25 || g > 35) continue;
      if (rs.length > months.size * 1.5) continue;
      out.push({ merchant: k, category: rs[0].category, typical: round2(median(amts)), day: Math.round(median(rs.map(r => parseDate(r.date).getUTCDate()))), last: dates[dates.length - 1], count: rs.length });
    }
    return out.sort((a, b) => b.typical - a.typical);
  }

  // ------------------------------------------------------------------ forecast
  /**
   * Data-informed month projection instead of a straight line.
   *   - everyday variable spend: mean and variance by weekday over lookbackDays
   *   - recurring charges: expected on their median day if not yet seen this month
   *   - lumpy purchases (>= lumpyThreshold): monthly mean spread evenly
   * Annual-pot categories are excluded (they are judged on the yearly pot).
   * Returns per-day expected spend and an ~80% band.
   */
  function forecast(ledger, config, asOf) {
    const cfg = withDefaults(config);
    const m = monthOf(asOf); const dim = daysInMonth(m);
    const start = addDays(asOf, -cfg.forecast.lookbackDays);
    const rec = recurring(ledger, cfg); const recKeys = new Set(rec.map(r => r.merchant));
    const hist = ledger.filter(r => r.counted && r.pot !== 'annual' && r.effDate >= start && r.effDate < m + '-01');
    const isRec = r => recKeys.has(merchantKey(r.merchant || r.description));
    const byDay = {};
    hist.forEach(r => { if (!isRec(r) && r.spend < cfg.forecast.lumpyThreshold) byDay[r.effDate] = (byDay[r.effDate] || 0) + r.spend; });
    const wd = Array.from({ length: 7 }, () => []);
    for (let d = start; d < m + '-01'; d = addDays(d, 1)) wd[parseDate(d).getUTCDay()].push(byDay[d] || 0);
    const months = new Set(hist.map(r => r.month)).size || 1;
    const lumpyMonthly = sum(hist.filter(r => !isRec(r) && r.spend >= cfg.forecast.lumpyThreshold).map(r => r.spend)) / months;
    const seen = new Set(ledger.filter(r => r.month === m).map(r => merchantKey(r.merchant || r.description)));
    const days = [];
    for (let i = 1; i <= dim; i++) {
      const d = `${m}-${String(i).padStart(2, '0')}`;
      const w = wd[parseDate(d).getUTCDay()];
      const recToday = rec.filter(r => r.day === i && !seen.has(r.merchant) && !cfg.notCounted.includes(r.category)).reduce((s, r) => s + r.typical, 0);
      days.push({ date: d, everyday: mean(w), everydayVar: sd(w) ** 2, lumpy: lumpyMonthly / dim, recurring: recToday });
    }
    const actual = ledger.filter(r => r.counted && r.pot !== 'annual' && r.month === m && r.effDate <= asOf);
    const mtd = round2(sum(actual.map(r => r.spend)));
    const rest = days.filter(d => d.date > asOf);
    const exp = sum(rest.map(d => d.everyday + d.lumpy + d.recurring));
    const sigma = Math.sqrt(sum(rest.map(d => d.everydayVar)));
    const z = cfg.forecast.band;
    return {
      month: m, mtd, projected: round2(mtd + exp),
      low: round2(Math.max(mtd, mtd + exp - z * sigma)), high: round2(mtd + exp + z * sigma),
      days: days.map(d => Object.assign(d, { expected: round2(d.everyday + d.lumpy + d.recurring) })),
    };
  }

  // ------------------------------------------------------------------ tax set-aside
  /**
   * Income that isn't taxed at source (side income, sole-trader / freelance
   * invoices, marketplace payouts, rental income, income taxed in two countries)
   * needs money set aside. For each config.tax.setAside entry:
   *   { name, categories: [income categories], rate, expenseCategories?: [allowable costs] }
   * taxable = income − allowable expenses (floored at 0); reserve = taxable × rate.
   * `rate` is your effective marginal rate on that income (e.g. income tax +
   * social contributions), chosen by you — this is arithmetic, not tax advice.
   * Returns year-to-date (from tax.yearStart, 'MM-DD') and a trailing window.
   */
  function taxReserve(ledger, config, asOf, windowDays) {
    const cfg = withDefaults(config);
    const ys = cfg.tax.yearStart || '01-01';
    let start = asOf.slice(0, 4) + '-' + ys; if (start > asOf) start = (+asOf.slice(0, 4) - 1) + '-' + ys;
    const wStart = windowDays ? addDays(asOf, -windowDays + 1) : asOf.slice(0, 7) + '-01';
    const calc = (from) => (cfg.tax.setAside || []).map(e => {
      const inc = ledger.filter(r => e.categories.includes(r.category) && r.amountHome > 0 && r.date >= from && r.date <= asOf);
      const exp = ledger.filter(r => (e.expenseCategories || []).includes(r.category) && r.date >= from && r.date <= asOf);
      const gross = round2(sum(inc.map(r => r.amountHome)));
      const expenses = round2(sum(exp.map(r => r.spend)));
      const taxable = Math.max(0, round2(gross - expenses));
      return { name: e.name, rate: e.rate, gross, expenses, taxable, reserve: round2(taxable * e.rate), disposable: round2(gross - expenses - taxable * e.rate) };
    });
    const ytd = calc(start), win = calc(wStart);
    return { yearStart: start, ytd, window: win, reserveYtd: round2(sum(ytd.map(e => e.reserve))), reserveWindow: round2(sum(win.map(e => e.reserve))) };
  }

  // ------------------------------------------------------------------ cashflow
  /**
   * Money in vs money out this month, after setting tax aside, and the day
   * savings for the month are projected to go negative (null if they don't).
   * otherIncome: [{ name, monthlyGross, taxRate }] for income not in the feed.
   */
  function cashflow(ledger, config, asOf) {
    const cfg = withDefaults(config);
    const m = monthOf(asOf);
    const incomeRows = ledger.filter(r => r.kind === 'income' && r.date > addDays(asOf, -31) && r.date <= asOf);
    const otherGross = sum(cfg.otherIncome.map(o => o.monthlyGross));
    const otherTax = sum(cfg.otherIncome.map(o => o.monthlyGross * (o.taxRate || 0)));
    const gross = round2(sum(incomeRows.map(r => r.amountHome)) + otherGross);
    const tx = taxReserve(ledger, cfg, asOf, 31);
    const taxSetAside = round2(tx.reserveWindow + otherTax);
    const income = round2(gross - taxSetAside);
    const outRows = ledger.filter(r => r.month === m && r.kind === 'spend');
    const outMtd = round2(sum(outRows.map(r => r.spend)));
    const fc = forecast(ledger, cfg, asOf);
    let running = income - outMtd, crossDay = null;
    for (const d of fc.days.filter(d => d.date > asOf)) { running -= d.expected; if (running < 0 && !crossDay) crossDay = d.date; }
    return { month: m, grossIncome: gross, taxSetAside, income, outMtd, projectedOut: round2(outMtd + (fc.projected - fc.mtd)), projectedSaved: round2(running), crossDay, taxReserveYtd: tx.reserveYtd, taxYearStart: tx.yearStart };
  }

  // ------------------------------------------------------------------ summary
  function summarise(ledger, config, asOf) {
    const cfg = withDefaults(config);
    const m = monthOf(asOf);
    const cur = ledger.filter(r => r.counted && r.month === m);
    const prevM = monthOf(addDays(m + '-01', -1));
    const prev = ledger.filter(r => r.counted && r.month === prevM);
    const byCat = group(cur, 'category'); const byCatPrev = group(prev, 'category');
    const byNature = group(cur, 'nature');
    const monthlyBudget = sum(Object.values(cfg.budgets));
    const fc = forecast(ledger, cfg, asOf);
    const top = cur.filter(r => r.spend > 0 && !r.fullyRefunded && !r.alloc).sort((a, b) => b.spend - a.spend).slice(0, 10)
      .map(r => ({ date: r.date, merchant: r.merchant, item: r.item || '', category: r.category, nature: r.nature, amount: r.spend }));
    const drivers = Object.keys(byCat).map(c => ({ category: c, now: byCat[c], prev: byCatPrev[c] || 0, delta: round2(byCat[c] - (byCatPrev[c] || 0)) }))
      .sort((a, b) => b.delta - a.delta).slice(0, 5);
    return {
      month: m, asOf, monthlyBudget,
      spentMonthlyPots: round2(sum(cur.filter(r => r.pot !== 'annual').map(r => r.spend))),
      spentAnnualPots: round2(sum(cur.filter(r => r.pot === 'annual').map(r => r.spend))),
      forecast: { projected: fc.projected, low: fc.low, high: fc.high },
      byCategory: byCat, byNature, drivers, top,
      budgets: budgetStatus(ledger, cfg, asOf),
      cashflow: cashflow(ledger, cfg, asOf),
      uncategorised: ledger.filter(r => r.month === m && r.category === 'Uncategorised').length,
    };
  }
  function group(rows, key) { const o = {}; rows.forEach(r => { const k = r[key] || '—'; o[k] = round2((o[k] || 0) + r.spend); }); return o; }

  /** Plain-language answer to "why am I over/under budget?" */
  function explain(summary) {
    const s = summary; const lines = [];
    const gap = round2(s.forecast.projected - s.monthlyBudget);
    lines.push(`${s.month}: spent ${s.spentMonthlyPots.toFixed(2)} so far against a monthly budget of ${s.monthlyBudget.toFixed(2)}; on track for about ${s.forecast.projected.toFixed(0)} (likely ${s.forecast.low.toFixed(0)}–${s.forecast.high.toFixed(0)}), ${gap >= 0 ? gap.toFixed(0) + ' over' : (-gap).toFixed(0) + ' under'}.`);
    const over = s.budgets.filter(b => b.over);
    if (over.length) lines.push('Over: ' + over.map(b => `${b.category} (${b.spent.toFixed(0)} vs ${(b.type === 'annual' ? b.accrued : b.budget).toFixed(0)}${b.type === 'annual' ? ' accrued so far this year' : ''})`).join('; ') + '.');
    if (s.drivers.length) lines.push('Biggest increases vs last month: ' + s.drivers.filter(d => d.delta > 0).map(d => `${d.category} +${d.delta.toFixed(0)}`).join(', ') + '.');
    const n = Object.entries(s.byNature).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => b[1] - a[1]);
    if (n.length) lines.push('By kind: ' + n.map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ') + '.');
    if (s.top.length) lines.push('Largest items: ' + s.top.slice(0, 5).map(t => `${t.item || t.merchant} ${t.amount.toFixed(0)}`).join(', ') + '.');
    if (s.cashflow.taxSetAside > 0) lines.push(`Money in over the last 31 days: ${s.cashflow.grossIncome.toFixed(0)} gross, ${s.cashflow.taxSetAside.toFixed(0)} set aside for tax, ${s.cashflow.income.toFixed(0)} actually spendable. Tax pot owed so far this tax year: ${s.cashflow.taxReserveYtd.toFixed(0)}.`);
    if (s.cashflow.crossDay) lines.push(`At this pace savings for the month go negative on ${s.cashflow.crossDay}.`);
    if (s.uncategorised) lines.push(`${s.uncategorised} transactions are uncategorised — add rules to tighten this.`);
    return lines.join('\n');
  }


  // ------------------------------------------------------------------ purchase check (personal CFO)
  /**
   * "Can I buy this?" Deterministic check of a proposed purchase against the
   * category allowance (monthly budget or accrued yearly pot), the month-end
   * forecast, savings, and the user's policy rules in config.policy.
   * purchase: { amount, category?, merchant?, description?, date? }
   * Returns { verdict: 'yes'|'yes-with-tradeoff'|'wait'|'no', reasons[], questions[], numbers{} }
   */
  function checkPurchase(ledger, config, purchase) {
    const cfg = withDefaults(config);
    const asOf = purchase.date || ledger.map(r => r.date).sort().pop() || ymd(new Date());
    const amt = Math.abs(+purchase.amount || 0);
    const cat = purchase.category || classifyOne({ id: '_', merchant: purchase.merchant || '', description: purchase.description || '', amountHome: -amt }, cfg).category;
    const budgets = budgetStatus(ledger, cfg, asOf);
    const b = budgets.find(x => x.category === cat);
    const fc = forecast(ledger, cfg, asOf);
    const cf = cashflow(ledger, cfg, asOf);
    const monthly = sum(Object.values(cfg.budgets));
    const isPot = !!cfg.annualPots[cat];
    const counted = !cfg.notCounted.includes(cat);
    const reasons = [], questions = []; let level = 0; // 0 yes, 1 tradeoff, 2 wait, 3 no
    const bump = l => { level = Math.max(level, l); };
    const numbers = { category: cat, amount: amt, isYearlyPot: isPot };

    if (b) {
      const leftAfter = round2(b.left - amt);
      numbers.allowanceLeftBefore = b.left; numbers.allowanceLeftAfter = leftAfter;
      if (isPot) { numbers.potYearly = b.budget; numbers.potAccrued = b.accrued; numbers.daysToEarn = leftAfter < 0 ? Math.ceil(-leftAfter / (b.budget / 365)) : 0; }
      if (leftAfter >= 0) reasons.push(`${cat}: ${b.left.toFixed(0)} left ${isPot ? 'in the yearly pot built up so far' : 'this month'}, ${leftAfter.toFixed(0)} after this.`);
      else { bump(isPot && numbers.daysToEarn <= 60 ? 2 : 1); reasons.push(`${cat}: this would put you ${(-leftAfter).toFixed(0)} over ${isPot ? `what the yearly pot has built up (it catches up in ~${numbers.daysToEarn} days)` : 'this month\'s budget'}.`); }
    } else if (counted) reasons.push(`${cat} has no budget line; it still counts toward total spending.`);
    else reasons.push(`${cat} is outside everyday spending (not counted).`);

    if (counted && !isPot) {
      const projAfter = round2(fc.projected + amt);
      numbers.projectedMonthAfter = projAfter; numbers.monthlyBudget = monthly;
      if (projAfter > monthly) { bump(1); reasons.push(`Month-end projection would be ${projAfter.toFixed(0)} vs total budget ${monthly.toFixed(0)}.`); }
    }
    const savedAfter = round2(cf.projectedSaved - amt);
    numbers.projectedSavedAfter = savedAfter;

    const pol = cfg.policy || {}; const text = `${purchase.merchant || ''} ${purchase.description || ''}`.toUpperCase();
    for (const r of pol.rules || []) {
      if (r.categories && !r.categories.includes(cat)) continue;
      if (r.minAmount && amt < r.minAmount) continue;
      if (r.pattern && !re(r.pattern).test(text)) continue;
      switch (r.rule) {
        case 'savingsPositive': if (savedAfter < 0) { bump(3); reasons.push(`Policy "${r.name}": this month's savings would go negative (${savedAfter.toFixed(0)}).`); } break;
        case 'withinPot': if (b && b.left - amt < 0) { bump(2); reasons.push(`Policy "${r.name}": only buy from what the pot has built up.`); } break;
        case 'coolingOff': bump(2); reasons.push(`Policy "${r.name}": wait ${r.hours || 48}h, then buy if you still want it.`); break;
        case 'ask': questions.push(r.question || r.name); bump(1); break;
        case 'block': bump(3); reasons.push(`Policy "${r.name}"${r.message ? ': ' + r.message : ''}.`); break;
      }
    }
    const verdict = ['yes', 'yes-with-tradeoff', 'wait', 'no'][level];
    return { verdict, reasons, questions, numbers };
  }

  // ------------------------------------------------------------------ anomalies / fraud watch
  /**
   * Flags transactions worth a human look: possible fraud, duplicates, errors
   * and silent price rises. Each flag has a severity (high|medium|low), a score
   * and plain reasons. Nothing here blocks or disputes anything — it surfaces.
   *
   * Signals (weights in config.fraud.weights):
   *   newMerchantLarge  first charge from a merchant not seen in the lookback, >= newMerchantMin
   *   large             single debit >= largeAmount
   *   duplicate         same merchant and amount within duplicateDays (not a known recurring/transit)
   *   cardTesting       tiny charge (<= testMax) followed by a bigger one at the same merchant within 3 days
   *   quietAccount      spend on an account that rarely has card spend (config.fraud.quietAccounts or auto)
   *   risky             merchant matches riskyPatterns (ticket resale, gift cards, crypto, money transfer, betting)
   *   unusualCurrency   currency never seen before on that account
   *   priceCreep        recurring charge > priceCreepPct above its typical amount
   * Dismissed ids (config.fraud.dismissed) and allowMerchants are never flagged.
   */
  function anomalies(ledger, config, asOf) {
    const cfg = withDefaults(config);
    const f = Object.assign({
      windowDays: 60, lookbackDays: 365, largeAmount: 250, newMerchantMin: 40, duplicateDays: 1, testMax: 2,
      priceCreepPct: 0.15, riskyPatterns: ['VIAGOGO|STUBHUB|TICKOMBO|TICKETSWAP|SEATWAVE', 'GIFT ?CARD|PREPAID|VOUCHER', 'BINANCE|COINBASE|KRAKEN|CRYPTO|BITCOIN', 'WESTERN UNION|MONEYGRAM|REMITLY|WORLDREMIT', 'BET365|BETFAIR|PADDY ?POWER|WILLIAM HILL|CASINO|POKER'],
      quietAccounts: null, allowMerchants: [], dismissed: [], duplicateIgnoreCategories: ['Transport'],
      weights: { newMerchantLarge: 1, large: 1, duplicate: 3, cardTesting: 4, quietAccount: 3, risky: 3, unusualCurrency: 2, priceCreep: 1 },
    }, cfg.fraud || {});
    const W = Object.assign({ newMerchantLarge: 1, large: 1, duplicate: 3, cardTesting: 4, quietAccount: 3, risky: 3, unusualCurrency: 2, priceCreep: 1 }, f.weights || {});
    const end = asOf || ledger.map(r => r.date).sort().pop();
    const from = addDays(end, -f.windowDays), histFrom = addDays(end, -f.lookbackDays);
    const base = ledger.filter(r => !r.parent && r.kind !== 'transfer' && r.kind !== 'income');
    const debits = base.filter(r => r.amountHome < 0 && !r.refund);
    const recent = debits.filter(r => r.date >= from && r.date <= end);
    const keyOf = r => merchantKey(r.merchant || r.description);
    const allowed = r => f.allowMerchants.some(p => re(p).test(textOf(r))) || f.dismissed.includes(r.id);
    const rec = recurring(ledger, cfg); const recMap = Object.fromEntries(rec.map(x => [x.merchant, x]));
    const exclude = new Set(f.duplicateIgnoreCategories || []);
    // account profiles
    const acctSpend = {}; const acctCur = {};
    debits.filter(r => r.date >= histFrom).forEach(r => {
      const a = r.account || '?'; acctSpend[a] = acctSpend[a] || { n: 0, months: new Set() };
      if (r.kind === 'spend') { acctSpend[a].n++; acctSpend[a].months.add(r.month); }
    });
    base.forEach(r => { const a = r.account || '?'; (acctCur[a] = acctCur[a] || new Set()); });
    const quiet = new Set(f.quietAccounts || Object.entries(acctSpend).filter(([, v]) => v.n / Math.max(1, v.months.size) < 2).map(([a]) => a));
    const flags = {};
    const flag = (r, sig, why) => {
      if (allowed(r)) return;
      const x = flags[r.id] = flags[r.id] || { id: r.id, date: r.date, account: r.account, merchant: r.merchant || r.description, amount: round2(-r.amountHome), currency: r.currency, category: r.category, score: 0, signals: [], reasons: [] };
      if (x.signals.includes(sig)) return;
      x.signals.push(sig); x.reasons.push(why); x.score += W[sig] || 1;
    };
    for (const r of recent) {
      if (r.amortised) continue; // known yearly/quarterly charge, configured by the user
      const k = keyOf(r), amt = -r.amountHome;
      const prior = debits.filter(d => keyOf(d) === k && d.date < r.date && d.date >= histFrom);
      if (!prior.length && amt >= f.newMerchantMin && !recMap[k]) flag(r, 'newMerchantLarge', `First payment to this merchant in ${Math.round(f.lookbackDays / 30)} months (${amt.toFixed(2)}).`);
      if (amt >= f.largeAmount && !recMap[k] && !cfg.notCounted.includes(r.category)) flag(r, 'large', `Large payment (${amt.toFixed(2)} ≥ ${f.largeAmount}).`);
      if (!recMap[k] && !exclude.has(r.category)) {
        const dup = recent.find(d => d.id !== r.id && keyOf(d) === k && Math.abs(d.amountHome - r.amountHome) < 0.01 && Math.abs(diffDays(d.date, r.date)) <= f.duplicateDays);
        if (dup) flag(r, 'duplicate', `Same amount at the same merchant ${dup.date === r.date ? 'on the same day' : 'a day apart'} — possible double charge.`);
      }
      if (amt > f.testMax) {
        const tiny = debits.find(d => keyOf(d) === k && -d.amountHome <= f.testMax && d.date <= r.date && diffDays(r.date, d.date) <= 3 && d.id !== r.id);
        if (tiny) flag(r, 'cardTesting', `A tiny ${(-tiny.amountHome).toFixed(2)} charge at this merchant on ${tiny.date} preceded it — a common card-testing pattern.`);
      }
      if (quiet.has(r.account) && r.kind === 'spend' && !cfg.notCounted.includes(r.category)) flag(r, 'quietAccount', `Card-style spend on "${r.account}", an account that rarely has any.`);
      if (f.riskyPatterns.some(p => re(p).test(textOf(r)))) flag(r, 'risky', 'Merchant type often linked to scams or hard-to-reverse payments (resale tickets, gift cards, crypto, money transfer, betting).');
      const seenCur = base.filter(d => d.account === r.account && d.date < r.date && d.date >= histFrom).map(d => d.currency);
      if (seenCur.length >= 10 && !seenCur.includes(r.currency)) flag(r, 'unusualCurrency', `First ${r.currency} payment on this account.`);
      const rc = recMap[k];
      if (rc && amt > rc.typical * (1 + f.priceCreepPct) && amt - rc.typical >= 1) flag(r, 'priceCreep', `Recurring charge up from ~${rc.typical.toFixed(2)} to ${amt.toFixed(2)} (+${Math.round((amt / rc.typical - 1) * 100)}%).`);
    }
    return Object.values(flags).map(x => Object.assign(x, { severity: x.score >= 4 ? 'high' : x.score >= 2 ? 'medium' : 'low' }))
      .sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1));
  }

  return { amortiseRows, detectPeriodic, taxReserve, anomalies, checkPurchase, parseCSV, normaliseRows, merchantKey, classifyOne, enrich, pairRefunds, splitByReceipts, natureOf, budgetStatus, recurring, forecast, cashflow, summarise, explain, withDefaults, monthOf };
});
