/* "Continue" on /login and /start: off to Whop's sign-in (Google, Apple or email), back to /reset/callback
 * (lib/auth/whop-login.ts). ?next= is where they land after; ?fresh=1 ("Use a different account") asks Whop to sign in
 * again. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { safeNext } from "@/lib/auth/next";
import { LOGIN_COOKIE, loginConfigured, startLogin } from "@/lib/auth/whop-login";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await loginConfigured())) return NextResponse.redirect(new URL("/login?error=unavailable", appUrl()), 303);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const { url, state, verifier } = await startLogin(req.nextUrl.searchParams.get("fresh") === "1");
  const res = NextResponse.redirect(url, 303);
  res.cookies.set(LOGIN_COOKIE, JSON.stringify({ state, verifier, next }), { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
