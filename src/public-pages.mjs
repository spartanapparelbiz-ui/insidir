/* Public, server-rendered insider pages: the part of Insidir that search engines and signed-out
 * visitors can read. Everything here is a public SEC Form 4 record from the engine's own import,
 * rendered as plain HTML (no script needed) so it can be indexed, shared and read on any device.
 * The product (company reports, financials, full histories, people you follow, watchlist, alerts,
 * the research journal) stays behind the paywall; every page here ends with the way in.
 *
 *   GET /insider-trading                  the latest open-market purchases and sales, most active companies
 *   GET /insider-trading/<TICKER>         one company's recent Form 4 lines, 90-day totals and its insiders
 *   GET /insiders/<cik>[-<name-slug>]     one reporting person: companies and roles, totals, recent lines
 *   GET /sitemap.xml                      a sitemap index; /sitemaps/pages.xml, companies-N.xml, insiders-N.xml
 *   GET /robots.txt                       public pages allowed, the product and the API disallowed
 *
 * src/paywall.mjs classifies these paths as public (nested paths, and /insider-trading is not a product
 * page). Pages never depend on who is asking, so they are cached in memory for CACHE_TTL_MS and may be
 * cached publicly; uncached renders are limited per client address so a crawler cannot hammer the
 * database. Person pages start no SEC requests (personProfile with starts 0): roles come from
 * sec_filing_owners or the SEC documents already cached. */
import { TRANSACTION_CODES } from "./insiders.mjs";
import { personProfile, parsePersonCik, hasFilingOwners, withJointOwners } from "./person-profile.mjs";

export const CACHE_TTL_MS = 10 * 60_000, CACHE_ENTRIES = 3000;
export const RENDERS_PER_MINUTE = 90;
export const SITEMAP_PAGE = 40000;
export const COMPANY_LINES = 40, PERSON_LINES = 30, HUB_ROWS = 15;
const DAY_WINDOW = 90;

const failure = (status, message) => Object.assign(new Error(message), { status });
const TICKER_PATH = /^\/insider-trading\/([^/]+)\/?$/;
const PERSON_PATH = /^\/insiders\/(\d{1,12})(?:-([a-z0-9-]{0,120}))?\/?$/;
const SITEMAP_PATH = /^\/sitemaps\/(pages|companies-(\d{1,4})|insiders-(\d{1,4}))\.xml$/;

export function isPublicPagePath(pathname) {
  const p = String(pathname || "");
  return p === "/robots.txt" || p === "/sitemap.xml" || p === "/insider-trading" || p === "/insider-trading/" ||
    TICKER_PATH.test(p) || /^\/insiders\/[^/]+\/?$/.test(p) || SITEMAP_PATH.test(p);
}

/* ---------- formatting ---------- */
export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const esc = escapeHtml;
export function slugify(name) {
  return String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}
