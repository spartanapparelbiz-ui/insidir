/* Whop webhooks. The signature is verified with the SDK's unwrapWebhook on the RAW body (parsing first changes the
 * bytes), with the secret of the environment WHOP_ENV picks. Every verified event is logged in terminal.webhook_events
 * by its webhook-id, and a repeated id is answered 200 without doing anything twice. What each event does:
 * lib/whop/webhooks.ts. Whop wants a 2xx within 5 seconds; a 500 makes it retry. */
import { unwrapWebhook } from "@whop/sdk/helpers";
import { NextResponse, type NextRequest } from "next/server";
import { whopConfig } from "@/lib/whop/config";
import { claimWebhook, failWebhook, finishWebhook, webhookDeps } from "@/lib/whop/webhook-store";
import { eventRef, handleWhopEvent, type WebhookEvent } from "@/lib/whop/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const key = whopConfig().webhookSecret;
  if (!key) {
    console.error("whop webhook: no webhook secret for this WHOP_ENV; answering 500 so Whop retries once it is set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  let event: WebhookEvent;
  try {
    event = unwrapWebhook<WebhookEvent>(raw, { headers: Object.fromEntries(req.headers), key });
  } catch (e) {
    console.warn("whop webhook rejected:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  if (typeof event?.type !== "string") return NextResponse.json({ error: "bad event" }, { status: 400 });
  const id = req.headers.get("webhook-id")!;
  const ref = eventRef(event);
  const claim = await claimWebhook(id, event, ref);
  if (claim === "duplicate") {
    console.log(`whop webhook ${id} ${event.type} ${ref ?? ""}: duplicate, ignored`);
    return NextResponse.json({ ok: true, duplicate: true });
  }
  try {
    const out = await handleWhopEvent(event, webhookDeps());
    await finishWebhook(id, out);
    console.log(`whop webhook ${id} ${event.type} ${ref ?? ""}: ${out.status}, ${out.note}`);
    return NextResponse.json({ ok: true, status: out.status });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    await failWebhook(id, why).catch(() => undefined);
    console.error(`whop webhook ${id} ${event.type} ${ref ?? ""}: failed, ${why}`);
    return NextResponse.json({ error: "failed, retry" }, { status: 500 });
  }
}
