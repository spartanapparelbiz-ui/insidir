/* The landing page (insidir.com/), server-rendered with live data so the first paint is real: built for a phone in
 * Instagram's in-app browser, a visitor who has never heard of a Form 4, and five seconds.
 *
 * Eight sections: Hero → Live this week → How it works → Receipts → Comparison → Pricing → FAQ → Final CTA. Every
 * section is one headline, one sentence and one visual (docs/LANDING-COPY.md has the copy). No mock data: every trade
 * is a row from the import with its SEC filing link; a part with no data is left out, never faked.
 *
 *   GET /, /index.html     the page (cached per headline variant for CACHE_MS)
 *   GET /v1/live           the newest filings for the live strip (site-v2.js slides new rows in)
 *
 * Headline A/B test: insidir_h1 = a | b, assigned on the first visit (50/50) and reported by funnel.js as
 * experiment_exposed "h1:a" / "h1:b"; the funnel report compares sign-ups and paid members by arm. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, randomInt } from "node:crypto";
import { gzipSync } from "node:zlib";
import { esc, money, day, ago, pct, sentence, tradeCard, withRole, LINE_SQL, head, nav, footer, scripts, emailForm, searchBox, kindOf, personName } from "./site-v2.mjs";
import { siteOrigin } from "./public-pages.mjs";
import { weekBuys } from "./newsletter.mjs";
import { tickerData, FREE_TRADES } from "./ticker-page.mjs";
import { closesFor } from "./prices.mjs";
import { addDays, closeOnOrAfter, closeOnOrBefore } from "./track-record.mjs";
import { COMPETITORS, CHECKED_ON } from "./landing-competitors.mjs";

export const CACHE_MS = 60_000;
export const H1 = Object.freeze({
  a: "See when CEOs buy and sell their own stock.",
  b: "The people running your stocks have to tell on themselves. We tell you first."
});
export const SUB = "Insiders have to report every trade to the SEC. Insidir reads every filing and tells you what it means in plain English, minutes after it posts.";
const FOUNDER_PHOTO = fileURLToPath(new URL("../web/assets/img/founder.jpg", import.meta.url));

/* ---------- data ---------- */
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
    query(LIVE_SQL, [8]).then(r => withRole(r.rows || [])),
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
  const featured = buys[0]?.ticker || live[0]?.ticker || null;
  const phone = featured ? await tickerData(query, String(featured).toUpperCase()).catch(() => null) : null;
  return { live, counters, buys, receipts, testimonials, phone, today };
}

/* ---------- pieces ---------- */
const liveRow = (r, now) => {
  const k = kindOf(r), t = String(r.ticker).toUpperCase();
  return `<a class="v2-live__item" href="/${esc(encodeURIComponent(t))}"><b class="ds-num">${esc(t)}</b><span>${esc(r.role ? r.role.charAt(0).toUpperCase() + r.role.slice(1) : personName(r.owner_name))} ${k === "buy" ? "bought" : "sold"} <span class="ds-num ${k === "buy" ? "ds-buy" : "ds-sell"}">${esc(money(r.estimated_value))}</span></span><time class="ds-num" datetime="${esc(new Date(r.published_at).toISOString())}">${esc(ago(r.published_at, now) || "")}</time></a>`;
};
export const liveItems = (rows, now = Date.now()) => rows.filter(r => r.published_at).map(r => ({ id: String(r.id), html: liveRow(r, now) }));

