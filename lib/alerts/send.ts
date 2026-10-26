/* Delivery: web push (VAPID, free) and email through Resend (free tier to start). Server/worker only.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)   web push
 *   RESEND_API_KEY, EMAIL_FROM ("Insidir <hello@aethric.llc>")                 email
 *   EMAIL_UNSUBSCRIBE_SECRET                                                     signs one-click unsubscribe links
 *
 * iOS only delivers web push to apps added to the Home Screen; the site is an installable PWA (manifest + public/sw.js). */
import { createHmac, timingSafeEqual } from "node:crypto";
import webpush from "web-push";

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

export interface Email { to: string; subject: string; text: string; html: string; unsubscribe: string }

/** Sends through Resend's API. Every message carries one-click unsubscribe headers (RFC 8058). */
export async function sendEmail(e: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return "failed";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [e.to], subject: e.subject, text: e.text, html: e.html,
        headers: { "List-Unsubscribe": `<${e.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
    });
    if (res.status === 422) return "gone"; // invalid recipient
    return res.ok ? "sent" : "failed";
  } catch { return "failed"; }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const EMAIL_FOOTER = "Information only, not financial advice. Not affiliated with Polymarket or Kalshi. Prices move and fills aren't guaranteed. Check that prediction markets are available where you live.";

/** A plain, fast email: black on white for every mail client, monospace, no images. */
export function renderEmail(opts: { heading: string; lines: Array<{ text: string; url?: string }>; cta?: { label: string; url: string }; unsubscribe: string }): { text: string; html: string } {
  const text = [opts.heading, "", ...opts.lines.map(l => (l.url ? `${l.text}\n${l.url}` : l.text)), "", ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`, ""] : []),
    EMAIL_FOOTER, `Unsubscribe: ${opts.unsubscribe}`].join("\n");
  const html = `<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.5;color:#111;max-width:560px">` +
    `<p style="font-size:18px;font-weight:700;margin:0 0 16px">${esc(opts.heading)}</p>` +
    opts.lines.map(l => `<p style="margin:0 0 12px">${l.url ? `<a href="${esc(l.url)}" style="color:#111">${esc(l.text)}</a>` : esc(l.text)}</p>`).join("") +
    (opts.cta ? `<p style="margin:20px 0"><a href="${esc(opts.cta.url)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">${esc(opts.cta.label)}</a></p>` : "") +
    `<p style="color:#666;font-size:12px;margin-top:24px">${esc(EMAIL_FOOTER)}<br><a href="${esc(opts.unsubscribe)}" style="color:#666">Unsubscribe</a></p></div>`;
  return { text, html };
}
