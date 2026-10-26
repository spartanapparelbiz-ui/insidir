/* What each Whop webhook does. Pure apart from the injected `deps`, so every branch is unit-tested
 * (test/whop-webhooks.test.ts). The route (app/api/webhooks/whop) verifies the signature, logs the event once per
 * webhook-id and calls this. Throwing means "not done": the event is marked failed, the route answers 500, and Whop
 * retries it (each retry carries the same webhook-id, and a failed id is processed again).
 *
 *   membership.activated   also fires on every renewal, so everything here is safe to repeat: re-check access,
 *                          record the "paid" funnel event once per membership
 *   membership.updated     cancel at period end, status changes: re-check access
 *   payment.failed         a renewal failed: email the buyer the payment's recovery_url (or their Whop orders page),
 *                          at most once a day per payment
 *   refund.created         re-check access (Whop's answer follows refunds)
 *   dispute.created        email the owner (WHOP_ALERT_EMAIL) at once
 *
 * Access itself is never granted or removed here: users.checkAccess is the only source (lib/whop/access.ts). */
import type { Email, SendResult } from "@/lib/alerts/send";
import { renderEmail } from "@/lib/alerts/send";
import type { Plan } from "@/lib/types";

export const HANDLED = ["membership.activated", "membership.updated", "payment.failed", "refund.created", "dispute.created"] as const;

export interface WebhookEvent { type: string; data?: unknown }
export interface KnownUser { id: string; whopUserId: string; email: string | null; visitorId: string | null }

export interface WebhookDeps {
  userByWhopId(whopUserId: string): Promise<KnownUser | null>;
  /** Drops cached access answers and asks Whop again; returns the plan now granted. */
  recheck(whopUserId: string): Promise<Plan>;
  /** Records the "paid" funnel event unless this membership already has one. */
  recordPaidOnce(user: KnownUser, membershipId: string, plan: Plan): Promise<boolean>;
  /** True if a recovery email for this payment went out in the last 24 hours. */
  recoveryEmailedRecently(paymentId: string): Promise<boolean>;
  sendEmail(e: Email): Promise<SendResult>;
  ownerEmail: string | null;
  ordersUrl: string;
  dashboardUrl: string;
}

export interface Outcome { status: "processed" | "ignored"; ref: string | null; note: string }

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The resource id an event is about (mem_, pay_, rfnd_, dspt_…), for the log. */
export const eventRef = (e: WebhookEvent): string | null => str(obj(e.data).id);

const BILLING_FOOTER = "You get this email because you have an Insidir subscription. Billing is handled by Whop.";

