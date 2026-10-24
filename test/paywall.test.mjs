import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import {
  classifyPage, classifyApi, pageName, isApiPath, hasAccess, subscriptionActive, isComplimentary, accessSummary,
  safeNext, nextFor, gate, paywallNotices, privateCacheControl, mergeVary, unavailablePage,
  PRODUCT_PAGES, ACCOUNT_PAGES, PUBLIC_PAGES, NEXT_PAGES
} from "../src/paywall.mjs";
import { paywallEnabled, complimentaryEmails, billingSettings } from "../src/config.mjs";
import {
  createStripeClient, verifyStripeSignature, pickSubscription, periodEnd, syncCustomer, listCustomerSubscriptions,
  expireOpenCheckouts, cancelSubscriptionForDeletion, cancelOrphanCheckout, deleteAccount, billingRoutes, exclusiveBilling
} from "../src/billing.mjs";
import { createApiServer } from "../src/api.mjs";

const ON = {};                                  // paywall on (the default), billing not configured
const OFF = { INSIDIR_PAYWALL: "0" };
const BILLING = { INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_x", INSIDIR_STRIPE_PRICE_ID: "price_pro",
  INSIDIR_STRIPE_WEBHOOK_SECRET: "whsec_x", INSIDIR_PUBLIC_URL: "https://insidir.example" };
const COMP = { INSIDIR_COMPLIMENTARY_EMAILS: "  Owner@Insidir.example , team@aethric.llc,," };

const USERS = {
  paid: { id: "11111111-1111-4111-8111-111111111111", email: "paid@example.com", subscription_status: "active", current_period_end: new Date("2026-11-14T00:00:00Z") },
  trial: { id: "22222222-2222-4222-8222-222222222222", email: "trial@example.com", subscription_status: "trialing", current_period_end: null },
  lapsed: { id: "33333333-3333-4333-8333-333333333333", email: "lapsed@example.com", subscription_status: "past_due", current_period_end: null },
  none: { id: "44444444-4444-4444-8444-444444444444", email: "new@example.com", subscription_status: null, current_period_end: null },
  owner: { id: "55555555-5555-4555-8555-555555555555", email: "OWNER@insidir.example", subscription_status: null, current_period_end: null }
};

/* ---------------------------------------------------------------- classification */

test("pages: product, account and public classification mirrors how web.mjs resolves paths", () => {
  for (const name of PRODUCT_PAGES) {
    for (const path of ["/" + name, "/" + name + ".html", "/" + name + "/", "/" + name + ".html/", "/" + name.toUpperCase() + ".HTML"])
      assert.equal(classifyPage(path), "product", path);
  }
  for (const name of ACCOUNT_PAGES) for (const path of ["/" + name, "/" + name + ".html", "/" + name + "/"]) assert.equal(classifyPage(path), "account", path);
  for (const name of PUBLIC_PAGES) for (const path of ["/" + name, "/" + name + ".html"]) assert.equal(classifyPage(path), "public", path);
  for (const path of ["/", "", "/index.html", "/account-deleted.html", "/assets/js/app.js", "/assets/css/v13-halftone.css",
    "/assets/dashboard.html", "/assets/img/hero.jpg", "/dashboard.htm", "/no-such-page", "/%E0%A4%A", "/%00dashboard.html"])
    assert.equal(classifyPage(path), "public", JSON.stringify(path));
  // Encoded and dot-segment paths that serveStatic would still resolve to a product page.
  for (const path of ["/dash%62oard.html", "/%64ashboard", "/x%2f..%2fdashboard.html", "/%2e%2e/dashboard.html", "/assets/../research.html",
    "//dashboard.html", "/.%2fwatchlist", "/x\\..\\alerts.html", "/company.html%2f"])
    assert.equal(classifyPage(path), "product", path);
  assert.equal(classifyPage("/subscribe%2ehtml"), "account");
  assert.equal(pageName("/"), "index");
  assert.equal(pageName("/assets/js/app.js"), null);
  assert.equal(pageName("/Filing.HTML"), "filing");
  assert.ok(!NEXT_PAGES.includes("index") && !NEXT_PAGES.includes("signin"));
});

test("API: open endpoints, product endpoints for every method, unknown routes fail closed", () => {
  for (const [path, method] of [["/v1", "GET"], ["/v1/", "GET"], ["/v1/sources", "GET"], ["/healthz", "GET"], ["/healthz", "HEAD"],
    ["/v1/auth/login", "POST"], ["/v1/auth/register", "POST"], ["/v1/auth/logout", "POST"], ["/v1/me", "GET"], ["/v1/me", "HEAD"], ["/v1/me", "DELETE"],
    ["/v1/billing/status", "GET"], ["/v1/billing/checkout", "POST"], ["/v1/billing/portal", "POST"], ["/v1/billing/webhook", "POST"],
    ["/v1/internal/ingest", "POST"]])
    assert.equal(classifyApi(path, method), "open", method + " " + path);
  const product = ["/v1/filings", "/v1/filings/000123456726000042", "/v1/transactions", "/v1/companies", "/v1/clusters", "/v1/insiders",
    "/v1/status", "/v1/search", "/v1/intelligence", "/v1/market/chart", "/v1/company/profile", "/v1/company/insiders", "/v1/company/news",
    "/v1/me/watchlist", "/v1/me/manual-holdings", "/v1/me/people", "/v1/me/alerts", "/v1/me/brokerage/status", "/v1/me/brokerage/portfolio",
    "/v1/me/brokerage/connect", "/v1/me/brokerage/callback", "/v1/me/", "/v1/no-such-route", "/v1/%66ilings", "/v1/me/watchlist/AAPL/x",
    "/v1/me/brokerage/", "/v1/me/people/"];
  for (const path of product) for (const method of ["GET", "HEAD", "POST", "DELETE", "get"]) assert.equal(classifyApi(path, method), "product", method + " " + path);
  assert.equal(classifyApi("/v1/me", "POST"), "product");
  // The followed-people feed is product data (its path only matches the own-data delete rule for DELETE, which the handler rejects).
  for (const method of ["GET", "HEAD", "POST"]) assert.equal(classifyApi("/v1/me/people/updates", method), "product", method);
  // Deleting your own data needs a sign-in but no subscription; reading or adding it needs access.
  const ownDeletes = ["/v1/me/brokerage", "/v1/me/research-decisions", "/v1/me/watchlist/AAPL", "/v1/me/people/1234", "/v1/me/manual-holdings/BRK-B"];
  for (const path of ownDeletes) {
    for (const method of ["DELETE", "delete"]) assert.equal(classifyApi(path, method), "account", method + " " + path);
    for (const method of ["GET", "HEAD", "POST"]) assert.equal(classifyApi(path, method), "product", method + " " + path);
  }
  // Prepared images by content address are open (no session lookup per <img>); the batch that names them is product.
  const sha = "0123456789abcdef".repeat(4);
  for (const ext of ["png", "webp", "jpeg", "svg"]) for (const method of ["GET", "HEAD", "head"])
    assert.equal(classifyApi("/v1/media/" + sha + "." + ext, method), "open", method + " " + ext);
  for (const method of ["POST", "DELETE"]) assert.equal(classifyApi("/v1/media/" + sha + ".png", method), "product", method);
  for (const path of ["/v1/media", "/v1/media/", "/v1/media/x", "/v1/media/" + sha, "/v1/media/" + sha + ".gif", "/v1/media/" + sha.toUpperCase() + ".png",
    "/v1/media/" + sha.slice(1) + ".png", "/v1/media/" + sha + ".png/x", "/v1/media/" + sha + "0.png", "/v1/media/%30" + sha.slice(1) + ".png"])
    for (const method of ["GET", "HEAD"]) assert.equal(classifyApi(path, method), "product", method + " " + path);
  assert.equal(isApiPath("/v1"), true);
  assert.equal(isApiPath("/v1x"), false);
  assert.equal(isApiPath("/V1/filings"), false);
  assert.equal(isApiPath("/dashboard.html"), false);
});

/* ---------------------------------------------------------------- entitlement */

test("entitlement: only active and trialing subscriptions or complimentary emails have access", () => {
  for (const status of ["active", "trialing", "Active", " TRIALING "]) assert.equal(hasAccess({ email: "a@b.co", subscription_status: status }, ON), true, status);
  for (const status of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "inactive", "", null, undefined])
    assert.equal(hasAccess({ email: "a@b.co", subscription_status: status }, ON), false, String(status));
  assert.equal(hasAccess(null, ON), false);
  assert.equal(hasAccess(undefined, COMP), false);
  // Complimentary: case-insensitive and tolerant of spaces around the comma-separated entries.
  for (const email of ["owner@insidir.example", "OWNER@INSIDIR.EXAMPLE", "  Owner@Insidir.example  ", "team@aethric.llc", "Team@Aethric.LLC"])
    assert.equal(hasAccess({ email, subscription_status: null }, COMP), true, email);
  for (const email of ["owner@insidir.example.evil", "x,owner@insidir.example", "owner@insidir", "", null, 42])
    assert.equal(hasAccess({ email, subscription_status: null }, COMP), false, String(email));
  assert.equal(hasAccess({ email: "owner@insidir.example", subscription_status: "canceled" }, ON), false, "not complimentary without the env entry");
  assert.equal(isComplimentary("team@aethric.llc", { INSIDIR_COMPLIMENTARY_EMAILS: "owner@x.co team@aethric.llc" }), true, "whitespace also separates");
  assert.deepEqual([...complimentaryEmails(COMP)], ["owner@insidir.example", "team@aethric.llc"]);
  assert.equal(complimentaryEmails({}).size, 0);
  assert.equal(subscriptionActive({ subscriptionStatus: "active" }), true);
});

test("paywall switch: on unless INSIDIR_PAYWALL is exactly 0", () => {
  for (const value of [undefined, "", "1", "true", "false", "off", "no", "00"]) assert.equal(paywallEnabled({ INSIDIR_PAYWALL: value }), true, String(value));
  for (const value of ["0", " 0 "]) assert.equal(paywallEnabled({ INSIDIR_PAYWALL: value }), false);
  assert.equal(billingSettings({}).enabled, false);
  assert.equal(billingSettings(BILLING).enabled, true);
  assert.equal(billingSettings({ ...BILLING, INSIDIR_BILLING_ENABLED: "0" }).enabled, false);
  assert.equal(billingSettings({ ...BILLING, INSIDIR_STRIPE_WEBHOOK_SECRET: "" }).enabled, false);
  assert.equal(billingSettings({ ...BILLING, INSIDIR_STRIPE_PRICE_ID: " " }).enabled, false);
  assert.match(paywallNotices(ON)[0], /nobody can use the product/);
  assert.match(paywallNotices(COMP)[0], /only INSIDIR_COMPLIMENTARY_EMAILS/);
  assert.deepEqual(paywallNotices(BILLING), []);
  assert.match(paywallNotices(OFF)[0], /OFF/);
});

