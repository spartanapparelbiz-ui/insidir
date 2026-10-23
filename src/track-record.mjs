/* Insider track record: how the stock did 1, 3 and 6 months after each of an insider's past open-market buys (Form 4
 * code P) and sales (code S), and the hit rate ("6 of their last 8 buys were up 3 months later").
 * docs/INSIDER-EDGE-PLAN.md section 1 has the method in words; the math is the pure functions below.
 *
 *   trade       one owner's non-derivative P (or S) lines at one issuer on one date, at the share-weighted price as
 *               filed. A 4/A that restates a line (same date, code, shares and price) replaces it, never adds to it.
 *   base price  the Form 4 price. With no price on the filing, or when it differs from the provider's (split-adjusted)
 *               close on the trade date by a split-sized ratio (a split since), that close is used instead.
 *   return      first close on or after trade date + 30 / 91 / 182 days, over the base price, minus 1. A horizon still
 *               in the future is pending (null), never estimated.
 *   hit         a buy whose return is above 0; a sale whose return is below 0 (the stock fell after they sold).
 *
 * Routes (Pro, like every /v1 product route; src/paywall.mjs):
 *   GET /v1/people/<cik>/track-record   the person page section: hit rates overall and per company, every trade
 *                                       with its returns and its Form 4 as Evidence
 *   withTrackRecords(rows)              adds track_record {line, ...} to transaction rows for the trade cards */
import { evidence } from "./evidence.mjs";
import { closesFor } from "./prices.mjs";

export const HORIZONS = Object.freeze([
  Object.freeze({ key: "1m", days: 30, words: "1 month", adj: "1-month" }),
  Object.freeze({ key: "3m", days: 91, words: "3 months", adj: "3-month" }),
  Object.freeze({ key: "6m", days: 182, words: "6 months", adj: "6-month" })]);
export const MIN_JUDGED = 3;            // fewer matured trades than this: shown, labelled too few to judge
export const SPLIT_RATIO = Object.freeze({ high: 1.8, low: 0.55 });
export const MAX_GAP_DAYS = 7;          // a close more than a week from the date asked for is no close (halted, delisted)
export const METHODOLOGY = "Return = first daily close on or after the trade date plus 30, 91 or 182 days, over the price per share reported on the Form 4 (share-weighted across the day's lines), minus 1. Closes are split-adjusted daily closes from Yahoo Finance; when the Form 4 reports no price, or a split since makes it incomparable, the close on the trade date is used. A buy counts as a hit when the stock was up; a sale when it was down.";
export const DISCLAIMER = "Past trades and past returns. Research, not investment advice.";

const keyOf = cik => { const s = String(cik ?? "").trim(); return /^\d{1,12}$/.test(s) ? s.replace(/^0+/, "") : ""; };
const dayOf = v => v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : null;
const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const round = (v, d = 6) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
export const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/* Binary search in [[YYYY-MM-DD, close]] (oldest first). */
function firstIndexAtOrAfter(series, day) {
  let lo = 0, hi = series.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (series[mid][0] < day) lo = mid + 1; else hi = mid; }
  return lo;
}
export function closeOnOrAfter(series, day, maxGap = MAX_GAP_DAYS) {
  const i = firstIndexAtOrAfter(series, day);
  return i < series.length && series[i][0] <= addDays(day, maxGap) ? { day: series[i][0], close: series[i][1] } : null;
}
export function closeOnOrBefore(series, day, maxGap = MAX_GAP_DAYS) {
  let i = firstIndexAtOrAfter(series, day);
  if (i < series.length && series[i][0] === day) return { day, close: series[i][1] };
  i--;
  return i >= 0 && series[i][0] >= addDays(day, -maxGap) ? { day: series[i][0], close: series[i][1] } : null;
}

/* Form 4 lines -> trades. Lines: sec_transactions rows (plus published_at, is_amendment, rule_10b5_1), each carrying
 * owner_key (the person it is attributed to: own lines, or a joint line expanded per owner). */
