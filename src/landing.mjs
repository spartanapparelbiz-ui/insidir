/* The landing page (insidir.com/), server-rendered with live data so the first paint is real: built for a phone in
 * Instagram's in-app browser, a visitor who has never heard of a Form 4, and five seconds.
 *
 * On the one design system (web/assets/css/ui.css + site.css, src/site-ui.mjs): a centered hero with the search box and
 * a tilted shot of the product, drawn from the app's own components and this week's real filings, then seven calm
 * sections 160px apart: Live this week → How it works → Receipts → Comparison → Pricing → FAQ → Final CTA. Every
 * section is one headline, one sentence and one visual (docs/LANDING-COPY.md has the copy). No mock data: every trade
 * is a row from the import with its SEC filing link; a part with no data is left out, never faked.
 *
 *   GET /, /index.html     the page (cached for CACHE_MS)
 *   GET /v1/live           the newest filings, as rows for the live list (site-v2.js adds new ones) */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { esc, money, day, ago, pct, sentence, withRole, LINE_SQL, scripts, kindOf, personName, companyName } from "./site-v2.mjs";
import { uiHead, uiNav, uiFooter, uiSearch, uiLogo, uiBig, uiTrade, uiInitials, WORDMARK, EXAMPLES } from "./site-ui.mjs";
import { scoreRow } from "./signal-score.mjs";
import { siteOrigin } from "./public-pages.mjs";
import { closesFor } from "./prices.mjs";
import { addDays, closeOnOrAfter, closeOnOrBefore } from "./track-record.mjs";
import { COMPETITORS, CHECKED_ON } from "./landing-competitors.mjs";

export const CACHE_MS = 60_000;
export const H1 = Object.freeze({
  a: "See when CEOs buy and sell their own stock.",
  b: "The people running your stocks have to tell on themselves. We tell you first."
});
export const SUB = "Insiders have to report every trade to the SEC. Insidir reads every filing and tells you what it means in plain English, minutes after it posts.";

/* ---------- data ---------- */
/* The week's five largest open-market purchases, one per trade (a joint filing counts once). */
export const WEEK_BUYS_SQL = `SELECT * FROM (SELECT DISTINCT ON (x.accession,x.transaction_date,x.shares,x.price_per_share) x.* FROM (${LINE_SQL}
  WHERE f.ingest_status='parsed' AND NOT f.is_amendment AND NOT t.derivative AND t.transaction_code='P' AND t.estimated_value IS NOT NULL
    AND f.validation_status IS DISTINCT FROM 'flagged' AND t.transaction_date>=current_date-7) x
  ORDER BY x.accession,x.transaction_date,x.shares,x.price_per_share) y ORDER BY y.estimated_value DESC LIMIT $1`;
const weekBuys = async (query, limit = 5) => withRole((await query(WEEK_BUYS_SQL, [limit])).rows || []);
export const LIVE_SQL = LINE_SQL + `
  WHERE f.ingest_status='parsed' AND NOT t.derivative AND t.transaction_code IN ('P','S') AND t.estimated_value IS NOT NULL AND t.ticker IS NOT NULL
    AND f.validation_status IS DISTINCT FROM 'flagged'
  ORDER BY f.published_at DESC NULLS LAST,t.id DESC LIMIT $1`;
export const COUNTERS_SQL = `SELECT
  (SELECT count(*) FROM sec_filings WHERE retrieved_at>=date_trunc('day',now()))::int AS filings_today,
  (SELECT count(*) FROM sec_transactions WHERE created_at>=date_trunc('month',now()))::int AS trades_month`;
/* Receipts: open-market purchases (code P) in the last ~6 months, original filings, with a value. */
export const RECEIPT_LINES_SQL = `SELECT t.ticker,t.issuer_cik,t.owner_cik,t.owner_name,t.accession,t.transaction_date,t.shares,t.price_per_share,t.estimated_value,t.source_url,f.issuer_name
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE f.ingest_status='parsed' AND NOT f.is_amendment AND NOT t.derivative AND t.transaction_code='P' AND t.estimated_value IS NOT NULL AND t.ticker IS NOT NULL
    AND f.validation_status IS DISTINCT FROM 'flagged' AND t.transaction_date>=current_date-200
  ORDER BY t.issuer_cik,t.transaction_date`;