test("the /v1/me access object", () => {
  assert.deepEqual(accessSummary(USERS.paid, BILLING), { active: true, plan: "pro", status: "active", billingEnabled: true, complimentary: false, emailVerified: false, currentPeriodEnd: "2026-11-14T00:00:00.000Z" });
  assert.deepEqual(accessSummary(USERS.none, ON), { active: false, plan: "none", status: null, billingEnabled: false, complimentary: false, emailVerified: false, currentPeriodEnd: null });
  assert.deepEqual(accessSummary(USERS.lapsed, BILLING), { active: false, plan: "none", status: "past_due", billingEnabled: true, complimentary: false, emailVerified: false, currentPeriodEnd: null });
  assert.deepEqual(accessSummary(USERS.owner, COMP), { active: true, plan: "none", status: null, billingEnabled: false, complimentary: true, emailVerified: false, currentPeriodEnd: null });
  assert.equal(accessSummary(USERS.none, OFF).active, true, "development mode: everyone can use the product");
  assert.equal(accessSummary({ ...USERS.paid, current_period_end: new Date(0) }, ON).currentPeriodEnd, null, "epoch placeholder is not a date");
  assert.equal(accessSummary({ ...USERS.paid, current_period_end: "2026-12-01T00:00:00Z" }, ON).currentPeriodEnd, "2026-12-01T00:00:00.000Z");
  assert.equal(accessSummary({ ...USERS.paid, current_period_end: "not a date" }, ON).currentPeriodEnd, null);
});

test("no email at all: setting an email provider changes nothing, and nobody is asked to confirm an address", () => {
  const email = { ...COMP, INSIDIR_EMAIL_PROVIDER: "postmark", POSTMARK_SERVER_TOKEN: "pm-token", INSIDIR_EMAIL_FROM: "a@insidir.com" };
  assert.equal(hasAccess(USERS.owner, COMP), true, "the complimentary address works at once");
  assert.equal(hasAccess(USERS.owner, email), true, "a configured provider is ignored: still no confirmation step");
  assert.equal(hasAccess(USERS.paid, email), true, "a paying subscriber is never asked to confirm anything");
  assert.equal("verificationRequired" in accessSummary(USERS.paid, email), false, "the access object carries no verification flag");
});

test("account management routes need a sign-in but no subscription; admin and email-link routes authenticate themselves", () => {
  for (const [p, m] of [["/v1/me/password", "POST"], ["/v1/me/sessions/revoke-others", "POST"], ["/v1/me/security-events", "GET"], ["/v1/me/export", "GET"], ["/v1/me/email-preferences", "GET"], ["/v1/me/email-preferences", "POST"]])
    assert.equal(classifyApi(p, m), "account", p);
  for (const p of ["/v1/admin/ops", "/v1/admin/session", "/v1/email/unsubscribe", "/v1/email/webhook/postmark", "/v1/auth/forgot-password", "/v1/auth/reset-password", "/v1/auth/verify-email"])
    assert.equal(classifyApi(p, "POST"), "open", p);
  assert.equal(classifyApi("/v1/me/notifications", "GET"), "product");
  assert.equal(classifyApi("/v1/me/password/extra", "POST"), "product", "only the exact routes");
});

/* ---------------------------------------------------------------- next= */

test("safeNext keeps known same-origin pages and their queries, rejects everything else", () => {
  for (const ok of ["/dashboard", "/dashboard.html", "/company.html?ticker=AAPL", "/research?ticker=BRK-B", "/filing.html?accession=000123456726000042",
    "/people.html?q=jane%20doe", "/person.html?cik=1214156", "/person?cik=0001214156", "/subscribe.html", "/billing.html", "/account", "/explore.html?q=a&b=c"])
    assert.equal(safeNext(ok), ok, ok);
  assert.equal(safeNext("/dashboard.html?"), "/dashboard.html");
  for (const bad of ["https://evil.example/dashboard.html", "http://evil.example", "//evil.example", "//evil.example/dashboard.html", "\\\\evil.example",
    "/\\evil.example", "\\evil", "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "dashboard.html", "./dashboard.html",
    "/../dashboard.html", "/assets/../dashboard.html", "/%2e%2e/dashboard.html", "/%2F%2Fevil.example", "/", "/index.html", "/signin.html",
    "/signup.html", "/pricing.html", "/404.html", "/account-deleted.html", "/no-such-page", "/Dashboard.html", "/dashboard.htm",
    "/dashboard.html#top", "/dashboard.html?x=<script>", "/dashboard.html?x=1 2", "/dashboard.html\n", "/dashboard.html?x=%zz",
    "/dashboard.html?a=?b", " /dashboard.html", "", null, undefined, 42, {}, "/dashboard.html?" + "a".repeat(600)])
    assert.equal(safeNext(bad), null, JSON.stringify(bad));
});

test("nextFor uses the request's own path when safe, else the canonical page", () => {
  const url = path => new URL(path, "http://localhost");
  assert.equal(nextFor(url("/dashboard.html")), "/dashboard.html");
  assert.equal(nextFor(url("/company?ticker=AAPL")), "/company?ticker=AAPL");
  assert.equal(nextFor(url("/Dashboard.HTML?x=1")), "/dashboard.html?x=1");
  assert.equal(nextFor(url("/dash%62oard.html")), "/dashboard.html");
  assert.equal(nextFor(url("/research/")), "/research.html");
  assert.equal(nextFor(url("/company.html?ticker=" + "A".repeat(600))), "/company.html");
});

/* ---------------------------------------------------------------- gate decisions */

function counter(user) {
  const fn = async () => { fn.calls++; return user; };
  fn.calls = 0;
  return fn;
}
const decide = (path, user, env = ON, method = "GET") => {
  const loadUser = counter(user);
  return gate({ req: { method, headers: {} }, url: new URL(path, "http://localhost"), loadUser, env }).then(d => ({ ...d, calls: loadUser.calls }));
};

test("gate: signed-out visitors are sent to sign-in with a safe next=, API calls get 401", async () => {
  let d = await decide("/dashboard.html", null);
  assert.deepEqual([d.action, d.status, d.location], ["redirect", 302, "/signin.html?next=%2Fdashboard.html"]);
  d = await decide("/company.html?ticker=AAPL", null);
  assert.equal(d.location, "/signin.html?next=" + encodeURIComponent("/company.html?ticker=AAPL"));
  // The personnel file: a product page, and its CIK survives the trip through sign-in.
  d = await decide("/person.html?cik=1214156", null);
  assert.deepEqual([d.action, d.location, d.calls], ["redirect", "/signin.html?next=%2Fperson.html%3Fcik%3D1214156", 1]);
  d = await decide("/v1/people/1214156", null);
  assert.deepEqual([d.action, d.status, d.body], ["deny", 401, { error: "Sign in required", signin: "/signin.html" }]);
  d = await decide("/research?ticker=NVDA", null, ON, "HEAD");
  assert.equal(d.location, "/signin.html?next=" + encodeURIComponent("/research?ticker=NVDA"));
  for (const page of ["/subscribe.html", "/billing", "/account.html"]) {
    d = await decide(page, null);
    assert.equal(d.action, "redirect", page);
    assert.ok(d.location.startsWith("/signin.html?next="), page);
  }
  d = await decide("/v1/filings?limit=5", null);
  assert.deepEqual([d.action, d.status, d.body], ["deny", 401, { error: "Sign in required", signin: "/signin.html" }]);
  d = await decide("/v1/me/watchlist", null, ON, "POST");
  assert.equal(d.status, 401);
  d = await decide("/v1/me/brokerage/callback?code=x&state=y", null);
  assert.equal(d.location, "/signin.html?next=%2Fportfolio.html");
  // Deleting your own data still needs a sign-in.
  for (const path of ["/v1/me/brokerage", "/v1/me/watchlist/AAPL"]) assert.deepEqual((await decide(path, null, ON, "DELETE")).body, { error: "Sign in required", signin: "/signin.html" });
});

test("gate: signed in without a subscription reaches account pages only; product API is 402", async () => {
  for (const user of [USERS.none, USERS.lapsed, { ...USERS.none, subscription_status: "canceled" }]) {
    let d = await decide("/dashboard.html", user);
    assert.deepEqual([d.action, d.location], ["redirect", "/subscribe.html?next=%2Fdashboard.html"]);
    d = await decide("/filing.html?accession=000123456726000042", user);
    assert.equal(d.location, "/subscribe.html?next=" + encodeURIComponent("/filing.html?accession=000123456726000042"));
    assert.equal((await decide("/person.html?cik=1214156", user)).location, "/subscribe.html?next=%2Fperson.html%3Fcik%3D1214156");
    assert.equal((await decide("/v1/people/1214156", user)).status, 402);
    for (const page of ["/subscribe.html", "/billing.html?checkout=success", "/account"]) assert.equal((await decide(page, user)).action, "allow", page);
    d = await decide("/v1/intelligence?ticker=AAPL", user);
    assert.deepEqual([d.action, d.status, d.body], ["deny", 402, { error: "An active Insidir subscription is required", subscribe: "/subscribe.html" }]);
    assert.equal((await decide("/v1/me/watchlist", user, ON, "POST")).status, 402);
    assert.equal((await decide("/v1/me/research-decisions", user)).status, 402);
    // Removing their own data (and revoking a brokerage grant) still works after a subscription lapses.
    for (const path of ["/v1/me/watchlist/AAPL", "/v1/me/brokerage", "/v1/me/people/1234", "/v1/me/manual-holdings/AAPL", "/v1/me/research-decisions?ticker=AAPL"]) {
      d = await decide(path, user, ON, "DELETE");
      assert.deepEqual([d.action, d.kind, d.user], ["allow", "account", user], "DELETE " + path);
    }
    assert.equal((await decide("/v1/me/brokerage/callback", user)).location, "/subscribe.html?next=%2Fportfolio.html");
  }
});

test("gate: active, trialing and complimentary accounts use the whole product", async () => {
  for (const [user, env] of [[USERS.paid, ON], [USERS.trial, ON], [USERS.owner, COMP], [{ ...USERS.lapsed, email: "team@aethric.llc" }, COMP]]) {
    for (const path of ["/dashboard.html", "/research?ticker=AAPL", "/company.html?ticker=MSFT", "/people", "/person.html?cik=1214156", "/portfolio.html", "/subscribe.html", "/account.html"]) {
      const d = await decide(path, user, env);
      assert.equal(d.action, "allow", user.email + " " + path);
      assert.equal(d.user, user);
    }
    for (const [path, method] of [["/v1/filings", "GET"], ["/v1/search?q=nv", "GET"], ["/v1/me/watchlist", "POST"], ["/v1/me/manual-holdings/AAPL", "DELETE"]])
      assert.equal((await decide(path, user, env, method)).action, "allow", method + " " + path);
  }
  // The complimentary list only helps when it names the account.
  assert.equal((await decide("/dashboard.html", USERS.none, COMP)).action, "redirect");
});