// SEC filers write names surname first in capitals ("HUANG JEN HSUN"); headings read better in title case.
export function displayName(name) {
  const s = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-'.(/&])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/\b(Llc|Lp|Llp|Inc|Ltd|Plc|Ii|Iii|Iv|Sa|Nv|Ag|Gmbh|Usa|Us)\b/g, w => w.toUpperCase());
}
export const personUrl = (cik, name) => {
  const bare = String(cik ?? "").replace(/^0+/, "");
  const slug = slugify(displayName(name));
  return "/insiders/" + bare + (slug ? "-" + slug : "");
};
// Some filers type an exchange or a space into the symbol ("NYSE: KRC"); only clean symbols get a page.
export const tickerOk = ticker => /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(ticker || ""));
export const companyUrl = ticker => "/insider-trading/" + encodeURIComponent(String(ticker || "").toUpperCase());
const num = v => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export function money(value, { compact = true } = {}) {
  const n = num(value);
  if (n == null) return "—";
  const a = Math.abs(n);
  if (compact && a >= 1e9) return "$" + (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(/\.0+$/, "") + "B";
  if (compact && a >= 1e6) return "$" + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "") + "M";
  if (compact && a >= 1e4) return "$" + Math.round(n / 1e3) + "K";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 2 : 0 });
}
const shares = v => { const n = num(v); return n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
const isoDate = v => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).length === 10 ? v + "T00:00:00Z" : v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};
export function day(v) {
  const iso = isoDate(v);
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
const kindOf = row => row.category === "reported_purchase" ? "buy" : row.category === "reported_sale" ? "sell" : "other";
const KIND_LABEL = { buy: "Bought", sell: "Sold", other: "Other" };
const codeWords = code => TRANSACTION_CODES[String(code || "").toUpperCase()] || "Other Form 4 transaction";
const safeHttp = url => /^https:\/\/(www\.)?sec\.gov\//.test(String(url || "")) ? String(url) : null;

/* ---------- the page shell (the static pages' styles, header and footer) ---------- */
export function siteOrigin(env = process.env) {
  const raw = String(env.INSIDIR_PUBLIC_URL || "").trim();
  try { const u = new URL(raw); if (u.protocol === "https:" || u.protocol === "http:") return u.origin; } catch { /* default */ }
  return "https://insidir.com";
}
const NAV = '<a href="/platform.html">Platform</a><a href="/insider-trading"%CUR%>Insider trades</a><a href="/data.html">Data</a><a href="/pricing.html">Pricing</a><a href="/company-info.html">About</a>';
function shell({ title, description, canonical, body, origin, noindex = false, jsonLd = null, current = false }) {
  const nav = NAV.replace("%CUR%", current ? ' aria-current="page"' : "");
  const url = origin + canonical;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0c0c0b">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="insidir.">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/JetBrainsMono-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/v3-static.css">
<link rel="stylesheet" href="/assets/css/v6-static.css?v=1">
<link rel="stylesheet" href="/assets/css/v7-unified.css?v=1">
<link rel="stylesheet" href="/assets/css/v9-interior.css?v=1">
<link rel="stylesheet" href="/assets/css/v13-halftone.css?v=10">
<link rel="stylesheet" href="/assets/css/v13-static.css?v=9">
<link rel="stylesheet" href="/assets/css/v14-public.css?v=1">
<script defer src="/assets/js/v6-site.js?v=2"></script>
<script defer src="/assets/js/referral.js?v=1"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` : ""}</head>
<body class="v3-static v6-static v13 v14-public">
<a class="skip-link" href="#Content">Skip to content</a>
<header class="v6-nav v9-nav">
 <div class="mk-shell v6-nav__inner">
  <a class="v6-logo" href="/" aria-label="Insidir home">insidir<span class="v13-dot" aria-hidden="true">.</span></a>
  <nav class="v6-nav__links" aria-label="Main navigation">${nav}</nav>
  <div class="v6-nav__actions">
   <a class="v6-signin" href="/signin.html">Log in</a>
   <a class="v9-btn v9-btn--ink v9-btn--small" href="/signup.html">Try 3 days for $1</a>
   <button id="v6-menu-button" class="v6-menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="v6-menu"><span></span><span></span></button>
  </div>
 </div>
 <nav id="v6-menu" class="v6-mobile" aria-label="Mobile navigation" hidden>${nav}<a href="/signin.html">Log in</a><a href="/signup.html">Try 3 days for $1</a></nav>
</header>
<main id="Content">
${body}
</main>
<footer class="v13-footer v13-footer--plain" aria-label="Site footer">
<div class="hwf-top">
<div class="hwf-brand"><strong>Insidir</strong><span>©2026 · Aethric LLC · Research, not advice</span></div>
<nav class="hwf-col" aria-label="Public records"><h3>Public records</h3><ul><li><a href="/insider-trading">Latest insider trades</a></li><li><a href="/data.html">Data &amp; sources</a></li><li><a href="/platform.html">Platform</a></li><li><a href="/why-insidir.html">Why Insidir</a></li></ul></nav>
<nav class="hwf-col" aria-label="Account"><h3>Account</h3><ul><li><a href="/signin.html">Log in</a></li><li><a href="/signup.html">Get started</a></li><li><a href="/pricing.html">Pricing</a></li></ul></nav>
<nav class="hwf-col" aria-label="Company"><h3>Company</h3><ul><li><a href="/company-info.html">About</a></li><li><a href="/terms.html">Terms</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="/disclosures.html">Disclosures</a></li><li><a href="/subscription-policy.html">Subscriptions</a></li><li><a href="mailto:hello@aethric.llc">hello@aethric.llc</a></li></ul></nav>
</div>
<div class="hwf-rule"><span class="hwf-note"><span>Public SEC records</span> <span>Data may be delayed</span> <span>Not investment advice</span></span><button type="button" class="hwf-up">Back to top ↑</button></div>
</footer>
</body>
</html>
`;
}

const crumbs = items => `<nav class="pp-crumbs" aria-label="Breadcrumb"><ol>${items.map(([label, href]) => `<li>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join("")}</ol></nav>`;

function upsell(subject) {
  return `<section class="pp-upsell" aria-labelledby="pp-upsell-h">
 <div class="pp-upsell__copy">
  <p class="pp-label">The full record</p>
  <h2 id="pp-upsell-h">${esc(subject)}</h2>
  <ul class="pp-checks">
   <li>Every Form 4 line, amendments counted once, with the filing one click away</li>
   <li>Company reports: delayed price chart, XBRL financials, filings and 8-K announcements</li>
   <li>Follow people and save companies; new filings show up on your overview</li>
   <li>A private research journal beside the evidence</li>
  </ul>
 </div>
 <div class="pp-upsell__offer">
  <p class="pp-offer__price"><strong>$1</strong><span>for 3 days</span></p>
  <p class="pp-offer__then">Then $39 a month. Cancel any time.</p>
  <a class="v9-btn v9-btn--ink" href="/signup.html">Start the 3-day trial <span class="v13-arrow" aria-hidden="true">→</span></a>
  <a class="pp-offer__more" href="/platform.html">See everything Insidir does</a>
 </div>
