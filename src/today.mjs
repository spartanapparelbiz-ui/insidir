/* Data for the signed-in Today screen and the signature chart.
 *
 *   GET /v1/chart?ticker=T&days=365   daily closes (src/prices.mjs) and every open-market insider buy and sale at T
 *                                     in that window, as markers on the price line; each marker links to its filing
 *   GET /v1/me/today                  the watchlist strip (last close, change, 30 closes, insider activity in the
 *                                     last 30 days) and the hero: the biggest open-market insider trade at the
 *                                     member's watchlist companies filed in the last 30 days (else across the
 *                                     market in the last 7), with its signal score (src/signal-score.mjs)
 *
 * Prices are daily closes, never live quotes, and say so. Nothing is invented: a ticker without stored closes shows
 * no price, and a quiet watchlist says so. Product routes (src/paywall.mjs fails closed on /v1). */
import { LINE_SQL, withRole, sentence, kindOf } from "./site-v2.mjs";
import { closesFor } from "./prices.mjs";
import { scoreRow } from "./signal-score.mjs";

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const SEC = /^https:\/\/(www\.)?sec\.gov\//;
const iso = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || "").slice(0, 10);
const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/* Closes for a ticker, giving the price download at most `ms` before using what is stored. */
async function closes(query, t, { ms = 2500, download = true } = {}) {
  if (!download) return closesFor(query, t, { download: false });
  return Promise.race([closesFor(query, t), new Promise(r => setTimeout(() => r(null), ms))]).then(x => x || closesFor(query, t, { download: false }));
}

export const MARKERS_SQL = LINE_SQL + `
  WHERE t.ticker=$1 AND t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed' AND NOT f.is_amendment
    AND t.transaction_date>=$2::date AND f.validation_status IS DISTINCT FROM 'flagged'
  ORDER BY t.transaction_date,t.id`;

export function marker(r) {
  return { id: String(r.id), day: iso(r.transaction_date), kind: kindOf(r), planned: kindOf(r) === "sell" && r.rule_10b5_1 === true,
    value: num(r.estimated_value), shares: num(r.shares), price: num(r.price_per_share), owner: r.owner_name || null, ownerCik: r.owner_cik || null,
    role: r.role || null, url: SEC.test(String(r.source_url || "")) ? r.source_url : null };
}

/* Last close and the change from the close before it. */
export function lastChange(series) {
  const last = series.at(-1), prev = series.at(-2);
  if (!last) return null;
  return { day: last[0], close: last[1], change: prev ? last[1] - prev[1] : null, pct: prev && prev[1] ? last[1] / prev[1] - 1 : null };
}

export async function chartData(query, ticker, { days = 365, now = Date.now() } = {}) {
  const t = String(ticker || "").toUpperCase();
  if (!TICKER.test(t)) return null;
  const d = Math.max(30, Math.min(1830, Number(days) || 365));
  const since = new Date(now - d * 864e5).toISOString().slice(0, 10);
  const [series, rows] = await Promise.all([closes(query, t), query(MARKERS_SQL, [t, since]).then(r => withRole(r.rows || []))]);
  const window = series.filter(p => p[0] >= since);
  return { ticker: t, name: rows.at(-1)?.issuer_name || null, closes: window, last: lastChange(window), markers: rows.map(marker),
    source: "Daily closes; insider trades from SEC Form 4", delayed: true };
}

const NAMES_SQL = `SELECT DISTINCT ON (ticker) ticker,issuer_name,issuer_cik FROM sec_filings WHERE ticker=ANY($1) AND issuer_name IS NOT NULL ORDER BY ticker,published_at DESC NULLS LAST`;
const ACTIVITY_SQL = `SELECT t.ticker,
    bool_or(t.transaction_code='P') AS bought, bool_or(t.transaction_code='S') AS sold, max(t.transaction_date) AS last_day
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE t.ticker=ANY($1) AND t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed' AND t.transaction_date>=current_date-30
  GROUP BY t.ticker`;