test("gate: public pages, assets and open endpoints never load the user", async () => {
  for (const path of ["/", "/index.html", "/platform.html", "/why-insidir", "/data.html", "/pricing.html", "/company-info.html", "/terms.html",
    "/privacy.html", "/signin.html", "/signup.html", "/404.html", "/account-deleted.html", "/assets/js/app.js", "/no-such-page",
    "/v1", "/v1/sources", "/healthz", "/v1/auth/login", "/v1/billing/status", "/v1/billing/webhook", "/v1/me"]) {
    const d = await decide(path, null);
    assert.equal(d.action, "allow", path);
    assert.equal(d.calls, 0, path + " must not query the session");
  }
  // POST to a page path serves nothing, so it is not gated (the router answers 404).
  assert.equal((await decide("/dashboard.html", null, ON, "POST")).action, "allow");
});

test("gate: INSIDIR_PAYWALL=0 turns gating off for local development", async () => {
  for (const [path, method] of [["/dashboard.html", "GET"], ["/account.html", "GET"], ["/v1/filings", "GET"], ["/v1/me/watchlist", "POST"]]) {
    const d = await decide(path, null, OFF, method);
    assert.equal(d.action, "allow", path);
    assert.equal(d.calls, 0);
  }
});

/* ---------------------------------------------------------------- Stripe */

function fakeStripe(handlers = {}) {
  const calls = [];
  const call = method => async (path, params) => {
    calls.push(method + " " + path);
    const h = handlers[method + " " + path] ?? handlers[method];
    if (h instanceof Error) throw h;
    return typeof h === "function" ? h(path, params) : (h ?? {});
  };
  return { calls, get: call("GET"), post: call("POST"), del: call("DELETE") };
}
function fakeQuery(rows = {}, log = []) {
  const fn = async (sql, params) => {
    const text = sql.replace(/\s+/g, " ").trim();
    log.push(text.split(" ").slice(0, 3).join(" "));
    fn.statements.push({ sql: text, params });
    for (const [prefix, result] of Object.entries(rows)) if (text.startsWith(prefix)) return typeof result === "function" ? result(params) : result;
    return { rows: [], rowCount: 0 };
  };
  fn.statements = [];
  return fn;
}
// A checkout request as the subscribe page sends it: JSON consent to the offer it showed.
const consentBody = (offer = "trial") => Buffer.from(JSON.stringify({ consent: true, offer, disclosureVersion: "2026-10-23" }));
const checkoutReq = (origin = "https://insidir.example", offer = "trial") =>
  Object.assign([consentBody(offer)], { method: "POST", url: "/v1/billing/checkout", headers: { origin, "content-type": "application/json" } });
const stripeError = (stripeStatus, message = "Stripe failed") => Object.assign(new Error(message), { status: 400, stripeStatus });

test("account deletion cancels a live Stripe subscription before deleting anything", async () => {
  const log = [];
  const stripe = fakeStripe({ DELETE: { id: "sub_123", status: "canceled" } });
  const query = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null, stripe_subscription_id: "sub_123", subscription_status: "active" }] } }, log);
  stripe.del = (orig => async (...a) => { log.push("stripe cancel"); return orig(...a); })(stripe.del);
  const result = await deleteAccount({ id: USERS.paid.id }, { stripe, query, revokeBrokerage: async () => { log.push("brokerage revoke"); return true; } });
  assert.deepEqual(result, { deleted: true, subscriptionCanceled: true });
  assert.deepEqual(stripe.calls, ["DELETE /subscriptions/sub_123"]);
  assert.deepEqual(log, ["SELECT stripe_customer_id,stripe_subscription_id,subscription_status FROM", "stripe cancel", "UPDATE users SET", "brokerage revoke", "DELETE FROM users"]);
});

test("account deletion stops, deleting nothing, when Stripe cannot cancel the subscription", async () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", null]) {
    const log = [];
    const stripe = fakeStripe({ DELETE: stripeError(500), GET: { id: "sub_123", status: "active" } });
    const query = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null, stripe_subscription_id: "sub_123", subscription_status: status }] } }, log);
    let revoked = false;
    await assert.rejects(deleteAccount({ id: USERS.paid.id }, { stripe, query, revokeBrokerage: async () => { revoked = true; } }),
      e => e.status === 503 && /could not cancel your Insidir subscription/.test(e.message) && /not deleted/.test(e.message), String(status));
    assert.deepEqual(stripe.calls, ["DELETE /subscriptions/sub_123", "GET /subscriptions/sub_123"], String(status));
    assert.ok(!log.some(x => x.startsWith("DELETE FROM users") || x.startsWith("UPDATE")), "no local change: " + log.join(" | "));
    assert.equal(revoked, false, "the brokerage grant is untouched");
  }
  // Stripe unreachable or not configured at all: same outcome.
  const unconfigured = createStripeClient({ secretKey: "" });
  const query = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null, stripe_subscription_id: "sub_123", subscription_status: "active" }] } });
  await assert.rejects(deleteAccount({ id: USERS.paid.id }, { stripe: unconfigured, query }), e => e.status === 503);
  const withCustomer = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: "cus_A1", stripe_subscription_id: null, subscription_status: null }] } });
  await assert.rejects(deleteAccount({ id: USERS.paid.id }, { stripe: unconfigured, query: withCustomer }), e => e.status === 503, "Stripe must confirm there is nothing to cancel");
  assert.ok(!withCustomer.statements.some(s => s.sql.startsWith("DELETE")));
  assert.ok(!query.statements.some(s => s.sql.startsWith("DELETE")));
  // A malformed stored id is never sent to Stripe.
  const odd = fakeStripe();
  await assert.rejects(cancelSubscriptionForDeletion({ stripe_subscription_id: "sub_1/../../customers", subscription_status: "active" }, { stripe: odd }), e => e.status === 503);
  assert.deepEqual(odd.calls, []);
});

test("account deletion proceeds when the subscription has already ended or never existed", async () => {
  // Nothing to cancel: no Stripe call at all.
  for (const row of [{ stripe_subscription_id: null, subscription_status: null }, { stripe_subscription_id: "sub_9", subscription_status: "canceled" },
    { stripe_subscription_id: "sub_9", subscription_status: "incomplete_expired" }]) {
    const stripe = fakeStripe();
    const query = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null, ...row }] } });
    assert.deepEqual(await deleteAccount({ id: USERS.none.id }, { stripe, query }), { deleted: true, subscriptionCanceled: false });
    assert.deepEqual(stripe.calls, []);
    assert.ok(query.statements.at(-1).sql.startsWith("DELETE FROM users"));
  }
  // Cancel call fails but Stripe confirms it already ended, or does not know it.
  for (const get of [{ id: "sub_7", status: "canceled" }, stripeError(404, "No such subscription")]) {
    const stripe = fakeStripe({ DELETE: stripeError(400), GET: get });
    const query = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null, stripe_subscription_id: "sub_7", subscription_status: "past_due" }] } });
    assert.equal((await deleteAccount({ id: USERS.lapsed.id }, { stripe, query })).deleted, true);
  }
  // The account was already removed by another request.
  await assert.rejects(deleteAccount({ id: "x" }, { stripe: fakeStripe(), query: fakeQuery() }), e => e.status === 401);
});

/* A small stateful Stripe for the deletion and checkout flows: customers' subscriptions and
 * Checkout Sessions, list paging, and failures injected per call. */
const plan = (id, customer, status, price = "price_pro", created = 1) =>
  ({ id, customer, status, created, items: { data: [{ price: { id: price }, current_period_end: 1793404800 }] } });
function stripeWorld({ subs = [], sessions = [], pageSize = 100, fail = {} } = {}) {
  const calls = [];
  const missing = () => Object.assign(new Error("No such object"), { status: 400, stripeStatus: 404, stripeCode: "resource_missing" });
  const check = key => {
    const f = fail[key];
    if (typeof f === "function") { const r = f(); if (r instanceof Error) throw r; }
    else if (f) throw f instanceof Error ? f : stripeError(500);
  };
  const page = (items, params) => {
    const start = params?.starting_after ? items.findIndex(x => x.id === params.starting_after) + 1 : 0;
    const size = Math.min(pageSize, Number(params?.limit) || 10);
    return { object: "list", data: items.slice(start, start + size), has_more: start + size < items.length };
  };
  const world = {
    subs, sessions, calls,
    async get(path, params) {
      calls.push("GET " + path + (params?.starting_after ? "?after=" + params.starting_after : ""));
      check("GET " + path);
      if (path === "/subscriptions") return page(subs.filter(x => x.customer === params.customer && (params.status === "all" || x.status === params.status)), params);
      if (path === "/checkout/sessions") return page(sessions.filter(x => x.customer === params.customer && (!params.status || x.status === params.status)), params);
      const found = [...subs, ...sessions].find(x => path.endsWith("/" + x.id));
      if (!found) throw missing();
      return { ...found };
    },
    async post(path, params) {
      calls.push("POST " + path);
      check("POST " + path);
      if (path === "/customers") return { id: "cus_NEW" };
      if (path === "/checkout/sessions") { const cs = { id: "cs_test_" + (sessions.length + 1), customer: params.customer, status: "open", url: "https://checkout.stripe.com/c/pay/" + (sessions.length + 1) }; sessions.push(cs); return cs; }
      const m = /^\/checkout\/sessions\/(cs_\w+)\/expire$/.exec(path);
      const cs = m && sessions.find(x => x.id === m[1]);
      if (!cs) throw missing();
      if (cs.status !== "open") throw stripeError(400, "Only open sessions can be expired");
      cs.status = "expired";
      return { ...cs };
    },
    async del(path) {
      calls.push("DELETE " + path);
      check("DELETE " + path);
      const sub = subs.find(x => path === "/subscriptions/" + x.id);
      if (!sub) throw missing();
      if (["canceled", "incomplete_expired"].includes(sub.status)) throw stripeError(400, "Already canceled");
      sub.status = "canceled";
      return { ...sub };
    }
  };
  return world;
}
const accountRow = (row, log) => fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null, ...row }] } }, log);
const deletedLocally = query => query.statements.some(x => /^(DELETE FROM users|UPDATE users)/.test(x.sql));

