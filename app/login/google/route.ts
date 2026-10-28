/* "Continue with Google" (on /login and /start): off to Google, back to /login/google/callback (lib/auth/google.ts).
 * ?next= is where they land after signing in. */
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { safeNext } from "@/lib/auth/next";
import { GOOGLE_COOKIE, googleConfigured, startGoogle } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=google_unavailable", appUrl()), 303);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const { url, state, verifier } = startGoogle();
  const res = NextResponse.redirect(url, 303);
  res.cookies.set(GOOGLE_COOKIE, JSON.stringify({ state, verifier, next }), { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/login/google", maxAge: 600 });
  return res;
}