export const RECEIPT_RULE = "Every open-market buy over $1M where two or more insiders at the same company bought within 10 days, in the last 6 months. All of them, up or down.";
export const RECEIPT_MIN_USD = 1_000_000, RECEIPT_WINDOW_DAYS = 10, RECEIPT_LOOKBACK_DAYS = 182;

/* The fixed rule, in code: per company, buys chain into a cluster while each is within 10 days of the cluster's first
 * buy; a cluster counts when two or more different insiders bought and the total is over $1M. Pure, tested. */
export function clusterBuys(lines, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const since = addDays(today, -RECEIPT_LOOKBACK_DAYS), byIssuer = new Map();
  for (const l of lines) {
    const d = l.transaction_date instanceof Date ? l.transaction_date.toISOString().slice(0, 10) : String(l.transaction_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < since || d > today) continue;
    const key = String(l.issuer_cik || l.ticker);
    if (!byIssuer.has(key)) byIssuer.set(key, []);
    byIssuer.get(key).push({ ...l, d, value: Number(l.estimated_value) || 0, who: String(l.owner_cik || l.owner_name || l.accession).replace(/^0+/, "") });
  }
  const out = [];
  for (const rows of byIssuer.values()) {
    rows.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    let cur = null;
    const close = () => { if (cur && new Set(cur.rows.map(r => r.who)).size >= 2 && cur.total > RECEIPT_MIN_USD) out.push(cur); };
    for (const r of rows) {
      if (!cur || r.d > addDays(cur.start, RECEIPT_WINDOW_DAYS)) { close(); cur = { start: r.d, end: r.d, total: 0, rows: [] }; }
      cur.rows.push(r); cur.total += r.value; cur.end = r.d;
    }
    close();
  }
  return out.map(c => ({ ticker: String(c.rows[0].ticker).toUpperCase(), issuer_name: c.rows[0].issuer_name, start: c.start, end: c.end, total: c.total,
    insiders: new Set(c.rows.map(r => r.who)).size, filing: c.rows.find(r => /^https:\/\/(www\.)?sec\.gov\//.test(String(r.source_url || "")))?.source_url || null }))
    .sort((a, b) => a.start < b.start ? 1 : a.start > b.start ? -1 : b.total - a.total);
}
/* What the stock did 30 and 90 days after the cluster's first buy, from the close that day. Pending until then. */
export function receiptReturns(c, series, today) {
  const base = closeOnOrBefore(series, c.start);
  const at = days => { const target = addDays(c.start, days); if (target > today) return { pending: true, on: target };
    const hit = closeOnOrAfter(series, target); return base && hit ? { r: Math.round((hit.close / base.close - 1) * 10000) / 10000 } : { r: null }; };
  return { d30: at(30), d90: at(90) };
}

const cache = new Map();
async function once(key, ms, make) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = make();
  cache.set(key, { until: Date.now() + ms, value });
  try { return await value; } catch (e) { cache.delete(key); throw e; }
}
export const clearLandingCache = () => cache.clear();

export async function landingData(query, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const [live, counters, buys, receiptLines, testimonials] = await Promise.all([
    query(LIVE_SQL, [24]).then(r => withRole(r.rows || [])),
    query(COUNTERS_SQL).then(r => r.rows?.[0] || null).catch(() => null),
    weekBuys(query, 5),
    query(RECEIPT_LINES_SQL).then(r => r.rows || []),
    query("SELECT quote,name,detail,source_url FROM testimonials WHERE published ORDER BY sort,id LIMIT 6").then(r => r.rows || []).catch(() => [])
  ]);
  const clusters = clusterBuys(receiptLines, { today });
  const receipts = [];
  for (const c of clusters.slice(0, 40)) {
    const series = await closesFor(query, c.ticker, { download: false }).catch(() => []);
    receipts.push({ ...c, ...receiptReturns(c, series, today) });
  }
  // The product shot: this week's biggest buy (else the newest trade), its stock's last year and its signal score.
  let shot = null;
  const top = buys[0] || live.find(r => kindOf(r) === "buy") || live[0];
  if (top) {
    const series = (await closesFor(query, top.ticker, { download: false }).catch(() => [])).filter(p => p[0] >= addDays(today, -365));
    const score = await scoreRow(query, { ...top, code: top.transaction_code }).catch(() => null);
    shot = { top, series, score: score ? { score: score.score, band: score.band } : null };
  }
  return { live, counters, buys, receipts, testimonials, today, shot };
}

/* ---------- pieces ---------- */
const T = r => String(r.ticker || "").toUpperCase();
const secUrl = u => /^https:\/\/(www\.)?sec\.gov\//.test(String(u || "")) ? String(u) : null;
const roleCap = r => r.role ? r.role.charAt(0).toUpperCase() + r.role.slice(1) : null;
const amountCls = k => k === "buy" ? "chg chg--up" : k === "sell" ? "chg chg--down" : "chg chg--flat";

/* One filing as a row of the live list (and of /v1/live): logo, ticker, who, what, how much, when. */
const liveRow = (r, now) => {
  const k = kindOf(r), t = T(r);
  return `<a class="hit" href="/${esc(encodeURIComponent(t))}" aria-label="${esc(t)}: ${esc(sentence(r))}"></a>${uiLogo(t, 32)}
<span class="lrow__who"><span class="tick">${esc(t)}</span><span class="t-label muted">${esc(personName(r.owner_name))}${r.role ? ", " + esc(r.role) : ""}</span></span>
${uiTrade(k, k === "sell" && r.rule_10b5_1 === true)}<span class="${amountCls(k)} lrow__amt">${esc(money(r.estimated_value) || "—")}</span>
<time class="t-label muted lrow__ago" datetime="${esc(new Date(r.published_at).toISOString())}">${esc(ago(r.published_at, now) || "")}</time>`;
};
/* Each live row also carries its plain facts (the trade as filed, its filing), so other pages, such as the design
 * system page, can show real filings with the app's own components. */
export const liveItems = (rows, now = Date.now()) => rows.filter(r => r.published_at).map(r => ({ id: String(r.id), html: liveRow(r, now),
  ticker: T(r), issuer: r.issuer_name || null, owner: r.owner_name || null, role: r.role || null, kind: kindOf(r), planned: kindOf(r) === "sell" && r.rule_10b5_1 === true,
  value: r.estimated_value == null ? null : Number(r.estimated_value), day: r.transaction_date ? String(r.transaction_date instanceof Date ? r.transaction_date.toISOString() : r.transaction_date).slice(0, 10) : null,
  filedAt: new Date(r.published_at).toISOString(), sentence: sentence(r), url: secUrl(r.source_url) }));

const fmtInt = n => Number(n || 0).toLocaleString("en-US");
// A result in 0.1% steps: the colour follows the shown value, so "0.0%" is never green or red.
const receiptCell = x => { if (x.pending) return `<span class="muted" title="${esc("Measured on " + day(x.on))}"><span class="slong">Pending until ${esc(day(x.on))}</span><span class="sshort">Pending</span></span>`; if (x.r == null) return `<span class="muted">No price</span>`;
  const r = Math.round(x.r * 1000) / 1000; return `<span class="${r > 0 ? "chg chg--up" : r < 0 ? "chg chg--down" : "chg chg--flat"}">${esc(r === 0 ? "0.0%" : pct(r))}</span>`; };
function receiptsTable(rows) {
  if (!rows.length) return `<div class="card scard"><p class="muted">No company had two or more insiders buy over $1M within 10 days in the last 6 months.</p></div>`;
  const shown = rows.slice(0, 12);
  const body = shown.map(r => `<tr><td><a class="scell" href="/${esc(encodeURIComponent(r.ticker))}">${uiLogo(r.ticker, 24)}<span class="scell__t"><span class="tick">${esc(r.ticker)}</span><span class="t-micro muted c-sub">${r.insiders} insiders</span><span class="t-micro muted c-sub">${esc(day(r.start))}</span></span></a></td><td class="c-who">${r.insiders} insiders</td><td class="r">${r.filing ? `<a class="samt" href="${esc(r.filing)}" rel="nofollow noopener" target="_blank" title="Open the SEC Form 4">${esc(money(r.total))}</a>` : esc(money(r.total))}</td>
<td class="muted c-first">${esc(day(r.start))}</td><td class="r">${receiptCell(r.d30)}</td><td class="r">${receiptCell(r.d90)}</td><td class="r c-filing">${r.filing ? `<a class="muted slink" href="${esc(r.filing)}" rel="nofollow noopener" target="_blank">Form 4 ↗</a>` : ""}</td></tr>`).join("");
  return `<div class="card scard stable"><table class="table"><caption class="sr-only">${esc(RECEIPT_RULE)}</caption>
<thead><tr><th scope="col">Stock</th><th scope="col" class="c-who">Who bought</th><th scope="col" class="r">Amount</th><th scope="col" class="c-first">First buy</th><th scope="col" class="r">30 days later</th><th scope="col" class="r">90 days later</th><th scope="col" class="c-filing"><span class="sr-only">Filing</span></th></tr></thead>
<tbody>${body}</tbody></table></div>${rows.length > shown.length ? `<p class="t-label muted snote">${rows.length - shown.length} more match the rule; the 12 newest are shown.</p>` : ""}`;
}

function comparison() {
  const cols = [{ name: "Insidir", cells: COMPETITORS.insidir }, ...COMPETITORS.others.filter(c => c.verified), { name: "SEC EDGAR yourself", cells: COMPETITORS.edgar }];
  const cell = v => v === true ? `<span class="syes">Yes</span>` : v === false ? `<span class="muted">No</span>` : esc(v);
  return `<div class="card scard stable"><table class="table scompare"><caption class="sr-only">Insidir compared with other ways to follow insider trades, as of ${esc(day(CHECKED_ON))}</caption>
<thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${cols.map(c => `<th scope="col">${esc(c.name)}</th>`).join("")}</tr></thead>
<tbody>${COMPETITORS.rows.map(([key, label]) => `<tr><th scope="row">${esc(label)}</th>${cols.map((c, i) => `<td${i === 0 ? ' class="sus"' : ""}>${cell(c.cells[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="t-label muted snote">As of ${esc(day(CHECKED_ON))}, from each product's public pages. Tell us if something changed: hello@aethric.llc</p>`;
}

const FAQ = [
  ["What is an insider?", "CEOs, CFOs, directors and anyone who owns more than 10% of a company. The law makes them report their trades to the SEC within two business days."],
  ["Is this legal to use?", "Yes. These are public records. Insidir reads them faster and explains them."],
  ["What do I get for $1?", "Everything, for 7 days. Then $39 a month unless you cancel. Billing in your account shows the date of the first charge."],
  ["How do I cancel?", "Billing, then Cancel. Two clicks, online, any time."],
  ["Do you tell me what to buy?", "No. Insidir shows what insiders did. Research, not investment advice."],
  ["Where does the data come from?", "SEC EDGAR, the government's filing system. Every number links to its filing."]
];

/* ---------- the product shot ----------
 * The Today screen, drawn on the server from the app's own components: the biggest buy this week with its big number,
 * its sentence, its signal score and the stock's last year (area chart, the trade as a marker, the latest close as a
 * dot), then the newest filings. Every figure is real; with no prices the chart is left out. */
function shotChart(series, trades) {
  if (series.length < 20) return "";
  const W = 1000, H = 220, lo = Math.min(...series.map(p => p[1])), hi = Math.max(...series.map(p => p[1])), pad = (hi - lo) * .12 || 1;
  const y = v => H - ((v - lo + pad) / (hi - lo + 2 * pad)) * H, x = i => (i / (series.length - 1)) * W;
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join("");
  const marks = trades.map(t => { const d = String(t.transaction_date instanceof Date ? t.transaction_date.toISOString() : t.transaction_date || "").slice(0, 10);
    const i = series.findIndex(p => p[0] >= d); if (i < 0) return "";
    const k = kindOf(t), sz = Math.max(8, Math.min(18, 6 + Math.log10(Math.max(1, Number(t.estimated_value) || 1)) * 1.6));
    return `<span class="mk mk--${k === "buy" ? "buy" : "sell"}" style="left:${(x(i) / W * 100).toFixed(2)}%;top:${(y(series[i][1]) / H * 100).toFixed(2)}%;--d:${sz.toFixed(0)}px"></span>`; }).join("");
  const last = series.at(-1), labels = [0, Math.floor(series.length / 3), Math.floor(series.length * 2 / 3)].map(i => `<span style="left:${(x(i) / W * 100).toFixed(1)}%">${esc(new Date(series[i][0] + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }))}</span>`).join("");
  return `<div class="shot__chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="shot-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".16"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
<path d="${line}L${W} ${H}L0 ${H}Z" fill="url(#shot-fill)"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
${marks}${trades.some(t => String(t.transaction_date instanceof Date ? t.transaction_date.toISOString() : t.transaction_date || "").slice(0, 10) >= series[Math.floor(series.length * .96)][0]) ? "" : `<span class="chart__now" style="left:100%;top:${(y(last[1]) / H * 100).toFixed(2)}%"></span>`}<div class="shot__x t-micro muted" aria-hidden="true">${labels}</div></div>`;
}
function productShot(d, now) {
  const s = d?.shot; if (!s) return "";
  const t = s.top, k = kindOf(t), feed = (d.live || []).filter(r => r.published_at).slice(0, 4);
  const marks = [t, ...(d.live || []).filter(r => T(r) === T(t) && r.id !== t.id && ["buy", "sell"].includes(kindOf(r)))].slice(0, 6);
  const ring = s.score ? `<span class="ring" aria-label="Signal score ${s.score.score} of 100"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ring__track" cx="24" cy="24" r="21"/><circle class="ring__val" cx="24" cy="24" r="21" stroke-dasharray="131.95" stroke-dashoffset="${(131.95 * (1 - s.score.score / 100)).toFixed(2)}"/></svg><b>${s.score.score}</b></span>` : "";
  return `<figure class="shot" aria-label="The Insidir app, showing this week's biggest insider buy">
<div class="shot__frame" aria-hidden="true">
 <aside class="shot__side"><span class="wordmark">${WORDMARK}</span><span class="is-on">Today</span><span>Watchlist</span><span>Alerts</span><span>Intelligence</span><span>Connections</span></aside>
 <div class="shot__main">
  <p class="t-title">Today</p>
  <div class="card shot__hero">
   <div class="shot__hero-head"><span class="shot__co">${uiLogo(T(t), 40)}<span><span class="tick">${esc(T(t))}</span><span class="t-label muted">${esc(companyName(t.issuer_name) || T(t))}</span></span></span>${ring}</div>
   <p class="t-label muted">Biggest insider ${k === "sell" ? "sale" : "buy"} this week</p>
   <p class="t-hero big">${uiBig(t.estimated_value)}</p>
   <p class="t-body shot__sentence">${esc(sentence(t))}</p>
   ${shotChart(s.series, marks)}
  </div>
  ${feed.length ? `<div class="card shot__feed"><p class="t-label muted">Latest filings</p><ul class="rows">${feed.map(r => `<li class="row lrow">${liveRow(r, now)}</li>`).join("")}</ul></div>` : ""}
 </div>
</div></figure>`;
}

/* ---------- the hero ---------- */
export const HERO_H1 = "They have to tell on themselves. We tell you first.";
export const FIXED_LINE = HERO_H1;
function hero(d, now) {
  return `<section class="shero" data-v2-hero aria-labelledby="hero-h">
 <div class="swrap shero__in">
  <h1 class="t-display shero__h1" id="hero-h">${esc(HERO_H1)}</h1>
  <p class="shero__sub">${esc(SUB)}</p>
  ${uiSearch("hero-q", { examples: EXAMPLES })}
  <p class="t-label muted shero__terms">$1 for 7 days. Cancel online anytime.</p>
 </div>
 ${productShot(d, now)}
</section>`;
}

/* ---------- the page ---------- */
const section = (id, h, p, inner, attrs = "") => `<section class="ssec"${attrs} aria-labelledby="${id}"><div class="swrap" data-ds-reveal>
 <header class="ssec__head"><h2 class="t-title" id="${id}">${h}</h2><p class="ssec__p">${p}</p></header>
 ${inner}
</div></section>`;

export function renderLanding(d, { origin, now = Date.now() } = {}) {
  const counters = d?.counters, top = d?.buys || [], example = top[0] || d?.live?.[0];
  const week = top.length ? `${counters ? `<dl class="scount"><div><dt class="t-label muted">Filings read today</dt><dd class="t-hero" data-ds-count="${counters.filings_today}">${fmtInt(counters.filings_today)}</dd></div><div><dt class="t-label muted">Insider trades tracked this month</dt><dd class="t-hero" data-ds-count="${counters.trades_month}">${fmtInt(counters.trades_month)}</dd></div></dl>` : ""}
 <div class="card scard"><ul class="rows">${top.map(r => { const f = secUrl(r.source_url); return `<li class="row wrow"><a class="hit" href="/${esc(encodeURIComponent(T(r)))}" aria-label="${esc(T(r))}: ${esc(sentence(r))}"></a>${uiLogo(T(r), 32)}
<span class="lrow__who"><span class="tick">${esc(T(r))}</span><span class="t-label muted">${esc(companyName(r.issuer_name) || "")}</span></span>
<span class="wrow__person"><span class="mono" aria-hidden="true">${esc(uiInitials(personName(r.owner_name)))}</span><span>${esc(personName(r.owner_name))}${r.role ? `<span class="t-label muted"> · ${esc(roleCap(r))}</span>` : ""}</span></span>
${f ? `<a class="chg chg--up lrow__amt row__link" href="${esc(f)}" rel="nofollow noopener" target="_blank" title="Open the SEC Form 4">${esc(money(r.estimated_value) || "—")}</a>` : `<span class="chg chg--up lrow__amt">${esc(money(r.estimated_value) || "—")}</span>`}<span class="t-label muted wrow__day">${esc(day(r.transaction_date) || "")}</span></li>`; }).join("")}</ul></div>
 ${secUrl(top[0]?.source_url) ? `<p class="t-label muted snote">Data straight from SEC EDGAR. <a class="slink" href="${esc(top[0].source_url)}" rel="nofollow noopener" target="_blank">See a real filing ↗</a></p>` : ""}` : "";
  const how = example ? `<ol class="show">
 <li class="card show__step"><p class="t-label muted">1</p><h3 class="t-section">Pick your stocks</h3><p class="muted">Type a ticker or paste a list. Follow a CEO by name.</p>
  <ul class="rows show__vis">${top.slice(0, 3).map(r => `<li class="row srow">${uiLogo(T(r), 28)}<span class="tick">${esc(T(r))}</span><span class="t-label muted">${esc(personName(r.owner_name))}</span></li>`).join("")}</ul></li>
 <li class="card show__step"><p class="t-label muted">2</p><h3 class="t-section">We read every filing</h3><p class="muted">Every Form 4, in one plain sentence. Every number links to the filing.</p>
  <div class="show__vis show__read"><p>${esc(sentence(example))}</p><p class="t-label muted">SEC Form 4 · Filed ${esc(day(example.published_at) || "")}${example.price_per_share ? ` · $${esc(Number(example.price_per_share).toFixed(2))} a share` : ""}</p>
  ${secUrl(example.source_url) ? `<a class="t-label slink" href="${esc(example.source_url)}" rel="nofollow noopener" target="_blank">Open the filing ↗</a>` : ""}</div></li>
 <li class="card show__step"><p class="t-label muted">3</p><h3 class="t-section">You get one sentence</h3><p class="muted">In the app or as a phone notification, minutes after the filing posts.</p>
  <div class="show__vis show__note"><span class="show__app" aria-hidden="true">i.</span><span><span class="show__note-top"><span class="strong">Insidir</span><span class="t-micro muted">now</span></span><span class="t-label">${esc(sentence(example))}</span></span></div></li>
</ol>` : `<ol class="show">
 <li class="card show__step"><p class="t-label muted">1</p><h3 class="t-section">Pick your stocks</h3><p class="muted">Type a ticker or paste a list. Follow a CEO by name.</p></li>
 <li class="card show__step"><p class="t-label muted">2</p><h3 class="t-section">We read every filing</h3><p class="muted">Every Form 4, in one plain sentence. Every number links to the filing.</p></li>
 <li class="card show__step"><p class="t-label muted">3</p><h3 class="t-section">You get one sentence</h3><p class="muted">In the app or as a phone notification, minutes after the filing posts.</p></li>
</ol>`; // without live data the steps are words only, so the nav's #how always lands
  const body = `<body class="ui site">
<a class="skip" href="#main">Skip to content</a>
${uiNav({ cta: "nav", home: true })}
<main id="main">
${hero(d, now)}
${top.length ? section("live-h", "This week's biggest insider buys.", "Insiders are CEOs, CFOs, directors and big shareholders, and these are the largest buys they reported this week, straight from SEC EDGAR.", week) : ""}
${section("how-h", "Three steps. No finance degree needed.", "Pick your stocks, we read every filing, and you get one sentence when an insider trades.", how, ' id="how"')}
${d ? section("rc-h", "What happened after they bought.", esc(RECEIPT_RULE), `${receiptsTable(d.receipts)}
 <p class="t-label muted snote">Measured from the close on the day of the first buy. Past results don't predict future ones. Research, not investment advice.</p>
`, ' id="receipts"') : ""}
${section("cmp-h", "Built for one job: following insiders.", "Here is how Insidir compares with reading the SEC's own website, checked on public pages.", comparison(), ' id="compare"')}
${section("pr-h", "$1 for 7 days. Then $39 a month.", "One plan with everything in it, and you can cancel online in two clicks.", `<div class="card sprice">
  <p class="t-label muted">Insidir Pro</p>
  <p class="t-hero big"><span class="u">$</span>39<span class="u"> / month</span></p>
  <p class="muted">$1 for your first 7 days.</p>
  <ul class="sprice__list"><li>Every insider trade in plain English</li><li>Alerts minutes after a filing</li><li>Track record for every insider</li><li>Unlimited watchlist and follows</li><li>Every number linked to the SEC filing</li></ul>
  <a class="btn btn--primary btn--lg" href="/signup.html" data-cta="pricing">Start for $1</a>
  <p class="t-label muted">$1 today, then $39 a month after 7 days. Cancel in 2 clicks.</p>
  ${COMPETITORS.anchor ? `<p class="t-label muted">${esc(COMPETITORS.anchor)}</p>` : ""}
 </div>`, ' id="pricing" data-funnel-view="pricing"')}
${section("faq-h", "Questions people ask first.", `Short answers, with the <a class="slink" href="/subscription-policy.html">full terms</a> one tap away.`, `<div class="sfaq">${FAQ.map(([q, a], i) => `<details class="card"${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p class="muted">${esc(a)}</p></details>`).join("")}</div>`, ' id="faq"')}
${section("end-h", "Search any stock. See who's buying.", "It takes ten seconds and you don't need an account.", `<div class="send">
  ${uiSearch("end-q")}
  <figure class="sfounder"><span class="mono mono--32" aria-hidden="true">N</span>
   <div><blockquote><p>I kept missing the one signal that is actually public: the people who run a company buying its stock with their own money. The filings were there, written for lawyers. I built Insidir to read them for me, and now for you.</p></blockquote>
   <figcaption class="t-label muted"><b>Nicholas</b>, founder</figcaption></div></figure>
  ${d?.testimonials?.length ? `<div class="squotes">${d.testimonials.map(t => `<figure class="card scard"><blockquote><p>${esc(t.quote)}</p></blockquote><figcaption class="t-label muted"><b>${esc(t.name)}</b>${t.detail ? `, ${esc(t.detail)}` : ""}</figcaption></figure>`).join("")}</div>` : ""}
 </div>`)}
</main>
<div class="ssticky" data-v2-sticky><a class="btn btn--primary btn--lg" href="/signup.html" data-cta="sticky">Start for $1</a><span class="t-label muted">7 days, cancel anytime</span></div>
${uiFooter({ home: true })}
${scripts()}
<script src="/assets/js/landing-nav.js?v=1" defer></script>
</body></html>`;
  const title = "Insidir: see when CEOs buy and sell their own stock";
  return uiHead({ title, description: SUB, canonical: "/", origin }) + "\n" + body;
}

/* ---------- routing ---------- */

export async function handleLanding(req, res, url, { query, env = process.env, secure = true }) {
  const p = url.pathname;
  if (p === "/v1/live" && (req.method === "GET" || req.method === "HEAD")) {
    const rows = await once("live", 30_000, () => query(LIVE_SQL, [24]).then(r => withRole(r.rows || [])));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" });
    res.end(JSON.stringify({ items: liveItems(rows) }));
    return true;
  }
  if (!(p === "/" || p === "/index.html") || (req.method !== "GET" && req.method !== "HEAD")) return false;
  if (p === "/index.html") { res.writeHead(301, { Location: "/" + url.search }); res.end(); return true; }
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=60", Vary: "Cookie, Accept-Encoding", "X-Content-Type-Options": "nosniff" };
  let html;
  try {
    const data = await once("data", CACHE_MS, () => landingData(query));
    html = await once("html", CACHE_MS, async () => Buffer.from(renderLanding(data, { origin: siteOrigin(env) })));
  } catch (e) {
    console.error("Landing data unavailable", e?.message || e);
    return false; // the static web/index.html answers instead
  }
  const prior = res.getHeader?.("Set-Cookie");
  if (prior && headers["Set-Cookie"]) headers["Set-Cookie"] = [].concat(prior, headers["Set-Cookie"]);
  else if (prior) headers["Set-Cookie"] = prior;
  const gz = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  if (gz) headers["Content-Encoding"] = "gzip";
  headers.ETag = '"' + createHash("sha256").update(html).digest("hex").slice(0, 16) + '"';
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : gz ? gzipSync(html) : html);
  return true;
}