test("account deletion asks Stripe for the customer's subscriptions even when no subscription ID was saved (webhook pending)", async () => {
  // Checkout completed in Stripe, but the webhook has not arrived: nothing is saved locally.
  const world = stripeWorld({ subs: [plan("sub_A1", "cus_A1", "active")] });
  const log = [];
  const query = accountRow({ stripe_customer_id: "cus_A1" }, log);
  const result = await deleteAccount({ id: USERS.none.id }, { stripe: world, query, revokeBrokerage: async () => { log.push("brokerage revoke"); } });
  assert.deepEqual(result, { deleted: true, subscriptionCanceled: true });
  assert.deepEqual(world.calls, ["GET /checkout/sessions", "GET /subscriptions", "DELETE /subscriptions/sub_A1"]);
  assert.equal(world.subs[0].status, "canceled", "Stripe stops billing");
  assert.deepEqual(log, ["SELECT stripe_customer_id,stripe_subscription_id,subscription_status FROM", "UPDATE users SET", "brokerage revoke", "DELETE FROM users"]);
});

test("account deletion cancels every subscription that can still bill, whatever its price, and leaves ended ones alone", async () => {
  const world = stripeWorld({ subs: [
    plan("sub_live1", "cus_A1", "active"), plan("sub_live2", "cus_A1", "active", "price_pro", 2), plan("sub_due", "cus_A1", "past_due"),
    plan("sub_other", "cus_A1", "trialing", "price_old"), plan("sub_inc", "cus_A1", "incomplete"), plan("sub_paused", "cus_A1", "paused"),
    plan("sub_unpaid", "cus_A1", "unpaid"), plan("sub_old", "cus_A1", "canceled"), plan("sub_exp", "cus_A1", "incomplete_expired"),
    plan("sub_someone_else", "cus_B2", "active")] });
  const query = accountRow({ stripe_customer_id: "cus_A1", stripe_subscription_id: "sub_live1", subscription_status: "active" });
  assert.deepEqual(await deleteAccount({ id: USERS.paid.id }, { stripe: world, query }), { deleted: true, subscriptionCanceled: true });
  const cancelled = world.calls.filter(c => c.startsWith("DELETE")).map(c => c.split("/").at(-1)).sort();
  assert.deepEqual(cancelled, ["sub_due", "sub_inc", "sub_live1", "sub_live2", "sub_other", "sub_paused", "sub_unpaid"]);
  assert.deepEqual(world.subs.map(x => x.status), ["canceled", "canceled", "canceled", "canceled", "canceled", "canceled", "canceled", "canceled", "incomplete_expired", "active"]);
  assert.ok(query.statements.at(-1).sql.startsWith("DELETE FROM users"));
});

test("account deletion expires open checkout pages first, so a late payment cannot start a subscription", async () => {
  const world = stripeWorld({ sessions: [{ id: "cs_test_open", customer: "cus_A1", status: "open" }, { id: "cs_test_done", customer: "cus_A1", status: "complete" },
    { id: "cs_test_other", customer: "cus_B2", status: "open" }] });
  const query = accountRow({ stripe_customer_id: "cus_A1" });
  assert.deepEqual(await deleteAccount({ id: USERS.none.id }, { stripe: world, query }), { deleted: true, subscriptionCanceled: false });
  assert.deepEqual(world.calls, ["GET /checkout/sessions", "POST /checkout/sessions/cs_test_open/expire", "GET /subscriptions"]);
  assert.deepEqual(world.sessions.map(x => x.status), ["expired", "complete", "open"]);

  // The page was paid between the listing and the expiry: its new subscription is then cancelled.
  const raced = stripeWorld({ sessions: [{ id: "cs_test_paid", customer: "cus_A1", status: "open" }],
    fail: { "POST /checkout/sessions/cs_test_paid/expire": () => { raced.sessions[0].status = "complete"; raced.subs.push(plan("sub_new", "cus_A1", "active")); return stripeError(400); } } });
  assert.equal((await deleteAccount({ id: USERS.none.id }, { stripe: raced, query: accountRow({ stripe_customer_id: "cus_A1" }) })).subscriptionCanceled, true);
  assert.deepEqual(raced.calls.slice(-3), ["GET /checkout/sessions/cs_test_paid", "GET /subscriptions", "DELETE /subscriptions/sub_new"]);

  // Stripe will not expire it and it is still open: nothing is deleted.
  const stuck = stripeWorld({ sessions: [{ id: "cs_test_stuck", customer: "cus_A1", status: "open" }], fail: { "POST /checkout/sessions/cs_test_stuck/expire": stripeError(500) } });
  const kept = accountRow({ stripe_customer_id: "cus_A1" });
  await assert.rejects(deleteAccount({ id: USERS.none.id }, { stripe: stuck, query: kept }), e => e.status === 503 && /not deleted/.test(e.message));
  assert.equal(deletedLocally(kept), false);
});

test("account deletion refuses, deleting nothing, unless Stripe confirms every subscription has ended", async () => {
  const cases = [
    ["listing fails", stripeWorld({ subs: [plan("sub_A1", "cus_A1", "active")], fail: { "GET /subscriptions": stripeError(500) } })],
    ["listing is not a list", Object.assign(stripeWorld(), { get: async path => path === "/subscriptions" ? { error: "?" } : { data: [] } })],
    ["checkout listing fails", stripeWorld({ fail: { "GET /checkout/sessions": stripeError(503) } })],
    ["Stripe unreachable", stripeWorld({ fail: { "GET /checkout/sessions": Object.assign(new Error("Could not reach Stripe"), { status: 503 }) } })],
    ["one of two cancellations fails", stripeWorld({ subs: [plan("sub_live1", "cus_A1", "active"), plan("sub_live2", "cus_A1", "active")], fail: { "DELETE /subscriptions/sub_live2": stripeError(500) } })],
    ["endless pages", Object.assign(stripeWorld(), { get: async () => ({ data: [{ id: "sub_x", status: "canceled" }], has_more: true }) })]
  ];
  for (const [label, world] of cases) {
    const query = accountRow({ stripe_customer_id: "cus_A1", stripe_subscription_id: "sub_live1", subscription_status: "active" });
    let revoked = false;
    await assert.rejects(deleteAccount({ id: USERS.paid.id }, { stripe: world, query, revokeBrokerage: async () => { revoked = true; } }),
      e => e.status === 503 && /could not cancel your Insidir subscription/.test(e.message) && /not deleted/.test(e.message), label);
    assert.equal(deletedLocally(query), false, label);
    assert.equal(revoked, false, label);
  }
  // Every cancellation is still attempted, so the one Stripe accepted stops billing.
  const partial = cases[4][1];
  assert.deepEqual(partial.calls.filter(c => c.startsWith("DELETE")), ["DELETE /subscriptions/sub_live1", "DELETE /subscriptions/sub_live2"]);
  assert.deepEqual(partial.subs.map(x => x.status), ["canceled", "active"]);
  assert.deepEqual(cases[0][1].calls.filter(c => c.startsWith("DELETE")), [], "nothing is cancelled from a list that could not be read");
});

test("account deletion follows Stripe paging and falls back to the saved subscription ID", async () => {
  const many = Array.from({ length: 5 }, (_, i) => plan("sub_p" + i, "cus_A1", i % 2 ? "canceled" : "active"));
  const paged = stripeWorld({ subs: many, pageSize: 2 });
  await deleteAccount({ id: USERS.paid.id }, { stripe: paged, query: accountRow({ stripe_customer_id: "cus_A1" }) });
  assert.deepEqual(paged.calls.filter(c => c.startsWith("GET /subscriptions")), ["GET /subscriptions", "GET /subscriptions?after=sub_p1", "GET /subscriptions?after=sub_p3"]);
  assert.deepEqual(paged.calls.filter(c => c.startsWith("DELETE")), ["DELETE /subscriptions/sub_p0", "DELETE /subscriptions/sub_p2", "DELETE /subscriptions/sub_p4"]);

  // A saved ID that Stripe does not list for this customer is still cancelled.
  const stale = stripeWorld({ subs: [plan("sub_saved", "cus_OTHER", "active")] });
  await deleteAccount({ id: USERS.paid.id }, { stripe: stale, query: accountRow({ stripe_customer_id: "cus_A1", stripe_subscription_id: "sub_saved", subscription_status: "active" }) });
  assert.deepEqual(stale.calls, ["GET /checkout/sessions", "GET /subscriptions", "DELETE /subscriptions/sub_saved"]);
  // Stripe is fresher than the saved status: a listed, already-cancelled subscription is not cancelled again.
  const fresh = stripeWorld({ subs: [plan("sub_saved", "cus_A1", "canceled")] });
  const r = await deleteAccount({ id: USERS.paid.id }, { stripe: fresh, query: accountRow({ stripe_customer_id: "cus_A1", stripe_subscription_id: "sub_saved", subscription_status: "active" }) });
  assert.deepEqual([r, fresh.calls], [{ deleted: true, subscriptionCanceled: false }, ["GET /checkout/sessions", "GET /subscriptions"]]);
  // The customer does not exist in this Stripe account (e.g. test data after switching to live keys).
  const gone = stripeWorld({ subs: [plan("sub_x", "cus_ELSEWHERE", "active")],
    fail: { "GET /checkout/sessions": () => Object.assign(new Error("No such customer"), { status: 400, stripeStatus: 400, stripeCode: "resource_missing" }),
      "GET /subscriptions": () => Object.assign(new Error("No such customer"), { status: 400, stripeStatus: 400, stripeCode: "resource_missing" }) } });
  const goneRow = accountRow({ stripe_customer_id: "cus_A1", stripe_subscription_id: "sub_x", subscription_status: "active" });
  assert.equal((await deleteAccount({ id: USERS.paid.id }, { stripe: gone, query: goneRow })).deleted, true);
  assert.ok(gone.calls.includes("DELETE /subscriptions/sub_x"), "the saved ID is still cancelled");
  // A malformed stored customer ID is never sent to Stripe.
  const odd = stripeWorld();
  await assert.rejects(cancelSubscriptionForDeletion({ stripe_customer_id: "cus_1/../x" }, { stripe: odd }), e => e.status === 503);
  assert.deepEqual(odd.calls, []);
  assert.deepEqual(await listCustomerSubscriptions("cus_A1", { stripe: stripeWorld({ subs: [plan("sub_1", "cus_A1", "active")] }) }).then(x => x.map(s => s.id)), ["sub_1"]);
  assert.equal(await expireOpenCheckouts("cus_A1", { stripe: stripeWorld({ sessions: [{ id: "cs_test_1", customer: "cus_A1", status: "open" }] }) }), 1);
});

test("one billing change per account at a time", async () => {
  let release;
  const first = exclusiveBilling("u1", () => new Promise(r => { release = r; }));
  await assert.rejects(exclusiveBilling("u1", async () => "second"), e => e.status === 409 && /already in progress/.test(e.message));
  assert.equal(await exclusiveBilling("u2", async () => "other account"), "other account");
  release("done");
  assert.equal(await first, "done");
  assert.equal(await exclusiveBilling("u1", async () => "again"), "again");
  await assert.rejects(exclusiveBilling("u1", async () => { throw new Error("boom"); }));
  assert.equal(await exclusiveBilling("u1", async () => "released after an error"), "released after an error");
});