export async function handleWhopEvent(e: WebhookEvent, deps: WebhookDeps): Promise<Outcome> {
  const d = obj(e.data);
  const ref = str(d.id);
  switch (e.type) {
    case "membership.activated":
    case "membership.updated": {
      const whopUserId = str(d.user_id) ?? str(obj(d.user).id);
      if (!whopUserId) return { status: "ignored", ref, note: "no buyer user_id (unclaimed or business buyer)" };
      const user = await deps.userByWhopId(whopUserId);
      if (!user) return { status: "processed", ref, note: `buyer ${whopUserId} has not signed in to Insidir yet; access is checked when they do` };
      const plan = await deps.recheck(whopUserId);
      const notes = [`plan ${plan}`, `status ${str(d.status) ?? "?"}`];
      if (d.cancel_at_period_end === true) notes.push("cancels at period end");
      // metadata.customer_id is our user id, set at checkout. It is only compared, never trusted to link accounts:
      // the Checkout element sets metadata in the browser, and identity comes from Sign in with Whop.
      const customer = str(obj(d.metadata).customer_id);
      if (customer && customer !== user.id) notes.push(`metadata customer_id ${customer} is not this buyer's account ${user.id}`);
      if (e.type === "membership.activated" && ref && plan !== "free" && (await deps.recordPaidOnce(user, ref, plan))) notes.push("first activation");
      return { status: "processed", ref, note: notes.join("; ") };
    }

    case "payment.failed": {
      const recovery = str(d.recovery_url);
      // A card declined during checkout is shown to the buyer right there; only renewals (or anything Whop can
      // recover) get an email.
      if (!recovery && str(d.billing_reason) === "subscription_create") return { status: "ignored", ref, note: "declined at checkout (shown inline)" };
      const whopUserId = str(d.user_id) ?? str(obj(d.user).id);
      const user = whopUserId ? await deps.userByWhopId(whopUserId) : null;
      if (whopUserId && user) await deps.recheck(whopUserId);
      const to = str(d.customer_email) ?? str(obj(d.user).email) ?? user?.email ?? null;
      if (!to) return { status: "processed", ref, note: "no email address for the buyer" };
      if (ref && (await deps.recoveryEmailedRecently(ref))) return { status: "processed", ref, note: "recovery email already sent today" };
      const why = str(d.failure_message);
      const url = recovery ?? deps.ordersUrl;
      const body = renderEmail({
        heading: "Your Insidir payment didn't go through",
        lines: [
          { text: why ? `Your card was declined: ${why}` : "Your bank declined the payment for your Insidir subscription." },
          { text: recovery ? "Confirm the payment with your bank on Whop and your subscription carries on as before." : "Update your card on Whop and your subscription carries on as before." },
        ],
        cta: { label: recovery ? "Fix my payment" : "Update my card", url },
        footer: BILLING_FOOTER,
      });
      const sent = await deps.sendEmail({ to, subject: "Action needed: your Insidir payment failed", ...body });
      if (sent === "failed") throw new Error("recovery email could not be sent");
      return { status: "processed", ref, note: `recovery email ${sent} to ${to}${recovery ? " with recovery_url" : " with the orders link"}` };
    }

    case "refund.created": {
      const pay = obj(d.payment);
      const whopUserId = str(obj(pay.user).id) ?? str(d.user_id);
      const amount = `${typeof d.amount === "number" ? d.amount.toFixed(2) : "?"} ${(str(d.currency) ?? "").toUpperCase()}`.trim();
      if (!whopUserId) return { status: "processed", ref, note: `refund ${amount}, no buyer on the payment` };
      const plan = (await deps.userByWhopId(whopUserId)) ? await deps.recheck(whopUserId) : null;
      return { status: "processed", ref, note: `refund ${amount} for ${str(pay.id) ?? "?"}${plan ? `; plan now ${plan}` : ""}` };
    }

    case "dispute.created": {
      if (!deps.ownerEmail) throw new Error("dispute received but WHOP_ALERT_EMAIL is not set; set it so the owner is alerted");
      const buyer = obj(d.buyer);
      const amount = `${typeof d.amount === "number" ? d.amount.toFixed(2) : "?"} ${(str(d.currency) ?? "").toUpperCase()}`.trim();
      const due = str(d.evidence_due_at);
      const body = renderEmail({
        heading: `Dispute opened: ${amount}`,
        lines: [
          { text: `Reason: ${str(d.reason) ?? "not given"} · status: ${str(d.status) ?? "?"}` },
          { text: `Buyer: ${str(buyer.email) ?? "?"} (${str(buyer.username) ?? str(buyer.user_id) ?? "?"})` },
          { text: `Payment: ${str(obj(d.payment).id) ?? "?"} · dispute: ${ref ?? "?"}` },
          { text: due ? `Evidence is due by ${due}.` : "Check the evidence deadline on Whop." },
        ],
        cta: { label: "Open the Whop dashboard", url: deps.dashboardUrl },
        footer: "Sent by Insidir's Whop webhook the moment the dispute was created.",
      });
      const sent = await deps.sendEmail({ to: deps.ownerEmail, subject: `[Insidir] Dispute opened: ${amount}`, ...body });
      if (sent !== "sent") throw new Error(`dispute alert email ${sent}`);
      const whopUserId = str(buyer.user_id);
      if (whopUserId && (await deps.userByWhopId(whopUserId))) await deps.recheck(whopUserId);
      return { status: "processed", ref, note: `owner alerted: ${amount}, ${str(d.reason) ?? "no reason"}` };
    }

    default:
      return { status: "ignored", ref, note: "event type not handled" };
  }
}
