/* Shared server-rendered pieces for the v2 public pages (the landing page, /<TICKER>), on the design system in
 * web/assets/css/ds.css. One date format ("Oct 16, 2026"), one money format ("$1.2M"), tickers in Geist Mono upper
 * case, buy green and sell red only on trade data. Every trade carries its SEC filing link. */
import { readFileSync } from "node:fs";
import { roleWord } from "./track-record.mjs";

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export function money(v) {
  const n = num(v);
  if (n == null) return null;
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return s + "$" + Math.round(a / 1e3) + "K";
  return s + "$" + Math.round(a).toLocaleString("en-US");
}
export const price = v => { const n = num(v); return n == null ? null : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const iso = v => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
export function day(v) {
  const d = iso(v);
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}
export function ago(v, now = Date.now()) {
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const m = Math.max(1, Math.round((now - t) / 60000));
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.round(h / 24);
  return d < 8 ? d + (d === 1 ? " day ago" : " days ago") : day(v);
}
export const pct = r => r == null ? null : (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r * 100).toFixed(1) + "%";

// "HUANG JEN HSUN" → "Jen Hsun Huang"; already mixed-case names are kept.
export function personName(raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "An insider";
  if (s !== s.toUpperCase()) return s;
  const parts = s.toLowerCase().split(" ").map(w => w.replace(/(^|[-'])([a-z])/g, (_, a, b) => a + b.toUpperCase())).map(w => /^[A-Z]$/.test(w) ? w + "." : w);
  // Form 4 names are filed surname first: move it to the end when there are two or more words.
  return parts.length > 1 && !/,/.test(s) ? [...parts.slice(1), parts[0]].join(" ") : parts.join(" ");
}
export function companyName(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const t = s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s;
  return t.replace(/\b(Inc|Corp|Corporation|Co|Ltd|Plc|Llc|Lp|Holdings|Group|N\.?V|S\.?A)\.?$/i, "").replace(/[,\s]+$/, "").replace(/\bIi\b/, "II") || t;
}
export const role = owner => roleWord(owner) || null;

export const kindOf = r => String(r.transaction_code || "").toUpperCase() === "P" ? "buy" : String(r.transaction_code || "").toUpperCase() === "S" ? "sell" : "other";

/* One trade in plain English: "Robert Pohlad, a director, bought $23.7M of PepsiCo stock on Oct 14, 2026." */
export function sentence(r, { company = true } = {}) {
  const who = personName(r.owner_name), what = kindOf(r), roleW = r.role || null;
  const value = money(r.estimated_value), sh = num(r.shares);
  const amount = value ? value + " of " : sh ? Math.round(sh).toLocaleString("en-US") + " shares of " : "shares of ";
  const co = company ? (r.ticker ? String(r.ticker).toUpperCase() : companyName(r.issuer_name) || "the company's") + " stock" : "the stock";
  const verb = what === "buy" ? "bought" : what === "sell" ? "sold" : "reported";
  const plan = what === "sell" && r.rule_10b5_1 === true ? ", under a plan set up in advance" : "";
  const when = day(r.transaction_date);
  const article = roleW ? (/^(CEO|CFO|COO|president|general counsel)$/.test(roleW) ? "the " : "a ") : "";
  return `${who}${roleW ? ", " + article + roleW + "," : ""} ${verb} ${amount}${co}${when ? " on " + when : ""}${plan}.`;
}

const secUrl = u => /^https:\/\/(www\.)?sec\.gov\//.test(String(u || "")) ? String(u) : null;

/* The trade card (ds.css .ds-trade): ticker, who, amount, date and the filing. */
export function tradeCard(r, { href = null } = {}) {
  const k = kindOf(r), t = String(r.ticker || "").toUpperCase(), filing = secUrl(r.source_url);
  const label = k === "buy" ? "Buy" : k === "sell" ? "Sell" : "Filed";
  return `<article class="ds-card ds-trade">
<a class="ds-trade__tick" href="${esc(href || "/" + encodeURIComponent(t))}">${esc(t)}</a><span class="ds-badge ds-badge--${k === "other" ? "" : k}">${label}</span>
<p class="ds-trade__who">${esc(personName(r.owner_name))}${r.role ? `<span class="ds-trade__role">${esc(r.role.charAt(0).toUpperCase() + r.role.slice(1))}</span>` : ""}</p>
<span class="ds-trade__amt ds-num ${k === "buy" ? "ds-buy" : k === "sell" ? "ds-sell" : ""}">${esc(money(r.estimated_value) || "—")}</span>
<span class="ds-trade__meta"><span class="ds-num">${esc(day(r.transaction_date) || "")}</span>${filing ? `<a href="${esc(filing)}" rel="nofollow noopener" target="_blank">Form 4 ↗</a>` : ""}</span>
</article>`;
}

/* Lines with the reporting owner's role, as filed (sec_filing_owners). */
export const LINE_SQL = `SELECT t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.transaction_code,t.category,t.derivative,
    t.shares,t.shares_after,t.price_per_share,t.estimated_value,t.source_url,f.issuer_name,f.published_at,f.rule_10b5_1,f.is_amendment,
    o.is_director,o.is_officer,o.officer_title,o.is_ten_percent_owner
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  LEFT JOIN sec_filing_owners o ON o.accession=t.accession AND t.owner_cik IS NOT NULL AND LTRIM(o.owner_cik,'0')=LTRIM(t.owner_cik,'0')`;
export const withRole = rows => rows.map(r => ({ ...r, role: role(r) }));

/* ---------- page chrome ---------- */
/* The two stylesheets are inlined (about 6 KB gzipped together): a phone on a slow connection paints the headline
   without waiting for two more round trips. Read once at start-up; font URLs become absolute. */
const css = name => readFileSync(new URL("../web/assets/css/" + name, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, " ").replace(/url\(\.\.\/fonts\//g, "url(/assets/fonts/");
const INLINE_CSS = css("ds.css") + css("site-v2.css") + css("receipt.css");

export function head({ title, description, canonical, origin, image = null, noindex = false, extra = "" }) {
  const url = origin + canonical;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0c0c0b">
<meta property="og:site_name" content="Insidir"><meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(origin + (image || "/assets/og/insidir-og.png"))}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(origin + (image || "/assets/og/insidir-og.png"))}">
<link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml"><link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png?v=3"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/GeistMono-Variable.woff2" as="font" type="font/woff2" crossorigin>
<style>${INLINE_CSS}</style>
${extra}</head>`;
}
// On the landing page the section links are same-page anchors (#how); elsewhere they lead to it (/#how).
export const nav = ({ cta = "nav", home = false } = {}) => { const h = home ? "" : "/"; return `<header class="ds-nav" data-ds-nav><div class="ds-nav__in">
<a class="ds-mark" href="/" aria-label="Insidir home">insidir.</a>
<nav class="ds-nav__links" aria-label="Main"><a href="${h}#how">Platform</a><a href="${h}#pricing">Pricing</a><a href="${h}#faq">FAQ</a></nav>
<div class="ds-nav__end"><a class="ds-login" href="/signin.html">Log in</a><a class="ds-btn" href="/start" data-cta="${esc(cta)}">Start for $1</a></div>
</div></header>`; };
export const footer = ({ home = false } = {}) => { const h = home ? "" : "/"; return `<footer class="v2-foot"><div class="ds-wrap v2-foot__in">
<div class="v2-foot__brand"><a class="ds-mark" href="/">insidir.</a><p class="ds-small">© 2026 Aethric LLC. Research, not advice. Not affiliated with the SEC.</p></div>
<nav aria-label="Product"><h2>Product</h2><a href="/insider-trading">Insider trades today</a><a href="${h}#how">How it works</a><a href="${h}#pricing">Pricing</a><a href="/stories.html">Research stories</a><a href="/data.html">Data sources</a></nav>
<nav aria-label="Company"><h2>Company</h2><a href="/company-info.html">About</a><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/subscription-policy.html">Subscription policy</a></nav>
<nav aria-label="Account"><h2>Account</h2><a href="/signin.html">Log in</a><a href="mailto:hello@aethric.llc">hello@aethric.llc</a></nav>
</div></footer>`; };
export const scripts = () => `<script src="/assets/js/ds.js?v=2" defer></script>
<script src="/assets/js/site-v2.js?v=1" defer></script>
<script src="/assets/js/funnel.js" defer></script>
<script src="/assets/js/posthog.js?v=1" defer></script>`;

/* The free weekly email (src/newsletter.mjs). */
export const emailForm = (where = "page") => `<form class="v2-mail" action="/v1/newsletter" method="post" data-v2-mail data-where="${esc(where)}">
<p class="v2-mail__h">Get the 5 biggest insider buys every week. Free.</p>
<div class="v2-mail__row"><label class="sr-only" for="mail-${esc(where)}">Email</label><input id="mail-${esc(where)}" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="you@example.com"><button class="ds-btn" type="submit">Send it to me</button></div>
<p class="ds-small" data-v2-mail-msg role="status" aria-live="polite">One email a week. Unsubscribe in one click.</p>
</form>`;

export const searchBox = (id = "q", { large = true } = {}) => `<form class="ds-search${large ? " v2-search--hero" : ""}" action="/search" method="get" role="search" data-ds-search>
<label class="sr-only" for="${esc(id)}">Stock ticker</label>
<input id="${esc(id)}" name="t" type="search" inputmode="search" enterkeyhint="go" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Type a stock: NVDA, TSLA, PEP" data-short="NVDA, TSLA, PEP" maxlength="12">
<button class="ds-btn" type="submit">See insiders</button></form>`;
