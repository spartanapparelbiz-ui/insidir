import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { recoveryParams, recoveryUrl, recoveryEmail, queueCheckoutRecovery, CHECKOUT_OPEN_SECONDS } from "../src/checkout-recovery.mjs";
import { billingRoutes, pausedNow, storeSubscriptions, PAUSE_DAYS } from "../src/billing.mjs";
import { cleanClientEvent, funnelReport, REPORT_SQL, REF_SQL, VARIANT_SQL } from "../src/funnel.mjs";
import { classifyPage } from "../src/paywall.mjs";

/* Abandoned checkout (src/checkout-recovery.mjs), the one-month pause (billing.mjs) and the funnel by source. */
const BILLING = { INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_x", INSIDIR_STRIPE_PRICE_ID: "price_pro",
  INSIDIR_STRIPE_WEBHOOK_SECRET: "whsec_x", INSIDIR_PUBLIC_URL: "https://insidir.example", INSIDIR_EMAIL_FROM: "Insidir <hello@insidir.example>" };
const USER = { id: "44444444-4444-4444-8444-444444444444", email: "new@example.com" };
function fakeQuery(rows = {}) {
  const fn = async (sql, params) => {
    const text = sql.replace(/\s+/g, " ").trim();
    fn.statements.push({ sql: text, params });
    for (const [prefix, result] of Object.entries(rows)) if (text.startsWith(prefix)) return typeof result === "function" ? result(params) : result;
    return { rows: [], rowCount: 0 };
  };
  fn.statements = [];
  return fn;
}
function fakeStripe(handlers = {}) {
  const calls = [];
  const call = method => async (path, params) => { calls.push({ call: method + " " + path, params }); const h = handlers[method + " " + path]; return typeof h === "function" ? h(path, params) : (h ?? {}); };
  return { calls, get: call("GET"), post: call("POST") };
}
const outbox = q => q.statements.filter(s => s.sql.startsWith("INSERT INTO email_outbox"));

test("checkout pages close after an hour and can be recovered; the link is Stripe's or /start, nothing else", () => {
  assert.deepEqual(recoveryParams(1_800_000_000_000), { expires_at: String(1_800_000_000 + 3600), "after_expiration[recovery][enabled]": "true" });
  assert.equal(CHECKOUT_OPEN_SECONDS, 3600);
  assert.equal(recoveryUrl({ after_expiration: { recovery: { url: "https://checkout.stripe.com/c/pay/cs_x" } } }), "https://checkout.stripe.com/c/pay/cs_x");
  for (const url of ["http://checkout.stripe.com/x", "https://evil.example/x", "javascript:alert(1)", ""]) assert.equal(recoveryUrl({ after_expiration: { recovery: { url } } }), null, url);
  const m = recoveryEmail({ url: "https://insidir.example/start", days: 7 });
  assert.equal(m.subject, "Your $1 Insidir trial is one step away");
  assert.ok(m.paragraphs.includes("Your Insidir checkout closed before it was paid, so nothing was charged."));
  assert.ok(m.paragraphs.includes("Pick up where you left off: $1 for 7 days, then $39 a month. Cancel online anytime."));
  assert.ok(m.paragraphs.includes("This is the only reminder we'll send about it."));
  assert.ok(m.paragraphs.includes("Research, not investment advice."));
});

test("the reminder: one per account, never to a subscriber, optional mail", async () => {
  const session = { id: "cs_1", mode: "subscription", client_reference_id: USER.id, after_expiration: { recovery: { url: "https://checkout.stripe.com/c/pay/cs_2" } } };
  const q = fakeQuery({ "SELECT id,email,subscription_status": { rows: [{ ...USER, subscription_status: null }] }, "INSERT INTO email_outbox": { rows: [{ id: 1 }] } });
  assert.deepEqual(await queueCheckoutRecovery(q, session, { env: BILLING }), { queued: true, reason: null });
  const [mail] = outbox(q);
  assert.equal(mail.params[3], "digest", "unsubscribe stops it");
  assert.equal(mail.params[5], "checkout-recovery:" + USER.id, "once per account, ever");
  assert.match(mail.params[7], /https:\/\/checkout\.stripe\.com\/c\/pay\/cs_2/);
  for (const status of ["trialing", "active", "past_due", "paused"]) {
    const paying = fakeQuery({ "SELECT id,email,subscription_status": { rows: [{ ...USER, subscription_status: status }] } });
    assert.deepEqual(await queueCheckoutRecovery(paying, session, { env: BILLING }), { queued: false, reason: "subscribed" }, status);
    assert.equal(outbox(paying).length, 0);
  }
  const again = fakeQuery({ "SELECT id,email,subscription_status": { rows: [{ ...USER, subscription_status: "inactive" }] }, "INSERT INTO email_outbox": { rows: [] } });
  assert.equal((await queueCheckoutRecovery(again, { ...session, after_expiration: null }, { env: BILLING })).reason, "already sent");
  assert.match(outbox(again)[0].params[7], /https:\/\/insidir\.example\/start/, "no Stripe link: back to /start");
  assert.equal((await queueCheckoutRecovery(fakeQuery(), { ...session, client_reference_id: "nope" }, { env: BILLING })).reason, "no account");
});

