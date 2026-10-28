/* Delivery: web push (VAPID, free). Insidir sends no email. Server/worker only.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)   web push
 *   EMAIL_UNSUBSCRIBE_SECRET                                                     signs one-click unsubscribe links
 *
 * iOS only delivers web push to apps added to the Home Screen; the site is an installable PWA (manifest + public/sw.js). */
import { createHmac, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { appUrl } from "@/lib/app-url";

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export type SendResult = "sent" | "gone" | "failed";

let vapidReady = false;
function vapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@aethric.llc", pub, priv);
  vapidReady = true;
  return true;
}

/** "gone" means the browser dropped the subscription: delete it. */
export async function sendPush(t: PushTarget, payload: { title: string; body: string; url: string }): Promise<SendResult> {
  if (!vapid()) return "failed";
  try {
    await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(payload), { TTL: 600, urgency: "high" });
    return "sent";
  } catch (e) {
    const status = typeof e === "object" && e && "statusCode" in e ? Number(e.statusCode) : 0;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}

/* ---------- email ---------- */

const unsubSecret = (): string => process.env.EMAIL_UNSUBSCRIBE_SECRET || "";

/** A signature for one user's unsubscribe link. Stateless: no token table. */
export function unsubscribeSig(userId: string, secret = unsubSecret()): string {
  return createHmac("sha256", secret).update("unsubscribe:" + userId).digest("base64url");
}
export function verifyUnsubscribe(userId: string, sig: string, secret = unsubSecret()): boolean {
  if (!secret || !userId || !sig) return false;
  const a = Buffer.from(unsubscribeSig(userId, secret)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const unsubscribeUrl = (appUrl: string, userId: string): string =>
  `${appUrl}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&s=${unsubscribeSig(userId)}`;