</section>`;
}

const badge = kind => `<span class="pp-badge pp-badge--${kind}">${KIND_LABEL[kind]}</span>`;

// One person cell: a linked name, or for a joint filing every owner it lists.
function whoCell(row) {
  if (row.owner_cik != null) return `<a href="${esc(personUrl(row.owner_cik, row.owner_name))}">${esc(displayName(row.owner_name))}</a>`;
  const owners = Array.isArray(row.owners) ? row.owners.filter(o => o?.cik) : [];
  if (!owners.length) return esc(displayName(row.owner_name)) || "Joint filing";
  const first = owners[0];
  const rest = owners.length - 1;
  return `<a href="${esc(personUrl(first.cik, first.name))}">${esc(displayName(first.name))}</a>${rest ? ` <span class="pp-muted">and ${rest} other${rest === 1 ? "" : "s"}</span>` : ""}`;
}

function linesTable(rows, { showCompany = false, showPerson = true, caption }) {
  if (!rows.length) return `<p class="pp-empty">No Form 4 lines are imported yet.</p>`;
  const head = `<tr><th scope="col">Type</th>${showPerson ? '<th scope="col">Insider</th>' : ""}${showCompany ? '<th scope="col">Company</th>' : ""}<th scope="col">Transaction</th><th scope="col" class="pp-num">Shares</th><th scope="col" class="pp-num">Price</th><th scope="col" class="pp-num">Value</th><th scope="col">Trade date</th><th scope="col">Filed</th></tr>`;
  const body = rows.map(row => {
    const kind = kindOf(row), source = safeHttp(row.source_url);
    const company = tickerOk(row.ticker) ? `<a href="${esc(companyUrl(row.ticker))}"><b>${esc(row.ticker)}</b></a> <span class="pp-muted">${esc(displayName(row.issuer_name))}</span>` : esc(displayName(row.issuer_name));
    const what = esc(codeWords(row.transaction_code)) + (row.transaction_code ? ` <span class="pp-code">${esc(String(row.transaction_code).toUpperCase())}</span>` : "") +
      (row.derivative ? ' <span class="pp-muted">derivative</span>' : "") + (row.is_amendment ? ' <span class="pp-muted">4/A</span>' : "");
    return `<tr>
<td>${badge(kind)}</td>${showPerson ? `<td>${whoCell(row)}</td>` : ""}${showCompany ? `<td>${company}</td>` : ""}
<td>${what}</td><td class="pp-num">${shares(row.shares)}</td><td class="pp-num">${row.price_per_share == null ? "—" : money(row.price_per_share, { compact: false })}</td>
<td class="pp-num pp-val pp-val--${kind}">${money(row.estimated_value)}</td><td>${esc(day(row.transaction_date))}</td>
<td>${source ? `<a href="${esc(source)}" rel="nofollow noopener" target="_blank">${esc(day(row.published_at))} <span class="v13-arrow" aria-hidden="true">↗</span></a>` : esc(day(row.published_at))}</td></tr>`;
  }).join("\n");
  return `<div class="pp-table-wrap" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="pp-table"><caption class="hwf-sr">${esc(caption)}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

const stat = (label, value, note, tone = "") => `<div class="pp-stat${tone ? " pp-stat--" + tone : ""}"><dt>${esc(label)}</dt><dd>${value}</dd>${note ? `<p>${esc(note)}</p>` : ""}</div>`;

/* ---------- data ---------- */
const PARSED_LINE_COLUMNS = `t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.security_title,t.transaction_code,
  t.acquired_disposed,t.category,t.derivative,t.shares,t.price_per_share,t.estimated_value,t.source_url,f.issuer_name,f.published_at,f.is_amendment`;

export const COMPANY_SQL = Object.freeze({
  lines: `SELECT ${PARSED_LINE_COLUMNS} FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE t.ticker=$1 AND f.ingest_status='parsed'
    ORDER BY t.transaction_date DESC NULLS LAST,f.published_at DESC NULLS LAST,t.id DESC LIMIT $2`,
  // Original filings only: a Form 4/A restates lines already counted, so amendments are listed but not added up.
  totals: `SELECT
    (COUNT(*) FILTER (WHERE t.category='reported_purchase'))::integer AS buys,
    COALESCE(SUM(t.estimated_value) FILTER (WHERE t.category='reported_purchase'),0) AS buy_value,
    (COUNT(*) FILTER (WHERE t.category='reported_sale'))::integer AS sells,
    COALESCE(SUM(t.estimated_value) FILTER (WHERE t.category='reported_sale'),0) AS sell_value,
    (COUNT(*) FILTER (WHERE t.category='other'))::integer AS other,
    (COUNT(DISTINCT t.accession))::integer AS filings,
    MAX(f.published_at) AS last_published_at
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE t.ticker=$1 AND f.ingest_status='parsed' AND NOT f.is_amendment AND t.transaction_date>=current_date-${DAY_WINDOW}`,
  insiders: joint => `SELECT LPAD(l.bare,10,'0') AS owner_cik,(ARRAY_AGG(l.owner_name ORDER BY l.transaction_date DESC NULLS LAST))[1] AS owner_name,
    MAX(l.transaction_date) AS last_transaction_date,COUNT(*)::integer AS lines,
    COALESCE(SUM(l.estimated_value) FILTER (WHERE l.category='reported_purchase'),0) AS buy_value,
    COALESCE(SUM(l.estimated_value) FILTER (WHERE l.category='reported_sale'),0) AS sell_value
    FROM (SELECT LTRIM(t.owner_cik,'0') AS bare,t.owner_name,t.transaction_date,t.category,t.estimated_value FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
      WHERE t.ticker=$1 AND t.owner_cik IS NOT NULL AND f.ingest_status='parsed' AND NOT f.is_amendment${joint ? `
      UNION ALL SELECT LTRIM(o.owner_cik,'0'),o.owner_name,t.transaction_date,t.category,t.estimated_value FROM sec_filing_owners o
      JOIN sec_transactions t ON t.accession=o.accession AND t.owner_cik IS NULL JOIN sec_filings f ON f.accession=t.accession
      WHERE t.ticker=$1 AND f.ingest_status='parsed' AND NOT f.is_amendment` : ""}) l
    WHERE l.bare<>'' GROUP BY l.bare ORDER BY MAX(l.transaction_date) DESC NULLS LAST,l.bare LIMIT 24`
});

