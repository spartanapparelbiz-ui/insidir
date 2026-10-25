/* Telegram bot webhook. The only command: "/start <code>" from the Settings deep link, which links this chat to the
 * member. Telegram sends X-Telegram-Bot-Api-Secret-Token (set with setWebhook's secret_token). */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { sendTelegram, startCode } from "@/lib/alerts/send";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  let update: unknown = null;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const msg = typeof update === "object" && update && "message" in update ? (update as { message?: { text?: unknown; chat?: { id?: unknown } } }).message : undefined;
  const code = startCode(msg?.text);
  const chatId = msg?.chat?.id;
  if (code && (typeof chatId === "number" || typeof chatId === "string")) {
    const linked = await getDb().update(users).set({ telegramChatId: String(chatId), telegramLinkCode: null })
      .where(eq(users.telegramLinkCode, code)).returning({ id: users.id });
    await sendTelegram(String(chatId), linked.length
      ? "Connected. Insidir will message you here when a deal matches your alert settings. Turn this off any time in Settings."
      : "That link has expired. Open Settings on insidir.com and tap Connect Telegram again.");
  }
  return NextResponse.json({ ok: true });
}
