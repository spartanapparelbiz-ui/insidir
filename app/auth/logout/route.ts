import { appUrl } from "@/lib/auth/whop";
import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token).catch(() => undefined);
  const res = NextResponse.redirect(new URL("/", appUrl()), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
