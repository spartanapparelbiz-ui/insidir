/* Opens the checkout on /start. Someone new sends their email: it's kept with a claim token until the payment lands
 * and the billing webhook makes the account (linked to the Whop account they pay with, which is how they log in
 * after). A logged-in member whose plan ended just needs the token. The token goes into an httpOnly cookie and back
 * to the page, which hands it to the checkout as metadata; /welcome trades it for a session. No passwords. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { CLAIM_COOKIE, CLAIM_MAX_AGE_S, newClaim } from "@/lib/billing/claims";
import { checkoutPlanId } from "@/lib/billing/whop";
import { normEmail } from "@/lib/billing/access";
import { appUrl } from "@/lib/app-url";
import { validEmail } from "@/lib/auth/next";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb, hasDatabase } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { readBody } from "@/lib/http";
import { recordEvent } from "@/lib/analytics";
import { PENDING_COOKIE, PENDING_MAX_AGE_S } from "@/lib/billing/pending";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const planId = await checkoutPlanId();
  if (!planId || !hasDatabase()) return NextResponse.json({ error: "not_configured", message: "Checkout isn't open yet. Check back soon." }, { status: 503 });
  const db = getDb();
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  let claim: string, email: string;
  if (user?.email) {
    email = user.email;
    claim = await newClaim(db, { email });
  } else {
    const b = await readBody(req);
    email = normEmail(b.email ?? "");
    if (!validEmail(email)) return NextResponse.json({ error: "email", message: "That doesn't look like an email address." }, { status: 400 });
    const existing = (await db.select({ plan: users.plan }).from(users).where(eq(users.email, email)).limit(1))[0];
    if (existing && existing.plan !== "free") return NextResponse.json({ error: "exists", message: "You already have Insidir. Log in with the account you paid with." }, { status: 409 });
    claim = await newClaim(db, { email });
  }
  const metadata: Record<string, string> = { insidir_claim: claim, ...(user ? { insidir_user_id: user.id } : {}) };
  const res = NextResponse.json({ planId, metadata, email, returnUrl: `${appUrl()}/welcome` });
  if (!user) {
    // The account step is done (it's made for real once they pay): remembered so /start and /login can finish it.
    res.cookies.set(PENDING_COOKIE, email, { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/", maxAge: PENDING_MAX_AGE_S });
    await recordEvent({ name: "account_created", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null }).catch(() => undefined);
  }
  res.cookies.set(CLAIM_COOKIE, claim, { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/", maxAge: CLAIM_MAX_AGE_S });
  return res;
}
