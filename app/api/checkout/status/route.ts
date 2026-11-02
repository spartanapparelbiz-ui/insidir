/* Asked every few seconds by /welcome right after paying: does Whop say this account has Insidir yet? It asks Whop now
 * (the billing webhook may not have arrived), so the buyer is in the moment Whop knows. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { refreshPlan } from "@/lib/billing/access";
import { isFreeAccess } from "@/lib/billing/free";
import { getDb, hasDatabase } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { betOnFromTopics, GO_COOKIE, readAnswers, usFromVenue } from "@/lib/go/answers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ member: false }, { status: 503 });
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ member: false, signedIn: false }, { status: 401 });
  // From the /go quiz: its answers are their categories (no second onboarding), and they land back on their cards.
  const go = readAnswers(req.cookies.get(GO_COOKIE)?.value, Date.now());
  const after = go ? "/go?unlocked=1" : user.onboarded ? "/" : "/onboarding";
  const member = isFreeAccess(user.email) || user.plan !== "free" || ((await refreshPlan(getDb(), user.id).catch(() => null)) ?? "free") !== "free";
  if (member && go && !user.onboarded) {
    const us = usFromVenue(go.venue);
    await getDb().update(users).set({ onboardedAt: new Date(), settings: { ...user.settings, betOn: betOnFromTopics(go.topics), ...(go.remind === false ? { remindBeforeCharge: false } : { remindBeforeCharge: true }) },
      ...(us === null ? {} : { region: us ? "us" : "non_us" }) }).where(eq(users.id, user.id)).catch(() => undefined);
  }
  return NextResponse.json(member ? { member: true, next: after } : { member: false });
}
