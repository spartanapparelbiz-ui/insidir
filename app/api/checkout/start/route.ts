/* Opens the checkout on /start. Pay first: no sign-in needed. Signed in, the plan carries our account id as metadata
 * (Whop copies it onto the membership and payment, so the billing webhook links them to this account) and their email;
 * signed out, it carries the visitor id instead (the webhook makes the account for their Whop user and keeps it, for
 * the admin's time-to-paid), and they sign in with Whop right after paying. */
import { NextResponse, type NextRequest } from "next/server";
import { checkoutPlanId } from "@/lib/billing/whop";
import { appUrl } from "@/lib/app-url";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const planId = await checkoutPlanId();
  if (!planId || !hasDatabase()) return NextResponse.json({ error: "not_configured", message: "Checkout isn't open yet. Check back soon." }, { status: 503 });
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) {
    const visitor = req.cookies.get(VISITOR_COOKIE)?.value;
    return NextResponse.json({ planId, metadata: visitor && /^[A-Za-z0-9_-]{6,64}$/.test(visitor) ? { insidir_visitor_id: visitor } : {}, email: null, returnUrl: `${appUrl()}/welcome` });
  }
  return NextResponse.json({ planId, metadata: { insidir_user_id: user.id }, email: user.email, returnUrl: `${appUrl()}/welcome` });
}
