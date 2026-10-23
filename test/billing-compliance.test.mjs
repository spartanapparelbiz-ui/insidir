import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { billingRoutes, currentOffer, trialUsedFromRow, DISCLOSURE_VERSION, PLAN_CENTS } from "../src/billing.mjs";

/* Subscription compliance: the offer and its renewal terms, online cancellation that really stops the charge,
 * and refunds, chargebacks, failed payments and trial endings recorded (with creator commissions sent back to
 * review). Stripe and PostgreSQL are faked. */
const BILLING = { INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_x", INSIDIR_STRIPE_PRICE_ID: "price_pro",
  INSIDIR_STRIPE_WEBHOOK_SECRET: "whsec_test", INSIDIR_PUBLIC_URL: "https://insidir.example" };
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
  const call = method => async (path, params) => {
    calls.push({ call: method + " " + path, params });
    const h = handlers[method + " " + path] ?? handlers[method];
    if (h instanceof Error) throw h;
    return typeof h === "function" ? h(path, params) : (h ?? {});
  };
  return { calls, get: call("GET"), post: call("POST"), del: call("DELETE") };
}
const sub = (id, status, extra = {}) => ({ id, status, created: 1, items: { data: [{ price: { id: "price_pro" }, current_period_end: 1793404800 }] }, ...extra });
const user = () => ({ id: randomUUID(), email: "member@example.com", subscription_status: "trialing" });
const post = (url, origin = "https://insidir.example") => Object.assign([], { method: "POST", url, headers: { origin } });

test("the offer: the trial for new accounts, the full price after a trial or a past subscription, terms written out", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const trial = currentOffer({ trialUsed: false, trial: { enabled: true, days: 7, feeCents: 100 }, now });
  assert.deepEqual([trial.kind, trial.todayCents, trial.recurringCents, trial.trialDays, trial.disclosureVersion], ["trial", 100, PLAN_CENTS, 7, DISCLOSURE_VERSION]);
  assert.equal(trial.firstRenewalAt, "2026-10-25T12:00:00.000Z");
  assert.match(trial.disclosure, /^You agree to pay \$1\.00 today for a 7-day trial of Insidir Pro\. Unless you cancel before your trial ends \(on or about October 25, 2026\), your subscription renews automatically and your payment method is charged \$39\.00 per month/);
  assert.match(trial.disclosure, /You can cancel any time online from Billing/);
  const full = currentOffer({ trialUsed: true, trial: { enabled: true, days: 3, feeCents: 100 }, now });
  assert.deepEqual([full.kind, full.todayCents, full.trialDays], ["full", 3900, 0]);
  assert.match(full.disclosure, /\$39\.00 today for one month.*renews automatically.*every month \(next on or about November 17, 2026\)/);
  assert.equal(currentOffer({ trialUsed: false, trial: { enabled: false, days: 3, feeCents: 100 }, now }).kind, "full", "trial switched off");
  for (const [row, used] of [[{}, false], [{ subscription_status: "inactive" }, false], [{ trial_started_at: new Date() }, true], [{ stripe_subscription_id: "sub_1" }, true], [{ subscription_status: "canceled" }, true]])
    assert.equal(trialUsedFromRow(row), used, JSON.stringify(row));
});

test("cancel online: one request stops renewal at the end of the paid period (a trial ends without the $39 charge)", async () => {
  const replies = [];
  const json = (res, status, body) => { replies.push({ status, body }); return true; };
  const live = sub("sub_live", "trialing");
  let canceled = false;
  const stripe = fakeStripe({
    "GET /subscriptions": () => ({ data: [canceled ? { ...live, cancel_at_period_end: true } : live, sub("sub_old", "canceled")] }),
    "POST /subscriptions/sub_live": () => { canceled = true; return { ...live, cancel_at_period_end: true }; }
  });
  const member = user();
  const query = fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: "cus_A1" }] } });
  await billingRoutes(post("/v1/billing/cancel"), {}, "/v1/billing/cancel", json, { env: BILLING, currentUser: async () => member, stripe, query });
  const update = stripe.calls.find(c => c.call === "POST /subscriptions/sub_live");
  assert.equal(update.params.cancel_at_period_end, "true", "cancels at period end, not immediately (paid-for access is kept)");
  assert.ok(!stripe.calls.some(c => c.call === "POST /subscriptions/sub_old"), "ended subscriptions are left alone");
  assert.equal(replies.at(-1).status, 200);
  assert.equal(replies.at(-1).body.canceled, true);
  assert.equal(replies.at(-1).body.accessUntil, "2026-10-31T00:00:00.000Z");
  assert.match(replies.at(-1).body.message, /will not be charged again/);
  // The stored state now says the subscription will not renew, and the cancellation is on record.
  const stored = query.statements.find(x => x.sql.startsWith("UPDATE users SET stripe_subscription_id"));
  assert.equal(stored.params[4], true, "cancel_at_period_end stored");
  const logged = query.statements.find(x => x.sql.startsWith("INSERT INTO billing_events"));
  assert.equal(logged.params[2], "cancel_requested");

  // Cancelling again is harmless; with nothing that can bill, nothing is sent to Stripe.
  const again = fakeStripe({ "GET /subscriptions": { data: [sub("sub_old", "canceled")] } });
  await billingRoutes(post("/v1/billing/cancel"), {}, "/v1/billing/cancel", json, { env: BILLING, currentUser: async () => user(), stripe: again,
    query: fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: "cus_A1" }] } }) });
  assert.deepEqual(replies.at(-1).body, { canceled: false, alreadyCanceled: true });
  assert.ok(!again.calls.some(c => c.call.startsWith("POST")));

  // Signed out, another site, or no subscription: refused.
  await assert.rejects(billingRoutes(post("/v1/billing/cancel"), {}, "/v1/billing/cancel", json, { env: BILLING, currentUser: async () => null, stripe, query }), e => e.status === 401);
  await assert.rejects(billingRoutes(post("/v1/billing/cancel", "https://evil.example"), {}, "/v1/billing/cancel", json, { env: BILLING, currentUser: async () => member, stripe, query }), e => e.status === 403);
  await assert.rejects(billingRoutes(post("/v1/billing/cancel"), {}, "/v1/billing/cancel", json, { env: BILLING, currentUser: async () => user(), stripe, query: fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: null }] } }) }), e => e.status === 404);
  // Stripe failing is reported, not hidden as a success.
  const down = fakeStripe({ "GET /subscriptions": { data: [sub("sub_live", "active")] }, "POST /subscriptions/sub_live": Object.assign(new Error("Stripe is temporarily unavailable."), { status: 503 }) });
  await assert.rejects(billingRoutes(post("/v1/billing/cancel"), {}, "/v1/billing/cancel", json, { env: BILLING, currentUser: async () => user(), stripe: down,
    query: fakeQuery({ "SELECT stripe_customer_id": { rows: [{ stripe_customer_id: "cus_A1" }] } }) }), e => e.status === 503);
});