export const HUB_SQL = Object.freeze({
  // Open-market trades only (codes P and S, non-derivative) from original filings, biggest first.
  biggest: category => `SELECT ${PARSED_LINE_COLUMNS} FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE f.ingest_status='parsed' AND NOT f.is_amendment AND t.category='${category}' AND NOT t.derivative
      AND t.transaction_date>=current_date-30 AND t.estimated_value IS NOT NULL
    ORDER BY t.estimated_value DESC,t.transaction_date DESC LIMIT $1`,
  latest: `SELECT ${PARSED_LINE_COLUMNS} FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE f.ingest_status='parsed' AND t.category IN ('reported_purchase','reported_sale')
    ORDER BY f.published_at DESC NULLS LAST,t.transaction_date DESC NULLS LAST,t.id DESC LIMIT $1`,
  companies: `SELECT t.ticker,(ARRAY_AGG(f.issuer_name ORDER BY f.published_at DESC NULLS LAST))[1] AS issuer_name,
    (COUNT(DISTINCT t.accession))::integer AS filings,
    (COUNT(*) FILTER (WHERE t.category='reported_purchase'))::integer AS buys,
    (COUNT(*) FILTER (WHERE t.category='reported_sale'))::integer AS sells,
    MAX(f.published_at) AS last_published_at
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE f.ingest_status='parsed' AND t.ticker IS NOT NULL AND f.published_at>=now()-interval '30 days'
    GROUP BY t.ticker ORDER BY COUNT(DISTINCT t.accession) DESC,t.ticker LIMIT 24`,
  totals: `SELECT (COUNT(DISTINCT f.accession))::integer AS filings,(COUNT(DISTINCT t.ticker))::integer AS companies,
    COALESCE(SUM(t.estimated_value) FILTER (WHERE t.category='reported_purchase' AND NOT f.is_amendment),0) AS buy_value,
    COALESCE(SUM(t.estimated_value) FILTER (WHERE t.category='reported_sale' AND NOT f.is_amendment),0) AS sell_value,
    MAX(f.published_at) AS last_published_at
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE f.ingest_status='parsed' AND f.published_at>=now()-interval '30 days'`
});

export const SITEMAP_SQL = Object.freeze({
  companies: `SELECT ticker,MAX(published_at) AS lastmod FROM sec_filings WHERE ingest_status='parsed' AND ticker IS NOT NULL AND ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'
    GROUP BY ticker ORDER BY ticker LIMIT $1 OFFSET $2`,
  companyCount: `SELECT COUNT(DISTINCT ticker)::integer AS n FROM sec_filings WHERE ingest_status='parsed' AND ticker IS NOT NULL AND ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'`,
  insiders: joint => `SELECT l.bare,(ARRAY_AGG(l.owner_name ORDER BY l.published_at DESC NULLS LAST))[1] AS owner_name,MAX(l.published_at) AS lastmod
    FROM (SELECT LTRIM(t.owner_cik,'0') AS bare,t.owner_name,f.published_at FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
      WHERE t.owner_cik IS NOT NULL AND f.ingest_status='parsed'${joint ? `
      UNION ALL SELECT LTRIM(o.owner_cik,'0'),o.owner_name,f.published_at FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession WHERE f.ingest_status='parsed'` : ""}) l
    WHERE l.bare<>'' GROUP BY l.bare ORDER BY l.bare LIMIT $1 OFFSET $2`,
  insiderCount: joint => `SELECT COUNT(DISTINCT l.bare)::integer AS n FROM (SELECT LTRIM(t.owner_cik,'0') AS bare FROM sec_transactions t WHERE t.owner_cik IS NOT NULL${joint ? `
      UNION ALL SELECT LTRIM(o.owner_cik,'0') FROM sec_filing_owners o` : ""}) l WHERE l.bare<>''`
});

