/* POST /onboarding/pick (the one question on /onboarding): keeps what they bet on (settings.betOn, known answers only),
 * marks onboarding done, records onboarding_done or onboarding_skip, and goes on to ?next. Skip keeps nothing. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { appUrl } from "@/lib/app-url";
import { safeNext } from "@/lib/auth/next";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isBetOn } from "@/lib/read/member";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login?next=/onboarding", appUrl()), 303);
  const form = await req.formData().catch(() => null);
  const skipped = form?.get("skip") === "1";
  const betOn = skipped ? [] : [...new Set((form?.getAll("bet") ?? []).map(String))].filter(isBetOn);
  await getDb().update(users).set({ onboardedAt: new Date(), settings: { ...user.settings, betOn } }).where(eq(users.id, user.id));
  await recordEvent({ name: skipped ? "onboarding_skip" : "onboarding_done", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: user.id, props: { betOn: betOn.join(",") } })
    .catch(() => undefined);
  return NextResponse.redirect(new URL(safeNext(String(form?.get("next") ?? "/")), appUrl()), 303);
}
