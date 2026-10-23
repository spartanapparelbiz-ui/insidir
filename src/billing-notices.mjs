/* Subscription emails: what the customer agreed to, what they were charged, when the trial ends, how to cancel.
 *
 * Every notice is queued in the email outbox (src/email.mjs) under a dedupe key derived from the Stripe object, so a
 * webhook delivered twice, out of order or retried after a failure queues the notice once. Billing notices keep
 * their body (retain_body) as the record of what the customer was told. They go to the account's current address;
 * nothing is sent for a Stripe customer with no Insidir account (deleted accounts get their deletion notice only).
 *
 *   acknowledgment     after checkout: the offer as consented (from billing_consents), the amount today, the
 *                      recurring price, the first renewal date and how to cancel online
 *   trial_reminder     24 hours before a trial converts (the hourly worker; Stripe's trial_will_end only for trials
 *                      ending within 48 hours): the date, the $39 that follows, what the member keeps, a cancel link
 *   (the trial's day-1 and day-5 emails are in src/trial-emails.mjs)
 *   payment_receipt    each paid invoice with an amount: what was charged, for which period, how to cancel
 *   payment_failed     a failed charge: access is paused until the card is updated; no new charge is made by us
 *   cancel_confirmed   cancellation: no further charges; access until the end of the paid period
 *   subscription_ended the subscription ended
 *   refund_issued      a refund
 * Wording that applies the law (California's acknowledgment rules and others) needs counsel's sign-off; see
 * docs/ATTORNEY-REVIEW.md. */
import { enqueueEmail, renderEmail } from "./email.mjs";
import { emailSettings, trialSettings } from "./config.mjs";
import { PLAN_CENTS } from "./billing.mjs";

const usd = cents => "$" + (Number(cents || 0) / 100).toFixed(2);
const longDate = d => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "the end of the current period";
const fromUnix = s => Number(s) > 0 ? new Date(Number(s) * 1000) : null;

const footer = billingUrl => [
  `Manage or cancel your subscription online at any time: ${billingUrl}`,
  "Questions about a charge: hello@aethric.llc. Card details are held by Stripe, never by Insidir.",
  "This is a notice about your subscription and is sent whatever your alert email preferences."
];

async function accountFor(query, customer) {
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customer || ""))) return null;
  return (await query("SELECT id,email FROM users WHERE stripe_customer_id=$1", [customer])).rows[0] || null;
}

async function queue(query, account, { kind, key, subject, heading, paragraphs, lines = [], env }) {
  const billingUrl = emailSettings(env).publicUrl + "/billing.html";
  const { text, html } = renderEmail({ heading, paragraphs, lines, action: { label: "Open Billing", url: billingUrl }, footer: footer(billingUrl) });
  return enqueueEmail(query, { userId: account.id, to: account.email, category: "billing", kind, dedupeKey: "billing:" + kind + ":" + key, subject, text, html, retainBody: true });
}

/* After checkout.session.completed: the acknowledgment, built from the consent the customer gave for that checkout. */
export async function acknowledgeCheckout(query, session, { env = process.env } = {}) {
  const account = await accountFor(query, session?.customer);
  if (!account || !/^cs_/.test(String(session?.id || ""))) return { queued: false };
  const consent = (await query(`SELECT offer,amount_today_cents,recurring_cents,trial_days,disclosure_text,created_at FROM billing_consents
    WHERE stripe_checkout_id=$1 ORDER BY id DESC LIMIT 1`, [session.id])).rows[0];
  const today = Number.isFinite(Number(session.amount_total)) ? Number(session.amount_total) : consent?.amount_today_cents;
  const trial = consent ? consent.offer === "trial" : today < PLAN_CENTS;
  const paragraphs = [
    trial ? `Thank you for starting Insidir Pro. You were charged ${usd(today)} today for a ${consent?.trial_days || trialSettings(env).days}-day trial with full access.`
      : `Thank you for subscribing to Insidir Pro. You were charged ${usd(today)} today for your first month.`,
    trial ? `Unless you cancel before the trial ends, your subscription renews automatically at ${usd(consent?.recurring_cents || PLAN_CENTS)} per month, charged to the payment method you provided when the trial ends and then every month, until you cancel.`
      : `Your subscription renews automatically at ${usd(consent?.recurring_cents || PLAN_CENTS)} per month, charged to the payment method you provided, until you cancel.`,
    "How to cancel: open Billing in your Insidir account and choose Cancel subscription. Cancelling online takes one step and stops all future charges. If you cancel during the trial, you are not charged the monthly price. Access continues to the end of the period you have paid for; we do not issue partial-period refunds unless the law requires it.",
    ...(consent?.disclosure_text ? ["The terms you agreed to at checkout: " + consent.disclosure_text] : [])
  ];
  return queue(query, account, { env, kind: "acknowledgment", key: session.id, subject: trial ? "Your Insidir trial has started" : "Your Insidir subscription has started",
    heading: trial ? "Your trial has started" : "Your subscription has started", paragraphs,
    lines: [{ label: "Charged today", value: usd(today) }, { label: "Then", value: usd(consent?.recurring_cents || PLAN_CENTS) + " / month until cancelled" },
      ...(consent?.created_at ? [{ label: "Terms agreed", value: new Date(consent.created_at).toISOString().replace("T", " ").slice(0, 16) + " UTC" }] : [])] });
}

