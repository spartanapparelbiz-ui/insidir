/* Delivery: web push (VAPID, free) and email through Resend (free tier to start). Server/worker only.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)   web push
 *   RESEND_API_KEY, EMAIL_FROM ("Insidir <hello@insidir.com>")                  email (log-in codes, alerts)
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

/** Login codes and receipts carry no unsubscribe link: they are the thing the reader asked for. */
export interface Email { to: string; subject: string; text: string; html: string; unsubscribe?: string }
/** Resend's API; overridable only so end-to-end tests can catch the emails (qa/e2e/mock-whop.ts). */
const RESEND_API = (process.env.RESEND_API_ORIGIN || "https://api.resend.com").replace(/\/+$/, "");

/** Sends through Resend's API. Alerts and summaries carry one-click unsubscribe headers (RFC 8058). */
export async function sendEmail(e: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return "failed";
  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [e.to], subject: e.subject, text: e.text, html: e.html,
        ...(e.unsubscribe ? { headers: { "List-Unsubscribe": `<${e.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}) }),
    });
    if (res.status === 422) return "gone"; // invalid recipient
    return res.ok ? "sent" : "failed";
  } catch { return "failed"; }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const EMAIL_FOOTER = "Insidir shows public trading data. It is not financial advice or a recommendation to buy anything. Big traders lose too. Past results don't predict future ones. Insidir is built by Aethric LLC, Pompano Beach, FL. Not affiliated with Polymarket or Kalshi.";

/** The email layout: a thin photo strip on top (public/brand/email-strip.jpg, scripts/og-strips.sh), then a black body:
 *  the logo, the headline in the serif (Rufina where the mail client loads it, Georgia otherwise) in white, light grey
 *  text, a white button. Tables and inline styles so it holds up in every mail client; the strip is decorative (empty
 *  alt) and the logo's alt text says "Insidir", so the email reads the same with images off. */
export function renderEmail(opts: { heading: string; lines: Array<{ text: string; url?: string }>; cta?: { label: string; url: string }; unsubscribe?: string; big?: string }): { text: string; html: string } {
  const text = [opts.heading, "", ...(opts.big ? [opts.big, ""] : []), ...opts.lines.map(l => (l.url ? `${l.text}\n${l.url}` : l.text)), "", ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`, ""] : []),
    EMAIL_FOOTER, ...(opts.unsubscribe ? [`Unsubscribe: ${opts.unsubscribe}`] : [])].join("\n");
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B0B12"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border:1px solid #26262C;border-radius:16px;overflow:hidden;background:#0B0B12">` +
    `<tr><td style="padding:0;line-height:0"><img src="${esc(appUrl())}/brand/email-strip.jpg" width="560" height="120" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>` +
    `<tr><td style="padding:24px 28px 0"><a href="${esc(appUrl())}"><img src="${esc(appUrl())}/brand/insidir-logo-email.png" width="120" height="36" alt="Insidir" style="display:block;border:0;color:#FFFFFF;font:700 20px ${sans}"></a></td></tr>` +
    `<tr><td style="padding:20px 28px 8px;font-family:${sans};font-size:16px;line-height:1.55;color:#E6E6EA">` +
    `<h1 style="margin:0 0 16px;font-family:Rufina,Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;font-weight:700;color:#FFFFFF">${esc(opts.heading)}</h1>` +
    (opts.big ? `<p style="margin:0 0 20px;font-family:${sans};font-size:40px;line-height:1;font-weight:800;letter-spacing:8px;color:#FFFFFF;font-variant-numeric:tabular-nums">${esc(opts.big)}</p>` : "") +
    opts.lines.map(l => `<p style="margin:0 0 12px;font-variant-numeric:tabular-nums">${l.url ? `<a href="${esc(l.url)}" style="color:#FFFFFF;text-decoration:underline">${esc(l.text)}</a>` : esc(l.text)}</p>`).join("") +
    (opts.cta ? `<p style="margin:24px 0 8px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#FFFFFF;color:#0B0B12;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700;font-family:${sans}">${esc(opts.cta.label)}</a></p>` : "") +
    `</td></tr><tr><td style="padding:16px 28px 28px;font-family:${sans};color:#A1A1AA;font-size:12px;line-height:1.5;border-top:1px solid #26262C">${esc(EMAIL_FOOTER)}${opts.unsubscribe ? `<br><a href="${esc(opts.unsubscribe)}" style="color:#A1A1AA">Unsubscribe</a>` : ""}</td></tr>` +
    `</table></td></tr></table>`;
  return { text, html };
}