export const HERO_SQL = LINE_SQL + `
  WHERE ($1::text[] IS NULL OR t.ticker=ANY($1)) AND t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed'
    AND NOT f.is_amendment AND f.published_at>=now()-make_interval(days => $2) AND t.estimated_value IS NOT NULL AND t.ticker IS NOT NULL
    AND f.validation_status IS DISTINCT FROM 'flagged'
  ORDER BY t.estimated_value DESC,f.published_at DESC LIMIT 1`;

/* The Latest filings feed: newest open-market buys and sales, with each insider's role. */
export const FEED_SQL = LINE_SQL + `
  WHERE t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed' AND t.ticker IS NOT NULL
    AND f.validation_status IS DISTINCT FROM 'flagged'
  ORDER BY f.published_at DESC NULLS LAST,t.id DESC LIMIT $1`;
export const feedItem = r => ({ ...marker(r), ticker: String(r.ticker).toUpperCase(), name: r.issuer_name || null, filedAt: r.published_at || null });
export async function feedData(query, { limit = 40 } = {}) {
  const n = Math.max(1, Math.min(100, Number(limit) || 40));
  return { items: withRole((await query(FEED_SQL, [n])).rows).map(feedItem) };
}

/* Open-market insider buying and selling across every company, trades dated in the last 7 days (as filed so far). */
export const MARKET_SQL = `SELECT coalesce(sum(t.estimated_value) FILTER (WHERE t.transaction_code='P'),0)::float8 AS bought,
    coalesce(sum(t.estimated_value) FILTER (WHERE t.transaction_code='S'),0)::float8 AS sold,
    count(*) FILTER (WHERE t.transaction_code='P')::int AS buys, count(*) FILTER (WHERE t.transaction_code='S')::int AS sells
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE t.transaction_code IN ('P','S') AND NOT t.derivative AND f.ingest_status='parsed' AND NOT f.is_amendment
    AND t.transaction_date>=current_date-7 AND f.validation_status IS DISTINCT FROM 'flagged'`;

export async function todayData(query, userId) {
  const tickers = (await query("SELECT ticker FROM watchlist WHERE user_id=$1 ORDER BY created_at,ticker LIMIT 24", [userId])).rows.map(r => r.ticker).filter(t => TICKER.test(t));
  const [names, activity, series] = await Promise.all([
    tickers.length ? query(NAMES_SQL, [tickers]).then(r => new Map(r.rows.map(x => [x.ticker, x]))) : new Map(),
    tickers.length ? query(ACTIVITY_SQL, [tickers]).then(r => new Map(r.rows.map(x => [x.ticker, x]))) : new Map(),
    Promise.all(tickers.map(t => closes(query, t).catch(() => [])))
  ]);
  const watchlist = tickers.map((t, i) => {
    const s = series[i] || [], a = activity.get(t);
    return { ticker: t, name: names.get(t)?.issuer_name || null, last: lastChange(s), spark: s.slice(-31).map(p => p[1]),
      activity: a ? (a.bought && a.sold ? "mixed" : a.bought ? "buy" : "sell") : null, activityDay: a ? iso(a.last_day) : null };
  });
  let scope = "watchlist";
  let row = tickers.length ? withRole((await query(HERO_SQL, [tickers, 30])).rows)[0] : null;
  if (!row) { scope = "market"; row = withRole((await query(HERO_SQL, [null, 7])).rows)[0] || null; }
  const hero = row ? { scope, trade: { ...marker(row), ticker: String(row.ticker).toUpperCase(), name: row.issuer_name || null, filedAt: row.published_at || null,
    sentence: sentence(row) }, score: await scoreRow(query, { ...row, code: row.transaction_code }) } : null;
  const market = await query(MARKET_SQL).then(r => r.rows[0] || null).catch(() => null);
  return { watchlist, hero, market, pricesAre: "daily closes" };
}
