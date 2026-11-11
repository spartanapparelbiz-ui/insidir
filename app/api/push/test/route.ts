/* POST /api/push/test: sends one test ping to every device the signed-in member turned pings on for, so they can see
 * what a ping looks like before a real one arrives. At most one every 20 seconds per account. { sent: n } (devices
 * reached); browsers that dropped their subscription are removed. */
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { sendPush } from "@/lib/alerts/send";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { entitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

const GAP_MS = 20_000;
const last = new Map<string, number>();

const TEST_PING = {
  title: "Signals are on",
  body: "This is a test. When a millionaire opens a large position in your categories, it shows up here within a minute.",
  url: "/",
} as const;

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (entitlements(user.plan).alertDelaySeconds === null) return NextResponse.json({ error: "Signals come with Insidir." }, { status: 403 });
  const now = Date.now();
  if (now - (last.get(user.id) ?? 0) < GAP_MS) return NextResponse.json({ error: "One test at a time. Try again in a few seconds." }, { status: 429 });
  last.set(user.id, now);
  if (last.size > 5000) for (const [k, t] of last) if (now - t > GAP_MS) last.delete(k);

  const db = getDb();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  let sent = 0;
  for (const s of subs) {
    const r = await sendPush(s, { ...TEST_PING });
    if (r === "sent") sent++;
    else if (r === "gone") await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, s.endpoint), eq(pushSubscriptions.userId, user.id)));
  }
  return NextResponse.json({ sent, devices: subs.length });
}