/* The charge reminder (the trial's "day 6" email): sent 24 hours before the trial converts, so nobody is surprised by
 * the $39. It says when the charge happens, what the member keeps by staying, and links straight to cancelling. */
export async function trialReminder(query, { customer, subscription, trialEnd }, { env = process.env, now = Date.now() } = {}) {
  const account = await accountFor(query, customer);
  const end = trialEnd instanceof Date ? trialEnd : typeof trialEnd === "string" ? new Date(trialEnd) : fromUnix(trialEnd);
  if (!account || !subscription || !end || Number.isNaN(end.getTime())) return { queued: false };
  const site = emailSettings(env).publicUrl;
  const kept = (await query(`SELECT (SELECT count(*) FROM watchlist WHERE user_id=$1)::int AS companies,
    (SELECT count(*) FROM followed_people WHERE user_id=$1)::int AS people`, [account.id]).catch(() => ({ rows: [] }))).rows[0] || {};
  const tomorrow = end.getTime() - now <= 36 * 3600_000;
  const when = `${tomorrow ? "tomorrow, " : ""}${longDate(end)} at ${end.toISOString().slice(11, 16)} UTC`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return queue(query, account, { env, kind: "trial_reminder", key: subscription, // a subscription has one trial: one reminder, whichever source asks first
    subject: tomorrow ? `Tomorrow your Insidir trial ends and ${usd(PLAN_CENTS)} is charged` : `Your Insidir trial ends ${longDate(end)}`,
    heading: tomorrow ? `Tomorrow you'll be charged ${usd(PLAN_CENTS)}` : "Your trial is ending",
    paragraphs: [`Your Insidir trial ends ${when}. Unless you cancel before then, your subscription renews automatically and your payment method is charged ${usd(PLAN_CENTS)}, then ${usd(PLAN_CENTS)} every month until you cancel.`,
      `What you keep: your watchlist (${plural(Number(kept.companies) || 0, "company", "companies")}) and the ${plural(Number(kept.people) || 0, "person", "people")} you follow, alerts within minutes of each new Form 4, every insider's track record and signal score, and your saved research. Every figure links to its SEC filing.`,
      `Don't want to continue? Cancel in one step before the trial ends and you are not charged: ${site}/billing.html#cancel . Nothing else is needed.`],
    lines: [{ label: "Trial ends", value: longDate(end) }, { label: "Then", value: usd(PLAN_CENTS) + " / month" }, { label: "Cancel", value: site + "/billing.html#cancel" }] });
}

export async function paymentReceipt(query, invoice, { env = process.env } = {}) {
  const account = await accountFor(query, invoice?.customer);
  if (!account || !/^in_/.test(String(invoice?.id || "")) || !(Number(invoice.amount_paid) > 0)) return { queued: false };
  const line = invoice.lines?.data?.find(l => l?.period?.end) || null;
  const periodEnd = fromUnix(line?.period?.end);
  const trialFee = Number(invoice.amount_paid) < PLAN_CENTS && invoice.billing_reason === "subscription_create";
  return queue(query, account, { env, kind: "payment_receipt", key: invoice.id, subject: `Insidir receipt: ${usd(invoice.amount_paid)}`, heading: "Payment received",
    paragraphs: [trialFee ? `We received ${usd(invoice.amount_paid)} for your Insidir trial.` : `We received ${usd(invoice.amount_paid)} for Insidir Pro.`,
      trialFee ? `Unless you cancel before the trial ends, ${usd(PLAN_CENTS)} is charged when it ends and then every month.` : `Your subscription renews automatically at ${usd(PLAN_CENTS)} per month until you cancel.`],
    lines: [{ label: "Amount", value: usd(invoice.amount_paid) }, ...(invoice.number ? [{ label: "Invoice", value: String(invoice.number) }] : []),
      ...(periodEnd && !trialFee ? [{ label: "Paid through", value: longDate(periodEnd) }] : [])] });
}

