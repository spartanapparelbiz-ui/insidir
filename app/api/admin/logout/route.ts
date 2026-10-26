import { appUrl } from "@/lib/whop/config";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin";

export function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", appUrl()), 303);
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
