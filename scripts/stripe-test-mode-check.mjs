#!/usr/bin/env node
/* Stripe TEST-MODE verification of Insidir's offer: $1 today for 7 days, then $39 a month until cancelled.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_... INSIDIR_STRIPE_PRICE_ID=price_... node scripts/stripe-test-mode-check.mjs
 *
 * It refuses any key that is not a test-mode key (sk_test_ / rk_test_), so it can never touch live customers.
 * Everything it creates lives on a Stripe test clock and is deleted at the end (deleting the clock deletes its
 * customers and subscriptions); the two products it creates are archived.
 *
 * Checks, each printed as one JSON line with ok true/false:
 *   price            the configured Price is $39.00 USD, monthly, active, with no trial of its own
 *   checkout-trial   a Checkout Session built with the engine's own parameters charges $1.00 today (amount_total 100)
 *   checkout-full    the same for a returning customer charges $39.00 today and carries no trial
 *   trial-start      a subscription with the same terms starts trialing with a paid $1.00 invoice
 *   trial-length     its trial ends exactly 7 days after it starts (prints both dates)
 *   first-invoice-scheduled  Stripe's preview of the next invoice: $39.00, due when the trial ends
 *   conversion       advancing the test clock past the trial: active, first $39.00 renewal invoice paid
 *   card-failure     with a declining card, the next renewal fails and the subscription becomes past_due
 *   refund           the $39.00 charge can be refunded
 *   cancellation     cancel_at_period_end is accepted, then immediate cancellation ends the subscription
 *   webhook-events   (read-only) the webhook endpoint for /v1/billing/webhook subscribes to every event the engine uses
 *   portal-cancel    (read-only) the customer portal allows cancellation
 * The subscription in trial-start..cancellation is created through the Subscriptions API with the same price, trial
 * length and one-time fee, because a Checkout page can only be completed in a browser. Webhook delivery into the
 * engine is NOT covered here: use `stripe listen --forward-to https://YOUR_DOMAIN/v1/billing/webhook` and run one
 * checkout in a browser with a test card (docs/OPERATIONS.md). Exit code 0 only when every check passed. */
import { createStripeClient, trialCheckoutParams, currentOffer } from "../src/billing.mjs";
import { trialSettings } from "../src/config.mjs";

const key = String(process.env.STRIPE_TEST_SECRET_KEY || process.env.INSIDIR_STRIPE_SECRET_KEY || "").trim();
const priceId = String(process.env.INSIDIR_STRIPE_PRICE_ID || "").trim();
if (!/^(sk|rk)_test_/.test(key)) { console.error("Refusing to run: STRIPE_TEST_SECRET_KEY must be a Stripe TEST-mode key (sk_test_...). Live keys are never used by this script."); process.exit(2); }
if (!/^price_/.test(priceId)) { console.error("Set INSIDIR_STRIPE_PRICE_ID to the test-mode $39/month Price."); process.exit(2); }

const stripe = createStripeClient({ secretKey: key, timeoutMs: 30000 });
const REQUIRED_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.trial_will_end", "invoice.paid", "invoice.payment_failed",
  "charge.refunded", "charge.dispute.created"];