test("webhook: a checkout that ran out its hour sends the reminder; one Insidir closed for a newer checkout does not", async () => {
  const send = async (session, created) => {
    const raw = JSON.stringify({ id: "evt_" + session.id, type: "checkout.session.expired", created, data: { object: session } });
    const t = Math.floor(Date.now() / 1000), sig = createHmac("sha256", "whsec_x").update(t + "." + raw).digest("hex");
    const q = fakeQuery({ "INSERT INTO stripe_events": { rows: [{ event_id: "x" }] }, "SELECT id,email,subscription_status": { rows: [{ ...USER, subscription_status: null }] }, "INSERT INTO email_outbox": { rows: [{ id: 1 }] } });
    const req = Object.assign([Buffer.from(raw)], { method: "POST", url: "/v1/billing/webhook", headers: { "stripe-signature": `t=${t},v1=${sig}` } });
    await billingRoutes(req, {}, "/v1/billing/webhook", () => true, { env: BILLING, query: q, stripe: fakeStripe() });
    return outbox(q).length;
  };
  const opened = 1_800_000_000;
  assert.equal(await send({ id: "cs_a", mode: "subscription", client_reference_id: USER.id, expires_at: opened + 3600 }, opened + 3601), 1);
  assert.equal(await send({ id: "cs_b", mode: "subscription", client_reference_id: USER.id, expires_at: opened + 3600 }, opened + 600), 0, "expired early by Insidir");
});

test("pause: access stops only after the paid period ends, and returns when billing resumes", () => {
  const now = Date.parse("2026-11-05T00:00:00Z") / 1000;
  const sub = (from, until, status = "active") => ({ status, metadata: { insidir_pause_from: String(from) }, pause_collection: { behavior: "void", resumes_at: until } });
  assert.equal(pausedNow(sub(now + 86400, now + 31 * 86400), now * 1000), false, "still inside the period already paid for");
  assert.equal(pausedNow(sub(now - 86400, now + 29 * 86400), now * 1000), true, "paused");
  assert.equal(pausedNow(sub(now - 31 * 86400, now - 86400), now * 1000), false, "resumed");
  assert.equal(pausedNow({ status: "active", pause_collection: null }, now * 1000), false);
  assert.equal(pausedNow(sub(now - 86400, now + 86400, "canceled"), now * 1000), false, "an ended subscription is its own status");
});

