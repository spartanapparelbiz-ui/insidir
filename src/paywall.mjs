/* Insidir hard paywall.
 *
 * The product (dashboard, research desk, companies, company reports, filings, people,
 * person files, watchlist, portfolio, alerts and every API that feeds them) is only usable with an
 * active paid subscription, which starts with a paid trial ($1 for 3 days, then $39 a month; see
 * billing.mjs). There is no free tier. A trialing subscription grants access like an active one.
 *
 * Everything here is a pure function of its inputs (the request path, the user row and
 * the environment) so it can be tested without PostgreSQL or Stripe. src/api.mjs runs
 * gate() on every request before it serves a page or an API response.
 */
import { posix } from "node:path";
import { paywallEnabled, complimentaryEmails, billingSettings, verificationRequired } from "./config.mjs";

// Paid product pages: signed in AND an active subscription.
// person: one reporting person's file (person.html?cik=1214156, fed by GET /v1/people/<cik>).
// entity: any SEC filer by CIK (entity.html?cik=1067983, fed by GET /v1/entities/<cik>).
export const PRODUCT_PAGES = Object.freeze(["dashboard", "research", "explore", "company", "filings", "filing", "people", "person", "watchlist", "portfolio", "alerts", "intelligence", "entity"]);
// Account pages: signed in; no subscription needed (that is where you get one).
export const ACCOUNT_PAGES = Object.freeze(["subscribe", "billing", "account"]);
// Public pages are never gated. account-deleted.html is public because the visitor has just been signed out.
export const PUBLIC_PAGES = Object.freeze(["index", "platform", "insidir-intelligence", "why-insidir", "data", "pricing", "company-info", "terms", "privacy", "disclosures", "subscription-policy", "signin", "signup", "404", "account-deleted", "forgot-password", "reset-password", "verify-email"]);
// Pages a sign-in or subscribe step may send someone back to afterwards.
export const NEXT_PAGES = Object.freeze([...PRODUCT_PAGES, ...ACCOUNT_PAGES]);

// Stripe subscription statuses that grant access. past_due, unpaid, canceled, paused,
// incomplete and incomplete_expired do not.
export const ACCESS_STATUSES = Object.freeze(["active", "trialing"]);

export const SIGNIN_PAGE = "/signin.html";
export const SUBSCRIBE_PAGE = "/subscribe.html";
export const SIGNIN_REQUIRED = Object.freeze({ error: "Sign in required", signin: SIGNIN_PAGE });
export const SUBSCRIPTION_REQUIRED = Object.freeze({ error: "An active Insidir subscription is required", subscribe: SUBSCRIBE_PAGE });

const PRODUCT = new Set(PRODUCT_PAGES), ACCOUNT = new Set(ACCOUNT_PAGES), NEXT = new Set(NEXT_PAGES);

/* The page a request path would be served as, mirroring src/web.mjs: percent-decoding,
 * dot-segment normalisation, optional .html and trailing slashes. Matching is
 * case-insensitive, which only ever gates more (a case-insensitive file system would
 * serve /Dashboard.html as the dashboard). Returns null for anything that is not a
 * top-level page (assets, nested paths, undecodable paths). */
export function pageName(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(String(pathname ?? "/")); } catch { return null; }
  if (decoded.includes("\0")) return null;
  const rel = posix.normalize("/" + decoded.replace(/\\/g, "/")).replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  if (!rel) return "index";
  if (rel.includes("/")) return null;
  return rel.endsWith(".html") ? rel.slice(0, -5) : rel;
}

// 'public' | 'account' | 'product' for a website (non-API) path.
export function classifyPage(pathname) {
  const name = pageName(pathname);
  if (name && PRODUCT.has(name)) return "product";
  if (name && ACCOUNT.has(name)) return "account";
  return "public";
}

export function isApiPath(pathname) {
  const p = String(pathname ?? "");
  return p === "/healthz" || p === "/v1" || p.startsWith("/v1/");
}

