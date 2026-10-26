/* The first-session overlay's answers: categories, size filters, alert choices. Marks the user onboarded (also
 * when they skip) and records onboarding_done / onboarding_skip. No bankroll. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isPaid } from "@/lib/plans";
import { parseSettings, type SettingsInput } from "../settings/validate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: SettingsInput = {};
  try {
    const raw: unknown = await req.json();
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) body = raw as SettingsInput;
  } catch { body = {}; }
  const skipped = body.skipped === true;
  const r = skipped ? null : parseSettings(body, user.settings, user.region);
  if (r?.errors.length) return NextResponse.json({ errors: r.errors }, { status: 400 });
  // Push and email alerts are paid features; the daily summary is open to everyone.
  if (r && !isPaid(user.plan)) { r.settings.alertPush = false; r.settings.alertEmail = false; }
  await getDb().update(users).set({ onboardedAt: new Date(), ...(r ? { settings: r.settings } : {}) }).where(eq(users.id, user.id));
  await recordEvent({ name: skipped ? "onboarding_skip" : "onboarding_done", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: user.id })
    .catch(() => undefined);
  return NextResponse.json({ ok: true });
}
