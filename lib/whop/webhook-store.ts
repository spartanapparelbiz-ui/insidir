/* The database side of Whop webhooks: the event log (one row per webhook-id) and the lookups handleWhopEvent needs. */
import { and, eq, gte, sql } from "drizzle-orm";
import { syncPlan } from "@/lib/auth/session";
import { sendEmail } from "@/lib/alerts/send";
import { getDb } from "@/lib/db";
import { events, users, webhookEvents } from "@/lib/db/schema";
import { forgetAccess } from "./access";
import { ordersUrl, whopConfig } from "./config";
import type { Outcome, WebhookDeps, WebhookEvent } from "./webhooks";

/** A row stuck in "processing" this long (the process died mid-event) may be taken again. */
const STUCK_MS = 2 * 60_000;

/** Logs a verified event. "duplicate" means this webhook-id was already handled (or is being handled right now). */
export async function claimWebhook(id: string, e: WebhookEvent, ref: string | null): Promise<"new" | "retry" | "duplicate"> {
  const db = getDb();
  const payload = typeof e === "object" && e !== null ? (e as unknown as Record<string, unknown>) : null;
  const fresh = await db.insert(webhookEvents).values({ id, type: e.type, ref, status: "processing", payload })
    .onConflictDoNothing().returning({ id: webhookEvents.id });
  if (fresh.length) return "new";
  const retried = await db.update(webhookEvents).set({ status: "processing", note: null, receivedAt: new Date() })
    .where(and(eq(webhookEvents.id, id), sql`(${webhookEvents.status} = 'failed' or (${webhookEvents.status} = 'processing' and ${webhookEvents.receivedAt} < ${new Date(Date.now() - STUCK_MS)}))`))
    .returning({ id: webhookEvents.id });
  return retried.length ? "retry" : "duplicate";
}

export async function finishWebhook(id: string, out: Outcome): Promise<void> {
  await getDb().update(webhookEvents).set({ status: out.status, note: out.note.slice(0, 1000), processedAt: new Date() }).where(eq(webhookEvents.id, id));
}

export async function failWebhook(id: string, why: string): Promise<void> {
  await getDb().update(webhookEvents).set({ status: "failed", note: why.slice(0, 1000), processedAt: new Date() }).where(eq(webhookEvents.id, id));
}

export function webhookDeps(): WebhookDeps {
  const db = getDb();
  return {
    async userByWhopId(whopUserId) {
      const r = await db.select({ id: users.id, whopUserId: users.whopUserId, email: users.email, visitorId: users.visitorId }).from(users)
        .where(eq(users.whopUserId, whopUserId)).limit(1);
      return r[0] ?? null;
    },
    async recheck(whopUserId) {
      forgetAccess(whopUserId);
      return syncPlan(whopUserId, { fresh: true });
    },
    async recordPaidOnce(user, membershipId, plan) {
      const seen = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.name, "paid"), eq(events.userId, user.id), sql`${events.props}->>'membership' = ${membershipId}`)).limit(1);
      if (seen.length) return false;
      await db.insert(events).values({ name: "paid", visitorId: user.visitorId ?? "server", userId: user.id, props: { plan, membership: membershipId } });
      return true;
    },
    async recoveryEmailedRecently(paymentId) {
      const r = await db.select({ id: webhookEvents.id }).from(webhookEvents)
        .where(and(eq(webhookEvents.type, "payment.failed"), eq(webhookEvents.ref, paymentId), eq(webhookEvents.status, "processed"),
          sql`${webhookEvents.note} like 'recovery email sent%'`, gte(webhookEvents.processedAt, new Date(Date.now() - 86_400_000)))).limit(1);
      return r.length > 0;
    },
    sendEmail,
    ownerEmail: process.env.WHOP_ALERT_EMAIL || null,
    ordersUrl: ordersUrl(),
    dashboardUrl: `${whopConfig().webUrl}/dashboard`,
  };
}
