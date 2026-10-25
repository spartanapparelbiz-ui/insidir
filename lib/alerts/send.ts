/* Delivery: web push (VAPID) and Telegram. Both free. Server/worker only.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)   web push
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET          Telegram bot */
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

const tg = (method: string): string => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ""}/${method}`;

export async function sendTelegram(chatId: string, text: string, url?: string): Promise<SendResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return "failed";
  try {
    const res = await fetch(tg("sendMessage"), {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...(url ? { reply_markup: { inline_keyboard: [[{ text: "Open the deal", url }]] } } : {}) }),
    });
    if (res.status === 403) return "gone"; // the user blocked the bot
    return res.ok ? "sent" : "failed";
  } catch { return "failed"; }
}

/** "/start <code>" from the bot's deep link → the link code. */
export function startCode(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = /^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(text.trim());
  return m?.[1] ?? null;
}