/* ---------- pages ---------- */
export async function hubPage({ query, origin }) {
  const [buys, sells, latest, companies, totals] = await Promise.all([
    query(HUB_SQL.biggest("reported_purchase"), [HUB_ROWS]), query(HUB_SQL.biggest("reported_sale"), [HUB_ROWS]),
    query(HUB_SQL.latest, [HUB_ROWS]), query(HUB_SQL.companies, []), query(HUB_SQL.totals, [])
  ]).then(r => r.map(x => x.rows || []));
  const joint = await hasFilingOwners(query);
  await withJointOwners([...buys, ...sells, ...latest], query, joint);
  const t = totals[0] || {};
  const companyList = companies.length ? `<ul class="pp-companies">${companies.filter(c => tickerOk(c.ticker)).map(c => `<li><a href="${esc(companyUrl(c.ticker))}"><b>${esc(c.ticker)}</b><span>${esc(displayName(c.issuer_name))}</span><em>${c.filings} filing${c.filings === 1 ? "" : "s"}${c.buys ? ` · ${c.buys} bought` : ""}${c.sells ? ` · ${c.sells} sold` : ""}</em></a></li>`).join("")}</ul>` : `<p class="pp-empty">No filings in the last 30 days are imported yet.</p>`;
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Insider trades", null]])}
 <p class="pp-label">SEC Form 4 · updated every 15 minutes</p>
 <h1 id="pp-title">Insider trading, <span>from the filings.</span></h1>
 <p class="pp-lede">What officers, directors and 10% owners of US public companies report buying and selling, read from the Form 4s they file with the SEC. Open-market purchases and sales are kept apart from awards, exercises and gifts, and every line links to the filing. These are legally required public reports, published by the SEC: not nonpublic information, and not a recommendation.</p>
 <dl class="pp-stats">
  ${stat("Filings, 30 days", esc((t.filings ?? 0).toLocaleString("en-US")), "Form 4 and 4/A, as imported")}
  ${stat("Companies", esc((t.companies ?? 0).toLocaleString("en-US")), "with a filing in the window")}
  ${stat("Reported purchases", esc(money(t.buy_value)), "original filings, 30 days", "buy")}
  ${stat("Reported sales", esc(money(t.sell_value)), "original filings, 30 days", "sell")}
 </dl>
</section>
<section class="pp-section mk-shell" aria-labelledby="pp-buys">
 <div class="pp-head"><h2 id="pp-buys">Biggest open-market purchases</h2><p>Last 30 days, by reported value. Code P, non-derivative, original filings.</p></div>
 ${linesTable(buys, { showCompany: true, caption: "Biggest insider purchases in the last 30 days" })}
</section>
<section class="pp-section mk-shell" aria-labelledby="pp-sells">
 <div class="pp-head"><h2 id="pp-sells">Biggest open-market sales</h2><p>Last 30 days, by reported value. Code S, non-derivative, original filings.</p></div>
 ${linesTable(sells, { showCompany: true, caption: "Biggest insider sales in the last 30 days" })}
</section>
<section class="pp-section mk-shell" aria-labelledby="pp-latest">
 <div class="pp-head"><h2 id="pp-latest">Just filed</h2><p>The newest purchases and sales, by filing date.</p></div>
 ${linesTable(latest, { showCompany: true, caption: "Newest insider purchases and sales" })}
</section>
<section class="pp-section mk-shell" aria-labelledby="pp-active">
 <div class="pp-head"><h2 id="pp-active">Most active companies</h2><p>Most Form 4 filings in the last 30 days.</p></div>
 ${companyList}
</section>
<div class="mk-shell">${upsell("Follow the people behind the trades.")}</div>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">About this data</h2>
 <p>Insiders must report most trades in their company's stock on SEC Form 4, generally within two business days. Values are shares × the price the filer reported; lines without a reported price are not valued. Purchases and sales here are open-market trades (codes P and S); grants, option exercises, tax withholding and gifts are listed as other transactions. Totals count original filings only, because a Form 4/A restates lines already filed. This is a public record, not a recommendation or a prediction.</p>
</section>`;
  return {
    html: shell({ origin, canonical: "/insider-trading", current: true,
      title: "Insider trading today: latest Form 4 buys and sells — Insidir",
      description: "The latest insider purchases and sales at US public companies, read from SEC Form 4 filings: biggest open-market buys and sells of the last 30 days, the newest filings and the most active companies.",
      body, jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Insider trading from SEC Form 4 filings", url: origin + "/insider-trading" } })
  };
}

export async function companyPage(ticker, { query, origin }) {
  const joint = await hasFilingOwners(query);
  const [lines, totals, insiders] = await Promise.all([
    query(COMPANY_SQL.lines, [ticker, COMPANY_LINES]), query(COMPANY_SQL.totals, [ticker]), query(COMPANY_SQL.insiders(joint), [ticker])
  ]).then(r => r.map(x => x.rows || []));
  if (!lines.length) return null;
  await withJointOwners(lines, query, joint);
  const name = displayName(lines.find(r => r.issuer_name)?.issuer_name) || ticker;
  const t = totals[0] || {};
  const net = (num(t.buy_value) || 0) - (num(t.sell_value) || 0);
  const people = insiders.length ? `<ul class="pp-people">${insiders.map(p => `<li><a href="${esc(personUrl(p.owner_cik, p.owner_name))}"><b>${esc(displayName(p.owner_name))}</b><span>${p.lines} line${p.lines === 1 ? "" : "s"} · last ${esc(day(p.last_transaction_date))}</span>${num(p.buy_value) ? `<em class="pp-val--buy">Bought ${esc(money(p.buy_value))}</em>` : ""}${num(p.sell_value) ? `<em class="pp-val--sell">Sold ${esc(money(p.sell_value))}</em>` : ""}</a></li>`).join("")}</ul>` : `<p class="pp-empty">No reporting people are imported for ${esc(ticker)} yet.</p>`;
  const cik = String(lines[0].issuer_cik || "").replace(/^0+/, "");
  const edgar = cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik.padStart(10, "0")}&type=4&dateb=&owner=include&count=40` : null;
  const latest = lines[0];
  const description = `${name} (${ticker}) insider trading: recent SEC Form 4 purchases and sales by its officers, directors and 10% owners` +
    (t.buys || t.sells ? `. Last ${DAY_WINDOW} days: ${t.buys} purchase${t.buys === 1 ? "" : "s"} (${money(t.buy_value)}) and ${t.sells} sale${t.sells === 1 ? "" : "s"} (${money(t.sell_value)}).` : ".");
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Insider trades", "/insider-trading"], [ticker, null]])}
 <p class="pp-label">${esc(ticker)} · SEC Form 4</p>
 <h1 id="pp-title">${esc(name)} <span>insider trading.</span></h1>
 <p class="pp-lede">Purchases, sales and other Form 4 transactions reported by ${esc(name)}'s officers, directors and 10% owners. Latest filing ${esc(day(latest.published_at))}. Form 4s are public reports insiders must file with the SEC, not nonpublic information.</p>
 <dl class="pp-stats">
  ${stat(`Purchases, ${DAY_WINDOW} days`, `${esc(money(t.buy_value))} <small>${t.buys ?? 0} line${t.buys === 1 ? "" : "s"}</small>`, "open-market and other reported purchases", num(t.buy_value) ? "buy" : "")}
  ${stat(`Sales, ${DAY_WINDOW} days`, `${esc(money(t.sell_value))} <small>${t.sells ?? 0} line${t.sells === 1 ? "" : "s"}</small>`, "reported sales", num(t.sell_value) ? "sell" : "")}
  ${stat("Net", esc((net > 0 ? "+" : net < 0 ? "−" : "") + money(Math.abs(net))), "purchases minus sales, reported values", net > 0 ? "buy" : net < 0 ? "sell" : "")}
  ${stat("Filings", esc(String(t.filings ?? 0)), `original Form 4s, ${DAY_WINDOW} days`)}
 </dl>
 <p class="pp-actions"><a class="v9-btn v9-btn--ink" href="/signup.html">Open the full ${esc(ticker)} report <span class="v13-arrow" aria-hidden="true">→</span></a>${edgar ? `<a class="v9-btn v12-outline-button" href="${esc(edgar)}" rel="nofollow noopener" target="_blank">Form 4s on EDGAR <span class="v13-arrow" aria-hidden="true">↗</span></a>` : ""}</p>
</section>
<section class="pp-section mk-shell" aria-labelledby="pp-lines">
 <div class="pp-head"><h2 id="pp-lines">Recent Form 4 transactions</h2><p>The ${lines.length} newest lines by trade date. Each filing date links to the document on SEC EDGAR.</p></div>
 ${linesTable(lines, { caption: `Recent ${ticker} insider transactions` })}
</section>
<section class="pp-section mk-shell" aria-labelledby="pp-people">
 <div class="pp-head"><h2 id="pp-people">Insiders at ${esc(name)}</h2><p>People who reported transactions in ${esc(ticker)}, most recent first.</p></div>
 ${people}
</section>
<div class="mk-shell">${upsell(`Everything on ${ticker}, in one report.`)}</div>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">About these numbers</h2>
 <p>Values are shares × the price per share the filer reported; a line without a price is not valued. Totals cover original Form 4 filings with a trade date in the last ${DAY_WINDOW} days; Form 4/A amendments are listed in the table but not added up again. Purchases include every line the filer reported as acquired by purchase. A public record, not a recommendation or a prediction.</p>
</section>`;
  return {
    html: shell({ origin, canonical: companyUrl(ticker), title: `${name} (${ticker}) insider trading — Form 4 buys and sells — Insidir`, description, body,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: `${name} insider trading`, url: origin + companyUrl(ticker),
        about: { "@type": "Corporation", name, tickerSymbol: ticker } } })
  };
}

export async function personPage(cik, { query, origin }) {
  const profile = await personProfile(cik, { query, limit: PERSON_LINES, starts: { documents: 0, ownerPages: 0 } });
  if (!profile) return null;
  const filed = profile.person.name || profile.person.filed_names?.[0] || "";
  const name = displayName(filed) || "Reporting person " + String(cik).replace(/^0+/, "");
  const canonical = personUrl(cik, filed);
  const all = profile.totals.all, d30 = profile.totals.d30;
  const companies = profile.companies.slice(0, 20);
  const primary = companies[0];
  const roleText = c => Array.isArray(c.roles) && c.roles.length ? c.roles.join(" · ") : "";
  const companyRows = companies.length ? `<ul class="pp-people pp-people--companies">${companies.map(c => {
    const label = c.ticker ? `<b>${esc(c.ticker)}</b> ${esc(displayName(c.issuer_name))}` : `<b>${esc(displayName(c.issuer_name) || "Issuer " + c.issuer_cik)}</b>`;
    const inner = `${label}<span>${esc(roleText(c) || "Reporting person")} · ${c.transactions} line${c.transactions === 1 ? "" : "s"} · last ${esc(day(c.last_transaction_date))}</span>${num(c.purchases_value) ? `<em class="pp-val--buy">Bought ${esc(money(c.purchases_value))}</em>` : ""}${num(c.sales_value) ? `<em class="pp-val--sell">Sold ${esc(money(c.sales_value))}</em>` : ""}`;
    return `<li>${tickerOk(c.ticker) ? `<a href="${esc(companyUrl(c.ticker))}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
  }).join("")}</ul>` : "";
  const role = primary ? [roleText(primary), primary.ticker ? displayName(primary.issuer_name) || primary.ticker : displayName(primary.issuer_name)].filter(Boolean).join(", ") : "";
  const description = `${name}${role ? ` (${role})` : ""}: insider trades reported on SEC Form 4. ${all.purchases.count} purchase${all.purchases.count === 1 ? "" : "s"} (${money(all.purchases.value)}) and ${all.sales.count} sale${all.sales.count === 1 ? "" : "s"} (${money(all.sales.value)}) in Insidir's import.`;
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Insider trades", "/insider-trading"], [name, null]])}
 <p class="pp-label">Reporting person · SEC CIK ${esc(String(cik).replace(/^0+/, ""))}</p>
 <h1 id="pp-title">${esc(name)} <span>insider trades.</span></h1>
 <p class="pp-lede">${role ? esc(role) + ". " : ""}Every Form 4 line below is a public SEC record${filed && filed !== name ? `, filed under the name ${esc(filed)}` : ""}. Last filing ${esc(day(all.last_published_at))}.</p>
 <dl class="pp-stats">
  ${stat("Purchases", `${esc(money(all.purchases.value))} <small>${all.purchases.count} line${all.purchases.count === 1 ? "" : "s"}</small>`, "all imported filings", "buy")}
  ${stat("Sales", `${esc(money(all.sales.value))} <small>${all.sales.count} line${all.sales.count === 1 ? "" : "s"}</small>`, "all imported filings", "sell")}
  ${stat("Last 30 days", `${d30.transactions} <small>line${d30.transactions === 1 ? "" : "s"}</small>`, `${money(d30.purchases.value)} bought · ${money(d30.sales.value)} sold`)}
  ${stat("Companies", esc(String(profile.companies.length)), "where this person reports")}
 </dl>
 <p class="pp-actions"><a class="v9-btn v9-btn--ink" href="/signup.html">Follow ${esc(name.split(" ")[0] || name)} in Insidir <span class="v13-arrow" aria-hidden="true">→</span></a><a class="v9-btn v12-outline-button" href="${esc(profile.edgar_url)}" rel="nofollow noopener" target="_blank">Filings on EDGAR <span class="v13-arrow" aria-hidden="true">↗</span></a></p>
</section>
${companyRows ? `<section class="pp-section mk-shell" aria-labelledby="pp-companies"><div class="pp-head"><h2 id="pp-companies">Companies and roles</h2><p>Roles as written in the person's latest Form 4 at each company.</p></div>${companyRows}</section>` : ""}
<section class="pp-section mk-shell" aria-labelledby="pp-lines">
 <div class="pp-head"><h2 id="pp-lines">Recent transactions</h2><p>The ${profile.transactions.length} newest lines by trade date${all.transactions > profile.transactions.length ? ` of ${all.transactions.toLocaleString("en-US")}` : ""}. Each filing date links to the document on SEC EDGAR.</p></div>
 ${linesTable(profile.transactions, { showCompany: true, showPerson: false, caption: `Recent insider transactions by ${name}` })}
</section>
<div class="mk-shell">${upsell(`Know the next time ${name.split(" ")[0] || name} files.`)}</div>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">About this record</h2>
 <p>Built only from public SEC Form 4 filings in Insidir's import. Values are shares × the price the filer reported. A line repeated by a later Form 4/A is counted once in the totals. Insidir does not estimate holdings or predict trades; this is not investment advice.</p>
</section>`;
  return {
    canonical,
    html: shell({ origin, canonical, title: `${name} insider trades — SEC Form 4 filings — Insidir`, description, body,
      jsonLd: { "@context": "https://schema.org", "@type": "ProfilePage", url: origin + canonical,
        mainEntity: { "@type": "Person", name, ...(primary?.issuer_name ? { affiliation: { "@type": "Organization", name: displayName(primary.issuer_name) } } : {}) } } })
  };
}

function notFoundPage(origin, what) {
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Insider trades", "/insider-trading"], ["Not found", null]])}
 <p class="pp-label">404</p>
 <h1 id="pp-title">No Form 4s <span>imported yet.</span></h1>
 <p class="pp-lede">Insidir has no imported Form 4 lines for ${esc(what)}. That does not mean none exist: the import covers recent filings and grows every 15 minutes.</p>
 <p class="pp-actions"><a class="v9-btn v9-btn--ink" href="/insider-trading">Latest insider trades <span class="v13-arrow" aria-hidden="true">→</span></a></p>
</section>`;
  return shell({ origin, canonical: "/insider-trading", title: "Not found — Insidir", description: "No imported Form 4 lines.", body, noindex: true });
}

