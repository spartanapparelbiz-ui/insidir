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
  return new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#FFFFFF;color:#0B0B12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;line-height:1.5"><div style="background:#0B0B12;padding:20px 24px"><a href="/"><img src="/brand/insidir-logo-email.png" width="120" height="36" alt="Insidir"></a></div><div style="padding:32px 24px;max-width:560px">` +
    `<p>${ok ? "You're unsubscribed. Insidir won't email you again unless you turn emails back on in Settings." : "That unsubscribe link didn't work. Turn emails off in Settings instead."}</p><p><a style="color:#0B0B12" href="/settings">Settings</a></p></div></body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
