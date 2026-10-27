/* Opens a checkout on /start: a claim token in an httpOnly cookie (and back to the page, which hands it to Whop as
 * metadata) so the buyer is logged in the moment the payment lands, plus our account id when they're logged in. */
import { NextResponse, type NextRequest } from "next/server";
import { CLAIM_COOKIE, CLAIM_MAX_AGE_S, newClaim } from "@/lib/billing/claims";
import { checkoutPlanId } from "@/lib/billing/whop";
import { appUrl } from "@/lib/app-url";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const planId = checkoutPlanId();
  if (!planId || !hasDatabase()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const db = getDb();
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  const claim = await newClaim(db);
  const metadata: Record<string, string> = { insidir_claim: claim, ...(user ? { insidir_user_id: user.id } : {}) };
  const res = NextResponse.json({ planId, metadata, email: user?.email ?? "", returnUrl: `${appUrl()}/welcome` });
  res.cookies.set(CLAIM_COOKIE, claim, { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/", maxAge: CLAIM_MAX_AGE_S });
  return res;
}