export async function paymentFailed(query, invoice, { env = process.env } = {}) {
  const account = await accountFor(query, invoice?.customer);
  if (!account || !/^in_/.test(String(invoice?.id || ""))) return { queued: false };
  return queue(query, account, { env, kind: "payment_failed", key: invoice.id + ":" + (invoice.attempt_count ?? 0), subject: "Your Insidir payment did not go through", heading: "Your payment did not go through",
    paragraphs: [`We could not charge ${usd(invoice.amount_due)} for Insidir Pro. Access to the product is paused until the payment succeeds.`,
      "Update your payment method from Billing. If you would rather stop, cancel from Billing and nothing further will be charged."],
    lines: [{ label: "Amount due", value: usd(invoice.amount_due) }] });
}

export async function cancellationConfirmed(query, { customer, subscription, accessUntil }, { env = process.env } = {}) {
  const account = await accountFor(query, customer);
  if (!account || !subscription) return { queued: false };
  const until = accessUntil ? new Date(accessUntil) : null;
  return queue(query, account, { env, kind: "cancel_confirmed", key: subscription, subject: "Your Insidir subscription is cancelled", heading: "Cancellation confirmed",
    paragraphs: ["Your Insidir subscription is cancelled. You will not be charged again.", `Your access continues until ${longDate(until)}. You can subscribe again at any time.`],
    lines: [{ label: "Access until", value: longDate(until) }, { label: "Further charges", value: "None" }] });
}

export async function subscriptionEnded(query, sub, { env = process.env } = {}) {
  const account = await accountFor(query, sub?.customer);
  if (!account || !/^sub_/.test(String(sub?.id || ""))) return { queued: false };
  return queue(query, account, { env, kind: "subscription_ended", key: sub.id, subject: "Your Insidir subscription has ended", heading: "Your subscription has ended",
    paragraphs: ["Your Insidir subscription has ended and no further payments will be taken. Your account and saved research stay until you delete them; you can subscribe again from Billing."] });
}

export async function refundIssued(query, charge, { env = process.env } = {}) {
  const account = await accountFor(query, charge?.customer);
  if (!account || !/^(ch|py)_/.test(String(charge?.id || ""))) return { queued: false };
  return queue(query, account, { env, kind: "refund_issued", key: charge.id + ":" + (charge.amount_refunded ?? 0), subject: "Your Insidir refund", heading: "Refund issued",
    paragraphs: [`We refunded ${usd(charge.amount_refunded)} to your payment method. Banks usually show it within 5 to 10 business days.`],
    lines: [{ label: "Refunded", value: usd(charge.amount_refunded) }] });
}

/* The charge-reminder worker (hourly): a reminder for every trial ending in the next 24 hours that has not had one
 * (the dedupe key makes a second pass a no-op), so on a 7-day trial it goes out six days in. Stripe's own
 * trial_will_end (three days before the end) queues it only for trials ending within 48 hours (billing.mjs). */
export const REMINDER_HOURS_BEFORE_END = 24;
export async function queueTrialReminders(query, { env = process.env, limit = 200 } = {}) {
  const due = await query(`SELECT stripe_customer_id,stripe_subscription_id,current_period_end FROM users
    WHERE subscription_status='trialing' AND NOT cancel_at_period_end AND current_period_end BETWEEN now() AND now()+make_interval(hours => $2)
    AND stripe_customer_id IS NOT NULL AND stripe_subscription_id IS NOT NULL ORDER BY current_period_end LIMIT $1`, [limit, REMINDER_HOURS_BEFORE_END]);
  let queued = 0;
  for (const r of due.rows) if ((await trialReminder(query, { customer: r.stripe_customer_id, subscription: r.stripe_subscription_id, trialEnd: r.current_period_end }, { env })).queued) queued++;
  return { checked: due.rows.length, queued };
}