test("Stripe client sends authenticated form posts, query-string GETs and DELETEs; errors are user-safe", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ id: "x", status: "canceled" }), { status: 200 }); };
  const stripe = createStripeClient({ secretKey: "sk_test_1", fetchImpl });
  await stripe.post("/customers", { email: "a@b.co" });
  await stripe.get("/subscriptions", { customer: "cus_1", status: "all" });
  await stripe.del("/subscriptions/sub_1");
  assert.equal(sent[0].url, "https://api.stripe.com/v1/customers");
  assert.equal(sent[0].init.method, "POST");
  assert.equal(sent[0].init.body, "email=a%40b.co");
  assert.equal(sent[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(sent[0].init.headers.Authorization, "Bearer sk_test_1");
  assert.equal(sent[1].url, "https://api.stripe.com/v1/subscriptions?customer=cus_1&status=all");
  assert.equal(sent[1].init.body, undefined);
  assert.deepEqual([sent[2].url, sent[2].init.method], ["https://api.stripe.com/v1/subscriptions/sub_1", "DELETE"]);
  const failing = status => createStripeClient({ secretKey: "sk", fetchImpl: async () => new Response(JSON.stringify({ error: { message: "No such customer", code: "resource_missing" } }), { status }) });
  await assert.rejects(failing(404).get("/customers/cus_x"), e => e.status === 400 && e.stripeStatus === 404 && e.message === "No such customer");
  await assert.rejects(failing(401).get("/customers/cus_x"), e => e.status === 503 && !/No such/.test(e.message));
  await assert.rejects(failing(502).get("/customers/cus_x"), e => e.status === 503);
  await assert.rejects(createStripeClient({ secretKey: "sk", fetchImpl: async () => { throw new Error("socket"); } }).get("/x"), e => e.status === 503 && /reach Stripe/.test(e.message));
  await assert.rejects(createStripeClient({ secretKey: "" }).get("/x"), e => e.status === 503);
});

test("Stripe webhook signatures: valid, rolled, stale and forged", () => {
  const raw = '{"id":"evt_1"}', secret = "whsec_test", now = Date.UTC(2026, 9, 14) ;
  const ts = Math.floor(now / 1000), sign = (t, s = secret) => createHmac("sha256", s).update(t + "." + raw).digest("hex");
  assert.equal(verifyStripeSignature(raw, `t=${ts},v1=${sign(ts)}`, secret, now), true);
  assert.equal(verifyStripeSignature(raw, `t=${ts},v1=${sign(ts, "old")},v1=${sign(ts)}`, secret, now), true, "rolled secrets send two v1 values");
  assert.equal(verifyStripeSignature(raw, `t=${ts - 301},v1=${sign(ts - 301)}`, secret, now), false, "stale");
  assert.equal(verifyStripeSignature(raw, `t=${ts},v1=${sign(ts, "forged")}`, secret, now), false);
  assert.equal(verifyStripeSignature(raw, `t=${ts},v1=zz`, secret, now), false);
  assert.equal(verifyStripeSignature(raw, "", secret, now), false);
  assert.equal(verifyStripeSignature(raw, `t=${ts},v1=${sign(ts)}`, "", now), false);
});

test("subscription sync: only the configured price counts, the best standing wins, period end from items", async () => {
  const sub = (id, status, created, price = "price_pro", end = 1793404800) => ({ id, status, created, items: { data: [{ price: { id: price }, current_period_end: end }] } });
  assert.equal(pickSubscription([sub("sub_a", "canceled", 3), sub("sub_b", "active", 1), sub("sub_c", "past_due", 2)], "price_pro").id, "sub_b");
  assert.equal(pickSubscription([sub("sub_a", "canceled", 1), sub("sub_b", "canceled", 5)], "price_pro").id, "sub_b");
  assert.equal(pickSubscription([sub("sub_a", "active", 1, "price_other")], "price_pro"), null);
  assert.equal(pickSubscription([sub("sub_a", "active", 1)], ""), null);
  assert.equal(pickSubscription([{ ...sub("bad id", "active", 1) }], "price_pro"), null);
  assert.equal(periodEnd(sub("sub_a", "active", 1), "price_pro").toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(periodEnd({ current_period_end: 1793404800, items: { data: [] } }, "price_pro").toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(periodEnd({ items: { data: [] } }, "price_pro"), null);

  const stripe = fakeStripe({ "GET /subscriptions": { data: [sub("sub_old", "canceled", 1), sub("sub_new", "active", 2)] } });
  const query = fakeQuery();
  const stored = await syncCustomer("cus_ABC", { stripe, query, priceId: "price_pro" });
  assert.deepEqual(stored, { stripe_subscription_id: "sub_new", subscription_status: "active", current_period_end: new Date(1793404800 * 1000), cancel_at_period_end: false });
  assert.match(query.statements[0].sql, /^UPDATE users SET stripe_subscription_id=\$1,subscription_status=\$2,current_period_end=\$3,\s*trial_started_at=CASE WHEN \$2='trialing' THEN COALESCE\(trial_started_at,now\(\)\) ELSE trial_started_at END,cancel_at_period_end=\$5 WHERE stripe_customer_id=\$4/);
  assert.deepEqual(query.statements[0].params.slice(0, 2), ["sub_new", "active"]);
  const other = fakeQuery();
  assert.equal(await syncCustomer("cus_ABC", { stripe: fakeStripe({ GET: { data: [sub("sub_x", "active", 1, "price_other")] } }), query: other, priceId: "price_pro" }), null);
  assert.match(other.statements[0].sql, /subscription_status='inactive'/);
  const untouched = fakeStripe();
  assert.equal(await syncCustomer("cus_1;DROP", { stripe: untouched, query: fakeQuery() }), null);
  assert.deepEqual(untouched.calls, []);
});

test("billing routes: status reports pro/none, checkout returns to billing or subscribe", async () => {
  const replies = [];
  const json = (res, status, body) => { replies.push({ status, body }); return true; };
  const req = (method, url, headers = {}) => Object.assign([], { method, url, headers });
  const deps = (user, rows, stripe = fakeStripe()) => ({ env: BILLING, currentUser: async () => user, stripe, query: fakeQuery(rows) });

  await billingRoutes(req("GET", "/v1/billing/status"), {}, "/v1/billing/status", json,
    deps(USERS.none, { "SELECT email": { rows: [{ ...USERS.none, stripe_customer_id: null }] } }));
  const { offer, ...status } = replies.at(-1).body;
  assert.deepEqual({ ...replies.at(-1), body: status }, { status: 200, body: { billingEnabled: true, plan: "none", active: false, complimentary: false, subscriptionStatus: null, currentPeriodEnd: null, hasCustomer: false, cancelAtPeriodEnd: false } });
  // The offer the subscribe page shows: the trial for a new account, with the renewal terms written out.
  assert.equal(offer.kind, "trial");
  assert.deepEqual([offer.todayCents, offer.recurringCents, offer.trialDays, offer.disclosureVersion], [100, 3900, 7, "2026-10-23"]);
  assert.match(offer.disclosure, /\$1\.00 today for a 7-day trial.*renews automatically.*\$39\.00 per month.*until you cancel.*cancel any time online/);
  assert.ok(Date.parse(offer.firstRenewalAt) > Date.now());
  await billingRoutes(req("GET", "/v1/billing/status"), {}, "/v1/billing/status", json,
    deps(USERS.paid, { "SELECT email": { rows: [{ ...USERS.paid, stripe_customer_id: "cus_1" }] } }));
  assert.equal(replies.at(-1).body.plan, "pro");
  assert.equal(replies.at(-1).body.active, true);
  await assert.rejects(billingRoutes(req("GET", "/v1/billing/status"), {}, "/v1/billing/status", json, deps(null, {})), e => e.status === 401);

  // ?refresh=1 re-reads Stripe right after checkout, before the webhook lands.
  const synced = fakeStripe({ "GET /subscriptions": { data: [{ id: "sub_n", status: "active", created: 1, items: { data: [{ price: { id: "price_pro" }, current_period_end: 1793404800 }] } }] } });
  await billingRoutes(req("GET", "/v1/billing/status?refresh=1"), {}, "/v1/billing/status", json,
    deps(USERS.none, { "SELECT email": { rows: [{ ...USERS.none, stripe_customer_id: "cus_1" }] } }, synced));
  assert.deepEqual(synced.calls, ["GET /subscriptions"]);
  assert.equal(replies.at(-1).body.plan, "pro");
  assert.equal(replies.at(-1).body.currentPeriodEnd, "2026-10-31T00:00:00.000Z");

  // Checkout: a new customer, the configured price, success → billing, cancel → subscribe.
  const posted = [];
  const stripe = fakeStripe({ "POST /customers": { id: "cus_new" }, "POST /checkout/sessions": (path, params) => { posted.push(params); return { url: "https://checkout.stripe.com/c/pay/x" }; } });
  // Without ticking the consent box (or with stale terms) nothing reaches Stripe.
  for (const body of [{}, { consent: false, offer: "trial", disclosureVersion: "2026-10-23" }, { consent: true, offer: "trial", disclosureVersion: "2020-01-01" }, { consent: true, offer: "cheap", disclosureVersion: "2026-10-23" }])
    await assert.rejects(billingRoutes(Object.assign([Buffer.from(JSON.stringify(body))], { method: "POST", url: "/v1/billing/checkout", headers: { origin: "https://insidir.example", "content-type": "application/json" } }), {}, "/v1/billing/checkout", json,
      deps({ ...USERS.none, id: randomUUID() }, {}, stripe)), e => e.status === 400 && /tick the box/.test(e.message), JSON.stringify(body));
  assert.equal(posted.length, 0);
  const consentQuery = fakeQuery({ "SELECT email": { rows: [{ email: USERS.none.email, stripe_customer_id: null, subscription_status: null }] }, "UPDATE users SET stripe_customer_id": { rows: [{ stripe_customer_id: "cus_new" }] }, "INSERT INTO billing_consents": { rows: [{ id: 41 }] } });
  await billingRoutes(checkoutReq(), {}, "/v1/billing/checkout", json, { env: BILLING, currentUser: async () => USERS.none, stripe, query: consentQuery });
  // The consent is recorded (offer, amounts, the exact terms shown) before Stripe is asked, and tied to the checkout.
  const recorded = consentQuery.statements.find(x => x.sql.startsWith("INSERT INTO billing_consents"));
  assert.deepEqual(recorded.params.slice(0, 7), [USERS.none.id, USERS.none.email, "trial", 100, 3900, 7, "2026-10-23"]);
  assert.match(recorded.params[7], /renews automatically/);
  assert.equal(posted[0]["metadata[insidir_consent_id]"], "41");
  assert.deepEqual(replies.at(-1), { status: 200, body: { url: "https://checkout.stripe.com/c/pay/x" } });
  assert.equal(posted[0].success_url, "https://insidir.example/welcome.html?checkout=success", "paying lands on the first-minute setup");
  assert.equal(posted[0]["after_expiration[recovery][enabled]"], undefined, "no recovery link: Insidir sends no reminder");
  assert.ok(Math.abs(Number(posted[0].expires_at) - (Date.now() / 1000 + 3600)) < 60, "the checkout page closes after an hour");
  assert.equal(posted[0].cancel_url, "https://insidir.example/subscribe.html?checkout=cancel");
  assert.equal(posted[0]["line_items[0][price]"], "price_pro");
  assert.equal(posted[0].customer, "cus_new");
  assert.equal(posted[0].mode, "subscription");
  // A first subscription starts with the paid trial: $1 today, 7 days, then the plan's $39 a month.
  assert.equal(posted[0]["subscription_data[trial_period_days]"], "7");
  assert.equal(posted[0]["line_items[1][price_data][unit_amount]"], "100");
  assert.equal(posted[0]["line_items[1][price_data][currency]"], "usd");
  assert.equal(posted[0]["line_items[1][quantity]"], "1");
  assert.equal(posted[0].payment_method_collection, "always", "a card is collected so the plan can renew");
  assert.equal(posted[0]["subscription_data[trial_settings][end_behavior][missing_payment_method]"], "cancel");
  assert.match(posted[0]["custom_text[submit][message]"], /\$1 today for 7 days.*\$39 a month/);

  // One trial per account: an account that has trialled before checks out at the full price.
  // ...and agreeing to the trial is not agreeing to $39 today: a changed offer is refused until the customer agrees again.
  await assert.rejects(billingRoutes(checkoutReq(), {}, "/v1/billing/checkout", json,
    { ...deps({ ...USERS.none, id: randomUUID() }, { "SELECT email": { rows: [{ email: USERS.none.email, stripe_customer_id: null, subscription_status: null, trial_started_at: "2026-09-01T00:00:00Z" }] }, "UPDATE users SET stripe_customer_id": { rows: [{ stripe_customer_id: "cus_new" }] } }, stripe) }),
    e => e.status === 409 && /already used its trial/.test(e.message) && e.offer?.kind === "full");
  assert.equal(posted.length, 1);
  await billingRoutes(checkoutReq(undefined, "full"), {}, "/v1/billing/checkout", json,
    { ...deps({ ...USERS.none, id: randomUUID() }, { "SELECT email": { rows: [{ email: USERS.none.email, stripe_customer_id: null, subscription_status: null, trial_started_at: "2026-09-01T00:00:00Z" }] }, "UPDATE users SET stripe_customer_id": { rows: [{ stripe_customer_id: "cus_new" }] } }, stripe) });
  assert.ok(!("subscription_data[trial_period_days]" in posted[1]), "no second trial");
  assert.ok(!("line_items[1][price_data][unit_amount]" in posted[1]), "no trial fee without a trial");
  // INSIDIR_TRIAL=0 switches the trial off.
  await billingRoutes(checkoutReq(undefined, "full"), {}, "/v1/billing/checkout", json,
    { ...deps({ ...USERS.none, id: randomUUID() }, { "SELECT email": { rows: [{ email: USERS.none.email, stripe_customer_id: null, subscription_status: null }] }, "UPDATE users SET stripe_customer_id": { rows: [{ stripe_customer_id: "cus_new" }] } }, stripe), env: { ...BILLING, INSIDIR_TRIAL: "0" } });
  assert.ok(!("subscription_data[trial_period_days]" in posted[2]), "trial switched off");

  // No Stripe customer yet: the stored status is the only record, and it still guards.
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])
    await assert.rejects(billingRoutes(checkoutReq(), {}, "/v1/billing/checkout", json,
      deps({ ...USERS.paid, id: randomUUID() }, { "SELECT email": { rows: [{ email: "x@y.co", stripe_customer_id: null, subscription_status: status }] } })), e => e.status === 409, status);
  await assert.rejects(billingRoutes(checkoutReq("https://evil.example"), {}, "/v1/billing/checkout", json, deps(USERS.none, {})), e => e.status === 403);
  await assert.rejects(billingRoutes(checkoutReq(), {}, "/v1/billing/checkout", json,
    { ...deps(USERS.none, {}), env: {} }), e => e.status === 503 && /not available/.test(e.message));
});

