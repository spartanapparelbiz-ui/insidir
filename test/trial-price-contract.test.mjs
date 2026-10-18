import test from "node:test";
import assert from "node:assert/strict";
import { trialSettings, billingSettings } from "../src/config.mjs";
import { currentOffer, trialCheckoutParams, PLAN_CENTS, trialUsedFromRow } from "../src/billing.mjs";

// Customer-facing paid trial contract. The existing Stripe $39/month Price is reused;
// the $1 is a one-time line item, never a replacement recurring Price.
test("new customers pay $1 for 3 days, then $39/month", () => {
  const settings = trialSettings({});
  assert.deepEqual(settings, { enabled: true, days: 3, feeCents: 100 });
  const offer = currentOffer({ trial: settings, trialUsed: false, now: Date.UTC(2026, 9, 18, 12) });
  assert.equal(offer.kind, "trial");
  assert.equal(offer.todayCents, 100);
  assert.equal(offer.recurringCents, 3900);
  assert.equal(offer.trialDays, 3);
  assert.equal(offer.firstRenewalAt, "2026-10-21T12:00:00.000Z");
  assert.match(offer.disclosure, /\$1\.00 today/);
  assert.match(offer.disclosure, /\$39\.00 per month/);
  assert.equal(PLAN_CENTS, 3900);
});

test("Stripe paid trial starts with a $1 one-time Checkout line and does not change recurring plan price", () => {
  const params = trialCheckoutParams({ days: 3, feeCents: 100 });
  assert.equal(params["subscription_data[trial_period_days]"], "3");
  assert.equal(params["line_items[1][price_data][unit_amount]"], "100");
  assert.equal(params["line_items[1][price_data][currency]"], "usd");
  assert.equal(params["line_items[1][quantity]"], "1");
  assert.equal(params["payment_method_collection"], "always");
  assert.equal(params["subscription_data[trial_settings][end_behavior][missing_payment_method]"], "cancel");
  assert.match(params["custom_text[submit][message]"], /\$1 today for 3 days.*\$39 a month/);
  assert.equal(params["line_items[0][price]"], undefined, "trial helper must never replace the existing $39 recurring line");
  assert.equal(params["line_items[1][price_data][recurring][interval]"], undefined, "$1 fee must not be a recurring Price");
});

test("returning accounts cannot receive the $1 introductory charge again", () => {
  assert.equal(trialUsedFromRow({ trial_started_at: "2026-10-01T00:00:00Z" }), true);
  const offer = currentOffer({ trial: trialSettings({}), trialUsed: true });
  assert.equal(offer.kind, "full");
  assert.equal(offer.todayCents, 3900);
  assert.equal(offer.recurringCents, 3900);
  assert.equal(offer.trialDays, 0);
});

test("the production $39 monthly Price remains a required configuration input", () => {
  const cfg = billingSettings({ INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_redacted",
    INSIDIR_STRIPE_WEBHOOK_SECRET: "whsec_redacted", INSIDIR_STRIPE_PRICE_ID: "price_monthly_39" });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.priceId, "price_monthly_39");
});
