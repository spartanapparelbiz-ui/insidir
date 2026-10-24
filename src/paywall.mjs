/* Insidir hard paywall.
 *
 * The product (dashboard, research desk, companies, company reports, filings, people,
 * person files, watchlist, portfolio, alerts and every API that feeds them) is only usable with an
 * active paid subscription, which starts with a paid trial ($1 for 7 days, then $39 a month; see
 * billing.mjs). There is no free tier. A trialing subscription grants access like an active one.
 *
 * Everything here is a pure function of its inputs (the request path, the user row and
 * the environment) so it can be tested without PostgreSQL or Stripe. src/api.mjs runs
 * gate() on every request before it serves a page or an API response.
 */
import { posix } from "node:path";
import { paywallEnabled, complimentaryEmails, billingSettings } from "./config.mjs";

// Paid product pages: signed in AND an active subscription.
// person: one reporting person's file (person.html?cik=1214156, fed by GET /v1/people/<cik>).
// entity: any SEC filer by CIK (entity.html?cik=1067983, fed by GET /v1/entities/<cik>).
export const PRODUCT_PAGES = Object.freeze(["dashboard", "research", "explore", "company", "filings", "filing", "people", "person", "watchlist", "portfolio", "alerts", "intelligence", "entity"]);
// Account pages: signed in; no subscription needed (that is where you get one).
export const ACCOUNT_PAGES = Object.freeze(["subscribe", "billing", "account", "welcome"]);
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
  // The landing page's live filing strip (src/landing.mjs): public.
  if (p === "/v1/live" && (m === "GET" || m === "HEAD")) return "open";
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

/* A complimentary address on INSIDIR_COMPLIMENTARY_EMAILS has access. Insidir sends no email, so there is no way to
 * confirm an address and none is asked for; keep that list to addresses whose owners hold the account. */
export function complimentaryAccess(row, env = process.env) {
  return !!row && isComplimentary(row.email, env);
}

// Access = subscription active or trialing, OR a complimentary account.
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0c0c0b"><meta name="color-scheme" content="dark">
<meta name="robots" content="noindex">
<title>Temporarily unavailable — Insidir</title>
<link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/ui.css?v=3">
<link rel="stylesheet" href="/assets/css/auth-ui.css?v=1">
<link rel="stylesheet" href="/assets/css/notice-app.css?v=1">
</head>
<body class="ui">
<a class="skip" href="#main">Skip to content</a>
<div class="au">
<header class="au-top"><a class="wordmark" href="/" aria-label="Insidir home"><svg viewBox="70 -793 4531 803" aria-hidden="true"><path fill="currentColor" d="M70 0V-136H260V-415H95V-550H400V-136H560V0ZM320 -637Q279 -637 254.5 -658.047619047619Q230.0 -679.0952380952381 230 -715Q230 -751 254.5 -772.0Q279 -793 320 -793Q361 -793 385.5 -772.0Q410 -751 410 -715Q410.0 -679.0952380952381 385.5 -658.047619047619Q361 -637 320 -637Z M666 0V-550H811V-445H855L811 -410Q811 -480 851.0 -520.0Q891 -560 959 -560Q1039 -560 1087.5 -504.0Q1136 -448 1136 -355V0H986V-340Q986 -383 963.5 -406.5Q941 -430 900 -430Q860 -430 838.0 -406.5Q816 -383 816 -340V0Z M1477 10Q1409 10 1358.0 -11.5Q1307 -33 1278.5 -71.0Q1250 -109 1250 -160H1400Q1400 -136 1421.5 -121.5Q1443 -107 1477 -107H1521Q1562 -107 1583.5 -122.0Q1605 -137 1605 -164Q1605 -189 1586.0 -202.5Q1567 -216 1527 -221L1463 -229Q1360 -242 1313.0 -279.0Q1266 -316 1266 -392Q1266 -472 1321.0 -516.0Q1376 -560 1482 -560H1520Q1621 -560 1681.0 -516.0Q1741 -472 1741 -398H1591Q1591 -418 1571.5 -430.5Q1552 -443 1520 -443H1482Q1445 -443 1428.0 -430.5Q1411 -418 1411 -393Q1411 -370 1426.5 -358.0Q1442 -346 1476 -341L1545 -332Q1649 -319 1699.5 -280.0Q1750 -241 1750 -164Q1750 -80 1692.0 -35.0Q1634 10 1521 10Z M1870 0V-136H2060V-415H1895V-550H2200V-136H2360V0ZM2120 -637Q2079 -637 2054.5 -658.047619047619Q2030.0 -679.0952380952381 2030 -715Q2030 -751 2054.5 -772.0Q2079 -793 2120 -793Q2161 -793 2185.5 -772.0Q2210 -751 2210 -715Q2210.0 -679.0952380952381 2185.5 -658.047619047619Q2161 -637 2120 -637Z M2643 10Q2560 10 2510.0 -48.0Q2460 -106 2460 -205V-345Q2460 -443 2510.0 -501.5Q2560 -560 2643 -560Q2711 -560 2750.0 -520.5Q2789 -481 2789 -410L2754 -445H2789L2784 -580V-730H2934V0H2789V-105H2754L2789 -140Q2789 -69 2750.0 -29.5Q2711 10 2643 10ZM2697 -120Q2738 -120 2761.0 -143.5Q2784 -167 2784 -210V-340Q2784 -383 2761.0 -406.5Q2738 -430 2697 -430Q2655 -430 2632.5 -406.5Q2610 -383 2610 -340V-210Q2610 -167 2632.5 -143.5Q2655 -120 2697 -120Z M3070 0V-136H3260V-415H3095V-550H3400V-136H3560V0ZM3320 -637Q3279 -637 3254.5 -658.047619047619Q3230.0 -679.0952380952381 3230 -715Q3230 -751 3254.5 -772.0Q3279 -793 3320 -793Q3361 -793 3385.5 -772.0Q3410 -751 3410 -715Q3410.0 -679.0952380952381 3385.5 -658.047619047619Q3361 -637 3320 -637Z M3682 0V-550H3822V-445H3860L3817 -381Q3817 -470 3858.0 -515.0Q3899 -560 3978 -560Q4069 -560 4119.5 -505.0Q4170 -450 4170 -350V-305H4010V-340Q4010 -385 3985.5 -410.0Q3961 -435 3920 -435Q3877 -435 3854.5 -410.0Q3832 -385 3832 -340V0Z M4500 10Q4454 10 4426.5 -17.5Q4399 -45 4399 -91Q4399 -138 4426.5 -165.0Q4454 -192 4500 -192Q4547 -192 4574.0 -165.0Q4601 -138 4601 -91Q4601 -45 4574.0 -17.5Q4547 10 4500 10Z"/></svg></a></header>
<main class="au-main" id="main">
 <div class="au-card">
  <p class="t-label muted">Error 503</p>
  <h1 class="t-title">Back in a moment.</h1>
  <p class="au-sub">Insidir could not check your account just now, so this page was not opened. Nothing about your account or subscription has changed. Try again in a minute.</p>
  <div class="nt-acts">
   <a class="btn btn--primary" href="${retry}">Try again</a>
   <a class="btn btn--secondary" href="/">Return home</a>
  </div>
 </div>
</main>
<footer class="au-foot">© 2026 Aethric LLC. Research, not investment advice. <a class="au-link" href="/privacy.html">Privacy</a> · <a class="au-link" href="/terms.html">Terms</a></footer>
</div>
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