/* Removing your own data never needs a subscription: a member whose subscription has
 * lapsed can still revoke a brokerage read grant and delete saved items one by one. */
const MEDIA_FILE = /^\/v1\/media\/[a-f0-9]{64}\.(png|webp|jpeg|svg)$/;
const OWN_DATA_DELETES = [/^\/v1\/me\/brokerage$/, /^\/v1\/me\/research-decisions$/,
  /^\/v1\/me\/(watchlist|people|manual-holdings)\/[^/]+$/];
/* Managing the account itself never needs a subscription either: password, sessions, the security log, a copy of
 * your data, and email preferences (a lapsed member must be able to turn emails off). */
export const ACCOUNT_ROUTES = Object.freeze([/^\/v1\/me\/password$/, /^\/v1\/me\/sessions\/revoke-others$/, /^\/v1\/me\/security-events$/,
  /^\/v1\/me\/export$/, /^\/v1\/me\/email-preferences$/]);

/* 'open' | 'account' | 'product' for an API path.
 *   open     no sign-in needed here (the handler checks what it needs)
 *   account  signed in, no subscription needed (deleting your own data)
 *   product  signed in with access
 * Fails closed: every /v1 route that is not explicitly listed is product data. */
export function classifyApi(pathname, method = "GET") {
  const p = String(pathname ?? ""), m = String(method || "GET").toUpperCase();
  if (!isApiPath(p)) return "open"; // website paths are classified by classifyPage
  if (p === "/healthz" || p === "/v1" || p === "/v1/" || p === "/v1/sources" || p === "/v1/capabilities") return "open";
  // Aggregate coverage counts of public SEC data (src/coverage-ingest.mjs): no member data, shown on data.html.
  if (p === "/v1/coverage" && (m === "GET" || m === "HEAD")) return "open";
  if (p === "/v1/me") return m === "GET" || m === "HEAD" || m === "DELETE" ? "open" : "product";
  if (p.startsWith("/v1/auth/") || p.startsWith("/v1/billing/") || p.startsWith("/v1/creators/admin/")) return "open";
  // Administrator routes (own token + one-time code, src/admin-auth.mjs) and email links/webhooks (signed tokens,
  // provider basic auth; src/notifications.mjs, src/email.mjs) authenticate themselves.
  if (p.startsWith("/v1/admin/") || p.startsWith("/v1/email/")) return "open";
  // Server-to-server ingestion has its own bearer secret; it is not product data.
  if (p === "/v1/internal/ingest" || p === "/v1/internal/13f/ingest") return "open";
  // The internal cost dashboard checks its own administrator token or allow-listed account (src/cost-analytics.mjs).
  if (p === "/v1/admin/costs" || p === "/v1/admin/funnel") return "open";
  // First-party funnel events (src/funnel.mjs): sent by public pages, signed in or not.
  if (p === "/v1/events" && m === "POST") return "open";
  // A prepared logo or headshot by content address: an unguessable public image (the batch that
  // names it, /v1/media, stays product). Open, so no session lookup per <img> and it can be
  // cached publicly (for a day, so a takedown reaches caches).
  if (MEDIA_FILE.test(p) && (m === "GET" || m === "HEAD")) return "open";
  if (m === "DELETE" && OWN_DATA_DELETES.some(rule => rule.test(p))) return "account";
  if (ACCOUNT_ROUTES.some(rule => rule.test(p))) return "account";
  return "product";
}

const statusOf = row => String(row?.subscription_status ?? row?.subscriptionStatus ?? "").trim().toLowerCase();

// Stripe moves current_period_end forward at every renewal (webhook, then the six-hourly reconciliation in
// billing.mjs). A status still marked active more than PERIOD_GRACE_MS after the period it paid for has gone stale,
// for example if webhooks stopped arriving after a cancellation, so it no longer grants access.
export const PERIOD_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export function periodLapsed(row, now = Date.now()) {
  const end = row?.current_period_end ?? row?.currentPeriodEnd;
  if (end == null || end === "") return false;
  const t = (end instanceof Date ? end : new Date(end)).getTime();
  return Number.isFinite(t) && t > 0 && t + PERIOD_GRACE_MS < now;
}

