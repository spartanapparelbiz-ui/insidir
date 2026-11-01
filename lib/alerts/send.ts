/* Delivery: web push (VAPID, free). Insidir sends no email. Server/worker only.
 *
 *   INSIDIR_VAPID_PUBLIC_KEY, INSIDIR_VAPID_PRIVATE_KEY (else the older names), VAPID_SUBJECT   web push (lib/alerts/vapid.ts)
 *   EMAIL_UNSUBSCRIBE_SECRET                                                     signs one-click unsubscribe links
 *
 * iOS only delivers web push to apps added to the Home Screen; the site is an installable PWA (manifest + public/sw.js). */
import { createHmac, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { appUrl } from "@/lib/app-url";
import { vapidKeys } from "./vapid";

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export type SendResult = "sent" | "gone" | "failed";

let vapidReady = false;
/** Sets web-push up with the VAPID keys (lib/alerts/vapid.ts); false when they aren't set. */
export function configurePush(env: Record<string, string | undefined> = process.env): boolean {
  if (vapidReady && env === process.env) return true;
  const k = vapidKeys(env);
  if (!k.publicKey || !k.privateKey) return false;
  webpush.setVapidDetails(k.subject, k.publicKey, k.privateKey);
  if (env === process.env) vapidReady = true;
  return true;
}
const vapid = (): boolean => configurePush();

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