const results = [];
const report = (check, ok, detail = {}) => { results.push({ check, ok }); console.log(JSON.stringify({ check, ok, ...detail })); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const trial = trialSettings();

async function advance(clock, to) {
  await stripe.post(`/test_helpers/test_clocks/${clock}/advance`, { frozen_time: String(to) });
  for (let i = 0; i < 60; i++) {
    const c = await stripe.get(`/test_helpers/test_clocks/${clock}`);
    if (c.status === "ready") return c;
    if (c.status === "internal_failure") throw new Error("test clock failed to advance");
    await sleep(2000);
  }
  throw new Error("test clock did not finish advancing within 2 minutes");
}
const latestInvoice = async sub => (await stripe.get("/invoices", { subscription: sub, limit: "1" })).data?.[0] || null;

let clock = null; const products = [];
try {
  const price = await stripe.get("/prices/" + priceId);
  report("price", price.unit_amount === 3900 && price.currency === "usd" && price.recurring?.interval === "month" && Number(price.recurring?.interval_count) === 1 && price.active === true && !price.recurring?.trial_period_days,
    { unit_amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval, active: price.active, trial_period_days: price.recurring?.trial_period_days ?? null });

  // Checkout Sessions with the engine's exact parameters (billing.mjs): one for a new account, one for a returning one.
  const probe = await stripe.post("/customers", { email: "stripe-test-mode-check@example.com", "metadata[purpose]": "insidir-test-mode-check" });
  const base = { mode: "subscription", customer: probe.id, "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
    success_url: "https://example.com/billing.html?checkout=success", cancel_url: "https://example.com/subscribe.html?checkout=cancel",
    "custom_text[submit][message]": "By subscribing you authorize Insidir to charge $39.00 per month until you cancel. Cancel any time from Billing." };
  const offerTrial = currentOffer({ trialUsed: false, trial }), offerFull = currentOffer({ trialUsed: true, trial });
  const trialSession = await stripe.post("/checkout/sessions", { ...base, ...trialCheckoutParams(trial) });
  report("checkout-trial", trialSession.amount_total === offerTrial.todayCents && trialSession.amount_total === 100, { amount_total: trialSession.amount_total, expected: offerTrial.todayCents });
  const fullSession = await stripe.post("/checkout/sessions", base);
  report("checkout-full", fullSession.amount_total === offerFull.todayCents && offerFull.todayCents === 3900, { amount_total: fullSession.amount_total, expected: offerFull.todayCents });
  for (const s of [trialSession, fullSession]) await stripe.post(`/checkout/sessions/${s.id}/expire`).catch(() => {});
  await stripe.del("/customers/" + probe.id).catch(() => {});

  // The lifecycle on a test clock.
  const start = Math.floor(Date.now() / 1000);
  clock = (await stripe.post("/test_helpers/test_clocks", { frozen_time: String(start), name: "insidir-lifecycle-check" })).id;
  const feeProduct = await stripe.post("/products", { name: "Insidir trial fee (test-mode check)" }); products.push(feeProduct.id);
  const customer = await stripe.post("/customers", { email: "stripe-test-mode-check@example.com", test_clock: clock, payment_method: "pm_card_visa", "invoice_settings[default_payment_method]": "pm_card_visa" });
  const sub = await stripe.post("/subscriptions", { customer: customer.id, "items[0][price]": priceId, trial_period_days: String(trial.days),
    "add_invoice_items[0][price_data][currency]": "usd", "add_invoice_items[0][price_data][unit_amount]": String(trial.feeCents), "add_invoice_items[0][price_data][product]": feeProduct.id,
    "trial_settings[end_behavior][missing_payment_method]": "cancel" });
  const first = await latestInvoice(sub.id);
  report("trial-start", sub.status === "trialing" && first?.amount_paid === trial.feeCents && first?.status === "paid", { status: sub.status, first_invoice_paid: first?.amount_paid, invoice_status: first?.status });
  const day = t => new Date(Number(t) * 1000).toISOString();
  report("trial-length", Number(sub.trial_end) - Number(sub.trial_start) === trial.days * 86400 && trial.days === 7,
    { trial_start: day(sub.trial_start), trial_end: day(sub.trial_end), days: (Number(sub.trial_end) - Number(sub.trial_start)) / 86400 });
  // The first $39 invoice Stripe has scheduled for the trial's end (create_preview; older API versions: invoices/upcoming).
  const upcoming = await stripe.post("/invoices/create_preview", { subscription: sub.id }).catch(() => stripe.get("/invoices/upcoming", { subscription: sub.id }));
  const nextAt = Number(upcoming?.next_payment_attempt || upcoming?.period_end || upcoming?.created || 0);
  report("first-invoice-scheduled", upcoming?.amount_due === 3900 && upcoming?.currency === "usd" && Math.abs(nextAt - Number(sub.trial_end)) <= 3600,
    { amount_due: upcoming?.amount_due ?? null, currency: upcoming?.currency ?? null, scheduled_for: nextAt ? day(nextAt) : null, trial_end: day(sub.trial_end) });

  await advance(clock, Number(sub.trial_end) + 3600);
  const converted = await stripe.get("/subscriptions/" + sub.id);
  const renewal = await latestInvoice(sub.id);
  report("conversion", converted.status === "active" && renewal?.billing_reason === "subscription_cycle" && renewal?.amount_paid === 3900 && renewal?.status === "paid",
    { status: converted.status, billing_reason: renewal?.billing_reason, amount_paid: renewal?.amount_paid, invoice_status: renewal?.status });

  // A card that is declined on the next renewal.
  const pmFail = await stripe.post("/payment_methods/pm_card_chargeCustomerFail/attach", { customer: customer.id });
  await stripe.post("/customers/" + customer.id, { "invoice_settings[default_payment_method]": pmFail.id });
  const periodEnd = Number(converted.items?.data?.[0]?.current_period_end || converted.current_period_end);
  await advance(clock, periodEnd + 3600);
  const failed = await stripe.get("/subscriptions/" + sub.id);
  const failedInvoice = await latestInvoice(sub.id);
  report("card-failure", failed.status === "past_due" && failedInvoice?.status === "open" && failedInvoice?.amount_paid === 0, { status: failed.status, invoice_status: failedInvoice?.status });

  const charges = (await stripe.get("/charges", { customer: customer.id, limit: "10" })).data || [];
  const paid39 = charges.find(c => c.amount === 3900 && c.paid && c.status === "succeeded");
  const refund = paid39 ? await stripe.post("/refunds", { charge: paid39.id }) : null;
  report("refund", refund?.status === "succeeded" && refund?.amount === 3900, { refund_status: refund?.status ?? null });

  await stripe.post("/subscriptions/" + sub.id, { cancel_at_period_end: "true" });
  const flagged = await stripe.get("/subscriptions/" + sub.id);
  const ended = await stripe.del("/subscriptions/" + sub.id);
  report("cancellation", flagged.cancel_at_period_end === true && ended.status === "canceled", { cancel_at_period_end: flagged.cancel_at_period_end, final_status: ended.status });

  // Read-only configuration checks (dashboard actions if they fail).
  const endpoints = (await stripe.get("/webhook_endpoints", { limit: "100" })).data || [];
  const ours = endpoints.filter(e => /\/v1\/billing\/webhook$/.test(String(e.url || "")) && e.status === "enabled");
  const missing = ours.length ? REQUIRED_EVENTS.filter(ev => !ours.some(e => e.enabled_events?.includes("*") || e.enabled_events?.includes(ev))) : REQUIRED_EVENTS;
  report("webhook-events", ours.length > 0 && missing.length === 0, { endpoints: ours.map(e => e.url), missing });
  const portal = (await stripe.get("/billing_portal/configurations", { limit: "10", active: "true" })).data || [];
  report("portal-cancel", portal.some(c => c.features?.subscription_cancel?.enabled === true), { configurations: portal.length });
} catch (e) {
  report("run", false, { error: String(e?.message || e) });
} finally {
  if (clock) await stripe.del("/test_helpers/test_clocks/" + clock).catch(e => console.error("Could not delete test clock " + clock + ": " + e.message));
  for (const p of products) await stripe.post("/products/" + p, { active: "false" }).catch(() => {});
}
const failedChecks = results.filter(r => !r.ok).map(r => r.check);
console.log(JSON.stringify({ summary: failedChecks.length ? "FAILED" : "PASSED", failed: failedChecks, mode: "stripe-test-mode" }));
process.exit(failedChecks.length ? 1 : 0);