function phoneFrame(d) {
  if (!d || !d.trades.length) return "";
  const rows = d.trades.slice(0, FREE_TRADES).map(r => `<li class="v2-trade v2-trade--${kindOf(r)}"><span class="ds-badge ds-badge--${kindOf(r)}">${kindOf(r) === "buy" ? "Buy" : "Sell"}</span><p>${esc(sentence(r))}</p></li>`).join("");
  return `<figure class="v2-phone" aria-label="${esc(d.ticker)} on Insidir, as it looks on a phone">
<div class="v2-phone__screen"><div class="v2-phone__bar"><span class="ds-mark">insidir.</span><span class="ds-btn">Start for $1</span></div>
<p class="v2-tk__tick ds-num">${esc(d.ticker)}</p><p class="v2-phone__h">${esc(d.name || d.ticker)} insiders: who's buying and selling.</p>
<ol class="v2-trades">${rows}</ol>
<div class="v2-phone__lock"><b>${Math.max(0, d.trades.length - FREE_TRADES)} more trades</b><span class="ds-btn">Unlock for $1</span></div></div>
<figcaption class="sr-only">The free view of ${esc(d.ticker)}: its last ${FREE_TRADES} insider trades.</figcaption></figure>`;
}

const fmtInt = n => Number(n || 0).toLocaleString("en-US");
// A result in 0.1% steps: the colour follows the shown value, so "0.0%" is never green or red.
const receiptCell = x => { if (x.pending) return `<span class="v2-pending" title="${esc("Measured on " + day(x.on))}"><span class="v2-long">On ${esc(day(x.on))}</span><span class="v2-short">Pending</span></span>`; if (x.r == null) return `<span class="v2-pending">No price</span>`;
  const r = Math.round(x.r * 1000) / 1000; return `<span class="ds-num ${r > 0 ? "ds-buy" : r < 0 ? "ds-sell" : ""}">${esc(r === 0 ? "0.0%" : pct(r))}</span>`; };
function receiptsTable(rows) {
  if (!rows.length) return `<div class="ds-card v2-quiet"><p>No company had two or more insiders buy over $1M within 10 days in the last 6 months.</p></div>`;
  const shown = rows.slice(0, 12);
  const body = shown.map(r => `<tr><td class="ds-num"><a href="/${esc(encodeURIComponent(r.ticker))}">${esc(r.ticker)}</a></td><td>${r.insiders} insiders</td><td class="ds-num r">${esc(money(r.total))}</td>
<td class="ds-num">${esc(day(r.start))}</td><td class="r">${receiptCell(r.d30)}</td><td class="r">${receiptCell(r.d90)}</td><td>${r.filing ? `<a href="${esc(r.filing)}" rel="nofollow noopener" target="_blank">Form 4 ↗</a>` : ""}</td></tr>`).join("");
  return `<div class="ds-table-wrap"><table class="ds-table v2-receipts"><caption class="sr-only">${esc(RECEIPT_RULE)}</caption>
<thead><tr><th scope="col">Stock</th><th scope="col">Who bought</th><th scope="col" class="r">Amount</th><th scope="col">First buy</th><th scope="col" class="r">30 days later</th><th scope="col" class="r">90 days later</th><th scope="col"><span class="sr-only">Filing</span></th></tr></thead>
<tbody>${body}</tbody></table></div>${rows.length > shown.length ? `<p class="ds-small v2-note">${rows.length - shown.length} more match the rule; the 12 newest are shown.</p>` : ""}`;
}