/* ---------- robots and sitemaps ---------- */
export function robotsTxt(origin) {
  return `User-agent: *
Allow: /
Disallow: /v1/
Disallow: /dashboard
Disallow: /research
Disallow: /explore
Disallow: /company.html
Disallow: /filings
Disallow: /filing.html
Disallow: /people.html
Disallow: /person.html
Disallow: /watchlist
Disallow: /portfolio
Disallow: /alerts
Disallow: /subscribe
Disallow: /billing
Disallow: /account

Sitemap: ${origin}/sitemap.xml
`;
}
const PUBLIC_STATIC = ["/", "/platform.html", "/why-insidir.html", "/data.html", "/pricing.html", "/company-info.html", "/insider-trading", "/signup.html", "/terms.html", "/privacy.html", "/disclosures.html", "/subscription-policy.html"];
const xmlEsc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const urlset = urls => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
export async function sitemapIndex({ query, origin }) {
  const joint = await hasFilingOwners(query);
  const [c, p] = await Promise.all([query(SITEMAP_SQL.companyCount, []), query(SITEMAP_SQL.insiderCount(joint), [])]);
  const files = ["/sitemaps/pages.xml"];
  for (let i = 1; i <= Math.max(1, Math.ceil((c.rows[0]?.n || 0) / SITEMAP_PAGE)); i++) files.push(`/sitemaps/companies-${i}.xml`);
  for (let i = 1; i <= Math.max(1, Math.ceil((p.rows[0]?.n || 0) / SITEMAP_PAGE)); i++) files.push(`/sitemaps/insiders-${i}.xml`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map(f => `<sitemap><loc>${xmlEsc(origin + f)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}
export async function sitemapFile(kind, page, { query, origin }) {
  if (kind === "pages") return urlset(PUBLIC_STATIC.map(p => ({ loc: origin + p })));
  const offset = (page - 1) * SITEMAP_PAGE;
  if (kind === "companies") {
    const rows = (await query(SITEMAP_SQL.companies, [SITEMAP_PAGE, offset])).rows || [];
    return urlset(rows.map(r => ({ loc: origin + companyUrl(r.ticker), lastmod: isoDate(r.lastmod) })));
  }
  const joint = await hasFilingOwners(query);
  const rows = (await query(SITEMAP_SQL.insiders(joint), [SITEMAP_PAGE, offset])).rows || [];
  return urlset(rows.map(r => ({ loc: origin + personUrl(r.bare, r.owner_name), lastmod: isoDate(r.lastmod) })));
}

/* ---------- serving ---------- */
const HEADERS = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
const cache = new Map();
const hits = new Map();
function limited(key) {
  const now = Date.now();
  if (hits.size > 10000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  const v = hits.get(key);
  if (!v || v.until <= now) { hits.set(key, { count: 1, until: now + 60_000 }); return false; }
  return ++v.count > RENDERS_PER_MINUTE;
}
export function clearPublicPageCache() { cache.clear(); hits.clear(); }

function send(req, res, status, type, body, maxAge) {
  const bytes = Buffer.from(body);
  res.writeHead(status, { ...HEADERS, "Content-Type": type, "Content-Length": bytes.length,
    "Cache-Control": maxAge ? `public, max-age=${maxAge}, stale-while-revalidate=600` : "no-store" });
  res.end(req.method === "HEAD" ? undefined : bytes);
  return true;
}
function redirect(res, location) {
  res.writeHead(301, { ...HEADERS, Location: location, "Cache-Control": "public, max-age=3600", "Content-Length": "0" });
  res.end();
  return true;
}

/* Returns false when the path is not a public page; otherwise responds (true). deps:
 *   query(sql, params)  the engine's query function
 *   env                 for INSIDIR_PUBLIC_URL (absolute URLs in canonicals and sitemaps)
 *   requester           rate-limit key for uncached renders (the client address) */
export async function handlePublicPage(req, res, url, { query, env = process.env, requester = "unknown" } = {}) {
  const p = url.pathname;
  if (!isPublicPagePath(p)) return false;
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const origin = siteOrigin(env);
  if (p === "/robots.txt") return send(req, res, 200, "text/plain; charset=utf-8", robotsTxt(origin), 3600);
  if (typeof query !== "function") return false;

  // Canonical forms first: /insider-trading/nvda -> /insider-trading/NVDA, a missing or stale name slug -> the current one.
  const tickerMatch = TICKER_PATH.exec(p);
  let ticker = null;
  if (tickerMatch) {
    let raw;
    try { raw = decodeURIComponent(tickerMatch[1]); } catch { return send(req, res, 404, "text/html; charset=utf-8", notFoundPage(origin, "this company"), 0); }
    ticker = raw.trim().toUpperCase().replace(/\./g, "-");
    if (!/^[A-Z0-9][A-Z0-9-]{0,14}$/.test(ticker)) return send(req, res, 404, "text/html; charset=utf-8", notFoundPage(origin, "this company"), 0);
    if (companyUrl(ticker) !== p) return redirect(res, companyUrl(ticker));
  }
  if (p === "/insider-trading/") return redirect(res, "/insider-trading");
  if (/^\/insiders\//.test(p) && !PERSON_PATH.test(p)) return send(req, res, 404, "text/html; charset=utf-8", notFoundPage(origin, "this person"), 0);

  const key = p;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) {
    if (hit.redirect && hit.redirect !== p) return redirect(res, hit.redirect);
    return send(req, res, hit.status, hit.type, hit.body, hit.status === 200 ? 600 : 0);
  }
  if (limited("render:" + requester)) {
    res.setHeader("Retry-After", "30");
    return send(req, res, 429, "text/plain; charset=utf-8", "Too many requests. Try again shortly.\n", 0);
  }
  let out;
  const xml = "application/xml; charset=utf-8", html = "text/html; charset=utf-8";
  if (p === "/sitemap.xml") out = { status: 200, type: xml, body: await sitemapIndex({ query, origin }) };
  else if (SITEMAP_PATH.test(p)) {
    const m = SITEMAP_PATH.exec(p), kind = m[1] === "pages" ? "pages" : m[2] ? "companies" : "insiders", page = Number(m[2] || m[3] || 1);
    if (page < 1) return send(req, res, 404, "text/plain; charset=utf-8", "Not found\n", 0);
    out = { status: 200, type: xml, body: await sitemapFile(kind, page, { query, origin }) };
  } else if (p === "/insider-trading") out = { status: 200, type: html, body: (await hubPage({ query, origin })).html };
  else if (ticker) {
    const page = await companyPage(ticker, { query, origin });
    out = page ? { status: 200, type: html, body: page.html } : { status: 404, type: html, body: notFoundPage(origin, ticker) };
  } else {
    const m = PERSON_PATH.exec(p);
    try { parsePersonCik(m[1]); } catch { return send(req, res, 404, html, notFoundPage(origin, "this person"), 0); }
    const page = await personPage(m[1], { query, origin });
    if (!page) out = { status: 404, type: html, body: notFoundPage(origin, "this person") };
    else {
      out = { status: 200, type: html, body: page.html, redirect: page.canonical };
      cache.set(page.canonical, { ...out, until: Date.now() + CACHE_TTL_MS });
    }
  }
  cache.set(key, { ...out, until: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  if (out.redirect && out.redirect !== p) return redirect(res, out.redirect);
  return send(req, res, out.status, out.type, out.body, out.status === 200 ? 600 : 0);
}
