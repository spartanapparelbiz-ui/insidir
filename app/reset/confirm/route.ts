/* "Confirm it's you" (from /reset): off to the payment account that holds the membership, and back to
 * /reset/callback (lib/auth/reset.ts). */
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { CONFIRM_COOKIE, resetConfigured, startConfirm } from "@/lib/auth/reset";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await resetConfigured())) return NextResponse.redirect(new URL("/reset?error=unavailable", appUrl()), 303);
  const { url, state, verifier } = await startConfirm();
  const res = NextResponse.redirect(url, 303);
  res.cookies.set(CONFIRM_COOKIE, JSON.stringify({ state, verifier }), { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/reset", maxAge: 600 });
  return res;
}
