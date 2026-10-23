#!/usr/bin/env node
/* The whole $1 → 7-day trial → $39 checkout through the real engine (src/api.mjs) and PostgreSQL, with Stripe replaced
 * by the SIMULATOR in test/support/stripe-simulator.mjs. It prints what a member is charged and when. It is not Stripe
 * test mode: run scripts/stripe-test-mode-check.mjs with a sk_test_ key for that.
 *
 *   DATABASE_URL=postgresql://... node scripts/checkout-simulated.mjs      (use a throwaway database) */
import { randomUUID } from "node:crypto";
import { stripeSimulator, signedWebhook } from "../test/support/stripe-simulator.mjs";

const ORIGIN = "https://insidir.test", WHSEC = "whsec_simulated";
const ENV = { INSIDIR_PAYWALL: "1", INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_simulated", INSIDIR_STRIPE_PRICE_ID: "price_pro",
  INSIDIR_STRIPE_WEBHOOK_SECRET: WHSEC, INSIDIR_PUBLIC_URL: ORIGIN, INSIDIR_EMAIL_PROVIDER: "log" };
Object.assign(process.env, { ALLOW_SIGNUP: "1", ALLOWED_ORIGINS: ORIGIN, COOKIE_SECURE: "0" });
const { migrate, pool } = await import("../src/db.mjs");
const { createApiServer } = await import("../src/api.mjs");
const { DISCLOSURE_VERSION } = await import("../src/billing.mjs");
await migrate();
const sim = stripeSimulator();
const server = createApiServer({ quiet: true, env: ENV, stripe: sim.client });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const call = async (path, { method = "GET", body, cookie, raw, headers = {} } = {}) => {
  const res = await fetch(base + path, { method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...headers } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
};
const deliver = async events => { for (const e of events) { const { raw, signature } = signedWebhook(e, WHSEC); await call("/v1/billing/webhook", { method: "POST", raw, headers: { "Stripe-Signature": signature } }); } };
const show = (step, data) => console.log(JSON.stringify({ step, ...data }));
const iso = s => new Date(Number(s) * 1000).toISOString();
const usd = c => "$" + (c / 100).toFixed(2);

try {
  const email = `checkout-${randomUUID().slice(0, 8)}@example.com`;
  const reg = await call("/v1/auth/register", { method: "POST", body: { email, password: "simulated checkout 2026" } });
  const cookie = reg.cookie, userId = reg.json.user.id;
  const token = (await pool.query("SELECT text_body FROM email_outbox WHERE kind='verify_email' AND to_email=$1", [email])).rows[0].text_body.match(/#token=([a-f0-9]{64})/)[1];
  await call("/v1/auth/verify-email", { method: "POST", body: { token }, cookie });
  const offer = (await call("/v1/billing/status", { cookie })).json.offer;
  show("1. offer shown on the subscribe page", { charged_today: usd(offer.todayCents), trial_days: offer.trialDays, then: usd(offer.recurringCents) + "/month", disclosure: offer.disclosure });

  const started = await call("/v1/billing/checkout", { method: "POST", cookie, body: { consent: true, offer: "trial", disclosureVersion: DISCLOSURE_VERSION } });
  const session = [...sim.sessions.values()].at(-1);
  show("2. Stripe Checkout Session created by the engine", { http: started.status, amount_total: usd(session.amount_total),
    "subscription_data[trial_period_days]": session.params["subscription_data[trial_period_days]"], "line_items[0][price]": session.params["line_items[0][price]"],
    "line_items[1] (one-time fee)": usd(Number(session.params["line_items[1][price_data][unit_amount]"])), stripe_text: session.params["custom_text[submit][message]"] });

  const { subscription, invoice, events } = sim.completeCheckout(session.id);
  await deliver(events);
  show("3. the $1 charge", { invoice: invoice.id, billing_reason: invoice.billing_reason, amount_paid: usd(invoice.amount_paid), status: invoice.status });
  const row = (await pool.query("SELECT subscription_status,trial_started_at,current_period_end FROM users WHERE id=$1", [userId])).rows[0];
  show("4. trial end, 7 days out", { stripe_trial_end: iso(subscription.trial_end), days_from_checkout: (subscription.trial_end - subscription.created) / 86400,
    insidir_status: row.subscription_status, insidir_access_until: row.current_period_end.toISOString() });
  show("5. first $39 invoice scheduled", { due_at: iso(subscription.trial_end), amount: usd(subscription.items.data[0].price.unit_amount), price: subscription.items.data[0].price.id,
    note: "the simulator has no invoice preview: Stripe bills the subscription's $39 Price at trial_end (scripts/stripe-test-mode-check.mjs reads Stripe's real preview)" });
  const mails = (await pool.query("SELECT kind,subject FROM email_outbox WHERE user_id=$1 AND category='billing' ORDER BY id", [userId])).rows;
  show("6. emails queued at checkout", { emails: mails });
  await deliver(sim.endPeriod(subscription.id));
  const renewal = (await pool.query("SELECT subject FROM email_outbox WHERE user_id=$1 AND kind='payment_receipt' ORDER BY id DESC LIMIT 1", [userId])).rows[0];
  show("7. at trial end the $39 renewal is paid", { status: (await pool.query("SELECT subscription_status FROM users WHERE id=$1", [userId])).rows[0].subscription_status, receipt: renewal?.subject });
} finally { server.close(); await pool.end(); }
