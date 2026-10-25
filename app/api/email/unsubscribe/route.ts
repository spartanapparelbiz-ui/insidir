/* One-click unsubscribe from every Insidir email (GET from the link, POST from mail clients per RFC 8058). */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { verifyUnsubscribe } from "@/lib/alerts/send";
import { getDb } from "@/lib/db";
import { DEFAULT_SETTINGS, users } from "@/lib/db/schema";

async function unsubscribe(req: NextRequest): Promise<boolean> {
  const u = req.nextUrl.searchParams.get("u") ?? "", s = req.nextUrl.searchParams.get("s") ?? "";
  if (!verifyUnsubscribe(u, s)) return false;
  const db = getDb();
  const row = (await db.select({ settings: users.settings }).from(users).where(eq(users.id, u)).limit(1))[0];
  if (!row) return false;
  await db.update(users).set({ settings: { ...DEFAULT_SETTINGS, ...row.settings, alertEmail: false, emailDigest: false } }).where(eq(users.id, u));
  return true;
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: await unsubscribe(req) });
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req).catch(() => false);
  return new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#000;color:#f2f0ea;font-family:ui-monospace,Menlo,monospace;padding:32px">` +
    `<p>${ok ? "You're unsubscribed. Insidir won't email you again unless you turn emails back on in Settings." : "That unsubscribe link didn't work. Turn emails off in Settings instead."}</p><p><a style="color:#f2f0ea" href="/settings">Settings</a></p></body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
