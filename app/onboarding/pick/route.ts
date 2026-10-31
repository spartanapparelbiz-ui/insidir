/* POST /onboarding/pick (the form on /onboarding): follows the trackers ticked (t=<slug>, up to 10, known slugs only),
 * marks the member onboarded, records onboarding_done or onboarding_skip, and lands on Following. Skip follows none. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { appUrl } from "@/lib/app-url";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { follow } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import { TRACKERS } from "@/lib/trackers";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login?next=/onboarding", appUrl()), 303);
  const form = await req.formData().catch(() => null);
  const skipped = form?.get("skip") === "1";
  const known = new Set<string>(TRACKERS.map(t => t.slug));
  const picks = skipped || !isPaid(user.plan) ? [] : [...new Set(form?.getAll("t").map(String) ?? [])].filter(s => known.has(s)).slice(0, 10);
  const db = getDb();
  for (const slug of picks) await follow(db, user.id, "tracker", slug);
  await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, user.id));
  await recordEvent({ name: skipped ? "onboarding_skip" : "onboarding_done", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: user.id, props: { trackers: picks.length } })
    .catch(() => undefined);
  return NextResponse.redirect(new URL("/following", appUrl()), 303);
}
