/* The first-session overlay's answers (the categories picked). Marks the user onboarded (also
 * when they skip) and records onboarding_done / onboarding_skip. No bankroll. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isPaid } from "@/lib/plans";
import { parseSettings, type SettingsInput } from "../settings/validate";
import { parsePicks } from "@/lib/picks";

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
  // A skip still keeps what was picked before it (only the categories; nothing else is asked).
  // What they want to follow (onboarding's first screen): kept as their picks, the feed opens filtered to it.
  const picks = parsePicks((body as Record<string, unknown>).picks);
  const { picks: _p, ...rest } = body as Record<string, unknown>;
  void _p;
  const r = parseSettings(skipped ? (rest.categories !== undefined ? { categories: rest.categories as string[] } : {}) : rest as SettingsInput, user.settings, user.region);
  if (r.errors.length) return NextResponse.json({ errors: r.errors }, { status: 400 });
  // Push and email alerts are paid features; the daily summary is open to everyone.
  if (!isPaid(user.plan)) { r.settings.alertPush = false; r.settings.alertEmail = false; }
  if (picks) r.settings.picks = picks;
  await getDb().update(users).set({ onboardedAt: new Date(), settings: r.settings }).where(eq(users.id, user.id));
  await recordEvent({ name: skipped ? "onboarding_skip" : "onboarding_done", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: user.id })
    .catch(() => undefined);
  return NextResponse.json({ ok: true });
}