function comparison() {
  const cols = [{ name: "Insidir", cells: COMPETITORS.insidir }, ...COMPETITORS.others.filter(c => c.verified), { name: "SEC EDGAR yourself", cells: COMPETITORS.edgar }];
  const rows = COMPETITORS.rows;
  const cell = v => v === true ? `<span class="v2-yes">Yes</span>` : v === false ? `<span class="v2-no">No</span>` : esc(v);
  return `<div class="ds-table-wrap"><table class="ds-table v2-compare"><caption class="sr-only">Insidir compared with other ways to follow insider trades, as of ${esc(day(CHECKED_ON))}</caption>
<thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${cols.map((c, i) => `<th scope="col"${i === 0 ? ' class="v2-us"' : ""}>${esc(c.name)}</th>`).join("")}</tr></thead>
<tbody>${rows.map(([key, label]) => `<tr><th scope="row">${esc(label)}</th>${cols.map((c, i) => `<td${i === 0 ? ' class="v2-us"' : ""}>${cell(c.cells[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="ds-small v2-note">As of ${esc(day(CHECKED_ON))}, from each product's public pages. Tell us if something changed: hello@aethric.llc</p>`;
}

const FAQ = [
  ["What is an insider?", "CEOs, CFOs, directors and anyone who owns more than 10% of a company. The law makes them report their trades to the SEC within two business days."],
  ["Is this legal to use?", "Yes. These are public records. Insidir reads them faster and explains them."],
  ["What do I get for $1?", "Everything, for 7 days. On day 6 we email you before the $39 charge."],
  ["How do I cancel?", "Billing, then Cancel. Two clicks, online, any time."],
  ["Do you tell me what to buy?", "No. Insidir shows what insiders did. Research, not investment advice."],
  ["Where does the data come from?", "SEC EDGAR, the government's filing system. Every number links to its filing."]
];

/* ---------- the page ---------- */
export function renderLanding(d, { origin, variant = "a", now = Date.now() } = {}) {
  const h1 = H1[variant] || H1.a;
  const live = d ? liveItems(d.live, now) : [];
  const counters = d?.counters;
  const top = d?.buys || [];
  const example = top[0] || d?.live?.[0];
  const founderPhoto = existsSync(FOUNDER_PHOTO);
  const how = example ? `
<div class="ds-tabs" role="tablist" aria-label="How Insidir works" data-ds-tabs>
<button class="ds-tab" role="tab" id="how-t1" aria-controls="how-p1" aria-selected="true">1. Pick your stocks</button>
<button class="ds-tab" role="tab" id="how-t2" aria-controls="how-p2" aria-selected="false" tabindex="-1">2. We read every filing</button>
<button class="ds-tab" role="tab" id="how-t3" aria-controls="how-p3" aria-selected="false" tabindex="-1">3. You get one sentence</button></div>
<div class="v2-how">
<div role="tabpanel" id="how-p1" aria-labelledby="how-t1" class="v2-how__panel"><p class="v2-how__cap">Type a ticker or paste a list. Follow a CEO by name.</p>
<div class="ds-card v2-watch">${top.slice(0, 3).map(r => `<div class="v2-watch__row"><b class="ds-num">${esc(String(r.ticker).toUpperCase())}</b><span>${esc(personName(r.owner_name))}${r.role ? ", " + esc(r.role) : ""}</span><span class="ds-num ds-buy">${esc(money(r.estimated_value))}</span></div>`).join("")}</div></div>
<div role="tabpanel" id="how-p2" aria-labelledby="how-t2" class="v2-how__panel" hidden><p class="v2-how__cap">Every Form 4, in one plain sentence. Every number links to the filing.</p>
<div class="ds-card v2-read"><p class="v2-read__s">${esc(sentence(example))}</p><dl class="v2-read__ev"><div><dt>Source</dt><dd>SEC Form 4</dd></div><div><dt>Filed</dt><dd class="ds-num">${esc(day(example.published_at) || "")}</dd></div><div><dt>Price per share</dt><dd class="ds-num">${esc(example.price_per_share ? "$" + Number(example.price_per_share).toFixed(2) : "Not reported")}</dd></div></dl>
${/^https:\/\/(www\.)?sec\.gov\//.test(String(example.source_url || "")) ? `<a class="ds-link" href="${esc(example.source_url)}" rel="nofollow noopener" target="_blank">Open the filing <span class="ds-arrow" aria-hidden="true">↗</span></a>` : ""}</div></div>
<div role="tabpanel" id="how-p3" aria-labelledby="how-t3" class="v2-how__panel" hidden><p class="v2-how__cap">Push or email, minutes after the filing posts.</p>
<div class="ds-card v2-alert"><div class="v2-alert__top"><span class="ds-mark">insidir.</span><span class="ds-small">now</span></div><p><b class="ds-num">${esc(String(example.ticker || "").toUpperCase())}</b> ${esc(sentence(example))}</p></div></div>
</div>` : "";
  const body = `<body class="ds v2" data-exp-h1="${esc(variant)}">
${nav({ cta: "nav", home: true })}
<main id="main">
<section class="v2-hero" data-v2-hero aria-labelledby="hero-h">
 <div class="ds-wrap v2-hero__in">
  <h1 class="ds-h1" id="hero-h">${esc(h1)}</h1>
  <p class="ds-body v2-hero__sub">${esc(SUB)}</p>
  ${searchBox("hero-q")}
  <p class="ds-small v2-hero__terms">$1 for 7 days. Cancel online anytime.</p>
  ${live.length ? `<div class="v2-hero__visual">${phoneFrame(d.phone)}<div class="v2-live"><p class="v2-live__h"><span class="v2-dot" aria-hidden="true"></span>Latest filings</p><ul class="v2-live__list" data-v2-live aria-live="off">${live.map(x => `<li class="v2-live__row" data-id="${esc(x.id)}">${x.html}</li>`).join("")}</ul></div></div>` : ""}
 </div>
</section>

${top.length ? `<section class="ds-section" aria-labelledby="live-h"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="live-h">This week's biggest insider buys.</h2>
 <p class="ds-body">Insiders are CEOs, CFOs, directors and big shareholders, and these are the largest buys they reported this week, straight from SEC EDGAR.</p>
 <div class="v2-week">
  ${counters ? `<dl class="v2-counters"><div><dt>Filings read today</dt><dd class="ds-num" data-ds-count="${counters.filings_today}">${fmtInt(counters.filings_today)}</dd></div><div><dt>Insider trades tracked this month</dt><dd class="ds-num" data-ds-count="${counters.trades_month}">${fmtInt(counters.trades_month)}</dd></div></dl>` : ""}
  <div class="v2-cards">${top.map(r => tradeCard(r)).join("")}</div>
  ${top[0]?.source_url ? `<p class="ds-small v2-note">Data straight from SEC EDGAR. <a href="${esc(top[0].source_url)}" rel="nofollow noopener" target="_blank">See a real filing ↗</a></p>` : ""}
 </div>
</div></section>` : ""}

${how ? `<section class="ds-section" id="how" aria-labelledby="how-h"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="how-h">Three steps. No finance degree needed.</h2>
 <p class="ds-body">Pick your stocks, we read every filing, and you get one sentence when an insider trades.</p>
 <div>${how}</div>
</div></section>` : ""}

${d ? `<section class="ds-section" id="receipts" aria-labelledby="rc-h"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="rc-h">What happened after they bought.</h2>
 <p class="ds-body">${esc(RECEIPT_RULE)}</p>
 <div class="v2-receipts-wrap">${receiptsTable(d.receipts)}
  <p class="ds-small v2-note">Measured from the close on the day of the first buy. Past results don't predict future ones. Research, not investment advice.</p>
  ${emailForm("receipts")}</div>
</div></section>` : ""}

<section class="ds-section" id="compare" aria-labelledby="cmp-h"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="cmp-h">Built for one job: following insiders.</h2>
 <p class="ds-body">Here is how Insidir compares with reading the SEC's own website, checked on public pages.</p>
 ${comparison()}
</div></section>

<section class="ds-section" id="pricing" aria-labelledby="pr-h" data-funnel-view="pricing"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="pr-h">$1 for 7 days. Then $39 a month.</h2>
 <p class="ds-body">One plan with everything in it, and you can cancel online in two clicks.</p>
 <div class="ds-price">
  <p class="ds-price__name">Insidir Pro</p>
  <p class="ds-price__amt"><b class="ds-num">$39</b><span>/ month</span></p>
  <p class="ds-price__seats">$1 for your first 7 days.</p>
  <ul class="ds-price__list"><li>Every insider trade in plain English</li><li>Alerts minutes after a filing</li><li>Track record for every insider</li><li>Unlimited watchlist and follows</li><li>Every number linked to the SEC filing</li></ul>
  <a class="ds-btn ds-btn--lg" href="/start" data-cta="pricing">Start for $1</a>
  <p class="ds-price__note">$1 today. We email you before you're charged. Cancel in 2 clicks.</p>
  ${COMPETITORS.anchor ? `<p class="ds-price__note">${esc(COMPETITORS.anchor)}</p>` : ""}
 </div>
</div></section>

<section class="ds-section" id="faq" aria-labelledby="faq-h"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="faq-h">Questions people ask first.</h2>
 <p class="ds-body">Short answers, with the <a href="/subscription-policy.html">full terms</a> one tap away.</p>
 <div class="ds-faq">${FAQ.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
</div></section>

<section class="ds-section v2-final" aria-labelledby="end-h"><div class="ds-wrap ds-reveal" data-ds-reveal>
 <h2 class="ds-h2" id="end-h">Search any stock. See who's buying.</h2>
 <p class="ds-body">It takes ten seconds and you don't need an account.</p>
 <div class="v2-final__grid">
  ${searchBox("end-q")}
  <figure class="v2-founder">${founderPhoto ? `<img src="/assets/img/founder.jpg" width="56" height="56" alt="Nicholas, founder of Insidir" loading="lazy" decoding="async">` : ""}
   <blockquote><p>I kept missing the one signal that is actually public: the people who run a company buying its stock with their own money. The filings were there, written for lawyers. I built Insidir to read them for me, and now for you.</p></blockquote>
   <figcaption><b>Nicholas</b>, founder</figcaption></figure>
  ${d?.testimonials?.length ? `<div class="v2-quotes">${d.testimonials.map(t => `<figure class="ds-card v2-quote"><blockquote><p>${esc(t.quote)}</p></blockquote><figcaption><b>${esc(t.name)}</b>${t.detail ? `, ${esc(t.detail)}` : ""}</figcaption></figure>`).join("")}</div>` : ""}
 </div>
</div></section>
</main>
<div class="v2-sticky" data-v2-sticky><a class="ds-btn" href="/start" data-cta="sticky">Start for $1</a><span class="ds-small">7 days, cancel anytime</span></div>
${footer({ home: true })}
${scripts()}
</body></html>`;
  const title = "Insidir: see when CEOs buy and sell their own stock";
  return head({ title, description: SUB, canonical: "/", origin, extra: `<meta name="color-scheme" content="dark">\n` }) + "\n" + body;
}

/* ---------- routing ---------- */
const VARIANT_COOKIE = "insidir_h1";
const variantOf = req => { const m = /(?:^|;\s*)insidir_h1=([ab])\b/.exec(String(req.headers?.cookie || "")); return m ? m[1] : null; };

export async function handleLanding(req, res, url, { query, env = process.env, secure = true }) {
  const p = url.pathname;
  if (p === "/v1/live" && (req.method === "GET" || req.method === "HEAD")) {
    const rows = await once("live", 30_000, () => query(LIVE_SQL, [8]).then(r => withRole(r.rows || [])));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" });
    res.end(JSON.stringify({ items: liveItems(rows) }));
    return true;
  }
  if (!(p === "/" || p === "/index.html") || (req.method !== "GET" && req.method !== "HEAD")) return false;
  if (p === "/index.html") { res.writeHead(301, { Location: "/" + url.search }); res.end(); return true; }
  let variant = variantOf(req);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=60", Vary: "Cookie, Accept-Encoding", "X-Content-Type-Options": "nosniff" };
  if (!variant) { variant = randomInt(2) ? "b" : "a"; headers["Set-Cookie"] = `${VARIANT_COOKIE}=${variant}; Path=/; Max-Age=${90 * 86400}; SameSite=Lax${secure ? "; Secure" : ""}`; }
  let html;
  try {
    const data = await once("data", CACHE_MS, () => landingData(query));
    html = await once("html:" + variant, CACHE_MS, async () => Buffer.from(renderLanding(data, { origin: siteOrigin(env), variant })));
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
