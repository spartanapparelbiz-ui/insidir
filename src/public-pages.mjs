/* Public, server-rendered insider pages: the part of Insidir that search engines and signed-out
 * visitors can read. Everything here is a public SEC Form 4 record from the engine's own import,
 * rendered as plain HTML (no script needed) so it can be indexed, shared and read on any device.
 * The product (company reports, financials, full histories, people you follow, watchlist, alerts,
 * the research journal) stays behind the paywall; every page here ends with the way in.
 *
 *   GET /insider-trading                  the latest open-market purchases and sales, most active companies
 *   GET /insider-trading/<TICKER>         301 to /<TICKER>, the public stock page (src/ticker-page.mjs)
 *   GET /insiders/<cik>[-<name-slug>]     one reporting person: companies and roles, totals, recent lines
 *   GET /sitemap.xml                      a sitemap index; /sitemaps/pages.xml, companies-N.xml, insiders-N.xml
 *   GET /robots.txt                       public pages allowed, the product and the API disallowed
 *
 * The research stories (src/stories.mjs, static pages under /web/stories) are listed on the hub, linked from a
 * company or person page they cover, and included in the sitemap.
 *
 * src/paywall.mjs classifies these paths as public (nested paths, and /insider-trading is not a product
 * page). Pages never depend on who is asking, so they are cached in memory for CACHE_TTL_MS and may be
 * cached publicly; uncached renders are limited per client address so a crawler cannot hammer the
 * database. Person pages start no SEC requests (personProfile with starts 0): roles come from
 * sec_filing_owners or the SEC documents already cached. */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { TRANSACTION_CODES } from "./insiders.mjs";
import { personProfile, parsePersonCik, hasFilingOwners, withJointOwners } from "./person-profile.mjs";
import { STORIES, PUBLIC_STORY_PATHS, storyPath, storiesForTicker, storiesForPerson } from "./stories.mjs";
import { uiHead, uiNav, uiFooter, uiLogo, uiInitials, uiTrade } from "./site-ui.mjs";
import { scripts } from "./site-v2.mjs";

export const CACHE_TTL_MS = 10 * 60_000, CACHE_ENTRIES = 3000;
export const RENDERS_PER_MINUTE = 90;
export const SITEMAP_PAGE = 40000;
export const PERSON_LINES = 30, HUB_ROWS = 15;
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
export const companyUrl = ticker => "/" + encodeURIComponent(String(ticker || "").toUpperCase()); // the public stock page (src/ticker-page.mjs)
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

/* ---------- the page shell ---------- */
export function siteOrigin(env = process.env) {
  const raw = String(env.INSIDIR_PUBLIC_URL || "").trim();
  try { const u = new URL(raw); if (u.protocol === "https:" || u.protocol === "http:") return u.origin; } catch { /* default */ }
  return "https://insidir.com";
}
/* The public site's chrome (src/site-ui.mjs, ui.css + site.css inlined, plus site-pages.css): the landing page's nav and
   footer. No product script runs here: logos and people show their initials (the media batch is a member route). */