export function groupTrades(lines) {
  const restated = new Map();
  for (const l of lines) {
    const code = String(l.transaction_code || "").toUpperCase(), date = dayOf(l.transaction_date), shares = num(l.shares);
    if (l.derivative || !["P", "S"].includes(code) || !date || !(shares > 0) || l.superseded === true) continue;
    const owner = keyOf(l.owner_key ?? l.owner_cik), issuer = keyOf(l.issuer_cik);
    if (!owner || !issuer) continue;
    const price = num(l.price_per_share);
    const id = [owner, issuer, date, code, shares, price ?? ""].join("|");
    const prev = restated.get(id);
    // The same line filed again (a 4/A): keep the later filing, so the trade is counted once.
    if (!prev || String(l.published_at || "") > String(prev.published_at || "")) restated.set(id, { ...l, code, date, shares, price, owner, issuer });
  }
  const trades = new Map();
  for (const l of restated.values()) {
    const id = [l.owner, l.issuer, l.date, l.code].join("|");
    const t = trades.get(id) || { ownerKey: l.owner, issuerKey: l.issuer, date: l.date, code: l.code, ticker: null, ownerName: null, shares: 0, priced: 0, cost: 0,
      value: 0, lines: 0, accession: null, sourceUrl: null, filedOn: null, rule10b51: false, _pub: "" };
    t.shares += l.shares; t.lines++;
    if (l.price > 0) { t.priced += l.shares; t.cost += l.shares * l.price; }
    t.value += num(l.estimated_value) ?? (l.price > 0 ? l.shares * l.price : 0);
    if (l.rule_10b5_1 === true) t.rule10b51 = true;
    const pub = String(l.published_at instanceof Date ? l.published_at.toISOString() : l.published_at || "");
    // The trade's filing (its Evidence link): the first one that reported it.
    if (!t.accession || (pub && (!t._pub || pub < t._pub))) { t.accession = l.accession; t.sourceUrl = l.source_url; t.filedOn = dayOf(l.published_at); t._pub = pub; }
    if (l.ticker) t.ticker = String(l.ticker).toUpperCase();
    if (l.owner_name) t.ownerName = String(l.owner_name);
    trades.set(id, t);
  }
  return [...trades.values()].map(({ priced, cost, _pub, ...t }) => ({ ...t, price: priced > 0 ? round(cost / priced, 6) : null, value: round(t.value, 2) }))
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.code < b.code ? -1 : 1);
}

/* One trade's returns at each horizon. today: YYYY-MM-DD; a horizon after it is pending. */
export function tradeOutcome(trade, series, today) {
  const onDay = closeOnOrBefore(series, trade.date);
  let base = trade.price, baseSource = "form4";
  if (!(base > 0)) { base = onDay?.close ?? null; baseSource = "close"; }
  else if (onDay) { const r = base / onDay.close; if (r >= SPLIT_RATIO.high || r <= SPLIT_RATIO.low) { base = onDay.close; baseSource = "close"; } }
  const ret = {}, pending = {};
  for (const h of HORIZONS) {
    const target = addDays(trade.date, h.days);
    pending[h.key] = target > today;
    const at = pending[h.key] || !(base > 0) ? null : closeOnOrAfter(series, target);
    ret[h.key] = at ? round(at.close / base - 1) : null;
  }
  return { ...trade, base: base > 0 ? round(base, 6) : null, baseSource, ret, pending };
}

export const isHit = (code, r) => r == null ? null : code === "P" ? r > 0 : r < 0;

/* Hit rates for one side: { count, "1m": {n, hits, avg}, "3m": ..., "6m": ... }. n counts trades whose horizon passed. */
export function sideSummary(outcomes, code) {
  const mine = outcomes.filter(o => o.code === code);
  const out = { count: mine.length };
  for (const h of HORIZONS) {
    const rs = mine.map(o => o.ret[h.key]).filter(r => r != null);
    out[h.key] = { n: rs.length, hits: rs.filter(r => isHit(code, r)).length, avg: rs.length ? round(rs.reduce((a, b) => a + b, 0) / rs.length, 4) : null };
  }
  return out;
}
export const summarize = outcomes => ({ buys: sideSummary(outcomes, "P"), sells: sideSummary(outcomes, "S") });

