/* Opens the checkout on /start for the signed-in account (sign-in comes first, with Whop): the plan, our account id as
 * metadata (Whop copies it onto the membership and payment, so the billing webhook links them to this account), their
 * email when we have it, and where to come back. */
import { NextResponse, type NextRequest } from "next/server";
import { checkoutPlanId } from "@/lib/billing/whop";
import { appUrl } from "@/lib/app-url";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const planId = await checkoutPlanId();
  if (!planId || !hasDatabase()) return NextResponse.json({ error: "not_configured", message: "Checkout isn't open yet. Check back soon." }, { status: 503 });
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.json({ error: "signed_out", message: "Sign in first: tap Continue." }, { status: 401 });
  return NextResponse.json({ planId, metadata: { insidir_user_id: user.id }, email: user.email, returnUrl: `${appUrl()}/welcome` });
}