test("pause route: void collection for a month from the period end, once per subscription; resume clears it", async () => {
  const periodEnd = Math.floor(Date.parse("2026-10-30T00:00:00Z") / 1000);
  const live = { id: "sub_1", status: "trialing", created: 1, metadata: {}, items: { data: [{ price: { id: "price_pro" }, current_period_end: periodEnd }] } };
  const stripe = fakeStripe({ "GET /subscriptions": { data: [live] } });
  const q = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: "cus_1" }] } });
  const replies = [];
  const req = path => Object.assign([Buffer.from("{}")], { method: "POST", url: path, headers: { origin: "https://insidir.example" } });
  const deps = { env: BILLING, query: q, stripe, currentUser: async () => USER };
  await billingRoutes(req("/v1/billing/pause"), {}, "/v1/billing/pause", (res, status, body) => replies.push({ status, body }), deps);
  const update = stripe.calls.find(c => c.call === "POST /subscriptions/sub_1").params;
  assert.equal(update["pause_collection[behavior]"], "void", "the skipped invoice is voided, never charged later");
  assert.equal(update["metadata[insidir_pause_from]"], String(periodEnd));
  assert.equal(Number(update["pause_collection[resumes_at]"]), periodEnd + PAUSE_DAYS * 86400);
  assert.equal(replies[0].status, 200);
  assert.match(replies[0].body.message, /You won't be charged on Oct 30, 2026\. Insidir pauses from Oct 30, 2026 and billing resumes at \$39 a month on Nov 29, 2026\. You can still cancel anytime\./);

  const pausedOnce = fakeStripe({ "GET /subscriptions": { data: [{ ...live, metadata: { insidir_paused_once: "1" } }] } });
  await assert.rejects(billingRoutes(req("/v1/billing/pause"), {}, "/v1/billing/pause", () => true, { ...deps, stripe: pausedOnce }), e => e.status === 409 && /already been paused once/.test(e.message));
  const cancelled = fakeStripe({ "GET /subscriptions": { data: [{ ...live, cancel_at_period_end: true }] } });
  await assert.rejects(billingRoutes(req("/v1/billing/pause"), {}, "/v1/billing/pause", () => true, { ...deps, stripe: cancelled }), e => e.status === 409);
  await assert.rejects(billingRoutes(Object.assign([Buffer.from("{}")], { method: "POST", url: "/", headers: { origin: "https://evil.example" } }), {}, "/v1/billing/pause", () => true, deps), e => e.status === 403);

  const paused = fakeStripe({ "GET /subscriptions": { data: [{ ...live, status: "active", pause_collection: { behavior: "void", resumes_at: periodEnd + 30 * 86400 } }] } });
  await billingRoutes(req("/v1/billing/resume"), {}, "/v1/billing/resume", (res, status, body) => replies.push({ status, body }), { ...deps, stripe: paused });
  assert.deepEqual(paused.calls.find(c => c.call === "POST /subscriptions/sub_1").params, { pause_collection: "" });
  assert.equal(replies.at(-1).body.resumed, true);
});

test("a paused subscription is stored as paused, so it grants no access and sends no alerts", async () => {
  const q = fakeQuery();
  const from = Math.floor(Date.now() / 1000) - 86400;
  await storeSubscriptions("cus_1", [{ id: "sub_1", status: "active", created: 1, metadata: { insidir_pause_from: String(from) }, pause_collection: { behavior: "void", resumes_at: from + 30 * 86400 },
    items: { data: [{ price: { id: "price_pro" }, current_period_end: from + 30 * 86400 }] } }], { query: q, priceId: "price_pro" });
  assert.equal(q.statements.find(s => s.sql.startsWith("UPDATE users SET stripe_subscription_id")).params[1], "paused");
});

test("funnel: stock searches and stock pages are counted without the symbol; the report splits by ?ref=", async () => {
  assert.equal(cleanClientEvent({ event: "ticker_searched", visitor: "a".repeat(32), label: "hero" }).kind, "click");
  assert.equal(cleanClientEvent({ event: "ticker_viewed", visitor: "a".repeat(32), path: "/stock" }).path, "/stock");
  const run = async sql => sql === REPORT_SQL ? { rows: [{ landing: 100, searched: 40, stock_page: 55, cta: 20 }] }
    : sql === REF_SQL ? { rows: [{ ref: "insidirfinance", visits: 60, signups: 9, trials: 6, paid: 3 }, { ref: "(none)", visits: 40, signups: 2, trials: 0, paid: 0 }] }
    : sql === VARIANT_SQL ? { rows: [] } : { rows: [] };
  const r = await funnelReport(run, { days: 30 });
  assert.deepEqual(r.stages.slice(0, 3).map(s => [s.key, s.count]), [["landing", 100], ["searched", 40], ["stock_page", 55]]);
  assert.equal(r.stages[1].rate, 0.4);
  assert.deepEqual(r.sources[0], { ref: "insidirfinance", visits: 60, signups: 9, trials: 6, paid: 3, trialRate: 0.1, paidRate: 0.5 });
  assert.equal(r.sources[1].paidRate, null, "no rate over zero trials");
  assert.equal(classifyPage("/welcome.html"), "account", "the first-minute page needs a sign-in, not yet an active subscription");
});
