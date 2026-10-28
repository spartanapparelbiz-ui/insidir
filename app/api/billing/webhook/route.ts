/* Billing webhooks from Whop (https://insidir.com/api/billing/webhook). Events: membership.activated,
 * membership.updated, payment.succeeded, payment.failed, refund.created, refund.updated, dispute.created.
 * Each one re-reads the buyer's memberships from Whop (the source of truth for payment) and updates the account,
 * creating it, by email, when a payment has just made someone a member (lib/billing/access.ts).
 * Verified with the Standard Webhooks signature (the secret: WHOP_WEBHOOK_SECRET, else the one whop:setup stored); each webhook-id is processed once; answers well within 5 seconds. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { applyBillingEvent } from "@/lib/billing/access";
import { verifyWebhook, webhookRef } from "@/lib/billing/whop";
import { whopRuntime } from "@/lib/billing/config";
import { getDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const ok = verifyWebhook(body, { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
    (await whopRuntime()).webhookSecret ?? "", Math.floor(Date.now() / 1000));
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const type = typeof payload === "object" && payload && "type" in payload && typeof payload.type === "string" ? payload.type : "unknown";
  const id = req.headers.get("webhook-id") ?? "";
  const db = getDb();
  const fresh = await db.insert(webhookEvents).values({ id, type }).onConflictDoNothing().returning({ id: webhookEvents.id });
  if (!fresh.length) return NextResponse.json({ ok: true, duplicate: true });
  if (!/^(membership|payment|refund|dispute)\./.test(type)) return NextResponse.json({ ok: true, ignored: true });
  try {
    const r = await applyBillingEvent(db, type, webhookRef(type, payload));
    if (type === "payment.succeeded" && r.userId && r.plan && r.plan !== "free") await recordEvent({ name: "paid", userId: r.userId, props: { plan: r.plan } }).catch(() => undefined);
    return NextResponse.json({ ok: true, user: r.userId, plan: r.plan, created: r.created });
  } catch (e) {
    // Let Whop retry: forget we saw it.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, id)).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