test("checkout refuses a Stripe price that is not the published $39 a month, and goes ahead when it is", async () => {
  const { priceMatchesOffer, verifyPlanPrice } = await import("../src/billing.mjs");
  const ok = { object: "price", active: true, unit_amount: 3900, currency: "usd", recurring: { interval: "month", interval_count: 1 } };
  assert.equal(priceMatchesOffer(ok), true);
  for (const bad of [{ ...ok, unit_amount: 4900 }, { ...ok, currency: "eur" }, { ...ok, recurring: { interval: "year", interval_count: 1 } }, { ...ok, recurring: { interval: "month", interval_count: 3 } }, { ...ok, active: false }, null])
    assert.equal(priceMatchesOffer(bad), false, JSON.stringify(bad));
  // Unreadable: not a verdict (null), so checkout proceeds and Stripe validates the Price when the session is made.
  assert.equal(await verifyPlanPrice({ get: async () => { throw new Error("down"); } }, "price_unread"), null);
  assert.equal(await verifyPlanPrice({ get: async () => ({ ...ok, unit_amount: 4900 }) }, "price_wrong"), false);
  let reads = 0;
  const counting = { get: async () => { reads++; return ok; } };
  assert.equal(await verifyPlanPrice(counting, "price_right"), true);
  assert.equal(await verifyPlanPrice(counting, "price_right"), true);
  assert.equal(reads, 1, "a confirmed price is remembered");

  // Through the route: a $49 price stops checkout before a session exists; nothing is charged.
  const json = () => true;
  const user = { ...USERS.none, id: randomUUID() };
  const query = fakeQuery({ "SELECT email": { rows: [{ email: user.email, stripe_customer_id: "cus_1", subscription_status: null }] } });
  const posted = [];
  const stripe = { get: async path => path.startsWith("/prices/") ? { ...ok, unit_amount: 4900 } : { object: "list", data: [], has_more: false },
    post: async path => { posted.push(path); return { id: "cs_x", url: "https://checkout.stripe.com/c/pay/x" }; }, del: async () => ({}) };
  await assert.rejects(billingRoutes(checkoutReq(), {}, "/v1/billing/checkout", json, { env: { ...BILLING, INSIDIR_STRIPE_PRICE_ID: "price_wrong_amount" }, currentUser: async () => user, stripe, query }),
    e => e.status === 503 && /does not match the published \$39\.00 a month/.test(e.message));
  assert.ok(!posted.includes("/checkout/sessions"), "no checkout session was created");
});