/* "6 of their last 8 buys were up 3 months later" (null when nothing has matured). */
export function hitSentence(side, code, hKey = "3m") {
  const s = side?.[hKey], h = HORIZONS.find(x => x.key === hKey);
  if (!s || !s.n || !h) return null;
  const noun = code === "P" ? (s.n === 1 ? "buy" : "buys") : (s.n === 1 ? "sale" : "sales");
  const outcome = code === "P" ? "up" : "followed by a drop";
  if (s.n === 1) return `Their only ${noun} with a ${h.adj} result was ${s.hits ? "" : "not "}${outcome} (too few to judge).`;
  return `${s.hits} of their last ${s.n} ${noun} were ${outcome} ${h.words} later${s.n < MIN_JUDGED ? " (too few to judge)" : ""}.`;
}

/* The one line on a trade card: "This director's past buys: 6/8 up after 3 months." The side follows the row's own
 * code (a sale shows their sales), falling back to the other side when that one has no result yet. */
export function cardLine(record, { code = "P", role = null } = {}) {
  if (!record) return null;
  const who = role ? `This ${role}'s` : "This insider's";
  const sides = code === "S" ? [["S", record.sells], ["P", record.buys]] : [["P", record.buys], ["S", record.sells]];
  for (const [c, side] of sides) {
    const s = side?.["3m"];
    if (s?.n) return `${who} past ${c === "P" ? "buys" : "sales"}: ${s.hits}/${s.n} ${c === "P" ? "up" : "followed by a drop"} after 3 months.`;
  }
  const count = (record.buys?.count || 0) + (record.sells?.count || 0);
  return count ? `${who} open-market trades here are under 3 months old: no track record yet.` : null;
}

/* A short role for the card ("director", "CFO") from the reporting-owner boxes as filed (sec_filing_owners). */
export function roleWord(owner) {
  if (!owner) return null;
  const title = String(owner.officer_title || "").toLowerCase();
  if (owner.is_officer || title) {
    if (/chief executive|\bceo\b/.test(title)) return "CEO";
    if (/chief financial|\bcfo\b/.test(title)) return "CFO";
    if (/chief operating|\bcoo\b/.test(title)) return "COO";
    if (/general counsel|chief legal/.test(title)) return "general counsel";
    if (/president/.test(title)) return "president";
    if (!owner.is_director) return "officer";
  }
  if (owner.is_director) return "director";
  if (owner.is_ten_percent_owner) return "10% owner";
  return owner.is_officer ? "officer" : null;
}

/* ---------- PostgreSQL ---------- */

/* Every open-market line of one person (own lines, and joint lines through sec_filing_owners), optionally at one issuer. */
const PERSON_LINES_SQL = `SELECT LTRIM(t.owner_cik,'0') AS owner_key,t.owner_name,t.issuer_cik,t.ticker,t.transaction_date,t.transaction_code,t.derivative,
    t.shares,t.price_per_share,t.estimated_value,t.accession,t.source_url,f.published_at,f.rule_10b5_1
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE LTRIM(t.owner_cik,'0')=$1 AND ($2::text IS NULL OR LTRIM(t.issuer_cik,'0')=$2) AND NOT t.derivative AND t.transaction_code IN ('P','S')
    AND f.ingest_status='parsed' AND f.validation_status IS DISTINCT FROM 'flagged'
  UNION ALL
  SELECT LTRIM(o.owner_cik,'0'),o.owner_name,t.issuer_cik,t.ticker,t.transaction_date,t.transaction_code,t.derivative,
    t.shares,t.price_per_share,t.estimated_value,t.accession,t.source_url,f.published_at,f.rule_10b5_1
  FROM sec_filing_owners o JOIN sec_transactions t ON t.accession=o.accession AND t.owner_cik IS NULL JOIN sec_filings f ON f.accession=t.accession
  WHERE LTRIM(o.owner_cik,'0')=$1 AND ($2::text IS NULL OR LTRIM(t.issuer_cik,'0')=$2) AND NOT t.derivative AND t.transaction_code IN ('P','S')
    AND f.ingest_status='parsed' AND f.validation_status IS DISTINCT FROM 'flagged'`;
