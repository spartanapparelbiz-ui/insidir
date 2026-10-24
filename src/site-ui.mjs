/* The public site's chrome on the one design system (web/assets/css/ui.css + web/assets/css/site.css): the head with
 * both stylesheets inlined, the nav, the footer, the search box, and the server-side versions of
 * the app's components (logo, big number, trade label), so the landing page shows the product with the product's own
 * parts. Geist only, tabular figures, two text colours, colour only on numbers and chart lines. */
import { readFileSync } from "node:fs";
import { esc, money } from "./site-v2.mjs";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const css = name => read("../web/assets/css/" + name)
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, " ").replace(/url\(\.\.\/fonts\//g, "url(/assets/fonts/");
const INLINE_CSS = css("ui.css") + css("site.css");
export const WORDMARK = read("../web/assets/brand/insidir-wordmark.svg").trim()
  .replace(/<\?xml[^>]*>\s*/, "").replace(/\s(role|aria-label)="[^"]*"/g, "").replace(/<title>[^<]*<\/title>/, "").replace("<svg ", '<svg aria-hidden="true" ');

export function uiHead({ title, description, canonical, origin, image = null, noindex = false, extra = "" }) {
  const url = origin + canonical, og = esc(origin + (image || "/assets/og/insidir-og.png"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0c0c0b"><meta name="color-scheme" content="dark">
<meta property="og:site_name" content="Insidir"><meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${og}">
<link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml"><link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png?v=3"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<style>${INLINE_CSS}</style>
${extra}</head>`;
}

export const uiNav = ({ cta = "nav", home = false } = {}) => { const h = home ? "" : "/"; return `<header class="snav" data-ds-nav><div class="snav__in">
<a class="wordmark" href="/" aria-label="Insidir home">${WORDMARK}</a>
<nav class="snav__links" aria-label="Main"><a href="${h}#how" data-spy="how">How it works</a><a href="${h}#pricing" data-spy="pricing">Pricing</a><a href="${h}#faq" data-spy="faq">FAQ</a></nav>
<div class="snav__end"><a class="btn btn--ghost" href="/signin.html">Log in</a><a class="btn btn--secondary" href="/signup.html" data-cta="${esc(cta)}">Start for $1</a></div>
</div></header>`; };

export const uiFooter = ({ home = false } = {}) => { const h = home ? "" : "/"; return `<footer class="sfoot"><div class="swrap sfoot__in">
<div class="sfoot__brand"><a class="wordmark" href="/" aria-label="Insidir home">${WORDMARK}</a><p class="t-label muted">© 2026 Aethric LLC. Research, not investment advice. Not affiliated with the SEC.</p></div>
<nav aria-label="Product"><h2 class="t-label muted">Product</h2><a href="/insider-trading">Insider trades today</a><a href="${h}#how">How it works</a><a href="${h}#pricing">Pricing</a><a href="/stories.html">Research stories</a><a href="/data.html">Data sources</a></nav>
<nav aria-label="Company"><h2 class="t-label muted">Company</h2><a href="/company-info.html">About</a><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/subscription-policy.html">Subscription policy</a></nav>
<nav aria-label="Account"><h2 class="t-label muted">Account</h2><a href="/signin.html">Log in</a><a href="mailto:hello@aethric.llc">hello@aethric.llc</a></nav>
</div></footer>`; };

/* The ticker search: ds.js opens the stock's page and prefetches it while it is typed. */
export const EXAMPLES = Object.freeze(["NVDA", "TSLA", "AAPL"]);
export const uiSearch = (id = "q", { examples = [] } = {}) => `<form class="ssearch" action="/search" method="get" role="search" data-ds-search>
<label class="sr-only" for="${esc(id)}">Stock ticker</label>
<input id="${esc(id)}" name="t" type="search" inputmode="search" enterkeyhint="go" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Type a stock: NVDA, TSLA, PEP" data-short="NVDA, TSLA, PEP" maxlength="12">
<button class="btn btn--primary btn--lg" type="submit">See insiders</button></form>${examples.length ? `
<p class="schips"><span class="muted">Or try</span>${examples.map(t => `<a class="chip" href="/${esc(encodeURIComponent(t))}" data-chip="${esc(t)}">${esc(t)}</a>`).join("")}</p>` : ""}`;

/* ---------- the app's components, server-side (same markup as web/assets/js/ui.js) ---------- */
export const uiLogo = (ticker, size = 28) => {
  const T = String(ticker || "").toUpperCase(), mono = T.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "·";
  return `<span class="logo logo--${size}" data-logo="${esc(T)}" aria-hidden="true"><span class="logo__mono">${esc(mono)}</span></span>`;
};
export const uiInitials = name => { const w = String(name || "").replace(/[^A-Za-z .-]/g, "").split(/\s+/).filter(Boolean); return ((w[0]?.[0] || "") + (w.length > 1 ? w.at(-1)[0] : "")).toUpperCase() || "·"; };
/* $2.1M → "$" muted at 60%, "2.1" full size, "M" muted at 60% */
export function uiBig(v) {
  const t = money(v); if (!t) return "—";
  const m = /^(−?\$)([\d,.]+)([KMB]?)$/.exec(t);
  return m ? `<span class="u">${esc(m[1])}</span>${esc(m[2])}${m[3] ? `<span class="u">${esc(m[3])}</span>` : ""}` : esc(t);
}
export const uiTrade = (kind, planned = false) => planned ? `<span class="trade trade--plan">Plan sale</span>`
  : kind === "buy" ? `<span class="trade trade--buy">Bought</span>` : kind === "sell" ? `<span class="trade trade--sell">Sold</span>` : `<span class="trade trade--plan">Filed</span>`;