test("checkout asks Stripe first: a paid checkout whose webhook is pending blocks a second one", async () => {
  const replies = [];
  const json = (res, status, body) => { replies.push({ status, body }); return true; };
  // A fresh account per attempt keeps clear of the per-account checkout rate limit.
  const checkout = (stripe, row, user = { ...USERS.none, id: randomUUID() }, offer = "trial") => {
    const query = fakeQuery({ "SELECT email": { rows: [{ email: user.email, stripe_customer_id: "cus_1", subscription_status: null, ...row }] },
      "UPDATE users SET stripe_customer_id": { rows: [{ stripe_customer_id: "cus_NEW" }] } });
    return { query, run: billingRoutes(checkoutReq(undefined, offer), {}, "/v1/billing/checkout", json, { env: BILLING, currentUser: async () => user, stripe, query }) };
  };

  // Stored status is still null, but Stripe already has a subscription that can bill: 409, no second checkout.
  for (const [status, message] of [["active", /already active/], ["trialing", /already active/], ["past_due", /unpaid invoice/], ["unpaid", /unpaid invoice/],
    ["incomplete", /being confirmed/], ["paused", /paused/]]) {
    const world = stripeWorld({ subs: [plan("sub_A1", "cus_1", status)] });
    const { query, run } = checkout(world);
    await assert.rejects(run, e => e.status === 409 && message.test(e.message), status);
    assert.ok(!world.calls.includes("POST /checkout/sessions"), status);
    const stored = query.statements.find(x => x.sql.startsWith("UPDATE users SET stripe_subscription_id"));
    assert.deepEqual(stored?.params.slice(0, 2), ["sub_A1", status], "the stored status is refreshed from Stripe");
  }

  // Only ended subscriptions (or another product's price): checkout goes ahead, and an earlier open page is expired first.
  const world = stripeWorld({ subs: [plan("sub_old", "cus_1", "canceled"), plan("sub_misc", "cus_1", "active", "price_other")],
    sessions: [{ id: "cs_test_earlier", customer: "cus_1", status: "open" }] });
  const { run } = checkout(world, { subscription_status: "active" }, undefined, "full");
  await run;
  // (The plan's Price is read first as well; its own test is "checkout refuses a Stripe price that is not the published $39 a month".)
  assert.deepEqual(world.calls.filter(c => !c.startsWith("GET /prices/")), ["GET /subscriptions", "GET /checkout/sessions", "POST /checkout/sessions/cs_test_earlier/expire", "POST /checkout/sessions"]);
  assert.equal(world.sessions[0].status, "expired");
  assert.equal(replies.at(-1).status, 200);
  assert.match(replies.at(-1).body.url, /^https:\/\/checkout\.stripe\.com\//);

  // Stripe cannot be read: no checkout is started.
  const down = stripeWorld({ fail: { "GET /subscriptions": stripeError(500) } });
  await assert.rejects(checkout(down).run, e => e.status === 503 && /confirm your subscription/.test(e.message));
  assert.ok(!down.calls.includes("POST /checkout/sessions"));
  const stuck = stripeWorld({ sessions: [{ id: "cs_test_stuck", customer: "cus_1", status: "open" }], fail: { "POST /checkout/sessions/cs_test_stuck/expire": stripeError(500) } });
  await assert.rejects(checkout(stuck).run, e => e.status === 503);
  assert.ok(!stuck.calls.includes("POST /checkout/sessions"));

  // The stored customer does not exist in this Stripe account: start over with a new customer.
  const gone = stripeWorld({ fail: { "GET /subscriptions": () => Object.assign(new Error("No such customer"), { status: 400, stripeStatus: 400, stripeCode: "resource_missing" }) } });
  const fresh = checkout(gone);
  await fresh.run;
  assert.deepEqual(gone.calls.filter(c => !c.startsWith("GET /prices/")), ["GET /subscriptions", "POST /customers", "POST /checkout/sessions"]);
  assert.ok(fresh.query.statements.some(x => x.sql.startsWith("UPDATE users SET stripe_customer_id=NULL")));
  assert.equal(gone.sessions[0].customer, "cus_NEW");

  // Two clicks at once: the second is refused while the first is being prepared.
  let release;
  const slow = stripeWorld();
  const realGet = slow.get;
  const gate1 = new Promise(r => { release = r; });
  slow.get = async (...a) => { await gate1; return realGet(...a); };
  const same = { ...USERS.trial, id: randomUUID() };
  const first = checkout(slow, {}, same).run;
  await new Promise(r => setImmediate(r));
  await assert.rejects(checkout(stripeWorld(), {}, same).run, e => e.status === 409 && /in progress/.test(e.message));
  release();
  await first;
  assert.equal(slow.calls.filter(c => c === "POST /checkout/sessions").length, 1);
});

test("webhook: an Insidir checkout that completes after its account was deleted is cancelled", async () => {
  const secret = BILLING.INSIDIR_STRIPE_WEBHOOK_SECRET;
  const deliver = async (object, { userRows = [], stripe = stripeWorld({ subs: [plan("sub_late", "cus_A1", "active")] }) } = {}) => {
    const raw = JSON.stringify({ id: "evt_" + Math.random().toString(36).slice(2), type: "checkout.session.completed", data: { object } });
    const ts = Math.floor(Date.now() / 1000), sig = createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
    const req = Object.assign([Buffer.from(raw)], { method: "POST", url: "/v1/billing/webhook", headers: { "stripe-signature": `t=${ts},v1=${sig}` } });
    const query = fakeQuery({ "INSERT INTO stripe_events": params => ({ rows: [{ event_id: params[0] }] }), "SELECT 1 FROM users": { rows: userRows } });
    let reply;
    const json = (res, status, body) => { reply = { status, body }; return true; };
    const run = billingRoutes(req, {}, "/v1/billing/webhook", json, { env: BILLING, currentUser: async () => null, stripe, query });
    return { run, stripe, query, reply: () => reply };
  };
  const session = { mode: "subscription", customer: "cus_A1", subscription: "sub_late", client_reference_id: USERS.none.id, metadata: { insidir_user_id: USERS.none.id } };

  let d = await deliver(session);
  await d.run;
  assert.equal(d.reply().status, 200);
  assert.ok(d.stripe.calls.includes("DELETE /subscriptions/sub_late"), "the orphaned subscription stops billing");
  assert.equal(d.stripe.subs[0].status, "canceled");

  d = await deliver(session, { userRows: [{ "?column?": 1 }] });
  await d.run;
  assert.ok(!d.stripe.calls.some(c => c.startsWith("DELETE")), "the account exists: its subscription is kept");

  for (const other of [{ ...session, metadata: {} }, { ...session, client_reference_id: null }, { ...session, metadata: { insidir_user_id: USERS.paid.id } }]) {
    d = await deliver(other);
    await d.run;
    assert.ok(!d.stripe.calls.some(c => c.startsWith("DELETE")), "never touches a checkout Insidir did not create");
    assert.ok(!d.query.statements.some(x => x.sql.startsWith("SELECT 1 FROM users")));
  }

  // Stripe will not cancel it: the event is forgotten so Stripe retries.
  d = await deliver(session, { stripe: stripeWorld({ subs: [plan("sub_late", "cus_A1", "active")], fail: { "DELETE /subscriptions/sub_late": stripeError(500) } }) });
  await assert.rejects(d.run, e => e.status === 503);
  assert.ok(d.query.statements.some(x => x.sql.startsWith("DELETE FROM stripe_events")));
  assert.equal(await cancelOrphanCheckout({ ...session, subscription: "sub_x/../y" }, USERS.none.id, { stripe: stripeWorld(), query: fakeQuery() }), false);
});

/* ---------------------------------------------------------------- end to end through the router */

function send(base, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = request({ host: u.hostname, port: u.port, path, method, headers }, res => {
      let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
async function withApi(env, fn, { loadUser } = {}) {
  const sessions = { paid: USERS.paid, none: USERS.none, owner: USERS.owner, lapsed: USERS.lapsed };
  const loads = [];
  const currentUser = loadUser || (async req => {
    const sid = /insidir_sid=(\w+)/.exec(req.headers.cookie || "")?.[1];
    loads.push(req.url);
    return sessions[sid] || null;
  });
  const server = createApiServer({ env, currentUser, quiet: true });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, loads); } finally { server.close(); }
}
const as = sid => ({ headers: { cookie: "insidir_sid=" + sid } });

test("router: product pages redirect with no-store before any page is served", async () => {
  await withApi({ ...ON, ...COMP }, async (base, loads) => {
    let r = await send(base, "/dashboard.html");
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, "/signin.html?next=%2Fdashboard.html");
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal(r.text, "");
    r = await send(base, "/company?ticker=AAPL", { method: "HEAD" });
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, "/signin.html?next=" + encodeURIComponent("/company?ticker=AAPL"));
    for (const path of ["/dash%62oard.html", "/x%2f..%2fdashboard.html", "/research/", "/Watchlist.html"]) assert.equal((await send(base, path)).status, 302, path);
    r = await send(base, "/research.html?ticker=NVDA", as("none"));
    assert.equal(r.headers.location, "/subscribe.html?next=" + encodeURIComponent("/research.html?ticker=NVDA"));
    assert.equal((await send(base, "/dashboard", as("lapsed"))).headers.location, "/subscribe.html?next=%2Fdashboard");
    for (const sid of ["paid", "owner"]) {
      r = await send(base, "/dashboard.html", as(sid));
      assert.equal(r.status, 200, sid);
      assert.match(r.text, /data-ui-shell data-page="dashboard"/);
    }
    // Account pages: sign-in required, subscription not.
    r = await send(base, "/billing.html");
    assert.equal(r.headers.location, "/signin.html?next=%2Fbilling.html");
    assert.equal((await send(base, "/subscribe.html")).headers.location, "/signin.html?next=%2Fsubscribe.html");
    for (const path of ["/subscribe.html?next=%2Fdashboard.html", "/billing.html?checkout=success", "/account.html"]) {
      r = await send(base, path, as("none"));
      assert.notEqual(r.status, 302, path);
      assert.equal(r.headers.location, undefined, path);
    }
    // Public pages and assets: served to everyone without touching the session.
    loads.length = 0;
    for (const path of ["/", "/pricing.html", "/signin.html", "/signup", "/terms.html", "/assets/css/v13-halftone.css", "/account-deleted.html"]) {
      r = await send(base, path);
      assert.notEqual(r.status, 302, path);
      assert.equal(r.headers.location, undefined, path);
    }
    assert.deepEqual(loads, [], "public pages never load the session");
  });
});

test("router: product API answers 401 signed out and 402 without a subscription", async () => {
  await withApi(ON, async (base, loads) => {
    let r = await send(base, "/v1/filings?limit=5");
    assert.equal(r.status, 401);
    assert.deepEqual(JSON.parse(r.text), { error: "Sign in required", signin: "/signin.html" });
    assert.equal(r.headers["cache-control"], "no-store");
    r = await send(base, "/v1/intelligence?ticker=AAPL", as("none"));
    assert.equal(r.status, 402);
    assert.deepEqual(JSON.parse(r.text), { error: "An active Insidir subscription is required", subscribe: "/subscribe.html" });
    for (const path of ["/v1/transactions", "/v1/companies", "/v1/clusters", "/v1/insiders", "/v1/status", "/v1/search?q=nv", "/v1/market/chart?ticker=AAPL",
      "/v1/company/profile?ticker=AAPL", "/v1/company/news?ticker=AAPL", "/v1/me/watchlist", "/v1/me/research-decisions", "/v1/me/manual-holdings",
      "/v1/me/people", "/v1/me/people/updates", "/v1/me/alerts", "/v1/me/brokerage/status", "/v1/filings/000123456726000042"]) {
      assert.equal((await send(base, path)).status, 401, path);
      assert.equal((await send(base, path, as("lapsed"))).status, 402, path);
    }
    // Writes are gated before the origin check, so a signed-out POST never reaches a handler.
    assert.equal((await send(base, "/v1/me/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: '{"ticker":"AAPL"}' })).status, 401);
    assert.equal((await send(base, "/v1/me/watchlist", { method: "POST", headers: { "content-type": "application/json", cookie: "insidir_sid=lapsed" }, body: '{"ticker":"AAPL"}' })).status, 402);
    // Deleting your own data passes the paywall for any signed-in account (the handler then checks the Origin).
    assert.equal((await send(base, "/v1/me/watchlist/AAPL", { method: "DELETE" })).status, 401);
    for (const path of ["/v1/me/watchlist/AAPL", "/v1/me/brokerage"]) {
      r = await send(base, path, { method: "DELETE", ...as("lapsed") });
      assert.equal(r.status, 403, path);
      assert.equal(JSON.parse(r.text).error, "Untrusted Origin", path);
    }
    // With access the request reaches the handler (an empty search needs neither SEC nor a database).
    r = await send(base, "/v1/search?q=", as("paid"));
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.text), { items: [] });
    // The OAuth callback is a browser navigation: it redirects like a page.
    r = await send(base, "/v1/me/brokerage/callback?code=a&state=b");
    assert.deepEqual([r.status, r.headers.location], [302, "/signin.html?next=%2Fportfolio.html"]);
    // Open endpoints work signed out.
    assert.equal((await send(base, "/v1")).status, 200);
    assert.equal((await send(base, "/v1/sources")).status, 200);
    loads.length = 0;
    assert.equal((await send(base, "/v1/me")).status, 401);
    assert.equal(loads.length, 1, "GET /v1/me loads the session once (the gate does not)");
  });
});

test("router: the personnel file (person.html and GET /v1/people/<cik>) is behind the paywall end to end", async () => {
  assert.equal(classifyPage("/person.html"), "product");
  assert.equal(classifyPage("/Person"), "product");
  for (const method of ["GET", "HEAD", "POST", "DELETE"]) assert.equal(classifyApi("/v1/people/1214156", method), "product", method);
  await withApi(ON, async (base, loads) => {
    let r = await send(base, "/person.html?cik=1214156");
    assert.deepEqual([r.status, r.headers.location, r.headers["cache-control"]], [302, "/signin.html?next=%2Fperson.html%3Fcik%3D1214156", "no-store"]);
    r = await send(base, "/person.html?cik=1214156", as("lapsed"));
    assert.equal(r.headers.location, "/subscribe.html?next=%2Fperson.html%3Fcik%3D1214156");
    r = await send(base, "/person.html?cik=1214156", as("paid"));
    assert.equal(r.status, 200);
    assert.match(r.text, /<title>Insider — Insidir<\/title>/);
    assert.match(r.text, /data-ui-shell data-page="people"/); assert.match(r.text, /assets\/js\/person-app\.js/);
    assert.match(r.headers["cache-control"], /^private\b/);
    assert.match(r.headers.vary, /\bCookie\b/);
    assert.equal((await send(base, "/v1/people/1214156")).status, 401);
    assert.equal((await send(base, "/v1/people/1214156", as("lapsed"))).status, 402);
    // Past the paywall the route is served by src/person-profile.mjs (no database in this test: 503),
    // with one session lookup per request: the handler reuses the gate's.
    loads.length = 0;
    r = await send(base, "/v1/people/1214156", as("paid"));
    assert.equal(r.status, 503);
    assert.equal(loads.length, 1);
    assert.deepEqual([(await send(base, "/v1/people/abc", as("paid"))).status, (await send(base, "/v1/people/1214156", { method: "DELETE", ...as("paid") })).status], [400, 405]);
  });
  // With the paywall off (local development) the profile still needs a sign-in.
  await withApi(OFF, async base => {
    const r = await send(base, "/v1/people/1214156");
    assert.deepEqual([r.status, JSON.parse(r.text)], [401, { error: "Sign in required" }]);
  });
});

test("router: GET /v1/me returns the user and the access object, never the raw account row", async () => {
  await withApi({ ...BILLING, ...COMP }, async base => {
    let r = await send(base, "/v1/me", as("paid"));
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.text), { user: { id: USERS.paid.id, email: USERS.paid.email },
      access: { active: true, plan: "pro", status: "active", billingEnabled: true, complimentary: false, emailVerified: false, currentPeriodEnd: "2026-11-14T00:00:00.000Z" } });
    r = await send(base, "/v1/me", as("none"));
    assert.deepEqual(JSON.parse(r.text).access, { active: false, plan: "none", status: null, billingEnabled: true, complimentary: false, emailVerified: false, currentPeriodEnd: null });
    r = await send(base, "/v1/me", as("owner"));
    assert.deepEqual(JSON.parse(r.text).access, { active: true, plan: "none", status: null, billingEnabled: true, complimentary: true, emailVerified: false, currentPeriodEnd: null });
  });
});