const ROLE_SQL = `SELECT o.is_director,o.is_officer,o.officer_title,o.is_ten_percent_owner FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
  WHERE LTRIM(o.owner_cik,'0')=$1 AND LTRIM(f.issuer_cik,'0')=$2 ORDER BY f.published_at DESC NULLS LAST LIMIT 1`;

/* Pairs whose record is missing, older than a changed line, or a day old (horizons mature every day). */
export const STALE_PAIRS_SQL = `WITH lines AS (
    SELECT LTRIM(t.owner_cik,'0') AS owner_key,LTRIM(t.issuer_cik,'0') AS issuer_key,t.created_at FROM sec_transactions t
      WHERE t.category IN ('reported_purchase','reported_sale') AND NOT t.derivative AND t.transaction_code IN ('P','S') AND t.owner_cik IS NOT NULL
    UNION ALL
    SELECT LTRIM(o.owner_cik,'0'),LTRIM(t.issuer_cik,'0'),t.created_at FROM sec_transactions t JOIN sec_filing_owners o ON o.accession=t.accession
      WHERE t.category IN ('reported_purchase','reported_sale') AND NOT t.derivative AND t.transaction_code IN ('P','S') AND t.owner_cik IS NULL),
  pairs AS (SELECT owner_key,issuer_key,max(created_at) AS changed FROM lines GROUP BY 1,2)
  SELECT p.owner_key,p.issuer_key FROM pairs p LEFT JOIN insider_track_records r USING (owner_key,issuer_key)
  WHERE r.computed_at IS NULL OR r.computed_at<p.changed OR r.computed_at<now()-interval '1 day'
  ORDER BY (r.computed_at IS NULL) DESC,p.changed DESC LIMIT $1`;

const todayUtc = now => new Date(now).toISOString().slice(0, 10);

/* Recompute one owner at one issuer: the trades, their returns and the hit rates. Returns the outcomes. */
export async function refreshPair(query, ownerKey, issuerKey, { fetcher, now = Date.now(), download = true } = {}) {
  const lines = (await query(PERSON_LINES_SQL, [ownerKey, issuerKey])).rows;
  const trades = groupTrades(lines);
  const ticker = trades.find(t => t.ticker)?.ticker || null;
  const series = ticker ? await closesFor(query, ticker, { fetcher, now, download }) : [];
  const outcomes = trades.map(t => tradeOutcome(t, series, todayUtc(now)));
  const record = summarize(outcomes);
  const role = roleWord((await query(ROLE_SQL, [ownerKey, issuerKey])).rows[0]);
  await query("DELETE FROM insider_trade_outcomes WHERE owner_key=$1 AND issuer_key=$2", [ownerKey, issuerKey]);
  for (const o of outcomes)
    await query(`INSERT INTO insider_trade_outcomes(owner_key,issuer_key,trade_date,code,ticker,owner_name,shares,base_price,base_source,value,lines,accession,source_url,filed_on,rule_10b5_1,ret_1m,ret_3m,ret_6m)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING`,
      [ownerKey, issuerKey, o.date, o.code, o.ticker || ticker, o.ownerName, o.shares, o.base, o.baseSource, o.value, o.lines, o.accession, o.sourceUrl, o.filedOn, o.rule10b51,
        o.ret["1m"], o.ret["3m"], o.ret["6m"]]);
  await query(`INSERT INTO insider_track_records(owner_key,issuer_key,ticker,role,buys,sells,last_trade_date,computed_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())
    ON CONFLICT (owner_key,issuer_key) DO UPDATE SET ticker=EXCLUDED.ticker,role=EXCLUDED.role,buys=EXCLUDED.buys,sells=EXCLUDED.sells,
    last_trade_date=EXCLUDED.last_trade_date,computed_at=now()`,
    [ownerKey, issuerKey, ticker, role, JSON.stringify(record.buys), JSON.stringify(record.sells), outcomes[0]?.date || null]);
  return outcomes;
}

