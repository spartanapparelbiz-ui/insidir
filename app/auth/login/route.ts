/* Starts "Sign in with Whop". `next` is where to land afterwards (same-site paths only). */
import { NextResponse, type NextRequest } from "next/server";
import { startAuthorize } from "@/lib/whop/oauth";

export function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/terminal";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/terminal";
  const { url, state, verifier } = startAuthorize();
  const res = NextResponse.redirect(url, 303);
  const secure = req.nextUrl.protocol === "https:";
  res.cookies.set("insidir_oauth", JSON.stringify({ state, verifier, next: safeNext }), { httpOnly: true, secure, sameSite: "lax", path: "/auth", maxAge: 600 });
  return res;
}