// A Stripe subscription in good standing, within the period it has paid for.
export function subscriptionActive(row, now = Date.now()) {
  return ACCESS_STATUSES.includes(statusOf(row)) && !periodLapsed(row, now);
}

export function isComplimentary(email, env = process.env) {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  return !!e && complimentaryEmails(env).has(e);
}

/* A complimentary address grants access only once its owner has confirmed it, whenever verification is enforced
 * (verificationRequired in config.mjs): otherwise whoever registered the address first would get the owner's access. */
export function complimentaryAccess(row, env = process.env) {
  if (!row || !isComplimentary(row.email, env)) return false;
  return !verificationRequired(env) || !!(row.email_verified_at ?? row.emailVerifiedAt);
}

// Access = subscription active or trialing, OR a complimentary account (verified when verification is enforced).
export function hasAccess(row, env = process.env) {
  if (!row) return false;
  return subscriptionActive(row) || complimentaryAccess(row, env);
}

function isoOrNull(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) && t > 0 ? d.toISOString() : null;
}

/* The `access` object of GET /v1/me. `active` says whether this account can use the
 * product right now (always true when the paywall is switched off for development);
 * `plan` is 'pro' only for a Stripe subscription in good standing. */
export function accessSummary(row, env = process.env) {
  return {
    active: !paywallEnabled(env) || hasAccess(row, env),
    plan: subscriptionActive(row) ? "pro" : "none",
    status: statusOf(row) || null,
    billingEnabled: billingSettings(env).enabled,
    complimentary: complimentaryAccess(row, env),
    emailVerified: !!(row?.email_verified_at ?? row?.emailVerifiedAt),
    verificationRequired: verificationRequired(env),
    currentPeriodEnd: isoOrNull(row?.current_period_end ?? row?.currentPeriodEnd)
  };
}

/* A safe post-sign-in/post-subscribe destination, or null. Only same-origin relative
 * paths to known product or account pages ("/dashboard", "/company.html?ticker=AAPL").
 * Rejects absolute and protocol-relative URLs, backslashes, whitespace and control
 * characters, fragments, dot segments, encoded paths and unknown pages. */