function shell({ title, description, canonical, body, origin, noindex = false, jsonLd = null }) {
  return uiHead({ title, description, canonical, origin, noindex,
    extra: `<link rel="stylesheet" href="/assets/css/site-pages.css?v=2">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` : ""}` }) + `
<body class="ui site">
<a class="skip" href="#main">Skip to content</a>
${uiNav({ cta: "nav" })}
<main id="main" class="sp-main">
${body}
</main>
${uiFooter()}
${scripts()}
<script src="/assets/js/referral.js?v=1" defer></script>
</body>
</html>
`;
}

const crumbs = items => `<nav class="sp-crumbs" aria-label="Breadcrumb"><ol>${items.map(([label, href]) => `<li>${href ? `<a class="slink muted" href="${esc(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join("")}</ol></nav>`;
const section = (id, heading, note, inner) => `<section class="ssec sp-rec" aria-labelledby="${id}"><div class="swrap">
 <header class="ssec__head"><h2 class="t-title" id="${id}">${esc(heading)}</h2>${note ? `<p class="ssec__p">${esc(note)}</p>` : ""}</header>
 ${inner}
</div></section>`;

// The trial offer every public page ends with.
export function upsell(subject) {
  return `<section class="ssec" aria-labelledby="pp-upsell-h" data-pp-upsell><div class="swrap"><div class="sp-split">
 <div class="sp-end"><p class="t-label muted">The full record</p><h2 class="t-title" id="pp-upsell-h">${esc(subject)}</h2>
  <ul class="sp-list"><li><span>Every Form 4 line in plain English, amendments counted once, with the filing one click away</span></li><li><span>A page for every stock: the price chart with every insider buy and sale, insiders and their track records</span></li><li><span>Follow people and watch companies; alerts in the app minutes after a new filing</span></li></ul></div>
 <div class="card sprice"><p class="t-label muted">Insidir Pro</p><p class="t-hero big"><span class="u">$</span>1<span class="u"> for 7 days</span></p>
  <p class="muted">Then $39 a month. Cancel online anytime.</p>
  <a class="btn btn--primary btn--lg" href="/signup.html" data-cta="page">Start 7 days for $1</a>
  <a class="slink muted t-label" href="/platform.html">See everything Insidir does</a></div>
</div></div></section>`;
}

// Research stories as a list of cards (the stories' own pages carry the full design).
export function storyList(stories) {
  return `<ul class="sp-grid sp-grid--2 sp-stories">${stories.map(s => `<li><a class="card sp-card" href="${esc(storyPath(s))}"><p class="t-label muted">${esc(s.kind)} · ${esc(s.form)} · filed ${esc(day(s.filed))}</p><h3 class="t-section">${esc(s.title)}</h3><p class="muted sp-more">Read the research →</p></a></li>`).join("")}</ul>`;
}
const storiesSection = (stories, heading, note) => stories.length ? section("pp-stories", heading, note, storyList(stories)) : "";

const badge = kind => kind === "other" ? `<span class="trade trade--plan">Other</span>` : uiTrade(kind);
const face = name => `<span class="mono face face--24" aria-hidden="true"><span class="face__mono">${esc(uiInitials(displayName(name)))}</span></span>`;

// One person cell: a linked name, or for a joint filing every owner it lists.
function whoCell(row) {
  if (row.owner_cik != null) return `<span class="scell">${face(row.owner_name)}<a class="slink" href="${esc(personUrl(row.owner_cik, row.owner_name))}">${esc(displayName(row.owner_name))}</a></span>`;
  const owners = Array.isArray(row.owners) ? row.owners.filter(o => o?.cik) : [];
  if (!owners.length) return esc(displayName(row.owner_name)) || "Joint filing";
  const first = owners[0];
  const rest = owners.length - 1;
  return `<span class="scell">${face(first.name)}<span><a class="slink" href="${esc(personUrl(first.cik, first.name))}">${esc(displayName(first.name))}</a>${rest ? ` <span class="muted">and ${rest} other${rest === 1 ? "" : "s"}</span>` : ""}</span></span>`;
}

function linesTable(rows, { showCompany = false, showPerson = true, caption }) {
  if (!rows.length) return `<p class="muted">No Form 4 lines are imported yet.</p>`;
  const head = `<tr><th scope="col">Type</th>${showPerson ? '<th scope="col">Insider</th>' : ""}${showCompany ? '<th scope="col">Company</th>' : ""}<th scope="col">Transaction</th><th scope="col" class="r">Shares</th><th scope="col" class="r">Price</th><th scope="col" class="r">Value</th><th scope="col">Trade date</th><th scope="col">Filed</th></tr>`;
  const body = rows.map(row => {
    const kind = kindOf(row), source = safeHttp(row.source_url);
    const linked = text => source ? `<a class="slink" href="${esc(source)}" rel="nofollow noopener" target="_blank">${text}</a>` : text;
    const company = tickerOk(row.ticker) ? `<span class="scell">${uiLogo(row.ticker, 24)}<span class="scell__t"><a class="slink" href="${esc(companyUrl(row.ticker))}">${esc(row.ticker)}</a><span class="t-label muted">${esc(displayName(row.issuer_name))}</span></span></span>` : esc(displayName(row.issuer_name));
    const what = esc(codeWords(row.transaction_code)) + (row.transaction_code ? ` <span class="muted">(${esc(String(row.transaction_code).toUpperCase())})</span>` : "") +
      (row.derivative ? ' <span class="muted">derivative</span>' : "") + (row.is_amendment ? ' <span class="muted">4/A</span>' : "");
    const tone = kind === "buy" ? " up" : kind === "sell" ? " down" : "";
    return `<tr>
<td>${badge(kind)}</td>${showPerson ? `<td>${whoCell(row)}</td>` : ""}${showCompany ? `<td>${company}</td>` : ""}
<td>${what}</td><td class="r">${linked(shares(row.shares))}</td><td class="r">${row.price_per_share == null ? "—" : linked(money(row.price_per_share, { compact: false }))}</td>
<td class="r${tone}">${row.estimated_value == null ? "—" : linked(money(row.estimated_value))}</td><td>${esc(day(row.transaction_date))}</td>
<td>${source ? `<a class="slink" href="${esc(source)}" rel="nofollow noopener" target="_blank">${esc(day(row.published_at))} <span aria-hidden="true">↗</span><span class="sr-only"> (SEC filing, opens in a new tab)</span></a>` : esc(day(row.published_at))}</td></tr>`;
  }).join("\n");
  return `<div class="card stable sp-table" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="table"><caption class="sr-only">${esc(caption)}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

const stat = (label, value, note, tone = "") => `<div class="card"><dt class="t-label muted">${esc(label)}</dt><dd class="t-title${tone === "buy" ? " up" : tone === "sell" ? " down" : ""}">${value}</dd>${note ? `<p class="t-label muted">${esc(note)}</p>` : ""}</div>`;
const hero = ({ crumbsHtml, eyebrow, title, sub, extra = "" }) => `<section class="sp-hero" aria-labelledby="pp-title"><div class="swrap"><div class="sp-hero__in">
 ${crumbsHtml}
 <p class="t-label muted sp-eyebrow">${eyebrow}</p>
 <h1 class="t-display" id="pp-title">${title}</h1>
 <p class="sp-hero__sub">${sub}</p>
 ${extra}
</div></div></section>`;
const notes = (heading, text) => `<section class="ssec" aria-labelledby="pp-about"><div class="swrap"><div class="sp-sub"><h2 class="t-section" id="pp-about">${esc(heading)}</h2><p class="muted">${esc(text)}</p></div></div></section>`;

/* ---------- data ---------- */
const PARSED_LINE_COLUMNS = `t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.security_title,t.transaction_code,
  t.acquired_disposed,t.category,t.derivative,t.shares,t.price_per_share,t.estimated_value,t.source_url,f.issuer_name,f.published_at,f.is_amendment`;

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
  const companyList = companies.length ? `<ul class="sp-grid sp-grid--4 sp-cos">${companies.filter(c => tickerOk(c.ticker)).map(c => `<li><a class="card sp-card sp-co" href="${esc(companyUrl(c.ticker))}"><span class="scell">${uiLogo(c.ticker, 32)}<span class="scell__t"><b>${esc(c.ticker)}</b><span class="t-label muted">${esc(displayName(c.issuer_name))}</span></span></span><span class="t-label muted">${c.filings} filing${c.filings === 1 ? "" : "s"}${c.buys ? ` · ${c.buys} bought` : ""}${c.sells ? ` · ${c.sells} sold` : ""}</span></a></li>`).join("")}</ul>` : `<p class="muted">No filings in the last 30 days are imported yet.</p>`;
  const body = `${hero({ crumbsHtml: crumbs([["Insidir", "/"], ["Insider filings", null]]), eyebrow: "SEC Form 4 · checked about every 2 minutes",
    title: `Insider trading, <span class="muted">from the filings.</span>`,
    sub: "What officers, directors and 10% owners of US public companies report buying and selling, read from the Form 4s they file with the SEC. Open-market purchases and sales are kept apart from awards, exercises and gifts, and every line links to the filing. These are legally required public reports, published by the SEC: not nonpublic information, and not a recommendation.",
    extra: `<dl class="sp-cov sp-stats">
  ${stat("Filings, 30 days", esc((t.filings ?? 0).toLocaleString("en-US")), "Form 4 and 4/A, as imported")}
  ${stat("Companies", esc((t.companies ?? 0).toLocaleString("en-US")), "with a filing in the window")}
  ${stat("Reported purchases", esc(money(t.buy_value)), "original filings, 30 days", "buy")}
  ${stat("Reported sales", esc(money(t.sell_value)), "original filings, 30 days", "sell")}
 </dl>` })}
${section("pp-buys", "Biggest open-market purchases", "Last 30 days, by reported value. Code P, non-derivative, original filings.", linesTable(buys, { showCompany: true, caption: "Biggest insider purchases in the last 30 days" }))}
${section("pp-sells", "Biggest open-market sales", "Last 30 days, by reported value. Code S, non-derivative, original filings.", linesTable(sells, { showCompany: true, caption: "Biggest insider sales in the last 30 days" }))}
${section("pp-latest", "Just filed", "The newest purchases and sales, by filing date.", linesTable(latest, { showCompany: true, caption: "Newest insider purchases and sales" }))}
${section("pp-active", "Most active companies", "Most Form 4 filings in the last 30 days.", companyList)}
${storiesSection(STORIES, "Research stories", "Historical filings explained line by line, free to read and share. Each one links to the original SEC document.")}
${upsell("Follow the people behind the trades.")}
${notes("About this data", "Insiders must report most trades in their company's stock on SEC Form 4, generally within two business days. Values are shares × the price the filer reported; lines without a reported price are not valued. Purchases and sales here are open-market trades (codes P and S); grants, option exercises, tax withholding and gifts are listed as other transactions. Totals count original filings only, because a Form 4/A restates lines already filed. This is a public record. Research, not investment advice.")}`;
  return {
    html: shell({ origin, canonical: "/insider-trading",
      title: "Insider trading today: latest Form 4 buys and sells — Insidir",
      description: "The latest insider purchases and sales at US public companies, read from SEC Form 4 filings: biggest open-market buys and sells of the last 30 days, the newest filings and the most active companies.",
      body, jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Insider trading from SEC Form 4 filings", url: origin + "/insider-trading" } })
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
  const companyRows = companies.length ? `<ul class="sp-grid sp-grid--2 sp-cos">${companies.map(c => {
    const label = `<span class="scell">${c.ticker ? uiLogo(c.ticker, 32) : `<span class="logo logo--32" aria-hidden="true"><span class="logo__mono">${esc(uiInitials(displayName(c.issuer_name)))}</span></span>`}<span class="scell__t"><b>${esc(c.ticker || displayName(c.issuer_name) || "Issuer " + c.issuer_cik)}</b>${c.ticker ? `<span class="t-label muted">${esc(displayName(c.issuer_name))}</span>` : ""}</span></span>`;
    const inner = `${label}<span class="t-label muted">${esc(roleText(c) || "Reporting person")} · ${c.transactions} line${c.transactions === 1 ? "" : "s"} · last ${esc(day(c.last_transaction_date))}</span>${num(c.purchases_value) || num(c.sales_value) ? `<span class="sp-co__vals">${num(c.purchases_value) ? `<span class="up">Bought ${esc(money(c.purchases_value))}</span>` : ""}${num(c.sales_value) ? `<span class="down">Sold ${esc(money(c.sales_value))}</span>` : ""}</span>` : ""}`;
    return `<li>${tickerOk(c.ticker) ? `<a class="card sp-card sp-co" href="${esc(companyUrl(c.ticker))}">${inner}</a>` : `<div class="card sp-card sp-co">${inner}</div>`}</li>`;
  }).join("")}</ul>` : "";
  const role = primary ? [roleText(primary), primary.ticker ? displayName(primary.issuer_name) || primary.ticker : displayName(primary.issuer_name)].filter(Boolean).join(", ") : "";
  const description = `${name}${role ? ` (${role})` : ""}: insider trades reported on SEC Form 4. ${all.purchases.count} purchase${all.purchases.count === 1 ? "" : "s"} (${money(all.purchases.value)}) and ${all.sales.count} sale${all.sales.count === 1 ? "" : "s"} (${money(all.sales.value)}) in Insidir's import.`;
  const first = name.split(" ")[0] || name;
  const body = `${hero({ crumbsHtml: crumbs([["Insidir", "/"], ["Insider filings", "/insider-trading"], [name, null]]),
    eyebrow: `Reporting person · SEC CIK ${esc(String(cik).replace(/^0+/, ""))}`,
    title: `${esc(name)} <span class="muted">insider trades.</span>`,
    sub: `${role ? esc(role) + ". " : ""}Insider trades reported on SEC Form 4. Every line below is a public SEC record${filed && filed !== name ? `, filed under the name ${esc(filed)}` : ""}. Last filing ${esc(day(all.last_published_at))}.`,
    extra: `<dl class="sp-cov sp-stats">
  ${stat("Purchases", `${esc(money(all.purchases.value))}`, `${all.purchases.count} line${all.purchases.count === 1 ? "" : "s"}, all imported filings`, "buy")}
  ${stat("Sales", `${esc(money(all.sales.value))}`, `${all.sales.count} line${all.sales.count === 1 ? "" : "s"}, all imported filings`, "sell")}
  ${stat("Last 30 days", `${d30.transactions} line${d30.transactions === 1 ? "" : "s"}`, `${money(d30.purchases.value)} bought · ${money(d30.sales.value)} sold`)}
  ${stat("Companies", esc(String(profile.companies.length)), "where this person reports")}
 </dl>
 <div class="sp-actions"><a class="btn btn--primary" href="/signup.html" data-cta="person">Follow ${esc(first)} in Insidir</a><a class="btn btn--secondary" href="${esc(profile.edgar_url)}" rel="nofollow noopener" target="_blank">Filings on EDGAR <span aria-hidden="true">↗</span></a></div>` })}
${companyRows ? section("pp-companies", "Companies and roles", "Roles as written in the person's latest Form 4 at each company.", companyRows) : ""}
${section("pp-lines", "Recent transactions", `The ${profile.transactions.length} newest lines by trade date${all.transactions > profile.transactions.length ? ` of ${all.transactions.toLocaleString("en-US")}` : ""}. Every number links to the filing on SEC EDGAR.`, linesTable(profile.transactions, { showCompany: true, showPerson: false, caption: `Recent insider transactions by ${name}` }))}
${storiesSection(storiesForPerson(cik), "Research on this person's filings", "A historical Form 4, explained line by line.")}
${upsell(`Know the next time ${first} files.`)}
${notes("About this record", "Built only from public SEC Form 4 filings in Insidir's import. Values are shares × the price the filer reported. A line repeated by a later Form 4/A is counted once in the totals. Insidir does not estimate holdings or predict trades. Research, not investment advice.")}`;
  return {
    canonical,
    html: shell({ origin, canonical, title: `${name} insider trades — SEC Form 4 filings — Insidir`, description, body,
      jsonLd: { "@context": "https://schema.org", "@type": "ProfilePage", url: origin + canonical,
        mainEntity: { "@type": "Person", name, ...(primary?.issuer_name ? { affiliation: { "@type": "Organization", name: displayName(primary.issuer_name) } } : {}) } } })
  };
}

function notFoundPage(origin, what) {
  const body = hero({ crumbsHtml: crumbs([["Insidir", "/"], ["Insider filings", "/insider-trading"], ["Not found", null]]), eyebrow: "404",
    title: `No Form 4s <span class="muted">imported yet.</span>`,
    sub: `Insidir has no imported Form 4 lines for ${esc(what)}. That does not mean none exist: the import covers recent filings and grows about every 2 minutes.`,
    extra: `<div class="sp-actions"><a class="btn btn--primary" href="/insider-trading">Latest insider filings</a></div>` });
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
Disallow: /ops
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email

Sitemap: ${origin}/sitemap.xml
`;
}
const PUBLIC_STATIC = ["/", "/platform.html", "/insidir-intelligence.html", "/why-insidir.html", "/data.html", "/pricing.html", "/company-info.html", "/insider-trading", "/signup.html", "/terms.html", "/privacy.html", "/disclosures.html", "/subscription-policy.html", ...PUBLIC_STORY_PATHS];
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
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com; font-src 'self'; connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
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

/* Pages are compressed (gzip, fast level) when the client accepts it, and carry an ETag, so a crawler or reader with
   a fresh copy gets an empty 304. */
function send(req, res, status, type, body, maxAge) {
  const raw = Buffer.from(body);
  const etag = maxAge && status === 200 ? '"' + createHash("sha256").update(raw).digest("hex").slice(0, 16) + '"' : null;
  const head = { ...HEADERS, "Content-Type": type, "Vary": "Accept-Encoding", ...(etag ? { ETag: etag } : {}),
    "Cache-Control": maxAge ? `public, max-age=${maxAge}, stale-while-revalidate=600` : "no-store" };
  if (etag && String(req.headers["if-none-match"] || "").split(/\s*,\s*/).some(t => t.replace(/^W\//, "") === etag)) {
    res.writeHead(304, head);
    res.end();
    return true;
  }
  const gzipped = raw.length >= 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  const bytes = gzipped ? gzipSync(raw, { level: 6 }) : raw;
  res.writeHead(status, { ...head, "Content-Length": bytes.length, ...(gzipped ? { "Content-Encoding": "gzip" } : {}) });
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
    // The stock's page is /<TICKER> now (src/ticker-page.mjs, which also answers this path in the engine).
    return redirect(res, companyUrl(ticker));
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
  else {
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
