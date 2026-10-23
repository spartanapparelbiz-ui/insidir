/* Abandoned checkout: one reminder, an hour after a Stripe Checkout page was opened and not paid.
 *
 * Every Checkout session Insidir opens closes after one hour (expires_at) with Stripe's recovery turned on, so the
 * checkout.session.expired webhook arrives an hour after the visitor left and carries a recovery link: a fresh
 * Checkout page with the same offer and the same agreed terms. That webhook queues one email:
 *   - only for an account that still has no subscription that can bill (nobody who paid since is reminded);
 *   - once per account, ever (dedupe key), so a second abandoned checkout sends nothing;
 *   - as optional mail (category "digest"): an unsubscribe or a complaint stops it, and it says it is the only one.
 * The link is Stripe's recovery page when Stripe sends one, otherwise /start, which opens a new checkout after the
 * terms are agreed again. Nothing is charged by the email itself. */
import { enqueueEmail, renderEmail } from "./email.mjs";
import { emailSettings, trialSettings } from "./config.mjs";

export const CHECKOUT_OPEN_SECONDS = 3600;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYING = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

/* Added to every Checkout session: closes in an hour (Stripe's minimum is 30 minutes) and can be recovered. */
export function recoveryParams(now = Date.now()) {
  return { expires_at: String(Math.floor(now / 1000) + CHECKOUT_OPEN_SECONDS), "after_expiration[recovery][enabled]": "true" };
}

/* Stripe's recovery page, if the expired session carries one; never any other host. */
export function recoveryUrl(session) {
  const url = String(session?.after_expiration?.recovery?.url || "");
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "checkout.stripe.com" ? url : null; } catch { return null; }
}

export function recoveryEmail({ url, days = trialSettings().days, trial = true }) {
  return {
    subject: trial ? "Your $1 Insidir trial is one step away" : "Your Insidir checkout is one step away",
    heading: "You didn't finish checkout",
    paragraphs: [
      "Your Insidir checkout closed before it was paid, so nothing was charged.",
      trial ? `Pick up where you left off: $1 for ${days} days, then $39 a month. Cancel online anytime.` : "Pick up where you left off: $39 a month. Cancel online anytime.",
      "This is the only reminder we'll send about it.",
      "Research, not investment advice."
    ],
    action: { label: "Finish checkout", url }
  };
}

/* From the checkout.session.expired webhook. Returns { queued, reason }. */
export async function queueCheckoutRecovery(query, session, { env = process.env } = {}) {
  const userId = USER_ID.test(String(session?.client_reference_id || "")) ? session.client_reference_id : null;
  if (!userId || session?.mode !== "subscription") return { queued: false, reason: "no account" };
  const user = (await query("SELECT id,email,subscription_status,trial_started_at FROM users WHERE id=$1", [userId])).rows[0];
  if (!user?.email) return { queued: false, reason: "no account" };
  if (PAYING.has(String(user.subscription_status || "").toLowerCase())) return { queued: false, reason: "subscribed" };
  const site = emailSettings(env).publicUrl;
  const trial = session.metadata?.insidir_offer ? session.metadata.insidir_offer === "trial" : !user.trial_started_at;
  const message = recoveryEmail({ url: recoveryUrl(session) || site + "/start", days: trialSettings(env).days, trial });
  const { text, html } = renderEmail({ ...message, footer: [`Not interested? Ignore this email; there is nothing to cancel. Questions: hello@aethric.llc.`] });
  const r = await enqueueEmail(query, { userId, to: user.email, category: "digest", kind: "checkout_recovery", dedupeKey: "checkout-recovery:" + userId,
    subject: message.subject, text, html });
  return { queued: !!r?.queued, reason: r?.queued ? null : "already sent" };
}
