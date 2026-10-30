/* Asked every few seconds by /welcome right after paying: does Whop say this account has Insidir yet? It asks Whop now
 * (the billing webhook may not have arrived), so the buyer is in the moment Whop knows. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { refreshPlan } from "@/lib/billing/access";
import { isFreeAccess } from "@/lib/billing/free";
import { getDb, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ member: false }, { status: 503 });
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ member: false, signedIn: false }, { status: 401 });
  if (isFreeAccess(user.email) || user.plan !== "free") return NextResponse.json({ member: true, next: "/onboarding" });
  const plan = await refreshPlan(getDb(), user.id).catch(() => null);
  return NextResponse.json(plan && plan !== "free" ? { member: true, next: "/onboarding" } : { member: false });
}
