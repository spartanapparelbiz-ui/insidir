/* The browser that just paid asks here (from /welcome) whether its payment has landed. Once the billing webhook has
 * marked its checkout claim (lib/billing/claims.ts), this trades the claim cookie for a 30-day session, once. */
import { NextResponse, type NextRequest } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { CLAIM_COOKIE, redeemClaim } from "@/lib/billing/claims";
import { getDb, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ready: false }, { status: 503 });
  const userId = await redeemClaim(getDb(), req.cookies.get(CLAIM_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ready: false });
  const { token, expires } = await createSession(userId);
  const res = NextResponse.json({ ready: true, next: "/feed?welcome=1" });
  setSessionCookie(res, token, expires);
  res.cookies.delete(CLAIM_COOKIE);
  return res;
}
