/* One-click cancel: every live Insidir / Pro membership stops renewing (memberships.cancel with
 * cancel_at_period_end). Access continues until the period end Whop reports, then users.checkAccess says no. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { forgetAccess } from "@/lib/whop/access";
import { cancelAtPeriodEnd } from "@/lib/whop/billing";
import { appUrl } from "@/lib/whop/config";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.redirect(new URL("/auth/login?next=/settings", appUrl()), 303);
  try {
    await cancelAtPeriodEnd(user.whopUserId);
    forgetAccess(user.whopUserId);
  } catch (e) {
    console.error("cancel failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL("/settings?cancel=failed", appUrl()), 303);
  }
  return NextResponse.redirect(new URL("/settings?cancel=done", appUrl()), 303);
}
