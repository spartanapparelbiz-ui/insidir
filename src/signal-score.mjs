/* Signal score (0–100, Low / Medium / High) for one open-market insider trade: how much the filing says, by fixed
 * rules from docs/INSIDER-EDGE-PLAN.md §2. It describes the filing; it is not a forecast or a recommendation.
 *
 *   Factor                                                            Points
 *   Open-market buy (code P) / sale (code S)                          buy 30, sale 5
 *   Size vs holdings: shares / shares held before the trade           up to 20 (50% or more of the holding = 20)
 *   Cluster: other insiders buying at the company within 10 days      1 other = 15, 2 or more others = 20 (buys)
 *   This insider's first buy at the company in 12+ months             10 (buys)
 *   Bought after a 20%+ fall (trade-day close vs the 60-day high)     10 (buys)
 *   Track record: 3-month hit rate of past buys >= 60% on 3 or more   5 to 10 (buys)
 *
 * Sales under a 10b5-1 plan are labelled pre-scheduled and capped at 15. Routine codes (awards, gifts, tax
 * withholding, option exercises) are not scored here: they score 5 and say so. Bands: 0–39 Low, 40–69 Medium,
 * 70–100 High. Each score has one plain-English sentence from its largest factors. */

export const VERSION = 1;
export const BANDS = Object.freeze([[70, "High"], [40, "Medium"], [0, "Low"]]);
export const bandOf = s => BANDS.find(([min]) => s >= min)[1];
const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const pct = x => Math.round(x * 100) + "%";

/* The trade: { code, shares, shares_after, rule_10b5_1, role }.
 * ctx: { others: other insiders buying within 10 days, firstIn12m: boolean, drawdown: trade-day close vs 60-day high
 * (e.g. -0.24), track: { n, hits } (3-month outcomes of this insider's past buys) }. Missing context scores 0. */
export function scoreTrade(t, ctx = {}) {
  const code = String(t.code || t.transaction_code || "").toUpperCase();
  const who = "the " + (t.role || "insider");
  if (code !== "P" && code !== "S") return finish(5, [{ key: "routine", points: 5, text: "a routine filing (not an open-market trade)" }], { code });
  const factors = [];
  const shares = num(t.shares), after = num(t.shares_after);
  if (code === "P") {
    factors.push({ key: "buy", points: 30, text: `${who} bought on the open market with their own money` });
  } else {
    factors.push({ key: "sale", points: 5, text: "a sale, which says less than a buy" });
  }
  if (shares > 0 && after != null) {
    const before = code === "P" ? after - shares : after + shares;
    if (before <= 0 && code === "P") factors.push({ key: "size", points: 20, text: "a brand-new position" });
    else if (before > 0) {
      const share = shares / before;
      const points = Math.min(20, Math.round(share / 0.5 * 20));
      if (points > 0) factors.push({ key: "size", points, text: code === "P" ? `adding ${pct(share)} to their stake` : `selling ${pct(Math.min(1, share))} of their stake` });
    }
  }
  if (code === "P") {
    const others = Math.max(0, Math.floor(num(ctx.others) || 0));
    if (others >= 1) factors.push({ key: "cluster", points: others >= 2 ? 20 : 15, text: `${others + 1} insiders bought within 10 days` });
    if (ctx.firstIn12m === true) factors.push({ key: "first", points: 10, text: "their first buy here in over a year" });
    const dd = num(ctx.drawdown);
    if (dd != null && dd <= -0.2) factors.push({ key: "drop", points: 10, text: `after a ${pct(-dd)} fall from the 60-day high` });
    const n = num(ctx.track?.n) || 0, hits = num(ctx.track?.hits) || 0;
    if (n >= 3 && hits / n >= 0.6) factors.push({ key: "track", points: 5 + Math.round(5 * Math.min(1, (hits / n - 0.6) / 0.4)), text: `${hits} of their ${n} past buys rose within 3 months` });
  }
  let score = factors.reduce((s, f) => s + f.points, 0);
  const planned = code === "S" && t.rule_10b5_1 === true;
  if (planned) { score = Math.min(score, 15); factors.push({ key: "planned", points: 0, text: "pre-scheduled under a 10b5-1 plan" }); }
  return finish(Math.min(100, score), factors, { code, planned });
}

function finish(score, factors, { code, planned = false }) {
  const band = bandOf(score);
  const top = [...factors].sort((a, b) => b.points - a.points);
  const lead = planned ? factors.filter(f => f.key === "planned") : top.slice(0, 3);
  const parts = planned ? [...lead, ...top.filter(f => f.key !== "planned").slice(0, 1)] : lead;
  const sentence = `${band}: ${parts.map(f => f.text).join(", ")}.`.replace(/^(\w+): (\w)/, (m, b, c) => `${b}: ${c.toUpperCase()}`);
  return { score, band, factors, sentence, code, version: VERSION };
}

/* ---------- context from PostgreSQL ---------- */
const OTHERS_SQL = `SELECT count(DISTINCT LTRIM(t.owner_cik,'0'))::int AS n FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE LTRIM(t.issuer_cik,'0')=LTRIM($1,'0') AND t.transaction_code='P' AND NOT t.derivative AND f.ingest_status='parsed'
    AND t.transaction_date BETWEEN $2::date-10 AND $2::date+10 AND LTRIM(t.owner_cik,'0')<>LTRIM($3,'0')`;
const PRIOR_SQL = `SELECT 1 FROM sec_transactions t WHERE LTRIM(t.issuer_cik,'0')=LTRIM($1,'0') AND LTRIM(t.owner_cik,'0')=LTRIM($3,'0')
  AND t.transaction_code='P' AND NOT t.derivative AND t.transaction_date>=$2::date-365 AND t.transaction_date<$2::date LIMIT 1`;
const DRAWDOWN_SQL = `SELECT (SELECT close FROM price_daily WHERE ticker=$1 AND day<=$2::date ORDER BY day DESC LIMIT 1)::float8 AS close,
  (SELECT max(close) FROM price_daily WHERE ticker=$1 AND day BETWEEN $2::date-60 AND $2::date)::float8 AS high`;
const TRACK_SQL = `SELECT buys FROM insider_track_records WHERE owner_key=LTRIM($1,'0') AND issuer_key=LTRIM($2,'0')`;

export async function scoreContext(query, t) {
  const day = String(t.transaction_date instanceof Date ? t.transaction_date.toISOString() : t.transaction_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !t.issuer_cik || !t.owner_cik) return {};
  const [others, prior, dd, track] = await Promise.all([
    query(OTHERS_SQL, [t.issuer_cik, day, t.owner_cik]).then(r => r.rows[0]?.n || 0).catch(() => 0),
    query(PRIOR_SQL, [t.issuer_cik, day, t.owner_cik]).then(r => r.rows.length === 0).catch(() => null),
    t.ticker ? query(DRAWDOWN_SQL, [String(t.ticker).toUpperCase(), day]).then(r => r.rows[0]).catch(() => null) : null,
    query(TRACK_SQL, [t.owner_cik, t.issuer_cik]).then(r => r.rows[0]?.buys?.["3m"] || null).catch(() => null)
  ]);
  return { others, firstIn12m: prior, drawdown: dd?.close && dd?.high ? dd.close / dd.high - 1 : null, track };
}

export async function scoreRow(query, t) { return scoreTrade(t, await scoreContext(query, t)); }
