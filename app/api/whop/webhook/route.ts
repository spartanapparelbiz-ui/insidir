/* Whop webhooks: membership and payment events re-read the user's plan from Whop (the source of truth).
 * Verified with the Standard Webhooks signature; each webhook-id is processed once. Answers within 5 seconds. */
import { NextResponse, type NextRequest } from "next/server";
import { refreshPlan } from "@/lib/auth/session";
import { verifyWebhook, webhookUserId } from "@/lib/auth/whop";
import { recordEvent } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const ok = verifyWebhook(body, { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
    process.env.WHOP_WEBHOOK_SECRET ?? "", Math.floor(Date.now() / 1000));
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const type = typeof payload === "object" && payload && "type" in payload && typeof payload.type === "string" ? payload.type : "unknown";
  const id = req.headers.get("webhook-id") ?? "";
  const fresh = await getDb().insert(webhookEvents).values({ id, type }).onConflictDoNothing().returning({ id: webhookEvents.id });
  if (!fresh.length) return NextResponse.json({ ok: true, duplicate: true });
  const userId = webhookUserId(payload);
  if (userId && /^(membership|payment)\./.test(type)) {
    const plan = await refreshPlan(userId);
    if (type === "payment.succeeded" && plan && plan !== "free") await recordEvent({ name: "paid", userId, props: { plan } }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