export function safeNext(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  if (/[\u0000- \u007f\\#]/.test(value)) return null;
  const q = value.indexOf("?");
  const path = q < 0 ? value : value.slice(0, q), query = q < 0 ? "" : value.slice(q + 1);
  const match = /^\/([a-z0-9-]+)(\.html)?$/.exec(path);
  if (!match || !NEXT.has(match[1])) return null;
  if (query && (!/^[A-Za-z0-9\-._~%=&+,:@!*'()/;]*$/.test(query) || /%(?![0-9A-Fa-f]{2})/.test(query))) return null;
  return query ? path + "?" + query : path;
}

// The next= value for a gated page request: the request's own path and query when that
// is safe, else the canonical /<page>.html (with the query when that is safe).
export function nextFor(url, name = pageName(url.pathname)) {
  const own = safeNext(url.pathname + url.search);
  if (own) return own;
  const canonical = "/" + name + ".html";
  return safeNext(canonical + url.search) || canonical;
}

const redirect = (to, next) => ({ action: "redirect", status: 302, location: to + "?next=" + encodeURIComponent(next) });
const allow = (kind, user = null) => ({ action: "allow", kind, user });

/* The paywall decision for one request.
 *   { action: "allow", kind, user }   kind: off | public | open | account | product
 *   { action: "redirect", status: 302, location }            (pages)
 *   { action: "deny", status: 401 | 402, body }               (API)
 * loadUser(req) resolves the signed-in user row ({id, email, subscription_status,
 * current_period_end}) or null; it is only called for gated requests. */
export async function gate({ req, url, loadUser, env = process.env }) {
  const method = String(req?.method || "GET").toUpperCase();
  const p = url.pathname;
  if (!paywallEnabled(env)) return allow("off");

  if (isApiPath(p)) {
    const kind = classifyApi(p, method);
    if (kind === "open") return allow("open");
    const user = await loadUser(req);
    // The brokerage OAuth callback is a browser navigation, so it redirects like a page.
    if (p === "/v1/me/brokerage/callback" && (method === "GET" || method === "HEAD")) {
      if (!user) return redirect(SIGNIN_PAGE, "/portfolio.html");
      if (!hasAccess(user, env)) return redirect(SUBSCRIBE_PAGE, "/portfolio.html");
      return allow("product", user);
    }
    if (!user) return { action: "deny", status: 401, body: { ...SIGNIN_REQUIRED } };
    if (kind === "account") return allow("account", user);
    if (!hasAccess(user, env)) return { action: "deny", status: 402, body: { ...SUBSCRIPTION_REQUIRED } };
    return allow("product", user);
  }

  // Only GET and HEAD can serve a page; other methods fall through to a 404.
  if (method !== "GET" && method !== "HEAD") return allow("public");
  const kind = classifyPage(p);
  if (kind === "public") return allow("public");
  const user = await loadUser(req);
  const name = pageName(p);
  if (!user) return redirect(SIGNIN_PAGE, nextFor(url, name));
  if (kind === "product" && !hasAccess(user, env)) return redirect(SUBSCRIBE_PAGE, nextFor(url, name));
  return allow(kind, user);
}

/* Responses for signed-in visitors (product data, product and account pages) must never
 * be stored by a shared cache or CDN, or one member's 200 could be replayed to someone
 * who is signed out or has no subscription without the request reaching the gate. */
export function privateCacheControl(value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "").trim();
  if (!text || /\bno-store\b/i.test(text)) return text || "no-store";
  const kept = text.split(",").map(t => t.trim()).filter(t => t && !/^(public|private|s-maxage=.*|proxy-revalidate)$/i.test(t));
  return ["private", ...kept].join(", ");
}

// A Vary header value with `field` added once (case-insensitive), keeping what is there.
export function mergeVary(...values) {
  const seen = new Map();
  for (const value of values.flat()) for (const part of String(value ?? "").split(",")) {
    const name = part.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()].join(", ");
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* The page served (503) when the paywall cannot check a visitor's session for a product or
 * account page, for example while the database is unreachable. The page stays closed;
 * the visitor gets a readable page with a way to retry instead of a JSON error. */
export function unavailablePage(url) {
  const name = pageName(url?.pathname);
  const retry = escapeHtml(name && NEXT.has(name) ? nextFor(url, name) : "/");
  const nav = '<a href="/platform.html">Platform</a><a href="/why-insidir.html">Why Insidir</a><a href="/data.html">Data</a><a href="/pricing.html">Pricing</a><a href="/company-info.html">About</a>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0c0c0b">
<meta name="robots" content="noindex">
<title>Temporarily unavailable — insidir.</title>
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/v13-halftone.css?v=1">
<link rel="stylesheet" href="/assets/css/v13-static.css?v=2">
<link rel="stylesheet" href="/assets/css/v13-notfound.css?v=2">
<script defer src="/assets/js/v6-site.js?v=2"></script>
<script defer src="/assets/js/v13-halftone.js?v=1"></script>
</head>
<body class="v3-static v6-static v2-notfound v13">
<a class="skip-link" href="#Content">Skip to content</a>
<header class="v6-nav v9-nav">
 <div class="mk-shell v6-nav__inner">
  <a class="v6-logo" href="/" aria-label="Insidir home">insidir<span class="v13-dot" aria-hidden="true">.</span></a>
  <nav class="v6-nav__links" aria-label="Main navigation">${nav}</nav>
  <div class="v6-nav__actions">
   <a class="v6-signin" href="/signin.html">Log in</a>
   <a class="v9-btn v9-btn--ink v9-btn--small" href="/signup.html">Start for $1 <span class="v13-arrow" aria-hidden="true">↗</span></a>
   <button id="v6-menu-button" class="v6-menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="v6-menu"><span></span><span></span></button>
  </div>
 </div>
 <nav id="v6-menu" class="v6-mobile" aria-label="Mobile navigation" hidden>${nav}<a href="/signin.html">Log in</a><a href="/signup.html">Start for $1 <span class="v13-arrow" aria-hidden="true">↗</span></a></nav>
</header>
<main id="Content">
<section class="nf mk-shell" aria-labelledby="nf-title">
 <div class="nf-copy">
  <p class="mk-eyebrow"><span class="mk-live" aria-hidden="true"></span>Insidir / 503</p>
  <h1 id="nf-title">Back in <span>a moment.</span></h1>
  <p class="mk-lede">Insidir could not check your account just now, so this page was not opened. Nothing about your account or subscription has changed. Try again in a minute.</p>
  <div class="mk-actions">
   <a class="v9-btn v9-btn--ink" href="${retry}">Try again <span class="v13-arrow" aria-hidden="true">↗</span></a>
   <a class="v9-btn v12-outline-button" href="/">Return home <span class="v13-arrow" aria-hidden="true">↗</span></a>
  </div>
 </div>
 <div class="nf-print" aria-hidden="true">
  <p class="nf-print__label"><span>Error 503</span><span>Unavailable</span></p>
  <div class="nf-print__field" data-halftone-field data-mode="word" data-wordmark="503" data-crop="0" data-dot-gap="7" data-radius="90" data-letter-spacing="-0.02em"></div>
 </div>
</section>
</main>
<footer class="v13-footer v13-footer--plain" aria-label="Site footer">
<div class="hwf-top">
<div class="hwf-brand"><strong>Insidir</strong><span>©2026 · Aethric LLC · Research, not advice</span></div>
<nav class="hwf-col" aria-label="Platform"><h3>Platform</h3><ul><li><a href="/explore.html">Companies</a></li><li><a href="/people.html">People</a></li><li><a href="/filings.html">SEC filings</a></li><li><a href="/research.html">Research desk</a></li><li><a href="/watchlist.html">Watchlist</a></li><li><a href="/alerts.html">Alerts</a></li></ul></nav>
<nav class="hwf-col" aria-label="Account"><h3>Account</h3><ul><li><a href="/signin.html">Log in</a></li><li><a href="/signup.html">Start for $1</a></li><li><a href="/dashboard.html">Dashboard</a></li><li><a href="/portfolio.html">Portfolio</a></li><li><a href="/pricing.html">Pricing</a></li><li><a href="/billing.html">Billing</a></li></ul></nav>
<nav class="hwf-col" aria-label="Company"><h3>Company</h3><ul><li><a href="/company-info.html">About</a></li><li><a href="/terms.html">Terms</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="mailto:hello@aethric.llc">hello@aethric.llc</a></li></ul></nav>
</div>
<div class="hwf-rule"><span class="hwf-note">Public records · Data may be delayed · Not investment advice</span><button type="button" class="hwf-up">Back to top ↑</button></div>
</footer>
</body>
</html>
`;
}

/* Operator warnings for startup logs. */
export function paywallNotices(env = process.env) {
  const notices = [];
  if (!paywallEnabled(env)) {
    notices.push("INSIDIR_PAYWALL=0: the paywall is OFF and the whole product is open to everyone. Use this for local development only.");
    return notices;
  }
  if (!billingSettings(env).enabled) {
    notices.push(complimentaryEmails(env).size
      ? "Billing is not configured: only INSIDIR_COMPLIMENTARY_EMAILS accounts can use the product; nobody can subscribe."
      : "Billing is not configured and INSIDIR_COMPLIMENTARY_EMAILS is empty: nobody can use the product until Stripe is configured.");
  }
  return notices;
}
