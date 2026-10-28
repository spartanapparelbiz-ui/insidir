/* One-click cancel: cancels the Whop membership at the end of the paid period (access continues until then).
 * A form post (no JS) comes back to the account page; a JSON request (the Cancel button) gets a plain answer. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { refreshPlan } from "@/lib/billing/access";
import { getDb } from "@/lib/db";
import { recordEvent } from "@/lib/analytics";
import { cancelMembership } from "@/lib/billing/whop";
import { appUrl } from "@/lib/app-url";

export async function POST(req: NextRequest) {
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return json ? NextResponse.json({ error: "Sign in first, then try again." }, { status: 401 }) : NextResponse.redirect(new URL("/login?next=/settings", appUrl()), 303);
  if (user.membershipId) {
    try {
      await cancelMembership(user.membershipId); await refreshPlan(getDb(), user.id);
      await recordEvent({ name: "cancel", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: user.id, props: { plan: user.plan } }).catch(() => undefined);
    }
    catch {
      return json ? NextResponse.json({ error: "Couldn't reach our payment provider to cancel. Try again in a minute, or use Manage billing." }, { status: 502 })
        : NextResponse.redirect(new URL("/settings?cancel=failed", appUrl()), 303);
    }
  }
  return json ? NextResponse.json({ ok: true, message: "Subscription cancelled. You keep access until the end of this billing period." })
    : NextResponse.redirect(new URL("/settings?cancel=done", appUrl()), 303);
}