/* The worker: recompute stale pairs, at most `limit` a run and `downloads` new price series (others use what is stored). */
export async function refreshTrackRecords(query, { limit = 200, downloads = 40, fetcher, now = Date.now() } = {}) {
  const pairs = (await query(STALE_PAIRS_SQL, [limit])).rows;
  const fetched = new Set();
  let done = 0, failed = 0;
  for (const p of pairs) {
    try {
      const ticker = (await query("SELECT ticker FROM sec_transactions WHERE LTRIM(issuer_cik,'0')=$1 AND ticker IS NOT NULL ORDER BY transaction_date DESC NULLS LAST LIMIT 1", [p.issuer_key])).rows[0]?.ticker;
      const download = !!ticker && (fetched.has(ticker) || fetched.size < downloads);
      if (ticker) fetched.add(ticker);
      await refreshPair(query, p.owner_key, p.issuer_key, { fetcher, now, download });
      done++;
    } catch (e) { failed++; console.warn(JSON.stringify({ event: "track_record.failed", owner: p.owner_key, issuer: p.issuer_key, error: String(e?.message || e) })); }
  }
  return { pairs: pairs.length, done, failed, priceSeries: fetched.size };
}

/* ---------- the person page: GET /v1/people/<cik>/track-record ---------- */
const ROUTE = /^\/v1\/people\/(\d{1,12})\/track-record$/;
export const isTrackRecordRoute = pathname => ROUTE.test(String(pathname || ""));
const failure = (status, message) => Object.assign(new Error(message), { status });

const outcomeEvidence = o => evidence({ source: "SEC Form 4", title: `${o.ticker || "Issuer"}: open-market ${o.code === "P" ? "purchase" : "sale"} (code ${o.code})`,
  entity: { name: o.owner_name, cik: o.owner_key }, filedOn: o.filed_on, period: { start: o.trade_date, end: o.trade_date, type: "transaction date" },
  field: "nonDerivativeTransaction/transactionPricePerShare", value: o.base_price, units: "USD per share",
  methodology: o.base_source === "form4" ? METHODOLOGY : "No comparable price on the Form 4: the base is the provider's close on the trade date. " + METHODOLOGY, url: o.source_url });

const fromRow = o => ({ code: o.code, ret: { "1m": num(o.ret_1m), "3m": num(o.ret_3m), "6m": num(o.ret_6m) } });

