/* One-click cancel: cancels the Whop membership at the end of the paid period, then shows the account page. */
import { NextResponse, type NextRequest } from "next/server";
import { refreshPlan, SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { cancelMembership, appUrl } from "@/lib/auth/whop";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.redirect(new URL("/auth/login?next=/settings", appUrl()), 303);
  if (user.membershipId) {
    try { await cancelMembership(user.membershipId); await refreshPlan(user.id); }
    catch { return NextResponse.redirect(new URL("/settings?cancel=failed", appUrl()), 303); }
  }
  return NextResponse.redirect(new URL("/settings?cancel=done", appUrl()), 303);
}