test("router: INSIDIR_PAYWALL=0 serves every page and lets product calls through", async () => {
  await withApi(OFF, async base => {
    for (const path of ["/dashboard.html", "/research.html", "/account.html"]) assert.equal((await send(base, path)).status, 200, path);
    assert.equal((await send(base, "/v1/search?q=")).status, 200);
    assert.equal(JSON.parse((await send(base, "/v1/me", as("none"))).text).access.active, true);
  });
});

test("cache headers: gated responses are private and vary by Cookie; public ones are unchanged", () => {
  assert.equal(privateCacheControl("public, max-age=300"), "private, max-age=300");
  assert.equal(privateCacheControl("Public, max-age=3600, s-maxage=600, proxy-revalidate"), "private, max-age=3600");
  assert.equal(privateCacheControl("no-cache"), "private, no-cache");
  assert.equal(privateCacheControl("private, max-age=5"), "private, max-age=5");
  assert.equal(privateCacheControl("no-store"), "no-store");
  assert.equal(privateCacheControl(undefined), "no-store");
  assert.equal(privateCacheControl(["public", "max-age=30"]), "private, max-age=30");
  assert.equal(mergeVary("Origin", "Accept-Encoding", "Cookie"), "Origin, Accept-Encoding, Cookie");
  assert.equal(mergeVary(undefined, "cookie, Origin", "Cookie"), "cookie, Origin");
  assert.equal(mergeVary(undefined, undefined, "Cookie"), "Cookie");
});

test("router: no gated 200 carries a public cache header", async () => {
  // Stand in for the delayed-price provider so /v1/market/chart answers 200 without the network.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (!String(url).startsWith("https://query1.finance.yahoo.com/")) throw new Error("unexpected network call " + url);
    const now = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: "ZZPW", currency: "USD", regularMarketPrice: 12.5, previousClose: 12 },
      timestamp: [now - 172800, now - 86400], indicators: { quote: [{ close: [12, 12.5] }] } }] } }), { status: 200 });
  };
  try {
    await withApi(ON, async base => {
      const gated = [["/v1/market/chart?ticker=ZZPW&range=1Y", "paid"], ["/v1/market/chart?ticker=ZZPW&range=1D", "paid"], ["/v1/search?q=", "paid"],
        ["/dashboard.html", "paid"], ["/research?ticker=AAPL", "paid"], ["/subscribe.html", "none"], ["/billing.html", "none"], ["/account.html", "lapsed"]];
      for (const [path, sid] of gated) {
        const r = await send(base, path, as(sid));
        assert.equal(r.status, 200, path);
        assert.doesNotMatch(r.headers["cache-control"], /public/i, path);
        assert.match(r.headers["cache-control"], /^(private\b|no-store$)/, path);
        assert.match(r.headers.vary || "", /\bCookie\b/, path);
      }
      let r = await send(base, "/v1/market/chart?ticker=ZZPW&range=1Y", as("paid"));
      assert.equal(r.headers["cache-control"], "private, max-age=120");
      r = await send(base, "/dashboard.html", { headers: { cookie: "insidir_sid=paid", "accept-encoding": "gzip", origin: "https://elsewhere.example" } });
      assert.equal(r.headers["cache-control"], "private, no-cache");
      assert.match(r.headers.vary, /Accept-Encoding/);
      // Public pages and assets keep their normal (shareable) caching.
      assert.equal((await send(base, "/pricing.html")).headers["cache-control"], "no-cache");
      assert.match((await send(base, "/assets/css/v13-halftone.css")).headers["cache-control"], /^public, max-age=/);
    });
  } finally { globalThis.fetch = realFetch; }
});

test("router: when the session cannot be checked, pages get a readable 503 and stay closed", async () => {
  const realError = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a.join(" "));
  try {
    await withApi(ON, async base => {
      let r = await send(base, "/company.html?ticker=AAPL", as("paid"));
      assert.equal(r.status, 503);
      assert.match(r.headers["content-type"], /^text\/html/);
      assert.equal(r.headers["cache-control"], "no-store");
      assert.equal(r.headers["retry-after"], "30");
      assert.match(r.headers["content-security-policy"], /default-src 'self'/);
      assert.match(r.text, /<title>Temporarily unavailable/);
      assert.match(r.text, /href="\/company\.html\?ticker=AAPL">Try again/);
      assert.match(r.text, /<body class="ui">/, "the new design (ui.css)");
      assert.match(r.text, /Research, not investment advice/);
      assert.doesNotMatch(r.text, /v13-|halftone/, "no old-design assets");
      assert.doesNotMatch(r.text, /id="v3-trades"|id="v3-filings"|data-greeting/, "none of the product page is served");
      r = await send(base, "/account", { method: "HEAD", ...as("none") });
      assert.deepEqual([r.status, r.text], [503, ""]);
      r = await send(base, "/v1/filings", as("paid"));
      assert.equal(r.status, 503);
      assert.match(r.headers["content-type"], /application\/json/);
      assert.match(JSON.parse(r.text).error, /could not check your account/);
      // Public pages never need the session, so they still work.
      assert.equal((await send(base, "/pricing.html")).status, 200);
      assert.equal((await send(base, "/v1/sources")).status, 200);
    }, { loadUser: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5432"); } });
    assert.ok(errors.some(e => /Paywall check failed/.test(e) && /ECONNREFUSED/.test(e)), "the failure is logged for the operator");
  } finally { console.error = realError; }
  // The retry link only ever points at a known page, escaped for HTML.
  const page = unavailablePage(new URL("/company.html?ticker=A'B&x=<y>", "http://localhost"));
  assert.match(page, /href="\/company\.html\?ticker=A%27B&amp;x=%3Cy%3E">Try again/);
  assert.match(unavailablePage(new URL("/x%2f..%2fdashboard.html", "http://localhost")), /href="\/dashboard\.html">Try again/);
  assert.match(unavailablePage(new URL("/nope", "http://localhost")), /href="\/">Try again/);
});

test("router: prepared images are served signed out with no session lookup; the media batch stays behind the paywall", async () => {
  const { putMedia } = await import("../src/media-store.mjs");
  const bytes = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const saved = await putMedia({ bytes, type: "png", width: 1, height: 1 });
  await withApi(ON, async (base, loads) => {
    loads.length = 0;
    let r = await send(base, saved.url);
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/png");
    assert.equal(r.headers["cache-control"], "public, max-age=86400", "a day, so a takedown reaches caches");
    assert.equal(r.headers.etag, '"' + saved.sha + '"');
    assert.equal(r.headers.vary, undefined, "not varied by Cookie: any cache may keep it");
    r = await send(base, saved.url, { method: "HEAD", ...as("lapsed") });
    assert.equal(r.status, 200);
    assert.equal((await send(base, "/v1/media/" + "f".repeat(64) + ".webp")).status, 404, "unknown content address");
    assert.equal(loads.length, 0, "no session lookup for an image");
    // The batch that names images is product data like the rest of the API.
    assert.equal((await send(base, "/v1/media?tickers=AAPL")).status, 401);
    assert.equal((await send(base, "/v1/media?tickers=AAPL", as("lapsed"))).status, 402);
    r = await send(base, "/v1/media?tickers=bad!", as("paid"));
    assert.equal(r.status, 400, "a member reaches the handler, which validates before any upstream request");
    assert.equal(r.headers["cache-control"], "no-store");
  });
});

test("paid trial: a returning customer whose Stripe history has the plan checks out at the full price", async () => {
  const json = () => true;
  const posted = [];
  const ended = { id: "sub_old", status: "canceled", created: 1, items: { data: [{ price: { id: "price_pro" } }] } };
  const stripe = fakeStripe({ "GET /subscriptions": { data: [ended] }, "GET /checkout/sessions": { data: [] },
    "POST /checkout/sessions": (path, params) => { posted.push(params); return { url: "https://checkout.stripe.com/c/pay/y" }; } });
  const user = { ...USERS.none, id: randomUUID() };
  const query = fakeQuery({ "SELECT email": { rows: [{ email: user.email, stripe_customer_id: "cus_1", subscription_status: "canceled", trial_started_at: null }] } });
  await billingRoutes(checkoutReq(undefined, "full"), {}, "/v1/billing/checkout", json,
    { env: BILLING, currentUser: async () => user, stripe, query });
  assert.equal(posted.length, 1);
  assert.ok(!("subscription_data[trial_period_days]" in posted[0]), "no second trial for a past subscriber");
  // A customer whose only subscriptions are for another price still gets the trial.
  const other = fakeStripe({ "GET /subscriptions": { data: [{ ...ended, items: { data: [{ price: { id: "price_other" } }] } }] }, "GET /checkout/sessions": { data: [] },
    "POST /checkout/sessions": (path, params) => { posted.push(params); return { url: "https://checkout.stripe.com/c/pay/z" }; } });
  await billingRoutes(checkoutReq(undefined, "trial"), {}, "/v1/billing/checkout", json,
    { env: BILLING, currentUser: async () => ({ ...user, id: randomUUID() }), stripe: other, query });
  assert.equal(posted[1]["subscription_data[trial_period_days]"], "7");
});