function deliver(type, object, { stripe = fakeStripe(), query = fakeQuery({ "INSERT INTO stripe_events": p => ({ rows: [{ event_id: p[0] }] }) }) } = {}) {
  const raw = JSON.stringify({ id: "evt_" + randomUUID().replace(/-/g, ""), type, data: { object } });
  const ts = Math.floor(Date.now() / 1000), sig = createHmac("sha256", BILLING.INSIDIR_STRIPE_WEBHOOK_SECRET).update(ts + "." + raw).digest("hex");
  const req = Object.assign([Buffer.from(raw)], { method: "POST", url: "/v1/billing/webhook", headers: { "stripe-signature": `t=${ts},v1=${sig}` } });
  let reply;
  return billingRoutes(req, {}, "/v1/billing/webhook", (res, status, body) => { reply = { status, body }; return true; }, { env: BILLING, currentUser: async () => null, stripe, query })
    .then(() => ({ reply, query, stripe }));
}

test("refunds and chargebacks are recorded and send the customer's creator commission back to manual review", async () => {
  const refund = await deliver("charge.refunded", { id: "ch_1", customer: "cus_R1", amount_refunded: 3900 });
  assert.equal(refund.reply.status, 200);
  const review = refund.query.statements.find(x => x.sql.startsWith("UPDATE creator_commissions SET status='needs_review'"));
  assert.deepEqual(review.params, ["cus_R1"]);
  assert.match(review.sql, /status IN \('pending','approved'\)/, "paid or void commissions are not reopened");
  assert.equal(refund.query.statements.find(x => x.sql.startsWith("INSERT INTO billing_events")).params[2], "refund");
  // A dispute names the charge, not the customer: the customer is read from Stripe.
  const dispute = await deliver("charge.dispute.created", { id: "dp_1", charge: "ch_9", amount: 3900, reason: "fraudulent" },
    { stripe: fakeStripe({ "GET /charges/ch_9": { id: "ch_9", customer: "cus_D1" } }) });
  assert.deepEqual(dispute.query.statements.find(x => x.sql.startsWith("UPDATE creator_commissions")).params, ["cus_D1"]);
  const event = dispute.query.statements.find(x => x.sql.startsWith("INSERT INTO billing_events"));
  assert.equal(event.params[2], "dispute");
  assert.match(event.params[3], /fraudulent/);
});

test("failed payments re-sync access and trial endings are logged", async () => {
  const failed = await deliver("invoice.payment_failed", { id: "in_1", customer: "cus_F1", attempt_count: 1 },
    { stripe: fakeStripe({ "GET /subscriptions": { data: [sub("sub_f", "past_due")] } }) });
  assert.equal(failed.query.statements.find(x => x.sql.startsWith("INSERT INTO billing_events")).params[2], "payment_failed");
  const stored = failed.query.statements.find(x => x.sql.startsWith("UPDATE users SET stripe_subscription_id"));
  assert.equal(stored.params[1], "past_due", "past_due is stored, so access stops (paywall ACCESS_STATUSES)");
  const ending = await deliver("customer.subscription.trial_will_end", { id: "sub_t", customer: "cus_T1", trial_end: 1793404800 });
  assert.equal(ending.query.statements.find(x => x.sql.startsWith("INSERT INTO billing_events")).params[2], "trial_will_end");
  assert.ok(!ending.stripe.calls.length, "a trial-ending notice changes nothing by itself");
});