export async function personTrackRecord(query, cikValue, { fetcher, now = Date.now(), maxRefresh = 10 } = {}) {
  const owner = keyOf(cikValue);
  if (!owner) throw failure(400, "Invalid SEC reporting-person CIK");
  // Compute on first view (bounded) so the section is never empty while the worker catches up.
  let records = (await query("SELECT * FROM insider_track_records WHERE owner_key=$1", [owner])).rows;
  if (!records.length) {
    const issuers = (await query(`SELECT DISTINCT LTRIM(issuer_cik,'0') AS issuer_key FROM (${PERSON_LINES_SQL}) x LIMIT $3`, [owner, null, maxRefresh])).rows;
    for (const i of issuers) await refreshPair(query, owner, i.issuer_key, { fetcher, now });
    records = (await query("SELECT * FROM insider_track_records WHERE owner_key=$1", [owner])).rows;
  }
  const rows = (await query(`SELECT owner_key,issuer_key,to_char(trade_date,'YYYY-MM-DD') AS trade_date,code,ticker,owner_name,shares::float8 AS shares,
      base_price::float8 AS base_price,base_source,value::float8 AS value,lines,accession,source_url,to_char(filed_on,'YYYY-MM-DD') AS filed_on,rule_10b5_1,
      ret_1m::float8 AS ret_1m,ret_3m::float8 AS ret_3m,ret_6m::float8 AS ret_6m
    FROM insider_trade_outcomes WHERE owner_key=$1 ORDER BY trade_date DESC,code LIMIT 500`, [owner])).rows;
  const today = todayUtc(now);
  const overall = summarize(rows.map(fromRow));
  return {
    person: { cik: owner.padStart(10, "0"), name: rows[0]?.owner_name || null },
    overall: { ...overall, sentences: { buys: hitSentence(overall.buys, "P"), sells: hitSentence(overall.sells, "S") } },
    companies: records.sort((a, b) => String(b.last_trade_date || "").localeCompare(String(a.last_trade_date || ""))).map(r => ({
      issuer_cik: r.issuer_key.padStart(10, "0"), ticker: r.ticker, role: r.role, buys: r.buys, sells: r.sells,
      card: cardLine(r, { role: r.role }), sentences: { buys: hitSentence(r.buys, "P"), sells: hitSentence(r.sells, "S") }, computed_at: r.computed_at })),
    trades: rows.map(o => ({ trade_date: o.trade_date, code: o.code, ticker: o.ticker, issuer_cik: o.issuer_key.padStart(10, "0"), shares: o.shares, price: o.base_price,
      price_source: o.base_source, value: o.value, lines: o.lines, pre_scheduled: o.rule_10b5_1 === true, accession: o.accession, filing_url: o.source_url,
      returns: Object.fromEntries(HORIZONS.map(h => [h.key, num(o["ret_" + h.key])])),
      pending: Object.fromEntries(HORIZONS.map(h => [h.key, addDays(o.trade_date, h.days) > today])),
      hits: Object.fromEntries(HORIZONS.map(h => [h.key, isHit(o.code, num(o["ret_" + h.key]))])),
      evidence: outcomeEvidence(o) })),
    horizons: HORIZONS, minJudged: MIN_JUDGED, methodology: METHODOLOGY, priceSource: { name: "Yahoo Finance", delayed: true }, disclaimer: DISCLAIMER
  };
}

export async function handleTrackRecordRoute(req, res, url, { query, requireUser, fetcher }) {
  const m = ROUTE.exec(url.pathname);
  if (!m) return false;
  if (req.method !== "GET" && req.method !== "HEAD") throw failure(405, "Method not allowed");
  if (requireUser) await requireUser(req);
  const body = await personTrackRecord(query, m[1], { fetcher });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
  return true;
}

/* ---------- the trade cards ---------- */
/* Adds track_record {line, role, buys3m, sells3m, url} to every single-owner P or S row whose owner has a record at that
 * issuer (one query for the whole list). Rows without one are left as they are. */
export async function withTrackRecords(rows, query) {
  const want = rows.filter(r => r && r.owner_cik && r.issuer_cik && ["P", "S"].includes(String(r.transaction_code || "").toUpperCase()) && !r.derivative);
  if (!want.length) return rows;
  const owners = want.map(r => keyOf(r.owner_cik)), issuers = want.map(r => keyOf(r.issuer_cik));
  let found;
  try {
    found = (await query(`SELECT r.* FROM insider_track_records r JOIN unnest($1::text[],$2::text[]) AS x(o,i) ON r.owner_key=x.o AND r.issuer_key=x.i`, [owners, issuers])).rows;
  } catch { return rows; } // before the migration has run: the cards simply have no line
  const byPair = new Map(found.map(r => [r.owner_key + "|" + r.issuer_key, r]));
  for (const row of want) {
    const r = byPair.get(keyOf(row.owner_cik) + "|" + keyOf(row.issuer_cik));
    if (!r) continue;
    const line = cardLine(r, { code: String(row.transaction_code).toUpperCase(), role: r.role });
    if (line) row.track_record = { line, role: r.role, buys3m: r.buys?.["3m"] || null, sells3m: r.sells?.["3m"] || null, url: "person.html?cik=" + keyOf(row.owner_cik) + "#track-record" };
  }
  return rows;
}
