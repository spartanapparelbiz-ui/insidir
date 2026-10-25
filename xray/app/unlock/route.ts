/* /unlock?token=…&next=/event/… sets the member cookie.
 * PLACEHOLDER: replace with real Whop membership verification (see lib/access.ts, isMember()). */
import { NextResponse, type NextRequest } from "next/server";
import { isMember, MEMBER_COOKIE } from "@/lib/access";

export function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!isMember(token)) return NextResponse.redirect(new URL("/?unlock=failed", req.nextUrl.origin), 303);
  const res = NextResponse.redirect(new URL(safeNext, req.nextUrl.origin), 303);
  res.cookies.set(MEMBER_COOKIE, token, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
