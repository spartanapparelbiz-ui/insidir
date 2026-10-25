/* Web push subscriptions for signed-in members on a plan with alerts. POST {endpoint, keys:{p256dh, auth}} stores
 * (or moves) the browser's subscription; DELETE {endpoint} removes it. Turning push on here also sets alertPush. */
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { entitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** Longest endpoint URL / key accepted. */
const MAX_FIELD = 2048;

const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD ? v : null);

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b: unknown = await req.json();
    return typeof b === "object" && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch { return {}; }
}

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (entitlements(user.plan).alertDelaySeconds === null) return NextResponse.json({ error: "Push alerts come with Insidir and Insidir Pro." }, { status: 403 });
  const body = await readBody(req);
  const endpoint = s(body.endpoint);
  const keys = typeof body.keys === "object" && body.keys !== null ? (body.keys as Record<string, unknown>) : {};
  const p256dh = s(keys.p256dh);
  const auth = s(keys.auth);
  if (!endpoint || !/^https:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ error: "Not a push subscription." }, { status: 400 });
  const db = getDb();
  await db.insert(pushSubscriptions).values({ endpoint, userId: user.id, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh, auth } });
  if (!user.settings.alertPush) await db.update(users).set({ settings: { ...user.settings, alertPush: true } }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const endpoint = s((await readBody(req)).endpoint);
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
  await getDb().delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  return NextResponse.json({ ok: true });
}
