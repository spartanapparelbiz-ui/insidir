/* Data for the signed-in ticker page (company.html).
 *
 *   GET /v1/ticker/<T>/insiders   every insider who bought or sold T on the open market in the last two years: role,
 *                                 buys and sales (count and dollars), the latest trade with its filing, and their
 *                                 track record at this company (src/track-record.mjs): the 3-month hit rate of past
 *                                 buys and each buy's 3-month return, for the bar sparkline
 *   GET /v1/ticker/<T>/funds      13F holdings of T by the funds Insidir imports (src/form13f.mjs): the latest
 *                                 quarter per fund and the change in shares from the quarter before. 13F rows carry a
 *                                 CUSIP, not a ticker, so they are matched to T by the issuer's name as filed
 *                                 (normalised: case, punctuation and the company-form suffix) and say so.
 * Nothing is estimated: an insider with no matured buys shows no hit rate; a fund that does not hold T is not listed. */
import { withRole, kindOf } from "./site-v2.mjs";

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const SEC = /^https:\/\/(www\.)?sec\.gov\//;
const iso = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || "").slice(0, 10);
const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export const INSIDERS_SQL = `SELECT LTRIM(t.owner_cik,'0') AS owner_key,max(t.owner_name) AS owner_name,max(t.issuer_cik) AS issuer_cik,
    bool_or(o.is_director) AS is_director,bool_or(o.is_officer) AS is_officer,max(o.officer_title) AS officer_title,bool_or(o.is_ten_percent_owner) AS is_ten_percent_owner,
    count(*) FILTER (WHERE t.transaction_code='P')::int AS buys,coalesce(sum(t.estimated_value) FILTER (WHERE t.transaction_code='P'),0)::float8 AS bought,
    count(*) FILTER (WHERE t.transaction_code='S')::int AS sells,coalesce(sum(t.estimated_value) FILTER (WHERE t.transaction_code='S'),0)::float8 AS sold,
    max(t.transaction_date) AS last_day
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  LEFT JOIN sec_filing_owners o ON o.accession=t.accession AND LTRIM(o.owner_cik,'0')=LTRIM(t.owner_cik,'0')
  WHERE t.ticker=$1 AND t.owner_cik IS NOT NULL AND t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed' AND NOT f.is_amendment
    AND t.transaction_date>=current_date-730
  GROUP BY 1 ORDER BY max(t.transaction_date) DESC LIMIT 60`;
export const LAST_SQL = `SELECT DISTINCT ON (LTRIM(t.owner_cik,'0')) LTRIM(t.owner_cik,'0') AS owner_key,t.transaction_date,t.transaction_code,t.estimated_value,t.source_url,f.rule_10b5_1
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE t.ticker=$1 AND t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed' AND NOT f.is_amendment
  ORDER BY LTRIM(t.owner_cik,'0'),t.transaction_date DESC,f.published_at DESC`;
export const TRACK_SQL = `SELECT owner_key,buys FROM insider_track_records WHERE ticker=$1`;
export const OUTCOMES_SQL = `SELECT owner_key,trade_date,ret_3m::float8 AS r FROM insider_trade_outcomes WHERE ticker=$1 AND code='P' ORDER BY owner_key,trade_date`;

export async function tickerInsiders(query, ticker) {
  const t = String(ticker || "").toUpperCase();
  if (!TICKER.test(t)) return null;
  const [rows, last, track, outcomes] = await Promise.all([
    query(INSIDERS_SQL, [t]).then(r => withRole(r.rows || [])),
    query(LAST_SQL, [t]).then(r => new Map(r.rows.map(x => [x.owner_key, x]))),
    query(TRACK_SQL, [t]).then(r => new Map(r.rows.map(x => [x.owner_key, x.buys?.["3m"] || null]))).catch(() => new Map()),
    query(OUTCOMES_SQL, [t]).then(r => r.rows).catch(() => [])
  ]);
  const bars = new Map();
  for (const o of outcomes) { if (!bars.has(o.owner_key)) bars.set(o.owner_key, []); bars.get(o.owner_key).push(o.r == null ? null : Math.round(o.r * 1000) / 1000); }
  return { ticker: t, items: rows.map(r => {
    const l = last.get(r.owner_key), tr = track.get(r.owner_key);
    return { ownerCik: r.owner_key, owner: r.owner_name, role: r.role, buys: r.buys, bought: r.bought, sells: r.sells, sold: r.sold,
      last: l ? { day: iso(l.transaction_date), kind: kindOf(l), planned: kindOf(l) === "sell" && l.rule_10b5_1 === true, value: num(l.estimated_value),
        url: SEC.test(String(l.source_url || "")) ? l.source_url : null } : null,
      track: tr && tr.n ? { n: tr.n, hits: tr.hits } : null, bars: (bars.get(r.owner_key) || []).slice(-8) };
  }) };
}

/* "APPLE INC." / "Apple Inc" / "APPLE INC COM" → "APPLE" */
export function nameKey(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\b(COM|COMMON|STOCK|SHS|CL [AB]|CLASS [AB]|NEW)\b/g, " ")
    .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|HOLDINGS?|GROUP|N V|S A|THE)\b/g, " ").replace(/\s+/g, " ").trim();
}

export const FUNDS_SQL = `WITH latest AS (
    SELECT DISTINCT ON (f.manager_cik,f.period_of_report) f.manager_cik,f.accession,f.period_of_report,f.filed_at,f.source_url
    FROM form13f_filings f ORDER BY f.manager_cik,f.period_of_report DESC,f.filed_at DESC)
  SELECT l.manager_cik,m.name AS manager,l.period_of_report,l.source_url,h.issuer_name,sum(h.value_usd)::float8 AS value,sum(h.shares_or_principal)::float8 AS shares
  FROM latest l JOIN form13f_managers m ON m.cik=l.manager_cik JOIN form13f_holdings h ON h.accession=l.accession
  WHERE h.put_call IS NULL AND upper(h.issuer_name) LIKE $1
  GROUP BY 1,2,3,4,5 ORDER BY l.manager_cik,l.period_of_report DESC`;

export async function tickerFunds(query, ticker, issuerName) {
  const t = String(ticker || "").toUpperCase(), key = nameKey(issuerName);
  if (!TICKER.test(t) || !key) return { ticker: t, items: [], matchedBy: "issuer name" };
  const rows = (await query(FUNDS_SQL, [key.split(" ")[0] + "%"]).catch(() => ({ rows: [] }))).rows.filter(r => nameKey(r.issuer_name) === key);
  const byFund = new Map();
  for (const r of rows) { if (!byFund.has(r.manager_cik)) byFund.set(r.manager_cik, []); byFund.get(r.manager_cik).push(r); }
  const items = [...byFund.values()].map(list => {
    const [now, prev] = list;
    return { fundCik: now.manager_cik, fund: now.manager, period: iso(now.period_of_report), value: now.value, shares: now.shares,
      change: prev && prev.shares ? now.shares / prev.shares - 1 : null, isNew: !prev, url: SEC.test(String(now.source_url || "")) ? now.source_url : null };
  }).sort((a, b) => (b.value || 0) - (a.value || 0));
  return { ticker: t, items, matchedBy: "issuer name", note: "Funds whose 13F filings Insidir imports. 13F holdings list a CUSIP, not a ticker, so they are matched by the company's name as filed." };
}
